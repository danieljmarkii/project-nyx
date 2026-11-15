# Pet memory page: can editing a standing fact quiet a warning? (code walk)

**Date:** 2026-11-15 · **Status:** frozen point-in-time brief · **Issue:** [CUL-2787](https://linear.app/projectnyx/issue/CUL-2787) · **Method:** a read-only walk, by the Data Scientist lens, of every reader of each standing-fact table in `supabase/functions/generate-signal/`, `ask/`, `generate-report/`, `analyze-vomit/`, `analyze-stool/`, `_shared/` and the `lib/` modules that gate a safety surface. It builds on the CUL-2753 input audit (which field each function selects) and adds what each reader does with the fact and what each owner action would change. Line numbers are as of commit `13d6ac194`. **Nothing was executed.** Every scenario below is traced by reading the code and doing the arithmetic by hand. Anything not opened is marked [not verified].

This file carries evidence only. The decision briefs live on the issue.

Words used the same way throughout:

- **Warning**: a safety-class Signal card, its ask, a per-incident call tier, or a vet report flag.
- **Softening**: a reassuring number or sentence appears (a zero, "fewer", "down from"), or a hedge is added, without a warning being removed.
- **GA**: runs for every owner today. **Flagged**: runs only behind an `engines_v3_*` key or `report_document_v2`, each allowlisted to one account today (audit §1).

---

## 1. The short version

Edges that can remove, soften, delay, cap or re-rank something, most severe first. "Shipped" means the owner can already do the action in the app today.

| # | Fact and action | What goes quiet | Where | GA or flagged | Shipped today |
|---|---|---|---|---|---|
| Q1 | **Vet visit**: add one with a recent date, or move a visit's date later | The default report window opens at the newest visit before today, with no minimum length. Window-scoped flags (ongoing, burden, worsening, blood or foreign material seen in a photo) are computed over that window only | `generate-report/report.ts:1201-1213`, `:4777` | GA | Yes: log a visit, edit its date |
| Q2 | **Appointment**: book one within 30 days; reschedule it forward | The weight card and a never-answered ongoing-sign card lose their ask (`visit_booked`). Rescheduling the same row forward keeps the quiet window from ever being spent | `generate-signal/careState.ts:1195-1215`, `:1353-1373`, `:1395-1418` | en9 | Yes: book, reschedule |
| Q3 | **Weight**: delete or lower the year's high reading; add a wrong high reading after the low; move a reading's date | The weight loss card and the report's weight flag turn off or drop a tier | `lib/weightStory.ts:421-560`, `generate-signal/detection.ts:5916-5947`, `generate-report/report.ts:5996` | en8 | Yes: edit value and date, delete, log a new one |
| Q4 | **"My vet knows" and its siblings**: add an answer; add one again after the sign came back | The ongoing-sign and getting-worse cards for that sign stop asking and rank below every other safety card. Ask relays them last | `careState.ts:1175-1284`, `:1501-1509`; `lib/careState.ts:35-42`; `ask/answer.ts:1180-1198` | en9 | Yes |
| Q5 | **Medicine course**: add one (wrong or never given) and answer "my vet started it" | The same quiet as Q4 for up to 56 days when no dose is logged | `careState.ts:491-506` | en9 | Yes |
| Q6 | **Free feeding**: add an arrangement; a removal (not an ending) of one | Add: later ratings of that food leave the intake decline lane and the sustained refusal floor. Remove: a bowl's "ate it all" ratings count again and can clear the floor | `detection.ts:4398-4432`, `:4661-4706`; `lib/freeFedIntake.ts` | GA | Add and end: yes. Remove: no |
| Q7 | **Pet species**: change cat to dog or other | The cat intake arm of the vomit and stool reads stops. The all-refused "call today" intake card is cats and others only | `analyze-vomit/context.ts:351`, `:464`; `detection.ts:4545`, `:4592` | GA | Yes: Edit pet |
| Q8 | **Date of birth**: set one on a pet with none, or move a young pet's earlier | T7 (two vomits in 24 hours, under six months or no birthday on file, call today) stops applying to later reads. The weight lane's young-pet soft line moves to the adult 5% line | `lib/incidentFloor.ts:247-251`; `lib/weightStory.ts:208-216`, `:366-368` | en4 + en3; en8 | Yes: Edit pet |
| Q9 | **Diet trial with indication skin**: add one, or one already runs | On the v2 report an ongoing skin-sign flag moves out of the flags band to head the lead chart | `generate-report/v2Predicates.ts:205-221`, `:277-286` | `report_document_v2` | Yes: start a trial |
| Q10 | **Diet trial**: end it | The trial card's live refusal register (client) and the report's trial diet refusal flag depend on a trial. The falling-vomit withhold from the trial's not-eating register stops | `lib/dietTrialCard.ts:961-1036`; `report.ts:5896-5914`; `lib/signalVisible.ts:67-82` | GA | Yes |
| Q11 | **Diet trial foods**: add a food to the allowed set | Feedings of that food stop counting as off-diet exposures on the trial card and the report [not verified line by line] | `lib/dietTrial.ts:950-1044` | GA | Yes: add. No remove |
| Q12 | **Medicine course**: remove it, rename it to a non-masking drug, or move its start into the future | Softening only: the zeros and falling comparisons that the masking span was withholding can print (Signal context lines, Signal screen, Get ready, Ask) | `lib/maskingSpans.ts:325-354`; `careContext.ts:241-248`; `lib/screenMasking.ts:410-449`; `ask/answer.ts:965-1018` | en10 (Ask's screen: GA) | Rename and start edit: yes. Remove: no |
| Q13 | **Vet visit**: a removal, or moving its date earlier | Softening only: the 42-day no-zero span after the visit ends or moves | `maskingSpans.ts:342-349`; `careContext.ts:303-322` | en10 | Date edit: yes. Remove: no |
| Q14 | **Medicine course**: add one | Insight only: every food finding for a sign is capped at Early, or suppressed when the course's start or end falls inside the analysis window. Under en11 a capped finding is withheld | `detection.ts:4033-4047`, `:4217-4230` | GA (withhold: en11) | Yes |
| Q15 | **Diet trial**: add or keep an active one | Insight only: three diet-pattern cards are muted and food findings are promoted a band | `detection.ts:7618`, `:7695`, `:7769`, `:8380` | GA | Yes |

Not on the list, on purpose: no standing-fact edit lowers a call tier that is already stored (section 5), and `conditions` is read by nothing but the report's identity block (section 4).

---

## 2. Every edge

Classes: **LOUD** = the action can only add or keep a warning. **QUIETS** = it can remove, soften, delay, cap or re-rank (the Q number points at section 3). **NEUTRAL** = no effect on a warning. Actions: **(1)** soft delete or removal, **(2)** ending, **(3)** date moved, **(4)** value edited, **(5)** a wrong one added. "n/a" means the row has no such state.

### 2.1 conditions (condition_name, status, diagnosed_at)

| Consumer | Presence does | (1) remove | (2) resolve | (3) date | (4) name | (5) add wrong |
|---|---|---|---|---|---|---|
| Report identity block, v1: `render.ts:1969-1978` | Prints "Recorded conditions:" for rows with status `active`, with "(since date)" and "owner-recorded history, not a finding in this window" | NEUTRAL (context line goes) | NEUTRAL: `monitoring` and `resolved` both drop off page 1 | NEUTRAL | NEUTRAL | NEUTRAL |
| Report identity block, v2: `documentV2.ts:444-449` | Same line on the masthead | same | same | same | same | same |
| Report appendix row: `render.ts:12167-12168` | Lists every condition in the snapshot with its status | NEUTRAL | NEUTRAL | NEUTRAL | NEUTRAL | NEUTRAL |
| generate-signal, ask, analyze-vomit, analyze-stool | No read | n/a | n/a | n/a | n/a | n/a |

No report flag, tier or chronicity rule reads a condition today (section 4).

### 2.2 medications (drug_name, started_at, ended_at, status, target duration) and medication_administrations

| Consumer | Presence does | (1) remove | (2) end | (3) date | (4) drug name | (5) add wrong |
|---|---|---|---|---|---|---|
| Food correlation, regimen span as an exposure: `pipeline.ts:303-307`, `detection.ts:4033-4047`, `:4217-4230`. GA | Caps every food finding for a sign at Early when a drug is on board in any matched window; suppresses them all when the drug is case-enriched | LOUD for the insight (cap lifts) | Mixed: an end inside the lookback creates the on/off transition that can suppress | Mixed, same reason | NEUTRAL (identity-agnostic, `detection.ts:570`) | **QUIETS Q14** |
| Same, under en11: `detection.ts:4235` | A capped finding is withheld, not shown as Early | LOUD | Mixed | Mixed | NEUTRAL | **QUIETS Q14** |
| Dose points: `pipeline.ts:308-325` | A given or partial dose is a point exposure; missed and refused are dropped | Deleting a dose event: LOUD for the insight | n/a | Mixed | Adherence edit to refused: LOUD for the insight | QUIETS Q14 |
| Med-on-board context line: `medContext.ts` | Adds "During an active {drug} course" to food and trial cards | NEUTRAL | NEUTRAL | NEUTRAL | NEUTRAL | NEUTRAL |
| EN-10 context lines and masking: `careContext.ts:224-287`, `maskingSpans.ts:325-341`. en10 | A course that can hide the sign withholds every zero from its start to its end plus 42 days. A name the table cannot resolve masks every sign | **QUIETS Q12** | LOUD-leaning: the span runs 42 more days, then ends | **QUIETS Q12**: a start after today masks nothing (`maskingSpans.ts:330`) | **QUIETS Q12**: a name that resolves to a class that does not mask the sign. An unknown name is LOUD | LOUD (more zeros withheld) |
| Client screen masking: `lib/screenMasking.ts:223-236`, `:410-449`, `:483-503`. en10 row stamp | Sets aside a falling or zero trial pair, a falling reflection and the stood-down line when their window touches a span | **QUIETS Q12** | as above | **QUIETS Q12** | **QUIETS Q12** | LOUD |
| Care state "since" line: `careState.ts:1086-1087`. en9 | Same zero rule on a watched row | QUIETS Q12 | as above | QUIETS Q12 | QUIETS Q12 | LOUD |
| Care state, a `vet_started_course` answer's scope: `careState.ts:491-506`. en9 | Keeps the answer live while the course runs. Lapses on: end date passed, status completed or stopped, 14 days after the last given dose, 56 days after the answer when there is no target or no dose | LOUD if the scope reads as missing (`scope_missing`, `:942`) [the shell's mapping of a missing course was not opened] | LOUD (`course_ended`) | A later last dose extends the quiet by up to 14 days per dose: QUIETS (delay) | NEUTRAL to the state | **QUIETS Q5** |
| Ask zero screen: `ask/answer.ts:965-1018`, `:1063-1068`. GA | Refuses an answer that puts a zero beside a course on board, in its 42-day tail, or whose span touches the question's window | **QUIETS Q12** | Tail still screens | QUIETS Q12 | The screen is name-agnostic for regimens [the class test inside `zeroBesideCareReason` was not opened] | LOUD |
| Ask `medications` tool: `ask/answer.ts:397-399` | Descriptive counts | NEUTRAL | NEUTRAL | NEUTRAL | NEUTRAL | NEUTRAL |
| Report detection input: `report.ts:4344-4362` | Same cap and suppress as the Signal, on the report's Established and Early lists | LOUD for the insight | Mixed | Mixed | NEUTRAL | QUIETS Q14 |
| Report medication section and facts (`medicationFacts.ts`) | Prints the regimen, doses, adherence | NEUTRAL to flags [not verified line by line] | NEUTRAL | NEUTRAL | NEUTRAL | NEUTRAL |
| Per-incident floor: `lib/incidentFloor.ts:30-32` | No read. T20 and T21 (drugs on board) are held, not built | n/a | n/a | n/a | n/a | n/a |
| Med strip on Home (`lib/medStrip.ts`) | A dose reminder surface, not a warning [not verified] | NEUTRAL | NEUTRAL | NEUTRAL | NEUTRAL | NEUTRAL |

### 2.3 diet_trials (started_at, ended_at, status, target_protein, indication, extension) and diet_trial_foods

| Consumer | Presence does | (1) remove | (2) end | (3) date | (4) value | (5) add wrong |
|---|---|---|---|---|---|---|
| `dietTrialActive`: `generate-signal/index.ts:728-733`, `pipeline.ts:761-770`; `report.ts:4372-4375`. GA | Mutes staple washout, meal-type collapse and diet churn (`detection.ts:7618`, `:7695`, `:7769`); promotes food findings to band 1 (`:8380`) | LOUD for those insights | LOUD for those insights | A longer target keeps the mute longer | NEUTRAL | **QUIETS Q15** |
| Trial response lane: `detection.ts:7089-7108` | An insight comparing the trial era with the 49 days before. Can say "fewer" | The card goes (it can be a reassuring one or a rising one) | same | A back-dated start moves the boundary between the two windows | NEUTRAL | A new "fewer" sentence is possible: softening |
| EN-10 trial line: `careContext.ts:289-311`. en10 | "{Protein} trial, day d of n: k episodes", only on a sign the indication covers (`:118-122`) | NEUTRAL (context) | NEUTRAL | NEUTRAL | Indication or protein edit changes which cards carry the line | NEUTRAL; a zero is withheld by the same span and coverage rules |
| Care state, a `vet_started_trial` answer's scope: `careState.ts:477-489`. en9 | Keeps the answer live until the trial's end date passes or its **initial** target is reached | LOUD | LOUD (`trial_ended`) | Extending does not extend the quiet: the rule reads `target_duration_days_initial` (`index.ts:1223`). LOUD | NEUTRAL | **QUIETS**: the same shape as Q5, quiet until the initial target day |
| Ask: `ask/index.ts:766`, `since_trial_start` window, `diet_trial_status` tool | Descriptive | NEUTRAL | NEUTRAL | Window moves | NEUTRAL | NEUTRAL |
| Report scope rung 2: `report.ts:1259-1297` | With no visit on file the window opens at the trial start, floored at 28 days; an ended trial anchors for 90 more days | Falls to the 90-day window (wider): LOUD-leaning | Same window for 90 days | A later start narrows the window to no less than 28 days: mild QUIETS | NEUTRAL | A new trial narrows a 90-day window to 28: mild QUIETS |
| Report trial block and `trial_diet_refusal` flag: `report.ts:5896-5914`, `trial.ts:1038`, `:1255-1320` | The flag needs a selected trial and feedings classed as the trial diet (role `primary_diet`) | **QUIETS Q10**: the flag has no trial to hang on. The generic intake flag and sustained refusal floor do not depend on a trial | Kept for the 90-day grace, then **QUIETS Q10** | Mixed | Removing or re-roling the primary diet food empties the trial-diet population: QUIETS Q10 [not verified line by line] | Could add a flag: LOUD |
| Report `protein_mismatch` flag: `report.ts:5268-5285`, `:5927-5940` | Fires when the owner's target protein disagrees with the food's primary protein | QUIETS (flag goes with the trial) | as above | NEUTRAL | Editing the target to match clears it. That is the correction the flag asks for | LOUD |
| Report R-11: `v2Predicates.ts:205-221`, `:277-286`. `report_document_v2` | With indication exactly `skin`, an ongoing itch, scratch or skin-reaction flag that is the only flag able to lead moves out of the band to head the lead chart | LOUD (flag returns to the band) | LOUD after the grace | NEUTRAL | Indication edited to skin: **QUIETS Q9** | **QUIETS Q9** |
| Trial card live refusal and not-eating register (client): `lib/dietTrialCard.ts:961-1036` | "Needs a call today" style register over a refused trial diet; also feeds the falling-vomit withhold (`lib/signalVisible.ts:67-82`) | **QUIETS Q10** | **QUIETS Q10** | Mixed | Allowed-set edits change the population | LOUD |
| Off-diet classification: `lib/dietTrial.ts:950-1044`, used by the card and `generate-report/trial.ts` | A feeding outside the allowed set is an exposure | Removing an allowed food: LOUD (more exposures) | `allowed_until` set: LOUD after that day | `allowed_from` moved earlier: QUIETS Q11 | Role edit: mixed | **QUIETS Q11** |
| generate-signal | Does not read `diet_trial_foods` (audit) | n/a | n/a | n/a | n/a | n/a |

### 2.4 weight_checks (value, date, source)

| Consumer | Presence does | (1) remove | (2) | (3) date | (4) value or source | (5) add wrong |
|---|---|---|---|---|---|---|
| Weight lane: `generate-signal/index.ts:1140-1166`, `detection.ts:5916-5947`, `lib/weightStory.ts:421-560`. en8 | Raises the weight loss card (soft at 5%, firm at 10% of a confirmed high in the last 365 days) | **QUIETS Q3** when the row is the high or the low's pair. Removing a later higher reading is LOUD | n/a | **QUIETS Q3**: out of the 365-day window (`:413-416`), or after the low | **QUIETS Q3**: lower the high, raise the low, set source to `estimate` (not counted, `:425-427`). A home scale reading next to a clinic one adds the noise band to the line (`:354`) | **QUIETS Q3**: a higher reading after the low becomes the low level (`:331-337`) |
| Report weight flag: `report.ts:4423-4435`, `:5973-6008`. en8 | Same lane, run at window end and at now | QUIETS Q3 | n/a | QUIETS Q3 | QUIETS Q3 | QUIETS Q3 |
| Report weight display: `report.ts:7680-7716`. GA | The printed change comes from the same `weightStory()` | Softening | n/a | Softening | Softening | Softening |
| Ask `weight_summary`: `ask/index.ts:708-716`, `answer.ts:378-380` | Series, latest, delta, neutral direction; never a verdict | NEUTRAL to warnings; the numbers change | n/a | same | same | same |
| Care state booked visit on the weight card: `careState.ts:1402-1411` | The quiet is tied to the latest reading's day | A new reading resets "latest day": the one-window-per-drop count restarts | n/a | same | n/a | QUIETS Q2 (delay) |
| Per-incident floor, chronicity, burden, intake | No read | n/a | n/a | n/a | n/a | n/a |

Weight plans and stand-downs exist in `weightStory()` (`:274-306`) but the shell passes neither (`index.ts:1165`), so no owner fact reaches them today.

### 2.5 vet_visits (visited_at)

| Consumer | Presence does | (1) remove | (2) | (3) date | (4) | (5) add wrong |
|---|---|---|---|---|---|---|
| Report scope rung 1: `report.ts:1201-1213`. GA | The default window is "since the newest visit strictly before today". No minimum | LOUD-leaning: falls back to an older visit, the trial, or 90 days | n/a | Later: **QUIETS Q1**. Earlier: LOUD | n/a | **QUIETS Q1** |
| Thin record line: `v2Predicates.ts:425-439` | Prints "too short for the checks that compare weeks" when the window is short | Softens Q1's cost: the gap is disclosed | | | | |
| EN-10 visit line and 42-day no-zero span: `index.ts:1070-1080`, `careContext.ts:240-248`, `:313-331`, `maskingSpans.ts:342-349`. en10 or en9 | Withholds every zero in a window that touches the 42 days after the newest visit; prints "Anything given at the visit isn't in the record" | **QUIETS Q13** | n/a | Earlier: **QUIETS Q13**. Later: LOUD | n/a | LOUD (more zeros withheld) |
| Client screen masking, every visit day: `lib/screenMasking.ts:254-256` | Same span rule over all visits | QUIETS Q13 | n/a | QUIETS Q13 | n/a | LOUD |
| Care state: `careState.ts:16-18` | "A visit alone is nothing": no visit enters a count, a floor or a state. A visit answer stores its own `anchor_on` date on the answer row | NEUTRAL: the answer keeps its stored date | n/a | NEUTRAL, same reason | n/a | NEUTRAL without an answer |
| Ask | No read (audit). Its zero screen keys on the question's words, `answer.ts:1018` | n/a | | | | |

### 2.6 vet_appointments (scheduled_at, cancelled_at, deleted_at)

| Consumer | Presence does | (1) remove | (2) cancel | (3) date | (5) add wrong |
|---|---|---|---|---|---|
| Booked visit on a never-answered ongoing-sign card: `careState.ts:1195-1215`, `:1353-1360`. en9 | A standing visit from today to today + 30, or one passed in the last 7 days, sets `visit_booked`: no ask, ranked below other safety cards. One quiet window per course (`:1371-1373`) | LOUD: a deleted row is refused (`:1341`) | LOUD | **QUIETS Q2**: moved forward inside the horizon, the window never spends | **QUIETS Q2** |
| Booked visit on the weight card: `careState.ts:1402-1417` | Same state, tied to the latest reading's day | LOUD | LOUD | QUIETS Q2 | **QUIETS Q2** |
| Getting-worse card: `careState.ts:1293-1297`; `lib/signalHomeLine.ts:260-274` | Keeps its ask, re-worded "worth calling before {date}" | LOUD | LOUD | NEUTRAL | Softening (the ask's words change) |
| Any other safety card: `careState.ts:1419`; `lib/careState.ts:94-96`, `:211-215` | Gains the date. On a card whose ask says "call ... today" the client adds "Visit booked for {date}. A call today may still be worth it." Never on a "call now" card (`:186-188`) | NEUTRAL | NEUTRAL | NEUTRAL | Softening: a hedged line beside an unchanged ask |
| Watched concern to `recheck_booked`: `careState.ts:1424-1434` | A label change on an already quiet row | NEUTRAL | NEUTRAL | NEUTRAL | NEUTRAL |
| Recheck question: `careState.ts:1470-1492` | Off (`recheckQuestionDays: null`, `:121`) | n/a | | | |
| Report, Ask | No read (audit); Ask relays the cached state | | | | |

### 2.7 care_acknowledgements (all five sources, retracts) and vet_calls

| Consumer | Presence does | (1) retract | (3) date | (5) add wrong |
|---|---|---|---|---|
| Care state: `careState.ts:444-474`, `:510-523`, `:1175-1284`. en9 | A live answer moves the sign's ongoing and getting-worse cards to `with_vet`: no ask. It returns only on a tested change (rate, dense week, co-sign, the cough and vomit pair), `:679-760` | LOUD (`retracted`, `:451`) | An anchor after today or after the answer's own day never counts (`:456-457`). An earlier anchor moves the reference window (`:574-604`): mixed [not traced to a number] | **QUIETS Q4** |
| Rank: `careState.ts:1501-1509` | Watched concerns move below every other safety card | LOUD | | QUIETS Q4 (re-rank) |
| A second answer after a re-raise: `careState.ts:538-543`, `:1238` | Written after the re-raise and about a day on or after it, it releases the latch | LOUD | | **QUIETS Q4** |
| Client: `lib/careState.ts:35-42`, `lib/signalHomeLine.ts:260` | Drops the ask only for `with_vet`, `recheck_booked`, and `visit_booked` on an ongoing-sign card. A care state on any other card type is ignored | LOUD | | QUIETS Q4 |
| Ask: `ask/answer.ts:1180-1198` | A watched concern is relayed after every unwatched finding | LOUD | | QUIETS Q4 |
| Report | No read of answers or of `careState` (`grep` over `generate-report/`: no hit outside tests) | NEUTRAL | NEUTRAL | NEUTRAL |
| vet_calls, client only: `lib/vetCallState.ts:1-20`, `:87-93` | "I've called" stores a 24-hour cover on a bout and swaps the button for "You called on ...". The header states a call never lowers or rewords an escalation. No server function reads the table (audit) | LOUD (the button returns) | NEUTRAL | NEUTRAL to the ask; one stated limit: a new blood read at the same rung inside a called bout shows "You called" (CUL-1599, `:14-19`) |

### 2.8 feeding_arrangements (free_choice, is_shared)

| Consumer | Presence does | (1) remove | (2) end | (3) date | (4) is_shared | (5) add wrong |
|---|---|---|---|---|---|---|
| Intake decline and the sustained refusal floor: `detection.ts:4398-4432`, `:4661-4706`; `lib/freeFedIntake.ts`. GA | A rating of that food between toggle-on and toggle-off is a bowl, not a watched meal: set aside. Only a certainly watched meal rated most or all can clear the floor | **QUIETS Q6**: the span is gone, so a bowl's "ate it all" counts as a watched good meal. Also LOUD: bowl refusals count again | Keeps the span to the end instant. Later ratings count: LOUD | The span runs on `created_at` and `ended_at`, which the client does not let the owner edit | NEUTRAL | **QUIETS Q6** for ratings from the toggle-on forward only |
| Food correlation: `detection.ts:3439`, `:3996`, `:4217-4230`. GA | Excludes the bowl's protein and caps every finding for the sign at Early | LOUD for the insight | LOUD for the insight once out of window | n/a | `true` lowers attribution to low: cap | QUIETS, insight only |
| Vomit read, Noticed predicate: `analyze-vomit/index.ts:850-858`, `context.ts:480`, `:497-512`. en5 | Bowls are set aside from the last three qualifying meals | QUIETS (a bowl's good rating can push a refusal out of the last three) and LOUD (a bowl's refusal counts) | mixed | n/a | n/a | QUIETS for later bowl refusals |
| Ask intake tools: `ask/index.ts:885`, `tools.ts:1035-1036`, `:1150-1165` | Excludes every rating of a food free-fed **today**, by food, not by date | LOUD-leaning | The food's whole history returns | n/a | n/a | Softening: past refusals of that food leave Ask's intake numbers |
| Report: `report.ts:4320-4340`, `:4385-4396`; `render.ts:1475` | Same engine input; prints a shared-bowl note | as the Signal | as the Signal | | Wording only | as the Signal |

### 2.9 pets.date_of_birth and species

| Consumer | Presence does | (1) clear | (3) date | (4) species | (5) wrong |
|---|---|---|---|---|---|
| Vomit floor T7: `analyze-vomit/index.ts:948`, `lib/incidentFloor.ts:247-251`. en4 + en3 | No birthday, or under 6 months: two vomits in 24 hours is call today | LOUD (unknown reads young) | Earlier: **QUIETS Q8** on later reads | Dog gets T6 for the same pair (`:249`) | **QUIETS Q8** |
| May-wait: `_shared/incidentMayWait.ts:319` | Passes `birthDate: null`, so it always reads young | NEUTRAL | NEUTRAL | A cat's intake flag refuses a wait (`:334`): cat to dog is QUIETS Q7 | |
| Weight lane: `lib/weightStory.ts:208-216`, `:366-368`. en8 | Unknown or under 12 months: the soft row needs only a drop that clears the noise band (at most 0.23 kg). Adult: 5% | LOUD | Earlier: **QUIETS Q8** for a pet over about 4.5 kg | n/a | QUIETS Q8 |
| Cat intake arm of the vomit and stool reads: `analyze-vomit/context.ts:351`, `:464`; `analyze-stool/index.ts:883`, `:920`. GA | Cats only | n/a | n/a | **QUIETS Q7** | |
| Intake card "call today" on all-refused: `detection.ts:4545`, `:4557`, `:4592`, `:4823` | Not for dogs; one arm cats only | n/a | n/a | **QUIETS Q7** | |
| Chronicity floors: `detection.ts:6175-6197` | A cat-specific override per sign when the config holds one | n/a | n/a | Mixed [the override values were not read] | |
| Report | Prints age, species, precision; passes both to the same lanes | as above | as above | as above | |

### 2.10 intake_checks and looks

| Fact | Consumer | Presence does | Actions |
|---|---|---|---|
| intake_checks | Vomit read, cat intake arm: `analyze-vomit/index.ts:862-876`, `context.ts:474-477`. en5 | An answer of No or A little fires the arm on its own. Yes "never quiets" and Not sure is unknown (`context.ts:408-417`) | Adding any answer: LOUD or NEUTRAL. Replacing a No with a Yes makes the newest answer a Yes; the code comment says the re-read never lowers a stored call (`context.ts:417-418`) [the refloor path was not traced]. Classed LOUD with that caveat |
| intake_checks | generate-signal, ask, report | No read (audit) | NEUTRAL |
| looks | Report Noticed section: `generate-report/index.ts:1628` | Printed record | NEUTRAL to flags [`noticed.ts` not opened] |
| looks | Client `lib/lookEmergency.ts` | An emergency door from a look's words [not verified] | Not classified |

---

## 3. Scenarios for each QUIETS edge

The cat is Nyx: vomiting several times a week; weights 4.40 kg on Jun 15, 3.73 kg on Sep 16, 3.69 kg on Nov 14; rabbit diet trial Jul 26 to Oct 20; prednisolone Sep 21 to Oct 11; "my vet knows" answers for cough and vomit dated Oct 11; a vomit photo read on Nov 12 with possible blood, leading the Signal as "call your vet today". Today is Nov 15. Weight sources are not known to this walk, so both cases are shown where they differ.

**Q1. A visit dated yesterday.** The owner logs a visit dated Nov 14 (the weigh-in day). The default report window becomes Nov 14 to Nov 15 (`report.ts:1201-1213`; rung 1 has no floor, unlike the trial rung's 28 days at `:1292`). `windowEvents` is the events inside that window (`:4777`). The ongoing-vomiting flag needs weeks of span and cannot fire on two days. The burden flag ("6 vomits in 7 days" in the earlier report) counts only what falls on Nov 14 and 15. The Nov 12 blood read is outside the window, so the blood-seen flag has no incident to list [the vomit phenotype's window filter at `:5017` was read as window-scoped; not executed]. The weight flag survives, because the weight lane reads every reading (`:4423-4435`). The v2 sheet prints "A 2-day window: too short for the checks that compare weeks" (`v2Predicates.ts:434-436`); v1 prints the scope line. An owner-picked custom window overrides this (`report.ts:1178-1198`) [whether the app sends the default or a custom window on first open was not checked]. **Shipped:** yes. "Log a visit" (`app/vet-visits/index.tsx`, `after.tsx`), the visit's date edit (`updateVisitDetails`, `lib/vetVisits.ts:2073`, called from `app/vet-visits/after.tsx`), and "How did it go?" on a booking all write `visited_at`.

**Q2. A recheck booked for Dec 10, then moved.** On Nov 15 the owner books Dec 10. `bookedVisitFor` (`careState.ts:1353-1360`) finds it inside 30 days. The weight card (firm, 4.40 to 3.69) becomes `visit_booked` with "A vet visit is booked for Dec 10. Worth mentioning Nyx's weight." and no ask (`:1402-1417`). Her vomiting and cough cards are already `with_vet` from Oct 11, so they show "Recheck booked" (`:1424-1434`). If either answer had lapsed or been retracted, that sign's ongoing card would go `visit_booked` too (`:1207-1214`). The quiet lasts until Dec 17 (the visit day plus 7), about 32 days, matching the "about five weeks" found on Nov 14. New in this walk: on Dec 9 the owner reschedules the same booking to Jan 5. The row's date moves; no standing visit sits more than 7 days behind today, so `quietWindowSpent` (`:1371-1373`) stays false and the quiet continues to Jan 12. Repeated, it never ends while each new date is within 30 days. The Nov 12 "call your vet today" card keeps its ask and rank and gains "Visit booked for Dec 10. A call today may still be worth it." (`lib/careState.ts:94-96`). **Shipped:** yes. Book (`app/vet-visits/index.tsx`), reschedule (`app/vet-visits/edit-appointment.tsx`, `updateAppointmentDetails`, `lib/vetVisits.ts:1594`). Behind en9.

**Q3. The June reading.** With all three readings counted, the gap from the highest earlier reading to the latest is 0.71 kg, which is at least 0.6 kg (`weightStory.ts:522`) and at least 10% of 4.40 (0.44 kg), so the row is firm.
- Delete the Jun 15 reading: the set is 3.73 and 3.69, a gap of 0.04 kg. No row. The card and the report flag turn off.
- Edit Jun 15 from 4.40 to 4.00: the gap is 0.31 kg, under 0.6 and under 10% of 4.00. If both later readings are home readings the confirmed low is 3.73 and the lone-high rule needs 0.40 kg (`:508`); 0.27 fails. No row.
- Add a wrong reading of 4.45 kg on Nov 15 (a typo, or a different scale): the latest is now the highest, so the story is "level or up" (`:574`). No row. This is the wrong-unit case from Nov 14.
- Move the Jun 15 reading's date to Nov 16 2025 or earlier: it leaves the 365-day window (`:413-416`). No row.
- Change a reading's source to `estimate`: not counted (`:425-427`). The shipped edit leaves source alone (`lib/weight.ts:241-243`), so only a new page would expose this.
**Shipped:** value and date edit in `app/edit-event.tsx` (`updateWeightCheck`, `lib/weight.ts:229`); delete through the shared event delete (`softDeleteEvent`, `lib/db.ts:654`, via `lib/undoLog.ts`) [the screen that offers it was not opened]; logging a new weight. Behind en8 for the card and the flag; the report's printed change uses the same function for everyone.

**Q4. A second "my vet knows".** Say Nyx's vomiting passes the re-raise test on Nov 20 (for example the sign on 4 of 7 days, twice, 7 to 14 days apart, `careState.ts:700-709`) and the card comes back as `raised_again`. On Nov 21 the owner taps "My vet knows" again without having spoken to the vet. The new answer is written after the re-raise and is about Nov 21, so it releases the latch (`:538-543`, `:1238`). The card is `with_vet` again, with a new reference window, and the next return needs a fresh tested change against it. **Shipped:** yes, `components/surfaces/signal/CareAnswers.tsx`. Behind en9.

**Q5. A medicine that was discussed and never given.** The owner adds "Cerenia", started Nov 15, and answers that the vet started it for the vomiting. No dose is ever logged. The answer stays live until day 56 after it was written (`careState.ts:504-505`: the cap binds a course with no logged dose), so the vomiting ask is quiet until Jan 10. Each logged dose instead holds it for 14 days past that dose (`:500-503`). Ending the course ends the quiet (`:495-499`). **Shipped:** yes (`components/profile/AddMedicationModal.tsx`; the care question in `CareAnswers.tsx` and `app/vet-visits/after.tsx`). Behind en9.

**Q6. Free feeding.**
- Add: on Nov 15 the owner marks Nyx's kibble as always available. From that instant, ratings of the kibble are a bowl (`lib/freeFedIntake.ts`, the span opens at `created_at`). If she then refuses the kibble on Nov 16, 17 and 18 and nothing else is rated, those refusals are not in the intake lane's meals (`detection.ts:4427-4431`), so neither the relative triggers nor the 72-hour floor (`:4687-4706`) sees them. Ratings before Nov 15 still count.
- Remove (not end): suppose a bowl was down Nov 1 to Nov 10 with three "ate it all" ratings, and Nov 12 to 14 holds three refused watched meals on two days. Today the floor is raised. If the arrangement row were soft deleted, the reads drop it (`index.ts:746`, `.is('deleted_at', null)`); the Nov 1 to 10 ratings are too old to matter here, but a bowl rating inside the last 72 hours rated most or all would become a certainly watched good meal and clear the floor (`:4701`).
**Shipped:** add and end, in `components/food/AlwaysAvailableCard.tsx` and `components/log/FoodPicker.tsx`. No removal control exists. GA.

**Q7. Species.** The owner changes Nyx from cat to dog in Edit pet. On later vomit and stool reads the cat intake arm returns early (`analyze-vomit/context.ts:351`, `:464`). The Signal's all-refused intake card no longer asks for a call today (`detection.ts:4545`). A dog does gain T6 on the vomit floor under en4. Stored tiers do not move. **Shipped:** yes, `components/profile/EditPetModal.tsx:193-198`. GA.

**Q8. Date of birth.** Not a Nyx case (she is an adult with a birthday on file) [her stored birthday was not read]. For a kitten with no birthday on file, two vomits in 24 hours is call today under T7. The owner sets a birthday eight months back; later reads no longer meet T7 (`lib/incidentFloor.ts:247-251`). For a 30 kg dog under a year, the weight lane's soft row needs a drop over 0.23 kg; with the birthday moved back past 12 months it needs 1.5 kg. **Shipped:** yes, Edit pet. Behind en4 + en3, and en8.

**Q9. A skin trial on the v2 report.** Not a Nyx case (her trial is for the gut). For Cooper, the fixture in CUL-1867: with a trial whose indication is `skin`, an ongoing itching flag that is the only flag able to lead is moved out of the band and heads the lead chart with "Flag:" (`v2Predicates.ts:277-286`). Any owner can reach this state by starting a trial and choosing skin. **Shipped:** yes for the trial (`components/profile/StartTrialModal.tsx`). The move itself is behind `report_document_v2`.

**Q10. Ending the trial.** Nyx's trial ended Oct 20, so this has already happened to her. While it ran, a cat refusing the rabbit diet held the trial card's live refusal register (`lib/dietTrialCard.ts:1030-1036`) and, on the report, the `trial_diet_refusal` flag. After the end the card is gone. The report keeps the trial block for 90 days (`report.ts:249`, `:1277`), then drops it and the flag with it. Since Nov 2 the Signal's sustained refusal floor covers a cat refusing every watched meal without needing a trial (`detection.ts:4673-4706`). **Shipped:** yes (`components/profile/TrialCompletionSheet.tsx`, `StartTrialModal.tsx`, `app/vet-visits/after.tsx`). GA.

**Q11. An allowed food.** During the trial, a chicken treat given on Aug 10 is an off-diet exposure. If the owner adds that treat to the allowed set with an allowed-from day on or before Aug 10, the feeding classifies as permitted (`lib/dietTrial.ts:950-1044`) and leaves the exposure list on the card and the report [the retroactive path through `allowed_from` was not traced to the render]. **Shipped:** add only (`app/trial-foods.tsx` and three other entry points). No remove. GA.

**Q12. The prednisolone course.** It ran Sep 21 to Oct 11, so its masking span runs to Nov 22 (`maskingSpans.ts:333-339`). Until then every sentence that compares a window touching it goes quiet on a fall or a zero: a falling vomit reflection ("2 this week, down from 5") is set aside on the Signal screen and dropped from Get ready (`lib/screenMasking.ts:433-444`), and Ask refuses a zero beside it. Three edits end that early: rename it to a drug the table reads as not masking vomiting (for example `Metacam`, an NSAID, `maskingSpans.ts:125`); move its start date after today (`:330`); or remove the row. Nyx has no zero weeks, so for her the exposed sentence would be a falling comparison, not a zero. **Shipped:** rename and start-date edit (`AddMedicationModal.tsx`, `updateRegimen`, `lib/medicationSetup.ts:212`). No removal: a course is ended, never deleted (`:238-240`). Behind en10 for the Signal; Ask's screen is GA.

**Q13. The Sep 16 visit.** Its 42-day span ended Oct 28, so today it changes nothing for Nyx. In general, a visit removed or re-dated earlier ends the span early and a "0 episodes" line can print for a window inside the old span (`careContext.ts:313-331`). **Shipped:** date edit only. No removal control (`lib/vetVisits.ts:619`, "shipped the column ahead of its control"). Behind en10.

**Q14. A course that caps food findings.** The Q5 Cerenia row, with no end date, is "on board" in every matched window from Nov 15 on (`pipeline.ts:303-307`). Any food finding for vomiting that would have reached Established stays Early (`detection.ts:4224`). If the course's start or end falls inside the lookback so that case windows are on the drug and control windows are not, every food finding for the sign is suppressed (`:4033-4047`). Under en11, Early is withheld (`:4235`). These are insights, not warnings. **Shipped:** yes. GA.

**Q15. A trial left running.** A trial that is active and inside its window mutes three diet-pattern cards and promotes food findings (`pipeline.ts:744-756` names this as a "permanently missing" sentence when stale). Insights only. **Shipped:** yes. GA.

---

## 4. Facts no engine reads

"No engine" means none of generate-signal, ask, analyze-vomit and analyze-stool. Removal changes nothing in those today.

| Fact | Read by | Not read by |
|---|---|---|
| `conditions` (all columns) | Report identity block and appendix only | Signal, Ask, per-incident reads |
| `diet_trial_foods` | Report; client trial card | Signal, Ask |
| `looks` | Report; client | Signal, Ask |
| `vet_calls`, `vet_call_follow_ups` | Client only | Every server function |
| `intake_checks` | Vomit read under en5 | Signal, Ask, report |
| `vet_visits.notes`, `next_visit_at`, clinic, vet, reason | Nothing (report selects three and uses none) | All |
| `vet_appointments` text fields | Nothing | All |
| `medications.indication`, `route`, `doses_per_day` | Report | Signal, Ask |
| `diet_trials.outcome`, `stopped_reason`, history | Report (`stopped_reason = 'refused'` raises the trial refusal flag, `report.ts:5901`) | Signal, Ask |
| `weight_checks` | Ask and report always; Signal only under en8 | Per-incident reads |
| `pets.date_of_birth` | Report always; Signal under en8; vomit floor under en4 | Ask |

### 4.1 How generate-report uses a condition

- Pull: `generate-report/index.ts:1593-1594` selects `id, condition_name, status, diagnosed_at` for the pet, every status.
- Snapshot: `report.ts:7044-7048` copies name, status and date into `provenance.conditions`. Nothing else in `report.ts` reads them (`grep`: lines 688-692, 777, 3214-3215, 7044-7047 only).
- v1 page 1: `render.ts:1969-1978` prints rows with status `active` as "Recorded conditions: {name} (since {date}) ... owner-recorded history, not a finding in this window".
- v2 masthead: `documentV2.ts:444-449`, the same line.
- Appendix: `render.ts:12167-12168` lists every condition with its status.
- The chronicity flag's own comment (`render.ts:3018-3030`) cites a conditions row as the reason its span is stated as a floor, but the code there does not read the condition.
- The AI lead reads the snapshot [`aiLead/` was searched for "conditions" with no hit outside tests; its prompt assembly was not opened].

So today no flag, tier, order or chronicity rule is conditioned on a condition. Marking one resolved, or setting it to monitoring, removes one context line from page 1 and nothing else. The app's own confirm text says "It will still appear in vet reports for the relevant date range" (`components/profile/AddConditionModal.tsx:64`); the page 1 line prints active rows only, so that sentence is true of the appendix row only.

### 4.2 What CUL-1867's options 2 and 3 would newly make removable by edit

CUL-1867 (status Todo, no ruling) asks whether a chronicity flag should fire for a sign the owner has recorded as a treated condition.

- **Option 2** (keep the flag in the band only when new or worse against a baseline; otherwise a scoped line under the answer line): a `conditions` row would decide, for the first time, whether a safety flag sits in the band. Then **adding** a condition whose name maps to the sign moves that sign's ongoing flag out of the band, and **removing, resolving or renaming** it moves the flag back. The mapping from a free-text name to a sign would be a new input an owner can change by retyping it. `diagnosed_at` would likely set the baseline, so a date edit would move the comparison.
- **Option 3** (keep the flag in the band, retitled as linked to the recorded condition): band membership and order stay as they are. The owner edit would change the flag's title only: adding a condition turns the title into context wording; removing it restores the plain title. That is a softening edge, not a removal.
- The nearest thing shipped is R-11 (Q9): a `diet_trials.indication` of `skin`, not a condition, already moves a skin-sign chronicity flag out of the band on the v2 report.

---

## 5. The floors

**Question:** do the per-incident tiers ("call now", "call today") read any standing fact an owner edit could change?

What the vomit read assembles (`analyze-vomit/index.ts:790-915`, `:917-957`): vomit events, lethargy events, meal events with ratings; under en5, free-choice arrangements and the intake answers under this vomit; under en4, `pets.date_of_birth` and the owner's time zone. Species comes with the event (`_shared/incident-analysis.ts:1837`, `:1853`). The stool read assembles events only, plus species (`analyze-stool/index.ts:800-896`).

| Standing fact | Read by a floor? | Evidence |
|---|---|---|
| Medications, masking | No | T20 and T21 are "HELD, deliberately absent" (`lib/incidentFloor.ts:28-32`). No `medications` read in either function |
| Care answers, vet calls, appointments, visits | No | No read in `analyze-vomit/`, `analyze-stool/`, `_shared/incident-analysis.ts`, `_shared/incidentMayWait*.ts` |
| Conditions, weights, diet trial | No | Same search |
| Intake checks | Yes, raise-only, en5 | No or A little fires the cat arm; "Yes never quiets" (`analyze-vomit/context.ts:408-417`, `:474-477`) |
| Free feeding | Yes, en5 | Sets bowls aside in the Noticed predicate and the last-rated backstop (`context.ts:480`, `:497-555`). Can move either way (section 2.8) |
| Date of birth | Yes, en4 + en3 | T7 only (`lib/incidentFloor.ts:247-251`). Unknown reads young |
| Species | Yes, GA | Cat intake arm; T6 for dogs |
| "May wait" | Species only | `incidentMayWait.ts:319` passes `birthDate: null`; `:334` adds a cat-only refusal. Its other inputs are events, photos and neighbouring reads (`:14-34`) |

**The Signal's red-flag card** (`detection.ts:8076`) reads `event_ai_analysis` joined to live events and nothing else. The care step states it "never touches an ESCALATION" (`careState.ts:12-14`): for a safety finding that is not a concern it adds only the upcoming visit date (`:1419`), and the one re-rank moves watched concerns down, so "an escalation only ever moves UP" (`:1495-1509`). The client ignores a care state found on an escalation (`lib/careState.ts:28-36`).

**Verdict.**
1. No standing-fact edit read here lowers a tier that is already stored. The re-read paths are written to keep the louder stored tier (`keepLouderTier`, `_shared/incident-analysis.ts:687-695`; comment at `analyze-vomit/context.ts:417-418`) [the full refloor path was not traced].
2. Three standing facts can change the tier of a **later** read: species (GA), date of birth (en4 + en3), and free feeding (en5). Each is in section 1 (Q7, Q8, Q6).
3. A booking does not lower or delay a floor. It adds one hedged sentence beside a "call today" ask on Home, and none beside "call now".
4. The report is not a floor, but it is where a floor's finding can go missing: a blood-seen flag is window-scoped, and the window follows the visit date (Q1).

---

## 6. Already reachable in the shipped UI, versus newly exposed by one page

| Fact | Owner can do today (screen) | Not possible today; a single page with Edit and Remove would add |
|---|---|---|
| Conditions | Add, rename, set active or monitoring, set the date, mark resolved (`components/profile/AddConditionModal.tsx`, `app/(tabs)/profile.tsx:1021-1022`) | Remove. No engine effect today (section 4) |
| Medicine courses | Add, rename, change start date and target, end (`AddMedicationModal.tsx`; `endRegimen` from `profile.tsx` and `app/vet-visits/after.tsx`) | Remove (no `deleted_at` on the table), reopen, edit the end date [the absence of an end-date edit was read from `updateRegimen`'s column list, `lib/medicationSetup.ts:219-222`] |
| Doses | Log, edit, delete as events | n/a |
| Diet trial | Start (the start day can be back-dated), end, change the total length, set the target protein (`StartTrialModal.tsx`, `TrialCompletionSheet.tsx`, `TrialManageSheet.tsx`, `app/trial-foods.tsx`) | Remove, edit the start date after creation, edit the indication after creation [not verified], edit the end date |
| Trial foods | Add (`app/trial-foods.tsx`, `app/food/[id].tsx`, `MealCompletionCard.tsx`, `TrialHeadsUpLine.tsx`) | Remove, re-role, edit the allowed-from day |
| Weights | Log, edit value and date (`app/edit-event.tsx`), delete the event | Edit the source (clinic, home scale, estimate) |
| Vet visits | Log, edit the date and details (`app/vet-visits/after.tsx`) | Remove |
| Appointments | Book, reschedule, cancel (`app/vet-visits/index.tsx`, `edit-appointment.tsx`, `AppointmentStrip.tsx`) | Remove |
| Care answers | Add, retract (`components/surfaces/signal/CareAnswers.tsx`; `after.tsx`) | Edit the anchor date |
| Vet calls | Record, undo, note, follow-up answer (`components/event/CallAnswers.tsx`, `app/vet-call/[id].tsx`) | n/a |
| Free feeding | Start, end (`AlwaysAvailableCard.tsx`, `FoodPicker.tsx`) | Remove (Q6's second half), edit the dates |
| Pet | Species, date of birth (`EditPetModal.tsx`) | n/a |
| Intake checks | Answer, answer again (`components/event/IntakeQuestion.tsx`) | Remove |

Read against section 1:

- **Already reachable today:** Q1, Q2, Q3 (all but the source edit), Q4, Q5, Q6 (add), Q7, Q8, Q9, Q10, Q11 (add), Q12 (rename and start date), Q13 (date), Q14, Q15.
- **Newly exposed only by a Remove control:** Q6's removal half; Q12 by removal; Q13 by removal; a weight source edit under Q3; a trial removal under Q10 (today a trial can only be ended, which keeps the 90-day grace on the report).
- **Made louder by removal, so not a quieting risk:** a removed appointment, a retracted answer, a removed trial under a `vet_started_trial` answer, an ended course under a `vet_started_course` answer.
- **What a single page changes without adding a control:** every one of these facts sits on one screen, so one sitting can chain edits that today live on five screens (for example Q5 then Q2). This walk found no code that rate-limits or logs such a chain [not verified beyond the readers listed].

Flags, restated: Q2, Q4 and Q5 exist only behind `engines_v3_en9`; Q12 and Q13 behind `engines_v3_en10`; Q3 behind `engines_v3_en8`; Q8 behind `engines_v3_en4` with `en3` (and en8); Q9 behind `report_document_v2`. Q1, Q6, Q7, Q10, Q11, Q14 and Q15 run for every owner today.

---

## 7. Falsification pass on the proposed read rules

Added by the discovery session after the adversarial review.
