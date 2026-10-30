"""Shared contract between agent, gate, API and frontend. Change only additively.

Mirrored in frontend/src/api.ts — keep both in sync.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict

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
    """Same index = same call. A call that did not run has output "(not executed)"."""

    proposed: list[ToolCall]
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
