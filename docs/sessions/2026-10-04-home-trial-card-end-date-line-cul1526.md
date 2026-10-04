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

`adversarial-reviewer` ran three passes and ended with **HELD**.
- **Pass 1** broke on **the implicit zero.** The off-diet clause appears only above zero, so three states where the count was unknown all rendered "Ends Aug 27", exactly like a clean trial.
- **Pass 2** found that the first fix covered only three flags. It missed the full card's own `mayStateRecordClean`: a thin record, a refusal, a bowl, or an unclassifiable feeding at zero still showed the bare date.
- **The final rule:** at zero, the card's clean-record gate decides. Where it refuses, the line adds `off-diet check incomplete`. The word is "incomplete", not "paused", because it has to be true in week one and while the record is loading.
- **What held throughout:** a refusal, a decline, a live safety card, an overrun trial, the floor wording, and a pet switch (mis-attribution only, the same hole the shipped strip has).
- **The sparse-record case** (3 of 30 days logged) reopened G3, so it went to the PM as a brief. **The PM ruled A (2026-10-04): ship as built.**

## The lesson

A clause that appears only when a value is non-zero teaches the reader that its absence means zero. So the clause's absence has to be earned by the same gate the full surface uses to say "clean". Mirroring three of the gate's inputs is not enough (C-34: mirror the question, not the value).

## Persona sign-off

Designer ✓ (the ruled three things, neutral bar, G1 A chevron) — Engineer ✓ (one field beside `line`, no new gate consumer) — Data ✓ (one off-diet source for both lines; the implicit-zero fix) — Dr. Chen ✓ (G3: nothing has a reassuring direction) — QA ✓.

## Residuals

- None open. The PM's A ruling covered the added `off-diet check incomplete` clause as well ("ships as built").
