# The vomit engine, 10x: from a photo reader to a case file (October 2026)

**Date:** 2026-10-11
**Status:** 🧊 Frozen point-in-time evidence capture (research brief, see `docs/research/README.md`). Correct additively (a dated §V at the foot, with inline ⚠ pointers), never in place.
**Issue:** [CUL-1765](https://linear.app/projectnyx/issue/CUL-1765) (discovery). This file carries evidence, re-scored bets and decision briefs. The rulings live on the issue.
**The ask, as the issue states it:** "The PM has logged about 50 vomit photos for Nyx, and the 50th read tells him nothing the 1st didn't." The issue asks what a 10x better vomit engine looks like if the model keeps reading one photo blind and the server joins that read to the pet's record, so the incident screen says what *this* vomit adds to her case.
**Companion mock:** `docs/culprit-vomit-engine-mockups.html`, round 1, published as an Artifact at https://claude.ai/artifact/8q67Qg4Mb8Xirv6yj1rYpF. Frames are cited below by id (F0 to F9).

**Method.** Five isolated evidence lanes, each run without sight of the others:

1. **Clinical** (Dr. Chen and Sr. Data Scientist lenses): what a vet's vomiting history asks, and what a photo, the log and nothing can answer.
2. **Model and API** (Dir. of Engineering lens): the current call, the candidate models, prices, determinism, schema, the eval.
3. **Replay** (Sr. Data Scientist lens): a read-only replay of Nyx's settled record through the shipped `lib/mealTiming.ts` and `lib/symptomEpisodes.ts`, unmodified, printing what Bet 1 would say on every vomit.
4. **Prior art** (Product Owner and Designer lenses), verified 2026-10-11.
5. **Hazards** (an adversarial pass that tried to break the four bets and the three R3 options).

An independent verifier then re-checked every finding (re-fetching sources, re-running the counts in SQL, re-reading the code) and returned one verdict per finding: *holds*, *amended* (use the amended claim) or *unverifiable*. Across 84 findings: 39 held, 43 were amended, 2 were unverifiable and none was refuted outright. A synthesis pass then re-scored the bets and wrote the decision briefs. In this brief an amended claim appears in its amended form, and an unverifiable one is marked *(unverified)*.

**The subject.** One real pet, as in every prior dogfood brief: Nyx, the PM's cat. The replay read 49 live vomits (2026-05-14 to 2026-10-09; 46 bouts after the shipped 3-hour collapse), 44 completed photo reads and 1,039 live feedings. A demo-seed copy of the cat is not an evaluation subject and no replay file carries it.

**Kickoff rulings (PM, 2026-10-10), recorded here:**

- **R1.** Who it is for: both audiences, owner screen first. The report reuses the case file's pieces.
- **R2.** Reopen two dated rules, "calm copy stays generic" (2026-07-17) and "no timing clause in the read" (EN-0), but only for lines that state what is present and are anchored to the record. Timing goes through `lib/mealTiming.ts` and says nothing when it cannot time the vomit. Never "same as usual". (§8 D2 asks the PM to narrow this.)
- **R3.** Open: name her recurring kinds with counts on owner screens? Dr. Chen (yes, the count is the chronic finding) against the Designer (a familiar label lulls). Drawn three ways in mock round 1; see §8 D1.
- **R4.** Discovery now, build after 1.2.0 clears App Store review.

---

## §0 The answer in one paragraph

A smarter single read will not produce the 10x, and a model upgrade on its own will not make the 50th read say anything the 1st did not. A photo can answer only the "what came up" half of a vet's history; timing and frequency come from the log; and nothing in the record captures the fact that changes a vet's workup most, whether she heaved first (vomiting) or it simply came out (regurgitation). So the value has to come from the server joining stable photo fields to the record at render time, and from putting the long-term picture where the owner and the vet can see it. Nyx's replay makes the point concrete. 26 of her 44 completed reads carry one of three fixed texts. Under Bet 1 the 30 calm reads would each get a different set of lines, but mostly because the numbers change. The line that repeats is itself the finding: 9 of the 11 timed vomits since Aug 2 came within 10 minutes of a logged feeding, while only 3.5% of clock minutes fall in that window. Two kickoff premises failed: "partially digested food" appears on 41 of 44 reads whatever the timing, so the digestion-by-time crossing has nothing to run on, and the "empty-stomach bile" kind has zero instances on her record. The recommendation: **Bet 1 narrowly, after 1.2.0** (a timing line that names the meal by its time and goes silent when it cannot time, a 7-day count only once the EN-4 floor runs, the calm template's "goes off food" sentence kept word for word, no novelty lines, no kind names); **Bet 3 as the home of the long-term finding** (a profile derived at render, led by the total, weight and intake, which needs EN-8's weight history because today the app cannot see Nyx's 15% loss); **Bet 4 as a report page** (descriptors and counts, no band word); **Bet 2 measure first**, starting with a structured-outputs PR on the current model, because a plain model-ID swap would quietly turn every read into "couldn't read the photo". One live safety gap should not wait for any of this: a cat's plant-material read shows the calm template today, with no lily question.

---

## §1 The PM's two questions

### Q1. What does the read return that the owner never sees?

**Returned, not shown, and worth showing:**

1. **`bile_present`.** Every read writes it (`supabase/functions/analyze-vomit/index.ts:164`) and the client loads it (`components/event/VomitAnalysisSection.tsx:127`, `:173`), but it is deliberately not rendered (`lib/analysis.ts:357`). A `bile` token in `contents[]` does render as "Bile" in the Contents row (`VomitAnalysisSection.tsx:1027-1029`). So the real gap is reads where `bile_present` is yes and `contents[]` lacks the token. Fix: show "Bile" present-only in "What's visible", using the fused `hasBile` (`lib/vomitContents.ts:85-90`). Never render "No bile": food vomit often carries none, so absence says nothing. Bile is the one colour cue that points to the stomach ("bile in the vomitus is specific for vomiting", Clinician's Brief 2012), though a photo sees only yellow or green, a weaker proxy than a dipstick.
2. **The record around the read.** The incident screen shows no meal timing and no count, although `lib/mealTiming.ts` already feeds Home, the Signal and Patterns, and `lib/symptomEpisodes.ts:100-113` counts in windows. Fix: a timing line (it prints on 24 of Nyx's 49 vomits, 11 of 16 since Aug 1, and is correctly silent on found piles, same-bout vomits and the two before meal logging began), and, once EN-4 runs for the pet, a 7-day count anchored at this vomit.
3. **The cross-incident picture.** L3 photo composition, the report's "Vomit characteristics", chronicity lane ⑦ and the burden card each hold a slice. The owner never sees them together. Fix: a profile screen (Bet 3) and a report page (Bet 4), each led by the total, weight and intake.

**Returned, and should stay hidden or go:**

4. **`ai_confidence`.** Written at `analyze-vomit/index.ts:683` (and `analyze-stool/index.ts:681`) and read by nothing. On Nyx's reads, contents confidence averages 0.750 with a mode of 0.75 whatever the answer. Do not show it. Measure once whether it predicts owner edits, then stop requesting it and store repeat-read agreement per field instead (§4).
5. **Model prose (`description`, `read_text`).** Pattern 10 correctly keeps it off calm reads. Keep it hidden, and remove it from the schema (Q2).

**Returned, but it should not drive anything:** the digestion grade as a timing signal ("partially digested food" is on 41 of 44 reads, including 13 of 14 within 10 minutes of eating and 20 of 20 found piles; "undigested" appears on 0 of 15 reads within 30 minutes), and novelty on colour or consistency.

**Not captured at all, and the biggest gap for a vet:** whether she heaved before it came up. It is the one per-episode fact that separates vomiting from regurgitation (§3 C1, C13; §8 D7).

### Q2. What should change in the prompt, the model and the training?

In order:

1. **Fix the call before touching the model.** One server PR, shared by vomit and stool. Replace the forced `tool_choice: any` (`supabase/functions/_shared/incident-analysis.ts:1396`) with structured outputs (`output_config.format`), which the live docs support on `claude-sonnet-4-6`, so it can ship and be measured on the current model alone. Branch on `stop_reason` (`refusal` becomes an honest unreadable state with a log line; `max_tokens` retries with a larger cap). Raise `max_tokens` from 1024 to about 4,000. Stamp `response.model`, not the requested model. Add a guard test pairing each Claude call site's model with its `tool_choice`. Filed as [CUL-1783](https://linear.app/projectnyx/issue/CUL-1783).
2. **Extend the stamps.** Hash the whole request except the image bytes (§4 M15).
3. **Redesign the schema so a calm read carries no model prose** (§4 M9).
4. **Stop crossing the digestion grade with time.** Collapse it into one "recognisable food present" atom (`lib/vomitContents.ts:72-75`) for any time rule, and let the eval test the grade directly.
5. **Determinism without temperature.** Fix the re-roll in the product (§8 D14).
6. **Confirm before alarm.** Repeat reads only when a red-flag field is present or unsure (§4 M5).
7. **Choose the model by eval, not price** (§4 M1, M13).
8. **The EN-2 eval ([CUL-1132](https://linear.app/projectnyx/issue/CUL-1132)) gates every field and model change** (§4 M13).
9. **Species stays out of the prompt** and drives server rules (§8 D8).
10. **Reference images are deferred** (§8 D9).
11. **No fine-tuning.** The API offers none, and tuning on about 50 photos of one cat is the multi-sample history Pattern 3 keeps out of the read (§4 M12).

---

## §2 Why read 50 matches read 1: the replay numbers

All numbers below were reproduced independently by the verifier (in SQL, or from the replay's output) unless noted.

### What the read says today

26 of 44 completed reads carry one of three repeated deterministic texts: 17 calm reads with the monitor template (vomits Jun 25 to Sep 21, rewritten from Jul 1), 6 `worth_a_call` reads with the feline-reduced-intake contextual text (rewritten Oct 7), and 3 `worth_a_call` reads with the repeat-vomiting contextual text (May 30 to Jul 5). The other 13 calm reads predate the template (written May 24 to Jun 24). The template is `buildMonitorReadText` (`supabase/functions/analyze-vomit/index.ts:403-406`). Frame F0 shows the baseline.

### What Bet 1 as kicked off would say

- **The timing line prints on 24 of 49 vomits** (16 within 30 minutes, 7 between 30 minutes and 6 hours, 1 at 6 hours or more) and stays silent on 25: 20 because the onset was not witnessed (19 estimated or window, 1 with null confidence, which the predicate also refuses at `lib/mealTiming.ts:143`), 3 because the vomit sits inside an earlier bout, and 2 because they came before meal logging began (May 14 and 15; the first live feeding is May 16, 7:16 PM). Since Aug 1, 11 of 16 get a line. Half the screens will have no timing line, and that silence is correct (F4 designs it).
- **The text would no longer repeat, but mostly because numbers move.** The 30 calm reads would get 29 distinct line-sets (48 of 49 overall). Strip the counts and minutes and 9 shapes remain (10 if minute and hour timing are separated).
- **The repetition is the finding.** Since Aug 2, 10 of the 11 timed vomits came within 20 minutes of a logged feeding and 9 within 10. Eight of those ten would print "2 to 5 min after eating" (spoken 3, 3, 4, 2, 5, 3, 4, 5; the other two print 20 min and 1 min). The median across all 16 rapid bouts is 3.9 minutes. From Aug 1 to Oct 11, only 3.5% of clock minutes fall within 10 minutes after an eaten feeding (10.2% within 30). That is far above chance, with one caveat: only witnessed vomits can be timed, and the owner is most likely to witness the minutes right after feeding.
- **The kickoff's "22 of 49 within 30 minutes" is 16 under the shipped predicate** (10 since Aug 2). The other 6 were found or estimated piles (May 19, Jun 9, Jul 4, Jul 10, Jul 27, Sep 7) whose time the owner did not see.

### Why the minutes need care

- **Minutes are often reconstructed.** Of the 16 rapid bouts, 8 had the meal stamped by the clock in a separate sitting before the vomit; 6 had the meal logged in the same sitting as the vomit (2 clock-stamped, 4 back-dated by hand 2.4 to 4.0 minutes); 2 were back-filled long after (May 25, 4 hours later; Aug 8, 3.4 days later). 11 of the 16 vomit times come from photo EXIF, so those minutes are an upper bound. On Oct 9 the meal was stamped 2:53 PM, the photo was taken 18 seconds later and the vomit row was created 0.6 minutes after the meal row, so "1 min after eating" would be the logging gap (F5).
- **Lines must be derived at render, never stored.** 3 of 49 timing outcomes changed between first view and the settled record, and 2 printed lines changed: Jun 10, 6:40 AM was silent at first view because a free-choice arrangement for Jun 9 to 10 was live until it was soft-deleted on Jul 2, and now reads "2 min after eating"; Aug 8 read about 32 minutes (mid band) at first view and reads 4 minutes (rapid) after the back-fill. Counts at first view matched settled on all 49.
- **Sparse logging misleads the mid and long bands, not the rapid one.** In May and June the owner logged about 1 meal a day against about 7 treats (May 22 meals and 109 treats; Jun 31 and 212; Jul 88 and 210; Aug 174 and 0; Sep 139 and 2). 6 of the 7 mid-band bouts are anchored on a treat from those months, so they mean "after the last logged treat". A missing feeding can only make the true gap shorter than the logged one, so sparse logging can push a vomit into the mid or long band but cannot fake a rapid one.
- **Naming the food accuses the trial.** Since Aug 2, 10 of the 11 timed lines would name the diet-trial food (Royal Canin Selected Protein PR Dry). The 11th (Aug 8) would name Royal Canin Weight Care, off the active trial's list (trial active since Jul 26, 84 days, 6 allowed foods), rated "picked" and back-filled 3.4 days later. `lib/mealTiming.ts:433-437` says the timing claim deliberately does not blame a food identity, and `lib/spineNode.ts` names no food.
- **The refused-bowl disclosure almost never fires.** Only May 30 (447 minutes after a refused bowl) carries it, of 11 bowls rated Refused. It must stay in the copy as a safety disclosure; the mock is not designed around it.

### Counts and novelty

- **Counts.** Episode counts (3-hour collapse, `lib/symptomEpisodes.ts:100-113`) and event counts disagree on 10 of 49 seven-day lines and 26 of 49 thirty-day lines. 16 vomits fall before the record covers 30 days (before Jun 13). Since Aug 1 the 30-day range is 4 to 10.
- **Novelty is rare and fragile.** Presence-only novelty against the prior 42 days fires on 11 of 49 vomits with 15 lines, 6 of them warm-up artifacts. After warm-up it fires on 7 of 29 vomits with 9 lines (colour 4, liquid-only 2, hair 1, bile 1, foreign material 1). 5 of the 9 rest on an absence nobody saw (unread or "mixed" reads in the window, or an owner edit). Sep 22's "first foreign material on record" is true only because the owner edited the model's "yes" to "no" on May 18 and Jul 9; under the model's own values it reads "since Jul 9", and an "unsure" read sits in its own window. Sep 4's "first bile since Jul 23" clears the 42-day window by about 19 hours.

### The kinds that are real

| Kind (by the opener's shipped band) | Bouts | By month, May to Oct | Photo reads |
|---|---|---|---|
| Witnessed, within 30 min of a logged feeding | 16 | 1 / 1 / 4 / 4 / 5 / 1 | 15 reads; 14 with food, 3 with bile; 15 of 16 within 10 min |
| Witnessed, 30 min to 6 h | 7 | 1 / 5 / 0 / 0 / 1 / 0 | 6 reads, all with food, 4 with bile; 6 timed from treats |
| Witnessed, 6 h or more | 1 | May 30 | no read; the bowl before it was marked Refused |
| Found, time not seen | 20 | 5 / 6 / 5 / 1 / 3 / 0 | 19 reads, all with food, 6 with bile, 2 with hair |
| No feeding logged in the prior 24 h | 2 | May 14, 15 | |
| Same bout as an earlier vomit | 3 | not counted again | |

Bile is yes on 14 of 44 reads, 12 of them with food. Bile with no food occurs twice: Jul 18 (1 minute after eating) and Sep 25 8:10 PM (same bout). Hair appears three times (Jun 25, Jul 9, Jul 27; none since). **Only two kinds are real on this record**: food within minutes of eating (16) and found later with food in it (20). The kickoff's "empty-stomach bile, 6 h+" kind has zero instances, and hair is too sparse to be a kind. Bile does co-vary with the band (mid 4 of 6, found 6 of 19, rapid 3 of 15), but the n is tiny and the mid band is treat-anchored, so its meaning is unverified.

**The digestion field behaves like a default.** "Partially digested food" is on 41 of 44 reads: up to 10 minutes, partial 13 and no food 1; 11 to 30 minutes, partial 1; 31 to 120, partial 1 and no food 1; 121 to 359, partial 3, undigested 1, both 1; found, partial 15 and both 5. "Undigested" is on 0 of 15 reads within 30 minutes and 2 of 5 at 2 to 6 hours. Raw and current contents are identical on all 44, and the owner edited contents on none. Whether kibble vomited within minutes should look intact is a clinical expectation nobody verified (dry kibble softens and swells in minutes); no photo was viewed.

**What Bet 1 would print on the eight most recent vomits** (every anchor is the trial food; spoken minutes use the shipped formatter): Oct 9 2:53 PM, 1 min (true 0.3; should be the band), 1st in 7 days / 7th in 30; Sep 25 8:10 PM, same bout as 7:08 PM; Sep 25 7:08 PM, 20 min, 3rd / 9th; Sep 22 1:30 AM, 3 h 30 min, 4th / 9th; Sep 21 4:40 PM, 5 min, 3rd / 8th; Sep 17 5:11 PM, 4 min, 3rd / 8th; Sep 17 10:58 AM, 3 min (meal back-dated by hand), 2nd / 7th; Sep 12 12:18 PM, 5 min, 3rd / 6th. Four calm reads in a row would say "N min after eating" with N from 3 to 5. The counts above are bouts; §8 D3 settles the unit as vomits logged, and the mock's count lines are recomputed before round 2 (§10).

---

## §3 Clinical evidence

### What a vet asks, and who can answer

A vet's per-episode vomiting history has roughly nine questions (the count and the legibility table are the lane's own synthesis, not a sourced list). The features and their meanings are sourced: timing relative to eating, undigested food ("implies a gastric etiology") against chyme ("implies an intestinal etiology"), bile ("usually suggests only that the pylorus has permitted bile reflux"), blood and faecal odour (Washabau 2010, dvm360); Schoeman 2008 WSAVA Tables 1 and 2 (vomiting is "preceded by salivation, retching and abdominal contractions"); Armstrong 2013 ("forceful abdominal contractions (one of the most reliable ways to confirm vomiting)"; "if doubt remains ... asking the owner to video it").

| Question | Can the photo answer it? | Where else |
|---|---|---|
| Recognisable food | partial | |
| Bile | partial | |
| Hair | yes | |
| Plant | partial (species: no) | |
| Large worms | yes | |
| Obvious foreign objects | partial | |
| Blood | partial to low | |
| Timing and frequency | no | the log |
| Volume, odour, associated signs | no | |
| Effort or prodrome (heaving first) | no | nothing in today's record |

**C1 (holds).** Nothing in today's record answers the question that most changes the workup: effortful vomiting against passive regurgitation. The record holds witnessed against found, but nothing captures effort. Clinician's Brief (Gallagher, updated 2012): "Abdominal contractions (retching) or bile in the vomitus is specific for vomiting."

**C13 (holds).** Nyx's dominant kind maps to a known differential list. Immediate post-prandial vomiting "is usually suggestive of overeating, excitement" and oesophageal or hiatal disorders (Washabau 2010); Schoeman's "soon after eating" row lists acute gastritis, dietary indiscretion, overeating, food intolerance and oesophageal or hiatal disorder; WSU: "Regurgitation often, but not always, happens right after eating." Clinician's Brief adds that timing is "not distinguishing". The record cannot discriminate within the list without the effort fact. The "didn't see" default and the never-echo-excuses rule are design calls.

**C2 (amended).** Timing against the last meal does not separate vomiting from regurgitation (Armstrong 2013: "Be cautious in overinterpreting the timing"; Willard 2004: "many dogs will regurgitate hours, or even days, after eating"; Clinician's Brief 2012). The appearance of digestion is also unreliable: food sitting in the oesophagus "may look partially digested to many owners" (Willard 2004). So a server rule never infers regurgitation from timing, and crosses time with one "recognisable food present" atom, never the grade. The replay (§2) then measured what the kickoff data alone could not show.

**C3 (amended).** Bile in vomitus is a positive marker of vomiting rather than regurgitation (Clinician's Brief 2012; duodenal contents confirmed by bilirubin dipstick, Willard 2004). A photo sees only colour. A dense cylindrical hairball is also gastric in origin. Clinician's Brief does not say regurgitation is "never bile": its table marks bile "No" for regurgitation and "+/-" for vomiting.

**C5 (amended).** Recognisable food 8 or more hours after eating "would suggest" a distal gastric motility disorder or obstruction (Washabau 2010, dogs and cats); gastric retention is contents retained "eight to 10 hours after meal ingestion" (Jergens 2020). That is an expert clinical line, not a measured cutoff. In 10 normal cats fed 75 g of scrambled egg, solid half-emptying ran 210 to 769 minutes (median 330; Costello 1999). Schmitz 2014 (12 cats, blended canned food): t50 239 ± 28 minutes by breath test and 276 ± 59 by scintigraphy, and "gastric emptying is not complete at 300 minutes". Use 8 hours as the floor for printing the hours as a fact, never as a sign. For dogs, 12 hours is the more conservative alternative (total emptying 6.8 to 15 hours, Boillat via Deschamps 2022; marker T50 6.4 to 7.8 hours, Weber via Deschamps). WikiVet's dog figures are (unverified).

**C6 (amended).** The owner-facing Signal line "Recognizable food 6h or more after eating" (`lib/signalCopy.ts:1991`, rendered in `components/home/InsightCard.tsx:448`) counts food in a band inside normal feline emptying. Its own decision doc already lists ">8-10h" as the delayed-emptying line (`docs/nyx-signals-v2-longgaphours-decision.md` §2 table). The line reaches owners, not vets: `retainedFood` is consumed only by `lib/signalCopy.ts`, and the report carries L1's 6-hour timing band instead (`supabase/functions/generate-report/report.ts:3463`). Same value, different question means two constants (C-34). See §8 D6 and §9.

**C7 (amended).** Visible worms are a sound present-only descriptor. CAPC: adult ascarids "are often found in the vomitus of infected cats", and heavily infected pups "may expel a large mass of worms in vomitus at 4 to 6 months of age". Adult Physaloptera ("stout, pink to tan, 3-6 cm") "may be found in the vomitus", faecal flotation is "not considered an effective way to detect" them, and vomiting "may persist long-term even when only a few (1-3) adult worms are present". Prevalence: 17.0% pooled, 11.6% in pet cats, 27.7% in cats 12 months or younger (Rostami 2020, 143 studies); 7.2% in 670 Dutch cats over 6 months (Nijsse 2016). Absence never reassures. The routing rule (if worm against string is uncertain, route up to foreign material) and the "booked visit" disposition are team judgements.

**C8 (amended).** Plant material in cat vomit usually follows ordinary plant eating (Hart 2021: 71% of cats seen eating plants at least 6 times; 27% to 37% "frequently vomited" after). Lilies are the clearest case where identity makes it a call-now for a cat: "As little as 2 leaves or part of a single flower have resulted in deaths", and owners "cannot correctly identify the plants in their own homes" (Fitzgerald 2010). Early treatment works: all 25 cats treated within 48 hours survived (Bennett 2013); AKI in 52 of 112 treated cats, with 100% inpatient and 86.5% outpatient survival (Lam 2025). FDA CVM ("Lovely Lilies and Curious Cats"): kidney damage at about 12 to 24 hours, failure at 24 to 72, fatal in under 3 days; pollen or vase water alone is enough. Lily of the valley carries cardiac glycosides toxic to dogs as well (Fitzgerald 2010), so a plant line should not be lily-only for cats and empty for dogs. Plant has two schema homes today (`analyze-vomit/index.ts:93`, `:165`).

**C9 (amended).** Hair and hairball form are photo-legible, and hairball thresholds differ widely. Cannon 2013 (informal clinic polls, "no previously published data"): about 10% of shorthaired cats regularly produce hairballs, and frequent hairballs are, in most shorthaired cats, "an indicator of an underlying chronic disease". Norsworthy 2014 (one expert): twice a month or more in any cat, or once every two months or more in shorthairs, is a chronic small-bowel sign. Cornell: every week or two is "not uncommon", and frequent hacking may be another GI problem or a respiratory ailment such as asthma. CPAWS (Dowgray 2022; 206 cats aged 7 to 10, NW UK): hairballs in 77% of 130 vomiting cats, with no association with vomiting frequency (P=0.33). Counts only, never "normal". Owners describe hairballs as "coughing up" (Cannon 2013), and the app has a cough event (`constants/eventTypes.ts:101`), so a hairball form must require a visible mass.

**C10 (amended).** FCEAI (cats, Jergens 2010) and CIBDAI (dogs, Jergens 2003 via Rychlik 2012) band vomiting identically: 0 none, 1 mild (1/week), 2 moderate (2 to 3/week), 3 severe (more than 3/week). These are activity scores for diagnosed enteropathy, not triage thresholds. Owner visit thresholds: Cornell ("more frequently than once per week"); Teller, TAMU 2021 ("more than a couple of times per month", "no hard and fast rule"). Chronic means 3 weeks or longer (Armstrong 2013; ACVIM 2023, which also names weight loss the most common sign of feline chronic enteropathy). A human paediatric protocol counts heaves under 10 minutes apart as one episode (Schmitt-Thompson 2019); the app collapses at 3 hours (`lib/mealTiming.ts:245`). Nyx's ~2.3/week comes from raw logged vomits, not collapsed episodes. A falling count can reflect eating less, so a trend never stands without intake and weight (a team rule).

**C11 (amended).** The vet literature records owner normalisation in excuse words a kind label could echo. Norsworthy 2014: chronic vomiting is "so common that many veterinarians and cat owners have made excuses for it" ("He eats too fast", "It's just hairballs", "He's just a puker"). Norsworthy 2013 (JAVMA): these signs "should not be considered a normal condition... regardless of common explanations given by owners". Cannon 2013: hairball vomiting "is considered by many owners and veterinarians to be a normal feline behaviour". A Royal Canin release on a Bristol study of cats under 9 (14,380 surveys, 2,181 cats) reports vet attention was not sought for over 50% of owner-reported issues, perceived "as mild or recurring"; the underlying paper is (unverified). VetCompass: 3.2% of cats have vomiting recorded at a vet in a year (illustrative only beside CPAWS owner reports). The human label studies are weak analogs (Stack 2012; Martin 2026, low certainty), and a specific descriptor label could cut toward Dr. Chen's view as easily as the Designer's. Option B rests on the vet-literature normalisation, not on the label studies.

**C12 (amended).** Recurring kinds are facets of one chronic pattern. Norsworthy's cohorts (cats selected for chronic signs plus ultrasound small-bowel thickening, then full-thickness biopsy): 99 of 100 (2013) and 288 of 300 (2015) had chronic small-bowel disease. That is a pre-selected population, and Marsilio 2019 found similar histology in 19 of 20 healthy cats. The total should lead and the kinds should partition it.

**C14 (amended).** Species changes what several descriptors mean (lilies are cat nephrotoxins; unproductive retching with a distending abdomen is a GDV emergency in large deep-chested dogs, ACVS; ascarid masses are typical of 4 to 6 month pups, CAPC). Those belong in server rules. Buckley 2026 (Nat Commun) shows text drives multimodal predictions (o3 fell from 84% to 28% with a misleading vignette), but on human medical images. An accurate species token is untested either way.

**C15 (amended).** Form features transfer well to photos (puppy faecal scoring from photos against in situ: weighted κ 0.93, ICC 0.83; Chauvel 2026). Lay colour judgement can start poor and improve with training (caregiver-doctor κ 0.28 at 6 weeks, 0.74 at 10 weeks with a stool colour card; Upadhyay 2026, a human analog). The per-field ranking (hair form best, digestion grade worst) is a prediction to test, not a finding.

**C16 (amended).** Novelty carries clinical weight mainly for content with an attached disposition: blood, foreign material, worm-like, plant in a cat, hairball burden. Bile is common and non-specific, not meaningless (Schoeman lists it under enterogastric reflux, pancreatitis, IBD, intestinal foreign body and metabolic disease).

**C4 (holds).** The 2026-08 signals brief's "moderate agreement classifying owner videos" citation is a seizure-video study (Packer 2015; §9). No vomiting-specific inter-observer study was found.

**D1 (unverified).** The large "unsure" bucket on foreign material may absorb content the schema has no field for (worms, plant, hair). The unsure reads were not inspected. On Nyx's own reads the counts are foreign material 7 and blood 2 (§9).

---

## §4 The model and the API

Prices are from the live pricing page (platform.claude.com/docs/en/about-claude/pricing), fetched 2026-10-11 and confirmed by the verifier. Per-read costs are estimates: nothing was measured with `count_tokens`, because no API credential existed in the environment, and output tokens (about 350 today, more with thinking) are assumptions.

| Model ID | Input / output per MTok | One photo | Three photos | Role in the eval | Constraints that matter |
|---|---|---|---|---|---|
| `claude-sonnet-4-6` | $3 / $15 | ~$0.016 | ~$0.025 | baseline | accepts a non-default temperature; standard image tier |
| `claude-sonnet-5-5` | $2 / $10 | ~$0.015 | ~$0.025 | likely default, effort low | forced `tool_choice` returns 400; default temperature only |
| `claude-haiku-5-5` | $0.10 / $0.50 (prompts up to 100K tokens) | ~$0.0008 | | cheap arm, effort low or medium | accepts forced `tool_choice` but then skips thinking; temperature 1 and top_p 0.99 only; no server-side fallback, and a `fallbacks` list returns 400; image tier (unverified) |
| `claude-opus-5-5` | $4 / $20 | ~$0.035 | ~$0.055 | ceiling arm at effort medium (its API default) or high, never low | forced `tool_choice` returns 400; rejects the temperature field; cannot turn thinking off |

The newer models use a tokenizer that counts about 30% more tokens for the same text ("Claude 4.7 and later models"). Pick the model on eval results, not price.

**M3 (amended): a plain model-ID swap breaks every read silently.** The shared call hardcodes `tool_choice: {type: 'any'}` (`incident-analysis.ts:1396`), which Sonnet 5.5 and Opus 5.5 reject with a 400, including on `count_tokens` and Batches. The pipeline maps any "Claude API error 400" to `photoUnreadable` with only a `console.warn` (`:2073-2075`), so every vomit and stool read would show "couldn't read the photo". A refusal (HTTP 200, no `tool_use` block) parses to null (`analyze-vomit/index.ts:228-230`) and lands as a failed row with a Try again button. With adaptive thinking on by default on all three new models, `max_tokens` 1024 (`:1172`) can be exhausted. The model is already per descriptor (`analyze-vomit/index.ts:938`, `analyze-stool/index.ts:959`); only `tool_choice` and `max_tokens` are shared constants. The bundled claude-api skill's structured-outputs model list omits `claude-sonnet-4-6`, while the live page includes it; a later session reading only the skill would wrongly conclude the first PR cannot ship on the current model. Every other Claude call site also forces a tool: `ask/index.ts:240`, `extract-food-from-photo/index.ts:688`, `extract-medication-from-photo/index.ts:306`, `generate-signal/index.ts:234` and `:303` (forced `tool` on Haiku 4.5). Sonnet 5.5 can refuse under `general_harms`, and server-side fallback retries only `cyber` and `frontier_llm`; the eval must report the refusal rate on blood photos.

**Fallback policy is a decision, not a default.** A fallback turn would be served by an unevaluated model. Choose explicitly: no fallback with an honest unreadable state, or fallback with `response.model` stamped and the fallback model evaluated too.

**Latency.** Today Sonnet 4.6 runs without thinking; all three new models think by default. Structured-output grammars compile on first use and are cached 24 hours from last use. The fetch aborts at 30 seconds (`http.ts:18`) while the pipeline's own comment calls the vision call "10-60 s" (`incident-analysis.ts:2098`), and a timeout becomes a failed row. Measure p50 and p95 per arm with 3 photos.

**M2 (amended): what the model sees.** Uploads are 1600 px JPEGs at quality 0.75 (`lib/storage.ts:10`, `:17`). Sonnet 4.6 (standard tier) downscales a 1600x1200 photo to about 1269x952 (1,564 visual tokens). "Claude 4.7 and later models" (high-res tier, 2576 px, up to 4,784 tokens) read the full 1600x1200 (2,494 tokens). The Ask live-read path always re-fetches through the Storage transform at 1568 "contain" (`ask/index.ts:559`; `incident-analysis.ts:1253-1264`), so on a high-res model the same photo is about 2,352 tokens via Ask and 2,494 via the detail screen: two inputs under one stamp. The `DOWNSCALE_EDGE_PX` comment is imprecise on the standard tier and wrong on the high-res tier. Make resolution an explicit, stamped parameter. Do not raise the 1600 px upload cap unless the eval shows a red-flag gain.

**M4 (amended): determinism without temperature.** Among the four arms only Sonnet 4.6 accepts a non-default temperature, and `temperature=0` "never guaranteed identical outputs". Today temperature is unset (1.0), so every re-run is a fresh sample that can flip a verdict (`docs/research/2026-09-engines-source-maps.md:442`, `:659`, `:716`). Use adaptive thinking, explicit effort low, `max_tokens` sized for thinking, non-streaming. Fix the re-roll in the product (§8 D14). `thinking: {type: 'between_tools'}` is an option on Sonnet 5.5 at effort high or below; its combination with `output_config.format` is undocumented.

**M5 (amended): confirm before alarm.** When a red-flag field is present or unsure (about 25% of reads in the kickoff aggregate), run 2 to 4 more reads of the identical request. Once read 1 (sent with `cache_control`) returns, its cache entry is readable, so reads 2 to 5 can run in parallel and all hit the cache. Expected cost on Sonnet 5.5: about $0.006 to $0.009 per read on average, and $0.015 to $0.028 extra when it fires. Haiku 5.5 confirmers under a Sonnet 5.5 read cannot share its cache (caches are model-scoped) and would measure cross-model agreement, not re-read stability. The aggregation rule is a clinical call; disagreement routes to "we couldn't tell" with a safety net, never to silence. The Sonnet 5.5 cache-read price is $0.10/MTok on the live page and $0.20 in the bundled skill; re-check before quoting budgets.

**M9 (holds): a schema with no model prose on a calm read.** Drop `read_text` and `description`; turn `foreign_material_note` into an enum. Add a present-only `observations` array of `{kind, certainty: clear | possible}` plus `photo_conditions` (dim, blurry, patterned surface, partial view, more than one pile). Kinds named descriptively: `tube_shaped` (never "regurgitation"), `hair_mass` (requires a visible mass) and `loose_hair`, `worm_like_strands` (uncertain worm against string routes up), `string_or_thread` (never a lookalike), `object_beside_not_in_vomit` (EN-6), plant material, `intact_kibble_pieces`. Keep blood tri-state so "None visible" still renders. Hairball and foreign material stay independent. Give bile and plant one schema home each before any agreement is counted. Noise to leave out: relative volume, freshness, finer colour shades, any syndrome-like label. Structured outputs reject `minimum`/`maximum` and `minLength`/`maxLength`, require `additionalProperties: false`, put required properties first, allow at most 24 optional parameters and 16 union-typed ones, and allow `minItems` of only 0 or 1. The confidence object's `minimum`/`maximum` (`analyze-vomit/index.ts:191-202`) would 400, since the repo calls the API by raw fetch. Grammars apply only to the final output, not thinking. Open clinical call: today a model-only escalation carries its own words; without prose it needs an enum reason plus a server template, or the path retires (GAP-31).

**M14 (holds): retire `ai_confidence`.** Verbalised confidence runs overconfident (Xiong, ICLR 2024; Savage, JAMIA 2025, where sample consistency did best at AUC 0.68 to 0.79). Agreement-based abstention took GPT-4o from 51.7% to 76.3% on retained questions (Wienholt, Eur Radiol 2026). Check once whether a field's confidence predicts an owner edit, then store per-field repeat-read agreement. The "unsure" enum stays as the abstention primitive.

**M15 (holds): the stamps miss what an upgrade changes.** `prompt_hash` covers only `[systemPrompt, tool, userMessageText]` and `model_id` is the requested model (`supabase/functions/_shared/engineStamps.ts:119-136`; columns in `supabase/migrations/075_engines_v3_stamps.sql:172-177`). Also outside the hash: `tool_choice`, `max_tokens`, the transform path; `photo_set_key` keys attachment ids, not bytes. Hash the whole request except the image bytes (output config, effort, thinking, `max_tokens`, the transform spec, any reference-set hash) and stamp `response.model`.

**M11 (holds): a stability gate across bets.** A field feeds a count, kind or dated fact only if its most common answer holds on at least 90% of 5 re-reads within one stamp (a starting point for the Data Scientist). No per-field re-read agreement has ever been measured. Reads written before migration 075 carry a null `model_id`, so most of Nyx's history is one unknown stratum.

**M13 (amended): the eval plan.** Gold labels from a blinded PM pass plus a vet pass on the escalation fields, over every unique photo deduplicated by content hash (demo-seed copy excluded): roughly 44 to 60 photos, which puts a Wilson 95% half-width near ±10 points. The owner-edit pairs are disagreement evidence, not truth (Nyx has 3 edits on 44 reads, none to contents). Sensitivity claims need sourced positives: by the rule of three, about 30 positives to claim a miss rate under 10%. Each arm runs 5 reads per photo; 2,000 calls cost about $33 at standard rates or $17 through the Batch API; with the reference and species arms the total stays under $100. Batch rejects forced `tool_choice` on Sonnet 5.5 and Opus 5.5 and rejects the `fallbacks` parameter. Ship rule on a held-out split: no gold positive lost; false blood plus foreign-material rate no worse; core-field agreement within 5 points of baseline; per-field re-read agreement no worse; unsure rate up by no more than 5 points; no refusals or parse failures. The hazard pass narrowed the non-regression gate to undisputed or vet-confirmed positives and added a per-field false-positive budget (§6). The photo export is a service-role read under C-27 and needs the `rls-privacy-reviewer`.

**Per-account ceiling.** `record_ai_usage` runs once per invocation (`incident-analysis.ts:1929`), so confirmation reads cost no extra cap units, but every "Re-run analysis" press does. At the cap (10 a day, 200 a month, identical on free and premium, `docs/monetization-and-throttling-requirements.md:161`) the worst case is about $5 a month on Sonnet 4.6 or 5.5 with 3 photos, about $7.4 with 4 confirmers, about $11 on Opus 5.5 ($16 with confirmers), and about $35 if every read carried a cold 19k-token Opus reference block. Haiku 5.5 stays under $0.40. "Under $1 a month" is true for Nyx at about 9 reads a month only. The cap cannot be paywalled (Pets > $), so state the ceiling.

**M6 (holds) and M7 (holds): reference images, if ever.** A set of about 16 fixed images (about 10 targets and 6 lookalikes) at 768x576 (588 tokens) or 1092x819 (1,170) is about 10k to 19k tokens. Images cannot go in the system prompt, so they lead the first user turn with a cache breakpoint. On Sonnet 5.5 the 19k version costs about $0.048 for a cold 5-minute write, $0.076 for a 1-hour write and $0.002 for a warm read; Haiku 5.5 $0.0024 cold; Opus 5.5 $0.095 cold and $0.004 warm. Above 20 image blocks a stricter per-image limit applies, and changing `output_config.format` invalidates the cache. Risks: "Concrete examples are the strongest signal in a prompt" (claude-api skill, `prompt-audit.md:101`); captions are text that steers images. Pattern 3 says the model "only sees the single photo plus its system prompt" (`.claude/skills/clinical-guardrails/SKILL.md:91`), already loose since up to 3 photos are sent (`incident-analysis.ts:1170`), so references need a written amendment. Licensing options for the PM and Trust & Safety: staged in-house lookalikes (cannot stage true blood or worms), vet-partner images under a licence that covers sending them to a model API, CC0 or CC-BY, and never another customer's photo without explicit consent. Licence terms are (unverified). §8 D9 defers all of this.

**M8 (holds): species.** Do not pass it yet: no measurable benefit on one cat's photos. When dog photos exist, test no species, true species and wrong species; ship only if true species improves agreement and the wrong-species arm flips under about 5% of red-flag and hair fields. Species already reaches `computeContextualFlags` (`incident-analysis.ts:2100`) but not the vision call.

**M12 (holds): no fine-tuning.** The claude-api skill documents no fine-tuning surface; a historical Bedrock fine-tuning path is (unverified).

**M10 (unverified).** That the digestion grade is a model default rather than a true appearance could not be settled; the replay (§2) measured the pattern, and the clinical expectation remains unverified.

**Smaller items.** The multi-photo call sends the singular "Analyse this photo of pet vomit." (`analyze-vomit/index.ts:941`) with no "Image 1:" labels, which the vision docs recommend. `MAX_CLAUDE_IMAGE_BASE64` = 5 MB (`incident-analysis.ts:1153`) is half the API's documented 10 MB limit; harmless.

---

## §5 Prior art (searched 2026-10-11; web search, not app installs)

Every absence claim below comes from web search, and most competitor claims are marketing. Re-verify at use (§10).

| Product | What it does, as of 2026-10-11 | Grade |
|---|---|---|
| Furbo AI Health Checker | Single photo inside Nanny Chat; "three possible diagnoses with confidence levels", asks questions "until it reaches a 70% confidence level", stool example "Normal stool, mild dehydration (80% confidence)", "home remedies and purchase links"; scope includes vomiting. Help article created 2024-10-03, updated 2026-07-31. Which subscription tier includes it is (unverified). | verified text |
| Furbo 360° Cat Camera Vomit Alert | Camera detection of cat vomiting, inside the paid Cat Nanny subscription since September 2023. | Furbo blog 2023-09-19 |
| Yipara | Cat-vomiting page names types including hairball and undigested food, called "technically regurgitation"; promises "possible causes, severity assessment"; Amazon affiliate products. Vet cost estimate and telehealth appear on its dog sample report. No history described; an undescribed "My Pet Profiles" link. | verified text |
| PETKIT | Blog dates a camera-based cat vomit detection announcement 2026-07-02, "expected" in July, placing each event "alongside their feeding and drinking history for that day". Shipment unconfirmed: the Play listing updated 2026-09-26 does not mention vomiting. Kitbo assistant ("using each pet's actual history") and FunFit camera announced 2026-08-18, "coming". AI litter boxes claim per-cat learned habits with stool-consistency alerts. | marketing |
| Tend & Mend | iOS "Cat Food & Vomit Tracker", released 2026-04-10 (v3.0 on 2026-10-01): links each logged vomit "back to the most recent meal automatically", a 4-week vomiting program, an ingredient association engine ("association, not cause"), vet report export. No photo AI. Premium gates the vet report and pattern analysis. A community tab compares how often cats vomit across users. | App Store text |
| Petalife | Hong Kong, App Store July 2025 (v2.3.5 on 2026-10-09), about 10,000 users: AI reads of vomit, stool and urine photos, a daily log, alerts on "something unusual", "the more you log, the smarter the AI". Whether any read uses history is (unverified). | marketing |
| Poopy | Pre-launch: dog stool photos plus a "Personal Pattern" baseline from saved history, a "What Changed?" view, a PDF report. | marketing |
| Ollie Health Check-ins | Ollie acquired DIG Labs (TechCrunch, 2024-10-03), which shut its Health Check app; Ollie's vets and vet techs review photos with a per-screening rubric, feedback within 24 hours; a "New Food Check In" for diet transitions. An 85% parasite-from-photo patent claim is trade press only. | verified |
| Cylinder Health (human) | Acquired Dieta Health (2025-03-20); Stool Scan photos "reviewed alongside food intake, symptom tracking" by a care team; markets itself as "clinically validated". | vendor page |
| Kohler Dekoda, Throne One (human) | Longitudinal stool tracking with a percentage "gut health score" (Kohler, $599 plus about $7 a month) and "see your baseline, notice meaningful shifts" framing; Throne: Bristol class, frequency, "a general wellness device", $6 a month. Kohler's blood notice is (unverified). | press |
| Long tail | Dog Poop Health Check and PoopBuddy (scalar 0 to 100 score, weekly trends, a vet PDF); solo-developer scanners (single-photo flows); CompanAIn (GA February 2026, a health timeline, no vomit read); Petcube (March 2026 relaunch, an assistant using the pet's "profile, Health Check, and history", no photo read). | marketing |

**What this means.** No pet product verified here states a per-read line that sets a new vomit photo against that pet's earlier reads. But "first in category" is unproven for Bets 1 and 3: several products market history-aware reading, Tend & Mend already links each cat vomit to the most recent meal, and Furbo has shipped camera vomit alerts since 2023. Nyx's defensible differences are honest timing (refused bowls never anchor, silence when it cannot time), descriptor naming, no baseline language and keeping it free. Human stool products went longitudinal, but with a scalar score and baseline-shift framing that Pattern 1 forbids, and a baseline design is silent on a record that has been bad since day one.

**Clinical precedents for named kinds (P8, holds).** The NINDS seizure diary assigns each seizure type a code with staff ("each seizure type will be assigned a special code", A to F, with a "No seizures" box per day and "Bring the seizure diary with you to every appointment"); physicians assign the codes against a seizure classification. Dexcom Clarity names "up to four patterns" by time and direction, dates every occurrence, marks resolved ones with "strikethrough green text and a checkmark" and shows a "Best Day" (an old guide; current UI not re-checked). Apple Cycle Tracking names deviations over six months and asks the person "to verify their logged cycle history" before saving one. Every precedent uses a neutral or descriptive name tied to dated occurrences, and none names a "usual". Drop Dexcom's "resolved" and "Best Day".

**Owner behaviour (P7, holds; P11, holds).** Owners already excuse cat vomiting (Norsworthy 2014; his series of 100 cats with chronic GI signs found 49 enteritis, 50 neoplasia, 1 normal). Owners' perceived urgency was lower when they had seen a sign before (Wallis 2024, 633 owners of senior dogs; applying it to cats is an inference). Labels move behaviour both ways: a "GERD" label raised parents' interest in medicating even when told it would not work (Scherer 2013, 175 parents). Descriptor wording sits between medicalising and normalising.

**Photos for clinicians (P10, amended).** Packer 2015 rated 100 owner videos and analysed 83 (κ 0.40 for epileptic seizure, 0.31 for focal type) and advised against using them "in isolation of other clinical data". Adding smartphone video to history raised correct diagnoses from 78.6% to 95.2% (Tatum 2020, n=44, wide CI 1.01 to 54.3). In an urticaria clinic, physicians reviewed "up to three" patient-selected photos; 86% were useful (Ali 2024, n=148). A bare grid of 49 photos is the weak form; one representative photo per row matches clinical habit.

**Novelty logic (P9, amended).** Dermatology's "ugly duckling" sign judges a lesion against the same person's others (Scope 2008: 34 raters flagged 5 of 5 melanomas and 3 of 140 benign lesions). Miiskin's automatic photo comparison rests on most melanomas appearing as a new mark (coverage dated; 2026 availability unverified). The logic has a reassuring inverse ("like her others"), which Nyx forbids.

**Reference images elsewhere (P12, holds).** GPT-4V with a few labelled in-context examples matched or beat specialist networks on three histopathology tasks (Ferber 2024); pathology slides are not phone photos of vomit. No pet competitor found publishes per-field validation.

**Free over time (P13, holds).** Competitors charge monthly for the over-time layer (Kohler, Throne, Whisker+, Furbo, PETKIT CARE+ "extended data history", Tend & Mend Premium). Bets 1, 3 and 4 are deterministic, so keeping them free under Pets > $ is cheap.

---

## §6 The adversarial pass

The hazard lane's package verdict: **as drawn, the package FAILS**, with at least six QUIET breaks (breaks that can soften, drop or delay a warning). Every break has an amendment, so the direction survives. The independent reviewer then checked each break and amended 15 of 24, mostly by finding that an amendment created a new miss. Both rounds are recorded.

### Bet 1

| Hazard | The counterexample | The lane's amendment | Second reviewer |
|---|---|---|---|
| H1 novelty implies "nothing new" (QUIET) | Monday's read says "First bile seen since Aug 28"; Thursday's identical pile has no line, so the owner learns no line means she is fine. | Make EN-4's watch-for list the forward-looking element; put dated history on every present field; widen the reassurance regex. | **Amended.** The watch-for list has no intake clause (`lib/incidentFloorWords.ts:179-181`, [CUL-1609](https://linear.app/projectnyx/issue/CUL-1609)) and its clauses expire, so replacing the template drops the only intake cue on a calm cat read. Dated history on every field is option A's familiar label at field level, which no word filter catches. Keep the template's sentence verbatim; no novelty or history on the read in v1. |
| H2 novelty over unread vomits | 9 vomits Aug 28 to Sep 4: 4 no photo, 1 failed, 1 unsure, 3 no. "First bile in six weeks" claims an answer 6 of 9 never gave. | State a dated fact over reads; disclose the unread count. | **Amended.** The presence leaves cannot tell "unsure" from "no" (`lib/vomitContents.ts:85-92`); use L3's answered fold (`photoComposition.ts:22-26`). Belongs on the profile. |
| H3 many fields, read noise | Across 11 colours, 8 contents and 6 consistencies, some field is "first since" by chance; a model change floods "firsts". | A short fixed list; never across a stamp seam. | **Amended.** The list included plant and worms, which H4 and H13 forbid; a "first" within one stamp is false after every model change; pre-075 reads are one stratum. No novelty on the read at all. |
| H4 history beside a red flag (QUIET) | "Blood also seen Jul 14" softens a new blood call. | History goes to "What to tell them" and the report only. | **Amended.** The example fails (the owner downgraded Jul 14 to "unsure", so a structured-field line would never print it); the class holds. "What to tell them" renders only with EN-3 on. |
| H5 timing via mealTiming | Food naming accuses; a vomit logged before its meal re-anchors on last night's dinner and reads "6h or more". | Name the meal by time; suppress the line when a "now"-source meal was created within ~60 min after the vomit. | **Amended.** The late tap understates the gap and leans benign, so it is not LOUD; disclose "times as logged". The 60-minute threshold is a placeholder for Dr. Chen. |
| H6 unrated anchor (QUIET) | A refused, unrated breakfast; the vomit 25 min later reads "25 min after eating" beside partially digested food. | Say "after the meal logged at 7:00". | **Holds.** Needs a better-than-the-rule brief (§8 D4). EN-5 is seeded off (`supabase/migrations/097_intake_checks.sql:302-305`). |
| H7 counts without the floor (QUIET) | A kitten with two vomits while EN-4 is dark: "Keep an eye out" beside "2nd in 24 hours". A chained-episode count says "1 today" for a dog retching every 10 minutes. A read opened later counts back from today. | Render only where `floorRanOn` (`lib/incidentFloorWords.ts:88`); unit is vomits logged; never lower than an engine count; anchored at the vomit; one count per page; under a call, inside "What to tell them". | **Amended.** Today's repeat rule fires at 2 vomits within 4 hours (`supabase/functions/_shared/vomitRepeat.ts:14-17`), so the kitten case needs the two vomits more than 4 hours apart. Add "{n} more logged since" on an older read. EN-3 and EN-4 are unseeded (`supabase/functions/_shared/engineFlags.ts:30-41`). |
| H8 low counts read as rare (QUIET) | The owner is away for a weekend; Monday says "2nd in 7 days" when the truth is 6. A dog's first productive vomit after unlogged retching reads "1st in 30 days". | No "1st", zero or rarity; print from 2; disclose unlogged days. | **Amended.** "2nd in 30 days" still reads rare. No 30-day or longer counts on the read. |

### Bet 2

| Hazard | The counterexample | The lane's amendment | Second reviewer |
|---|---|---|---|
| H9 digestion by time (LOUD and QUIET) | Nyx eats another cat's food unlogged at 02:00 and vomits food at 07:00: "11 h after eating", and the vet chases imaging. An unrated refused breakfast hides retained food in the rapid band. | Logging-eligibility guard; 8 h not 6 h; no crossing after a late-created meal; words "Food was visible; the last logged meal was at 8:00 PM"; present-only; report first; multi-pet disclosure. | **Amended.** Add: afterRefusal and refused-only bouts never get the line and route to intake. The long-band "partially digested" rate is unmeasured. |
| H10 reference images | Lookalikes labelled "not blood" teach under-calling; "hair and plant stems" teaches string as hair. | Presence-only exemplars; lookalikes in the eval; a present-wins union of two prompts; a leakage test. | **Amended.** Presence-only exemplars push over-calling (Zhao 2021, verified) on a record where 3 of 4 photo flags were disputed. Drop the present-wins rule; add a false-positive budget; amend Pattern 3 first. |
| H11 owner edits as the eval (QUIET) | The pairs are selected on disagreement, so the best "agreeing" model calls less blood and foreign material. | Score descriptor fields only; a no-present-call-lost gate; a vet-labelled set. | **Amended.** The gate blocks EN-6 ([CUL-1137](https://linear.app/projectnyx/issue/CUL-1137)), whose purpose is to drop objects beside the vomit (the 5/18 toy ball). Gate on undisputed or vet-confirmed positives only. |
| H12 species, naming, upgrade seams | A "cat" token may prime hairball reads; a field named "regurgitation" primes the label. | Descriptive names; independent hairball and foreign fields; present-only; one stratum per stamp. | **Holds.** Species text also needs a Pattern 3 edit. |
| H13 plant (QUIET, lethal edge) | A lily bouquet at home, plant in the vomit, a profile saying "Plant material: 4 since June". | Lily question on every cat plant read; plant never joins a group. | **Amended: live today.** `grass_or_plant` is already a token (`analyze-vomit/index.ts:93`), nothing handles lilies, and T18 is unbuilt, so a cat's plant read shows the calm template now. Pollen or vase water leaves no plant in the vomit, so absence never informs. Filed separately (§8 D12). |

### Bet 3

| Hazard | The counterexample | The lane's amendment | Second reviewer |
|---|---|---|---|
| H14 a familiar label normalises a worsening (QUIET) | "After a meal: 31 since June" while the rate goes from 2 a week to daily. | Lead with the total; count pairs under the Change Contract (`docs/nyx-signal-home-requirements.md:51-66`). | **Holds.** |
| H15 a first obstruction sign is absorbed (QUIET) | An obstructing cat's first vomits are food 25 min after a meal: the 20th "after a meal". | Partition every vomit; red flags never join a group; derived at render (`lib/incidentPattern.ts:5-10`). | **Amended.** Parking red flags in "didn't fit a group" buries them. They lead in their own row, named by finding. |
| H16 steady profile, falling weight (QUIET, on this record) | Nyx herself: 4.4 to 3.73 kg (−15%) while the vomiting was steady in kind. | The profile cannot render without a weight line. | **Amended.** The line cannot show her loss: the June reading was overwritten on Sep 16, before migration 072 kept displaced weights; 072 has no reader until EN-8 ([CUL-1135](https://linear.app/projectnyx/issue/CUL-1135)). Say "One weigh-in on file (3.73 kg, Sep 16), so there is nothing to compare it with yet". |
| H17 empty-stomach group relabels intake decline (QUIET) | Refused bowls never anchor, so vomits after a refused dinner move into the long band. Nyx's September bile vomits fell inside a logged cough course. | afterRefusal and refused-only route to intake; cough disclosure on bile, foam and hair rows. | **Holds.** |
| H18 timing groups by chance | A grazer with 10 logged meals a day sits within 30 minutes of one about 21% of the time. | A timing group appears only while the Signal's matching lane fires. | **Holds.** |

### Bet 4 and R3

| Hazard | The counterexample | The lane's amendment | Second reviewer |
|---|---|---|---|
| H19 report page | A vet reads "empty-stomach bile" as bilious vomiting syndrome; a per-row "no blood" is a forbidden 0 of N (`report.ts:1744`); photos compete for `MAX_EMBEDDED_PHOTOS = 40`; a band word over-trusted; "Hairball" inherited. | After the safety band; descriptors and counts; no absence columns; one photo per row by rule; no band word; relabel "Hair". | **Holds.** |
| H20 "What did the vet say?" against a kind (QUIET) | "Vet said it's just hairballs" stored against the hair group launders a folk explanation into the record. | Per sign, never per group; never in the report or Ask. | **Holds.** Care state is keyed by one sign (`docs/nyx-care-state-requirements.md`). |
| H21 R3 option A | Oct 9: "Keep an eye out" beside "the after-breakfast kind, 20 since June" reads as "her usual". | Do not adopt A. | **Holds,** with a dependency: K2's door is dark until EN-3 is seeded ([CUL-1407](https://linear.app/projectnyx/issue/CUL-1407)). |
| H22 R3 option B | Inherits H1 and H14 to H18. | B with conditions. | **Amended to B-prime:** no novelty on the read; timing line, EN-4-gated count, the kept template sentence, K2 once live. |
| H23 R3 option C | The vet sees "Hair: 9" built on groupings the owner never saw. | State that groups are automated. | **Holds.** B preferred. |
| H24 model words | Could a record line carry model prose? | Deterministic lines keep Pattern 10 intact. | **Amended.** True, but the stated reason was wrong (§9). The reopened 2026-07-17 rule still bites any calm-read line that names a benign-reading finding. |

### What the reviewer added

- **Ask is a third audience.** Ask's tools already hand per-read contents to a model (`supabase/functions/ask/tools.ts:883-936`). If Bet 3's labels or history lines reach Ask, Ask's model can write "her usual after-breakfast kind". Keep groups out of Ask's tools, or give Ask the same vocabulary veto with a test.
- **Bet 1's safe form depends on dark flags.** EN-3 and EN-4 are unseeded, EN-5 is seeded off, K2 is dark until EN-3. These flips come before any Bet 1 count or door, which pushes the R4 timeline.
- **Wallpaper can return.** A timing line and a count on every read can become as identical across 50 reads as the template is today. Measure with the replay before claiming a 10x.

**DoD line (Biostatistician / Dr. Chen), verbatim in substance:** tried a novelty line over unread vomits (asserted absence, FAILED until rephrased; then dropped from the read); a kitten with 2 vomits more than 4 hours apart while EN-4 is dark (a count beside "Keep an eye out", QUIET, FAILED until gated on EN-4); a refused-dinner cat whose vomits fall into the empty-stomach group (FAILED until afterRefusal routes to intake); Nyx's steady phenotype during a 15% weight loss (FAILED until the profile carries a weight line, which itself needs EN-8 to show the loss); the found-pile timing line stays silent under the strict-witnessed rule (held).

---

## §7 The four bets, re-scored

### Bet 1 · This one, in context

**Verdict:** build with amendments, narrowed, after 1.2.0 clears review, with the count line behind the EN-4 floor.

**What changes:** a record line computed at render, never stored. A timing line from `lib/mealTiming.ts` that names the meal by its time, never its food; silent on found, estimated and same-bout vomits (saying "Same bout as the 7:08 PM vomit" where that applies). Once EN-4 runs for the pet, a 7-day count anchored at this vomit, plus "N more logged since" on older reads. The K2 "Part of a pattern" door once EN-3 is live. Bile present-only in the grid. The calm template's forward-looking sentence stays word for word. No novelty lines, no kind names, no 30-day counts. Frames F2, F4, F5.

**Amendments:** derive at render (R6); timing only through the shipped predicate, afterRefusal disclosure always printed when true (H5, R14); meal named by time (R10); speak the band when meal and vomit were logged together or the meal was back-filled, and disclose times are as logged (R5); "after the meal logged at 4:35 PM", not "after eating", on an unrated anchor (H6); suppress after a clock-stamped meal created within about 60 minutes after the vomit (placeholder for Dr. Chen); "after the last logged feeding" on the mid and long bands (R7); counts only where the floor ran, in vomits logged, from 2, with un-logged days disclosed, never lower than an engine count, one count per page (H7, H8); under a call tier the count goes in "What to tell them"; keep "If it happens again, or {pet} seems unwell or goes off food, your vet is the best call" until [CUL-1609](https://linear.app/projectnyx/issue/CUL-1609) or EN-5 gives the watch-for list an intake clause (H1); widen Pattern 8's reassurance vocabulary to usual, typical, same as, as always, like before, nothing new (H1, H24).

**Gates:** EN-4 live for the pet before any count; EN-3 before the door (both unseeded, `supabase/functions/_shared/engineFlags.ts:30-41`); CUL-1609 or EN-5 before the template's intake sentence may retire; rulings D1 to D5; Dr. Chen on the late-tap threshold; `nyx-voice` and `clinical-guardrails` on every line; R4; the lily gap filed first.

**Size:** about 3 PRs, client only, no migration: a pure lib module (real-function fixtures, non-UTC zones, per C-34, C-35, B-514); the render in `IncidentReadCard` / `VomitAnalysisSection` plus present-only Bile; the widened Pattern 8 guard. Preceded by the EN-4 flag flip (config, not code).

### Bet 2 · A photo read that answers a vet's questions

**Verdict:** build with amendments, measurement first. Drop the digestion-by-time crossing; defer reference images and species.

**What changes:** first the engineering prerequisite (structured outputs, `stop_reason`, stamps, on the current model), then the EN-2 eval with gold labels, then a v2 schema of present-only descriptors with no model prose, then one server crossing (recognisable food present at 8 hours or more after the last logged eaten meal, behind eligibility guards, reported first on the vet report). The model choice comes from the eval. Nyx has zero eligible instances of the food crossing today, so her owner-visible gain is the new descriptors, not timing.

**Amendments:** PR 0 as in §1 Q2 item 1, plus the call-site guard test; full-request hashing including the Ask transform path; schema v2 per M9; collapse the digestion grade for any time crossing; the crossing needs its own 8-hour constant, a witnessed onset and an eaten anchor, no afterRefusal or refused-only bout, no free-fed span nearby, meals logged on every day of the prior 7, and no clock-stamped meal created within about 60 minutes after the vomit; words "Food was visible; the last logged meal was at 8:00 PM", never "retained", "delayed emptying" or "N hours after eating" on owner screens; multi-pet disclosure; eval per H11 and H10 as amended; the 90%-of-5 stability gate; repeat reads only on present or unsure red flags; re-run returns the stored read unless a stamp changed; species drives server rules (lily for cats, bloat for dogs, age-weighted worm reads); explicit fallback policy and per-account cost ceiling.

**Gates:** D8, D9, D10; the vet-labelled set ([CUL-1312](https://linear.app/projectnyx/issue/CUL-1312)) before any change that could lower blood or foreign-material calls; EN-2 built, coordinated with EN-6; Dr. Chen on the 8-hour constant and the stability threshold; `rls-privacy-reviewer` and C-27 scoping for the photo export; any schema change in its own PR with the Migration Safety Pre-flight.

**Size:** about 6 PRs, mostly server: PR 0 structured outputs (vomit and stool together); PR 1 stamp extension (the 075 columns exist); PR 2 the eval harness (scripts, service-role read); PR 3 schema v2 (a migration if new fields get columns; unverified whether they need them); PR 4 server and client wiring; PR 5 the food-at-8h fact (report first); then a config-only model change after the eval.

### Bet 3 · Her vomit over time

**Verdict:** build with amendments, after Bet 1 and after EN-8's weight history.

**What changes:** a profile screen derived at render, storing nothing, plus an album. It leads with total vomits logged and a count pair, then a weight line and an intake line. Below them, rows partition every bout and sum to the total: a leading row for reads the photo read flagged, then descriptor-named timing and content rows, each with a count and a last-seen date. Each album photo carries its date, its timing line and its count. On Nyx's record only two real kinds exist (16 within 30 minutes; 20 found). Frame F7 draws it with true numbers.

**Amendments:** lead with the total; trends only as count pairs, no "steady", "quieter" or "improving", a rising pair never suppressed, a falling pair density-gated (H14, C10); a required weight line, worded for one reading (H16); an intake line with refused bowls, plus EN-5 answers once shipped; rows sum to the total (C-4), with red flag, plant, worms or a floor call leading in their own row named by finding, and the no-photo-read count stated (H15); timing rows render as named groups only while the Signal's matching lane fires, quoting its numbers (H18); afterRefusal and refused-only bouts route to intake (H17); names describe time and content only, never eats too fast, hairball, empty stomach or her usual (C11, P7, P11); plant never joins a row, and every cat plant read carries the lily question (H13); cough disclosure on bile, foam and hair rows; a quiet row never renders as resolved (P8); kept out of Ask's tools unless Ask gets the same veto with a test; album photos carry context (P10); free under Pets > $ (P13).

**Gates:** D1; EN-8 for weight history; D11 (a one-line Trust & Safety confirmation); whether the Signal's rapid lane fires for Nyx today (unverified); `nyx-voice` on every row name.

**Size:** about 3 to 4 PRs, client only, no migration: a pure partition module with property tests (rows sum to the total); the profile screen; the album; an Ask-exclusion guard.

### Bet 4 · The vet loop

**Verdict:** build with amendments for the report page; drop storing the vet's answer against a kind.

**What changes:** a vomiting-pattern page in the vet report after the clinical summary and the safety band: descriptors and counts per timing and content row, monthly or weekly bout counts with coverage, weight and intake alongside, one representative photo per row by a stated rule. "What did the vet say?" stays a per-sign care-state fact and never reaches the report. Frame F8.

**Amendments:** the present-only blood and foreign-material lines never move; no syndrome names and no per-row absence column; no band word (D13); state the counting unit and the 3-hour collapse; one photo per row (the most recent read in it) inside the 40-photo cap and after safety photos; relabel "Hairball" to "Hair" (`report.ts:3054`; `render.ts:334-335`), with Norsworthy's thresholds only as a labelled single-expert line, if at all; disclose that rows are automated groupings over owner-correctable fields; the food-at-8h fact and timing distribution land here first; any biopsy-cohort line carries both caveats (C12); heave answers as counts with "didn't see" stated, if D7 ships.

**Gates:** a Tier-2 edit to the vet report spec with PM approval; Dr. Chen's wording sign-off and the `vet-report-cold-read` subagent; D1 and D13.

**Size:** about 2 to 3 PRs, server only (`generate-report` `report.ts` and `render.ts`), no migration; photo work stays inside the existing embed path to avoid the 546 OOM class.

---

## §8 Decision briefs

Five are the PM's: **D1, D2, D6, D7, D10**. The other nine are team calls inside ratified rules, applied and logged on [CUL-1765](https://linear.app/projectnyx/issue/CUL-1765); the PM can reverse any of them.

### D1 · R3: name her recurring kinds on owner screens? (the PM's)

- **Deciding:** whether "Within 30 minutes of a logged feeding: 14 of the 43 times since May 14" sits on each read (A), one tap away on a profile plus the report (B), or on the report only (C). Frames F1-R3A, F2-R3B, F3-R3C side by side.
- **Options:** A, kinds with counts on owner screens including the read (best form: descriptor name, kind count and total in one block). **B, recommended (amended):** the read carries the timing line, a 7-day count and the K2 door, with no kind name and no novelty; descriptor-named kinds with counts live on the profile and the report, led by total, weight and intake. C, kinds on the report only.
- **Why B:** on the read, a familiar label echoes the excuses vets record ("he eats too fast", "it's just hairballs") and folds a first obstruction sign or an intake decline into a familiar row (H21, C11, P7). C hides the grouping from the person who could correct it and leaves the complaint unanswered (H23).
- **The named conflict:**
  > **Designer:** a kind label on the screen read at the moment of the event lulls; the long-term finding belongs one tap away, framed by total, weight and intake.
  > **Dr. Chen:** the after-meal count is the long-term finding and the main news on read 50 ("10th within minutes of eating since Aug 2"); keeping it off the read delays the visit.
  > **PM decision needed:** B with the profile (and K2 once EN-3 is live) carrying the count, or A in its one-block form.
- **Consequence:** B makes Bet 3 the home of the long-term finding, so it ships second and waits on EN-8. A needs the voice and clinical rules amended to allow kind labels on the read. C shrinks Bet 3 to the album.

### D2 · Novelty lines on the read (the PM's; a re-ruling)

- **Deciding:** whether the read carries presence-only novelty lines ("first bile in six weeks").
- **Options:** ship novelty as kicked off; dated history on every present field ("Bile: also in reads on Sep 22 and Sep 7"); **no novelty or history on the read in v1, with "last seen" dates on every profile row (recommended).**
- **Why:** on Nyx novelty fires on 7 of 29 vomits after warm-up, 5 of its 9 lines rest on an absence nobody saw, and Sep 22's "first foreign material on record" is false under the model's own values. A line that appears only sometimes teaches that a read without one means nothing new (R9, H1). The second option recreates option A's familiar label at field level, where a word filter cannot catch it.
- **Consequence:** this narrows kickoff ruling **R2 (PM, 2026-10-10)** and unseats its reopening of the 2026-07-17 "calm copy stays generic" rule for novelty and history lines on the read. The reopening is kept for timing and counts only. Bile and hair history move to the profile and the report; blood, foreign material, worms and plant are handled by their call rows and questions.

### D3 · What the read's count counts (team call, applied)

- **Deciding:** the unit and window.
- **Options:** **vomits logged over the 7 days up to this vomit, printed from 2, un-logged days disclosed (recommended)**; bouts after the 3-hour collapse; both plus a 30-day count.
- **Why:** this count can never be lower than the floor's non-chaining count or the burden card's (H7). A 30-day "7th" or a "1st" reads as rare (H8). Bouts belong on the report with the collapse rule stated (C10).
- **Consequence:** the mock's count lines (computed in bouts) are recomputed per logged vomit before round 2; event and episode counts disagree on 10 of 49 seven-day lines. The report states both units.

### D4 · Timing words, a better-than-the-rule brief (team call, applied)

- **Deciding:** whether the read changes History's shipped "N min after eating" wording (`lib/spineNode.ts:331-335`). The rule protects one shared voice across surfaces; its date is not in this pass's evidence.
- **Options:** keep "N min after eating" (F6a); **"5 minutes after the meal logged at 4:35 PM", dropping to "within minutes of the meal logged at 2:53 PM" when both were logged together or the meal was back-filled (recommended, F6b)**; the band only.
- **Why:** unrated bowls anchor as eaten and Nyx's ratings have nearly stopped (3 positive ratings in 209 meals since Aug 17), so "after eating" asserts an intake the record does not hold; 6 of 16 rapid bouts were logged in the same sitting, so "1 min" on Oct 9 is the logging gap (H6, R5). The predicate stays one; only the words change. The protection holds if History adopts the same words.
- **Consequence:** History and Home adopt the same wording, or one predicate speaks two ways; either way it is the PM's to reverse.

### D5 · What must be live before any Bet 1 line ships (team call, applied)

- **Deciding:** sequencing.
- **Options:** ship Bet 1 now behind its own flag, counts included; **the timing line first, the count after EN-4 runs for the pet, the K2 door after EN-3, and the template's "goes off food" sentence kept until CUL-1609 or EN-5 gives the watch-for list an intake clause (recommended)**; wait for EN-3, EN-4 and EN-5 all live.
- **Why:** a count beside a calm verdict the floor never worked out reads as "the app counted and is calm" (H7). A timing line that is silent when it cannot time carries no such risk.
- **Consequence:** Bet 1 ships in two steps after 1.2.0. The EN-4 flip becomes a `blocks` relation on the Bet 1 issue, pushing the R4 timeline by however long that flip takes.

### D6 · When "food visible long after a meal" may be said (the PM's, for Dr. Chen)

- **Deciding:** the threshold for the food-visible fact, and whether the shipped Signal line changes.
- **Options:** keep 6 hours for both; **keep 6 hours for the empty-stomach band and give food-visible its own constant at 8 hours or more, printed as hours and never as a sign (recommended)**; 8 hours for cats and 12 for dogs.
- **Why:** the shipped owner line "Recognizable food 6h or more after eating" (`lib/signalCopy.ts:1991`) counts food inside normal cat emptying (half-emptying 210 to 769 minutes in normal cats, Costello 1999), and its own decision doc lists more than 8 to 10 hours as the delayed-emptying line. Same value, different question means two constants (C-34; C6, C5).
- **Consequence:** changes an owner-facing Signal line today. Unseats the reuse of the 6-hour boundary for the "Recognizable food" line (`supabase/functions/generate-signal/photoComposition.ts:224`, `:265`), not the 6-hour band itself. The longGapHours decision doc gets a proposed §V correction and the unverified "75% emptied ~4.8h" figure comes out (§9). Nyx has zero eligible instances, so nothing she sees moves now.

### D7 · Ask whether she heaved first (the PM's)

- **Deciding:** whether the vomit log asks, after saving, "Did you see Nyx heave before it came up?"
- **Options:** no new capture; **one optional post-save tap on the incident screen, Yes / No / Didn't see, defaulting to Didn't see (recommended, F9)**; an optional short video for the vet (B-757 rung 1).
- **Why:** it is the one per-episode fact that separates vomiting from regurgitation (Armstrong 2013), and the record cannot tell Nyx's soon-after-meal bouts apart without it (C1, C13). Asked after the save, it adds no decision at the moment of the event, matching EN-5's post-save question. The Designer's condition: it never blocks the save, never defaults to No and never echoes a regurgitation label.
- **Consequence:** one field (a schema PR). The report can print heave answers as counts. A later round could add nausea signs (lip-licking, drooling; Schoeman Table 2).

### D8 · Species in the vision prompt (team call, applied)

- **Deciding:** whether the vision call is told the species.
- **Options:** pass it now; **keep it out, species drives server rules only (recommended now)**; test true, wrong and no species once dog photos exist (recommended later).
- **Why:** no measurable benefit on one cat's photos (M8). Buckley 2026 shows text steering image reads, but with misleading vignettes on human images; an accurate species token is untested either way (C14).
- **Consequence:** no Pattern 3 edit now. The wrong-species arm becomes the standing check for any text added to the prompt.

### D9 · Reference images (team call, applied)

- **Deciding:** whether the vision call carries a fixed labelled reference set, and where images come from.
- **Options:** **none in v1; descriptors, the eval and repeat reads only (recommended)**; presence-only exemplars in the confirmation pass, licensed from a vet partner, with lookalikes in the eval and Pattern 3 amended in writing; balanced targets and lookalikes on every read.
- **Why:** both layouts have a known failure mode. Lookalikes labelled "not blood" teach under-calling; presence-only exemplars push over-calling (Zhao 2021) on a record where 3 of 4 photo flags were disputed (H10). Revisit after EN-2 with a false-positive budget. Customer photos are never used without explicit consent.
- **Consequence:** no licensing or Pattern 3 ruling now. If the second option is chosen later, Trust & Safety rules on the licence, and staged images cannot stand in for blood or worms (M7).

### D10 · Fund the photo eval, and who labels it (the PM's)

- **Deciding:** whether to spend on EN-2 and who supplies gold labels.
- **Options:** **approve about $50 to $100 through the Batch API, after the structured-outputs PR, with gold labels from a blinded PM pass plus a vet pass on blood and foreign material, and sensitivity claims only with about 30 sourced positives (recommended)**; owner-edit pairs only; skip the eval and upgrade.
- **Why:** owner edits are selected on disagreement (3 edits on 44 reads, none to contents), so tuning to them rewards under-calling blood and foreign material (H11). A model swap without the eval breaks silently (M3).
- **Consequence:** the model upgrade and new fields wait on vet labels ([CUL-1312](https://linear.app/projectnyx/issue/CUL-1312)). The photo export is a service-role read under C-27 and needs the `rls-privacy-reviewer`.

### D11 · Does the profile need PMD-13? (team call, applied)

- **Deciding:** whether Bet 3's per-pet profile waits on the pending Trust & Safety ruling on per-pet stored statistics.
- **Options:** **derive rows at render and store nothing (the K2 precedent, `lib/incidentPattern.ts:5-10`), and ask Trust & Safety to confirm in one line that this sits outside PMD-13 (recommended)**; treat it as stored statistics and wait; store per-pet summaries for speed.
- **Why:** nothing new is persisted, so the question PMD-13 guards does not arise. Privacy is on the never-list, so the confirmation is filed rather than assumed.
- **Consequence:** Bet 3 can be specced before PMD-13 is ruled. The third option would sit behind PMD-13 and add a sign-out wipe entry.

### D12 · The lily gap (team call, applied)

- **Deciding:** whether a cat's plant-material read gets a lily question now, outside this issue.
- **Options:** **file it now as its own issue: T18's lily question on every cat plant read, and a plant line for dogs too (lily of the valley affects dogs), shipping in the first build after 1.2.0 clears (recommended)**; fold it into Bet 2; ask for an expedited build.
- **Why:** `grass_or_plant` is already a content token (`analyze-vomit/index.ts:93`) and nothing handles lilies. Pollen or vase water alone can kill a cat in under 3 days (FDA CVM), and early treatment works (Bennett 2013). Folding it into Bet 2 parks a live gap behind an eval. The PM can still judge the expedited option worth it.
- **Consequence:** filed as [CUL-1782](https://linear.app/projectnyx/issue/CUL-1782). Dr. Chen and `nyx-voice` word the line. No surface ever treats the absence of plant in a photo as evidence against lily exposure.

### D13 · A band word on the report (team call, applied)

- **Deciding:** whether the report prints a frequency band word beside the counts.
- **Options:** print the FCEAI or CIBDAI band with the window; **print weekly counts with logged-day coverage and no band word, and let the vet band it (recommended)**.
- **Why:** those bands are activity scores for diagnosed enteropathy, not triage thresholds (C10), and owner-logged counts undercount; a band word is a scored index a vet may over-trust (H19).
- **Consequence:** resolves the clinical lane's suggestion against the hazard lane's. The Tier-2 report spec edit records it.

### D14 · What "Re-run analysis" does (team call, applied)

- **Deciding:** the re-run control's behaviour.
- **Options:** keep it a fresh sample (today; it can flip the verdict); **return the stored model read unless a stamp changed (new photo, model or prompt), still recompute the floor and context as of now, and still re-run failed rows (recommended)**; remove the control.
- **Why:** same inputs, same read, and the stamps already exist (migration 075). It also saves a per-incident cap unit on every press (M4).
- **Consequence:** ends the re-roll. Repeat-read agreement moves into the confirmation pass, where it is measured on purpose.

---

## §9 Corrections owed

### Kickoff claims the verifiers broke or weakened

1. **"17 identical calm templates since Aug 17"** understates and mis-dates the problem. The 17 cover vomits from Jun 25 to Sep 21 (rewritten from Jul 1), and 26 of 44 completed reads carry one of three fixed texts (17 monitor, 6 feline-reduced-intake, 3 repeat-vomiting).
2. **"22 of 49 within 30 minutes of a logged meal"** is a naive count. Under the shipped predicate it is 16 (10 since Aug 2); the other 6 were found or estimated piles.
3. **"20 of those read as partially digested"** reproduces, but the premise built on it fails: "partially digested food" is on 41 of 44 reads at every timing (13 of 14 within 10 minutes, 20 of 20 found piles), and "undigested" is on 0 of 15 within 30 minutes but 2 of 5 at 2 to 6 hours. Bet 2's digestion-by-time crossing would print "food present" at every timing. Whether kibble vomited within minutes should look intact is (unverified), and the long-band rate is unmeasured.
4. **"`bile_present` loaded but never rendered"** is weakened. A `bile` token in `contents[]` already renders as "Bile"; the gap is only reads where `bile_present` is yes and the token is missing.
5. **The foreign-material and blood "unsure" counts of 15 and 5** are not Nyx's own figures. On her 44 reads they are 7 and 2, so the theory that foreign-material "unsure" absorbs unnamed content rests on a wrong base and stays (unverified).
6. **Bet 1 "replacing the identical template"** fixes the letter of the complaint more than its substance: 29 of 30 calm line-sets differ, but stripped of numbers there are 9 to 10 shapes, and 8 of the 10 within-20-minute vomits since Aug 2 would read "2 to 5 min after eating". Replacing the template would also drop its intake sentence (H1).
7. **Presence-only novelty ("first bile in six weeks")** is fragile: 7 of 29 vomits after warm-up, 5 of 9 lines resting on an unseen absence, and Sep 22's line false under raw model values.
8. **"Retained food hours after eating is a delayed-emptying description"** is weakened: the shipped 6-hour line sits inside normal cat emptying, the defensible floor is 8 hours or more and even then a description, not a sign, and Nyx has zero eligible instances.
9. **The "empty-stomach bile" kind** has zero instances on Nyx's record, and refused-bowl vomits move into that band, so the kind can relabel an intake decline.
10. **The ~60 owner-edit pairs as the eval set** cannot work for the red-flag fields: they are selected on disagreement, Nyx has 3 edits and none to contents, and tuning to them rewards under-calling.
11. **"Upgrade the model"** is not a safe lever on its own: a plain swap returns a 400 on every read, temperature 0 is unavailable on every upgrade path, and `prompt_hash` misses what an upgrade changes.
12. **"Pass species"** is unsupported (D8).
13. **"K2's door already carries the long-term finding"** is weakened: K2, EN-3 and EN-4 are dark and EN-5 is seeded off.
14. **A weight gate on the profile** could not show Nyx's 15% loss: the June 4.4 kg reading was overwritten on Sep 16, before migration 072 kept displaced weights.
15. **"What did the vet say?" attached to the kind** fails the care-state rules (one sign per acknowledgement; never in the report) (H20).
16. **On R2's reasoning:** the 2026-07-17 "calm copy stays generic" ruling was about deterministic benign-finding prose on monitor reads (`docs/decisions-archive.md:68`; clinical-guardrails Pattern 9 corollary at `SKILL.md:293`), not the model-prose leak (B-060). Reopening it carries live risk for bile and hair lines on calm reads, and Nyx has a logged cough course with prednisone started for coughing on 9/21, which makes a "hair also seen" line the worst case (cough mistaken for hairball retching is the canonical error).

### Prior-brief claims: PROPOSED §V addenda, awaiting PM approval

These files are frozen (or record a ratified decision). This brief does not edit them. Each proposal is a dated §V row at the foot plus an inline ⚠ pointer at the claim, per the CUL-671 convention.

- **`docs/research/2026-08-signals-deep-dive.md:156`** (a §V.2 entry; the brief already has §V at line 285). (a) The "moderate agreement classifying owner videos" citation is Packer et al. 2015, "Inter-observer agreement of canine and feline paroxysmal event semiology and classification" (BMC Vet Res; 100 videos; κ 0.40 for epileptic seizure presence), a seizure-video study, not a vomiting or regurgitation one. `docs/backlog.md:818` (B-757) describes it correctly. No vomiting-specific agreement study was found. (b) Clinician's Brief (Gallagher, updated 2012) does not say regurgitation is "never bile" or "often soon after eating": its table marks bile "No" for regurgitation and "+/-" for vomiting, time after eating "Variable" for both, and the text says "Timing of the episodes in relation to feeding and the amount of material produced are not distinguishing factors." The conclusion (structured descriptors over a classification label) still stands, on Armstrong and Willard.
- **`docs/nyx-signals-v2-longgaphours-decision.md`** (the §2 evidence table at `:39` and the anchor comment quoted at `:87`, mirrored in `lib/mealTiming.ts:216`). The "75% emptied ~4.8h (288 ± 62 min)" figure attributed to Goggin 1998 (PubMed 9563617) is not in that abstract, which reports T90, T50 and T20 as percent remaining with no numbers. It is (unverified), and if true it would contradict rather than support the half-emptying anchor (the two figures come from different studies, meals and methods, so the first-draft "logically impossible" framing was wrong). "6h is past half-emptying for nearly all cats" holds against Schmitz 2014 but not against Costello 1999's own range (210 to 769 minutes). The doc's own table lists more than 8 to 10 hours as the delayed-emptying line, which the retained-food reuse contradicts (D6). `docs/nyx-signals-v2-requirements.md:22` may have inherited the figure; that is a Tier-2 spec edit, not a §V row.
- **`docs/research/2026-09-engines-evidence-pack.md`**. (a) The lily row (`:709`, marked "not re-verified"): add the FDA CVM "Lovely Lilies and Curious Cats" page (verified 2026-10-11: early vomiting, kidney damage at about 12 to 24 hours, failure at 24 to 72, fatal in under 3 days; pollen or vase water enough) and Bennett 2013 (25 of 25 survived with treatment within 48 hours). (b) `:1250`: the DIG Labs acquisition is confirmed (TechCrunch, 2024-10-03), not "suggests an acquisition; not confirmed". (c) Lane E's Washabau WSAVA 2005 citation (VIN 3854163) for the more-than-8-hours line: the fetched page contains no such interval; re-point it to Washabau 2010 (dvm360). (d) `:1247`: Yipara's cat-vomiting page now names a regurgitation type, causes and a severity assessment with affiliate products (a newer state, not an error at the time).

### Lane claims the verifiers narrowed (internal to this pass, for the record)

- Hairball thresholds "disputed about eightfold" was overstated: it compared Cornell's "not uncommon" (no visit threshold) with Norsworthy's disease threshold.
- Norsworthy's "96 to 99% of biopsied chronically vomiting cats" cohorts were pre-selected by ultrasound thickening, and Marsilio 2019 found similar histology in 19 of 20 healthy cats (the 2026-08 brief already carries this caveat at `:154`; the lane dropped it).
- "Bets 1 and 3 would be first in category" is weakened (§5).
- Ollulanus in vomit as a cat finding is weakened: Kato 2015 was two dogs; the cat evidence is one clinical case plus a necropsy prevalence.
- "PETKIT is first with camera vomit detection" is wrong: Furbo has shipped a vomit alert since September 2023.

---

## §10 Research debt and what to verify at build time

**Before mock round 2:**

- Recompute the mock's count lines per logged vomit (D3) for Sep 21, Sep 7, Sep 25 and Oct 9, and compute weekly counts with logged-day coverage for the report page (F8).
- Check whether the Signal's rapid timing lane fires for Nyx today; F7's named row depends on it.

**Before any Bet 2 build:**

- Measure the long-band "partially digested" rate, and run a labelled image review (Dr. Chen or a vet set) of the digestion grade.
- A read-only pass over Nyx's 7 foreign-material-unsure reads (demo-seed copy excluded) to test whether present-only worm, plant and hair-mass fields would absorb them (§3 D1, unverified).
- Engineering checks: structured outputs with image inputs and adaptive thinking on each candidate model; `between_tools` with `output_config`; grammar compile latency; Haiku 5.5's resolution tier (via `count_tokens`); p50 and p95 latency with 3 photos against the 30-second timeout (`http.ts:18`); the Sonnet 5.5 cache-read price ($0.10 on the live page against $0.20 in the skill).
- Bile co-varies with the time band on this record (mid 4 of 6, found 6 of 19, rapid 3 of 15); with a small n and treat-anchored mid bouts, its meaning is unverified.

**Placeholders that need ratification:** the late-tap window (~60 minutes, Dr. Chen); the re-read stability threshold (90% of 5, Data Scientist); the repeat-read aggregation rule (clinical); the model-only escalation path without prose (GAP-31). Every clinical threshold here is persona-ratified only; no veterinarian has reviewed this brief.

**Replay limits.** The replay read intake ratings as they are now, so the as-of afterRefusal and refused-only outcomes (for example Aug 8's "picked") are unverified. The witnessed-only timing rule favours vomits the owner was present for, so the near-meal share is inflated by an unknown amount. This is one pet: no floor, window or threshold may be tuned on these numbers.

**File separately (beyond what is already filed):** a guard test pairing each Claude call site's model with its `tool_choice` (it belongs beside the structured-outputs fix, [CUL-1783](https://linear.app/projectnyx/issue/CUL-1783)); the shipped L3 6-hour owner line (D6); Ask's tools and vocabulary veto before any Bet 3 row exists. The lily gap is [CUL-1782](https://linear.app/projectnyx/issue/CUL-1782).

**Unverified sources:** the Bristol Cats paper behind the Royal Canin release; WikiVet dog emptying; lily onset and decontamination windows in owner pages; the Washabau "no time relation" sentence; the Banfield/IVIS normalisation summary; Cannon's "mistakenly believe normal" quote (not found); the Furbo tier that includes the Health Checker; whether PETKIT's vomit detection shipped; Petalife's use of history; Migraine Buddy's per-entry prediction.

**Re-verify competitors at use, not at citation.** Before any build after 1.2.0, re-check Tend & Mend, Petalife, PETKIT Kitbo and FunFit, and Poopy. In the last sweep, three of six products moved within six days.

---

## Appendix: how the replay was run

No raw rows, identifiers or emails are in this brief or the repo; only aggregates and dated examples.

1. **Export.** In this session, through the Supabase MCP, read-only. The two pinned and privacy-reviewed queries in `scripts/engine-replay/export.sql` ran unchanged, scoped by the subject's id paired with its owner (C-27) and matched only as an evaluation subject (PMD-12). Then four extra read-only queries, each scoped by the same id, owner and evaluation-subject CTE to Nyx only: analysis colour, consistency, raw fields, confidence, notes presence and photo counts; vomit counts by month; the anchor meals' `occurred_at_source`; and `read_text` grouped by md5 hash (no text exported). These four sit outside the pinned query; no free text, note or photo path was exported. The demo-seed copy of the cat was never an evaluation subject and no replay file carries it.
2. **Where the data lives.** Raw rows stayed in the session scratchpad, never in the repo (the `scripts/engine-replay/README.md` rule).
3. **The replay.** A scratchpad script (`bet1.mts`) imported `classifyEpisodeSet`, `collapseEpisodes` and `classifyEpisodeTiming` from `lib/mealTiming.ts` and the episode counter from `lib/symptomEpisodes.ts` by absolute path, unmodified, collapsing first and then classifying as `lib/spineNode.ts:375-421` does. Spoken minutes restate the shipped formatter rules (`lib/spineNode.ts:328-348`) because spineNode's other imports do not resolve under node. A second script (`lines.py`) built the line-sets and the novelty exposure check. The as-of view applies the visibility rule from `scripts/engine-replay/record.deno.ts` (created by T, not deleted by T, occurred by T). One known deviation: `bet1.mts` built free-fed spans from settled arrangements only, contrary to `record.deno.ts:9`, which is how the Jun 10 flip was missed and then found.
4. **Independent check.** The verifier rebuilt the timing ladder in SQL without the script (3-hour collapse with the shipped tie order, strict witnessed onset, eaten feedings, 24-hour lookback, refused never anchors), recomputed the chance baseline over 102,240 minutes from Aug 1 to Oct 11, and reproduced the kinds, the crosstab and the eight recent lines by hand.
5. **Precedent.** `scripts/engine-replay/` (built for the 2026-09 step-change brief, [CUL-1117](https://linear.app/projectnyx/issue/CUL-1117)) is the committed home for replay tooling. The scratchpad scripts were not committed; moving them there is a reviewed PR, and the replay must never tune a floor ([CUL-508](https://linear.app/projectnyx/issue/CUL-508) owns calibration on synthetic records).
