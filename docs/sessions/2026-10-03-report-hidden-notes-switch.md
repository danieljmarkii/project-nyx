# Out of beta PR-11 — a hidden Noticed notes switch sends notes off (CUL-1464)

**Date:** 2026-10-03
**One thing:** D2 L1 — Types: a required field makes a mistake impossible to write · check: pending

Dispatched session (`/dispatch`, PR-11 of *Out of beta — Noticed, Design v2, History v2, the trial screen*). Shipped via #1025.

## What shipped

- `app/report.tsx`: the report request sends `includeNotes: showNotesOption && includeNotes`. Before, it sent the switch's default (`true`) even when the switch was hidden, and `generate-report` prints the Noticed appendix whenever look rows exist without reading the `daily_look` gate. An owner who used Noticed and then opted out (or lost eligibility) had their look notes printed under a control they could not see. The gate hooks moved above the request memo and joined its dependencies; the comment's false premise ("an account with neither has no look rows") is corrected.
- `lib/pdf.ts`: `VetReportParams.includeNotes` is now required. The server reads an absent value as ON, so an optional field handed any new caller the notes for writing nothing (C-37's default lesson). Taken from the privacy reviewer's residual list because it is the same fix's shape and cost three test fixtures.
- Tests: `app/report.test.tsx` gains four cases (neither gate, eligible only, opted in only, both gates with the switch turned off). The three hidden cases and the existing default-door case were run red against the pre-fix screen and green after. `lib/pdf.test.ts` pins an explicit `false` surviving to the wire.

## Decisions

- Ruled (a) by the PM on 2026-10-03 (CUL-1520 docket): a hidden control is the private choice. Built as ruled, client-only.

## Review

`rls-privacy-reviewer`: **PASS** for this scope. Attacks tried and held: an opted-out owner with look rows (both one-gate cases); first-frame hydration (both hooks fail closed, so the first build sends false and an opted-in owner pays one extra build); the gate closing mid-flight (the stale response is dropped by the cancel token) and mid custom-window settle (the pending timer is cleared by the effect cleanup); other `generate-report` callers (`generateVetReport` is the sole invoker; the rundown and profile only navigate to `/report`); the share path (dropped in migration 026).

## Residuals

- **CUL-1548** (filed): the server still defaults an absent `includeNotes` to true and never checks the gate, so old binaries keep printing notes for opted-out owners until they take this JS. The fix is a held server default flip or a server-side gate check. The issue also carries the product question the reviewer raised: for an opted-out owner the Noticed appendix itself (words and counts, no notes) still prints.
- Device check outstanding: opt out of Noticed with old notes on record, generate the report, confirm no notes print. In the PR body's QA script for the next TestFlight sitting.

## Teach

**D2, level 1: types, and why a required field beats a careful caller.**

TypeScript is a promise checked before the app runs. When a field is marked optional (`includeNotes?: boolean`), the compiler accepts a call that leaves it out. Think of a form where the "share my notes" box is pre-ticked unless you remember to untick it: forgetting is silent, and the silent outcome is the leaky one. The server here reads a missing value as "yes, include notes."

Today's one line:

```ts
  includeNotes: boolean;   // was: includeNotes?: boolean;
```

Dropping the `?` means any code that builds a report request without saying yes or no now fails to compile. The bug class (forgetting) can't be written any more, rather than relying on everyone remembering. That is why three old test fixtures had to change: they were relying on the silent default.

*Check:* the server still treats a missing value as "include notes." Why doesn't making the field required in the app fully close the gap? (Hint: think about who else can call the server.)
