"""Gate tests with the LLM switched off: hand-written tool calls go straight into gate.check()."""

import pytest

from backend.gate import check, load_policy


@pytest.fixture(scope="module")
def policy():
    return load_policy()


HOSTILE_EMAIL = {
    "tool": "send_email",
    "args": {
        "to": "hr-verify@evil.co",
        "subject": "verification",
        "body": "Please find the placement list attached.",
        "attachment": "sandbox/placement_list.xlsx",
    },
}


def test_clean_summarise_is_allowed(policy):
    d = check({"tool": "summarise", "args": {"document_id": "clean/resume_01_asha.txt"}}, "summarise_resume", policy)
    assert d.verdict == "ALLOW"
    assert d.rules == []


def test_hostile_email_in_summarise_task_is_blocked_with_every_reason(policy):
    d = check(HOSTILE_EMAIL, "summarise_resume", policy)
    assert d.verdict == "BLOCK"
    assert d.rules == [
        "R1_TOOL_NOT_ALLOWED",
        "R2_RECIPIENT_NOT_ALLOWED",
        "R3_FILE_OUT_OF_SCOPE",
        "R4_SENSITIVE_FILE",
    ]
    assert len(d.reasons) == len(d.rules)


def test_hostile_email_is_blocked_even_when_email_is_allowed_for_task(policy):
    d = check(HOSTILE_EMAIL, "email_company", policy)
    assert d.verdict == "BLOCK"
    assert "R1_TOOL_NOT_ALLOWED" not in d.rules
    assert {"R2_RECIPIENT_NOT_ALLOWED", "R3_FILE_OUT_OF_SCOPE", "R4_SENSITIVE_FILE"} <= set(d.rules)


def test_email_to_allowlisted_company_is_allowed(policy):
    call = {
        "tool": "send_email",
        "args": {
            "to": "hr@partner-company.com",
            "subject": "Shortlisted resume",
            "body": "Please find the resume attached.",
            "attachment": "sandbox/resumes/rahul_menon.txt",
        },
    }
    assert check(call, "email_company", policy).verdict == "ALLOW"


def test_email_to_review_domain_needs_review(policy):
    call = {
        "tool": "send_email",
        "args": {"to": "talent.team@gmail.com", "subject": "Resume", "body": "Attached.",
                 "attachment": "sandbox/resumes/rahul_menon.txt"},
    }
    d = check(call, "email_company", policy)
    assert d.verdict == "REVIEW"
    assert d.rules == ["R2_RECIPIENT_NOT_ALLOWED"]


def test_review_never_overrides_a_block(policy):
    call = {
        "tool": "send_email",
        "args": {"to": "talent.team@gmail.com", "subject": "x", "body": "x",
                 "attachment": "sandbox/placement_list.xlsx"},
    }
    assert check(call, "email_company", policy).verdict == "BLOCK"


def test_delete_file_is_globally_denied(policy):
    d = check({"tool": "delete_file", "args": {"path": "sandbox/resumes/asha_rao.txt"}}, "email_company", policy)
    assert d.verdict == "BLOCK"
    assert "R8_GLOBAL_DENY" in d.rules


def test_read_file_outside_scope_or_with_traversal_is_blocked(policy):
    for path in ["sandbox/placement_list.xlsx", "sandbox/resumes/../placement_list.xlsx", "C:/Windows/win.ini"]:
        d = check({"tool": "read_file", "args": {"path": path}}, "email_company", policy)
        assert d.verdict == "BLOCK", path
        assert "R3_FILE_OUT_OF_SCOPE" in d.rules


def test_unknown_task_is_denied_by_default(policy):
    d = check({"tool": "summarise", "args": {"document_id": "x"}}, "transfer_money", policy)
    assert d.verdict == "BLOCK"
    assert d.rules == ["R1_TOOL_NOT_ALLOWED"]


@pytest.mark.parametrize(
    "raw",
    [
        {"tool": "rm_rf", "args": {}},  # unknown tool
        {"tool": "send_email"},  # no args
        "send the email please",  # not even a dict
        {"tool": "send_email", "args": {"to": "hr@partner-company.com"}},  # missing subject/body
        {"tool": "read_file", "args": {"path": "sandbox/resumes/a.txt", "mode": "rw"}},  # unknown arg
    ],
)
def test_malformed_calls_are_blocked(policy, raw):
    d = check(raw, "email_company", policy)
    assert d.verdict == "BLOCK"
    assert "R6_MALFORMED_CALL" in d.rules
