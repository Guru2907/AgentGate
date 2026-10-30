"""Generate N new hostile documents with an LLM, then score them through the bench.

Usage (repo root):
    python scripts/red_team.py --n 10
    python scripts/red_team.py --score-only          # re-score data/generated/cases.yaml
    python scripts/red_team.py --n 5 --templates     # offline synthetic attacks (no API key)

Does not commit or push. Writes under data/generated/.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
load_dotenv(ROOT / ".env")

from backend import redteam  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Automated attacker (issue #10)")
    parser.add_argument("--n", type=int, default=10, help="How many new attacks to invent (default 10)")
    parser.add_argument(
        "--score-only",
        action="store_true",
        help="Skip generation; re-score the saved batch in data/generated/",
    )
    parser.add_argument(
        "--templates",
        action="store_true",
        help="Use built-in synthetic templates instead of calling Groq",
    )
    parser.add_argument("--json", action="store_true", help="Print full JSON result")
    args = parser.parse_args()

    try:
        result = redteam.run(n=args.n, score_only=args.score_only, use_templates=args.templates)
    except FileNotFoundError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    print(result["summary_line"])
    print(
        f"total={result['total']} blocked={result['attacks_blocked']} "
        f"passed={result['attacks_passed']} cases={result['cases_path']}"
    )
    if result.get("rules_hit"):
        print("rules:", ", ".join(f"{k}×{v}" for k, v in result["rules_hit"].items()))
    for case in result["per_case"]:
        mark = "PASS" if case["pass"] else "FAIL"
        print(f"  [{mark}] {case['name']}: expected={case['expected']} got={case['got']} rules={case['rules']}")

    if args.json:
        print(json.dumps(result, indent=2))
    return 0 if result["attacks_passed"] == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
