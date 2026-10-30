"""Policy gate (CORE). Plain deterministic code — no LLM, no I/O inside rule checks.

evaluate() must work with the LLM switched off: it only sees the task, the proposed call and the policy.
All rules are evaluated (no short-circuit) so every reason can be shown.
"""


def load_policy(path: str = "backend/policy.yaml") -> dict:
    raise NotImplementedError


def evaluate(task: str, call: dict, policy: dict, call_index: int = 0) -> dict:
    """Return a Decision: verdict ALLOW | BLOCK | REVIEW, RuleHit reasons and egress preview."""
    raise NotImplementedError
