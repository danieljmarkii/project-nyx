# CUL-2575: a flag switch or a new consent wording no longer refuses a printed-summary keep

**Date:** 2026-11-07
**One thing:** P2 L1 — Reversibility: a refused keep is a one-way door, a flag is a two-way one · check: pending

Shipped via #1467. Track: Vet report v2 (the AI lead go-live, [CUL-2388](https://linear.app/projectnyx/issue/CUL-2388), is what this unblocks).

## What happened

The session opened as DISCOVERY. The read-error half of CUL-2575 had already shipped in #1456, so the remainder was a ruling. Re-reading the merged gate turned up one fact the earlier brief (Decision 1 on CUL-2573) had missed: `consentDecision` returned the same `consent_declined / report_summary` for a withdrawn yes and for a yes under an older summary wording. Option (b) could not be built as a keep-side mapping alone. The brief was re-posted with that fact, and the PM ruled **(b)** the same day: only a withdrawn yes (at either scope) and another owner's pet refuse a printed-summary keep. A flag switched off, or a yes under an older wording, keeps the copy as sent. Ruling (a) of 2026-11-05 stands for withdrawal.

## What shipped

- `supabase/functions/_shared/reportSummaryGate.ts`: `runKeepGate` asks a different question from `runSummaryGate`. The generation gate asks whether a new summary may be made. The keep gate asks whether a copy that already prints one may be kept. It reads consent with `anyCopy: true` and then checks the pet. It never reads the config and never spends a count. The consent and pet steps are factored out of `runSummaryGate` with its order, `unread` marking and short-circuits unchanged.
- `supabase/functions/generate-report/aiLead/run.ts`: `settleLeadForKeep` takes a `SettleIO` and asks `keepGate()`, never the generation gate. A failed read is still `unread`, so the keep answers 500 and is retried.
- Tests: six keep-gate tests, one end-to-end keep over the real gate (its config read throws, so a keep that looked at the flags would refuse), and the existing settle tests moved to `keepGate` (their `runGate` now throws if called). `aiConsent.guard.test.ts` pins the keep gate's uid wiring and `keepForPet`'s verified uid.

## Proof

Each rule was broken and a test went red:
- the summary scope back on the current copy: 2 red;
- the pet check dropped: 3 red;
- the keep asking the generation gate: 8 red;
- the keep gate wired to `petId` for the uid: the guard red.

Full Edge suite 3872 passed; `deno check` clean.

## Review

rls-privacy-reviewer: **PASS**. It tried a missing row, a withdrawn yes at either scope, a withdrawn yes under an old wording, a non-boolean `granted`, a duplicate row, user B's JWT against pet A and report A, a failed read, and a withdrawal between the gate and the write. Every attack held. Its L1 (no guard on the keep wiring) and the comment nit are fixed in this PR. Its L2 is noted below. Its doc-drift finding is filed as [CUL-2630](https://linear.app/projectnyx/issue/CUL-2630).

## Residuals

- The flags are no longer a kill switch for kept copies. Turning `report_ai_lead` off stops new summaries but does not stop a printed one being saved to the owner's library. This is what ruling (b) chose; it is stated here so the lever's absence is known.
- `leadAllowedAtSend` claims a send-time flag check that nothing calls ([CUL-2630](https://linear.app/projectnyx/issue/CUL-2630), Backlog). So a flag switched off never stopped a summary reaching the vet, and the ruling-(b) keep makes the record match what was sent.
