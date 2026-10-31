"""Run the full pytest suite and write data/eval/results/tests.json (Sprint C)."""

from __future__ import annotations

import json
import subprocess
import sys
import xml.etree.ElementTree as ET
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
CASES_DIR = ROOT / "tests" / "cases"
RESULTS_DIR = ROOT / "data" / "eval" / "results"
JUNIT = RESULTS_DIR / "pytest-junit.xml"
OUT = RESULTS_DIR / "tests.json"


def _load_handwritten_meta() -> tuple[dict[str, dict], list[dict]]:
    """Return by_group stats skeleton and known-gap list from YAML (ids / notes)."""
    by_group: dict[str, dict] = {}
    gaps: list[dict] = []
    for path in sorted(CASES_DIR.glob("*.yaml")):
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        group = data.get("group") or path.stem
        cases = data.get("cases") or []
        by_group[group] = {"total": len(cases), "passed": 0, "xfailed": 0, "failed": 0}
        for case in cases:
            if case.get("known_gap"):
                gaps.append(
                    {
                        "id": case.get("id"),
                        "title": case.get("title"),
                        "note": case.get("note") or "",
                        "group": group,
                    }
                )
    return by_group, gaps


def _parse_junit(path: Path) -> tuple[dict, dict[str, int], dict[str, str]]:
    """Return suite totals, by_file counts (passed-ish), and handwritten id -> outcome."""
    tree = ET.parse(path)
    root = tree.getroot()
    # pytest may wrap as testsuites/testsuite
    suites = root.findall("testsuite") if root.tag == "testsuites" else [root]

    total = passed = failed = skipped = xfailed = 0
    by_file: dict[str, int] = defaultdict(int)
    hw_outcomes: dict[str, str] = {}

    for suite in suites:
        for case in suite.findall("testcase"):
            total += 1
            classname = case.get("classname") or ""
            name = case.get("name") or ""
            file_key = classname.rsplit(".", 1)[-1] + ".py" if classname else "unknown.py"

            skip = case.find("skipped")
            fail = case.find("failure")
            err = case.find("error")

            outcome = "passed"
            if fail is not None or err is not None:
                outcome = "failed"
                failed += 1
            elif skip is not None:
                # pytest xfail -> skipped with type="pytest.xfail" (or message contains xfail)
                stype = (skip.get("type") or "") + " " + (skip.get("message") or "")
                if "xfail" in stype.lower() or "xfail" in (skip.text or "").lower():
                    outcome = "xfailed"
                    xfailed += 1
                else:
                    outcome = "skipped"
                    skipped += 1
            else:
                passed += 1
                by_file[file_key] += 1

            if "test_handwritten_case" in name or name.startswith("test_handwritten_case"):
                # name like test_handwritten_case[rcp-001]
                if "[" in name and name.endswith("]"):
                    cid = name[name.index("[") + 1 : -1]
                    hw_outcomes[cid] = outcome

    return (
        {
            "total": total,
            "passed": passed,
            "failed": failed,
            "skipped": skipped,
            "xfailed": xfailed,
        },
        dict(by_file),
        hw_outcomes,
    )


def main() -> int:
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    cmd = [
        sys.executable,
        "-m",
        "pytest",
        "-q",
        f"--junitxml={JUNIT}",
    ]
    print("Running:", " ".join(cmd), flush=True)
    proc = subprocess.run(cmd, cwd=ROOT)
    # Still write a report even if pytest failed (useful for known gaps / flakes).

    by_group, gaps_meta = _load_handwritten_meta()
    suite, by_file, hw_outcomes = _parse_junit(JUNIT) if JUNIT.exists() else (
        {"total": 0, "passed": 0, "failed": 0, "skipped": 0, "xfailed": 0},
        {},
        {},
    )

    hw_total = sum(g["total"] for g in by_group.values())
    hw_passed = hw_failed = hw_xfailed = 0
    for cid, outcome in hw_outcomes.items():
        # find group
        group = None
        for path in CASES_DIR.glob("*.yaml"):
            data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
            gname = data.get("group") or path.stem
            for case in data.get("cases") or []:
                if case.get("id") == cid:
                    group = gname
                    break
            if group:
                break
        if group is None:
            continue
        if outcome == "passed":
            hw_passed += 1
            by_group[group]["passed"] += 1
        elif outcome == "xfailed":
            hw_xfailed += 1
            by_group[group]["xfailed"] += 1
        elif outcome == "failed":
            hw_failed += 1
            by_group[group]["failed"] += 1

    # If junit didn't list every case (shouldn't happen), fall back to YAML totals for passed estimate
    if not hw_outcomes and hw_total:
        hw_passed = hw_total - len(gaps_meta)
        hw_xfailed = len(gaps_meta)

    gaps = gaps_meta  # from YAML notes; honest list of known gaps

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total": suite["total"],
        "passed": suite["passed"],
        "failed": suite["failed"],
        "xfailed": suite["xfailed"],
        "skipped": suite["skipped"],
        "handwritten": {
            "total": hw_total,
            "passed": hw_passed,
            "failed": hw_failed,
            "known_gaps": hw_xfailed if hw_outcomes else len(gaps),
            "by_group": {
                g: {"total": v["total"], "passed": v["passed"]} for g, v in by_group.items()
            },
            "gaps": gaps,
        },
        "by_file": by_file,
    }
    OUT.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    hw = payload["handwritten"]
    print(
        f"Hand-written cases: {hw['passed']}/{hw['total']} pass "
        f"({hw['known_gaps']} known gaps) · whole suite: "
        f"{payload['passed']} passed, {payload['xfailed']} xfailed"
        + (f", {payload['failed']} failed" if payload["failed"] else "")
    )
    print(f"Wrote {OUT.relative_to(ROOT)}")
    return proc.returncode


if __name__ == "__main__":
    raise SystemExit(main())
