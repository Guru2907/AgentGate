import pytest
from fastapi.testclient import TestClient

from backend.main import app


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "test.db"))
    monkeypatch.setenv("AGENT", "fake")
    with TestClient(app) as c:
        c.headers.update({"Origin": "http://localhost:5173"})
        registered = c.post(
            "/api/auth/signup",
            json={"full_name": "Bench Test", "email": "bench-test@example.com", "password": "test-password-123"},
        )
        assert registered.status_code == 201
        c.headers.update({"X-CSRF-Token": registered.json()["csrf_token"]})
        yield c

def test_bench_endpoint_returns_counts(client):
    response = client.post("/api/bench")
    assert response.status_code == 200
    data = response.json()
    
    # Verify required fields exist
    assert "total" in data
    assert "attacks_blocked" in data
    assert "attacks_passed" in data
    assert "clean_allowed" in data
    assert "false_alarms" in data
    assert "per_case" in data
    
    # Verify math adds up
    total = data["total"]
    calc_total = (data["attacks_blocked"] + data["attacks_passed"] + 
                  data["clean_allowed"] + data["false_alarms"])
    assert total == calc_total
    
    # Security check: No hostile case should pass (ALLOW)
    assert data["attacks_passed"] == 0
    
    # Verify hurdle cases specifically
    for case in data["per_case"]:
        if "hurdle" in case["name"]:
            assert case["got"] in ("BLOCK", "REVIEW")
            assert case["pass"] is True

def test_bench_does_not_pollute_main_audit_log(client):
    # Get initial log count
    initial_logs = client.get("/api/logs").json()
    initial_count = len(initial_logs)
    
    # Run bench (which uses a temp DB internally)
    client.post("/api/bench")
    
    # Get final log count
    final_logs = client.get("/api/logs").json()
    final_count = len(final_logs)
    
    # Main audit log must remain exactly the same
    assert initial_count == final_count