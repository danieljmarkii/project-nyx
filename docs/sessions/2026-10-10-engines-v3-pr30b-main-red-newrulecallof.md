# Engines v3 PR-30b: main's Edge Functions red, `newRuleCallOf`'s test follows GAP-34

**Date:** 2026-10-10
**One thing:** none — dispatched session, not this round's teach row

Shipped via #1155 (CUL-1746). A `/dispatch` child; a test-and-comment fix, no behaviour change.

## What broke

Main's `Edge Functions (deno test)` went red on 29927f3 (run 38054986677) at `generate-signal/incidentRedFlagTier.test.ts:63`. Two PRs crossed: PR-27p (#1150) made a stored `tier = 'call_now'` a new-rule call whatever the stamp (CUL-1516, GAP-34, spec §1 v0.4), and PR-30a (#1147)'s `newRuleCallOf` resolves through that same `tierDisplayOf`. Each PR was green on its own base; the two expectations PR-30a wrote (an unstamped stored `call_now` is no call) were true before #1150 and false after. Reproduced locally on main's tree with Deno 2.9.4 (14 passed, 1 failed).

## What changed

- The two stale expectations now read `'call_now'`, with a comment naming GAP-34. Home follows the record, as PR-30a intended.
- An unstamped `call_today` beside `worth_a_call` is added as the earlier-rule case that IS still null, so the test keeps asserting the dark state on the rows it still covers.
- `newRuleCallOf`'s header (`pipeline.ts`) and the `call` field's comment (`detection.ts`) said every unstamped call is null; both now name the one exception.

No production code moved. en3 is unseeded, so Home stays dark: only a write under `engines_v3_en3` stores a `call_now`.

## Verification

`deno test --allow-read=supabase/functions supabase/functions/generate-signal/`: 936 passed, 0 failed. Full Edge Functions suite: 2652 passed, 0 failed. The pre-push hook (tsc, related jest, guards) passed.

## Residuals

None. The class (two PRs green on their own base, red together) is what main's CI exists to catch; it caught it.
