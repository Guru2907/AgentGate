"""Policy gate (CORE). Plain deterministic code — no LLM, no I/O inside rule checks.

check() must work with the LLM switched off: it only sees the proposed call, the task and the policy.
All rules are evaluated (no short-circuit) so every reason can be shown.
Precedence: any BLOCK hit => BLOCK; else any REVIEW hit => REVIEW; else ALLOW.
"""

from fnmatch import fnmatchcase
from pathlib import Path

import yaml
from pydantic import ValidationError

from backend.schemas import Decision, ToolCall

POLICY_PATH = Path(__file__).parent / "policy.yaml"

# R6: exact argument names each tool accepts (must match the agent's tool definitions).
REQUIRED_ARGS = {
    "summarise": {"document_id"},
    "send_email": {"to", "subject", "body"},
    "read_file": {"path"},
    "delete_file": {"path"},
}
OPTIONAL_ARGS = {"send_email": {"attachment"}}

Hit = tuple[str, str, str]  # (severity "block" | "review", rule_id, reason)


def load_policy(path: Path = POLICY_PATH) -> dict:
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def _norm_path(path: str) -> str:
    return path.replace("\\", "/").removeprefix("./").strip().lower()


def _matches(path: str, patterns: list[str]) -> bool:
    return any(fnmatchcase(path, p.lower()) for p in patterns)


def _check_args(call: ToolCall) -> list[Hit]:
    """R6: required arguments present, no unknown arguments, all values are strings."""
    args = set(call.args)
    required = REQUIRED_ARGS[call.tool]
    allowed = required | OPTIONAL_ARGS.get(call.tool, set())
    hits: list[Hit] = []
    if missing := required - args:
        hits.append(("block", "R6_MALFORMED_CALL", f"{call.tool} is missing {', '.join(sorted(missing))}"))
    if unknown := args - allowed:
        hits.append(("block", "R6_MALFORMED_CALL", f"{call.tool} has unknown argument {', '.join(sorted(unknown))}"))
    if any(not isinstance(v, str) for v in call.args.values() if v is not None):
        hits.append(("block", "R6_MALFORMED_CALL", f"{call.tool} arguments must be text"))
    return hits


def _check_tool(call: ToolCall, task: str, task_cfg: dict | None, policy: dict) -> list[Hit]:
    """R8 global deny, R1 tool not allowed for the task (intent-action mismatch)."""
    hits: list[Hit] = []
    if task_cfg is None:
        hits.append(("block", "R1_TOOL_NOT_ALLOWED", f"unknown task {task!r} is denied by default"))
    elif call.tool not in task_cfg.get("allowed_tools", []):
        hits.append(("block", "R1_TOOL_NOT_ALLOWED", f"{call.tool} is not allowed for task {task}"))
    if call.tool in policy.get("global", {}).get("deny_tools", []):
        hits.append(("block", "R8_GLOBAL_DENY", f"{call.tool} is denied for every task"))
    return hits


def _check_recipient(call: ToolCall, task_cfg: dict) -> list[Hit]:
    """R2: recipient domain must be allowlisted; review-listed domains need a human."""
    if call.tool != "send_email" or not isinstance(call.args.get("to"), str):
        return []
    to = call.args["to"].strip().lower()
    if to.count("@") != 1 or not to.split("@")[1]:
        return [("block", "R2_RECIPIENT_NOT_ALLOWED", f"{to!r} is not a valid email address")]
    domain = to.split("@")[1]
    recipients = task_cfg.get("recipients", {})
    if domain in recipients.get("allow_domains", []):
        return []
    if domain in recipients.get("review_domains", []):
        return [("review", "R2_RECIPIENT_NOT_ALLOWED", f"{domain} is allowed only after human review")]
    return [("block", "R2_RECIPIENT_NOT_ALLOWED", f"{domain} is not an allowlisted domain")]


def _paths(call: ToolCall) -> list[str]:
    keys = {"read_file": "path", "delete_file": "path", "send_email": "attachment"}
    value = call.args.get(keys.get(call.tool, ""))
    return [value] if isinstance(value, str) and value.strip() else []


def _check_files(call: ToolCall, task_cfg: dict, policy: dict) -> list[Hit]:
    """R3 file outside the task's scope, R4 sensitive file (global list, every task)."""
    scope = task_cfg.get("files", {}).get("scope", [])
    sensitive = policy.get("global", {}).get("sensitive_files", [])
    hits: list[Hit] = []
    for raw in _paths(call):
        path = _norm_path(raw)
        if ".." in path.split("/") or not _matches(path, scope):
            hits.append(("block", "R3_FILE_OUT_OF_SCOPE", f"{raw} is outside the allowed files for this task"))
        if _matches(path, sensitive):
            hits.append(("block", "R4_SENSITIVE_FILE", f"{raw} is tagged sensitive"))
    return hits


def _decide(hits: list[Hit]) -> Decision:
    severities = {severity for severity, _, _ in hits}
    verdict = "BLOCK" if "block" in severities else "REVIEW" if "review" in severities else "ALLOW"
    return Decision(verdict=verdict, rules=[r for _, r, _ in hits], reasons=[m for _, _, m in hits])


def check(call: ToolCall | dict, task: str, policy: dict) -> Decision:
    """Decide one proposed tool call. Accepts raw agent output; anything malformed is blocked."""
    if not isinstance(call, ToolCall):
        try:
            call = ToolCall.model_validate(call)
        except ValidationError:
            return _decide([("block", "R6_MALFORMED_CALL", "proposed call does not match the tool call schema")])

    task_cfg = policy.get("tasks", {}).get(task)
    cfg = task_cfg or {}  # default deny: an unknown task has no recipients or files
    hits = (
        _check_args(call)
        + _check_tool(call, task, task_cfg, policy)
        + _check_recipient(call, cfg)
        + _check_files(call, cfg, policy)
    )
    return _decide(hits)
