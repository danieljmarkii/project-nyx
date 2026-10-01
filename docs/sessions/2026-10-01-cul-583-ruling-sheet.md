# The clinical ruling sheet, parts 1 and 2 (CUL-583)

**Date:** 2026-10-01 · **Mode:** DISCOVERY · shipped via #995 (draft; a document only)

## What shipped

- `docs/clinical-ruling-sheet-2026-10.md`, the ruling sheet E-6 (amended 2026-09-26) put in place of the vet sitting
  CUL-583 was filed to book. Dr. Chen is a persona, so that sitting was never bookable.
  - **Part 1 (the 1.2.0 cut):** sixteen rows (R1 to R15, with R13 split into a and b). Each row gives the question,
    today's behaviour at file:line, the recommendation, the counterexample, the direction versus today and the E-6
    verdict. A one-screen ruling table leads, with CUL-60(b) (the nine-day silence) at the top.
  - **Part 2 (Engines v3):** every Engines v3 item posted on CUL-583 since 2026-09-24, grouped by the PR each one
    gates (PR-16, 19, 22/23, 26/28, 29, 30, 32).
  - Each part ends with its real-vet list for CUL-1312.
- `docs/clinical-ruling-sheet-part1.html`, published as https://claude.ai/artifact/KogqNFeWk8CKTd2juAinQh. Part 1 is
  laid out as phone cards with agree/letter buttons and a "copy rulings" box, and each card deep-links as `#r1` …
  `#r15`.
- On Linear: the Part 1 ruling table on CUL-583, plus a one-line row pointer on each of CUL-54, 55, 56, 57, 59, 60,
  179, 267, 311, 367, 381, 749, 757 and 758.

No code, threshold or `app_config` value changed.

## What broke, and how it was fixed

The isolated `adversarial-reviewer` **failed the first draft of Part 1**. It executed its counterexamples in a scratch
copy of the repo. Three rows were labelled louder or neutral but were quieter on a real record:

- **R13a** (CUL-757/758): "exclude the prescribed diet on days with no trial diet row in force" erased a diet the vet
  had withdrawn and unlocked an affirmative clean claim. The rule now excludes only feedings before the food's first
  row, never after an end; excluded feedings still block "clean"; and the gap shows on the card too.
- **R14** (CUL-749): reading the whole trial *instead of* the window diluted 7/8 to 7/48 and dropped a flag that fires
  today. The rule now ORs the two facts and prints each span's counts separately.
- **R2** (CUL-54a): gating the past tense on "the now-fact is null" put a false past tense over a cat refusing that
  day. The gate is now "no unfinished feeding in 14 days".

The reviewer also fixed wording on R4, R7 and R12, broke R5's reasoning (declining a louder option for a reason two
other rows contradict, so it is now adopted), and measured R10's noise rate on vomit itself (4.13% at 5). Its record
is the sheet's §1.5. Part 2 had no separate adversarial pass.

## Decisions taken in-session (for the PM to ratify via the sheet)

- E-6's "louder" and "quieter" are read against **today's shipped behaviour**. For the unbuilt weight lane they are read
  against **D7 as ruled**, the comparison the weight spec itself uses.
- A "no change" recommendation that declines a louder option must give a reason consistent with every other row
  (R5's lesson). Declines that stand: R3 (no floor), T4 (3 in 24 h stays today), T11 (persistence stays 3, with a 48%
  chance rate at 2) and T13 (fresh blood stays today until a quantity field exists).

## Residuals and filed issues

- CUL-1444: the scorecard still reads EN-9.reRaise as unruled after the 9/28 ruling, and two documents disagree on
  the 1.5× trigger's figure.
- CUL-1445: no proposal exists for the concern words and co-sign sources (critique PMD-10), so row C1 cannot be ruled.
- PR #995's title carries `CUL-583` as briefed. A title token closes the issue on merge (CUL-1397), so the PM
  retitles before merging or reopens afterwards.
- The cold read's three original agenda asks (left-censoring, unlogged-medication caveat, the delta render) were out
  of the scope the PM set for Part 1 and were not re-verified.
