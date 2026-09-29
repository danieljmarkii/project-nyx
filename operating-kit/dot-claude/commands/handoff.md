---
description: Lightweight Dev Handoff for a mid-session push. Emit just the run commands and the Manual QA script, without the full /wrap ceremony.
---

# /handoff — Get the latest push in front of the PM

Emit **only** the Dev Handoff for what was just pushed. Use it mid-session; use `/wrap` to close out.

## Steps
1. **Confirm something was pushed** (`git log --oneline origin/main..HEAD` vs the upstream). Nothing pushed → say so and stop.
2. **Pick the runtime** the PM is using this session and paste its block from `docs/dev-handoff-runbook.md` verbatim. Never restate commands from memory, and never dump every runtime.
3. **Add conditional steps** the push needs (a migration to apply, a function held from deploy).
4. **Emit the Manual QA Script**: numbered, starts from a known state, golden path then 1–2 edge cases, the expected result at each step, each check tied to an acceptance criterion, and any check the PM cannot do by hand flagged with how to verify it (SQL, dashboard, logs). Backend-only changes get the curl / SQL steps instead, same format.

## Rules
- Always `git checkout <branch>` before pulling. A bare pull from another branch is the "divergent branches" trap; point at `docs/git-first-aid.md` if it bites.
- No DoD, no session record, no tracker reconciliation. That is `/wrap`.

$ARGUMENTS
