"""Text extraction from .pdf / .txt. Keeps hidden text (that is the attack surface)."""

from pathlib import Path

from pypdf import PdfReader


def extract_text(path: str) -> str:
    """Return all readable text from a .txt or .pdf, including white text and PDF metadata."""
    p = Path(path)
    if not p.is_file():
        raise FileNotFoundError(f"Document not found: {path}")

    suffix = p.suffix.lower()
    if suffix == ".txt":
        return p.read_text(encoding="utf-8", errors="replace")

    if suffix == ".pdf":
        reader = PdfReader(str(p))
        parts = [page.extract_text() or "" for page in reader.pages]
        # Metadata can also carry hidden instructions (title, subject, keywords).
        meta = reader.metadata or {}
        meta_text = " ".join(str(v) for v in meta.values() if v)
        chunks = [c for c in parts if c]
        if meta_text:
            chunks.append(meta_text)
        return "\n".join(chunks)

    raise ValueError(f"Unsupported file type: {suffix}")
