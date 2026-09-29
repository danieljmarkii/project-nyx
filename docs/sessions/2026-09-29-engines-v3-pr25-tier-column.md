# Engines v3 PR-25: the per-incident read's tier column

**Date:** 2026-09-29

EN-3 part 1 (CUL-1133), shipped via #977. Schema only: migration 079 plus one guard. The PM approved the apply in-session, and it is live in production.

## What shipped

- **`event_ai_analysis.tier`**: nullable TEXT, CHECK `call_now | call_today | logged | not_enough_to_say`.
  - Four values because K2 ruled on 9/28 that "part of a pattern" is drawn at render.
  - It sits beside `recommendation`, which keeps its three values for installed builds (GAP-3, CUL-1277's condition).
  - Nothing writes or reads it yet. PR-26 adds the writes beside `recommendation`; PR-27 adds the reads.
- **The tier joins 075's server-only freeze.** `freeze_event_ai_analysis_stamps()` is replaced by 075's body plus one `tier` line.
  - Readers show the louder of `tier` and `recommendation`. That rule catches a *missing* tier but not a *lowered* one: a client rewriting `call_now` to `logged` would still render "call today".
- **`guards/incidentReadFreeze.test.ts`** replays the migrations. It asserts that the last freeze body refuses a client change to every server-owned column, and that the trigger still calls it.
  - Proven by mutation: removing the tier line fails it, dropping the trigger fails it, and a commented-out drop stays green.

## Decisions (PR-25's plan choices, posted on CUL-1133 before building)

- **TEXT + CHECK, not a Postgres enum.** A later value becomes a constraint swap in one transaction.
- **No CHECK tying `tier` to `recommendation`.**
  - Counterexample: after an EN-F rollback, flag-off code writes `worth_a_call` over a row whose tier is `logged`.
  - A pairing CHECK rejects that write with 23514 and loses the escalation (C-38).
  - The rls-privacy-reviewer later proposed a narrower one-way CHECK that avoids this. It is briefed on CUL-1321 for the PM.
- **The stored shown tier is deferred to PR-28 (EN-4).**
  - Its shape is a device claim with a rule version and row ids, which is a log, and EN-4's re-floor marker writes it.
  - Until then only a re-read moves a stored tier, and PR-26's never-lower rule covers re-reads.
- **No backfill.** NULL means "no tier written", and "earlier rule" is `rule_version`'s job.

## Proof

- **Scratch Postgres 16 (075's freeze + 079): ten probes.**
  - The CHECK rejects `pattern` and free words.
  - `authenticated` / `anon` lowering, clearing or raising the tier gets 42501.
  - Dismissing a row, or re-writing the tier with its current value, still passes.
  - A flag-off `recommendation`-only write still passes.
  - The error message names no value.
  - The function keeps INVOKER, a pinned search_path, and no client EXECUTE.
- **The mutation** that removes the freeze line lets the three client writes through, so the probes measure the guard.
- **The rollback** was run and verified.
- **Live after apply:**
  - The column, the CHECK and the function settings are as intended, and the trigger is enabled.
  - A probe ran as the row's own owner and was rolled back: a no-op edit touched 1 row, and a tier change got 42501.
  - The advisors showed nothing new.
- **Measurement mistake:** my first live probe ran as `authenticated` with no JWT claims. RLS hid every row, 0 rows matched, and it read "NOT REFUSED". It proved nothing. I reran it with the owner's claims and a ROW_COUNT control. Lesson: a probe through RLS needs a control row that the role can actually see (C-41's "an absence proves a gate only when the thing gated was available").

## Review

rls-privacy-reviewer: **PASS.**
- Fixed in the PR: L2 (the rollback is safe only before PR-26/27) and L4 (the guard above).
- M1, pre-existing: a client can still lower `recommendation`. Briefed on CUL-1321.
- L1: client DELETE, 074's known gap.
- L3: the role test is a deny-list. Filed as CUL-1402.
- Info for PR-26/27: `tier` must reach Ask only through the word map.

## Residuals

- On-device check: a read still renders and still dismisses.
- PR-26 and PR-27 are next, side by side.
