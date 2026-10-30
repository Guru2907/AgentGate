"""End-to-end tests of the thin path: POST /api/run -> agent -> gate -> mock tool -> audit log."""

import pytest
from fastapi.testclient import TestClient

from backend.main import app

HOSTILE = {"task": "summarise_resume", "doc": "hostile/resume_h01_hidden_email.txt"}
CLEAN = {"task": "summarise_resume", "doc": "clean/resume_01_asha.txt"}


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "test.db"))
    monkeypatch.setenv("AGENT", "fake")
    with TestClient(app) as c:
        c.headers.update({"Origin": "http://localhost:5173"})
        registered = c.post(
            "/api/auth/signup",
            json={"full_name": "API Test", "email": "api-test@example.com", "password": "test-password-123"},
        )
        assert registered.status_code == 201
        c.headers.update({"X-CSRF-Token": registered.json()["csrf_token"]})
        yield c


def test_hostile_doc_is_blocked_and_nothing_runs(client):
    r = client.post("/api/run", json=HOSTILE)
    assert r.status_code == 200
    body = r.json()
    assert body["proposed"][0]["tool"] == "send_email"
    assert body["decisions"][0]["verdict"] == "BLOCK"
    assert body["decisions"][0]["rules"] == [
        "R1_TOOL_NOT_ALLOWED",
        "R2_RECIPIENT_NOT_ALLOWED",
        "R3_FILE_OUT_OF_SCOPE",
        "R4_SENSITIVE_FILE",
    ]
    assert body["outputs"] == ["(not executed)"]


def test_clean_doc_is_allowed_and_executed(client):
    body = client.post("/api/run", json=CLEAN).json()
    assert body["decisions"][0]["verdict"] == "ALLOW"
    assert body["outputs"][0].startswith("Summary:")


def test_every_run_is_logged_newest_first(client):
    client.post("/api/run", json=CLEAN)
    client.post("/api/run", json=HOSTILE)
    logs = client.get("/api/logs").json()
    assert [(e["verdict"], e["executed"]) for e in logs] == [("BLOCK", False), ("ALLOW", True)]


@pytest.mark.parametrize("doc", ["../backend/main.py", "clean/../../.env", "sandbox/placement_list.xlsx", "clean/missing.txt"])
def test_docs_outside_data_folders_are_rejected(client, doc):
    assert client.post("/api/run", json={"task": "summarise_resume", "doc": doc}).status_code in (400, 404)


def test_docs_endpoint_lists_clean_and_hostile(client):
    docs = client.get("/api/docs").json()
    assert "clean/resume_01_asha.txt" in docs
    assert "hostile/resume_h01_hidden_email.txt" in docs
    assert "hostile/resume_h06_chain.txt" in docs


def test_llm_agent_failure_falls_back_to_fake(client, monkeypatch):
    monkeypatch.setenv("AGENT", "llm")  # provider down must not break the demo: saved replay or fake agent
    monkeypatch.setenv("LLM_MODE", "live")
    monkeypatch.setenv("GROQ_API_KEY", "")
    monkeypatch.setenv("GROQ_MODEL", "")
    body = client.post("/api/run", json=HOSTILE).json()
    assert body["decisions"][0]["verdict"] == "BLOCK"


def test_malformed_agent_output_is_blocked_not_crashed(client, monkeypatch):
    monkeypatch.setattr(
        "backend.main.fake_propose",
        lambda task, doc, history=None: [{"tool": "rm_rf", "args": {}}, "garbage"],
    )
    body = client.post("/api/run", json=CLEAN).json()
    assert [d["verdict"] for d in body["decisions"]] == ["BLOCK", "BLOCK"]
    assert all("R6_MALFORMED_CALL" in d["rules"] for d in body["decisions"])
    assert body["outputs"] == ["(not executed)", "(not executed)"]


def test_chain_doc_read_then_email_blocked_with_r9(client, monkeypatch):
    """Issue #8: multi-step chain — ALLOW read, BLOCK email (R9). Default AGENT_STEPS stays 1 for other tests."""
    monkeypatch.setenv("AGENT_STEPS", "3")
    monkeypatch.setenv("AGENT", "fake")
    body = client.post(
        "/api/run",
        json={"task": "email_company", "doc": "hostile/resume_h06_chain.txt"},
    ).json()
    assert [p["tool"] for p in body["proposed"]] == ["read_file", "send_email"]
    assert body["decisions"][0]["verdict"] == "ALLOW"
    assert body["outputs"][0].startswith("[spreadsheet") or "placement_list" in body["outputs"][0]
    assert body["decisions"][1]["verdict"] == "BLOCK"
    assert "R9_TAINTED_EGRESS" in body["decisions"][1]["rules"]
    assert body["outputs"][1] == "(not executed)"


def test_default_agent_steps_keeps_one_shot_demo(client, monkeypatch):
    monkeypatch.delenv("AGENT_STEPS", raising=False)
    monkeypatch.setenv("AGENT", "fake")
    body = client.post("/api/run", json=HOSTILE).json()
    assert len(body["proposed"]) == 1
    assert body["decisions"][0]["verdict"] == "BLOCK"
