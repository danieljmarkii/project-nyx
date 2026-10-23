# The clinical ruling sheet, second sitting, October 2026

**Date:** 2026-10-10 · **For:** the PM, ruling under E-6 (amended 2026-09-26; its detection line amended 2026-10-02
by E2 = B′, `docs/clinical-ruling-sheet-2026-10.md` §2.0b) ·
**Replaces:** 38 separate `Waiting on PM` issues, one ruling each, found by the 2026-10-10 staleness pass ·
**Status:** 🧊 dated artifact. The input to a ruling, not a spec. Each row is superseded by the ruling it gets.
**Linear:** CUL-1795 · **Read on a phone:** https://claude.ai/artifact/Jp6B9qsQBvoEkpaLcGDALT (source:
`docs/clinical-ruling-sheet-b.html`), where each row is ruled with a tap and the rulings copied out as text.

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
the trial facts, Ask or the vet report. Every quieter row below says which of these it falls under. A line's verdict
is read only at go-live size (at least 1,000 pets per scenario); CI's three seeds are a drift report (`:16-20`).

**There is no real-vet list any more.** The first sheet sent its lowest-evidence numbers to CUL-1312, and you
canceled that review on 2026-10-02. Rows that would have gone there now come to you with the team's recommendation
and the mark **No source**: no veterinary reference or measurement stands behind the number, only the team's
reasoning. Nothing on this sheet waits on a vet. The one real-vet route left is your own GP visit (Q35, with CUL-598).

**Persona conflicts.** Where the lenses genuinely disagree the row carries no recommendation, only the sides (the
Persona Conflict Protocol). There are four: Q18, Q19, Q22 (half) and Q38. E-6 still tells you which side is louder.

**Every row has the same shape:** the question; today's behaviour at file:line (checked on `main` at `5fb9cd3a`); the
recommendation and its one-line why; the counterexample tried against it and whether it held; the direction versus
today; the verdict E-6 gives that direction. **The isolated adversarial pass found 16 blocking breaks in the first draft,
ten of them a quieter change labelled louder, neutral or safer.** A second and final pass found 12 more in the
rewrite. Every break is rewritten below, §6 records what each reviewer tried, and §6.2 lists the residuals that stand.
The rows that need your **sign-off** or **explicit agree** rather than a default are marked in the table.

**How to answer.** "All agree" takes every A and every provisional adoption, and signs off nothing: a row marked
**sign-off** or **explicit agree** stays open until you name it. So: "All agree; sign off Q9; agree Q7, Q13.5, Q16.2,
Q24, Q26, Q30; Q18 A, Q19 A, Q22 a, Q38 B". Conflict rows need a letter.

---

## 0. The ruling table

Rows are grouped by what the ruling lets start, most first.

### Part A · Rulings that gate a build or a go-live

| # | Issue | The question | A (recommended) | Other options | Direction | Verdict |
|---|---|---|---|---|---|---|
| **Q1** | CUL-1146 | E-4: how many healthy pets may see a chance insight card within 180 days? (gates PR-31, PR-33) | A ratchet: x = the worst case PR-31 measures at go-live size on the 13 ratified null scenarios with EN-11 as built, rounded up to the next 5 points; it may only fall. PR-31 also reports the cost of x = 10% and 20%, and the per-trial number for a trial started at a peak | B: x = 10% now · C: per-lane floors only | A neutral; B **quieter** | A agree · B **needs your sign-off** |
| **Q2** | CUL-1537 | (a) The care state's 5% re-raise line counts the burden card, which no care state may quiet. (b) May a zero sit beside "Your vet knows"? (gates EN-9 going live) | (a) Count only the concern's own asks, in one predicate both scoring sites share, so all six EN-9 lines move together; report the burden card's asks and catches on their own lines. (b) Withhold the zero when no symptom has been logged since the answer | (a) B: change the 5% line only (**quieter**: a silent care state passes) · C: keep, EN-9 never live. (b) B: keep the zero | (a) neutral (every line moves together) · (b) safer | (a) agree, and it re-pins the frozen line list · (b) adopt provisionally |
| **Q3** | CUL-1544 | Four edges in the weight lane before `engines_v3_en8` turns on | 3.1: drop the exact-copy rule, as the first sheet's W1 ruled · 3.2: keep the built anchor after a plan with no weigh-in · 3.3: a stand-down never moves a running plan's start · 3.4: one-day lookback that includes a weigh-in at the plan's start instant | 3.1 B keep the rule until PR-37 · 3.2 B a target-aware anchor; C no anchor · 3.3 B reset (built) · 3.4 B 7-day lookback | 3.1 louder, given W7's condition · 3.2 neutral (as built); B and C **quieter** · 3.3 louder · 3.4 neutral with its condition; B mixed | 3.1 adopt · 3.2 agree · 3.3 adopt · 3.4 agree |
| **Q4** | CUL-1390 | The weight lane's product calls W3 to W7 (gates PR-37) | W3 sources, the percentage, one change line on the report · W4 **keep** "(N%)" on Patterns · W5 a plain Home row asking for a second weigh-in · W6 a vet plan only · W7 a weight row on "How did it go?", on condition that no vet-scale reading, added or relabelled, lowers a row the record raises without it | W4 B remove it (**quieter**) · W5 B nothing · W6 B also an owner switch · W7 B correction only | W3, W4, W7 neutral · W5 louder · W6 louder than B (the quieting itself was signed off as the first sheet's W6) | Agree · adopt provisionally |
| **Q5** | CUL-684 | F-G: may the band's marker gate the Signal card? (gates the taxonomy spec's seam 2) | Rule 1 wins: the marker never gates the card | B: rule 3 wins · C: park §9a until W2a | A louder · B quieter · C neutral | A adopt provisionally |
| **Q6** | CUL-944 | A row stuck in the sync queue shows in the app but not on the vet report: what does the banner do? (gates CUL-1173) | A tappable banner that opens the stuck entries and says they are not in the vet report or the Signal yet | B: generic copy · C: copy per queue | Louder | Adopt provisionally |
| **Q7** | CUL-1245 | History's day header says "meals not finished" for a refused meal and a half-eaten one alike: split them? | "N refused or picked at · N left some", on the day header and on the Meal filter row, from the engine's refusal classes; land before CUL-1263 so Home inherits it | B: one count, as built | Louder; **amends your HV-9 call 3a's Meal row** | **Needs your explicit agree** |
| **Q8** | CUL-1235 | Home's Today line and the Daily Recap count treats as meals | Home's half rides CUL-1263 (a), which replaces the line; the Daily Recap, which keeps the old chips, counts treats as treats | B: Home's half only (the Recap keeps saying "4 meals" over treats) | Louder | Adopt provisionally |

### Part B · Safety words on Home, the Signal, Ask and the trial

| # | Issue | The question | A (recommended) | Other options | Direction | Verdict |
|---|---|---|---|---|---|---|
| **Q9** | CUL-1357 | A build before #952 can hide an unseen *Worth a call*, and on that build nothing else carries a call raised by context alone | Close it with the next TestFlight cut (an OTA if the installed build reports runtime 1.2.0, else the native cut); until then one read-only count of hidden escalation rows on your account | B: a server trigger refusing an unwitnessed hide (a migration) · C: an update plus a backfill | **Quieter residual** until the cut | **Needs your sign-off** · B is schema, **needs your typed go** |
| **Q10** | CUL-1732 | Ask drops a read's call words when the read is hidden | On a call tier, Ask keeps the tier's own words ("the record marks this as worth a call; the note is hidden") and drops only the read text | B: as built | Louder | Adopt provisionally |
| **Q11** | CUL-648 | The first-insight arrival can play under another pet's safety banner | Withhold the arrival while a cross-pet banner is on screen, and spend the once-ever marker anyway | B: withhold and defer the marker · C: leave it | Neutral (removes a celebration, mutes no ask) | Agree |
| **Q12** | CUL-1539 | The Patterns month's weekly bar can read 0 over rose days when a bout crosses the week line | Keep counting onsets; disclose "a bout that began before this week continues here" | B: count vomit days · C: count vomits | Louder (a disclosure) | Adopt provisionally |
| **Q13** | CUL-1358 | Six calls on the Signal's not-eating gate | 1 withhold falling diarrhea too · 2 keep the stood-down line whole and add the not-eating fact with its 48-hour ask · 3 the phone script gains the not-eating fact as its own row, and the fall stays withheld · 4 give the screen's not-eating line the 48-hour ask · 5 say the in-trial rapid-share shift in words, never a drawn compare · 6 a length cue on a "so far" week | each as shipped | 1 safer · 2 to 5 louder · 6 neutral; **row 5 extends your ruling (a)** | Adopt provisionally; row 5 **explicit agree** |
| **Q14** | CUL-772 | A Signal rebuild whose push failed renews a 24-hour cache over a record missing the new rows | Unsent rows count as an incomplete read (the 1-hour expiry), except rows the server has refused, which belong to Q6's banner; a row the server never refused sets the flag at any age | B: skip the rebuild while rows are unsent · C: accept | Louder | Adopt provisionally |
| **Q15** | CUL-1574 | On the milestone day a free-fed trial loses the bowl's watch line | Carry the bowl line alone on the milestone when a bowl is in force | B: leave it · C: Get ready only | Louder | Adopt provisionally |
| **Q16** | CUL-1341 | *For the call*: a recent cluster blends into the trial count; the line vanishes off the refusal face; a missing count shows nothing | 1 a presence-only count since a named day · 2 the line follows "not eating" onto the stand-down and intake-decline faces · 3 a line saying the count is unavailable | each as shipped | Louder; **row 2 amends your 2026-09-27 trial-screen ruling** | Adopt provisionally; row 2 **explicit agree** |
| **Q17** | CUL-1056 | Does the Change-the-window sheet restate a live refusal? | No: every route to it passes a safety block first | B: restate the refusal | Neutral | Agree |
| **Q18** | CUL-1597 | TD-5: is a call-now "Not yet" asked once more that evening? | **No recommendation (conflict).** A, Dr. Chen: one prompt that evening, after 6 PM, on screen, never again · B, Jordan: as built, the same buttons on every reopen and no timed prompt | | A louder · B neutral | **Your letter** |
| **Q19** | CUL-1596 | Does the eight-week "Did your vet want to see her again?" ever reach an owner? | **No recommendation (conflict).** A, the team: keep it off · B, Dr. Chen: turn it on, once CUL-1531 lets it see a booked recheck · C: re-measure after CUL-1531 and Q2 | | A neutral · B louder | **Your letter** |

### Part C · The engine's chronicity lane and food findings

| # | Issue | The question | A (recommended) | Other options | Direction | Verdict |
|---|---|---|---|---|---|---|
| **Q20** | CUL-686 | A dense cough is silent for 21 days | The density arm Dr. Chen's Q5b already preferred: at least 10 cough days inside any 14, ongoing, priced at 0 of 200,000 null pets | B: a burden arm on vomit's shape (unmeasured) · C: accept and document | Louder | Adopt provisionally |
| **Q21** | CUL-685 | One pet with two chronic courses: the cross-pet banner names one | Add "…and another recurring sign" (or "…and 2 other recurring signs") | B: keep longest-span, documented | Louder | Adopt provisionally |
| **Q22** | CUL-689 | ⑦ ordering has no recency term | Move the cough-vomit adjacency mark to the most recent course (a tie keeps the current leader). **The ordering itself: no recommendation (conflict)** | ordering a: span first (Data Scientist) · ordering c: span first unless one course is quiet past a bound (Dr. Chen) | Mark neutral · ordering neutral | Mark agree · ordering **your letter** |
| **Q23** | CUL-793 | The chronicity compare borrows the 7-day 0.7 density ratio for 28-day halves | Its own named constant at 0.7, plus: when the recent half's last 7 days hold no logged meal or symptom, the pair carries its own sentence saying so, as a disclosure only | B: a stricter ratio · C: leave it | Louder | Adopt provisionally; the 7 days **No source** |
| **Q24** | CUL-203 | Under EN-11 two always-co-fed foods never yield a food finding, even when a corrected test passes | Accept it, stating the cost as never: it follows from your 2026-09-30 ruling (a food finding names one protein alone) and D5 = B. Name it in CUL-1486's GA-day marker | B: a "feed them apart" suggestion | **Quieter**, permanent for a co-fed pair | **Needs your explicit agree** |

### Part D · The vet report

| # | Issue | The question | A (recommended) | Other options | Direction | Verdict |
|---|---|---|---|---|---|---|
| **Q25** | CUL-1030 | An overnight discovery window prints as two clock times with no dates | Date each end of a range whose day differs from the row's, with the year when it differs | B: date by the earliest time · C: explain in the preamble | Neutral | Agree |
| **Q26** | CUL-1004 | What does `Set it up` on the send bar open? | A mid-trial "this is the trial diet" write, offered only when the trial records a target protein and every protein on the food's label is that protein or a form of it, matched on the exact key | B: any food (**quieter**, see §4) · C: no button, as shipped, with a designed empty state | **Quieter** in a mis-set case; **re-opens §5.5 D-A** | **Needs your explicit agree** |
| **Q27** | CUL-994 | Keep the dose-span sentence that shipped in place of the suppression the issue specified? | Keep it | B: restore the suppression · C: suppress on a day-count predicate | Neutral (ratifies what ships) | Agree |
| **Q28** | CUL-1027 | "N changes overlap this window" counts agents while the chart draws starts and stops | Keep it: the shipped legend already names each mark | B: rename the noun · C: count starts and stops | Neutral (ratifies what ships) | Agree |
| **Q29** | CUL-1018 | Removing a food from the trial's original allowed list draws no mark | Mark it when its date differs from both the trial's start and its recorded end | B: never (as built) · C: every removal | Louder | Adopt provisionally |

### Part E · Records, words and ratifications

| # | Issue | The question | A (recommended) | Other options | Direction | Verdict |
|---|---|---|---|---|---|---|
| **Q30** | CUL-1231 | A dose re-answered "given directly" still names the meal it was logged with | The owner's answer wins in the words ("Prednisone · directly"); the pairing and *Unconfirmed* stay | B: the link wins (as built) · C: both | **Quieter** on the dose row | **Needs your explicit agree** |
| **Q31** | CUL-913 | The spec says the look's refusal recency is 2 days; the code is 3 | Write 3 into T-20, naming the look's own constant | B: back to 2 | Neutral | Agree |
| **Q32** | CUL-915 | Answering's per-week placement is computed and gated on, never shown | Print it on the row's sub-line ("answered 1 · 1 · 7 · 0 by week"), after a mock frame | B: raise the floor · C: accept and say so in §7 | Louder | Adopt provisionally |
| **Q33** | CUL-1074 | Weight dots on Patterns: grey as shipped, or the round-4 teal? | Grey, as shipped | B: teal · C: primary ink | Neutral | Agree |
| **Q34** | CUL-272 | Who writes the critical-drug list now that no vet review is coming? | The team drafts it from published references; a drug critical for some use counts as critical unless its indication matches a listed non-critical use | B: an owner toggle · C: keep `is_critical` dormant | Louder; **re-opens T17's "the team will not write it"** | Adopt provisionally; the list comes back for your agree |
| **Q35** | CUL-672 | The §15 vet question sheet: keep or drop? | Keep it as an errand for your own vet; merge #765 | B: drop it, close #765 | Neutral | Agree |
| **Q36** | CUL-591 | Ask tells an owner an overrun trial is "complete" | Ask relays the trial screen's overrun words and never says complete | B: gate Ask on `isTrialRunning` · C: let it stand (the first draft's pick; broke) | Louder | Adopt provisionally |
| **Q37** | CUL-590 | The course-end prompt's "Your vet has the final say." | Keep it | B: a fuller deferral · C: drop it | Neutral | Agree |
| **Q38** | CUL-595 | May a photo zoom past its real pixels? | **No recommendation (conflict).** A, Engineer and Designer: keep 2.5 · B, Dr. Chen: stop at 1 | | Neutral | **Your letter** |

**Not on this sheet:** the non-clinical calls still on the queue (App Store, privacy, money, schema and process
items) and the per-PR device checks. Those are briefed in the staleness report of 2026-10-10.

---

## 1. Part A · Rulings that gate a build or a go-live

### Q1 · CUL-1146 · E-4, the chance-card budget

* **Today:** N4 ratified PR-15's 13 null scenarios as the null set on 2026-10-02 and left E-4's number open
  (`docs/clinical-ruling-sheet-2026-10.md:859-869`). Every other D and E brief on CUL-1146 is ruled. PR-31
  (CUL-1422, CUL-1424) and PR-33 (CUL-1423) wait on the number.
* **What is measured, and what is not.** The insight-card rate under EN-11 has never been measured. The number often
  quoted, 83% falling to 28% under EN-11, is false *worsening* cards pooled across the null scenarios
  (`docs/sessions/2026-10-02-cul-1489-en11-trade-remeasured.md:32`). Worsening is a safety lane, outside E-4's
  budget. The one insight-class figure on record is false food cards on null pets, 44% falling to 0
  (`docs/sessions/2026-10-02-engines-v3-pr32-en11.md:44`).
* **The statistic (E-4 A, ruled in shape):** the share of null pets that see at least one insight-card onset within
  180 days, worst case over the named scenarios, Monte Carlo size stated, safety lanes reported beside it, plus the
  per-trial number for a trial started at a peak (`docs/engines-v3-critique-2026-09.md:90`).
* **Recommendation (A): a ratchet.** Set *x* to the worst case PR-31 measures at go-live size (at least 1,000 pets
  per scenario, never CI's three seeds, where a maximum over 13 noisy estimates is set on noise), rounded up to the
  next 5 points, written as a ceiling that may only be lowered. PR-31 also reports the per-trial number and the
  detection cost (above chance) of x = 10% and x = 20%, so a tighter number can come back as its own row.
  **Why:** no source names a number, the rate it would bound is unmeasured, and a number picked blind either passes
  everything or holds back lanes nobody has measured; the ratchet stops regression now and makes the real choice a
  measured one.
* **Counterexample tried:** a lane that is fine on average and bad in one scenario (the two-cat home). The ceiling is
  the worst case across scenarios, so that lane binds. **Held.** Second: A blesses whatever EN-11 does today, however
  high that is. **Not held as a quality bar, and not claimed to be one:** A prevents regression; only B or a later
  measured row lowers the rate.
* **Direction:** A neutral. B quieter (fewer insight cards; the safety lanes sit outside the budget, so no safety ask
  is muted, but a true food reaction is named later or not at all).
* **Verdict:** A agree. B needs your sign-off, with detection above chance on EN-11 (the placebo arm is CUL-1493).

### Q2 · CUL-1537 · the care state's re-raise line, and a zero beside "Your vet knows"

* **Today (a):** two scoring sites count "an ask on the sign", and both count any card that carries one, burden card
  included: the care tally's own check (`supabase/functions/generate-signal/eval/scorecard.ts:506-512`), which feeds
  the 5% line (`passLines.ts:102-117`), its whole-horizon twin and the ask-evenings count; and the `re_raise` lane
  (`scorecard.ts:84-85`), which feeds the doubling line it is paired with (`:119-134`), the doubling delay and the
  scored rows. Six EN-9 lines in all. The burden card, which the care state may never quiet (care spec §4.4, AC 3),
  re-asks 18 of 30 stable cats on its own, so no care state can pass the 5% line. The care spec's PR-23 waits on this
  (`docs/nyx-care-state-requirements.md:473`).
* **Today (b):** a zero is withheld only beside a masking drug, within 42 days of a visit, or over thin logging
  (`supabase/functions/generate-signal/careState.ts:1013-1019`); the test pins "0 episodes, with something logged on
  14 of 14" as honest (`careState.test.ts:449-450`).
* **Recommendation (a), A:** one predicate, "an ask from the concern itself", shared by both scoring sites with a test
  that they agree, so all six lines move together; the burden card's asks and its catches are reported on their own
  lines beside them. **Why:** counting the net measures the net, not the care state. Moving only the 5% line (B), or
  fixing only one of the two sites, would let a care state that never re-raises its own concern score 0% there while
  the never-quieted burden card props up the doubling line: silence passing, the exact hole the pairing exists to
  close (`passLines.ts:11-14`). Even under A the concern alone re-asks 8 to 10 of 30 (27 to 33%,
  `docs/sessions/2026-10-03-engines-v3-pr23-care-state.md:75`), so PR-16's frontier work still has to reach 5%: this
  row makes the lines honest, not passed. The doubling line's own floor is still unruled (N3: ruled with its wave),
  so EN-9 cannot go live on this row alone.
* **Recommendation (b), A:** withhold the count when it is zero and no symptom has been logged since the answer;
  keep the window and the logging line. **Why:** next to "Your vet knows", a zero over a stream that may have stopped
  being logged reads as "it worked" (absence is not wellness).
* **Counterexample tried (a):** an EN-9 that never re-raises its concern. Under A it scores 0% on re-raise and 0 on
  doubling, so it cannot pass. Under B it passes the re-raise line. **A held; B broke**, which is why B is listed as
  quieter. **(b):** a cat genuinely well for 20 days with meals logged daily loses its true zero. **Held:** the cost
  is a missing true zero, the safe direction. A cat whose owner logs one unrelated sneeze gets the zero back, which
  is still no worse than today.
* **Direction:** (a) neutral: a test definition, every line moving together. It changes the frozen line list, so it
  re-pins the list's digest with your sign-off named beside it (`passLines.ts:22-24`); your agree here is that
  sign-off, for all six lines. (b) safer: removes a reassuring number.
* **Verdict:** (a) agree. (b) adopt provisionally.

### Q3 · CUL-1544 · four edges in the weight lane

Built dark in PR-19 (#1014, `lib/weightStory.ts`); `engines_v3_en8` is unseeded. The harness cannot see EN-8 until
its synthetic rows feed it weights (`passLines.ts:54`), so **no quieter edge here has a harness proof**; each names
its cost and a substitute. Every weigh-in is written as a home-scale reading today (`lib/weight.ts:157`); vet-scale
readings first arrive with PR-37 through W7, so every mixed-scale case below first becomes reachable there, and
W7's condition (Q4) governs all of them.

* **3.1 · Identical weigh-ins.** Today `EXACT_COPY_NEVER_PAIRS = true` (`lib/weightStory.ts:110`, :194-196): two
  weigh-ins equal to the gram never confirm. The code's own header calls it quieter than the first sheet and owed
  your sign-off (`:99-109`). **What it protects:** a pre-fill saved unchanged confirming a drop smaller than 0.6 kg.
  A larger drop that also clears the line raises a card either way, because W2's 0.6 kg rule never consults the
  exact-copy test (`:504-524`), which holds for pets under about 12 kg.
  **What it costs:** a repeated lower plateau never confirms (9.9 lb ×4 then 8.8 lb ×4, an 11% loss, is silent while
  it repeats); a cat weighed again after a drop who reads the same (4.4, 4.38, then 3.9 and 3.9) stays at one
  unconfirmed reading for as long as the readings match, which is exactly the second weigh-in W5's row asks for (with
  the rule off it is a firm card); a 1%-a-week loss weighed monthly is caught 4 to 9 weeks later.
  **Recommendation (A): drop the rule now**, so the first sheet's W1 (two consecutive home readings confirm) stands
  as you signed it off. **Why:** its cost is silence on real losses and its protection is a false card on a small
  pre-filled drop, the louder error; PR-37 removes the pre-fill in any case. **Louder than what is built, given W7's
  condition.** Without it there is one quieter case: vet readings of 11.0 lb then 9.9 lb (a firm 10% loss), then a
  home reading of 9.9 lb the next day; with the rule off the equal home reading becomes the latest low and the
  mixed-scale margin turns firm into soft (`:330-338`). W7's condition (no home reading softens a vet-to-vet loss)
  closes it, and PR-37 is where vet readings first exist. **Adopt provisionally.** B (keep it until PR-37, then for
  older rows only) is quieter and needs your sign-off.
* **3.2 · A finished plan with no weigh-in during it.** Today (built) the plan's start weight anchors after the plan
  ends, on the ordinary lines, so a prescribed 10% loss reads as an unplanned soft card the day the plan lapses.
  **Recommendation (A): keep that.** **Why:** its error is a false card on a loss the vet asked for, which the owner
  can read against the plan they were given, and every alternative is quieter. B, a target-aware anchor (fire only
  past the plan's target plus the noise margin), sits at about 14% for a 6 kg cat and 15% for a 3.5 kg cat with a
  vet-weighed start, with the soft line off, and as drafted it has no end date: a failed plan (no loss during it)
  followed by a 12 to 13% loss months later stays silent. C, no anchor across the plan, never catches a loss during an
  unweighed plan at all: a cat on a 12-week plan, never weighed, that loses 25% is a firm card today and silent forever
  under C. **Neutral (as built). Agree.** B or C need your sign-off; B's substitute proof would be a pair of fixtures,
  one pinning the over-target catch and one pinning the failed-plan silence it accepts.
* **3.3 · A stand-down mid-plan.** Today (built) a stand-down resets the plan's cumulative line, so a cat 14.7% below
  her start, past a 10% target, goes silent. **A:** a stand-down never moves a running plan's start weight.
  **Louder. Adopt provisionally.**
* **3.4 · How old a start weigh-in may be.** Today the lookback is one day, strictly before the plan's start
  (`lib/weightStory.ts:280`). **A:** keep one day, **on two conditions**: PR-37's writer dates the plan's start from
  the visit, never from the time the form is saved; and the lookback includes a weigh-in at the start instant itself.
  **Why:** a plan saved three days after the visit would miss the visit's 6.0 kg, and a cat at 5.2 kg three weeks
  later (13% down) would read level; and a home weigh-in stamped at the very instant the plan starts never anchors
  today (4.0 kg at the start, then 3.55 and 3.54, raises nothing; the same weigh-in a minute earlier is a firm card).
  **Neutral with both conditions.** B (a 7-day lookback) is **mixed**, not louder: it helps when the last day holds no
  weigh-in, and it hurts when an older, lower reading pairs with the visit's, because the start level is the lower of
  the last two (`:262`): home 6.0 six days out, 6.5 on the visit day, then 5.75 and 5.74 is a firm card on one day's
  lookback and nothing on seven.
* **Recorded costs that stand provisionally** (louder, for the PMD-9 re-run, not for ruling): the 0.6 kg rule behaves
  like a single-reading rule above about 12 kg; a 30 kg dog with no birthday gets a soft card on about 0.23 kg; one
  mistyped weight can raise a firm card through the 0.6 kg rule; the 2%-a-week plan rate fires on 8 to 25% of cats
  following their plan.

### Q4 · CUL-1390 · the weight lane's product calls W3 to W7

These are CUL-1390's own numbers, not the first sheet's W rows (that sheet's §2.3 maps the two). W1 and W2 were
ruled on 2026-09-28. Briefs: `docs/nyx-weight-lane-requirements.md` §0 (`:39-75`).

* **W3 · the vet report. A:** each reading with its source, the percentage the report already prints, and one change
  line from the same predicate, naming both readings it compares and whether each is confirmed. The line reads the
  unfloored highest reading before the latest, never the Signal row's own wording, so a stand-down never shortens
  what the vet reads. No finding row, no loss flag. **Why:** a vet trusts two dated, sourced readings more than an
  app's verdict. Needs a Tier-2 edit to the report spec §3.3 and a `vet-report-cold-read`. **Neutral.**
* **W4 · the "(N%)" on Patterns. A: keep it.** It prints for every account on `main` since Design v2's GA
  (`lib/chartCopy.ts:354`); the spec's "no owner loses anything" predates the GA. Removing it removes a concern cue:
  the code's own case is a 300 g kitten down 20 g, which reads "Down less than 0.1 lb" and needs the 7% to say what it
  is (`:300-303`). The spec's reason to remove it (the Signal's weight row shows no percentage, S3) goes to the
  Designer as a better-than-the-rule brief on S3. **Neutral (holds what ships).** B (remove it) is quieter and needs
  your sign-off; no harness reads Patterns copy.
* **W5 · a drop on one reading. A:** a plain Home row with no vet ask: "One reading so far, on a home scale. Weigh her
  again this week to check." It leaves when a later reading decides the drop. Under Q3.1 A an identical later reading
  confirms the drop and the row becomes a raised card; under Q3.1 B it would stay asking indefinitely, so rule the two
  together. **Louder than nothing on Home.**
* **W6 · who sets "planned loss". A:** a vet plan only, as a plan row on "How did it go?". **Louder than B** (also an
  owner switch, which lets an owner quiet the card on their own judgment). Against today, where nothing can set a
  plan, any writer switches on the planned-loss quieting you signed off as the first sheet's W6; A is the narrowest
  writer of it.
* **W7 · a clinic weight. A:** an optional weight row on "How did it go?", **on condition that no vet-scale reading,
  added or relabelled, lowers a row the record would raise without it, and no home reading softens a loss measured
  vet-to-vet**. One way to build it: compare each high with the latest low on its own scale as well as across scales,
  and keep the louder. **Why:** the predicate's mixed-scale margin was written for readings PR-19 could not yet
  produce, and run against it every vet-scale path can quiet a card. Four cases, each a fixture PR-37 owes:
  (1) home 4.2 and 4.19, then visit-day 3.95 and 3.94 (a soft card), then the vet's 3.96: the card goes;
  (2) relabelling that 3.95 as the vet's: the card goes; (3) vet 11.0 lb then 9.9 lb (a firm 10% loss), then home
  10.0 and 10.05 lb: no row at all; (4) a vet plan with a 10% target, a vet-weighed start of 4.0, then 3.42 and 3.41
  (14.5% down): no row, where a home-weighed start fires firm at 11.3%. **Neutral with the condition**; without it W7
  is quieter and needs your sign-off.
* **Counterexample tried:** W5 on a real 15% loss logged once on a home scale. The row asks for a second weigh-in, not
  a vet call; an owner who never weighs again gets nothing more. **Held as ruled:** that is PMD-9's trade (the first
  sheet's W1), which this row does not re-open.
* **Verdict:** W3, W4, W7 agree. W5, W6 adopt provisionally.

### Q5 · CUL-684 · F-G, the marker and the card

* **Today:** the taxonomy spec is at v1.6 seam 1 and unchanged since 2026-08-30 (`docs/nyx-event-taxonomy-requirements.md:2`);
  rule 1 says the band's marker never gates the card, rule 3's scoping sentence says it governs the card's arrival.
  W2a and W2b stay unbuildable until §9b passes, whatever this row says.
* **Recommendation (A): rule 1 wins.** The marker never gates the client-injected card. **Why:** it is the team's
  2026-08-30 recommendation, and it keeps the fourth exit's backstop.
* **Its cost, stated where you rule it:** the spec's own round-4 record (S4-6, `:519`) says rule 1's branch is not
  free: a card that is always present for a recurring, acknowledged sign is the wallpaper hazard D28 ruled must be
  damped on the sibling leaf. D28 damps the band down to the card ("renders the card, not the band"), so under A
  nothing damps the card itself. The spec rewrote its own lean on F-G as neutral (S3-9).
* **Counterexample tried:** a cat with recurring strain clusters whose owner has acknowledged them. Under A the card
  stays. **Held in the loud direction**, at the stated cost. Seam 2 should also re-check rule 6a's premises against
  the client offline floor preview that shipped since (#1122).
* **Options:** B, rule 3 wins (markers stay scarce; the fourth exit loses its backstop). C, park §9a and take it off
  your queue until W2a is greenlit; W2 is not on the App Store path.
* **Direction:** A louder. **Verdict:** adopt provisionally.

### Q6 · CUL-944 · a stuck row is visible in the app and absent from the vet report

* **Today:** the banner says to "open one from History and save it again to retry"
  (`components/ui/SyncBanner.tsx:39-40`); there are 21 queues now, not 15 (`lib/syncQueue.ts:318`). The widget and
  the rundown read medications locally (`lib/widgetSnapshot.ts:490`, `lib/rundown.ts:621`), so a stuck dose shows
  there while the server-built report omits it. The report screen already discloses rows still pending under a day
  old (`app/report.tsx:105-108`, :470-476, B-534), so the gap is the stuck and quarantined rows. History's "not saved"
  row waits on this ruling (CUL-1173).
* **Recommendation (A):** a tappable banner that opens the stuck entries, works for all 21 queues, and says plainly
  that they are not in the vet report or the Signal yet. **Why:** the owner can only fix what they can find, and the
  report is the place the gap costs most. The Signal half matters too: a refused vomit sits under a calm Signal that has
  not counted it, and Q14's flag cannot reach a row the server refused, so the banner is the only place that says so.
* **Counterexample tried:** a stuck medication dose before a vet visit. Under A the banner names it as missing from
  the report and opens it. **Held**, provided the copy names the report (the condition is in A). A row pending under a
  day: the report screen's existing line covers it. **Held.**
* **Direction:** louder. **Verdict:** adopt provisionally. Unblocks CUL-1173 and CUL-640's copy half.

### Q7 · CUL-1245 · refused and half-eaten meals share one count

* **Today:** one merged "meals not finished" count (`lib/historyDays.ts:187`, :350), printed on History's All-types
  day header and, since #1034, on the Meal filter row. The Patterns month keeps refused and left-some apart
  (`components/surfaces/patterns/MonthInstrument.tsx:543-544`) but counts Picked as left-some
  (`lib/monthReads.ts:302-303`), while the engine counts Picked as refusal (`lib/intakeEvidence.ts:36-50`).
* **Recommendation (A):** "N refused or picked at · N left some" in the header's grey, on the All-types header **and**
  the Meal filter row, from one predicate built on `intakeEvidence`'s classes; the month moves to the same classes,
  and its legend's "refused" becomes "refused or picked at" (`MonthInstrument.tsx:805`) when Picked moves in. Land it
  before CUL-1263 so Home inherits it. **Why:** intake is not preference: a refusal folded into "not finished" reads as
  fussiness one level above the rows. The wording is the first sheet's R4 phrase and respects R15's definitions
  (Refused, none eaten; Picked, a few bites), so no surface says "refused" over a row that says "picked at".
* **The Meal row must split, never shrink:** moving the Meal row to a left-some-only count would drop refusals off
  it, which is quieter. Both parts count the same eligible meals as today (`historyDays.ts:347`).
* **Counterexample tried:** a cat that picked at three bowls. The header reads "3 refused or picked at" over three
  "picked at" rows. **Held.** A dog that left half of each of two bowls: "2 left some". **Held.**
* **Direction:** louder. **Amends a ruling:** your HV-9 call 3a (CUL-1520 item 13, 2026-10-03) put one merged "not
  finished" count on the Meal row; this splits it. **Verdict: needs your explicit agree**, because it changes a line
  you ruled, not because it is quieter.

### Q8 · CUL-1235 · treats counted as meals on Home

* **Today:** `countLine` (`lib/spineNode.ts:746`) over `buildCountChips` (`lib/daySummary.ts:441-470`) counts every
  meal-category row as a meal, treats included. The issue's other half, unfinished meals, was ruled (a) on 2026-09-25
  and is CUL-1263 (Todo): **Home uses History's day header** (`docs/nyx-history-v2-requirements.md:67`, :359).
* **That ruling settles Home.** The header's All-types branch names the total, the symptoms, other rows and the meals
  not finished, and no meal count at all (`lib/historyDays.ts:1198-1203`); meals and treats are split only under the
  Meal filter (`mealSplitParts`, defined at `:808`, used at `:1182`). Once CUL-1263 is built, Home has no line that
  could count a treat as a meal.
* **It does not settle the Daily Recap.** The Recap builds its chips from the same `buildCountChips`
  (`lib/daySummary.ts:253`), and CUL-1263 (a) leaves the Recap's line unchanged (`docs/nyx-history-v2-requirements.md:67`).
  So the Recap would keep saying "4 meals" over a day of treats.
* **Recommendation (A):** Home's half rides CUL-1263 and stays open until it is built; the Recap's chips count treats
  as treats. **B:** Home's half only, leaving the Recap as it is.
* **Counterexample tried:** a treats-only day (a cat eating only Churu). Today Home says "4 logged · 4 meals", which
  reads as reassuring. Under CUL-1263 (a) Home reads "4 logged", and under A the Recap reads "4 treats". **Held.**
  Under B the Recap still reads "4 meals". **B broke.**
* **Direction:** louder. **Verdict:** adopt provisionally. Q7's split rides into Home through the same header.

---

## 2. Part B · Safety words on Home, the Signal, Ask and the trial

### Q9 · CUL-1357 · an old build can hide an unseen *Worth a call*

* **Today:** the hide is a client-only compare-and-set (`lib/analysisDismissal.ts`, #952); builds before #952 hide
  unconditionally. On `main`, the surfaces built on the shared read state (History's rose, Home's Today card, the
  month) keep the call through a hide, because dismissal is not an input to it (`lib/readState.ts:66-71`). Beyond those,
  nothing carries a per-incident call through a hide: the vet report never carries an
  n=1 call at all (`supabase/functions/generate-report/report.ts:1832-1833`; its read selects no recommendation,
  `index.ts:1241-1247`), and Home's safety band carries one only for blood or foreign material, behind the unseeded
  `engines_v3_en3` (`supabase/functions/generate-signal/pipeline.ts:398-401`, :456-465).
* **Who is exposed:** the installed TestFlight build (08-29) predates #952 and History v2, and on it Home dropped the
  verdict when the owner hid the read (`lib/readState.ts:7-8`). So on that build, hiding a call raised by context
  alone, such as a cat's reduced intake ("In cats that combination is worth a call to your vet sooner rather than
  later", `supabase/functions/analyze-vomit/index.ts:365-367`), leaves no surface carrying it. Only TestFlight testers
  run that build; no store owner ever will.
* **Recommendation (A):** close it with the next TestFlight cut, which carries #952 and History v2: an OTA if the
  installed build reports runtime 1.2.0 (as `app.json:5` does today; the runbook's installed-build line predates that,
  so confirm in EAS first), otherwise the native cut. Until then, one read-only count of hidden escalation rows on
  your account (owner-scoped per C-27), repeated if you hide a read; any row it finds can be un-hidden from the
  record's own *Show* link (`components/event/VomitAnalysisSection.tsx:897-901`). A new read already clears an old hide
  (`supabase/functions/_shared/incident-analysis.ts:498`, :508). **Why:** the exposure is one household's test build,
  and the cut closes it without a migration.
* **Counterexample tried:** a tester on the 08-29 build hides a calm-looking card whose re-read came back *Worth a
  call* on reduced intake alone. Nothing on that build shows the call. **Broke the first draft's claim** that three
  surfaces keep it; **the recommendation accepts this residual until the cut**, which is why it needs your sign-off.
* **Options:** B, a `BEFORE UPDATE` trigger that refuses an unwitnessed hide on an escalation row (schema, its own PR,
  your typed `apply`). C, an update plus a one-time backfill un-hiding escalation rows.
* **Direction:** A accepts a quieter residual until the next cut. **Verdict:** needs your sign-off; the substitute
  proof is the count reading zero. B is on the never-list (schema) and needs your typed go.

### Q10 · CUL-1732 · Ask drops a hidden read's call words

* **Today:** `supabase/functions/ask/tools.ts:930-933` nulls both the read text and `tierWords` when a read is
  dismissed. History's rose keeps the call on `main`.
* **Recommendation (A):** on a call tier, Ask keeps the call through a hide, in the tier's own words from
  `TIER_WORDS` (`lib/incidentTierWords.ts:97-105`; "Call your vet now" for a call-now read), framed the way the record
  shows it ("the record marks this as worth a call; the note is hidden", matching the record's *AI note hidden*), and
  drops only the read text. A hidden *Keep an eye out* stays dropped. **Why:** a hide is about the note, never about
  the call (H-4a), and Ask should not be the one surface that loses it.
* **The exit is not built:** the one act that will stand the call down, the owner's "No, it's something else"
  (CUL-1107), does not exist yet (`lib/readState.ts:68-70`, "when it ships"). Until it does, A means the words stay.
* **Counterexample tried:** the owner hid the note because the photo was of the other pet's vomit. Ask keeps saying
  the record marks a call. **Held in the loud direction** until CUL-1107 ships.
* **Direction:** louder. **Verdict:** adopt provisionally. Rule with Q9.

### Q11 · CUL-648 · the arrival under another pet's safety banner

* **Today:** the arrival's safety gate reads only the active pet's findings (`components/home/SignalZone.tsx:727`);
  `CrossPetSafetyBanner` sits directly above it on Home (`app/(tabs)/index.tsx:267`, SignalZone at :272). The
  once-ever marker is spent before the arrival plays (`SignalZone.tsx:261-265`, CUL-601's reasoning).
* **Recommendation (A):** withhold the arrival while a cross-pet banner is on screen, and spend the marker anyway.
  **Why:** a celebration must never decorate a visible concern (S1). The arrival's trigger is a one-time transition
  (`:232-238`), so a deferred marker (B) would play on some later re-arrival, possibly weeks out of context, which
  reverses CUL-601's reasoning for spending it.
* **Counterexample tried:** the banner appears after the arrival has started. A checks at the start only. **Partly
  held:** the build should also stop the arrival if a banner appears mid-play.
* **Direction:** neutral (the card still renders; no ask is lost). **Verdict:** agree. CUL-646 (which empty states may
  trigger the arrival) is a separate, non-clinical call still on your queue.

### Q12 · CUL-1539 · the weekly bar reads 0 over rose days

* **Today:** `weeklyBuckets` counts episode onsets (`lib/chartModels.ts:213`, fed by `lib/monthModel.ts:554`), so a
  bout that began last week and continues draws 0 this week over a row of rose days; `MonthInstrument.tsx:563-564`
  admits it. CUL-1530 (a) kept onsets on purpose. Both GAs shipped without this ruling, so every account sees it.
* **Recommendation (A):** keep counting onsets and add, on each affected week, "a bout that began before this week
  continues here". **Why:** the bar's unit is onsets and 0 new onsets is true; the disclosure says what the reader
  would otherwise misread (C-4). The wording holds on a bout's third week too.
* **Counterexample tried:** a bout spanning three weeks. The disclosure prints on each continuing week, and the label
  never says "0 vomits". **Held.**
* **A sibling, not ruled here:** the Signal card's own weekly line has the same onset blind spot
  (`lib/signalWindows.ts:256-275`) and can print "0 in the last 7 days · 1 in the 7 before" over vomiting six days
  ago. That one is quieter; it is filed as CUL-1791 and follows this row's ruling.
* **Direction:** louder. **Verdict:** adopt provisionally.

### Q13 · CUL-1358 · six calls on the not-eating gate

Since CUL-1216 the Signal withholds a falling vomit comparison while a pet is not eating (`lib/signalVisible.ts:18`,
:69-80). Your ruling (a) of 2026-09-27 drew no trial compare beside a not-eating record
(`docs/sessions/2026-09-27-cul1216-signal-withholding-gates.md:23`). The rows below are the team's recommendations
from that adversarial pass and its re-review, corrected by this sheet's pass.

1. **Diarrhea too.** A falling diarrhea pair beside a not-eating record is withheld (less food in, less stool out),
   including diarrhea's chronicity compare rows (`chronicityCompareWithheld` is vomit-only today,
   `lib/signalCopy.ts:1414-1416`). **Safer.** Owes the §13a membership walk (C-11).
2. **The stood-down line.** It stays whole, with the not-eating fact and row 4's 48-hour ask added before its own
   ask: "No vomiting logged for {pet} in 14 days — this card has stood down. That isn't an all-clear. {Pet} hasn't been
   eating normally, and if that has gone on for 48 hours, call your vet today. If you haven't been, the visit is still
   worth booking." **Louder.** The template is pinned word for word (`standDown.ts:204-217`), so the voice pass re-runs
   on it (C-28). (The first draft withheld it, which would have removed
   the line's visit ask and its "That isn't an all-clear", the two things CUL-786 and Dr. Chen's condition 3 built it
   to carry, `supabase/functions/generate-signal/standDown.ts:5-18`, :208-217.)
3. **The phone script.** It gains "{Pet} hasn't been eating normally" as its own row, whenever the not-eating
   register is on and whatever the pair beside it is doing; the falling row stays withheld from the script, as it is
   today (`lib/signalCopy.ts:1409-1416`), under the script's own rule that it never reads aloud a fall the sentence
   above it held back (`lib/signalScreen.ts:889-892`). The same holds for row 1's diarrhea rows. **Louder.**
4. **The screen's not-eating line** gains the 48-hour ask when the intake card is not on the same screen. **Louder.**
5. **The trial's timing lanes.** When the in-trial share of vomiting soon after meals rose, say so in words ("In the
   trial, more of the vomiting came soon after meals"), never the drawn "Before the trial · In the trial" totals, which
   would show a falling count beside a pet that may not be eating. **Louder, and it extends your ruling (a)**, whose
   words are "the strip's sentence verbatim, or nothing": this adds a sentence the strip does not carry.
6. **A "so far" week.** "0 this week so far · 4 last week" from Tuesday gains a length cue (B-775's form) saying the
   windows differ. **Neutral.**

* **Counterexample tried:** row 1 on a dog whose diarrhea is truly improving while intake dips for a day: the
  improvement is withheld until intake recovers. **Held:** withholding is the safe error and lifts by itself. Row 2 on
  a firm chronic-vomit card standing down while the cat refuses the trial diet: the visit ask survives. **Held.** Row
  5 on a cat refusing from day 1, 18 vomits before the trial and 3 in it, all soon after the few bites: no falling
  total is drawn. **Held.**
* **Verdict:** rows 1 to 4 and 6 adopt provisionally; row 5 needs your explicit agree, because it extends a ruling of
  yours.

### Q14 · CUL-772 · a failed push renews a calm cache

* **Today:** a Signal rebuild that runs while the device's push failed swallows the failure (`lib/signal.ts:905-906`)
  and the server writes a 24-hour cache over a record missing the new rows. Only an incomplete server read earns the
  shorter expiry (`supabase/functions/generate-signal/index.ts:142`, :835). The client rebuilds from several places
  (meals, Undo, the capture inbox, edits, the incident screen, Home's focus on a stale cache), but a later successful
  push of the rows triggers a rebuild only through the care-answer drain (`lib/sync.ts:3701`).
* **Recommendation (A):** the client sends an "unsent rows" flag and the function adds it to `incompletePulls`, so the
  existing 1-hour expiry applies, **except** rows the server has refused (`sync_error` set), which never set the flag;
  they belong to Q6's banner. A row the server never refused sets the flag at any age, because a network failure never
  spends a retry (`lib/sync.ts:406`) and the row may land a minute later. **Why:** a calm card must not stand for a day
  over a vomit the server has not seen (CUL-989: an incomplete read never reassures). The exception matters: a refused
  row would otherwise shorten every expiry,
  Home would rebuild on every focus past the hour (`hooks/useSignal.ts:215-217`), and the per-pet cap of 12 a day
  would be spent, after which the function skips rebuilding entirely (`index.ts:500-518`) and a blood vomit logged
  that evening would wait for UTC midnight.
* **Counterexample tried:** a vomit logged at hour 2 of a 28-hour offline stretch; back on patchy signal, the push
  times out but the rebuild's call gets through. The row was never refused, so it sets the flag, and the card re-checks
  within an hour. **Held.** (Excluding every row pending past a day, as the first rewrite did, would have left a 24-hour
  calm cache over it.) A row the server refused for good: it leaves the expiry alone, and Q6's banner names it.
  **Held.**
* **Direction:** louder. **Verdict:** adopt provisionally.

### Q15 · CUL-1574 · the milestone day loses the bowl's watch line

* **Today:** the milestone maps to `floor_only` (`lib/dietTrialCard.ts:1016-1017`), which draws no lines, so "The
  bowl also can't tell you if {pet} stops eating. That part is yours to watch." (`:1729-1730`) is absent on the
  decision day. CUL-1554 carried the bowl line only onto `overrun`.
* **Recommendation (A):** carry the bowl line alone on the milestone when a bowl is in force, the way the floor rides on
  `floor_only`. **Why:** it is the only option that covers a recheck booked for the milestone day.
* **Counterexample tried:** the milestone falls on the day of a live refusal. The refusal outranks the milestone
  (`:1363-1364`). **Held.** A free-fed day one already carries the line (`:1366`). **Held.**
* **Direction:** louder. **Verdict:** adopt provisionally.

### Q16 · CUL-1341 · *For the call*, three gaps

`lib/trialForTheCall.ts:115-130` builds "Vomiting logged: {k} in the trial's {N} days, the last on {date}" on the
refusal face only (your ruling, 2026-09-27).

1. **A recent cluster.** Add a presence-only count when two or more fall from the start of a named local day two days
   back: "…, 3 of them since Sep 26", counting from midnight on Sep 26 so the number counts what the words name (C-3).
   Never a zero, never a compare.
2. **Faces with no vomiting fact.** The presence-only line follows `isAnimalNotEating` rather than the live register,
   so it shows on the stand-down day and the intake-decline face too, as its own line under the face's lead. **This
   amends your 2026-09-27 ruling** that the intake-decline face carries no *For the call* block
   (`docs/nyx-trial-screen-requirements.md` §3.3). Pairs with CUL-1310.
3. **A missing count.** When the counts are unavailable (`if (!counts) return null`, :117), say so in one line rather
   than showing nothing.

* **Counterexample tried:** 12 old vomits and 1 today: no recent count (fewer than two), and the last date already
  shows recency. **Held.** A vomit at 08:00 on Sep 26 read at 10:00 on Sep 28: counted, because the window starts at
  midnight on the day named. **Held.** A stale-active trial with no counts: row 2 wants the line, row 3 supplies the
  "unavailable" form. **Held** together.
* **Direction:** louder. **Verdict:** adopt provisionally; row 2 needs your explicit agree because it amends a ruling of
  yours. The "Dr. Chen to rule" route on the issue no longer exists; this row is that ruling.

### Q17 · CUL-1056 · the Change-the-window sheet over a live refusal

* **Today:** since the trial screen's GA the Pet tab shows only a door for a running trial; the Manage and window
  sheets open only from the trial screen (`components/trial/TrialLifecycleSheets.tsx`, used by
  `components/trialScreen/TrialScreen.tsx:159`, :206, :210 alone). On the refusal face *For the call* sits above
  *Change or end the trial*; on the intake-decline face (`lib/dietTrialCard.ts:1357-1363`) *For the call* is absent
  (`lib/trialForTheCall.ts:73`) and the decline block leads instead.
* **Recommendation (A):** the window sheet does not restate the refusal. **Why:** every route to it passes a safety
  block first: *For the call* on the refusal face, the decline block on the decline face.
* **Counterexample tried:** a cat with a live refusal and an intake decline. The face is the decline face, so the
  sheet is reached without passing *For the call*, but past the louder decline block. **Held.** A build that adds a
  new door to the sheet owes this row again.
* **Not clinical, on the same issue:** whether the Manage sheet's *Replace the trial* row should look different and
  name the days at stake. That challenges the ratified mock §2, so it goes to the Designer's next trial-extension
  mock round as a better-than-the-rule brief.
* **Direction:** neutral. **Verdict:** agree.

### Q18 · CUL-1597 · TD-5, "Not yet" on a call-now read (conflict)

* **Today:** B is built provisionally (`components/event/CallAnswers.tsx:37`: "NOT YET WRITES NOTHING"). Its state is
  held in the component, so the buttons and the read's call words are back on every later open (`:55-68`,
  :181-187). The care spec keeps TD-5 as its one open conflict. `engines_v3_en14` is unseeded, so no owner sees
  either version yet.
* **A (Dr. Chen):** one prompt that evening: the next time the screen opens after 6 PM (a finding or an incident,
  care spec `:269-274`), and never again for that escalation. **Louder.**
* **B (Jordan, built):** nothing written and no timed prompt, because a second ask invites a false "I've called"; the
  same buttons and call words return on every reopen.
* **What they share:** neither notifies, so under either an owner who never reopens the screen is not asked again. The
  real difference is A's one evening prompt against B's unchanged buttons.
* **Counterexample tried against A:** an owner who has decided to wait for morning taps "Not yet" twice. A records
  nothing either time and asks no third time. **Held.** Against B: an owner who reopens at 8 PM sees the same buttons
  as at 2 PM, with nothing marking that the evening has come. **Held as B's stated cost.**
* **Verdict:** your letter. Not urgent until en14 is seeded.

### Q19 · CUL-1596 · the eight-week recheck question (conflict)

* **Today:** built and off (`supabase/functions/generate-signal/careState.ts:113`, `recheckQuestionDays: null`); the
  care spec §4.8 says "ruling pending" (`:213`). The shell passes no appointments yet (CUL-1531; `careState.ts:35`,
  :163), so the question cannot see a recheck already booked.
* **A (the team):** keep it off. It asks 100% of pets on both sides, so it cannot tell a vet plan that is helping from
  one that is not.
* **B (Dr. Chen):** turn it on: still chronic at eight weeks is worth a vet's look. **Louder.** Needs CUL-1531 first,
  or it asks owners whose vet has already booked the recheck; and a Home door that does not exist; and a flag-on run.
* **C:** re-measure after CUL-1531 and Q2 (a); C becomes real only once Q2 is ruled.
* **Verdict:** your letter.

---

## 3. Part C · The engine's chronicity lane and food findings

### Q20 · CUL-686 · a dense cough is silent for 21 days

* **Today:** cough's chronicity floor needs a 21-day span with no density term
  (`supabase/functions/generate-signal/detection.ts:2799`, the span note at :2889-2897); cough enrols in that lane
  only. The code names the gap and the fix Dr. Chen preferred when ruling Q5b (`:2902-2909`): a density arm, at least
  10 cough days inside any 14-day stretch while ongoing, priced at 0 of 200,000 null pets, which would speak for a cat
  coughing six times a day from day 10 rather than day 22. It was held back only because it is a new fire path on a
  safety detector. The issue's option (a) cites "the day summary and Trend" as cover; the Trend zone was deleted at
  Design v2's GA (#1070).
* **Recommendation (A):** build that arm. **Why:** it is the only option with a measured null cost and a clinical
  ruling behind it. The 21-day span stays the floor for sparse coughs; the arm adds a density route beside it. A
  burden arm on vomit's shape (B) would need its numbers measured from scratch. **Build condition:** the arm's
  "ongoing" is the same recency gate the stand-down reads, so a course that fired on density alone stands down with the
  labelled stood-down line rather than vanishing; and its null price is re-read against N4's 13 null scenarios.
* **Counterexample tried:** a dog with kennel cough, coughing daily for 12 days. The arm fires from day 10 and asks
  for a vet visit. **Held as the safe error.** A dog that reverse-sneezes, logged as cough once or twice a day: the arm
  needs ten days in fourteen, so a fortnight of daily logging fires it. **Held in the loud direction**; the null price
  should be re-read per species at build.
* **Direction:** louder. **Verdict:** adopt provisionally.

### Q21 · CUL-685 · two chronic courses, one banner

* **Today:** the cross-pet banner keeps the first chronicity card the server sends (`lib/signalCopy.ts:2563-2573`,
  strict `<`); the server orders by span (`detection.ts:5472-5479`). Nothing says there is more than one course.
* **Recommendation (A):** add "…and another recurring sign" when a second course is present ("…and 2 other recurring
  signs" for three). **Why:** it discloses
  without inventing a severity order between two signs (C5), the team was unanimous, and "recurring" is the banner's
  own register (`signalCopy.ts:2732`). "Ongoing" would claim a current state for a course last seen weeks ago, the case
  the report dropped the word for (`render.ts:2337-2345`).
* **Counterexample tried:** vomit leads and a chronic cough was last seen 27 days ago, still inside its recency
  window. "Recurring" stays true. **Held.** Not covered: a burden card plus another sign's chronicity course is also
  left undisclosed; that is filed as CUL-1792, to ride the same build.
* **Direction:** louder. **Verdict:** adopt provisionally. Same build session as Q22.

### Q22 · CUL-689 · ⑦ ordering has no recency term (half conflict)

* **Today:** the lane sorts by span, then episodes (`detection.ts:5472-5479`; the same tie-break at :7679-7684); the
  cough-vomit adjacency disclosure marks the leading cough or vomit card (:8179-8199).
* **The mark (A, every lens):** move the adjacency mark to the most recent course; when both share the same last day
  (vomiting after coughing fits often does), keep the current leader. **Neutral. Agree.**
* **The ordering (conflict):** a, span first, documented (Data Scientist); c, span first unless one course has been
  quiet past a bound (Dr. Chen). Both reject b, a global reorder by recency. Neither drops a card. Under c the bound is
  **No source**.
* **Verdict:** the mark agree; the ordering your letter.

### Q23 · CUL-793 · the compare's density ratio

* **Today:** `computeChronicityCompare` uses the shared `DENSITY_COMPARABLE_MIN_RATIO = 0.7` (`detection.ts:4776`,
  used at :4867), calibrated for 7-day windows. Over 28-day halves it lets a long unlogged run pass, eight days at
  best and more when the earlier half was itself thinly logged, including the run up to today. Both counts always
  print and the ask never moves, so nothing reassures on its own.
* **Recommendation (A):** a named `CHRONICITY_COMPARE_MIN_RATIO` at 0.7 (no change in value), plus a trailing-dark
  rule over the same logged-day count the compare already uses (`loggingDaysInWindow`, `detection.ts:4862`: meals,
  symptoms and the sign itself): when the recent half's last 7 days hold none, the pair carries its own sentence ("No
  meals or symptoms were logged in the last 7 days, so the recent count may be low"). It is a disclosure only: a rise
  keeps its direction. The existing "you also logged on fewer days" line is not reused, because the recent half can
  hold more logged days than the earlier one and still end in a dark week. Still unchanged from today: a dark run in the
  middle of the window, or a trailing one broken by a single logged meal, reads at face value. **Why:** the ratio's value has no source either way, while a trailing dark run is the specific case
  the reviewer showed passing.
* **Counterexample tried:** earlier half 12 logged days, recent half 18 with the last 7 dark, counts falling from 6 to
  3. The new sentence prints; the "fewer days" line does not. **Held.** An owner who logs nothing for a week because
  the cat is well: the disclosure prints over a real improvement. **Held as the safe error** (absence is not wellness).
* **Direction:** louder. **Verdict:** adopt provisionally; the 7 days are **No source**. It deploys on merge.

### Q24 · CUL-203 · joint food candidates under EN-11

* **Today:** a joint candidate (`detection.ts:4022`) is capped at Early unconditionally (:4094), and EN-11 withholds
  every Early finding (:4106). So at EN-11's GA, two always-co-fed foods yield no food finding at any sample size, for
  as long as they stay co-fed, even when the corrected test passes.
* **Why that follows from your rulings:** on 2026-09-30 you ruled that a food detection names the reacting protein
  alone; a joint card points a vet's elimination diet at a protein that is not the culprit
  (`supabase/functions/generate-signal/eval/scorecard.ts`, `matchesKey`). D5 = B retired Early. Together they leave a
  co-fed pair nothing it may say.
* **Recommendation (A):** accept it, with the cost stated as **never**, not "later". D5's priced cost was a delay (a
  culprit named about week 8, `docs/engines-v3-critique-2026-09.md:102`, :160), and E2 = B′'s proof reads a 56-day
  horizon, where every food's naming is already 0, so it cannot tell a delay from never. Name joint candidates among
  the cards CUL-1486's GA-day marker withdraws, so the change is said.
* **Option B:** a "feed them apart" suggestion. It fires only where the record already suspects those foods, so it is
  an association claim in all but name, which your 2026-09-30 ruling rules out. **Louder, and against a ruling.**
* **Counterexample tried:** a dog truly reacting to one of two always-co-fed foods, with enough pairs to pass the
  corrected test. Nothing is named, ever. **Not held, and not claimed to:** this is the cost of A, stated so it is
  ruled rather than rediscovered.
* **Direction:** quieter, permanent for a co-fed pair, outside any harness proof. **Verdict:** needs your explicit
  agree.

---

## 4. Part D · The vet report

### Q25 · CUL-1030 · an overnight window reads as logged before it happened

* **Today:** `occurredCell`'s range case prints two clock times with no dates
  (`supabase/functions/generate-report/render.ts:7485-7486`).
* **Recommendation (A):** date each end of a range whose day differs from the row's day, and stamp the year on an end
  whose year differs (C-19). **Why:** a vet reading "11:40 PM – 7:10 AM" on one dated row cannot tell the order.
* **Counterexample tried:** a pile found after a two-night absence: both ends carry dates. **Held.** A window over New
  Year: the earlier end carries its year. **Held.**
* **Direction:** neutral. **Verdict:** agree.

### Q26 · CUL-1004 · what `Set it up` opens

* **Today:** the button was cut before shipping (`app/report.tsx:48`); the line it sat under still shows (:500-506).
  The only code that writes a trial diet is trial setup (`lib/dietTrialSetup.ts:427`). The mid-trial add path refuses
  `primary_diet` on purpose: letting it write a diet-defining row would widen the sanctioned proteins from a screen
  whose copy is "your vet said this is OK", "§5.5 D-A's self-granted loophole, opened by the front door"
  (`:1256-1268`).
* **What any mid-trial set-the-diet write does, beyond today's feedings:**
  1. It re-opens §5.5 D-A and B-616 D5, by design.
  2. Through R13a, which you signed off on 2026-10-01 for the prescribed diet, feedings of that food *before* today
     leave the off-diet count and become a disclosed gap. For a wrongly marked food that removes real contraband from
     the count, retroactively.
  3. It widens the sanctioned proteins (`lib/dietTrial.ts:981`), which strips the protein name from other foods'
     feedings of that protein and the antigen records of permitted extras (`:1052-1056`, :1083-1086); the code calls
     that lost detection, the reassuring direction.
* **Recommendation (A):** offer the write only when the trial records a target protein and every protein on the
  food's label is that protein or a form of it, matched on the exact protein key (so intact chicken never matches a
  hydrolysed-chicken target, `lib/protein.ts:217`); dated today, never back-dated; the report's allowed list names it
  with "set as the trial diet on {date}". **Why:** today the only fix for a trial set up without its diet is ending it,
  which loses its dates. A match on the main protein alone would not be enough: the sanctioned set takes every protein
  on a trial-diet food's label (`lib/dietTrial.ts:645-669`), so a duck kibble listing chicken fat would sanction chicken
  and strip "chicken ×N" from the chews. The cost that remains: a different food of exactly the right protein (a duck
  kibble the vet did not prescribe, on a duck trial) is absorbed.
* **Counterexample tried:** a duck trial, a chicken kibble marked as the trial diet on day 20, no target protein
  recorded. Under A the button does not appear. **Held.** A duck kibble whose label also lists chicken fat, on a duck
  trial with duck recorded: under A it does not qualify. **Held.** Under B (any food) the chicken kibble's 19 earlier
  off-diet days leave the count and the vet-approved chews lose "chicken ×N". **B broke.**
* **Direction:** quieter in the mis-set case, and it re-opens a ruling. **Verdict: needs your explicit agree.** No
  harness reads the trial card or the report; the substitute proof is a test that a food set this way is named on the
  report with its date, and that the past feedings it excludes print as R13a's gap. Whatever you rule, `/trial-foods`
  needs a designed empty state in place of its spinner (C).

### Q27 · CUL-994 · the dose-span sentence

* **Today:** #858 shipped a dose-span sentence (`render.ts:6526`) in place of the suppression the issue specified,
  after two adversarial rounds. It prints whenever a course has a recorded end, a plan and at least one given dose;
  it is silent for an as-needed course, a course with no plan, no recorded end or no dose given (:6527-6534).
* **Recommendation (A):** keep it. **Why:** Dr. Chen, the Data Scientist, the Dir. of Engineering and the adversarial
  reviewer all recommended it, and the sentence hides nothing it prints for.
* **Counterexample tried:** a twice-daily course logged once a day: "The 14 administered doses fell on all 14 days …
  (28 prescribed doses at 2×/day take 14 days)". The shortfall sits in the sentence's subject. **Held.**
* **Direction:** neutral. **Verdict:** agree. The issue's Part 1 (qualifiers for the whole-course figure) leaves the
  sheet for a Designer and Dr. Chen discovery session.

### Q28 · CUL-1027 · "N changes" against starts and stops

* **Today:** `readingTheTrend` prints "N changes overlap this window", or "One change overlaps", counting items
  (`render.ts:5444`), while R-14 draws a mark for each start and each stop. The legend already names each mark
  ("dashed … started; flat-headed … stopped", with both dates per entry, `:5256`).
* **Recommendation (A):** keep it. The cold read wanted events counted; the adversarial reviewer wanted the noun
  renamed; the shipped legend already reconciles the two.
* **Counterexample tried:** an as-needed course with no declared end (a start mark only) beside a regimen started and
  stopped in the window: "2 changes" over three marks, each named in the legend. **Held.**
* **Direction:** neutral (ratifies what ships). **Verdict:** agree. Q29 changes the count.

### Q29 · CUL-1018 · removing an original allowed food draws no mark

* **Today:** `buildConcurrentChanges` skips any allowed-list row that did not open after the trial started
  (`supabase/functions/generate-report/report.ts:6150`), so removing an original food draws no stop mark.
* **Recommendation (A):** mark the removal when its date differs from both the trial's start and its recorded end
  (`ended_at`, never the target date). **Why:** a dated change in the diet is what the chart exists to show; a removal
  on day 1 is a setup correction and one on the day the trial ended is the trial ending.
* **Counterexample tried:** an original food removed on day 30: it draws a stop mark and counts in Q28's N. **Held.**
  An overrun trial with a food removed on the target day: the target is not the end, so the mark draws. **Held.**
* **Direction:** louder. **Verdict:** adopt provisionally.

---

## 5. Part E · Records, words and ratifications

### Q30 · CUL-1231 · a dose re-answered "given directly"

* **Today:** `doseOf` takes the vehicle from the paired meal whenever it is on the day and ignores `how_given`
  (`lib/spineNode.ts:498-506`), so the row keeps naming the meal, and its "picked at", after the owner answers
  "directly". A meal on another day already renders the `how_given` words (`:506-507`).
* **Recommendation (A):** the owner's answer wins in the words: "Prednisone · directly" on Home's Today card and on
  History; the meal row still says "with Prednisone". The pairing itself is not removed, so *Unconfirmed* keeps keying
  on the paired meal and a null adherence (`lib/medications.ts:669-672`). **Why:** the row should say what the owner
  last told us; the link is a fact about when it was logged.
* **Counterexample tried:** the owner taps "directly" by mistake for a pill that was in a picked-at bowl. The dose row
  stops implying the bowl's intake; the meal row still shows "picked at", and *Unconfirmed* stays. **Held**, at the
  cost of one concern cue on the dose row. Built as an unpairing instead, *Unconfirmed* would go too. **That build
  breaks**, which is why A pins the pairing.
* **Direction:** quieter on the dose row. **Verdict: needs your explicit agree.** No harness proof applies (a row's
  words); C ("directly, logged with the 1:00 PM meal") keeps the link visible if you prefer it.

### Q31 · CUL-913 · the look's refusal recency

* **Today:** the code is 3 days (`NOTICED_REFUSAL_RECENCY_DAYS`, `lib/intakeEvidence.ts:79`, since #825, moved there
  in #1140); the spec's T-20 still says 2 (`docs/nyx-daily-look-requirements.md:79`). The server reads the same
  predicate in `analyze-vomit`.
* **Recommendation (A):** write 3 into T-20 and §2 item 12, naming `NOTICED_REFUSAL_RECENCY_DAYS`, never the intake
  detector's own recency constant (C-34: the same value answering a different question is two constants). **Why:**
  the spec's own adversarial gate moved the number; this records a ruling rather than making one.
* **Direction:** neutral. **Verdict:** agree. It can ride CUL-1753's §4.5 edit.

### Q32 · CUL-915 · answering's per-week placement

* **Today:** `compareWord` carries each half's answered days per week (`weekly`, `lib/lookComparison.ts:75`) and gates
  on it (`halfClearsFloor`, :160-163: at least three of four weeks answered); the rendered clause shows only "4 weeks
  before: {days} of {answered}".
* **Recommendation (A):** print the placement on the row's sub-line ("answered 1 · 1 · 7 · 0 by week"), after a frame
  in the daily-look mock, as the spec's §6.5 item 5 already asks. **Why:** a pair over answering bunched into one
  worried week reads the same as a pair over steady answering until the placement is shown.
* **Counterexample tried:** answering of 7 days in one week and 1 in each of two others: the floor passes (three weeks
  answered) and the placement shows the bunching. **Held.**
* **Direction:** louder (a disclosure). **Verdict:** adopt provisionally, mock first.

### Q33 · CUL-1074 · the weight dots' colour

* **Today:** neutral grey (`components/charts/WeightDots.tsx:300-305`); the round-4 frame drew teal.
* **Recommendation (A):** ratify grey. **Why:** B-186: a weight mark never reads as good.
* **Direction:** neutral. **Verdict:** agree. The issue's stale `GA gate` label comes off with it.

### Q34 · CUL-272 · who writes the critical-drug list

* **Today:** nothing reads `is_critical`. The first sheet's T17 ruled a curated list over an owner toggle and said "the
  team will not write it" (`docs/clinical-ruling-sheet-2026-10.md:1277-1278`); the vet review was then canceled, so
  T20 and T17's call-now half are held with no owner.
* **Recommendation (A):** the team drafts the list from published references, qualified by indication where a drug is
  critical for one use and not another, and brings it back as a row for your agree. A drug critical for some use counts
  as critical unless the course's indication matches one of its listed non-critical uses; the indication is optional
  free text, so a blank, a nickname ("her daily pill") or a misspelling all count as critical. **Why:** it is the only
  route left, and E-6 adopts the louder change provisionally. **This re-opens T17's "the team will not write it".**
* **Counterexample tried:** prednisolone, critical as replacement therapy and not as an anti-inflammatory. A drug-only
  list would call on every missed dose; the qualifier fixes that. **Held.** An Addisonian dog on prednisolone whose
  indication reads "her daily pill": it matches no non-critical use, so it counts as critical. **Held**, at the cost of
  a louder call for some anti-inflammatory courses whose indication is not written in the list's words.
* **Direction:** louder. **Verdict:** adopt provisionally; the list itself comes back.

### Q35 · CUL-672 · the §15 vet question sheet

* **Today:** F1, F3 and F4 were ruled the day the sheet was drafted (D20 to D22); the vet review it was meant for is
  canceled; draft #765 holds the send-ready form.
* **Recommendation (A):** keep it as an errand for your own vet, sent with the report CUL-598 asks you to email, and
  merge #765. Its A/B/C scenarios become checks on D20 to D22. **Why:** your GP visit is the one real-vet route left.
* **Direction:** neutral. **Verdict:** agree.

### Q36 · CUL-591 · Ask on an overrun trial

* **Today:** Ask's trial tool returns `active: true, complete: true, daysRemaining: 0` for a trial past its target,
  with no overrun field (`supabase/functions/ask/tools.ts:1423-1442`), and Ask routes "how's the trial going?" to it.
  On day 412 of a 56-day trial Ask can say the trial is complete. The trial screen says "Day 412 — 356 days past the
  window you set" and puts a decision in front of the owner (`lib/dietTrialCard.ts:2541`). The comment at
  `ask/index.ts:844-855` claims parity with the card; it is stale.
* **Recommendation (A):** Ask relays the trial screen's overrun words and never says complete for a trial nobody
  ended. **Why:** "complete" is a success reading of a trial left running (B-422), and it contradicts the screen (G5).
* **Options:** B, gate Ask on `isTrialRunning`: Ask would answer "no trial" about a trial on the owner's screen. C, let
  it stand (the first draft's recommendation): **broke**, it lets the success reading through.
* **Counterexample tried:** "how's the trial going?" on day 412 of 56. Under A Ask says the trial is 356 days past its
  window and that the owner and vet decide what happens next. **Held.**
* **Direction:** louder. **Verdict:** adopt provisionally. Not a gate.

### Q37 · CUL-590 · the course-end hedge

* **Today:** "Is this course finished? · Your vet has the final say. · Mark as finished" (`lib/medications.ts:1302-1304`).
* **Recommendation (A):** keep it. **Why:** the adversarial pass required the hedge against a taper being stopped
  early. Once Q34's list exists, a critical drug could take a fuller deferral; that would be its own row.
* **Counterexample tried:** phenobarbital entered as a 30-day course gets the same one-line hedge. **Held, weakly**,
  which is why the critical-drug follow-up is named.
* **Direction:** neutral. **Verdict:** agree. Its device check joins the next cut's sitting.

### Q38 · CUL-595 · zoom past real pixels (conflict)

* **Today:** `MIN_MAX_ZOOM_SCALE = 2.5` (`lib/photoZoom.ts:39`); setting it to 1 is a one-line change (:32).
* **A (Engineer, Designer):** keep 2.5: a dead pinch reads broken, and magnification helps point at a region.
* **B (Dr. Chen):** 1: magnified JPEG artifacts on a suspected-blood or foreign-material photo can read as texture.
* **Verdict:** your letter, ideally after looking at an older photo zoomed on your phone.

---

## 6. The adversarial pass

Three isolated `adversarial-reviewer` runs read the first draft cold, one per part, against the code at `5fb9cd3a`.
Each verified every citation, checked every direction label, and tried its own counterexample per row. **All three
failed the draft: 16 blocking breaks, ten of them a quieter change labelled louder, neutral or safer** (Q2 (a), Q3.4,
Q4 W4 and W7, Q9, Q13.2, Q13.5, Q14, Q24, Q36), the one class E-6 exists to stop. Every break was rewritten, and the second and final pass (the two-pass cap) is recorded in §6.2.

### 6.1 Pass 1

| Row | What the reviewer tried | Result | What changed |
|---|---|---|---|
| Q1 | Traced the "83% to 28%" figure | Wrong figure: false worsening cards, a safety lane outside the budget | Says the insight-card rate is unmeasured; food 44% to 0; set x at go-live size; per-trial number added |
| Q2 (a) | An EN-9 that never re-raises its concern | **Broke, quieter labelled neutral:** passes the narrowed line while the burden card props up the paired doubling line | The split now moves both paired lines; re-pins the frozen digest |
| Q3.1 | A 3.37 kg typo; an identical re-weigh after an 11% drop | **Broke:** the typo fires through W2 regardless; the re-weigh stays unconfirmed | Recommendation flipped to dropping the rule (the signed-off W1); costs stated |
| Q3.2 | A 25% loss on an unweighed 12-week plan | **Broke:** silent forever, not "caught later" | Recommends a target-aware anchor; sign-off |
| Q3.4 | A plan saved three days after the visit | **Broke:** a 13% loss reads level | The start stamp at the visit's weigh-in is now a condition |
| Q4 W4 | A 300 g kitten down 20 g | **Broke, quieter labelled neutral:** "less than 0.1 lb" with no 7% | Recommendation flipped to keep |
| Q4 W7 | Relabelling a visit-day home reading as the vet's | **Broke, quieter labelled neutral:** a confirmed soft card drops | Condition: a relabel never lowers a raised row |
| Q4 W5, W6 | An identical later reading; a writer against today | W5's row could stay forever; W6's label compared only to B | Tied W5 to Q3.1; W6 labelled against both |
| Q5 | Read D28 and S4-6 | D28 sentence inverted; A's cost unstated | Corrected; S4-6 cost stated |
| Q6 | A pending row under a day at send | Held: the report screen's B-534 line covers it | Added to Today |
| Q7 | Three picked-at bowls | Broke: "3 refused" over "picked at" rows (R15, R4); Meal row unspecified | R4's wording; the Meal row splits, never shrinks |
| Q8 | Read CUL-1263 (a)'s header | Conflicted with a recorded ruling | Now moot under CUL-1263 (a) |
| Q9 | An 08-29-build hide of a reduced-intake call | **Broke, quieter labelled neutral:** no surface on that build keeps it; the report never had n=1 calls | Rewritten; sign-off; the next cut closes it |
| Q10 | Read `readState`'s exit | The exit is unbuilt; "the report" was wrong | States it; Ask words it as the record does |
| Q11 | Read the marker and the lines | Wrong lines; the CUL-649 precedent was not shipped | Fixed; spend the marker rather than defer it |
| Q12 | A bout on its third week | "From the week before" false there; Signal sibling found | Reworded; sibling named for filing |
| Q13.2 | A stood-down card beside a trial refusal | **Broke, quieter labelled safer:** removes the visit ask and "That isn't an all-clear" | Line kept whole, not-eating fact added |
| Q13.5 | A day-1 refuser with a rising rapid share | **Broke, quieter half:** draws a falling compare beside a starving cat | Words only, never the drawn totals |
| Q14 | A permanently stuck row | **Broke, quieter path added:** burns the 12-a-day cap, delays a later red flag | Stuck rows excluded from the flag |
| Q16 | A vomit two days back at 08:00 | Count did not match its label; row 2 amended a ruling unsaid | Counts from the named day; amendment stated |
| Q17 | A refusal plus an intake decline | The draft's "only route" claim broke; recommendation held | Why restated: every route passes a safety block |
| Q18 | A "Not yet" reopened later | B's cost overstated, tilting the letter | B's cost corrected |
| Q19 | A recheck already booked | B missed a precondition | CUL-1531 named |
| Q20 | Read the code's named gap | Missed Dr. Chen's measured Q5b arm | Recommends that arm |
| Q21 | A cough last seen 27 days ago | "Ongoing" claims a current state | "Recurring" |
| Q22 | A post-tussive vomit tie | Tie-break and option b undefined | Both defined |
| Q23 | A dark final week over a better-logged half | The reused sentence would print a false "fewer days" | Its own sentence |
| Q24 | A co-fed pair that passes a corrected test | **Broke, quieter labelled a record:** withheld forever, past E2's 56-day proof | Explicit agree; cost stated as never |
| Q25 | A window over New Year | Held; year needed | Year stamped |
| Q26 | A chicken kibble marked on a duck trial | **Broke, scope understated:** retroactive count change, protein names stripped, D-A re-opened | Protein-match condition; re-opening named |
| Q27 | A twice-daily course logged once a day | Held; "always" overstated | Conditions stated |
| Q28 | Read the legend | Held; the legend already reconciles | Ratifies what ships |
| Q29 | An overrun trial's target day | "End" ambiguous | Recorded end only |
| Q30 | An unpairing build | `Unconfirmed` would drop too | Pairing pinned |
| Q31 | Read T-20's constant | Would have edited the detector's constant | Names the look's own constant |
| Q32 | Read `weekly` | Misdescribed: answered days, not the word's | Restated as answering's placement |
| Q34 | A blank indication | Qualifier could not resolve; T17 re-opened unsaid | Blank counts as critical; re-opening stated |
| Q36 | "How's the trial going?" on day 412 of 56 | **Broke, quieter labelled neutral:** Ask says "complete" | Flipped to C |
| Q15, Q33, Q35, Q37, Q38 | Each row's own case | Held | Citations corrected where needed |

### 6.2 Pass 2 (final)

Two isolated reviewers attacked the rewritten rows, one for Part A and one for Parts B to E, running the weight cases
on scratch copies of `lib/weightStory.ts`. Both failed the rewrite: **12 blocking findings, 11 of them quieter**, all
fixable in text and all fixed above. The project caps adversarial passes at two per PR, so there is no third pass; what
remains is stated below, and every residual either errs loud or sits on a row you rule explicitly.

| Row | What the reviewer tried | Result | What changed |
|---|---|---|---|
| Q4 W7 | A vet reading added after a home-raised soft card; vet 11.0 then 9.9 lb, then home 10.0 lb | **Quieter on every vet-scale path:** the card goes, firm turns soft, a vet-to-vet 10% loss vanishes, a vet-weighed plan start silences 14.5% | The condition now covers added as well as relabelled readings, and home readings over a vet-to-vet loss; four fixtures owed by PR-37 |
| Q3.1 | Vet 11.0 then 9.9 lb, then home 9.9 lb | **Quieter case:** without the rule, firm softens to soft | Tied to W7's condition, where vet readings first exist |
| Q3.4 | A home weigh-in at the plan's start instant; a 7-day lookback with an older, lower reading | **Quieter:** the literal condition never anchors that weigh-in; B was labelled louder but is mixed | The lookback includes the start instant; B relabelled mixed |
| Q3.2 | A failed plan, then a 12 to 13% loss months later, under the target-aware anchor | **Quieter, cost understated:** about 14 to 15% to fire, soft line off, no end date | Recommendation reverted to the built anchor (a loud error); the target-aware anchor is an option needing sign-off |
| Q2 (a) | Read both scoring sites | **Wrong fact:** the 5% line has its own ask check; two sites feed six lines | One shared predicate, a test that the sites agree, all six lines named in the re-pin |
| Q8 | A treats-only day after CUL-1263 | **Quieter residual:** the Daily Recap keeps counting treats as meals | The Recap's chips count treats as treats; Home rides CUL-1263 |
| Q14 | A vomit logged at hour 2 of a 28-hour offline stretch | **Quieter:** the "stuck" exclusion left a 24-hour calm cache over it | Only rows the server refused are excluded; any other row sets the flag at any age |
| Q13.3 | Read the script's masking rule | **Quieter half:** put a withheld fall back on the script read aloud | The not-eating fact becomes its own script row; the fall stays withheld |
| Q26 | A duck kibble whose label lists chicken fat | **Wrong fact:** a main-protein match still sanctions chicken | Every protein on the label must match, on the exact key |
| Q34 | An indication reading "her daily pill" | **Quieter residual:** unmatched text counted as not critical | Default flipped: critical unless a listed non-critical use matches |
| Q36 | Read the option letters | **Quieter if misread:** "Q36 A" could select the broken option | The recommendation is A; the broken option is C |
| Q18 | Compared the two sides' costs | **Leaned loud:** B's stated cost is shared by A | The shared cost is stated; the real difference is named |
| Q9, Q10, Q13.2, Q13.5, Q20, Q21, Q23 | Wording and build conditions | Held on direction | Applied: the shared read state on `main`, the *Show* link, tier words, the 48-hour ask, ruling (a)'s extension, the density arm's stand-down, three courses, the logged-day count |
| Q1, Q2 (b), Q4 W4 and W6, Q7, Q11, Q12, Q15, Q16, Q17, Q19, Q22, Q24, Q30, Q32 | Each row's own case | Held | None beyond wording |

**Residuals that stand, all loud** (adopted provisionally with the rows that carry them):

* Q3.1: until PR-37 removes the pre-fill, a pre-filled drop under 0.6 kg can confirm a false weight card.
* Q3.2: a prescribed loss raises a soft card the day an unweighed plan lapses.
* Q5: a card for a recurring, acknowledged sign is always present.
* Q10: a note hidden because the photo was the wrong pet's keeps its call in Ask until CUL-1107 ships.
* Q20: kennel cough, and a reverse-sneezing dog logged as cough, fire the density arm.
* Q23: the dark-week disclosure prints over a real improvement.
* Q34: an anti-inflammatory course whose indication is not written in the list's words calls on a missed dose.

**Quieter residuals you rule knowingly** (each on a sign-off or explicit-agree row): Q9 (the old build until the next
cut), Q24 (a co-fed pair, never named), Q26 (a different food of exactly the right protein is absorbed), Q30 (one
concern cue on the dose row).

**Unchanged from today, not introduced here:** a dark run in the middle of the compare window still reads at face value
(Q23); the Signal card's weekly line has the same onset blind spot as the month (Q12); a burden card beside another
sign's chronic course is not disclosed (Q21). The last two are filed as CUL-1791 and CUL-1792.

## 7. Rulings received

_To be filled when you rule._
