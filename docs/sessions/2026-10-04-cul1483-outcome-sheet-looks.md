# The trial outcome sheet stops claiming no symptoms over the owner's daily looks (CUL-1483)

**Date:** 2026-10-04
**One thing:** D4 L1 — A test is proven by breaking the code it guards (mutation) · check: pending

BUILD session from a Linear paste. Shipped via #1040.

## What shipped

- `lib/dietTrialOutcomeFacts.ts`: the loader now carries `duringHasLooks` beside `beforeHasLooks`. Both record presence only; a look still enters no count, no logged day and no coverage.
- `lib/dietTrialCompletion.ts`, `buildOutcomeSheet` / `densityLine`:
  - **No symptom rows, a look in either stretch.** The fact line is `OUTCOME_LOOKS_FACT_LINE`: *What you noticed on your daily looks isn't counted here. Only the symptoms you log are.*, never *No symptoms are on the record for either stretch.* Every sentence that pointed at counts takes its referent-free form:
    - the title becomes *Before you close this trial*;
    - the untracked comparison ends *nothing to compare with.*;
    - a tracked before-stretch gets a scope line, *Looking at the trial and the 8 weeks before it started.*;
    - the density tail stops at *not how {pet} was.*;
    - the question and note take the decline branch's pair, *How has it seemed to you?*
  - **Symptom rows plus looks.** The same line renders under the counts.
  - **No looks.** The sheet is unchanged.
- Tests cover the issue's two repros over the real loader: looks in both stretches, and a well-logged before-stretch with looks only during the trial. They also cover the pad-day look, the per-type zero, and each branch at the builder level.
- Mutation proof: nine mutants, each turning at least one test red. They dropped either half of the either-stretch OR, the loader's during write, the question swap, the under-counts line, the title, the comparison, the density tail, and the scope line.
- Full suite: 614 suites green. `tsc` is clean.

The sheet's text is never stored. `endActiveTrial` writes only `outcome` and `outcomeNotes`, so the fix is client-only and ships OTA. No Edge Function closure is touched.

## What the issue under-scoped

The issue asked for the global absence line. The first `adversarial-reviewer` pass found the same claim one level down: *Itch/Scratch: 14 before · 0 during.* while the looks said *Scratching more*. That is the flattering direction, on the screen that ends the trial. It was folded in here because it is the same sentence class, the same line and the same invariant (§5.1 row 1b). The same pass found three sentences pointing at counts that were not on screen. The second pass found a fourth (the tracked comparison line). All four were folded.

## Falsification

| Pass | Tried | Result |
|---|---|---|
| 1 | Looks in both stretches, no symptoms | Held |
| 1 | Pad-day and future-day looks | Held, neither sets the flag |
| 1 | Decline branch | Held, the component hides the facts |
| 1 | Is the question text stored? | Held, it is not stored |
| 1 | 14 → 0 itch beside *Scratching more* looks | **Broke.** Folded |
| 1 | Dangling *these* / *counts above* / title | **Broke.** Folded |
| 2 | 112-sheet grid (before stretch untracked / sparse / sparse-no-meals / full × looks × symptoms × decline) | The absence line never renders beside a look; the looks line rides every per-type zero |
| 2 | Tracked before-stretch with no counts: *Compared with…*, and the sparse *than it looks* beside the looks line | **Broke (low).** Folded as the scope line |
| 2 | Cancel → log a look or a vomit → reopen | **Broke, older bug outside this diff.** The sheet caches its first read. Filed CUL-1560 (GA gate) |

## Filed

- **CUL-1560**: the outcome sheet keeps its first read across a close and reopen. Medium, GA gate.
- **CUL-1561**: the no-looks, no-symptoms sheet still points at counts it doesn't show. Low, copy. It carries the open question of whether *Does that match* belongs over an empty record.
- **CUL-1562**: the loader places looks by the device-zone clock rather than `looks.local_day`. Low.

## Residuals

- Any `check_in` sets the flag, including looks that were all *nothing unusual*. That over-fires in the safe direction: a disclosure line, never reassurance. Narrowing it to symptom-class words would need the loader to read look words, which is CUL-845's territory.
- The title *Before you close this trial* now serves both the decline pause and the no-counts sheet. It is neutral in both.
