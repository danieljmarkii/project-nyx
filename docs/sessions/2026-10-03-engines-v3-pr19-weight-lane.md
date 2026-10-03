# Engines v3 PR-19 — the weight lane in detection.ts, dark

**Date:** 2026-10-03
**One thing:** none — dispatched session, not this round's teach row

Shipped via #1014. Finishes CUL-1413.

The session first stopped before the wiring, because PR-23 (CUL-1417) owned `generate-signal/pipeline.ts`. After PR-23 merged (#1016), the PM, through the dispatcher, resumed it, and the wiring rides the same PR.

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

## The wiring (resumed after #1016)

- **`main` merged in cleanly.**
- **`main` was failing `deno check`:** `findingIdentity.engine.test.ts`, from #1017, built a `CareRecord` in the shape #1016 replaced. The two-line fix (`EMPTY_CARE_RECORD`) rides this PR and is noted on it.
- **`engines_v3_en8`** joins `ENGINE_KEYS` and `SIGNAL_ENGINE_KEYS`. It adds a finding, so a flip of the key mints no stand-down. It is not seeded, so it stays off. The engine version is now `signal.8`.
- **`readWeightFacts` (`index.ts`)** runs only under the key. It reads:
  - the weigh-ins in the window, with their source, `events!inner` and the parent event's soft-delete, paged to the end on (`created_at`, `id`);
  - the pet's birthday.

  A failed or partial read means no weight lane this run (logged).
- **`mapWeightCheckRows` (`pipeline.ts`)** drops unknown sources and weights that are not positive, and parses NUMERIC strings.
- **The pipeline** hands detection `weight` only under the key; when the key is off, the field is absent from the input altogether.
- **Guards:**
  - (c-en8): flag off equals the run with no facts, even when the facts would raise the firm row. Deleting the gate turns this red.
  - The gate opens on every case.
  - The lane moves no other finding.
  - The shell source pin, plus the read's columns and its failure modes (`index.test.ts`).
  - The stand-down key-set test is restated for the new key.

**Adversarial pass 4 (the fixes and the wiring): FAIL on one break, now fixed.**
- **The break:** a weight card the owner had already seen vanished silently when the weight read failed.
- **The fix:** under the key, a failed or partial weight read now adds `'weights'` to `incompletePulls`, so the row takes the short lifetime and the card is carried and dated (CUL-989). `weight_loss` joins `CARRYABLE`. Removing it turns the new carry guard red.
- **Also fixed:** a recheck date more than a year out is now capped at a year.
- **Cost recorded for the E-6 brief:** a regain logged as two identical values, then a stand-down, then a relapse to the stood-down weight stays silent until new readings form a higher level.
- **Held:** all three of pass 3's fixes (mutation-proven), every stood-down-stays-down shape, the flag gate at both layers, the soft-delete and other-pet exclusion, the window and the order key, and the row mapper.

## Next

- **The CUL-583 rulings before GA:** the exact-copy sign-off, and the three edge rulings (on CUL-1413).
- **PMD-9 re-run by cadence:** PR-16 adds EN-8 to `HARNESS_OBSERVES` once the corpus feeds weigh-ins.
- **PR-37:** the client (the Home row, the finding's screen, the source correction, W5's plain row, which must not quote `story.highBefore` without the boundary).
- **CUL-1390 W3:** the vet report.

## Definition of Done

- **Acceptance (CUL-1413 and CUL-1135's PR-19 row):**
  - The lane in `detection.ts` behind the flag ✓.
  - The ruled values W1–W8 ✓.
  - MFU-8's server registries, with typed completeness ✓.
  - The adversarial pass on code ✓ (four passes, every break fixed and pinned).
  - CUL-508 synthetic weights and PMD-9 by cadence: before GA, not this PR (the ruling sheet's W1 verdict).
- **Not in this PR:**
  - `nyx-voice` on the Home row and the finding's screen (PR-37).
  - Ask's relay (Ask reads cached findings; the template-only card reaches it as text).
  - The vet report (CUL-1390 W3).
- **Types and tests:** `tsc`, `deno check`, `deno test supabase/functions/` (2,430) and the full jest suite (13,481) all green.
- **Persona sign-off:**
  - Data ✓ (four falsification passes).
  - Engineer ✓ (C-36 flag-off guard proven red with the gate deleted; the carry guard proven red with `CARRYABLE` reverted).
  - Designer: template wording, voice pass at PR-37.
  - Dr. Chen: the rulings in CUL-1544.
  - T&S ✓ (a caller-JWT read under RLS, soft-delete via the parent, no free text read).
- **DoD line:** *Biostatistician: tried a stood-down drop resting on a single low reading (home pair, clinic plus home), a plan ending right after one, a spike plus its pre-filled copy before a stand-down, a clinic-confirmed regain then a relapse, a 2062 recheck typo, and a failed weight read after a shown card. Each one broke an earlier draft, and each now holds and is pinned by a test.*
