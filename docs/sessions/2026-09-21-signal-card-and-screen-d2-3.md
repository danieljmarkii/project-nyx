# D2-3 — the Signal card (title + chart + line) and the Signal's own screen, as a route

**Date:** 2026-09-21 · **Issue:** CUL-1065 (step 2, lane 1 of *Design v2 — the whole day*) · **Shipped via #881** (draft)

The Signal card on Home becomes a title, a weekly chart and one line; tapping it opens
the Signal's own screen with the evidence drawn. Behind the `design_v2` beta toggle
(D2-0); flag-off byte-identical. Nothing for the PM until the device pass (D2-9).

---

## What shipped

**One window predicate, `lib/signalWindows.ts`.** The card's bars, the card's line, the
screen's compare and the screen's lanes are all derived here from one `today` and one
finding. Sunday-start weeks ending in the week holding today — every week the lookback
touches, and the running trial's first week when it began earlier (the mock's Thursday is
nine bars, Jul 19 through the partial week of Sep 13, the trial's mark at 6/7); capped at
twelve, the mark then placed in words (C-37). The line "N this week so far · M last week"
is read off the last two buckets the bars draw, so adding the bars yields the line's
numbers by construction (C-4), property-tested over 200 random records. The compare on a
running trial is the trial's own days (the day counter) against the same number of days
before; without one, the two halves of the lookback. The lanes are the same two windows,
or one lane over the lookback. Day keys only (C-29); the clock-anchored property test
(C-29's time axis).

**The title, `lib/signalTitle.ts`.** "Vomiting, day 55 of the rabbit trial" /
"Vomiting, the last 8 weeks" / "Rabbit trial, day 55 of 56" / the safety types' shipped
strip names. Property-tested: every finding type × every symptom word × three trial
states against a verdict-word list (the issue's words plus the fold spec's standing
vetoes and the glyph/percent screens); `symptom_worsening` never takes the strip's "up".
Day N ≥ M renders no completion language (the medication-duration rule D7, applied to
the trial, as the mock's §01 says).

**The screen's model and loader, `lib/signalScreen.ts`.** Pure builder over a
production-shaped input; the loader reads local SQLite (the finding's episodes with their
attachments through the engine's own re-log collapse, every logged day — an event day or
an answered look, the feedings and free-fed spans the lanes time against through
`classifyEpisodeSet`, the trial through `loadTrialPredicateFacts` + `isTrialRunning`, the
delivered doses) and makes ONE PostgREST read, the per-incident verdicts from
`event_ai_analysis`, chunked by id and paged on a total key (C-42). *Why this is a
Signal* composes the shipped `evidenceText`, "Two windows of N days, logged on A and B
of them. Compared as counts, not a verdict on how {pet} is doing.", **each drug dosed
inside either compare window
with its dates from the record** ("Cerenia was given Sep 9–12, inside the trial's 55
days."; a course across the start says "across both windows"; nothing when none), the
diet-change sentence and the diet line. The gallery is one tile per photographed episode
with its own read; the model has no field for a summary verdict, and the tests grep every
string for "the other" (Dr. Chen's round-3 condition) and the verdict list.

**The card, `components/designV2/signal/SignalLeadCard.tsx`.** Title in the display face,
`WeeklyBars`, the line; the whole face one door (`router.push('/signal/<identity>?pet=<id>')`),
never a fold, never an expand, no control row. A safety lead renders the shipped
plain-text `InsightCard` (S1) with the same door — as the benign lead gains a chart,
plainness stays the severity signal. The read is the component's own, so flag-off it is
never issued (the guard's async half, proven in the zone's suite). Skeleton while in
flight (C-12); a failed read falls back to the shipped card.

**The screen and the route, `SignalScreen.tsx` · `EpisodeGallery.tsx` ·
`app/signal/[id].tsx`.** Sections in the ruled order: title → weekly bars → the
count-anchored sentence → compare (logged N of M days, both windows, no adjudicating
word) → timed-from-meals lanes (before / in the trial, the untimed line) → the episodes
(tiles in the shipped `REC_LABEL` words, imported never restated; "N photographed" as a
count; a tile opens its record) → *Why this is a Signal* → the safety phone script
(`ExpandedReceipts`, exported) → *Keep it compact on Home*, which writes the same fold
entry Home's control writes and goes back; `lib/signalFold.ts` gained a one-list change
listener so Home's `useSignalFold` re-reads on return. `id` is `foldIdentity(finding)`,
`pet` the finding's pet, named through `resolveRecordPetName` (C-9). Flag-off the route
renders a small inline screen and issues no read.

**The opening, `components/motion/signalOpenMotion.ts`.** No new engine: the rise is the
route's own transition (`slide_from_bottom` at the fold's `openMs`, so Back is the same
curve reversed natively; `none` under reduced motion), the charts `drawIn` on arrival
(D2-1), and the sentence + compare land together on one native-driver value at 200ms
over the fold's `landMs`. The three beats are pinned inside 700ms; what trails is stated
and pinned too — a weekly chart's own label tail lands at 780ms (D2-1's numbers, the
mock's CSS verbatim). VoiceOver focus is asked onto the title through `lib/a11yFocus.ts`
(the wiring is tested; the focus itself is the device pass, since `findNodeHandle` is
null off-device).

**The zone, `SignalZone.tsx`.** Reads the gate; flag-on the header carries "Open ›", the
lead insight card is the new card, every other face is a door (`InsightCard`'s new
`onOpen` prop: face tap opens, no control row, no expand); the folded strip is the
shipped strip and re-opens on tap. Flag-off every branch is the shipped one.

**Guards.** `guards/haptics.test.ts` ALWAYS_SCANNED gains `SignalScreen.tsx` and
`EpisodeGallery.tsx` — each proven by mutation (a `commitSymptom` import reds the build).
`guards/designV2FlagOff.test.tsx`: the D2-0 empty-set tripwire deleted and replaced by the
consumer list asserted by name; the route joins `SURFACES` with its blind spot stated;
proven by mutation (the route drawing the namespace ungated reds "the Signal route
renders identically with the redesign absent"). `app/settings/beta.tsx` gets the on-state
hint the tripwire named.

## The two reviews

**The code-reviewer** (commit 2) blocked on one thing: the header's "Open ›" and the
lead face 8pt below it shared hit area (C-5) — the link now reaches 0 down, pinned off
the rendered styles. Taken too: the attachment bucket from `lib/attachments`, the two
verdict unions held in lockstep at compile time, one decode of the route params. Not
taken: batch signing for the gallery — the batch signer has no transform, and nine 320px
tiles cost less than nine originals; the reason is in the gallery's header.

**The adversarial pass** (commit 3) returned FAIL with eight breaks, the first four
load-bearing, and eight surviving mutations — the round that mattered, as on D2-1:

- **A day-one trial drew one day against one day.** "The 1 day before: 1 · The trial's
  1 day: 0" — a full bar beside an empty one, the n=1 picture the never-reassure
  invariant forbids, on a safety card. Now a floor: below `MIN_COMPARE_DAYS` (mirrored
  from the diet-trial spec's `MIN_INTERPRETABLE_DAYS`, same question, C-34) there is no
  compare and one lane, and *Why* says "Day 1 of the rabbit trial — fewer than 7 days in,
  so there is no before-and-during compare yet."
- **A re-logged bout lost its photo and its read.** The collapse keeps a bout's first
  row; the owner who photographs the blood and re-logs twenty minutes later has the
  photo on the second. `boutMembers` walks the collapse's own gap rule so every row of
  a bout is asked for attachments, and the bout's tile is the row that holds the photo
  (its read is keyed there; it opens that record).
- **The compare sentence named only the calendar denominator.** A diligent baseline
  against a drifting trial — 19 over 55 logged days, 5 over 16, one rate — reads as a 4×
  improvement from the bars, and "two windows of 55 days" beside a partial enumeration
  is C-3's claim. The sentence now names both: "Two windows of 55 days, logged on 16
  and 55 of them. Compared as counts, not a verdict on how Nyx is doing." Naming an
  asymmetry is not the word "fairly".
- **The verdict read stopped at a short page**, against its own C-42 comment — under a
  cap of 50 it lost a `worth_a_call` (CUL-975's own failure, a cheque the code did not
  cash, C-38). It advances by the rows received and stops on an empty page.
- Then: a `%` in a drug or food name deleted the confounder line (B-733's drop rule was
  written for a decoration; this line is Dr. Chen's condition) — the strength token is
  now stripped and the line kept; a future-dated episode was a tile but not a bar
  (C-4) — the gallery is bounded by today; the gallery's count was a display-window
  count spoken as a record fact (CUL-223) — it names its weeks; two dose dates a year
  apart printed as one date (C-19) — the compare is capped at the chart's 84 days a side,
  so its dates are always the last twelve months'; and the compare now takes the DAY
  COUNTER the title states as its one authority, ending today, never re-derived from the
  start day (the pass's M05: every fixture had built one from the other).
- The eight survivors are each pinned: `MIN_WEEKS` at a one-day lookback, an odd
  lookback's halves, `recordStart` on the bars and the compare, the medication window's
  edges, a pending row over a stale recommendation, the looks join's `deleted_at`, and
  the title's verdict list by content (the property test read the same list — a C-34
  tautology; the list is now asserted word by word).
- A latent C-40 in the dose read (a text bound between the two ISO spellings, absorbed
  by a day of slack) is closed: the bound compares the fixed-width first 19 characters.

## Decisions made in-session

- **The gallery's population is the chart's** — the episodes inside the drawn weeks —
  not the whole record and not the trial window: the count beside the tiles then matches
  the bars above them (C-4 across sections).
- **Nine bars, not eight.** The Sunday-start weeks a 56-day lookback touches on a
  Thursday are nine (eight whole and the partial). The issue's "Sunday-start weeks ending
  in the current week" is honoured; the count follows. The title says "the last 8 weeks"
  above nine bars — both honest, one-line to change if the device pass reads it as a
  mismatch.
- **The phone script stays reachable.** A safety finding's tap used to reveal it; under
  the flag the tap goes to the screen, so the screen carries it, after the why.
- **The safety lead keeps the shipped card, with the door** (S1) rather than a chart
  canvas. The issue said as much; recorded because the chart would have been easy.
- **The plan-gate in an unattended session:** posted on the issue before coding; the build
  proceeded on it with every call reversible in review (the D2-1 precedent).

## Residuals and follow-ups

- The chart's label tail (780ms) exceeds the screen's 700ms budget by the chart's own
  numbers; pinned and stated in `signalOpenMotion.test.ts`. If the device pass reads it
  as a fourth beat, the change is D2-1's constant, not this screen's.
- VoiceOver focus on the title is asserted as a call; the device pass (D2-9) verifies it
  lands.
- The route's `animationDuration` is honoured on iOS; Android takes the platform's
  default for `slide_from_bottom`.
- The flight (D2-6) lands on this route; nothing here pre-empts it.

## The merge with main (at wrap)

D2-4 (#880) and D2-5 (#882) landed on `main` while this lane was in review, so `main` was
merged into the branch before the squash: five seams, none of them logic — both guards'
lists (the haptics `ALWAYS_SCANNED` keeps every lane's entries; the flag-off guard's
consumer set is the union of the four consumers, pinned), the namespace index (main's
`home/` note plus this lane's `signal/` exports), the beta hint (one sentence naming all
three surfaces), and the verdict-label map, which D2-4 had lifted to
`lib/incidentReadState.ts` — the gallery now imports `INCIDENT_REC_LABEL` from there, so
the record, Home's spine node and the Signal's gallery name one verdict one way. The
merged tree typechecks and every suite either lane touches passes (63 suites).

## DoD

- Acceptance criteria: see the PR body's checklist (all eight pass in tests; the motion's
  device half and VoiceOver focus are D2-9's).
- Types pass; `npm test` green (413 suites, 8882 tests); the new suites green under
  Kiritimati / Chatham / Honolulu.
- Tests: `lib/signalWindows.test.ts` (19), `lib/signalTitle.test.ts` (11),
  `lib/signalScreen.test.ts` (28), `lib/signalRoute.test.ts` (3),
  `components/motion/signalOpenMotion.test.ts` (7), `SignalLeadCard.test.tsx` (5),
  `SignalScreen.test.tsx` (13), `SignalZone.designV2.test.tsx` (5).
- No new secret.
- Persona sign-off: Designer ✓ (S1 on the safety lead; the title's register; the door as
  the one verb) · Data Scientist + Data Vis ✓ (one window predicate, C-4 property-tested;
  the compare names both logged counts; §05 charts reused) · Dr. Chen ✓ (per-episode reads
  in the shipped words, no aggregate; the confounder named with its dates and kept through
  a "%" name; the day-one floor) · Motion Designer ✓ (three beats inside 700ms on the
  fold's physics; the chart's 780ms label tail stated) · Engineer ✓ (the route; C-9; C-42
  paging by rows received; the guards proven by mutation) · T&S ✓ (the owner's own photos,
  signed URLs as today, RLS-scoped) · QA ✓ (the eight ACs mapped to tests in the PR body).
- Adversarial review (`adversarial-reviewer`, isolated): tried a trial on **day 1** → the
  compare drew one day against one day — **BROKE**, fixed with the floor; tried a
  **diligent-baseline / drifting-trial** record (19 over 55 logged days vs 5 over 16,
  one rate) → the bars read a 4× improvement and the sentence named only the calendar —
  **BROKE**, the sentence names both logged counts; tried a **re-logged bout with the
  photo on the second row** → photo and its `worth_a_call` dropped — **BROKE**, fixed by
  `boutMembers`; tried the verdict read under a **max-rows cap of 50** → truncated at
  the first short page — **BROKE**, pages by rows received; tried a **future-dated
  episode** → a tile but not a bar — **BROKE**, bounded by today; tried a **daily staple
  cluster** ("chicken and duck") → the title names both members ✓; tried a **re-logged
  bout on the bars** → one episode everywhere ✓; tried **absent per-episode reads** →
  "No read yet", no aggregate, no field for one ✓; tried the **three CI zones** →
  identical bucketing ✓. Mutation battery: 28 applied, 8 survived, all 8 now pinned.
- Future-self: one window predicate for four surfaces (the card's bars, its line, the
  compare, the lanes) and one screen model; the risk in twelve months is a fifth surface
  (the month, the report) restating a window instead of adding a spec here. The header's
  "ONE window predicate" and the C-4 property test are the check.
