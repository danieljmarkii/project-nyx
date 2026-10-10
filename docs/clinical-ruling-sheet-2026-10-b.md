# The clinical ruling sheet, second sitting, October 2026

**Date:** 2026-10-10 · **For:** the PM, ruling under E-6 (amended 2026-09-26; its detection line amended 2026-10-02
by E2 = B′, `docs/clinical-ruling-sheet-2026-10.md` §2.0b) ·
**Replaces:** 38 separate `Waiting on PM` issues, one ruling each, found by the 2026-10-10 staleness pass ·
**Status:** 🧊 dated artifact. The input to a ruling, not a spec. Each row is superseded by the ruling it gets.

## How to read this

The first sheet (`docs/clinical-ruling-sheet-2026-10.md`, CUL-583) answered 22 rows of Part 1 and every Part 2 row
in two sittings. This sheet gathers the clinical calls that were still sitting one per issue on `Waiting on PM` on
2026-10-10, so they can be ruled the same way: one table, one pass.

**E-6, as it stands after both amendments:**

* **Louder** (the app speaks up more: a new card, a lower floor, an added line or ask) is **adopted provisionally**.
* **Quieter** (a raised floor, a relaxed count, a muted ask, a removed concern cue) **needs your sign-off** and proof.
  Where the harness can run a placebo, the proof is **detection above chance**: the catch rate minus the same
  scenario's placebo, flag on against flag off, read beside any vet ask within 56 days with its median delay stated.
  Where it cannot, the row names a substitute proof. Without either, the louder version stays live.
* **Neutral** (wording, ordering, a disclosure, a ratification of what ships) needs only your **agree**.

**What the harness can see today** (`supabase/functions/generate-signal/eval/passLines.ts:50-57`): EN-9 and EN-11
yes; EN-8 (weight) and EN-3/4/7 (the per-incident tiers) no. It scores the Signal engine only, never the trial card,
the trial facts or the vet report. Every quieter row below says which of these it falls under.

**There is no real-vet list any more.** The first sheet sent its lowest-evidence numbers to CUL-1312, and you
canceled that review on 2026-10-02. Rows that would have gone there now come to you with the team's recommendation
and the mark **No source**: no veterinary reference or measurement stands behind the number, only the team's
reasoning. Nothing on this sheet waits on a vet. The one real-vet route left is your own GP visit (Q35, with CUL-598).

**Persona conflicts.** Where the lenses genuinely disagree the row carries no recommendation, only the sides (the
Persona Conflict Protocol). There are four: Q18, Q19, Q22 (half) and Q38. E-6 still tells you which side is louder.

**Every row has the same shape:** the question; today's behaviour at file:line (checked on `main` at `5fb9cd3a`); the
recommendation and its one-line why; the counterexample tried against it and whether it held; the direction versus
today; the verdict E-6 gives that direction. The isolated `adversarial-reviewer` pass is recorded in §6.

**How to answer.** "All agree" takes every A. Otherwise name the exceptions: "All agree except Q3.1 B, Q18 A, Q22 c".
Conflict rows need a letter.

---

## 0. The ruling table

Rows are grouped by what the ruling lets start, most first.

### Part A · Rulings that gate a build or a go-live

| # | Issue | The question | A (recommended) | Other options | Direction | Verdict |
|---|---|---|---|---|---|---|
| **Q1** | CUL-1146 | E-4: how many healthy pets may see a chance insight card within 180 days? (gates PR-31, PR-33) | A ratchet: x = the worst case PR-31 measures on the ratified 13-scenario null set with EN-11 as built, rounded up to the next 5 points; it may only fall. PR-31 also reports what x = 10% and 20% would cost in detection above chance | B: x = 10% now · C: per-lane floors only | A neutral (holds today); B **quieter** | A agree · B **needs your sign-off** |
| **Q2** | CUL-1537 | (a) Does the care state's 5% re-raise line count the burden card? (b) May a zero sit beside "Your vet knows"? (gates EN-9 going live) | (a) Count only the concern's own asks; report the burden card on its own line beside it. (b) Withhold the zero when no symptom has been logged since the answer | (a) B: a lower base rate · C: keep, EN-9 never live. (b) B: keep the zero | (a) neutral (a test line) · (b) safer (withholds a reassuring zero) | Agree · adopt provisionally |
| **Q3** | CUL-1544 | Four edges in the weight lane before `engines_v3_en8` turns on | 1: keep the exact-copy rule until PR-37 drops the pre-fill, then for older rows only · 2: no anchor across a plan with no weigh-in · 3: a stand-down never moves a running plan's start · 4: same-sitting plan writer, 1-day lookback | 1B drop now · 2B start anchors (built) · 3B reset (built) · 4B 7-day lookback | 1, 2 **quieter** · 3 louder · 4 neutral | 1, 2 **need your sign-off** · 3 adopt · 4 agree |
| **Q4** | CUL-1390 | The weight lane's five product calls W3 to W7 (gates PR-37) | W3 A (sources plus one change line on the report) · W4 remove the "(N%)" before the cut · W5 A (a plain Home row asking for a second weigh-in) · W6 a vet plan only · W7 A (a weight row on "How did it go?") | each call's B as listed in §1 | W3, W4, W7 neutral · W5, W6 louder | Agree · adopt provisionally |
| **Q5** | CUL-684 | F-G: may the band's marker gate the Signal card? (gates the taxonomy spec's seam 2) | Rule 1 wins: the marker never gates the card; D28's card-not-band damping is the guard | B: rule 3 wins · C: park §9a until W2a | A louder · B quieter · C neutral | A adopt provisionally |
| **Q6** | CUL-944 | A row stuck in the sync queue shows in the app but not on the vet report: what does the banner do? (gates CUL-1173) | A tappable banner that opens the stuck entries and says they are not in the vet report yet | B: generic copy · C: copy per queue | Louder | Adopt provisionally |
| **Q7** | CUL-1245 | History's day header says "meals not finished" for a refused meal and a half-eaten one alike: split them? | "1 refused · 1 not finished" in the header's grey, one predicate with the Patterns month; land before CUL-1263 so Home inherits it | B: one count, as ruled 2026-10-03 | Louder; **re-opens your HV-9 call 3a** | **Needs your explicit agree** |
| **Q8** | CUL-1235 | Home's Today line counts treats as meals: count them apart? (the unfinished-meals half was ruled (a) on 2026-09-25, CUL-1263) | Count treats as treats inside CUL-1263's build | B: leave treats in "meals" | Louder | Adopt provisionally |

### Part B · Safety words on Home, the Signal, Ask and the trial

| # | Issue | The question | A (recommended) | Other options | Direction | Verdict |
|---|---|---|---|---|---|---|
| **Q9** | CUL-1357 | An old build can still hide an unseen *Worth a call*: guard it on the server? | Accept until 1.2.0 is the installed build; one read-only count of hidden escalation rows on your account now; file the "clear the hide when the read's words change" trigger | B: a server trigger refusing an unwitnessed hide (a migration) · C: an update plus a backfill | Neutral | Agree · B is schema, **needs your typed go** |
| **Q10** | CUL-1732 | Ask drops a read's call words when the read is hidden, while Home and the report keep the call: keep them? | Ask keeps the tier words through a hide and drops only the read text; the words leave only when the owner says "No, it's something else" | B: as built | Louder | Adopt provisionally |
| **Q11** | CUL-648 | The first-insight arrival can play under another pet's safety banner: withhold it? | Withhold while a cross-pet banner is on screen, and defer the once-ever marker rather than spend it | B: leave it | Neutral (removes a celebration, mutes no ask) | Agree |
| **Q12** | CUL-1539 | The Patterns month's weekly bar can read 0 over rose days when a bout crosses the week line | Keep counting episodes; disclose "a bout from the week before continues here" on that week | B: count vomit days · C: count vomits | Louder (a disclosure) | Adopt provisionally |
| **Q13** | CUL-1358 | Six calls on the Signal's not-eating gate | 1 withhold falling diarrhea too · 2 withhold the stood-down vomit line beside a refusal · 3 keep the phone script's compare row and add the not-eating fact · 4 give the screen's not-eating line the 48-hour ask · 5 keep the trial's timing split when the in-trial rapid share rose · 6 add a length cue to a "so far" week | each as shipped | 1, 2 safer · 3, 4, 5 louder · 6 neutral | Adopt provisionally |
| **Q14** | CUL-772 | A Signal rebuild whose push failed renews a 24-hour cache over a record missing the new rows | Treat unsent rows as an incomplete read, so the existing 1-hour expiry applies | B: skip the rebuild while rows are unsent · C: accept | Louder | Adopt provisionally |
| **Q15** | CUL-1574 | On the milestone day a free-fed trial loses the bowl's watch line | Carry the bowl line alone on the milestone when a bowl is in force | B: leave it · C: Get ready only | Louder | Adopt provisionally |
| **Q16** | CUL-1341 | *For the call*: a recent cluster blends into the trial count; the line vanishes off the refusal face; a missing count reads as none | 1 a presence-only recent sub-count · 2 the line follows "not eating" rather than the live register · 3 a line saying the count is unavailable | each as shipped | Louder | Adopt provisionally |
| **Q17** | CUL-1056 | Does the Change-the-window sheet restate a live refusal? | No: the sheet opens only from the trial screen, below *For the call*. (Its other question, the Replace row's look, goes to the Designer's mock round) | B: restate the refusal sentence | Neutral | Agree |
| **Q18** | CUL-1597 | TD-5: is a call-now "Not yet" asked once more that evening? | **No recommendation (conflict).** A, Dr. Chen: once more after 6 PM, on screen, never again · B, Jordan: as built, nothing re-asked | | A louder · B neutral | **Your letter** |
| **Q19** | CUL-1596 | Does the eight-week "Did your vet want to see her again?" ever reach an owner? | **No recommendation (conflict).** A, the team: keep it off · B, Dr. Chen: turn it on · C: re-measure after CUL-1531 and Q2 | | A neutral · B louder | **Your letter** |

### Part C · The engine's chronicity lane and food findings

| # | Issue | The question | A (recommended) | Other options | Direction | Verdict |
|---|---|---|---|---|---|---|
| **Q20** | CUL-686 | A dense cough is silent for 21 days: add an intensity arm? | A burden arm for cough on the shape of vomit's shipped burden card, its numbers measured on the corpus with a stated noise gate and brought back as a row | B: accept and document · C: wait for W2's breathing lane | Louder | Adopt provisionally; the numbers **No source** |
| **Q21** | CUL-685 | One pet with two chronic courses: the cross-pet banner names one | Add "…and another ongoing sign" when a second course is ongoing | B: keep longest-span, documented | Louder | Adopt provisionally |
| **Q22** | CUL-689 | ⑦ ordering has no recency term | Move the cough-vomit adjacency mark to the most recent course. **The ordering itself: no recommendation (conflict)** | ordering a: span first (Data Scientist) · ordering c: span first unless one course is quiet past a bound (Dr. Chen) | Mark neutral · ordering neutral | Mark agree · ordering **your letter** |
| **Q23** | CUL-793 | The chronicity compare borrows the 7-day 0.7 density ratio for 28-day halves | Its own named constant at 0.7, plus a trailing-dark-run rule: a recent half whose last 7 days hold no logged day never reads at face value | B: a stricter ratio · C: leave it | Louder | Adopt provisionally; the 7 days **No source** |
| **Q24** | CUL-203 | Under EN-11 every joint food candidate is withheld, so two always-co-fed foods yield no food finding | Accept it: it is D5 = B as ruled. Name joint candidates among the cards CUL-1486's GA-day marker withdraws | B: a "feed them apart" suggestion · C: a test for joint candidates | Records a ruling | Agree |

### Part D · The vet report

| # | Issue | The question | A (recommended) | Other options | Direction | Verdict |
|---|---|---|---|---|---|---|
| **Q25** | CUL-1030 | An overnight discovery window prints as two clock times with no dates | Date each end of a range whose day differs from the row's | B: date by the earliest time · C: explain in the preamble | Neutral | Agree |
| **Q26** | CUL-1004 | What does `Set it up` on the send bar open? | A mid-trial "this is the trial diet" write dated today; earlier feedings of that food fall under R13a; the protein mismatch heads-up runs on it | B: the Manage sheet (end and restart) · C: no button, as shipped | **Quieter** in the mis-set case | **Needs your explicit agree** |
| **Q27** | CUL-994 | Keep the always-printed dose-span sentence that shipped in place of the suppression the issue specified? | Keep it | B: restore the suppression · C: suppress on a day-count predicate | Neutral (ratifies what ships) | Agree |
| **Q28** | CUL-1027 | "N changes overlap this window" counts agents while the chart draws starts and stops | Keep "N changes" and let the legend reconcile the marks | B: rename the noun · C: count starts and stops | Neutral | Agree |
| **Q29** | CUL-1018 | Removing a food from the trial's original allowed list draws no mark | Mark it when its date differs from both the trial's start and its end | B: never (as built) · C: every removal | Louder | Adopt provisionally |

### Part E · Records, words and ratifications

| # | Issue | The question | A (recommended) | Other options | Direction | Verdict |
|---|---|---|---|---|---|---|
| **Q30** | CUL-1231 | A dose re-answered "given directly" still names the meal it was logged with | The owner's answer wins: "Prednisone · directly" | B: the link wins (as built) · C: both | **Quieter** on the dose row | **Needs your explicit agree** |
| **Q31** | CUL-913 | The spec says the look's refusal recency is 2 days; the code is 3 | Write 3 into T-20 and §2 item 12 | B: back to 2 | Neutral (records a shipped number) | Agree |
| **Q32** | CUL-915 | A word's per-week spread is computed and gated on, never shown | Show it on the row's sub-line, after a mock frame | B: raise the floor · C: accept and say so in §7 | Louder | Adopt provisionally |
| **Q33** | CUL-1074 | Weight dots on Patterns: grey as shipped, or the round-4 teal? | Grey, as shipped | B: teal · C: primary ink | Neutral | Agree |
| **Q34** | CUL-272 | Who writes the critical-drug list now that no vet review is coming? | The team drafts it from published references, qualified by indication, and brings it back as a row | B: an owner toggle · C: keep `is_critical` dormant | Louder | Adopt provisionally; the list itself comes back for your agree |
| **Q35** | CUL-672 | The §15 vet question sheet: keep or drop? | Keep it as an errand for your own vet, sent with the CUL-598 report; merge #765 | B: drop it, close #765 | Neutral | Agree |
| **Q36** | CUL-591 | Ask reports an overrun trial as "active, day N of M": gate it? | Let it stand, as the trial screen does | B: gate Ask on `isTrialRunning` | Neutral | Agree |
| **Q37** | CUL-590 | The course-end prompt's "Your vet has the final say." | Keep it | B: a fuller deferral · C: drop it | Neutral | Agree |
| **Q38** | CUL-595 | May a photo zoom past its real pixels? | **No recommendation (conflict).** A, Engineer and Designer: keep 2.5 · B, Dr. Chen: stop at 1 | | Neutral | **Your letter** |

**Not on this sheet:** the non-clinical calls still on the queue (App Store, privacy, money, schema and process
items) and the per-PR device checks. Those are briefed in the staleness report of 2026-10-10.

---

## 1. Part A · Rulings that gate a build or a go-live

### Q1 · CUL-1146 · E-4, the chance-card budget

* **Today:** N4 ratified PR-15's 13 null scenarios as the null set on 2026-10-02 and left E-4's number open
  (`docs/clinical-ruling-sheet-2026-10.md:859-871`). Every other D and E brief on CUL-1146 is ruled. PR-31
  (CUL-1422, CUL-1424) and PR-33 (CUL-1423) wait on the number. The one measurement on record: EN-11 cuts chance
  cards on healthy pets from 83% to 28% (first sheet, E2), on one scenario, not the 13-scenario worst case.
* **The statistic (E-4 A, ruled in shape):** the share of null pets that see at least one insight-card onset within
  180 days, worst case over the named scenarios, Monte Carlo size stated, safety lanes reported beside it.
* **Recommendation (A): a ratchet.** Set *x* to the worst case PR-31 measures across the 13 scenarios with EN-11 as
  built, rounded up to the next 5 points, written as a ceiling that may only be lowered. PR-31 also reports the
  detection cost (above chance) of x = 10% and x = 20%, so a tighter number can come back as its own row.
  **Why:** no source names a number, and a number picked blind either passes everything or holds back lanes nobody
  has measured; the ratchet stops any regression now and turns the real choice into a measured one.
* **Counterexample tried:** a lane that is fine on average and bad in one scenario (the two-cat home). The ceiling is
  the worst case across scenarios, so that lane binds. **Held.** Second: A blesses whatever EN-11 does today, even if
  that is more than one healthy pet in four. **Not held as a quality bar, and not claimed to be one:** A prevents
  regression; only B or a later measured row lowers the rate.
* **Direction:** A neutral. B quieter (fewer insight cards; insight cards are benign class and the safety lanes sit
  outside the budget, so no safety ask is muted, but a true food reaction is named later or not at all).
* **Verdict:** A agree. B needs your sign-off, with detection above chance on EN-11 (the placebo arm is CUL-1493).

### Q2 · CUL-1537 · the care state's re-raise line, and a zero beside "Your vet knows"

* **Today (a):** `EN-9.reRaise` counts any ask about the acknowledged sign within 56 days, at 0.05
  (`supabase/functions/generate-signal/eval/passLines.ts:102-115`). The burden card, which the care state may never
  quiet (care spec §4.4, AC 3), re-asks 18 of 30 stable cats on its own, so no care state can pass. The care spec
  waits on this row (`docs/nyx-care-state-requirements.md:227`).
* **Today (b):** a zero is withheld only beside a masking drug, within 42 days of a visit, or over thin logging
  (`supabase/functions/generate-signal/careState.ts:1017-1020`); the test pins "0 episodes, with something logged on
  14 of 14" as honest (`careState.test.ts:449-450`).
* **Recommendation (a), A:** the line counts only asks from the concern itself; the burden card gets its own line,
  reported beside it. **Why:** counting the net measures the net, not the care state. Even under A the concern alone
  re-asks 13 to 33%, so PR-16's frontier work still has to reach 5%: this row makes the line passable, not passed.
* **Recommendation (b), A:** withhold the count when it is zero and no symptom has been logged since the answer;
  keep the window and the logging line. **Why:** next to "Your vet knows", a zero over a stream that may have stopped
  being logged reads as "it worked" (absence is not wellness).
* **Counterexample tried (a):** an acknowledged cat whose vomiting doubles. The burden card still fires (it is never
  quieted), and its re-ask still shows on its own line. **Held:** nothing an owner sees changes; one number splits in
  two. **(b):** a cat genuinely well for 20 days with meals logged daily. The row keeps its window and logging and
  drops only "0 episodes". **Held:** the cost is a missing true zero, the safe direction.
* **Direction:** (a) neutral (a test definition). (b) safer: removes a reassuring number.
* **Verdict:** (a) agree. (b) adopt provisionally.

### Q3 · CUL-1544 · four edges in the weight lane

Built dark in PR-19 (#1014, `lib/weightStory.ts`); `engines_v3_en8` is unseeded. The harness cannot see EN-8 until
PR-19's rows feed it weights (`passLines.ts:54`), so **the quieter edges have no harness proof**; the substitute is
the counted cost each states.

* **3.1 · Identical weigh-ins.** Today `EXACT_COPY_NEVER_PAIRS = true` (`lib/weightStory.ts:110`, :194-196): two
  weigh-ins equal to the gram never confirm. **A:** keep it until PR-37 removes the log's pre-fill, then apply it only
  to rows written before PR-37. **Why:** a pre-fill saved unchanged would otherwise confirm a lone reading. **Cost,
  stated plainly:** "4.2 kg, then 3.73 kg three times", the shape of the case that motivated the lane, stays silent
  until PR-37; a 1%-a-week loss weighed monthly is caught 4 to 9 weeks later. **Quieter than the first sheet's W1**
  (two consecutive home readings confirm). **Needs your sign-off.**
* **3.2 · A finished plan with no weigh-in during it.** Today (B, built) the start weight anchors, so a prescribed 10%
  loss reads as an unplanned soft card once the plan ends. **A:** no anchor across the plan. **Why:** the record
  cannot tell whether the loss happened during the plan or after it. **Cost:** a real post-plan loss is caught later.
  **Quieter. Needs your sign-off.**
* **3.3 · A stand-down mid-plan.** Today (B, built) a stand-down resets the plan's cumulative line, so a cat 14.7%
  below her start, past a 10% target, goes silent. **A:** a stand-down never moves a running plan's start weight.
  **Louder. Adopt provisionally.**
* **3.4 · How old a start weigh-in may be.** Today the lookback is one day. **A:** PR-37's writer sets the plan in the
  same sitting as the visit's weigh-in, so the one-day lookback holds; B widens it to 7 days. **Neutral (as built).**
* **Counterexample tried:** 3.1, a single mistyped 3.37 kg then two pre-fill saves. Under B that confirms a typo and
  raises a firm card; under A it waits. **A held for the reason given, and its cost is the motivating case**, which is
  why this is a sign-off, not a default. 3.3, the 14.7% cat: under A the cumulative line still fires. **Held.**
* **Recorded costs that stand provisionally** (louder, for the PMD-9 re-run, not for ruling): the 0.6 kg rule behaves
  like a single-reading rule above about 12 kg; a 30 kg dog with no birthday gets a soft card on about 0.23 kg; one
  mistyped weight can raise a firm card; the 2%-a-week plan rate fires on 8 to 25% of cats following their plan.

### Q4 · CUL-1390 · the weight lane's product calls W3 to W7

These are CUL-1390's own numbers, not the first sheet's W rows (that sheet's §2.3 maps the two). W1 and W2 were
ruled on 2026-09-28. Briefs: `docs/nyx-weight-lane-requirements.md` §0 (`:46-80`).

* **W3 · the vet report. A:** each reading with its source, plus one change line from the same predicate; no finding
  row, no loss flag. **Why:** a vet trusts two dated, sourced readings more than an app's verdict. Needs a Tier-2 edit
  to the report spec §3.3 and a `vet-report-cold-read`. **Neutral.**
* **W4 · the "(N%)" on Patterns. A: remove it before the 1.2.0 cut.** It prints for every account on `main` today
  (`lib/chartCopy.ts:354`; the spec cites :225), but no store owner has it until 1.2.0, so removing it now costs nobody
  anything. After the cut, removal takes away a number owners have seen. **Neutral.**
* **W5 · a drop on one reading. A:** a plain Home row with no vet ask: "One reading so far, on a home scale. Weigh her
  again this week to check." It leaves once a later reading arrives. **Louder than nothing on Home.**
* **W6 · who sets "planned loss". A:** a vet plan only, as a plan row on "How did it go?". **Louder** than also
  allowing an owner switch, which would let an owner quiet the card on their own judgment.
* **W7 · a clinic weight. A:** an optional weight row on "How did it go?". **Neutral.**
* **Counterexample tried:** W5 on a real 15% loss logged once on a home scale. The row asks for a second weigh-in, not
  a vet call; an owner who never weighs again gets nothing more. **Held as ruled:** that is PMD-9's trade (first sheet
  W1), which this row does not re-open.
* **Verdict:** W3, W4, W7 agree. W5, W6 adopt provisionally.

### Q5 · CUL-684 · F-G, the marker and the card

* **Today:** the taxonomy spec is at v1.6 seam 1 and unchanged since 2026-08-30 (`docs/nyx-event-taxonomy-requirements.md:2`);
  rule 1 says the band's marker never gates the card, rule 3's scoping sentence says it governs the card's arrival.
  W2a and W2b stay unbuildable until §9b passes, whatever this row says.
* **Recommendation (A): rule 1 wins.** The marker never gates the client-injected card; D28's card-not-band damping is
  the guard. **Why:** it is the team's 2026-08-30 recommendation, and it keeps the fourth exit's backstop.
* **Counterexample tried:** a band marker and its card both on screen for one sign. D28 damps the card rather than the
  band. **Held on the spec as written.** Seam 2 should re-check rule 6a's premises against the client offline floor
  preview that shipped since (#1122).
* **Options:** B, rule 3 wins (markers stay scarce; the fourth exit loses its backstop). C, park §9a and take it off
  your queue until W2a is greenlit; W2 is not on the App Store path.
* **Direction:** A louder. **Verdict:** adopt provisionally.

### Q6 · CUL-944 · a stuck row is visible in the app and absent from the vet report

* **Today:** the banner says to "open one from History and save it again to retry"
  (`components/ui/SyncBanner.tsx:39-40`); there are 21 queues now, not 15 (`lib/syncQueue.ts:318`). The widget and
  the rundown read medications locally (`lib/widgetSnapshot.ts:490`, `lib/rundown.ts:621`), so a stuck dose shows
  there while the server-built report omits it. History's "not saved" row waits on this ruling (CUL-1173).
* **Recommendation (A):** a tappable banner that opens the stuck entries, works for all 21 queues, and says plainly
  that they are not in the vet report yet. **Why:** the owner can only fix what they can find, and the report is the
  place the gap costs most.
* **Counterexample tried:** a stuck medication dose before a vet visit. Under A the banner names it as missing from
  the report and opens it. **Held**, provided the copy names the report (the condition is in A).
* **Direction:** louder. **Verdict:** adopt provisionally. Unblocks CUL-1173 and CUL-640's copy half.

### Q7 · CUL-1245 · refused and half-eaten meals share one count

* **Today:** one merged "meals not finished" count (`lib/historyDays.ts:187`, :350), printed on History's header and,
  since #1034, on Meal's filter row. The Patterns month already keeps refused and left-some apart
  (`components/designV2/patterns/MonthInstrument.tsx:543-544`), so two surfaces disagree.
* **Recommendation (A):** "1 refused · 1 not finished" in the header's grey, from one predicate shared with the month;
  land it before CUL-1263 so Home's Today line inherits the split. **Why:** intake is not preference: a refusal folded
  into "not finished" reads as fussiness one level above the rows.
* **The predicate must be the app's one refusal predicate:** `lib/intakeEvidence.ts` counts Refused and Picked as
  refusal. If the header puts Picked under "not finished" while the engine counts it as refusal, the surfaces disagree
  again. The build uses `intakeEvidence`'s classes, and the month moves to them if it differs.
* **Counterexample tried:** a cat that picked at three bowls. Under A with the shared predicate it reads "3 refused".
  **Held.** Under a month-only predicate it could read "3 not finished". That is why the predicate condition is part
  of A.
* **Direction:** louder. **Re-opens a ruling:** your HV-9 call 3a (CUL-1520 item 13, 2026-10-03) adopted the merged
  count. **Verdict: needs your explicit agree**, because it unseats a ruling of yours, not because it is quieter.

### Q8 · CUL-1235 · treats counted as meals on Home

* **Today:** `countLine` (`lib/spineNode.ts:746`) over `buildCountChips` (`lib/daySummary.ts:441-470`) counts every
  meal-category row as a meal, treats included. The unfinished-meals half of this issue was ruled (a) on 2026-09-25
  and is CUL-1263 (Todo). Your comment on CUL-513 today called the whole line open; only the treats half is.
* **Recommendation (A):** count treats as treats, inside CUL-1263's build. **Why:** on a diet trial an off-diet chew
  should not hide inside "meals", and History's header already counts treats apart.
* **Counterexample tried:** a refused treat. Treats never count toward "not finished" (the intake predicate excludes
  them), so it shows only as "1 treat". **Held.**
* **Direction:** louder. **Verdict:** adopt provisionally. Rule with Q7: both change the same line.

---

## 2. Part B · Safety words on Home, the Signal, Ask and the trial

### Q9 · CUL-1357 · an old build can hide an unseen *Worth a call*

* **Today:** the hide is a client-only compare-and-set (`lib/analysisDismissal.ts`, #952); builds before #952 hide
  unconditionally. Since History v2's GA the rose survives a hide on every current surface (`lib/readState.ts:62-69`),
  and `generate-signal` and `generate-report` never read `dismissed_at`, so Home's safety band and the vet report keep
  the call. What an old-build hide can still silence is the read's words on the incident screen, and Ask's (Q10).
* **Who has an old build:** TestFlight only. 1.2.0 is the first store build, so no store owner will ever run a build
  without #952.
* **Recommendation (A):** accept until 1.2.0 is the installed build; run one read-only count of hidden escalation rows
  on your account now (owner-scoped per C-27) and un-hide any it finds by hand; file the "clear the hide when the
  read's words change" trigger as its own issue. **Why:** the harm is now one surface's words for TestFlight testers,
  and B buys a migration to close it.
* **Counterexample tried:** a tester on the 08-29 build hides an unseen call on a vomit read. The incident screen loses
  the words; Home's band, History's rose and the report keep the call. **Held:** the call still reaches the owner on
  three surfaces.
* **Options:** B, a `BEFORE UPDATE` trigger that refuses an unwitnessed hide on an escalation row (schema, its own PR,
  your typed `apply`). C, an update plus a one-time backfill un-hiding escalation rows.
* **Direction:** A neutral. **Verdict:** agree. B is on the never-list (schema) and needs your typed go.

### Q10 · CUL-1732 · Ask drops a hidden read's call words

* **Today:** `supabase/functions/ask/tools.ts:930-933` nulls both the read text and `tierWords` when a read is
  dismissed. Home and the report keep the call.
* **Recommendation (A):** Ask keeps the tier words through a hide and drops only the read text. The words leave Ask
  only on the one act that stands the rose down, the owner's "No, it's something else" (`lib/readState.ts:68-69`).
  **Why:** a hide is about the note, never about the call; Ask should follow the rule every other surface follows.
* **Counterexample tried:** an owner hid the note because the photo was of something else. Under a plain "keep the
  words" Ask would still say "worth a call" about it. **Held only with the "something else" exit**, which is why it is
  part of A.
* **Direction:** louder. **Verdict:** adopt provisionally. Rule with Q9.

### Q11 · CUL-648 · the arrival under another pet's safety banner

* **Today:** the arrival's safety gate reads only the active pet's findings (`components/home/SignalZone.tsx:727`);
  `CrossPetSafetyBanner` sits directly above it on Home (`app/(tabs)/index.tsx:254`, :259).
* **Recommendation (A):** withhold the arrival while a cross-pet banner is on screen, and defer the once-ever marker
  rather than spend it, as CUL-649's team call already does for a backgrounded app. **Why:** a celebration must never
  decorate a visible concern (S1).
* **Counterexample tried:** the banner appears after the arrival has started. A checks at the start only. **Partly
  held:** the build should also stop the arrival if a banner arrives mid-play.
* **Direction:** neutral. **Verdict:** agree. CUL-646 (which empty states may trigger the arrival) is a separate,
  non-clinical call still on your queue; rule them knowingly together.

### Q12 · CUL-1539 · the weekly bar reads 0 over rose days

* **Today:** `weeklyBuckets` counts episode days (`lib/chartModels.ts`), so a bout that began last week and continues
  draws 0 this week over a row of rose days; `MonthInstrument.tsx:563-564` admits it. CUL-1530 (a) kept episodes on
  purpose. Both GAs shipped without this ruling, so every account sees it.
* **Recommendation (A):** keep counting episodes and add, on that week, "a bout from the week before continues here".
  **Why:** the bar's unit is onsets and 0 new onsets is true; the disclosure says what the reader would otherwise
  misread (C-4).
* **Counterexample tried:** a bout spanning three weeks. The disclosure prints on each continuing week, and the label
  never says "0 vomits". **Held**, with that wording condition.
* **Direction:** louder. **Verdict:** adopt provisionally.

### Q13 · CUL-1358 · six calls on the not-eating gate

Since CUL-1216 the Signal withholds a falling vomit comparison while a pet is not eating (`lib/signalVisible.ts:18`,
:69-80). The rows below are the team's recommendations from that adversarial pass and its re-review.

1. **Diarrhea too.** A falling diarrhea pair beside a not-eating record is withheld (less food in, less stool out).
   **Safer.** Owes the §13a membership walk (C-11).
2. **The stood-down vomit line.** "No vomiting logged in 14 days" is withheld while a trial refusal is on record.
   **Safer.**
3. **The phone script.** Keep the falling chronicity row read to the vet, and add "and {pet} hasn't been eating
   normally". The owner's face stays withheld. **Louder.**
4. **The screen's not-eating line** gains the 48-hour ask when the intake card is not on the same screen. **Louder.**
5. **The trial's timing lanes.** Keep "Before the trial · In the trial" split when the in-trial rapid share rose, even
   though the total fell. The team's condition was "if the timing shift is clinically material"; this sheet reads it as
   material, because vomiting soon after meals appearing only on the new diet points at the diet or the eating, which
   is the question the trial exists to answer. **Louder.**
6. **A "so far" week.** "0 this week so far · 4 last week" from Tuesday gains a length cue (B-775's form) saying the
   windows differ. **Neutral.**

* **Counterexample tried:** row 1 on a dog whose diarrhea is truly improving on the trial while intake dips for a day.
  The improvement is withheld until intake recovers. **Held:** withholding is the safe error and lifts by itself.
  Row 3: the vet hears both facts together. **Held.**
* **Verdict:** adopt provisionally, all six.

### Q14 · CUL-772 · a failed push renews a calm cache

* **Today:** a Signal rebuild that runs while the device's push failed swallows the failure (`lib/signal.ts:905-906`)
  and the server writes a 24-hour cache over a record missing the new rows. Only an incomplete server read earns the
  shorter expiry (`supabase/functions/generate-signal/index.ts:142`, :835). When the rows land later, no rebuild
  follows: the only regen callers are `lib/simpleEvent.ts:153` and the care-answer drain (`lib/sync.ts:3701`).
* **Recommendation (A, the 2026-09-24 recommendation, mostly built):** the client sends an "unsent rows" flag and the
  function adds it to `incompletePulls`, so the existing 1-hour expiry applies. **Why:** a calm card must not stand
  for a day over a vomit the server has not seen (CUL-989: an incomplete read never reassures).
* **Counterexample tried:** a phone offline for a day with a vomit logged. The server cannot see the row either way;
  under A the card re-checks within an hour of the row landing rather than a day. **Held.**
* **Direction:** louder. **Verdict:** adopt provisionally.

### Q15 · CUL-1574 · the milestone day loses the bowl's watch line

* **Today:** the milestone maps to `floor_only` (`lib/dietTrialCard.ts:1016-1017`), which draws no lines, so "The
  bowl also can't tell you if {pet} stops eating. That part is yours to watch." is absent on the decision day. CUL-1554
  carried the bowl line only onto `overrun`.
* **Recommendation (A):** carry the bowl line alone on the milestone when a bowl is in force, the way the floor rides on
  `floor_only`. **Why:** it is the only option that covers a recheck booked for the milestone day.
* **Counterexample tried:** the milestone falls on the day intake decline fires. The safety register leads and the
  bowl line sits beneath it. **Held.**
* **Direction:** louder. **Verdict:** adopt provisionally.

### Q16 · CUL-1341 · *For the call*, three gaps

`lib/trialForTheCall.ts:115-130` builds "Vomiting logged: {k} in the trial's {N} days, the last on {date}" on the
refusal face only (your ruling, 2026-09-27).

1. **A recent cluster.** Add a presence-only sub-count when two or more fall in the last 48 hours: "…, 3 of them since
   Sep 26". Never a zero, never a compare.
2. **Faces with no vomiting fact.** The presence-only line follows `isAnimalNotEating` rather than the live register,
   so it shows on the stand-down day and the intake-decline face too. Pairs with CUL-1310.
3. **A missing count.** When the counts are unavailable (`if (!counts) return null`, :117), say so in one line rather
   than showing the zero form.

* **Counterexample tried:** 12 old vomits and 1 today: no sub-count (fewer than two in 48 hours), and the last date
  already shows recency. **Held.** A stale-active trial with no counts: row 2 wants the line, row 3 supplies the
  "unavailable" form. **Held** together.
* **Direction:** louder. **Verdict:** adopt provisionally. The "Dr. Chen to rule" route on the issue no longer exists;
  this row is that ruling.

### Q17 · CUL-1056 · the Change-the-window sheet over a live refusal

* **Today:** since the trial screen's GA the Pet tab shows only a door for a running trial; the Manage and window
  sheets open only from the trial screen (`components/trial/TrialLifecycleSheets.tsx`, used by
  `components/trialScreen/TrialScreen.tsx` alone), where *For the call* sits above *Change or end the trial*
  (`docs/nyx-trial-screen-requirements.md` §0.3).
* **Recommendation (A):** the window sheet does not restate the refusal. **Why:** every route to it passes the call
  block first.
* **Counterexample tried:** an owner who reaches the sheet without passing the refusal face. No such route exists on
  `main`. **Held**, and the build that adds any new door to the sheet owes this row again.
* **Not clinical, on the same issue:** whether the Manage sheet's *Replace the trial* row should look different and
  name the days at stake. That challenges the ratified mock §2, so it goes to the Designer's next trial-extension
  mock round as a better-than-the-rule brief.
* **Direction:** neutral. **Verdict:** agree.

### Q18 · CUL-1597 · TD-5, "Not yet" on a call-now read (conflict)

* **Today:** B is built provisionally (`components/event/CallAnswers.tsx:37`: "NOT YET WRITES NOTHING"). The care spec
  keeps TD-5 as its one open conflict, with the dissents recorded. `engines_v3_en14` is unseeded, so no owner sees
  either version yet.
* **A (Dr. Chen):** ask once more, on the incident screen, after 6 PM that evening, and never again for that
  escalation. **Louder:** under E-6 it would be adopted provisionally if it were the team's recommendation.
* **B (Jordan, built):** nothing written, nothing re-asked, because a second ask invites a false "I've called".
* **Counterexample tried against A:** an owner who has decided to wait for morning taps "Not yet" twice. A records
  nothing either time and asks no third time. **Held.** Against B: an owner distracted at 2 PM is never asked again
  about a call-now read. **Held as B's stated cost.**
* **Verdict:** your letter. Not urgent until en14 is seeded.

### Q19 · CUL-1596 · the eight-week recheck question (conflict)

* **Today:** built and off (`supabase/functions/generate-signal/careState.ts:113`, `recheckQuestionDays: null`); the
  care spec §4.8 says "ruling pending" (`:213`).
* **A (the team):** keep it off. It asks 100% of pets on both sides, so it cannot tell a vet plan that is helping from
  one that is not.
* **B (Dr. Chen):** turn it on: still chronic at eight weeks is worth a vet's look. **Louder.** Needs a Home door that
  does not exist and a flag-on run.
* **C:** re-measure after CUL-1531 and Q2(a); C becomes real only once Q2 is ruled.
* **Verdict:** your letter.

---

## 3. Part C · The engine's chronicity lane and food findings

### Q20 · CUL-686 · a dense cough is silent for 21 days

* **Today:** cough's chronicity floor needs a 21-day span with no burden term
  (`supabase/functions/generate-signal/detection.ts:2887-2894`); cough enrols in that lane only. Vomit's burden card
  (PR-14d, CUL-1410, CUL-1311) is vomit-only. The issue's option (a) cites "the day summary and Trend" as cover; the
  Trend zone was deleted at Design v2's GA (#1070), so only the day summary and History remain.
* **Recommendation (A):** a burden arm for cough on the shape of vomit's shipped burden card, with its own noise gate
  measured on the corpus; the arm's numbers come back to you as a row. **Why:** a dense, recent cough is the shape of
  an asthma crisis or early heart failure, and the burden lane now exists to copy. Do not lower the 21-day span: it is
  the floor that keeps self-limiting coughs quiet.
* **Counterexample tried:** a dog with kennel cough, ten coughs a day for five days. Under A the burden arm fires and
  asks for a vet visit. **Held as the safe error:** a persistent dense cough is worth a look even when it resolves.
* **Direction:** louder. **Verdict:** adopt provisionally; the numbers are **No source**.

### Q21 · CUL-685 · two chronic courses, one banner

* **Today:** the cross-pet banner keeps the first chronicity card the server sends (`lib/signalCopy.ts:2563-2573`,
  strict `<`); the server orders by span (`detection.ts:5474-5481`). Nothing says there is more than one course.
* **Recommendation (A):** add "…and another ongoing sign" when a second course is ongoing. **Why:** it discloses
  without inventing a severity order between two signs (C5); the team was unanimous.
* **Counterexample tried:** a second course that stood down last week. It is not ongoing, so the clause does not
  print. **Held**, with "ongoing" meaning within the course's recency window.
* **Direction:** louder. **Verdict:** adopt provisionally. Same build session as Q22.

### Q22 · CUL-689 · ⑦ ordering has no recency term (half conflict)

* **Today:** the lane sorts by span, then episodes (`detection.ts:5474-5481`; the same tie-break at :7679-7684); the
  cough-vomit adjacency disclosure marks the leading card (:8179-8199).
* **The mark (A, every lens):** move the adjacency mark to the most recent course. **Neutral. Agree.**
* **The ordering (conflict):** a, span first (Data Scientist); c, span first unless one course has been quiet past a
  bound (Dr. Chen). Both reject b. Neither drops a card. Under c the bound is **No source**.
* **Verdict:** the mark agree; the ordering your letter.

### Q23 · CUL-793 · the compare's density ratio

* **Today:** `computeChronicityCompare` uses the shared `DENSITY_COMPARABLE_MIN_RATIO = 0.7` (`detection.ts:4776`,
  :4809), calibrated for 7-day windows. Over 28-day halves it lets eight unlogged days in a row pass, including the
  last eight before today. Both counts always print and the ask never moves, so nothing reassures on its own.
* **Recommendation (A):** a named `CHRONICITY_COMPARE_MIN_RATIO` at 0.7 (no change in value), plus a trailing-dark-run
  rule: when the recent half's last 7 days hold no logged day, the pair never reads at face value and the "you also
  logged on fewer days" line prints. **Why:** the ratio's value has no source either way, while a trailing dark run is
  the specific case the reviewer showed passing.
* **Counterexample tried:** an owner who logs nothing for a week because the cat is well. The disclosure prints over a
  real improvement. **Held as the safe error** (absence is not wellness).
* **Direction:** louder. **Verdict:** adopt provisionally; the 7 days are **No source**. It deploys on merge.

### Q24 · CUL-203 · joint food candidates under EN-11

* **Today:** a joint candidate (`detection.ts:4022`) always tiers Early, and EN-11 withholds every Early finding
  (:4094-4106). At EN-11's GA, two always-co-fed foods yield no food finding at all.
* **Recommendation (A):** accept it. It is D5 = B as ruled (no food finding before a real test passes), applied to
  joint candidates. Name joint candidates among the cards CUL-1486's GA-day marker withdraws, so the change is said.
  **Why:** a "feed them apart" suggestion (B) only fires where the record already suspects those foods, so it is an
  association claim in all but name, which D5 = B rules out.
* **Counterexample tried:** a dog truly reacting to one of two always-co-fed foods. EN-11 names neither. **Not held,
  and not claimed to:** this is the cost D5 = B accepted, recorded here so it is not rediscovered.
* **Direction:** records a ruling. **Verdict:** agree.

---

## 4. Part D · The vet report

### Q25 · CUL-1030 · an overnight window reads as logged before it happened

* **Today:** `occurredCell`'s range case prints two clock times with no dates (`supabase/functions/generate-report/render.ts:7474`).
* **Recommendation (A):** date each end of a range whose day differs from the row's day. **Why:** a vet reading
  "11:40 PM – 7:10 AM" on a single dated row cannot tell the order; dates settle it.
* **Counterexample tried:** a pile found after a two-night absence. Both ends carry dates. **Held.**
* **Direction:** neutral. **Verdict:** agree.

### Q26 · CUL-1004 · what `Set it up` opens

* **Today:** the button was cut before shipping (`app/report.tsx:48`); the line it sat under still shows (:500–506).
  The only code that writes a trial diet is trial setup (`lib/dietTrialSetup.ts:427`).
* **Recommendation (A):** a mid-trial "this is the trial diet" write, dated today, never back-dated. Feedings of that
  food before today fall under R13a (out of the off-diet count, shown as a gap, the clean claim withheld), which you
  signed off on 2026-10-01. The trial-protein mismatch heads-up (TP-2) runs on the new row.
  **Why:** today the only fix for a trial set up without its diet is ending the trial, which loses its dates.
* **Counterexample tried:** an owner sets the wrong food as the trial diet mid-trial. From today its feedings stop
  counting as off-diet. **Quieter, and new:** R13a covered only the past. TP-2 catches a mismatch with the recorded
  target protein, but not a wrong food of the right protein. **Partly held.**
* **Direction:** quieter in the mis-set case. **Verdict: needs your explicit agree.** No harness proof exists for the
  trial card or the report; the substitute is a test that a mis-set food after today is named on the report's allowed
  list with its "added on" date, so a vet can see it. Whatever you rule, `/trial-foods` needs a designed empty state in
  place of its spinner.

### Q27 · CUL-994 · the dose-span sentence

* **Today:** #858 shipped a sentence that always prints the dose span (`render.ts:6526`) in place of the suppression
  the issue specified, after two adversarial rounds.
* **Recommendation (A):** keep it. **Why:** Dr. Chen, the Data Scientist, the Dir. of Engineering and the adversarial
  reviewer all recommend it, and a printed span hides nothing.
* **Counterexample tried:** none found that the always-printed form makes worse. **Held.**
* **Direction:** neutral. **Verdict:** agree. The issue's Part 1 (qualifiers for the whole-course figure) leaves the
  sheet for a Designer and Dr. Chen discovery session.

### Q28 · CUL-1027 · "N changes" against starts and stops

* **Today:** `readingTheTrend` prints "N changes overlap this window" counting items (`render.ts:5406`), while R-14
  draws a mark for each start and each stop.
* **Recommendation (A):** keep "N changes" and let the legend reconcile them with the marks. The cold read wanted
  events counted; the adversarial reviewer wanted the noun renamed.
* **Counterexample tried:** one food started and stopped inside the window: "1 change" beside two marks. The legend
  names a change as its start and its stop. **Held** if the legend says so.
* **Direction:** neutral. **Verdict:** agree. Q29 changes the count.

### Q29 · CUL-1018 · removing an original allowed food draws no mark

* **Today:** `buildConcurrentChanges` skips any allowed-list row that did not open after the trial started
  (`supabase/functions/generate-report/report.ts:6150`), so removing an original food draws no stop mark.
* **Recommendation (A):** mark the removal when its date differs from both the trial's start and its end.
  **Why:** a dated change in the diet is what the chart exists to show; a removal on day 1 is a setup correction and
  one on the last day is the trial ending.
* **Counterexample tried:** an original food removed on day 30. It now draws a stop mark and counts in Q28's N.
  **Held.**
* **Direction:** louder. **Verdict:** adopt provisionally.

---

## 5. Part E · Records, words and ratifications

### Q30 · CUL-1231 · a dose re-answered "given directly"

* **Today:** `doseOf` takes the vehicle from the paired meal whenever it is on the day and ignores `how_given`
  (`lib/spineNode.ts:498-506`), so the row keeps naming the meal, and its "picked at", after the owner answers
  "directly".
* **Recommendation (A):** the owner's answer wins: "Prednisone · directly"; the meal row still says "with Prednisone".
  **Why:** the row should say what the owner last told us; the link is a fact about when it was logged.
* **Counterexample tried:** the owner taps "directly" by mistake for a pill that was in a picked-at bowl. The dose row
  stops implying the bowl's intake; the meal row still shows "picked at", and the *Unconfirmed* tag (B-156) is
  unchanged. **Held**, at the cost of one concern cue on the dose row.
* **Direction:** quieter on the dose row. **Verdict: needs your explicit agree.** No harness proof applies (a row's
  words); C ("directly, logged with the 1:00 PM meal") is the middle option if you want to keep the link visible.

### Q31 · CUL-913 · the look's refusal recency

* **Today:** the code is 3 days (`lib/intakeEvidence.ts:79`, since #825, moved there in #1140); the spec's T-20 still
  says 2 (`docs/nyx-daily-look-requirements.md:79`). The engine reads the same predicate server-side.
* **Recommendation (A):** write 3 into T-20 and §2 item 12. **Why:** the spec's own adversarial gate moved the number;
  this records a ruling rather than making one.
* **Direction:** neutral. **Verdict:** agree. It can ride CUL-1753's §4.5 edit.

### Q32 · CUL-915 · a word's per-week spread

* **Today:** `compareWord` computes the per-week spread and gates on it (`lib/lookComparison.ts:75`, :135-153); the
  rendered clause shows only "4 weeks before: {days} of {answered}".
* **Recommendation (A):** show the spread on the row's sub-line, after a frame in the daily-look mock. **Why:** a
  9-of-9 burst in one worried week is visible only through it.
* **Direction:** louder. **Verdict:** adopt provisionally, mock first.

### Q33 · CUL-1074 · the weight dots' colour

* **Today:** neutral grey (`components/charts/WeightDots.tsx:271-303`); the round-4 frame drew teal.
* **Recommendation (A):** ratify grey. **Why:** B-186: a weight mark never reads as good.
* **Direction:** neutral. **Verdict:** agree. The issue's stale `GA gate` label comes off with it.

### Q34 · CUL-272 · who writes the critical-drug list

* **Today:** nothing reads `is_critical`. The first sheet's T17 ruled a curated list over an owner toggle and said the
  list is the vet's; the vet review was then canceled, so T20 and T15's call-now half are held with no owner.
* **Recommendation (A):** the team drafts the list from published references, qualified by indication where a drug
  is critical for one use and not another, and brings it back as a row for your agree. **Why:** it is the only route
  left, and E-6 adopts the louder change provisionally.
* **Counterexample tried:** prednisolone, critical as replacement therapy and not as an anti-inflammatory. A
  drug-only list would call on every missed dose. **Held** with the indication qualifier in A.
* **Direction:** louder. **Verdict:** adopt provisionally; the list itself comes back.

### Q35 · CUL-672 · the §15 vet question sheet

* **Today:** F1, F3 and F4 were ruled the day the sheet was drafted (D20 to D22); the vet review it was meant for is
  canceled; draft #765 holds the send-ready form.
* **Recommendation (A):** keep it as an errand for your own vet, sent with the report CUL-598 asks you to email, and
  merge #765. Its A/B/C scenarios become checks on D20 to D22. **Why:** your GP visit is the one real-vet route left.
* **Direction:** neutral. **Verdict:** agree.

### Q36 · CUL-591 · Ask on an overrun trial

* **Today:** Ask reports an overrun trial's state ("active, day 412 of 56") on purpose
  (`supabase/functions/ask/index.ts:844-855`); the trial screen keeps an overrun trial's decision block.
* **Recommendation (A):** let it stand. **Why:** Ask writes nothing, suppresses nothing and computes no denominator;
  gating it would answer "no trial" about a trial on the owner's screen (G5).
* **Direction:** neutral. **Verdict:** agree.

### Q37 · CUL-590 · the course-end hedge

* **Today:** "Is this course finished? · Your vet has the final say. · Mark as finished" (`lib/medications.ts:1302-1304`).
* **Recommendation (A):** keep it. **Why:** the adversarial pass required the hedge against a taper being stopped early.
* **Direction:** neutral. **Verdict:** agree. Its device check joins the next cut's sitting.

### Q38 · CUL-595 · zoom past real pixels (conflict)

* **Today:** `MIN_MAX_ZOOM_SCALE = 2.5` (`lib/photoZoom.ts:39`); setting it to 1 is a one-line change (:32).
* **A (Engineer, Designer):** keep 2.5: a dead pinch reads broken, and magnification helps point at a region.
* **B (Dr. Chen):** 1: magnified JPEG artifacts on a suspected-blood or foreign-material photo can read as texture.
* **Verdict:** your letter, ideally after looking at an older photo zoomed on your phone.

---

## 6. The adversarial pass

_To be filled by the isolated `adversarial-reviewer` pass before the sitting._

## 7. Rulings received

_To be filled when you rule._
