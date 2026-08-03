# Antigen-arm + trial-selection alignment — B-597, B-598, B-601

**Date:** 2026-08-03 · **Branch:** `claude/antigen-arm-trial-alignment-3gdmp9` · shipped via **#575**

The three residuals `adversarial-reviewer` pass 5 filed against the B-529 report/card
antigen seam, closed together because they are one shape — **the one-record-two-answers
class**: `TrialFacts.antigenArmDark` reached the vet report and the claim gate but never
the two *owner* surfaces, and the card and report selected the "current" ended trial by
different predicates. The through-line of the fix is **one predicate, read not
re-derived** — the report already reads `antigenArmDark` + `antigenAttributionPaused`, so
the card now reads the same fields instead of computing its own answer.

## What each was

- **B-597** — `antigenArmDark` fed `mayClaimAllMatched` (report + card claim gate) but was
  never on `TrialCardInput`, so `withholdingReasons` had no dark-arm entry and the Home
  strip stated a plain coverage ratio while the protein arm was off. Its structurally
  identical sibling `allowedSetUnavailable` was already there.
- **B-598** — on a `primary_diet` membership gap the report renders "Antigen check paused"
  + the §7.2 caveat while the card's `trialDietNote` returned `null`: its
  `uncharacterizedTrialDietFoodsInRange` re-derivation had nothing to name, was
  `today`-anchored (a row in force today masked the gap), and its range END was `Date.now()`
  (over-fire on ended trials).
- **B-601** — `TRIAL_FOR_CARD_SQL` required `ended_at IS NOT NULL` (no `completed_at`
  fallback) and ordered `synced DESC` before `started_at DESC` with an ASCending `id`;
  `selectReportTrial` falls back to `completed_at` and ranks `[running, startDn, id]`. A
  device holding two ended candidates — or one row missing `ended_at` from an old write —
  could render card 7a about one trial while the report described another.

## What shipped

- **`lib/trialContaminant.ts`** — `trialDietNote` branch #3 no longer re-derives the pause.
  It takes the module flag (`opts.antigenArmDark` + `pausedLabels`) and renders the new
  shared `antigenPausedNote()` — the owner-register mirror of `render.ts`'s row, named
  /unnamed by the same split. Deleting the re-derivation deletes the range-end nit and the
  today-anchored masking. Precedence preserved (contamination #2 > pause #3 > ingredients #4).
- **`lib/dietTrialCard.ts`** — `TrialCardInput.antigenArmDark`, a `'antigen_arm_dark'`
  member on `TrialCardWithholding`, its push in `withholdingReasons` (the strip withholds).
  `stripOffDiet` deliberately NOT zeroed under a dark arm — §5.3, a dark arm costs
  attribution, not detection.
- **`lib/dietTrialFacts.ts`** — `loadDietTrialFacts` reads `armDark`/`pausedLabels` off
  `facts` (like `allowedSetUnavailable`, not range-gated — the degenerate `base` reports
  not-dark), passes them into `readStandingNote` → `trialDietNote`, and has a fallback
  (`standingNote ?? (armDark ? antigenPausedNote(pausedLabels) : null)`) so the disclosure
  survives the ctx===null / protein-context-read-failure path. Sets `antigenArmDark` on the
  returned input. **B-601:** `TRIAL_FOR_CARD_SQL` → `COALESCE(ended_at, completed_at)` +
  `ORDER BY (status='active') DESC, started_at DESC, id DESC`, aligned with
  `selectReportTrial`. Exported for the real-engine test.
- **`lib/dietTrial.ts`** (post-review, finding 1) — `computeTrialFacts` filters nameless
  (empty/whitespace-`label`) foods out of `antigenAttributionPaused` at the source, so a
  food with no name can't be named and falls into the arm-dark-nothing-to-name case both
  surfaces already handle. The `antigenArmDark` math is untouched.

## Tests

- `trialContaminant.test.ts` — rewrote the `B-529 R7(c)` block to the flag-driven contract;
  new membership-gap (unnamed) case, precedence-preserved contamination-outranks-pause,
  flag-absent quiet, and a direct `antigenPausedNote` block (named/plural/gap/blank-label).
- `dietTrialCard.test.ts` — `antigen_arm_dark` added to the exhaustive `withholdingReasons`
  assertion + `REASONS_RESTATED` oracle + the per-reason strip "drops the ratio" table.
- `dietTrialFacts.test.ts` — a `diet_trials` table added to the real-`node:sqlite` harness;
  a **B-601 selection-parity** suite (completed_at fallback, grace exclusion, start-then-id
  never-synced, id-DESC tie, active-outranks) run against the production SQL string; and an
  **end-to-end wiring test** through the real `computeTrialFacts` proving `input.antigenArmDark`
  + the fallback naming the module's food.
- `dietTrial.test.ts` — a nameless-dark-food test (finding 1): the arm darkens, the list is
  empty, the claim is withheld off the boolean.
- **jest 4249 / 194 suites green, `tsc --noEmit` clean.** Deno report suite validated in CI
  (the source filter renders the five cold-read artifacts identically — named foods survive;
  the unnamed variant an empty list produces is already pinned at `trial.test.ts:3123`).

## Adversarial review — mandatory (one-record-two-answers), PASS

All six counterexamples HELD (two via empirical probes against the real predicate + a real
SQLite engine): the quiet direction on the card (only the B-596-safe never-fed-already-
sanctioned silences), precedence (the claim gate reads `facts.antigenArmDark`, not the note,
so no affirmative leaks through the note seam), strip completeness (`stripOffDiet` correctly
left ungated), B-601 selection (agree for every co-eligible case), the fallback (no
double-render / no render-when-not-dark / no phantom label), and `facts` gating (a null
range reports not-dark but never composes into an all-clear).

Two findings, both the one-record-two-answers class, both fixed before merge:

1. **LOW — empty `food_label` divergence.** A nameless `primary_diet` food darkening the arm
   made the card render the unnamed variant (it filters empties) while the report rendered
   the named variant with an empty bold. No reassurance leak (both gate the claim), but the
   disclosure diverged — the exact class B-598 closes, at the empty-label edge. **Fixed at
   source:** `computeTrialFacts` now filters nameless foods from `antigenAttributionPaused`,
   so both surfaces read the same list. Covered by `dietTrial.test.ts` (the list filters) +
   the pre-existing Deno unnamed-render test (the report renders the gap variant for an
   empty list).
2. **DOC — an unreachable residual in my B-601 comment.** I documented a
   `started_at`-timestamp-vs-day-index divergence, but `started_at` is a `DATE` day-key on
   both sides, so same-local-day trials tie identically. **Corrected**, keeping the real
   latent risk: A-2's proposed `paused` status would split the card's `IN ('completed',
   'abandoned')` from the report's `!= 'active'`.

The lesson this seam keeps teaching (four B-529 passes, now a fifth finding): the relation/
math is never the risk — the wiring is. Both findings were wiring/copy, neither leaked
reassurance, and the fix for both was to make one predicate the source of truth.

## Notes for the redeploy

The report source now carries the nameless-food filter (finding 1), which will land at the
next `generate-report` redeploy along with everything else on `main` since v13. It renders
the five `vet-report-cold-read` artifacts **byte-identically** (they use named foods), so the
redeploy gate ("CLINIC-READY on all five") is intact and no fresh cold read is owed for it.
