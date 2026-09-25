# History v2, HV-4 — the record's numbers

**Date:** 2026-09-25

Shipped via #911 (CUL-1161). Filed: CUL-1193 (the course count's wording; the PM ruled (b) the same day, built here, below), CUL-1194 (the Patterns month's record start counts a look), CUL-1207 (HV-3's window test under a half-hour DST shift). Handoff notes posted on CUL-1160, CUL-1164, CUL-1165, CUL-1166 and CUL-1169.

## The ask

Step 1 of History v2, one of five sessions at once: the counting layer every number on the new History comes from. That meant whole-day pages, one population, coverage, the report's same-minute duplicates, gap lines, date-only items, search and `DayFacts`, all tested on their own with nothing rendered. The spec is `docs/nyx-history-v2-requirements.md` §3.2, §3.5, §3.7, §5.2 and §7.

## What shipped

- **`lib/sameMinuteDuplicates.ts`:** the vet report's `dedupeEvents` rule, moved over unchanged onto a minimal event shape. It has no imports, so Deno can load it for HV-15. The report's note and severity merge stays in `report.ts`, because History never merges rows; it only discloses them.
  - The test parses `report.ts` with the TypeScript compiler, evaluates the report's live `dedupeEvents`, and holds the two equal over 4,000 seeded cases. A non-vacuity floor counts every clause the corpus reached. Six mutations each turned it red.
  - A guard fails the build if any History v2 file spells the rule's window or its group keys.
- **`lib/historyDays.ts`** (pure):
  - `DayFacts` in §5.2's shape plus `vomitEpisode` (below).
  - `dayCountFor`, the one count that the count line, the type sheet, the day header and the strip all sum.
  - Coverage, duplicate counts per filter, every count line form, the day header, list sections with gap lines, date only items, course days, the record's first days.
  - The wording lives in one section for HV-12's pass. Dates come through an injected formatter so HV-3's `recordDates` plugs in.
- **`lib/historyQueries.ts`:**
  - `readDayPage`: whole local days, newest first, until a page holds at least 50 rows. The cursor is a day. SQL bounds are only a rough filter with a day of slack, and the parsed instant decides which day a row belongs to (C-40).
  - `readHistoryFacts`: one population read.
  - `readHistoryCourses`: names via the rundown's rule, bounds via `courseDaysOf`.
  - Search runs over named fields with `%`, `_` and `\` escaped. `SEARCH_READS_NOTES` is pinned false until CUL-848.
  - Visits are deliberately not read here: the screen reads them through the shipped `readVisitsForHistory`, so visit data never enters the module that computes counts (the visit readers guard).
- **Small edits:**
  - `LOOK_EVENT_TYPE` exported from `lib/monthReads.ts`.
  - The duplicate set registered in `guards/symptomLists.test.ts`, with its own membership walk row (22 rows to 23).
  - The walk's `SYMPTOM_TYPES` row now names History v2 as a transitive consumer (C-11).

## Decisions

Posted in the plan before building; the PM said go.

- **The pet's first record is the first event that is not a look.** A look must never stretch a coverage line (daily look spec §5.6).
- **A visit-only day counts as unlogged in coverage, but the list still draws its card.** The visit readers guard forbids a visit entering a coverage line; §3.5 says a visit-only day is a day.
- **Duplicates are not disclosed under Photographed or With a note.** Which member of a pair the report keeps depends on whose photo read completed, which the phone does not hold.
- **Search reads only a row's own named fields,** as §3.7 lists them.

Made during the review fixes, and stated in #911:

- **Under Meal, the day header keeps "N meals not finished".** §1 says a refusing cat never reads as routine one level above the rows; H-2 is the header's own word.
- **`DayFacts` gains `vomitEpisode`, the Patterns month's own episode mark.** §3.4 says the strip and the month never disagree about a day, and a night bout across midnight made that impossible with `byType.vomit` alone.

## The reviews

- **`code-reviewer`: ship-ready.** Two low notes, both taken:
  - a course filter's paging floor now uses that course's own first dose rather than any course's (pinned by a read-count test);
  - the unreachable `?? []` after `getAllAsync` is gone.
- **`adversarial-reviewer`: FAIL on six counts.** The five cases the issue named all held under concrete counterexamples:
  - a same-minute pair across a page seam, randomized over 3 records × 9 filters × 3 page sizes × 9 zones;
  - a visit-only day;
  - a course that started mid-window;
  - a window that starts before the record;
  - removals and back-dated writes between page loads.

  It also found that the duplicate disclosure equalled History's count minus the report's over 3,000 cases straddling the window's edges, and that removing the one-day read margin broke that. What failed, and what was done:
  1. **A zero read as absence.** "Last 7 days · no vomits" over an unwatched week. Now "no vomit logged" on the count line and the header. A header on a day with nothing logged says only that, and "not yet" on today.
  2. **"10 doses" for a course where 4 weren't fully given.** The spec's letter (§3.2 / §3.8); the critique's GAP-26 asked for "logged" plus the subset not given. Filed as CUL-1193; the PM ruled (b), built below.
  3. **Visit and course-start items vanished under a filter before the type's first row** (AC 11). Fixed: items render before the first row and before the record's first day. Absence is still claimed only on or after both, and never on today.
  4. **Future days could be drawn "nothing logged"** if a window ran past today. Fixed: nothing is claimed after today, and a row there still shows.
  5. **A window clipped at the record's start is still named in full.** Its partial range is the window table's to name (GAP-24); noted on CUL-1160.
  6. **`DayFacts` could not reproduce the month's vomit days.** Fixed with `vomitEpisode`.

  Lower findings:
  - A count line over facts for another window is now `pending`.
  - A course filter with its course not loaded shows its rows and claims nothing.
  - The wording findings (a triple duplicate's words, treats counted as meals, two start dates for a course) went to HV-12 on CUL-1169.
  - The Patterns month's record start counts a look: CUL-1194.

  Every fix was proven by mutation (seven, each red).

## The ruling on CUL-1193: a dose count reads "logged"

The PM ruled (b): under a course and under Medication the count says *16 logged on 16 days*, and line 2 names the doses recorded Partial, Missed or Refused, *Prednisone · since Sep 4 · 3 not given in full · 1 day unlogged*.

- **`lib/historyDays.ts`:** `countPhrase` words a dose filter's count "logged"; `notInFullOf` sums the window's `DayFacts.doses[…].notInFull` (a course's own, or every course's under Medication); `notGivenInFullText` is the clause, null at zero, because an unrated dose is never counted and a zero would claim every dose was given. The clause sits after the course's name and span and before coverage, the ruling's order. `TypeSheetCounts.courses` now carries `{ logged, notInFull }` per course for HV-9's sub-row.
- **The sheet's sub-row** names them after its span, the shape Photographed's *N not read* already has: *Cetirizine HCl · Jul 1 – Sep 5 · 16 · 4 not given in full*. The count column stays a bare number, as on every other row.
- **Left alone, on purpose:** the day header under a dose filter still reads *1 dose · 8 logged*. The ruling named the count line and the sub-row; the rows under a header carry their own chips; and *2 logged · 8 logged* collides with the day's total. HV-12's copy pass owns the word (noted on CUL-1169).
- **A premise, stated where it is used:** Medication's clause is a subset of its count only because a dose row always hangs off a medication event (migration 020's design, one writer, nothing re-types an event). History keeps the report's course grain, which reads every dose row, rather than narrowing "a dose" for a record no write path can produce; the comment on `notInFullOf` says so.
- **Tests:** AC 1 now checks the clause against every window × filter (named only under a dose filter, equal to the facts, never more than the count, equal to the sheet's); AC 30 ties each course's not-in-full to `deriveMedicationCourses`'s own Partial + Missed + Refused tally, over a record holding every chip (neither fixture had a Missed dose, so dropping `missed` from the set survived until that test existed); the node:sqlite suite checks it against the rows the dose filters actually list. Eleven mutations, each red.
- **Spec v1.4** (§3.2, §3.8, AC 30; ⚠ RULED markers; HV-3 took v1.3 for CUL-1189's rulings, below) and **round 5 of the mock** amended to match, republished to the same URL (version 7), as the CUL-1183 amendment was.

## A base that moved mid-session

Bundle C (#908, CUL-1124) landed on `main` during the wrap and added `regimen_drug_name` to `getTimeline`, joined pet-scoped (`rx.pet_id = e.pet_id`), so a dose linked to another pet's course never borrows its name. This branch had the same column without that guard, which would have let a search find another pet's course name. The branch merged `main`, and the join is now pet-scoped in both the row read and every scope condition. A test drives a dose linked to another pet's regimen (no name on the row, no search hit); dropping the guard turns it red. The column-for-column test against `getTimeline` now covers the course's name too.

`main` moved again after the wrap: HV-1 (#907) and HV-2 (#910) landed, sharing no file with this branch, and the merge was clean. Then HV-3 (#909) landed with its own spec v1.3 (CUL-1189's rulings) twenty minutes before this branch pushed CUL-1193's, so the PR went unmergeable and GitHub ran no CI on that push at all (a `pull_request` run needs a merge ref). The one-time check-in caught it; the merge kept both sides (HV-3's two §3.2 rules, then the dose count's; this PR's spec edit became v1.4). Running the History suites in six zones after the merge turned up a half-hour-DST gap in HV-3's own window test (its fixture assumes the clocks move a whole hour; the window code is right): CUL-1207.

## Verification

- `tsc --noEmit` clean.
- Full jest suite green on the merged tree (with HV-3): 480 suites, 10,620 passed, 6 skipped.
- The History suites (222 tests) green under Kiritimati, Chatham, Honolulu, New York and Lord Howe.
- CI green on the first push (all three jobs).

## Residuals

- **Proposed spec edit (Tier 2, awaiting PM approval to write):** `docs/nyx-history-v2-requirements.md` §5.2, `DayFacts` gains `vomitEpisode: boolean`, the Patterns month's episode mark, which §3.4's never-disagree rule needs.
- Where "{pet}'s record starts here" sits when a visit predates the first event is HV-7's call (noted on CUL-1164).
