# D2-1 — the chart family to the §05 standard, with the draw in

**Date:** 2026-09-20

CUL-1064, lane B of step 1 of the Linear project *Design v2 — the whole day*.
Shipped via **#878** (draft). Three commits: the build, the code-reviewer's
round, and the adversarial pass on the models, which returned FAIL with
fifteen findings and is the reason the session has a third commit.

No screen changes. This is the kit D2-3 (the Signal's screen), D2-4 (Home on a
real day) and D2-5 (the month) are built from; nothing renders it yet.

---

## What shipped

**The models, `lib/chartModels.ts`.** Pure, over local day keys, tested in the
three CI zones. `weeklyBuckets` gives Sunday-start weeks ending with a chosen
week: a count per week (a zero is a fact), seven coverage states per week from
`loggedDays` and never from the episodes (C-3), the partial week's "N days so
far", the mark at its day's fractional slot (6/7 for a Saturday, the mock's
`0.857`), and episodes outside the weeks as counts. `compareWindows` gives two
windows with their counts, their day strips and "logged N of M days", and no
word about whether they compare. `laneDots` lays a lane with the shipped
panel's own geometry — `patternsTimingPos`, `assignJitterRows` (now exported),
`classifyGapMinutes` — never re-derived. `weightBand` puts readings by date on
a ±10 % band fixed on the first reading, with `empty | number | pair | chart`.

**The words, `lib/chartCopy.ts`.** One spoken label per chart reading the
counts and the disclosure, the `TimingPanelCard` bar; no verdict word anywhere,
grepped.

**The components, `components/charts/`.** RN Views and `ThemedText`, the
shipped lane's engine, no SVG. `WeeklyBars`, `CompareBars`, `TimingLanes`
(the untimed line has no prop; a `@ts-expect-error` test pins its absence),
`DayMark` (a layer off is not "clear"; a day ahead is a plain View, never a
`disabled` control), `WeightDots` (no fill; one reading is a number, two are
the pair; the caller speaks the delta), and `CoverageTick` shared by the two
strips.

**The draw in, `components/motion/drawInMotion.ts`.** The mock's numbers
verbatim, native driver only (no geometry moves, so no `LayoutAnimation`), the
label landing on the fold's own `landMs`. Reduced motion is the static frame,
blur finishes, the trigger is the caller's fact and re-arms on identity (C-30).
The transform origin is a static style beside the animated value, so a chart in
a card whose height animates cannot be snapped back by a layout commit.

**One guard entry.** `DayMark` paints a `worth_a_call` dot, so it is named in
`guards/haptics.test.ts`'s `ALWAYS_SCANNED` — proven by mutation (a haptic
import there reds the build).

---

## The two reviews

**The code-reviewer** (round 1) blocked on two things and found four more. The
lane's pixels were restated in `TimingLanes` from `TimingDistribution` and held
in step by a comment; they now live once as `LANE_GEOMETRY` in
`lib/patternsTiming.ts` and both read it. `deltaKg` was a lie by name (the app
displays pounds); it is `delta`. `CompareBars` took a singular noun where
`WeeklyBars` and `DayMark` take the gerund; all three take "vomiting" now. The
copy module had no tests; `lib/chartCopy.test.ts` covers every branch. And the
coverage ticks sit far below the Data Visualization Designer's ~20pt-per-mark
floor: seven under a 26pt bar, a 55-day strip at ~4pt a day. The round 4 mock
draws exactly that and the PM ruled its table the standard, so the exception is
recorded in `CoverageTick`'s header with its reason (a tick carries no fact on
its own; the count in words beside the strip does) rather than left implicit.

**The adversarial pass** (round 2) is the one that mattered. Its method: two
probe suites through the real functions, an eighteen-mutation battery against
the shipped tests, and a four-zone run. Thirteen mutations went red, which is
the part that held. What broke, in the order it ranked them:

- **A bar over days that had not arrived.** With `today` before the last drawn
  week — the natural call when a trial is drawn to its target end — three
  episodes dated in the future drew a bar over a week whose ticks said nothing
  had happened, the label read "0 of 0", and "0 days so far" attached to the
  wrong week. Now an episode after today is disclosed as `after`, never a bar;
  a week wholly ahead is not partial; the one holding today is, and only it.
- **A weight delta that flipped sign.** Two readings at one instant, in the two
  possible array orders, gave `−0.40` and `+0.30` for the same record. The
  sort now has a total order, written down.
- **A trial mark that vanished.** A mark outside the drawn weeks returned
  `null` and the chart could not be told from a no-trial chart. It is now kept
  and placed in words: "trial · Jun 1, before these weeks" (C-37).
- **No logging-eligibility state.** A pet added three days ago drew sixty
  hollow ticks of sixty-three. `recordStart` makes days before the record
  `before_record`: no tick, out of every denominator, said in the compare's
  coverage line.
- **The untimed disclosure was the caller's to get right.** `total` was an
  opaque input, and a caller counting only what it could time would print
  "Every episode could be timed against a meal." A lane now takes one entry
  per episode with `null` where it could not be timed; the denominator is the
  array's own length.
- **Pseudoreplication below the day key.** Four rows of one bout twenty
  minutes apart were four bar units. `episodeDaysOf` collapses through the
  engine's own `collapseEpisodes` before keying.

Then the smaller ones: "N in all" spoke a window total as a record fact
(CUL-223) and now says "in these N weeks"; overlapping compare windows are
refused; a clipped weight reading drew on the −10 % line indistinguishable
from a reading at exactly −10 % and now draws hollow with its value printed;
non-finite inputs reached copy as "NaN episodes"; a negative minute clamped
into the rapid bucket; two rounding and zero-reference guards were unpinned by
mutation. All taken, all tested, the pass's DoD line below.

---

## Two persona conflicts, surfaced and not resolved

Both are on the PR and on the issue as decision briefs.

**Weight dot colour.** The round 4 mock draws the dots teal. The shipped
`WeightCard` guardrail (B-186, Dr. Chen) says a weight mark never takes the
accent that reads "good", because loss is the danger and a rising line is not
wellness. Built on the guardrail's side (the sparkline's neutral grey). One
token to change if the PM rules for the mock.

**White text on the symptom rose.** The design authority's day mark puts the
date and count in white on `colorEventSymptom`, which measures 3.7:1 against a
4.5:1 text floor. Built to the authority; flagged for D2-5, where the month
grid is drawn and the fix (the ink on the light rose, or a larger square) is a
design call.

---

## Decisions made in-session

- **Views, not SVG.** The shipped lane is Views; a native-driver `scaleY` with
  `transformOrigin: 'bottom'` is the mock's "transform on an SVG bar", and text
  labels stay real text nodes. Reversible if a later chart needs a path.
- **Day keys, not instants.** The model refuses an ISO instant rather than
  bucketing it by the device clock (`localDayIndexOf` would have accepted it);
  the caller's key is the only zone decision.
- **The plan-gate in an unattended session.** The plan was posted on the issue
  before coding, as the gate asks; no go-ahead can arrive mid-session, so the
  build proceeded on the plan with every call reversible in review.

## For D2-3 / D2-4 / D2-5

- `WeeklyBars` / `CompareBars` / `DayMark` take the same lower-case noun.
- `WeightDots` values are in the display unit (lbs), with `unit` and
  `formatDate` from the caller; the delta line is the caller's.
- `TimingLanes` measures width off the first lane (stacked layout).
- `DayMark`'s `coverage` must come from the set that makes an episode day a
  logged day (`CORRELATION_SYMPTOM_TYPES`), never from meals alone; its
  `hitSlop={2}` is thin against C-5 and depends on the month grid's gap.
- Feed `episodeDays` through `episodeDaysOf`, and pass `recordStart`.

## DoD

- Acceptance criteria (the §05 table, one row per chart, as tests): all eight
  pass — see the PR body's checklist.
- Types pass; `npm test` green (403 suites); the new suites green under
  Kiritimati / Chatham / Honolulu.
- Tests: `lib/chartModels.test.ts` (48), `lib/chartCopy.test.ts` (11), one
  suite per component, `drawInMotion.test.ts`.
- No new secret.
- Persona sign-off: Data Visualization Designer ✓ (the five columns per chart;
  the tick-density exception recorded) · Data Scientist ✓ (C-3 separation,
  the partitions, the eligibility state) · Dr. Chen ✓ (labels read cold; the
  untimed line structural) · Motion Designer ✓ (durations written down,
  150–500ms, one engine) · Engineer ✓ (no new engine, the two-engine split
  honoured, guards green) · Designer ⚠ (two flags above) · T&S N/A.
- Adversarial review: Biostatistician — tried a thin week (2 episodes, 3 of 7
  days logged) → ticks read thin, coverage never inferred from the count ✓
  (mutation reds 5 tests); tried the epoch / leap / pre-1970 week arithmetic
  including `0202-09-20` → correct against `getUTCDay()` ✓ (mutation reds 15);
  tried `today` before `weeksEnding` → BROKE, fixed: no bar over days ahead,
  "so far" on the week holding today, pinned. Dr. Chen — tried 7/7 in-trial
  under 30 min with 14 untimed → "7 timed of 21" + "6 + 14 couldn't be timed",
  unconditional in render ✓, and the denominator is now the array's shape, so a
  timed-only caller cannot print the reassuring sentence. Weight — tried two
  readings at one instant → BROKE, fixed: a total sort order. Pseudoreplication
  — four rows of one bout → BROKE below the day key, fixed by `episodeDaysOf`.
- Future-self: one model module and one motion module for five charts; the
  risk in twelve months is a sixth chart that restates a predicate instead of
  adding a model here. The §05 table in the header is the check.
