"""SQLite storage: hash-chained audit log, review queue (approvals bound to exact calls) and mock outbox.

audit_log is append-only: rows are never updated or deleted. Each row stores
hash = sha256(prev_hash + canonical row), so editing any past row breaks the chain (verify_chain).
DB file comes from DB_PATH in .env (default agentgate.db in the repo root).
"""

import hashlib
import json
import os
import sqlite3
import time
from contextlib import closing
from datetime import datetime
from pathlib import Path

from backend.schemas import Decision, LogEntry, ToolCall

ROOT = Path(__file__).resolve().parents[1]
GENESIS = "GENESIS"

_SCHEMA = """
CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    ts TEXT NOT NULL,
    to_addr TEXT NOT NULL,
    subject TEXT NOT NULL,
    attachment TEXT,
    audit_id INTEGER NOT NULL
);
"""


def _db_path() -> Path:
    return ROOT / os.getenv("DB_PATH", "agentgate.db")


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(_db_path())
    conn.row_factory = sqlite3.Row
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


def save(task: str, doc: str, call: ToolCall | dict, decision: Decision, executed: bool, source: str = "run") -> int:
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
        last = conn.execute("SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1").fetchone()
        prev = last["hash"] if last else GENESIS
        cur = conn.execute(
            "INSERT INTO audit_log (ts, task, doc, tool, args_json, verdict, rules_json, reasons_json, executed,"
            " source, prev_hash, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                row["ts"], task, doc, tool, _canonical(args), decision.verdict, json.dumps(decision.rules),
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


def get_log(audit_id: int) -> dict | None:
    with closing(_connect()) as conn:
        r = conn.execute("SELECT * FROM audit_log WHERE id = ?", (audit_id,)).fetchone()
    return _row_from_db(r) if r else None


def verify_chain() -> dict:
    """Recompute every row's hash in order. Any edited, inserted or deleted row breaks the chain."""
    with closing(_connect()) as conn:
        rows = conn.execute("SELECT * FROM audit_log ORDER BY id").fetchall()
    prev = GENESIS
    for r in rows:
        if r["prev_hash"] != prev or r["hash"] != _row_hash(prev, _row_from_db(r)):
            return {"ok": False, "rows": len(rows), "broken_at": r["id"]}
        prev = r["hash"]
    return {"ok": True, "rows": len(rows)}


def list_logs(limit: int = 200) -> list[LogEntry]:
    """Newest first."""
    with closing(_connect()) as conn:
        rows = conn.execute("SELECT * FROM audit_log ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    return [LogEntry(id=r["id"], prev_hash=r["prev_hash"], hash=r["hash"], **_row_from_db(r)) for r in rows]


# --- review queue: an approval is bound to the exact call (call_hash) the human saw ---------------


def add_review(audit_id: int, task: str, doc: str, call: ToolCall | dict, timeout_min: float) -> int:
    tool, args = _tool_args(call)
    now = time.time()
    with closing(_connect()) as conn, conn:
        cur = conn.execute(
            "INSERT INTO review_queue (audit_id, task, doc, call_json, call_hash, created_at, expires_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?)",
            (audit_id, task, doc, _canonical({"tool": tool, "args": args}), call_hash(task, call), now,
             now + timeout_min * 60),
        )
        return cur.lastrowid


def get_review(review_id: int) -> dict | None:
    with closing(_connect()) as conn:
        r = conn.execute("SELECT * FROM review_queue WHERE id = ?", (review_id,)).fetchone()
    if not r:
        return None
    item = dict(r)
    item["call"] = json.loads(item.pop("call_json"))
    return item


def list_reviews(status: str = "pending") -> list[dict]:
    with closing(_connect()) as conn:
        ids = [r["id"] for r in conn.execute("SELECT id FROM review_queue WHERE status = ? ORDER BY id", (status,))]
    return [get_review(i) for i in ids]


def set_review_status(review_id: int, status: str) -> None:
    """The queue is workflow state, not the audit trail: every decision is also appended to audit_log."""
    with closing(_connect()) as conn, conn:
        conn.execute("UPDATE review_queue SET status = ?, decided_at = ? WHERE id = ?", (status, time.time(), review_id))


# --- mock outbox: what send_email "sent" --------------------------------------------------------


def add_outbox(call: ToolCall, audit_id: int) -> None:
    with closing(_connect()) as conn, conn:
        conn.execute(
            "INSERT INTO outbox (ts, to_addr, subject, attachment, audit_id) VALUES (?, ?, ?, ?, ?)",
            (datetime.now().strftime("%H:%M:%S"), call.args.get("to", ""), call.args.get("subject", ""),
             call.args.get("attachment"), audit_id),
        )


def list_outbox() -> list[dict]:
    with closing(_connect()) as conn:
        rows = conn.execute("SELECT id, ts, to_addr AS \"to\", subject, attachment, audit_id FROM outbox ORDER BY id DESC")
        return [dict(r) for r in rows]
