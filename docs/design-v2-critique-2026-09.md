# Design v2, the whole day: the pre-GA critique (2026-09)

🧊 **Frozen, dated review.** Correct it additively, never in place (CLAUDE.md § Documentation Update Protocol).

**Issue:** CUL-1179 · **Project:** Design v2 — the whole day · **Method:** `/design-critique` at full depth, its first real run (CUL-1176) · **Run:** 2026-09-24 23:12Z to 2026-09-25 06:26Z · **Code read by the lenses:** `main` at `0095b96` · **Re-checked by the lead:** `main` at `a56f059`, after nine PRs merged overnight (§5)

**What it gates:** the device pass (CUL-1070) and GA (CUL-1071). **What it is not:** a redraw, a build, or a verdict on whether Design v2 should ship. The PM ruled that on round 4.

---

## 0. How to read this

- **The evidence limit.** No one has seen Design v2 on a phone. No build on the PM's device carries it: TestFlight 1.1.0 (35) predates it, `app.json` is 1.2.0 so no OTA reaches that binary, and the dev client predates `expo-haptics` (CUL-616). The lenses read the **shipped code** against the **design authority's renders** (`docs/culprit-design-v4-mockups.html`, rendered at 390 and 1280, every demo pressed, Reduce Motion on and off, plus the lead's bespoke settled shots of Home). Every claim whose truth depends on glass is tagged and handed to the device pass as a checklist (Appendix F). The critique is only as good as that evidence, and it says so where it matters.
- **"Shipped" means on `main`.** Almost all of it is dark behind `design_v2` (the PM's account alone is allowlisted, as of 2026-09-24). The few defects that are live for every account today are named as such in §5.
- **The numbers.** Ten isolated lenses returned 146 findings: 134 confirmed by an adversarial verifier, 11 plausible, 1 refuted. A completeness critic found six gaps; six follow-up reads returned 61 more, self-verified. The final synthesis merged them into 112 items (47 broken, 9 works but confusing, 13 design gaps, 17 missing follow-ups, 22 PM decisions, 4 backlog), 12 gating changes and 3 persona conflicts. Twenty-nine agents, 3,561 tool calls, about 7 hours 14 minutes.

## 1. The verdict

**Ready for the device pass with conditions; not ready for GA.** Seven of the ten lenses returned *ready with conditions*; Motion, Data and Jordan returned *not ready*; every lens, and every follow-up, agrees GA must wait.

**The design's shape held.** The safety lead stays the plain card (S1). The compaction never crosses a symptom, a dose or a photographed meal. No health photo can reach Home (a scan of Home's 170-file import closure). A worth-a-call arrives exactly like a calm read, with no haptic. No title says "better", "down" or "done", day 56 of 56 included. A pet id the account does not own renders nothing. The flag-off guard reds on an ungated node.

**What fails is the plumbing and the numbers under it.** The Signal card and screen count a look as a logged day; they draw windows and falling pairs the app's own rules withhold; two findings can share one identity, so a tap opens the wrong evidence (and on today's `main`, for every account, folding one card folds its twin). Home lost protections the old surfaces had: the look's refusal door and its withheld reason. A recheck on one Monday can put five different vomiting counts into the exam room. And the device pass, as written, cannot pass: Nyx's own record leads with a safety card, so the chart lead never renders for the PM, and the flag-on cold start cannot be reached.

## 2. What the PM rules

Seven decisions, most urgent first, also filed as **CUL-1225** (`Waiting on PM`), where a one-line ruling per brief is enough. Two are genuine persona conflicts and carry no recommendation, per the Conflict Protocol.

**GC-11 · Design v2 and App Store submission #1**
- **Deciding:** whether Design v2 reaches the public in 1.2.0 or in its own reviewed update.
- **Options:** **(A) Cut 1.2.0 with `design_v2` dark; GA waits for a terminal review status and Design v2 ships as its own update (recommended:** no Guideline 2.3 exposure, and the submission never couples to a track with open GA gates). (B) GA lands before screenshot capture and the cut, carrying new review notes, screenshots and demo checks.
- **Consequence:** (A) needs no launch-doc edits for 1.2.0 and makes CUL-1071 wait on CUL-560. (B) makes CUL-1071 block CUL-559, and CUL-559 block CUL-173. Either way, nothing may change between screenshot capture and a terminal review status: no GA flip, no flag write, no merge (CUL-561's freeze, extended past OTA), and every allowlist is empty at handover (§5, CUL-188).

**GC-1 · When the device pass runs** *(a persona conflict)*
> **Motion Designer and Mobile IA:** fix the motion and layout defects first (BRK-11 to BRK-16), or the pass records known defects instead of judging feel.
> **Dir. of Engineering, Jordan and the Designer:** run it now against a written known-defects list; several things only show on a phone.
> **PM decision needed:** run CUL-1070 now, after one fix PR, or split it (composition, data and accessibility now; the motion recording after the fixes)?

Either way it needs GC-2 first (§3): as written it cannot see the chart lead or the flag-on cold start.

**GC-6 · The look's refusal door**
- **Deciding:** whether "Didn't eat ›" and "Nothing unusual" return to the look's first row.
- **Options:** **(a) Put both back on the compact row, both species (recommended:** intake is not preference; a refusal must never cost more taps than a mood word). (b) Keep them behind More… and write the crossing into the daily-look spec §3.1 with Dr. Chen's line.
- **Consequence:** (a) is a one-list edit and adds one chip row above the fold. The withheld state's reason and its ask come back either way (a rule, BRK-19).

**GC-4 · The one count an owner carries to a recheck**
- **Deciding:** who writes the Signal screen's sentence, which unit it counts (rows or 3-hour episodes), and which window it names, applied to Home, the Signal screen, the fold strip, Get ready, the rundown tile, Copy as text and Ask.
- **Options:** **(a) Named episodes over the engine's windows on local days, with an as-of time; the screen composes its sentence from the charts it draws; exam-room surfaces state the count with logged rows beside it where they differ (recommended:** the only option where the sentence and its bars agree by construction). (b) Rows with the report's 60-second de-dup on every owner-facing count. (c) Keep each number, but date every window and name every unit.
- **Dissent:** Dr. Chen's first read wanted rows, to match the report's frequency tile; his follow-up landed on (a). Jordan accepts either if every number names its unit.
- **Consequence:** (a) amends the vet-visits spec's G6 (Get ready states the count rather than quoting the cache), moves the rundown off raw rows, and unblocks the Change Contract edit at GA.

**GC-7 · What flag-on Patterns carries before the old page is deleted**
- **Deciding:** which care surfaces the new Patterns gains before GA deletes the only surfaces that show itching, the intake rate and the refusals.
- **Options:** **(a) Build all four first: the trial's sign (itching for an itchy dog), a named and counted refusal, a worth-a-call that always marks the month, and a weight line that never calls a real loss noise (recommended:** Pets > $ and intake is not preference; care surfaces are never dropped for layout). (b) Keep the flag-off cards on the flag-on page until each has a v2 home. (c) Ship as is.
- **Consequence:** (a) rules CUL-1074's briefs 1, 5 and 6 and R4-4's caveat scope together.

**GC-5 · What a timing or correlation lead shows on Home** *(a persona conflict)*
> **Data Scientist with the Data Visualization Designer:** the chart canvas takes only frequency types; timing and correlation leads keep the shipped card face with its receipt. That crosses round 4's "the lane lives on the Signal's screen", so it is a better-than-the-rule brief.
> **Designer:** one visual family on Home; a correlation's chart counts only its matched episodes.
> **Dr. Chen:** keep the chart card, with a finding-named title, its own counts and the medication line; the lane stays on the screen.
> **PM decision needed:** under Design v2, does a non-frequency lead keep the shipped face, or take the chart card with its own title and counts (and which)?

Whatever wins, two defects are fixed now (CUL-1218): a type with no title rule is refused, and a correlation's title names its own window.

**GC-8 · What sits above the look on a trial day** *(rule after the device pass measures it)*
- **Deciding:** the trial strip and the Signal's Patterns footer on flag-on Home, which push the look below the fold on the wedge day.
- **Options:** **(a) Accept the plain safety lead; compact the strip to one line when the lead names the trial; keep the footer until Patterns has a door near the top (recommended:** each fact said once, and an early door to Patterns, which has no tab). (b) As (a), and retire the footer. (c) Keep both as shipped.
- **Consequence:** (b) puts Patterns about three screens down on a sick day. Any choice unblocks the Principle 3 edit and the Home order test.

**Also ruled at GA's sitting, before the Tier-2 edits are written** (each is a decision brief in Appendix B): PMD-5 (where the look's coverage footer and receipts live now), PMD-10 (when and for which signs the Signal frames a trial), PMD-11 (D2-4's two Dr. Chen briefs and the dog's second positive word), PMD-13 (DP-3's once-ever wash still plays flag-on), PMD-14 (the as-needed dose went from one tap to four), PMD-15 (the app-switcher snapshot, CUL-1128), PMD-21 (whether "safety is silent" covers speech) and PMD-22 (no gesture carries a change of lead). Three more are better-than-the-rule briefs the PM may take or leave: PMD-3 (the weight caveat calls a steady loss scale noise), PMD-12 (History v2's 56pt time column cannot meet its own AC 19) and PMD-19 (the lead line pairs a partial week with a whole one).

## 3. Rules the team writes without a ruling

- **GC-2 · Make the device pass runnable.** A dedicated fixture account (a plus-alias, allowlisted for `design_v2` and `daily_look` by one recorded config update; never the PM's pets or the demo account), seeded by each table's contract, with a declared lead per fixture checked in `ai_signals` on the morning of the pass. Test logs move off Nyx's record. A `__DEV__` forced cold start. VoiceOver, text-size, colour-filter, exam-room and removal walks. The script's steps 1, 2, 4, 5, 9 and 12 rewritten to what the code does, or listed as known failures. Filed as **CUL-1222**, which blocks the pass.
- **GC-3 · Every count on the new surfaces uses the ruled predicates and inherits every withholding rule the shipped card honoured:** looks stay out of every logged-day count and `recordStart`; the compare uses the comparison-gate set (R3); the door counts from the record's start through yesterday; the density gate (§3.3), the trial adjacency (§3.4), the not-eating register (B-789) and the trial strip's predicate apply; a 7-day finding is never drawn as halves, a worsening never as a fall; a safety screen puts the ask first.
- **GC-9 · The accessibility floor for GA:** the Home card speaks its chart; the cold-start wait is modal with one spoken line; the one-tap look moves focus and keeps Undo reachable; week labels are never cut at the default size; logged ticks differ in lightness; text on the rose clears 4.5:1 by measurement (white on rose is 3.67:1); the emergency door owns its whole box; the read's sentence is spoken and queued (subject to PMD-21).
- **GC-10 · Signal plumbing:** every finding has a unique identity (the key carries the symptom for a correlation and the trigger for an intake decline), guarded by a Deno test over the real engine; rows keyed by identity; the card and the screen re-read on focus and on each tick while keeping their last model; the flight aborts on a failed, missing or heroless read. **The key is a Tier-2 edit to the fold spec §5.2**, so its wording goes to the PM with the fix's PR.

## 4. Sequencing: what GA waits on

GA (CUL-1071) lands only after all of these (GC-12, updated for the overnight merges):

1. **History v2's row and first paint.** HV-1 (#907), HV-2 (#910) and HV-5 (#912) merged overnight. **Still owed:** HV-6 (CUL-1163, the row's rules on Home; closes CUL-1121) and HV-10 (CUL-1167, Home's first paint and the shared open-in-place). They rewrite files GA would otherwise delete, so the namespace stays until they land.
2. **Noticed's GA (CUL-876), or a stated no-look Today.** The look header is Today's first row; without Noticed's GA, Today has no header for most accounts.
3. **The sign-out navigator reset, and `abortFlight` in `wipeLocalSession`**, tested on the real route before the gate leaves `app/signal/[id].tsx` (MFU-9). Today the gate is the Signal screen's only protection at sign-out.
4. **The defects filed here that gate GA** (§5: CUL-1212, CUL-1213, CUL-1216 to CUL-1221, CUL-1223, CUL-1224), and CUL-1075 (D2-7b, the three registered loops).
5. **The GA brief batch (§2), ruled before the Tier-2 edits are written.** CUL-1071's Tier-2 list also gains the fold spec §5.2 and §7, the daily-look spec §3.1, §3.1a, T-9, R11 and R12, DR-2's count line, the polish spec §4 and §5.6, the vet-visits spec (what Worth raising quotes), and the in-app brand spec's N3 and night-moment sections.
6. **GC-11's order against App Store submission #1.**

## 5. The lead's pass

### 5.1 `main` moved during the run

The lenses read `main` at `0095b96`. By the time the run finished, nine PRs had merged (#904 to #912: History v2 step 0 bundles A and C, HV-1 to HV-5, the Reduce Motion fix, and `/design-critique` itself), changing 16 of the files the lenses read, `components/designV2/home/SpineNodeRow.tsx` deleted outright in favour of History v2's shared row (`components/dayRow/`). So every claim that would become an issue was re-checked against `a56f059`, by the lead for the load-bearing ones and by three read-only recheck agents for the rest (43 claims, each marked holds, fixed, changed or cannot tell, with the line on the new code).

**Fixed by the overnight merges, and not filed:**
- **BRK-25**, a refused bowl counted as eating on Home: HV-2 (#910) closed CUL-1122.
- **BRK-10**'s offline half, a worth-a-call vanishing from Home offline: HV-5 (#912) moved Home's read to the phone's copy of the verdict. The remainder (a failed local read, a read that failed to copy) is CUL-1198, filed by another session the same night.
- **BRK-8**'s first half, the gallery's calm word over a failed read: HV-5 now stands a calm verdict only on a finished read, and a bout's worth-a-call reaches its tile. The remainder (the tile's time) is in CUL-1219.
- **GAP-7**'s second half: the tile verdicts and the month's worth-a-call now read the phone's copy. The Signal screen's first read is still a network read (CUL-1219).
- **BRK-36** on the spine: HV-1's 60pt column breaks a range after its dash. An opened run's member rows still lose their time (a comment on CUL-1163).

**Changed shape:** BRK-11. The photo read's arrival still never fires on Home, but since HV-5 the frame between the settle and the re-read is an empty `unread` slot rather than an unmount (a comment on CUL-1167).

### 5.2 What the lead checked in the code

Each on `a56f059`, file and line:

| Finding | What the code shows | Holds |
|---|---|---|
| BRK-1 | `lib/signalScreen.ts:533-550` counts every event (a look's `check_in` row included) and every `looks.local_day`; `lib/monthReads.ts:154` and `lib/monthCoverage.ts:58` exclude looks; §5.6 says a look joins no coverage line of any other surface | yes |
| BRK-41, BRK-42 | `lib/signalFold.ts:100-115` keys a correlation on type plus cluster and an intake decline on type alone; the engine's correlation lane loops per symptom (`detection.ts:3249`) and ranking merges nothing (`:6474`); `reconcileFolds` keeps the last finding per key (`signalFold.ts:417`); the screen takes the first match | yes |
| MFU-8 | `lib/db.ts:324-330` counts only events and vet visits; `hooks/useSync.ts` raises the overlay on every launch's first sync when that is zero; both overlays are full-screen at `zIndex: 100` with `pointerEvents="auto"` | yes (the offline duration is the verifier's measurement) |
| MFU-17 | `detection.ts:3883`: `currentDays` buckets by `Math.floor(ms / MS_PER_DAY)`, UTC days | yes |
| BRK-45 | `lib/analytics.ts`: raw rows ("NOT episode-collapsed") over a UTC calendar window; `lib/rundown.ts:17-24` claims parity with Patterns | yes |
| BRK-19 | `LookHeader.tsx:442`: the withheld branch renders `LookWithheldEntry` alone; chips and *Change* only when `asking` | yes |
| BRK-10 | `lib/spineReads.ts` (pre-HV-5) returned an empty map on error, replacing the last good one | fixed offline by HV-5; remainder is CUL-1198 |
| BRK-13 | `SignalLeadCard.tsx:118, 133`: `setLoad({ status: 'loading' })` on every `hydrationTick` and `signalTick` | yes (already CUL-1206) |
| BRK-12 | `syncStore.coldStartHandoff` is bumped by the silhouette and read by nothing | yes |
| BRK-22 | `lib/monthCoverage.ts:25`: `elapsed = Number(todayKey.slice(8, 10))` | yes |
| MFU-11 | CUL-188 step 7's query names four keys, one deleted by migration 060, and misses `daily_look`, `design_v2`, `history_v2` and `ask_general_enabled` | yes (corrected on CUL-188) |
| MFU-15 | CUL-638 was closed on 2026-08-31 by an attachment for CUL-636's PR (#785) | yes (reopened) |

### 5.3 The rechecks

| Agent | Claims | Holds | Changed | Fixed |
|---|---|---|---|---|
| The Signal (card, screen, windows, flight) | 14 | 12 | 2 (BRK-8, GAP-7) | 0 |
| Home and Patterns (look header, spine, door, month, seed) | 14 | 12 | 2 (BRK-36, BRK-11) | 0 |
| Motion and accessibility | 15 | 15 | 0 | 0 |

Three of the motion and accessibility claims are computed rather than seen: BRK-27's truncation at 390pt (from the Geist font's advance widths), BRK-32's overlap at AX1 (from the layout), and MFU-9's Back after a sign-out (a runtime question for expo-router). Each is on the device checklist.

Every comment on an existing issue also carries the finding's id, so the trail runs both ways.

### 5.4 Deduped against Linear

Other sessions filed on these surfaces while the run was going; the lenses could not see those issues.

| Finding | Already filed as | What this critique added |
|---|---|---|
| BRK-13, the lead card's skeleton on every tick | CUL-1206 | the card-side twin of CUL-1219 |
| BRK-10's remainder, a rose that blinks out | CUL-1198, CUL-1105 | carried |
| BRK-9, a replaced photo keeps the old read | CUL-1201 | carried |
| BRK-1's twin on the month (the record starts at a look) | CUL-1194 | related to CUL-1212 |
| BRK-25, a refused bowl counts as eating | CUL-1122 (closed by #910) | fixed |
| MFU-17, UTC day counts in the worsening tier | CUL-336 | a comment with the Signal-screen and Get-ready reach and the counterexample; raised to High |
| BRK-45, the rundown tile's unit and clock | CUL-967 | a comment |
| MFU-13, every allowlist uid reaches every device | CUL-489 | a comment recommending App Store Launch |
| MFU-11, the pre-handover allowlist check | CUL-188 | step 7 corrected in place |
| MFU-15, the first-insight line | CUL-638 | reopened |
| BRK-24, BRK-36's remainder | CUL-1163 (HV-6) | a comment |
| BRK-11, BRK-40 | CUL-1167 (HV-10) | a comment |
| BRK-37, the FAB's role, modal and Reduce Motion (every account) | CUL-1178 | a comment: the FAB joins the sweep |
| The device pass's prerequisite and phone checks | CUL-1070 | a comment: CUL-1222, the known-defects list, the checklist |
| GA's chain (GC-12), the retire-list and Tier-2 gains, MFU-9 | CUL-1071 | a comment; blocked by CUL-1163, CUL-1167, CUL-1121, CUL-1075 and the issues below |
| The flight's conditions (BRK-15, GAP-10, WBC-8, WBC-2) | CUL-1077 | a comment |
| CUL-1074's six briefs | CUL-1074 | each brief's status |

### 5.5 Filed

The filing bar: a verifier confirmed the finding, or the lead reproduced it, **and** it is a defect in shipped code or a gate on the next step. Sixty-two items met it; they are filed as one issue per fix a session would take.

| Issue | What it carries | Blocks |
|---|---|---|
| CUL-1212 | The Signal counts a look-only day as a logged day (BRK-1) | GA |
| CUL-1213 | Two findings share one identity; folding one folds its twin, live for every account (BRK-41, BRK-42) | GA |
| CUL-1214 | The cold-start wait blocks taps for a pet with nothing logged (MFU-8), on App Store Launch | — |
| CUL-1216 | The new card and screen drop the withholding rules: density, trial gate, not-eating, a safety screen's order (BRK-4, BRK-5, BRK-6, BRK-39); `evidenceText`'s half is live for every account | GA |
| CUL-1217 | One count at the recheck: windows and units (BRK-2, BRK-3, BRK-23, BRK-46, WBC-1); waits on GC-4 | GA |
| CUL-1218 | The lead card for non-frequency types (BRK-7); the face waits on GC-5 | GA |
| CUL-1219 | The Signal screen reads once, needs the network, and the flight can park over its error (BRK-43, BRK-44, BRK-15, GAP-7, BRK-8) | GA |
| CUL-1220 | The look header's lost protections and three touch defects (BRK-19, BRK-20, BRK-21, BRK-16, BRK-17, BRK-18); the door waits on GC-6 | GA |
| CUL-1221 | The coverage door's denominator and the missing date (BRK-22, BRK-26) | GA |
| CUL-1222 | Make the device pass runnable (GC-2: MFU-1, MFU-2, MFU-10, BRK-48) | the device pass |
| CUL-1223 | Design v2's motion: the draw-in plays on no daily chart, unfolding swaps components, the opening overruns, the arrival remounts every card (BRK-12, BRK-14, WBC-3, WBC-4, BRK-49) | GA |
| CUL-1224 | The accessibility floor: the card hides its chart from VoiceOver, labels cut off, the month's contrast, colour alone, the silent wait, the read's announcement, the look's double-tap, the unspoken escalation (BRK-27, BRK-28, BRK-29, BRK-30, BRK-32, GAP-5, GAP-6, GAP-13) | GA |
| CUL-1225 | **The PM's seven rulings** (§2), `Waiting on PM` | GA, the device pass |
| CUL-1215 | Eight fixes to `/design-critique` from this run | — |

**Not filed, by design:** the 22 PM decisions (the briefs in §2 and Appendix B), the design gaps and backlog items that are not defects in shipped code (they stay in Appendix B for the device pass and GA to read), and the low-severity items that ride an issue above or the GA sweep.

### 5.6 The audit

- `git status` after the run: no change the lead did not make. The lenses and verifiers wrote only under the scratch folder; the recheck agents were read-only.
- Linear: every comment and issue in this run is the lead's. The agents read Linear and wrote nothing.
- **One production write, at the PM's word:** the PM's account was added to the `design_v2` allowlist on 2026-09-24 at 23:01Z (`enabled` stays false). It must come off before App Review handover, with the PM's `daily_look` entry, per CUL-188's corrected step 7.

## 6. Method

**The command.** `/design-critique` (`.claude/commands/design-critique.md`, `.claude/workflows/design-critique.js`), run from its branch before it merged (`ba2ccf3`, #906) and so also its first field test. Kind `shipped`, depth `full`, next step: the device pass (CUL-1070) and GA (CUL-1071).

**The lenses (ten).** The nine standing lenses of the workflow's library, seated from `docs/personas.md`'s routing table for a Design v2 surface, plus an **Accessibility** lens (VoiceOver, Dynamic Type, Reduce Motion, colour alone), which no standing lens owns. Two existing subagents were seated **as** lenses: the Data lens as `adversarial-reviewer` (the surfaces state counts and compares) and Jordan as `pm-feature-review` (a shipped feature's flows). Each lens had a written focus: what to try to break on this surface, with the files, the counts and the shipped predicates it must match.

**The run.** Twenty-nine agents: ten lens reads, ten verifiers (one per lens, pipelined), a synthesis, a completeness critic, six follow-up reads on the critic's gaps, and a final synthesis. 14.2 million subagent tokens, 3,561 tool calls, 7 hours 14 minutes of wall clock at two agents in flight on a four-core container. No lens returned empty; no agent errored.

**The evidence.** `scripts/design-critique/render.mjs` rendered the v4 mock: the page at 390 and 1280 with Reduce Motion on and off, every frame with its details open, every demo pressed on a fresh load (150 shots; four harness errors, all the harness pressing a Back button hidden inside Home's phone; a 50px sideways scroll that is the mock page's own layout). The default Home frames were caught mid-wait, because the mock plays its cold-start wait when the frame scrolls into view, so the lead added twelve bespoke shots: Home and the quiet day after the wait settles, one viewport at a time, a look chip answered, a meal run opened in place, each with Reduce Motion on and off. The lead's notes sat at the top of the manifest every lens read first. No screenshot of the shipped app exists; every look-and-feel claim carries a `NEEDS DEVICE:` tag, passed in through `artifact.notes` because the finding schema has no field for it.

**What every lens carried.** Settled (the PM's rulings, not re-argued):

- The design authority is round 4, docs/culprit-design-v4-mockups.html (R4-1 go, PM 2026-09-19); rounds 1 to 3 are archives. Design v2 ships dark behind design_v2 (eligible AND opted in), flag-off byte-identical and guarded, retired at GA (CUL-1071).
- Home leads with the Signal as a title, a chart and one line; a tap opens the Signal's own screen, one screen per finding. Home carries no trend card, no timing lane and no medication button. The daily look is Today's header ('How does Nyx seem today?') with positive words on the compact cat row (Lively, Played).
- No incident photo on Home. A read that was worth a call shows on Home as words, with the photo one tap in (R4-2, option A).
- Medication on Home is only the dose as a fact on the spine once logged; logging an as-needed dose is the FAB's job. The FAB is teal (colorAccentInk; the bright accent measured 2.17:1 and failed) and ships to every account.
- Today is a spine in daylight. Consecutive meals with nothing between them compact to one line that opens in place; the chevron rides the time.
- Every chart meets the §05 standard set by the shipped 'Vomiting, timed from meals' lane: a mark per fact, a count on every mark, the denominator in view, the uncounted disclosed, the window named.
- The draw in is the signature motion. The breathing tick is the one loop; the Whorl, the moon and the night moment retire; every wait is its screen's silhouette.
- The Signal's opening: the flight is the destination (R4-3), built over the route; whether it ships is CUL-1077's recording and ruling (open).
- Weight: dots by date on a fixed ±10% band, no fill; one reading is the number, two are the pair; it must read well at one, two and three readings (R4-4). The area is retired.
- Patterns: the month with Sunday-start weekly bars over its rows, arrows between months, layers on the grid. The word 'fortnight' and any strip too small for a thumb are retired.
- Principle 3 as two jobs (is she okay; what happened today): no mandated zones, safety leads, Home carries no form. Principles do not dictate what must appear on Home.
- A safety lead keeps the shipped plain-text card (S1): as benign cards gain charts, plainness stays the severity signal.
- The record is UTC and converts on the device; robust time-zone settings are CUL-1061, separate.
- History v2 (docs/nyx-history-v2-requirements.md v1.0, ruled 2026-09-24) changes Home's spine row under design_v2: one row for History and Home with the time in a fixed left column that wraps (H-1); runs follow rule B and name the product, so a refused bowl is its own row (HV-6, which closes CUL-1121); the read follows one readStateOf, so the rose stays after Hide and a grey 'Photo not read' appears (H-4a, H-4b); DayMark's logged line meets 3:1 on white (HV-8); Home's first paint and the shared open-in-place motion ride history_v2 (H-8, HV-10). Its rules R-1 to R-4 are adopted: one population and one query behind every number; a row says the same thing under every filter; import what the app already computes; a list survives paging, a pet switch and Reduce Motion.
- A rule is a floor with a date on it: a better design that violates a rule is surfaced as a better-than-the-rule brief, never silently built either way.

Overruled dissents, recorded so no lens raised them as new:

- The weight as the round-1 area chart (ruled out for dots by date).
- Dr. Chen's 44pt thumbnail for a worth-a-call photo on Home (ruled: the words on Home, the photo one tap in).
- Engineering's spike-first position on the flight, keeping the rise (ruled: the better design; the recording decides whether it ships).
- Reanimated as one engine for Design v2 (Engineering: one engine does not buy the flight on Fabric; CUL-766 and CUL-830 stay separate and gate nothing here).
- The Product Owner's view that the waits (D2-7) should be their own project.
- Four rules crossed on rounds 3 and 4 as better-than-the-rule briefs and ruled: D8's Trend zone on Home, the med-strip spec's D1 one-tap confirm on Home, the fold spec's face tap as an expand (the face tap is a door), and DR-2's day lane on Home (it becomes the spine).
- History v2's recorded dissents: Trust and Safety would rather the list add nothing for an unread photo (H-4b); the Data Scientist and the Designer on the visit bound (H-11).

Open items, carried with what the next step must say about each (their status after the critique is Appendix E):

- CUL-1077, the flight: ship it, ship it with a native hero at the card's width, or keep the rise. Carried with it: the ~1.3x transform-scaled hero's type softness; the back gesture pops with a fade and no reverse flight; Android parity (the route's duration, measureInWindow offsets).
- CUL-1074, six briefs from the month: (1) the month charts vomiting only, so itch or diarrhea has no symptom surface on Patterns flag-on; (2) the month's coverage word counts every event but a look, a different question from the Trial panel's gate set; (3) white on the symptom rose at 3.7:1 against 4.5:1; (4) the weight dot hue, neutral grey shipped against the mock's teal (B-186); (5) the AI summary and the KPI column absent flag-on; (6) the Photos layer off by default, so a worth-a-call draws nothing on the month until switched on.
- D2-4's Dr. Chen briefs: a read already in the record renders its verdict without the one-photo caveat (the closest thing on Home to reassurance by absence); the timing's 'since her last logged meal' qualifier; the dog row's second positive look word.
- D2-3's calls: the title says 'the last 8 weeks' above nine bars; the chart's label tail lands at 780ms against the screen's 700ms budget; VoiceOver focus on the Signal screen's title is asserted as a call and unverified on a device.
- CUL-1075 (D2-7b): the Skeleton shimmers, the Signal screen's whorl and the duplicated tick are registered loops the one-loop guard must lose before GA; plus CUL-1071's inventory of about fifty WhorlSpinner sites and two NightMoments that still render flag-on.
- Defects already filed, carried not refiled: CUL-1121 (a refused meal inside '3 meals'; closes under HV-6), CUL-1122 (the shared timing lane counts a refused bowl as eating, so the spine and the Signal lanes say 'N min after eating' after a refusal), CUL-1123 (Reduce Motion reads off on the first render; PR #905), CUL-1178 (22 sheets slide regardless of Reduce Motion), CUL-1073 (the month's day has no History door; PR #904), CUL-1105 (a photo red flag reaches Home only at the next Signal rebuild), CUL-1109 (the Signal's daily cap freezes safety cards), CUL-1112 (Home's photo red-flag card gets a door to the photo), CUL-1126 (dates without a year, the trial card among them), CUL-1128 (the iOS app switcher snapshot shows the record).
- GA's Tier-2 edits (CUL-1071): Principles v2.0 (Principle 8, Principle 9 with the Reduce Motion rule the History critique asked for, the chart-colour rule, Calm is not quiet); the fold, signal-home, med-strip, daily-look, DR-2 and Patterns spec edits; whether the three specialist lenses graduate or retire.
- The device pass (CUL-1070) has not run: no one has seen Design v2 on a phone, and the dev client predates expo-haptics (CUL-616).

**Isolation.** Each lens was told not to read the Design v2 build sessions' records (`docs/sessions/2026-09-17` to `2026-09-21`), the History v2 critique, or the Linear comments on CUL-1060 to CUL-1077 until its findings were written, and to consult them afterwards only to mark a finding as carried.

**Standards, on top of the principles, the Design v2 language, CLAUDE.md's conventions and `docs/personas.md`:** docs/culprit-design-v4-mockups.html §05 (the five-column check) and §07 (the principle edits); docs/nyx-signal-home-requirements.md (S1 to S10 and the Change Contract) for the Signal card and screen; docs/nyx-signal-fold-requirements.md for 'Keep it compact' and the fold; docs/nyx-daily-look-requirements.md §4, §5.6 (floor 5) and §10 for the look header; docs/nyx-diet-trial-requirements.md §5.2 and §5.3 for the trial-aware title, compare and lanes; docs/nyx-incident-screen-requirements.md D3 and D4 for the read's arrival and the photo; docs/nyx-med-strip-requirements.md §0.1 for Home's write classes; docs/nyx-app-polish-requirements.md for the completion beats, the haptics and the tab bar; docs/nyx-history-v2-requirements.md §0, §5.6 and §5.7 for the row History and Home will share.

---

# Appendices

Generated from the run's final synthesis and raw findings, verbatim; the lead's re-check (§5) overrides an item's status where they differ.

## A. The lens verdicts, as each lens gave them

| Lens | Verdict | Why |
|---|---|---|
| Sr. Product Designer | ready with conditions | Ready for the pass if it runs on HV-1/HV-6 or lists their defects, on Nyx's safety-led record and a benign-led one, with three added states and a type-size read; not ready for GA, because five confirmed defects put false or softening words in front of owners. |
| Motion Designer | not ready | Four of six gestures are broken on the daily path (the read never arrives, the draw in is armed nowhere, the unfold swaps components, the flight parks over a failed read) and the flag-on cold start cannot be reached; fix MOT-01 to MOT-05 and add a forced cold start first. |
| Mobile Information Architect | ready with conditions | Ready for the pass once the lead card's skeleton blink and the pinned exit's wrong position are fixed and step 3 runs on Nyx's trial record plus dense fixtures; not ready for GA, because the wedge day's first frame ends at the look question. |
| Sr. Data Scientist with the Data Visualization Designer | not ready | Seven high-severity breaks reproduced by probe, all in what feeds the charts or sits beside them; the pass can run as a look-and-feel pass only if told the Signal's coverage and sentence are wrong, and GA waits on DAT-01 to 06 and 08. |
| Veterinarian (Dr. Alex Chen) | ready with conditions | The pass can go ahead once its script is amended to see the chart card at all; GA is not ready, because the new Signal can show falling or clean-looking counts the app's rules forbid and three carried items block. |
| Pet Owner (Jordan, a diet-trial dog owner) | not ready | Run the device pass; not GA: the Signal leading Home makes the record look calmer three ways, the look header crossed a ruled safety rule, the door tells a day-one owner 'logged 1 of 25 days', the as-needed dose lost its one tap, and itching has no place on Patterns. |
| Pet Owner (Sam, a grazing, picky cat) | ready with conditions | Ready for the pass behind the flag; not for GA, because four defects each let Home or Patterns calm an owner about a cat eating less or losing weight, and two rulings must land first. |
| Trust and Safety / Privacy | ready with conditions | Nothing blocks the PM's single-account pass if it adds four checks; GA waits on the sign-out navigator reset, a flight that aborts and is keyed by pet, CUL-1128's ruling and a clean image-cache check. |
| Dir. of Engineering with Sr. QA | ready with conditions | The pass can run once a cold-start trigger, a named fixture set and a known-defects note exist; GA is not ready, because four probe-confirmed defects put wrong or vanishing numbers on the wedge's surfaces and the retire list and History v2 order must enter GA's gate. |
| Accessibility | ready with conditions | The pass can go ahead once its script gains VoiceOver, text-size and colour-filter steps and a corrected Reduce Motion expectation; GA waits on seven fixes, from the time column to the silent cold-start wait. |
| Sr. Data Scientist (follow-up) | ready with conditions | By design the engine can cache two findings on one key, so the route, the fold and the flight collide; nothing gates the pass, but the unique key, its guard and a ruling on the correlation's chart gate GA. |
| Trust and Safety / Privacy (follow-up) | ready with conditions | Nothing sequences Design v2's GA against the 1.2.0 cut and the review window; the pass can run before handover, and GA cannot be scheduled until the 1.2.0 question is ruled and the freeze, the allowlist check and the row's end value are fixed. |
| Dir. of Engineering with Sr. QA (follow-up) | ready with conditions | The PM's record leads with safety cards, so the chart lead, its fold and the flight need a seeded insight-lead pet on a dedicated fixture account; running the fixtures through the real engine exposed three more defects. |
| Veterinarian (Dr. Alex Chen) (follow-up) | ready with conditions | The pass can run if it walks the exam-room path with a seeded week; GA cannot write the Change Contract edit while one Monday puts 0, 1, 3, 5 and 7 into the room, so sentence, unit and window must be one ruling. |
| Pet Owner (Jordan) (follow-up) | ready with conditions | Going Signal screen, then tile, then Remove, then Back leaves the removed vomit on the evidence screen; the screen must re-read on focus and on each update while keeping its last model. |
| Accessibility (follow-up) | ready with conditions | An escalation that reaches Home in-session is never spoken, though one photo's verdict is; GA needs a ruled channel, CUL-638 re-homed, identity keys, and either an escalate-only queued announcer or the silence written into Principle 9. |

## B. The full critique, in the QA-note taxonomy

Each item is the final synthesis's, verbatim: merged across lenses, corrected by its verifier, numbered within its category. `Shipped defect: yes` means the defect is in code already on `main` (dark behind `design_v2` unless the item says it is live for every account). The lead's re-check against `main` after the overnight merges (§5) overrides an item's status where they differ.

### Broken (47)

#### BRK-1 · The Signal counts a day with only a look on it as a logged day

*severity high · gates the next step · shipped defect: yes · lenses: Data, Dr. Chen, Jordan, Sam, Engineering · sources: DAT-01, VET-01, JOR-01, SAM-03, ENG-01, missed:recordStart*

- **Where:** lib/signalScreen.ts:523-542 (readLoggedDays), feeding lib/signalLead.ts:36 and the screen's ticks, compare and Why
- **Evidence:** readLoggedDays counts every event, a look's own check_in row included, plus looks.local_day, and cites daily-look §5.6, which says the opposite; signalScreen.test.ts:588 pins it. The door, the month and the report exclude looks, and the Signal's recordStart comes from the same read.
- **Counterexample:** Sam answers the look daily Sep 1 to 17 and logs meals on three days: the Signal's ticks read 17 of 17, the door below says 'logged 3 of 17 days', and a trial window reads 'logged 51 of 55' where events cover 31.
- **Resolution:** readLoggedDays drops check_in rows and the looks join, and recordStart comes from the same rows. The compare strips and Why read the comparison-gate set (R3, guards/loggedDayParity.test.ts); the ticks state their predicate as a C-34 decision. Invert the test and prove by mutation.
- **Verification:** CONFIRMED by five verifiers with probes; fix predicate refined to R3's two questions.

#### BRK-2 · The Signal screen's sentence and the charts under it count different windows

*severity high · gates the next step · shipped defect: yes · lenses: Designer, Data, Engineering, Dr. Chen · sources: DES-07, DAT-02, ENG-02, VETF-9, missed:trial-baseline*

- **Where:** lib/signalScreen.ts:352, 393 (sentence = cached.text); lib/signalWindows.ts:233-253; detection.ts:2588, 5304; lib/dietTrialCard.ts:2608
- **Evidence:** The screen prints the engine's sentence over client charts: trial_response counts a fixed 49-day baseline while the compare uses the trial's own length, and the trial strip, Get ready and the fold strip quote the 49-day pair. Every v2 fixture uses a sentence or windowDays production never produces (C-35).
- **Counterexample:** Day 55: '17 in the 49 days before it' sits directly above 'The 55 days before: 19'; on day 25 one screen gives 41 and 21 for 'before the diet', and on a young trial the direction can flip.
- **Resolution:** Rule who owns the sentence (GC-4). Whichever wins, every number stated for a named window equals the chart's count under that label, pinned by a property test over engine-shaped fixtures.
- **Verification:** CONFIRMED; DES-07 raised to broken, high.

#### BRK-3 · 'This week' means several windows, and a 7-day finding's screen draws 3-day halves, even a fall under a worsening

*severity high · gates the next step · shipped defect: yes · lenses: Designer, Dr. Chen, Sam, Data · sources: DES-04, VET-09, SAM-04, VETF-5, missed:7-day-halves, missed:last-1-week*

- **Where:** lib/signalWindows.ts:147-203 (signalWeeks, weekLine) and signalCompareSpec's no-trial branch; detection.ts:2357, 3857-3888
- **Evidence:** The card line and the hero bars read Sunday-start calendar weeks, the sentence and the phone script read rolling 7-day windows, and the compare halves windowDays 7 into two 3-day windows that leave the seventh day in neither.
- **Counterexample:** A Central cat vomits Tuesday to Saturday after 2 the week before, read Monday 9 AM: the sentence says '5 episodes this week, up from 2', the bars show last week 5 and this week 0, and the compare shows 3 then 1 with Tuesday in neither window.
- **Resolution:** Rule (GC-3, GC-4): a 7-day finding draws its own two rolling windows on local days or no compare, a worsening never draws a fall, and 'this week' is one population across card, strip, bars, sentence and script.
- **Verification:** CONFIRMED by probe V5 and Dr. Chen's follow-up scenario C; VET-09 raised to broken, high, gating.

#### BRK-4 · The lead card and the screen drop the Change Contract's density gate and trial adjacency

*severity high · gates the next step · shipped defect: yes · lenses: Data, Designer, Dr. Chen, Sam · sources: DAT-03, DES-04, VET-02, SAM-04, VETF-6, missed:evidenceText*

- **Where:** lib/signalWindows.ts:189-203; SignalLeadCard.tsx; lib/signalScreen.ts:303-330; lib/signalCopy.ts:804-814; SignalScreen.tsx:382
- **Evidence:** No design_v2 file reads finding.density, so the card re-prints a pair the engine withheld, and the density and adjacency lines render nowhere flag-on because the screen shows ExpandedReceipts only for safety. evidenceText mints 'down from N' whatever density says, in both flag states.
- **Counterexample:** Logging drops to 4 of 7 days mid-trial: Home reads 'Vomiting, day 9 of the rabbit trial' and '1 this week so far · 4 last week', the Why says 'down from 5', and no surface says the comparison was withheld.
- **Resolution:** Rule (GC-3): the lead line imports the flag-off face's swap (isReflectionDensityWithheld), a falling reflection's screen prints the density line and the trial adjacency, and evidenceText never mints 'down from' when density is not comparable. File the evidenceText half now against both flags.
- **Verification:** CONFIRMED; counterexample corrected (a reflection needs at least 3 logged days).

#### BRK-5 · The screen's trial compare re-answers the trial strip's question without its gates or baseline

*severity high · gates the next step · shipped defect: yes · lenses: Data, Dr. Chen · sources: missed:trial-gates, DAT-11, VET-15*

- **Where:** lib/signalWindows.ts:212-254; lib/dietTrialCard.ts:2588; lib/trialResponseCounts.ts
- **Evidence:** The strip withholds a reduction when density is not comparable or either window has under 7 logged gate-set days, against a 49-day baseline; the screen draws the pair from day 7 with look-inflated counts, and a before-window can be mostly before the record.
- **Counterexample:** On one Home the strip reads 'Vomiting: 3 in the trial's 9 days.' (withheld) while one tap in draws 'The 9 days before: 4 · The trial's 9 days: 3', both 'logged 9'.
- **Resolution:** Rule (diet-trial §5.3, one trial predicate): the screen reuses computeTrialResponseCounts, its baseline and its gate, or shows the strip's withheld form.
- **Verification:** CONFIRMED by verifier probe V1; DAT-11's before-record case resolves under the same gate.

#### BRK-6 · No not-eating gate on the trial-framed Signal: a refusing cat's falling reflection becomes the chart lead

*severity high · gates the next step · shipped defect: yes · lenses: Data, Dr. Chen, Jordan, Engineering (follow-up) · sources: DAT-04, VET-03, ENGF-05, missed:B-789-bars*

- **Where:** components/home/SignalZone.tsx:962; lib/signalVisible.ts:28-47; lib/signalTitle.ts:97-109; detection.ts:3911-3950 (no intake valve on reflections)
- **Evidence:** B-789 suppresses only a falling trial_response. The real engine, run over a refusing cat, ranks a falling reflection first with no safety finding, because intake_decline's baseline is itself refusals and pre-trial meals are unrated; neither the lead choice nor the screen reads suppressTrialResponse or isAnimalNotEating.
- **Counterexample:** Day 40 of a rabbit trial, every rated trial meal refused, pre-trial meals unrated, 4 vomits before and then 3 and 1 in the last two weeks: Home leads with 'Vomiting, day 40 of the rabbit trial', falling bars and '1 this week so far · 3 last week', above a trial strip that withheld its line.
- **Resolution:** Rule (B-789, §5.2): one fail-closed not-eating register gates every falling vomit pair on Home and the screen, chronicity compares and the flag-off reflection card included; the engine-side intake valve follows as its own issue. Dr. Chen rules suppress or state the refusal beside the counts, with an adversarial pass.
- **Verification:** CONFIRMED by engine probes G and H; part predates Design v2.

#### BRK-7 · The lead canvas draws weekly frequency bars for every insight type, and a correlation's title names a window its finding never used

*severity high · gates the next step · shipped defect: yes · lenses: Data, Designer, Dr. Chen, Data (follow-up) · sources: DAT-05, DES-08, VET-10, DATF-7, missed:timing-lead*

- **Where:** lib/signalWindows.ts:49-51, 97-133; lib/signalLead.ts:32-48; lib/signalTitle.ts:97-128; generate-signal/index.ts:117, 809 (a 180-day fetch)
- **Evidence:** A correlation is titled 'Vomiting after chicken, the last 8 weeks' over bars of every vomit, though its finding counts a 180-day read, and signalWindows.ts:49-50 claims a 56-day correlation read the engine does not have (C-34). A timing lead loses its claim, lane and §5.4 medication line, the Early tier is gone from Home, and gap_shortening (live) renders a blank 'Signal' card.
- **Counterexample:** 4 chicken-matched vomits among 20: the bars sum to 20 under 'Vomiting after chicken'. A dog whose four chicken-then-vomit episodes were all in May leads Home in September over nine zero weeks, while Why cites 4 matched days that appear nowhere.
- **Resolution:** Rule now: a type with no title rule is refused on card and screen (G10 extended), and a correlation's title names the finding's own window. What a non-frequency lead shows is GC-5, a genuine conflict.
- **Verification:** CONFIRMED by engine probes (DATF-7 probes OLD and 6); DES-08 raised to high.

#### BRK-8 · The episode gallery shows a calm word over a failed read, only a bout's first read, ignores Hide, and speaks a time the opened record does not show

*severity high · gates the next step · shipped defect: yes · lenses: Data, Dr. Chen, Jordan · sources: DAT-06, VET-04, JOR-02, JORF-FU10, missed:gallery-hide*

- **Where:** lib/signalScreen.ts:466-497, 630 (readVerdicts); EpisodeGallery.tsx:50-65
- **Evidence:** readVerdicts nulls only 'pending', so a failed or capped re-read keeps a stale 'monitor'. A bout's tile takes its first photographed row's read, and its spoken time is the bout's onset though it opens a later row. dismissed_at is never selected.
- **Counterexample:** A 5:11 PM photo reads 'Keep an eye out' and a 6:40 PM photo of red streaks reads 'Worth a call': the Signal screen shows one tile, 5:11 PM, 'Keep an eye out'.
- **Resolution:** Land PR #912 (HV-5, CUL-1162), which moves the gallery onto one read predicate and reads the whole bout; confirm its tests cover a failed stale monitor and a two-photo bout with the worse read second. A tile says when its bout holds more than one photo, and speaks the time of the record it opens.
- **Verification:** CONFIRMED; the pending half cannot occur on today's server.

#### BRK-9 · A replaced photo keeps the old photo's calm read, by two paths

*severity medium · does not gate · shipped defect: yes · lenses: Data (verifier), Jordan (follow-up) · sources: missed:replaced-photo, JORF-FU5*

- **Where:** app/edit-event.tsx:597-647 (no read requested); supabase/functions/_shared/incident-analysis.ts:806-900 (existingRealAnalysis)
- **Evidence:** Replacing a photo from the Edit screen detaches the old one and never requests a read, and a capped or read-disabled re-read leaves the prior completed read in place because nothing records which photo was read. Either way 'Keep an eye out' stands under a photo nothing has read, which HV-5's readStateOf would treat as calm.
- **Counterexample:** The owner replaces a blurry photo via Edit with one showing blood: the record and the spine keep 'Keep an eye out', and so will the gallery once it re-reads.
- **Resolution:** File now: the Edit screen's replace requests a read as the record screen's does, and a replaced photo invalidates the prior read, or the read records the attachment it read.
- **Verification:** Edit path CONFIRMED in code; server path PLAUSIBLE (needs the cap).

#### BRK-10 · A worth-a-call can vanish from Home: offline, overnight, or after Hide

*severity high · gates the next step · shipped defect: yes · lenses: Engineering, Dr. Chen · sources: ENG-13, VET-05, missed:H-4a*

- **Where:** TodayCard.tsx:156-189; lib/spineReads.ts:99-118; lib/spineNode.ts:214; lib/signal.ts:796
- **Evidence:** A failed verdict read returns an empty map and replaces the last good row; nodeReadOf drops any dismissed read, against settled H-4a; the Signal regenerates before the read lands (CUL-1105), and the spine rolls at midnight.
- **Counterexample:** Sep 8, an 11:40 PM vomit reads 'Worth a call'; in the clinic car park with no signal the node says nothing about the read, and at 7:10 AM nothing on Home says worth a call.
- **Resolution:** Sequencing (GC-12): HV-5's local copy and readStateOf before GA, or an interim keep-last-good patch; CUL-1105 and CUL-1112 before GA. Offline checks wait about 2 minutes, since each sync step retries for about 7 seconds.
- **Verification:** CONFIRMED by probe; offline timing measured.

#### BRK-11 · The photo read never arrives on Home in production's write order

*severity high · gates the next step · shipped defect: yes · lenses: Motion · sources: MOT-01, missed:HV-5-inFlight*

- **Where:** TodayCard.tsx:174-181; lib/spineNode.ts:213; SpineNodeRow.tsx:139, 169-177
- **Evidence:** No client writes a pending row, so between the chain's settle and the re-read the slot unmounts; the landed read mounts a new slot with no arrival, no sentence and no announcement. The shipped test resolves the re-read in the same act, a shape production cannot produce.
- **Counterexample:** The 5:11 PM vomit: the tick vanishes and the spine jumps up, then 'Keep an eye out' pops in alone a round trip later.
- **Resolution:** Keep the node pending until a re-read returns a landed row, and carry the rule into HV-5 (hold inFlight until the local copy has it; write the chain's result through) so the gap never renders a grey 'Photo not read'. The end state follows History v2 §4.
- **Verification:** CONFIRMED with a verifier probe; device checks re-scoped to History v2's arrival.

#### BRK-12 · The draw in, the signature motion, plays on no chart the owner sees daily

*severity high · gates the next step · shipped defect: yes · lenses: Motion, Engineering · sources: MOT-02, ENG-08, missed:handoff*

- **Where:** SignalLeadCard.tsx:167; store/syncStore.ts:22-31; ColdStartSilhouette.tsx:12-18; MonthInstrument.tsx:302
- **Evidence:** Home's card passes no drawIn, coldStartHandoff has no reader (a C-38 cheque; CUL-1068's AC unmet), the compare draws inside an invisible view, and the month and weight draw only after a page turn.
- **Resolution:** Arm Home's draw on the handoff tick or first view (after BRK-13), arm the compare and lanes at the landing delay, draw the month and weight on first view, or delete the handoff and its comment. Pin one reader.
- **Verification:** CONFIRMED.

#### BRK-13 · The Signal lead card drops to a skeleton on every sync and regen, and misses an edit until the next sync

*severity high · gates the next step · shipped defect: yes · lenses: Mobile IA, Motion, Engineering, Jordan (follow-up) · sources: MIA-02, MOT-03, ENG-07, JORF-FU9*

- **Where:** SignalLeadCard.tsx:115-163
- **Evidence:** The load effect sets 'loading' on every hydrationTick and signalTick, unmounting the chart, moving the look chips about 96pt and re-reading the whole record; a failed re-read drops to the plain S1 card. An Edit bumps neither tick and never regenerates the Signal, so the card keeps the old count while the spine below has moved.
- **Counterexample:** A found vomit is re-timed from Sunday 7 AM to Saturday 11 PM: the spine drops it from today but the card keeps '1 this week so far · 3 last week' (should be 0 and 4) until the next foreground, then flashes grey.
- **Resolution:** GC-10: keep the last model per identity across ticks, skeleton only when none has answered, swap only on change; a lighter loader; a test that bumps both ticks and asserts the card stays mounted.
- **Verification:** CONFIRMED by three probes; the edit half confirmed in code.

#### BRK-14 · Unfolding the lead swaps components mid-choreography

*severity medium · gates the next step · shipped defect: yes · lenses: Motion · sources: MOT-04*

- **Where:** SignalZone.tsx:962-993; foldMotion.ts:377-381
- **Evidence:** Folded is InsightCard and unfolded is SignalLeadCard, against the host's own 'never swaps' comment; at openBox the strip unmounts and a skeleton springs open.
- **Resolution:** One host for both states under design_v2; test one rail instance and no skeleton frame during an unfold.
- **Verification:** CONFIRMED; severity lowered to medium.

#### BRK-15 · The flown chart stays parked over the Signal screen's failed and missing states

*severity medium · gates the next step · shipped defect: yes · lenses: Motion, Engineering, Trust and Safety, Jordan (follow-up) · sources: MOT-05, ENG-03, TNS-02, JORF-FU8*

- **Where:** flightMotion.ts:210-249; SignalScreen.tsx:144-175
- **Evidence:** Only the hero's measurement releases a landed flight, and no hero mounts on failure or 'missing'; three probes left the clone drawn, and on clinic Wi-Fi with no internet the slot is always measured first.
- **Counterexample:** Airplane mode, tap the lead card: the 1.3x chart hangs over 'I couldn't open this signal just now' until Back.
- **Resolution:** GC-10: abort the flight when the load settles failed, missing, or ready with no hero; regression test from the probe. Required for CUL-1077's ship option.
- **Verification:** CONFIRMED three times.

#### BRK-16 · The pinned 'Show fewer words' reads a card-local y and pins in the wrong places

*severity medium · gates the next step · shipped defect: yes · lenses: Mobile IA, Engineering · sources: MIA-01, ENG-05*

- **Where:** app/(tabs)/index.tsx:284-289; TodayCard.tsx:233; LookHeader.tsx:333
- **Evidence:** Flag-on, the header's onLayout y is relative to the Today card (about 39pt), not the scroll content, and the flag-on test mocks exitVisibility.
- **Resolution:** Compose the rect in page coordinates in one tested helper (C-22); a composition test at both boundaries.
- **Verification:** CONFIRMED; the pill can sit over the Signal card.

#### BRK-17 · More…'s stacked doors share hit area, so the emergency door's lower edge closes the grid

*severity medium · gates the next step · shipped defect: yes · lenses: Mobile IA · sources: MIA-06*

- **Where:** LookHeader.tsx:373-417, 645
- **Evidence:** Facing slops of 13 and 16pt across 0pt gaps (C-5); the later sibling wins the overlap.
- **Resolution:** Separate the rows or drop the slops with 44pt boxes; pin the rendered gaps (GC-9).
- **Verification:** CONFIRMED.

#### BRK-18 · The + disappears, on every tab, while More… is open

*severity medium · gates the next step · shipped defect: yes · lenses: Jordan · sources: JOR-09, missed:FAB-tabs*

- **Where:** LookHeader.tsx:203-216; FAB.tsx:67, 205; LookExits.tsx:83
- **Evidence:** The header publishes an overlay with no summary and no Done bar, and the FAB hides for any overlay; Home stays mounted on blur.
- **Resolution:** The FAB steps aside only for an overlay that occupies its corner, or the grid closes on blur; test that the + renders with More… open and after a tab switch.
- **Verification:** CONFIRMED on Home; other tabs need the device.

#### BRK-19 · Under a live intake concern the look says only 'Saved' and closes the question for the day

*severity high · gates the next step · shipped defect: yes · lenses: Sam, Jordan · sources: SAM-01, missed:JOR-withheld*

- **Where:** LookHeader.tsx:330, 439-455; LookWithheldEntry.tsx
- **Evidence:** The withheld branch renders the entry alone: no reason line, no Change, no chips, and the emergency door is unreachable; the 'unknown' branch is a bare skeleton. Flag-off keeps the ask in every state (T-14), and R6's Door B ruling rests on that ask.
- **Counterexample:** Two refused bowls in three days and a Lively tap at 8:02 AM: at 3 PM Pixel is hiding and nothing on Home lets Sam say so or reach 'Call your vet today'.
- **Resolution:** Rule (T-14, T-20, floor item 12): draw the reason line and keep the ask-again control in both branches; a fixture that is red today.
- **Verification:** CONFIRMED with two probes.

#### BRK-20 · The look header shows only the newest look, and 'Change' adds a look instead of changing one

*severity high · gates the next step · shipped defect: yes · lenses: Mobile IA, Jordan, Sam · sources: MIA-04, JOR-05, SAM-07*

- **Where:** LookHeader.tsx:147-154, 457-561
- **Evidence:** todayLooks[0] only, with no 'N more today' and no door; the mock draws Change as a replace while the code writes a second row. A later positive hides an earlier concern, against §3.3 rule 5 and T-15.
- **Counterexample:** Hiding at 7:10 AM, Played at 8 PM: Home answers 'How does Pixel seem today?' with 'Played'.
- **Resolution:** Rule: a later quiet or positive look never hides an earlier concern; name the control for what it does; a door after the dwell. D2-8's §3.1a edit states the display.
- **Verification:** CONFIRMED; JOR-05 raised to broken, gating.

#### BRK-21 · The quiet day says 'Nothing logged yet' under an answered look and points at a header that may not exist

*severity medium · gates the next step · shipped defect: yes · lenses: Designer, Jordan, Mobile IA, Engineering, Trust and Safety (follow-up), Engineering (follow-up) · sources: DES-01, JOR-06, MIA-12, ENG-06, TNSF-5, ENGF-08, ENGF-09, missed:quiet-day*

- **Where:** TodayCard.tsx:57-61, 250-280; app/settings/beta.tsx:85-87
- **Evidence:** Looks are not spine nodes, so a look-only day is 'empty', which T-9 forbids and TodayCard.test.tsx:115 pins as correct. LookTail checks species only while the header needs daily_look eligible and opted in, its comment claims the same gate (C-38), and the suite stubs LookHeader so neither case is tested.
- **Counterexample:** After GA, every cat and dog account outside Noticed's cohort, the App Review demo account included, reads 'The look above is enough to start' with nothing above it on every quiet day.
- **Resolution:** Switch the empty state on todayNudgeKind and lookCardLive (imported, not restated), invert the look-only test and drive the real gate; make the beta hint conditional; order GA against Noticed's GA (CUL-876) or state what Today shows without it.
- **Verification:** CONFIRMED by five probes.

#### BRK-22 · The coverage door counts days before the pet's record, and today before its first log

*severity high · gates the next step · shipped defect: yes · lenses: Designer, Data, Jordan, Sam · sources: DES-02, DAT-07, JOR-07, SAM-08*

- **Where:** lib/monthCoverage.ts:46-76; CoverageDoor.tsx
- **Evidence:** The denominator is the day of the month; the month it opens already excludes days before the record, and History v2 R-1 says today is never unlogged.
- **Counterexample:** A new App Store account logs its first breakfast on Sep 25: 'September · logged 1 of 25 days', while Patterns says '24 days before the record'.
- **Resolution:** Rule (R-1, C-3): count from the later of the 1st and the first non-look event, through yesterday; an empty record gets the month's invitation. One shared function and fixtures for day one and mid-month.
- **Verification:** CONFIRMED; the mock's '16 of 18' is illustrative, not a rule.

#### BRK-23 · Vomits are counted in two units on one screen, and the month says 'times' over an episode count

*severity high · gates the next step · shipped defect: yes · lenses: Jordan, Dr. Chen, Data · sources: JOR-03, VET-08, DAT-09*

- **Where:** lib/spineNode.ts:397-411 (rows); lib/signalLead.ts, lib/monthModel.ts:416, lib/chartCopy.ts:137 (episodes)
- **Evidence:** Today's count line counts rows; the card, the month and the compare count 3-hour episodes; the report and flag-off Patterns count rows. No surface names its unit.
- **Counterexample:** Vomits at 7:00, 9:30, 12:00 and 2:30: the card says '1 this week so far · 3 last week', Today says '4 vomits', the month says 'logged 1 time', the report says 4.
- **Resolution:** PM ruling on the unit (GC-4). Whatever wins, no string says 'times' over an episode count.
- **Verification:** CONFIRMED; a Design v2 regression on Patterns.

#### BRK-24 · Today's count line calls every bowl a meal and every dose a dose

*severity medium · does not gate · shipped defect: yes · lenses: Sam, Data, Dr. Chen · sources: SAM-09, DAT-09, VET-07*

- **Where:** lib/daySummary.ts:441-494 (buildCountChips)
- **Evidence:** Treats, refused bowls and missed or refused doses all count, one per row, above a spine that splits them; shared with flag-off Home and the recap.
- **Counterexample:** Nine bowls with three refused plus two treats reads '11 logged · 11 meals'.
- **Resolution:** Take History's header rule into HV-6: treats named apart, unfinished and undelivered named in grey; a test that the line partitions the spine.
- **Verification:** CONFIRMED; not gating.

#### BRK-25 · A refused bowl still counts as eating on Home (carried)

*severity high · gates the next step · shipped defect: yes · lenses: Dr. Chen, Sam, Jordan · sources: VET-06, missed:picked-at*

- **Where:** lib/spineCompaction.ts:54-56; lib/spineReads.ts:49-73; lib/patternsTiming.ts:393-417
- **Evidence:** CUL-1121 and CUL-1122 are still live: three refused bowls read '3 meals' and the vomit reads '4 min after eating'. HV-2 cannot close until the Dr. Chen lens rules whether picked at counts as eating.
- **Resolution:** Sequencing (GC-12): the Picked-at ruling, then HV-2 and HV-6, then GA.
- **Verification:** CONFIRMED by probe.

#### BRK-26 · Nothing on the new Home says which day it is

*severity medium · gates the next step · shipped defect: yes · lenses: Designer · sources: DES-10*

- **Where:** components/home/HomeHeader.tsx:106-170; TodayCard.tsx:232
- **Evidence:** §05's spine row names its window as 'today, dated in the header'; the header has no date.
- **Resolution:** Date the spine where the reader meets it, or amend §05 by a Tier-2 edit.
- **Verification:** CONFIRMED; a failed §05 cell.

#### BRK-27 · Chart labels are cut off at the default text size

*severity medium · gates the next step · shipped defect: yes · lenses: Accessibility · sources: A11Y-10*

- **Where:** WeeklyBars.tsx:136-150; SignalScreen.tsx:230-277; TimingLanes.tsx:122-132; EpisodeGallery.tsx:123-132
- **Evidence:** Nine weeks in a 275pt chart give 30.6pt slots, so 'Sep 13' (33.5pt) reads 'Sep…' on the card, the scaled hero and the month; tiles cut 'Worth a call' at AX3.
- **Resolution:** Never ellipsize a week label in its slot; bucket rows take their text's height; tiles protect the verdict (GC-9).
- **Verification:** CONFIRMED by shaped widths.

#### BRK-28 · VoiceOver hears the read's verdict without its sentence, unnamed, interrupting, and possibly off Home

*severity medium · gates the next step · shipped defect: yes · lenses: Accessibility, Accessibility (follow-up) · sources: A11Y-03, A11Y-08, A11YF-05, A11YF-09*

- **Where:** SpineNodeRow.tsx:88-101, 168-190
- **Evidence:** The row's label omits the read_text drawn on arrival. The announcement is the bare verdict through plain announceForAccessibility (every Home announcement is unqueued), fires wherever the owner is when the read lands, and pairs with a live region that doubles on Android.
- **Resolution:** One shared announcer (queued, default priority, a subject in the words, only while Home is focused, iOS-only where a live region covers Android), landing on History v2's arrival: the rose word announced once, calm silent (GC-9).
- **Verification:** CONFIRMED in code; off-Home firing and Android doubling need a device.

#### BRK-29 · Home's Signal card hides its chart from VoiceOver

*severity medium · gates the next step · shipped defect: yes · lenses: Accessibility, Designer · sources: A11Y-04, DES-18*

- **Where:** SignalLeadCard.tsx:165-217
- **Evidence:** The door's label is the title plus the line, so WeeklyBars' own label (every count, logged days, partial week) is unreachable.
- **Counterexample:** A rising record ending in a partial week speaks '1 this week so far · 3 last week', the one reading that sounds like improvement.
- **Resolution:** The card speaks its chart (appended label or a separate element); fix the pinned test (GC-9).
- **Verification:** CONFIRMED.

#### BRK-30 · The cold-start wait says nothing to VoiceOver and leaves the empty Home reachable

*severity medium · gates the next step · shipped defect: yes · lenses: Accessibility, Motion · sources: A11Y-07, MOT-12*

- **Where:** ColdStartSilhouette.tsx:76-95; Silhouette.tsx:46-66
- **Evidence:** The whole frame is hidden, the layer is not modal, and Home behind it reads 'Nothing logged yet today' and 'logged 0 of N days'.
- **Resolution:** Rule (C-14): modal while it blocks, one spoken line ('Catching up on {pet}'s history…'). Whether it gains the tick is a PM brief against the still round-4 frame.
- **Verification:** CONFIRMED; MOT-12 PLAUSIBLE.

#### BRK-32 · Text on the month fails contrast: white on rose, the dimmed neighbouring days, the grey idle dates

*severity medium · gates the next step · shipped defect: yes · lenses: Accessibility, Designer · sources: DES-17, A11Y-11, missed:neighbour-days*

- **Where:** DayMark.tsx:180-204; MonthInstrument.tsx:413-421, 654-671
- **Evidence:** White on #F43F5E is 3.67:1; neighbouring days drawn at 45% opacity measure about 2.1:1 and 1.8:1 though the bar counts them; #C9C9C9 dates are 1.66:1. The count collides with the date from AX1.
- **Resolution:** Rule by measurement: ink fill or ink text for rose-day text, pinned in theme.contrast.test.ts; lift the neighbours or exempt them in writing; tokenize the literal 9pt (GC-9).
- **Verification:** CONFIRMED by calculation.

#### BRK-33 · The cold-start silhouette does not match the Home it fades into

*severity low · does not gate · shipped defect: yes · lenses: Mobile IA, Designer · sources: MIA-08, DES-09, missed:silhouette-time*

- **Where:** HomeSilhouette.tsx:43-96
- **Evidence:** Its Signal is about 140pt against 313 to 440pt, it reserves no strip, draws a header date and puts node times on the right against the shipped 56pt left column.
- **Resolution:** Derive the blocks from shipped constants; pin the Today top in a layout test.
- **Verification:** CONFIRMED; lowered to low (first hydration only).

#### BRK-34 · The Signal hero reserves its scaled height one commit late

*severity medium · does not gate · shipped defect: yes · lenses: Motion (verifier) · sources: missed:hero-height*

- **Where:** SignalScreen.tsx:246-248, 269
- **Evidence:** The wrapper height is undefined until the inner layout lands, so every section below jumps about 39pt as the read lands, right under the clone on the flight path.
- **Resolution:** Seed the height from the model's chart height or FlightSkeleton's slot.
- **Verification:** PLAUSIBLE: probe confirms both paths; the jump needs a device.

#### BRK-36 · The every-row time on Home is cut off (carried under H-1)

*severity high · gates the next step · shipped defect: yes · lenses: Designer, Mobile IA, Jordan, Accessibility · sources: DES-14, MIA-09, JOR-13, A11Y-01, missed:member-rows*

- **Where:** DaySpine.tsx:48, 162-164; SpineNodeRow.tsx:303, 366-370
- **Evidence:** A compact range is about 84pt in a one-line 56pt column at every size, so no AM or PM survives; an opened run's member rows cut '12:41 PM' into their ellipsis.
- **Resolution:** Sequencing (GC-12): GA after HV-1 and HV-6 under whatever H-1 re-ruling lands (PMD-12).
- **Verification:** CONFIRMED by shaped widths.

#### BRK-37 · The FAB has no button role, no modal menu and no Reduce Motion frame

*severity medium · does not gate · shipped defect: yes · lenses: Motion, Accessibility · sources: MOT-15, A11Y-18, missed:FAB-a11y*

- **Where:** FAB.tsx:69-82, 196-215, 316-411
- **Evidence:** No accessibilityRole, Home reachable behind the menu, an unlabeled backdrop, roleless rows, and a spring and 45-degree rotation under Reduce Motion; CUL-1178 covers sheets only. Pre-existing and shipped to every account.
- **Resolution:** Add roles and modal semantics; fade under Reduce Motion; add to CUL-1178's sweep.
- **Verification:** CONFIRMED in code.

#### BRK-38 · The midnight-bout fix holds only on the day Home mounted

*severity low · does not gate · shipped defect: yes · lenses: Engineering · sources: ENG-18*

- **Where:** TodayCard.tsx:91-142
- **Evidence:** dayStartMs is memoised per mount while the store reloads from a fresh midnight.
- **Resolution:** Take the day from the read that loaded the rows; test across midnight.
- **Verification:** CONFIRMED by pinned-clock probe.

#### BRK-39 · On a safety screen the ask comes last under a benign disclaimer, and one population is compared twice

*severity high · gates the next step · shipped defect: yes · lenses: Designer, Data (verifier) · sources: DES-06, missed:chronicity-two-compares*

- **Where:** SignalScreen.tsx:333-407; lib/signalScreen.ts:305-320; InsightCard.tsx:370-388
- **Evidence:** A fixed section order puts the phone script after the gallery and Why, and 'not a verdict on how Nyx is doing' has no safety branch. The top compare and the script's compare read two sources in opposite order and disagree on logged days, and the why-it-stands clause for a falling pair renders only at the foot.
- **Counterexample:** An easing chronic course: the top reads 'The 28 days before: 12 · The recent 28 days: 5, logged 28 of 28' beside the disclaimer, while the script says 'logged on 15 of the recent 28 days'.
- **Resolution:** Rule (GC-3): a safety screen is ordered ask first, draws one compare (the engine's windows and denominator) with the why-it-stands clause under any falling pair, and keeps the disclaimer for benign classes.
- **Verification:** CONFIRMED by probe verifyChron; recategorised from design gap because the C-4 half is shipped.

#### BRK-40 · The spine's compact run opens with geometry only

*severity medium · gates the next step · shipped defect: yes · lenses: Motion · sources: MOT-09*

- **Where:** SpineNodeRow.tsx:262-339; foldMotion.ts:68-81; lookMotion.ts (More…'s grid)
- **Evidence:** Member rows appear at full opacity and unclipped while the node below springs down, the chevron swaps instead of rotating, and under Reduce Motion the rows simply appear. The month's day and the design authority use the fold's open-in-place choreography, and More…'s grid is a third implementation.
- **Resolution:** Move the run onto useOpenInPlace (HV-10, CUL-1167); until then CUL-1070 step 4 records it as a known failure and GA does not ship it; GA's inventory names all three sites.
- **Verification:** CONFIRMED; restored after being dropped, raised to broken and gating (C-30).

#### BRK-41 · Two findings on one key open one screen: the second food correlation on a protein, and the second intake card

*severity high · gates the next step · shipped defect: yes · lenses: Data (follow-up) · sources: DATF-1, DATF-4, DATF-5*

- **Where:** lib/signalFold.ts:100-115 (key without symptom or trigger); SignalZone.tsx:545-548; lib/signalScreen.ts:650 (first match wins)
- **Evidence:** The engine runs the correlation lane once per symptom and keeps both intake triggers, and nothing merges them; the client keys route, fold and flight on type plus cluster only, so the second card opens the first card's screen and its own evidence has no path in the app. No test asserts identities are unique.
- **Counterexample:** A dog's itch and vomiting both follow chicken: tapping 'Itching after chicken' opens 'Vomiting after chicken' with the vomit bars, compare and gallery. A cat's 'Eating less than usual' opens 'Refused the usual food', whose script names one food.
- **Resolution:** Rule (GC-10): the key carries the symptom for a correlation and the trigger for intake_decline (fold spec §5.2 Tier-2 edit), in a pure module a Deno test drives through the real engine asserting unique identities; loadSignalScreen surfaces more than one match instead of picking the first.
- **Verification:** CONFIRMED by engine and client probes; a seeded 4,000-record search collided only in correlations.

#### BRK-42 · One fold on a shared key compacts an unread twin and re-opens both with a false reason, live on main today

*severity high · gates the next step · shipped defect: yes · lenses: Data (follow-up) · sources: DATF-2, DATF-3*

- **Where:** hooks/useSignalFold.ts:163, 179-183; lib/signalFold.ts:417-418 (last finding wins); SignalZone.tsx:986 (no flag)
- **Evidence:** The fold store and its reconcile are keyed by the same identity, so folding one correlation folds its twin and the reconcile compares one finding's fingerprint with the other's. This runs flag-off for every account whose cache holds twins, and flag-on through the screen's 'Keep it compact'.
- **Counterexample:** An Established itch correlation (7 of 7) and an Early vomit one (3 of 3) on chicken: folding the itch card re-opens both with 'Back because this pattern is now established', one still badged 'Early pattern'; a real new episode can also leave both folded.
- **Resolution:** File now against the shipped fold; BRK-41's unique key fixes it, and reconcileFolds releases any key more than one finding claims. Add the three counterexamples as fold tests proven red against today's key.
- **Verification:** CONFIRMED by client probes C1 to C3.

#### BRK-43 · The Signal screen reads once: a removed vomit, a replaced photo, a retried read and an overnight log stay until it is reopened

*severity high · gates the next step · shipped defect: yes · lenses: Jordan (follow-up) · sources: JORF-FU1, JORF-FU2, JORF-FU3, JORF-FU7*

- **Where:** components/designV2/signal/SignalScreen.tsx:107-121 (one read per mount, no focus or tick re-read)
- **Evidence:** A tile pushes the record over the mounted screen, and Remove pops back onto the same model: the tile, its photo (which the confirm said would go) and every count stay, and a second tap lands on 'Event not found'. Replace, retry and re-time come back stale, and past midnight the title keeps yesterday's trial day.
- **Counterexample:** Removing the Sep 17 5:11 PM vomit should give '20 in these 9 weeks' and a trial compare of 20 against 19; the screen keeps 21, the tile and its photo.
- **Resolution:** Rule (GC-10): re-read on every focus, signalTick and hydrationTick; blank only before the first model; swap in place only on change; a failed re-read keeps the model; never re-arm the draw or landing; keep scroll; after a removal move focus to the gallery header. Test a soft delete under a mounted screen, a twice-logged vomit included.
- **Verification:** CONFIRMED in code; iOS focus after the pop needs a device.

#### BRK-44 · Editing a record never refreshes the Signal, and the screen shows no 'updating' state

*severity medium · gates the next step · shipped defect: yes · lenses: Jordan (follow-up) · sources: JORF-FU4*

- **Where:** app/edit-event.tsx:506-512, 597-647; lib/signalScreen.ts:305, 393 against 365-399
- **Evidence:** Log and remove paths refresh the Signal, but the Edit save and the record screen's photo add and replace do not (the CUL-642 class; CUL-1087 fixed only ratings). The screen never reads signalAcknowledging, so a sentence waiting on the server sits unlabelled over bars that already moved.
- **Counterexample:** Reopened within ten seconds of a removal, the compare reads 20 under a sentence saying 21; a re-timed vomit moves on the lane while the timing sentence keeps its count until the next log or the 24-hour expiry.
- **Resolution:** File now: Edit and photo changes refresh the Signal; the screen re-reads the server copy on signalTick and shows Home's updating line while the pet's regen runs.
- **Verification:** CONFIRMED in code.

#### BRK-45 · Get ready's rundown tile counts raw rows over seven UTC days, one scroll under a quoted episode count

*severity high · does not gate · shipped defect: yes · lenses: Dr. Chen (follow-up) · sources: VETF-3*

- **Where:** lib/rundown.ts:17-24, 233-236, 713-730; lib/analytics.ts:184-191, 231-236
- **Evidence:** The symptom tile counts uncollapsed rows over a UTC-day window reaching hours past now (its bound a text comparison, C-40), with no unit and no logged days, while claiming parity with Patterns and the report that it does not have; Copy as text hands this tile alone to whoever takes the pet in.
- **Counterexample:** One Thursday bout logged three times plus four other episodes: Worth raising quotes '5 episodes', the tile below says '7 this week', and the report counts 6 entries.
- **Resolution:** Ride GC-4's unit ruling: the tile states its unit and logged days, the parity comment is corrected, and Ask's count tool follows; file under Vet visits with CUL-967.
- **Verification:** CONFIRMED in code and probe; not a Design v2 gate.

#### BRK-46 · Folding the lead changes its count, its window and its name

*severity medium · gates the next step · shipped defect: yes · lenses: Dr. Chen (follow-up) · sources: VETF-8*

- **Where:** SignalZone.tsx:962-993; lib/signalCopy.ts:2366-2427; lib/signalWindows.ts:199-203
- **Evidence:** Unfolded, the lead is the v2 card built from calendar weeks; folded, it is the shipped strip built from the server finding's rolling fields and its old name.
- **Counterexample:** Monday 9 AM: '0 this week so far · 4 last week' folds to '3 this week, 4 last week'; a trial lead reading '0 this week so far · 0 last week' folds to '2 during the trial, 41 before'.
- **Resolution:** Rule (GC-3): the strip carries the card's own title and the same count as the line (or GC-4's ruled count), with §3.3 applied in both states, written into the fold spec edit.
- **Verification:** CONFIRMED by probe.

#### BRK-47 · Signal rows are keyed by type and rank, so a regen can hand a focused row a different finding

*severity medium · gates the next step · shipped defect: yes · lenses: Accessibility (follow-up) · sources: A11YF-03*

- **Where:** SignalZone.tsx:997
- **Evidence:** A re-rank or insertion reuses a node for a different finding or destroys it (probe), against the fold spec's 'identity, never rank'; nothing tells VoiceOver the focused element changed.
- **Counterexample:** A salmon-vomit day lifts salmon above chicken between regens; a VoiceOver owner resting on the chicken card double-taps and opens salmon's screen.
- **Resolution:** GC-10: key rows by the unique identity, with a test through a re-rank and an insertion.
- **Verification:** CONFIRMED by probe.

#### BRK-48 · __seedNoticed dates today's rows in the future, doubles on re-run, accepts any pet and writes vomits outside the app's write path

*severity medium · gates the next step · shipped defect: yes · lenses: Engineering (follow-up) · sources: ENGF-06*

- **Where:** lib/lookDevSeed.ts:20-32, 121-151; app/_layout.tsx:97-109
- **Evidence:** Every seeded day is stamped 7:04 PM local, today included, with no clamp; ids are fresh on each run; its vomits go through a raw INSERT with no push or regen, against its own header (C-38).
- **Counterexample:** Run at 10 AM, the seeded 7:04 PM look outranks the PM's 10:05 tap, so step 6 fails because of the seed; on a pet that eats, its vomits raise a worsening safety lead and the cross-pet banner.
- **Resolution:** For the pass: run it once, after 7:05 PM the evening before, on a fixture cat with no meals. File a fix: clamp to now, fixture account only, insertSimpleEvent, deterministic ids.
- **Verification:** CONFIRMED in code and probe.

#### BRK-49 · The first-pattern arrival remounts the Signal's cards right after saying 'ready'

*severity low · does not gate · shipped defect: yes · lenses: Accessibility (follow-up) · sources: A11YF-10*

- **Where:** SignalZone.tsx:746-779, 998-1003
- **Evidence:** Cards mount, unmount and remount at the moment's start and end, and the v2 lead reloads three times and drops to its skeleton at the end: CUL-830's class in the Signal zone.
- **Resolution:** File beside CUL-830; whatever carries a lead change must not wrap and unwrap the stack.
- **Verification:** CONFIRMED by probe; the focus jump needs a device.

### Works, but confusing (9)

#### WBC-1 · Titles name windows the bars do not draw

*severity low · does not gate · shipped defect: yes · lenses: Designer, Data, Dr. Chen (follow-up) · sources: DES-15, DAT-12, VETF-11, missed:last-1-week*

- **Where:** lib/signalTitle.ts:72-79, 121-128; lib/signalTitle.test.ts:50-69
- **Evidence:** 'The last 8 weeks' over nine bars reaching five days past the lookback; every production reflection and worsening reads 'the last 1 week' over two bars, while the title tests build windowDays 14 (C-35).
- **Resolution:** The title names the drawn span or the first bar clips; the 7-day form reads 'the last 7 days' or 'this week and last'; fixtures take production's windowDays of 7.
- **Verification:** CONFIRMED.

#### WBC-2 · The swipe back goes sideways, and the scaled hero reaches screens that never flew

*severity medium · does not gate · shipped defect: yes · lenses: Motion, Accessibility · sources: MOT-06, A11Y-15*

- **Where:** app/signal/[id].tsx:51-57; SignalScreen.tsx:230-277
- **Evidence:** No gestureDirection or animationMatchesGesture on a full-screen swipe; Hero scales 1.3x whenever FLIGHT_ENABLED, including Reduce Motion and deep links.
- **Resolution:** Inside CUL-1077: fix the gesture direction; scale only when a flight landed.
- **Verification:** MOT-06 PLAUSIBLE; A11Y-15 CONFIRMED.

#### WBC-3 · The Signal screen's opening starts at the read, slides full height, and lands its words upward

*severity medium · does not gate · shipped defect: yes · lenses: Motion · sources: MOT-07*

- **Where:** SignalScreen.tsx:124-150; signalOpenMotion.ts:34, 81
- **Evidence:** Beats arm on the model's arrival; the rise is slide_from_bottom; the landing seeds +driftPt against every other landing.
- **Resolution:** GA rules the anchor, the rise and the sign; pin the sign.
- **Verification:** CONFIRMED.

#### WBC-4 · The 700ms opening budget fails: lanes stagger without a cap

*severity medium · does not gate · shipped defect: yes · lenses: Motion, Engineering · sources: MOT-08, ENG-16, missed:budget*

- **Where:** TimingLanes.tsx:58-150; drawInMotion.ts:47-69, 176-206
- **Evidence:** Nine bars end at 740ms and labels at 780ms; one 28ms stagger runs across both lanes, about 5 seconds for a chronic vomiter, and the trial lane's count lands before its dots.
- **Resolution:** Stagger each lane from zero with a cap; pin the real tail against budgetMs.
- **Verification:** CONFIRMED.

#### WBC-5 · The month calls a dose-only day 'logged, no vomiting'

*severity medium · does not gate · shipped defect: yes · lenses: Data · sources: DAT-13*

- **Where:** lib/monthReads.ts:9-21; lib/chartCopy.ts:136-139; lib/monthModel.ts:39-44
- **Evidence:** The month's coverage counts every event but a look, the Trial panel below counts the gate set, and monthModel's header claims they match (C-34).
- **Resolution:** With CUL-1074 brief 2: say what was logged; correct the header with a test.
- **Verification:** CONFIRMED.

#### WBC-6 · VoiceOver focus and three changes nobody announces

*severity low · does not gate · shipped defect: yes · lenses: Motion, Accessibility · sources: MOT-14, A11Y-13, A11Y-17*

- **Where:** SignalScreen.tsx:127-133; MonthInstrument.tsx:249-346
- **Evidence:** Title focus may race the push; a month turn, an opened day and a fold are silent.
- **Resolution:** Device check first; then focus after transitionEnd, named month arrows, expanded state, a spoken fold.
- **Verification:** PLAUSIBLE (focus); CONFIRMED (silence).

#### WBC-7 · A free-fed cat's lanes are an empty axis with an unexplained 'couldn't be timed'

*severity low · does not gate · shipped defect: yes · lenses: Sam · sources: SAM-12*

- **Where:** lib/chartModels.ts:479-492
- **Evidence:** classifyEpisodeSet returns 'free_fed' and the line never reads it.
- **Resolution:** Split the untimed count by reason.
- **Verification:** CONFIRMED.

#### WBC-8 · The flight flies the chart the Home card last read, not the current record

*severity medium · does not gate · shipped defect: yes · lenses: Jordan (follow-up) · sources: JORF-FU6*

- **Where:** flightMotion.ts:131-139, 211-214, 252-259; SignalLeadCard.tsx:115-133
- **Evidence:** Outbound, the clone is the card's stale chart landing on a freshly read hero, so bars jump at the handover; back, it flies the pre-removal chart onto a card that may have changed or gone.
- **Counterexample:** A vomit logged from the FAB and a tap within 5 seconds: the card shows 2 this week, the screen reads 3, and a new maximum rescales every bar as the flight lands.
- **Resolution:** Inside CUL-1077: fly only when both charts hold the same counts, else pop plainly; the card re-reads on the screen's triggers (GC-10).
- **Verification:** Data half CONFIRMED; visibility needs a device.

#### WBC-9 · On a diet-trial recheck the rundown's '30 days' straddles the diet change and its zero reads 'none this week'

*severity medium · does not gate · shipped defect: yes · lenses: Dr. Chen (follow-up) · sources: VETF-4*

- **Where:** lib/rundown.ts:118, 233-236, 797-821
- **Evidence:** The window is a fixed 30 days, not trial-aware, one scroll under the trial quote, and a zero week drops 'logged'; the report the page sends scopes to the last visit or the trial.
- **Counterexample:** Day 25 of a rabbit trial: Get ready quotes 2 in the trial's 25 days while the tile says '6 in 30 days · none this week', and 4 of the 6 predate the diet.
- **Resolution:** Rule with CUL-968 and GC-4: never straddle the trial start without saying so; 'none logged this week' beside that week's logged days.
- **Verification:** CONFIRMED in code.

### Design gaps (13)

#### GAP-2 · Home draws two chart families, a timing lane included

*severity medium · gates the next step · shipped defect: no · lenses: Designer · sources: DES-09*

- **Where:** SignalZone.tsx:962-1106; InsightCard.tsx:208-228, 301-307
- **Evidence:** Only rank 0 takes §05 bars; secondary cards keep receipts §05 never audited, a secondary timing card's dot lane included, which round 4 put on the Signal's screen, and the building ghosts preview those receipts.
- **Resolution:** Every chart on flag-on Home gets a §05 row or is excepted; the lane question is ruled with GC-5.
- **Verification:** CONFIRMED; kept as a design gap because the scope of round 4's lane ruling is contested (Data reads it as the Patterns panel only).

#### GAP-3 · Home's controls and safety word ship smaller than the design authority

*severity medium · does not gate · shipped defect: no · lenses: Designer · sources: DES-13*

- **Where:** constants/theme.ts:16-34; LookHeader.tsx:630-634
- **Evidence:** Chips 11pt against the flag-off chip's 13pt; verdict and time 11pt; the Signal title grows to 26pt.
- **Resolution:** Set sizes from the device pass at the default size and one step up.
- **Verification:** CONFIRMED.

#### GAP-4 · The gallery draws every photographed episode where the design draws one row and 'All ›'

*severity medium · gates the next step · shipped defect: no · lenses: Mobile IA, Trust and Safety · sources: MIA-05, TNS-07*

- **Where:** EpisodeGallery.tsx:82-88; lib/signalScreen.ts:187-207
- **Evidence:** Nine photos make three rows and a safety script two viewports down; each tile signs its own URL.
- **Resolution:** Build the mock's cap, keeping any worth-a-call tile, with a door to History; or record a PM-ruled deviation.
- **Verification:** CONFIRMED.

#### GAP-5 · Colour alone carries logged days and the month's layer marks

*severity medium · gates the next step · shipped defect: no · lenses: Accessibility · sources: A11Y-05, A11Y-09, missed:HV-8*

- **Where:** CoverageTick.tsx; DayMark.tsx:92-107, 213-246
- **Evidence:** Logged and unlogged ticks differ 1.01:1 (deuteranopia delta E 4.0); medication and worth-a-call dots are 1.21 and 2.18:1 on the rose.
- **Resolution:** HV-8's 3:1 logged token also fixes CoverageTick; layer marks get a non-hue carrier; correct both headers (GC-9).
- **Verification:** CONFIRMED.

#### GAP-6 · Under VoiceOver one accidental double-tap writes a look and the Undo fades unseen

*severity medium · gates the next step · shipped defect: no · lenses: Accessibility · sources: A11Y-06*

- **Where:** LookHeader.tsx:219-279, 485-593
- **Evidence:** No focus move, no announcement, a gloss for a hint, and a 5-second Undo.
- **Resolution:** Hint says it records; focus moves to the row; announce the write; extend the window under a screen reader (GC-9).
- **Verification:** CONFIRMED.

#### GAP-7 · The Signal screen needs the network to open a finding Home already holds

*severity medium · gates the next step · shipped defect: no · lenses: Engineering, Jordan (follow-up) · sources: ENG-04, missed:retries, DAT-14, JORF-FU8*

- **Where:** lib/signalScreen.ts:649, 671; lib/monthReads.ts:190, 214-230
- **Evidence:** supabase-js retries a failed read for about 7 seconds, so offline the screen spins then fails while Home shows the card, and the month holds its skeleton; the month's verdict read is one unchunked request.
- **Counterexample:** In an exam room with no signal the owner taps the card Home is showing and the vet sees neither counts nor photos, though every episode and photo is on the phone.
- **Resolution:** Hand the finding over with the route; draw local first with the sentence labelled with when it was last updated; time-box or disable retry.
- **Verification:** CONFIRMED with measured timing.

#### GAP-8 · A sick day's spine runs about three screens

*severity medium · does not gate · shipped defect: no · lenses: Mobile IA · sources: MIA-11*

- **Where:** lib/spineCompaction.ts:54-61
- **Evidence:** Only meal runs compact.
- **Resolution:** PM ruling at GA: accept, or a second rule that never crosses a photo or read.
- **Verification:** PLAUSIBLE.

#### GAP-9 · Smaller geometry: day squares under 44pt, the FAB on the tab bar and over the right edge, the fold control at the screen's foot

*severity low · gates the next step · shipped defect: no · lenses: Mobile IA · sources: MIA-07, MIA-14, MIA-10*

- **Where:** MonthInstrument.tsx:81-83; FAB.tsx:439-447; SignalScreen.tsx:391-407
- **Evidence:** Squares 42.6pt at 390pt, the mock's size too; the disc enters the bar's top 9pt and, in the renders, covers member times and the quiet day's last words; 'Keep it compact' follows the uncapped gallery.
- **Resolution:** Reach 44pt or write the exception; derive the inset from constants; revisit the control after GAP-4.
- **Verification:** CONFIRMED; MIA-10 lowered and non-gating.

#### GAP-10 · The flight record is keyed by the finding, not its pet

*severity low · does not gate · shipped defect: no · lenses: Trust and Safety · sources: TNS-03*

- **Where:** flightMotion.ts:131-267
- **Evidence:** A widget pet switch lets pet 1's bars fly onto pet 2's Home for about 370ms.
- **Resolution:** Carry petId and abort on pet change in the flight's ship PR.
- **Verification:** CONFIRMED; lowered to low.

#### GAP-11 · The 'Eating less than usual' screen has no mark per bowl

*severity medium · does not gate · shipped defect: no · lenses: Sam · sources: SAM-10*

- **Where:** lib/signalWindows.ts (signalSymptomOf); lib/signalScreen.ts:347-363
- **Evidence:** No weekly, compare, lanes or gallery for intake_decline.
- **Resolution:** Backlog: an intake §05 row and a door to History's meals.
- **Verification:** CONFIRMED.

#### GAP-12 · A lead card the record re-opens shows no 'Back because' line on Design v2

*severity low · does not gate · shipped defect: no · lenses: Data (follow-up) · sources: DATF-6*

- **Where:** SignalLeadCard.tsx:84, 136-150, 184-235
- **Evidence:** The reason reaches only the safety or fallback InsightCard; the chart branch renders title, chart and line with no reason on screen or in its label, against DF-8.
- **Resolution:** GA's fold spec edit shows the line above the lead's title and in its label, or amends DF-8 for the lead.
- **Verification:** CONFIRMED by probe.

#### GAP-13 · An escalation that reaches Home while the owner is there is never spoken

*severity high · gates the next step · shipped defect: no · lenses: Accessibility (follow-up) · sources: A11YF-01, A11YF-06, A11YF-08*

- **Where:** SignalZone.tsx:230-263, 614-627, 868-1007; hooks/useSignalFold.ts:100-146; CrossPetSafetyBanner.tsx
- **Evidence:** After a log VoiceOver hears the updating line, then nothing when a new safety card takes rank 0, a folded safety strip re-opens, or another pet's banner appears, while the same screen speaks one photo's verdict. The celebration's safety gate correctly returns before speaking, and no plain line replaces it.
- **Counterexample:** Nyx's second vomit this week after none the week before: the chart lead is replaced by a plain worsening card at rank 0, and the only utterance across the sequence is the updating line (probe).
- **Resolution:** Once PMD-21 rules the channel: an escalate-only announcer on the rendered set (a safety identity enters, a folded safety strip re-opens for an increasing reason, an ask moves toward the vet), queued, named, only while Home is focused, never on a cold mount, pet switch, stand-down or decrease; or write the silence into Principle 9.
- **Verification:** CONFIRMED by probe.

#### GAP-14 · Nothing stops the app changing under App Review or after approval

*severity high · gates the next step · shipped defect: no · lenses: Trust and Safety (follow-up) · sources: TNSF-3, TNSF-4*

- **Where:** CUL-561 standing rules; migration 070 header; .github/workflows/edge-deploy.yml; CUL-1071's retire note; app.json runtime version
- **Evidence:** The review freeze bans OTA only: a GA flip shows the reviewer an Early access shelf the notes say is absent, and any merge to main redeploys every owed function, generate-report included. Keeping the row 'as the precedent did' copies enabled:true into an approved binary, and an OTA from post-GA main reaches every 1.2.0 install.
- **Resolution:** GC-11: from Submit to a terminal status, no app_config write beyond re-seeding and no merge to main (or every reviewer-reachable function held in deploy-manifest.json); CUL-1071's AC names the row's end value per order and bumps expo.version.
- **Verification:** CONFIRMED against Linear and the repo.

### Missing follow-up (17)

#### MFU-1 · The device-pass script cannot pass as written

*severity high · gates the next step · shipped defect: no · lenses: Dr. Chen, Accessibility, Engineering, Motion, Designer, Dr. Chen (follow-up), Engineering (follow-up) · sources: VET-16, A11Y-14, A11Y-12, ENG-16, ENG-17, VETF-12, ENGF-01, missed:steps-1-2-4-5-9*

- **Where:** CUL-1070's twelve steps
- **Evidence:** Nyx's chronic record leads with safety cards, so step 2's chart card never appears; steps 1, 2, 4, 5, 9 and 12 expect things the code cannot do (step 9's layer fade snaps in both mock CSS and code); there is no VoiceOver, text-size, colour or exam-room step; offline checks judged at 10 seconds read wrong.
- **Resolution:** GC-2.
- **Verification:** CONFIRMED against the script and the live cache.

#### MFU-2 · The flag-on cold start cannot be seen over a real record

*severity high · gates the next step · shipped defect: no · lenses: Motion, Engineering · sources: MOT-11, ENG-09*

- **Where:** ColdStartOverlay.tsx; lib/session.ts:203
- **Evidence:** Every real cold start wipes the opt-in; only a zero-event account shows the silhouette.
- **Resolution:** A __DEV__ hook that raises coldStartHydrating over a populated store (GC-2).
- **Verification:** CONFIRMED.

#### MFU-3 · GA's order against History v2 is not in Linear

*severity high · gates the next step · shipped defect: no · lenses: Engineering · sources: ENG-12*

- **Where:** CUL-1071 relations; History v2 §5.6, §8
- **Evidence:** HV-1, HV-5 and HV-6 rewrite Home's row inside files GA would delete; CUL-1121, CUL-1162 and CUL-1163 are not blockers of CUL-1071.
- **Resolution:** GC-12.
- **Verification:** CONFIRMED.

#### MFU-4 · GA's retire list misses modules and guards

*severity medium · gates the next step · shipped defect: no · lenses: Engineering · sources: ENG-10*

- **Where:** app/(tabs)/index.tsx; guards/homeWrites.test.ts; guards/completionCard.test.ts; CLAUDE.md C-33, C-36, C-41
- **Evidence:** LookCard, LookChip, DayLane, todayLane, useTrend, useMedStrips and five dead Patterns reads die with the flag; three guards and CLAUDE.md still name them.
- **Resolution:** CUL-1071 carries the importer map as a checklist.
- **Verification:** CONFIRMED.

#### MFU-5 · After GA the one-loop claim is app-wide but the guard walks one directory

*severity medium · gates the next step · shipped defect: no · lenses: Engineering, Motion · sources: ENG-11, MOT-13*

- **Where:** guards/designV2OneLoop.test.ts; PullToRefreshSky.tsx:69; FAB.tsx:334; Tick.tsx:78
- **Evidence:** The pull and FAB whorls sit outside its walk, the pull holds 700ms past its request, and the tick runs on two curves.
- **Resolution:** Widen the walk to app/ at GA; pin KNOWN_LOOP_IMPORTS; one curve (CUL-1075).
- **Verification:** CONFIRMED.

#### MFU-6 · Home's photo rules are held only by comments

*severity low · does not gate · shipped defect: no · lenses: Trust and Safety · sources: TNS-06*

- **Where:** guards/homeWrites.test.ts
- **Evidence:** A mutation adding a trigger, a functions.invoke and a signed URL to a spine row stayed green.
- **Resolution:** Extend the closure guard; prove by mutation.
- **Verification:** CONFIRMED by mutation.

#### MFU-7 · Gallery photos may outlive sign-out in the image caches

*severity low · does not gate · shipped defect: no · lenses: Trust and Safety · sources: TNS-05*

- **Where:** lib/storage.ts:248-257; lib/session.ts
- **Evidence:** Uploads send max-age=0, not no-store; Fresco ignores headers; no wipe clears either cache.
- **Resolution:** rls-privacy-reviewer runs the simulator check as an app-wide App Store Launch item.
- **Verification:** PLAUSIBLE; lowered to low.

#### MFU-8 · The cold-start wait blocks taps on every launch for a pet with nothing logged, with no ceiling

*severity high · does not gate · shipped defect: yes · lenses: Engineering (verifier) · sources: missed:cold-start-trigger*

- **Where:** lib/db.ts:324-330; hooks/useSync.ts:38-71; ColdStartSilhouette.tsx:82
- **Evidence:** isLocalDataEmpty counts only events and vet_visits and runs on every launch's first sync; the layer blocks taps until the sync settles, which offline is minutes. It predates Design v2: the night moment has it flag-off.
- **Counterexample:** A new App Store owner adds a pet, logs nothing and relaunches in a basement: a tap-blocking wait for minutes.
- **Resolution:** File against App Store Launch: trigger only on a store that needs hydration, add a ceiling, never block taps offline.
- **Verification:** Verifier code reading; recategorised from broken because it predates Design v2.

#### MFU-9 · The navigator reset on sign-out must land before the gate leaves the Signal route

*severity high · gates the next step · shipped defect: no · lenses: Trust and Safety · sources: TNS-01, missed:sign-out*

- **Where:** app/_layout.tsx:211-237; app/signal/[id].tsx:42-59; app/event/[id].tsx:349, 723
- **Evidence:** SIGNED_OUT replaces the route without resetting the stack. Today the design_v2 gate unmounts the Signal screen, its only protection, and D2-8 deletes the gate; the ungated record screen already survives one Back from the next account until its focus re-read answers (plausible, predates Design v2).
- **Counterexample:** Shared tablet: account A opens a gallery tile, A's password is reset elsewhere, B signs in and presses Back.
- **Resolution:** Sequencing (GC-12): the reset and abortFlight in wipeLocalSession land first, tested on the real route through the rls-privacy-reviewer; add the three-deep case to CUL-554's AC-6.
- **Verification:** TNS-01 REFUTED as filed; GA emulation reproduces; recategorised from broken.

#### MFU-10 · The device pass has no fixture account, no seed path and no lead check, and it writes test rows into Nyx's record

*severity high · gates the next step · shipped defect: no · lenses: Engineering (follow-up) · sources: ENGF-01, ENGF-02, ENGF-03, ENGF-04, ENGF-07, ENGF-10*

- **Where:** CUL-1070 steps 2, 3, 5, 6, 7, 10; scripts/demo/emitSeedSql.ts:49; generate-signal/index.ts:635
- **Evidence:** The PM's live cache leads with an incident red flag and two chronicity cards and the second cat is building, so no chart lead or flight can be seen; a fixture pet on the PM's account would carry the cross-pet banner, and the demo emitter refuses any other email. Steps 5 and 10 put a real vision read, an attachment, a dose and a regen into Nyx's record, and reversal hides but cannot erase the Storage object, the analysis row or spent caps.
- **Resolution:** GC-2. The worth-a-call day is two fixtures: the spine's words (lethargy, then a benign photo that meets R-9) and the red-flag lead (Blood: yes, then one regen); never a service-role analysis row.
- **Verification:** CONFIRMED by live read-only queries and engine probes.

#### MFU-11 · The pre-handover allowlist check reads a stale hand list that never looks at design_v2

*severity high · gates the next step · shipped defect: no · lenses: Trust and Safety (follow-up) · sources: TNSF-2*

- **Where:** CUL-188 step 7; docs/nyx-demo-account-requirements.md §9 (R-14); lib/appConfig.ts:241, 288
- **Evidence:** The query names four keys, one deleted by migration 060, and misses six live allowlists including design_v2, which now holds the PM's uid; every device caches every allowlist, so a uid present at handover or re-added mid-review reaches the reviewer's device.
- **Resolution:** A count query over every allowlist-shaped key (expect 0 rows), run at handover and each re-seed until a terminal status; never re-add a uid during review; route through the rls-privacy-reviewer (GC-11).
- **Verification:** CONFIRMED against migrations and Linear.

#### MFU-12 · The review notes, screenshot plan and demo checks describe surfaces Design v2 removes

*severity medium · does not gate · shipped defect: no · lenses: Trust and Safety (follow-up) · sources: TNSF-6, TNSF-7, TNSF-8*

- **Where:** docs/app-review-notes.md:36; docs/store-screenshot-plan.md:67, 91, 107-109, 118; docs/nyx-demo-account-requirements.md:289; CUL-173; CUL-188 step 4
- **Evidence:** Notes step 3 sends the reviewer to a Trend zone and 'All patterns' that flag-on Home lacks; frames 1, 4 and 6 expect a hint, a Summary card and a Today row the flag removes; capture is not tied to the cut commit.
- **Resolution:** Under GC-11 (A) only the stale signal_design_v2 lines change for 1.2.0; under (B) the GA session rewrites all three and CUL-559 blocks CUL-173. In both, capture uses the cut build.
- **Verification:** CONFIRMED in the docs.

#### MFU-13 · After launch every allowlist uid reaches every signed-in device

*severity medium · does not gate · shipped defect: yes · lenses: Trust and Safety (follow-up) · sources: TNSF-9*

- **Where:** lib/appConfig.ts:241, 288; migration 030 (USING (true)); CUL-489
- **Evidence:** The client caches every allowlist, uids included, and any signed-in user can list them, while the privacy policy says each account reads only its own rows; the structural fix sits at Low outside the launch project.
- **Resolution:** Move CUL-489 into App Store Launch, due before any allowlist holds a non-staff uid after launch; keep cohorts staff-only until then.
- **Verification:** CONFIRMED in code.

#### MFU-14 · The Accessibility label's planned Reduced Motion claim is not yet true

*severity low · does not gate · shipped defect: no · lenses: Trust and Safety (follow-up) · sources: TNSF-10*

- **Where:** CUL-558 step 3; CUL-1123 (PR #905); CUL-1178
- **Evidence:** 22 sheets slide regardless of Reduce Motion, and flag-on Home reads it as off on the first render; no dark appearance ships for a Dark Interface claim.
- **Resolution:** Claim Reduced Motion only after #905, CUL-1178 and a device check; drop Dark Interface unless one ships.
- **Verification:** PLAUSIBLE; the sheet behaviour needs a device.

#### MFU-15 · CUL-638, the only home of the safety-led owner's spoken line, was closed by an attachment

*severity medium · gates the next step · shipped defect: no · lenses: Accessibility (follow-up) · sources: A11YF-04*

- **Where:** Linear CUL-638 (Done) and PR #785; SignalZone.test.tsx:955-958; CUL-767
- **Evidence:** CUL-638 closed two seconds after #785 merged, though its comment and #785's body both call it open; the test pinning the silence still defers to it.
- **Resolution:** Reopen CUL-638 or file its safety-led half under CUL-1071 with PMD-21's brief; re-home CUL-767; never reuse #785's 'no announcement' line as a pass criterion.
- **Verification:** CONFIRMED in Linear.

#### MFU-16 · CUL-629's brief costs an in-session carrier on a premise CUL-784 removed

*severity low · does not gate · shipped defect: no · lenses: Accessibility (follow-up) · sources: A11YF-11*

- **Where:** Linear CUL-629; lib/signalFold.ts:100
- **Evidence:** The brief says no stable finding identity exists and nothing keeps a prior set; foldIdentity now exists, and in-session the prior set is the one on screen, so only the cross-session carrier needs a ledger.
- **Resolution:** Post the correction on CUL-629 and rule its in-session half with PMD-21.
- **Verification:** CONFIRMED.

#### MFU-17 · The worsening tier and the read-aloud script count UTC days

*severity high · does not gate · shipped defect: yes · lenses: Dr. Chen (follow-up) · sources: VETF-10*

- **Where:** detection.ts:3856-3886, 2364, 4142; phrasing.ts:149-180; lib/signalCopy.ts:1864-1879
- **Evidence:** The firm tier needs 4 symptom days, counted on UTC days while the trial lane already counts local days; the Signal screen prints that count in the phone script beside bars counted locally, and Get ready quotes it.
- **Counterexample:** A Central cat vomiting Tue 7:30 PM, Wed 8 AM, Thu 8 PM, Fri 9 AM and Sat 10 AM is '5 episodes on 3 days' on UTC and gets the standard ask; on local days it is 5 of 7, the firm 'worth booking a vet visit soon'.
- **Resolution:** Extend CUL-336: time-zone-aware day counts in the engine for the worsening and reflection lanes and the tier, with its required adversarial pass; GC-4 states exam-room day counts are local.
- **Verification:** CONFIRMED by probe.

### PM decisions (22)

#### PMD-1 · Nyx's own Home leads with the plain safety card, never the chart

*severity high · gates the next step · shipped defect: no · lenses: Designer, Dr. Chen, Engineering (follow-up) · sources: DES-03, ENGF-01*

- **Where:** SignalZone.tsx:962; detection.ts:2395-2401, 3927-3955
- **Evidence:** Chronic vomiting clears every chronicity floor, S1 keeps the card plain, and the valve silences every reflection; the live cache confirms an incident red flag at rank 0 and two chronicity cards.
- **Resolution:** Folded into GC-8: accept the plain safety lead as the chronic wedge pet's Home in the Principle 3 edit (recommended); the chart lead is judged on a fixture (GC-2).
- **Verification:** CONFIRMED, now including the live cache.

#### PMD-2 · The trial strip and the Signal's Patterns footer push the look below the fold on a trial day

*severity high · gates the next step · shipped defect: no · lenses: Mobile IA, Designer, Jordan, Accessibility · sources: MIA-03, DES-11, JOR-11, DES-12, A11Y-18, missed:footer*

- **Where:** app/(tabs)/index.tsx:253; SignalZone.tsx:802-818; CoverageDoor.tsx:4
- **Evidence:** Neither is in the v4 Home frames; with the footer the look question sits at about 687 to 706pt against a 659pt fold, and CoverageDoor calls itself the only door (C-38). Patterns has no tab, so the footer is Home's only early door to it.
- **Resolution:** GC-8, ruled after CUL-1070 measures the fold.
- **Verification:** PLAUSIBLE (positions need a device).

#### PMD-3 · Better than the rule: the weight caveat calls a steady loss scale noise (R4-4)

*severity high · gates the next step · shipped defect: no · lenses: Designer, Data, Dr. Chen, Sam · sources: DES-05, DAT-08, VET-13, SAM-05*

- **Where:** lib/chartCopy.ts:171-219; app/insights/index.tsx:97
- **Evidence:** The gate reads only first against last, inclusive at 5% on rounded pounds, over a 12-reading window the header does not share. R4-4 (2026-09-19) protected 'a 4% move looks like 4%', which still holds.
- **Counterexample:** Six readings falling in strict order (1 in 720 under noise) print 'a home scale moves about that much on its own'; a daily weigher down 15% reads 2%.
- **Resolution:** Rule now: strict bound on stored kilograms. Ruling (GC-7): the caveat only at two readings or when readings disagree in direction; runs stated; one population for header, dots and label. Dr. Chen signs the words.
- **Verification:** CONFIRMED by four probes.

#### PMD-4 · Better than the rule: 'Didn't eat ›' and 'Nothing unusual' moved behind More… (§3.1)

*severity high · gates the next step · shipped defect: no · lenses: Jordan, Sam · sources: JOR-04, SAM-02*

- **Where:** LookHeader.tsx:338-407
- **Evidence:** §3.1 (2026-09-09) calls the first row a safety rule; round 4's More… opened nothing, so the go never saw the router move. The dog row's one-tap positive is Lively alone.
- **Counterexample:** Mochi walks away from breakfast; the nearest one-tap word is 'Off', which writes no refused meal, so B-789 and the withheld state never learn.
- **Resolution:** GC-6.
- **Verification:** CONFIRMED.

#### PMD-5 · Where the look's coverage footer and receipts live now (R11, R12)

*severity medium · gates the next step · shipped defect: no · lenses: Engineering · sources: ENG-14*

- **Where:** LookHeader.tsx; LookCard.tsx:87-88
- **Evidence:** Both were PM rulings; the header renders neither and GA deletes their only Home renderer unbriefed.
- **Resolution:** Team leans Patterns only; rule in the GA brief batch (GC-12) for D2-8's daily-look edit.
- **Verification:** CONFIRMED.

#### PMD-6 · Itching has no surface on flag-on Patterns (CUL-1074 brief 1)

*severity high · gates the next step · shipped defect: no · lenses: Designer, Dr. Chen, Jordan · sources: DES-17, VET-12, JOR-10*

- **Where:** MonthInstrument.tsx:85; app/insights/index.tsx:365-399
- **Evidence:** The month counts vomiting only; CUL-845's accepted residual assumed an itch tile beside 'Scratching more', which no longer exists.
- **Resolution:** GC-7.
- **Verification:** CONFIRMED.

#### PMD-7 · Better than the rule: a refusal is 'left some' and nothing counts intake (brief 5)

*severity medium · gates the next step · shipped defect: no · lenses: Data, Dr. Chen, Sam · sources: DAT-10, VET-11, SAM-06, missed:intake-card*

- **Where:** lib/monthReads.ts:166-176; MonthInstrument.tsx:572
- **Evidence:** Refused, picked at and some-eaten share one uncounted hairline, and the intake-rate card is dropped; per-food '% finished' survives with no trend. §04's 'left some' protected no alarm colour, which still holds.
- **Resolution:** GC-7.
- **Verification:** CONFIRMED.

#### PMD-8 · A worth-a-call draws nothing on the month by default (brief 6)

*severity medium · gates the next step · shipped defect: no · lenses: Designer, Data (verifier) · sources: DES-17, missed:brief-6*

- **Where:** MonthInstrument.tsx:70
- **Evidence:** DEFAULT_LAYERS has photos and meds off, and the spoken label names only layers that are on.
- **Resolution:** GC-7.
- **Verification:** CONFIRMED.

#### PMD-9 · The weight dot's colour (brief 4)

*severity low · does not gate · shipped defect: no · lenses: Accessibility · sources: A11Y-16*

- **Where:** WeightDots.tsx:32-52
- **Evidence:** The mock's #00C2A8 is 2.26:1; shipped grey 4.74:1; the ink 5.17:1.
- **Resolution:** Never the bright accent; Dr. Chen rules teal ink or grey (B-186).
- **Verification:** CONFIRMED.

#### PMD-10 · When and for which signs the Signal frames a trial

*severity high · gates the next step · shipped defect: no · lenses: Dr. Chen, Data (verifier) · sources: VET-15, missed:itch-trial*

- **Where:** lib/signalWindows.ts:56-64; lib/signalTitle.ts:108-113; detection.ts:5354
- **Evidence:** The floor mirrors a coverage constant (C-34); the frame vanishes the day a trial ends while the report keeps it 90 days; any symptom takes the trial title, though the trial lane reads vomiting only.
- **Counterexample:** An itch reflection on a skin trial leads Home as 'Itching, day 55 of the rabbit trial' over a before-and-after the engine refuses to make.
- **Resolution:** Dr. Chen brief in the GA batch (GC-12): frame only where the trial lane reads; floor keyed to indication or the §3.4 line; keep the frame through the 90-day grace.
- **Verification:** CONFIRMED.

#### PMD-11 · D2-4's Dr. Chen briefs, carried

*severity medium · gates the next step · shipped defect: no · lenses: Designer, Dr. Chen, Jordan · sources: DES-16, VET-14, missed:dog-row*

- **Where:** SpineNodeRow.tsx:164-176; lib/timingBandLabels.ts; constants/lookWords.ts:205-212
- **Evidence:** History v2 already rules a calm read shows nothing on the row, which settles brief 1 once HV-5 and HV-6 land. Open: the long band's '6h or more after eating', and the dog row's second positive, without which edit 5 cannot be written.
- **Resolution:** In the GA batch (GC-12): the long band reads 'since the last logged meal'; rapid and mid bands wait on HV-2; full_walk as the dog's second positive, written into edit 5.
- **Verification:** CONFIRMED.

#### PMD-12 · Better than the rule: H-1's 56pt column cannot meet its own AC 19

*severity high · gates the next step · shipped defect: no · lenses: Accessibility · sources: A11Y-02, missed:H-1-trigger*

- **Where:** docs/nyx-history-v2-requirements.md §3.6, AC 19
- **Evidence:** '12:41 PM' plus its dash is 58pt at the default size and '10:58 AM' 61pt at xxLarge; a jest render test cannot see truncation. The H-1 brief's own trigger (a default-size cut) is met.
- **Resolution:** Re-rule before HV-1 is built: (a) as ruled, (a2) width follows text size and stacks above the words from AX1, (b) time on the right. Prove with font metrics plus a device check.
- **Verification:** CONFIRMED.

#### PMD-13 · Better than the rule: DP-3's once-ever wash and success tap still play flag-on

*severity medium · gates the next step · shipped defect: no · lenses: Motion · sources: MOT-10*

- **Where:** SignalZone.tsx:73-400; lib/haptics.ts:189-191
- **Evidence:** A first symptom insight gets a 900ms gold wash and a Success haptic, often behind a skeleton; polish spec §5.6 says a symptom is never a success.
- **Resolution:** Recommended in the GA batch (GC-12): retire both under design_v2, a Tier-2 edit to polish §4 and §5.6.
- **Verification:** CONFIRMED.

#### PMD-14 · The as-needed dose went from one tap to four

*severity medium · gates the next step · shipped defect: no · lenses: Jordan · sources: JOR-08*

- **Where:** FAB.tsx:305-401
- **Evidence:** §08's 'something in the FAB's menu' was never ruled; the FAB has no medication row.
- **Resolution:** One-line brief in the GA batch (GC-12), before MedStrip is deleted: add recent meds to the FAB, or keep four taps.
- **Verification:** CONFIRMED; recategorised, medium.

#### PMD-15 · The app-switcher snapshot on the gallery (CUL-1128)

*severity medium · gates the next step · shipped defect: no · lenses: Trust and Safety · sources: TNS-04*

- **Where:** SignalScreen.tsx:362-389
- **Evidence:** CUL-1128 option (b) omits signal/[id] and flag-on Home, and the issue is framed for iOS only.
- **Resolution:** Rule in the GA batch (GC-12); recommended (a), the app-wide cover, and say what Android does.
- **Verification:** PLAUSIBLE; needs device photos.

#### PMD-16 · The door speaks a daily score where C-3 asks for gaps

*severity low · does not gate · shipped defect: no · lenses: Sam · sources: SAM-11*

- **Where:** lib/monthCoverage.ts:73-75
- **Evidence:** 'logged 3 of 17 days' sits under 'the look above is enough to start'.
- **Resolution:** Recommended: 'September · 2 days unlogged', nothing when covered.
- **Verification:** CONFIRMED.

#### PMD-17 · The absolute-import rule versus guards that follow relative imports

*severity low · does not gate · shipped defect: no · lenses: Engineering · sources: ENG-15*

- **Where:** CLAUDE.md Imports; guards' closures
- **Evidence:** An alias would blind three guards silently.
- **Resolution:** Amend the rule; a guard reds on non-relative specifiers.
- **Verification:** CONFIRMED.

#### PMD-18 · At a recheck one record can put five different 'this week' counts in the room, and Get ready quotes a sentence Home no longer shows

*severity high · gates the next step · shipped defect: no · lenses: Dr. Chen (follow-up) · sources: VETF-1, VETF-2*

- **Where:** lib/signalWindows.ts:175-203; detection.ts:3856-3886; lib/getReady.ts:31-32, 278-291; lib/rundown.ts:233-236; generate-report/render.ts:2317-2335
- **Evidence:** Home's line, the server sentence, the rundown tile and the report each define 'this week' differently, and no exam-room string dates its window. Get ready quotes CachedFinding.text as 'the exact string InsightCard renders on Home', false for a v2 benign lead, and CUL-1071's Tier-2 list omits the vet-visits spec.
- **Counterexample:** One Monday with a photo re-log puts 0 (Home), 1 (the screen's bars), 3 (Get ready), 5 (the phone script) and 7 (the rundown) into the room.
- **Resolution:** GC-4 rules sentence, unit and window together with the vet-visits quote rule (§4.1 B1, AC 5, G6) as an eighth Tier-2 edit; correct or pin getReady.ts:31-32; do not close CUL-570 as retired.
- **Verification:** CONFIRMED by probe.

#### PMD-19 · Better than the rule: the lead line pairs a partial week with a whole one (R4-1)

*severity medium · does not gate · shipped defect: no · lenses: Dr. Chen (follow-up) · sources: VETF-7*

- **Where:** lib/signalWindows.ts:189-203; lib/chartModels.ts:254
- **Evidence:** R4-1's 'N this week so far · M last week' protected a line the bars sum to; early in the week it prints a zero the engine may not phrase, and on Saturday it drops 'so far' though the week is open.
- **Counterexample:** Monday 9 AM: the finding counts 3 in the last 7 days while Home reads '0 this week so far · 4 last week'.
- **Resolution:** Recommended: keep the bars; the line names its window ('since Sunday') and drops the last-week clause until the week holds half its days or when the sentence withheld the pair; fix Saturday. The protection holds.
- **Verification:** CONFIRMED.

#### PMD-20 · Nothing sequences Design v2's GA against App Store submission #1

*severity high · gates the next step · shipped defect: no · lenses: Trust and Safety (follow-up) · sources: TNSF-1*

- **Where:** CUL-1071 against CUL-559 (the 1.2.0 cut), CUL-173 (capture), CUL-560 (submit)
- **Evidence:** The other two GAs block the cut; Design v2 has no relation to it, and the same drift already happened once (launch docs still plan around the retired signal_design_v2). Under option (B) the lead screenshot barely changes, since the demo's safety card leads (S1).
- **Resolution:** GC-11.
- **Verification:** CONFIRMED in Linear.

#### PMD-21 · No one has ruled whether 'safety is silent' covers speech

*severity high · gates the next step · shipped defect: no · lenses: Accessibility (follow-up) · sources: A11YF-02*

- **Where:** SignalZone.test.tsx:954-966; SpineNodeRow.tsx:25-31, 173-177; polish spec §5.6; incident spec G4
- **Evidence:** The test's 'silence on every channel' came from the CUL-636 session, not a PM ruling; §5.6 and G4 name haptics only, the spine speaks every verdict, and Principle 9's draft would turn the test's reading into a principle.
- **Resolution:** Brief in the GA batch (GC-12): (a) recommended, silence means no haptic, and in-session safety escalations are spoken in the ordinary register; (b) every channel, written into Principle 9; (c) speech for every class, better ruled with CUL-629. Principle 9 gains the speech twin of its Reduce Motion test.
- **Verification:** CONFIRMED.

#### PMD-22 · Better than the rule: no gesture carries a change of lead, and three rules disagree

*severity medium · gates the next step · shipped defect: no · lenses: Accessibility (follow-up) · sources: A11YF-07*

- **Where:** SignalZone.tsx:741-801, 868-1007; fold spec FS-9; polish §4; Principle 9 draft
- **Evidence:** A regen re-renders in one frame, swapping the ~200pt chart card for a plain card under the look chips, while the mock draws the displaced lead folded to a strip. FS-9 (2026-09-03) and polish §4 protected against decorating a concern; an arrive with the fold's physics, identical on every class, decorates nothing.
- **Resolution:** In the GA batch (GC-12): (a) snap everywhere and say so in Principle 9; (b) recommended, arrive on every class after identity keys (BRK-47), with no wrap and unwrap and speech regardless; (c) the mock's automatic fold, which needs a fold spec amendment. Record on glass with and without Reduce Motion.
- **Verification:** CONFIRMED in code; the reflow's size needs a device.

### Backlog (4)

#### BKL-1 · Copy and conformance nits

*severity low · does not gate · shipped defect: yes · lenses: Designer, Accessibility, Mobile IA · sources: DES-18, A11Y-18, MIA-13*

- **Where:** signalScreen.ts:205; monthModel.ts:421; WeightCard.tsx; SignalOpenLink.tsx; TodayCard.tsx:60
- **Evidence:** Mixed number styles, 'dated ahead, not drawn', two weigh-in controls, a 36pt 'Open ›', a 39pt 'Off', '+ button' against 'Log event', 'Fold' missing from its label.
- **Resolution:** One pass after the device pass.
- **Verification:** CONFIRMED.

#### BKL-2 · The month's day opens every row, uncapped

*severity low · does not gate · shipped defect: yes · lenses: Mobile IA · sources: MIA-15*

- **Where:** MonthInstrument.tsx:427-515
- **Evidence:** A 25-event day opens about 850pt in place.
- **Resolution:** After #904: symptoms plus a few, then 'All N in History ›'.
- **Verification:** CONFIRMED.

#### BKL-3 · No door from the Signal screen to the vet report

*severity low · does not gate · shipped defect: no · lenses: Jordan · sources: JOR-12*

- **Where:** SignalScreen.tsx
- **Evidence:** Only the Pet tab and the rundown push /report.
- **Resolution:** File one door issue.
- **Verification:** CONFIRMED; recategorised backlog.

#### BKL-4 · Composed Signal labels read with a doubled full stop

*severity low · does not gate · shipped defect: yes · lenses: Accessibility (follow-up) · sources: A11YF-12*

- **Where:** InsightCard.tsx:660-668
- **Evidence:** The label appends '. New this week.' to a server sentence already ending in a stop.
- **Resolution:** Join with a helper; a label test on a real server sentence.
- **Verification:** CONFIRMED by probe.

## C. What held

The falsification attempts that failed: the design survived them.

- Dr. Chen, Designer, Sam: tried a chronicity lead with a benign second finding; the safety lead stays the plain card with its door, with no chart (S1).
- Data, Designer, Sam: tried a newest-first input and a treat between bowls; compaction never crosses a symptom, a dose, a photographed meal or a switch between meal and treat.
- Trust and Safety: tried a pet id the account does not own on /signal/[id]; RLS returns 'missing' before any read.
- Trust and Safety: scanned Home's 170-file import closure; no health photo can reach Home.
- Motion: tried to make a worth-a-call arrive differently from a calm read; same beats, no haptic, and every surface is in the haptics scan.
- Jordan, Designer: tried 'better', 'down', 'done' and day 56 of 56 in every title; no verdict or completion word appears.
- Dr. Chen: medication inside either compare window is named with its dates, counting delivered doses only.
- Engineering: an ungated namespace node and an aliased hook each turn the flag-off guard red.
- Engineering: could not drop a row at a boundary second (C-40); the verdict read survives a max-rows cap (C-42).
- Engineering: a pet switch mid-read leaked nothing onto Home, the month or the Signal screen (C-9).
- Data (follow-up): a seeded 4,000-record search found identity collisions only in food correlations; red flags, chronicity, worsening, reflections, timing lanes and trial_response are each one per family, symptom or trial.
- Trust and Safety (follow-up): under option (A) the reviewer sees today's app, because the flag-off guard asserts equality with the code's absence and the demo is off every flag.

## D. Refuted, re-argued, or a mock artifact

- **TNS-01** (The Signal screen survives sign-out today): Refuted as filed: the design_v2 gate unmounts it at SIGNED_OUT. The leak reproduces once the gate is gone and may be live on the record screen today; carried as MFU-9 and GC-12.
- **A11Y-06 (part)** (Undo stays at full strength until it goes): Re-argues a PM ruling on taste: T-15 rules the last-half-second fade.
- **DES-05 (part)** (No noise caveat beside any loss): Re-argues a PM ruling on taste: §04 drew the caveat beside a 4% loss. The boundary and rounding evidence is kept in PMD-3.
- **VET-10 (part)** (A timing lead draws its lane on Home): Dr. Chen's own verifier found this re-argues round 4's lane-on-the-screen ruling without new evidence. Data's separate better-than-the-rule option stays in GC-5, because secondary timing cards already draw a lane on Home (GAP-2).
- **uncited renders (critic list)** (Renders no finding cited): Mock artifacts: captures taken mid-wait or mid-crossfade (frames 01 to 03, demo-12 to 14), a harness error (demo-11), mock controls with no behaviour (demo-15 to 23, demo-25), and the overruled option B frames (07, 08). The substantive observations are carried: the FAB over member times and quiet-day copy (GAP-9), the undrawn safety screen (BRK-39), the undrawn answered quiet day (BRK-21) and the mock's automatic fold of a displaced lead (PMD-22).

## E. The open items the run carried

| Item | Status after the critique | What the device pass and GA must say |
|---|---|---|
| CUL-1077, the flight | sharpened | Whichever option wins: abort on a failed, missing or heroless read (BRK-15); key the flight by pet (GAP-10); fly only when both charts hold the same counts (WBC-8); fix the sideways swipe and scale only after a real flight (WBC-2); seed the hero's height (BRK-34). Record it on a seeded insight-lead pet, because Nyx's lead cannot fly. The recording includes an offline tap, a regen mid-open and clinic Wi-Fi with no internet. Android parity stays open. |
| CUL-1074 briefs 1, 5 and 6 | now blocking | GA rules them (GC-7) before deleting flag-off Patterns. |
| CUL-1074 brief 2, the coverage word | sharpened | A dose-only day never reads 'no vomiting', and monthModel's header is corrected (WBC-5). |
| CUL-1074 brief 3, white on rose | resolved by evidence | White on rose measures 3.67:1, against 8.02:1 on the ink. This is now a rule under GC-9, and it covers the dimmed neighbouring days too (BRK-32). |
| CUL-1074 brief 4, the weight dot hue | sharpened | Never the bright accent (2.26:1); Dr. Chen rules grey or ink (PMD-9). |
| D2-4 brief: a read in the record without its caveat | resolved by evidence | History v2 rules that a calm read shows nothing on the row. That is only true once HV-5 and HV-6 land, so the pass still sees the old row. |
| D2-4 briefs: the timing qualifier and the dog's second positive | sharpened | Ruled in GC-12's batch (PMD-11). The long band becomes 'since the last logged meal'; the other bands wait on HV-2; full_walk goes into edit 5, which cannot be written without it. |
| D2-3's calls: title, label tail, VoiceOver focus | sharpened | 'The last 1 week' also appears, on every production reflection, and its fixtures use windowDays 14 (WBC-1). The budget fails by more than recorded: bars end at 740ms and the lane stagger has no cap (WBC-4). Focus is a device check (WBC-6). |
| CUL-1075 loops and CUL-1071's WhorlSpinner inventory | sharpened | Widen the one-loop guard at GA, name the pull and FAB whorls, use one tick curve, and edit the in-app brand spec's N3 and night-moment sections with it. NightMoment stays while the capture screens use it (MFU-4, MFU-5). |
| CUL-1121 and CUL-1122 | sharpened | HV-2 needs the Dr. Chen lens's Picked-at ruling first; both close before GA (BRK-25, GC-12). |
| CUL-1123 and CUL-1178 | sharpened | #905 lands before GA. The FAB menu is not a sheet and joins the sweep (BRK-37). The App Store label claims Reduced Motion only after both land (MFU-14). |
| CUL-1073 | unchanged | #904's door, then the long-day cap (BKL-2). |
| CUL-1105 and CUL-1112 | now blocking | Both land before GA, and HV-5's rose must survive Hide. Rule whether 'Call the vet ›' ships (BRK-10). The red-flag fixture is 'Blood: yes' followed by one regen (MFU-10). |
| CUL-1109 | unchanged | No new evidence. The pass budgets its 12 regens per pet per day. |
| CUL-1126 | unchanged | After HV-3. |
| CUL-1128 | now blocking | Rule before GA, in GC-12's batch. The list adds signal/[id] and flag-on Home, and the ruling says what Android does (PMD-15). |
| GA's Tier-2 edits (CUL-1071) | sharpened | Add: §3.3 and §3.4 onto the card and the screen; fold spec §5.2 (the identity key) and §7 (the spoken re-open); daily-look §3.1, §3.1a, T-9, R11 and R12; DR-2's count line; polish §4 and §5.6; the vet-visits spec (§4.1 B1, AC 5, G6); in-app brand §5 N3 and §6; Principle 3's Home; and Principle 9's fades plus the channel ruled for speech. Also decide whether the specialist lenses graduate or retire, and whether an accessibility lens joins the roster. |
| The device pass has not run | now blocking | It runs only after GC-1 is ruled and GC-2's fixture account, seeds, lead check and rewritten script exist. Under GC-11 (A) it finishes before App Review handover or waits for a terminal status. |

## F. The device pass's checklist: every finding a lens could not settle without a phone

Each lens was told to begin a finding's evidence with `NEEDS DEVICE:` where its truth depends on glass. These are the raw findings so tagged (the lens's id and its verifier's verdict; `SELF` marks a follow-up read, which verified itself). The code half of each is confirmed where the verdict says so; the phone half is CUL-1070's to check.

- [ ] **DES-13** (confirmed) Home's controls and its one safety word ship a type size below the design authority, while the Signal title ships a size above. *Check:* read Home at arm's length on a 390pt phone at the default text size.
- [ ] **MOT-06** (plausible) The Signal screen comes up from below, but the swipe back sends it off sideways. *Check:* The route sets animation slide_from_bottom (or fade after a flight), gestureEnabled and fullScreenGestureEnabled.
- [ ] **MOT-07** (confirmed) The Signal screen's opening: its beats start at the read, the rise is a full-height slide, and its words land upward against every other landing. *Check:* The feel and the latency need glass; the drift sign is confirmed in code.
- [ ] **MOT-09** (confirmed) Open in place is two choreographies: the spine's compact run is geometry-only, while the month's day uses the fold's. *Check:* How visible the overlap is needs glass; the two paths are confirmed in code.
- [ ] **MOT-12** (plausible) The cold-start wait says nothing to anyone: still and wordless through the whole pull, and hidden from VoiceOver while the empty Home behind it is not. *Check:* The pull's real duration and VoiceOver's traversal need glass.
- [ ] **MOT-14** (plausible) VoiceOver focus on the Signal screen is set when the model arrives, which can be mid-push, before the platform places focus. *Check:* focusAccessibility(titleRef) runs in an effect on `arrived`.
- [ ] **MIA-03** (plausible) On the wedge day the shipped first frame ends at the look question: the trial strip and the Signal's chrome push the chips, the count and every node below the fold. *Check:* on a 390×844 phone with Nyx's real record and her trial running, record where the first chip row, the count line and the first vomit node sit at scroll 0.
- [ ] **MIA-08** (confirmed) Home's silhouette is about a third of the real Signal's height and has no slots for the strips, so the cold start's crossfade lands 260–420pt away. *Check:* in step 1's cold start with the toggle on, watch whether Today jumps at the crossfade.
- [ ] **MIA-10** (plausible) The Signal zone grows with the findings, and its one compaction control now sits at the foot of each finding's screen. *Check:* how a Signal with three or four insights reads on the first frame.
- [ ] **MIA-11** (plausible) The spine compacts only meal runs, so a sick day is ~3 screens long and its latest reads sink to the bottom. *Check:* a day of 20+ events on glass.
- [ ] **MIA-14** (confirmed) The shipped FAB sits 9pt into the tab bar over the Pet tab, and the scroll-inset floor is a hand number measured on the mock. *Check:* whether the teal disc visibly sits on the tab bar's top edge over the Pet tab's avatar (step 2 expects 'the teal FAB above the tab bar').
- [ ] **DAT-12** (confirmed) The card's title, bars and line name three different windows (carried: 'the last 8 weeks' over nine bars). *Check:* whether a cold reader sees a mismatch.
- [ ] **JOR-11** (confirmed) Flag-on Home keeps the trial strip and a second Patterns door, both of which the design authority removed. *Check:* where the fold falls with both blocks in.
- [ ] **JOR-13** (confirmed) Until History v2's row lands, the time on every compacted meal line is cut off. *Check:* exactly where the text cuts.
- [ ] **TNS-04** (plausible) The app-switcher snapshot now falls on the photo gallery, on the safety path that sends the owner to the Phone app. *Check:* what iOS captures depends on how far the screen is scrolled when the app leaves the foreground.
- [ ] **TNS-05** (plausible) Gallery photos can outlive a sign-out in the image caches; the gallery's 'never cached anywhere new' rests on max-age=0, not no-store. *Check:* two questions need a filesystem check on a simulator and an emulator: whether iOS's NSURLCache stores these responses, and whether Android's Fresco disk cache still holds the tiles after sign-out.
- [ ] **ENG-07** (confirmed) Home's Signal card drops to its skeleton on every sync tick and re-reads the whole record each time. *Check:* whether the flash is visible depends on how long the read takes on glass.
- [ ] **ENG-16** (confirmed) The carried motion and assistive-tech items, turned into device-pass checks that can fail. *Check:* each item is about glass.
- [ ] **A11Y-01** (confirmed) Home's spine cuts off every compact node's time range at the default text size. *Check:* the device pass only has to look (CUL-1070 steps 3–4).
- [ ] **A11Y-06** (confirmed) Under VoiceOver, one accidental double-tap on a look chip writes a look, focus is lost, and the 5-second Undo fades before it can be found. *Check:* where VoiceOver focus lands when the chip row unmounts.
- [ ] **A11Y-07** (confirmed) Flag-on, the cold-start wait says nothing to VoiceOver and leaves the empty Home behind it reachable. *Check:* whether VoiceOver can reach Home's elements behind the layer.
- [ ] **A11Y-08** (confirmed) The read's arrival announcement names no subject, interrupts, can fire from an off-screen Home, and doubles on Android. *Check:* the off-screen firing and Android's double speech.
- [ ] **A11Y-10** (confirmed) The chart family's labels are cut off at the default size on Home, and the 1.3× hero gains no room. *Check:* confirm the ellipses.
- [ ] **A11Y-11** (confirmed) At large text sizes the month's square holds the date and a 9pt count that collide and clip. *Check:* confirm at AX1 and AX5.
- [ ] **A11Y-12** (confirmed) Reduce Motion: the Signal screen can slide in on its first open, and the device-pass script expects cuts where the house rule fades. *Check:* whether native-stack uses the first render's animation option for the push.
- [ ] **A11Y-13** (plausible) Moving VoiceOver focus to the Signal screen's title races the native screen transition. *Check:* NEEDS DEVICE.
- [ ] **A11Y-14** (confirmed) The device pass has no VoiceOver, Dynamic Type or colour-vision steps, and no lens owns them. *Check:* CUL-1070's script covers motion, haptics, composition and a Reduce Motion repeat (step 12).
- [ ] **A11Y-17** (confirmed) Three changes VoiceOver never announces: a month turned, a day opened, a card folded. *Check:* what VoiceOver says by default.
- [ ] **TNSF-10** (self) The Accessibility label's planned Reduced Motion claim is not yet true of the build that will be cut. *Check:* whether iOS already cross-fades a sliding sheet (a slide Modal) under Reduce Motion; CUL-1178 marks this unverified.
- [ ] **JORF-FU6** (self) The flight flies whatever the Home card last read, not the current record: after a log or an edit the chart jumps as it lands, and after a Remove mid-visit it flies home still showing the removed vomit. *Check:* whether the swap is visible when the flight hands over.
- [ ] **JORF-FU8** (self) In an exam room with no signal, Home shows the Signal card but the evidence screen won't open, and with the flight on the chart can hang above 'I couldn't open this signal just now'. *Check:* the chart hanging over the error only; the offline failure itself is confirmed in code.
- [ ] **JORF-FU9** (self) The Home Signal card has the same blind spot one screen back: it misses an edit until the next sync, and whenever it does re-read it flashes to a grey placeholder. *Check:* whether the flash is visible; the staleness is confirmed in code.
- [ ] **A11YF-09** (self) The spine's read can be spoken while Home is covered by another screen, and twice on Android. *Check:* whether VoiceOver speaks “Worth a call” while another screen is in front of Home, and whether TalkBack says it twice.
- [ ] **A11YF-10** (self) The first-pattern arrival remounts the Signal's cards at its start and again at its end, just after saying “ready”. *Check:* whether VoiceOver's cursor actually jumps.
