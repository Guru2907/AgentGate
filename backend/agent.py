"""LLM agent: sends {task, document text, tool definitions} to the LLM and returns proposed tool calls.

Never executes tools. Output goes to schemas.py validation, then gate.evaluate().
Modes (LLM_MODE in .env): "live" -> Groq tool calling, "replay" -> backend/replay/*.json fixtures.
"""


def propose_calls(task: str, document_id: str, document_text: str) -> list[dict]:
    """Return raw proposed tool calls as [{"tool": str, "args": dict}, ...]."""
    raise NotImplementedError
