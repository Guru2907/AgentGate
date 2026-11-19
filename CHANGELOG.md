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

Improvements start after this point, based on a post-hackathon audit (kept locally).

- **Gate Log explanations** (#38, Siddeshwar): click a decision for a plain-language walkthrough of every rule.
- **Evaluation runs from the app are no longer saved** (#39): only `scripts/eval.py` writes published results.
- **Reliable demo**: Run Task lists the bundled sample documents again; they use saved AI answers, so a hostile sample is blocked every time, offline. Email company drafts for samples use the saved plan unless `LLM_MODE=live`.
- **Strict recipient check (R2)**: exactly one well-formed address; spaces, an empty local part, two `@` or two recipients are blocked. Subdomains of allowlisted domains are allowed when the policy opts in. Hand-written gaps rcp-003/013/017 closed.
- **Daily AI limits**: live AI calls (uploads, live email drafts, red-team generation) are capped per account and for the whole server; sign-ups are capped per hour server-wide.
- **Honest README**: demo steps match the app, live results come first, and each number says how it was measured.
