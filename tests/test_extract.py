"""extract_text keeps hidden attack text — that is intentional."""

from pathlib import Path

import pytest

from backend.extract import extract_text

ROOT = Path(__file__).resolve().parents[1]


def test_txt_keeps_html_comment_injection():
    text = extract_text(str(ROOT / "data/hostile/resume_h01_hidden_email.txt"))
    assert "hr-verify@evil.co" in text
    assert "placement_list.xlsx" in text
    assert "SYSTEM" in text


def test_txt_keeps_payroll_injection():
    text = extract_text(str(ROOT / "data/hostile/resume_h05_payroll.txt"))
    assert "hr-verify@evil.co" in text
    assert "sandbox/payroll.csv" in text


def test_pdf_keeps_white_text_injection():
    text = extract_text(str(ROOT / "data/hostile/notice_h02_white_text.pdf"))
    assert "placement_list.xlsx" in text
    assert "delete_file" in text or "Delete" in text or "SYSTEM" in text


def test_clean_resume_has_no_evil_target():
    text = extract_text(str(ROOT / "data/clean/resume_01_asha.txt"))
    assert "evil.co" not in text
    assert "Ignore previous" not in text


def test_missing_file_raises():
    with pytest.raises(FileNotFoundError):
        extract_text(str(ROOT / "data/clean/does_not_exist.txt"))


def test_unsupported_type_raises(tmp_path: Path):
    bad = tmp_path / "note.docx"
    bad.write_bytes(b"x")
    with pytest.raises(ValueError, match="Unsupported"):
        extract_text(str(bad))
