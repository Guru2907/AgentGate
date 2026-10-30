"""AgentGate FastAPI app. Routes stay thin; logic lives in the other backend modules."""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="AgentGate", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _not_yet(feature: str) -> HTTPException:
    return HTTPException(status_code=501, detail=f"{feature} not implemented yet")


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/api/run")
def run_task() -> dict:
    raise _not_yet("run")


@app.post("/api/inject")
def inject_call() -> dict:
    raise _not_yet("inject")


@app.get("/api/logs")
def get_logs() -> list:
    return []


@app.get("/api/logs/verify")
def verify_logs() -> dict:
    raise _not_yet("log verify")


@app.get("/api/review")
def get_review_queue() -> list:
    return []


@app.post("/api/review/{review_id}")
def decide_review(review_id: int) -> dict:
    raise _not_yet("review decision")


@app.post("/api/bench")
def run_bench() -> dict:
    raise _not_yet("attack bench")


@app.get("/api/policy")
def get_policy() -> dict:
    raise _not_yet("policy view")


@app.get("/api/outbox")
def get_outbox() -> list:
    return []
