# Nyx History v2 — The Record You Can Read — Requirements (CUL-1108)

**Version:** 1.2 — **BUILD-READY** | **Date:** 2026-09-25 | **Status:** every ruling made. The PM ruled on round 4 of the mock (2026-09-24) and handed five calls to the team (H-3, H-4b, H-7, H-10, H-11), which are made in §0.2 with their dissents recorded. Nothing is open that blocks a build session; four pieces wait on issues outside this project (§10).

**Design authority:** round 5 of *The Record You Can Read* (https://claude.ai/artifact/RNvdtUG6FX5utWmzGqBNa6), committed as `docs/culprit-history-v2-mockups.html`. The repo file wins on divergence. Round 4 (the options side by side) is in git at `b0479342`; round 3 at `ab20698c`.

**Read with:** `docs/history-v2-round3-critique-2026-09.md` (the critique this spec answers: every BRK / GAP / PMD id cited below is defined there, and its §V corrects the dose evidence); `docs/nyx-signal-fold-requirements.md` and `docs/nyx-incident-screen-requirements.md` (the motion vocabulary and the per-incident read this reuses); `docs/nyx-daily-look-requirements.md` (the Noticed rules H-9 defers to); `docs/nyx-diet-trial-requirements.md` §5 (the trial predicates the windows import); `docs/nyx-med-history-requirements.md` (the course grain the drug filter keys on); `docs/nyx-vet-visits-requirements.md` (the visit bound H-11 shares); `docs/nyx-filter-ux-requirements.md` (the ScopeMenu pattern the sheets keep).

**Linear:** project **History v2 · the record you can read** (team Culprit). Its description carries the run order in §8, with a paste-ready kickoff prompt per session.

---

## 0. Decision record

### 0.1 The rulings (2026-09-24, the PM's reactions to round 4)

| # | Decision | Ruling | By |
|---|---|---|---|
| **H-1** | One row for History and Home | **(a) Shipped Home's frame:** the time in a fixed left column that wraps instead of cutting off; round 3's rules for runs, chevrons and naming (B, D, K) move into Home in the same bundle. *"Time on the right doesn't feel as intuitive as time on the left. The time is an integral part of a timeline."* | PM |
| **H-2** | The strip and the header at a glance | **(a) The month's day mark without counts,** a broken line for a day with a meal left unfinished, and the header naming unfinished meals **in neutral grey**. *"I don't really love adding the count to the day square."* | PM |
| **H-3** | What stays on screen while scrolling | **(b) The pills row pinned, each day's header sticky beneath it, a landed day's outline;** the strip scrolls away. *"I LOVE this. I'll defer to the team which variant."* | Team (§0.2) |
| **H-4a** | What Hide hides | **The words only,** on every surface. The owner's "No, it's something else" (CUL-1107) is the one act that stands the rose down, everywhere at once. No reaction; the recommendation stands. | Team rec., unobjected |
| **H-4b** | A photographed row whose photo was never read | **A grey "Photo not read" on the row when a read was expected and never landed; said once when the owner turned photo reading off.** *"I'll defer to the product team."* | Team (§0.2) |
| **H-5** | The third pill, and a medication's doses | **(a) The ⋯ pill goes;** Photographed, With a note and one sub-row per medication course move onto the type sheet; "With a read" retires. No reaction; the recommendation stands. | Team rec., unobjected |
| **H-6** | Where a free-fed bowl lives | **(a) One quiet line under the count line** while a bowl is down. *"I like it pinned up top."* | PM |
| **H-7** | Which links into History are frozen | **(a) Only the widget's link** (the one sender outside the app); in-app links may add parameters under the flag; a registry of every sender fails the build on an unregistered one. *"A bit technical. I'll defer to the Dir. of Eng and the team."* | Team (§0.2) |
| **H-8** | The flag | **(a) Its own `history_v2`,** which also carries Home's first paint and the one shared open-in-place motion. *"I'm fine shipping it behind its own flag."* | PM |
| **H-9** | What the Noticed filter counts | **Nothing.** The count line becomes one link, *What you noticed is on Patterns ›*; the strip shows dates only; nothing ever says a day had no look. *"I don't think answered days is that useful. Maybe this just disappears."* Then, asked: *"Keep a small link to Patterns."* | PM |
| **H-10** | Where the year goes | **(a) Bare in the current year, stamped outside it, once per range;** months grouped under their year. *"I'll defer to the product designer."* | Designer (§0.2) |
| **H-11** | Which day starts "since the last vet visit" | **The latest visit before today, including its day,** through the vet report's own bound. *"I'll defer to the team."* | Team (§0.2) |
| — | The quiet states | **As drawn** (§3.12). *"LOVE that we added an empty state."* | PM |
| — | The build | *"Finalize these requirements; a Linear project; a session-by-session plan with what runs together and what runs in parallel."* §8 and the Linear project. | PM |

### 0.2 The calls the team made at the PM's deferral (2026-09-24)

- **H-3 → (b).** The pinned pills row and the sticky day header cost about 44pt and answer the two questions a scroll loses (which day, which filter). Pinning the strip too, (c), costs about 150pt on every screen and leaves the day under half the phone; the strip is one flick up. Nothing pinned, (a), is round 3's step back. **Unanimous.**
- **H-4b → the row says it, unless the owner chose it.** A quiet grey *Photo not read* marks a row whose read was expected and never landed: it failed, it was never sent, it hit the day's cap, or the phone holds no copy. When the owner has turned photo reading off (CUL-552's consent), rows stay unmarked and the state is said once, on the type sheet (*Photographed · photo reading is off*) and on the record. This takes each side's load-bearing concern and drops what did not survive: **Jordan and Engineering** — an unread photo must never look like a calm one, offline or not, and CUL-552's own acceptance rule forbids an absence a worried owner could read as "no flags found"; **Trust and Safety** — the list must not carry a mark on every photographed row that works as pressure toward a consent the owner declined. **Recorded dissent:** Trust and Safety would still rather the list add nothing; accepted cost, because the mark is grey, never rose, and sits only on rows whose check did not happen.
- **H-7 → (a).** Freezing in-app senders byte for byte would block the only client-side fix for Ask's "Last 7 days" disagreeing with History's (BRK-5). The widget is the one sender that cannot ship with the app, so it alone is frozen; everything else registers. **Dir. of Engineering, with QA.**
- **H-10 → (a),** the Designer's own recommendation: every bare date is then in the current year, and the week you live in stays quiet. (b) would stamp the default screen for almost every account from Jan 1, 2027; (c) leaves a lone date (a gap line, the strip's label) without its year.
- **H-11 → Dr. Chen and Jordan's position.** The window starts on the day of the latest visit strictly before today and includes that day: the bound the vet report and the rundown already use (*starts from this visit*), through one shared function. Consistency across History, the rundown and the report outweighs matching Home's *since last visit*, which restarts the day a visit is saved; that difference is written down (§3.9). **Recorded dissents:** the Data Scientist (start at the midnight after, since a same-day event cannot be placed before or after a visit that has no time) — answered by including the day: a vet reading "since your visit" sees more, never less; the Designer (anchor on a visit saved today, as Home does) — answered by the one-function rule.

### 0.3 Carried from rounds 1 to 3 (settled; not re-argued)

Days at local midnight, newest first, morning to night inside a day; one door per row (every row opens its record); the filters kept and extended (ScopeMenu, full-width sheets, a count on every sheet row); the rose only, nothing standing at the top but the count line (and, per H-6, the bowl's line); the note on the row (gated on CUL-848); the strip on top, paged by the week, bounded by the window, marks not numbers; the noise cut (rules B to G); every meal named (rule K); the month grid retired. Overruled dissents stay recorded: the Data Scientist and Dr. Chen's standing sentence about reads; the Motion Designer's refusal of swipe paging (kept paged and snapping).

### 0.4 The critique's four rules, adopted without a ruling

R-1 (one population and one query behind every number; absence only over watched days), R-2 (a row says the same thing under every filter and every search), R-3 (import what the app already computes), R-4 (a list that survives paging, a pet switch and Reduce Motion). Each is specified where it lands (§3, §5) and carried as acceptance criteria (§7).

---

## 1. The job

History is **the record you can read**: what happened, when, and how often, for a window you choose, at home or in the exam room. It answers the owner's questions without interpreting them, and it hands every number to the surface that owns it.

- **Jordan** (a diet-trial dog): "How many vomits since the trial started, and on which days?" "Anything besides the trial food?" "What did he eat before the 4:40 PM vomit, and how long before?"
- **Sam** (a grazing, picky cat): "Which days did she leave food?" "When did she last finish a meal?" A refusing cat must never read as routine one level above the rows.
- **Dr. Chen** (in the exam room, reading the owner's phone): "Since the last visit, how often?" "Which doses were missed or partial?" "Show me the photo." The count, its window and its coverage in one line; the photo one tap away, never in the list.

**Non-goals.** History never interprets beyond the read's one rose word; never counts looks (H-9); never shows a photo in the list (rule 1); never saves a search; never becomes a second vet report. It is the record, drawn well.

---

## 2. What exists today (verified 2026-09-24 against `main` at #902)

Every build session re-verifies its own rows at file:line before building on them (the taxonomy spec's lesson: a premised surface is checked, not remembered).

| Area | Today | What History v2 does with it |
|---|---|---|
| **The History tab** | `app/(tabs)/history.tsx` (~800 lines): a `FlatList` over `mergeTimelineItems` (`lib/historyTimeline.ts:64`), three row kinds (`EventRow` — tap expands, long-press opens, View / Edit / Remove inline — `BoundaryMarkerRow`, `VisitTimelineRow`); `TypeScopeControl` and `DateScopeControl` on `ScopeMenu`; `effectiveRange` (`lib/historyDateFilter.ts:45`): *today* is local midnight, 7 and 30 days are N × 24 hours, `?date=` is a UTC day; params `date`, `ts`, `pet`, `type`, `window`; 50 rows a page from `getTimeline` (`lib/db.ts:442`), ordered `occurred_at DESC, id DESC` with the offset stepped back after a Remove since #902 (CUL-1078); `FreeFeedingStrip` under All and Meal; skeleton, error and empty states. | Flag off: unchanged. Flag on: the v2 screen in `components/historyV2/`. v1 is deleted at GA (HV-14). |
| **Home's row** | `SpineRowFrame` (`components/recap/DaySpine.tsx:135`; `TIME_W` 56 and `RAIL_W` 18 unexported and re-typed as `56 + 18` in `SpineNodeRow.tsx:440`; the time is `numberOfLines={1}`, so it truncates; `minHeight` 44). `SpineEventRow` (a chevron on every row), `SpineCompactRow` (raw `LayoutAnimation`), `MemberRow` in `components/designV2/home/SpineNodeRow.tsx`. Text from `describeDayEvent` / `foodLabelOf` (`lib/dayEvents.ts`), and a second `foodLabelOf` with a different separator in `lib/patternsTiming.ts:422`. | Lifted out of the design_v2 namespace so both surfaces import it (HV-1); the time wraps; one food label; rules B, D, K (HV-6). **Done in HV-1 (#907):** the row lives in `components/dayRow/` (`SpineNodeRow.tsx`, picked by `DayNodeRow.tsx`); `TIME_W` (now 60, ⚠ RULED 2026-09-25, CUL-1183) and `RAIL_W` are exported; the time wraps; `lib/dayNodes.ts` is the pipeline both surfaces call. |
| **Runs** | `compactSpine` / `isCompactable` (`lib/spineCompaction.ts:54`): consecutive meal rows with no photo and the same kind fold; no intake, food, format or timing check (CUL-1121). `compactNode` (`lib/spineNode.ts:353`) names the food only when every member shares one label. | Rule B, one predicate for both surfaces (HV-6). |
| **The timing lane** | `timingsByRow` (`lib/spineNode.ts:256`) runs `collapseEpisodes` / `classifyEpisodeSet` (`lib/mealTiming.ts`) over `readFeedingsSince` (`lib/spineReads.ts:49`), which reads no intake; the lane returns the meal's form label only, no id; a refused bowl and a treat both count as eating (CUL-1122). `generate-signal` imports `lib/mealTiming.ts`, so any change to it redeploys that function. | Intake-aware, and it names the meal it measured from (HV-2). |
| **The read** | Home: `TodayCard` → `readAnalysisRows` (`lib/spineReads.ts:102`, a Supabase select of `event_id, status, recommendation, read_text, dismissed_at`) → `nodeReadOf` (`lib/spineNode.ts:209`) with `escalationSurvivesFailure` and `INCIDENT_REC_LABEL` (`lib/incidentReadState.ts`); in-flight reads via `analysisChainOutstanding` / `awaitAnalysisChain` / `watchAnalysisRow` (`lib/analysis.ts`). The month: `readWorthACall` (`lib/monthReads.ts:214`). The Signal screen reads verdicts too (`lib/signalScreen.ts:617`). **No local copy:** offline the spine shows no verdict and the month draws every photographed day as seen. Hide writes `dismissed_at` straight to Supabase and hides the whole card (`VomitAnalysisSection.tsx:243`, `:392`); the spine drops the verdict on Hide (`spineNode.ts:214`), the month and the Signal screen ignore it. Which types expect a read: `hasPerIncidentRead` (`constants/eventTypes.ts`). | A local copy of the verdict and one `readStateOf` for every surface (HV-5). |
| **The month's marks** | `DayMark` (`components/charts/DayMark.tsx:92`, `:205`): logged is `colorAccentSoft` #86D9CC (1.64:1 on white), left some is `colorAccentWashDeep` #CDF5EC (1.18:1); both are overridden on a vomit day, so an unfinished meal cannot be seen there; neither is pinned in `theme.contrast.test.ts`; the legend swatch is in `MonthInstrument.tsx:568`, `:796`. `left_some` comes from `monthReads.ts:159` over `qualifyingIntakeMeals` / `isFinishedMeal` (`lib/analytics.ts:768`, `:787`). The month's population is every event except a look (`LOOK_EVENT_TYPE`, `monthReads.ts:67`). | The line at 3:1 or better, broken by shape, still visible on a rose day; a count-less variant for the strip (HV-8). |
| **Motion** | `components/motion/`: `arrivalMotion` (`useIncidentArrival`, `TICK_BREATH`, `useNodeArrival`), `foldMotion`, `openInPlaceMotion` (`useOpenInPlace`, used by the month only), `drawInMotion` (`useDrawIn`), `flightMotion` + `FlightHost`, `lookMotion`, `signalOpenMotion`. Nothing draws a thread. `hooks/useReducedMotion.ts` starts `false` and asks the OS after mount (CUL-1123). | HV-10 |
| **Bounds** | Trial: `lib/dietTrial.ts` (`buildTrialContext`, `isTrialRunning`, `TrialFacts.exposureRange`). Courses: `deriveMedicationCourses` (`lib/medicationHistory.ts:221`; keyed by regimen id, else `item:<id>`, else `item:unspecified`; the report imports it). The report's visit bound: `resolveScope` skips any visit on or after today (`supabase/functions/generate-report/report.ts:873`). The client's `readLastVisitDate` (`lib/rundown.ts:676`) is a bare `MAX` (CUL-1127); the today rule exists client-side only in `readVisitConsequence` (`lib/vetVisits.ts:2002`) and `visitAnchorsAnything` (`lib/vetVisitPlan.ts:270`); any new visit read registers in `guards/visitReaders.test.ts`. Duplicates: `dedupeEvents` (`report.ts:1048`; 60 seconds; symptoms and stool collapse by type, meals only on a matching food, nothing else ever), typed on the report's own event shape and not importable by the client. | HV-3, HV-4 |
| **Flags** | Eligibility × opt-in (`lib/appConfig.ts:97`, `lib/betaFeatures.ts`, `hooks/useAppConfig.ts`). `design_v2` is the template: migration 070, `hooks/useDesignV2.ts`, `components/designV2/`, `guards/designV2FlagOff.test.tsx` (first frame only). `vet_visits` went to every account in #893 and its guard was deleted. | HV-1 |
| **Search** | None; no `LIKE` helper anywhere; the pickers filter in memory. | HV-4, HV-9 |
| **Links into History** | The eight senders in §5.8. `PatternCalendar` renders flag-off only (the new month opens a day in place); the widget sends a local day that History reads as UTC. No registry exists. | HV-11 |
| **Local schema** | `BASE_SCHEMA_SQL` (`lib/localSchema.ts:25`), `COLUMN_UPGRADES` (`:415`), `LOCAL_WIPE_TABLES` (`lib/hydration.ts:261`; `hydration.test.ts` builds the real schema and fails on an unwiped table); `hydrateFromCloud` runs one watermark step per table (`lib/sync.ts:3156`). `event_attachments` is mirrored; `event_ai_analysis` is not. | HV-5 |

---

## 3. The screen (the design authority is round 5)

### 3.1 The pinned row and the sticky day header (H-3)

- **The pinned row:** the pet's name (the active pet; a record-scoped screen below names its record's pet, C-9), the **type pill**, the **window pill**, and the **search** button. Pinned at the top of the scroller; about 44pt.
- **The sticky day header:** each day card's header (§3.5) sticks directly under the pinned row while any of its day is on screen, and is pushed off by the next day's header. It carries the date and its counts, so mid-scroll the screen always says which day and which filter.
- **The landed day:** a strip tap (§3.4) or a doorway (§5.8) lands on a day; the day card keeps a 2pt teal-ink outline (`colorAccentInk`) and the strip cell its 2pt ring until the owner's own scroll clears both. A programmatic scroll never clears it. VoiceOver focus goes to the day's header.
- **Tapping the History tab again** returns to today: scroll to top, the strip back to this week, the landed state cleared, focus on today's header. The viewport move honours Reduce Motion (§4).
- The count line, the bowl's line (§3.3) and the strip scroll away with the list.

### 3.2 The count line (R-1)

One line under the pinned row, over **one population and one query**: every logged event except a look, the population the Patterns month counts (BRK-3). Its forms:

| State | Line 1 | Line 2 (coverage, only when true) | Doors |
|---|---|---|---|
| All types, All time | *All time · **1,094 logged** since May 14* (the pet's first record) | *1 day unlogged · 3 logged twice in the same minute* | *Outside the trial diet ›* while a trial overlaps the window (PMD-9) |
| All types, any other window | *Last 30 days · **195 logged*** | the same coverage clauses, over the window | the same |
| One type (or All symptoms) | *Since the trial started, Jul 26 · **13 vomits on 11 days*** | coverage over the window | a symptom filter: the chart that owns the number (*Before and since the trial ›* under the trial window; *See the compare ›* otherwise) |
| A medication course | *All time · **16 doses on 16 days*** | *Cetirizine HCl · Jul 1 – Sep 5* and coverage over the course's days | — |
| Photographed / With a note | *June · **12 photographed rows*** | coverage | — |
| Noticed (H-9) | *(no count)* one link: ***What you noticed is on Patterns ›*** | — | — |
| Search | *Rows that mention **"rabbit"** · All time* | *Search finds; it never counts.* | — |

Rules:
- **Coverage** ("N days unlogged") appears on every window and under every filter, All time included, and says nothing when the window is fully covered (C-3). A window starts no earlier than the pet's first record (GAP-24); a course filter's coverage is over the course's own days.
- **Same-minute duplicates** are disclosed (*N logged twice in the same minute*) using the vet report's duplicate rule, lifted into one shared module (PMD-10, §5.2).
- **A filtered count names its days** (*13 vomits on 11 days*) and the window's start date (*Since the trial started, Jul 26*).
- **Every count re-derives together** after a write, a removal, a sync or a refresh (GAP-18): the line, the pill's count, the day headers, the strip.
- A month with nothing logged reads *nothing logged*, never 0.
- The door labels are placeholders for the copy pass; the destinations are fixed.

### 3.3 The free-fed bowl (H-6)

While a bowl is down, one quiet line sits under the count line, under All types and Meal only: *Always available · Royal Canin · Selected Protein PR, Dry · since Sep 10* (the shipped `FreeFeedingStrip`'s facts, restyled). Started, Stopped and Switched markers return as date-only items at the top of their days (§3.5). A vomit while a bowl is down gets **no** "after eating" line (the lane has no feeding time to measure from).

### 3.4 The strip (H-2, rule I)

One week of the Patterns month's day marks (`components/charts/DayMark.tsx`), Sunday first, **without counts**, in a scroller that snaps to the week; the arrows do the same and are the accessible path. The label is the week's range only (*Sep 13 – 19*; WBC-3).

**One pure `stripMarkOf(dayFacts, filter, window, today)`** enumerates every state (WBC-1), table-tested with its spoken label:

| State | Mark | Spoken label (PMD-13) |
|---|---|---|
| Before the pet's record | no box, date faint | "{day}, before {pet}'s record" |
| Outside the window, or a course's bounds | absent | — (not focusable) |
| Ahead of today | outlined box, date faint | "{day}, ahead" (a plain view, never a disabled button, C-7) |
| Nothing logged | grey square | "{day}, nothing logged" |
| Today, nothing logged yet | white box, today's border | "{day}, today, nothing logged yet" |
| Logged (All types) | white box, a line | "{day}, no vomiting logged, {n} logged in all" |
| A vomit day (All types) | rose fill, white date | "{day}, vomiting logged {k} times, {n} logged in all" |
| A meal left unfinished (All types, Meal) | the line **broken** | "…, a meal left unfinished" |
| The filtered kind (a symptom filter) | rose fill | "{day}, {symptom} logged {k} times, {n} logged in all" |
| The filtered kind (any other filter) | a line | "{day}, {type} logged {k} times, {n} logged in all" |
| A dose not given in full (Medication, a course) | the line **broken** | "…, a dose not given in full" |
| Logged, but not the filtered kind | white box, no line | "{day}, no {type} logged, {n} logged in all" |
| Under Noticed (H-9) | the date only, no mark | "{day}" |

- **The rose predicate per filter:** All types marks **vomit days**, as the month does (so the two surfaces never disagree about one day); a symptom filter marks its own kind; All symptoms marks any symptom. The strip's rose and the header's symptom words are registered as `SYMPTOM_TYPES` consumers in the §13a membership walk, with `stool_normal`'s decision stated (C-11).
- **The broken line** keys on a recorded rating below Most on a qualifying meal (`qualifyingIntakeMeals`: rated, never a treat, never free-fed), never on a missing rating, so CUL-1118's outcome cannot change its meaning. Under a medication filter it keys on a dose recorded Partial, Missed or Refused.
- **Marks are told apart by shape at 3:1 or better** (WBC-1): the logged line darkens from `colorAccentSoft` (1.64:1) to a token at ≥ 3:1 on white, the broken line is the same colour in dashes, and the month changes with it (one `DayMark`). `constants/theme.contrast.test.ts` pins both.
- **Bounded:** the window, the pet's first record, and a course's bounds. The back arrow disables at the edge and says why (*Earlier week · {pet}'s record starts May 14*; *… Last 30 days starts Aug 23*); the arrows' labels say they move the strip, and that a day is reached by tapping it.
- **A tap lands** on that day's card, or on the gap line that holds it (§3.1's landed state). The pager settles on the scroll's end event, never a timer (GAP-10).

### 3.5 The day card

- **The header (rule C):** the date (*Mon, Sep 21*, with *Today* on today), the total (*8 logged*), every symptom kind in rose (*1 vomit · 1 cough*), *other* entries neutral, and ***N meals not finished* in neutral grey** (H-2; qualifying meals only, never a treat). Under a filter: the filtered count first, then the day's total (*2 vomits · 10 logged*). Under search: the date only (R-2). The date never wraps.
- **Date-only items (rule L)** sit at the top of their day, above the first row, and stay visible under every filter: a vet visit (a small square mark, *Vet visit · Recheck · Riverside Clinic*, opens the visit), a course start (a short bar, *Prednisone started*), a bowl's Started / Stopped / Switched. Never counted; never the hollow bead Home uses for a look (BRK-11).
- **Rows** morning to night; the sort key is (occurred_at, id), so a same-minute pair never swaps between renders (rule H).
- **Gap lines (R-1):** under All types, a run of days with nothing logged is one line (*Sun, Sep 20 · nothing logged*; *nothing logged · Sep 13 – 16*). Under a filter, *no vomit logged · Sep 18 – 19* spans **only closed, logged days**: it splits at an unlogged day (which gets its own line), never includes today, never starts before the type's first row or a course's start, and carries dates only. A day whose only content is a date-only item renders its card (a visit-only day is a day). Under Noticed, no gap line ever states a miss (H-9).

### 3.6 The row (H-1)

**Geometry (shipped Home's `SpineRowFrame`):** the time in a fixed left column (`TIME_W`, **60pt**; ⚠ RULED 2026-09-25, CUL-1183: round 5 drew 56, but a run across noon's first line, *11:30 AM –*, is 58.7pt of Geist at the app's 11pt and fell to three lines) that **wraps instead of cutting off** (*12:41 PM –* / *3:02 PM*; a range breaks after its dash, each time unbreakable), the category's dot on the spine (`RAIL_W`), then the content. Minimum height 44pt (GAP-9). A found time reads *by 7:02 AM* with FOUND under it; an estimated time carries ESTIMATED.

**Content by kind** (the round-5 table, restated as the contract):

| Kind | Line 1 | Line 2 and below | Never |
|---|---|---|---|
| Meal | *Meal · Royal Canin · Selected Protein PR* + WET/DRY tag | the intake chip when rated (All, Most teal; Some grey; Picked at, Refused rose); *with Prednisone* when it carried a dose | folded into a run when rated below Most, photographed, noted, the meal a timing line measures from, or a dose's vehicle |
| Treat | *Treat · …* | as a meal | counted in *meals not finished* |
| A run (rule B) | *4 meals · Royal Canin · Selected Protein PR* + chevron | *1 wet · 3 dry*; the time span in the time column | a second product, a symptom, a dose, a photo, a note or midnight inside it |
| Dose | *Prednisone · in the 1:00 PM meal · picked at* | Given / Partial / Missed / Refused, the shipped chips (GAP-2) | a guessed name: the drug comes from the dose's item, else its course (GAP-25), else *Medication · no medicine named* |
| Vomit (and stool) | *Vomit · 5 min after eating* (witnessed only) + camera glyph | *Worth a call* in rose (rule 7); grey *Photo not read* (H-4b) | minutes on a found vomit; a calm word; the photo |
| Weight | *Weight · 8.2 lbs* (the owner's unit) | — | a trend |
| Other kinds | the type's label | — | — |
| Note (rule G) | — | one line, quoted, cut at a word, the ellipsis inside the quotes | shown before CUL-848's cue is live (§10) |
| Not saved (rule 6) | — | neutral, never rose (waits for CUL-944) | — |

- **Wrapping (BRK-12):** the name wraps to two lines, then cuts at a word; the tags and chips never cut; they follow the name or take the next line. The row's accessible label is the whole row in reading order (C-8: a truncated text still announces its full string).
- **Runs (rule B)** cross wet and dry of one product and speak their counts; any other fact breaks a run. A run's chevron says it opens here (rule D); a single row carries no chevron because every row is a door. **Open in place shows every member**, each a full 44pt row with every fact (GAP-8), on the shared open-in-place module (§4).
- **Both halves inline (rule E):** the dose names its vehicle (*in the 1:00 PM meal*, with the meal's intake when not finished); the meal says *with Prednisone*. The pair is the **stored link** (`paired_event_id`), never a minute match (GAP-3).
- **The timing line** is Home's shared lane, imported (GAP-1, R-3): it returns the meal it measured from, and that meal stays its own row. A refused bowl is never a meal eaten once CUL-1122 lands.
- **The read (rule 7, H-4):** one word, *Worth a call*, in rose (`colorEventSymptomInk`), only when the read's verdict is worth a call. It comes from the **one read predicate** shared with Home, the month and the Signal screen (§5.4), reads the phone's copy (§5.3) so it never waits on the network, and an unknown verdict fails toward rose. A read's status never silences it (CUL-812). Hide hides words, never the rose; only the owner's "No" (CUL-1107, when it ships) stands it down, on every surface at once. A calm read shows nothing on the row. *Photo not read* (grey) marks a row whose read was expected and never landed; with photo reading off (CUL-552), rows stay unmarked.
- **A removed row** leaves through the one shared reversal (`reverseLoggedEvent`, C-20) and the record screen's confirm, which names an event's note (CUL-1125).

### 3.7 Search (R-2, GAP-15)

The search button opens a field under the pinned row: *Foods, medicines, your notes*. Search is **one extra condition on the list's own pet-scoped query** over named fields: the food's brand and product, the medicine's name, the type's label, and the note (the note only once CUL-848's cue is live; until then, names and labels only). It counts nothing (day headers show the date only; the count line says *Search finds; it never counts.*), builds no index, and saves no history. Rows keep every fact (R-2). A search with no match names the word searched (§3.12).

### 3.8 The type sheet (H-5, H-9)

A full-width ScopeMenu sheet, every option visible, a count on every row from the query for the current window:

- *All types*, *All symptoms*, each type (Loose stool and Stool show 0 rather than hiding), *Meal*;
- *Medication*, then **one sub-row per course with a dose in the window**, keyed and bounded by the vet report's course grain (`lib/medicationHistory.ts`): *Motozol · since Jul 16 · 29*; *Cetirizine HCl · Jul 1 – Sep 5 · 16*. A course's count is **every dose row logged in the window, whatever its chip**; the medication card's *Dose X of Y* counts what was given (`dosesTowardTarget`), and the two are never shown side by side (GAP-26). Absent for a pet with no course (PMD-17). Closes CUL-488 (B-688).
- *Weight*, *Other*;
- **What the record holds:** *Photographed* with its sub-line *N not read* (or *photo reading is off*, H-4b), *With a note*;
- **The daily look:** *Noticed*, with no count (H-9), only where the look is live for the account (`daily_look`; every account after CUL-876).

One pill always names what is filtering (the type pill shows *Vomit · 13*, tinted). "With a read" is retired; no filter exists over a read's verdict (rule 3).

### 3.9 The window sheet and the windows table (BRK-5, BRK-17, H-10, H-11)

**One window table**, local days throughout, each window with exactly one long name (the sheet and the count line) and one short name (the pill); anchored windows keep their date everywhere:

| Window | Bounds (local days, inclusive) | Sheet / count line | Pill |
|---|---|---|---|
| All time | the pet's first record → today | *All time* (sheet sub-line *since May 14*) | *All time* |
| Today | today | *Today* | *Today* |
| Last 7 / 14 / 30 days | today − 6 / 13 / 29 → today | *Last 7 days* … | *Last 7 days* … |
| Since the trial started | the trial's `TrialFacts.exposureRange` start → today, offered only while that range reaches today (never `range`; diet-trial spec §5) | *Since the trial started · Jul 26* | *Since Jul 26* |
| Since the last vet visit | **the latest visit strictly before today, including its day** (H-11; the report's bound) → today | *Since the last vet visit · Sep 16* | *Since Sep 16* |
| A month | the month's first → last day (clipped at the record's start and today) | *September* under a *2026* subhead | *September* |

- The trial and visit rows are absent for a pet with none (PMD-17). History's "Last 7 days" is seven local days, and Ask's in-app link adopts the same (BRK-5, §5.8).
- **H-11's difference from Home, written down:** Home's *since last visit* restarts the day a visit is saved; History's, the rundown's and the report's do not until the next day.
- **Dates (H-10):** one formatter for every date and range on the screen. A date in the current year is bare (*Sep 16*); any other carries its year (*Dec 31, 2026*); a range states the year once (*Dec 27, 2026 – Jan 2*); months group under year subheads. CUL-1126 adopts the same formatter on the rundown, the report's scope line and the trial card.
- **A pet switch resets every scope** (All types, All time, search closed, the strip on this week, runs closed, sheets dismissed), and nothing carries a trial or visit date to another pet (GAP-27).

### 3.10 The record route

Every row opens the shipped record screen (`app/event/[id].tsx`) with the platform's standard push (PMD-14; no animation under Reduce Motion). It is unchanged apart from two things other issues own: CUL-848's cue at the note, and CUL-1125's Remove confirm naming the note. A vet visit opens its visit. The photo is the record's hero (rule 1: never on a list).

### 3.11 Under Noticed (H-9)

The list shows the days with a look, each look a row (the shipped look row). The count line is the one link *What you noticed is on Patterns ›*; the strip shows dates only, no marks; no gap line and no coverage clause ever state a miss; the type pill shows *Noticed* with no count. Every count elsewhere keeps excluding looks (R-1).

### 3.12 The quiet states (GAP-5)

| State | What shows |
|---|---|
| A new account | the pinned row; the strip on this week, today outlined, earlier days as before-record; the shipped empty state: ***Nothing logged yet*** / *Tap + anywhere to log {pet}'s first food or symptom. Everything you log builds up here.* No count line. |
| Today, nothing logged yet | today's card keeps its header and *Today* tag and reads *Nothing logged yet today.*; it never merges into yesterday's gap line; the count line counts only what exists. |
| Loading | the list's silhouette (skeleton), hidden from VoiceOver, until the first read answers; never *Nothing logged yet* over a read that has not answered (C-12). |
| A failed read | the shipped copy: ***Couldn't load history*** / *Something went wrong loading {pet}'s history.* / **Try again**. No strip, no count line. |
| A filter with no match | ***Nothing matches that filter*** / *Try clearing a filter to see more of {pet}'s history.* (shipped) |
| A search with no match | ***Nothing matches "{word}"*** / *Search looks in food and medicine names and in your notes.* (the notes clause only once notes are searched) |
| The record's first day | the list ends with *{pet}'s record starts here · Thu, May 14*; the strip's back arrow disables and says why |
| The next page loading | one skeleton row at the foot, then a whole day at a time |

---

## 4. Motion, Reduce Motion and focus (rule 8; WBC-2, GAP-7, GAP-28)

Each gesture maps to one of Design v2's six. Nothing else moves.

| Gesture | Design v2 | Fires when | Reduce Motion | VoiceOver focus |
|---|---|---|---|---|
| First paint | draw in (the thread draws down, rows land as it passes, words in one beat) | the list's first read answers; each visible day once, per mount identity (pet · filter · window · first day) | the still frame | unchanged |
| Open a run | open in place (the shared module) | the owner taps the run; every member opens, uncapped | geometry at once, rows fade over 150ms | stays on the run, whose label now says it hides |
| A read arrives | arrive (the tick is the rail) | the server answers a read the owner is watching; **ends as the resting row**, the rose word or nothing (BRK-9) | the resting row at once | the rose word announced once; a calm read says nothing |
| The wait | wait as shape | the first read is in flight | a still silhouette | hidden |
| Land on a day | a state; draw in when motion is on | a strip tap or a doorway | a jump; the outline still shows | the day's header |
| Page the strip | direct manipulation | a swipe or an arrow; snaps to the week; settles on scroll end | the arrows jump | stays on the arrow |
| Remove a row | fold, for a removal (180 out, the box closes over 300) | after the confirm, through `reverseLoggedEvent` | gone at once | the day's header |
| Open a record | the platform's own push | a row is tapped | no animation | the record's back button |
| Tap History again | a viewport move | the tab is pressed while History shows | a jump beyond one screen | today's header |

**Never:** motion on scroll; a cascade across days (the strip's week fades as one); a pulse, apart from the breathing tick while a read is pending (the named carve-out); a haptic on anything safety-bearing (the haptics guard's scan includes History v2's read). A filter or window change resets the list without animating the viewport. **Reduce Motion is known before the first frame** (CUL-1123): every programmatic scroll passes `animated: !reducedMotion`, and `false` beyond one viewport.

---

## 5. The engineering contract

### 5.1 The flag (H-8)

`history_v2`, a copy of `design_v2`: a migration seeding `{"enabled": false, "allowlist": []}` (the next free number; `ON CONFLICT DO NOTHING`; the Migration Safety Pre-flight in its header); the key in `ALLOWLIST_FLAG_KEYS` and `ALLOWLIST_FLAGS_UNSET`; a `BETA_REGISTRY` row (`serverCost: false`, since no Edge Function reads it); a `presentationFor` case; `hooks/useHistoryV2.ts` (eligible AND opted in, the only reader of the key); the namespace `components/historyV2/`; `guards/historyV2FlagOff.test.tsx`.

- **What rides it:** the History tab's v2 screen; and on Home, only where `design_v2` already draws the spine, the first paint and open-in-place (HV-10).
- **What does not:** the shared row's rules (HV-6), which fix design_v2's own spine (CUL-1121) and land under `design_v2` alone; the read's local copy and predicate (HV-5) and the timing lane (HV-2), which are correctness fixes on every surface that uses them; the month's marks (HV-8), a contrast fix on design_v2's month.
- **The guard:** the History tab and Home each equal their trees with `components/historyV2/` stubbed, after the non-vacuity floor (C-36). History's rows arrive async, so History's own suite also proves that flag-off issues no v2 read over a fixture that would answer (C-41).

### 5.2 The data layer (R-1, R-4)

New modules; `getTimeline` stays v1's until GA.

- **Day pages:** `readDayPage(petId, scope, cursor)` returns **whole local days**, newest first, until a page holds at least 50 rows; the keyset is `(occurred_at, id)` descending, a total order (C-42), and every bound is parsed, never compared as text (C-40). A page never splits a day, and removing a row never shifts a later page.
- **The population:** every event with `deleted_at IS NULL` except a look (the month's `LOOK_EVENT_TYPE`, exported and shared). One query shape feeds the count line, the type sheet's counts, the day headers and the strip's `DayFacts`.
- **Coverage:** unlogged days are the local days from the later of the window's start and the pet's first record, through yesterday, with no event in the population. Today is never unlogged.
- **Duplicates:** `lib/sameMinuteDuplicates.ts`, the report's `dedupeEvents` rule moved verbatim into a Deno-compatible `lib/` module over a minimal event shape. History imports it; the report adopts it in HV-15. Until then a text pin asserts `report.ts` still carries the same window and keys (the `lib/dietTrialDayMath.guard.test.ts` precedent).
- **Gap lines, date-only items and search** as §3.5 and §3.7. Search is one extra condition on the page query: `LIKE` with `%`, `_` and the escape character escaped, over the food's brand and product, the medicine's name and the type's label. `SEARCH_READS_NOTES` is a guarded `false` until CUL-848 (AC 39).
- **`DayFacts`**, one per local day, the strip's only input:

```ts
type DayFacts = {
  day: string;                       // local day key, YYYY-MM-DD
  total: number;                     // the population
  byType: Partial<Record<EventTypeKey, number>>;
  mealsNotFinished: number;          // qualifyingIntakeMeals rated below Most (never a treat, never free-fed)
  doses: Record<string, { logged: number; notInFull: number }>; // by deriveMedicationCourses key
  photographed: number;
  noted: number;
  looked: boolean;                   // Noticed shows the date; never counted
};
```

- **Windows and dates** (HV-3): `lib/historyWindows.ts` holds §3.9's table and returns `WindowBounds = { fromDay: string; toDay: string }` (local day keys, inclusive), which is all the data layer takes. The trial window reads `TrialFacts.exposureRange` (never `range`; diet-trial spec §5) and is offered only while that range reaches today. `lib/recordDates.ts` is the one formatter (H-10). `lib/visitWindow.ts` is the visit bound: the latest visit strictly before today, including its day, compared as parsed local days; registered in `guards/visitReaders.test.ts`; a text pin on `report.ts:873` until HV-15.
- **Scope state** (HV-3): `store/historyScopeStore.ts` holds the type filter (a type, All symptoms, a course, Photographed, With a note, Noticed), the window, the search text, the landed day and the strip's week. A pet switch resets all of it. `landOn(day)` is a one-shot request the list consumes in a ref (C-22). A read that answers for a scope or pet other than the current one is dropped.

### 5.3 The read's local copy (H-4)

A local table mirroring **only** `event_ai_analysis`'s `event_id`, `status`, `recommendation` and `updated_at`. Never `read_text` (the list shows no words) and never `dismissed_at` (Hide never touches the rose). The DDL goes in `BASE_SCHEMA_SQL`, the table in `LOCAL_WIPE_TABLES`, and a `hydrateFromCloud` step pulls it (a watermark on `updated_at`, last write wins). `watchAnalysisRow` writes a landed read through to it. Nothing else writes it. RLS is unchanged: the copy holds only what the owner already reads. The `rls-privacy-reviewer` runs on this PR.

### 5.4 One read predicate

`lib/readState.ts`: `readStateOf({ eventType, hasPhoto, copy, inFlight, readingOff })` returns

| State | Row shows | When |
|---|---|---|
| `worth_a_call` | *Worth a call* in rose | the copy says worth a call; or the recommendation is one the app does not recognise (fails toward rose); a failed re-read never takes a live one away (`escalationSurvivesFailure`, CUL-812) |
| `calm` | nothing | a completed read with a recognised calm recommendation |
| `pending` | the breathing tick | a read in flight |
| `unread` | grey *Photo not read* | a read was expected (`hasPerIncidentRead`, a photo, reading on) and none completed: it failed, was never sent, hit the cap, or the phone holds no copy |
| `off` | nothing (said once on the type sheet) | photo reading is off (CUL-552) |
| `none` | nothing | no read is expected |

Dismissal is not an input. Consumers: Home's spine (`nodeReadOf` delegates to it), the month (`readWorthACall` reads the copy), the Signal screen (`signalScreen.ts:617`) and History. **`guards/readState.test.ts`** reds on any other file reading `recommendation` off the table or the copy; the allow-set is the predicate, the pull, and the record screen's analysis sections, which render the words. Every new file that paints a `worth_a_call` joins the haptics guard's `ALWAYS_SCANNED` (C-16). The `adversarial-reviewer` tries to make the rose go silent.

### 5.5 What History imports rather than recomputes (R-3)

The row (lifted by HV-1); the pipeline `lib/dayNodes.ts` (a day's events in, nodes out: reads, timing lines, runs, names), which Home's `TodayCard` also calls; the timing lane (HV-2); `qualifyingIntakeMeals` / `isFinishedMeal`; `deriveMedicationCourses`; the trial predicates; `hasPerIncidentRead`; the bowl's facts (`lib/feedingArrangements.ts`); the look constant; `reverseLoggedEvent`, on the record screen, unchanged. **The row imports no write helper:** `guards/homeWrites.test.ts` walks Home's import closure, which will include it.

**The row's contract is "node in, row out."** HV-1 fixes the shape: `buildDayNodes(events, { reads, timings }) → DayNode[]`, rendered by `<DayNodeRow node>`. HV-6 changes what the pipeline returns, never its signature; HV-7 renders whatever it returns. That is what lets the three run in parallel.

### 5.6 Home's changes

- **Under `design_v2` (HV-6, HV-5):** the time column wraps; single rows lose their chevron (rule D); runs follow rule B and name the product (rule K), so a refused bowl is its own row (CUL-1121); the dose row carries its four chips and its named drug; the timed meal stays its own row; the read follows `readStateOf`, so the rose stays after Hide and *Photo not read* appears.
- **Under `design_v2` and `history_v2` (HV-10):** the first paint and open-in-place.

### 5.7 The month's marks (HV-8)

`DayMark`'s logged line meets 3:1 on white. The mock draws #0FA08B at 3.27:1; the session adds that as a glyph token or uses `colorAccentInk`, and pins both halves in `theme.contrast.test.ts` (C-1). The broken line is the same colour, dashed. On a rose day the line draws white and still breaks, so an unfinished meal on a vomit day is visible. The strip uses a count-less variant, and the month's legend swatch changes with it. A new test pins the dash, because today's tests check only test IDs.

### 5.8 Links into History (H-7)

`lib/historyDoors.ts` is the registry: one row per sender (file, the params it sends, the flag states it lands in, frozen or not). **`guards/historyDoorways.test.ts`** scans `app/`, `components/`, `lib/` and `widgets/` for a route to History, in string or object form, and reds on one the registry lacks. The expected set is derived from the repository, and the scan's blind spots are stated in the file (C-38).

| Sender | Sends | Under the flag |
|---|---|---|
| The widget (`widgets/CulpritWidget.tsx:143`) | a local day, the pet, `src=widget` | **frozen**; v2 reads `date` as a local day and `pet` once per tap (CUL-1119) |
| The month's day detail (`MonthInstrument.tsx`, `historyDayHref`) | `?day=` (a local day), `ts` | lands on the day (CUL-1073) |
| `PatternCalendar.tsx:256` | a day (flag-off calendar only) | lands on the day, read by sender |
| `lib/lookPatterns.ts:88`, `lib/lookCard.ts:164` | Noticed (and today) | the Noticed filter |
| `lib/ask.ts:308`, `app/ask.tsx:394` | a type and Ask's window; today | the window moves to local days; the trial window (CUL-498) |
| `app/medication/[id].tsx:194` | Medication | adds the course (CUL-488) |
| `app/rundown.tsx:99` | nothing | *Since the last vet visit* |

A landing lands on the day or the gap line that holds it, with the pill, the strip's week and the count line all agreeing (AC 37).

### 5.9 Guards, added or extended

New: `historyV2FlagOff`, `readState`, `historyDoorways`. Extended: the `symptomLists` membership walk (the strip's rose per filter and the header's symptom words, C-11); the haptics guard's `ALWAYS_SCANNED`; `visitReaders`; the text pins on `report.ts` (retired by HV-15). Unchanged and in force: `homeWrites`, `geistRollout` (the search field names its `fontFamily`), `accentOnLight`, `recordPetName`, `ownerFacingCopy`, `reversePath`, `completionCard`.

---

## 6. Privacy and safety

- **Nothing new crosses a boundary.** History v2 reads the local record the app already holds. The read's local copy (§5.3) holds four columns of a row the owner already reads under RLS (never the read's words, never the dismissal), and is wiped at sign-out. No Edge Function changes for the screen itself; HV-2 changes the timing lane on both sides, and HV-15 moves the report onto the two shared rules.
- **Notes (GAP-16, GAP-21):** the note line and searching notes wait for CUL-848's ruling and its cue at every place a note is written. Until then, the row shows no note text and search reads names and labels only. The note is never counted, summarised or sent anywhere by History.
- **Search** is local, over named fields, pet-scoped, never persisted, never logged to analytics.
- **Photos** never render on a list (rule 1); the record screen owns the photo and its signed URL (unchanged).
- **The unread mark never pressures consent** (H-4b): with photo reading off, rows stay unmarked.
- **The wipe:** any new local table (the verdict copy) joins `LOCAL_WIPE_TABLES` and the schema constants (the B-424 rule); a pet switch drops every scope (§3.9); the widget's pet applies once per tap (CUL-1119).
- **Safety invariants:** n=1 never reassures (a calm read shows nothing, never a green word); intake is not preference (a refused or picked-at meal is never folded away, the header names unfinished meals, the strip breaks the line); silence on safety (no haptic on a read).

---

## 7. Acceptance criteria (v1, flag on)

Every criterion names its test shape. "Pure" means a table test over a pure module (C-41: a rule whose effect lands below the fold is asserted over data, never through a screen). Fixtures are built the way production hands them over (C-35), time-zone honest (C-29), anchored to `Date.now()` where a window is rolling.

**The count line and coverage (R-1)**
1. The count line, the type pill's count, every day header and the strip derive from one population (every logged event except a look) and agree for every window × filter pair in a table test over a fixture record (pure).
2. *N days unlogged* appears on every window and filter, All time included, counts only days on or after the pet's first record and before today, and is absent when the window is fully covered (pure).
3. A filtered count names its days and the window's start date (pure; copy snapshot per form).
4. Same-minute duplicates are disclosed with the report's rule, imported from the shared module; a guard fails if History re-derives it (pure + guard).
5. After a removal, a write, a sync tick and a pull-to-refresh, every count on screen re-derives (component test over the store).
6. Under Noticed, no count, no coverage clause and no gap line render; the count line is exactly the link to Patterns (component test).
7. Under search, day headers show the date only and the count line is the search form (component test).

**The list (R-2, R-4)**
8. Pages are whole local days on a keyset over (occurred_at, id); a same-minute pair across a page seam is neither lost nor repeated; removing a row never shifts a later page (pure + query test on `node:sqlite`).
9. A filter or a search only hides rows: every row's facts (vehicle, timing line and its meal, run membership, chips, intake of the vehicle) are identical with and without any filter (pure, property-style over the fixture).
10. Gap lines span only closed, logged days, split at an unlogged day, never include today, never start before the type's first row or a course's start (pure).
11. Date-only items render at the top of their day under every filter; a visit-only day renders its card (pure + component).
12. A read that answers for a pet other than the one on screen is dropped (CUL-1120's shape; component test with a pet switch mid-read).
13. A pet switch resets every scope and the strip page; nothing carries a trial or visit anchor to the new pet (component test under every non-default scope).
14. The last row clears the + button (the shipped inset constant; layout assertion).

**The row (H-1)**
15. History and Home render a row through the same content and run modules; a guard fails if either surface builds a row another way (guard).
16. A run never absorbs a meal rated below Most, a photographed or noted meal, a dose's vehicle, or the meal a timing line measures from; a refused bowl is its own row on History **and on Home** (pure; closes CUL-1121).
17. Opening a run shows every member at full height; no member is clipped (component test measuring the open box).
18. The dose row renders all four adherence chips and names its drug from the item, else the course, else *no medicine named*; the vehicle pairing comes from the stored link (pure).
19. The time column never truncates at the default and the largest supported text size; a range breaks after its dash (render test at both sizes).

**The read (H-4)**
20. One `readStateOf` feeds History, Home's spine and the month; a guard fails on any other reader of the verdict fields (guard).
21. With the network off, a worth-a-call row still shows its rose word (the phone's copy); a missing verdict for a photographed row renders *Photo not read*, never nothing (component test with the remote client stubbed to fail).
22. Hide leaves the rose on all three surfaces; an unknown or failed verdict never renders calm (pure).
23. With photo reading off (once CUL-552 ships), photographed rows carry no mark and the type sheet says *photo reading is off* (component test, gated).
24. A watched arrival ends in exactly the resting row (render the arrival's end state and the resting row; compare trees).

**The strip (H-2)**
25. `stripMarkOf` returns the right state and spoken label for every row of the §3.4 table, per filter (pure, table test).
26. The strip's logged and broken lines meet 3:1 against the box, by shape as well as colour, pinned in `theme.contrast.test.ts`; the month's `DayMark` shows the same marks.
27. The pager's page, the label and the visible week always agree after a swipe, an arrow, a resize and a window change (component test; the harness measure the mock used).

**Filters, windows and dates (H-5, H-9, H-10, H-11)**
28. Every window's bounds come from the one window table, in local days; *Last 7 days* is identical on History and in Ask's in-app link (pure + the Ask sender test).
29. *Since the last vet visit* uses the report's bound function, the latest visit strictly before today, including its day (pure; shared with the rundown, CUL-1127).
30. The course sub-rows key on the vet report's course grain and count every dose row in the window; the medication card's count is untouched (pure).
31. Every date and range on the screen goes through the one formatter; a date outside the current year carries its year (pure, with a fixture crossing Jan 1).

**Motion and accessibility (§4)**
32. Every row of the §4 table has a test asserting its trigger and, with Reduce Motion resolved true before the first render, its reduced form (component tests; CUL-1123 merged).
33. VoiceOver focus lands where §4 says for the landed day, the record's back, a removal and the tab re-press (component tests on `accessibilityFocus` calls).
34. No haptic fires from History v2 on a read (the haptics guard's scan covers the new files).

**Flag and doorways (H-7, H-8)**
35. Flag off, the History tab and Home are byte-identical to today, asserted against the feature's absence (the `vetVisitsFlagOff` shape, with a non-vacuity floor; C-36, C-41).
36. The doorway registry lists every sender found in `app/`, `components/`, `lib/` and `widgets/`; an unregistered sender fails the build (guard, C-38).
37. Each registered door lands as the registry says (filter or anchor; the pill, the strip page, the count line) in both flag states and when the flag flips after mount; the widget's pet and day apply once per tap (component tests; CUL-1119).

**Copy and safety**
38. Every owner-facing string passes the `ownerFacingCopy` guard and a `nyx-voice` read; no string asserts a record fact the query did not return.
39. The note never renders on a row, and search never reads a note, until the CUL-848 gate flips (a guarded constant, asserted).

---

## 8. The build plan (one issue, one session)

The Linear project **History v2 · the record you can read** carries every session as an issue with its own kickoff prompt; this table is the run order. **A lane owns its files.** Two sessions in one step never edit the same file, except where a row below names a shared file; there the two edit different functions, and whichever merges second rebases.

| Step | Session | What it builds | Owns | Gate |
|---|---|---|---|---|
| **0** | **CUL-1073 + CUL-1119** (one session) | History's day link reads a local day; the widget's pet applies once per tap | `history.tsx`'s params, `useWidgetPetLink`, the month's day detail door | none; gates HV-11 |
| 0 | **CUL-1123 + CUL-1125** (one session) | Reduce Motion known on the first frame; Remove's confirm names the note | `hooks/useReducedMotion.ts` and its scroll call sites; `app/event/[id].tsx` | none; gates HV-10 |
| 0 | CUL-1120 + CUL-1124 (optional, one session) | v1's pet-switch race and dose row, live for every account until GA | `history.tsx`'s reads, `components/history/EventRow.tsx` | none |
| **1** | **HV-1** (CUL-1158) | The `history_v2` toggle, guard and namespace (the History tab gated, an empty v2 screen); the row lifted out of `components/designV2/` into a neutral module, `TIME_W` / `RAIL_W` exported, the time wrapping; `lib/dayNodes.ts`, the one pipeline `TodayCard` now calls (behaviour-preserving) | config files, `hooks/useHistoryV2.ts`, `components/historyV2/`, the row module, `lib/dayNodes.ts`, `TodayCard.tsx` | none |
| 1 | **HV-2** (CUL-1159) + CUL-1122 | The timing lane: a refused bowl is not eating (Picked at: the Dr. Chen lens rules and records it); the lane names the meal it measured from; `generate-signal` redeploys | `lib/mealTiming.ts`, `readFeedingsSince`, the `patternsTiming` feeding query, `timingsByRow` | none |
| 1 | **HV-3** (CUL-1160) | Windows, dates, the visit bound, the scope store | `lib/historyWindows.ts`, `lib/recordDates.ts`, `lib/visitWindow.ts`, `store/historyScopeStore.ts` | none |
| 1 | **HV-4** (CUL-1161) | The record's numbers: day pages, the population, counts, coverage, duplicates, gap lines, date-only items, search, `DayFacts` | `lib/historyQueries.ts`, `lib/historyDays.ts`, `lib/sameMinuteDuplicates.ts` | none |
| 1 | **HV-5** (CUL-1162) | The read on the phone: the local copy and `readStateOf`; the spine, the month and the Signal screen read through it | `lib/readState.ts`, the copy's schema / wipe / pull, `readAnalysisRows`, `nodeReadOf`, `readWorthACall`, `signalScreen.ts`'s reader | none |
| **2** | **HV-6** (CUL-1163) | The row's rules on Home and History: runs B / D / K, the dose row, both halves, the timed meal, the read slot; closes CUL-1121 | the row module, `lib/dayEvents.ts`, `lib/spineCompaction.ts`, `compactNode` | HV-1, HV-2, HV-5 |
| 2 | **HV-7** (CUL-1164) | The screen: the list (sticky day headers, the count line, the bowl's line, day cards, gap lines, date-only items, whole-day pages, the quiet states, the pet switch, the landed day, the tab re-press, the record route) | `components/historyV2/HistoryScreen.tsx`, `HistoryList.tsx`, the count line, the day card | HV-1, HV-3, HV-4 |
| 2 | **HV-8** (CUL-1165) | The strip: `stripMarkOf`, the week pager, `DayMark`'s line (the month too) | `lib/stripMarks.ts`, `components/historyV2/WeekStrip.tsx`, `DayMark.tsx`, the month's legend, `theme.ts`, the contrast test | HV-1, HV-4 |
| 2 | **HV-9** (CUL-1166) | The controls: the pinned row, the type sheet (course sub-rows, *N not read*), the window sheet, search; closes CUL-488 | `components/historyV2/PinnedRow.tsx`, the sheets, the search field | HV-1, HV-3, HV-4, HV-5 |
| **3** | **HV-10** (CUL-1167) | Motion and focus: the first paint (History and Home), open in place, the arrival's end state, the removal, the landing, the tab re-press, Reduce Motion, VoiceOver focus | `components/motion/`, the screen's motion hooks, `TodayCard.tsx`'s motion | HV-6, HV-7, HV-8, CUL-1123 |
| 3 | **HV-11** (CUL-1168) | Links into History: the registry and its guard, every sender under the flag; closes CUL-498 | `lib/historyDoors.ts`, the guard, the senders, the screen's door hook | HV-7, HV-9, CUL-1073, CUL-1119 |
| **4** | **HV-12** (CUL-1169) | The finish pass: `pm-feature-review`, the copy pass (the door labels are placeholders), the §7 walk, the accessibility sweep, the fixes | anything the findings touch | HV-10, HV-11 |
| 4 | **HV-15** (CUL-1170) | The vet report adopts the shared duplicate rule and visit bound; the text pins retire | `generate-report` | HV-3, HV-4, CUL-1002 (the report's own deploy in flight) |
| 4 | CUL-1126 + CUL-1127 (one session) | The rundown, the app's report screen, the trial card and the v1 rows adopt the formatter and the visit bound; CUL-1127's three siblings | `app/rundown.tsx`, `lib/rundown.ts`, `app/report.tsx`, the trial card | HV-3 (any time after it) |
| **5** | **HV-13** (CUL-1171) (PM) | The device pass, the PM allowlisted: one scripted sitting | — | HV-12 |
| **6** | **HV-14** (CUL-1175) | GA: the flip, then the removal PR (the key, the shelf row, the hook, the guard, v1's screen and rows); the Tier-2 spec edits; the config row's deletion later, with the next flag closeout | the flag's files, v1's History files | HV-13's notes closed; the PM's go |
| later | HV-16 · HV-17 · HV-18 (CUL-1172 · 1173 · 1174) | The note on the row and searching notes; the *not saved* row; *photo reading is off* (folds into HV-5 if CUL-552 has shipped by then) | — | CUL-848; CUL-944; CUL-552 |

**Shared files, named:**
- Step 1: HV-2 and HV-5 both edit `lib/spineReads.ts` and `lib/spineNode.ts`, in different functions (`readFeedingsSince` and `timingsByRow`; `readAnalysisRows` and `nodeReadOf`). HV-1's `lib/dayNodes.ts` calls those four functions without editing them, and HV-2 and HV-5 keep their call signatures.
- Step 2: HV-7, HV-8 and HV-9 write into `components/historyV2/`. HV-1 creates the composition root with a placeholder for each slot (`HistoryList`, `WeekStrip`, `PinnedRow`), and each session replaces only its own.
- Step 3: HV-10 and HV-11 both touch the screen. HV-10 takes the motion hooks and HV-11 the door hook (`useHistoryDoor`, created by HV-7).

**Critical path:** HV-2 or HV-5 → HV-6 → HV-10 → HV-12 → HV-13 → HV-14: six steps. **Sessions:** 15 in the project (14 builds and the PM's pass), two bundles outside it (a third optional), and 3 gated follow-ups.

---

## 9. Persona positions and recorded conflicts

- **Designer:** the row, the strip and the sticky header as ruled; dissented on the header word's ink (rose; the PM ruled neutral) and on H-11 (anchor on today's visit; the team ruled the report's bound).
- **Data Scientist:** carried the one-population rule, the coverage clauses and the Noticed floor; dissented on H-11 (the midnight after).
- **Dr. Chen:** the exam-room questions each answered on one screen; H-11 as ruled; the dose chips all four states.
- **Jordan:** *Outside the trial diet ›* and *Before and since the trial ›* are the two doors a diet-trial owner needed; the unread mark (H-4b).
- **Sam:** a refusing cat is visible one level above the rows (the broken line, the header's words).
- **Trust and Safety:** the note gate (CUL-848), local search, no consent pressure (H-4b); residual dissent on the unread mark recorded in §0.2.
- **Mobile IA / Motion / Engineering:** the pinned row and sticky header, uncapped open-in-place, scroll-event pager, the motion table, whole-day pages, the doorway registry.

---

## 10. Dependencies and sequencing (issues outside this project)

| Issue | What it gates | Where |
|---|---|---|
| **CUL-1073** — History's day link reads a local day, `?date=` read by sender | the doorway session only (HV-11); the month's "Open in History" door | Design v2 project; step 0, any time now |
| **CUL-1119** — the widget's pet applies once per tap | the widget door's test (HV-11) | Legacy Backlog; bundles with CUL-1073 |
| **CUL-1123** — Reduce Motion known on the first render; unconditional animated scrolls | the motion session (HV-10) | Design v2 project; step 0, bundles with CUL-1125 |
| **CUL-1122** — the timing lane counts a refused bowl as eating | built inside HV-2 (one session, one PR, one redeploy of `generate-signal`) | step 1 |
| **CUL-848** — the note cue (a PM ruling) | the note line and searching notes (HV-16) | Legacy Backlog, *Waiting on PM* |
| **CUL-944** — quarantined rows | the *not saved* row (HV-17) | Backlog |
| **CUL-552** — photo-analysis consent | the *photo reading is off* state (HV-18; folds into HV-5 if it has shipped) | App Store Launch |
| **CUL-1107** — the flag review's "No" | the one act that stands the rose down; when it ships, its field joins the local copy (§5.3) and `readStateOf`, and every surface follows at once | — |
| **CUL-1133** — EN-3, four dispositions for the read | replaces the single *Worth a call*; `readStateOf` maps the new values, History's row follows, and an unrecognised value already fails toward rose | Engines v3 (awaiting greenlight) |
| **CUL-1111** — hide hides words only | the same rule, on the record and Home; History v2's predicate already assumes it | — |
| **CUL-1118** — meal ratings, exception-only | nothing (the broken line keys on a recorded rating) | — |
| **CUL-1126 / CUL-1127** — years on other surfaces (the rundown, the app's report screen, the trial card); the rundown's visit bound | one session after HV-3 merges | History v2, step 4 |
| **CUL-1002** — the vet report's second-wave deploy and cold read | HV-15 only (the report is not edited while its own deploy is in flight) | Vet report remediation |
| **CUL-1078** — v1 pagination | merged in #902; v2's whole-day pages supersede it at GA | done |
| **CUL-1120 / CUL-1124** — v1's pet-switch race and dose row | v2 builds both right (AC 12, 18); the v1 fixes are an optional step-0 session, since v1 is what every account sees until GA | Legacy Backlog |

---

## 11. Parked (not dropped)

- The **public share link** of any History view (B-253's rule 4 applies: notes excluded by construction).
- A **per-row "worth a call" filter** (rule 3 forbids a filter over a read's verdict).
- **Noticed counts on History** (H-9: Patterns owns them).
- A **month grid** on History (retired in round 3; the month lives on Patterns, one door away via CUL-1073).
- **Robust time zones** (CUL-1061) — History follows the device's zone like every surface.
- A **window over an ended trial** (*During the trial · Jul 26 – Sep 10*): v1 offers the trial window only while the trial runs.

---

## 12. Version history

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-09-24 | First build-ready spec: the PM's rulings on round 4 and the team's calls at the PM's deferral (§0); design authority round 5; the run order (§8) mirrored in the Linear project. |
| 1.1 | 2026-09-24 | §5.8: the month's row names what its door sends (`?day=`, a local day, and `ts`), as built in #904 (CUL-1073). PM-approved on CUL-1168. |
| 1.2 | 2026-09-25 | §3.6: the time column is 60pt, not 56 (CUL-1183, PM-ruled; round 5 of the mock amended to match, same URL). §2: where the row lives after HV-1 (#907). PM-approved in the HV-1 session. |
