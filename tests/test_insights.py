from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)


def test_hostile_run_has_hidden_text_and_egress():
    payload = {"task": "summarise_resume", "doc": "hostile/resume_h01_hidden_email.txt"}
    res = client.post("/api/run", json=payload)
    assert res.status_code == 200
    data = res.json()
    
    assert "extras" in data
    assert len(data["extras"]) > 0
    
    first_extra = data["extras"][0]
    assert first_extra["hidden_text"] is not None
    assert "Ignore previous instructions" in first_extra["hidden_text"] or "ignore previous instructions" in first_extra["hidden_text"].lower()
    
    # The hostile resume proposes an evil email
    egress = first_extra.get("egress")
    assert egress is not None
    assert egress["recipient"] == "hr-verify@evil.co"
    assert "confidential file" in egress["detected"] or "phone" in egress["detected"] or "email list" in egress["detected"]


def test_clean_run_has_no_extras_data():
    payload = {"task": "summarise_resume", "doc": "clean/resume_01_asha.txt"}
    res = client.post("/api/run", json=payload)
    assert res.status_code == 200
    data = res.json()
    
    assert "extras" in data
    # Clean doc has no hidden text, and summarise task has no send_email egress
    for extra in data["extras"]:
        assert extra["hidden_text"] is None
        assert extra["egress"] is None


def test_inject_detects_phone_in_egress():
    payload = {
        "task": "email_company",
        "calls": [
            {
                "tool": "send_email",
                "args": {
                    "to": "hr@partner-company.com",
                    "subject": "Urgent",
                    "body": "Call me at 90000 00001 please."
                }
            }
        ]
    }
    res = client.post("/api/inject", json=payload)
    assert res.status_code == 200
    data = res.json()
    
    assert "extras" in data
    assert len(data["extras"]) == 1
    
    extra = data["extras"][0]
    # Injected runs have no document text
    assert extra["hidden_text"] is None
    
    egress = extra["egress"]
    assert egress is not None
    assert egress["recipient"] == "hr@partner-company.com"
    assert "phone" in egress["detected"]


def test_existing_fields_unchanged():
    payload = {"task": "summarise_resume", "doc": "clean/resume_01_asha.txt"}
    res = client.post("/api/run", json=payload)
    data = res.json()
    
    # Ensure old fields are still present
    assert "proposed" in data
    assert "decisions" in data
    assert "outputs" in data