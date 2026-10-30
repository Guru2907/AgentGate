"""SQLite helpers: append-only hash-chained audit_log, review_queue, outbox, bench_runs.

hash = sha256(prev_hash + canonical_json(row)); first row uses prev_hash = "GENESIS".
Never UPDATE or DELETE audit rows — human decisions and timeouts are new rows.
"""


def init_db(db_path: str) -> None:
    raise NotImplementedError


def verify_chain(db_path: str) -> dict:
    """Recompute the chain -> {"ok": True, "rows": n} or {"ok": False, "broken_at": id}."""
    raise NotImplementedError
