# Quick Win sweep: the rescue Skip, the correction editors on the shared chips, the photo-add chain under test

**Date:** 2026-09-23 · **Issues:** CUL-130, CUL-154, CUL-813 · shipped via #894
**Also touched (no code):** CUL-406, CUL-320, CUL-433, CUL-150, CUL-355, CUL-415 (read in full, cut with the reason) · CUL-1098 (filed from the review)

---

## What this was

A `Quick Win` label sweep. Twenty-four candidates read in full, bodies and latest comments,
not titles. Three were built, one commit each on one branch, in one draft PR carrying all
three ids and attached to each issue.

Exclusions applied before reading, on the same grounds as the 2026-09-22 sweep: `Waiting on
PM` (CUL-425, CUL-586); anything inside an Edge Function or a `lib/` module in an Edge
closure, because every function in `deploy-manifest.json` is `pending` or `hold` on this
date; the per-incident read surface, whose review gate is clinical (CUL-816, CUL-823,
CUL-827, CUL-83, CUL-143, CUL-409, CUL-544); RLS, Storage and the deletion cascade (CUL-597,
CUL-283, CUL-408, CUL-177, CUL-692, CUL-228); statistical or trial-copy work that owes an
adversarial pass (CUL-398, CUL-460, CUL-527, CUL-492, CUL-370). Five candidates already
carried cut comments from earlier sweeps and were skipped on that record: CUL-350, CUL-510,
CUL-400, CUL-781, CUL-370.

## What shipped

**CUL-130: the sex step's Skip names the rescue case.** Skip is the only way to leave
`sex = 'unknown'`, so for an owner who does not know, it is the answer. The step now passes
the age step's `skipLabel="Not sure? Skip"`. One prop, no data change.

The 2026-09-22 sweep excluded this issue as *"a design change without a mock round"*. This
sweep read it the other way, and the call is recorded here so the next sweep can see both.
The label is a string the app already ships, in a slot `OnboardingHeader` already lays out
at that length (the age step, one screen later), and nothing else on the screen moves. The
mock-what-you-change rule exists to stop a visual choice being made in words; there is no
visual choice here, only which of two shipped strings this header shows. If that reading is
wrong, the change is a one-line revert.

**CUL-154: the vomit and stool correction editors use the shared chip primitives.** Each
single-select is a `ChipGroup` (a radio group named for its field), and the multi-select
Contents row is a `MultiChipGroup` (checkboxes). The issue asked for the a11y convergence.
Reading the files found a second defect riding on the duplication: the hand-rolled row was
`gap: 6` on both axes while `FilterChip` reaches 6pt above and below, so wrapped rows shared
6pt of tap zone (C-5). The shared primitives' `rowGap: space2` clears it. The visual delta
is chip spacing 6/6 → 8 across / 16 down, stated in the PR.

Behaviour is unchanged. Tap-to-clear comes from `ChipGroup`'s default `allowDeselect`, and
the stool blood rule (leaving *Present* drops the blood type) now receives the next value
rather than re-deriving it. The Save payload assertions are identical before and after.

**CUL-813: the event-detail photo-add chain has a route-level test.** Every suite that
mounts `app/event/[id].tsx` mocked `expo-image-picker` and never called it, so
`launchPicker` ran under no test. The premise had moved since filing in one useful way:
the harness now exists (`heroRefocus`, `incidentScreen`, `deleteConfirm`, `lookRecord`), so
this was a sibling suite rather than a new harness. The one change of shape: a single db
handle shared across the screen, so the chain's writes read back in order. It drives the
real route (empty hero, then the Alert source sheet, then *Choose from library*) through
the four cases the issue scoped. Test-only.

## Proven by mutation, before trusting

| Test | Mutant | Result |
|---|---|---|
| `app/onboarding/pet-gender.test.tsx` | pre-fix screen | red, 1 of 4 |
| `components/event/*FieldsEditor.test.tsx` | pre-convergence editors | red, 20 of 27; every gap case `Received: 6`, expected `>= 12` |
| same | pre-convergence editors, refactor-safety half | green, 7 of 7 (tap-to-clear, both blood-rule paths, Contents → `null`) |
| `app/event/photoAdd.test.tsx` | ignore the upsert `error` | red, case 2 only |
| same | drop the await on a live chain (**the CUL-801 defect**) | red, case 3, on the *raced* assertion |
| same | `if (readClaim === null) return;` | red, case 3, on the await assertion |
| same | drop `readInvoked = !readErr` | red, case 1 only |
| same | detach before the insert | red, case 4 only |

The first draft of case 3 waited on `awaitAnalysisChain` being called, so the CUL-801
mutant red it on a `waitFor` timeout rather than on the assertion that names the defect.
It was restructured to wait on the upsert, drain, then assert, so each mutant now reds on
its own line.

`tsc --noEmit` clean; full jest 444 suites / 9,688 tests green; CI green on all three
checks. `code-reviewer`: ship-ready, no blocking findings (details below).

## The review

One should-fix, pre-existing and outside the diff: `app/event/[id].tsx:667` marks the local
attachment `synced = 1` without reading `changes`, so a row detached mid-upload still falls
through to the per-incident re-read and settles the claim `true`. Every by-id writer in
`lib/db.ts` checks this (`:739`, `:763`, `:1127`, `:1147`). The new suite mocks `runAsync`
as `{ changes: 1 }` throughout, so it pins today's behaviour without reaching the zero-row
case, which is C-39's harness half. Filed as **CUL-1098** rather than folded in, because
CUL-813 is deliberately test-only. One nit (the editors' pre-existing `field: { gap: 6 }`)
was left for a token sweep.

## Reconciled without code

Each carries a comment on the issue with the evidence; none changed status.

- **CUL-406 (exposure row → the feeding).** A decision, not a wire-up: the explainable rows
  already spend their tap on the reason sheet, and the other shape adds a control to a
  design-locked sheet. Decision brief on the issue; recommends a sheet action plus inert
  rows tapping straight through.
- **CUL-320 (calendar drill-in rows).** There are now two drill-ins: the legacy
  `DayEventsSheet` (a `Modal`, so C-14 dismiss-first applies) and Design v2's in-place
  `DaySlot`, shipped two days earlier. Wiring only the legacy one re-opens the gap at v2
  GA; routed to the Design v2 track.
- **CUL-433 (edit-event reconstruct race).** Still live after B-527. The seed is `null`
  now, but `buildTimeFields` treats anything not `'found'` as the plain point. Both fix
  shapes carry a hidden half (a C-12 failure state; params the callers don't pass), and
  the screen has no route harness. Engineering-shaped, not sweep-sized.
- **CUL-150 (recap "Photo attached").** `subline` is one slot, and the recap reads its
  trial-diet count back off that slot (`lib/daySummary.ts:251`), so a photographed trial
  meal would drop out of the strip's count. Decision brief on the issue.
- **CUL-355 (dose → regimen attribution).** `lib/medications.ts` is in an Edge closure
  (the ledger gate CUL-370 recorded yesterday), and the change moves dose counts, so it
  owes the adversarial pass.
- **CUL-415 (capture-screen render fixtures).** The `cap_reached` branch sits at the end of
  the full capture → upload → invoke chain on a 1,608-line screen. Suggested split: the two
  flag-off cases are a quick win on their own.

## Residuals

- CUL-1098, above.
- The CUL-130 mock question, above: if the PM reads a label swap as a design change, it
  reverts in one line.
