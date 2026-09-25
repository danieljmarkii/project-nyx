# History v2, HV-4 — the record's numbers

**Date:** 2026-09-25

Shipped via #911 (CUL-1161). Filed: CUL-1193 (Waiting on PM: the course count's wording), CUL-1194 (the Patterns month's record start counts a look). Handoff notes posted on CUL-1160, CUL-1164, CUL-1165 and CUL-1169.

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
  2. **"10 doses" for a course where 4 weren't fully given.** The spec's letter (§3.2 / §3.8); the critique's GAP-26 asked for "logged" plus the subset not given. Filed as CUL-1193 for the PM; the code keeps the spec's form.
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

## Verification

- `tsc --noEmit` clean.
- Full jest suite green: 466 suites, 10,161 passed, 3 skipped (unchanged).
- The three new suites green under Kiritimati, Chatham, Honolulu, New York and Lord Howe.
- CI green on the first push (all three jobs).

## Residuals

- CUL-1193 (Waiting on PM) decides the course count's words; the data (`notInFull`) is already in `DayFacts`.
- **Proposed spec edit (Tier 2, awaiting PM approval to write):** `docs/nyx-history-v2-requirements.md` §5.2, `DayFacts` gains `vomitEpisode: boolean`, the Patterns month's episode mark, which §3.4's never-disagree rule needs.
- Where "{pet}'s record starts here" sits when a visit predates the first event is HV-7's call (noted on CUL-1164).
