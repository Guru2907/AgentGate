# Changelog

## afterhours-submission (31 Oct 2026)

Tag `afterhours-submission` → commit `92f4b82` (31 Oct 2026, 09:18 IST), the 24-hour build submitted at
AfterHours 1.0 (DBIT Bengaluru) by Team Y2K Devs. At submission, AgentGate had a deterministic permission
gate (rules R1–R11 in `backend/gate.py` + `policy.yaml`) between a Groq tool-calling agent (live, replay or
multi-step) and sandboxed mock tools. It had strict Pydantic schema checks, a per-run memory for "every step allowed"
exfiltration (R9 tainted egress, R10 encoded/split data, R11 approval bound to the exact call), a human review queue
that times out to deny, and an append-only, hash-chained SQLite audit log per workspace. It also included
`/api/inject` for LLM-free attacks, accounts with Argon2/session cookie/CSRF, resume uploads with AI screening, an
Email company composer, an Attack Bench (7-case bench, red team, 300-document eval, 164 hand-written cases,
one-click attacks), a React + shadcn/ui frontend with a landing page and guided tours, CI, and a Vercel (frontend) +
Render (backend) deploy config.

## Post-hackathon improvements (from 7 Nov 2026)

Improvements start after this point. See AUDIT_2026-11.md.
