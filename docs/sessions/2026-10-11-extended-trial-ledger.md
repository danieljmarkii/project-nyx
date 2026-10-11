# The extended trial keeps its day ledger (CUL-1855)

**Date:** 2026-10-11
**One thing:** D4 L1 — Guards: a test is proven by breaking the code it protects, and a mutant that survives is either a test gap or a path production can't reach · check: pending

Shipped via #1189.

## How it started

The PM asked why the trial screen on their device showed no calendar-like grid, when an earlier session had shown one. Their real record explained it: Nyx's rabbit trial was set for 56 days (`target_duration_days_initial`) and extended to 84, and the PM was on day 78 with meals logged on all 78 days. Coverage stays measured over the designed window (CUL-1038's freeze, the B-422 tail clip), so the caption read "Meals logged on 56 of 56 days". `lib/trialLedger.ts` withheld the whole ledger on that shape (`range.closedByOverrun && range.endDayIndex < targetEnd`), because an 84-row grid under a 56-day caption breaks S3. The earlier screenshot was a test fixture of a never-extended trial.

The rule protected the caption and cost the grid for every day of every extended trial, which is exactly the trial an owner opens daily. CUL-1855 was filed. While planning, the session found CUL-1317, which had filed the same gap on Sep 26 at Low priority. CUL-1317 was marked a duplicate, because CUL-1855 carries the mock and the ruling.

## The decision

Mock round 3 went into `docs/culprit-trial-screen-mockups.html` §00, published to the same artifact URL as rounds 1 and 2. It drew three frames side by side:
- today (no ledger);
- option A (draw through the new end, the counted window marked, the extension in its own band);
- option B (the counted 56 days only).

The PM ruled **option A** the same day. The ruling carried the Tier-2 edit to `docs/nyx-trial-screen-requirements.md` §3.5 (now v1.2).

## What shipped

- **The fact** (`lib/dietTrial.ts`): `TrialFacts.extensionCoveredDayIndices`, the non-treat logged days past the clipped coverage end through the evidence end. It is populated only when `range.coverageClippedAtWindowEnd`. It is drawn from the same `loggedDays` walk as `coveredDayIndices`, so the two cannot disagree about what a logged day is. It is a drawing fact, never a count.
- **The ledger** (`lib/trialLedger.ts`):
  - Rows run to the live target.
  - Days past the designed end carry `extension: true`, are painted from the new fact, and roll into a per-row `extensionCount`. `count` never takes them, so the C-3 partition of the caption is untouched.
  - The end line moves to the designed end: *… the end you first set. The count above stops here.*
  - The band carries *Extended to {date} · not in the count above* and *{date} · day 84, the end you set*.
  - The accessible sentence speaks the band after the count.
  - Home's lane stays off in the band.
- **The component** (`TrialLedger.tsx`):
  - The band is a hairline box. The first draft gave it a grey ground, which would have swallowed the `not_reached` cells (same grey). The mock was corrected to match.
  - A week straddling the designed end is split at the line, with leading gap cells keeping weekday columns.
- **Deploy ledger:** `generate-signal` is held (CUL-552 consent). It inlines `lib/dietTrial.ts`, so its fingerprint moved; the fingerprint was updated, with a sentence in the hold's reason. It never reads the field. `generate-report` redeploys on merge with unchanged output.

## What broke, and the fix

The first adversarial pass found the one break. On an un-ended trial extended to day 80, with bowls refused on days 79–80, viewed on day 81, the ledger drew the refusals as logged days. The CUL-1344 withhold only ran while today was on the grid, and day 81 is past the grid while its week (days 78–84) is partly drawn. Before this PR that record drew no ledger at all, so it was new reach.

The fix checks today's trial week whenever that row is drawn. That also closes the same gap on a plain overrun whose window ended mid-week, and it only ever withholds. The second pass swept 6,439 real-loader records in five zones: no refused bowl in today's drawn week paints as logged, the sweep fails on the pre-fix code, and a before/after diff shows 212 changes, all drawn → withheld, none on ended or normal running trials.

**Residual, filed for a ruling:** past the end, with today's week off the grid, a refused bowl in the last drawn week still paints. That is CUL-1344's ruled "today's week" boundary, unchanged for plain overruns and newly reached by extended trials. Filed as CUL-1875 with a recommendation (fall back to the last drawn week; withhold-only).

## Falsification record

- Biostatistician:
  - 56/56 with a silent extension → band reads `0 of 7` hollow, caption unchanged, nothing reassures ✓.
  - 10/56 counted with a full band → the band never enters `count`; C-3 parity goes red under mutation ✓.
  - Free-fed bowl only in the band, 14 refused band bowls, a re-photographed refused bowl today in a band week → all absent ✓.
  - Extended to 80, refusals on days 79–80, today 81 → broke, fixed, re-swept ✓.
- Mutation proofs on the build: band days leaking into `count`, the band painted from the counted set, the band withhold dropped, the band withhold narrowed to band days only, and the old pre-fix condition all go red. One mutant (dropping the unclipped-overrun gate) survived because no loader can produce that shape. It is now pinned by a test on hand-altered facts. The ledger always reads the whole trial, so the clip always bites.
