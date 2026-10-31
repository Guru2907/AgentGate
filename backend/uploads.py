"""Workspace-scoped storage and validation for uploaded resume documents."""

import re
import uuid
from pathlib import Path

from backend import db
from backend.extract import analyze_document_bytes

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
ALLOWED_SUFFIXES = {".txt", ".pdf", ".docx"}


def _safe_filename(filename: str) -> tuple[str, str]:
    name = re.split(r"[/\\]", filename or "")[-1]
    name = "".join(char for char in name if char.isprintable() and char not in '<>:"|?*')
    name = name.strip(" .")[:128]
    suffix = Path(name).suffix.lower()
    if not name or suffix not in ALLOWED_SUFFIXES:
        raise ValueError("Upload a PDF, DOCX, or TXT file.")
    return name, suffix


def _validate_signature(data: bytes, suffix: str) -> None:
    if suffix == ".pdf" and not data.startswith(b"%PDF-"):
        raise ValueError("The file content does not match a PDF.")
    if suffix == ".docx" and not data.startswith(b"PK"):
        raise ValueError("The file content does not match a DOCX.")


def save_upload(filename: str, content: bytes, workspace_id: int) -> dict:
    """Validate, analyze, and persist a bounded upload under an opaque workspace-local name."""
    if not content:
        raise ValueError("The uploaded file is empty.")
    if len(content) > MAX_UPLOAD_BYTES:
        raise ValueError(f"Files must be {MAX_UPLOAD_BYTES // (1024 * 1024)} MB or smaller.")

    display_name, suffix = _safe_filename(filename)
    _validate_signature(content, suffix)
    analysis = analyze_document_bytes(content, suffix)

    document_id = f"{uuid.uuid4().hex}{suffix}"
    workspace_dir = (DATA / "uploads" / str(workspace_id)).resolve()
    workspace_dir.mkdir(parents=True, exist_ok=True)
    stored_path = (workspace_dir / document_id).resolve()
    if not stored_path.is_relative_to(workspace_dir):
        raise ValueError("Invalid upload path.")
    stored_path.write_bytes(content)

    try:
        db.add_document(
            document_id=document_id,
            workspace_id=workspace_id,
            filename=display_name,
            stored_path=stored_path.relative_to(ROOT).as_posix(),
            size_bytes=len(content),
        )
    except Exception:
        stored_path.unlink(missing_ok=True)
        raise

    return {
        "name": display_name,
        "type": "uploaded",
        "path": f"uploads/{document_id}",
        "size_bytes": len(content),
        "hidden_findings": analysis.hidden_findings,
    }


def list_uploads(workspace_id: int) -> list[dict]:
    """Return upload metadata only for the caller's workspace."""
    return [
        {
            "name": row["filename"],
            "type": "uploaded",
            "path": f"uploads/{row['id']}",
            "size_bytes": row["size_bytes"],
        }
        for row in db.list_documents(workspace_id)
    ]


def resolve_upload(doc: str, workspace_id: int) -> Path:
    """Resolve an opaque document path only when it belongs to the active workspace."""
    if not doc.startswith("uploads/"):
        raise ValueError("Not an uploaded document path.")
    document_id = doc.removeprefix("uploads/")
    if not re.fullmatch(r"[0-9a-f]{32}\.(?:txt|pdf|docx)", document_id):
        raise ValueError("Invalid upload identifier.")
    row = db.get_document(document_id, workspace_id)
    if row is None:
        raise FileNotFoundError("Uploaded document not found.")

    workspace_dir = (DATA / "uploads" / str(workspace_id)).resolve()
    path = (ROOT / row["stored_path"]).resolve()
    if not path.is_relative_to(workspace_dir) or not path.is_file():
        raise FileNotFoundError("Uploaded document not found.")
    return path
