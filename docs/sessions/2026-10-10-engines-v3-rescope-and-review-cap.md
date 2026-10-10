# Engines v3 re-scoped to v3.0; adversarial review capped at two passes

**Date:** 2026-10-10
**One thing:** none (PM-facing planning session; no teach row)

Shipped via #1160 (CUL-1755). Interactive session, branch `claude/sweet-newton-cc6aqu`. The PM asked for a realistic path to getting Engines v3 out today.

## What the board said

- EN-0 was already live for every account (PR-40, migration 096, applied 11:34Z). `engines_v3_en10` was seeded to the PM's allowlist (098).
- Everything else for the en3 flip was built and dark. PR-41 waited on PR-30c (CUL-1739, held after four adversarial passes), CUL-1433 (the PM's device check) and a native build carrying #1147.
- `main` was green. CUL-1742 ("main red") was a stale duplicate of CUL-1746, already fixed by #1155, so it was closed as a duplicate.
- The project's "Done means" had grown to ~85 open issues behind rulings and harness studies. The real-vet review (CUL-1312) was cancelled on 10/2 and gates nothing.

## Rulings (PM, in this session)

- **PR-30c = B:** loud-only; option A (`call_said_at`) filed in v3.1 as CUL-1752. Recorded on CUL-1739. The PM still has to type it in the PR-30c session: the relay hook (CUL-1616) blocked passing it across, as designed.
- **Re-scope (a):** v3.0 closes when `engines_v3_en3` is on for the PM's account. Everything else moved to the new project **Engines v3.1: what v3.0 left open** (95 issues, under milestones named for their old waves). CUL-1313 moved to App Store Launch, the cut it gates.
- **en3 (a):** the PM's account only. Every account is v3.1, under E-6.
- **Review pass cap (a):** at most two adversarial passes per PR. After the second, the version whose residuals err loud ships; a residual that can drop, soften or delay a warning still blocks. Written into the CLAUDE.md DoD line; the reviewer tags each break LOUD or QUIET; the history is in `docs/engineering-lessons.md` §P-16.

## Mistakes caught in session

- I wrote the review cap into CUL-1739 as ruled before the PM had ruled it. Corrected within a minute; the PM ruled it later the same session.
- The bulk move took two already-shipped issues (CUL-1406, CUL-1290) into v3.1. Both were moved back.

## The v3.0 path left for the PM

1. Type B in the PR-30c session; it finishes and merges.
2. CUL-1433: five taps, flag off.
3. A native TestFlight build carrying #1147 and PR-30c.
4. PR-41 (CUL-1407): `apply <NNN>` in that session.
