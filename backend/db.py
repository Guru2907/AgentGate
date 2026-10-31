"""SQLite storage: hash-chained audit log, exact-call review queue, and sandbox outbox.

audit_log is append-only: rows are never updated or deleted. Each row stores
hash = sha256(prev_hash + canonical row), so editing any past row breaks the chain (verify_chain).
DB file comes from DB_PATH in .env (default agentgate.db in the repo root).
"""

import hashlib
import json
import os
import sqlite3
import time
from collections.abc import Iterator
from contextlib import closing, contextmanager
from contextvars import ContextVar
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from backend.schemas import Decision, LogEntry, ToolCall

ROOT = Path(__file__).resolve().parents[1]
GENESIS = "GENESIS"

_SCHEMA = """
CREATE TABLE IF NOT EXISTS workspaces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id INTEGER NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_sessions (
    token_hash TEXT PRIMARY KEY,
    csrf_token TEXT NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at REAL NOT NULL,
    expires_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions(user_id);
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at REAL NOT NULL,
    expires_at REAL NOT NULL,
    used_at REAL
);
CREATE INDEX IF NOT EXISTS password_reset_user_idx ON password_reset_tokens(user_id);
CREATE TABLE IF NOT EXISTS auth_rate_limits (
    bucket TEXT PRIMARY KEY,
    count INTEGER NOT NULL,
    reset_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id INTEGER NOT NULL DEFAULT 1 REFERENCES workspaces(id) ON DELETE CASCADE,
    ts TEXT NOT NULL,
    task TEXT NOT NULL,
    doc TEXT NOT NULL,
    tool TEXT NOT NULL,
    args_json TEXT NOT NULL,
    verdict TEXT NOT NULL,
    rules_json TEXT NOT NULL,
    reasons_json TEXT NOT NULL,
    executed INTEGER NOT NULL,
    source TEXT NOT NULL DEFAULT 'run',
    prev_hash TEXT NOT NULL,
    hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS review_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id INTEGER NOT NULL DEFAULT 1 REFERENCES workspaces(id) ON DELETE CASCADE,
    audit_id INTEGER NOT NULL,
    task TEXT NOT NULL,
    doc TEXT NOT NULL,
    call_json TEXT NOT NULL,
    call_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at REAL NOT NULL,
    expires_at REAL NOT NULL,
    decided_at REAL
);
CREATE TABLE IF NOT EXISTS outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id INTEGER NOT NULL DEFAULT 1 REFERENCES workspaces(id) ON DELETE CASCADE,
    ts TEXT NOT NULL,
    to_addr TEXT NOT NULL,
    subject TEXT NOT NULL,
    attachment TEXT,
    audit_id INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    stored_path TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    created_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS documents_workspace_idx ON documents(workspace_id, created_at);
"""


# Per-request DB override (the bench scores on a scratch DB). A ContextVar, not os.environ, so other
# requests running at the same time keep using the real DB — and keep their sessions.
_DB_OVERRIDE: ContextVar[Path | None] = ContextVar("agentgate_db_override", default=None)


def _db_path() -> Path:
    return _DB_OVERRIDE.get() or ROOT / os.getenv("DB_PATH", "agentgate.db")


@contextmanager
def using_db(path: Path) -> Iterator[None]:
    """Point this request's DB calls at `path` (created if needed); the rest of the app is unaffected."""
    token = _DB_OVERRIDE.set(path)
    try:
        init_db()
        yield
    finally:
        _DB_OVERRIDE.reset(token)


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(_db_path())
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 5000")
    return conn


def _canonical(obj) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), default=str)


def call_hash(task: str, call: ToolCall | dict) -> str:
    """Fingerprint of exactly what a human is asked to approve: task + tool + every argument."""
    tool, args = _tool_args(call)
    return hashlib.sha256(_canonical({"task": task, "tool": tool, "args": args}).encode()).hexdigest()


def _tool_args(call: ToolCall | dict) -> tuple[str, dict]:
    if isinstance(call, ToolCall):
        return call.tool, call.args
    if isinstance(call, dict):
        args = call.get("args", {})
        return str(call.get("tool", "?")), args if isinstance(args, dict) else {"_raw": args}
    return "?", {"_raw": str(call)}


def _row_hash(prev_hash: str, row: dict) -> str:
    return hashlib.sha256((prev_hash + _canonical(row)).encode()).hexdigest()


def init_db() -> None:
    with closing(_connect()) as conn, conn:
        cols = {r["name"] for r in conn.execute("PRAGMA table_info(audit_log)")}
        if cols and "hash" not in cols:  # pre-chain log from an older build: keep it aside, start a chained one
            conn.execute(f"ALTER TABLE audit_log RENAME TO audit_log_unchained_{int(time.time())}")
        conn.executescript(_SCHEMA)
        conn.execute(
            "INSERT OR IGNORE INTO workspaces (id, name, created_at) VALUES (1, ?, ?)",
            ("Legacy records (unclaimed)", datetime.now(timezone.utc).isoformat()),
        )
        for table in ("audit_log", "review_queue", "outbox"):
            table_cols = {r["name"] for r in conn.execute(f"PRAGMA table_info({table})")}
            if "workspace_id" not in table_cols:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN workspace_id INTEGER NOT NULL DEFAULT 1")
        conn.execute("CREATE INDEX IF NOT EXISTS audit_workspace_idx ON audit_log(workspace_id, id)")
        conn.execute("CREATE INDEX IF NOT EXISTS review_workspace_idx ON review_queue(workspace_id, status, id)")
        conn.execute("CREATE INDEX IF NOT EXISTS outbox_workspace_idx ON outbox(workspace_id, id)")


def create_user(full_name: str, email: str, password_hash: str) -> dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    with closing(_connect()) as conn, conn:
        conn.execute("BEGIN IMMEDIATE")
        workspace = conn.execute(
            "INSERT INTO workspaces (name, created_at) VALUES (?, ?)",
            (f"{full_name}'s workspace", now),
        )
        workspace_id = workspace.lastrowid
        user = conn.execute(
            "INSERT INTO users (workspace_id, full_name, email, password_hash, created_at, updated_at)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (workspace_id, full_name, email, password_hash, now, now),
        )
        return get_user(user.lastrowid, conn=conn)


def get_user(user_id: int, *, conn: sqlite3.Connection | None = None) -> dict[str, Any] | None:
    if conn is not None:
        row = conn.execute(
            "SELECT id, workspace_id, full_name, email, created_at, updated_at"
            " FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
        return dict(row) if row else None
    with closing(_connect()) as connection:
        return get_user(user_id, conn=connection)


def get_user_by_email(email: str) -> dict[str, Any] | None:
    with closing(_connect()) as conn:
        row = conn.execute("SELECT * FROM users WHERE email = ? COLLATE NOCASE", (email,)).fetchone()
    return dict(row) if row else None


def update_user_name(user_id: int, full_name: str) -> dict[str, Any] | None:
    now = datetime.now(timezone.utc).isoformat()
    with closing(_connect()) as conn, conn:
        conn.execute("UPDATE users SET full_name = ?, updated_at = ? WHERE id = ?", (full_name, now, user_id))
    return get_user(user_id)


def update_password_hash(user_id: int, password_hash: str, *, keep_session_hash: str | None = None) -> None:
    with closing(_connect()) as conn, conn:
        conn.execute("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
                     (password_hash, datetime.now(timezone.utc).isoformat(), user_id))
        conn.execute("DELETE FROM password_reset_tokens WHERE user_id = ?", (user_id,))
        if keep_session_hash:
            conn.execute("DELETE FROM auth_sessions WHERE user_id = ? AND token_hash != ?",
                         (user_id, keep_session_hash))
        else:
            conn.execute("DELETE FROM auth_sessions WHERE user_id = ?", (user_id,))


def create_session(token_hash: str, csrf_token: str, user_id: int, expires_at: float) -> None:
    now = time.time()
    with closing(_connect()) as conn, conn:
        conn.execute("DELETE FROM auth_sessions WHERE expires_at <= ?", (now,))
        conn.execute(
            "INSERT INTO auth_sessions (token_hash, csrf_token, user_id, created_at, expires_at)"
            " VALUES (?, ?, ?, ?, ?)",
            (token_hash, csrf_token, user_id, now, expires_at),
        )


def get_session(token_hash: str) -> dict[str, Any] | None:
    now = time.time()
    with closing(_connect()) as conn, conn:
        row = conn.execute(
            "SELECT s.token_hash, s.csrf_token, s.expires_at, u.id, u.workspace_id,"
            " u.full_name, u.email, u.created_at, u.updated_at"
            " FROM auth_sessions s JOIN users u ON u.id = s.user_id"
            " WHERE s.token_hash = ? AND s.expires_at > ?",
            (token_hash, now),
        ).fetchone()
        if row:
            return dict(row)
        conn.execute("DELETE FROM auth_sessions WHERE token_hash = ?", (token_hash,))
    return None


def delete_session(token_hash: str) -> None:
    with closing(_connect()) as conn, conn:
        conn.execute("DELETE FROM auth_sessions WHERE token_hash = ?", (token_hash,))


def add_password_reset_token(token_hash: str, user_id: int, expires_at: float) -> None:
    now = time.time()
    with closing(_connect()) as conn, conn:
        conn.execute("DELETE FROM password_reset_tokens WHERE user_id = ?", (user_id,))
        conn.execute(
            "INSERT INTO password_reset_tokens (token_hash, user_id, created_at, expires_at)"
            " VALUES (?, ?, ?, ?)",
            (token_hash, user_id, now, expires_at),
        )


def delete_password_reset_tokens(user_id: int) -> None:
    with closing(_connect()) as conn, conn:
        conn.execute("DELETE FROM password_reset_tokens WHERE user_id = ?", (user_id,))


def reset_password(token_hash: str, password_hash: str) -> bool:
    now = time.time()
    with closing(_connect()) as conn, conn:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute(
            "SELECT user_id FROM password_reset_tokens"
            " WHERE token_hash = ? AND expires_at > ? AND used_at IS NULL",
            (token_hash, now),
        ).fetchone()
        if row is None:
            return False
        user_id = row["user_id"]
        conn.execute("UPDATE password_reset_tokens SET used_at = ? WHERE token_hash = ?", (now, token_hash))
        conn.execute("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
                     (password_hash, datetime.now(timezone.utc).isoformat(), user_id))
        conn.execute("DELETE FROM auth_sessions WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM password_reset_tokens WHERE user_id = ? AND token_hash != ?",
                     (user_id, token_hash))
        return True


def consume_rate_limit(bucket: str, limit: int, window_seconds: int) -> tuple[bool, int]:
    now = time.time()
    with closing(_connect()) as conn, conn:
        conn.execute("BEGIN IMMEDIATE")
        conn.execute("DELETE FROM auth_rate_limits WHERE reset_at <= ?", (now - 86400,))
        row = conn.execute("SELECT count, reset_at FROM auth_rate_limits WHERE bucket = ?", (bucket,)).fetchone()
        if row is None or row["reset_at"] <= now:
            conn.execute(
                "INSERT INTO auth_rate_limits (bucket, count, reset_at) VALUES (?, 1, ?)"
                " ON CONFLICT(bucket) DO UPDATE SET count = 1, reset_at = excluded.reset_at",
                (bucket, now + window_seconds),
            )
            return True, 0
        retry_after = max(1, int(row["reset_at"] - now))
        if row["count"] >= limit:
            return False, retry_after
        conn.execute("UPDATE auth_rate_limits SET count = count + 1 WHERE bucket = ?", (bucket,))
        return True, retry_after


def delete_account(user_id: int, workspace_id: int) -> None:
    with closing(_connect()) as conn, conn:
        # The audit log is append-only, so the workspace's log, outbox and reviews are kept;
        # only the person's login data is removed and pending reviews can no longer be approved.
        conn.execute("BEGIN IMMEDIATE")
        conn.execute("DELETE FROM auth_sessions WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM password_reset_tokens WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM users WHERE id = ? AND workspace_id = ?", (user_id, workspace_id))
        conn.execute("UPDATE review_queue SET status = 'cancelled', decided_at = ? WHERE workspace_id = ? AND status = 'pending'",
                     (time.time(), workspace_id))
        conn.execute("UPDATE workspaces SET name = 'Deleted account' WHERE id = ?", (workspace_id,))


def save(
    task: str,
    doc: str,
    call: ToolCall | dict,
    decision: Decision,
    executed: bool,
    source: str = "run",
    workspace_id: int = 1,
) -> int:
    """Append one decision to the hash-chained audit log and return its id. Raw (malformed) calls are stored as-is."""
    tool, args = _tool_args(call)
    row = {
        "ts": datetime.now().strftime("%H:%M:%S"),
        "task": task,
        "doc": doc,
        "tool": tool,
        "args": args,
        "verdict": decision.verdict,
        "rules": decision.rules,
        "reasons": decision.reasons,
        "executed": bool(executed),
        "source": source,
    }
    with closing(_connect()) as conn, conn:
        conn.execute("BEGIN IMMEDIATE")  # one writer at a time, so the chain never forks
        last = conn.execute(
            "SELECT hash FROM audit_log WHERE workspace_id = ? ORDER BY id DESC LIMIT 1",
            (workspace_id,),
        ).fetchone()
        prev = last["hash"] if last else GENESIS
        cur = conn.execute(
            "INSERT INTO audit_log (workspace_id, ts, task, doc, tool, args_json, verdict, rules_json, reasons_json,"
            " executed, source, prev_hash, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                workspace_id, row["ts"], task, doc, tool, _canonical(args), decision.verdict, json.dumps(decision.rules),
                json.dumps(decision.reasons), int(executed), source, prev, _row_hash(prev, row),
            ),
        )
        return cur.lastrowid


def _row_from_db(r: sqlite3.Row) -> dict:
    return {
        "ts": r["ts"],
        "task": r["task"],
        "doc": r["doc"],
        "tool": r["tool"],
        "args": json.loads(r["args_json"]),
        "verdict": r["verdict"],
        "rules": json.loads(r["rules_json"]),
        "reasons": json.loads(r["reasons_json"]),
        "executed": bool(r["executed"]),
        "source": r["source"],
    }


def get_log(audit_id: int, workspace_id: int = 1) -> dict | None:
    with closing(_connect()) as conn:
        r = conn.execute("SELECT * FROM audit_log WHERE id = ? AND workspace_id = ?", (audit_id, workspace_id)).fetchone()
    return _row_from_db(r) if r else None


def verify_chain(workspace_id: int = 1) -> dict:
    """Recompute every row's hash in order. Any edited, inserted or deleted row breaks the chain."""
    with closing(_connect()) as conn:
        rows = conn.execute("SELECT * FROM audit_log WHERE workspace_id = ? ORDER BY id", (workspace_id,)).fetchall()
    prev = GENESIS
    for r in rows:
        if r["prev_hash"] != prev or r["hash"] != _row_hash(prev, _row_from_db(r)):
            return {"ok": False, "rows": len(rows), "broken_at": r["id"]}
        prev = r["hash"]
    return {"ok": True, "rows": len(rows)}


def list_logs(limit: int = 200, workspace_id: int = 1) -> list[LogEntry]:
    """Newest first."""
    with closing(_connect()) as conn:
        rows = conn.execute(
            "SELECT * FROM audit_log WHERE workspace_id = ? ORDER BY id DESC LIMIT ?",
            (workspace_id, limit),
        ).fetchall()
    return [LogEntry(id=r["id"], prev_hash=r["prev_hash"], hash=r["hash"], **_row_from_db(r)) for r in rows]


# --- review queue: an approval is bound to the exact call (call_hash) the human saw ---------------


def add_review(
    audit_id: int,
    task: str,
    doc: str,
    call: ToolCall | dict,
    timeout_min: float,
    workspace_id: int = 1,
) -> int:
    tool, args = _tool_args(call)
    now = time.time()
    with closing(_connect()) as conn, conn:
        cur = conn.execute(
            "INSERT INTO review_queue (workspace_id, audit_id, task, doc, call_json, call_hash, created_at, expires_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (workspace_id, audit_id, task, doc, _canonical({"tool": tool, "args": args}), call_hash(task, call), now,
             now + timeout_min * 60),
        )
        return cur.lastrowid


def get_review(review_id: int, workspace_id: int = 1) -> dict | None:
    with closing(_connect()) as conn:
        r = conn.execute(
            "SELECT * FROM review_queue WHERE id = ? AND workspace_id = ?",
            (review_id, workspace_id),
        ).fetchone()
    if not r:
        return None
    item = dict(r)
    item["call"] = json.loads(item.pop("call_json"))
    return item


def list_reviews(workspace_id: int = 1, status: str = "pending") -> list[dict]:
    with closing(_connect()) as conn:
        ids = [
            r["id"]
            for r in conn.execute(
                "SELECT id FROM review_queue WHERE workspace_id = ? AND status = ? ORDER BY id",
                (workspace_id, status),
            )
        ]
    return [get_review(i, workspace_id) for i in ids]


def set_review_status(review_id: int, status: str, workspace_id: int = 1) -> None:
    """The queue is workflow state, not the audit trail: every decision is also appended to audit_log."""
    with closing(_connect()) as conn, conn:
        conn.execute(
            "UPDATE review_queue SET status = ?, decided_at = ? WHERE id = ? AND workspace_id = ?",
            (status, time.time(), review_id, workspace_id),
        )


# --- sandbox outbox: approved email actions are recorded, never delivered ----------------------


def add_outbox(call: ToolCall, audit_id: int, workspace_id: int = 1) -> None:
    with closing(_connect()) as conn, conn:
        conn.execute(
            "INSERT INTO outbox (workspace_id, ts, to_addr, subject, attachment, audit_id) VALUES (?, ?, ?, ?, ?, ?)",
            (workspace_id, datetime.now().strftime("%H:%M:%S"), call.args.get("to", ""),
             call.args.get("subject", ""), call.args.get("attachment"), audit_id),
        )


def list_outbox(workspace_id: int = 1) -> list[dict]:
    with closing(_connect()) as conn:
        rows = conn.execute(
            "SELECT id, ts, to_addr AS \"to\", subject, attachment, audit_id"
            " FROM outbox WHERE workspace_id = ? ORDER BY id DESC",
            (workspace_id,),
        )
        return [dict(r) for r in rows]


def add_document(
    document_id: str,
    workspace_id: int,
    filename: str,
    stored_path: str,
    size_bytes: int,
) -> None:
    with closing(_connect()) as conn, conn:
        conn.execute(
            "INSERT INTO documents (id, workspace_id, filename, stored_path, size_bytes, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (document_id, workspace_id, filename, stored_path, size_bytes, time.time()),
        )


def get_document(document_id: str, workspace_id: int) -> dict | None:
    with closing(_connect()) as conn:
        row = conn.execute(
            "SELECT id, workspace_id, filename, stored_path, size_bytes, created_at"
            " FROM documents WHERE id = ? AND workspace_id = ?",
            (document_id, workspace_id),
        ).fetchone()
        return dict(row) if row else None


def list_documents(workspace_id: int) -> list[dict]:
    with closing(_connect()) as conn:
        rows = conn.execute(
            "SELECT id, filename, size_bytes, created_at FROM documents"
            " WHERE workspace_id = ? ORDER BY created_at DESC, id",
            (workspace_id,),
        )
        return [dict(row) for row in rows]
