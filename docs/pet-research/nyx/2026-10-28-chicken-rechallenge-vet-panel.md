# Nyx's chicken rechallenge: a vet panel read of the record

**Date:** 2026-10-28 (data pulled 2026-10-27, rechecked 2026-10-28: no new vomits since 10-27 07:44)
**Prepared for:** the PM, as Nyx's owner
**Lenses (independent, isolated reads):** GI Internist (DACVIM, feline focus) · Veterinary Nutritionist (DACVN) · Emergency/Criticalist (DACVECC) · Skeptical GP. Chaired and reconciled by the GP lens (Dr. Alex Chen). Method: `docs/vet-specialist-panel.md` §4.2.
**Companion:** [`2026-10-28-chicken-rechallenge-vet-summary.md`](./2026-10-28-chicken-rechallenge-vet-summary.md), a one page version to bring to Nyx's vet.

> **Data note.** Same boundary as [the June panel deep dive](../../research/2026-06-vet-council-nyx-deep-dive.md): this analyses the PM's own cat ("Nyx", `pets.id = bf7b196e-6db1-4a34-af34-f1759d380042`) in the PM's own database, at the PM's explicit request, captured into the PM's private repo. It is identifiable pet health narrative. It is evidence for a conversation with Nyx's vet, not a diagnosis and not a treatment decision; no lens examined the cat.

---

## 0. Bottom line

1. **The rechallenge so far neither convicts nor clears chicken.** Three vomiting episodes in 8.9 days sits inside Nyx's own rabbit only background. A third of all nine day stretches on rabbit had three or more episodes.
2. **The rechallenge as run cannot isolate chicken.** It added two new products at once, with rice, guar gum, tapioca and vegetable oil, a new lickable format and about three extra feedings a day.
3. **Prednisolone ended 10-10, eight days before chicken started.** Steroid withdrawal is a competing explanation for any October rise.
4. **The question that outranks chicken is her weight:** 4.40 kg on 06-15, 3.73 kg on 09-16, a 15% drop if both numbers are real. All four lenses put this first, independently.
5. **Mood evidence carries little weight either way.** "Played" on 10-20, 10-21 and 10-23 is real and welcome, but cats hide illness and no look was logged 10-24 to 10-27.

---

## 1. Trigger

The PM asked to convene the vet panel over Nyx's backend data. Nyx finished a ~12 week rabbit elimination trial and chicken went back in on 10-18 at roughly 1/3 chicken, 2/3 rabbit. Since then there have been three vomiting incidents. The question: keep her on the chicken reintroduction, or go back to rabbit and call chicken the culprit? The PM's prior: vomiting dropped on rabbit but never reached zero, so three vomits may be baseline. The PM also noted no visible change in mood, if anything happier with chicken, and was unsure whether mixed meals had been backfilled for the early reintroduction days.

Culprit itself never recommends continuing or stopping a diet trial. This document follows the same line: it lays out evidence, differentials and paths, and the decision belongs to the owner and Nyx's vet.

## 2. What was pulled

From the production database (Supabase project `aigchluqluzuhtbfllgh`), for Nyx only, live rows only (`deleted_at is null`), times converted to the account timezone **America/Chicago**:

| Source | What |
|---|---|
| `events` + `meals` + `food_items` + `meal_components` | Every meal 10-10 to 10-27 with product, protein and mixed bowl shares; full ingredient lists of both chicken products |
| `events` + `event_ai_analysis` | All 55 live vomit logs since 05-14, with the photo read, tier and contextual flags |
| `diet_trials` + `diet_trial_foods` | The rabbit trial record and its allowed set |
| `medications` + `medication_administrations` | Prednisolone, Motozol, cetirizine dose logs |
| `looks` | All 14 Noticed entries |
| `weight_checks` | Both weights on file |
| `intake_checks` | The two intake answers on the 10-26 vomit |
| `events` (cough, sneeze, itch, other) | Non GI signs since 09-01 |

**Mixed meals: no backfill needed.** Before mixed bowls shipped, the owner logged rabbit and chicken back to back (for example 10-19 07:20:48 RC wet, 07:21:05 Applaws). From 10-22 the six mixed bowls are logged as 2/3 RC rabbit wet + 1/3 Applaws. Both shapes read correctly for this analysis.

**Episode definition.** Vomit logs within 90 minutes of each other count as one episode. This merges the two 10-26 logs (16 min apart) and two 09-25 logs (62 min apart).

## 3. The record

### 3.1 Patient

- Cat, female, American Shorthair, born 2023-09-01 (3 years 1 month).
- Weight on file: **4.40 kg dated 06-15** (home scale, entered retroactively on 10-09, `source_basis = entry`) and **3.73 kg on 09-16** (home scale). No weight since 09-16. **Unverified; see §8.**

### 3.2 Diet timeline

- **Before the trial (05-14 to 07-25, 73 days).** Rotating commercial wet foods and treats, mostly chicken based (Fancy Feast, Hill's, Instinct, Tiki Cat, Sheba, Temptations, Friskies Party Mix, Delectables lickables), plus some beef, duck, turkey and fish.
- **Rabbit elimination (07-26 to 10-18).** Royal Canin Selected Protein PR dry (peas, rabbit meal, pea protein, coconut oil, hydrolyzed soy protein, fish oil, ...) and wet; Instinct LID Rabbit wet; cooked rabbit; Rayne Rabbit Rewards treats; Vital Essentials freeze dried rabbit. A slow feeder came in around 09-21, used for dry food only. The trial is recorded as **completed 10-20, outcome "improved"**. Owner note: *"mostly down to scarf and barfs now."*
- **Chicken rechallenge (from 10-18 ~15:13).** Two chicken products, both new to her:

| Product | Ingredients | Feedings 10-18 to 10-27 |
|---|---|---|
| Blue Buffalo Tastefuls Purées with Chicken (lickable) | Chicken broth, chicken, **tapioca starch, vegetable oil, guar gum** | 25 (~3 a day) |
| Applaws Chicken Breast in broth | Chicken breast, chicken broth, **rice** | 8 alone + 6 mixed bowls at 1/3 |
| Royal Canin Selected Protein PR (rabbit) | as above | 26 |
| Rayne Rabbit Rewards (treat) | rabbit | 7 |

Portions are not recorded (`quantity = unknown` on every log). The owner estimates about 1/3 chicken, 2/3 rabbit by volume. By logged feedings, about half contain chicken.

**Trial record.** The schema supports `phase = reintroduction`, but Nyx's trial stayed `elimination` and was closed on 10-20, and chicken was never added to its food set. The app's trial aware surfaces therefore do not know a rechallenge is running.

### 3.3 Medications and other signs

| Item | Dates | Notes |
|---|---|---|
| **Prednisolone 5 mg PO** (for cough, Dr. Miller) | 09-21 to ~10-10 | Daily for ~10 days, many doses logged "partial" (given in food), then every 48 h. Last dose logged **10-10**. |
| Cetirizine | 10-03, 10-11, 10-12, 10-20, 10-24 | Intermittent |
| Motozol (otic) | 07-16 to 08-09; 09-21 to 09-27 | Ear infection |
| Cough | 33 logs since 07-01 | Most recent 10-21 |
| Sneeze | 15 logs | Most recent 10-24 |
| Itch / ear | Through 09-13 | Nothing since |
| Stool | None live | 8 diarrhea logs in May and June, all later deleted; no stool record exists |

### 3.4 Vomiting rate by period

| Period | Days | Episodes | Per week |
|---|---|---|---|
| Before the trial, mixed chicken heavy diet | 73.0 | 30 | **2.88** |
| Rabbit, weeks 1 to 5 (07-26 to 08-31) | 37.0 | 6 | 1.14 |
| Rabbit, 09-01 to 09-20, no steroid | 20.0 | 6 | 2.10 |
| Rabbit, on prednisolone, 09-21 to 10-11 | 21.0 | 4 | 1.33 |
| Rabbit, off steroid, 10-12 to 10-18 (pre chicken) | 6.6 | 2 | 2.11 |
| **Chicken rechallenge, 10-18 15:13 to 10-27** | **8.9** | **3** | **2.36** (95% CI ~0.49 to 6.89) |
| All rabbit elimination, 07-26 to 10-18 | 84.6 | 18 | 1.49 |
| Rabbit, no steroid (07-26 to 09-20) | 57.0 | 12 | 1.47 |
| Last 30 days before chicken | 30.0 | 6 | 1.40 |

Meals were logged on essentially every day of every period (71 of 73, 37/37, 19/20, 21/21, 7/7, 10/10), so logging gaps do not drive these rates.

### 3.5 Episodes per calendar week (Monday start)

| Week of | Episodes | | Week of | Episodes |
|---|---|---|---|---|
| May 11 | 2 | | Aug 17 | 1 |
| May 18 | 4 | | Aug 24 | 1 |
| May 25 | 4 | | Aug 31 | 1 |
| Jun 1 | 1 | | Sep 7 | 3 |
| Jun 8 | 4 | | Sep 14 | 2 |
| Jun 15 | 3 | | Sep 21 | 3 (prednisolone starts) |
| Jun 22 | 3 | | Sep 28 | 0 |
| Jun 29 | 3 | | Oct 5 | 1 |
| Jul 6 | 2 | | Oct 12 | 3 (third is 10-18, 26 min after first chicken) |
| Jul 13 | 2 | | **Oct 19** | **0 (first full chicken week)** |
| Jul 20 | 2 | | Oct 26 | 2 (through 10-28) |
| **Jul 27 (rabbit starts)** | 2 | | | |
| Aug 3 | 2 | | | |
| Aug 10 | 0 | | | |

Note the Skeptical GP's point in §5.4: the decline began **before** rabbit (late June and July ran 3, 3, 3, 2, 2, 2). The 2.88 pretrial average is pulled up by May, which was also the owner's first weeks learning the app.

### 3.6 How unusual is three episodes in nine days?

Computed over the rabbit phase (07-26 to 10-18), sliding an 8.9 day window hour by hour:

- **34% of rabbit only windows held 3 or more episodes.** The busiest held **5** (09-17 to 09-26).
- Poisson probability of 3+ episodes in 8.9 days:

| If her true rate is still... | Expected | P(3+) |
|---|---|---|
| Last 30 days on rabbit (1.40/wk) | 1.78 | 0.26 |
| All rabbit (1.49/wk) | 1.90 | 0.30 |
| September rabbit, no steroid (2.10/wk) | 2.67 | 0.50 |
| Pretrial (2.88/wk) | 3.66 | 0.71 |

- Power going forward, with an alarm threshold set for ~8% false alarms against the rabbit rate (1.49/wk):

| Horizon | Alarm at | False alarm | Detects a return to the pretrial rate |
|---|---|---|---|
| 14 days | 6+ episodes | 0.08 | 0.52 |
| 21 days | 8+ | 0.08 | 0.63 |
| 28 days | 10+ | 0.08 | 0.71 |

These assume vomits arrive at random. They cluster, so the real uncertainty is wider than shown.

### 3.7 The three rechallenge episodes

| # | When (CT) | What she ate before | What came up | App read |
|---|---|---|---|---|
| 1 | **10-18 15:39** | RC rabbit kibble **2 min** before and 19 min before; first ever chicken purée 27 min before | Foamy, white, partly digested food | "Logged" tier, monitor |
| 2 | **10-26 06:10 and 06:26** (two logs, one episode) | RC rabbit kibble 3.4 h before; chicken purée 4.5 h before | Second log: brown, chunky, undigested food; no bile, no blood seen | **Call today**, repeated vomiting |
| 3 | **10-27 07:44** | Rabbit treat 66 min before; chicken purée 2.1 h before | Tan, chunky, partly digested food with liquid; no bile, no blood seen | **Call today**; text says "three days in a row" (a bug, §9) |

- Days 2 to 7 of the rechallenge (10-19 to 10-25) had **no vomiting**.
- Intake check on episode 2: the owner answered that she had been fed since the previous morning. Intake amounts are otherwise unrated.

### 3.8 Rabbit phase vomiting, for comparison (09-01 onward)

| When (CT) | Minutes after last meal | Character | Note |
|---|---|---|---|
| 09-04 07:02 | 229 | Green, bile, food | Reduced intake flag |
| 09-07 06:00 | 282 | Yellow, bile, food | Found later |
| 09-07 16:00 | 14 | Tan, food, foam | "I think this happened after she ate" |
| 09-12 12:18 | 5 | Tan, food | |
| 09-17 10:58 | 4 | Tan, food, foam | "Right after eating" |
| 09-17 17:11 | 4 | Tan, food | |
| 09-21 16:40 | 5 | Tan, food | "Scarf and barf"; slow feeder starts |
| 09-22 01:30 | 209 | Mixed, bile, food | Suspected foreign material |
| 09-25 19:08 | 19 | Yellow, watery, bile | On prednisolone |
| 09-25 20:10 | 81 | Yellow, foamy, bile | Same episode as above; "hunched" look that evening |
| 10-09 14:53 | 0 | Tan, food | "Happened right after eating" |
| 10-14 17:44 | 0 | Tan, food | |
| 10-16 07:33 | 2 | Tan, food, hair | |

Pattern: most rabbit phase vomits are tan and chunky with partly digested food; bile in a minority; hair now and then. **Many came 0 to 5 minutes after eating**, the eating too fast shape. Others came hours after a meal or early in the morning, which is what episodes 2 and 3 look like.

The app's "reduced intake" flag fired on 09-04, 09-22, 09-25 and 10-09. It fires because intake ratings are mostly blank, not because she was seen refusing food. It is weak evidence either way.

### 3.9 Noticed (owner observed behaviour)

| Day | Look |
|---|---|
| 09-22, 09-23, 09-24 | Nothing unusual |
| 09-25 | Played; **hunched** (evening of two vomits, on prednisolone) |
| 09-26 | Played |
| 10-03, 10-06 | Nothing unusual |
| 10-08 | Played |
| 10-11, 10-13 | Nothing unusual |
| **10-20, 10-21, 10-23** | **Played** (on chicken) |
| 10-24 to 10-27 | **Nothing logged** |

---

## 4. Method

Per `docs/vet-specialist-panel.md` §4.2: each lens ran as an isolated subagent with a fresh context, read only the same computed and data minimized evidence pack (the tables above, no raw logs, photos or free text beyond short owner notes), and returned the §5 output contract. No lens saw another's read. The model was held constant across lenses so specialty was the only variable. Every lens inherited the two safety invariants verbatim: **n=1 / absence never reassures**, and **intake is not preference**. The chair (Dr. Chen, GP) reconciled the reads in §6.

Rotation (§6 of the panel doc): GI Internist (the chronic vomiting question), Nutritionist (rechallenge design), Criticalist (where the safety line sits, the weight), Skeptical GP (the PM's "it's baseline" hypothesis and its opposite). The Behaviorist was not convened; the Skeptical GP covered the mood evidence.

---

## 5. The panel reads

### 5.1 GI Internist (DACVIM, feline focus)

**Gestalt.** Three episodes in 8.9 days fit inside her rabbit phase background, so the challenge so far neither convicts nor clears chicken. The bigger finding is that she never reached normal on rabbit, and her logged weight may have dropped 15%; together that calls for a workup whatever happens with chicken.

**Ranked differentials for the rechallenge vomiting**
1. *Background vomiting from a partly controlled chronic enteropathy, plus eating too fast.* For: 2.36/wk against 2.10/wk on rabbit in September with no steroid; episode 1 came 2 min after kibble; days 2 to 7 were clean. Against: episodes 2 and 3 came on back to back mornings, hours after meals, not the scarf and barf shape.
2. *Chicken adverse food reaction recurring.* For: the chicken heavy pretrial rate was about double the elimination rate; onset around day 8 to 9 on consecutive days is a plausible rechallenge pattern. Against: the 95% CI is 0.5 to 6.9, and 34% of rabbit only windows held 3+.
3. *Steroid withdrawal unmasking a steroid responsive enteropathy (IBD; small cell lymphoma less likely at 3 years, not excluded).* For: 1.33/wk on prednisolone, 2.11/wk off it, before any chicken; the possible weight loss. Against: tiny samples; the steroid was dosed for cough, not the gut.
4. *Other new variables:* rice, guar gum, tapioca; a purée about 3 times a day; more meals and probably more total volume.
5. *Outside the gut:* cough plus vomiting in a cat raises heartworm, lungworm and asthma. Owners also confuse retching with coughing.

**Shows vs cannot rule out.** Shows: vomiting fell on rabbit but never stopped; the challenge rate has not clearly risen; no blood seen; behaviour looks normal. Cannot rule out: a slow chicken reaction, an underlying infiltrative disease, true weight loss, reduced intake. A quiet week is not wellness.

**Falsification.** Leading hypothesis: background, not chicken. Counterexample tried: a chicken trigger should show a delay, then clustering on consecutive days with vomiting well after meals; episodes 2 and 3 match that. It held only weakly, because the rabbit only window 09-17 to 09-26 held 5 episodes with similar clustering, so clustering does not separate the two. The hypothesis survives for "chicken specifically" and fails as "nothing to work up": benign mechanical vomiting does not explain a 15% weight drop if the weight is real.

**Blind spots.** No portions; chicken never fed alone and mixed with rabbit from 10-22; weight backfilled, home scale, none since 09-16; no bloodwork, cobalamin, fecal, imaging or heartworm status visible; steroid overlaps the trial; vomit times estimated for finds; early logging was a learning period.

**Paths.**
- *Continue:* reasonable only with a stopping rule agreed in advance. Stop at blood, a full day of inappetence, lethargy, 2+ episodes in 24 h, or a confirmed weight drop; otherwise review at day 14 (11-01) against 6+ episodes. It catches a real relapse only about half the time.
- *Return to rabbit:* a cleaner baseline, but convicts chicken on weak evidence, and reruns a trial that was never fully clean.
- *Third path (preferred to discuss):* confirm weight on the vet's scale and start the workup now; then, from a stable rabbit baseline, rechallenge with one single ingredient chicken (no rice, no purée additives), fed alone in measured portions for 14 days.
- *Start measuring:* weekly body weight, same scale, same time of day; tag each vomit as within 10 minutes of eating or later.

**For the vet this week.** Clinic scale weight and whether 4.40 kg is real; minimum workup for chronic vomiting with possible weight loss (CBC, chemistry, urinalysis, cobalamin/folate, fPLI, fecal, abdominal ultrasound for wall layering and lymph nodes); heartworm antigen/antibody and thoracic imaging given the cough; whether stopping prednisolone could explain the October rise; agree the stopping rule and review date before continuing chicken.

### 5.2 Veterinary Nutritionist (DACVN)

**Gestalt.** This challenge does not test chicken on its own: two new products, a new feeding format, new carriers and about three extra feedings a day went in at once. Its rate (2.36/wk) matches the off steroid elimination rate (2.10 to 2.11/wk), and the weight record is the most urgent nutritional signal, unresolved.

**Ranked explanations (diet design view)**
1. *Background vomiting the rabbit diet never resolved* (fast eating, hair, a possible underlying gut problem). For: rate matches off steroid rabbit periods; episode 1 looks like scarf and barf; days 2 to 7 quiet. Against: two episodes on back to back mornings, hours after a meal.
2. *A real reaction to chicken appearing on days 8 to 9.* For: delayed reactions often show 1 to 2 weeks into a challenge; the chicken heavy pretrial rate was higher. Against: only 3 episodes; the pretrial diet also had beef, fish and many brands mixed in, so chicken can't be singled out.
3. *Something other than chicken, or a change in how she is fed.* For: guar gum (a fermentable fibre), vegetable oil (extra fat), tapioca and rice are all new; mixed bowls began 10-22, four days before episodes 2 and 3; total volume is up. Against: none is a classic culprit.
4. *Steroid withdrawal unmasking an underlying condition,* which fits 2 to 3 weeks after 10-10 with or without chicken.

**Shows vs cannot rule out.** Shows: the challenge rate is indistinguishable from the off steroid baseline; the episodes look like her elimination phase vomits. Cannot rule out: a slowly building chicken reaction, a reaction to the carriers, or ongoing weight loss. Eight quiet days are not tolerance.

**Falsification.** Lead: background vomiting. Counterexample tried: if it were background, the two morning episodes should look unlike anything during elimination. It held: elimination also had early morning, tan, chunky vomits; rabbit weeks also had clusters of 3 (Sep 7, Sep 21) and the busiest window had 5. It held weakly and does not clear chicken; no difference from baseline is not the same as safe.

**Blind spots.** No portions, so neither dose nor calories is known; no weight for 6 weeks; the elimination diet was not single protein either (peas, pea protein, hydrolysed soy, fish oil); Applaws and lickable purées are usually complementary, not complete and balanced (check the labels); cough or retching may be logged as vomiting; skin and ears are not being tracked during the challenge; intake is unrated, and "happier since chicken" may mean she was under eating the rabbit diet, which is an intake signal, not a preference.

**Paths.**
- *Continue as is:* cheap, but uninterpretable whatever happens.
- *Return to rabbit and call chicken the culprit:* convicts chicken on evidence that does not separate it from the carriers or the background.
- *Redesigned challenge (preferred to discuss):*
  - 2 weeks back on one fixed rabbit base to reestablish baseline.
  - Then plain boiled chicken breast or a 100% chicken freeze dried product: no broth, rice, gums or oil.
  - A fixed, weighed dose of about 10 to 15% of daily food, mixed into the usual wet food at the same meals, so the format does not change.
  - No other new products; hold cetirizine steady or log it; slow feeder for all meals.
  - Run 21 to 28 days with the stop threshold agreed in advance (8+ episodes by day 21, 10+ by day 28).
  - Watch ears and skin too; a return there would be informative.
- *Start measuring:* grams eaten per day on a kitchen scale (offered minus leftover). Rough need is about 190 to 225 kcal/day at 3.73 kg, more if 4.4 kg is her real weight.

**For the vet this week.** A clinic scale weight (if the loss is real: bloodwork, fecal, B12/folate before blaming any food); bring the labels and ask whether the challenge foods are complete and balanced and whether a single ingredient rechallenge is better; ask whether stopping prednisolone explains the timing and whether the cough could be logged as vomiting; agree the call now signs. A cat that is losing weight should not go 24 hours without food.

### 5.3 Emergency / Criticalist (DACVECC)

**Gestalt.** The chicken question matters less than what sits beside it: a 3 year old cat with a possible 15% weight loss, vomiting for more than 5 months that never stopped on a novel protein diet, a persistent cough and an unexplained steroid course. Nothing reads "go now" today, but the weight needs verifying on a clinic scale this week.

**Red flags present**
- 4.40 kg (06-15) to 3.73 kg (09-16), 15%, with no weight in 6 weeks. Steroids usually add weight, so further loss after prednisolone would be more worrying.
- Vomiting continued on rabbit at 1.49/wk; more than weekly is abnormal in a cat on any diet.
- 33 cough logs, most recent 10-21. Vomits 0 to 5 minutes after eating may be regurgitation, and regurgitation plus a cough carries aspiration risk.
- Episodes 2 and 3 on back to back mornings, 2 to 4.5 h after food, bringing up undigested food: a different pattern from scarf and barf that fits delayed gastric emptying.
- "Hunched" on 09-25.

**Absent but not reassuring**
- No blood or bile seen; says nothing about how deep the problem goes.
- Played on 10-20, 10-21, 10-23 and nothing logged since 10-24: a gap, not reassurance.
- Reduced intake flags are artefacts of blank ratings, but that does not mean intake was normal; it was never rated.

**Shows vs cannot rule out.** Shows: vomiting fell on rabbit but never stopped; the chicken phase rate is not separable from baseline. Cannot rule out: chronic enteropathy or small cell lymphoma; heartworm associated respiratory disease or lungworm (cough plus vomiting); an oesophageal problem; a trichobezoar or foreign body (one suspected item on 09-22); diabetes, which steroids can tip a cat into; FeLV or FIV. The prednisolone may also have masked inflammatory disease and muddied the trial.

**Falsification.** Leading concern: the weight loss is real and points beyond food. Counterexample tried: the 4.40 is a backfilled entry error and she has always been ~3.7 kg. That removes the urgency but not the concern: vomiting that persisted on a novel protein diet, plus an unexplained cough, still justifies a workup. The concern holds in direction; the timeline depends on verifying the weight.

**Blind spots.** Portions and intake never rated; no stool record; no drinking or urination record; no resting breathing rate; estimated times on found vomits; pretrial rate inflated by onboarding and deleted logs; the challenge mixes two variables.

**Escalation triggers during any continued challenge**
- *Go now:* more than 3 vomits in 24 h, or retching with nothing coming up; blood or coffee ground material; open mouth breathing or a sleeping breathing rate over 40/min; collapse, hiding or marked lethargy; painful belly or hunched posture with vomiting; yellow gums.
- *Call today:* eating less, or nothing for 24 h (fatty liver risk in a cat losing weight); vomiting on a third day in a row; hair or foreign material in vomit; new diarrhoea; drinking or urinating more; cough getting more frequent; any weight under 3.7 kg.

**For the vet, within the next few days, without waiting for the challenge to finish.** Clinic scale weight and whether 4.40 was real; a video of an after meal episode (vomiting vs regurgitation); the cough was never diagnosed before the steroid (chest X-rays, heartworm antigen and antibody, a fecal Baermann for lungworm); baseline workup (CBC, chemistry, urinalysis, FeLV/FIV, B12 and folate); abdominal ultrasound if the weight loss is confirmed; whether to rechallenge with chicken alone, without rice. *"The chicken verdict can wait. The weight cannot."*

### 5.4 Skeptical GP

**Gestalt.** Three episodes in nine days can't separate "baseline noise" from "chicken reaction", and the trial's improvement that both readings lean on is partly an artifact of the record. The item that needs action now is the possible 15% weight loss.

**The two cases**
- *For baseline noise:* episode 1 (2 min after kibble, 27 min after the first chicken) looks like scarf and barf and came too fast to be an immune reaction; without it, the challenge rate is ~1.6/wk, matching the elimination rate of 1.49; September on rabbit with no steroid ran 2.10/wk; 34% of rabbit windows held 3+; the first full chicken week had zero.
- *For a chicken reaction:* episodes 2 and 3 fell on consecutive mornings on days 8 and 9, hours after eating, with chunky food. That fits a delayed food reaction, not eating too fast. The week of Oct 26 already has 2 episodes in 2 days.
- *Weighting:* about even, leaning noise for now. Neither reading is earned.

**Shows vs cannot rule out.** Shows: vomiting fell from May and June levels, never reached zero, and drifted back up in September before any chicken. Cannot rule out: real weight loss; a delayed reaction to chicken *or* to the rice, guar gum or vegetable oil (two new products went in at once, so the challenge tests "these products"); steroid masking in weeks 9 to 11; a primary GI or other disease underneath.

**Falsification.** Leading read: the trial's improvement is mostly artifact. Test: if the trial caused the drop, the weeks just before it should look like May. They don't; Jun 22 to Jul 20 ran 3, 3, 3, 2, 2, so the decline started before rabbit, and the 2.88 average is driven by the onboarding weeks. The read held. Second attempt: argue delayed vomits are new under chicken. That did not hold; the rabbit phase also had vomits hours after meals and early in the morning.

**Blind spots, including in the evidence pack.** Period boundaries were cut after the fact at steroid and slow feeder dates, which makes patterns easy to find; the probabilities assume random arrival and vomiting clusters; the 90 minute rule and estimated times shift counts; left out of the pack: stool, portions, intake, hairballs, and whether some "vomit" is regurgitation or cough related retching; 33 cough logs and an intermittent antihistamine are unexplained confounders; the slow feeder is dry only, and the purée may be eaten fast.

**What would settle it.** An A/B/A design: a single ingredient chicken (no rice, no new additives) for 3 to 4 weeks, rabbit for 3 to 4 weeks, then chicken again. Count only delayed vomits (more than 30 minutes after eating) as the outcome. Even at 28 days, counts alone catch a real return to the old rate only ~71% of the time, so counts will stay ambiguous. *Start measuring:* weekly weight, same scale, same time of day, with a vet scale check; it is the red flag and the least biased endpoint.

**For the vet.** Is the 15% weight loss real? Does vomiting most weeks for 5+ months, with possible weight loss, in a 3 year old cat warrant a workup? Is the cough related, and could some logged vomits be coughing or hacking? How should the challenge be run so it can answer the question (single protein, a set horizon, a stopping rule agreed in advance)? What a 15 minute visit can do with this record: weigh her, hear a three line summary (rate by period, delayed vs fast vomits, weight trend), and decide on a workup. It cannot adjudicate 3 episodes.

**On the mood evidence.** "Played" on three days carries almost nothing. Cats hide illness, and the looks stopped on 10-24, exactly when vomiting resumed. A quiet or happy week is not wellness, and no change in mood cannot outweigh weight loss.

---

## 6. Chair's reconciliation (Dr. Alex Chen, GP)

### 6.1 Where all four agreed

1. **The chicken question is not answerable on this record.** Every lens independently landed on "neither convicts nor clears." The owner's prior (three vomits may be baseline) is supported as *not ruled out*, not as *shown*.
2. **The current rechallenge confounds chicken with rice, guar gum, tapioca, vegetable oil, a lickable format and higher feeding frequency.** Three of four lenses named this unprompted.
3. **Prednisolone withdrawal (last dose 10-10) is a live competing explanation** for any October rise, with or without chicken.
4. **The weight record outranks the chicken question.** All four put it first or second. If 4.40 kg was real, this is a 3 year old cat with months of more than weekly vomiting and a 15% loss, which warrants a workup on its own.
5. **Mood carries little weight.** It is welcome, and it cannot carry a clinical conclusion either way.
6. **Episodes 2 and 3 deserve respect.** Back to back mornings, hours after food, is not the scarf and barf pattern, even though the rabbit phase had the same shape on other days.

### 6.2 Where they leaned differently

No true persona conflict. The lenses differ in what to do *while* the vet is consulted:

| Lens | Lean |
|---|---|
| GI Internist | Continue only with a pre agreed stopping rule, or (preferred) reset and rechallenge cleanly; start the workup now |
| Nutritionist | Current challenge is uninterpretable; reset 2 weeks, then a clean single ingredient challenge |
| Criticalist | The chicken verdict can wait; verify weight and start the workup within days |
| Skeptical GP | Leans noise for now; A/B/A design is the only thing that settles it |

### 6.3 The paths, for the owner and Nyx's vet to decide

| Path | What it buys | What it costs |
|---|---|---|
| **A. Continue the current rechallenge to day 14 (11-01)** with a stop rule agreed with the vet in advance | No change today; more data | Even at day 14, a real relapse is caught only ~half the time, and the result still can't separate chicken from rice, gums or format |
| **B. Return to rabbit and call chicken the allergen** | Simplest diet going forward | None of the four lenses thinks the data earns that verdict; forecloses chicken on weak evidence |
| **C. Reset, then rechallenge cleanly** (2 weeks on one fixed rabbit base; then plain chicken breast only, weighed at ~10 to 15% of daily food, mixed into her usual food, 3 to 4 weeks, stop rule agreed in advance) | The only version that can actually answer "is it chicken?" | Slower; another month or more |

Path C is **not** calling chicken the culprit. It is the version of the test that can answer the question the owner is asking. GI Internist, Nutritionist and Skeptical GP leaned toward it; the Criticalist was indifferent to the chicken path and focused on the workup.

Whatever path: **verify the weight and talk to the vet this week.**

### 6.4 Chair's falsification line

*Tried: the "baseline noise" read against the two delayed morning episodes on days 8 and 9.* It held, weakly: the rabbit phase produced the same delayed, early morning shape (09-04, 09-07, 09-22), and a 5 episode cluster in 9 days (09-17 to 09-26) with no chicken at all. *Tried: the "nothing to work up" read against the weight record.* It failed: if 4.40 kg is real, no dietary explanation covers a 15% loss, and if it isn't, more than weekly vomiting on a novel protein diet for 3 months still meets the workup bar.

---

## 7. Escalation triggers (consolidated)

**Go in now**
- More than 3 vomits in 24 hours, or repeated retching with nothing coming up
- Blood, or dark "coffee ground" material, in vomit
- Open mouth breathing, or a sleeping breathing rate over 40 a minute
- Collapse, hiding, or marked lethargy
- A painful belly, or a hunched posture together with vomiting
- Yellow gums

**Call the vet the same day**
- Eating less, or nothing for 24 hours
- Vomiting on a third day in a row
- Hair or foreign material in a vomit
- New diarrhoea
- Drinking or urinating more than usual
- The cough getting more frequent
- Any weight under 3.7 kg

## 8. Open questions for the owner

1. **Was 4.40 kg on 06-15 a real weigh-in, or an entry error when it was backfilled on 10-09?** This changes the urgency more than anything else here.
2. Was the 10-27 07:44 vomit right after eating, or found later? (It is logged as witnessed, 66 min after a rabbit treat.)
3. Is the cough still being followed with the vet, and has anyone looked at it since the prednisolone ended?

## 9. Product findings from this pass

- **The "three days in a row" read is wrong for this record.** The 10-27 read says *"Nyx has vomited on three days in a row"*; she vomited on two calendar days. Cause: the T8 rule in `lib/incidentFloor.ts` tests three back to back 24 hour spans, and the two 10-26 logs 16 minutes apart straddle a span boundary, so one episode fills two spans. The tier (call today) errs loud, but the sentence states a false fact. Already tracked as [CUL-2223](https://linear.app/projectnyx/issue/CUL-2223) (In Progress); no duplicate filed.
- **The rechallenge is invisible to the trial record.** The schema has `phase = reintroduction`, but Nyx's trial was closed as `elimination` on 10-20 and chicken never joined `diet_trial_foods`, so trial aware surfaces and the vet report don't know a challenge is running. That was a logging choice, not a missing feature; it is noted because the vet report would currently not show it.
- **Portions and intake are the biggest data gap.** Every meal has `quantity = unknown` and intake ratings are almost all blank. Every lens named this as a blind spot, and it is why "1/3 chicken" can't be checked against the record.

---

## Appendix A. Reproducing the numbers

Episode clustering and period rates (Postgres):

```sql
with v as (
  select occurred_at from events
  where pet_id = 'bf7b196e-6db1-4a34-af34-f1759d380042'
    and event_type = 'vomit' and deleted_at is null
), ep as (
  select occurred_at,
    case when occurred_at - lag(occurred_at) over (order by occurred_at) < interval '90 minutes'
         then 0 else 1 end as new_ep
  from v
)
select occurred_at from ep where new_ep = 1 order by occurred_at;
```

Period boundaries used (UTC): pretrial `[2026-05-14 05:00, 2026-07-26 05:00)`; rabbit weeks 1 to 5 `[07-26 05:00, 09-01 05:00)`; rabbit pre steroid `[09-01 05:00, 09-21 05:00)`; on prednisolone `[09-21 05:00, 10-12 05:00)`; off steroid pre chicken `[10-12 05:00, 10-18 20:13)`; chicken `[10-18 20:13, 10-27 18:00)`.

Rolling window and Poisson figures: a sliding 8.91 day window stepped hourly across `[2026-07-26 05:00, 2026-10-18 20:13)` UTC over the clustered episode list; P(X ≥ k) under Poisson(rate × days / 7); alarm thresholds chosen as the smallest k with false alarm ≤ 0.10 against 1.49/wk.

Episode list (UTC, clustered):
2026-05-14T11:27, 05-15T12:11, 05-18T08:09, 05-18T21:02, 05-19T09:18, 05-20T23:58, 05-25T05:18, 05-25T10:31, 05-30T09:00, 05-30T12:21, 06-05T15:41, 06-08T08:15, 06-09T16:00, 06-10T11:40, 06-11T18:01, 06-15T10:00, 06-21T01:38, 06-21T22:06, 06-24T08:39, 06-25T13:00, 06-27T18:13, 06-29T14:28, 07-05T03:43, 07-05T12:11, 07-09T17:21, 07-10T22:45, 07-15T01:02, 07-18T10:54, 07-23T17:01, 07-25T18:36, 07-27T15:56, 08-02T07:04, 08-05T10:18, 08-09T00:54, 08-19T22:40, 08-24T07:02, 09-04T12:02, 09-07T11:00, 09-07T21:00, 09-12T17:18, 09-17T15:58, 09-17T22:11, 09-21T21:40, 09-22T06:30, 09-26T00:08, 10-09T19:53, 10-14T22:44, 10-16T12:33, 10-18T20:39, 10-26T11:10, 10-27T12:44.
