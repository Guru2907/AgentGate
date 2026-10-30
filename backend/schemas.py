"""Shared contract between agent, gate, API and frontend. Change only additively.

Mirrored in frontend/src/api.ts — keep both in sync.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

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


class RunResult(_Strict):
    """Same index = same call. A call that did not run has output "(not executed)".

    proposed holds the raw dict when the agent's output did not fit ToolCall (blocked as R6).
    """

    proposed: list[ToolCall | dict]
    decisions: list[Decision]
    outputs: list[str]


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
