# History v2, HV-8 — the week strip, and the month's marks at a readable contrast

**Date:** 2026-09-25

Shipped via #915 (CUL-1165). Filed: CUL-1226 (the Patterns month says "logged, no vomiting" on a day that continues the night before's bout), CUL-1227 (Waiting on PM: under a filter, "logged, not this kind" and "nothing logged" look almost alike), CUL-1237 (High: a refusal stops counting once its food is later left down free-choice). Commented: CUL-991 (History's course filter inherits the dose attribution's zone bug), CUL-1208 (persistent vomiting roses only its first day, for the PM's ruling). Handoff notes posted on CUL-1164 (the strip's new props; `HistoryFacts.petId`; `claimsFromOf`), CUL-1167 and CUL-1169.

## The ask

Step 2 of History v2, one of four sessions at once (HV-6, HV-7, HV-9 beside it): the week strip at the top of History and the shared day mark it draws, which the Patterns month picks up too. The spec is `docs/nyx-history-v2-requirements.md` §3.4, §5.7 and §7 AC 25–27.

## What shipped

- **`lib/stripMarks.ts`** (pure, table-tested in `lib/stripMarks.test.ts`, 60 tests):
  - `stripMarkOf(dayFacts, filter, window, today)`: every row of §3.4's table under every filter, as a state (`ahead`, `before_record`, `outside`, `noticed`, `unlogged`, `open`, `rose`, `logged`, `quiet`), a line (none, whole, broken), a spoken label, and whether the cell is a door (only to a day the list holds).
  - The pager's pure halves: `stripBoundsOf` (the window cut to a course), `stripWeeksOf`, `stripPageOf`, `stripWeekLabel` through `lib/recordDates.ts`, `stripArrowsOf` (each arrow says it moves the strip, and at an edge why it cannot), `factsAnswerWindow`, and the spoken day and week.
- **`components/historyV2/WeekStrip.tsx`** (replaces HV-1's slot; `WeekStrip.test.tsx`, 30 tests): a horizontal `FlatList` pager, `pagingEnabled`, placed by `initialScrollIndex` + `getItemLayout` and remounted at the right page when the width or the page set changes. The page lives in the scope store (`stripWeek`), is written where the scroll ends (never on a timer, GAP-10), and an arrow is one programmatic page that honours Reduce Motion. Only the page on screen is visible to VoiceOver; the arrows are the accessible path. A tap calls the store's `landOn`; the landed day wears the ring. When the facts on hand do not answer the window on screen (another window, another pet, a course not loaded), the strip draws its silhouette, never grey squares (C-12).
- **`components/charts/DayMark.tsx`:** one `DayMarkFace` both surfaces draw through. The logged line is the new `colorAccentGlyph` (#0FA08B, 3.27:1 on white; the retired `colorAccentSoft` was 1.64:1). A meal left unfinished is the same colour, dashed 3 on 3 through `react-native-svg`, where it used to be a paler line (1.18:1). On a rose day the line is solid white (3.67:1; the retired 55% white was 2.0:1) and still breaks. The strip draws the face without counts. `DayMarkLine` is exported so the month's legend draws the grid's own stroke.
- **`constants/theme.ts` + `constants/theme.contrast.test.ts`:** the token, with both halves pinned: the glyph and white on rose clear 3:1; the three retired colours (and the brand teal) do not.
- **`MonthInstrument.tsx`:** the legend's two line swatches only.
- **Two small additions to HV-4's modules** (from the adversarial pass): `HistoryFacts.petId`, set by `readHistoryFacts`, so a consumer can tell two pets' facts apart when their windows share dates; and `claimsFromOf`, extracted from `listSectionsOf` with its behaviour unchanged, so the strip's doors follow the list.
- **The membership walk:** the `SYMPTOM_TYPES` row names the strip's rose as a transitive consumer (C-11), and four set-equality tests over the shipped `stripMarkOf` state it, `stool_normal`'s neutral line included. Not a `symptomLists` registry entry: that would exempt the file from the scan (C-32).

## Decisions

Posted in the plan before building; the PM said go.

- **The strip's props grew** from HV-1's `{ days }` to `{ facts, window, course, today, petName }`: with days alone it could neither page nor tell "nothing logged" from "not read yet". Posted on CUL-1164 so HV-7 mounts against it.
- **The line colour is a new glyph token** (the round-5 mock's value) rather than `colorAccentInk`, which measures higher but draws visibly heavier than the ruled frame.
- **A bout across midnight:** the rose follows the month's episode mark (CUL-1208's recommendation), so its second day is not rose, but that day's label says "1 vomit logged", never "no vomit logged".
- **A visit-only day is a grey square**, as HV-4's population and coverage have it.

Made during the build:

- **"Ahead" only while the bounds reach today.** Past a course that ended this week, today and the days after it are absent, so the strip does not trail future boxes after a course that is over.
- **The labels speak the day header's nouns** ("2 vomits logged, 10 logged in all"), the same facts in §3.4's order; HV-12's copy pass edits them with HV-4's words (noted on CUL-1169).

## The reviews

- **`code-reviewer`: ship-ready.** Two cleanups and a comment, all taken: the spoken weekday reads `weekdayOfIndex` rather than restating the formula; a new test pins the settle's rounding and that a settle on the page already showing writes nothing (both mutations it named now red); the month test's Meals comment says which line shows in which state.
- **`adversarial-reviewer`: FAIL on three counts**, over production SQL on `node:sqlite`, random and DST-clustered data in seven zones, 5,000 days × 20 filters against the day header, 3,000 windows against the count line's coverage, and 21 mutants (all killed). What held: the midnight bout (day 2 not rose, its label "1 vomit logged"), strip versus month (0 rose disagreements), label versus header (0), grey cells versus "N days unlogged" (identical). What failed, and what was done:
  1. **A refusal stops counting once its food is later free-fed** (High). The intake lens excludes by TODAY's free-choice bowls for every past day; every consumer of the one qualifying set inherits it (History, the month, the intake rate, possibly the daily look's withheld predicate). Not HV-8's module: filed CUL-1237.
  2. **An unlinked partial or refused dose on a course's edge day reads "no … dose logged" under that course** for a non-UTC owner: the dose attribution's zone bug, CUL-991 (Urgent, open). Commented there with the reproduction.
  3. **Another pet's facts drawn when two windows share their dates** (latent until HV-7 mounts the strip). Fixed here: `HistoryFacts` carries `petId` (set by `readHistoryFacts`) and the strip requires the window's pet, the facts' pet and the store's pet to agree; it also waits when a window reaches past the `today` its cells are judged against.

  Also fixed: **strip cells were doors to days the list does not hold** (before a filter's first row, today without a match under a filter, a Noticed day with no look), so a tap could land on nothing. `claimsFromOf` (extracted from `listSectionsOf`, behaviour unchanged) now decides it; the one stated blind spot is a day held only by a date-only item. Surfaced, not changed: persistent vomiting roses only its first day under All types (the chained episode; on CUL-1208 for the PM), and non-vomit symptoms and refused doses are not rose under All types (the spec's rule).

  Every fix was proven by mutation (five, each red).

**Persona sign-off:** Designer ✓ (round 5's frames; the rose, line and grey square as ruled; CUL-1227 for the filtered pair) · Engineer ✓ (the pager's store and scroll never fight; no timers; guards green) · Data Scientist ✓ (one population; the words follow the rows; the free-fed defect filed) · Dr. Chen: dissent recorded on CUL-1208 (a day with eight vomits must not read calmer than a day with one) · Data Visualization Designer ✓ with CUL-1227 open · Jordan and Sam: N/A until the strip is mounted (HV-7) and on a device (HV-13).

## Verification

- `tsc --noEmit` clean; the full jest suite green (486 suites); the six touched suites green under Pacific/Kiritimati, Pacific/Chatham and Pacific/Honolulu.
- Nineteen mutations across the build and the review fixes, each red: two for the settle and five for the adversarial fixes (above), and these twelve from the build: the dash array, a broken line drawn whole, the on-rose stroke, the token reverted to the pale teal, every type rosed, a vomit's words keyed on the rose, the rose day's broken line dropped, the silhouette's range check and pet check removed, every page shown to VoiceOver, the arrow's Reduce Motion dropped, and the pager's echo check removed (which re-creates the mock's syncRail bug).
