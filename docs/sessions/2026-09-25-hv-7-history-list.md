# History v2 HV-7: the History list

**Date:** 2026-09-25

Shipped via #917 (CUL-1164). Filed CUL-1242, CUL-1243, CUL-1244 and CUL-1245 (Waiting on PM) and CUL-1246. Coordination posted on CUL-1163 (HV-6), CUL-1165 (HV-8), CUL-1166 (HV-9), CUL-1167 (HV-10), CUL-1169 (HV-12), CUL-1197 and CUL-1198.

## The ask

HV-7 is the list half of History v2's step 2, one of four sessions running at once (HV-6 the row, HV-8 the strip, HV-9 the pinned row). It turns HV-3's windows and HV-4's numbers into the screen behind `history_v2`: sticky day headers, the count line in every form of §3.2 (with CUL-1189's two ruled clauses), the bowl's line, day cards with date-only items and gap lines, whole-day pages, the quiet states, the pet switch, the landed day, the tab re-press, the record route, and today's links into History (`useHistoryDoor`). The plan was posted and approved before code.

## What changed

- **The screen** (`components/historyV2/`).
  - `HistoryList.tsx` is a `SectionList` with sticky day headers. A day card is two cells: a sticky header and a body.
  - Its header holds the count line, the bowl's line and the strip's slot.
  - Whole-day pages load at the end, with one skeleton row while the next one reads.
  - `CountLine.tsx`, `DayCard.tsx` and `GapLine.tsx` draw every form HV-4 returns, as returned.
  - `HistoryScreen.tsx` takes today's links (`hooks/useHistoryDoor.ts`, `lib/historyDoorParams.ts`) and sits on round 5's neutral ground.
- **The read behind it** (`store/historyListStore.ts`).
  - Everything a scope draws is read together and lands as one snapshot, so the count line, the day headers and the strip can never disagree (R-1).
  - A read is dropped when a newer load started, when it answers another request, or when its pet is no longer the one on screen (CUL-1120).
  - A pet switch or sign-out drops the snapshot inside the pet store's own update.
  - Paging, the landing's reach (`ensureDay`) and the reads' refresh live here too.
- **Under a filter or a search, the nodes are built over the whole day and then hidden** (`lib/historyScreen.ts`, `readWholeDays`). A run, a timing line and its meal are identical under every filter (R-2, AC 9). A 128-subset property test holds it.
- **CUL-1189's clauses:**
  - *record from Aug 3* and *past its planned end* in `countLineOf`. Both fields are required, never defaulted.
  - After the adversarial pass, the search form carries them too.
- **Also:**
  - `HISTORY_V2_SCROLL_INSET` (AC 14).
  - The early-access shelf's on-state hint, which HV-1 left for this lane.
  - Two new `ALWAYS_SCANNED` haptics entries, each proven by a planted import.
  - Pet-store mocks widened with `subscribe` (C-39).

## Decisions

- **`useHistoryDoor` lives in `hooks/`.** The issue listed it with the namespace's files, but the flag-off guard wraps every export of `components/historyV2/` into a component, and the namespace's own header says a hook belongs in `hooks/`.
- **The screen sits on `colorNeutralLight`** (round 5's #FAFAFA), not HV-1's white, so a stuck day header's white card reads against it.
- **Midnight resets the viewport**, like any new request (the first round tried to keep it and could not: the list waits as the silhouette over a new day).
- **The header stays across a filter or search change.** This came from the product review; it recommended it as a PM decision. The header's reads (facts, courses, items, bowls, window facts) depend only on the pet, the day and the window, so while only the filter or search moved, the list draws the count line, the bowl's line and the strip from the previous snapshot under the new filter (`headerSnapshotFor`). Only the days wait as the silhouette, never the old rows (CUL-1120 holds). A window change, a pet switch or midnight still blank the header with the list. Built rather than escalated because it is the spec's own intent: the count line's `pending` form exists for exactly this, and §3.12's silhouette is for the first read. The PM can overrule it at HV-13.
- **"{pet}'s record starts here" only where it is true.** It closes the list only when the list's last section holds the record's first day. Under a filter the list ends at the kind's first row, so the line no longer sits under a card weeks later than the record's start. A filtered list now ends without a line; an end line naming the window's start is on HV-12's copy list.
- **STATUS.md is unchanged.** The kickoff asked for a STATUS.md update on this PR; CLAUDE.md and `/wrap` say it changes only when a track boundary moves, and HV-7 moves none.

## The reviews

- **`code-reviewer`:** fix-before-merge on two findings, both fixed.
  - The next-page slot was a module singleton that a refresh or a switch mid-page could hand to a landing as a dead read, released without an identity check (C-24). It is now keyed on the pages it extends and released by identity.
  - The landing's scroll had no direct test. There is one now (`scrollToLocation` spied, a landing that must page back), plus one proving the owner's own scroll mid-landing wins.
  - Nits: the retry timer is cleared on unmount; the door handler's two identical branches collapsed to one call; midnight's viewport reset was questioned, changed, and restored after the re-check measured it (below). A comment claiming the narrowing was needed was checked against `tsc`, found false, and never committed (C-38).
- **`pm-feature-review`** (as Jordan and as Sam): pet switch and the quiet states SHIP-SHAPED; NEEDS-WORK on five things.
  - **Fixed here:** the header blanking on every filter tap; the no-pet state (a silhouette that never ended; now the first-log line, v1's rule); the jump that still fired after the owner scrolled.
  - **Filed as decisions:** CUL-1242 (a visit or course dated before the first log never shows, and a visit-only record reads "Nothing logged yet", a v1 regression); CUL-1243 (treats counted and named as meals under Meal); CUL-1244 (looks hidden under All types, so a check-in-only day reads "nothing logged"); CUL-1245 (refused vs not finished in the header).
  - **Filed as scope:** CUL-1246 (trial and course markers).
  - **Sent to HV-12:** the copy list.
  - **Already filed elsewhere:** the free-fed intake lens (CUL-1237).
  - The silent strip taps are closed by HV-8's `claimsFromOf`, so the strip only lands on days the list holds.
- **`adversarial-reviewer`:** FAIL on four findings, all fixed; HELD everywhere else.
  - **Held:**
    - A vomit bout across midnight and a page seam, compared across eight scopes, gave identical timing, runs and reads.
    - Pet A's load in flight across a switch to B was dropped.
    - The trial's day 42, 43, 98 and 99 read correctly, and the door shows only while the trial runs.
  - **Fixed:**
    - **High:** a photographed formed stool whose read says Worth a call was never fetched by History. History's two read gates keyed on the symptom tint, and `stool_normal` tints "other". Both now key on `hasPerIncidentRead`; the pipeline's own gate is CUL-1197, in HV-6's #914.
    - **Medium:** the search form dropped CUL-1189's qualifiers, so a search for the old food inside the grace read as the trial failing.
    - **Medium:** the record-start line sat under a filter's first card.
    - **Low:** a read landing mid-page dropped the page and orphaned the foot's state.
    - **Latent:** `snapshotForScope`'s second check compared the snapshot's key with itself (removed, and the comment that claimed it now says what is guaranteed); the shared clock lagged the list's by one effect at midnight (now set in a layout effect).
  - **Residual, closed here:** a failed local read on a reload replaced the whole read map, so a rose could blink to unread (CUL-1198's class). A same-scope reload now lays fresh reads over the ones shown.
  - **Noted for HV-6:** before #914, the run rule folds a Refused, noted, other-food meal into a run under All types (CUL-1121). No account should be allowlisted for `history_v2` before #914 merges.
- **The adversarial re-check of the fixes (C-19):** FAIL, narrowly. The high finding is closed; with #914's gate emulated, the rose draws on a formed stool. Nothing leaked another scope's or pet's reads, and the qualifiers and the record-start line held everywhere. Two things broke, both fixed:
  - **Clinical class, new with the first fix round:** laying fresh reads over old ones also kept an old CALM when the reload's local read failed after the copy had flipped to a rose. The pre-fix code showed unread there. Now only a rose survives a failed re-read, the fresh answer always wins, and a removed row's read leaves with it (`layReads`, in `load` and `refreshReads`).
  - **Navigation, pre-existing:** a same-scope reload that started before a landing paged back committed at its old depth and took the landed day off the list after the jump. The load now reads on to the depth the list reached while it read, which also keeps a scrolling owner's rows.
  - **Also taken:** a list test for the list-side read gate, which a mutation had shown unguarded. The midnight change from the first round is reverted: its comment said the owner stays put, but the list waits as the silhouette over a new day, so the viewport resets as before (C-38).
  - **Left as is (LOW):** after a failed filter change, *Try again* brings the header back while it retries.

## Verification

- **Mutations: 31 run, every one red.** 12 in the build round:
  - nodes over the shown rows;
  - page rows as whole days;
  - no fresh pet check;
  - a snapshot drawn for any scope;
  - `visibleNodesOf` hiding nothing;
  - the owner's scroll not clearing the landing;
  - the landing never taken;
  - items under search;
  - the bowl under every filter;
  - a write with no reload;
  - a sync tick with no reload;
  - *record from* dropped.

  13 in the review round:
  - a page call joining any read in flight;
  - the slot released without identity;
  - a landing across a switch;
  - a page landing only on its snapshot object;
  - the read gate on the symptom tint;
  - a reload replacing the reads;
  - the jump without the landed check;
  - the record start by the window;
  - no-pet waiting forever;
  - search without its qualifiers;
  - the header blanking;
  - the kept header counting under the old filter;
  - a window change keeping the old header.

  6 in the re-check round:
  - a re-read keeping every old read, calm included;
  - a removed row's read staying;
  - a failed re-read dropping the rose;
  - a re-read keeping only the depth it set out with;
  - the list watching symptoms only;
  - `refreshReads` keeping every old read.

  Both haptics entries are proven by planted imports. The mutations ran in a scratch copy, never the shared tree.
- **Suites:** `tsc --noEmit` clean. Full jest green after each round: 492 suites. The History suites are green under Kiritimati, Chatham and Honolulu. The list suite waits out the virtualized list's 50ms cell batch inside `act`, so it runs without act() warnings.

## Residuals

- **For whoever merges second of #914 (HV-6) and #917**, posted on CUL-1163:
  - `guards/dayRowOneWay.test.ts` turns History's zero into its floor;
  - `timings.timedElsewhere` across cards;
  - the read slot moves to `readAnalysisCopy` with the answered set.
- **Of #915 (HV-8):** the `WeekStrip` mount switches to its new props, fed from `headerSnapshotFor`; `petId` on `HistoryFacts`.
- **Of HV-9's PR:** `readWindowFacts` moves to `lib/historyWindowFacts.ts`; the pill can read `headerSnapshotFor` to stop blinking.
- **Four PM decisions** (CUL-1242–1245), none of them blocking this PR. CUL-1242 and CUL-1244 block the HV-13 device pass.
- **Not built, by design:** VoiceOver focus on a landing and on the re-tap, and every motion (HV-10); the strip, the pinned row and the sheets (HV-8, HV-9).

## After the wrap: HV-6 (#914) and HV-8 (#915) merged first

The one check-in (10:02 UTC) found both on `main`, so #917 merged second to each and owed their hand-offs. The merge itself was clean; the integration is its own commit.

- **HV-8, the strip.** `WeekStrip` takes its new props (`facts`, `window`, `course`, `today`, `petName`) from the header snapshot, so it stays mounted across a filter or search change; the flag test's facts carry `petId`.
- **HV-6, the guard.**
  - `guards/dayRowOneWay.test.ts`'s History zero is now History's floor: `DayCard.tsx` draws, and `lib/historyScreen.ts` builds. `lib/historyScreen.ts` is scanned by name as History's pure half and held to the same imports.
  - A surface may now import the column grid (`TIME_W`, `RAIL_W`, `timeColumnText`), never the frame. So the look under Noticed is History's own line on that grid (time column, rail, the hollow bead), no longer `SpineRowFrame`.
- **HV-6, the anchors.** The pipeline now reports the anchors it used (`DayModel.anchors`, additive). The list builds every loaded day at once (`historyNodesByDay`, two passes) and hands each card the meals a timing line on another card measures from (`timedElsewhere`). A 2 AM vomit timed from last night's 10 PM bowl keeps that bowl on its own row on the previous card.
- **HV-6, the read slot, on `TodayCard`'s template:**
  - reads go through `readAnalysisCopy`;
  - a readable row claims its photo only once its copy answered (the `answered` set);
  - the one gate is `mayCarryRead`;
  - an older look never overwrites a newer one;
  - the working mark drops only after the re-read (C-30).
- **This replaces the first round's `layReads`.**
  - HV-6's contract keeps the last answer on a failed look, calm included, and never claims *Photo not read* for a row whose copy did not answer: under H-4b both the grey and the empty slot are claims.
  - The re-check's stale-calm case therefore behaves as it does on Home. A calm draws nothing (n=1 never reassures), and the new rose cannot be known without a read, so the row shows no rose either way; only the photo glyph differs.
  - One contract on both surfaces is what AC 15 asks for.
- **Still owed: HV-9's `lib/historyWindowFacts.ts`,** by whichever of HV-9's PR and #917 merges second.
- **Verification.**
  - 10 more mutations (the second pass dropped, a photo claimed before its copy answered, a failed look discarding the last answer, an older look overwriting, the working mark dropped first, both read gates narrowed, the pipeline's anchors emptied, the look back on the frame, the strip handed another pet's window).
  - The full suite: 500 suites, 11,332 tests. The History and pipeline suites under Kiritimati, Chatham and Honolulu.

## After the wrap, second: HV-9 (#916) merged, carrying CUL-1250

By 12:57 UTC `main` held HV-9 (#916), so #917 merged second to all three of its step-2 siblings.

- **CI's timezone leg went red on `39db398` over a test this PR never touched.** `lib/lookPatterns.test.ts` asserted that the withheld Patterns card never prints `24`, its answered-day total, and the card prints a clock-anchored date two days back. On the 26th of any month, local, that date reads *first marked Sep 24, 2026*.
  - `main` failed identically at the same clock. A 35-day sweep of unpatched `main` failed on exactly the 26ths, in UTC and in Kiritimati. The required UTC check would have gone red for all of Sep 26.
  - Filed CUL-1250 (High) with a proven patch: four zones, the sweep, four mutants. The PR got one standing-down comment, holding the re-run inside the red window.
  - HV-9's PR ported the patch verbatim, so it reached `main` first.
- **The merge had five conflicts,** each a place both lanes had written:
  - `lib/historyQueries.ts`: HV-9's `readRecordStartDay` is this PR's `readRecordFirstDay` exactly (same SQL, same mapping). Mine is gone, and its two tests (both ISO spellings of one instant, a look never starting the record, removed rows) now test `readRecordStartDay`.
  - Three test files' pet-store mocks: the same `subscribe` line, written twice.
  - The flag test (AC 35's async half): both lanes' reads are now listed together, including the pinned row's `readHistoryRecord`. HV-9's `historyWindowFacts` mock now spreads the real module (C-39). Narrow, it hid the `readWindowFacts` the list now imports; a mutant proves the flag-on case needs it.
  - One more that `tsc` caught: HV-9's two `CountLineWindow` literals lacked this PR's required `recordFrom` and `pastPlannedEnd`. They now carry their true values, `null` and `false`.
- **One `WindowFacts` assembly.** The list store calls HV-9's `readWindowFacts(pet, nowMs)`, and its private copy is deleted.
  - That function derives its day from the instant it is handed, while the list's request names its day. So the store passes `instantOnDay(today, Date.now())`, the instant nearest now that falls on the request's own day.
  - A screen whose clock has not ticked past midnight therefore reads its own day's facts, never the next day's under its own key. Otherwise a visit logged today would become "the last vet visit".
  - Proven by a property test over every day of 2026 at six edges each, which catches a 24-hour-day shortcut on Chatham's 23- and 25-hour days, and by a store test over the real schema.
- **Not done here: the one read.** HV-9's proposal (CUL-1228) publishes one All-time read in the list store for the count line, the pill, both sheets and the strip. That re-architects the store and has its own issue, so it went to the PM as a decision brief instead of into this PR unasked.
- **A test-hygiene race, found while verifying.** Under parallel load, four of the list's tests ended with the screen's own timers pending: a landing's retry chain and cell batch, and the rose's arrival beats. A timer that fires after a test's last `act` updates a tree nothing watches, which is the act warning.
  - Each test now waits out its tail inside `act`. The waits derive from the shipped constants: `LANDING_RETRIES` and `LANDING_RETRY_MS`, moved to `lib/historyScreen.ts` for that, and `FOLD_MOTION`.
  - The same contention batch, 16 runs each: 7 warnings before, 0 after, with every run green both times.
- **Verification.** 4 mutants, all red: the store reading at `Date.now()`, `instantOnDay` without its clamp, a 24-hour-day shortcut (under Chatham), and the narrow mock.

## The second wrap: an adversarial pass, one fix, then the merge

The PM ran `/wrap and merge` after the HV-9 integration. Merging without the one All-time read settles CUL-1228 as option (B): it lands as its own PR, before HV-13's device pass.

- **The adversarial pass on the integration** (the `adversarial-reviewer`, isolated): HOLDS for the change's claim.
  - It rebuilt the deleted private assembly and ran it against the new read over 108 cases (trials × visits × clocks) on the real schema.
  - It then swept every IANA zone from 2000 to 2035, 55 of them with days that have no local midnight.
  - `windowFacts.today` was always the request's day. V8 was tested; Hermes could not be tested here.
- **Its finding, fixed before the merge (F1, medium).** The pinned row read on its own clock and had no midnight trigger.
  - A History screen left open past midnight showed the pill "Vomit · 2" (yesterday's count) over the count line "Today · no vomit logged". That is a count spoken under a window it does not count (C-3).
  - Now the pinned row reads for the list's day (`useHistoryToday`, the day `HistoryList` publishes), and the list's midnight tick re-reads it. An answer for another day draws nothing, so the pill blanks with the header at midnight, as it already does for a pet switch.
  - Two comments claimed the pill already shared the list's read. They are corrected, and the hook they named (`useHistorySnapshot`, which had no callers) is deleted (C-38).
- **Its nit, taken (F2).** `instantOnDay` answers `NaN` for a malformed day. The read then fails loudly instead of reading the real day under a key that names no day (C-12). A test in HV-9's module holds that `readWindowFacts` rejects it.
- **Verification:**
  - 5 more mutants, all red: the hook reading at `Date.now()`, its effect not following the day, an answer for another day drawn, the hook ignoring the list's clock, and `instantOnDay` answering now for a malformed day.
  - 507 suites and 11,452 tests pass, and the touched suites and every guard pass in the three CI zones.
- **Step 2 is complete.** HV-6, HV-7, HV-8 and HV-9 are all in, and every gate for step 3 (HV-10 and HV-11, together) is Done.
