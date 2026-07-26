# Diet trial PR 2 — the local SQLite mirror (B-417, closes B-408)

**Date:** 2026-07-26

Shipped via **#453**. `diet_trials` + `diet_trial_foods` now mirror into local SQLite, and `lib/widgetSnapshot.ts` reads the mirror instead of Supabase.

## Why this one mattered more than "add a table"

`diet_trials` shipped in migration **001** and spent its entire life Supabase-only. Every reader — the profile card, `useTrend`/`TrendZone`, the widget publisher, `trialContaminant` — hit the network. So the app's stated wedge, *"reactive tracking for owners sent home with a diet trial"*, was the one feature that went blank in airplane mode. PR 1 (#450) gave the table a real shape; this PR is the local half.

The spec's §3.4 was the useful part of the brief. v0.9 had compressed the mirror into **one sentence**; the review expanded it to a ten-point registration checklist because the `medications` precedent shows those are ten separate registration points and each has bitten this repo before. Built against the checklist, all ten landed.

## The five PR-1 findings, and what each actually cost

**1. `23505` is terminal — and the retry was the smaller problem.**
Migration 040's UNIQUE active-trial index made a *permanent* push failure reachable for the first time in this codebase; every `syncPending*` writer assumes one failure mode, transient. The obvious harm is retrying a doomed insert forever. The larger one, found while writing it: **the batch is a single upsert**, so one un-landable row fails the whole call and blocks *every other trial row* indefinitely. So the terminal branch does two things — a terminal batch error falls back to **per-row isolation** (good rows land), and the offending row is quarantined in a new local `sync_error` column that the queue read filters on.

`synced` is never set to 1 to escape a failure. That is the easy wrong fix and it is exactly Pattern 1's failure mode: a row flagged synced while absent server-side, invisible until something downstream reads it back.

Classification was kept deliberately narrow: `23505`, `23514` (041's same-pet trigger), `23502`, `22P02` are terminal. `23503` (FK) is **not** — it is the expected mid-cycle state Patterns 1 and 6 exist to ride out, and parking it would strand a perfectly good trial. Nor is `42501`, which is reachable from a session/hydration race. Per-row isolation is what makes that conservatism safe: a stuck row no longer blocks anything, so the terminal branch is only about not hammering a provably-dead request.

**2. RLS returns success-with-0-rows.** Both writers `.select('id')` and compare against the sent set; only ids the server hands back get marked. Anything else stays queued.

**3. `updated_at` is server-stamped.** Recorded at the mapper. The device's value survives only a brand-new INSERT.

**4. The same-day re-add.** The natural-key UNIQUE is mirrored **locally on purpose**, so the collision surfaces at the action, offline, where PR 3 can revive the existing row rather than queue a doomed insert. Writing that up surfaced a consequence the brief hadn't: **hydration can trip the same constraint.** Device B's losing row occupies the tuple; device A's winner arrives under a different id; the insert violates the natural key rather than the id PK, throws, and **aborts the whole table's pull**. Resolved by dropping the colliding local row, guarded on `synced = 0` — and the server's own UNIQUE constraint is what makes that guard both safe (two synced rows cannot share the tuple, so a real row is never destroyed) and complete (an unsynced row is the only thing that can collide). The statement lives in `dietTrialMirror.ts` as a constant so the test runs the production SQL, not a copy.

**5. `LOCAL_WIPE_TABLES`.** Both tables, children first, exact-set test extended. The leak is not abstract: trial food + vet name + `indication` (a closed clinical enum) is a de facto diagnosis disclosure surviving sign-out on a shared device.

## One deliberate divergence from the server

The local active-trial index is **not** unique, though 040's is. Two active rows is precisely the split-brain the server constraint exists to *surface*, and the mirror has to be able to **represent** it — a local UNIQUE would make hydrating the winner fail while the loser sat there unfixable, which is the failure 040's own header describes at length. `ACTIVE_DIET_TRIAL_QUERY` resolves it by **preferring the row the server actually has** (`ORDER BY synced DESC`), which is just the house's server-is-authoritative rule expressed as a sort key.

## The widget rewrite found a second bug

Replacing `fetchActiveTrials` was in scope because the airplane-mode criterion cannot pass while it hits Supabase. The module-scope `trialCache` turned out to carry its own defect, unrelated to offline: it was keyed on the **pet-id set with no account dimension** and was never cleared on sign-out. A sign-out → sign-in inside its 5-minute TTL could publish the **previous account's** trial food and day counter onto the Home Screen. Both cache and network read are gone; `clearLocalData` is now the single wipe. `indication` stays out of the projection per PR 1's RLS review.

## Left open, on purpose

The terminal branch stops the retry and records *why* — it does not resolve the conflict for the owner. A device whose trial lost the race keeps its quarantined row alongside the hydrated winner, and nothing tells them. Inventing a resolution (silently flipping the loser's status) would be the app deciding something only the owner can, so it is flagged on the PR for PR 3/4, which own the card and the start-a-trial flow. `sync_error` consequently has no reader yet.

**Filed B-451** — `lib/sync.ts` now holds three copies of the `food_items` FK pre-sync. PR 2 added a named `presyncFoodItems` and deliberately did not re-point the two shipped writers at it; folding load-bearing sync code in did not belong in a mirror PR. The drift risk is real — B-351 had to add `proteins` carriage to each copy separately.

## Numbers

66 new tests (in-memory `node:sqlite` against the production DDL and the real collision statement; the push writers' 0-rows and terminal branches against the real mappers). Full suite **1974 passed / 120 suites**, `tsc` clean. No migration in this PR — 040 and 041 were already applied live via #450, so schema isolation holds.
