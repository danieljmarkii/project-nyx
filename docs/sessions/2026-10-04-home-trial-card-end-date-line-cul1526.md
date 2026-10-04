# Home's trial card under Design v2: title, neutral bar, one end-date line (CUL-1526)

**Date:** 2026-10-04
**One thing:** none (dispatched session, not this round's teach row)

A BUILD session that `/dispatch` sent out as PR-29 of the Out of beta run order. It builds the PM's G2 B + G3 B rulings on the CUL-1519 mock (round 2 §04). Shipped via the PR on branch `claude/out-of-beta-noticed-design-v2-history-v2-the-trial-screen-pr29-10041757`.

## What shipped

- **`lib/dietTrialCard.ts`:** `TrialStripModel` gains `cardLine`.
  - It opens with `Ends {date}`, or `Window ended {date}` when the trial is overrun. Then `· {n} off-diet feeding(s) logged` when n > 0. Then `· off-diet check incomplete` when the count could not be checked (no usable permit set, an unread classification, a dark antigen arm, or, at zero, any record the full card will not call clean: thin, refused, a bowl, an unclassifiable feeding).
  - It carries no food label, no ratio and no vomiting pair.
  - The shipped `line` is untouched, so every flag-off reader (the strip, the door, Get ready, the rundown) is byte-identical.
  - On a live intake decline the early return keeps `cardLine: null`.
- **`components/designV2/home/TrialCard.tsx`:** the title, a neutral bar (`colorTextTertiary`, the mock's #737373), the one line and a bare ›. The spoken label is exactly the visible lines.
  - There is no week lane, because the ruling is "three things".
  - There is no safety branch, because G3 B rules the card identical under a safety card.
- **`components/home/TrialStrip.tsx`:** draws the card when `trial_screen` is on, a pet exists, and `designV2` is true. `designV2` arrives as a prop from Home's existing `useDesignV2()` read, so the gate has no new consumer (C-36).
- **Tests:**
  - Per-state checks over the real resolver.
  - A property over `everyState`, armed with a full ratio and a falling vomiting pair, plus a non-vacuity floor. The ratio mutant reds 19 tests.
  - A check that unknown and clean states never render alike.
  - The card's label equals its visible lines.
  - The four combinations of the two flags are each pinned.

## Falsification

`adversarial-reviewer` found one break: **the implicit zero**. Because the clause appears only above zero, three unknown-count states rendered "Ends Aug 27", identical to a clean trial. This is fixed here under the absence ≠ wellness invariant, with the paused clause. Everything else held: a refusal, a decline, a live safety card, an overrun trial, the floor wording, and a pet switch (mis-attribution only, the same hole the shipped strip has). The sparse-record case (3 of 30 days logged) re-opens G3, so it went to the PM as a decision brief on CUL-1526 (recommendation: keep G3 B).

## Persona sign-off

Designer ✓ (the ruled three things, neutral bar, G1 A chevron) — Engineer ✓ (one field beside `line`, no new gate consumer) — Data ✓ (one off-diet source for both lines; the implicit-zero fix) — Dr. Chen ✓ (G3: nothing has a reassuring direction) — QA ✓.

## Residuals

- A PM brief on CUL-1526 covers the sparse-record clause, recommended A (no change).
- The added `off-diet check incomplete` clause is new owner copy beyond the mock's three drawn lines. It is a team call under the safety invariant, and the PM can reverse it on the issue.
