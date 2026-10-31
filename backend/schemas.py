"""Shared contract between agent, gate, API and frontend. Change only additively.

Mirrored in frontend/src/api.ts — keep both in sync.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

ToolName = Literal["summarise", "send_email", "read_file", "delete_file"]
Verdict = Literal["ALLOW", "BLOCK", "REVIEW"]
Source = Literal["run", "inject", "review", "timeout"]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ToolCall(_Strict):
    """A tool call proposed by the agent. It is only a proposal until the gate allows it."""

    tool: ToolName
    args: dict


class Decision(_Strict):
    """Gate verdict for one call. rules[i] and reasons[i] describe the same hit."""

    verdict: Verdict
    rules: list[str]  # e.g. ["R1_TOOL_NOT_ALLOWED"]
    reasons: list[str]  # human-readable


class RunRequest(_Strict):
    task: str  # "summarise_resume" | "email_company"
    doc: str  # path under data/, e.g. "hostile/resume_h01_hidden_email.txt"


class Egress(_Strict):
    """What a send_email would take out: recipient, attachment and the sensitive data spotted."""

    recipient: str | None = None
    attachment: str | None = None
    detected: list[str] = []


class CallExtras(_Strict):
    """Per-call insight for the UI: hidden instructions found in the document, egress preview."""

    hidden_text: str | None = None
    egress: Egress | None = None


class RunResult(_Strict):
    """Same index = same call. A call that did not run has output "(not executed)".

    proposed holds the raw dict when the agent's output did not fit ToolCall (blocked as R6).
    """

    proposed: list[ToolCall | dict]
    decisions: list[Decision]
    outputs: list[str]
    extras: list[CallExtras] = []  # same index as proposed; optional, so older clients are unaffected


class LogEntry(_Strict):
    """One audit-log row, as returned by GET /api/logs."""

    id: int
    ts: str
    task: str
    doc: str
    tool: str
    args: dict
    verdict: Verdict
    rules: list[str]
    reasons: list[str]
    executed: bool
    source: Source = "run"
    prev_hash: str | None = None  # hash chain: editing any past row breaks it (GET /api/logs/verify)
    hash: str | None = None


class InjectRequest(_Strict):
    """Raw tool calls sent straight to the gate (no LLM), judged together as one run."""

    task: str
    calls: list = Field(min_length=1, max_length=10)


class ReviewDecision(_Strict):
    """Approve/deny by id only. call_hash = what the reviewer saw; a different call can't be approved."""

    action: Literal["approve", "deny"]
    call_hash: str | None = None


class RedTeamRequest(_Strict):
    """Optional API for issue #10. Additive — existing clients ignore this model."""

    n: int = Field(default=10, ge=1, le=20)
    score_only: bool = False
    templates: bool = False  # offline synthetic attacks (no Groq)


class SignupRequest(_Strict):
    full_name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)

    @field_validator("full_name")
    @classmethod
    def clean_full_name(cls, value: str) -> str:
        value = " ".join(value.split())
        if len(value) < 2:
            raise ValueError("Enter your full name.")
        return value

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().casefold()


class LoginRequest(_Strict):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().casefold()


class ProfileUpdateRequest(_Strict):
    full_name: str = Field(min_length=2, max_length=80)

    @field_validator("full_name")
    @classmethod
    def clean_full_name(cls, value: str) -> str:
        value = " ".join(value.split())
        if len(value) < 2:
            raise ValueError("Enter your full name.")
        return value


class ChangePasswordRequest(_Strict):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=12, max_length=128)


class PasswordResetRequest(_Strict):
    email: EmailStr

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().casefold()


class PasswordResetConfirmRequest(_Strict):
    token: str = Field(min_length=32, max_length=128)
    new_password: str = Field(min_length=12, max_length=128)


class DeleteAccountRequest(_Strict):
    password: str = Field(min_length=1, max_length=128)
    confirmation: Literal["DELETE"]


# Response shapes for POST /api/bench and POST /api/redteam (returned as plain dicts today).
# Mirrored in frontend/src/types.ts as BenchResult / RedTeamResult — keep snake_case in sync.
#
# BenchResult: { total, attacks_blocked, attacks_passed, clean_allowed, false_alarms,
#                per_case: [{ name, kind, expected, got, rules, pass, trick? }] }
# RedTeamResult: BenchResult + { summary_line, rules_hit, generated?, templates?, cases_path? }
# UI may derive attacksTotal = attacks_blocked + attacks_passed,
#               cleanTotal = clean_allowed + false_alarms; API does not send those or lastRun.
