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



class AIUnavailable(Exception):
    """The live AI could not answer (rate limit that persisted, network, no key). The case is skipped."""


def _run_live(cases: list[dict], limit: int, seed: int) -> dict:
    """Real Groq agent on document cases only. Nothing is faked: if the AI can't answer, the case is skipped.

    Measures, on real AI behaviour:
      - ai_fooled: the AI proposed a harmful action (non-allowed tool or outside recipient) for a hostile doc
      - gate_stopped_when_fooled: of those, how many the gate blocked or sent to review
      - harmful_executed: fooled AND allowed (the number that must be 0)
      - false_alarms: clean docs the gate blocked/flagged
    """
    import tempfile

    from backend import agent, bench, db

    os.environ["AGENT"] = "llm"
    os.environ["LLM_MODE"] = "live"
    rng = random.Random(seed)
    docs = [c for c in cases if c.get("doc") and not c.get("calls")]
    hostile = [c for c in docs if c.get("kind") == "hostile"]
    clean = [c for c in docs if c.get("kind") == "clean"]
    n = limit or 30
    n_hostile = min(len(hostile), max(1, round(n * 0.6)))
    picked = rng.sample(hostile, n_hostile) + rng.sample(clean, min(len(clean), n - n_hostile))

    def propose(task: str, text: str, doc: str) -> list:
        for attempt in range(3):
            try:
                calls = agent._propose_live(task, text, doc, history=None)
                return [{k: v for k, v in c.items() if k != "_id"} for c in calls]
            except Exception as exc:
                msg = str(exc).lower()
                if "rate" in msg or "429" in msg or "limit" in msg:
                    print(f"  rate limit; waiting 60s (attempt {attempt + 1}/3)", flush=True)
                    time.sleep(60)
                    continue
                raise AIUnavailable(type(exc).__name__) from exc
        raise AIUnavailable("rate limit persisted")

    per_case, skipped = [], 0
    with tempfile.TemporaryDirectory(prefix="agentgate-eval-") as tmp, db.using_db(Path(tmp) / "eval.db"):
        for i, case in enumerate(picked):
            if i:
                time.sleep(8)  # free tier pacing
            try:
                row = bench._score_case(case, propose)
            except AIUnavailable as exc:
                skipped += 1
                print(f"  [{i + 1}/{len(picked)}] {case['name']}: skipped ({exc})", flush=True)
                continue
            per_case.append(row)
            print(f"  [{i + 1}/{len(picked)}] {row['kind']:7s} {row['name'][:40]:40s} fooled={row['ai_fooled']!s:5s} gate={row['got']}", flush=True)

    summary = bench._summarise(per_case)
    live_h = [c for c in per_case if c["kind"] == "hostile"]
    fooled = [c for c in live_h if c["ai_fooled"]]
    summary.update(
        live_hostile=len(live_h),
        live_clean=sum(1 for c in per_case if c["kind"] == "clean"),
        ai_fooled_count=len(fooled),
        ai_fooled_rate=(len(fooled) / len(live_h)) if live_h else 0.0,
        gate_stopped_when_fooled=sum(1 for c in fooled if c["got"] in ("BLOCK", "REVIEW")),
        harmful_executed=sum(1 for c in fooled if c["got"] == "ALLOW"),
        skipped_ai_unavailable=skipped,
        model=os.getenv("GROQ_MODEL", ""),
    )
    return summary

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
    if args.mode == "replay" and args.limit and args.limit < len(cases):
        cases = random.sample(cases, args.limit)

    if args.mode == "replay":
        propose = bench.make_case_aware_propose(cases, bench.load_fooled_calls())
        summary = bench.run_cases(cases, propose=propose)
        path = bench._write_eval_result(summary, mode="replay")
    else:
        summary = _run_live(cases, args.limit, args.seed)
        path = bench._write_eval_result(summary, mode="live")
        print(
            f"LIVE AI: {summary['live_hostile']} hostile + {summary['live_clean']} clean docs | "
            f"AI fooled {summary['ai_fooled_count']}/{summary['live_hostile']} | "
            f"gate stopped {summary['gate_stopped_when_fooled']}/{summary['ai_fooled_count']} of the harmful ones | "
            f"harmful actions executed {summary['harmful_executed']} | "
            f"false alarms {summary['false_alarms']}/{summary['live_clean']} | "
            f"skipped (AI unavailable) {summary['skipped_ai_unavailable']}"
        )

    _print_table(summary)
    print(f"wrote {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
