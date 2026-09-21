# D2-4 — Home on a real day: the look as Today's header, the spine in daylight

**Date:** 2026-09-21 · **Issue:** CUL-1066 · **Shipped via #880** (draft)

Step 2, lane 2 of the Linear project *Design v2 — the whole day*. The first surface to
land behind the `design_v2` toggle (D2-0), and the first consumer of `useDesignV2()`: the
guard's zero-consumer tripwire retires with it, and its three debts are paid here (the
namespace's first modules, the beta shelf's on-state hint, and — for the Signal lane —
the `app/` consumer check that will make D2-3 list its route).

D2-3 (CUL-1065) had no PR on `main` when this started, so flag-on Home composes the
shipped `SignalZone`; nothing here waits on lane 1's merge order.

---

## What shipped

**The pure half, built first, with the five fixtures as tests.**

- `lib/spineCompaction.ts` — consecutive meals with nothing between them share a line;
  never across a symptom, a medication, a look or a photographed meal; a 400-day
  property sweep pins *never crosses*, *maximal* and *order-preserving*, and the
  Data Scientist's case by construction: a meal logged after a vomit is not in the group
  before it, because the rule sorts by time before it looks for runs.
- `lib/spineNode.ts` — the node model. "N min after eating" is **the lane's own number**:
  `collapseEpisodes` at the lane's gap, then `classifyEpisodeSet`, keyed back to the row
  that opened the episode — a row the lane would not put on the lane (discovered, free-fed,
  no preceding feeding, absorbed into an earlier bout) gets nothing, never a guess. The
  read on a photographed symptom: a recommendation renders in the record's words
  (`INCIDENT_REC_LABEL`, lifted to `lib/incidentReadState.ts` so the two incident sections
  and Home read one map); an escalation survives a failed or capped row; a row with no
  recommendation says nothing (absence is never wellness); a dismissed read stays dismissed;
  an unknown verdict fails toward the rose. The count line is `buildCountChips` led by the
  total of the same population — looks are never events.
- `lib/monthCoverage.ts` — "September · logged N of M days": distinct local days with any
  non-deleted row this month to date; a look counts as a logged day (§5.6) and never as an
  event. Three populations on Home, none rhyming.
- `lib/spineReads.ts` — the four bounded reads (the photo set, the feedings inside the
  lookback so last night's bowl times a 6 AM vomit, the free-fed spans, the month's
  instants) plus the one server read, `event_ai_analysis`, OBSERVED and never triggered.
- `lib/analysis.ts` gains `analysisChainOutstanding` — the `working` fact for a surface
  that only observes (C-30). `lib/fabFootprint.ts` writes the inset once (96 ≥ 88).

**The motion.** `useNodeArrival` in `components/motion/arrivalMotion.ts` (extended, no
sibling module): the tick that waits IS the rail that lands — one `Animated.View`, the
same React instance before, during and after (the node-identity test). The breath is
Principle 9's carve-out written down (`TICK_BREATH`: 1.4 s, native driver, only while a
request is in flight, still at full opacity under reduced motion, finishes on blur). The
recolour is a step, because colour is not a native-driver property and a node carrying a
native transform may not also carry a JS-driven one. The rest is the fold's numbers.

**The components** (`components/designV2/home/`). `LookHeader` — the question in the
serif, eight cat chips (`LOOK_HEAD_WORDS.cat` gains `played`, the second positive, so the
good direction costs the same tap as the bad one), *More…* to the families, the absence
chip, the intake router and the emergency door; **one tap is one word is one look**
through `insertLook` → `prependEvent` → `showLook`; *Change* returns the chips and a
second tap is a second entry (R9 / T-14); Undo on the answered row during the register's
dwell; the withheld protection kept (a positive-only look under a live intake concern
draws `LookWithheldEntry`, a skeleton while unknown). `TodayCard` — the label, the
header, the count line, the spine, and C-12's three states below "has rows" off a new
per-pet `todayRead` marker in the event store. `Spine` / `SpineNodeRow` — the day-ground
renderer over `SpineRowFrame`, which `components/recap/DaySpine.tsx` now exports after
gaining `ground: 'night' | 'day'` (the recap keeps night, byte-identical). `CoverageDoor`
— left-aligned, one control, → Patterns.

**Home** (`app/(tabs)/index.tsx`): one gate read; flag-on swaps `MedStrip`'s write,
`LookCard`, `TodayZone` and `TrendZone` for `TodayCard` + `CoverageDoor` and takes the
page's inset; flag-off is untouched (the order suite pins both orders).

**Guards.** `homeWrites` allow-set gains `LookHeader → ['insertLook']` — the note stays on
the record screen, so `updateLookNote` is not allowed there, and the pin's history records
this as the third fire and NOT a new class. `haptics` `ALWAYS_SCANNED` gains
`SpineNodeRow.tsx`. Both proven red by mutation before the commit (a `selectChip` import in
the row; an `updateLookNote` call in the header). `designV2FlagOff` pins the consumer set
to Home. `app/(tabs)/index.designV2.test.tsx` proves the async half (C-41): flag-off, over
a photographed vomit in the store and a server mock that would answer, no spine row
renders and `supabase.from('event_ai_analysis')` is never called; flag-on, both happen.
`occurredAtConfidence` registers the header's mirror with the card's reasoning.

**The ledger.** `constants/lookWords.ts` is in `generate-report`'s shipping closure (via
`lib/lookDayCounts.ts`), so adding `played` moved the function's fingerprint. The entry
was already `pending` (the R-1 / R-2 deploy is owed); it is re-fingerprinted with a
prepended reason, the CUL-1038 shape: the function reads the vocabulary
(`generate-report/noticed.ts`), never the compact list, so the bundle's behaviour is
unchanged and the owed deploy is the same deploy.

---

## Decisions made in-session (each stated on the issue for D2-8's Tier-2 edits)

- **One tap = one word = one look.** The page rules the chip is the save; the card's
  multi-word Done bar is not on the header. Multi-word looks remain on the record editor.
- **Looks are not spine nodes on Home.** The header is today's look; the recap spine keeps
  its hollow bead. The count line never counted them anyway.
- **The count line follows `buildCountChips`'s order** (symptoms first, the recap's rule)
  rather than the mock's "7 meals · 2 vomits".
- **The header's question is its own string** (`lookHeaderQuestion`: *How does Nyx seem
  today?*) — the card's names the reference (*compared with her usual*) because it sits
  alone; the header sits at the top of Today, whose frame is the day.
- **The arrival's sentence belongs to the arrival.** A read already in the record renders
  its verdict line alone (the page's first vomit); the read that lands while the owner
  watches keeps its sentence for the visit (the page's second).
- **The dog row's second positive is not taken** — Dr. Chen's call at D2-8.
- **The plan-gate in an unattended session,** as D2-1 ran it: the plan was posted on the
  issue before coding; no go-ahead can arrive mid-session, so the build proceeded on the
  plan with every call reversible in review.

## Reviews

_Filled in below once the two isolated passes return (the adversarial pass on the
spine's clinical and statistical logic; the code-reviewer on the diff)._

## Residuals

- The on-device pass (D2-9, CUL-1070) owns the pixels: the FAB clearance at scroll end
  is asserted off the rendered style (no layout engine in jest), the breath and the
  arrival are asserted as contracts, the day-ground rail and node tints are measured
  tokens but unseen on glass.
- D2-3's route joins the flag-off guard's `SURFACES` in its own diff (the `app/` consumer
  test reds if it does not).
- The header carries no note field (T-22 stays on the record screen) and no Done bar;
  whether §3.1a's "the way back pins" still needs `LookExits` under the flag is a D2-9
  observation (the header publishes the overlay while the families are open).
