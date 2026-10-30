import pytest
from fastapi.testclient import TestClient

from backend import auth, db
from backend.main import app

ORIGIN = "http://localhost:5173"
PASSWORD = "correct-horse-battery"


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "accounts.db"))
    monkeypatch.setenv("AGENT", "fake")
    for key in ("SMTP_HOST", "SMTP_FROM", "SMTP_USER", "SMTP_PASSWORD"):
        monkeypatch.delenv(key, raising=False)
    with TestClient(app) as test_client:
        test_client.headers.update({"Origin": ORIGIN})
        signup = test_client.post(
            "/api/auth/signup",
            json={"full_name": "Account Owner", "email": "owner@example.com", "password": PASSWORD},
        )
        assert signup.status_code == 201
        test_client.headers.update({"X-CSRF-Token": signup.json()["csrf_token"]})
        yield test_client


def test_signup_creates_isolated_workspace_and_httponly_session(client):
    session = client.get("/api/auth/session").json()
    assert session["user"]["email"] == "owner@example.com"
    assert session["user"]["workspace_id"] > 1
    cookie = client.cookies.get(auth.COOKIE_NAME)
    assert cookie
    set_cookie = client.post(
        "/api/auth/login",
        json={"email": "owner@example.com", "password": PASSWORD},
    ).headers["set-cookie"].lower()
    assert "httponly" in set_cookie
    assert "samesite=lax" in set_cookie
    assert "secure" not in set_cookie


def test_dashboard_api_requires_authentication(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "anonymous.db"))
    with TestClient(app) as anonymous:
        assert anonymous.get("/api/health").status_code == 200
        assert anonymous.get("/api/logs").status_code == 401
        assert anonymous.get("/api/docs").status_code == 401
        assert anonymous.post("/api/run", json={"task": "summarise_resume", "doc": "clean/resume_01_asha.txt"}).status_code == 403


def test_password_and_email_validation_are_backend_enforced(client):
    weak = client.post(
        "/api/auth/signup",
        json={"full_name": "Weak User", "email": "weak@example.com", "password": "short"},
    )
    assert weak.status_code == 422
    assert "short" not in weak.text

    invalid = client.post("/api/auth/login", json={"email": "not-an-email", "password": PASSWORD})
    assert invalid.status_code == 422
    assert PASSWORD not in invalid.text


def test_duplicate_email_and_bad_password_have_safe_responses(client):
    duplicate = client.post(
        "/api/auth/signup",
        json={"full_name": "Duplicate User", "email": "OWNER@example.com", "password": PASSWORD},
    )
    assert duplicate.status_code == 409
    bad_login = client.post(
        "/api/auth/login",
        json={"email": "owner@example.com", "password": "incorrect-password"},
    )
    assert bad_login.status_code == 401
    assert bad_login.json()["detail"] == "Email or password is incorrect."


def test_mutating_requests_require_csrf_and_trusted_origin(client):
    no_csrf = client.post(
        "/api/run",
        json={"task": "summarise_resume", "doc": "clean/resume_01_asha.txt"},
        headers={"X-CSRF-Token": ""},
    )
    assert no_csrf.status_code == 403

    wrong_origin = client.post(
        "/api/auth/login",
        json={"email": "owner@example.com", "password": PASSWORD},
        headers={"Origin": "https://attacker.invalid"},
    )
    assert wrong_origin.status_code == 403


def test_separate_accounts_cannot_read_each_others_audit_data(client, tmp_path, monkeypatch):
    owner_workspace = client.get("/api/auth/session").json()["user"]["workspace_id"]
    run = client.post("/api/run", json={"task": "summarise_resume", "doc": "clean/resume_01_asha.txt"})
    assert run.status_code == 200
    assert len(client.get("/api/logs").json()) == 1

    with TestClient(app) as other:
        other.headers.update({"Origin": ORIGIN})
        created = other.post(
            "/api/auth/signup",
            json={"full_name": "Other Account", "email": "other@example.com", "password": PASSWORD},
        )
        assert created.status_code == 201
        other.headers.update({"X-CSRF-Token": created.json()["csrf_token"]})
        other_workspace = other.get("/api/auth/session").json()["user"]["workspace_id"]
        assert other_workspace != owner_workspace
        assert other.get("/api/logs").json() == []


def test_logout_invalidates_server_session(client):
    response = client.post("/api/auth/logout")
    assert response.status_code == 200
    assert client.get("/api/auth/session").json()["user"] is None
    assert client.get("/api/logs").status_code == 401


def test_password_change_rotates_session_and_revokes_old_password(client):
    changed = client.post(
        "/api/auth/change-password",
        json={"current_password": PASSWORD, "new_password": "a-different-strong-password"},
    )
    assert changed.status_code == 200
    client.headers.update({"X-CSRF-Token": changed.json()["csrf_token"]})
    assert client.get("/api/auth/session").json()["user"] is not None
    client.post("/api/auth/logout")

    bad = client.post("/api/auth/login", json={"email": "owner@example.com", "password": PASSWORD})
    assert bad.status_code == 401
    good = client.post(
        "/api/auth/login",
        json={"email": "owner@example.com", "password": "a-different-strong-password"},
    )
    assert good.status_code == 200


def test_reset_tokens_are_single_use_and_revoke_sessions(client):
    user_id = client.get("/api/auth/session").json()["user"]["id"]
    token, _ = auth.new_reset_token(user_id)
    assert auth.consume_reset_token(token, "reset-password-that-is-strong")
    assert not auth.consume_reset_token(token, "another-reset-password")
    assert client.get("/api/auth/session").json()["user"] is None


def test_password_reset_endpoint_reports_missing_email_configuration(client):
    response = client.post("/api/auth/password-reset", json={"email": "owner@example.com"})
    assert response.status_code == 503
    assert "not configured" in response.json()["detail"].lower()


def test_account_deletion_requires_confirmation_and_keeps_audit_log(client):
    workspace_id = client.get("/api/auth/session").json()["user"]["workspace_id"]
    invalid = client.request(
        "DELETE",
        "/api/auth/account",
        json={"password": PASSWORD, "confirmation": "delete"},
    )
    assert invalid.status_code == 422
    assert client.get("/api/auth/session").json()["user"] is not None

    deleted = client.request(
        "DELETE",
        "/api/auth/account",
        json={"password": PASSWORD, "confirmation": "DELETE"},
    )
    assert deleted.status_code == 200
    assert client.get("/api/auth/session").json()["user"] is None
    with db._connect() as connection:
        assert connection.execute("SELECT 1 FROM users WHERE workspace_id = ?", (workspace_id,)).fetchone() is None
    # append-only: the workspace's audit trail survives and still verifies
    assert db.verify_chain(workspace_id)["ok"] is True
