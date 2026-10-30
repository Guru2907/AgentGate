"""Sandbox tool adapters. They have no real-world side effects.

Must only be reached via gate.check() -> ALLOW -> tools.execute(). Never call from agent code.
"""

from pathlib import Path

from backend.schemas import ToolCall

ROOT = Path(__file__).resolve().parents[1]
SANDBOX = ROOT / "sandbox"
DATA = ROOT / "data"


def _sandbox_file(path: str) -> Path:
    """Resolve a path and refuse anything outside sandbox/ (defence in depth behind R3)."""
    target = (ROOT / path).resolve()
    if not target.is_relative_to(SANDBOX):
        raise PermissionError(f"{path} is outside the sandbox")
    return target


def _summarise(document_id: str) -> str:
    doc = (DATA / document_id).resolve()
    if not doc.is_relative_to(DATA) or not doc.is_file():
        return f"Summary unavailable: {document_id} not found"
    lines = [ln.strip() for ln in doc.read_text(encoding="utf-8", errors="replace").splitlines() if ln.strip()]
    return "Summary: " + " | ".join(lines[:3])[:300]


def _send_email(to: str, subject: str, body: str, attachment: str | None = None) -> str:
    extra = f" with attachment {attachment}" if attachment else ""
    return f"Sandbox email record for {to}, subject {subject!r}{extra} (not sent)"


def _read_file(path: str) -> str:
    target = _sandbox_file(path)
    if not target.is_file():
        return f"File not found: {path}"
    return target.read_text(encoding="utf-8", errors="replace")[:500]


def _delete_file(path: str) -> str:
    # Globally denied by policy (R8); kept as a harmless adapter so execute() covers every tool.
    return f"Sandbox delete record for {path} (nothing deleted)"


_TOOLS = {
    "summarise": _summarise,
    "send_email": _send_email,
    "read_file": _read_file,
    "delete_file": _delete_file,
}


def execute(call: ToolCall) -> str:
    """Run a sandbox adapter for an ALLOWED call; no external service is contacted."""
    return _TOOLS[call.tool](**call.args)
