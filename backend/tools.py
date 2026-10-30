"""Mock tools — no real side effects. Only touch sandbox/ and the DB outbox.

Must only be reached via gate.evaluate() -> tools.execute().
"""


def execute(call: dict) -> dict:
    raise NotImplementedError
