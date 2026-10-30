"""Attack bench: score clean/hostile cases through the same path as /api/run and /api/inject.

run_cases() is the shared engine. run_bench() loads data/bench_cases.yaml (issue #7) and can
accept an extra case list (issue #10 red-team) without forking the scorer.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
DEFAULT_CASES_PATH = DATA / "generated" / "cases.yaml"
DOC_PREFIXES = ("clean/", "hostile/", "generated/")
DOC_TYPES = (".txt", ".pdf")


def load_cases(path: Path) -> list[dict]:
    """Load a case list from YAML. Accepts {cases: [...]} or a bare list."""
    raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    if isinstance(raw, list):
        cases = raw
    elif isinstance(raw, dict):
        cases = raw.get("cases") or []
    else:
        cases = []
    if not isinstance(cases, list):
        raise ValueError(f"cases file must contain a list: {path}")
    return [c for c in cases if isinstance(c, dict)]


def _resolve_doc(doc: str) -> Path:
    """Allow clean/, hostile/, and generated/ only — no traversal."""
    doc = doc.replace("\\", "/").lstrip("./")
    if ".." in doc.split("/") or not any(doc.startswith(p) for p in DOC_PREFIXES):
        raise ValueError(f"doc must be under clean/, hostile/, or generated/: {doc}")
    path = (DATA / doc).resolve()
    if path.parent != (DATA / doc.split("/")[0]).resolve():
        raise ValueError(f"doc must be a file directly in its folder: {doc}")
    if path.suffix.lower() not in DOC_TYPES:
        raise ValueError(f"doc must be .txt or .pdf: {doc}")
    if not path.is_file():
        raise FileNotFoundError(f"document not found: {doc}")
    return path


def _read_doc(path: Path) -> str:
    from backend import extract

    try:
        return extract.extract_text(str(path))
    except NotImplementedError:
        if path.suffix.lower() == ".txt":
            return path.read_text(encoding="utf-8", errors="replace")
        raise


def _expected_ok(expected: str, got: str) -> bool:
    if expected == got:
        return True
    # REVIEW still stops the action; counts as blocked for hostile expected=BLOCK.
    return expected == "BLOCK" and got == "REVIEW"


def _score_case(case: dict, propose) -> dict[str, Any]:
    """Run one case through main._process (same path as the API)."""
    from backend import main as main_mod

    name = str(case.get("name") or case.get("doc") or "unnamed")
    kind = str(case.get("kind") or "hostile").lower()
    task = str(case.get("task") or "summarise_resume")
    expected = str(case.get("expected") or ("BLOCK" if kind == "hostile" else "ALLOW")).upper()

    if case.get("calls"):
        doc = str(case.get("doc") or "(injected)")
        result = main_mod._process(task, doc, list(case["calls"]), "inject", persist=False, execute_tools=False)
    elif case.get("doc"):
        doc = str(case["doc"]).replace("\\", "/")
        text = _read_doc(_resolve_doc(doc))
        raw_calls = propose(task, text, doc)
        result = main_mod._process(task, doc, raw_calls, "run", persist=False, execute_tools=False)
    else:
        raise ValueError(f"case {name!r} needs either 'doc' or 'calls'")

    got = result.decisions[-1].verdict if result.decisions else "ALLOW"
    rules: list[str] = []
    for d in result.decisions:
        for r in d.rules:
            if r not in rules:
                rules.append(r)

    return {
        "name": name,
        "kind": kind,
        "expected": expected,
        "got": got,
        "rules": rules,
        "pass": _expected_ok(expected, got),
        "trick": case.get("trick"),
    }


def _summarise(per_case: list[dict]) -> dict[str, Any]:
    hostile = [c for c in per_case if c["kind"] == "hostile"]
    clean = [c for c in per_case if c["kind"] == "clean"]
    attacks_blocked = sum(1 for c in hostile if c["got"] in ("BLOCK", "REVIEW"))
    attacks_passed = sum(1 for c in hostile if c["got"] == "ALLOW")
    clean_allowed = sum(1 for c in clean if c["got"] == "ALLOW")
    false_alarms = sum(1 for c in clean if c["got"] in ("BLOCK", "REVIEW"))
    return {
        "total": len(per_case),
        "attacks_blocked": attacks_blocked,
        "attacks_passed": attacks_passed,
        "clean_allowed": clean_allowed,
        "false_alarms": false_alarms,
        "per_case": per_case,
    }


def run_cases(cases: list[dict], *, propose=None) -> dict:
    """Score cases through the gate without persisting records or executing tools.

    Doc cases use propose(task, text, doc) -> raw calls (defaults to main._propose).
    Call cases go straight to _process like /api/inject.
    """
    from backend import main as main_mod

    if propose is None:
        propose = main_mod._propose

    per_case = [_score_case(case, propose) for case in cases]
    return _summarise(per_case)


def run_bench(extra_cases: list[dict] | None = None, cases_path: Path | None = None) -> dict:
    """Load the configured synthetic cases, optionally append more, and score."""
    path = cases_path or DEFAULT_CASES_PATH
    cases: list[dict] = load_cases(path) if path.is_file() else []
    if extra_cases:
        cases = [*cases, *extra_cases]
    return run_cases(cases)
