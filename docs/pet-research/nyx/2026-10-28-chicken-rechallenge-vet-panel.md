# Nyx's chicken rechallenge: a vet panel read of the record

**Date:** 2026-10-28, refreshed 12:30 CT with two new vomits (10-27 19:40, 10-28 11:43). The first version of this file (data to 10-27) shipped in PR #1340; git history keeps it.
**Prepared for:** the PM, as Nyx's owner
**Lenses (independent, isolated reads, reconvened on the refreshed data):** GI Internist (DACVIM, feline focus) · Veterinary Nutritionist (DACVN) · Emergency/Criticalist (DACVECC) · Skeptical GP. Chaired and reconciled by the GP lens (Dr. Alex Chen). Method: `docs/vet-specialist-panel.md` §4.2.
**Companion:** [`2026-10-28-chicken-rechallenge-vet-summary.md`](./2026-10-28-chicken-rechallenge-vet-summary.md), a one page version to bring to Nyx's vet.

> **Data note.** Same boundary as [the June panel deep dive](../../research/2026-06-vet-council-nyx-deep-dive.md): this analyses the PM's own cat ("Nyx", `pets.id = bf7b196e-6db1-4a34-af34-f1759d380042`) in the PM's own database, at the PM's explicit request. It is identifiable pet health narrative. It is evidence for a conversation with Nyx's vet, not a diagnosis and not a treatment decision; no lens examined the cat.

---

## 0. Bottom line

**All four lenses, independently: call Nyx's vet today, and have her examined within 24 to 48 hours.**

1. **Something changed on 10-26.** Four vomiting episodes in 53.5 hours, on three days in a row, each 1 to 5 hours after eating with food in it. Nothing like it appears anywhere in her record: on rabbit she never had more than 2 in any 60 hour stretch, and even before the trial the most was 3.
2. **The stop signs the panel set yesterday have been met.** Vomiting on a third day in a row, two episodes within 24 hours (10-27), and 5 episodes by day 10 against a day 14 line of 6.
3. **Today's vomit may have blood in it** (the photo read says "unsure").
4. **It still does not convict chicken.** Vomiting rose as the chicken purée was cut back, not as it was given most. Rice, guar gum, tapioca, vegetable oil and more meals came in at the same time. Prednisolone, which may have been holding down inflammation, ended 16 days before the cluster.
5. **The weight question is still open and still matters most:** 4.40 kg on 06-15, 3.73 kg on 09-16. If both numbers are real, the loss predates chicken and needs a workup whatever the diet answer is.

### The table

| Period | Vomiting episodes per week |
|---|---|
| Before the trial (mixed diet, mostly chicken) | 2.88 |
| Rabbit, August | 1.14 |
| Rabbit, September, no steroid | 2.10 |
| Rabbit, on prednisolone (9/21 to 10/11) | 1.33 |
| Rabbit, after prednisolone stopped | 2.11 |
| **Chicken rechallenge (from 10/18)** | **3.54** |
| &nbsp;&nbsp;&nbsp;Chicken, first week (10/18 to 10/25) | 0.95 |
| &nbsp;&nbsp;&nbsp;Chicken, 10/26 to 10/28 | 11.1 |

---

## 1. What changed since the 10-27 read

| | 10-27 read | 10-28 refresh |
|---|---|---|
| Rechallenge episodes | 3 in 8.9 days | **5 in 9.9 days** |
| Rechallenge rate | 2.36 a week | **3.54 a week** (95% CI ~1.15 to 8.26) |
| Share of rabbit phase windows this busy | 34% had 3 or more | **2.5% had 5 or more** |
| Tightest cluster | 2 episodes in ~25 h | **4 episodes in 53.5 h** (no precedent) |
| Consecutive days | 2 | **3** (10-26, 10-27, 10-28) |
| Blood seen | none | **"unsure" on 10-28** |
| Panel verdict | neither convicts nor clears chicken; baseline noise not ruled out | **a real change; cause unresolved; vet today** |

The PM's earlier prior (three vomits may be baseline) was a fair read of the 10-27 data and the panel agreed it could not be ruled out. Two more episodes in 28 hours moved the record past anything in her rabbit phase.

## 2. Trigger

The PM asked the vet panel to read Nyx's backend data. Nyx finished a ~12 week rabbit elimination trial and chicken went back in on 10-18 at roughly 1/3 chicken, 2/3 rabbit. The question: stay on the chicken reintroduction, or go back to rabbit and call chicken the culprit? On 10-28 the PM logged two more vomits and asked for the analysis to be rerun and these files overwritten.

Culprit itself never recommends continuing or stopping a diet trial. This document follows the same line: it lays out evidence, differentials and paths, and the decision belongs to the owner and Nyx's vet.

## 3. What was pulled

From the production database (Supabase project `aigchluqluzuhtbfllgh`), for Nyx only, live rows only (`deleted_at is null`), times in the account timezone **America/Chicago**:

| Source | What |
|---|---|
| `events` + `meals` + `food_items` + `meal_components` | Every meal 10-10 to 10-28 with product, protein and mixed bowl shares; ingredient lists of both chicken products |
| `events` + `event_ai_analysis` | All 57 live vomit logs since 05-14, with the photo read, tier and contextual flags |
| `diet_trials` + `diet_trial_foods` | The rabbit trial record and its allowed set |
| `medications` + `medication_administrations` | Prednisolone, Motozol, cetirizine dose logs |
| `looks` | All 15 Noticed entries |
| `weight_checks`, `pets.weight_kg` | Both weights on file (nothing new since 09-16) |
| `intake_checks` | The intake answers on the 10-26 and 10-28 vomits |
| `events` (cough, sneeze, itch, other) | Non GI signs since 09-01 |

**Mixed meals: no backfill needed.** Before mixed bowls shipped, rabbit and chicken were logged back to back; from 10-22 the mixed bowls are logged as 2/3 RC rabbit wet + 1/3 Applaws. Both shapes read correctly.

**Episode definition.** Vomit logs within 90 minutes of each other count as one episode (merges the two 10-26 logs 16 min apart, and two 09-25 logs 62 min apart).

## 4. The record

### 4.1 Patient

- Cat, female, American Shorthair, born 2023-09-01 (3 years 1 month).
- Weight on file: **4.40 kg dated 06-15** (home scale, entered retroactively on 10-09) and **3.73 kg on 09-16** (home scale). No weight since. **Unverified; see §9.**

### 4.2 Diet timeline

- **Before the trial (05-14 to 07-25, 73 days).** Rotating commercial wet foods and treats, mostly chicken based (Fancy Feast, Hill's, Instinct, Tiki Cat, Sheba, Temptations, Friskies Party Mix, Delectables lickables), plus some beef, duck, turkey and fish.
- **Rabbit elimination (07-26 to 10-18).** Royal Canin Selected Protein PR dry (peas, rabbit meal, pea protein, coconut oil, hydrolyzed soy protein, fish oil, ...) and wet; Instinct LID Rabbit wet; cooked rabbit; Rayne Rabbit Rewards; Vital Essentials freeze dried rabbit. Slow feeder from ~09-21, dry food only. Recorded **completed 10-20, outcome "improved"**; owner note *"mostly down to scarf and barfs now."*
- **Chicken rechallenge (from 10-18 ~15:13).** Two chicken products, both new to her:

| Product | Ingredients | How it was fed |
|---|---|---|
| Blue Buffalo Tastefuls Purées with Chicken (lickable) | Chicken broth, chicken, **tapioca starch, vegetable oil, guar gum** | Purées per day 10-18 to 10-25: 2, 3, 2, 3, 5, 2, 3, 3. Then **1, 1, 0** on 10-26, 10-27, 10-28. |
| Applaws Chicken Breast in broth | Chicken breast, chicken broth, **rice** | From **10-19**: alone at first (about 2 a day), then in mixed bowls of 2/3 RC rabbit wet + 1/3 Applaws from 10-22. Roughly 1 to 2 servings a day throughout. |
| Royal Canin Selected Protein PR (rabbit), Rayne rabbit treats | rabbit | Throughout |

- Logged meals per day: 10-10 to 10-17: 4, 6, 6, 5, 4, 3, 3, 1 · 10-18 to 10-25: 10, 8, 7, 10, 8, 7, 7, 11 · 10-26: 6 · 10-27: 4 · 10-28 (to noon): 1. Portions are never recorded and intake is almost never rated, so fewer logs is not by itself evidence she ate less; logging density also varied before chicken (one log on 10-17).
- **Trial record.** The schema supports `phase = reintroduction`, but Nyx's trial was closed as `elimination` on 10-20 and chicken never joined `diet_trial_foods`, so the app's trial aware surfaces don't know a rechallenge is running.

### 4.3 Medications and other signs

| Item | Dates | Notes |
|---|---|---|
| **Prednisolone 5 mg PO** (for cough, Dr. Miller) | 09-21 to ~10-10 | Daily ~10 days (many doses logged "partial", given in food), then every 48 h. Last dose logged **10-10**: 8 days before chicken, 16 days before the cluster. |
| Cetirizine | 10-03, 10-11, 10-12, 10-20, 10-24 | Intermittent |
| Motozol (otic) | 07-16 to 08-09; 09-21 to 09-27 | Ear infection |
| Cough | 33 logs since 07-01 | Most recent 10-21 |
| Sneeze | 15 logs | Most recent 10-24 |
| Itch / ear | Through 09-13 | Nothing since |
| Stool | None live | 8 diarrhea logs in May and June, later deleted; no stool record exists |

### 4.4 Vomiting rate by period

| Period | Days | Episodes | Per week |
|---|---|---|---|
| Before the trial (mixed diet, mostly chicken) | 73.0 | 30 | **2.88** |
| Rabbit, August (07-26 to 08-31) | 37.0 | 6 | 1.14 |
| Rabbit, September, no steroid (09-01 to 09-20) | 20.0 | 6 | 2.10 |
| Rabbit, on prednisolone (09-21 to 10-11) | 21.0 | 4 | 1.33 |
| Rabbit, after prednisolone stopped (10-12 to 10-18) | 6.6 | 2 | 2.11 |
| **Chicken rechallenge, all (10-18 15:13 to 10-28 12:30)** | **9.9** | **5** | **3.54** (95% CI ~1.15 to 8.26) |
| Chicken, first week (10-18 to 10-25) | 7.4 | 1 | 0.95 |
| Chicken, 10-26 to 10-28 | 2.5 | 4 | 11.1 |
| All rabbit (07-26 to 10-18) | 84.6 | 18 | 1.49 |
| Last 30 days on rabbit | 30.0 | 6 | 1.40 |

### 4.5 Episodes per calendar week (Monday start)

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
| Jul 13 | 2 | | Oct 19 | 0 (first full chicken week) |
| Jul 20 | 2 | | **Oct 26** | **4 by Wednesday noon** |
| **Jul 27 (rabbit starts)** | 2 | | | |
| Aug 3 | 2 | | | |
| Aug 10 | 0 | | | |

The decline began before rabbit (late June and July ran 3, 3, 3, 2, 2, 2); the 2.88 pretrial average is pulled up by May, which was also the owner's first weeks with the app.

### 4.6 How unusual is the current picture?

| Measure | Rabbit phase | Before the trial | Now |
|---|---|---|---|
| Most episodes in any 60 hour window | 2 | 3 | **4** (in 53.5 h) |
| Longest run of consecutive vomiting days | 2 | 4 | **3** |
| Share of 9.9 day windows with 5+ episodes | 2.5% (max 5) | 25% (max 6) | **5** |

Poisson probability of what has happened, if her true rate were still...

| Rate | 5+ in 9.9 days | 4+ in 2.25 days |
|---|---|---|
| Last 30 days on rabbit (1.40/wk) | 0.05 | |
| All rabbit (1.49/wk) | 0.06 | 0.0015 |
| September rabbit, no steroid (2.10/wk) | 0.18 | |
| Pretrial (2.88/wk) | 0.38 | 0.015 |

Vomiting clusters, so true probabilities are higher than Poisson says. Read these as orders of magnitude, and note the 60 hour window was chosen after the cluster was seen.

### 4.7 The rechallenge episodes

| # | Day | When (CT) | What she ate before | What came up | App read |
|---|---|---|---|---|---|
| 1 | 1 | 10-18 15:39 | RC rabbit kibble **2 min** before; first chicken purée 27 min before | Foamy, white, partly digested food | Logged, monitor |
| | 2 to 7 | 10-19 to 10-25 | | **No vomiting** | |
| 2 | 8 | 10-26 06:10 and 06:26 (two logs, one episode) | RC rabbit kibble 3.4 h before; chicken purée 4.5 h before | Brown, chunky, undigested food; no bile, no blood seen | Call today |
| 3 | 9 | 10-27 07:44 | Rabbit treat 66 min before; chicken purée 2.1 h before | Tan, chunky, partly digested food with liquid; no bile, no blood seen | Call today |
| 4 | 9 | **10-27 19:40** | Mixed bowl (2/3 rabbit, 1/3 Applaws) 3.7 h before | Tan, chunky, partly digested food; no bile, no blood seen | Call today |
| 5 | 10 | **10-28 11:43** | Mixed bowl 4.7 h before | Brown, soft formed, partly digested food; no bile; **blood "unsure"** | Call today: three days in a row |

- **Pattern shift:** episode 1 has scarf and barf timing; episodes 2 to 5 all came 1 to 5 hours after eating with food in them. The rabbit phase had some delayed vomits too (09-04, 09-07, 09-22), so the shift is partial, not total.
- Intake checks after episodes 2 and 5: the owner answered that she had been fed since the previous morning/afternoon. Amounts eaten are unrated.

### 4.8 Rabbit phase vomiting, for comparison (09-01 onward)

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
| 09-25 20:10 | 81 | Yellow, foamy, bile | Same episode; "hunched" look that evening |
| 10-09 14:53 | 0 | Tan, food | "Happened right after eating" |
| 10-14 17:44 | 0 | Tan, food | |
| 10-16 07:33 | 2 | Tan, food, hair | |

The app's "reduced intake" flag on 09-04, 09-22, 09-25 and 10-09 fires on blank intake ratings, not on observed refusal; it is weak evidence either way.

### 4.9 Noticed (owner observed behaviour)

| Day | Look |
|---|---|
| 09-22, 09-23, 09-24 | Nothing unusual |
| 09-25 | Played; **hunched** (evening of two vomits, on prednisolone) |
| 09-26 | Played |
| 10-03, 10-06 | Nothing unusual |
| 10-08 | Played |
| 10-11, 10-13 | Nothing unusual |
| 10-20, 10-21, 10-23 | Played (on chicken) |
| **10-27** | **Nothing unusual** (evening, after two vomits that day) |

---

## 5. Method

Per `docs/vet-specialist-panel.md` §4.2: each lens ran as an isolated subagent with a fresh context, read only the same computed and data minimized evidence pack, and returned the §5 output contract. No lens saw another's read or its own 10-27 read; they were reconvened fresh on the refreshed pack rather than shown yesterday's conclusions. The model was held constant across lenses. Every lens inherited the two safety invariants verbatim: **n=1 / absence never reassures**, and **intake is not preference**. The chair (Dr. Chen, GP) reconciled the reads in §7 and checked their factual claims against the record (§7.3).

---

## 6. The panel reads (10-28 refresh)

### 6.1 GI Internist (DACVIM, feline focus)

**Gestalt.** The cluster since 10-26 has no precedent in this record. It is 4 episodes in 53.5 h on 3 consecutive days, the vomit now comes 1 to 5 h after meals with food in it, blood is possible, and a 15% weight loss may be real. It is associated with the rechallenge period, but the data cannot say chicken is the cause. Whatever the diet question turns out to be, she should be seen. The vet's findings should come before the diet verdict.

**Ranked differentials**
1. *Adverse food reaction to a new item.* For: the chicken heavy pretrial rate was highest; it fell on rabbit; a day 8 onset fits a delayed immune mediated reaction. Against: the first chicken week was the cleanest week (0.95/wk); vomiting rose as the purée dropped to once a day, so the dose response runs backwards; chicken, rice, guar gum, tapioca and the new products can't be told apart.
2. *Chronic enteropathy (IBD, steroid responsive) flaring after prednisolone stopped.* For: vomiting never reached zero on rabbit; September off steroid ran 2.10/wk; the cluster began 16 days after the last dose; delayed postprandial vomiting fits gastric or proximal intestinal inflammation or slowed emptying; the weight loss fits if real. Against: the first 8 days off steroid, and then the first chicken week, were quiet.
3. *Acute new process (partial obstruction from a hairball or foreign material, gastritis, pancreatitis).* For: an unprecedented cluster; suspected foreign material on 09-22; undigested food coming up hours after meals; blood "unsure". Against: she is eating, playing and behaving normally. Normal behaviour does not rule this out.
4. *Small cell lymphoma.* Less likely at 3 years old; if the weight loss is confirmed, it stays on the list until imaging or tissue says otherwise.
5. *Mechanical / scarf and barf.* Least likely now; the pattern has moved away from vomiting minutes after eating.

**Shows vs cannot rule out.** Shows: an association between the rechallenge period and a cluster that exceeds every rabbit phase window and the pretrial maximum; a change in character. Cannot rule out: chicken being innocent, rice or the purée base, a steroid withdrawal flare, an obstruction, inflammation predating the trial, or weight loss.

**Falsification.** Leading hypothesis: a reaction to the new diet. Counterexample: if chicken were the trigger, the week with the most chicken (~3 purées a day) should have vomited most; it vomited least. "Chicken specifically" did not hold. "Something introduced in the rechallenge" survived only partly; steroid withdrawal explains the same timeline as well. An honest verdict is not possible from this data.

**Blind spots.** No stool record (the biggest gap for an enteropathy workup); weight unverified and none since 09-16; no portions or intake; no bloodwork, B12 or imaging; vomiting not confirmed against regurgitation; the cough and steroid history may point to asthma; no water intake.

**Paths.** *Continue:* produces information but puts a possibly unwell cat at risk until acute causes are ruled out; not "wait and see." *Return to rabbit:* works as a dechallenge; if vomiting stops within days, that supports a diet link, but does not convict chicken or rule out other causes. *Third path:* stop the challenge now and get her examined; once stable for 2+ weeks, rechallenge one ingredient at a time (plain chicken only, no rice, no purée base). *Urgency:* call today; exam within 24 to 48 h; sooner if she refuses food, vomits repeatedly in a day, seems lethargic, shows visible blood, or vomits bile with nothing else. *Start measuring:* a verified weight today, then weekly; rated intake per meal second.

**For the vet, today.** The cluster timeline and the 10-10 prednisolone stop; the possible 4.40 to 3.73 kg loss; minimum workup: exam with abdominal palpation, clinic weight and muscle condition score, CBC, chemistry, urinalysis, fPLI, cobalamin and folate, FeLV/FIV, fecal, radiographs if obstruction is suspected; abdominal ultrasound if weight loss is confirmed or vomiting persists after going back to rabbit; biopsy only if both persist. Ask whether the rechallenge can be read at all while a steroid withdrawal flare is possible.

### 6.2 Veterinary Nutritionist (DACVN)

**Gestalt.** This was not a clean chicken challenge: it added chicken, rice, tapioca, guar gum, an unnamed vegetable oil, a new lickable format and roughly twice as many meals at once. The rise after day 8 is a real red flag, made more urgent by a possible 15% weight loss, but it does not show chicken is the culprit.

**Ranked explanations (diet design view)**
1. *Reaction to the challenge package (chicken or its carriers).* For: 4 episodes in 53.5 h with no rabbit precedent; the chicken heavy pretrial rate was 2.88; vomiting fell on rabbit. Against: zero episodes on days 2 to 7 when purée exposure was highest; wide CI.
2. *A non chicken ingredient, or the change in volume and format.* For: rice is new; episodes 4 and 5 each followed a mixed bowl; logged meals jumped to 7 to 11 a day. Against: episodes 2 and 3 followed purée or rabbit, not Applaws.
3. *An underlying enteropathy unmasked after prednisolone stopped.* For: weight loss, ongoing cough, and a rabbit phase rate that rose again off steroid. Against: the on steroid rate (1.33) was barely lower; the cluster began 16 days after the last dose.
4. *Background clustering (hair, eating behaviour).* For: pretrial had 3 to 4 day runs. Against: none of these is scarf and barf.

**Shows vs cannot rule out.** Shows: vomiting during the challenge is more frequent, more clustered and different in pattern, in time order after the diet changed. Cannot rule out: chicken vs a carrier, a non diet disease, or chance clustering. "Happier" is about palatability, not wellness.

**Falsification.** If chicken were the trigger, days 2 to 7 at ~3 purées a day should have produced vomiting; they produced none (partly answered by delayed reactions). Purée dropped to 1 a day on 10-26 yet vomiting rose: the dose response runs the wrong way for the purée. The hypothesis survives only as "something in the challenge," not "chicken."

**Blind spots.** No portions, grams or calories; no current weight; no stool record; source of the "vegetable oil" unknown; neither chicken product is likely complete and balanced (both look like toppers), so if they displace rabbit wet, calories may fall; the rabbit base itself rotated across several products and treats.

**Paths.** *Continue as is:* more data but muddy; with a red flag present, not without the vet's word. *Return to rabbit:* a reasonable step back; improvement within ~2 weeks would support a diet link, not prove it. *Redesigned challenge, later:* only once baseline is stable and weight confirmed; one fixed rabbit product, no rotating treats; add only plain cooked chicken breast (no broth, rice or gums) weighed at a fixed 10 to 20% of daily calories; same meal count and format; 14 days; stop rule in advance (2 episodes in 48 h, blood, refusal or lethargy means stop and call the vet); if negative, test rice or the commercial products separately. *Start measuring:* weekly weight on the same gram scale; grams offered and left over next.

**For the vet, today.** Three days in a row, possible blood and a possible 15% weight loss each warrant a call on their own. Ask: a clinic weight; pause the challenge or not; whether a workup is warranted for an enteropathy prednisolone may have masked; whether the challenge was valid as designed and the products complete and balanced; how to design a stop rule challenge.

### 6.3 Emergency / Criticalist (DACVECC)

**Gestalt.** The record shows a change, not just more vomiting: four food containing vomits in 53.5 hours, 1 to 5 hours after meals, on three days in a row, on top of an unverified 15% weight drop that predates chicken, with possible blood today. **Urgency: call today, with an exam and clinic weight within 24 to 48 hours.** Not "go now" unless a trigger below appears.

**Red flags present.** The weight drop (if real, predating both chicken and prednisolone); blood "unsure" on 10-28; the pattern shift from scarf and barf to delayed, food containing vomits; a 60 hour cluster never seen on rabbit and 3 consecutive days; prednisolone ended 10-10 after inconsistent dosing, with 33 cough logs.

**Absent but not reassuring.** "Nothing unusual" on 10-27 and "happier" overall (cats mask illness; one evening's impression); no bile or blood "seen" on episodes 2 to 4 (a photo read); "fed since yesterday" (amounts unrated).

**Shows vs cannot rule out.** Shows: the rate rose in association with the chicken phase, but only from day 8. Cannot rule out: hepatic lipidosis risk if intake is quietly falling; partial obstruction or foreign body; IBD or small cell lymphoma; pancreatitis; steroid associated GI ulceration or diabetes; heartworm associated respiratory disease (cough and vomiting together); FeLV/FIV; a reaction to volume and texture rather than chicken.

**Falsification.** Leading concern: a separate, progressing process hidden by the chicken question. Counterexample: the pretrial chicken diet produced 3 to 4 day runs and 25% of pretrial windows had 5+ episodes, so on rate alone this fits a return to chicken baseline. The concern holds on what chicken does not cover: the weight drop predates chicken, and the vomits are now delayed and contain food.

**Blind spots.** No stool record; no portions or intake; no weight in 6 weeks and the baseline unverified; no water, urination or gum colour; photo only blood read; cough, retching and hairball may be confused; logging attention rose when chicken started.

**Escalation triggers**
- *Go now:* clear red blood or coffee ground material in vomit, or black tarry stool; can't keep water down, or unproductive retching; nothing eaten for 24 hours; 3 or more vomits in 24 hours; hiding, lethargy, hunched posture or a painful belly; open mouth or laboured breathing; pale or yellow gums; string visible under the tongue or at the anus.
- *Call today (already met):* any further vomit; any meal clearly refused or left; a home weight below 3.73 kg.

**For the vet, today by phone.** The 10-28 photo and the weight history, so the 4.40 can be confirmed or struck; the full prednisolone course and cough log; that vomiting is now delayed and contains food; whether an exam with clinic weight and baseline tests (bloodwork, retrovirus and heartworm testing, fecal, possibly imaging) should come before the chicken question. Whether to pause the rechallenge is the vet's call; pausing without a plan will confound the answer.

### 6.4 Skeptical GP

**Gestalt.** Something changed on 10-26; four episodes in 53.5 hours across three consecutive days is a cluster this record has not shown before. The data cannot tell chicken apart from the other things that changed around the same time, and the cluster is a reason to call the vet today whatever is causing it.

**Three cases**
- *Baseline noise:* the whole chicken phase rate (3.54, CI 1.15 to 8.26) overlaps September's no steroid rabbit rate (P(5+) = 0.18); the first chicken week had 1 episode, below any rabbit period; 25% of pretrial windows reached 5+; the 60 h window and day 8 split were picked after the cluster was seen.
- *Chicken reaction:* no 60 h rabbit window had more than 2; episodes 2 to 5 came 1 to 5 h after meals with food in them; relapse days after reintroduction fits food responsive disease; the chicken phase rate looks like the pretrial chicken heavy rate.
- *Third explanation:* prednisolone ended 10-10 and may have been holding down steroid responsive inflammation (the cough suggests airway, possibly gut too), with a rebound 2 to 3 weeks later plausible; also new at the same time: rice, tapioca, guar gum, vegetable oil, more wet food and more meals; or an unrelated acute gastritis or hairball, with an unverified weight loss behind it all.
- *Weighting:* the chicken phase (chicken or its new carriers) about 40%, a third explanation about 40%, noise about 20%. Against the purée in particular: it dropped to 1 a day just as vomiting rose.

**Shows vs cannot rule out.** Shows: a new tight cluster, a timing shift, possible blood, intake still unrated. Cannot rule out: steroid rebound, a non chicken ingredient, acute illness, real weight loss, or that the August improvement was partly a logging artifact. Behaviour logs are low sensitivity; they can raise a flag (the 09-25 hunch) but cannot reassure; "happier since chicken" likely reflects liking the food, and liking a food is not tolerating it.

**Falsification.** Reading: a real change, cause unresolved. Check 1: was the hours after a meal pattern new? Rabbit had some (09-04, 09-07, 09-22), so the shift is partial. Check 2: is the cluster unusual against pretrial? Three day runs happened then, but never 4 episodes in 60 h. The reading held, with its weaker half named.

**Blind spots, including in the pack.** Pretrial overlaps the owner's most watchful first weeks (the 47 deleted logs all predate 09-01); period boundaries were cut at medication dates after the fact; no pretrial vomit character in the pack, so the pattern shift has no pretrial comparison; meal logging density rose in the chicken phase, and a more watchful owner logs more vomits; clustering makes Poisson overconfident; no hairball, grooming, stool, water or litter record; the 90 minute rule is untested. The August improvement (1.14/wk) came before both the slow feeder and the steroid, so neither explains it.

**What would settle it.** A clean dechallenge and rechallenge, only after the vet has ruled out acute disease: rabbit only until 2 to 4 weeks are back at the rabbit phase rate, then plain chicken (no rice or gums), watched 14 days. Two matching cycles would be convincing. Horizon: about 6 to 10 weeks. *Start measuring:* weekly weight, same scale, same conditions; fraction of each portion eaten next.

**For the vet.** Three days in a row and possible blood: same day assessment? Is 4.40 kg real? Could stopping prednisolone have unmasked airway or gut inflammation? Bloodwork, abdominal exam, foreign body or hairball? Should chicken, or all new ingredients, stop now, and how should a cleaner rechallenge be designed?

---

## 7. Chair's reconciliation (Dr. Alex Chen, GP)

### 7.1 Where all four agreed

1. **Call the vet today; exam and clinic weight within 24 to 48 hours.** Unanimous, unprompted. No lens called it "go now" yet; all listed the triggers that would make it one (§8).
2. **The cluster since 10-26 is a real change**, not her background. Four in 53.5 hours exceeds every rabbit phase window and the pretrial maximum.
3. **It does not convict chicken.** Three lenses ran the same falsification independently and it failed the same way: the heaviest chicken week was her quietest, and vomiting rose as the purée was cut back.
4. **The competing explanations are live:** the non chicken ingredients and the change in meal count and format; a steroid withdrawal flare of an underlying enteropathy; an acute process (hairball, foreign material, gastritis, pancreatitis).
5. **The weight still outranks the diet question.** If 4.40 kg was real, the loss predates chicken.
6. **Mood cannot carry weight.** "Nothing unusual" on 10-27 and "happier with chicken" are welcome and cannot reassure.

### 7.2 How the panel moved since 10-27

| | 10-27 | 10-28 |
|---|---|---|
| Is the rechallenge vomiting her background? | Can't tell; leaning noise | **No: a cluster with no precedent** |
| Is chicken the culprit? | Can't tell | **Still can't tell** |
| Urgency | Verify weight and talk to the vet this week | **Call today; exam within 24 to 48 h** |
| Continue the current rechallenge? | Possible with a pre agreed stop rule | **The stop rules set on 10-27 have been met; whether to pause is the vet's call, today** |

### 7.3 Chair's corrections to the lens reads

- **Rice did not start on 10-22.** Two lenses read the mixed bowls as rice's start. Applaws (chicken with rice) was fed alone from 10-19, about 2 a day, then in mixed bowls from 10-22, so rice exposure was roughly steady across the whole rechallenge, including the quiet first week. That weakens "rice restarted the clock on 10-22." It does not clear rice: it remains untested apart from chicken.
- Every other factual claim in the four reads was checked against the record and holds.

### 7.4 The paths, for the owner and Nyx's vet to decide today

| Path | What it buys | What it costs |
|---|---|---|
| **A. Pause the rechallenge and go back to rabbit only, after talking to the vet** | A dechallenge: if vomiting settles within days, that supports a link to something in the rechallenge | Does not convict chicken (or clear rice, the purée base or steroid withdrawal); a vet exam is still needed |
| **B. Continue the current rechallenge** | More data | Every lens advised against continuing without the vet's word now that red flags are present; the result still can't isolate chicken |
| **C. Examine first, then a clean single ingredient rechallenge later** | The only version that can answer "is it chicken?" (stable rabbit baseline, then plain chicken breast only, weighed, same meals and format, 14 days, stop rule agreed in advance) | Slower: 6 to 10 weeks to a convincing answer |

A and C are not alternatives: A is what the dechallenge half of C looks like. **Going back to rabbit is not the same as calling chicken the allergen.** The data can support the first without the second.

### 7.5 Chair's falsification line

*Tried: "this is just the pretrial chicken baseline returning".* It fits the rate: 25% of pretrial windows held 5+. It fails the shape: even pretrial never produced 4 episodes in 60 hours, and the weight drop predates chicken. *Tried: "chicken did it".* It fails the dose: the heaviest chicken week was the quietest, and vomiting rose as the purée fell. *What survives:* a real change, temporally associated with the rechallenge and with steroid withdrawal, cause unresolved, warranting an exam now.

---

## 8. Escalation triggers (consolidated)

**Go in now (emergency)**
- Clear red blood or coffee ground material in vomit, or black tarry stool
- Can't keep water down, or retching with nothing coming up
- Nothing eaten for 24 hours
- 3 or more vomits in 24 hours
- Hiding, lethargy, a hunched posture or a painful belly
- Open mouth or laboured breathing
- Pale or yellow gums
- String visible under the tongue or at the anus

**Call the vet today: already met.** Vomiting on a third day in a row, possible blood, and a cluster of 4 in 53.5 hours.

## 9. Open questions for the owner

1. **Was 4.40 kg on 06-15 a real weigh in, or an entry error when it was backfilled on 10-09?** A home weight today, on the same scale, would help either way.
2. Has she refused or left any meal since 10-26? The record cannot tell; intake is unrated.
3. Has anyone looked at the cough since the prednisolone ended?

## 10. Product findings from this pass

- **The "three days in a row" bug is fixed.** On 10-27 the read for that morning's vomit said "three days in a row" across two days. [CUL-2223](https://linear.app/projectnyx/issue/CUL-2223) shipped (Done 10-28), and the same read now says *"thrown up 3 times, on 2 separate days."* Today's "three days in a row" is accurate.
- **The rechallenge is invisible to the trial record.** Nyx's trial was closed as `elimination` and chicken never joined `diet_trial_foods`, so trial aware surfaces and the vet report don't show a challenge is running. A logging choice, not a missing feature; noted because the vet report would currently omit it.
- **Portions and intake are the record's biggest gap.** Every lens named it; it is why "1/3 chicken" can't be checked and why "fed since yesterday" can't establish intake.

---

## Appendix A. Reproducing the numbers

Episode clustering (Postgres):

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

Period boundaries (UTC): pretrial `[2026-05-14 05:00, 07-26 05:00)`; rabbit August `[07-26 05:00, 09-01 05:00)`; rabbit September `[09-01 05:00, 09-21 05:00)`; on prednisolone `[09-21 05:00, 10-12 05:00)`; off steroid pre chicken `[10-12 05:00, 10-18 20:13)`; chicken `[10-18 20:13, 10-28 17:30)`, split at `10-26 05:00`.

Windows: sliding windows stepped hourly over the clustered episodes, within the rabbit phase `[07-26 05:00, 10-18 20:13)` and the pretrial `[05-14 05:00, 07-26 05:00)`. Consecutive day runs use Central calendar dates. Poisson P(X ≥ k) under Poisson(rate × days / 7).

Episode list (UTC, clustered, 53 episodes):
2026-05-14T11:27, 05-15T12:11, 05-18T08:09, 05-18T21:02, 05-19T09:18, 05-20T23:58, 05-25T05:18, 05-25T10:31, 05-30T09:00, 05-30T12:21, 06-05T15:41, 06-08T08:15, 06-09T16:00, 06-10T11:40, 06-11T18:01, 06-15T10:00, 06-21T01:38, 06-21T22:06, 06-24T08:39, 06-25T13:00, 06-27T18:13, 06-29T14:28, 07-05T03:43, 07-05T12:11, 07-09T17:21, 07-10T22:45, 07-15T01:02, 07-18T10:54, 07-23T17:01, 07-25T18:36, 07-27T15:56, 08-02T07:04, 08-05T10:18, 08-09T00:54, 08-19T22:40, 08-24T07:02, 09-04T12:02, 09-07T11:00, 09-07T21:00, 09-12T17:18, 09-17T15:58, 09-17T22:11, 09-21T21:40, 09-22T06:30, 09-26T00:08, 10-09T19:53, 10-14T22:44, 10-16T12:33, 10-18T20:39, 10-26T11:10, 10-27T12:44, 10-28T00:40, 10-28T16:43.
