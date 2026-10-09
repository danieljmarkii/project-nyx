# Engines v3 PR-30: EN-5 server half, unrated means unknown

**Date:** 2026-10-09
**One thing:** S3 L1 — Config flags: merging the code is not releasing it; a missing row keeps EN-5 dark · check: pending

Dispatched session (`/dispatch`, Engines v3, PR-30), CUL-1722 (of CUL-1136). The row was plan-gated (a clinical surface). The plan went on CUL-1136 and the PM typed "go, A" in this session. Shipped via #1140, left open for the PM (see the end).

## What shipped

- **The plan split PR-30 four ways**, one sub-issue per PR, so no PR closes the parent:
  - **CUL-1722, this PR:** the server half.
  - **CUL-1723 (PR-30m):** migration 095, the stored answer.
  - **CUL-1724 (PR-30q):** the question on the record.
  - **CUL-1725 (PR-30s):** the I4 and I5 strings.
- **Does the answer need a new stored fact? Yes.** As a synthetic meal row it would count a refusal as a food exposure (CUL-1190), push real refusals out of the Noticed last-three window, and have no honest home for "Not sure".
- **`lib/intakeEvidence.ts`:** the one intake vocabulary, import-free (GAP-28). It holds the WSAVA scores, the positive and refusal classes, the qualifying meal and the Noticed predicate. `lib/analytics.ts` and `lib/lookWithheld.ts` delegate to it, with app behaviour unchanged (parity suites green), and `analyze-vomit` imports it.
- **The EN-5 step** (`analyze-vomit/context.ts`) runs behind the new key `engines_v3_en5`. A missing row reads as off, so this PR carries no migration.
  - Threshold A, the PM's ruling: a rating half fires on at least one rated meal and none rated Most or All. Unrated meals count neither way.
  - The halves are the 24 h before the vomit; the vomit to the read, capped at 24 h (BRK-2); and the 24 h before the read.
  - The Noticed predicate runs at the vomit and at the after-half's end (I1, in union).
  - A provisional `last_rated` backstop covers the empty-window case and is waiting on the PM.
- **The read's words** state the rated record and how many meals had no rating, anchored to the window that fired. The `nyx-voice` pass made one fix: no sentence opens on a numeral.
- **Failure handling:** a failed meal read or bowl read falls back to the rule without EN-5. `rule_version` moves to `vomit4`.

## The adversarial passes (five rounds, Biostatistician lens)

- **Round 1:** BREAKS.
  - K: a failed bowl read quieted the Noticed check.
  - B and C: two stored sentences could be false (the after-vomit cap; the Noticed instant).
  - A: an empty window was quieter than today.
  - L: clock skew.
  - J: reads more than 7 days after the vomit.
  - Fixed: K, B, C, L and J. A got a provisional backstop.
- **Round 2:** the fixes held. The backstop's first form fired over meals eaten well and on a refused treat (M, N, O), printed "about 0 hours" (P), and missed a refusal four days back (Q).
- **Round 3:**
  - Z3 and Z4: false sentences when a treat or bowl was rated later.
  - Z5: a comment overclaimed a check.
  - Z2: a late read fired louder than today.
  - Z1: one quieter case.
- **Round 4:** proved the backstop can only fire where the shipped rule fires too (future-dated rows aside). Then:
  - R1: a later refusal "answered" an earlier one.
  - R2: tied timestamps made the sentence depend on row order.
  - R3: unrated meals since the refusal went unsaid.
- **Round 5:** R1, R2 and R3 hold, and the backstop still fires only where the shipped rule fires. Three wording breaks:
  - S1: tied qualifying refusals printed a false "not counting treats or free-fed bowls".
  - S2: the word for a Refused/Picked tie depended on row order.
  - S3: the unrated count read as a total but stopped at the vomit.
  - All three are fixed with guards.
- **Round 6:** see the outcome comment on CUL-1722.

Every fix landed with a guard proven by mutation: break the source, watch the test go red, restore. Two tests needed rebuilding because their first fixtures could not fail:
- **The 24 h cap test:** a later All silenced the half either way, so the test passed with or without the cap.
- **The failed-read test:** both rules see no meals when every read fails, so it passed with or without the fallback.

## Decisions

- PM, typed in session: go, threshold A.
- Built in the louder direction, for the PM to rule (briefs on CUL-1136):
  - **The empty window (`last_rated`):** keep A, B (drop it) or C (fire on every empty window).
  - **9/22:** it still fires under A. Its one Picked meal is a rated meal with nothing eaten well, and its sentence is now true. The issue's acceptance line expected it quiet, which holds only under B.
- Kept as shipped, recorded: the pill-pocket false alarm in the rating halves (GAP-28, MFU-7, a separate quieter row).
- Found: the weight lane's exact-copy rule (CUL-1413) makes a P3 cat with two identical saved readings silent in both lanes unless the fall clears 0.6 kg.

## Residuals

- A failed read's row is still stamped `engines_v3_en5` and takes EN-0's copy (stated in the code).
- An `error` check cannot see a capped read (C-42; the windows are days long).
- Clock skew ahead of the server (W, low).
- CUL-1084 was kept out (needs Dr. Chen's ratification and a Signal key).
- The meal card's capture redesign under D2 = b is not this row's work.

## Teach

### S3 · L1: merging the code is not releasing it

A config flag is a switch stored as a row in the database, not in the code. The code ships with both paths inside it, and the row decides which one runs for whom. So "merged" and "live" become two separate decisions. Engineers can land a clinical change long before anyone should see it, and the PM flips it on later, for one test account first, without a new app build.

**Like:** wiring a new light into the house with the switch left off. The electrician can finish today; you decide when the room lights up.

**In today's work:** `supabase/functions/_shared/engineFlags.ts`. The new key `engines_v3_en5` goes into `ENGINE_KEYS`, and its comment says "Absent reads as off, like en3, so this PR needs no migration." Because no row exists, every vomit read after this merges is byte-identical to today's, apart from a version stamp. The new intake rule waits until the PM inserts the row, and that should happen only together with the weight lane (EN-8).

**Why it matters to you as PM:** "can we merge this?" and "should owners get this?" are different questions with different gates. The first is about code quality; the second is your call, made per account, and reversible by deleting a row.

**Check:** if PR-30 merges tonight, what has to happen before any owner's cat stops getting the "hasn't eaten" warning over unrated meals?
