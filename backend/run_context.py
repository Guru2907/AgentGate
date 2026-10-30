"""Per-run memory shared across multi-step tool proposals.

The gate uses this for R9 (email after a sensitive read). main.py owns the instance
for one /api/run and never shares it across requests.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class HistoryItem:
    """One completed step: the proposed call, gate verdict, and tool output text."""

    call: dict
    verdict: str
    output: str


@dataclass
class RunContext:
    """Accumulates what happened in this run so later steps can be judged."""

    # Absolute-ish sandbox paths that were successfully read (ALLOW + execute).
    sensitive_reads: set[str] = field(default_factory=set)
    history: list[HistoryItem] = field(default_factory=list)

    def record(self, call: dict, verdict: str, output: str, *, sensitive: bool = False) -> None:
        self.history.append(HistoryItem(call=call, verdict=verdict, output=output))
        if sensitive and verdict == "ALLOW":
            path = str((call.get("args") or {}).get("path") or "").replace("\\", "/").strip()
            if path:
                self.sensitive_reads.add(path.lower())
