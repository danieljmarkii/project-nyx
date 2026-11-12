# What one cat's third deep dive teaches the signal engine (November 2026)

**Date:** 2026-11-11
**Status:** 🧊 Frozen point in time evidence capture (research brief, see `docs/research/README.md`). Correct additively (a dated §V at the foot, with inline ⚠ pointers), never in place.
**Issue:** [CUL-2710](https://linear.app/projectnyx/issue/CUL-2710) (discovery). This file carries evidence and verdicts from adversarial critics. The decision briefs live on the issue, and the issue wins on divergence.
**Companion:** the clinical read this came out of, [`docs/pet-research/nyx/2026-11-11-round-3-deep-dive.md`](../pet-research/nyx/2026-11-11-round-3-deep-dive.md). Finding numbers (F1 to F18) and evidence rows (A1, B3, M12 and so on) point there.

**The ask.** The PM's third deep dive on Nyx's record was asked to do original clinical work first, and then to "turn the learnings into engine improvements that hold across many pets and species", to "name the data you wished you had", and to audit the engine's constants for anything shaped by her. Under G6 her record is the demonstration and never the calibration, so every idea here was put to one question: would it hold for a pet that is not her?

**Method.**

1. **Sixteen candidate ideas** were written down from the clinical findings, each as a mechanism and not as a fix for her record.
2. **A prior art audit.** Thirteen independent readers each took one source (the six earlier briefs and brief pairs, the ruling sheet, the signals specs, the weight, care state, incident and free feeding specs, the vet files, vet visits and taxonomy specs, the engine code, and the tracker), read it in full, and returned for every idea whether it was already proposed, already built or ruled against, with the line.
3. **An adversarial critique per idea.** Sixteen isolated critics, one idea each, told to break it: does it generalise to dogs and beyond the gut; which constant would be fitted to her; four or more concrete misfires, loud and quiet; what should anchor it; how to validate it on synthetic pets; and one counterexample run with numbers. Most ran a simulation. The figures quoted below are theirs and are not re-derived here.
4. **The config audit** (§3) rates every constant in `DEFAULT_CONFIG` by the anchor its own comment claims.

The subject is the PM's real cat. The QA clone and the test pets are excluded by id and appear in no number (G7).

---

## 0. The answer in one page

**Sixteen ideas went in. None survived as a new alarm.** Every idea that proposed a new card, a new gate or a new comparison sentence failed its own counterexample, usually in the quiet direction: on a pet that is not her it softened, delayed or withheld a warning that the shipped engine would have shown. What survived is smaller and all of one kind: **rows of counts on the vet report and the evidence view, with their denominators, that say how the record was made.**

| # | Idea | Verdict | What survives | Where it would live |
|---|---|---|---|---|
| 1 | Contrast by food form at the short window | narrowed | Counts by form with both denominators, from meals logged in real time | vet report |
| 2 | Was the meal logged before the event, or because of it | narrowed | A "logged together" count | evidence view, vet report |
| 3 | Risk per feeding beside rate per week | narrowed, folded into 1 | A per feeding share at a declared boundary, higher direction only | vet report |
| 4 | Reads by timing type | narrowed | A one sided guard on the pooled "fewer" sentence | trial lane |
| 5 | Provocation watch after an elimination period | detector dropped | A dated "logged again after a gap" line | vet report, evidence view |
| 6 | Stated against logged frequency | narrowed | One stated answer beside the logged count | vet report |
| 7 | Worst window on record | detector dropped | A count line when the last 28 days exceed every earlier 28 | vet report |
| 8 | Found events in a home with more than one pet | narrowed | A household record and a "seen, found" line | vet report, evidence view |
| 9 | Interval from the end of a course to the sign's return | detector dropped | Repeat courses with the episodes after each end | vet report |
| 10 | Partial doses in food, read as intake | narrowed | "N of M doses given in food were partial" | vet report |
| 11 | Vet notes and documents as structured facts | narrowed | Owner confirmed rows at write time, led by a dated instruction | after visit screen, care state |
| 12 | Asking whether a weight was the clinic's scale | narrowed; mostly specified already | A once per reading ask for readings on file | weight capture |
| 13 | Pollen or air quality join | **dropped** | Nothing | |
| 14 | A planner for a comparison the vet asks for | narrowed; needs a ruling on G3 | A vet set comparison record, read once | vet report |
| 15 | Comparisons that know about deleted logs | narrowed; needs a privacy ruling | "Fewer" must still pass when recently deleted logs are counted | comparison lanes |
| 16 | Things an owner cannot record today | narrowed, item by item | A stool prompt with a quiet period; escalation only for non food; report only marks for nose and cough | capture |

Ten end as lines of counts on the vet report or the evidence view (two of them merge into one). Two end as guards that can only hold back a reassuring sentence. Three are changes to what an owner can record. One is dropped. None was specific to her: every critic was asked, and each found the mechanism in dogs or outside the gut, usually in a weaker form.

**The pattern in the failures.** Of the fifteen ideas with a worst misfire, the worst was quiet for thirteen. Gating counts on "seen only" cut recall at 56 days from 92% to 0.5%. Reading partial doses as intake took false call today cards from about 3% of cats a year to 47%. A watch on a vet's instruction, tested against the logs, missed up to 64% of cats still coughing. A prompt to log stool produced a false "rising" card for 87% of pets whose stool never changed. An idea that looks like honesty about the data can be the thing that hides a sick pet, or frightens the owner of a well one.

**The lesson under the list.** Her record did not need a cleverer detector. It needed the engine to know three things about its own input: which logs were made because of the event, which events nobody saw, and which eras cannot be read. Each of those changes what a count means, none of them is a finding about the pet, and each one turned out to be dangerous the moment it was allowed to gate a card. They belong where a vet can see them.

**The config audit (§3)** found no constant tuned so that her record fires today. It found four rule groups written as descriptions of weeks she had, five lanes that exist only for vomiting, and a ruling of 2026-10-01 that the code does not yet carry.

**The data wish list (§4)** is led by three things the round could not get past: a weight with its scale, what a "feeding" is in grams, and the facts sitting unread in the vet's own words.

---

## 1. What her record showed that no lane said

These are the round's clinical findings restated as engine facts. Each is a gap in what the engine can represent, not a bug in what it computes.

| What happened in the record | What the engine showed | Why |
|---|---|---|
| 18 episodes within 30 minutes of 351 kibble feedings, none after 166 wet meals | A post-prandial timing card. No word about form | The correlation lane contrasts by protein only, and the protein was the same on both sides |
| 10 of those 18 meals were logged in the same sitting as the vomit | Nothing | No lane reads when a log was created |
| The last 28 days: 13 episodes, one short of the record, and the most ever seen happening | Week against week lanes, which reset every seven days | No lane compares a window with the pet's own history |
| The trial's benefit sits in found vomits, in a two cat home | A pooled before and after | Count lanes treat a found pile as the active pet's and as seen |
| A bowl was down all day before the trial and its row was later deleted | Pre trial episodes typed by timing as if she were meal fed | The free fed exclusion follows a live row, per episode; a deleted or never entered bowl restores the timing |
| 47 vomit logs deleted, all inside the trial's baseline | A baseline 2.5 times lighter than it may have been | Every pull hides deleted rows, by rule |
| 36 cough logs against "daily, many times a day" | A chronicity read on the logs | A count of logs is treated as a count of coughs |
| Ear trouble three times, each about six weeks after a course ended | Nothing | Ears are free text on an itch log |
| A 15% weight drop, on two scales | Nothing | The weight lane is specified and unbuilt, and the clinic's reading is stored as home scale |
| The vet's "call if she is still coughing after the course", met | Nothing | A visit's notes never leave the vet tables |
| 17 of 35 doses hidden in food left unfinished, with meal ratings stopped | An intake lane with nothing to read | The lane reads ratings only |

---

## 2. The sixteen ideas, after the audit and the critics

Each entry gives: what it would detect; the finding that motivated it; what is already on file; whether it generalises to dogs and beyond the gut; its worst misfire; the counterexample a critic ran; its anchor and validation; and the verdict. "Quiet" means the error softens, delays or drops a warning. "Loud" means a false alarm.

### EO-1. Exposure attribute contrast at the short window

- **What it would detect.** Among feedings of one physical form against another, the share followed by a symptom within the short window, with both denominators.
- **What motivated it.** 18 episodes after 351 kibble feedings against none after 166 wet feedings (F2). The shipped correlation lane contrasts by protein only and saw nothing, because the protein was the same on both sides.
- **On file already.** The same statistic was run by hand in June by brand and by crunchy against soft (4 of 4 against 0 of 49) and parked under the emerging signals question ([CUL-249](https://linear.app/projectnyx/issue/CUL-249)); observed against expected per food with a lag profile is planned ([CUL-1143](https://linear.app/projectnyx/issue/CUL-1143)); ingredient level testing is parked for multiple comparisons. `feedingFormsInEvidence` already lists the forms behind a post-prandial finding, as labels with no counts, and is rendered nowhere. A ratified ruling keeps food form off the owner card (descriptive signals spec §9.1).
- **Dogs and beyond the gut.** Dogs partly: a simulated dog with a dilated gullet (kibble 20% against slurry 3%, shared meal slots) is found in a median of 37 days, but most dogs eat one form at fixed times and offer no contrast. Beyond the gut, no: at the skin window of 72 hours, 72% of feedings are "followed by itch".
- **Worst misfire (quiet).** "0 of 166 wet feedings were" reads as an all clear. The owner drops kibble, vomiting falls under the chronicity floor, and a cat who is still sick goes quiet. This is the reason the report itself now carries that warning.
- **The counterexample that was run.** A cat with equal risk on both forms whose owner adds the missed dry feeding when logging a vomit: a false "dry" contrast appears in 33 to 85% of such pets within a year, stratified or not. Restricting to meals logged in real time at alpha 0.005 holds it near 1%, but then a true 5% against 0% effect is found in only 0 to 4% of homes where each form has its own fixed slot.
- **Anchor and validation.** The post-prandial lane's own 30 minute band; any sentence gate from a null sweep in which meal slot, flares, logging and witnessing all vary and form does nothing. Truth pets at 5% against 0%.
- **What would have been fitted to her.** The 30 minute window, if it were chosen where her contrast is sharpest (her episodes sit at 19 minutes or less). It has to be the post-prandial lane's existing band and nothing read off her latencies.
- **Verdict: keep, narrowed to rows.** Counts by physical form with both denominators, per time of day block, real time logs only, behind a post-prandial finding that has already fired, on the vet report only. No p value, no comparison sentence, no product or dose route contrast, and never on an owner surface.

### EO-2. Log provenance: was the meal logged before the event, or because of it

- **What it would detect.** A feeding or dose log made in the same sitting as the symptom log it precedes, as opposed to one made before the symptom happened.
- **What motivated it.** In 10 of her 18 after kibble episodes the meal was logged seconds before the vomit log. On the 8 logged in advance the contrast with wet food drops from p = 0.001 to p = 0.06 to 0.11 (F2).
- **On file already, with a ruling.** The same artifact was measured on 2 of 12 episodes and it was ruled on 2026-10-08 that clock stamped meals stay eligible, with the exclusion and the disclosure both dropped ([CUL-1638](https://linear.app/projectnyx/issue/CUL-1638), [CUL-1674](https://linear.app/projectnyx/issue/CUL-1674)); a re-measure at volume is open ([CUL-1705](https://linear.app/projectnyx/issue/CUL-1705)); a reverse time control shipped ([CUL-1141](https://linear.app/projectnyx/issue/CUL-1141)). No timing lane reads creation time; a back dated meal is stored as witnessed and anchors a timing read.
- **Dogs and beyond the gut.** Partly. The artifact is the owner's, not the species', but a filter on it deletes the main canine pattern: food brought up minutes after a meal, logged afterwards. Beyond the gut it exists only as a concept (an as needed inhaler logged with a cough).
- **Worst misfire (quiet).** A dog who truly vomits after meals, whose owner logs meals afterwards, reads 2.2% or 0.0% risk per feeding against a true 6.1%.
- **The counterexample that was run.** That dog, with the meal logged 20 minutes late: the card is first shown on day 113, not day 39, and for an owner who logs in the evening never. Meanwhile a cat with no pattern still gets a false card in 53 to 66% of lifetimes under the filter, against 100% today.
- **Anchor and validation.** The fields are definitional (the source of the time and the order of creation). The window would come from a capture session id or an owned call; any withhold from a null sweep over logging processes (real time, delayed, batch, sparse owners) crossed with random, before breakfast, after meal and after dose pets.
- **What would have been fitted to her.** "Within about a minute". That is this owner's habit of logging the meal seconds before the vomit. When the two saves sit a median of 90 seconds apart (a photo taken first) the same rule fails. It needs a capture session id, not a number of seconds.
- **Verdict: keep, narrowed.** A per episode "logged together" flag, shown as a count in the evidence view and on the vet report. Every prospective only rate, risk and p value is dropped. Withholding the post-prandial card on it would need the sweep and a ruling that names the 2026-10-08 one. This record is the re-measure that ruling left open: 10 of 19, not 2 of 12.

### EO-3. Risk per exposure beside rate per week

- **What it would detect.** A change in risk per meal or per dose that the weekly count hides because the number of meals or doses changed, and the reverse.
- **What motivated it.** Her after kibble events ran at about one a week throughout, while logged kibble feedings fell from 3.9 a day to about 1. Per feeding the share rose from 4.0% to 10.8%; per week nothing moved. The report refuses the per feeding trend because recent kibble logs were made because of the vomit.
- **On file already.** A per opportunity base rate line for the timing card ([CUL-116](https://linear.app/projectnyx/issue/CUL-116), Todo, never emitted); expected counts from how often a food is eaten ([CUL-1143](https://linear.app/projectnyx/issue/CUL-1143), [CUL-1424](https://linear.app/projectnyx/issue/CUL-1424)); meals per day and treat share as context rows in the trial lane. The code divides nothing by feedings or doses.
- **Dogs and beyond the gut.** Partly. A dog on two fixed meals has a constant denominator, so the read equals the weekly one; it applies to dose tapers. Outside the gut there is almost nothing to divide by: no walk, void or bath events exist.
- **Worst misfire (quiet).** A dog's meals are split from 2 to 4 a day while vomiting rises 64% a week, and the engine says "the share of meals followed by vomiting did not rise".
- **The counterexample that was run.** A cat whose only risky meal is breakfast drops two safe meals. Nothing about her changed, and 62% of such cats get a "risk per meal rose" card within 180 days; a true doubling gets 69%. The detector cannot tell the two apart.
- **Anchor and validation.** A null sweep with exposures halved or doubled at a boundary, on signs that concentrate in one meal slot or in bouts, plus witness coverage and batch logging nulls; injected steps of 1.5 to 3 times. In the narrowed form the false card rate was 0.2% with recall of 27% for a doubling and 83% for a tripling.
- **What would have been fitted to her.** The 30 minute link window, reused for every kind of exposure. It is anchored for a vomit after a meal only; a dose to sign window has no anchor at all.
- **Verdict: keep, narrowed, and folded into EO-1.** A per exposure share at a declared boundary (a regimen or trial row), same meal slot and same food class only, in the higher direction only, on the vet report only. The "reverse" is dropped: it must never touch a weekly escalation.

### EO-4. Reads by timing type, with an agreement guard and an era gate

- **What it would detect.** A before and after comparison whose pooled sentence hides types moving in different directions; and an era in which the timing label cannot be read at all.
- **What motivated it.** Pooled, the rabbit trial looked like a halving. By type, the after kibble kind never moved, and the "later" kind fell three weeks before the trial began, on a label that meant nothing before 07-26 because an unlogged bowl was down (F1, F5, F6).
- **On file already.** The shipped trial lane shows per type rows beside the pooled count inside a running trial, and its gate reads the pooled count ([CUL-8](https://linear.app/projectnyx/issue/CUL-8), [CUL-31](https://linear.app/projectnyx/issue/CUL-31)); one timing class's count for trial against before is ratified ([CUL-1195](https://linear.app/projectnyx/issue/CUL-1195)); a timing reliability gate for grazers is undefined ([CUL-247](https://linear.app/projectnyx/issue/CUL-247)). Free fed episodes are dropped per episode while a bowl row is live, never per era; a deleted or never entered bowl leaves the episodes timed as meal fed (`lib/mealTiming.ts`).
- **Dogs and beyond the gut.** Partly: it works for a vomiting dog, but most canine trials are led by itch or stool, six hours is a feline constant, and scavenging is not a recorded bowl. Beyond the gut it only makes sense per sign: itch falling from 30 to 9 while ear signs rise from 2 to 7 should block a pooled "fewer".
- **Worst misfire (quiet).** A cat refusing her trial diet: after eating vomits fall, long gap vomits rise, and the guard as first written withholds the escalation.
- **The counterexample that was run.** 6,000 simulated refuser cats: the shipped lane shows the escalation to 63% by day 56; the idea as written, to 10%. On cats with a masked rise the narrowed veto cuts a false "fewer" on day 84 from 32% to 3%, at the cost of honest ones falling from 80% to 58%.
- **Anchor and validation.** The never reassure rule as an owned call, priced on a stationary four band null evaluated nightly. Null pets: stationary; an unrecorded bowl lifted; meals changed from 2 to 4; a logging shift. Injected: a masked rise, a refuser, a middle band change, uniform falls. Pass lines: identical "more" evenings, no added false cards.
- **What would have been fitted to her.** The shape "two timing types". That is her pair. Her own rechallenge episodes fell 1 to 5 hours after eating, the middle band a two type guard never reads. The guard has to use every shipped band.
- **Verdict: keep, narrowed.** A one sided veto on the trial lane: withhold only the pooled "fewer" sentence, never "more", when any timing band (the untimeable one included) did not fall. No per type sentences and no medicine course host. A deleted free choice row may only exclude timing, never restore it.

### EO-5. Provocation watch

- **What it would detect.** A food excluded for weeks reappearing in the feeding log, followed by a fixed watch window with a bout level outcome set in advance.
- **What motivated it.** The chicken rechallenge was invisible to every trial aware surface, and the bout on days 8 to 10 was judged after the fact (F4).
- **On file already.** An owner or vet recorded reintroduction window, unruled ([CUL-1770](https://linear.app/projectnyx/issue/CUL-1770), [CUL-1821](https://linear.app/projectnyx/issue/CUL-1821)); the report's tally of off list foods after a declared trial ends, with symptoms in a forward window; a `reintroduction` phase in the schema that nothing writes.
- **Dogs and beyond the gut.** Partly. Elimination then provocation is the standard canine work up, but three episodes in 72 hours is a vomiting cat's shape. A dog's itch flare after beef returns takes up to 14 days and has no episodes to count.
- **Worst misfire (quiet).** A watch that ends with nothing reads as a negative challenge, and the food goes back in the bowl. That is reassurance on absence.
- **The counterexample that was run.** A cat vomiting twice a week for unrelated reasons, with four food returns a year: 17% of watches fire and 54% of such cats get a false card within a year. A cat that truly reacts fires in 16% of watches, and 84% end quiet. The watch did not survive.
- **Anchor and validation.** The gap, the window and the medicine tail have values on file; the bout has none, and a null sweep that places returns independently of the symptom series rejects every bout size.
- **What would have been fitted to her.** The number of weeks that makes a food "excluded" was her gap. The declared trial's own length is the anchor where there is one.
- **Verdict: keep, narrowed.** No watch, no bout, no new card. A dated "logged again after a gap" context line on a finding that has already fired, and only when an episode follows. A quiet return prints nothing. Vet report and evidence view.

### EO-6. Stated against logged frequency

- **What it would detect.** A sign logged at a small fraction of its real frequency.
- **What motivated it.** 36 cough logs in 19 weeks against the owner's "daily, many times multiple times a day" (F10).
- **On file already.** A one tap recall question for intake only ([CUL-1136](https://linear.app/projectnyx/issue/CUL-1136)); the daily look as a second stream that by ruling never enters the engine ([CUL-845](https://linear.app/projectnyx/issue/CUL-845)); counts shown with day coverage and withheld below 10 of 14 logged days (care state spec); a rule against printing a count as a rate below a coverage floor ([CUL-747](https://linear.app/projectnyx/issue/CUL-747)).
- **Dogs and beyond the gut.** Yes: a tracheal cough, atopic itch. But reverse sneezing and normal scratching mean "every day" must never raise anything.
- **Worst misfire (quiet).** Read literally, it withholds real rises for exactly the under loggers it flags, almost all year.
- **The counterexample that was run.** Two owners whose cats both cough daily and whose logs both show about 36 days in 19 weeks. The owner who notices everything and logs 27% of it is flagged on 85 to 99% of asks. The owner who notices 30% and logs 90% of that scores "0.67 complete" against a true 0.27 and passes. Natural rules falsely flag 53 to 94% of complete loggers within a year. A completeness estimate cannot be built from two streams that share one observer.
- **Anchor and validation.** No threshold survives; the window, bands and cadence are owned calls. A revived detector would need a complete logger null with noisy answers.
- **What would have been fitted to her.** The threshold for "completeness is low". Her ratio (36 logs over 133 days, about 0.27) would back fit any cut between 0.3 and 0.5.
- **Verdict: keep, narrowed.** Ask only about a sign that already holds a chronicity card, in numeric day bands, and print the stated answer beside the logged count on the vet report. No completeness estimate, and nothing enters the engine, so the standing ruling on looks is untouched.

### EO-7. Worst window on record

- **What it would detect.** The current 28 day count of a sign reaching the highest 28 day count anywhere in the pet's own record.
- **What motivated it.** The last four weeks hold 13 episodes against a record high of 14, and the most ever seen happening (F15). No lane said so.
- **On file already.** Nothing proposes an own record maximum. Nearest: week against week worsening; a fixed burden threshold of 4 in 7 days ([CUL-1311](https://linear.app/projectnyx/issue/CUL-1311)); the care state's frozen 28 day reference; the latest gap against the median gap.
- **Dogs and beyond the gut.** Yes, with no species constant. Cough days across growing asthma flares fit. Seasonal itch would be carded every year.
- **Worst misfire (quiet).** The bar ratchets. One weekend raid on a bin raises the record, and carding of a later sustained tripling within 56 days falls from 96% to 21%. After a doubling the card withdraws itself.
- **The counterexample that was run.** A cat at a constant 4 episodes per 28 days is carded within a year in 91% of runs. An exact test at p below 0.001 brings that to 4%, but to 28% on pets whose signs wax and wane, while catching 19% of true doublings. This round's own record shows the other trap: 47 deleted logs and two logs before feeding began changed what "record" meant twice in one session.
- **What would have been fitted to her.** The 28 day window: the length an earlier brief used on her record. It should mirror the chronicity compare's half window, with the sweep repeated at 14 and 56 days.
- **Verdict: the detector did not survive. Keep one line.** A count line on a chronicity finding that has already fired, vet report only, printed only when the last 28 days strictly exceed every earlier non overlapping 28 days in the read.

### EO-8. Found events in homes with more than one pet

- **What it would detect.** Counts that lean on events nobody saw, in a home where another animal could have produced them.
- **What motivated it.** 18 of 63 vomit logs were found, 13 of them before the trial, in a two cat home. The trial's apparent benefit (rate ratio 0.54) becomes 0.73 with an interval through 1 when only seen vomits count (F15, F18).
- **On file already.** Timing lanes already exclude unwitnessed onsets. A certain or uncertain attribution flag per found event is filed and unruled ([CUL-807](https://linear.app/projectnyx/issue/CUL-807)); the report already states other pets on the account; household pooled counts exist for two leaf types only (taxonomy spec).
- **Dogs and beyond the gut.** Partly. Two dogs sharing a yard make every loose stool a found one, so the disclosure applies but the seen count is always zero. Blood in a shared litter tray fits; ears, airway, mobility and weight are read on the body and do not.
- **Worst misfire (quiet).** "Vomiting 3 days running: call today. 6 vomits, 1 seen", for an owner who is out all day. A seen only twin beside a safety line invites the owner to discount it.
- **The counterexample that was run.** One healthy housemate lifts a year's false chronicity cards from 28% to 81%, and showing the twin leaves it at 81%. Gating on seen only cuts 56 day recall from 92% to 0.5%. And a flat rate trial reads "seen 7, was 14" the moment the owner goes back to the office (a false "fewer" in 33% against 8%).
- **What would have been fitted to her.** The template "12 seen, 13 with found". It fits a record whose found share is 1 in 13. For an owner out all day the same template leads with "1 seen". The total has to lead and the split only annotate.
- **Verdict: keep, narrowed.** A dated household record and one partition line ("13 logged: 12 seen, 1 found afterwards") on the vet report and evidence view only. It gates nothing, tiers nothing and compares nothing.

### EO-9. The interval from the end of a course to the sign's return

- **What it would detect.** A treated problem that comes back at a similar interval after each course ends.
- **What motivated it.** Ear trouble back in her log 37 and 43 days after two courses of drops ended (F11).
- **On file already.** Counts since a course starts, never attribution ([CUL-1140](https://linear.app/projectnyx/issue/CUL-1140)); stop markers on the report's trend chart; masking tails after a course ends; repeated courses collapsing into one ([CUL-296](https://linear.app/projectnyx/issue/CUL-296), [CUL-300](https://linear.app/projectnyx/issue/CUL-300)). Nothing measures the interval, and ear signs are not an event type.
- **Dogs and beyond the gut.** Partly. Repeat ear courses are commoner in dogs, but treatments given at the clinic never enter the record, and a long acting injection's interval is simply its label. Itch after each steroid taper and cough fit; ears, urinary and mobility have no event type.
- **Worst misfire (quiet).** Ears that never cleared, logged only before each recheck, print as "came back 31 and 36 days after each course". In simulation that happened 95% of the time with zero truly quiet days. The report's own wording on her ears was changed because of this.
- **The counterexample that was run.** On signs unrelated to the course, two intervals within 20% of each other occur for 21% of pets in a year. The tightest ratio that admits 37 and 43 fires on 17.7% of nulls at 39% recall. Three matching intervals hold the null rate at 1.9% but fire on 22 to 87% of pets with a natural flare cycle or ears that never cleared, and 99.9% of true relapsers lose the line once relapse speeds up.
- **What would have been fitted to her.** "Similar". Within a week and within 20% are the two smallest round tolerances that admit 37 and 43.
- **Verdict: the detector is dropped. Keep one layout.** On the vet report only: repeat courses of one drug by their recorded dates, with the episodes logged after each end as counts and dates beside logging coverage. No interval, no similarity test, no owner card. Not specific to her.

### EO-10. Partial doses given in food, read as intake

- **What it would detect.** A medicine dose logged "partial" and "given in food", read as evidence that the food carrying it was not finished.
- **What motivated it.** 17 of her 35 doses hidden in wet food were left unfinished, across twelve weeks in which only 8 of 481 feedings carry an intake rating (F14).
- **On file already.** The vet report already joins each partial dose to its paired meal's rating and says it "may be the food going uneaten". The coupling is option C of an unruled decision brief whose team recommendation is against it: two separate facts, the bowl on the meal and the tablet on the dose ([CUL-1902](https://linear.app/projectnyx/issue/CUL-1902)). The reverse inference shipped with a counterexample on file: a cat can lick the food clean and leave the tablet ([CUL-99](https://linear.app/projectnyx/issue/CUL-99)).
- **Dogs and beyond the gut.** Partly for dogs: it holds when medicine is mixed into the meal itself, but most dog doses ride in a pill pocket or a treat, where "partial" means the dog ate the treat and spat the tablet. Beyond the gut, yes, as a count a vet interprets: an arthritic dog whose last 5 of 6 doses on food were partial is going off food on an anti inflammatory. The reading flips with the drug, which is why it cannot be an engine reading.
- **Worst misfire (quiet).** Merged into the intake lane, the dose rows soften a warning for a cat that really is going off her food: an "ate some" row lowers her normal and lifts her worst day. In a simulated five day appetite collapse, 15% of sick cats lose a card that today's engine raises and 15% lose the call today ask.
- **The counterexample that was run.** A port of the intake lane with partial in food doses added as ratings. With appetite unchanged and the dosed bowl left 30 to 50% of the time because of taste, the share of cats with at least one false card in a year goes from 2 to 4% today to 46 to 49%, every one at call today strength; on a lifelong daily dose, to 99%.
- **What would have been fitted to her.** The rule itself. "Partial and given in food means the bowl was not finished" is one owner's logging habit. Another owner taps partial for a half tablet on a taper, a spat out pill or a spilled liquid.
- **Verdict: keep, narrowed to the report.** A partial dose must never become an intake rating. On the vet report, when intake was recorded for few meals, print per drug "N of M doses given in food were logged partial" and "the last K in a row", beside the rated meal counts and never inside them, keeping the shipped clause that the record cannot tell an unfinished bowl from a smaller dose.

### EO-11. Vet notes and documents as structured facts

- **What it would be.** Not a detector: facts extracted from a visit note or an uploaded document (weights with their scale, tests and values, medicines with schedules, and conditional instructions) feeding other lanes.
- **What motivated it.** Her 09-16 visit note holds a clinic weight, an exam, a plan and "if after the 10 days of full strength pred she's still coughing then we should give her a call". The condition came true. Nothing in the product noticed (F8, F13).
- **On file already, with two rules.** AI extraction of vet documents into diagnoses, medicines, dates and lab values is filed and held on a PM ruling ([CUL-435](https://linear.app/projectnyx/issue/CUL-435)). The vet visits spec (AC 10, amended 2026-09-28) lets the engine read only dates and owner answers from the vet tables: notes never leave them. The Data Scientist's standing rule: no engine reads prose at read time to make a count; a write time proposal from closed sets, made a fact by the owner's tap, is allowed. A clinic weight row on the after visit screen is ruled ([CUL-1390](https://linear.app/projectnyx/issue/CUL-1390)).
- **Dogs and beyond the gut.** The instruction half carries over unchanged ("recheck if he is still limping after the 7 days", "call if she is still straining after 48 hours"). The weight half matters more for dogs, where a clinic sheet is often the only weight series, and the lane it feeds is cat sized: its 0.6 kg confirming margin is 14% of her and 2% of a 30 kg dog.
- **Worst misfire (quiet).** A watch the owner believes is armed and that stays silent. If the vet's condition is tested against the logs, then at her own logging completeness (about one logged day in four coughing days) a seven day watch misses 11 to 37% of cats still coughing every day and 57 to 64% of cats coughing twice a week. It moves the vet's spoken safety net into the app and then drops it. Runner up, also quiet: a weight the note quotes from the past, stamped with the visit date, turns a firm 15% loss into "level or up".
- **The counterexample that was run.** 200,000 synthetic pets per cell: reaching 95% of twice a week coughers takes a watch of 38 to 52 days, by which time 40 to 49% of cats whose cough resolved have been told their vet asked for a call.
- **What would have been fitted to her.** The grammar of the instruction. "Call if the sign is still there after N days of the drug" is one sentence from one vet. Others say "come back if it continues" (no date), "recheck in two weeks" (no condition) or "if she vomits more than twice a week" (a count).
- **Verdict: keep, narrowed.** Extraction is dropped as an engine input, and so is any test of the vet's condition against the logs. What survives is owner confirmed structured rows, written at write time on the after visit screen from closed sets: an instruction row (a sign, an action, and a date the owner confirms) that shows one door, once, on that date, whatever the logs say, with the count logged since beside its coverage; a clinic weight; and a course. The engine fits nothing: the only number is the vet's own date.

### EO-12. Asking whether a weight was the clinic's scale

- **What it would detect.** A weight labelled "home scale" that was in fact taken at the vet.
- **What motivated it.** Her only two weights are on two scales, and the app stores the clinic's as home scale (F8). The 10-28 read asked her vet for a clinic weight that was already on file.
- **On file already.** The ask on a visit day is already specified: the weight lane spec §4.2 has "At the vet today?" with a one tap relabel (not built). Older readings were ruled "home scale, legacy" until the owner corrects them ([CUL-1412](https://linear.app/projectnyx/issue/CUL-1412)); a clinic weight row on the after visit screen is ruled ([CUL-1390](https://linear.app/projectnyx/issue/CUL-1390)). As an engine side detector that joins visit dates it is ruled against: visits are not engine input.
- **Dogs and beyond the gut.** Partly for dogs: above 12 kg the absolute rule decides, not the label. Beyond the gut, yes: a kidney or thyroid cat's recheck weights, an arthritic dog's weight plan.
- **Worst misfire (quiet).** Home 4.20, home 3.61, vet 3.62 kg raises a soft row today. Answer truthfully that the last one was the vet's scale and the row disappears, on a 14% loss, because the two home readings no longer have a confirming third.
- **The counterexample that was run.** 4,000 pets per cell: truthful answers delay the first row for 11.9% of losing cats weighed on a kitchen scale (median 31 days). In homes with no scale, recall rises from 72.5% to 100%, but healthy cats weighed only at the vet are carded in 0.4 to 11.7% of years.
- **What would have been fitted to her.** "On the day of a recorded vet visit", read off one row that was logged 48 minutes after the visit was recorded. Nothing says how other owners behave.
- **Verdict: keep, narrowed.** Only a capture side ask, once per reading, for readings already on file; drop the match against the visit note. It should not ship before the condition already ruled for the weight lane ("a relabel never lowers a row") exists in code, or a truthful answer makes the engine quieter.

### EO-13. Environment join for airway and skin signs

- **What it would detect.** Cough, sneeze or itch logs moving with outdoor pollen or air quality.
- **What motivated it.** A cough that waxes and wanes with no measured cause (F10).
- **On file already.** Nothing. The app stores a time zone and no region, and sneeze logs are not fetched by the engine at all.
- **Dogs and beyond the gut.** Biologically plausible for dogs, but the one designed test found (37 atopic dogs with daily local pollen counts) showed no correlation with itch.
- **Worst misfire (quiet).** A cat coughing daily whose owner installs the app in April and logs less as the months pass gets "coughing logged on 10 of 53 high pollen days, 10 of 122 others" in August, just as the cough card falls silent.
- **The counterexample that was run.** 6,000 simulated owners who install in spring, with a constant cough and fading logging: 67% drew a false seasonal line within a year (76% of April installers, none of November's). The repair that removes it also removes nearly all recall.
- **What would have been fitted to her.** The sign set (cough, sneeze, itch) is her symptom list, not a ruled set of lanes.
- **Verdict: drop.** No join survives. What can be salvaged needs no outside data: a vet report row showing the same calendar weeks in earlier years, once two full yearly cycles exist.

### EO-14. A planner for a comparison the vet asks for

- **What it would be.** Not a detector: when a vet asks an owner to compare two conditions, a randomised schedule, an outcome fixed in advance, and a randomisation test at the end.
- **What motivated it.** The chicken rechallenge could not have answered its own question however it had gone (F4), and the kibble against wet contrast is exactly the kind of thing a designed comparison could settle.
- **On file already.** A vet led reintroduction window after a trial, filed and unruled ([CUL-1821](https://linear.app/projectnyx/issue/CUL-1821), [CUL-1770](https://linear.app/projectnyx/issue/CUL-1770)); a literature review of single patient trials and a per phase posterior prototype for the vet report. No planner. G3 forbids management suggestions to owners.
- **Dogs and beyond the gut.** Partly: it fits immediate effects in a meal fed animal (a slow feeder against an ordinary bowl). It does not fit ingredient challenges read on itch, ears or stool, which lag by days. Beyond the gut, airway only (cough on a collar against a harness).
- **Worst misfire (quiet).** A reaction that arrives the next morning, counted by calendar day, lands on the other condition's day three times in four. The comparison clears the trigger and accuses the safe condition.
- **The counterexample that was run.** That next day reactor over 8 weeks: 4.0 against 12.5 event days, with 64% of runs reaching p = 0.05 against the safe schedule and none against the trigger. And at her own event rate, eight blocks succeed in under 1% of runs; an 80% chance of six agreeing blocks takes 8 to 27 weeks.
- **Anchor and validation.** Arithmetic for the block count (six informative blocks; 2 of 64 possible orders); published onset and resolution times for eligibility; a null sweep of pets and owners blind to the schedule (3.6% false lines when read once, 16% when read daily).
- **What would have been fitted to her.** A period of one day. It fits a reaction that begins and ends within minutes of a meal, which is her kibble pattern, and nothing slower.
- **Verdict: keep, narrowed, and only with a ruling on G3.** No planner. A comparison record that the vet sets, read once, on the vet report only, with the app drawing nothing but the day order. Eligible only where the owner controls the exposure and the outcome is witnessed inside a window anchored on the exposure. Refused unless six agreeing blocks are 80% likely within 8 weeks. Counts by assigned schedule, and never the words "no difference".

### EO-15. Comparisons that know about deleted logs

- **What it would detect.** A before and after comparison whose baseline holds many logs of the same sign that the owner later deleted.
- **What motivated it.** 47 deleted vomit logs against 63 live ones, every one of them dated inside the pre trial baseline. If the ones that stand apart from a surviving log were real, her pre trial rate was 6.9 a week, not 2.8, and the trial looks very different (F15).
- **On file already.** A broader, view level "this may under count" disclosure was rejected on this record's evidence and never built; every engine pull hides deleted rows by rule; a test fixture with more deleted than live rows shipped. Nearest open item: a deleted row should lower a per incident call with a dated line ([CUL-1741](https://linear.app/projectnyx/issue/CUL-1741)).
- **Dogs and beyond the gut.** Yes on both: deletion is the owner's behaviour. In a home with two dogs most deletions are logs moved to the right pet, not under counts. Deleted scratch logs mint a "down from 6" card the same way. Weight does not fit: one weigh in is the whole baseline.
- **Worst misfire (quiet).** Deletions in a baseline can only push a comparison toward "more". So a caveat or a withheld sentence, as first written, lands on true escalations.
- **The counterexample that was run.** Vomiting doubles and the owner has only tidied mis-logs: the idea as written cuts escalation recall from 71% to 21%. It also ignores the opposite and worse case, where half the trial era vomits are deleted: a false "fewer" in 43% of runs against 6%. No threshold can define "many", because an owner tidying mistakes and an owner removing real episodes show the same deleted share.
- **Anchor and validation.** No new constant: the lane's own exact test, read at its worst case. Replay unchanged pets with and without deletions (undo, edits, wrong pet, real) and require escalations to match the shipped engine exactly.
- **What would have been fitted to her.** "Many". The only numbers behind it are her 47 deleted against 63 live, and the shipped fixture's 43 against 21, which is also her.
- **Verdict: keep, narrowed, and only with a privacy ruling.** No disclosure, no threshold, nothing on any escalation. A "fewer" sentence prints only if it still passes its gate when the logs deleted from its recent window are counted as episodes. That restores the false "fewer" rate to 6% at a cost in true "fewer" recall (58% to 40%). It reads deleted rows, which an owner may reasonably expect never to count again, so it needs a ruling from the privacy lens before anything else. If deleted logs may never be read, drop it.

### EO-16. Things an owner cannot record today

- **What it would be.** Not a detector: ways to record what her record could not hold. The critic took the four that are not already on file: a prompt that restarts stool logging, non food ingestion as an event, nasal signs, and a "cough or sneeze just before?" mark on a vomit.
- **What motivated it.** No stool of any kind logged for five months in a cat with chronic vomiting; three photo reads of non food material with no event to hold them; "congestion" that exists only in an appointment note; a cough or sneeze logged between a kibble meal and a vomit twice (F12).
- **On file already.** Specified and not greenlit: a sleeping breath counter ([CUL-751](https://linear.app/projectnyx/issue/CUL-751)), ear signs as a type ([CUL-669](https://linear.app/projectnyx/issue/CUL-669)), a retch flag on a vomit ([CUL-670](https://linear.app/projectnyx/issue/CUL-670), and decision D7 on [CUL-1765](https://linear.app/projectnyx/issue/CUL-1765)). One tap normal stool shipped ([CUL-1655](https://linear.app/projectnyx/issue/CUL-1655)).
- **Dogs and beyond the gut.** Partly for dogs: most dogs eat plants at least weekly, so "ate something that is not food" cannot be a count, and a large dog that retches must never be discounted because a cough came first. Nasal signs and the cough mark are airway.
- **Worst misfire (quiet).** Prompted stool logging fades, and the calm card says "down from 3 last week" about a pet whose stool never changed.
- **The counterexample that was run.** 20,000 synthetic pets with an unchanged 3 loose stools a week, unlogged until the prompt. With 80% captured after the prompt, 87% get a false "rising" card within 21 days (under 0.1% for the same pet logged throughout). When capture then fades, 42% get a false "down from". A prompt changes the logging rate, and every week against week lane reads a change in logging as a change in the pet.
- **Verdict: keep, narrowed, item by item.** The stool prompt: once per chronic gut course, as a capture change, followed by 56 days in which stool is counted and never compared week against week. Non food ingestion: an escalation only, with a call now floor, never a count. Nasal signs: visible discharge only, on the vet report only. Cough before a vomit: a mark for cough only, on the vet report only, and never a reason to discount the vomit.

---

## 3. Generalisation audit of `DEFAULT_CONFIG`

Read from `supabase/functions/generate-signal/detection.ts` at `86cfc1a4` (lines 2813 to 3208). Each constant is rated by the anchor its own comment claims, checked against the earlier briefs and specs:

- **LIT** a published source is named and says what the constant needs.
- **SWEEP** a null sweep or simulation set the value.
- **OWNED** a persona or product call, stated as such, with no outside source.
- **NYX** the value or its shape traces to her record. Under G6 this is the column that matters.

| Block | Constant | Value | Rating | What the anchor is, and what limits it |
|---|---|---|---|---|
| correlation window | `correlationWindowHoursByType` | vomit 12 h, diarrhea 24 h, itch, scratch, skin 72 h | OWNED | "Split GI by latency (Dr. Chen)". No source in code. A window of hours cannot reach a reaction that takes days: see §3.2. |
| episode collapse | `symptomEpisodeGapHours` | 3 h | OWNED | A shared predicate. On her record the count is the same at 90 minutes and at 3 hours (59) and drops to 52 at 12 hours. No source found this round. |
| correlation tiers | `earlyMinMatchedPairs`, `earlyMinDiscordantCaseOnly`, `earlyMinRiskDifference`, `establishedMinMatchedPairs` | 3, 2, 0.2, 5 | OWNED | The September replay showed the Early tier firing at exact p = 0.25. |
| | `familywiseAlpha` | 0.05 | convention | |
| intake decline | `minRatedMealsForBaseline`, `consecutiveDaysBelowBaseline`, `baselineWindowDays`, `minDeclineDelta`, `normallyEatenScoreFloor`, `normallyEatenMinSamples`, `refusalRecencyDays`, `cat.*` | 4, 2 (cat 1), 14, 1, 3, 3, 2, ceiling 2 | OWNED | A species split exists for cats only. The whole lane needs ratings; she has 8 ratings on her last 481 feedings, so the lane is blind on the engine's own dogfood record. |
| | `sustainedRefusal` | 72 h, 3 meals, 2 days | LIT, feline only | The comment cites "the feline 48 to 72 hour liver window". The September evidence pack found the 48 hour figure has no primary source. Applied to dogs as "the louder side". |
| reflection and worsening | `windowDays`, `minEpisodesEitherWindow`, `minLoggingDaysPerWindow` | 7, 3, 3 | OWNED | "Conservative-but-useful (product-team call)". |
| | `worseningMinEpisodes` | 2 | OWNED, known weak | 68 of 100 synthetic healthy cats saw a worsening card in 180 evenings (September brief §V). A dark flag moves it to 3. |
| | `worseningDenseDayFloor` | 4 of 7 days | OWNED | |
| | `burdenMuteMinEpisodes` | 4 in 7 days | LIT, off label | "provisional, FCEAI severe". That index grades disease activity in cats already diagnosed with gut disease; it is not a triage line and it is feline. |
| burden | `persistenceMinDays` | 3 | SWEEP | 21.8% of null pets at 3 days, 48.2% at 2. |
| chronicity | `minSpanDays` | 21 | LIT | Chronic is 3 weeks or longer (the 2023 ACVIM consensus, reread this round). Gut signs only. |
| | `minEpisodes` | 6 | SWEEP | 1.3% null rate at 6, 9.9% at 4. The ruling sheet set 5 on 2026-10-01 (R10); the block still says 6, so the ruling has not been built. |
| | `windowDays`, `minActiveWeeks`, `ongoingRecencyDays`, `firmSpanDays` | 56, 3, 14, 42 | OWNED | |
| | `perType.cough` | 5 episodes (cat 4), firm at 28 days, recency 28 days | OWNED | The comment says so itself: "OWNED CALIBRATION, NOT GUIDELINE AUTHORITY". The lane exists because of her cough; the floors were argued on constructed cats, not on her. This round adds a caution: logged coughs are a small fraction of real ones (§3.3). |
| post-prandial timing | `rapidWindowMinutes` | 30 | OWNED | "no canonical clinical cutoff"; the comment records that it was not set to her 15 minute episodes. This audit agrees: her rapid episodes sit at 0 to 19 minutes with nothing between 20 and 58, so 15, 30 and 60 give almost the same split. The literature still offers no cutoff (§3.2). |
| | `minRapidEpisodes`, `minEligibleEpisodes`, `minRapidFraction`, `recencyDays`, `minObservedToExpectedRatio`, `feedingLookbackHours`, `windowDays` | 3, 6, 0.25, 14, 2, 24, 60 | SWEEP and OWNED | The grazing guard was measured at about alpha, not well under it. |
| empty stomach | `longGapHours` | 6 h | LIT, feline only | Feline gastric emptying studies. A dog on this constant is held to a cat's stomach. |
| | `minLongGapEpisodes`, `minEligibleEpisodes`, `minLongGapFraction`, `baseRateAlpha`, `recencyDays` | 3, 6, 0.6, 0.05, 14 | SWEEP | Per episode Poisson binomial guard; three reviews broke earlier versions. |
| trial response | `baselineDays` | 49 | **NYX (shape)** | The comment's rationale is "both the ~daily post-prandial and the ~few-times-a-week empty-stomach cadence". Those two cadences are hers. 49 days is also exactly the pre trial window the August brief used on her record (06-07 to 07-25). |
| | `minLoggingDaysPerWindow`, `contrastAlpha` | 7, 0.05 | OWNED, convention | |
| time of day | `minClusterEpisodes`, `minClusterFraction`, `minEligibleEpisodes` | 5, 0.6, 6 | SWEEP | 3.3% pooled null rate; 7.4% at n = 8, disclosed. |
| | `clusterWindowHours` | 4 | **NYX (possible)** | Her June cluster was "3 to 7 am", a 4 hour band, and the lane was built from that finding. The spec may hold an independent reason; this audit could not find one in the block. |
| | `windowDays`, `suppressionOverlapFraction` | 60, 0.5 | OWNED | |
| incident red flag | `windowDays` | 14 | OWNED | |
| coverage | `stapleMinMeals`, `stapleMinSymptomEpisodes`, `stapleDominanceFraction`, `stapleSourceMajorityFraction` | 4, 3, 0.8, 0.8 | OWNED | The lane was motivated by her chicken staple, but 0.8 sits above her 67%, so it was not set to make her fire. |
| diet structure | `collapseWindowDays`, `minGapDays`, `minTreatsPerGapDay` | 10, 5, 2 | **NYX** | `docs/nyx-descriptive-signals-requirements.md` names the source: "the June meal-type collapse: 6 of the last 10 days". The floor is her count less one, on her window. |
| | `churnWindowDays`, `minNovelFoods`, `minSymptomEpisodes` | 14, 3, 2 | **NYX (shape)** | Her June week had three new foods inside a vomiting run. The rule describes that week. |
| | `minClassifiedFraction` | 0.8 | OWNED | |
| human food | `windowDays` | 60 | OWNED | |
| gap shortening | `minGaps` | 3 | LIT (statistical) | g-chart practice. |
| | `runLength` | 4 | SWEEP | 4.2% by chance at 4; a disclosed 5 to 6% on autocorrelated nulls. |
| | `gapShorteningRatio`, `recencyGraceFactor` | 0.5, 2 | OWNED | |

**Tally.** Of 60 or so constants: 4 rest on a named clinical source (two of them feline only, one used off label), about 14 on a sweep, about 36 are owned calls, and 4 groups carry her shape (`dietStructure` collapse, `dietStructure` churn, `trialResponse.baselineDays`, `timeofday.clusterWindowHours`). None was found tuned so that her record fires today. The G6 problem is narrower and older: four rules were written as descriptions of weeks she had.

### 3.1 The structural version of the same problem

Five lanes are single type and the type is vomit: post-prandial timing, time of day, empty stomach, trial timing and burden (`POSTPRANDIAL_SYMPTOM_TYPE` and its four siblings). A vomiting cat gets ten lanes. An itchy dog gets four (correlation, reflection and worsening, chronicity, gap shortening). A coughing cat gets one. The engine's depth follows its one real patient.

### 3.2 What this round's literature says about existing constants

| Constant or rule | What was found | Source rows (round 3 report, §13) |
|---|---|---|
| Correlation windows of 12 to 72 hours | On a food challenge, gut signs in food sensitive cats came back "within 3 to 4 days" (the study stopped watching at day 7); skin signs came back in half of cats by day 4, 90% by day 7 and nearly all by day 14. A window of hours can only find a reaction that is immediate. The lane cannot see the delayed kind, and no window short of two weeks could. | B1, B3 |
| `rapidWindowMinutes` 30 | Still no published cutoff. The one feline study describes vomiting "within minutes of eating" in some food sensitive cats and "2 hours to more than 12 hours" in others. Kibble crosses a healthy cat's gullet in about 10 seconds, so regurgitation and a fast vomit both fall well inside 30 minutes and the window cannot tell them apart. | B2, A9 |
| The idea behind the post-prandial lane ("eats too fast") | No study was found, in cats or dogs, relating eating speed, food form, meal size or slow feeders to vomiting. The lane's counts are sound; any reading of them as "scarf and barf" has no evidence behind it. | A5, A6, lane A silent |
| Weight loss tiers of 5% and 10% (ruling sheet) | No guideline gives a threshold for unintended loss. One point on the nine point body condition scale is 10 to 15% of body weight, which gives the 10% tier a physical meaning: about one point. | E7, E9 |
| The planned loss line of 2% a week (weight lane spec) | Supervised plans aim at about 1% a week (0.5 to 2%), achieved 0.7 to 0.9%, and added food when loss passed 1.5 to 2%. Two per cent is the ceiling of the published range, not its middle. | E5 |
| Sleeping breaths, 30 a minute (taxonomy spec, not greenlit) | Healthy cats at home sleep at a median of 19 to 20; 5% averaged 30 or more; the 30 line is a cardiology guideline. No home study exists in cats with airway disease. | C12 |
| Cough floors that count logs | Reported cough tracks recorded cough poorly in people, and an owner survey could not be converted into a rate. A floor on logged coughs is a floor on logging. | M5, C9 |
| "Improved" as an owner's reading of a trial | 54 to 74% of placebo treated cats were owner rated successes against 10 to 63% by measurement. An owner closing a trial as improved is weak evidence, and the engine should never echo it as a finding. | M12 |
| Steroid masking after a course ends | No study measures it in cats. Trial conventions run from two weeks off (skin) to three or four weeks (gut). Any masking tail constant is an owned call. | B8 |

### 3.3 Health domains the engine cannot see

| Domain | Can the owner log it today? | Does the engine read it? |
|---|---|---|
| Vomiting | yes | yes: ten lanes |
| Diarrhoea | yes | yes: four lanes |
| Itch | yes | yes: four lanes |
| Cough | yes (since July) | one lane (chronicity) |
| Sneeze | yes | no: typed and stored, never fetched |
| Lethargy | yes | no |
| Normal stool | yes | no; and no prompt notices when a pet with gut signs has none logged for months |
| Weight | yes | not yet: the lane is specified and unbuilt, and every reading is stored as "home scale" |
| Appetite | only through meal ratings | yes, and blind the moment ratings stop |
| Ears | only as free text on an itch log | no |
| Nose, breathing rate, breathing effort | no | no |
| Urinary (straining, frequency, blood), thirst | no | no |
| Mobility and pain | no | no |
| Mouth and teeth, eyes | no | no |
| Things eaten that are not food | no | no |
| Behaviour (hiding, night waking, vocalising), seizures | no | no |
| Body and muscle condition | no | no |
| The daily "look" | yes | no, by ruling: a look never enters the engine |

The engine is a gut engine with one airway lane. For the patient it was built on, the signs that most need a vet this week (weight, cough, ears, intake) sit in rows that read "no".

### 3.4 What a second and third real pet would need to look like

Everything the engine knows from a real record comes from one indoor cat with gut signs, an owner who builds the product, about nine feeding logs a day, and one diet trial. A second and a third pet are worth the most where they differ from her on the axes the constants never met.

| | Pet 2 | Pet 3 |
|---|---|---|
| Species | A dog | A cat or dog with no known disease |
| Main problem | Not the gut: itch and ears, or mobility | None. A real null |
| Feeding | Two fixed meals a day, so the number of exposures never changes | Free fed or grazing |
| Owner | Not on the team; logs the way owners do: sparsely, in bursts, mostly when something happens | Not on the team; logging fades after week three |
| Home | One pet, or several of the same species | Several pets, so found events cannot be attributed |
| Treatment | A course with a taper, so course end and relapse can be dated | None |
| Answer key | A vet's diagnosis and at least one lab or cytology result, entered after the engine has read the record | A vet's "healthy" at the start and the end |
| Length | Six months | Six to twelve months |

What each would test:

- **Pet 2** tests every feline only constant (`longGapHours`, `sustainedRefusal`, the cat split in intake), the four lanes an itchy dog gets, whether per exposure reads mean anything when exposures are constant, and how the count lanes behave on a normal owner's logging.
- **Pet 3** is the one the engine has never had: a real healthy pet. Every false card rate in the config comes from synthetic nulls (68 of 100 synthetic healthy cats saw a worsening card in 180 evenings). A real quiet record is the only way to learn what a year of nightly evaluation shows an owner whose pet is fine.
- Neither should be used to choose a constant. Under G6 they are demonstrations and tests, the way her record is meant to be.

---

## 4. Data the engine wishes it had

Ranked by how many of this round's dead ends it would have opened, for any pet, against what it costs the owner. "Near zero" means no new habit: derived from what is already logged, asked once, or read from something the owner already has.

| # | Data | What it would have changed this round | Near zero way to collect it | What it unlocks |
|---|---|---|---|---|
| 1 | **Weights with their scale, and a body condition score** | The whole weight question rests on two readings, one undated and one mislabelled | A weigh in dated on a vet visit day asks once "at the vet today?" (specified in the weight lane spec, not built); read weights off uploaded invoices and discharge notes; ask for the score at the visit | The weight lane; a clinic confirmed level; any energy read |
| 2 | **What a feeding is: grams and calories** | All 1,232 feedings carry quantity "unknown", so intake, energy balance and "risk per meal" are all unmeasured | A default portion set once per food; calories read from a photo of the label; a kitchen scale only when a vet asks for a weighed week | An energy estimate beside weight; an honest per meal denominator; intake when ratings lapse |
| 3 | **Vet documents and visit notes as structured facts** | Her record holds a visit note with a clinic weight, an exam, a treatment plan and a conditional instruction, and two documents nobody can read | AI extraction with the owner confirming each fact (see §4.1) | See §4.1 |
| 4 | **A one time lifestyle card** | Indoor or outdoor, preventives, vaccination, neuter status, other pets: none is recorded, and half the differential turns on them. The vet cold read asked for exactly these first | Five taps, asked once, re-asked before a vet visit | Honest "not recorded" lines on the vet report; household attribution |
| 5 | **Whether a meal was logged before or because of the event** | 10 of 18 after kibble events had the meal logged at the same sitting; set them aside and the contrast with wet food is no longer statistically firm | Nothing: derive it from the two creation times already stored | Honest timing lanes and per feeding counts (idea 2) |
| 6 | **Effort at a vomit: heave or not** | Vomiting against regurgitation is the first question for the vet and the record cannot say | One optional tap after saving (already a filed decision); or a short video attached to the log | The descriptor line on the report; a regurgitation question for the vet |
| 7 | **A daily one tap for a chronic sign** | 36 cough logs against "daily, many times a day": no count measures the cough | Only for a sign that already holds a chronicity card: "today: none, a little, a lot" | Stated beside logged on the vet report (idea 6) |
| 8 | **Stool, when gut signs are active** | No stool of any kind for five months in a cat with chronic vomiting | A prompt when a pet with a gut finding has no stool log for some weeks; the one tap normal stool already exists | A stool line on the report; diarrhoea lanes that mean something |
| 9 | **Seen or found, and whose** | 18 of 63 vomit logs were found, in a home with two cats; the trial's apparent benefit sits in them | Already captured as seen or found; add "sure it was hers?" only in a home with another pet of a species that could have done it | The seen and found split on the report (idea 8) |
| 10 | **Breaths a minute asleep** | A coughing cat with no measure of breathing at all | A one minute tap counter, offered when a cough finding is active (specified, not greenlit) | A number the vet uses; a call line at repeated counts over 30 |
| 11 | **Ear, nose and "ate something that is not food" as things an owner can log** | Three ear flares live in free text on itch logs; congestion appears only in an appointment note; three photo reads of non food material have no event | New event types (ear signs is specified and waiting) | A relapse interval read (idea 9); report rows for the vet |
| 12 | **Partial doses given in food, read as intake** | 17 of 35 doses in food were unfinished, the only intake evidence for twelve weeks | Nothing: both fields are already logged | A stated count on the report; not a detector (idea 10) |

### 4.1 AI extraction of vet documents: what it would unlock, and what stands in the way

**What her record shows.** One visit note, typed by the owner the same day, holds: a clinic weight; the vet's view of the weight ("wasn't very concerned about this loss"); an exam ("lungs sound good"; one ear dirty, one clean); a plan (ear drops, a steroid course with its schedule, the trial extended to 12 weeks); and a conditional instruction ("if after the 10 days of full strength pred she's still coughing then we should give her a call"). Two uploaded documents (a prescription and an invoice) hold more and are read by nothing.

**Lanes and surfaces it would unlock.**

| Extracted fact | What it feeds |
|---|---|
| A weight with its scale and date | The weight lane's confirmed level; this record's central error (a clinic reading labelled home scale) would not exist |
| A conditional instruction with its trigger | A follow through line in the care state: "your vet asked for a call if the cough outlasted the course; the course ended on 10-10 and coughing has been logged since". This is the one extraction that would have changed what happened to her this month |
| Medicines with schedules | Course start and end without the owner retyping them; masking windows; the relapse interval read |
| Test names and values | Trend lines for the values vets follow (kidney, liver, thyroid, cobalamin); "no result on file" as an honest report line |
| Diagnoses and problem lists | Condition aware thresholds (a ruling already waits on condition capture) |
| Preventives and vaccines on an invoice | The lifestyle card, filled without asking |

**What stands in the way.** Two standing rules, both deliberate. The vet files spec gates any AI over the document corpus behind a PM and privacy ruling. The vet visits spec says a visit's notes "never leave the vet tables for an engine". Extraction of uploaded documents is already filed and held. What this round adds is the evidence for one narrow piece: the conditional instruction. It is a sentence the vet said, the owner wrote down, and the product then ignored while its condition came true.

**How it could misfire.** A misread number becomes a fact on a vet report (a decimal weight, a transposed lab value). An instruction extracted without its condition becomes advice the vet never gave. A diagnosis extracted from a differential list becomes a label. Each argues for owner confirmation of every extracted fact, for showing the source line beside it, and for never letting an extracted instruction speak in the app's voice.


---

## 5. Limits of this brief

- **The critics are models.** Each ran its own simulation and reported its own numbers. Nothing here re-derives them, and the simulation code is not committed. Treat every percentage in §2 as one critic's estimate from synthetic pets of its own design.
- **One real record.** Every "motivated by" line is one cat. That is the reason for §3.4.
- **Prior art was read on one day.** Issue states and spec sections are as of 2026-11-11.
- **No decision is taken here.** Two ideas touch standing rules (G3 for idea 14; the privacy of deleted rows for idea 15), and idea 11 sits beside the rule that a visit's notes never reach an engine. The briefs for those are on [CUL-2710](https://linear.app/projectnyx/issue/CUL-2710).
