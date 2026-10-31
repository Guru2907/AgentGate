"""Sandbox tool adapters. They have no real-world side effects.

Must only be reached via gate.check() -> ALLOW -> tools.execute(). Never call from agent code.
"""

from contextvars import ContextVar
from pathlib import Path

from backend.schemas import ToolCall

ROOT = Path(__file__).resolve().parents[1]
SANDBOX = ROOT / "sandbox"
DATA = ROOT / "data"

# Workspace of the request being processed, so an upload is only ever attached for its owner.
CURRENT_WORKSPACE: ContextVar[int | None] = ContextVar("agentgate_workspace", default=None)


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
    from backend.extract import extract_text
    from backend.screening import screen_resume

    report = screen_resume(extract_text(doc))
    return f"Summary: {report.summary}"


def _attachment_file(attachment: str | None) -> Path | None:
    """The real file for an attachment the gate allowed: a sandbox resume, or an upload of this workspace."""
    if not attachment:
        return None
    if attachment.startswith("uploads/"):
        workspace = CURRENT_WORKSPACE.get()
        if workspace is None:
            return None
        from backend import uploads

        try:
            return uploads.resolve_upload(attachment, workspace)
        except (ValueError, FileNotFoundError):
            return None
    try:
        target = _sandbox_file(attachment)
    except PermissionError:
        return None
    return target if target.is_file() else None


def _send_email(to: str, subject: str, body: str, attachment: str | None = None) -> str:
    """Deliver to the local test inbox (Mailpit); if it isn't running, keep the outbox record only."""
    from backend import mailer

    extra = f" with attachment {attachment}" if attachment else ""
    try:
        mailer.send(to, subject, body, _attachment_file(attachment))
    except (OSError, PermissionError):  # Mailpit not running / non-local host refused
        return f"Sandbox email record for {to}, subject {subject!r}{extra} (not sent)"
    return f"Delivered to the local test inbox for {to}, subject {subject!r}{extra} (nothing left this machine)"


def _read_file(path: str) -> str:
    target = _sandbox_file(path)
    if not target.is_file():
        return f"File not found: {path}"
    # Spreadsheets are binary; return a short mock extract so multi-step demos can continue.
    if target.suffix.lower() in {".xlsx", ".xls"}:
        return (
            f"[spreadsheet {path}] mock extract: 12 rows with columns "
            "name, role, contact (synthetic). Do not email this outside the college."
        )
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


def execute(call: ToolCall, *, summary_override: str | None = None) -> str:
    """Run a sandbox adapter for an ALLOWED call; no external service is contacted."""
    if call.tool == "summarise" and summary_override is not None:
        return summary_override
    return _TOOLS[call.tool](**call.args)
