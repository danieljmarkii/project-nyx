# The weight lane — Requirements & PR plan (EN-8, CUL-1135)

**Version:** 1.1 · **Date:** 2026-09-29 · **Status:** 🌱 SPEC; W1 and W2 ruled (PM 2026-09-28, CUL-1390), five decisions open for the PM (W3 to W7, §0), every threshold a placeholder for the CUL-583 ruling sheet (§9). §4 and §5 carry the adversarial pass's twelve attacks (§12).
**Project:** Engines v3: the accountable engine, Wave 2, Lane F. This is PR-18a; it gates PR-18 (the migration), PR-19 (the lane in `generate-signal`) and PR-37 (the client).
**Pairs with:** `docs/culprit-engines-v3-weight-mockups.html`, published at https://claude.ai/artifact/TagYzKd662BBDPFaaSZehL (the frames; this spec cites them as **F1 to F12**) · `docs/culprit-engines-v3-mockups.html` round 2 (the Home the weight row sits in) · `docs/engines-v3-critique-2026-09.md` (GAP-20, PMD-9, MFU-8, BRK-11, R-2, R-5) · `docs/research/2026-09-engines-step-change.md` (§2 R2, §7 C3, §8 P6) · migrations 024 and 072.

---

## TL;DR, plain English

Nyx weighed 4.4 kg in June and 3.73 kg on Sep 16. Nothing in the app can say she lost weight, and today five screens would each describe a weight change a different way. This spec makes weight one story told the same everywhere, in pounds, with each reading labelled by where it was taken (at the vet, on a home scale, or an estimate). The label comes from how the reading was entered, so nobody is asked anything at the scale; an owner can correct it afterwards. A confirmed loss puts a weight row in the Signal's safety group on Home, stated as two readings and their dates, never a percentage.

Written in advance, as the plan asked: **on Nyx's record as it stands today, the weight lane says nothing,** because June's 4.4 kg is in no table. If it is re-entered, what happens depends on the PMD-9 ruling and on one fact only the owner knows (was June's weigh-in at a clinic?). §8 has the table. None of it is fixed by loosening a rule on her record.

**What you do:** rule W1 to W7 (§0). Tell us, if you know, where June's 4.4 kg was weighed (§8).

---

## 0. Decisions open for the PM

Each is a decision brief. The team's recommendation is marked. W1 to W4 gate PR-18 (the migration); W5 to W7 gate PR-37 (the client). None gates PR-19's server logic, which reads the one predicate either way.

**W1 · Where an estimate lives** (gates PR-18)
- **⚠ RULED 2026-09-28 (PM, CUL-1390): A.** Estimates never become `weight_checks` rows. Migration 081 carries it: no entry path writes `source = 'estimate'`; the only way in is an owner correcting a reading (PR-37).
- **Deciding:** whether a weight typed into Edit profile becomes a row in the weight history.
- **Options:**
  - **A, estimates stay out of `weight_checks` (recommended).** The profile field stays a snapshot, 072 keeps every value it displaces, and the lane reads those only to prompt a weigh-in. *Why:* a reader that forgets to filter cannot plot a guess on the vet report, because the guess is never in the table the report plots (BRK-11's own rule).
  - **B, every profile edit writes a `weight_checks` row with source *estimate*** (GAP-20's wording). Every reader must filter, and the one that forgets plots a typed guess.
- **Consequence:** A needs no change to EditPetModal's write and no new reader of 072 beyond the lane. B moves EditPetModal onto `insertWeightCheck` and adds a filter to five readers and a guard to keep them honest.

**W2 · What source the readings already on file get** (gates PR-18)
- **⚠ RULED 2026-09-28 (PM, CUL-1390): home scale.** Existing rows backfill as `source = 'home_scale'`, `source_basis = 'legacy'`. Migration 081 does it through the column defaults, which stay after the backfill so an installed build's weigh-in still lands; a row such a build writes is therefore also `legacy` (labelled by rule, not by the writer).
- **Deciding:** the backfill for every `weight_checks` row written before PR-18.
- **Options:**
  - **Home scale, by the rule (recommended).** Every existing row came through the log weigh-in or its edit screen (no other writer exists), so the entry-path rule gives *home scale*; the row is marked `source_basis = 'legacy'` so the correction sheet can say so. *Why:* the path is known, not guessed, and home scale is the class that needs confirmation anyway.
  - **Unknown, never anchors** (GAP-20's wording). Every existing account's history goes silent until it is re-weighed twice.
- **Consequence:** with *home scale*, Nyx's Sep 16 reading reads "on a home scale" until the owner corrects it to "at the vet" (F4); with *unknown*, it anchors nothing until corrected.

**W3 · Whether weight reaches the vet report**
- **Deciding:** what the report prints about weight once readings carry a source.
- **Options:**
  - **A, readings with their source, and one change line from the same predicate (recommended).** Kg, as the report is today, and the percentage it already prints (it is vet-facing; S3 governs owner cards). Each reading labelled clinic or home scale; estimates never plotted; the change line names both readings it compares and says whether each is confirmed. No finding row, no care state, no loss flag (report spec §3, R-2). *Why:* a vet trusts two dated, sourced readings more than an app's verdict, and today's first-to-last line would disagree with the app's own card.
  - **B, A plus the Signal's weight finding as a report finding.** Reverses the report spec's "no loss flag" rule and puts an app threshold the vets have not ratified in front of a vet.
  - **C, no change.** The report keeps first-to-last with no sources, so for the 4.0 → 4.5 → 4.05 kg cat the app says one thing and the report another.
- **Consequence:** A is a Tier-2 edit to `nyx-vet-report-requirements.md` §3.3 (sources and the anchor), rides PR-19, and needs a `vet-report-cold-read` pass. The `default: break` at `report.ts:3293` keeps dropping the weight finding type, deliberately.

**W4 · The percentage already on Patterns**
- **Deciding:** whether the design_v2 Patterns weight card keeps "(N%)".
- **Options:**
  - **Remove it (recommended).** `chartCopy.ts:225` is the one owner surface that prints a weight percentage. *Why:* the card this spec adds must not show one (S3), and a Patterns line saying "5%" beside a Signal row that fires at 5% but won't say so reads as two rules.
  - **Keep it,** and bring a better-than-the-rule brief on S3 for the Signal row too.
- **Consequence:** removal is a copy change inside `design_v2`, which has not reached GA, so no owner loses anything they have.

**W5 · A drop on one reading: does Home show anything?**
- **Deciding:** what Home shows when the latest reading is down past the line but is a single home-scale reading (under PMD-9, not yet confirmed).
- **Options:**
  - **A plain row with no ask (recommended), F6.** "Miso weighed 8.9 lb on Sep 20, down from 9.9 lb on Aug 4 · One reading so far, on a home scale. Weigh her again this week to check." Benign class, no rail, no red, and it leaves once any later reading arrives. *Why:* PMD-9 buys its 6% false-card rate by waiting for a second reading; the plain row is how the second reading gets asked for, once, in words.
  - **Nothing on Home.** The drop shows only on Patterns. Owners who don't open Patterns never weigh again, and PMD-9's detection figures assume they do.
- **Consequence:** the plain row counts toward Home's layout cap like any benign row, and never outranks a safety row (Principle 3). It follows the nudge rule (one per day, specific).

**W6 · Where "planned weight loss" comes from**
- **Deciding:** who can set the planned-loss state that relaxes the card (it still fires above the fast-loss line, §5.6).
- **Options:**
  - **Only from a vet's plan (recommended).** A plan row in "How did it go?": *Weight: aim for her to lose weight*. *Why:* PMD-9's finding is that nobody was named as setting it, and a self-set diet is the case where a fast loss goes unseen.
  - **Also an owner switch on the Pet tab.** Easier, and it lets an owner quiet the card on their own judgment.
- **Consequence:** A adds one optional plan row to the after-visit form (VV-4's plan rows), stored as a dated plan fact on the visit's plan, never an event.

**W7 · The clinic weight on the after-visit form**
- **Deciding:** how a reading gets *at the vet* as its source, given that no vet-visit screen takes a weight today.
- **Options:**
  - **An optional "Her weight at the visit" row on "How did it go?" (recommended), F5.** If a weigh-in was already logged that day, the row shows it and offers *That was the vet's scale* (re-labels it, writes nothing new); otherwise an empty field. *Why:* it is the one moment an owner has the number in hand, after the visit and away from the scale, so it adds no decision at the moment of the event.
  - **Correction only.** No new row; a clinic reading is always logged as a weigh-in and corrected on its record (F4). Nyx's case works either way, but a no-scale household never meets the log's weigh-in step.
- **Consequence:** A adds one optional row to `app/vet-visits/after.tsx` and one write path (`insertWeightCheck` with `source: 'clinic'`), which the Home-writes guard does not see (it is not Home).

---

## 1. What this is

A weight history with a source per reading, one pure predicate that every weight surface reads, and a weight row in the Signal's safety group when a pet has lost weight by a confirmed measure. Owners read pounds and dates; the vet report reads kilograms and may state a percentage.

## 2. What this is not

- Not a new choice at the scale. The weigh-in step keeps one field and one button.
- Not a threshold. Every number in §5 is a placeholder until the CUL-583 ruling sheet (§9).
- Not a care state. EN-9 (PR-20) owns "My vet knows" and watching; this spec says only where the weight row plugs in.
- Not a fix for Nyx. §8 says in advance what the lane does on her record, and the rule is never tuned to change it.

## 3. The spine (WG-1 to WG-9)

- **WG-1 · One predicate.** `weightStory()` in a new pure module (`lib/weightStory.ts`, importing only `lib/weightUnits.ts`) is the only code that picks an anchor, computes a change or decides a state. Patterns (both flags), the Profile trend card, Get ready's weight question, Ask's `weightSummary`, the vet report's weight section and the Signal's weight finding all call it. It is in the Edge Functions' import closure, so a change to it redeploys `ask`, `generate-report` and `generate-signal` (C-26, CUL-1147). *This is GAP-20's fix: the counterexample was five readers computing five answers.*
- **WG-2 · A reading's source comes from how it was entered.** The log weigh-in writes *home scale*; the after-visit weight row writes *clinic* (W7); the profile field is an *estimate* and, under W1 A, never becomes a reading. No control at the scale asks. The owner corrects a source after the save, on the reading's record or its completion card (F3, F4).
- **WG-3 · An estimate never anchors, and never enters a count, a plot or a change line.** It may prompt a weigh-in (§6.4).
- **WG-4 · Owners read pounds, to 0.1 lb, and no percentage** (S3 extended to every owner weight surface; W4). The Signal row states two readings and their dates, never a difference: the owner's own numbers carry no false precision. A difference in pounds may appear on the finding's screen and on Patterns.
- **WG-5 · The anchor is named in every sentence that uses it**, by value and date. Two surfaces can then disagree only by calling a different predicate, which WG-1 forbids.
- **WG-6 · The noise line and the safety line are one decision.** The shipped caveat ("a home scale moves about that much on its own") appears only in the state `within_noise`, and the safety row only in `drop_confirmed` or `drop_firm`. The two can never render together (§5.4).
- **WG-7 · Never reassures.** A steady or rising weight is described as numbers, never as "stable", "healthy" or "good" (024's rule; a rising line can be fluid). The onboarding preview string `'15.2 kg · stable'` (`ValuePreview.tsx:62`) is out of step with this and is fixed in PR-37.
- **WG-8 · Kept until the owner acts; never lowered by time or by a reading on its own.** Defined in §5.5.
- **WG-9 · Registered everywhere a finding type must be** (MFU-8), in PR-19: the template-only phrasing list, the safety order, Ask's relay and the cross-pet banner, with a completeness test over the `Finding` union proven by mutation.

## 4. Sources

### 4.1 The three sources and what each may do

| Source | Owner word | How it arrives | Anchors a change? | Counts as confirmed? |
|---|---|---|---|---|
| `clinic` | at the vet | "How did it go?" weight row (W7), or a correction | yes | yes, on one reading |
| `home_scale` | on a home scale | log weigh-in, its edit screen, the legacy backfill (W2), or a correction | yes | only with a second consecutive reading (PMD-9, §5.3) |
| `estimate` | an estimate | the profile field (W1 A: stays out of the history), or a correction of a reading down to "a guess" | never | never |

A row also records `source_basis`: `entry` (derived from the path), `owner` (corrected) or `legacy` (backfilled). It never changes what a source may do; it lets the correction sheet say "We labelled this from how it was logged" and lets the report footnote a legacy reading if W3 wants it.

A person-held weigh-in (owner on a bathroom scale, then holding the cat) is a home-scale reading with a larger error. v1 does not ask for it; the ruling sheet decides whether the noise band widens for readings above some species weight (§9).

### 4.2 The correction (F3, F4)

- **Where:** the weigh-in's completion card names the source (*8.2 lb · on a home scale · Change*), and the reading's record screen (`app/event/[id].tsx`) carries the same row. Both are after the save. Neither is Home.
- **What:** a three-choice sheet: *At the vet* · *On a home scale* · *It was an estimate*. One tap writes `source` and `source_basis = 'owner'` and moves `updated_at` (C-23). No confirm: the choice is reversible by the same sheet (C-21's reversal half).
- **A weigh-in on a visit day asks once.** When the local day of the reading has a recorded visit, the completion card's source line reads *on a home scale · At the vet today?* (one tap relabels it). This is F5's question at the other door, and it is how a no-scale household that logs the vet's number through the log still gets *at the vet* (adversarial pass, attack 9).
- **Effect:** the lane recomputes on the next Signal regen (the weigh-in path gains `triggerSignalRegenDebounced`, which `lib/weight.ts:12-16` names as the step to add when a lane exists). A correction never rewrites a stored escalation (the CUL-1201 ruling): a row already raised stays until the owner acts (§5.5), and a row that a correction would now raise is raised on the next regen.
- **A relabel never hides a reading.** A reading marked *It was an estimate* leaves every count, anchor and plot, and stays listed on the finding's screen, Patterns and the report as *Not counted: you marked this an estimate (8.2 lb, Sep 16)*. An owner who relabels a low reading to make a loss go away is making a choice, and the record says so (attack 6).

### 4.3 Stop the pre-fill

`app/log.tsx:272-275` pre-fills the weigh-in with the last snapshot. A pre-fill saved unchanged is a copy stored as a new, witnessed reading, and it would confirm whatever it copied (§5.3 counts pairs). PR-37 replaces it with a hint under the empty field: *Last: 8.2 lb on Sep 16*. The field stays one tap to focus; typing the number is the observation (024's note: the value is the event).

Rows written before PR-37 may be such copies, and the snapshot they copied may have been a profile estimate. So, from PR-19 on: **a reading whose value equals the reading immediately before it, to the gram, never pairs with that reading** (§5.3). It still counts as a reading of that value; it just cannot confirm one (attack 7).

## 5. The predicate

### 5.1 Input and output

`weightStory({ readings, estimates, windowDays, nowMs, species, dateOfBirth, plans, standDowns })` where each reading is `{ kg, occurredAt, source, sourceBasis }`, soft-deleted rows are already excluded, and readings the owner marked as estimates arrive only in the not-counted list.

It returns a **descriptive sentence** (the same on every surface) and a **state** (which decides the Signal):

| State | Means | Signal | Descriptive surfaces |
|---|---|---|---|
| `none` | no readings | nothing | designed empty state (§6.4) |
| `one_reading` | one reading in the window | nothing | the value, its source, its date; an estimate beside it if they differ past the line (§6.4) |
| `within_noise` | the change rests on a single reading and is inside the band | nothing | change in lb + the shipped caveat |
| `level_or_up` | not down past the line | nothing | change in lb, no verdict word (WG-7) |
| `drop_unconfirmed` | a confirmed level, then one reading below it past the line | plain row, W5 | change in lb + *one reading so far* |
| `drop_confirmed` | the confirmed latest level is below the confirmed high level past the soft line | safety row, "Worth raising with your vet" | change in lb, both readings sourced |
| `drop_firm` | as above, past the firm line | safety row, "Worth booking a vet visit" | as above |

The juvenile and planned-loss rules (§5.6) select among the same states; they add none.

### 5.2 The sentence: what every surface says

Every surface states **the latest reading and the highest reading before it in the window**, each with its date and source, and says when either is a single reading (*9.7 lb in June, one home reading*). Named by value and date (WG-5), so no two surfaces can say different things.

This replaces today's anchors: first of the latest 12 readings (Patterns, Profile), first in the window (Ask, report), and a min–max range (Get ready). Get ready keeps printing its range; its *weigh* question quotes the sentence.

The highest reading, never the earliest: a kitten that grew from 1.0 to 2.0 kg and fell to 1.7 kg has lost weight, and a sentence measured from eight weeks old would say it gained (attack 10b). The highest reading *before the latest*, never the latest itself: a low clinic reading must not become its own comparison (attack 2).

**The window** is placeholder 12 months (Freeman 2016's pre-diagnosis year), record-anchored: a change is spoken only over readings inside it, and a date outside it is named as such (C-37). Patterns may keep drawing its dots; the sentence obeys the window (C-3).

### 5.3 The decision: confirmed levels (PMD-9, placeholder)

The sentence always names real readings. Whether the Signal shows a row is decided from **confirmed levels**, so one high or one low reading on a kitchen scale cannot raise it:

- **A clinic reading is a confirmed level on its own.**
- **Two consecutive home readings confirm the level both reached:** the lower of the two as a high level, the higher of the two as a low level. Consecutive means next to each other in the record, whatever the gap in days. (The exact-copy rule in §4.3 applies.)
- **The confirmed high** is the highest confirmed level in the window before the confirmed low. **The confirmed low** is the latest reading if it is a clinic reading, else the higher of the latest two readings.
- **A row is raised** when the confirmed low is below the confirmed high by the line (placeholder 5% soft, 10% firm), measured as a share of the confirmed high.
- **Mixed instruments:** when one level is clinic and the other home, the difference must clear the line **plus** the band (§5.4), because a home scale can read consistently low and two readings on it don't cancel that (attack 4).

Worked through the adversarial pass's cases:

| Readings (kg) | Confirmed high → low | Result |
|---|---|---|
| Steady 1.5% a week, monthly, home: 4.50, 4.23, 3.98, 3.74 | 4.23 → 3.98 (5.9%) at the 4th reading | soft row at month 3; at the 3rd reading, nothing (4.23 → 4.23). The sentence says *8.2 lb, down from 9.9 lb on Jul 3*. |
| Stable cat, kitchen scale noise, one spike: 4.0, 4.0, 4.2, 4.0 | 4.0 → 4.0 | nothing; the sentence says *Down 0.4 lb from 9.3 lb on Aug 4, one reading* |
| GAP-20's counterexample, one reading each: 4.0, 4.5, 4.05 | 4.0 → 4.5 (pair min of 4.0/4.5 is 4.0; latest pair's higher is 4.5) | nothing, and no plain row (no confirmed level above the latest reading); the sentence says *Down 1.0 lb from 9.9 lb on Aug 4, one reading* |
| Kitten levelling off: 2.05, 2.02, 2.04 | 2.02 → 2.04 | nothing (attack 10a) |
| Clinic 4.50, then a home scale that reads 0.25 low: 4.25, 4.25 | 4.50 → 4.25 (5.6%), mixed | nothing: 0.25 kg is under line + band (0.225 + 0.23 kg) |

The Data Scientist's PMD-9 figures (false cards on a stable monthly-weighed cat from 87% to 6%, 99% of true losses caught, 1% a week caught near week 8) were run on the critique's wording. **PR-16 re-runs them on this exact definition before PMD-9 is ruled;** the spec does not cite them as its own.

**Noise-scaled confirmation** (for the ruling sheet): a difference of at least 3 × 0.2 kg between the highest reading before the latest and the latest reading raises the row whether or not either end is confirmed. It fires more than PMD-9 and less than D7 as written. It confirms both ends (attack 3).

**Under D7 as written** (the louder rule, live under E-6 amended until PMD-9 is ruled): the row compares the sentence's two readings directly, no confirmation. The predicate carries all three behind one constant, each with its own test.

### 5.4 Noise

One band: **≤ 5% and ≤ 0.5 lb** (today's `HOME_SCALE_NOISE_FRAC` and the Patterns card's `noiseAbs`, now owned by the predicate). The shipped caveat (*a home scale moves about that much on its own*) appears only in `within_noise`: the change is inside the band **and** rests on a single reading at either end. A change the last two readings agree on never carries it, whatever its size, so the caveat cannot sit over a slow real loss (attack 5). A clinic-to-clinic change is never described as scale noise. `within_noise` and a raised row come from disjoint states; a property test pins that no input yields both.

### 5.5 How long a raised row stays

- It stays until **the owner answers** on the finding's screen. EN-9 supplies the answers (per sign, E-2 A): *My vet knows* moves it to watching (quieter rail, still in the safety group, R-2); *Not yet* keeps it raised.
- A later reading **never lowers it by itself**, even a confirmed regain (the CUL-1201 ruling: only the owner's own act lowers a verdict). A confirmed regain adds a dated line on the finding's screen (*Back to 9.5 lb on Oct 30, at the vet*) and adds an answer, *She's gained it back*, which stands the row down.
- **A stand-down ends that finding.** Its readings stop anchoring; the next row is a new finding, measured from confirmed levels after the stand-down (attack 11).
- Time never moves it. No roll-off, no eight-week re-ask from this lane (E-3 as restated; CUL-1290 owns the fallback).
- A further confirmed drop from a watched state re-raises it (the EN-9 trigger "weight loss ≥5% or a falling trend", brief C1), measured from the confirmed level at acknowledgement.

### 5.6 Juveniles, planned loss, species

- **Juveniles** (placeholder: under 12 months by `date_of_birth`, with its precision): the brief's "any drop from peak, or no gain in four weeks" gives a growing kitten a false card in 62% to 98% of runs (PMD-9). Placeholder until ruled: a drop between confirmed levels that clears the band raises the soft row at any percentage; "no gain" is a ruling-sheet item and ships off. An unknown birthday is an adult.
- **Planned loss** (W6, from a vet plan only): while the plan runs, the soft line is off and the firm line becomes a rate, placeholder **2% of body weight a week** between confirmed levels at least 7 days apart (rapid loss in an overweight cat is a hepatic-lipidosis risk). The ask names the plan: *Losing faster than the plan from Sep 16*. **Readings from before the plan's start never anchor again**, during the plan or after it ends; a cat that reached her goal is not measured against the weight she was asked to lose (attack 12). A plan ends when a later visit's plan says so.
- **Species:** cats and dogs share the lane. The pair rule does not depend on the band, so it holds for a 30 kg dog; the mixed-instrument margin does, and the ruling sheet decides whether it scales with body weight. Species `other` gets the descriptive surfaces and no Signal row until the ruling sheet says otherwise (R-4). Dogs enter CUL-508 with a meal-fed dog on a weight plan before GA (R-4).

## 6. Surfaces

### 6.1 The Signal row on Home (F1, F2)

- Sits in the safety group. Its slot against the photo red flag and intake decline is a ruling-sheet item; placeholder: after both, before chronicity (`SAFETY_TYPE_ORDER` gains `weight_loss: 2` and the chronicity types move down one).
- Eyebrow: *Weight*. Head: *Nyx weighed 8.2 lb on Sep 16, down from 9.7 lb in June*. Sub: the sources, *Both at the vet* / *Sep 16 at the vet · June on a home scale, twice*. Ask: *Worth raising with your vet* (soft) or *Worth booking a vet visit* (firm).
- Template text only (never Haiku): `weight_loss` joins the phrasing list at `generate-signal/index.ts:160-197`.
- It is a door to the finding's screen. Home carries no weight control (Home's three write classes are unchanged).

### 6.2 The finding's screen (F2)

The sentence; the readings in the window as a dot row with a source mark on each dot; the list of readings with *at the vet* / *on a home scale* chips and each one's correction door; one line stating the comparison (*Compared with her highest confirmed weight in the last 12 months, 9.7 lb in June*); the answer block from EN-9 (drawn, marked *needs EN-9*). The cough-and-vomiting disclosure pattern does not apply; weight has no paired sign.

### 6.3 Patterns, Profile, Ask, Get ready, History

- **Patterns** (both flags) and the **Profile trend card:** the predicate's sentence in pounds; the percentage leaves Patterns v2 (W4); the caveat per §5.4.
- **Ask's `weightSummary`** returns the predicate's state, anchor and latest, each with a source, in pounds; `earliestOccurredAt` stays for the chart. The weight finding is relayed with its template sentence (MFU-8).
- **Get ready:** the *weigh* question quotes the predicate's sentence; `weight-stale` ("the vet's own number is still the newest one") is unchanged.
- **History** row detail stays the value (*8.2 lb*); the source appears on the record screen, not the row.

### 6.4 The no-scale household (F9, F10)

A household with no home-scale reading ever (`hasHomeScale = false`, read from the record, never asked) gets a version in which no line assumes a scale:

- Every prompt names the vet instead: *No weight since the Sep 16 visit. Ask for one at the next visit.* It lives on Patterns and Get ready, never on Home.
- Its readings are clinic readings, each confirmed on its own, so the lane works at the cadence of visits: two visits a few months apart are a full comparison (F9).
- An estimate on file with no reading: *9.7 lb is from Nyx's profile, not a weigh-in. The next vet visit will give one.* (F10)
- **An estimate beside a reading** (any household): when the profile value and the latest reading differ by more than the soft line, the descriptive surfaces show both, *8.2 lb on Sep 16 · 9.7 lb in Nyx's profile is an estimate*, and offer *Add it as a reading* (a date and a source, then an ordinary reading). The estimate never anchors and never raises a row; the owner turning it into a dated, sourced reading is what lets it count (attack 8).
- The day the household logs a home reading, `hasHomeScale` flips and the scale version applies. A reading logged on the local day of a recorded visit does not flip it: that is usually the vet's number typed in at home, and §4.2's *At the vet today?* is asked instead (attack 9). EN-9's watching prompt ("no weight logged since…", PR-20) reads the same flag; its copy is PR-20's.

### 6.5 The vet report (W3 A)

Kg, as today. Each plotted reading carries *clinic* or *home scale*; estimates are never plotted and never used for the empty state (report spec :119, :195, unchanged). The change line becomes the predicate's: *3.73 kg (clinic, Sep 16), from 4.40 kg (home scale, June; one reading) · −0.67 kg, about 15% of body weight*. `weightDeltaPct` keeps its floors. "Descriptive, not a diagnosis" stays. No finding, no tier, no care state.

## 7. The migration (PR-18), outline only

- `weight_checks` gains `source text NOT NULL` (`clinic` | `home_scale` | `estimate`) and `source_basis text NOT NULL` (`entry` | `owner` | `legacy`), backfilled per W2. Additive. The local SQLite mirror gains both, in `BASE_SCHEMA_SQL`; sync pushes them.
- Under W1 A nothing else changes in the schema; 072's table gets its first reader (the lane) and `guards/weightDisplacements.test.ts`'s empty reader set becomes `{ generate-signal }`, registered in the same PR (C-32).
- Planned loss (W6 A) is a plan-row value on the after-visit write, not this migration; it rides PR-37's plan-row work or VV's own schema line.
- **Privacy line (R-5):** cascade from `pets` and `events` (unchanged); RLS unchanged (per-verb pet-owner policies on `weight_checks`); same-pet trigger unchanged; the local wipe list already holds `weight_checks`; a model reads the source *word* through Ask's tool output, never free text; export and the App Store label gain "weight source" under health data.
- **Migration Safety Pre-flight** is PR-18's to write; destructive = n.
- **⚠ As built (PR-18, migration 081, 2026-09-29):**
  - Both columns keep their defaults (`home_scale`, `legacy`) after the backfill. Installed builds upsert without them; without a default every weigh-in from an installed phone fails with 23502 and quarantines. A current build always sends both.
  - No CHECK pairs `estimate` with `owner`. A violating write would be a client bug, and the CHECK would refuse the whole reading (C-38); the pairing is PR-37's writer contract.
  - `guards/weightDisplacements.test.ts` stays empty here. Its entry lands with its reader in PR-19 (C-32), not ahead of it.
  - The local mirror's two `COLUMN_UPGRADES` entries carry `rehydrate`, and `hydrateWeightChecks` fills the label on every synced row it fetches (the CUL-1396 shape: the re-pull returns rows whose `updated_at` equals the local copy, which LWW skips). Without the fill, an upgraded phone kept the default and its next weight edit pushed it back over the server's label.
  - The privacy line above has two slips, corrected here rather than rewritten: RLS on `weight_checks` is one `FOR ALL USING` policy (024), reused as the check on insert and update, not per-verb policies; and the App Store label gains nothing. A reading's source is a detail of weight data, already declared under Health & Fitness · User Content (`docs/app-privacy-answers.md`). Export does not exist yet (B-041); when it is built it carries the column with its row.

## 8. What EN-8 does on Nyx, written in advance

The record, read 2026-09-28 (service-role, scoped by pet and owner): **one** weigh-in, 3.73 kg on Sep 16 (logged at 22:51 UTC through the log weigh-in, 48 minutes after the visit was recorded); **no** row for June's 4.4 kg in `weight_checks` or in `pet_weight_displacements` (the overwrite predates 072); born 2023-09-01, so an adult; a cat.

| Record state | D7 as written (the provisional, louder rule) | PMD-9 (confirmed peak) | PMD-9 + noise-scaled |
|---|---|---|---|
| **Today** (one reading) | silent (`one_reading`) | silent | silent |
| Sep 16 corrected to *at the vet* | silent | silent | silent |
| June re-entered as a weigh-in (*home scale*), Sep 16 *at the vet* | **firm row** (15% from 9.7 lb) | **silent**: June is one home reading, so no peak is confirmed and it never can be; every surface says *8.2 lb on Sep 16, down from 9.7 lb in June, one home reading* | **firm row** (0.67 kg is more than 3 × 0.2 kg) |
| June re-entered and, **only if true**, corrected to *at the vet* | firm row | **firm row** | firm row |
| June typed into Edit profile | silent (an estimate never anchors); Patterns shows it beside the reading and offers *Add it as a reading* | silent | silent |

The Sep 16 source moves only the PMD-9 column: D7 as written and the noise-scaled variant fire on the re-entered June reading whichever way Sep 16 is labelled. June's day of the month is whatever the owner enters; frames write *June*.

Rules for this table:

1. Under E-6 amended, the louder rule is live on the PM's account until PMD-9 is ratified with harness proof. So with June re-entered and the flag on, Nyx's Home shows the firm row until then, and may go quiet after.
2. The June source is corrected to *at the vet* only if the owner knows it was. Nobody corrects it to make a row appear.
3. No floor, band or window is chosen by running it on Nyx. PMD-9 and noise-scaled confirmation are ruled on PR-15's synthetic pets and PR-16's pass line ("EN-8: false cards on stable pets and detection delay by weigh-in cadence").
4. Whatever the rule, the loss stays visible as numbers on Patterns, the Profile card, Ask and the report once June is on file. The silence in the PMD-9 column is the safety row's, not the record's.

## 9. For the CUL-583 ruling sheet

Each item: placeholder, direction of failure, where it binds. Under E-6 amended, a ruling that fires more is adopted provisionally; one that fires less needs harness proof and the PM's sign-off.

| Item | Placeholder | Fires more / less than D7 as written |
|---|---|---|
| Soft and firm lines | 5% / 10% of the anchor (FCEAI bands) | the lines are D7's |
| Confirmation | PMD-9: clinic, or two consecutive home readings | less |
| Noise-scaled confirmation | 3 × 0.2 kg band | less than D7, more than PMD-9 |
| Window | 12 months | a shorter window fires less |
| Noise band | ≤ 5% and ≤ 0.5 lb, home readings only | shipped value |
| Person-held weigh-ins | not asked; same band | open |
| Juveniles | < 12 months; confirmed drop at any size; "no gain" off | "no gain" off is less than the brief |
| Planned loss | vet plan only; 2% a week | less while planned |
| The row's rank | after red flag and intake decline, before chronicity | ordering only |
| Species `other` | descriptive only | less |

## 10. PR plan

| PR | What | Needs |
|---|---|---|
| **18** | Migration: `source`, `source_basis`, the backfill, the local mirror, sync. R-5 line. | W1, W2 |
| **19** | `lib/weightStory.ts` + its property tests (§5.4 exclusivity; the anchor ladder; confirmation both ways; estimates never anchor); `weight_loss` in `detection.ts` behind EN-F; MFU-8's four registries + the completeness test; `ask` and `generate-report` switched to the predicate; the report spec Tier-2 edit (W3 A); `adversarial-reviewer`, `vet-report-cold-read`. PMD-9 before it goes live. | PR-18 · PR-11b · Lane C |
| **37** | Client, in the Design v2 folder: the Home row and the finding's screen; the completion card's source line and the correction sheet; the after-visit weight row (W7) and the planned-loss plan row (W6); the pre-fill hint; Patterns / Profile / Get ready on the predicate; the no-scale copy; `nyx-voice` on every string. | PR-18a · PR-19 |

**Acceptance for the lane (PR-19), from CUL-1135:** CUL-508's synthetic pets include a 1%-a-week loss, a noisy home scale, a stable cat weighed monthly, a growing kitten, a planned loss, legacy weights with no source, sparse weigh-ins and a no-scale household; the adversarial pass names the counterexample it tried; `nyx-voice` passes the row and the screen.

## 11. Known gaps this spec does not close

- CUL-765 (Edit profile accepts 0 and negatives) and CUL-1283 (the lossy lb round trip on a name edit) stay their own issues; W1 A keeps both outside the history.
- The widget shows no weight and gains none.
- A server push when a clinic reading arrives is not in scope (the notification foundation is local-first).

## 12. Adversarial pass (2026-09-28, isolated `adversarial-reviewer`)

Twelve attacks on the first draft; nine broke it, one found a gap, two held. Every fix is in §4 to §6 above, marked by attack number.

1. A steady 1.5%-a-week loss on monthly home readings never confirmed a peak, so a 17% loss sat unconfirmed forever. **Fixed:** confirmed *levels* from pairs (§5.3); the worked case raises the row at month 3.
2. A low clinic reading anchored on itself. **Fixed:** the sentence compares the latest with the highest reading *before* it (§5.2).
3. The noise-scaled column in §8 contradicted the ladder. **Fixed:** noise-scaled confirms both ends (§5.3).
4. A home scale reading consistently low raised a false row against a clinic anchor. **Fixed:** the mixed-instrument margin (§5.3).
5. The caveat could sit over a slow real loss. **Fixed:** it needs a single reading at one end (§5.4). The exclusivity of the caveat and the row held.
6. Relabelling a low reading as an estimate silenced a loss with no trace. **Fixed:** a relabelled reading stays listed as not counted (§4.2).
7. Legacy rows may be pre-fill copies of an estimate. **Fixed:** an exact copy of the reading before it never pairs (§4.3).
8. An estimate far from the only reading was ignored (Nyx's shape if June were typed into the profile). **Fixed:** shown beside it, with *Add it as a reading* (§6.4).
9. A no-scale owner logging the vet's number through the log became a scale household. **Fixed:** the visit-day question and the `hasHomeScale` exception (§4.2, §6.4).
10. Kittens: jitter raised rows, and a loss read as a gain from eight weeks old. **Fixed:** the band on a juvenile drop; the highest, never the earliest (§5.2, §5.6).
11. Regain then a new loss was undefined. **Fixed:** a stand-down ends the finding (§5.5).
12. A finished planned diet raised a firm row against the pre-diet weight. **Fixed:** pre-plan readings never anchor again (§5.6).

DoD line, verbatim in substance: *Biostatistician: tried a steady 1.5%-a-week loss on monthly home readings (4.50 → 3.74 kg); no peak ever confirmed, so a 17% loss never raised a row, and a low clinic reading anchored on itself.* Both fixed as above; **PR-19's own adversarial pass re-runs every case against code**, and PR-16 re-measures PMD-9's figures on §5.3's exact definition.
