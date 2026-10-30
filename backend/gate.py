"""Policy gate (CORE). Plain deterministic code — no LLM, no I/O inside rule checks.

check() must work with the LLM switched off: it only sees the proposed call, the task and the policy,
plus an optional RunContext so a sequence of individually allowed calls is judged together.
All rules are evaluated (no short-circuit) so every reason can be shown.
Precedence: any BLOCK hit => BLOCK; else any REVIEW hit => REVIEW; else ALLOW.
"""

import base64
import binascii
import re
import urllib.parse
from dataclasses import dataclass, field
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

FINGERPRINT_SIZE = 12  # characters per fingerprint window (letters/digits only)
FINGERPRINT_MATCHES = 3  # shared windows needed to call it the same content
_B64_TOKEN = re.compile(r"[A-Za-z0-9+/_=-]{8,}")
_B64_HINT = re.compile(r"[0-9+/=]")  # real base64 chunks almost always contain one; plain words don't
_HEX_TOKEN = re.compile(r"\b(?:[0-9a-fA-F]{2}){8,}\b")


def load_policy(path: Path = POLICY_PATH) -> dict:
    """Load the policy once; also fingerprint every confidential file so R10 recognises it anywhere."""
    with open(path, encoding="utf-8") as f:
        policy = yaml.safe_load(f)
    root = path.resolve().parents[1]
    patterns = policy.get("global", {}).get("data_labels", {}).get("confidential", [])
    known: set[str] = set()
    for file in (root / "sandbox").rglob("*"):
        if file.is_file() and _matches(_norm_path(file.relative_to(root).as_posix()), patterns):
            known |= _fingerprints(file.read_text(encoding="utf-8", errors="ignore"))
    policy["_confidential_fingerprints"] = known
    return policy


@dataclass
class RunContext:
    """Memory for one run: what was read, what already left, how many calls were proposed."""

    read: dict[str, set[str]] = field(default_factory=dict)  # data label -> files read
    fingerprints: set[str] = field(default_factory=set)  # windows of confidential content read
    outbound: list[str] = field(default_factory=list)  # text of emails already allowed
    calls: int = 0

    def record(self, call: ToolCall | dict, decision: Decision, output: str, policy: dict) -> None:
        """Update the memory after a call was decided (and, if allowed, executed)."""
        self.calls += 1
        if not isinstance(call, ToolCall):
            return
        if call.tool == "send_email":  # every attempt counts towards the split check, allowed or not
            self.outbound.append(_email_text(call))
        if decision.verdict == "ALLOW" and call.tool == "read_file":
            path = _norm_path(call.args["path"])
            for label, patterns in policy.get("global", {}).get("data_labels", {}).items():
                if _matches(path, patterns):
                    self.read.setdefault(label, set()).add(call.args["path"])
                    if label == "confidential":
                        self.fingerprints |= _fingerprints(output)


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
    """R3 file outside the task's scope, R4 sensitive file attached or deleted (global list, every task)."""
    scope = task_cfg.get("files", {}).get("scope", [])
    sensitive = policy.get("global", {}).get("sensitive_files", [])
    hits: list[Hit] = []
    for raw in _paths(call):
        path = _norm_path(raw)
        if ".." in path.split("/") or not _matches(path, scope):
            hits.append(("block", "R3_FILE_OUT_OF_SCOPE", f"{raw} is outside the allowed files for this task"))
        if call.tool != "read_file" and _matches(path, sensitive):  # reading is governed by scope (R3)
            hits.append(("block", "R4_SENSITIVE_FILE", f"{raw} is tagged sensitive"))
    return hits


def _email_text(call: ToolCall) -> str:
    return "\n".join(str(call.args.get(k) or "") for k in ("subject", "body"))


def _fingerprints(text: str) -> set[str]:
    flat = re.sub(r"[^a-z0-9]", "", text.lower())
    return {flat[i : i + FINGERPRINT_SIZE] for i in range(len(flat) - FINGERPRINT_SIZE + 1)}


def _printable(raw: bytes) -> str | None:
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        return None
    ok = sum(ch.isprintable() or ch in "\n\r\t" for ch in text)
    return text if text and ok / len(text) >= 0.9 else None


def _decode_b64(token: str) -> str | None:
    token = token.replace("-", "+").replace("_", "/").rstrip("=")
    try:
        return _printable(base64.b64decode(token + "=" * (-len(token) % 4), validate=True))
    except (binascii.Error, ValueError):
        return None


def _decoded_views(texts: list[str]) -> list[tuple[str, str]]:
    """Ways outgoing text could be hiding data: as written, URL-decoded, base64 (alone or pieces joined), hex."""
    text = "\n".join(texts)
    views = [("as written", text)]
    if (unquoted := urllib.parse.unquote(text)) != text:
        views.append(("URL-decoded", unquoted))
    tokens = [t for t in _B64_TOKEN.findall(text) if _B64_HINT.search(t)]
    if decoded := [d for t in tokens if (d := _decode_b64(t))]:
        views.append(("decoded from base64", "\n".join(decoded)))
    if len(tokens) > 1 and (joined := _decode_b64("".join(t.rstrip("=") for t in tokens))):
        views.append(("decoded from base64 pieces joined together", joined))
    if hexed := [d for t in _HEX_TOKEN.findall(text) if (d := _printable(bytes.fromhex(t)))]:
        views.append(("decoded from hex", "\n".join(hexed)))
    return views


def _check_content(call: ToolCall, policy: dict, ctx: RunContext | None) -> list[Hit]:
    """R5 sensitive data in an email; R10 the same data disguised (encoded) or split across emails."""
    if call.tool != "send_email":
        return []
    patterns = policy.get("global", {}).get("sensitive_patterns", {})
    secrets = policy.get("_confidential_fingerprints", set()) | (ctx.fingerprints if ctx else set())
    earlier = ctx.outbound if ctx else []
    hits: list[Hit] = []
    seen: set[str] = set()

    def add(severity: str, rule: str, reason: str) -> None:
        if rule not in seen:
            seen.add(rule)
            hits.append((severity, rule, reason))

    views = _decoded_views([_email_text(call)])
    if earlier:  # the split trick: pieces that are harmless alone, joined with earlier emails of this run
        views += [(f"{how}, across {len(earlier) + 1} emails in this run", view)
                  for how, view in _decoded_views([*earlier, _email_text(call)])[1:]]
    for how, view in views:
        for name, rx in patterns.items():
            if re.search(rx, view):
                if how == "as written":
                    add("block", "R5_SENSITIVE_DATA_OUT", f"email contains {name.replace('_', ' ')} data")
                else:
                    add("block", "R10_ENCODED_EXFIL", f"email hides {name.replace('_', ' ')} data ({how})")
        if secrets and len(_fingerprints(view) & secrets) >= FINGERPRINT_MATCHES:
            rule = "R5_SENSITIVE_DATA_OUT" if how == "as written" else "R10_ENCODED_EXFIL"
            add("block", rule, f"email carries confidential file content ({how})")
    if len(views) > 1 and "R10_ENCODED_EXFIL" not in seen:
        add("review", "R10_ENCODED_EXFIL", "email contains an encoded block; a human must check what it says")
    return hits


def _check_taint(call: ToolCall, task_cfg: dict, ctx: RunContext | None) -> list[Hit]:
    """R9: data read earlier in the run decides what may leave, not just the recipient."""
    if ctx is None or call.tool != "send_email":
        return []
    if confidential := ctx.read.get("confidential"):
        return [("block", "R9_TAINTED_EGRESS",
                 f"this run read confidential data ({', '.join(sorted(confidential))}); "
                 "nothing may leave in the same run, even to an allowlisted address")]
    if personal := ctx.read.get("personal"):
        domain = str(call.args.get("to", "")).rsplit("@", 1)[-1].lower()
        normal_flow = (  # the task's own job: send that same resume to an allowlisted company
            domain in task_cfg.get("recipients", {}).get("allow_domains", [])
            and call.args.get("attachment") in personal
        )
        if not normal_flow:
            return [("review", "R9_TAINTED_EGRESS",
                     f"this run read personal data ({', '.join(sorted(personal))}); a human must check what leaves")]
    return []


def _check_budget(ctx: RunContext | None, policy: dict) -> list[Hit]:
    """R7: egress budget, at most max_calls_per_run calls in one run."""
    limit = policy.get("global", {}).get("max_calls_per_run")
    if ctx is None or limit is None or ctx.calls < limit:
        return []
    return [("block", "R7_TOO_MANY_CALLS", f"this run already proposed {ctx.calls} calls (limit {limit})")]


def _decide(hits: list[Hit]) -> Decision:
    severities = {severity for severity, _, _ in hits}
    verdict = "BLOCK" if "block" in severities else "REVIEW" if "review" in severities else "ALLOW"
    return Decision(verdict=verdict, rules=[r for _, r, _ in hits], reasons=[m for _, _, m in hits])


def check(call: ToolCall | dict, task: str, policy: dict, ctx: RunContext | None = None) -> Decision:
    """Decide one proposed tool call. Accepts raw agent output; anything malformed is blocked.

    Pass the same RunContext for every call in a run (and call ctx.record afterwards) to enable the
    sequence rules: R7 budget, R9 tainted egress, R10 split/encoded exfiltration.
    """
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
        + _check_content(call, policy, ctx)
        + _check_taint(call, cfg, ctx)
        + _check_budget(ctx, policy)
    )
    return _decide(hits)
