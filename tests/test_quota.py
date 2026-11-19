"""Daily AI budget (per user + server-wide) and the server-wide sign-up cap."""

import pytest
from fastapi.testclient import TestClient

from backend import agent
from backend.main import app

SAMPLE = "clean/resume_02_rahul.txt"
DRAFT = {"doc": SAMPLE, "to": "hr@partner-company.com"}
SEND = [{"tool": "send_email", "args": {"to": "hr@partner-company.com", "subject": "s", "body": "b"}}]


def _client(tmp_path, monkeypatch, *, per_user="1", global_limit="100", signups="30"):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "quota.db"))
    monkeypatch.setenv("AGENT", "llm")
    monkeypatch.setenv("AGENT_STEPS", "1")
    monkeypatch.setenv("GROQ_API_KEY", "test-key-not-used")  # a key is set, so live calls would cost quota
    monkeypatch.setenv("AI_DAILY_LIMIT_PER_USER", per_user)
    monkeypatch.setenv("AI_DAILY_LIMIT_GLOBAL", global_limit)
    monkeypatch.setenv("SIGNUP_LIMIT_PER_HOUR", signups)
    monkeypatch.setattr(agent, "_propose_live", lambda *a, **k: SEND)  # never reach the network
    return TestClient(app)


def _sign_up(client, email: str) -> None:
    client.cookies.clear()
    r = client.post("/api/auth/signup", json={"full_name": "Quota Test", "email": email, "password": "test-password-123"})
    assert r.status_code == 201, r.text
    client.headers.update({"X-CSRF-Token": r.json()["csrf_token"]})


@pytest.fixture
def client(tmp_path, monkeypatch):
    with _client(tmp_path, monkeypatch) as c:
        c.headers.update({"Origin": "http://localhost:5173"})
        _sign_up(c, "quota@example.com")
        yield c


def test_live_ai_calls_stop_at_the_daily_limit_with_a_clear_message(client, monkeypatch):
    monkeypatch.setenv("LLM_MODE", "live")
    assert client.post("/api/email/draft", json=DRAFT).status_code == 200
    r = client.post("/api/email/draft", json=DRAFT)
    assert r.status_code == 429
    assert "Daily AI limit reached for your account" in r.json()["detail"]
    assert int(r.headers["Retry-After"]) > 0


def test_samples_in_replay_mode_cost_nothing(client, monkeypatch):
    monkeypatch.setenv("LLM_MODE", "replay")
    for _ in range(3):  # per-user limit is 1, but saved answers never call the AI
        assert client.post("/api/email/draft", json=DRAFT).status_code == 200
        assert client.post("/api/run", json={"task": "summarise_resume", "doc": SAMPLE}).status_code == 200


def test_red_team_rescoring_costs_nothing_but_generation_does(client):
    assert client.post("/api/redteam", json={"score_only": True}).status_code == 200
    assert client.post("/api/redteam", json={"n": 5}).status_code == 429  # 2 model requests > limit of 1


def test_the_server_wide_budget_applies_across_accounts(tmp_path, monkeypatch):
    with _client(tmp_path, monkeypatch, per_user="10", global_limit="1") as c:
        c.headers.update({"Origin": "http://localhost:5173"})
        monkeypatch.setenv("LLM_MODE", "live")
        _sign_up(c, "first@example.com")
        assert c.post("/api/email/draft", json=DRAFT).status_code == 200
        _sign_up(c, "second@example.com")
        r = c.post("/api/email/draft", json=DRAFT)
        assert r.status_code == 429 and "this demo server" in r.json()["detail"]


def test_sign_ups_are_capped_for_the_whole_server(tmp_path, monkeypatch):
    with _client(tmp_path, monkeypatch, signups="1") as c:
        c.headers.update({"Origin": "http://localhost:5173"})
        _sign_up(c, "one@example.com")
        c.cookies.clear()
        r = c.post("/api/auth/signup", json={"full_name": "Two", "email": "two@example.com", "password": "test-password-123"})
        assert r.status_code == 429
