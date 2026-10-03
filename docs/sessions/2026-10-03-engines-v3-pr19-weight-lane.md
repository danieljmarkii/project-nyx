# Engines v3 PR-19 — the weight lane in detection.ts, dark

**Date:** 2026-10-03

Built in #1014 (draft). It does not finish CUL-1413 yet: feeding the lane real readings needs the `weight_checks` read and a mapping in `generate-signal/pipeline.ts` behind an `engines_v3_en8` key. PR-23 (CUL-1417) owns that file and was running in parallel, so this session stayed out of it and stopped before the wiring. #1014 merges once the wiring lands, either in it or in a follow-up.

## What was built

- **`lib/weightStory.ts`**: the one weight predicate (WG-1). It has no imports and lives in the Edge Function closure. It returns:
  - the sentence: the latest reading and the highest reading before it, each saying whether it is one reading;
  - one state (`none` … `drop_firm`);
  - a raised row whose `says` names only the readings the decision may use.

  The values are the ruling sheet's §2.3, all ruled A on 2026-10-02: W1 with its louder fix, W2, W4, the mixed-instrument margin, W5 (an unknown birthday reads young; firm at 10%), and W6 (target as the cumulative line, the 2%-a-week rate, lapse at recheck or 12 weeks). It also carries the exact-copy rule (§4.3, flagged for sign-off).
- **`detection.ts`**: `weight_loss` (safety) and `detectWeightLoss`, which reads only the optional `input.weight`, so absent is byte-identical.
  - Every species gets the rows (W8).
  - Rank: below burden, above chronicity (W7).
  - `SAFETY_TYPE_ORDER` is now typed over every safety finding, so a new safety type fails the type check until it is ranked (MFU-8 completeness).
  - Local calendar days are attached for the card.
- **`phrasing.ts` / `index.ts`**:
  - The card is template only, in pounds to one decimal, with local dates and the year, and each reading's source. There is no percentage and no difference.
  - A carried card renders.
  - `validatePhrasing` refuses every model sentence.

**Left out on purpose:**
- Ask's relay: `ask/index.ts` is PR-23's.
- The banner and the Home row: client work, PR-37.
- `generate-report`: gated on CUL-1390 W3.

## Falsification record

**Pass 1: FAIL (six findings), fixed.**
- The noise caveat appeared over a slow, steady loss.
- A plan target above 10% was ignored.
- A plan's start level still anchored after the plan ended.
- A relapse after a stand-down stayed silent.
- The card labels and dates were wrong.

**Pass 2: FAIL, fixed.**
- `keepLevelAt` let a stood-down drop resting on a single low reading re-raise itself, and a finished plan re-raise its own loss.
- The fix: one anchor level per boundary, which may stand only as a confirmed high level.

**Pass 3: FAIL, code defects fixed.**
- A clinic regain was discarded by the lower-of-two rule.
- An exact copy of a spike became the anchor.
- A recheck date earlier than the start erased history.

**Open for a ruling** (on CUL-1413):
- A finished plan with no in-plan weigh-in.
- A stand-down during a running plan.
- A start weigh-in more than 24 hours before the plan is set.

**Costs stated, not changed** (louder, so provisional under E-6):
- W2 behaves like D7 above about 12 kg.
- With an unknown birthday, a 30 kg dog gets a soft row on about 0.23 kg.
- A typo can raise a firm card through W2.
- The rate rule fires on 8–25% of cats following their plan.

**Quieter, needs sign-off:** the exact-copy rule.

**DoD line:** *Biostatistician: tried a steady weekly decline (no caveat ✓), a 15%-target plan (quiet ✓), a stood-down single-low drop on a home pair and on clinic plus home (stays down ✓ after pass 2), a clinic regain then a relapse (fires ✓ after pass 3), a spike plus copy before a stand-down (no re-raise ✓), the Nyx record (firm through W2, with a 0.01 kg margin), and 20k shuffled records with stand-downs and plans (order invariant, caveat never beside a row ✓).*

## Checks

- jest: `lib/weightStory.test.ts`, 46 tests.
- Deno: `detection.weight.test.ts`, 14 tests; the full `supabase/functions` suite passes.
- `deno check` and `tsc` are clean.

## Next

Wire the lane after PR-23 merges:
- read `weight_checks` with `source` in `index.ts`, behind `engines_v3_en8`;
- map it into `DetectionInput.weight` in `pipeline.ts`;
- add the key to `SIGNAL_ENGINE_KEYS`;
- add the C-36 flag-off guard;
- register the 072 reader (if any) in `guards/weightDisplacements.test.ts`.

Then get the three rulings above, the exact-copy sign-off, and PMD-9's re-run by cadence before GA.
