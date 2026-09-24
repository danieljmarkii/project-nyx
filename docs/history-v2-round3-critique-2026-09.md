# History v2, round 3: the design critique

**Issue:** CUL-1108 (project *Design v2, the whole day*) · **Date:** 2026-09-23 · **Mode:** DISCOVERY, a critique; nothing redrawn, nothing built
**Under critique:** `docs/culprit-history-v2-mockups.html`, round 3 "The record you can read", as merged in #885 (identical to the published artifact, https://claude.ai/artifact/RNvdtUG6FX5utWmzGqBNa6)
**Status:** 🧊 a dated review. Correct it additively (a dated section at the foot), never in place. The requirements (`docs/nyx-history-v2-requirements.md`) are written from this file plus the PM's rulings on H-1 to H-11.

---

## TL;DR, plain English

The round-3 History holds up. Nine lenses that never saw it being drawn each read it cold, and none of them wants to undo its shape: days as cards, a row per event that opens its record, every meal named, the rose only for a read worth a call, the note on the row, the week strip at the top.

What does not hold up is the page's claim that it reuses what the app already ships. The row is drawn as "Home's node, borrowed whole", but shipped Home puts the time on the other side and folds meals differently. The timing line, the read, the coverage line and the strip's marks each quietly differ from Home or the Patterns month. And several numbers go wrong in cases the drawn fortnight never hits: under a filter, under a search, after a pet switch, for a new pet, and on a day with nothing logged.

Four rules fix most of that, and the team can write them without you (R-1 to R-4 below). **Eleven things need your ruling (H-1 to H-11); the first five change what the screen looks like, so rule those first.** After you rule, a short mock pass redraws the frames your rulings move, and then the requirements are written.

Separately, the critique found real bugs in code that already ships. The worst: tapping a pet's widget can make History keep switching back to that pet, so the next log lands on the wrong pet (CUL-1119); and on the redesigned Home, a refused bowl folds silently into "3 meals" (CUL-1121). Eleven issues are filed, CUL-1119 to CUL-1129.

## Verdict by lens

Every lens returned **ready with conditions**; none returned *not ready*.

| Lens | Verdict | Why, in its words |
|---|---|---|
| Sr. Product Designer | ready with conditions | The structure holds against the real fortnight and reads calm at rest. But the page says the row is Home's node 'borrowed whole' and the strip is 'one row of the month', and the shipped code contradicts that in about ten places. The quiet-state rule and the uncounted-disclosed rule both fail under a lens. Follow-up: no date carries a year on an unbounded list, anchored windows lose their date once picked, and there is no noun table. The year fits in the existing layout with no redraw. |
| Motion Designer | ready with conditions | Every beat runs 150 to 500ms, nothing cascades or pulses, and silence on safety holds. Four problems: open in place clips runs; a watched arrival lands in a state the row never rests in; a calm read snaps 16px; and five sequences are unspecified. Follow-up: the Reduce Motion rule covers content but not the viewport, and the shared hook reads false on every first render. |
| Mobile Information Architect | ready with conditions | The shape works at 390pt. But runs clip at four meals, rows are 33pt doors, the FAB covers the end of every list, the header overflows in its widest real state, and nothing is pinned, so mid-scroll there is no date and no filter cue. Follow-up: there is no scope rule for a pet change, and today the widget's pet parameter reverts any later pet switch. |
| Sr. Data Scientist with the Data Visualization Designer | ready with conditions | The arithmetic holds wherever it could be checked. About a dozen numbers and marks have no named predicate, and four break shipped rules: coverage (C-3), counting looks, a third timing derivation, and a strip missing the month's intake mark. Follow-up: the Noticed lens has no rule; as coded it counts looks, speaks misses and bypasses item 12. |
| Veterinarian, Dr. Alex Chen | ready with conditions | The design holds up in the exam room: found vomits carry no minutes, the meal before a vomit stays its own row, and an unfinished meal never folds away. Several things must be written differently from the page: rule 7's wording, the missing dose states, the lensed denominator, the timing re-derivation, and four count and window definitions. Follow-up: the per-drug lens has no key, no count predicate and no course bounds, and History cannot name a regimen's doses. |
| Pet Owner, Jordan (diet-trial dog) | ready with conditions | Five of seven owner tasks work, and 'vomits since the trial' works very well. Nothing on History answers 'anything besides the trial food?', and several counts mislead a literal reader. Follow-up: both folds fail Principle 8's screenshot test. The lens's '13 since the trial' has no shape and no door to one. |
| Pet Owner (cat), Sam | ready with conditions | The rows work for a picky grazer: every Picked or Refused meal is its own row, and 'N logged' uses the owner's verb. One level up, where Sam actually scans (header, strip, lens gaps, search, the free-fed bowl), a refusing or grazing cat reads as routine. |
| Trust & Safety / Privacy | ready with conditions | Nothing widens access beyond the account, and the wipe and deep-link scoping hold. Five things must be written first. The top three: CUL-848's unruled cue; the note being several columns with different destinations; and the unstated search scope. The others are R1-5 and the rule 2 wording. |
| Dir. of Engineering with Sr. QA | ready with conditions | Almost everything can be built on managed Expo without new dependencies. Three gaps: several rules claim shipped predicates that actually differ; several promises cannot be built on an offset-paged virtualized list; and the doorway contract misses four live doors. |

---

## What needs your ruling

Each brief: what it decides, the options with the team's recommendation, and what the ruling unblocks. Where two lenses genuinely disagree there is no recommendation, just the two sides (the Persona Conflict Protocol). Rule by number, for example "H-1 a, H-2 a with neutral ink, H-4a as recommended, H-4b T&S".

### Rule these first: they change the frames

**H-1 · One row for History and Home.**
*Deciding:* History's row and Home's day spine are meant to be the same row, and today they are not. Shipped Home puts the time in a fixed left column, puts a chevron on every row, and folds meals more loosely (a refused bowl disappears into a run, CUL-1121). One side gives way, and the meal-run rule is written once for both.
*Options:* **(a, recommended by the Designer and the Mobile IA)** both use shipped Home's frame: the time in a left column that wraps instead of cutting off; round 3's rules for runs, chevrons and naming (B, D, K) move into Home in the same bundle. **(b)** both use the row the two approved mocks draw (Home's round-4 design authority and History round 3): time on the right, no chevron on single rows; shipped Home changes to match, which is cheap because it is still behind the beta toggle. **(c)** two rows, each written down, with a guard that they differ only where stated.
*Why (a):* times, ranges and the "found" / "estimated" tags get one fixed place; Home's shipped 44pt row height; one set of content rules. *Against it:* (b) needs no redraw and keeps both mocks you approved true. One device measurement settles it: if Home's 56pt time column already cuts off "12:41 – 5:07 PM" at the default text size, that argues for (b).
*Consequence:* either way the shared meal-run rule fixes CUL-1121 before Design v2 goes to everyone. (a) redraws History's rows before the spec freezes.

**H-2 · What the week strip and a day header show at a glance.**
*Deciding:* whether a day of refused meals shows anywhere above the rows, and whether the vet's number ("13 vomits since the trial") is one tap from a chart.
*The problem:* the strip marks only symptoms and the header leaves meals out, so a cat who refused four of six bowls two days running shows two plain cells and "6 logged". The Patterns month already marks those days. And both first screens read as a log: the only numbers with a shape are the headers, so History fails Principle 8's own screenshot test.
*Options:* **(a, recommended)** the strip uses the month's day mark without counts, including its pale "left some" line; the header names unfinished meals; under a symptom filter the count line opens the chart that already owns that number (the Signal's compare, or the trial view). **(b)** as (a), plus the month's small count on symptom days only. Jordan wants this: with no count, a two-vomit day and a one-vomit day are the same dot. It narrowly reopens "marks, not numbers". **(c)** as drawn: the strip is a navigator only, and Principle 8's test is recorded as failed.
*Inside (a), one split:* the header's intake word in **rose** (the Designer: it matches the rose chip the row already shows for Picked and Refused) or **neutral** (the Data Scientist, Dr. Chen and Sam: it matches the month; rose already means a symptom and a read worth a call).
*Sequencing:* CUL-1118 (filed tonight) may make meal rating exception-only. The day mark keys on a recorded refusal or decline, never on a missing rating, so it holds whatever CUL-1118 rules; the "left some" line waits for it.
*Consequence:* (a) adds a clause each to rules C and I and one outbound link; (b) also reopens a settled ruling; (c) closes the question with the test failed.

**H-3 · What stays on screen while you scroll.**
*Deciding:* once you scroll past today, round 3 leaves nothing on screen that says which day you are in or that a filter is on. Shipped History pins its pills and prints the date on every row, so this is a step back. And with Reduce Motion on, tapping a day in the strip lands with no mark at all, because the only "you are here" is a draw-in animation.
*Options:* **(a)** as drawn. **(b, recommended)** pin the pills row as shipped History does, and add a sticky day header with the date and its counts; a landed day holds a quiet selected state until the next scroll and takes VoiceOver focus; tapping the History tab again returns to today. **(c)** as (b), and pin the strip too, which costs 150pt or more on every screen.
*Why (b):* it is a pin and a state, not motion; about 44pt; and it moves the day's count out from under the FAB.
*Consequence:* two new frames (the pinned header, the landed state) before the spec freezes.

**H-4 · The read on a row.** Two parts. These are the carried items R2-5 and R1-5, now with facts the earlier rounds did not have.

*H-4a · What hiding a read hides (R2-5).* Today three surfaces disagree: Home's spine hides a read the owner hid, the Patterns month ignores it, and Home's Signal card keeps the warning (CUL-1111). In the critique the Data Scientist wanted one rule for one owner act (hide it everywhere); Dr. Chen wanted hiding to hide the words, never the warning.
New since the lenses ran: the flag review (CUL-1107, waiting on you) gives owners a real answer, "No, it's something else", which stands the warning down while keeping what the photo showed; and CUL-1111 makes "Hide this note" hide the words only.
**Team recommendation:** "Hide" hides the words only, on every surface, so the rose stays on History, Home's spine and the month. Only an owner's "No" (once the flag review ships) stands the rose down, and on every surface at once. Until then, nothing an owner does takes the rose off History. This gives the Data Scientist one rule per act and Dr. Chen an escalation no words-only act can silence. If you read it differently, the original conflict is the one stated above.
*Consequence:* one read predicate for History, Home and the month (R-3); H-4a moves with CUL-1107 and CUL-1111.

*H-4b · What a photographed row with no read shows (R1-5).* This covers declined consent, over the daily cap, a failed read, not read yet, and offline. The read lives on the server and is never copied to the phone, so a History built on the shipped reader would show **every worth-a-call vomit as calm when offline**, while the month shows "seen".
**Trust and Safety:** rows stay unchanged apart from the rose; the state is said once, as a status in the filter sheet and on the record. It keeps rule F and adds nothing to the list.
**Jordan and Engineering:** a neutral, never-rose "not read" mark on each such row, on History and Home. An unread photo is the absence of a check, and offline, calm and unchecked look identical.
*A fact for the ruling:* CUL-552's own acceptance rule says "analysis off" must never render an absence a worried owner could read as "no flags found". Under the Trust and Safety option the row itself is that absence, and the status elsewhere is what answers the rule.
**PM decision needed:** is the unread state said once as a status, or marked on each row? Everyone agrees on the rest: the rose never depends on a network read or on a read's status, and an unknown verdict fails toward rose.

**H-5 · The third pill, and what "a medication's doses" means.**
*Deciding:* how the extra filters (Photographed, With a note, With a read, one drug's doses) combine with the type filter, and what the drug filter counts.
*The problem:* the sheet says "also only", but picking one replaces the type filter, and the "⋯" pill never shows it is on. "With a read · 13" returns twelve rows that look exactly like unread ones. The drug filter matches a display name, which splits one course in two or pools two drugs, and it counts refused doses while the med card counts given ones.
*Options:* **(a, recommended)** the "⋯" pill goes; its choices move onto the type sheet ("With a read" retires; Photographed names the unread); Medication gains one sub-row per course with a dose in the window, keyed by the same course the vet report uses. **(b)** a labelled third pill that truly combines with the type filter, plus a per-course drug filter. **(c)** as (a), but the drug filter is dropped from v1 and stays with CUL-488. **(d)** as drawn.
*Why (a):* one pill always names what is filtering; the header loses a control it cannot fit (BRK-6); the course is the vet report's unit.
*Better than the rule:* (a) reverses the settled "third pill as a fact lens". That ruling protected two things: reaching the fact filters, and never offering a filter on the read's verdict. Both still hold under (a).
*Consequence:* (a) and (b) also need the drug count and its bounds (GAP-26); (c) unblocks the requirements fastest.

### Narrower rulings

**H-6 · Where a free-fed bowl lives.**
Shipped History pins "Always available · food · since date" and draws Started, Stopped and Switched markers, a PM decision from June (free-feeding spec §6a). Round 3 drops both, and rule F ("nothing standing at the top") seems to forbid the pinned line. Without it, a grazing cat reads as one meal a day.
**(a, recommended by the Designer, Sam and Engineering)** one quiet line under the count line while a bowl is down, under All types and Meal only, as shipped. **(b, the Mobile IA)** a quiet line inside each day card that has a bowl down, so nothing stands at the top. **(c)** markers only.
*Consequence:* the markers return under every option, and a free-fed vomit gets no "after eating" line.

**H-7 · Which links into History are frozen (rule 9).**
Rule 9 froze every link into History "byte for byte". Eight places link in; the page lists five, and one of those no longer sends anything. Freezing links inside the app blocks the only client-side fix for Ask's count disagreeing with History's (the app has three definitions of "Last 7 days": History's is 168 hours back, Ask's is seven UTC days, round 3's is seven local days).
**(a, recommended)** freeze only links from outside the app (the widget, saved links); links inside the app may add parameters under the flag; `?date=` is read by sender (heads-up posted on CUL-1073). A registry of every link, derived from the code, fails the build on an unregistered one. **(b)** freeze everything and move Ask's windows to local midnight on the server, which waits behind the deploy hold. **(c)** freeze everything and live with the mismatch.
*Consequence:* (a) unblocks the doorway PR now; CUL-1073 lands first.

**H-8 · Which flag History v2 ships behind (R1-4), and where Home's first paint rides (R2-3).**
**(a, recommended)** its own `history_v2` flag; the first paint on both surfaces, and one shared open-in-place motion (Home moves onto the shared module), ride it, with a flag-off guard on each surface. **(b)** one flag: History rides `design_v2` with Home, so History changes for every Design v2 tester the day it merges. **(c)** History on its own flag while Home's first paint rides `design_v2` and goes live when History's PR merges.
*Why (a):* one switch turns one set of motion on for both surfaces, and History's PR never changes a live surface through a flag it does not own. *Consequence:* the link tests gain a column per flag pair and one for a flag that flips after the screen opens.

**H-9 · What the Noticed filter counts (the daily look).** A genuine conflict.
As drawn, the Noticed filter would count looks (the daily-look spec forbids it; the unit is answered days), print stretches with no look as runs of missed days, and show a count one tap from the Patterns card that withholds it while an intake concern is live.
**The Data Scientist:** no count at all under Noticed. The count line says the answered-day count lives on Patterns; the strip shows dates only. Every History window is one the daily-look spec's floors reject or cannot floor.
**The Designer:** count answered days ("Noticed · 12 days") through the shipped helper, with a floor per window and the withheld state on every count.
**PM decision needed:** under Noticed, does History print an answered-day count, or none? Either way: Noticed goes back on the type sheet (it fell off, BRK-14), every count under it reads the withheld predicate, and a miss is never stated.

**H-10 · Where the year goes.**
No date on the screen carries a year, and All time, the default, is unbounded; the date sheet would list "September" twice on a record older than a year.
**(a, recommended)** dates in the current year stay bare; any date outside it carries its year; a range states the year once; the date sheet groups months under year subheads. **(b)** all or nothing per window (the weight history precedent): once a window reaches back past Jan 1, every date carries its year. **(c)** one year line where the list crosses Jan 1.
*Why (a):* every bare date is then inside the current year, and the week you live in stays quiet. The Designer measured every header, the widest strip label and the count line with a year added at 316pt: all fit, so no layout change. *Consequence:* (b) stamps the default screen for almost every account from Jan 1, 2027. CUL-1126 adopts the same formatter for the rundown, the report and the trial card.

**H-11 · Which day starts "since the last vet visit".** A genuine conflict.
A visit has a date and no time, so a same-day event cannot be placed before or after it.
**The Data Scientist:** start at the midnight after the visit.
**Dr. Chen and Jordan:** include the visit's day, anchored on the latest visit strictly before today. That matches the vet report and the vet-visit spec ("starts from this visit").
**The Designer:** include the visit's day, anchored on the most recent visit even one logged today, matching Home's "since last visit", which resets when a visit is saved.
**PM decision needed:** which visit anchors the window, and does the visit's own day count? Whatever the ruling, History, the rundown and the report share one bound through one function (CUL-1127 fixes the rundown's text comparison), and any difference from Home is written down.

### Team defaults, adopted unless you object

- Under a filter, a strip cell's spoken label gives the filtered count and then the day's total, and the gap line a tap lands on names its dates and what was logged (PMD-13).
- A trial, visit or drug option is absent for a pet that has none (PMD-17).
- The record opens with the platform's standard push from every door, not the mock's rise, and with no animation under Reduce Motion (PMD-14).
- The count line discloses rows the vet report will drop as same-minute duplicates ("· 2 logged twice in the same minute"), with the report's duplicate rule lifted into a shared module (PMD-10).
- Under a window that overlaps a running trial, the count line carries one link to the shipped "Outside the trial diet" screen. It answers Jordan's "anything besides the trial food?" without History making a trial claim of its own (PMD-9).
- Rule B stays as ruled: a different product breaks a run of meals. The Mobile IA asked to relax it for density (a household alternating two foods gets nine rows, about 400pt); Jordan, the Data Scientist and Dr. Chen defended it. The device pass measures the cost.

---

## Four rules the requirements carry (no ruling needed)

**R-1 · One population and one query behind every number; absence only over watched days.** Coverage and the empty cell count every logged event except a look (the month's rule); day totals count what Home's spine counts; a look or a visit is drawn but never counted, and a visit-only day still gets its card. "N days unlogged" appears on every window and under every filter (All time included), a filtered count names the days it fell on and the window's start date, and the line says nothing when the window is fully covered. A window starts no earlier than the pet's first record. A gap line ("no vomit logged") spans only closed, logged days: it splits at an unlogged day, never includes today, never starts before the type's first row or a course's start, and carries dates only. A month with nothing logged reads "nothing logged", never 0. Every count on screen re-derives together after any write, removal, sync or refresh. The five-column check over every number History speaks (Principle 8) is carried as acceptance criteria, each cell naming its test fixture. Noticed follows H-9.
*From:* BRK-1, BRK-2, BRK-3, GAP-5, GAP-18, GAP-24, PMD-10, PMD-13, MFU-10.

**R-2 · A row says the same thing under every filter and every search.** Row facts (the dose's vehicle, the timing line and its meal, run membership, chips, the vehicle's intake) are computed once over the whole local day; a filter or a search only hides rows. Search is one extra condition on the list's own pet-scoped query over named fields; it counts nothing (day headers show the date only), builds no index and saves no history. The note line follows a table by field, and ships only after CUL-848 is ruled and its cue is live where each note is written. The "not saved" row is neutral, never rose, and waits for CUL-944.
*From:* BRK-7, BRK-8, GAP-15, GAP-16, GAP-17, PMD-11.

**R-3 · Import what the app already computes; never rebuild it.** The timing line is Home's shared lane (it returns which meal it measured from). The read is one predicate for History, Home and the month, in which a read's status never silences an escalation. Dose rows use the shipped chip vocabulary, name their drug from the item or else the course, and pair to their meal through the stored link. The trial window, course markers and the visit bound come from the modules the vet report uses. One window table and one table of nouns and ranges, derived exhaustively. Date-only items sit at the top of their day and stay visible under every filter. History opens the shipped record screen unchanged apart from CUL-848's cue, and keeps the shipped Remove confirm.
*From:* GAP-1, BRK-4, GAP-2, GAP-3, GAP-4, GAP-25, BRK-10, BRK-5, BRK-17, BRK-18, PMD-9, GAP-29, BRK-14.

**R-4 · A list that survives paging, a pet switch and Reduce Motion.** Pages are whole local days (this absorbs CUL-1078). A refresh re-reads what is loaded and keeps your place and your open runs. New rows from the FAB or a sync enter at their time inside their day. Every read checks it is still for the pet on screen (CUL-1120). On any pet switch every filter resets and nothing carries a trial or visit date to another pet; a widget's pet and day apply once per tap (CUL-1119). Open in place shows every meal in the run (round 3's "5 meals" opens to 4 because the mock caps the box), with 44pt rows that keep every fact. The landed day and the week pager move on scroll events, never timers. Reduce Motion is known before any motion starts (CUL-1123), every scroll the app makes on its own honours it, and every gesture names where VoiceOver focus goes. The last row clears the FAB (the shipped inset constant). Every acceptance criterion is written in testable terms, and the haptics, visit-reader and symptom-list guards are registered.
*From:* GAP-6, GAP-7, GAP-8, BRK-9, GAP-10, GAP-11, BRK-13, GAP-19, GAP-27, BRK-16, GAP-28, BRK-19, MFU-4.

---

## Sequencing

- **CUL-1073** (History's day link reads a local day) lands first, as PR 0, reading `?date=` by sender per H-7.
- The **note line** ships only after **CUL-848** is ruled and its cue is live at every place a note is written.
- The **"not saved" row** waits for **CUL-944**.
- The **day-level intake mark** (H-2) waits for **CUL-1118**'s ruling on how meals are rated; it keys on a recorded refusal either way.
- **H-4** moves with **CUL-1107** (flag review), **CUL-1111** (hide words only) and **CUL-552** (consent).
- **CUL-1121** (Home folds a refused meal) lands before Design v2 GA and adopts H-1's shared rule.
- **After the rulings, before the spec freezes:** a short mock pass redraws only what the rulings move: the row (H-1), the strip and header marks (H-2), the pinned header and landed state (H-3), the filter sheet (H-5), and the quiet states the page never drew (GAP-5: a new account, today before anything is logged, loading, a failed read, a search with no match, the record's first day). Then the requirements are written against those frames.

## The five carried items

| Item | After the critique | What the requirements must say |
|---|---|---|
| R2-5: one read predicate for History, Home and the month, and what a dismissal hides | sharpened; now blocking the read section | The requirements export one readStateOf(analysisRow, eventTypeAsEdited) from lib/incidentReadState.ts, gated by hasPerIncidentRead on the edited type. History, Home's spine and monthReads all consume it, and a guard asserts that nothing else reads recommendation. Status never silences an escalation (CUL-812), and an unknown verdict fails toward rose. The rose word's spoken label carries the read's date. Whether a calm word shows is a per-surface choice, written down. History's arrival ends in the resting row; Home keeping its sentence is stated as a known difference. The report is out of scope, because it never prints the per-incident verdict (how it treats a flag the owner cleared is CUL-1113). The dismissal rule is H-4a: the team now recommends that hiding hides the words only, and that the flag review's "No" (CUL-1107) is the one act that stands the rose down, on every surface. |
| R2-3: Home's first paint in the same PR, and its flag | sharpened; ruled in H-8 | One thread-draw module lives in components/motion/, built on useOpenInPlace's rail lead. Home's compact row moves onto useOpenInPlace in the same PR, so both surfaces open a run the same way in both motion modes, using the modules' 150ms crossfade under Reduce Motion. Home's identity is (pet, local day at mount). The gating flag is as ruled in H-8; the recommendation is History's own flag, with a flag-off guard on each surface. |
| R1-4 (after CUL-1073): History v2 on its own flag | sharpened; now its own ruling (H-8) | Name the flag. If it is history_v2: a flag-off guard in the vetVisitsFlagOff shape, a doorway column per flag pair, and a 'flag flips after mount' column. CUL-1073 lands first and reads ?date= by sender, never by flag, so the flag-off calendar keeps its UTC day until D2-8; if H-7 rules (a), CUL-1073's description is amended to say so (heads-up posted there). In the same contract the widget's pet parameter becomes a one-shot, like date (BRK-16). |
| R1-5 (CUL-552): the read on the row after the consent gate | now blocking | Capped and read_disabled rows already render as calm, and the cap path writes status completed with no model run. The requirements carry a state table (capped, read_disabled, declined, failed, pending, quarantined, unfetched) saying what each draws. The rose comes from the shared predicate even when a read was declined. 'With a read' counts only rows a model actually read, keyed on whether a model ran rather than on status. History never prompts for consent, and withdrawing consent leaves existing reads in place. The disclosure shape is the PM's ruling in H-4 (Trust and Safety versus Jordan). |
| CUL-848's cue before the note shows on a row | sharpened; it blocks the note line, not the spec | The note line ships only after CUL-848 is ruled and its cue is live at every field that writes the column the row shows (app/log.tsx, SimpleEventConfirm and edit-event for events.notes), in the same release or earlier. Cues are per column. The events.notes cue's Ask clause is tied, by a guard keyed on source, to whether Ask selects notes. Looks keep LOOK_NOTE_CUE_UNNAMED. 'With a note' counts events.notes only; a look's note is reached through the Noticed lens and through search, never counted. The mock's single cue string, drawn on the read-only card, is marked illustrative. Trust and Safety recommends option (b). |

---

## The critique, in the QA-note taxonomy

88 items after merging 145 lens findings and 60 follow-up findings. Every item was checked by an adversarial verifier or by the lens itself against the page's source, the renders and the shipped code; the verification line says which. Items marked **gates the requirements** must be settled (by R-1 to R-4 or by a ruling) before the spec is written; the rest ride the spec or the backlog.

### Broken (19)

_does not do what it claims, or a count or render that is wrong_

#### BRK-1 · The count line's coverage clause breaks C-3 in both directions

*high · **gates the requirements** · lenses: Data, Dr. Chen, Jordan, Sam, Designer · sources: DAT-01, VET-03, JOR-03, SAM-04, DES-04, JORF-2*

- **Where:** §01 count line; completenessLine (mock :937)
- **Evidence:** The unlogged clause is dropped under All time and under every lens. So 'Since the trial started · 13 vomits' and 'All time · 1,091 logged since May 14' both hide Sep 20, a day with nothing logged. The lensed line also drops the days the count fell on and the window's start date. When a window is fully covered, the line prints 'no day unlogged' (August, Today), which C-3 and the month's coverage contract forbid.
- **Counterexample:** Jordan's dog boards for six days mid-trial. On the Vomit lens the line reads '13 vomits' with no denominator, and that is the view the vet asks about. On the real fixture the honest line is 13 times on 11 days, one day unlogged.
- **What the requirements must say:** Adopt the month's coverage contract and its builder. 'N days unlogged' appears on every window, All time included, and under every type and fact lens except Noticed (H-9). Under a lens the line names the count, the days it fell on and the window's start date. When the window is fully covered the line says nothing, and a guard asserts the clause never contains 'no day'. Today counts as unlogged only after it closes.
- **Verification:** CONFIRMED by all five verifiers; JORF-2 (follow-up) self-verified. JOR-03's proposed 'no day unlogged' wording was corrected to silence, per C-3.

#### BRK-2 · Gap lines claim absence over days nobody watched

*high · **gates the requirements** · lenses: Designer, Data, Jordan, Sam, Dr. Chen, Mobile IA · sources: DES-04, DES-05, DAT-03, JOR-02, SAM-04, VET-03, JORF-3, MIAF-6, DESF-7*

- **Where:** gapHtml (mock :899) under type and fact lenses; the date sheet's month rows (:1115)
- **Evidence:** The Vomit lens says 'no vomit logged' for Sep 18 to 20, but nothing at all was logged on Sep 20 and the strip draws it grey. The Itch lens runs Sep 14 to 21, across the unlogged day, the visit and today, which is still open. The Prednisone lens prints 17 days before the course began, Stool prints 18 days for a type never used, and 'With a read' prints 'no read logged'. Over a longer record, a month with nothing logged would print '0' in the sheet's count column.
- **Counterexample:** Sam logs breakfast on Monday, nothing on Tuesday or Wednesday, and breakfast on Thursday. The Vomit lens reports four vomit-free days, and she tells the vet so, though she was watching on only two mornings. On a record with four unlogged winter months, the sheet reads 'January · 0'.
- **What the requirements must say:** A lens gap line spans only closed, logged days strictly between two rows of the lens. It splits at any unlogged day, which keeps its own 'nothing logged' line, and at any date-only marker. It never includes today, and never starts before the type's first row or a course's start. It shows dates, not a day count (C-19). 'With a read' has no gap lines. A lens whose subject this pet cannot have is not offered (PMD-17); if a door reaches one anyway, it renders a designed empty state naming the pet, the lens and the window. A month with nothing logged reads 'nothing logged', never 0. Fixtures include a gap that crosses the Sunday strip-page seam. Noticed follows GAP-23 instead.
- **Verification:** CONFIRMED (DES-04, DES-05, JOR-02, SAM-04); DAT-03 PLAUSIBLE; follow-ups JORF-3, MIAF-6 and DESF-7 self-verified. The Sep 13 'hairball' note is illustrative text, not evidence from Nyx's record.

#### BRK-3 · Looks are counted as logged, and a visit-only day disappears

*high · **gates the requirements** · lenses: Data, Dr. Chen, Sam, Engineering, Designer · sources: DAT-06, VET-12, SAM-08, ENG-08, DAT-14, DATF-06, DATF-12*

- **Where:** Rule C; mock dayCardHtml (total = rows.length), dayCount, listHtml :960; type sheet counts
- **Evidence:** The header total counts every row, so a look counts toward 'N logged' and turns its cell plain. Home's spine, buildCountChips' look arm, the month and daily-look T-5 all exclude looks. A look-only day therefore gets three answers: '1 logged' in the header, a plain cell on the strip, and unlogged on a month-derived count line. Visits and course markers render only inside a card that already has events, so a visit-only day becomes 'nothing logged' with no visit row. 'With a note · 64' would also count look notes.
- **Counterexample:** Jordan answers the evening look every day of a busy week and logs nothing else. The strip goes plain, 'days unlogged' reads 0, and the Vomit lens reports seven vomit-free days whose entire record is seven one-tap looks.
- **What the requirements must say:** Import one population module. Coverage and the hollow cell use monthReads' LOGGED set (every non-deleted event except check_in). Header totals use buildSpine's countable set, so a look is never a count chip and rule C is amended. A look is drawn at its hour and never counted. A look-only day's header uses the shipped lead shape ('Noticed · nothing else logged'), and its cell stays hollow. A day card exists whenever any item exists, and a visit is never counted. A property test checks that the eleven event types' sheet rows add up to All types on every window. Noticed sits outside that partition, under its own divider.
- **Verification:** CONFIRMED by all four; DATF-06 and DATF-12 (follow-up) self-verified. DAT-06's clause on the Noticed lens's own unit is carried in PMD-15.

#### BRK-4 · Rule 7's wording would silence the one escalation CUL-812 protects

*high · **gates the requirements** · lenses: Dr. Chen · sources: VET-02*

- **Where:** §05 rule 7; mock :866
- **Evidence:** Rule 7 says 'a calm or failed read shows nothing'. The shipped escalationSurvivesFailure keeps worth_a_call on a failed row, and the page's own code never reads status. The prose, which the spec will copy, contradicts both.
- **Counterexample:** The owner replaces Sep 4's found-vomit photo, and the re-read fails at the usage cap, leaving status failed with recommendation worth_a_call. Built to rule 7's wording, the fortnight's one flagged vomit goes quiet on History while Home and the month still show it.
- **What the requirements must say:** Rewrite the rule: a calm read, or a failed read that holds no escalation, shows nothing. Status never silences an escalation derived under R2-5's single predicate, and an unknown verdict fails toward rose. Tests: failed with worth_a_call shows the word; failed with monitor shows nothing; an unknown verdict shows rose; an edit that removes the escalation shows nothing.
- **Verification:** CONFIRMED. The fix keeps rule F's derivation from the edited fields and changes only the status clause.

#### BRK-5 · Three definitions of 'Last 7 days', and the Ask doorway lands on a different one

*high · **gates the requirements** · lenses: Engineering, Data · sources: ENG-02, DAT-09*

- **Where:** lib/historyDateFilter.ts:36-45; supabase/functions/ask/tools.ts resolveWindow; mock windowBounds; §06 doorway row
- **Evidence:** Shipped History's 7-day window is now minus 168 hours, Ask's is 7 UTC days, and the page's is 7 local days (37 logged, matching the Sep 15 to 21 headers). Ask's door promises that 'the window's count speaks at the top', so with the flag on a third number appears exactly where the owner compares it with Ask's answer. The Patterns flag-off week is UTC too.
- **Counterexample:** At 3 PM Central on Sep 21, with a vomit at 9 PM on Sep 14: Ask says 4 vomits in the last 7 days, the tap-through line says 3, and shipped History shows a third set.
- **What the requirements must say:** Put one window table in the requirements (R-3), with each option as parsed [start, end) instants on the owner's local clock (C-29, C-40). Ask's door must land on exactly the span Ask counted; the route for that is ruled in H-7. Name the surfaces that may still disagree until D2-8. Add a test that drives resolveTapThrough and History's count over a fixture straddling UTC midnight in a non-UTC zone.
- **Verification:** CONFIRMED. The DAT-09 verifier raised the window half to high.

#### BRK-6 · The header overflows the phone and reflows under a lens

*high · **gates the requirements** · lenses: Mobile IA, Designer · sources: MIA-06, DES-07*

- **Where:** Header, pills and search (mock :189-199, headerHtml); frames p-lens, lens-symptom-visit
- **Evidence:** With a lens on, the pills drop to a second right-aligned row and everything below moves about 34pt. 'All symptoms · 4' plus 'Since the visit' pushes the search button off the right edge. The frames that fit on one row are the ones that leave out ⋯ or search. The round-1 wrapping ladder has only its first rung.
- **Counterexample:** With a pet named 'Biscuit', the Vomit lens and Since the trial, the header takes two rows and the chrome takes 232pt, so the first screen holds only today's card. On a 375pt phone, search is off the screen.
- **What the requirements must say:** Name the header's control set for every state, and never let a frame drop a control to fit. Use one geometry at every label width, with a tested second rung. Add a width fixture at 375pt with a 20-character pet name and the widest lens and window pair. ⋯ and search reach 44pt through asymmetric hitSlop, asserted on the rendered gap (C-5).
- **Verification:** CONFIRMED (MIA-06 high, DES-07 medium). The 'chrome never moves' sentence cited is about animation, so the defect rests on filter invariant 2 and layout stability.

#### BRK-7 · A lens or a search changes what a row says and how meals group

*medium · **gates the requirements** · lenses: Designer, Jordan, Sam, Data · sources: DES-03, JOR-04*

- **Where:** Rule E and rule B; mock buildDay :764-770 (vehicle and timing reference computed over the filtered rows)
- **Evidence:** Under the Prednisone lens the dose reads 'in food' instead of 'in the rabbit meal'. Under the Meal lens, or a search for 'rabbit', the rabbit meal loses 'with Prednisone'. Under the Meal lens, Sep 17 regroups into '7 meals' spanning both vomits, and Sep 5's run re-forms across the 10:22 AM cough.
- **Counterexample:** The vet asks whether the Prednisone went in food. Jordan filters to Prednisone and screenshots 'in food' with no meal named.
- **What the requirements must say:** Compute every row fact once over the whole local day: vehicle, timing and its reference meal, run membership and walls, chips, and the vehicle's intake. A lens or a search then only hides rows, and a run never spans a hidden row. Property test: a row's text is identical under every lens that shows it and under All types.
- **Verification:** CONFIRMED. DES-03 was lowered to medium: no number becomes false, but a fact is lost, and a run no longer means 'nothing between them'.

#### BRK-8 · Search prints counts that are not the record's

*medium · **gates the requirements** · lenses: Mobile IA, Sam, T&S, Jordan, Engineering, Designer · sources: MIA-15, SAM-06, TNS-06, JOR-04, ENG-07, DES-07*

- **Where:** §06 search; mock dayCardHtml :889 (search branch), completenessLine
- **Evidence:** Searching 'hairball' draws 'Thu, Sep 17 · 1 vomit' for a day with two vomits. Searching 'rabbit' draws 'Sep 10 · 1 meal' for a day with six meals. The count line above still reads 'All time · 1,091 logged since May 14' over two rows, although §06 says nothing is counted from search.
- **Counterexample:** At the recheck the owner searches 'hairball' and hands the phone over. The vet reads Sep 17 as a one-vomit day.
- **What the requirements must say:** Under search, a day header shows its date only (or 'N matches') and never counts by kind. The count line names the search or steps aside. A matched row keeps every inline fact from the whole day. Course markers and gap lines are not drawn inside results.
- **Verification:** CONFIRMED by every verifier. This is a deliberate renderer branch, not harness drift.

#### BRK-9 · A watched read's arrival ends in a state the resting row never shows

*medium · **gates the requirements** · lenses: Motion, Designer, Mobile IA, Jordan · sources: MOT-3, DES-12, MIA-14, JOR-07, MOT-2*

- **Where:** §04 Arrive and its specimen; rule 7; CSS .arr2
- **Evidence:** The specimen lands 'Worth a call' in black with the sentence 'One photo can raise a flag; it can't clear one.' The same record at rest shows the rose word alone, which is what rule 7, the round-2 ledger and R2-4 require. A calm resolve leaves an 11px band, and the mock's calm slot drops 16px in one frame. After that, any focus re-read or cell recycle changes the words with no visible reason. Shipped Home keeps the sentence for the whole visit, so the shared hook needs an end-state setting.
- **Counterexample:** Jordan watches Sep 4's read land with its sentence, opens the record and comes back. The row is now a rose word with no sentence: the same record, two looks.
- **What the requirements must say:** History's arrival ends in exactly the resting row: the word in rose ink, no sentence, no leftover rail. A test compares the post-arrival tree with a cold paint of the same record. For a calm read, the pending line fades over leaveMs and the slot then closes on FOLD_LAYOUT, but only while the row is on screen; offscreen it resolves without animation and keeps the scroll offset. The beats import FOLD_MOTION. Home's opposite policy goes into R2-5's scope. Note for the PM: R2-4 was ruled on the premise that the standing sentence had already spoken, and round 3 removed that sentence.
- **Verification:** MOT-3 CONFIRMED at medium (no rail actually renders). DES-12 CONFIRMED. MIA-14 and JOR-07's hole are CSS artifacts, but the requirement stands. MOT-2's challenge to G4 was REFUTED; only its unspecified calm exit survives here.

#### BRK-10 · Date-only rows sit at the foot of a morning-to-night day

*medium · **gates the requirements** · lenses: Dr. Chen · sources: VET-09*

- **Where:** Mock dayCardHtml extras :895-896; lib/historyTimeline.ts:31-39; frame p-days
- **Evidence:** Shipped markers sort at local midnight, which puts them at the foot of a day only in a newest-first stream. Round 3 flips each day to morning-to-night but still draws 'Prednisone started · Sep 21' after the 6:27 PM meal, and the visit after Sep 16's rows.
- **Counterexample:** 'Did the vomiting start before or after the Prednisone?' Sep 21 reads: dose at 1:00 PM, vomit at 4:40 PM, then 'Prednisone started' at the bottom.
- **What the requirements must say:** Every date-only item (visit, course start or owner-recorded end, trial start or end, free-feeding boundary) sits at the top of its day, before every timed row. A test over lib/historyTimeline checks that a course marker comes before that course's first dose on the same day.
- **Verification:** CONFIRMED.

#### BRK-11 · The hollow bead means a look on Home and a visit here, and the visit row swaps its facts for an instruction

*medium · **gates the requirements** · lenses: Designer, Jordan, Data · sources: DES-02, JOR-08, DATF-10*

- **Where:** §03 specimen; mock :496-498, :895; components/recap/nodeTints.ts
- **Evidence:** nodeTints draws a look hollow (CUL-868). The mock draws the look as a filled grey dot identical to Weight's, and gives the hollow bead to the visit. The visit row reads 'Vet visit · opens the visit': it drops the reason and clinic that VisitTimelineRow shows, and it disappears under any lens. Run members carry '›', although rule D says no row announces that it is a door.
- **Counterexample:** The recap spine Jordan saw last night drew the look hollow; History draws the same look filled. On the §03 specimen a reader cannot tell a never-counted look from a counted weight by its node.
- **What the requirements must say:** Keep the look hollow, as shipped: nodeDotColors('look'), through the exhaustive EventTintCategory switch, so a look can never fall into 'other'. The spec states whether hollow means 'not an event' (in which case the visit may share it) or whether the visit takes VisitTimelineRow's glyph. The visit row shows reason and clinic, with the year when it is outside the current year (C-19), never 'opens the visit', and it stays on its day under any lens. Use one door signal across the whole row family.
- **Verification:** CONFIRMED; DATF-10 (follow-up) self-verified. 'Two meanings' was overstated, since both a look and a visit are 'not an event'; the real defect is the look drawn filled.

#### BRK-12 · Row wrapping is unspecified, and the fixture hides real product-name lengths

*medium · **gates the requirements** · lenses: Designer, Jordan, Data, Sam, Engineering · sources: DES-11, JOR-09, DAT-15, SAM-12, ENG-10*

- **Where:** Every meal and dose row; mock productShort :715, productTiny :723; compact range :826-832
- **Evidence:** Every run splits 'Selected / Protein PR' across lines, and format tags are left hanging at line ends. The page hand-shortens names, while the record screen shows 'Instinct · Limited Ingredient Diet Real Rabbit Recipe in Savory Gravy' and shipped foodLabelOf keeps the brand. Sep 14's same-minute pair prints a range from 8:00 PM to 8:00 PM.
- **Counterexample:** With the real Instinct name, a row runs to 3 or 4 lines and the vehicle phrase becomes unreadable.
- **What the requirements must say:** Write a wrapping contract for 320 and 390pt. The time, with its confidence tag, never wraps. Tags and chips stay attached to the word before them. The food name takes one line, truncates with the full name in the accessibility label (C-8), and never breaks inside a product name. A range with equal ends prints one time, via the shared timeRangeLabel. 'One product across wet and dry' comes from a data key, never a ', Wet' regex. The fixture uses the account's longest name, and the vehicle is named by time ('in the 1:00 PM meal').
- **Verification:** CONFIRMED. The treat 'dry' fallback is a harness artifact; the missing noun rule is not, and is carried in PMD-1.

#### BRK-13 · The last row and the end cap always sit under the FAB

*medium · **gates the requirements** · lenses: Mobile IA, Jordan, Designer, Engineering · sources: MIA-04, JOR-17, ENG-10*

- **Where:** Mock .vpbody and .fab; shipped app/(tabs)/history.tsx:739; lib/fabFootprint.ts
- **Evidence:** At full scroll the end cap is cut under the FAB on every list. Shipped History has no bottom inset either. Home imports HOME_V2_SCROLL_INSET from lib/fabFootprint.ts, with a test asserting at least 88pt.
- **Counterexample:** A short 'Vomit · Last 30 days' list ends with its last vomit's time permanently behind the +.
- **What the requirements must say:** History's contentContainerStyle paddingBottom imports HOME_V2_SCROLL_INSET. A test asserts at least FAB_SCROLL_INSET_FLOOR in the populated, empty, search and lensed states, and nothing tappable sits at the last row's right edge. Same question, same constant (C-34).
- **Verification:** CONFIRMED at medium. The Mobile IA re-derived a 56pt floor, which is weaker than the shipped constant.

#### BRK-14 · The type sheet drops Noticed, so the lens cannot be picked again once cleared

*medium · **gates the requirements** · lenses: Data · sources: DATF-01*

- **Where:** §06 type sheet (mock sheetHtml 'type', :1112); components/history/TypeScopeControl.tsx:17-27
- **Evidence:** The sheet maps the shipped TYPE_FILTER_KEYS minus check_in. Patterns' What you noticed still sends ?type=check_in to 'the Noticed lens'. So the lens is reachable only through that door, shows no check mark on the sheet, and cannot be picked again once cleared. §07 settled 'the filters kept and extended'.
- **Counterexample:** An owner lands on Noticed from Patterns, switches to Meal to check a bowl, then wants the looks back. No row offers them; the only way back is through Patterns again.
- **What the requirements must say:** Noticed stays on the type sheet as shipped, in its own group below a divider and outside the All-types partition, with the count rule H-9 rules. A test asserts the sheet offers every key in TYPE_FILTER_KEYS.
- **Verification:** Follow-up finding, self-verified by a probe that set lens=check_in and opened the sheet.

#### BRK-15 · The Noticed lens prints the numbers and the run that Patterns withholds under item 12

*high · **gates the requirements** · lenses: Data · sources: DATF-03*

- **Where:** §06 doorway from Patterns' What you noticed; rule I; WhatYouNoticedCard.tsx:99-116; app/insights/index.tsx:539-547
- **Evidence:** Patterns withholds the answered-day count while an intake fact is live, 'so the number Home refuses is not one tap away', but its card still opens History in the withheld state. Round 3 adds four things to that destination: a pill count, a count line, a date-sheet column, and a strip mark on every answered day. Nothing on the page reads lookWithheld. The lensed list is itself an unbroken run of quiet looks, which floor 12 forbids drawing as a run.
- **Counterexample:** Pixel refused 2 of her last 3 qualifying meals, so lookWithheld holds. Her owner taps 'Nothing unusual' every evening for 9 days. Patterns says her quiet-day counts are not shown; one tap later History shows 'Noticed · 9', nine strip marks and nine 'nothing unusual' rows in a column.
- **What the requirements must say:** Every History surface under Noticed that states or implies an answered-day total, or draws answered days as marks, consumes lookWithheld: one predicate, failing closed until its facts load. H-9 rules whether the lens also folds quiet looks while item 12 holds. File the shipped half as its own issue: today's check_in lens has no item-12 behaviour.
- **Verification:** Follow-up finding, self-verified against the shipped card and route code.

#### BRK-16 · The widget's pet parameter is never consumed, so History reverts later pet switches

*high · **gates the requirements** · lenses: Mobile IA · sources: MIAF-2*

- **Where:** hooks/useWidgetPetLink.ts:18-28; app/(tabs)/history.tsx:117-120, :406-434; widgets/CulpritWidget.tsx:130-144
- **Evidence:** The widget's date parameter is guarded by a ts nonce, but the pet parameter in the same URL is not. useWidgetPetLink re-runs whenever the active pet differs from params.pet, and calls selectPet again. History stays mounted when blurred, so the effect keeps firing. Both test harnesses mock the hook to a no-op, so no test can see this.
- **Counterexample:** The owner taps Mochi's widget cell, then switches to Nyx using the FAB's 'Logging for' chip on History. The effect selects Mochi again, and the next vomit is written to Mochi.
- **What the requirements must say:** In the doorway contract, pet is a one-shot like date: pet and day apply together once per ts nonce, consumed in a ref (C-22). The widget doorway test drives the real hook starting from a different active pet, and asserts that a later in-app switch sticks. File the shipped fix now; otherwise the flag-off guard preserves the bug until GA.
- **Verification:** Follow-up finding, self-verified by code reading; needs a device check.
- **Note:** Filed: CUL-1119.

#### BRK-17 · Anchored windows lose their start date once picked, and one window has up to four names

*high · **gates the requirements** · lenses: Designer · sources: DESF-2, DESF-5, DES-18*

- **Where:** Count line (mock :936), end cap (:968), date sheet (:1116), windowLabelShort (:909), windowLabel (:913); §06 caption
- **Evidence:** The count line adds a date only under All time. So 'Since the trial started · 13 vomits' and 'Since the last visit · 3 vomits' never show their anchor once the sheet closes, and the end cap names the record's start instead of the window's. The pill, count line and sheet call one window 'Since the visit', 'Since the last visit' and 'Since the last vet visit', and shipped surfaces add three more names. 'The visit' on its own is what Home's appointment strip calls the upcoming booking. Templates that use a window name as a noun speak strings like 'outside Since the last visit'. §06 cites the half of C-19 that frees a date, while C-19's formatting rule names since_visit and a stale-active trial as exactly the unsafe year-less windows.
- **Counterexample:** Nyx's last logged visit was Jul 10, 2025; today is Sep 21, 2026. The line reads 'Since the last visit · 58 vomits' and nothing else. That reads as ten weeks when it is sixty-two.
- **What the requirements must say:** The requirements carry a window table with one row per window. Each row gives the full name, a short form made only by dropping words, the sheet row, the count line with its anchor date, an end cap naming the window's first day, and the spoken edge label. 'The visit' on its own is retired. The §06 caption cites both halves of C-19. The nyx-voice pass signs the table.
- **Verification:** Follow-up finding, self-verified by driving the page's render. DES-18 (confirmed, previously omitted) is folded in here and in BRK-18.

#### BRK-18 · There is no noun table, and ranges come in four formats

*medium · **gates the requirements** · lenses: Designer · sources: DESF-8, DESF-10, DES-18*

- **Where:** Day headers under fact lenses, the count line at n = 1, gap lines, strip label, end cap
- **Evidence:** Driving the page's own render produces: '1 doses' on a Prednisone header; '1 match' for All symptoms at n = 1 but '3 symptoms' at n = 3; '3 other'; '1 lethargy'; 'no read logged'; and 'Noticed · 0 doses', because the noun fallback chain ends in 'doses'. Ranges appear as 'Sep 13 – 16' (specimen), 'Sep 13 – Sep 16' (frames), 'Sep 20 – 26' (strip) and 'Sep 4 – 21' (end cap).
- **Counterexample:** The same lens reads 'Today · 1 match' on one day and 'Last 7 days · 3 symptoms' a week later. With a year added, the frames' long range form wraps the gap line at 316pt.
- **What the requirements must say:** A noun table covers every event type and lens: singular, plural, gap form and header word. It is derived through an exhaustive record, so a type added without a row fails the typecheck. One range formatter serves every range, in the specimen's form ('Sep 13 – 16', 'Aug 30 – Sep 5'), with the year added per H-10. The nyx-voice pass signs both.
- **Verification:** Follow-up finding, self-verified by driving the page's render.

#### BRK-19 · Reduce Motion reads as off on every first render

*high · **gates the requirements** · lenses: Motion · sources: MOTF-5*

- **Where:** hooks/useReducedMotion.ts; components/motion/drawInMotion.ts; app/signal/[id].tsx:43, :53; drawInMotion.test.ts:75
- **Evidence:** The hook starts at false and resolves asynchronously, separately in each component. useDrawIn's mount effect runs before the value resolves, seeds its marks and starts the animation, then snaps once the setting arrives. The Signal route computes its animation option on the same always-false first render. The tests pass reducedMotion true on the first render, a state production never produces (C-35).
- **Counterexample:** Reduce Motion is on and the app cold-launches into History. The first paint starts at its seed and then pops; so does a landed day whose cell mounts because of the jump.
- **What the requirements must say:** Reduce Motion is read once and already resolved: either a store filled at app start, or a three-state value that treats unknown as still. It is passed down rather than read per row, and no mount-triggered motion starts while it is unknown. A test resolves isReduceMotionEnabled to true after mount and asserts that no animation started. File the shared hook as its own issue, since it already affects the Signal route and the charts.
- **Verification:** Follow-up finding, self-verified by reading the code; frame counts on a device not measured.
- **Note:** Filed: CUL-1123 (with MFU-9).

### Works but confusing (3)

_works as drawn, but a real owner or vet would misread it_

#### WBC-1 · The strip's marks: rule I names three, the page draws seven, and it is not the month's row it claims to be

*medium · **gates the requirements** · lenses: Designer, Jordan, Mobile IA, Engineering, Data, Dr. Chen · sources: DES-14, JOR-06, MIA-09, ENG-15, DAT-16, VETF-8*

- **Where:** §02; rule I; mock railHtml and rail CSS :341-356
- **Evidence:** Rule I names three marks: hollow, plain and a rose dot. The render draws more: a filled grey tile for nothing logged, a teal underline for logged, a markless white 'quiet' cell under a lens, outlined future cells, and a rose dot for any symptom. The teal bar has 1.64:1 contrast and the grey fill 1.09:1. The month marks vomit episodes and left_some; the strip marks any symptom, so Sep 5 (cough, itch) is rose on History and plain on the month. On a respiratory pet, 52 of 94 days are rose. Under a medication lens, a day whose only dose was refused, missed or partial draws the same plain mark as a given day. The strip's rose and rule C's header kinds are also new transitive consumers of SYMPTOM_TYPES.
- **Counterexample:** At arm's length, Sep 20 (nothing logged) and a logged day with no vomit under the lens look like the same tile. Where the silence falls is the fact the strip exists to show, and it is the one that disappears. Over a ten-day course with three refusals, the lensed strip shows ten identical cells.
- **What the requirements must say:** Add one pure stripMarkOf(dayFacts, lens, window, today) that enumerates every state. The states are: nothing logged, logged, logged with no match, symptom or lensed kind, a concern adherence under a medication lens, left some (if ruled in H-2), today, landed, ahead, outside the window, and not yet loaded. Pin it with a table test and spoken labels. Reuse DayMark's vocabulary. Ahead and outside cells are plain Views, never disabled buttons (C-7). Distinguish each mark by shape, not colour or number, at 3:1 or better, pinned in theme.contrast.test.ts. State the rose predicate per lens. Register the strip's and the header's rose as SYMPTOM_TYPES consumers in the §13a membership walk, with stool_normal's decision stated (C-11). Retire 'hollow' for cells.
- **Verification:** CONFIRMED across all five; VETF-8 (follow-up) self-verified. DAT-16's registration requirement and its evidence on shared ink were restored after being lost in the earlier merge. The grey square matches DayMark, so what's wrong is the word 'hollow', not the shape.

#### WBC-2 · The motion inventory contradicts itself and leaves out its loops

*low · lenses: Designer, Motion · sources: DES-13, MOT-10, MOT-5*

- **Where:** §04 table and rule 8; CSS :264-268, :355-356
- **Evidence:** The strip landing staggers seven cells by 28ms, while the Never row forbids 'a cascade across days'. The breathing tick and SkeletonRows' shimmer loop are both motion outside 'the eight gestures and no others'. The claimed '700ms end to end' actually ends at 840ms on Sep 17.
- **What the requirements must say:** Rule 8 maps each gesture to one of the six: the strip landing is draw-in with the useDrawIn('dots') constants, the swipe is direct manipulation, and removal uses the fold's physics for a removal. The rule names the breathing tick under the carve-out, keyed only on the in-memory chain, picks one form for the wait, and lists inherited motion. Words land in one beat, so the draw finishes within budget at any node count; a test pins this.
- **Verification:** CONFIRMED; all three were lowered to low.

#### WBC-3 · After paging, the strip's label reads like a filter the list ignored

*low · lenses: Jordan · sources: JOR-18*

- **Where:** railHtml winNote; demo-p-lens-backweek.png
- **Evidence:** After pressing ‹, the strip reads 'Sep 13 – 19 · Since the trial' above an unchanged 'Mon, Sep 21 Today'.
- **What the requirements must say:** The week label drops the window's name. The arrows' spoken labels say they move the strip and that you reach a day by tapping it.
- **Verification:** PLAUSIBLE. The render is confirmed; the misread is a comprehension claim.

### Design gaps (30)

_a state, case or rule the proposal does not cover_

#### GAP-1 · The timing line is a third 'how long since she ate', not the shared lane

*high · **gates the requirements** · lenses: Data, Dr. Chen, Jordan, Sam, Engineering · sources: DAT-04, VET-04, JOR-16, SAM-09, ENG-04*

- **Where:** §01 'computed over the whole day'; mock timingRef/timingFor :736-753; lib/spineNode.ts timingsByRow; lib/mealTiming.ts
- **Evidence:** The mock takes the nearest earlier meal and falls back to the previous logged day with a fixed 1440-minute offset. It has no 24-hour lookback, no episode collapse and no free-fed rule, and it puts the band edge at >360. Home runs timingsByRow over classifyEpisodeSet (G9: exactly one implementation). The drawn fortnight happens to agree with Home; the rules do not. The lane also returns minutes but not which feeding it used, so rule B cannot know which meal to keep as its own row.
- **Counterexample:** A witnessed 2 AM vomit on Sep 21 is measured across the unlogged Sep 20 against Sep 19's 8:25 AM meal, and printed '6 h or more after eating'. The lane prints nothing. A free-choice bowl gives '5 min after eating' where the lane returns free_fed.
- **What the requirements must say:** History's timing line is Home's timingsByRow over the lane, lifted into lib/ and shared. It is fed the prior 24 hours of feedings, earlier onsets and free-fed spans regardless of paging (C-35). FeedingInput gains an id and the result returns it, so rule B's reference meal is exact across midnight and for same-minute pairs. Delete 'computed over the whole day'. Add a parity test against Home covering a cross-midnight onset, a free-fed span, a 3-hour bout and a remainder under 5 minutes.
- **Verification:** CONFIRMED (DAT-04 and VET-04 corrected to design gap; JOR-16 raised to medium and gating). Whether a long-band line over an unlogged day shows at all is ruled once, on the lane (Dr. Chen's open F8 question).

#### GAP-2 · The dose row loses Missed and Refused, and tags every unrated dose Unconfirmed

*high · **gates the requirements** · lenses: Dr. Chen, Sam · sources: VET-01, VETF-5*

- **Where:** §03 specimen; mock :848-851, :1100; components/history/EventRow.tsx:253-268
- **Evidence:** The renderer maps only given, partial and null, so missed and refused render no chip. Every null adherence gets a rose Unconfirmed, while shipped code raises it only under isComboDoseInDoubt. Shipped EventRow hides the chip entirely when the drug is unnamed, which applies to about 44 of Nyx's 45 doses. The how_given mapping pairs only in_food; in_treat and in_pill_pocket fall through to 'by mouth'. The mock's record screen prints 'given in food' for every dose, whatever its adherence and route. ⚠ *§V, V-1: no dose in Nyx's record is unnamed (46 of 46 carry a named item); the chip-hiding code fact stands.*
- **Counterexample:** Sam taps Refused when the cat spits out the pill pocket. The v2 row reads 'Prednisone · in a treat' with no chip, among rows that read Given, and the record screen says 'given'.
- **What the requirements must say:** Every dose row carries its read-only adherence chip, named drug or not: Given in the accent colour; Partial, Missed and Refused in rose. 'Unconfirmed' replaces the chip only under isComboDoseInDoubt, and an unrated dose shows nothing. The vehicle word covers every how_given value and says nothing for NULL. The record's dose line reads the stored adherence and route, never a constant. Add fixtures for each state with and without a drug name, including a refused dose (Nyx's fortnight has none, C-35), and fix shipped EventRow's name-gated chip in the same PR.
- **Verification:** CONFIRMED, corrected to design gap because no fixture row is missed or refused; VETF-5 (follow-up) self-verified.
- **Note:** Filed (shipped half): CUL-1124.

#### GAP-3 · Rule E pairs a dose to a meal by minute and drug name, not by the stored pair

*medium · **gates the requirements** · lenses: Dr. Chen, Sam, Engineering, Jordan · sources: VET-08, SAM-11, ENG-04, VETF-6*

- **Where:** Rule E; mock buildDay :768, :844-853; lib/db.ts:483-489 (paired_event_id selected)
- **Evidence:** The mock pairs a dose with the first meal at the same minute, and only when the drug has a name. On Sep 5 the unnamed partial dose reads 'in the rabbit meal' while the rabbit meal says nothing, and that meal could fold into a run. The vehicle's intake never appears on the dose row, so under a Medication lens 'Picked' disappears from the screen, and a 'given' stored before the vehicle was rated cannot be told apart from an explicit one. ⚠ *§V, V-1: Sep 5's dose is named, Cetirizine HCl, Partial.*
- **Counterexample:** Jordan's dog picks at the vehicle on 5 of 14 days. On the Prednisone lens he sees 14 Given chips and tells the vet '14 of 14'.
- **What the requirements must say:** Rule E binds to paired_event_id, paired_dose_count and paired_dose_drug_name. A vehicle meal reads 'with a dose' when the drug is unnamed, and never compacts. When the vehicle meal was not finished, the dose row names its intake inline ('in the rabbit meal · picked at'), in the meal chip's tint, as a record fact that never changes the stored adherence. Tests cover every lens and search, Sep 5, and same-minute meals.
- **Verification:** CONFIRMED; VETF-6 (follow-up) self-verified.

#### GAP-4 · Trial, course and visit anchors are hand-built and vanish under a lens

*medium · **gates the requirements** · lenses: Dr. Chen, Jordan, Engineering · sources: VET-13, VET-14, VET-10, JOR-05*

- **Where:** Mock windowBounds (trial, visit), COURSE_START :678, extras gated on !opts.lens :895-896
- **Evidence:** 'Since the trial started' runs from a stored start date to today, with no end and no status. Course markers are hard-coded, and no shipped surface draws one, so they are new scope, not 'already drawn'. The visit window takes the latest visit, including one dated today, while the report's rung 1 uses the visit strictly before today. Every lens hides the visit and the markers, so the exam-room before-and-after questions lose their anchor.
- **Counterexample:** The trial completes Oct 18 and a chicken challenge starts Oct 19. On Nov 1, 'Since the trial started · 20 vomits' pools both.
- **What the requirements must say:** Take the trial window and label from lib/dietTrial.ts (exposureRange, never range) and the report's ranking; once the trial has ended the label reads 'During the trial' with start and end dates. Take course markers from lib/medicationHistory.ts, with an end marker only from an owner action (H1). Take the visit window from the report's rung-1 function (subject to PMD-8) and register the reader in guards/visitReaders.test.ts. Date-only markers stay visible under every lens as context and are never counted.
- **Verification:** CONFIRMED (VET-13, VET-14, VET-10, JOR-05).

#### GAP-5 · The quiet states the page does not draw

*high · **gates the requirements** · lenses: Designer · sources: DES-06*

- **Where:** §01 (only a full fortnight is drawn); mock listHtml, dayCount, empty branch
- **Evidence:** When nothing is logged yet, today renders as a past-tense gap line with no Today tag, and would merge with an empty yesterday. Home says 'nothing logged yet' in the same case. Several states are undrawn: a new account (days before the first log need DayMark's before-record mark), loading, a failed read (C-12), a search miss (the mock says 'that lens'), the record's first day, and page 2 loading.
- **Counterexample:** Jordan opens History at 7:05 AM, and the top line declares a finished 'nothing logged' about a day that has barely started.
- **What the requirements must say:** The spec lists each state with its copy and its strip behaviour. Today keeps its header and Today tag, reads 'nothing logged yet', and never merges into a gap. A new account uses the shipped first-log empty state. Loading is a skeleton, and a failed read uses the shipped error copy with retry. A search miss names the word searched. The record's first day gets a closing line naming the pet and the date. Page 2 shows a skeleton row while it loads.
- **Verification:** CONFIRMED.

#### GAP-6 · Day cards cannot sit on 50-row offset pages, and sync ticks reset the list

*high · **gates the requirements** · lenses: Engineering, Mobile IA · sources: ENG-01, MIA-10*

- **Where:** app/(tabs)/history.tsx:37, :199-256, :366-399, :436-452; lib/db.ts getTimeline
- **Evidence:** Shipped History reads 50 rows at a time by OFFSET. The day at the page seam gets partial counts, runs and gap lines, and with morning-to-night order page 2 inserts the missing morning above rows already on screen. Focus and every hydration tick reload from offset 0 with replace, cutting a deeply scrolled list back to the first page. A strip tap on an unloaded day has nothing to scroll to. The in-store prepend puts a new row at index 0 and checks only the type filter. getTimeline compares its bounds as text (C-40).
- **Counterexample:** On real per-day counts the 50th row is Sep 13's 11:55 AM itch. Page 1 ends mid-day, and 'Back a week' lands on a half-loaded day.
- **What the requirements must say:** Carry over round 2's PR 1: pages are whole local days on a keyset over (occurred_at, id), with bounds parsed as instants, and only a fully loaded day shows counts. Focus, tick and pull-to-refresh re-read the loaded range and diff by id, keeping scroll position and open runs. FAB and sync inserts go through the day model at their chronological position inside their card, and respect the active lens, fact lens and search. A strip or doorway landing loads through to its day, with a stated cap and a loading state. Re-pressing the tab scrolls to the top and resets the strip. A pure lib/historyDays.ts owns the seam, the gap lines and the end cap, and is asserted over data (C-41).
- **Verification:** CONFIRMED. The Engineer's seam numbers were corrected (the mid-day seam holds on real counts, not on the fixture). ENG-01's clause (d) on insert position was restored after the critic found it dropped.
- **Note:** Existing issue: CUL-1078 (offset pagination drops a row after every Remove; no id tiebreak) is absorbed by day pages.

#### GAP-7 · The motion rules collide with a virtualized list: identity, shared commits, removal and return

*medium · **gates the requirements** · lenses: Engineering, Motion · sources: ENG-06, MOT-4, MOT-7, MOT-8, MOTF-8*

- **Where:** §04 rows 1, 4, 6 and 8; components/motion/drawInMotion.ts; app/event/[id].tsx:540-542; history.tsx focus and tick reloads; mock restoreRow :1197
- **Evidence:** useDrawIn keeps 'drawn' in a per-cell ref, so a recycled card draws again on scroll. 'First day' is undefined, and round 2's 'midnight re-arms it' was silently dropped. LayoutAnimation configures the next commit globally, and History commits data from focus, tick, pull-to-refresh and pagination. reverseLoggedEvent publishes nothing, so a local removal and a remote delete look identical to a re-read. 'Put it back' replays the whole day's draw: a ninth gesture, on an identity that did not change.
- **Counterexample:** Scroll past windowSize and back, and Sep 21's thread draws again. A partner's synced log lands while Jordan opens '7 meals', and every row on screen springs for 370ms. After Undo, four rows he never touched blank out and draw back in.
- **What the requirements must say:** Keep the drawn-set above the cells, keyed on (identity, dayKey), where identity is (pet, mount). A lens or window change is answered by the strip landing alone. Add one commit gate: data commits wait while a gesture is in flight, and a gesture requested during a pending commit snaps. A return re-read applies without motion. The shared reversal publishes a one-shot removed(id), consumed from a ref. The row is held until its fold ends, and every count steps once together. A day that loses its last row snaps to its quiet line; remote deletes and arriving rows snap. An Undo animates only the restored row, as the reverse of its leaving. Two arrivals in one commit window queue or snap, as the rule states.
- **Verification:** CONFIRMED (ENG-06 lowered to a medium design gap; MOT-4, MOT-7 and MOT-8 confirmed; MOTF-8 self-verified).

#### GAP-8 · Open in place clips runs, and the opened members lose facts

*medium · **gates the requirements** · lenses: Motion, Mobile IA, Designer, Sam, Jordan, Engineering · sources: MOT-1, MIA-01, DES-10, SAM-10, SAM-07, JOR-07, ENG-10*

- **Where:** §04 Open in place; mock CSS .dd.in .dbox max-height 160px (:296), member template :832
- **Evidence:** '5 meals' opens to 4 and '9 meals' opens to 4, because the page caps the box at 160px. Members wrap their times and drop the rating chip a single row shows, so All, unrated and Most look identical. Home's shipped members are uncapped, 44pt tall, and carry a chevron.
- **Counterexample:** Sam opens '9 meals' to find the evening meal before a 2 AM vomit. It sits below a clip the box never reveals.
- **What the requirements must say:** An opened run lays out every member at its measured height through useOpenInPlace (the rail leads, the box follows, the rows land), with no cap and no inner scroll. A test asserts that the rendered member count equals the line's count at 2, 5, 9 and 12. Members use the shared member geometry (time inline and never wrapped, 44pt, type no larger than the parent) and carry every fact a single row carries, including the rating chip; unrated shows nothing. Opening never scrolls the list. A run taller than the record region gets a close control at its foot or a pinned parent. On iOS, the device pass records the 9-meal spring settle. Whether members carry chevrons is decided with PMD-1.
- **Verification:** MOCK_ARTIFACT for the clip and the wraps (page CSS), but the requirement stands. SAM-07's 'not rated' disclosure on the line was dropped as a new rule.

#### GAP-9 · Rows are 33pt doors, so every density claim on the page is measured below the 44pt floor

*medium · **gates the requirements** · lenses: Mobile IA · sources: MIA-02*

- **Where:** Mock .node1 padding (:248); components/recap/DaySpine.tsx:253-262
- **Evidence:** Single-line rows sit 33pt apart, stacked flush. Home's SpineRowFrame pins 44pt. At 44pt the first screen still holds today, Sep 20 and Sep 19, but dense days of single-line rows grow by about 55pt.
- **What the requirements must say:** History rows render through the shared frame at 44pt with no hitSlop. Every fold claim in the spec is measured at that geometry on Sep 17, Sep 5, a 20-event day and a zero-log day.
- **Verification:** MOCK_ARTIFACT (the mock's CSS padding); the requirement stands.

#### GAP-10 · The landed day and the week pager decide on timers

*medium · **gates the requirements** · lenses: Motion, Engineering · sources: MOT-6, MOT-9, ENG-15, MOTF-3*

- **Where:** §02 'Back a week'; §04 The landed day and The strip, swiped; mock rail click handler, syncRail :1063-1068, userScrollUntil
- **Evidence:** The landed day draws on a fixed 260ms timer while the list is still scrolling, redraws a day already in view, and has no behaviour for a tap that lands on a gap line. A drag held past 1.2s is put back where it started. A pager inside the list header remounts on every tick unless its state lives above the list. The mock's arrow never slides even with motion on: syncRail cancels the smooth scroll in the same task, so the page jumps. §01's caption says paging replays the landing; §04 and the script say it does not.
- **Counterexample:** Sam drags the strip slowly with one thumb while holding the cat, and she is returned to the week she left.
- **What the requirements must say:** The landing draws when the programmatic scroll's settle event fires (with a bounded fallback), and only if the day was offscreen. Jumps longer than about one viewport use animated:false. A gap-line target only moves focus. The landing's identity is (day, tap). Paging is native (pagingEnabled, or snapToInterval with disableIntervalMomentum). The page index comes from the scroll's end event; a reset snaps via initialScrollIndex plus getItemLayout; and the index is held above the list. An arrow press is one programmatic page that settles like the swipe. The mock is not the reference for the arrow's motion. A cell whose count has not answered is never drawn as a mark. Strike 'cells land again'.
- **Verification:** MOT-6 MOCK_ARTIFACT, with its gaps kept; MOT-9 CONFIRMED; MOTF-3 (follow-up) self-verified by sampling scrollLeft per frame.

#### GAP-11 · VoiceOver passes about 24 stops before the first row, reads non-controls as dimmed buttons, and has no focus destinations

*medium · **gates the requirements** · lenses: Mobile IA, Motion, T&S · sources: MIA-08, MOT-12, TNS-10*

- **Where:** Mock rail :1051-1057; §04 gestures; rule G
- **Evidence:** Future and out-of-window cells are disabled buttons, which VoiceOver reads as 'dimmed' (C-7). The weekday letters are not hidden. One spoken label says 'a symptom' for 2 vomits and a cough. No gesture names where focus goes, and the Patterns month's open in place re-parents rows (the CUL-830 class). A note truncated with numberOfLines is still spoken in full.
- **Counterexample:** A VoiceOver owner taps Sep 17. Focus stays on the offscreen cell, and the next swipe reads the strip.
- **What the requirements must say:** Cells are DayMark without the count. Ahead and not-loaded days are plain accessible Views, the weekday row is hidden, and each cell speaks the words of the header it lands on. Each gesture names its focus destination: after a landing, the landed header once the scroll settles; after a removal, the day header, announcing its new count. Never set pointerEvents none over a draw, and open in place never changes the members' host type. The note is cut in the string, so what is shown and what is spoken match; confirm with T&S. A test counts the stops before the first row.
- **Verification:** CONFIRMED (MIA-08, MOT-12). TNS-10 PLAUSIBLE: an accessibility-parity trade-off for the accessibility review to confirm.

#### GAP-12 · Large text breaks the one-line promises and the fixed time column

*medium · **gates the requirements** · lenses: Mobile IA, Engineering · sources: MIA-16, ENG-11*

- **Where:** Rules C, G and I; components/recap/DaySpine.tsx:48, :166; NyxTabBar.tsx:193
- **Evidence:** Nothing sets maxFontSizeMultiplier except the tab bar. SpineRowFrame's time column is fixed at 56pt with numberOfLines 1, so it truncates at large text. Notes are cut to a 44-character budget, and the seven strip cells get about 40pt each.
- **Counterexample:** On an iPhone SE at AX5, the note wraps to three lines, the header date needs about 330pt, and the strip's '21' clips.
- **What the requirements must say:** Give each element a font-scale policy. Strip cells are capped, and their spoken labels carry the facts. The header date's behaviour above a named scale is stated. A row's time never truncates: either the column wraps or the time stacks under the title, and this lands on Home too if H-1 picks the left column. Notes are cut by a measured word-boundary helper. Fixture: a 10-event day at AX5 on 320pt.
- **Verification:** MIA-16 MOCK_ARTIFACT (the probe scaled font size only), with the requirement kept; ENG-11 CONFIRMED.

#### GAP-13 · The only clinical word on a row depends on a network read

*high · **gates the requirements** · lenses: Engineering, T&S · sources: ENG-05*

- **Where:** lib/spineReads.ts:99-118; lib/monthReads.ts:206-251; rule 7 and rule F
- **Evidence:** event_ai_analysis is never mirrored locally. Home and the month read it from the server and return an empty answer on failure. Under rose-only, empty is the calm state, so offline a worth-a-call vomit looks calm on History while the month draws 'seen'. 'With a read' and its count cannot be a local query. Round 2's offline disclosure was dropped from round 3.
- **Counterexample:** In a clinic waiting room with no signal, Sep 4's worth-a-call vomit and Sep 7's calm one render identically.
- **What the requirements must say:** R2-5's single predicate also covers transport. There is one batched, chunked read per loaded day page, covering every symptom row. An 'unfetched' state that is not the calm state is added, and its form is ruled with the unread disclosure (H-4). The arrival trigger is Home's working fact (C-30). 'With a read' exists only when the read answered for the whole window. The alternative is a local mirror, shipped as its own schema PR with LOCAL_WIPE_TABLES, RLS and a T&S review.
- **Verification:** CONFIRMED. The T&S lens's claim that a failed read never looks benign held for the month but not for History.

#### GAP-14 · Doorway landings are undefined, and the flag flips after mount

*medium · **gates the requirements** · lenses: Mobile IA, Engineering, Motion · sources: MIA-11, ENG-14, MOTF-9*

- **Where:** §06 doorway table; app/(tabs)/history.tsx:121-131, :403-434; hooks/useDesignV2.ts; PatternCalendar.tsx:256
- **Evidence:** Shipped ?date= filters the list to one day. The page's doorway row says 'the landed day draws in', which describes an anchor in the full list, and it never says which applies. useDesignV2 fails closed until hydration, so a cold start mounts flag-off, consumes the widget's ts nonce, and then flips to flag-on. A doorway into an unmeasured day cannot be reached in one move: scrollToIndex without getItemLayout fails, and the estimate-then-retry workaround jumps twice. The first paint and the landed day's draw also both claim the arrival.
- **Counterexample:** Tap Sep 7 on the Patterns calendar. Flag-off shows only Sep 7; flag-on shows the whole record scrolled to Sep 7, and a small scroll puts the owner in Sep 6 without asking. Under Reduce Motion, a drill into May 20 lands on May 26 for a frame and then jumps.
- **What the requirements must say:** Each door states whether it filters or anchors, and states its landing: position against the fold, pill label, strip page, count line. The list is positioned before the first frame (initialScrollIndex with a day-level getItemLayout), and on a doorway arrival only the landed day draws. The per-door test asserts the landing in each flag state and in a 'flag flips after mount' column. The v2 screen seeds from the params on its own mount and applies an unconsumed ts itself, or the tab holds its first paint until every History flag has hydrated.
- **Verification:** CONFIRMED; MOTF-9 (follow-up) self-verified.

#### GAP-15 · Search has no stated scope

*medium · **gates the requirements** · lenses: T&S, Engineering, Designer · sources: TNS-04, ENG-17*

- **Where:** §06 search; mock matchesSearch :814-819
- **Evidence:** 'A local, case-insensitive match' is safe only if it is one extra predicate on the list's pet-scoped, deleted_at-filtered query, and nothing says so. The searched columns are not named, and the mock includes the type label. SQLite LIKE folds case for ASCII only. The strip's marks ignore the query.
- **Counterexample:** If search is built as its own query or on an FTS index, a removed 'hairball' note or another pet's note comes back. If saved searches live outside wipeLocalSession, the prior owner's term shows up on a shared iPad.
- **What the requirements must say:** Search is one extra predicate on the list's own query: the pet in the header, surviving rows only, looks joined to events. Name the columns: food brand and product, medication name, events.notes, and looks.notes (per GAP-16). Fold case and diacritics in JS. Build no index, save no history, and never log the search term. Results page on the day keyset. State whether the strip hides or marks matching days. Fixtures: a removed note, another pet's note, an undone look.
- **Verification:** CONFIRMED (TNS-04 lowered to medium). ENG-17's claim that results lose their timing line was refuted.

#### GAP-16 · 'The note' is several columns with different destinations, and rule 2's wording contradicts the page

*medium · **gates the requirements** · lenses: T&S, Data · sources: TNS-02, TNS-03, DATF-13*

- **Where:** §03 specimen; §05 rule 2; record cue (mock :1101); fact-lens sheet
- **Evidence:** The specimen draws events.notes and looks.notes in one style. events.notes prints on the report with no toggle and reaches Ask; looks.notes prints only under 'Include your Noticed notes' and never reaches a model. Rule 2 says 'never on a shared render' and 'never counted', while the page's record cue offers an opt-in and its fact lens counts 'With a note · 64'. A predicate on events.notes drops a noted look from 'With a note' while the row visibly carries a note; a predicate on either column counts a look.
- **Counterexample:** A build renders vet_visits.notes on the visit row: free text about the clinic, with no cue at the field where it was written. Rule 2 does not forbid it.
- **What the requirements must say:** Write a table by row kind. Event rows read events.notes; Noticed rows read looks.notes, joined through events; visit rows and markers show no note in v2. For each column, name the cue at its write field, its report sink and toggle, and whether Ask reads it. A column without a ruled cue never appears on a row. Restate rule 2 with defined terms: a shared render is anything reachable without the owner's session, and 'never counted' means note text never feeds a number or a model. 'With a note' counts events.notes only and says so on its sheet row; a look's note is reached through the Noticed lens and search, never counted (unless the PM approves a Tier-2 clarification of T-22). Route the table through the rls-privacy-reviewer.
- **Verification:** CONFIRMED; DATF-13 (follow-up) self-verified. TNS-02's rename counterexample was refuted: the toggle already reads 'Include your Noticed notes'.

#### GAP-17 · The not-saved row has no predicate, no working re-save, and wears the worth-a-call rose

*medium · **gates the requirements** · lenses: Engineering, Designer, Mobile IA, Jordan, T&S · sources: ENG-13, DES-16, MIA-17, JOR-15, TNS-08*

- **Where:** §03 specimen; rule 6; mock :878 (class nv call); lib/syncQueue.ts:375-431
- **Evidence:** The line 'Not saved to your records · Save again ›' uses the same rose class as 'Worth a call', on a vomit row, and adds a second tap target inside a row that is already a door. Quarantine is tracked per queue table, getTimeline selects no sync column, and a terminal 23514 error re-quarantines on every re-save. The wording differs from SyncBanner and never says the row exists only on this phone.
- **Counterexample:** A vomit that failed to sync shows a bold rose line under it, and Jordan phones the vet about a network error.
- **What the requirements must say:** Define 'not in the record' as the event's quarantine OR the quarantine of any child queue the row renders. The sync line uses a neutral register, never rose, in the banner's words. The record screen says the entry is only on this phone and not on the vet report yet. A transient failure re-saves through the shipped edit re-queue (C-23, C-39). A terminal failure opens the record, and never offers a re-save that cannot work. Any in-row control gets C-5 geometry, proven with owningTouchable. Copy never reads sync_error. Sequence this behind CUL-944.
- **Verification:** CONFIRMED. 'No re-save path today' was overstated: the banner's open-and-save route works; what's missing is a marker on the row.
- **Note:** Sequenced behind CUL-944.

#### GAP-18 · After a removal, only the day header recounts

*medium · **gates the requirements** · lenses: Data, T&S, Engineering, Motion · sources: DAT-17, TNS-09, ENG-07, MOT-7*

- **Where:** §04 The row leaving; demo-p-days-remove-after.png
- **Evidence:** After 'Remove the 6:27 PM meal', the header reads 4 while the count line stays at 1,091. §04's row-leaving rule names only the header. The page's per-day fixture also holds 8 rows for Sep 21 where the drawn rows hold 5.
- **What the requirements must say:** Every count drawn over the query (header, count line, pill, sheets, strip mark and label) re-derives together from one snapshot after any write, removal, Undo, sync or hydration. A pure-model test removes a row and asserts that each count steps once.
- **Verification:** DAT-17 CONFIRMED at medium. TNS-09 and the count-line half of ENG-07 are harness artifacts (a static fixture); the requirement stands.

#### GAP-19 · Acceptance criteria are ambiguous, and required guards and fixtures are missing

*medium · **gates the requirements** · lenses: Engineering, Data · sources: ENG-18, DAT-16*

- **Where:** Rule 5 'closed days'; §04 'every visible day', 'tapping twice draws once'; the count line's unlogged count; guards/
- **Evidence:** 'Closed day', 'every visible day' and 'tapping twice draws once' are undefined on this page, and the unlogged count treats today as unlogged before its first log. New History v2 render files that paint a worth_a_call need an ALWAYS_SCANNED haptics entry (C-16). The since-visit reader must be registered in guards/visitReaders.test.ts. The strip's rose and the header's kinds must be named in the §13a symptom-list walk (C-11).
- **What the requirements must say:** Define each criterion in testable terms: a closed day is a local day whose rows are all loaded; 'visible' means mounted in the first render batch; identity is as in GAP-7; today is excluded from the unlogged count until midnight. Register the haptics, visit-reader and symptom-list guards, and prove each by mutation. Add fixtures: a mid-day page seam from real counts, DST spring-forward timing, UTC+14 and +12:45, look-only and visit-only days, a free-fed pet, Sep 5's unnamed dose, same-minute meals, a quarantined child row, a remote delete while the record is open, the flag flip, AX5 at 320pt, and a second pet added three days ago.
- **Verification:** CONFIRMED. The page's UTC+14 date shift is a harness artifact. DAT-16's C-11 registration was restored after being lost in the earlier merge.

#### GAP-20 · Under Today, the strip spends about 105pt on one live cell

*low · lenses: Mobile IA · sources: MIA-12*

- **Where:** §02; mock railPages :1022-1029
- **Evidence:** The strip takes 102 to 112pt. Under Today it shows one tappable cell, two disabled arrows and five 'ahead' cells.
- **What the requirements must say:** History uses lib/chartModels.ts weekStartIndex (the house week starts on Sunday). The spec states what the strip does for windows of a week or less: collapse, or stay visible but inert and say why.
- **Verification:** CONFIRMED. The lens's locale-driven week was rejected because it would fork the strip from the month.

#### GAP-21 · Rule 1 does not state its privacy reason

*low · lenses: T&S · sources: TNS-12*

- **Where:** §05 rule 1
- **Evidence:** Rule 1 gives only the design reason. It also means no list surface mints a signed URL or reads Storage, and a pasted signed URL outlives its token (C-31).
- **What the requirements must say:** Rule 1 states both reasons. Any change to it is a Storage and signed-URL change that goes through the rls-privacy-reviewer.
- **Verification:** CONFIRMED.

#### GAP-22 · The arrival's live subscription needs a scope rule

*low · lenses: T&S · sources: TNS-11*

- **Where:** §04 Arrive; lib/analysis.ts:233-296
- **Evidence:** watchAnalysisRow watches one event, is RLS-scoped, and is torn down when it resolves. A list could instead hold a pet-wide channel, and nothing in the app removes all channels on sign-out.
- **What the requirements must say:** History reuses watchAnalysisRow for each pending row on screen and never opens a pet-wide or table-wide channel. The batch verdict read reuses the shipped reader.
- **Verification:** PLAUSIBLE.

#### GAP-23 · Under Noticed, the coverage and gap-line rules would state misses and count looks

*high · **gates the requirements** · lenses: Data, Designer · sources: DATF-04, DATF-09, DATF-12, DESF-3*

- **Where:** gapHtml (:899-906), completenessLine (:937), dayCardHtml under a type lens, type sheet counts (:1111)
- **Evidence:** Under Noticed the gap line would read 'no Noticed logged · Sep 13 – 16 · 4 days' (the probe rendered 'no undefined logged'). That states a miss and counts it as consecutive days, while daily-look §3.3 and §7 say un-answered days are implied, never stated. A look is answered, not logged. A header would read '3 Noticed' for three looks on one day, which reads as three episodes. A type-sheet row count over the shipped key array would count looks and break BRK-3's partition test.
- **Counterexample:** An owner who answers only on Sundays sees the lens alternate one card with 'no Noticed logged · Sep 14 – 19 · 6 days', a ledger of misses. A four-day gap while the cat was hospitalised reads as the owner's failure.
- **What the requirements must say:** Carve Noticed out of R-1's unlogged clause and BRK-2's gap-line rule: a stretch with no look is a divider carrying only its dates, with no verb and no day count. Under Noticed the day header carries the date only. BRK-3's partition covers the eleven event types, and All symptoms never includes a look. Tests pin that no Noticed divider, header or count line holds a day count or a miss verb.
- **Verification:** Follow-up findings, self-verified by a probe that injected look rows into the page's fixture.

#### GAP-24 · Windows are not clipped to where the record starts

*high · **gates the requirements** · lenses: Mobile IA, Data, Designer · sources: MIAF-5, DATF-07, DESF-6*

- **Where:** windowBounds (:989-995), completenessLine (:931-939), end cap (:968), railPages floor (:1022-1031), month rows (:1116)
- **Evidence:** Rolling windows run back a fixed span whatever the pet's record start, so the unlogged count and the hollow cells count days before the pet was added; the fixture clips only where Nyx needed it. Under Noticed, the 'since' date, the end cap and the strip reach back to May 14, although looks began in September. The record's first month is named and counted beside full months.
- **Counterexample:** Mochi is added Sep 15, with rows on 6 of her 7 days. Under Last 30 days the line reads '24 days unlogged', 23 of them before Mochi was in the app, and the strip shows four weeks of hollow cells. Nyx's May row reads 11 vomits in 18 days beside June's 12 in 30: two flat months, when May was half again as dense.
- **What the requirements must say:** A window's lower bound is the later of its start and the pet's record start, using one definition, the one the end cap prints. Under Noticed it is the pet's first look. The count line, strip, gap lines and end cap all clip. A partial first month names its range ('May 14 – 31, 2025 · 11 vomits'). Add a second pet added three days ago to the first fixtures.
- **Verification:** Follow-up findings, self-verified from the page source.

#### GAP-25 · History cannot name a regimen's doses

*high · **gates the requirements** · lenses: Dr. Chen · sources: VETF-2*

- **Where:** lib/db.ts:474-506; lib/dayEvents.ts:150; lib/medicationDose.ts:27-39; §03, rule K
- **Evidence:** The timeline query names a dose only through the medication_items cache and never joins medications. So a dose logged against a free-text regimen (item NULL, medication_id set) renders as 'Medication' even though its course has a name. On the page's counts only 1 of 45 doses carries a name, and the per-day counts show a twice-daily run in July shaped like a scheduled course. ⚠ *§V, V-1 and V-2: all 46 doses carry a named item; the July twice-daily run is Motozol. The code gap stands for a regimen dose with no item.*
- **Counterexample:** Metronidazole entered as a free-text regimen, twice daily for 13 days: History shows 26 'Medication' rows, while the vet report prints 'Metronidazole · 26 doses'.
- **What the requirements must say:** Add a dose rule beside rule K: every dose names its drug where the record can, from the item, otherwise from the linked regimen's drug_name, otherwise 'Medication · no medicine named'. The History read joins the regimen. Before writing the counts, query how many of the 44 unnamed doses carry a medication_id. ⚠ *§V, V-1: the query is answered; none of the doses is unnamed.*
- **Verification:** Follow-up finding, self-verified against the shipped query.
- **Note:** Filed (shipped half): CUL-1124.

#### GAP-26 · The per-drug lens has no count predicate, no course bounds, and hides unnamed doses

*high · **gates the requirements** · lenses: Dr. Chen, Mobile IA · sources: VETF-3, VETF-4, VETF-7, MIAF-6*

- **Where:** Mock matchesLens (:811), winCount (:928), completenessLine (:933); pred-lens renders
- **Evidence:** The lens counts matching rows, including refused and missed doses, while every course surface speaks dosesTowardTarget (given plus partial). One number is called 'Prednisone doses', 'match' and '1 doses'. Under the lens, a 17-day 'no Prednisone logged' line runs across days before the course began and across an unnamed partial dose on Sep 5. The course's start marker disappears, and nothing discloses the 44 unnamed doses.
- **Counterexample:** A course with 14 doses logged (12 given, 1 partial, 1 refused): the lens says 14, the med card 'Dose 13 of 28' and the report 13. With some doses logged unnamed, the lens shows gap lines on days the pet was dosed.
- **What the requirements must say:** If the lens stays (H-5): its count is totalTally worded 'logged', naming any subset not given in the owner's words ('14 logged · 1 refused'), and never a re-derived delivered count. It is bounded by its course: from the regimen start, or the first dose logged, to an owner-recorded end or the last dose logged. It draws the start marker and prints no gap line outside the course. An unnamed dose is never attributed, never absorbed and never spanned by a gap line; the count line discloses it as a door ('· 1 dose with no medicine named').
- **Verification:** Follow-up findings, self-verified by driving the page.

#### GAP-27 · No scope rule for a pet change

*high · **gates the requirements** · lenses: Mobile IA · sources: MIAF-1, MIAF-3, MIAF-7*

- **Where:** app/(tabs)/history.tsx:173-176, :366-383; docs/nyx-filter-ux-requirements.md:32 rule 6; mock sheetHtml (:1116, :1120), railIndex (:1032), run id (:827)
- **Evidence:** Shipped History keeps its filters across a pet switch, against filter rule 6 ('resets on remount/pet switch'). v2 adds scopes tied to one pet (the trial, the last visit, months back to the record start, a drug lens, search, the strip page, open runs), and the pill drops the anchor date, so a carried scope cannot say whose anchor it holds. A naively wired reset clears a widget doorway's day, and a remount keyed on the pet re-reads stale params. The strip page and run ids are keyed by index and by day plus time.
- **Counterexample:** Nyx is on Vomit · Since the trial (Jul 26). The owner switches to Mochi, who has no trial: the header reads 'Mochi · Vomit · Since the trial', counting Mochi's vomits from Nyx's trial date. Both pets are fed at 7:00 AM on Sep 18, so Nyx's open run opens Mochi's.
- **What the requirements must say:** On any pet change, every scope returns to its default (All types, no fact lens, All time, search closed, the strip on this week, runs closed, sheets dismissed), and nothing re-anchors. The screen shell above the per-pet key consumes a doorway once per ts, pet first. The reset skips the change that doorway caused, and the remount never reads route params. The strip page is keyed by week start, and a run by (pet id, first row id). One test switches pets under every non-default scope.
- **Verification:** Follow-up findings, self-verified by code reading.

#### GAP-28 · Reduce Motion has no rule for History's programmatic moves, and open in place has three reduced forms

*high · **gates the requirements** · lenses: Motion · sources: MOTF-1, MOTF-4, MOTF-7*

- **Where:** §04 and rule 8; mock :164, :383-389, :1152, :1170, :1173; components/motion/openInPlaceMotion.ts, arrivalMotion.ts; SpineNodeRow.tsx:277-283; app/_layout.tsx:313
- **Evidence:** Rule 8's 'a static frame under reduced motion' is a rule about content; it says nothing about where the viewport goes. The mock's code snaps the landed-day scroll under Reduce Motion (measured), but the prose never says so. The doorway landing, tab re-press, lens reset and VoiceOver paging have no rule, and shipped History has no programmatic scroll at all. The house has three reduced forms for open in place: the mock snaps, the shipped modules keep geometry instant and fade rows over 150ms, and Home's compact row just pops. event/[id] has no reduced option.
- **Counterexample:** An owner with a vestibular disorder steps the strip back two weeks and taps Sep 4. A build written from §04's words alone smooth-scrolls across seven viewports.
- **What the requirements must say:** Add a table of every programmatic movement and its reduced form. Viewport moves (landed-day scroll, doorway landing, arrow and accessibility paging, tab re-press) pass animated: !reducedMotion, and false beyond one viewport. The lens or window reset is animated:false in both modes. The owner's own drag is never altered. Content already on screen that draws uses the static frame. Content entering in place gets instant geometry and a 150ms fade (useOpenInPlace, useNodeArrival). Content leaving uses the module's own close, otherwise it goes at once. The record route is 'none'. One test per move asserts the call, driven with Reduce Motion resolved to true.
- **Verification:** Follow-up findings, self-verified by measuring the page in both modes and reading the modules.

#### GAP-29 · The mock's record screen and two never-rendered demo states cannot serve as evidence for the route or the removal

*medium · **gates the requirements** · lenses: Jordan, Motion · sources: CRITIC-COVERAGE, JOR-missed-9*

- **Where:** demo-p-days-route-open.png and -route-after.png; demo-p-days-remove-mid.png and -remove-after.png; mock recordHtml, removeRow
- **Evidence:** Two demo pairs are byte-identical, so the Back state and the mid-fold were never rendered. The route rule ('the list never re-renders under it', scroll kept on return) and the removal fold rest on code reading alone. The only record screen drawn shows the 1:00 PM rabbit meal with neither 'Picked' nor 'with Prednisone', fewer facts than the row that opened it. Its Remove calls removeRow with no confirm. Five frames were cited by no finding.
- **What the requirements must say:** The requirements state that History opens the shipped /event/[id], which carries IntakeChipRow and the paired links, with only CUL-848's cue added, and that Remove keeps the shipped confirm (C-21). Scroll keeping on the route and the removal fold are proven in the device pass, not taken from the page.
- **Verification:** Raised by the completeness critic; self-verified by md5 of the demo pairs.

#### GAP-30 · A look's day has two keys

*low · lenses: Data · sources: DATF-08*

- **Where:** §05 rule 4; daily-look T-19
- **Evidence:** Looks store local_day at write in the device's zone, and T-19 binds every look count to it. History groups rows by local midnight of occurred_at in the viewing zone.
- **Counterexample:** A look at 11:30 PM Central on Sep 20, viewed in Eastern, sits on Sep 21's card while any mark keyed on local_day marks Sep 20.
- **What the requirements must say:** Any count or mark over looks keys on looks.local_day; row placement follows rule 4. This gates only if H-9 rules a count or a mark under Noticed.
- **Verification:** Follow-up finding, self-verified.

### Missing follow-up (10)

_something that must be filed or sequenced elsewhere_

#### MFU-1 · A refused feeding counts as eating in the shared timing lane

*medium · lenses: Data, Dr. Chen, Sam · sources: DAT-12, VET-17, SAM-09*

- **Where:** lib/mealTiming.ts timedEligibleFeedings; lib/spineReads.ts and lib/patternsTiming.ts feeding reads
- **Evidence:** The lane keeps any feeding with a trustworthy time, and the feeding reads select no intake_rating. So Home, the Patterns lane, detector 5 and History all print 'after eating' off a refused bowl.
- **Counterexample:** Pixel refuses the 10 PM bowl and brings up foam at 10:05. Every surface prints '5 min after eating', which fits detector 5's eating-too-fast pattern, for a cat that last ate 14 hours earlier.
- **What the requirements must say:** File against lib/mealTiming, with a mandatory adversarial pass. A Refused feeding is not an eating anchor; whether Picked is one is Dr. Chen's call. History inherits the answer through GAP-1.
- **Verification:** CONFIRMED; correctly scoped to the shared lane.
- **Note:** Filed: CUL-1122.

#### MFU-2 · Home's compaction folds a refused meal into a run and drops the food name

*high · lenses: Data, Sam, Mobile IA · sources: DAT-13, SAM-02*

- **Where:** lib/spineCompaction.ts:52-61; lib/spineNode.ts compactNode
- **Evidence:** isCompactable separates runs only by kind and photo. compactNode names no food when labels differ, and ', Wet' and ', Dry' do differ. So Home, behind design_v2, folds a refused bowl, and the meal a timing line points at, into an unnamed '3 meals'.
- **Counterexample:** Sam's Saturday: 8 AM All, noon Refused, 5 PM All. History shows the refusal as its own rose row; Home shows '3 meals', and the refusal appears only when the run is opened.
- **What the requirements must say:** File now as a design_v2 GA blocker. The shared predicate ruled in H-1 fixes it.
- **Verification:** CONFIRMED, raised to high. It is pre-GA, not live, because design_v2 is dark.
- **Note:** Filed: CUL-1121 (Design v2, blocks CUL-1071).

#### MFU-3 · The Remove confirm does not mention an event's note

*medium · lenses: T&S, Jordan · sources: TNS-07, JOR-13*

- **Where:** app/event/[id].tsx:499-500; app/(tabs)/history.tsx:520
- **Evidence:** hasNote is true only for a look, so removing the 6:27 PM meal (which carries 'New bag opened, same formula.') says nothing about its note. The completion card's Undo already names event notes, so the same act is worded differently on two surfaces (C-21, C-12).
- **What the requirements must say:** File an issue: both Remove confirms compute hasNote from events.notes (or from look_note for a look) and share undoGateCopy's wording. Add a test. List it as a prerequisite for the note line reaching GA.
- **Verification:** CONFIRMED.
- **Note:** Filed: CUL-1125.

#### MFU-4 · Existing bug: History's row read can put one pet's rows under another pet's name

*medium · lenses: Engineering · sources: ENG-12*

- **Where:** app/(tabs)/history.tsx:206-234 (compare loadVisits :295-331)
- **Evidence:** The row loader drops a new request while one is in flight, and never checks the active pet when the read resolves. v2's slower reads widen the window for this.
- **Counterexample:** A sync starts pet A's read, and the owner switches to pet B. B's load is dropped, and A's rows land under B's name.
- **What the requirements must say:** File the defect (CUL-574 class). In the requirements, every History read carries a monotonic load id and an active-pet check, and a newer request supersedes an older one. Test with two overlapping reads for different pets where the older resolves last.
- **Verification:** CONFIRMED.
- **Note:** Filed: CUL-1120.

#### MFU-5 · A hairball logged as Other is invisible to the Vomit lens

*low · lenses: Sam, Dr. Chen, Data, Jordan · sources: SAM-05, VET-16, DAT-03, JOR-02*

- **Where:** Rule C; symptom lenses; taxonomy D3
- **Evidence:** Other rows are outside every symptom lens and the report. There is no in-app re-type, and no surface tells an owner that a hairball counts as a Vomit.
- **What the requirements must say:** File two issues: log-time guidance that a hairball is a Vomit, and a priority note on D3's deferred re-type flow. Optionally, under a symptom lens, the count line discloses the window's Other rows in neutral ink, never counted into the lens.
- **Verification:** PLAUSIBLE. The note text on the page is illustrative, so none of this is evidence from Nyx's record.
- **Note:** Filed: CUL-1129.

#### MFU-6 · Four small shipped-code defects to file

*low · lenses: Data, Engineering, T&S · sources: DAT-07, DAT-09, TNS-11*

- **Where:** lib/sync.ts fetchAllRows; lib/rundown.ts readSinceVisitChanges; sign-out teardown; lib/monthModel.ts header
- **Evidence:** (1) fetchAllRows decides completeness from a short page (C-42). (2) The rundown compares a date-only visited_at lexically, as a UTC text bound (C-40). (3) Nothing calls removeAllChannels on sign-out. (4) monthModel's header comment describes an older LOGGED predicate.
- **What the requirements must say:** File each as its own issue in team Culprit. None blocks the History requirements. Home's possibly truncating time column moved to H-1 as evidence needed before that ruling.
- **Verification:** CONFIRMED in code by the verifiers. The Home time-column item was split out on the critic's correction.
- **Note:** Filed: CUL-1127.

#### MFU-7 · Rule 6's reset clause is missing from the principles, and shipped History already breaks it

*medium · lenses: Mobile IA · sources: MIAF-8*

- **Where:** docs/nyx-design-principles-v1_0.md:221-226; docs/nyx-filter-ux-requirements.md:32; app/(tabs)/history.tsx:173-176
- **Evidence:** When the filter spec's §2 was lifted into the principles doc, 'Four invariants' kept rules 1, 2, 3 and 5 and dropped rule 6 ('resets on remount/pet switch'). A session reading only the principles never sees it. Shipped History breaks it, and the flag-off guard keeps that behaviour until GA.
- **What the requirements must say:** Propose a Tier-2 edit adding rule 6's reset clause to the principles' invariants. When the rule-6 count edit is written, keep the reset clause and add 'no scope re-anchors across pets'. File a small shipped-History issue, or record the gap as accepted until v2 retires the old screen.
- **Verification:** Follow-up finding, self-verified against both docs.
- **Note:** Proposed Tier-2 edit posted on CUL-1071.

#### MFU-8 · Year-less dates and competing window names already ship on four surfaces

*medium · lenses: Designer · sources: DESF-9*

- **Where:** lib/rundown.ts:320-323; app/report.tsx:88-91, :276; lib/dietTrialCard.ts:542-545; components/history/EventRow.tsx:63-64
- **Evidence:** The rundown prints 'Since Jul 2', the report screen's scope line prints 'Since your last visit · Jul 2 – Sep 21', the trial card prints '26 July', and History v1 rows print 'Sep 16, 4:40 PM', all without a year. lib/weightHistory.ts and lib/trialWindowDates.ts already stamp one.
- **Counterexample:** On a pet whose last visit was Jul 2, 2025, the rundown in Sep 2026 reads 'Since Jul 2', which reads as about eleven weeks for fourteen and a half months.
- **What the requirements must say:** File one issue: a shared pure date formatter implementing H-10's year rule and range format, tested in the non-UTC CI zones, adopted by the rundown, the report scope line and the trial card, with the last-visit window's name aligned app-wide. History v2 adopts it from day one.
- **Verification:** Follow-up finding, self-verified.
- **Note:** Filed: CUL-1126.

#### MFU-9 · The house's programmatic scrolls ignore Reduce Motion

*medium · lenses: Motion · sources: MOTF-2*

- **Where:** app/(tabs)/index.tsx:88; app/insights/index.tsx:131; app/(tabs)/profile.tsx:377; expo-router useScrollToTop
- **Evidence:** Home's tab re-press and the Patterns jump hard-code animated:true, and the stock useScrollToTop takes no option. Only Profile's doorway focus honours the setting.
- **What the requirements must say:** The History requirements name Profile's shape (animated: !reducedMotion, from a resolved value) for the tab re-press, and forbid the stock useScrollToTop. File an issue to bring Home, Patterns and the onboarding pager onto the same rule.
- **Verification:** Follow-up finding, self-verified.
- **Note:** Filed: CUL-1123.

#### MFU-10 · History carries no five-column table, so round 3's red cells went unseen

*medium · **gates the requirements** · lenses: Jordan · sources: JORF-5*

- **Where:** Round-3 page §05 against round-2 §10 at 06be7bd; v4 §05
- **Evidence:** Round 2's §10 applied Principle 8's five-column check to seven numbers. Round 3 removed the strip's count and the table itself. Carried forward, the table would now show three red cells: the strip's count, the lensed completeness line's uncounted column, and the gap line's uncounted column.
- **What the requirements must say:** The History v2 requirements carry the five-column table over every number History speaks as §0 acceptance criteria, the way D2-1 carries v4 §05, and each cell names its test fixture.
- **Verification:** Follow-up finding, self-verified against both rounds.

### PM decisions (19)

_the underlying findings; the briefs to rule are H-1 to H-11 above_

#### PMD-1 · One row component and one meal-run rule for History and Home

*high · **gates the requirements** · lenses: Designer, Mobile IA, Data, Sam, Engineering, Jordan · sources: DES-01, MIA-03, MIA-13, SAM-02, ENG-04, JOR-14, JOR-08, VET-07*

- **Where:** §03 'borrowed whole from Home's spine'; rules B, D, K and H; components/recap/DaySpine.tsx; components/designV2/home/SpineNodeRow.tsx; lib/spineCompaction.ts; docs/culprit-design-v4-mockups.html:292-457
- **Evidence:** History's row is not Home's shipped node. Shipped SpineRowFrame puts the time in a fixed 56pt left column and a chevron on every row, uses the Camera glyph and calm words, and groups meals more loosely: runs split only on kind and photo, same-time ties keep input order, and looks are dropped. Home's own v4 mock, however, draws the same node History does: time on the right, no chevron on single rows. Rules B, D and K were ruled on the 'borrowed whole' premise, which is false in both directions. Home's fixed column may already truncate a range label like '12:41 – 5:07 PM' at default size.
- **Counterexample:** Sep 17 on Home's Today and on History: time on the left versus the right, chevrons versus none, and '2 meals' folding 5:47 and 10:55 versus two named rows. Two languages, one tap apart.
- **What the requirements must say:** Better-than-the-rule brief. The rules are B, D and K, settled in rounds 2 and 3 on the premise that History borrows Home's node. They protect less noise and every meal named, and that protection holds under every option. The better thing: name ONE node component and ONE compaction predicate in lib/spineCompaction.ts, imported by both surfaces. The predicate keeps rule B's splits, adds a kind rule so treats never join meals (the run's noun comes from the kind), and breaks ties on (occurred_at, id). Before ruling, measure on a device whether Home's shipped 56pt one-line time column truncates '12:41 – 5:07 PM' at default text size. Decision brief in H-1; the product-split conflict is in conflicts.
- **Verification:** CONFIRMED. The FAB argument was refuted (a time is not a control). MIA-13's option to adopt Home's looser rule was refuted as unsafe, because it hides refusals. VET-07's calm-word challenge was demoted, but its wording fix to §03 is kept here. The device measurement moved here from MFU-6 on the critic's correction.

#### PMD-2 · A day of refused meals is invisible to the header and the strip

*high · **gates the requirements** · lenses: Designer, Data, Dr. Chen, Sam · sources: DES-15, DAT-05, VET-11, SAM-01*

- **Where:** Rule C; rule I; §02 'One row of the Patterns month's day marks'; lib/monthReads.ts:22-23; components/log/IntakeBadge.tsx
- **Evidence:** Rule C removes meals from the header, and rule I marks only symptoms, so a day of refused bowls is a plain cell under '3 logged'. The shipped month draws left_some, a paler hairline derived from qualifyingIntakeMeals and isFinishedMeal, and §02 says the strip is one row of the month. Nyx's fixture has one rated meal in 18 days, so no round could have drawn this case. On ink: rose already means three things, a symptom kind, intake decline on the row (the shipped IntakeBadge uses colorEventSymptomInk on colorEventSymptomLight), and the worth-a-call word (Home's verdictAttn uses the same ink). The mock's 'Worth a call' is a hard-coded #B4123B, not a theme token.
- **Counterexample:** Pixel refuses or picks at 4 of 6 bowls on Tuesday and again on Wednesday, with no vomit. Both headers say '6 logged' and both cells are plain, inside the feline 48-hour window.
- **What the requirements must say:** Better-than-the-rule brief. The rules are C and I, settled 2026-09-23. They protect a quiet header and marks rather than numbers, and both still hold: a day where every meal was finished renders unchanged, and a hairline is a mark, not a number. The ink question is not 'keep rose for the read'. It is parity with the row's shipped decline register (rose) versus the month's paler, never-amber register (neutral). Decision brief in H-2.
- **Verification:** CONFIRMED. Data, Dr. Chen and Sam lowered this to medium because the refusal stays visible on its row; the Designer's high stands on the intake-is-not-preference invariant. The ink premise was corrected on the critic's evidence.
- **Note:** Since the lenses ran: CUL-1118 (filed 2026-09-24) proposes making meal rating exception-only because owners stopped rating after mid August; the intake half of H-2 is sequenced behind it.

#### PMD-3 · The free-fed bowl disappears from History

*high · **gates the requirements** · lenses: Designer, Mobile IA, Sam, Engineering · sources: DES-17, MIA-18, SAM-03, ENG-09*

- **Where:** Shipped app/(tabs)/history.tsx:648-658 (FreeFeedingStrip), BoundaryMarkerRow; docs/nyx-free-feeding-requirements.md §6a; rule F
- **Evidence:** Shipped History pins 'Always available · food · since date' and draws Started, Stopped and Switched markers (B-040 §6a, PM decision 2026-06-09). Round 3 mentions neither, and rule F ('nothing standing at the top') appears to rule the strip out. The mock times vomits from the nearest meal, where the lane returns free_fed.
- **Counterexample:** Sam free-feeds kibble and logs only the evening wet meal. History reads '1 logged' every day, which at the vet looks like one meal a day.
- **What the requirements must say:** Better-than-the-rule brief. The rule is F. It protects against standing disclaimers, and it still holds, because a bowl line is context, not a verdict. Decision brief in H-6. The markers return as a third kind of course marker, and timing comes from the lane.
- **Verification:** CONFIRMED. The verifiers found a prior PM decision that the rounds never reconciled, which counts as new evidence.

#### PMD-4 · Nothing stays on screen while the record scrolls, and a landing is marked only by motion

*high · **gates the requirements** · lenses: Mobile IA, Designer, Motion · sources: MIA-05, DES-07, MOTF-6*

- **Where:** §01 scroll frames; §04 The landed day; shipped app/(tabs)/history.tsx:626-657; components/history/EventRow.tsx:159-161; mock drawInCard (:1211)
- **Evidence:** One viewport down, the title, pills, count line and strip are all gone, and there is no sticky day header, so several frames show rows with no date anywhere on screen. Shipped History pins its header and pills and prints the date on every row, so this is a regression. Under Reduce Motion the landed day's draw, the only 'you are here', does not play. A landing at the list's end, or on a gap line, is marked by nothing.
- **Counterexample:** An owner on the phone with the clinic scrolls to 'the vomit on the 7th' and lands on a screen with no date on it: Sep 7 or Sep 4? With Reduce Motion on and Last 7 days, a tap on Sep 15 bottoms out the list with three days on screen and none distinguished.
- **What the requirements must say:** Decision brief in H-3.
- **Verification:** CONFIRMED; MOTF-6 (follow-up) self-verified by measuring the landing under reduced motion.

#### PMD-5 · The fact lenses: 'Also only' replaces the type lens, and 'With a read' shows no criterion

*medium · **gates the requirements** · lenses: Mobile IA, Designer, Jordan, Data, Dr. Chen · sources: MIA-07, DES-08, JOR-12, DES-09, DAT-11, VET-15*

- **Where:** §06 third pill; mock sheetHtml :1118, pick handler :1167; rule 3; WIN fixture
- **Evidence:** The sheet says 'Also only', but picking a fact lens replaces the type lens, and ⋯ never shows that it is on. Under 'With a read · 13', twelve rows look exactly like unread ones, and nothing names the unread. The page's own numbers do not add up (photographed 44, read 42, unread 3). The strip under that lens marks photographed days. The cap path writes 'completed' with no model run, so a count keyed on status would include reads that never ran.
- **Counterexample:** Jordan picks Vomit, then Photographed, to find the pictures for the vet. She gets every photographed meal too, and the Vomit lens has dropped silently.
- **What the requirements must say:** Better-than-the-rule brief. The ruling is 'the filters kept and extended', with a third pill as a fact lens. It protects reach to the fact lenses and bars any lens that filters on a verdict; both hold under the recommended option. Before any unread number ships, define one predicate: photographed = model read landed + pending + unread, keyed on whether a model actually ran, with a sum test and a table of empty-state phrases per lens. Decision brief in H-5, together with the per-drug lens (PMD-16).
- **Verification:** CONFIRMED (MIA-07, DES-08, DES-09). JOR-12 is a MOCK_ARTIFACT (the harness has one lens slot), but the choice still has to be made. DAT-11 and VET-15 PLAUSIBLE.

#### PMD-6 · The read on the row: what a dismissal hides (R2-5), and what an unread photo shows (R1-5)

*high · **gates the requirements** · lenses: Data, T&S, Jordan, Dr. Chen, Engineering · sources: DAT-08, TNS-05, JOR-10, JOR-11, VET-06, ENG-05*

- **Where:** Rule 7; §06 'With a read'; lib/spineNode.ts nodeReadOf; lib/monthReads.ts; supabase/functions/_shared/incident-analysis.ts:820-900
- **Evidence:** Home and the month disagree in four ways. Home hides a dismissed read; the month ignores dismissal. Home turns an unknown value rose; the month shows 'seen'. Home says 'Keep an eye out'; History says nothing. Home gates on category rather than hasPerIncidentRead. Capped and read_disabled rows exist today and render exactly like calm ones, and CUL-552 forbids 'analysis off' reading as 'no flags found'. A 'Worth a call' from 17 days ago, before a vet visit, reads as a live instruction.
- **Counterexample:** An owner who declined consent sees six quiet photographed vomits beside one rose row from a contextual flag. The quiet ones read as checked and fine, although no model ever looked at them.
- **What the requirements must say:** Whatever the ruling, the requirements say the following. There is one readStateOf(analysisRow, eventTypeAsEdited) in lib/incidentReadState.ts, used by History, Home and the month, with a guard. Status never silences an escalation, and an unknown value fails toward rose. The rose word's spoken label carries the read's date. A state table covers capped, read_disabled, declined, failed, pending, quarantined and unfetched. History never prompts for consent. Two rulings remain, the dismissal conflict and the unread disclosure, both briefed in H-4.
- **Verification:** DAT-08 and TNS-05 CONFIRMED; JOR-10 and JOR-11 PLAUSIBLE. VET-06 was REFUTED because the report never prints the verdict, so the report is outside R2-5's scope.
- **Note:** Since the lenses ran: CUL-1111 (hide the note hides words only) and CUL-1107 / CUL-1101 (the flag review: an owner "No" stands down the ask while the observation stays) give the dismissal question a shape; see H-4.

#### PMD-7 · Rule 9's 'byte for byte' freezes in-app senders, and ?date= means two different days

*high · **gates the requirements** · lenses: Engineering, Data, Dr. Chen · sources: ENG-03, ENG-16, DATF-11, VETF-10*

- **Where:** §06 doorway table and rule 9; the History senders (lib/ask.ts:308, app/ask.tsx:394, app/medication/[id].tsx:194, lib/lookCard.ts:164, lib/lookPatterns.ts:88, PatternCalendar.tsx:256, widgets/CulpritWidget.tsx:143, app/rundown.tsx:99)
- **Evidence:** Eight senders reach History. The table lists five, one of which (Home's Today zone) no longer sends anything. It misses the medication screen's 'See doses in History' (the door a per-drug lens exists to serve, carried as B-688), flag-off Home's Noticed card '?type=check_in&window=today', Ask's chip and the rundown. The widget sends a local ?date=, while the flag-off calendar sends a UTC one. CUL-1073 as written makes every ?date= local, which breaks the flag-off calendar against its own sheet. Freezing in-app senders byte for byte also blocks the Ask fix in BRK-5.
- **Counterexample:** Flag-off, Central time, 9 PM: tap Sep 16 on the calendar, and History shows local Sep 16, including meals after 7 PM that the sheet did not count. On flag-off Home, '1 more today ›' lands on Noticed · Today with a count of looks, on a door no test covers.
- **What the requirements must say:** Better-than-the-rule brief. The rule is rule 9 (round 1). It protects senders that cannot change with the app, and that protection holds for every sender outside the bundle. A door registry derived from the repo (searching app/, components/, lib/ and widgets/) fails the build on any unregistered sender (C-38), and an existing parameter never changes meaning in place. Link the per-drug door to B-688 and B-698. Decision brief in H-7.
- **Verification:** CONFIRMED. The Engineer's 'fork by flag' option was corrected to 'fork by sender', which works whichever flag R1-4 picks. DATF-11 and VETF-10 (follow-ups) duplicate doors ENG-03 already found.
- **Note:** Heads-up posted on CUL-1073.

#### PMD-8 · Which day starts 'since the last vet visit'

*medium · **gates the requirements** · lenses: Data, Dr. Chen, Jordan, Designer · sources: DAT-09, VET-10, DESF-5*

- **Where:** §06 date sheet; vet_visits.visited_at (DATE); lib/rundown.ts; generate-report rung 1; Home's 'since last visit'
- **Evidence:** visited_at has no time, so a same-day event cannot be placed before or after the visit. The report's rung 1 and the vet-visit spec ('starts from this visit') include the visit's day but anchor on the latest visit strictly before today. Home's 'since last visit' resets when a visit is saved on the day.
- **Counterexample:** A vomit at 9 AM on Sep 16, before a 2 PM visit, counts as 'since the visit'. At an Oct 5 recheck saved at 9 AM, anchoring on today's visit gives '0' in the room while that evening's report covers Sep 16 to Oct 5.
- **What the requirements must say:** A persona conflict (see conflicts). Whatever the ruling, History, the rundown and the report share one bound through one function, and any difference from Home's reset is written down.
- **Verification:** CONFIRMED (DAT-09, VET-10); DESF-5's anchor recommendation (follow-up) self-verified.

#### PMD-9 · Nothing on History answers 'anything besides the trial food?'

*medium · **gates the requirements** · lenses: Jordan · sources: JOR-01*

- **Where:** Rule K (rule A retired); §06 doorways; app/trial-exposures.tsx
- **Evidence:** With rule A retired, no lens, window or door answers the question. The shipped 'Outside the trial diet' screen does answer it, but it is reachable only from Profile. The Instinct rabbit rows look like every trial row.
- **Counterexample:** Jordan's trial food is rabbit-based and the pill pocket is Instinct rabbit. Asked at the recheck, he answers 'just rabbit', but by the app's own rule the Instinct is an exposure.
- **What the requirements must say:** Requirement regardless of the ruling: History makes no trial-membership claim of its own. Deciding: whether the count line, under a window that overlaps an active trial, carries one uncounted door to the exposures screen. Options: (a, recommended) yes, which keeps one predicate and G2's floors, both already built; (b) row marks via matchAllowed, where a missing mark reads as a verdict, which G2 forbids; (c) nothing. Consequence: (a) adds one outbound door row, with a test per flag state and per trial state. Rule it with the doorways in H-7.
- **Verification:** CONFIRMED, lowered to medium. The Instinct rabbit carried the Prednisone once (Sep 21), not three times, and the trial card already answers the question elsewhere.

#### PMD-10 · History's counts and the report's can differ with no explanation

*medium · **gates the requirements** · lenses: Dr. Chen, Data · sources: VET-05, DAT-07*

- **Where:** Rule 5; count line and sheets; generate-report dedupeEvents
- **Evidence:** History counts raw local rows. The report removes same-type duplicates logged within 60 seconds. Nyx has same-minute vomit re-logs on May 15, May 30 and Jun 21, and two identical meals at 8:38 PM on Sep 9. The Signal and the month count episodes, not rows. Quarantined rows count on the phone but never reach the report.
- **Counterexample:** The date sheet says 'May · 11 vomits', the report says 9, and the month counts episodes.
- **What the requirements must say:** Count rows and call them 'logged' in every count. The population is as in R-1; unsaved rows are counted and disclosed ('· 1 not yet saved'); and 'since <date>' appears only after a completed hydration. Deciding: whether the count line also discloses rows the report will drop ('· 2 logged twice in the same minute'). Options: (a, recommended) disclose, with the report's dedupeEvents lifted into a Deno-compatible lib/ module; (b) no disclosure.
- **Verification:** VET-05 CONFIRMED at medium. DAT-07 PLAUSIBLE: the cold-start overlay covers the partial-hydration case.

#### PMD-11 · The note line is gated on CUL-848, which the mock already answers one way

*high · **gates the requirements** · lenses: T&S · sources: TNS-01*

- **Where:** §05 rule 2; record cue (mock :1101); CUL-848 (Todo, Waiting on PM)
- **Evidence:** Rule 2 lets the note appear on the row once CUL-848's cue ships. CUL-848 has three options: (a) a cue plus a report toggle; (b) the same, with Ask no longer reading notes, which is T&S's lean; (c) leave it as it is. The mock already prints option (a)'s cue, with an Ask clause, as one string for every record type (false for looks), on the read-only card rather than at the write fields.
- **Counterexample:** The PM rules (b), and the drawn cue now promises that Ask can quote a note it no longer reads.
- **What the requirements must say:** The note line ships only after CUL-848 is ruled and its cue is live at every field that writes the column the row shows, in the same release or earlier. Cues are per column. The events.notes cue's Ask clause is tied, by a guard keyed on source, to whether Ask selects notes. Looks keep LOOK_NOTE_CUE_UNNAMED. Mark the mock's cue as illustrative. T&S recommends (b).
- **Verification:** CONFIRMED.

#### PMD-12 · Which flag gates History and the spine's first paint (R1-4, R2-3)

*medium · **gates the requirements** · lenses: Motion, Engineering · sources: MOT-11, ENG-14, MOTF-4*

- **Where:** Rule J; §07 R2-3 and R1-4; components/designV2/home/SpineNodeRow.tsx:277-311; lib/appConfig.ts:102
- **Evidence:** Round 1 recommended that History v2 ship on its own history_v2 flag. Home's first paint 'in the same PR' would then cross two flags. No shipped module draws a thread, though useOpenInPlace's rail lead is the building block. Home's compact row opens on a bare configureNext with a chevron swap, where History rotates a down chevron, and under Reduce Motion Home pops while the modules crossfade.
- **Counterexample:** An owner with design_v2 on and History v2 off: if Home's paint rides design_v2, Home changes the day History's PR merges while History stays dark.
- **What the requirements must say:** Decision brief in H-8. Whatever wins: one module in components/motion/ built on the rail-lead building block; Home's compact row on useOpenInPlace; identity (pet, mount); a flag-off guard that follows R1-4 (history_v2 in the vetVisitsFlagOff shape).
- **Verification:** CONFIRMED; MOTF-4 (follow-up) self-verified.

#### PMD-13 · Under a lens, the count that the strip ruling relies on has nowhere to live

*medium · **gates the requirements** · lenses: Data · sources: DAT-02*

- **Where:** §02; rule I; mock lensWords and the rail tap landing
- **Evidence:** Round 3 removed the count from the cell because 'the count lives in the day header the tap lands on and the cell's spoken label'. Under a lens, a day with no match has no header: the tap lands on a gap line with no count, and the label says only 'no vomit logged'. Sep 19 (one meal at 8:25 AM) and Sep 18 (five meals) look the same.
- **Counterexample:** Jordan asks whether Sep 19 was a clean day. Nothing on screen says it was logged only until 8:25 AM.
- **What the requirements must say:** Better-than-the-rule brief. The ruling is the strip ruling of 2026-09-23. It protects the cell from clutter, and that still holds, since the cell stays marks-only. Under any lens, a cell's spoken label gives the lens count and then the day's all-types total, and the gap line a tap lands on names its dates and its logged total. The team recommends adopting this and writes it into R-1 unless the PM objects.
- **Verification:** CONFIRMED, lowered to medium.

#### PMD-14 · The mock shows the record rising, but it is a platform push from every door

*low · lenses: Motion · sources: MOT-13, MOTF-7*

- **Where:** §04 The route; app/_layout.tsx:313
- **Evidence:** event/[id] opens with the standard stack push and edge-swipe back, from about ten call sites including Home, the log route and History. The page draws it rising. It has no reduced-motion option.
- **What the requirements must say:** Recommended status quo: the requirements state the platform push from every door, with animation 'none' under Reduce Motion decided from a resolved value (GAP-28, BRK-19), and the mock's rise is illustrative. A rise from every door would be its own Tier-2 edit to incident spec §3.
- **Verification:** CONFIRMED; a low-stakes confirmation. MOTF-7 (follow-up) added the reduced form, which is gated through R-4.

#### PMD-15 · What the Noticed lens counts: nothing, or answered days

*high · **gates the requirements** · lenses: Data, Designer · sources: DATF-02, DATF-03, DATF-05, DESF-3, DAT-06*

- **Where:** Pill (:976), count line (:931-939), sheet counts (:1111, :1115), strip (:996-1044); rule I; daily-look T-5, T-16, T-18, item 12
- **Evidence:** Every lens count on the page is a row count, so under Noticed the pill and count line would count looks, which daily-look R9 and T-5 forbid. The shipped buildCountChips says the only honest count over looks is days, via lib/looks.ts. T-16's forms sit on one rolling 28-day window with a 14-day floor, and every History window is one T-16 or T-18 rejects or cannot floor: Today and 7 days never reach the floor; 14 days can only print the saturation form, which works as a streak badge; a month resets on the 1st; All time accrues. As coded, the strip tints every answered day teal and leaves an unanswered day blank, against floors 4 and 12.
- **Counterexample:** On the morning of Sep 1, a month window under Noticed prints '1 of 1', which is T-18's named rejection. A fully answered week draws seven teal bars: a coloured streak on the very lens Patterns links into.
- **What the requirements must say:** Persona conflict (see conflicts); brief in H-9. Whatever wins: Noticed stays on the type sheet outside the All-types partition; every surface under it consumes lookWithheld; the strip under Noticed carries no teal and no rose (dates only is the Data recommendation, the report's monochrome legend is the fallback); and the lens gets a row in the v4 §05 five-column table.
- **Verification:** Follow-up findings, self-verified. DAT-06's clause, dropped in the earlier merge, is restored here as one side of the conflict.

#### PMD-16 · What 'a medication's doses' means

*high · **gates the requirements** · lenses: Dr. Chen · sources: VETF-1, VETF-9, VETF-11*

- **Where:** §06 third pill (frame-p-sheet-more-fold.png); mock :811, :928, :1117-1120, :1167; lib/medicationHistory.ts:210-305; lib/medications.ts:1481-1537
- **Evidence:** The lens keys on a display string with a hard-coded count. A dose names its course either by medication_id or by item and date window. lib/medicationHistory derives one course per regimen plus one per orphan item, and the report reads the same pass. Med-history H4 bars a third course predicate. B-688, the filed per-med lens, keyed on medication_item_id, which misses every free-text regimen. The sheet lists only Prednisone and never says whether ended courses appear or how long the list may grow. A column of 'Given' with no schedule beside it reads as complete.
- **Counterexample:** Prednisolone logged for three days through a 'prednisolone 5 mg' item, then switched to a 'Prednisone' free-text regimen. A name key splits one course in two; an item key drops every regimen dose; and a stem merge would pool two different drugs (cats convert prednisone poorly).
- **What the requirements must say:** Brief in H-5. Whatever wins, the key is never a display string, and the count and bounds follow GAP-26. The medication screen's door lands on the same course key, and the work links to B-688 and B-698. Recommended answer to the schedule question: the count line states the regimen's recorded schedule as a record fact, with a door to the course card. History computes no ratio and no pace (D3, H2).
- **Verification:** Follow-up findings, self-verified against the shipped course derivation.

#### PMD-17 · A pet-anchored option for a pet that has no anchor

*medium · **gates the requirements** · lenses: Mobile IA · sources: MIAF-4*

- **Where:** §06 date and fact sheets (mock sheetHtml :1105-1122)
- **Evidence:** Every anchor row is hard-coded to Nyx. Nothing says how the sheets show a trial, visit, drug or month the current pet lacks, including for a new pet on an old account, or which trial anchors a pet with an ended or second trial.
- **Counterexample:** For Mochi, added last week, 'Since the trial started · Jul 26 · 0' prints a count over a window Mochi never had.
- **What the requirements must say:** Team default, confirmed in H-5: the option is absent. A window with no anchor has no bounds and so no count, and the first five rows do not move. The requirements add that filter invariant 1 governs hidden overflow, not per-pet membership, and that trial rows name their trial via lib/dietTrial, with an ended trial's row naming both dates. The alternative is an inert row that says why (C-7 host split, voice pass).
- **Verification:** Follow-up finding, self-verified.

#### PMD-18 · Where the year goes, and how the month list grows

*high · **gates the requirements** · lenses: Designer · sources: DESF-1, DESF-4, DES-18*

- **Where:** dayName, shortDay (:709-710), weekLabel (:1017), count line (:936), end cap (:968), sheet (:1116)
- **Evidence:** No date on the screen carries a year: the formatters are year-less by construction, and All time, the default window, is unbounded (C-19 rule 1). The date sheet lists bare month names, so a record starting May 2025 lists September and May twice, and the pill and count line print a bare 'September'. Measured with every date stamped: all 18 headers, the worst-case strip label and the count line fit at 316pt; only the frames' long gap-line form wraps.
- **Counterexample:** A cat logged since May 14, 2025: 'All time · 2,400 logged since May 14' reads as four months at about 20 a day, when it is sixteen months at about 5. 'Tue, Sep 16 · 3 vomits' could be either year.
- **What the requirements must say:** Brief in H-10. Whatever wins, one shared pure formatter owns the year rule, reads the year off the local day key, never reformats headers already on screen, and is tested across Jan 1 in the non-UTC CI job.
- **Verification:** Follow-up findings, self-verified by stamping a scratch copy. DES-18 (confirmed, previously omitted) folded in.

#### PMD-19 · History fails Principle 8's screenshot test, and the strip's counts were ruled against a different number

*high · **gates the requirements** · lenses: Jordan · sources: JORF-1, JORF-4*

- **Where:** frame-p-days-fold.png, frame-p-lens-fold.png; rule I; §02; components/charts/DayMark.tsx; components/designV2/home/CoverageDoor.tsx
- **Evidence:** Seen as Jordan, both folds read as a log. The header counts are the only numbers with a shape. The lens's '13 vomits since the trial' has no shape, and no door to the shipped shapes that answer it (the Signal's CompareBars, the trial view). Round 3 has no Principle 8 check. Separately, the round-2 '5' the PM called clutter was the day's total logged, mostly meals. The shipped DayMark draws a count only on a symptom day, so under the Vomit lens Sep 17 (2 vomits) and Sep 21 (1) now carry the same dot.
- **Counterexample:** At the 8-week recheck the vet asks whether 13 is better than before. The record answers 32 vomits in the 73 days before Jul 26 and 13 in the 58 since, roughly halved. History gives only 45 and 13 on the date sheet, with no spans.
- **What the requirements must say:** Better-than-the-rule brief, in H-2. The ruling is 'marks not numbers' (2026-09-23). It protected the cell from meal totals, and that holds under every option, because DayMark never draws a total. The options are a door from the lensed count line to the shipped shape, which keeps every ruling, plus, optionally, DayMark's symptom-day count in the cell.
- **Verification:** Follow-up findings, self-verified against the renders and the shipped DayMark.

### Backlog (7)

_real, worth doing, not gating_

#### BKL-1 · A symptom lens could note a different symptom logged just before a vomit

*low · lenses: Data · sources: DAT-10*

- **Where:** Vomit lens; taxonomy cough row
- **Evidence:** Under the lens, the 5:09 PM cough two minutes before Sep 17's 5:11 PM vomit disappears. The taxonomy spec's adjacency rule governs detection lanes, not a filter view.
- **What the requirements must say:** Backlog for Dr. Chen, to be decided alongside detector 5's post-tussive question.
- **Verification:** PLAUSIBLE, corrected to backlog.

#### BKL-2 · The app-switcher snapshot captures History's first screen

*low · lenses: T&S · sources: TNS-13*

- **Where:** iOS app switcher; no background privacy cover anywhere in the app
- **Evidence:** History's first screen shows symptom days, a named prescription and the owner's own words. The question applies to the whole app.
- **What the requirements must say:** File an app-wide issue to evaluate a privacy cover when the app goes to the background.
- **Verification:** CONFIRMED.
- **Note:** Filed: CUL-1128.

#### BKL-3 · No way to find 'when did she last refuse?'

*low · lenses: Sam · sources: SAM-missed-3*

- **Where:** Search haystack; the fact lenses
- **Evidence:** Search does not index the intake rating, and there is no intake fact lens. A declined meal can be found only by scrolling for rose chips.
- **What the requirements must say:** A PM call when convenient: a 'Left some' fact lens built on the month's predicate, or rating words added to search. Decide it after H-2, since a day-level intake mark makes the lens the natural finder.
- **Verification:** Raised by the Sam verifier as a missed item; source attribution corrected on the critic's evidence.

#### BKL-4 · History has no in-place pet switch

*low · lenses: Mobile IA · sources: MIAF-9*

- **Where:** §01 header (headerHtml .ttl); components/log/FAB.tsx:283-287
- **Evidence:** The title is a plain span, not a switcher. On History the only switch is the FAB's 'Logging for' chip, a capture control used for reading, and every switch then costs a re-pick of the scopes.
- **What the requirements must say:** Consider parity with Home's header when H-3 is drawn: whether History's title is the same switcher Home's header is.
- **Verification:** Follow-up finding, self-verified.

#### BKL-5 · Dates inside a day card repeat the header

*low · lenses: Designer · sources: DESF-11*

- **Where:** Course marker at the foot of its day; the visit row's time column
- **Evidence:** 'Prednisone started · Sep 21' and the visit row's 'Sep 16' repeat the card's own date. Once the year is stamped, a card prints it twice.
- **What the requirements must say:** Drop the date inside its own day card. The marker reads 'Prednisone started', and the visit row's right column carries the visit's time when one was logged.
- **Verification:** Follow-up finding, self-verified.

#### BKL-6 · Principle 9 has no Reduce Motion clause beyond the breathing tick

*low · lenses: Motion · sources: MOTF-10*

- **Where:** Principle 9 draft (design v2 and v4 mocks)
- **Evidence:** The house rule ('a crossfade is not motion') lives in two feature specs and five module headers, not in the principle, so each new mock draws a hard snap while the code crossfades.
- **What the requirements must say:** A Tier-2 edit to Principle 9: add an inverse test ('Turn motion off. Can you still tell what changed?') and GAP-28's three-way rule. Not gating History.
- **Verification:** Follow-up finding, self-verified.
- **Note:** Proposed Tier-2 edit posted on CUL-1071.

#### BKL-7 · The date sheet's counts have no spans, and there is no 'Before the trial' window

*low · lenses: Jordan · sources: JORF-6*

- **Where:** frame-p-sheet-when-fold.png
- **Evidence:** Under the Vomit lens the sheet lists counts per window with no length in days, and no window covers the time before the trial.
- **What the requirements must say:** Not gating if H-2 adds the door to the shipped shape. Otherwise file it: trial and visit rows state their span in days, and a 'Before the trial' window is considered as a filter extension.
- **Verification:** Follow-up finding, self-verified.

---

## What held

The attempts that failed to break the proposal. A critique that lists only defects is half a critique.

- Data: every day header's total adds up to its rows (Sep 16 is 9 with the visit uncounted; Sep 17 is 10). The type sheet's rows add up to 1,091, and 'All symptoms' at 93 equals its five parts.
- Dr. Chen: found and estimated vomits (Sep 4, Sep 7) never claim minutes after eating, and the witnessed-time rule matches the shipped lane.
- Dr. Chen and Sam: the meal a timing line points at stays its own row (Sep 17, 10:55 before 10:58), and a Picked, Some or Refused meal never folds into a run.
- Data and Dr. Chen: tried a 'Worth a call' lens over June while two photos sat unread. It would print 'none worth a call', which is reassurance, and rule 3 correctly refuses to offer it.
- Jordan: 'vomits since the trial started' takes two pills and four taps, the pill and the count line agree, and the date sheet answers the vet's follow-up windows from one sheet.
- Motion: every beat is between 150 and 500ms, and no pulse or haptic appears anywhere. In the follow-up, the draw family (first paint, landed day, strip) turned out to match the shipped static frame under Reduce Motion.
- Trust and Safety: the widget's pet-id link cannot open another account's pet, and every table a row or the search reads is wiped on sign-out.
- Trust and Safety: a contextual escalation still writes worth_a_call under a capped or declined read, so the rose survives the consent gate if History reuses the shared predicate.
- Data (follow-up): tried an 'Off' look against the rose, a meal run and the timing line. A look earns no rose, acts as a wall inside a run, and is never a timing reference.
- Designer (follow-up): stamped every date with its year at 316pt. All 18 day headers, the worst-case strip label ('Dec 27, 2026 – Jan 2, 2027 · Since the trial') and the count line fit without wrapping, so the year needs no new layout.
- Mobile IA (follow-up): tried a carried type lens as a wrong-pet claim. Types are shared vocabulary and a zero on the sheet is an honest count; only pet-anchored scopes make claims, and search cannot leak across pets.
- Engineering: everything on the page builds on managed Expo with RN core, LayoutAnimation and native-driver Animated. No ejection and no new motion dependency are needed.

## Refuted, mock artifacts, and rulings re-argued on taste

Kept for the record so no one re-raises them. A mock artifact is a defect of the page's own CSS or harness; where the requirement it exposes still stands, the item above carries it.

- **MOT-2** The calm and rose reads resolve with opposite motion, inverting G4: This re-argues a PM ruling (rule F and R2-4) without new evidence. Round 2 already weighed G4 and ruled the asymmetry honest. G4 guards against safety arriving louder, and motion that distinguishes outcomes passes Principle 9's test. The narrow half that survives, that the calm slot's exit is unspecified, is folded into BRK-9.
- **VET-06** A dismissed worth-a-call: History hides it, the report still prints it: Refuted. The report never prints the per-incident verdict (migration 013; report.ts:1630). What remains is R2-5, already carried.
- **VET-07** History should say 'Keep an eye out' like Home: This re-argues a PM ruling on taste. The PM ruled 'the rose only' in round 2 with Home's word in view. The wording fix to §03's 'borrowed whole' is kept in PMD-1.
- **VET-18** Show two lines of a symptom row's note: This re-argues rule G using illustrative note text. Round 2 already recorded this class as 'fixed as far as a cut can be'.
- **DES-01** Side claim: the FAB covers row times in every scroll frame: Refuted. lib/fabFootprint.ts accepts a FAB over mid-scroll content, and a time is not a control. The rule is the end inset, which is carried in BRK-13.
- **MIA-13** Option A: History adopts Home's compactSpine: Refuted as unsafe. Home's looser rule folds a refused meal, and a timing-referenced meal, into an unnamed run. The finding survives as the one-predicate question in PMD-1.
- **MIA-12** Resolution: the first weekday follows the device locale: Refuted. The house week starts on Sunday (weekStartIndex, WeeklyBars, the Patterns month); a locale-driven week would fork the strip from the month.
- **TNS-02** Counterexample: 'Include your notes' claims to cover all notes: Refuted. The shipped toggle already reads 'Include your Noticed notes', and its hint says meal and symptom notes are always included (#837).
- **ENG-17** Sub-claim: search results lose their timing line: Refuted. listHtml passes the whole day's rows, and the 'hairball' result shows '3 min after eating'.
- **JOR-01** Sub-claim: the Instinct rabbit was a Prednisone vehicle three times: Refuted. Prednisone started on Sep 21. Sep 5 carries an unnamed dose, and Sep 10 carries none. ⚠ *§V, V-1: that dose is Cetirizine HCl.*
- **DAT-03** Evidence: Nyx's Sep 13 Other row is a hairball: The note text on the page is the Designer's illustration; only note lengths are real. The general Other-row class survives as MFU-5.
- **VET-05** Sub-point: the fixture drifts on Sep 21 (8 rows against 5): Harness data that never renders, because FIX shadows BYDAY. The duplicate-counting finding stands in PMD-10.
- **JOR-14** The photo glyph reads as an empty checkbox: MOCK_ARTIFACT: an 11×9 CSS stand-in. The requirement is simply to reuse Home's Camera glyph with the label 'photographed', which is carried in PMD-1.
- **SAM-02** Sub-claim: a treat run reads '3 meals · … · dry': A harness fallback, since the fixture has no treats. The missing kind rule and noun rule are real and are kept in PMD-1.
- **ENG-18** Sub-claim: the page's week math shifts a day at UTC+14: A harness artifact of addDays (local noon passed through toISOString). The non-UTC fixtures it points to are kept in GAP-19.
- **CRITIC-Q-NOTICED** Option: move daily-look T-16's three forms onto History's windows: No honest form exists (DATF-02). Today and 7 days never reach the 14-day floor, 14 days can print only the saturation form, a month is T-18's resetting anchor, and All time accrues. Patterns' own rule already differs from T-16.
- **CRITIC-Q-MOTION** Premise: drawInMotion crossfades where the mock snaps: Refuted by the Motion follow-up. drawInMotion is the static frame, just as the mock is; only the in-place modules crossfade over 150ms. The split is principled, and is now written into GAP-28.

## Filed from this critique

Shipped code, outside History v2's scope, each verified in code this session (a device check is noted where it is still needed):

- **CUL-1119** · the widget's pet link keeps re-selecting its pet after a later switch (High; device check)
- **CUL-1120** · History can show one pet's rows under another pet's name during a switch (Medium)
- **CUL-1121** · Home's day spine (design_v2) folds a refused meal into an unnamed "3 meals" (High; blocks CUL-1071)
- **CUL-1122** · the shared timing lane counts a refused bowl as eating (High; clinical, adversarial review mandatory)
- **CUL-1123** · Reduce Motion reads as off on every first render; Home and Patterns always animate their scrolls (Medium)
- **CUL-1124** · History's dose row: no chip on an unnamed dose; a regimen dose never named (Medium) ⚠ *§V, V-1: both are code facts; Nyx's record has no unnamed dose to show them.*
- **CUL-1125** · the Remove confirm never mentions an event's note (Low)
- **CUL-1126** · dates without a year on the rundown, the report scope line, the trial card and History v1 rows (Low)
- **CUL-1127** · four small defects: a text-compared visit bound, a short-page completeness check, realtime channels left open on sign-out, a stale comment (Low)
- **CUL-1128** · the app switcher snapshot shows the health record (Low; a small PM call)
- **CUL-1129** · a hairball logged as Other escapes every vomit count (Low)

Comments posted: **CUL-1073** (read `?date=` by sender, not by flag), **CUL-1071** (two Tier-2 edits for Principles v2.0: Principle 9's Reduce Motion rule, and the filter reset rule the principles doc dropped).

## Method

- **Isolation.** Nine lenses, each an isolated subagent that read the page, its renders, the principles, the Design v2 language (the spine, the six gestures, Principle 8's five columns) and the shipped code, and was told not to read the round 1 and 2 deliberation until its findings were written: the Sr. Product Designer; the Motion Designer; the Mobile Information Architect; the Data Scientist with the Data Visualization Designer; Dr. Chen; Jordan; Sam; Trust and Safety; the Dir. of Engineering with QA. §07's settled rulings, overruled dissents and open items were given to every lens as things to carry, not re-argue; a settled ruling could be challenged only with evidence the ruling could not have had, framed as a better-than-the-rule brief.
- **Verification.** One adversarial verifier per lens tried to refute every finding against the page's source, the renders and the code, and corrected category, severity and gating: 118 confirmed, 12 plausible, 13 mock artifacts, 2 refuted. A synthesis pass merged 145 findings into items; a completeness critic then named six gaps (the year, pet switches, the Noticed filter, a medication's doses, Reduce Motion beyond content, the doorways), and six follow-up reads answered them with 60 more findings. 27 agents in all.
- **Evidence.** The page rendered in headless Chromium at 2x: both phone frames at the fold, the whole list scrolled a viewport at a time, every demo pressed, the three sheets and search, with and without Reduce Motion; zero page errors. The screenshots were working files and are not committed; the page is the record and re-renders the same way.
- **Checked by the session lead before posting:** the claims that became filed issues, and the load-bearing claims about shipped code (the widget pet link, the History load race, Home's compaction, the timing lane's feeding input, the Reduce Motion hook, the three "Last 7 days" definitions, the dose query, the Remove confirm, the rundown's visit bound, the filter reset rule). All held. Also cross-checked against issues filed by other sessions the same night (CUL-1107, CUL-1111, CUL-1113, CUL-1118), which the lenses could not have seen; H-2 and H-4 carry them.

## §V · Verification pass, 2026-09-24 (additive; the text above is unchanged)

A refreshed read of Nyx's record for the round-4 mock (the same owner-scoped query shape: Nyx's id paired with her owner's account; counts, names and statuses, never note text) found the round-3 fixture wrong on doses. Each corrected claim above carries a ⚠ pointer to its row here.

- **V-1 · Every dose in Nyx's record names its drug.** 46 doses through Sep 21, every one linked to a named medication item: 33 with no regimen, 13 also linked to a named regimen. None is unnamed. The round-3 fixture's names came from a round-1 query that read only the regimen's `drug_name`, so it drew nameless doses where the record says Cetirizine HCl and Motozol. This corrects GAP-2's "about 44 of Nyx's 45 doses", GAP-3's "unnamed partial dose" on Sep 5 (it is Cetirizine HCl, Partial), GAP-25's "only 1 of 45 doses carries a name" and the query it asked for (answered: none), JOR-01's "Sep 5 carries an unnamed dose", and CUL-1124's premise. **What stands:** the code facts. Shipped EventRow hides the chip on an unnamed dose, and the timeline query names a dose only through the item cache and never joins the regimen, so a free-text regimen dose with no item would render as "Medication". Both stay requirements; Nyx's record cannot demonstrate either, so the fixtures that do are built for them (C-35).
- **V-2 · The July twice-daily run is Motozol,** Jul 17 – 29 at two doses a day, named on every dose. It was a scheduled course, as GAP-25 guessed, and it was never unnamed.
- **V-3 · Photos:** 44 photographed rows through Sep 21; the read ran on 40 and did not on 4 (May 15, the same-minute duplicate, failed; Jun 8 failed; Jun 10 ended with no verdict; Jun 21 was never sent). Round 3's page said 42 and 3. H-4b's facts are unchanged; round 4 draws the three June rows.
- **V-4 · Sep 21 holds eight rows,** where round 3's pull had five, and its Prednisone dose is Partial. Nothing in this critique turned on either.

Found by the session lead while pulling data for round 4 (the same session); the mock's own correction is its ledger's last row.

