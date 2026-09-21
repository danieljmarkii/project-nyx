# D2-5 — Patterns' month with Sunday-start bars over the rows, layers, and weight by date

**Date:** 2026-09-21

CUL-1067, step 2 lane 3 of the Linear project *Design v2 — the whole day*. Shipped via
**#882** (draft). The plan was posted on the issue before coding (the plan-gate);
the session was unattended, so the build proceeded on it with every call reversible in
review, the D2-1 precedent.

Behind the `design_v2` toggle. Flag-off is today's Patterns page to the byte; nobody is
allowlisted, so nothing changes on a device until the PM's uid goes on the allowlist for
the device pass (D2-9).

---

## What shipped

**The model, `lib/monthModel.ts`.** Pure, over local day keys, run in the three CI zones.
The month's Sunday-start rows; the nine weeks through D2-1's `weeklyBuckets`, ending with
the row holding today for the current month and the month's last row for a past one, so
each bar is a grid row you can point at (`barIndexOfRow`); one `MonthDay` per day —
count · coverage (`logged | left_some | unlogged | ahead | before_record`) · medication ·
photo; and the line, *Vomiting 6 times on 4 days · through Sep 17 · 2 days unlogged* —
the un-logged days and nothing when fully covered (C-3), a future day *ahead* and never
unlogged, a day before the record named apart and out of every denominator, an episode
dated ahead disclosed and never drawn. `monthReadRange` names the span one read must
cover so the bars and the grid feed off one read.

**The reads, `lib/monthReads.ts`.** One predicate per fact, each the neighbour's: an
episode is a vomit row through the engine's re-log collapse (`episodeDaysOf`); a LOGGED
day is a feeding OR a correlation-symptom day — the Trial panel's own denominator, so the
month's "unlogged" and the panel's "logged N of M" one scroll apart partition the same
days (C-4), and an episode day is a logged day by construction; a left-some day is an
unfinished qualifying meal by the intake lens's own definition (`qualifyingIntakeMeals` +
`isFinishedMeal`, the latter now exported); a dosed day is a delivered dose (given or
partial, B-618 D1); a photographed day is a surviving attachment, its verdict one batched
`event_ai_analysis` read that degrades to *seen* offline (never a colour). SQL bounds are
a coarse prefilter with a day of slack each side and the parsed instant decides the day
(C-40), tested against the production DDL on real SQLite with both spellings of a
boundary instant. `readDayRows` reads one LOCAL day for the day opening in place.

**The motion, `components/motion/openInPlaceMotion.ts`.** The fold's physics on a new
surface, every beat `FOLD_MOTION`'s and the two layout configs the fold's own, imported
(C-30): the rail leads, the box follows `railLagMs` later under `UNFOLD_LAYOUT`, the rows
land; the reverse on close. Two engines, one job each; the rail holds an explicit height
through every layout commit; the rows' animated wrapper mounts only while they arrive or
leave. Reduced motion is a crossfade with no layout commit; a blur finishes; a re-key
under an open row moves with no motion — and an open whose identity arrives with it is
an open, not a re-key (the first draft treated it as one and skipped the choreography;
the test that pins it is the one that caught it).

**The instrument, `components/designV2/patterns/MonthInstrument.tsx`.** The nav (next
disabled at the current month, previous at the record's first month, each with its
reason in its label — C-7), `WeeklyBars` over the nine weeks, four layer chips as
`FilterChip`s in `ChipGroup`'s wrap geometry with checkbox semantics, the line, the grid
of `DayMark`s (a day before the record is a plain dim square — `DayMark`'s vocabulary has
no such state and it is neither unlogged nor ahead), the legend (vomit day with the count
· logged · left some · nothing logged), and the day opening in place under its row, one
at a time, listing the day's events with `describeDayEvents`. One read per shown month,
cached, keyed writes; the current month re-reads on every focus; a read that has not
answered is a skeleton and a failed one an error with a retry (C-12). No History door on
the day — CUL-1073.

**The weight, `components/designV2/patterns/WeightCard.tsx`.** `WeightDots` in pounds by
date on the fixed ±10 % band, the record's count in the header with an *All ›* door
scoped to the card's pet, the delta spoken by `weightDeltaLine` (new in
`lib/chartCopy.ts`) — *Down 0.4 lbs (4%) since Jul 3 · a home scale moves about that
much on its own* — one reading the number and its date, two the pair, empty the shipped
invitation to weigh, *Log a weigh-in* in every state.

**The page, `app/insights/index.tsx`.** Flag-on: the month, the weight, the *what Nyx
ate* cards, Timing, Trial, What you noticed; the MetricCard column, the old calendar, the
old weight card, the AI summary and the empty state absent. The trial's start reaches the
bars through `useDietTrial`, gated on `inputIsForActivePet`. Flag-off untouched.

**The guards.** `guards/designV2FlagOff.test.tsx`'s D2-0 tripwire retired here (this is
the first consumer, not D2-3 as it named); the consumer scans now measure a non-empty
set. `guards/haptics.test.ts` ALWAYS_SCANNED gains `MonthInstrument.tsx` and
`openInPlaceMotion.ts`. `app/settings/beta.tsx` gains the owed on-state hint. The async
half of the flag-off proof lives in `app/insights/designV2.test.tsx`: flag-off issues no
month read over a fixture that would answer.

## Decisions made in-session (reversible in review)

- **The layer chips are multi-select.** The issue names `ChipGroup`, which is a
  single-select radiogroup; a layer is not a choice among four. `FilterChip`s in the
  same wrap geometry with `checkbox` roles, each announcing its checked state.
- **The home-scale caveat is gated at 5 % of the first reading.** Beside a 15 % loss it
  would be reassurance on the one danger signal weight has (B-186). Above the bound the
  delta prints alone.
- **The AI summary and the dashboard's empty state are absent flag-on.** The design
  authority's frame has the month first and no summary; an empty month is a designed
  state (its line says what is unlogged). A decision brief for the PM is on the issue.
- **A dosed day with no meal or symptom logged is grey with a slate dot.** The
  coverage predicate is the Trial panel's, so the two surfaces partition the same days;
  the spoken label says "nothing logged, medication".
- **No History door on the day.** History's `?date=` is a UTC day and the month's day
  is local; a door that lands on the wrong day is worse than none (CUL-1073).
- **`monthReadRange` lives in `lib/`, not the component.** The flag-off guard wraps
  every function export of a namespace module into a switchable component; a helper
  there would be wrapped too.

## What broke and how it was fixed

- **An animated wrapper left mounted across the idle state.** The rows' `Animated.View`
  stayed mounted while open, and the next close started an animation against a node that
  had been re-created — "Unable to find node on an unmounted component". The fold's
  anatomy (wrappers mount only in flight, a plain View at rest) fixed it.
- **The first open of a row's slot was a re-key.** Every row's slot mounts with no day
  (identity `''`), so the first open changed the identity and the hook took the
  no-motion switch. A re-key is now a different day under a row that was showing one and
  still is; the motion test pins the difference.
- **UTC literals in the weight fixtures.** `2026-07-03T08:00:00Z` reads *Jul 2* in
  Honolulu; the fixtures are built from local components (C-29) and the zone run is green.
- **`getAllByLabelText(/before the record began/)` matched the weekly chart's label
  too.** The assertion is anchored to the day label's shape.

## Reviews

REVIEWS_PENDING

## DoD

DOD_PENDING
