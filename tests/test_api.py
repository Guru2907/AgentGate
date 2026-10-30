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


def test_llm_agent_failure_is_reported_without_fake_output(client, monkeypatch):
    monkeypatch.setenv("AGENT", "llm")
    monkeypatch.setenv("LLM_MODE", "live")
    monkeypatch.setenv("GROQ_API_KEY", "")
    monkeypatch.setenv("GROQ_MODEL", "")
    response = client.post("/api/run", json=HOSTILE)
    assert response.status_code == 503
    assert response.json()["detail"] == "The AI provider is unavailable. Check the server configuration and try again."


def test_malformed_agent_output_is_blocked_not_crashed(client, monkeypatch):
    monkeypatch.setattr("backend.main.fake_propose", lambda task, doc: [{"tool": "rm_rf", "args": {}}, "garbage"])
    body = client.post("/api/run", json=CLEAN).json()
    assert [d["verdict"] for d in body["decisions"]] == ["BLOCK", "BLOCK"]
    assert all("R6_MALFORMED_CALL" in d["rules"] for d in body["decisions"])
    assert body["outputs"] == ["(not executed)", "(not executed)"]
