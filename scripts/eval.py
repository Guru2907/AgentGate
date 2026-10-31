"""Real-world eval runner for AgentGate.

  python scripts/eval.py --mode replay
  python scripts/eval.py --mode live --limit 60
"""

from __future__ import annotations

import argparse
import os
import random
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def _print_table(summary: dict) -> None:
    total = summary.get("total", 0)
    ab = summary.get("attacks_blocked", 0)
    ap = summary.get("attacks_passed", 0)
    hostile = ab + ap
    fa = summary.get("false_alarms", 0)
    clean = summary.get("clean_allowed", 0) + fa
    det = summary.get("detection_rate", 0) * 100
    far = summary.get("false_alarm_rate", 0) * 100
    afr = summary.get("ai_fooled_rate", 0) * 100
    lat = summary.get("latency") or {}
    print(
        f"cases {total} | attacks blocked {ab}/{hostile} ({det:.1f}%) | "
        f"false alarms {fa}/{clean} ({far:.1f}%) | "
        f"AI fooled {afr:.0f}% | "
        f"gate p50 {lat.get('gate_ms_p50', 0):.1f} ms p95 {lat.get('gate_ms_p95', 0):.1f} ms"
    )
    print(f"{'category':22s} {'total':>6} {'blocked':>8} {'passed':>7}")
    by_cat = summary.get("by_category") or {}
    for cat in sorted(by_cat.keys()):
        slot = by_cat[cat]
        print(f"{cat:22s} {slot.get('total', 0):6d} {slot.get('blocked', 0):8d} {slot.get('passed', 0):7d}")


def main() -> int:
    parser = argparse.ArgumentParser(description="AgentGate real-world eval")
    parser.add_argument("--mode", choices=("replay", "live"), default="replay")
    parser.add_argument("--limit", type=int, default=0, help="Cap cases (0 = all); live usually samples")
    parser.add_argument("--seed", type=int, default=7)
    args = parser.parse_args()

    from backend import bench

    cases = bench.load_cases(bench.EVAL_CASES_PATH)
    if not cases:
        print("No cases at data/eval/cases.yaml — run scripts/make_eval_set.py first.", file=sys.stderr)
        return 1

    random.seed(args.seed)
    if args.limit and args.limit < len(cases):
        cases = random.sample(cases, args.limit)

    if args.mode == "replay":
        propose = bench.make_case_aware_propose(cases, bench.load_fooled_calls())
        summary = bench.run_cases(cases, propose=propose)
        path = bench._write_eval_result(summary, mode="replay")
    else:
        # Live Groq agent
        os.environ["AGENT"] = "llm"
        os.environ["LLM_MODE"] = "live"
        from backend import main as main_mod

        def propose(task: str, text: str, doc: str) -> list:
            for attempt in range(3):
                try:
                    return main_mod._propose(task, text, doc)
                except Exception as exc:
                    msg = str(exc).lower()
                    if "rate" in msg or "429" in msg or "limit" in msg:
                        print(f"rate limit; sleeping 60s (attempt {attempt + 1}/3)...", flush=True)
                        time.sleep(60)
                        continue
                    raise
            print("rate limit persisted; falling back to fake agent for this doc", flush=True)
            return main_mod.fake_propose(task, doc)

        # Free-tier pacing: ~8s between docs
        paced_cases = cases
        per_case = []
        from backend import db
        import tempfile

        with tempfile.TemporaryDirectory(prefix="agentgate-eval-") as tmp, db.using_db(Path(tmp) / "eval.db"):
            for i, case in enumerate(paced_cases):
                if i and not case.get("calls"):
                    time.sleep(8)
                per_case.append(bench._score_case(case, propose))
        summary = bench._summarise(per_case)
        path = bench._write_eval_result(summary, mode="live")

    _print_table(summary)
    print(f"wrote {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
