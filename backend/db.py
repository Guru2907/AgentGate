"""SQLite audit log: every gate decision is stored, allowed or not.

Insert-only: rows are never updated or deleted (the hash chain is added on top in Phase 3).
DB file comes from DB_PATH in .env (default agentgate.db in the repo root).
"""

import json
import os
import sqlite3
from contextlib import closing
from datetime import datetime
from pathlib import Path

from backend.schemas import Decision, LogEntry, ToolCall

ROOT = Path(__file__).resolve().parents[1]

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
    source TEXT NOT NULL DEFAULT 'run'
)
"""


def _db_path() -> Path:
    return ROOT / os.getenv("DB_PATH", "agentgate.db")


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(_db_path())
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with closing(_connect()) as conn, conn:
        conn.execute(_SCHEMA)


def save(task: str, doc: str, call: ToolCall | dict, decision: Decision, executed: bool, source: str = "run") -> int:
    """Append one decision to the audit log and return its id. Raw (malformed) calls are stored as-is."""
    tool = call.tool if isinstance(call, ToolCall) else str(call.get("tool", "?")) if isinstance(call, dict) else "?"
    args = call.args if isinstance(call, ToolCall) else call.get("args", {}) if isinstance(call, dict) else {}
    if not isinstance(args, dict):
        args = {"_raw": args}
    with closing(_connect()) as conn, conn:
        cur = conn.execute(
            "INSERT INTO audit_log (ts, task, doc, tool, args_json, verdict, rules_json, reasons_json, executed, source)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                datetime.now().strftime("%H:%M:%S"),
                task,
                doc,
                tool,
                json.dumps(args, default=str),
                decision.verdict,
                json.dumps(decision.rules),
                json.dumps(decision.reasons),
                int(executed),
                source,
            ),
        )
        return cur.lastrowid


def list_logs(limit: int = 200) -> list[LogEntry]:
    """Newest first."""
    with closing(_connect()) as conn:
        rows = conn.execute("SELECT * FROM audit_log ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    return [
        LogEntry(
            id=r["id"],
            ts=r["ts"],
            task=r["task"],
            doc=r["doc"],
            tool=r["tool"],
            args=json.loads(r["args_json"]),
            verdict=r["verdict"],
            rules=json.loads(r["rules_json"]),
            reasons=json.loads(r["reasons_json"]),
            executed=bool(r["executed"]),
            source=r["source"],
        )
        for r in rows
    ]
