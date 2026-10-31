# AGENTS.md — context for AI coding assistants (and humans) working on AgentGate

> Read this before changing anything. It reflects the code on `main`; if the code and this file disagree, the code wins. Please say so in your PR.

**AgentGate** is a deterministic **permission gate between an AI agent and its tools**. The AI only *proposes* tool calls; plain code (no AI) checks every call against `backend/policy.yaml` and returns **ALLOW** (a mock tool runs), **BLOCK** (nothing runs) or **REVIEW** (a human approves or denies). Every attempt goes into an append-only, hash-chained audit log.
Tagline: *The AI can be fooled. The gate can't.* Hackathon: AfterHours 1.0, Theme 02 (Trust, Privacy & Digital Provenance), Team Y2K Devs (AH53).

## Golden rules (never break these)
1. **The gate is plain deterministic code.** No LLM, no network, no file I/O inside rule checks. It must work with the LLM switched off.
2. **No tool runs except through the gate.** Only `backend/main.py` calls `tools.execute()`, and only after `gate.check()` returns ALLOW (or a human approved a REVIEW). Agent code never calls tools.
3. Anything malformed → BLOCK (`R6`). Unknown task or tool → BLOCK (default deny). Precedence: any BLOCK → BLOCK; else any REVIEW → REVIEW; else ALLOW.
4. **The audit log is append-only and hash-chained.** Never UPDATE or DELETE `audit_log` rows; human decisions and timeouts are new rows.
5. `/api/inject` uses exactly the same path as `/api/run` (`_process` in `main.py`). No shortcuts.
6. **Mock tools only:** nothing real is ever emailed or deleted. **Fake data only:** no real people's data.
7. **API changes are additive:** new fields are optional; never rename or remove existing fields.
8. Tests must pass **offline with no API key** (`LLM_MODE=replay`).
9. Never claim "100% secure"; report only measured numbers.
10. **Banned wording:** a short list of terms from the team's previous project must not appear anywhere (code, comments, UI, docs, commits). The list is in the team guide; ask the lead if unsure.

## Repo layout
```
backend/
  main.py       FastAPI routes + _process (the single run path)
  gate.py       THE gate: check(call, task, policy, ctx) -> Decision; RunContext (per-run memory)
  policy.yaml   tasks, recipients, file scopes, data labels, sensitive files/patterns, limits
  schemas.py    Pydantic contract (strict, extra="forbid"); mirrored in frontend/src/api.ts
  tools.py      mock tools: summarise, send_email (never sends), read_file (sandbox/ only), delete_file (stub)
  db.py         SQLite: hash-chained audit_log, review_queue (approval bound to call_hash), outbox
  agent.py      LLM agent (Groq, OpenAI-compatible SDK): propose(task, text, doc) -> raw [{tool, args}]
  extract.py    .txt/.pdf -> text (keeps hidden text: white text, comments, metadata)
  bench.py      Attack Bench (stub; issue #7)
  replay/       saved real LLM outputs: <doc with "/" -> "__">__<task>.json
data/clean/, data/hostile/   synthetic input documents
sandbox/        dummy files the mock tools may touch (placement_list.xlsx, payroll.csv, resumes/)
tests/          pytest: test_gate.py, test_api.py, test_exfil.py (hurdle), test_agent.py, test_extract.py
frontend/       React 19 + Vite + TypeScript + Tailwind v4 + shadcn/ui (radix) + lucide; src/api.ts = all HTTP
prototype/      Figma Make export (reference only, not built by CI)
```

## Run and test
```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r backend/requirements.txt      # Windows (.venv/bin/python on macOS/Linux)
cp .env.example .env                                                  # defaults need no API key
.venv/Scripts/python -m pytest -q                                     # must pass before every commit
.venv/Scripts/python -m uvicorn backend.main:app --reload --port 8000 # API + docs at http://localhost:8000/docs
cd frontend && npm install && npm run dev                             # http://localhost:5173, proxies /api -> :8000
```
`.env`: `LLM_MODE=replay|live`, `AGENT=fake|llm` (`fake` = hard-coded stand-in, `llm` = agent.py with fallback to fake), `GROQ_API_KEY`, `GROQ_MODEL` (current: `openai/gpt-oss-20b`), `DB_PATH` (default `agentgate.db`), `REVIEW_TIMEOUT_MIN` (default 10). Never commit `.env`.
CI (GitHub Actions) runs `pytest` and the frontend `npm run build` on every push and PR.

## How a run works (`backend/main.py`)
`POST /api/run {task, doc}` → `_resolve_doc` (only files directly in `data/clean` or `data/hostile`) → `_read_doc` → `_propose(task, text, doc)` → `_process(task, doc, raw_calls, source)`:
for each raw call: `gate.check(raw, task, POLICY, ctx)` with **one shared `RunContext`** → ALLOW: `tools.execute` (+ outbox row for send_email) · REVIEW: `db.add_review` · BLOCK: nothing → `db.save` (audit row) → `ctx.record(...)` → return `RunResult`.

## Contract (`backend/schemas.py`)
- `ToolCall {tool: summarise|send_email|read_file|delete_file, args: dict}`. Args: summarise `{document_id}`; send_email `{to, subject, body, attachment?}`; read_file / delete_file `{path}`.
- `Decision {verdict: ALLOW|BLOCK|REVIEW, rules: [str], reasons: [str]}` (rules[i] ↔ reasons[i])
- `RunRequest {task, doc}` · `RunResult {proposed, decisions, outputs}` (same index = same call; `proposed` may hold the raw dict if malformed; blocked output = `"(not executed)"`)
- `LogEntry {id, ts, task, doc, tool, args, verdict, rules, reasons, executed, source: run|inject|review|timeout, prev_hash, hash}`
- `InjectRequest {task, calls: [raw calls, 1..10]}` · `ReviewDecision {action: approve|deny, call_hash?}`

## API
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | liveness |
| GET | `/api/docs` | list of demo documents |
| POST | `/api/run` | document → agent → gate → tools → log |
| POST | `/api/inject` | raw call list → same path, no LLM (demo of attacks) |
| GET | `/api/logs` | audit log, newest first |
| GET | `/api/logs/verify` | `{ok, rows}` or `{ok: false, broken_at}` (hash chain) |
| GET | `/api/review` | pending reviews (expired ones are auto-denied first) |
| POST | `/api/review/{id}` | approve/deny by id only; approval checked against call_hash, audit row and chain (R11) |
| GET | `/api/outbox` | what the mock send_email "sent" |
| GET | `/api/policy` | the policy (internal fields removed) |
| POST | `/api/bench` | Attack Bench (stub until issue #7) |

## Rules (`gate.py` + `policy.yaml`)
| Rule | Meaning |
|---|---|
| R1_TOOL_NOT_ALLOWED | tool not allowed for the task (intent–action mismatch); unknown task denied |
| R2_RECIPIENT_NOT_ALLOWED | recipient domain not allowlisted (review domains → REVIEW) |
| R3_FILE_OUT_OF_SCOPE | path outside the task's file scope, or `../` traversal |
| R4_SENSITIVE_FILE | sensitive file attached or deleted (reading is governed by R3) |
| R5_SENSITIVE_DATA_OUT | email contains private data (phone, ID-like number, email list) or confidential file content |
| R6_MALFORMED_CALL | schema failure, missing/unknown/non-text arguments |
| R7_TOO_MANY_CALLS | more than `max_calls_per_run` (3) calls in one run |
| R8_GLOBAL_DENY | `delete_file` denied everywhere |
| R9_TAINTED_EGRESS | run already read confidential data → no email leaves; personal data → REVIEW unless the task's normal flow |
| R10_ENCODED_EXFIL | private/confidential data hidden via base64/hex/URL encoding or split across emails in the run |
| R11_APPROVAL_TAMPERED | the approved call no longer matches its hash, audit row or chain |
Tasks: `summarise_resume` (summarise only), `email_company` (send_email + read_file in `sandbox/resumes/*`), `placement_report` (may read confidential files).

## Working conventions
- **Branch per issue; never commit to `main`.** Open a PR; the lead (Gurpreet) reviews and merges. CI must be green.
- Pull `main` into your branch at the start of each session and after every merge. `backend/main.py` is shared, so keep your change in your own spot.
- Commit message: `type(scope): short imperative summary` (≤72 chars) + 1–4 `- ` bullet lines. type: feat, fix, test, refactor, chore, docs · scope: backend, gate, agent, frontend, data, bench, repo. **No `Co-Authored-By` or AI attribution lines.**
- PR description sections, in order: `## Summary` · `## Changes` · `## How it was tested` · `## Checklist` · `## Next`. Start with `Closes #<issue>`.
- Add files by name (never `git add .`); never commit `.env`, `*.db`, `node_modules`, editor folders.
- Only edit the files listed in your issue's "Files to touch"; ask in the issue before touching `gate.py`, `policy.yaml`, `db.py` or another person's area.

## Open work (GitHub issues)
| Issue | Branch | Notes |
|---|---|---|
| #7 Attack Bench | `feature/bench` | merge after #9 |
| #8 Agent multi-step + chain attack | `feature/agent-multistep` | merge after #9; keep single-step as default |
| #9 Run insights (hidden text + egress preview) | `feature/run-insights` | merge first |
| #10 Automated attacker (red-team) | `feature/red-team` | needs #7 merged |
| #11 UI/UX upgrade | `feature/ui-upgrade` | frontend only |
Merge order: #9 → #7 → #10 → #8 → #11.
