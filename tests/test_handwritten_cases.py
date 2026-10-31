"""Run every hand-written case in tests/cases/*.yaml through /api/inject (same path as /api/run)."""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml
from fastapi.testclient import TestClient

from backend.gate import RunContext, check, load_policy
from backend.main import app

CASES_DIR = Path(__file__).parent / "cases"
POLICY = load_policy()


def _load_cases() -> list[dict]:
    rows: list[dict] = []
    for path in sorted(CASES_DIR.glob("*.yaml")):
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        group = data.get("group") or path.stem
        for case in data.get("cases") or []:
            case = dict(case)
            case["_group"] = group
            case["_file"] = path.name
            rows.append(case)
    return rows


CASES = _load_cases()
CASE_IDS = [c["id"] for c in CASES]


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "handwritten.db"))
    monkeypatch.setenv("AGENT", "fake")
    monkeypatch.setenv("AGENT_STEPS", "1")
    with TestClient(app) as c:
        c.headers.update({"Origin": "http://localhost:5173"})
        registered = c.post(
            "/api/auth/signup",
            json={
                "full_name": "Handwritten Tester",
                "email": "handwritten-test@example.com",
                "password": "test-password-123",
            },
        )
        assert registered.status_code == 201, registered.text
        c.headers.update({"X-CSRF-Token": registered.json()["csrf_token"]})
        yield c


def _assert_expect(decision: dict, expect: dict) -> None:
    if "verdict" in expect:
        assert decision["verdict"] == expect["verdict"], decision
    rules = set(decision.get("rules") or [])
    for rule in expect.get("rules") or []:
        assert rule in rules, f"expected rule {rule} in {sorted(rules)}"
    for rule in expect.get("not_rules") or []:
        assert rule not in rules, f"did not expect rule {rule} in {sorted(rules)}"


def _decision_dict(decision) -> dict:
    if isinstance(decision, dict):
        return decision
    return {"verdict": decision.verdict, "rules": list(decision.rules), "reasons": list(decision.reasons)}


def _run_gate_only(task: str, calls: list, expect: dict) -> None:
    """Direct gate.check path for cases where /api/inject crashes on bad arg types (insights extras)."""
    ctx = RunContext()
    decisions = []
    for raw in calls:
        d = check(raw, task, POLICY, ctx)
        decisions.append(_decision_dict(d))
        ctx.record(raw, d, "", POLICY)

    if "steps" in expect:
        assert [d["verdict"] for d in decisions] == expect["steps"]
    last_expect = {k: v for k, v in expect.items() if k != "steps"}
    if last_expect:
        _assert_expect(decisions[-1], last_expect)


def _run_inject(client: TestClient, task: str, calls: list, expect: dict) -> dict:
    before = len(client.get("/api/logs").json())
    r = client.post("/api/inject", json={"task": task, "calls": calls})
    assert r.status_code == 200, r.text
    body = r.json()
    decisions = body["decisions"]
    assert len(decisions) == len(calls)

    if "steps" in expect:
        assert [d["verdict"] for d in decisions] == expect["steps"]
    last = decisions[-1]
    last_expect = {k: v for k, v in expect.items() if k != "steps"}
    if last_expect:
        _assert_expect(last, last_expect)

    after = client.get("/api/logs").json()
    assert len(after) == before + len(calls)
    verify = client.get("/api/logs/verify").json()
    assert verify.get("ok") is True, verify
    return body


def _run_flow(client: TestClient, monkeypatch, case: dict) -> None:
    task = case["task"]
    last_decision: dict | None = None
    review_id: int | None = None
    review_hash: str | None = None

    for step in case["flow"]:
        action = step["action"]
        if action == "set_timeout":
            monkeypatch.setenv("REVIEW_TIMEOUT_MIN", str(step.get("minutes", 0)))
        elif action == "inject":
            before = len(client.get("/api/logs").json())
            calls = step["calls"]
            r = client.post("/api/inject", json={"task": task, "calls": calls})
            assert r.status_code == 200, r.text
            body = r.json()
            decisions = body["decisions"]
            if "expect_steps" in step:
                assert [d["verdict"] for d in decisions] == step["expect_steps"]
            if "expect_verdict" in step:
                assert decisions[-1]["verdict"] == step["expect_verdict"]
            assert len(client.get("/api/logs").json()) == before + len(calls)
            last_decision = decisions[-1]
            # Do not call get_review here when timeout is 0 — that would expire before we assert.
            if float(__import__("os").getenv("REVIEW_TIMEOUT_MIN", "10")) > 0:
                pending = client.get("/api/review").json()
                if pending:
                    review_id = pending[0]["id"]
                    review_hash = pending[0]["call_hash"]
            else:
                # Peek DB-backed queue via logs: review id is in the waiting output text.
                out = body["outputs"][-1]
                if "review #" in out:
                    review_id = int(out.rsplit("#", 1)[-1].rstrip(")"))
        elif action == "get_review":
            pending = client.get("/api/review").json()
            assert len(pending) == step.get("expect_pending", 1)
            if pending:
                review_id = pending[0]["id"]
                review_hash = pending[0]["call_hash"]
        elif action == "approve":
            if review_id is None or review_hash is None:
                pending = client.get("/api/review").json()
                assert pending, "expected a pending review to approve"
                review_id = pending[0]["id"]
                review_hash = pending[0]["call_hash"]
            mode = step.get("call_hash", "same")
            payload: dict = {"action": "approve"}
            if mode == "same":
                payload["call_hash"] = review_hash
            elif mode == "different":
                payload["call_hash"] = "0" * 64
            r = client.post(f"/api/review/{review_id}", json=payload)
            assert r.status_code == 200, r.text
            last_decision = r.json()["decision"]
            if "expect" in step:
                _assert_expect(last_decision, step["expect"])
        elif action == "approve_again":
            assert review_id is not None
            r = client.post(
                f"/api/review/{review_id}",
                json={"action": "approve", "call_hash": review_hash},
            )
            assert r.status_code == step.get("expect_status", 409)
        elif action == "deny":
            if review_id is None:
                pending = client.get("/api/review").json()
                assert pending
                review_id = pending[0]["id"]
            r = client.post(f"/api/review/{review_id}", json={"action": "deny"})
            assert r.status_code == 200, r.text
            last_decision = r.json()["decision"]
            if "expect" in step:
                _assert_expect(last_decision, step["expect"])
        elif action == "timeout":
            # Expiry runs inside GET /api/review when expires_at <= now (timeout_min was 0 at inject).
            assert client.get("/api/review").json() == []
            logs = client.get("/api/logs").json()
            assert logs[0]["source"] == "timeout"
            assert "REVIEW_TIMEOUT" in logs[0]["rules"]
            last_decision = {
                "verdict": logs[0]["verdict"],
                "rules": logs[0]["rules"],
                "reasons": logs[0]["reasons"],
            }
            if "expect_rule" in step:
                assert step["expect_rule"] in last_decision["rules"]
        elif action == "check_outbox":
            outbox = client.get("/api/outbox").json()
            assert len(outbox) == step.get("expect_count", 0)
        else:
            raise AssertionError(f"unknown flow action {action!r}")

    if case.get("expect") and last_decision is not None:
        _assert_expect(last_decision, case["expect"])

    verify = client.get("/api/logs/verify").json()
    assert verify.get("ok") is True, verify


@pytest.mark.parametrize("case", CASES, ids=CASE_IDS)
def test_handwritten_case(client, monkeypatch, case):
    if case.get("known_gap"):
        pytest.xfail(case.get("note") or "known gate gap")

    if case.get("flow"):
        _run_flow(client, monkeypatch, case)
        return

    assert "calls" in case, f"case {case['id']} needs calls or flow"
    expect = case.get("expect") or {}
    if case.get("via") == "gate":
        _run_gate_only(case["task"], case["calls"], expect)
        verify = client.get("/api/logs/verify").json()
        assert verify.get("ok") is True, verify
        return

    _run_inject(client, case["task"], case["calls"], expect)
