"""Extract resume text while preserving suspiciously hidden content for the gate."""

from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from zipfile import BadZipFile, ZipFile
from xml.etree import ElementTree

from docx import Document
from docx.oxml.ns import qn
from docx.text.paragraph import Paragraph
from pypdf import PdfReader

MAX_PDF_PAGES = 100
MAX_DOCX_ENTRIES = 500
MAX_DOCX_EXPANDED_BYTES = 25 * 1024 * 1024


@dataclass(frozen=True)
class DocumentAnalysis:
    text: str
    hidden_findings: list[str]
    metadata_text: str = ""


def _clip(value: str, limit: int = 400) -> str:
    value = " ".join(value.split())
    return value if len(value) <= limit else value[: limit - 1] + "…"


def _pdf_analysis(data: bytes) -> DocumentAnalysis:
    reader = PdfReader(BytesIO(data), strict=False)
    if reader.is_encrypted:
        raise ValueError("Encrypted PDFs are not supported.")
    if len(reader.pages) > MAX_PDF_PAGES:
        raise ValueError(f"PDFs may contain at most {MAX_PDF_PAGES} pages.")

    page_text: list[str] = []
    findings: list[str] = []

    for page in reader.pages:
        fill_color: list[float] = [0.0]
        hidden_white: list[str] = []
        hidden_tiny: list[str] = []

        def before_operator(operator, operands, _cm, _tm):
            try:
                if operator == b"g":
                    fill_color[:] = [float(operands[0])]
                elif operator == b"rg":
                    fill_color[:] = [float(value) for value in operands[:3]]
                elif operator == b"k":
                    fill_color[:] = [float(value) for value in operands[:4]]
            except (IndexError, TypeError, ValueError):
                fill_color[:] = []

        def visit_text(text, _cm, _tm, _font_dict, font_size):
            if not text.strip():
                return
            color = fill_color
            is_white = (
                (len(color) == 1 and color[0] >= 0.95)
                or (len(color) == 3 and all(component >= 0.95 for component in color))
                or (len(color) == 4 and all(component <= 0.05 for component in color))
            )
            if is_white:
                hidden_white.append(text)
            try:
                if font_size is not None and float(font_size) <= 4.0:
                    hidden_tiny.append(text)
            except (TypeError, ValueError):
                pass

        page_text.append(
            page.extract_text(
                visitor_text=visit_text,
                visitor_operand_before=before_operator,
            )
            or ""
        )
        if hidden_white:
            findings.append(f"White text: {_clip(' '.join(hidden_white))}")
        if hidden_tiny:
            findings.append(f"Tiny text (4 pt or smaller): {_clip(' '.join(hidden_tiny))}")

    metadata = reader.metadata or {}
    metadata_lines = [
        f"{str(key).lstrip('/')} : {value}"
        for key, value in metadata.items()
        if value is not None and str(value).strip()
    ]
    metadata_text = "\n".join(metadata_lines)
    if metadata_text:
        page_text.append("[PDF metadata]\n" + metadata_text)

    return DocumentAnalysis(
        text="\n".join(part for part in page_text if part),
        hidden_findings=findings,
        metadata_text=metadata_text,
    )


def _docx_analysis(data: bytes) -> DocumentAnalysis:
    try:
        with ZipFile(BytesIO(data)) as archive:
            infos = archive.infolist()
            if (
                len(infos) > MAX_DOCX_ENTRIES
                or sum(item.file_size for item in infos) > MAX_DOCX_EXPANDED_BYTES
            ):
                raise ValueError("The DOCX package is too large to inspect safely.")
            if "[Content_Types].xml" not in archive.namelist() or "word/document.xml" not in archive.namelist():
                raise ValueError("The DOCX package is missing required document parts.")
    except BadZipFile as exc:
        raise ValueError("The DOCX package is invalid or unreadable.") from exc

    try:
        document = Document(BytesIO(data))
    except Exception as exc:
        raise ValueError("The DOCX file is invalid or unreadable.") from exc

    paragraphs: list[str] = []
    findings: list[str] = []
    white_runs: list[str] = []
    tiny_runs: list[str] = []
    vanished_runs: list[str] = []

    for paragraph_element in document.element.body.iter(qn("w:p")):
        paragraph = Paragraph(paragraph_element, document)
        if paragraph.text:
            paragraphs.append(paragraph.text)
        for run in paragraph.runs:
            text = run.text.strip()
            if not text:
                continue
            properties = run._r.rPr
            if properties is None:
                continue
            color = properties.find(qn("w:color"))
            if color is not None and color.get(qn("w:val"), "").upper() in {"FFFFFF", "FFFFFE"}:
                white_runs.append(text)
            size = properties.find(qn("w:sz"))
            if size is not None:
                try:
                    if int(size.get(qn("w:val"), "0")) <= 8:
                        tiny_runs.append(text)
                except ValueError:
                    pass
            if properties.find(qn("w:vanish")) is not None:
                vanished_runs.append(text)

    if white_runs:
        findings.append(f"White text: {_clip(' '.join(white_runs))}")
    if tiny_runs:
        findings.append(f"Tiny text (4 pt or smaller): {_clip(' '.join(tiny_runs))}")
    if vanished_runs:
        findings.append(f"Hidden/vanished text: {_clip(' '.join(vanished_runs))}")

    comment_text = ""
    try:
        with ZipFile(BytesIO(data)) as archive:
            infos = archive.infolist()
            if "word/comments.xml" in archive.namelist():
                root = ElementTree.fromstring(archive.read("word/comments.xml"))
                comment_text = " ".join(
                    element.text or ""
                    for element in root.iter()
                    if element.tag == qn("w:t") and element.text
                )
    except (BadZipFile, ElementTree.ParseError) as exc:
        raise ValueError("The DOCX package is invalid or unreadable.") from exc
    if comment_text.strip():
        findings.append(f"Document comments: {_clip(comment_text)}")
        paragraphs.append("[DOCX comments]\n" + comment_text)

    properties = document.core_properties
    metadata_lines = []
    for key in ("title", "subject", "author", "keywords", "comments", "category", "last_modified_by"):
        value = getattr(properties, key, None)
        if value and str(value).strip():
            metadata_lines.append(f"{key}: {value}")
    metadata_text = "\n".join(metadata_lines)
    if metadata_text:
        paragraphs.append("[DOCX metadata]\n" + metadata_text)

    return DocumentAnalysis(
        text="\n".join(paragraphs),
        hidden_findings=findings,
        metadata_text=metadata_text,
    )


def analyze_document_bytes(data: bytes, suffix: str) -> DocumentAnalysis:
    """Extract text and formatting signals from supported document bytes."""
    suffix = suffix.lower()
    if suffix == ".txt":
        text = data.decode("utf-8", errors="replace")
        if "\x00" in text:
            raise ValueError("The TXT file appears to contain binary data.")
        return DocumentAnalysis(text=text, hidden_findings=[])
    if suffix == ".pdf":
        if b"%PDF-" not in data[:1024]:
            raise ValueError("The file does not contain a PDF header.")
        return _pdf_analysis(data)
    if suffix == ".docx":
        return _docx_analysis(data)
    raise ValueError(f"Unsupported file type: {suffix}")


def analyze_document(path: str | Path) -> DocumentAnalysis:
    """Read a supported document from disk and return text plus hidden-format findings."""
    document = Path(path)
    if not document.is_file():
        raise FileNotFoundError(f"Document not found: {path}")
    return analyze_document_bytes(document.read_bytes(), document.suffix)


def extract_text(path: str) -> str:
    """Return all readable content, including hidden text, comments, and document metadata."""
    return analyze_document(path).text
