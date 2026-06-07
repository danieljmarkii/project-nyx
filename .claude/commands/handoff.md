---
description: Lightweight Dev Handoff for a mid-session push — emit just the runtime commands + Manual QA script, without the full /wrap ceremony.
---

# /handoff — Get the latest push onto the phone

Emit **only** the Dev Handoff: the runtime command sequence + the Manual QA script for what was just pushed. This is the lightweight cousin of `/wrap` — use it when you've pushed mid-session and just want to test the change on-device, without running the full DoD / Session Summary / Next Session Kickoff.

(If you're closing out the session, use `/wrap` instead — it includes the handoff *plus* the close-out ritual.)

## Steps

1. **Confirm something was actually pushed.** Run `git log --oneline origin/main..HEAD` (or check the current branch's tip vs its upstream). If nothing is pushed yet, say so and stop — there's nothing to hand off.

2. **Pick the runtime.** Default to **Runtime B** (Metro + tunnel) — that's the per-push, test-one-PR path, which is what a mid-session handoff almost always is. Only use **Runtime A** (`eas update` OTA → TestFlight) if the PM has explicitly said this session is about cutting a new TestFlight build. Pull the exact, copy-pasteable block from `docs/dev-handoff-runbook.md` for the chosen runtime — don't restate it from memory.

3. **Add the conditional deploy steps** if the push includes them (from the runbook's "Always, before pushing" section):
   - Supabase **migration** → the SQL-Editor run step.
   - **Edge Function** → both deploy paths (CLI / dashboard paste).

4. **Emit the Manual QA Script** in the required numbered format (CLAUDE.md / runbook): start from a known state, golden path first then 1–2 edge cases, tell the PM what to expect at each step, and tie each check back to the current build step's acceptance criteria. If the change is backend-only, the QA script is the curl/SQL/dashboard steps instead.

## Rules

- Always `git checkout <the handoff branch>` **before** pulling — the one non-negotiable git rule (CLAUDE.md). If the PM hits a git snag, point them at `docs/git-first-aid.md`.
- Emit only the one runtime that matches the session — do not dump both.
- This command deliberately does **not** run the DoD, update STATUS.md, or emit the Session Summary. That's `/wrap`'s job.

$ARGUMENTS
