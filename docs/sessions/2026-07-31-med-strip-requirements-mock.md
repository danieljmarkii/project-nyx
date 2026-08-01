# Medication strip on Home (B-614) — D1 ruled, requirements written, round-2 mock

**Date:** 2026-07-31 · **Outcome:** shipped via #523

Picks up from #522, which filed B-614/B-615 and took the PM's D2/D3 rulings. This
session took the last open call (D1), wrote the build contract, re-cut the mock as
the design authority, and landed the first build commit.

## The D1 ruling, and why it is the interesting part

Round 1 put three options in front of the PM: **A** context only (the `TrialStrip`
twin), **B** today's action row with a one-tap `Log dose` (the B-284 N7 briefing's
Care-due shape), **C** both. The reason it needed a ruling at all is that two
PM-blessed texts disagree:

- the diet-trial card's §4.2 rule — *"logging is the FAB — a second door to the
  same room is not a feature"* (which is A), versus
- the briefing's Care-due row, adopted **with** a one-tap `Log dose` in it (B/C).

**PM ruled C** — and the resolution is not "C wins, §4.2 loses." It is that the two
texts were never actually in conflict, because they are about different **registers**:

> A control that opens a **form** is a second door, and §4.2 forbids it.
> A control that writes a row the app **could already describe** is a
> **confirmation**, and the briefing governs.

The med card's tap is the second kind. The app already holds the drug, the dose, the
route and the cadence — from the regimen if there is one, from the last dose if there
isn't — so the tap confirms a dose the record already predicts. That is Principle 2
(*confirmation over entry*) doing exactly its job, not a shortcut into the FAB's
multi-decision flow.

Two things fall straight out of the rule, and both are in the spec as hard gates:

1. **The confirmability gate.** If the app cannot pre-fill the dose (no regimen, no
   prior dose to copy), there is nothing to confirm — so **no button renders**. Option
   A's behaviour survives as a *state*, not as a rival option. The alternative — a
   button that guesses — is entry wearing a confirmation's clothes, and it would write
   a clinical record the owner never actually asserted.
2. **The collapse rule.** D3 (one card per med) compounds C's weight; Sam's cat pushes
   Today and Trend below the fold. The fix is that a med whose cadence is already
   covered today drops to a single line with no button — the card earns its full dress
   only while it has something to say. Weight is paid down by **register**, never by
   dropping a med, which would be D3 by the back door.

## What landed in this PR

1. **The queued 2026-07-31 wrap edits** from the prior session's thread, re-applied:
   this session record, the D1 ruling written onto the B-614 rows in CLAUDE.md +
   `docs/backlog.md`, the STATUS track, and the new **Artifacts convention** (below).
2. **`docs/nyx-med-strip-requirements.md` v1.0** — build-ready. Decision record D1–D3
   + D4–D9 (the calls the spec itself had to make), the data model against what
   migration 020 actually stores, the four never-say rules, the state table, the copy
   pack, and the M0–M5 PR plan.
3. **The round-2 mock** (`docs/culprit-med-strip-mockups.html`) — no longer three
   options side by side; one design, every state, design-locked. Re-published over
   round 1's artifact URL per the new convention.
4. **M0 = B-441** — the first build commit (below).

## The Artifacts convention (new, CLAUDE.md § Documentation Update Protocol)

Mock rounds ship twice — the committed `docs/*-mockups.html` file is the source of
truth, and a published Artifact is how the PM actually looks at it on a phone. The
rule instituted here: **round N+1 re-publishes over round N's URL**, so a link the PM
has already opened or pasted into a thread keeps resolving to the current round
instead of going stale beside a newer one they never got. Title and favicon stay
stable across rounds; the round number lives *inside* the page, so the URL's identity
is the track and the page's identity is the round.

## M0 — B-441, the day-math fix

`regimenDaysElapsed` (`app/(tabs)/profile.tsx`) carried the exact flaw B-421 removed
from the trial counter: `medications.started_at` is a date-only `DATE`, so
`new Date(started_at)` parses it as **UTC** midnight before being floored to **local**
midnight — for anyone behind UTC the start lands on the previous local day and the
count reads one day too high. The same millisecond-span divide also loses a day across
a DST transition.

Fixed by routing through `lib/utils.localDayIndexOf` (calendar-component indexing, so
a `DATE` is never re-read as UTC midnight and DST cannot eat a day), with the function
moved to `lib/medications.ts` as `regimenDaysElapsed` so it is unit-testable and so
the Home strip and the profile card cannot drift apart — B-614's whole premise is two
surfaces counting the same course, and B-421 exists because three surfaces didn't.

This matters beyond a cosmetic off-by-one: `daysElapsed` is the **denominator** of
`computeRegimenCompliance`, which feeds the clinical-guardrails adherence copy. An
inflated denominator understates compliance — the safe direction, but wrong, and the
guard test that pinned the old hand-rolled midnight to this file is updated to pin the
absence of it instead.

Two more defects fell out of the move, neither of them in the backlog row's
description of the work:

- **The same UTC-parse was in the display half too.** The `Started <date>` fallback
  read `new Date(reg.started_at)`, which renders the *previous* day behind UTC for
  exactly the same reason. Now `dayKeyToLocalDate`.
- **Widening the return to `number | null` armed a second trap.** `null <= 14` is
  **true** in JS, so the existing `daysElapsed <= target_duration_days` would have
  rendered "Day null of 14". Guarded explicitly — and `code-reviewer` then found the
  door I had left open beside it: without a `Number.isFinite(nowMs)` check the helper
  returns **NaN**, and `NaN != null` is *also* true, so a bad instant walks past the
  very guard added to stop the null. Unreachable from today's only call site, which
  takes the `Date.now()` default — and reachable from the next one by construction,
  because the Home strip passes an explicit instant. `getDietTrialProgress` already
  had that guard; the finding was the parity gap, on a helper extracted specifically
  so the two counters could not drift.

The counters are now pinned **against each other**, not merely each against its own
expected numbers — B-421 shipped two counters that were each independently defensible
and disagreed by two days on one screen unlock, which is a failure no value oracle
catches. That test lives in `lib/analytics.test.ts` because `lib/analytics`
transitively imports `lib/supabase` (env-gated), so the import only works one way;
`lib/medications` stays import-free, which is what keeps it plain-jest testable.

## Not done here, deliberately

No strip code (M1–M5 want their own PRs with their own reviews — M5 carries the
`clinical-guardrails` + `nyx-voice` + `pm-feature-review` gates). No B-615 work (it
rides the trial card's R1 mock round, a different train). No deploys — nothing here
touches an Edge Function.
