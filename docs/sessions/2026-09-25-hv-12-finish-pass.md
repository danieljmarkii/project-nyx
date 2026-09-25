# History v2 step 4, HV-12: the finish pass

**Date:** 2026-09-25

Shipped via #921 (CUL-1169, CUL-1264, CUL-1266). Filed: CUL-1258, CUL-1259, CUL-1260, CUL-1261, CUL-1262, and four PM calls, all ruled in-session (CUL-1263 (a), now its own build; CUL-1264 (a), built here; CUL-1265 (b), closed; CUL-1266 approved, spec v1.7 written here). The device script is on HV-13 (CUL-1171). Round 5 of the mock was republished to the same URL (versions 9 and 10) with the new words.

## The ask

HV-12 is the finish pass over History v2 and Home's shared row before the PM's device pass. The issue asked for:
- a fresh product read as Jordan and Sam;
- the `nyx-voice` pass over every new string, with the door labels as placeholders;
- the §7 walk, with every criterion pass or fail and its test;
- an accessibility sweep;
- one count-parity check against the vet report;
- the device-pass script, posted on HV-13.

Its comments carried the copy lists from HV-4, HV-7 and HV-8. The plan went to the PM with the findings, the wording table and three product calls. The PM said "go" without ruling the three calls, so each is filed on Waiting on PM.

## What the passes found

- **`pm-feature-review`** (Jordan, Sam, Dr. Chen): nine flows SHIP-SHAPED or needing only a device check; NEEDS-WORK on five. The findings that mattered:
  - The trial door, *Before and since the trial ›*, opens *The trial so far*, which draws no "before".
  - *no stool logged* on a day of loose stools.
  - The empty state blamed the owner's filter on Jordan's daily Vomit + Today check.
  - Search's *Done* threw the results away.
  - A visit-only day said *nothing logged* above the visit.
  - *10 logged* beside two rows read as ten more somewhere.
  - Home's Today line never names an unfinished meal, while History's header does.
- **The §7 walk:** 32 PASS, 7 PARTIAL, 1 FAIL, 1 GATED.
  - **FAIL, AC 38:** the copy guard never saw History v2's words. A `!` planted in four files stayed green.
  - **A code gap, AC 5:** pull to refresh re-read the list but not the pinned row. A pull calls `syncNow` directly, which moves no hydration tick.
  - **PARTIAL:** AC 1 (the strip outside the agreement table), AC 9 (no dose in the R-2 property), AC 21 (no History-screen offline test), AC 39 (nothing checked a note stays off the row), and AC 17 and AC 37 (tests that stop short of the screen).
- **Vet-report parity** (owner-scoped, C-27): Nyx, *Since the last vet visit*, Sep 16 – 25 (Chicago).
  - History reads *4 vomits on 3 days · 1 day with nothing logged*. The report's rule gives 4 vomits (no same-minute pairs in the window) and 9 of 10 days with a log.
  - Over All time there are 46 vomit rows with one same-minute pair. History discloses 1 and the report counts 45, so the two reconcile.

## What changed

- **The words** (`lib/historyDays.ts`, `lib/stripMarks.ts`, `lib/historyControls.ts`, `lib/historyScreen.ts`):
  - **Doors** name what they open: ***The trial so far ›*** (its screen's own title), ***Vomiting over time ›***, and ***Symptoms on Patterns ›*** under All symptoms.
  - **Coverage** reads ***N days with nothing logged***. **Duplicates** read ***N possible repeats within a minute***, which is also true of a triple.
  - A **today-only window** says ***nothing logged yet***.
  - **Search** reads ***Searching for "…"*** with ***No count here, because search reads names, not ingredients.*** Its button is ***Cancel***, and a drag puts the keyboard away.
  - **Nouns:** *12 with a photo*, *formed stool*, *weigh-in*.
  - **Day headers:**
    - A filtered header ends ***N in all***.
    - All symptoms names each kind.
    - A dose filter reads ***2 logged · 8 in all · 1 dose not given in full***.
    - A day whose only content is a visit shows its date alone.
  - **Gap lines** lead with the date.
  - **A filter with nothing to show** names the record: ***No vomit logged yet*** / ***…yet today*** / ***…in this date range***. Noticed has its own state, which never says a look is missing.
  - **Sheets:** ***Photos and notes*** and ***Date range***.
  - **The strip** speaks *a meal not finished*, the header's words.
- **The pull re-read:** `pullTick` in `store/historyListStore.ts`, bumped after the pull's sync, and read by `hooks/useHistoryRecordFacts.ts`.
- **The guard:** `guards/historyV2Copy.test.ts` reads every string in History v2's files and the shared row with the TS AST (about 1,080 strings) and fails on a `!`. It has a detector probe and states its blind spots. It is proven red by a real `!` planted in `lib/stripMarks.ts` and in `components/historyV2/HistoryList.tsx`, each restored.
- **Tests:**
  - AC 1: the strip joins the window × filter agreement table.
  - AC 9: the R-2 property holds a Partial dose inside a picked-at, noted meal (512 subsets), with a non-vacuity check on the dose's vehicle and chip.
  - AC 21: History's offline rose and *Photo not read*.
  - AC 39: a note is never drawn or spoken.
  - New cases for the pull tick, the quiet states, the header's tone, and the new nouns and forms.
- **The mock** (round 5, same URL): the new words on every frame, *Try again* as `EmptyState`'s text link (the component wins, per HV-7), *Medication* alone for an unnamed dose (HV-6's ruling, which the mock still drew the old way), and a ledger row naming this pass.
- **`docs/engineering-lessons.md`:** a C-25 addendum. A guard keyed on sinks cannot see copy that is returned.

## Decisions

- **The copy is this session's call, per the issue.** The facts and their order did not move.
- **The trial door carries its destination's title.** It no longer promises a comparison. That comparison exists nowhere in the app (CUL-1258).
- **A dose filter's header reads "logged".** This came from the adversarial pass. *1 dose* beside a day naming *1 not given in full* made a dose left unconfirmed in a refused meal read as given, because nothing qualifies it. "Logged" is CUL-1193's ruled word, and with "in all" on the total it no longer collides. Naming the unconfirmed doses stays CUL-1209's (Waiting on PM).
- **A visit-only day shows its date alone.** The first round's *nothing else logged* called the visit a log, which the strip and the coverage clause (a visit is no event) do not. Coverage keeps counting that day, matching the report.
- **Three product calls were filed, and the PM ruled them in the session, along with the spec edit:**
  - **CUL-1264 (a):** *Outside the trial diet ›* also shows under a symptom filter while a trial overlaps the window. Built here: `countLineOf`, plus a mutation-proven test. The count line's doors now sit in one wrapping row, as round 5 draws them; each door is a 44pt box with no hitSlop, so no C-5 slop to separate.
  - **CUL-1266 approved:** spec v1.7 is written in this PR (§0.6 records all four rulings), and CLAUDE.md's Read-These row now says v1.7.
  - **CUL-1265 (b):** All time stays the default. Nothing to build; the issue is closed.
  - **CUL-1263 (a):** Home's Today line adopts History's day header. This is its own build, not part of this PR: it changes a shipped `design_v2` surface whose chips the Daily Recap shares, and it needs a Home mock frame first (Mock what you change). The issue now carries the build scope.
- **STATUS.md is unchanged.** No track boundary moved.

## The reviews

- **`code-reviewer`: ship-ready, no correctness bugs.**
  - It checked the quiet state's `everLogged` and `todayOnly`, the pull tick's ordering and cancellation, the Edge closure (`lib/metricDetail.ts` is not in it), and the removed exports against the flag-off guard.
  - Cleanups taken: `SEARCH_CANCEL_LABEL`, and two comments brought up to date (`inAllText`, `sameMinuteDuplicates`).
  - Left as is: the type sheet's spoken *Photographed, 12 logged*. Its label names the kind; the window sheet's rows need the noun because their labels name the window.
- **`adversarial-reviewer`: FAIL on the first round, then fixed.**
  - **Held:**
    - The not-in-full numbers agree with the count line's.
    - All symptoms' kinds sum to its count, legacy `scratch` rows included.
    - Triples and a midnight pair match "possible repeats".
    - "No X logged yet" cannot show while a surviving X exists.
    - Noticed never names a missing look.
    - The pull tick cannot draw another pet's count.
  - **Broke, medium:** a pill in a refused meal left unanswered read as given under Medication. Fixed by "logged" (above).
  - **Broke, low:**
    - The visit-only day disagreed across the header, the strip and the coverage line. Fixed by the date alone.
    - The day's total took its quiet ink by position, so it lost it under All symptoms. Fixed with a `dayTotal` tone.
    - A zero-dose regimen could read *…see every one logged*. Fixed by reading the course's first dose.
  - **Noted:** *formed stool* is the type's third name (the picker says Normal, the report *Stool (normal)*). It is not false. It's on the HV-13 script.
  - **The re-check on the corrections (C-19): PASS on all four.**
    - An unanswered dose in a refused meal reads *1 logged · 2 in all*, with no dose noun to read as given.
    - The visit-only day agrees with the strip and the coverage count.
    - The zero-dose regimen reads *…yet*.
    - *in all* keeps the quiet ink wherever it falls.
  - **Two lows from the re-check, fixed:**
    - A stale prop comment.
    - An ENDED course with no dose promised *When you log one, it shows up here*, which a new dose never does, since it links only to the active regimen. It now reads *This course ended with no dose logged against it.*
  - **The re-check's residual, sent to CUL-1209:** under Medication, the strip draws an unconfirmed dose with a solid line.

## Verification

- `tsc --noEmit` clean. Full jest green before each push: 516 suites, 11,640 tests (6 skipped, none of them this work's).
- The copy guard was proven by planting two real violations, each restored. The other new tests were not run against the pre-fix code; each asserts the new words or the new tick directly.
- The mock renders headless with no script errors, and a frame was checked by eye.

## Residuals

- The device script is on HV-13. It includes the largest text size inside the strip's squares, which no test measures, and the back button's "Patterns" after a door.
- Filed follow-ups:
  - CUL-1259: AC 17 and AC 37 through the real screen.
  - CUL-1260: the midnight pair's day count.
  - CUL-1261: two start dates for one course.
  - CUL-1262: no lens to the doses not given in full.
