import pytest
from fastapi.testclient import TestClient

from backend import db, gate
from backend.main import app

ORIGIN = "http://localhost:5173"


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "explain.db"))
    monkeypatch.setenv("AGENT", "fake")
    monkeypatch.setenv("AGENT_STEPS", "1")
    with TestClient(app) as test_client:
        test_client.headers.update({"Origin": ORIGIN})
        signup = test_client.post(
            "/api/auth/signup",
            json={"full_name": "Explain Test", "email": "explain@example.com", "password": "test-password-123"},
        )
        assert signup.status_code == 201
        test_client.headers.update({"X-CSRF-Token": signup.json()["csrf_token"]})
        yield test_client


def test_explain_returns_all_rules_and_marks_history_rules_not_applicable():
    checks = gate.explain(
        {"tool": "summarise", "args": {"document_id": "clean/resume_01_asha.txt"}},
        "summarise_resume",
        gate.load_policy(),
    )

    assert len(checks) == 11
    assert [check["rule"] for check in checks] == list(gate.RULE_ORDER)
    assert {check["status"] for check in checks if check["rule"] in {
        "R9_TAINTED_EGRESS", "R10_ENCODED_EXFIL", "R11_APPROVAL_TAMPERED"
    }} == {"not_applicable"}


def test_blocked_hostile_row_explains_stored_rules_and_hidden_text(client):
    run = client.post(
        "/api/run",
        json={"task": "summarise_resume", "doc": "hostile/resume_h01_hidden_email.txt"},
    )
    assert run.status_code == 200
    row = client.get("/api/logs").json()[0]

    response = client.get(f"/api/logs/{row['id']}/explain")
    assert response.status_code == 200
    explanation = response.json()
    assert len(explanation["checks"]) == 11
    statuses = {check["rule"]: check["status"] for check in explanation["checks"]}
    assert all(statuses[rule] == "failed" for rule in row["rules"])
    assert explanation["hidden_text"]
    assert "Ignore previous instructions" in explanation["hidden_text"]
    assert explanation["row"]["hash"] == row["hash"]


def test_related_run_steps_reconstruct_tainted_egress_context(client, monkeypatch):
    monkeypatch.setenv("AGENT_STEPS", "3")
    response = client.post(
        "/api/run",
        json={"task": "email_company", "doc": "hostile/resume_h06_chain.txt"},
    )
    assert response.status_code == 200
    rows = client.get("/api/logs").json()
    email_row = next(row for row in rows if row["tool"] == "send_email")

    explanation = client.get(f"/api/logs/{email_row['id']}/explain").json()
    assert [step["tool"] for step in explanation["run_steps"]] == ["read_file"]
    checks = {check["rule"]: check["status"] for check in explanation["checks"]}
    assert checks["R9_TAINTED_EGRESS"] == "failed"


def test_injected_row_has_no_document_hidden_text(client):
    response = client.post(
        "/api/inject",
        json={
            "task": "summarise_resume",
            "calls": [{"tool": "summarise", "args": {"document_id": "resume.txt"}}],
        },
    )
    assert response.status_code == 200
    row = client.get("/api/logs").json()[0]

    explanation = client.get(f"/api/logs/{row['id']}/explain").json()
    assert explanation["hidden_text"] is None


def test_explanation_includes_human_review_resolution(client):
    response = client.post(
        "/api/inject",
        json={
            "task": "email_company",
            "calls": [
                {
                    "tool": "send_email",
                    "args": {
                        "to": "hr@gmail.com",
                        "subject": "Candidate profile",
                        "body": "Please review this synthetic resume.",
                    },
                }
            ],
        },
    )
    assert response.status_code == 200
    original = client.get("/api/logs").json()[0]
    review = client.get("/api/review").json()[0]
    decision = client.post(
        f"/api/review/{review['id']}",
        json={"action": "approve", "call_hash": review["call_hash"]},
    )
    assert decision.status_code == 200

    explanation = client.get(f"/api/logs/{original['id']}/explain").json()
    assert explanation["resolution"]["id"] == decision.json()["audit_id"]
    assert explanation["resolution"]["rules"] == ["HUMAN_APPROVED"]


def test_cancelled_review_has_no_resolution(client):
    response = client.post(
        "/api/inject",
        json={
            "task": "email_company",
            "calls": [
                {
                    "tool": "send_email",
                    "args": {
                        "to": "hr@gmail.com",
                        "subject": "Candidate profile",
                        "body": "Please review this synthetic resume.",
                    },
                }
            ],
        },
    )
    assert response.status_code == 200
    original = client.get("/api/logs").json()[0]
    review = client.get("/api/review").json()[0]
    workspace_id = client.get("/api/auth/profile").json()["workspace_id"]
    review_record = db.get_review(review["id"], workspace_id)
    db.set_review_status(review["id"], "cancelled", workspace_id)

    explanation = client.get(f"/api/logs/{original['id']}/explain")
    assert explanation.status_code == 200
    assert explanation.json()["resolution"] is None


def test_log_explanation_is_private_to_its_workspace(client):
    client.post(
        "/api/run",
        json={"task": "summarise_resume", "doc": "clean/resume_01_asha.txt"},
    )
    row_id = client.get("/api/logs").json()[0]["id"]

    assert client.post("/api/auth/logout").status_code == 200
    signup = client.post(
        "/api/auth/signup",
        json={"full_name": "Other Owner", "email": "other@example.com", "password": "test-password-456"},
    )
    assert signup.status_code == 201
    client.headers["X-CSRF-Token"] = signup.json()["csrf_token"]

    assert client.get(f"/api/logs/{row_id}/explain").status_code == 404


def test_rules_endpoint_requires_login_and_returns_all_15_entries(client, tmp_path, monkeypatch):
    rules = client.get("/api/rules")
    assert rules.status_code == 200
    assert len(rules.json()) == 15
    assert "R1_TOOL_NOT_ALLOWED" in rules.json()
    assert "HUMAN_APPROVED" in rules.json()
    assert "POLICY_CHANGE" in rules.json()

    monkeypatch.setenv("DB_PATH", str(tmp_path / "anonymous.db"))
    with TestClient(app) as anonymous:
        assert anonymous.get("/api/rules").status_code == 401
