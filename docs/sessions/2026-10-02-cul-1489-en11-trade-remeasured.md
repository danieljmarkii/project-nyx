# CUL-1489: EN-11's trade, re-measured before the ruling

**Date:** 2026-10-02 · **Mode:** DISCOVERY · **Branch:** `claude/practical-goodall-x2hlh3`
**One thing:** P1 L1 — The strategy kernel: diagnosis, guiding policy, coherent action · check: pending

Shipped via #1005 (this record only). The brief is on CUL-1489; the decision stays with the PM.

No engine code changed. The deliverable is the revised decision brief, posted on the issue. This record holds the method and the numbers behind it.

## Why re-measure

PR-32 (#1002) built EN-11 dark and reported that it fails PR-16's line, "worsening detection no slower than shipped". The issue offered A, B and C. Before the PM ruled, two questions were open:
- Which part of EN-11 costs the detection?
- How much of the shipped engine's "detection" is chance? Its null pets get a false worsening card 83% of the time.

## Method

These were scratch jest runners over the EN-1 harness (`runCorpus` / `simulate` with `makeSignalObserver`), run through `jest.scorecard.config.js` on seeds 10000–10029. Nothing was committed.
- **Floor-only arm:** EN-11 with `EN11_CONFIG.en11.worseningCardMinEpisodes` set to 2. Nothing else changed.
- **Placebo:** each detection scenario kept its id, so the random streams are identical, with the scored `rate_step` removed:
  - the doubling, on `inj-rate-doubling`;
  - the diarrhea step, on `inj-enteropathy-onset`.
- **Any-ask:** for each pet clear of a vet ask in the 7 evenings before the start, whether any card on that pet carried an ask (`ask !== 'none'`) within 56 days, and the median delay. It also records the share of evenings with an ask in weeks 5–8 after the start.
- **Null pets:** all 13 null scenarios, run at floor 2.

PR-32's rows reproduced exactly at floor 3.

## Results

| | Flag off | EN-11, floor 3 | EN-11, floor 2 |
|---|---|---|---|
| Null pets with a false worsening card, pooled, 180 d | 0.83 | 0.28 | 0.83 |
| Vomit doubling caught (median days) | 0.85 (7.5) | 0.46 (22) | 0.85 (7.5) |
| The same, placebo | 0.62 (15) | 0.25 (22) | 0.62 (15) |
| Diarrhea onset caught | 0.60 | 0.07 | 0.60 |
| The same, placebo | 0.10 | 0 | 0.10 |
| Enteropathy vomit caught | 1.00 | 0.93 | 1.00 |
| Kennel-cough cough caught | 0 | 0 | 0 |
| Doubling cat: any vet ask ≤ 56 d (median days) | 1.00 (5) | 0.95 (16) | 1.00 (5) |
| The same, placebo | 0.67 (10.5) | 0.50 (20) | 0.67 (10.5) |
| Doubling cat: evenings with an ask, weeks 5–8 (placebo) | 79% (35%) | 78% (33%) | 79% (35%) |
| Enteropathy cat: any vet ask ≤ 56 d of the diarrhea onset | 1.00 | 1.00 | 1.00 |

A simulated check of option A's persistence arm: diarrhea on 3 days in a row, at 1.5 episodes a month, within 56 days, reached 0.65% of cats.

## What it changed

- **The floor (E1) is the whole trade.**
  - At floor 2, EN-11 equals flag off on every worsening row and on the null false-card rate.
  - The food half (D5 = B, the reversed control, the control windows) costs no worsening detection.
- **The doubling loss is mostly chance cards leaving.**
  - Above the placebo, flag off is +23 points and EN-11 is +21. At 30 seeds the noise is about ±13 points, so that is no visible difference.
  - The real cost is the first vet ask: median 16 days, against 5.
- **The diarrhea loss is real for the diarrhea card** (+7 against +50 points).
  - It costs no vet ask in this corpus, because the only diarrhea onset comes 10 days after a tenfold vomit rise.
  - No synthetic cat has diarrhea that rises on its own.
- **Option A's mechanism cannot close the gap.**
  - The persistence arm almost never fires at these rates.
  - It does not touch the doubling row, because vomit already has the burden card.
- **The better floor is relative to each pet's own rate.**
  - 2 diarrheas in a week from a baseline of 0.3 a month happens by chance about 1 week in 400.
  - 2 vomits in a week from 3 a month happens by chance about 1 week in 6.
  - A floor set relative to the pet's history would keep the first card and drop the second.

**Revised options on the issue:**
- **B′ (recommended):** ship floor 3, and amend E-6's line to placebo-corrected detection plus any vet ask. CUL-1494 becomes a GA gate.
- **A′:** a floor relative to each pet's own rate, before GA.
- **C:** drop the floor.

## Falsification of the reading

- **Same random draws:** the enteropathy vomit row is identical in the real and placebo runs, so the streams did not move.
- **Floor 2 changes only the floor:** that arm overrides one field, and its null rate matches flag off.
- **Sample size:** 30 seeds cannot separate +21 from +23. The go-live size (1,000 seeds, after CUL-1441 / CUL-1442) settles it.

## Filed

- **CUL-1493:** the EN-1 scorecard's placebo arm and any-ask row. It also states that the kennel-cough row is vacuous.
- **CUL-1494:** a corpus cat whose diarrhea rises on its own, at a low rate and a moderate rate.

## Lesson

A non-inferiority line on detection has to be paired with the same engine's chance rate on the same pets, not just with a false-card line elsewhere in the file. A pass line written against the shipped engine's raw detection counts that engine's noise as a capability. Any honesty change that removes noise then fails the line by construction, and the brief that follows argues the wrong trade.
