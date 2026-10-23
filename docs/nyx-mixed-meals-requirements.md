# Mixed Meals and Food Transitions — Requirements

**Version:** 0.5 | **Last Updated:** 2026-10-23 (the split is a sheet and Save commits it, PM, CUL-2133)
**Status:** All six P-decisions ruled (§0.2). Mock round 1 (`docs/culprit-mixed-meals-mockups.html`, https://claude.ai/artifact/JsaLnSwdqeuyQZAXqgEWFY) is ruled; round 2 (same link) adds motion and the Foods tab. Round 2 reactions R-1 and R-2 move to device QA at build row 5; R-3 and R-4 moved to CUL-2049 (PM, 2026-10-20). Nothing in the spec waits on the PM.
**Reads first:** `docs/sessions/2026-10-19-mixed-meals-requirements.md` (the convening record), `docs/nyx-diet-trial-requirements.md` §4.1 and §5, `docs/research/2026-07-diet-trial-competitive-landscape.md`.
**Issue:** [CUL-2039](https://linear.app/projectnyx/issue/CUL-2039). **Readable copy:** https://claude.ai/artifact/1NPLtiUGvc9gy6HDEx5ivR (this file wins on divergence). **Related:** [CUL-1997](https://linear.app/projectnyx/issue/CUL-1997) (its transition finding is addressed by §6; the build closes it), [CUL-229](https://linear.app/projectnyx/issue/CUL-229) (NOT closed by this; see §5.3).

---

## §0 Decision record

### §0.1 PM rulings (2026-10-19, before the convening)

| # | Ruling |
|---|---|
| **R1** | Priority is **food transitions**. Toppers stay two separate logs for now; a mixed topper path may come later. |
| **R2** | Ratio entry: an easy path for **common ratios**, plus a way to record a **custom** one (45/55). Design for the common case. |
| **R3** | The **schema holds 2+ foods** per meal; the **UI is designed for exactly 2**. |
| **R4** | **Do not prescribe a transition.** No plan, no schedule, no suggested next step. The app lets a transition happen and records it truthfully. |
| **R5** | This round is requirements; mocks follow in their own round. |
| **R6** | Two directions carried into the convening: (A) one meal event with a child table of components; (B) a one-off "Mixed with…" path modelled on pairing a med with a meal, repeatable from the FAB. The prescribed transition plan is out (R4). |

### §0.2 Open for the PM

Team recommendation marked ★. Forecast for the whole build: **5 rows** (§8), plus the mock round.

**P-1 · The meal card's fourth door. RULED (PM, 2026-10-19, round 1): (a). "Love the select mixed food, select food, then select ratio workflow." The FAB's MIX label is kept.**
- **Deciding:** where an owner first says "this bowl is a mix."
- **Options:** ★ (a) one line on the meal completion card, "+ Mixed with another food", for `food_type = 'meal'` only; the same slot becomes the ratio stepper once the meal is a mix, so the card never gains more than one mixing slot. (b) a mode toggle in the food picker. (c) event detail screen and FAB only.
- **Why ★:** (b) taxes every meal log forever (Principle 1); (c) makes day 1 of a transition a trip through History. The card's own header says "Before proposing a FOURTH affordance: stop" (`components/ui/MealCompletionCard.tsx:113-122`), so this is a better-than-the-rule brief: the rule protected card density, and (a) holds it to one slot.
- **Consequence:** (a) needs the worst-case density frame in the mock (§9 frame 1).

**P-2 · The common-ratio scale. RULED (PM, 2026-10-19): (a), five fraction stops.**
- **Deciding:** which preset ratios the chips offer.
- **Options:** ★ (a) five stops in fractions: ¾·¼, ⅔·⅓, ½·½, ⅓·⅔, ¼·¾. (b) the published 25/50/75.
- **Why ★:** the PM's own first bowl (¼ can chicken + ½ can rabbit) is 1:2, which 25/50/75 cannot record without rounding it to something false. Owners mixing cans produce thirds.
- **Consequence:** (b) pushes the most common real bowl into the custom path.

**P-3 · A mix with an unknown ratio. RULED (PM, 2026-10-19): punted from v1. No "Not sure" button. The custom path takes one unit for both foods, so every v1 mix has a share. The schema keeps `share` nullable for a later path; v1 never writes NULL.**
- **Deciding:** whether "Not sure" is allowed.
- **Options:** ★ (a) allow it; stored as `share = NULL`, shown as "Chicken + Rabbit". (b) require a ratio.
- **Why ★:** exposure is presence-based (§5.1), so nothing clinical needs the share; a required ratio makes owners invent one. Unknown beats a guess.
- **Consequence:** none on the engines; the report says "ratio not recorded."

**P-4 · A mix after Day 1 of a trial. RULED (PM, 2026-10-19, round 1): (a), count it with the usual heads-up. The weaning-after-Day-1 case is a known issue, filed as [CUL-2040](https://linear.app/projectnyx/issue/CUL-2040), not tackled here.**
> **Dr. Chen:** A bowl of the old food after Day 1 is an exposure and must count; but on days 1–14 it is very often an unfinished transition with a wrong Day 1. Offer one heads-up, on the existing once-per-food ledger: "{Old food} is in this bowl, and Day 1 was {date}. If the switch is still under way, you can move Day 1 to when it finishes. Otherwise this counts in the trial record." Silent exclusion is out: a partner slipping the old food on day 20 looks identical.
> **Designer / Jordan:** R4 says the app never steers a transition. A "move Day 1" action is the app commenting on the transition the owner is running, inside the 5-second card. It also needs a new provenance column (when and from what Day 1 was moved), which is schema.
> **PM decision needed:** (a) count it, no note, report discloses (§6.2); (b) the one-time heads-up with a Move Day 1 action, gated to days 1–14 and to contemporaneous logs (`created_at` within 24h of `occurred_at`); (c) exclude automatically (**rejected by both**: it lets the record erase its own contamination).
- **Consequence:** (b) adds a schema column (never-list) and a cold-read of the moved-Day-1 disclosure; (a) ships with no new owner surface.

**P-5 · Reintroducing a food while the trial still reads active. RULED (PM, 2026-10-19, round 1): (a).** (The PM's own case: a cat coming off a trial.)
- **Deciding:** what the log-time heads-up says when a bowl contains a non-allowed food and the trial is **past its target end** but never ended.
- **Options:** ★ (a) keep the line that names what is in the bowl, then add a second sentence: "This bowl has chicken in it, from {Chicken Pâté}. If {pet}'s trial is over, ending it here keeps the record straight." (b) today's "trial should skip {protein}" (`lib/trialContaminant.ts:496`).
- **Why ★:** (b) reads as a scolding for a reintroduction the vet ordered. (a) keeps the contamination named: overrunning the target is normal (`TRIAL_OVERRUN_GRACE_DAYS = 56`), so a real slip on a trial still running must not read as a soft "if it's over" (pass 1, break 10). The exposure is recorded either way.
- **Consequence:** copy through `nyx-voice`; no schema.

**P-6 · What the vet report says about the transition. RULED (PM, 2026-10-19): (a), the team's recommendation, per the PM's "go with the team's recs for the others." No setup-screen suggestion.**
- **Deciding:** whether the report shows dates derived from the record.
- **Options:** ★ (a) disclose "trial diet first fed {date}, mixed with {old food} on N days" and "first day only the trial diet was logged" beside the owner-entered Day 1, plus a post-trial "New foods introduced" line (first-fed date, the ratio ramp, symptoms in the forward window, side by side and never as attribution). (b) also offer the derived date as a suggested Day 1 at trial setup. (c) neither.
- **Why ★:** closes CUL-1997 without moving anyone's start date. (b) adds a step to the 15-second trial setup and edges toward prescribing (R4).
- **Consequence:** `generate-report` changes; `vet-report-cold-read` is mandatory at that PR.

### §0.3 Team convergences (logged; the PM can reverse any)

| # | Convergence | Lenses |
|---|---|---|
| **T1** | A mixed bowl is **one meal event** with N component rows (§3). Never two events. | Eng, Data, Dr. Chen |
| **T2** | For a mix, `meals.food_item_id` is **NULL**. An installed older build then reads the bowl as a meal that names no food (a shape every reader already handles, CUL-1338): disclosed as unclassifiable, never "all matched." The **dominant** component (largest share; on a tie or unknown shares, position 0) is computed at read by the helper (§4), for display only. **No reader may fall back to `food_item_id` for a mix.** _(Revised after adversarial pass 1, break 4: a cached dominant food made an older build on a second household phone say "all N matched" over a bowl with chicken in it.)_ | Eng, Data, QA |
| **T3** | Exposure is **presence**. Any component's proteins count at any share; share never changes a verdict, a count or a word (§5.1). | Dr. Chen, Data |
| **T4** | A bowl's trial verdict is the **worst** of its components; the bowl counts **once** in the denominator (§5.2). | Dr. Chen, Data |
| **T5** | Intake is rated **once, for the bowl**. A refusal carries to each component's history (the loud direction); a finished bowl carries to neither (§5.4). | Designer, Data, Dr. Chen |
| **T6** | The transition is **derived at read**, never stored as a state and never shown to the owner as one. `transition_started_at` stays NULL; `started_at` is never moved by the app (§6). | Data, Designer, Dr. Chen |
| **T7** | Share is **stored**, not fed to the engines in v1 (§5.3). | Data, Dr. Chen |
| **T8** | The ratio on the report is **what the owner entered**, labelled as the owner's estimate: fractions as fractions, amounts as amounts, a typed percentage rounded to 5% with "~". A share that is ever missing (not written by v1, P-3) shows "ratio not recorded"; never a default 50/50 (§7). | Dr. Chen, Designer |
| **T9** | Readers ship **before** the writer. No mix can be written until every clinical reader is mix-aware (§8). | Eng |

---

## §1 Problem

A meal holds exactly one food. `meals.event_id` is UNIQUE and `meals.food_item_id` is singular (`supabase/migrations/001_schema.sql:131-140`); there is no child table. The PM's bowl this morning, ¼ can of chicken mixed into ½ can of rabbit, can only be logged as two meals. Every reader then sees two independent feedings:

- **Diet trial:** one `permitted`, one off-diet, and **+2** in the feeding denominator for one bowl (`lib/dietTrial.ts:972`, one food per `TrialFeeding`).
- **Duplicate collapse:** grouped by food (`lib/sameMinuteDuplicates.ts:79-80`, `generate-report/report.ts:1248`), so both survive as "two real feedings."
- **History and the report:** two rows; the ratio exists nowhere.
- **The transition itself:** `diet_trials.transition_started_at` exists (migration 040) but is never written (`lib/dietTrialSetup.ts:406-413`), and the report skips trial-food meals before `started_at` when building "Previous diet" (`report.ts:4596-4609`), so a vet reading CUL-1997's demo story cannot tell a transition from a wrong start date.

**Evidence from the market (2026-10-19 sweep, re-verify at use):** no pet app found logs one meal as a ratio of two foods. Pet trackers log one food per entry and mixes become notes or duplicate entries, the anti-pattern this spec exists to avoid. Ollie and The Farmer's Dog publish 25/50/75/100 over about 7 days (https://www.ollie.com/transition/); a vet dermatologist stretches the same steps to 14 (https://preventivevet.com/pets/elimination-diets-for-dogs-cats). Cronometer stores a recipe as ingredients with amounts. The Tufts Petfoodology vet worksheet dates the trial "after transition to the new diet" (https://sites.tufts.edu/petfoodology/files/2022/04/Elimination-diet-handout-final.pdf), and Zoetis says any other food restarts the 8 weeks.

## §2 Scope

**In:** one meal event holding two foods with a ratio (schema allows more, R3); entry from the meal card and the event detail screen; one-tap repeat from the FAB; a ratio stepper; mix-aware trial classification, log-time heads-up, engines, analytics, History and the vet report; the derived transition disclosure on the report.

**Out, named:**
- A prescribed transition plan, schedule or suggested next ratio (R4).
- Toppers as mixes (R1). A topper keeps its two logs; nothing here changes `format = 'topper'`.
- Three-food entry UI (R3). A synced 3+ mix must still **render** ("+1 more").
- Portion or bowl-size capture, and therefore dose (CUL-229, §5.3).
- Per-food intake in one bowl (T5).
- A declared rechallenge phase (diet trial spec §9 D8).
- Free-fed mixes: a `feeding_arrangements` row stays one food (018, "no quantity by design").

## §3 Schema — migration 103

> **The number is provisional (2026-10-20).** App Store 1.2.0's PR-34b (the private pet-photo bucket) also wants the next migration number. Whichever merges first takes 103; the other takes the next free number, and `guards/migrationNumbers.test.ts` catches a clash. Read every "103" below as "the next free number at build time". Never applied between App Store Submit and the review verdict (App Store 1.2.0 D14).

Next free number after `102_engines_v3_rest_pm_seed.sql` (095 is a gap; leave it). Schema only, its own PR. Template: `097_intake_checks.sql`, the newest child hung off an event.

```sql
ALTER TABLE public.meals
  ADD COLUMN component_count SMALLINT
  CHECK (component_count IS NULL OR component_count >= 2);   -- NULL = a single-food meal

CREATE TABLE public.meal_components (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id        UUID NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
  event_id      UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  position      SMALLINT NOT NULL CHECK (position BETWEEN 0 AND 7),  -- 0 = the food logged first
  food_item_id  UUID REFERENCES public.food_items(id) ON DELETE SET NULL,
  food_label    TEXT NOT NULL,          -- snapshot; survives a purged food (diet_trials.food_label precedent)
  share         NUMERIC(4,3) CHECK (share IS NULL OR (share > 0 AND share <= 1)),  -- NULL reserved for a later path; v1 never writes it (P-3)
  share_source  TEXT NOT NULL CHECK (share_source IN ('preset','custom','amounts','unknown')),
  amount_value  NUMERIC CHECK (amount_value IS NULL OR amount_value > 0),
  amount_unit   TEXT CHECK (amount_unit IN ('can','pouch','cup','tbsp','scoop','g','oz')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ,            -- taking one food out; the bowl's delete is events.deleted_at
  CONSTRAINT mc_amount_pair CHECK ((amount_value IS NULL) = (amount_unit IS NULL))
);
CREATE INDEX meal_components_event_idx    ON public.meal_components (event_id, position);
CREATE INDEX meal_components_pet_food_idx ON public.meal_components (pet_id, food_item_id);
```

- **Same-pet trigger** in 097's shape: SECURITY DEFINER, `search_path = pg_catalog, pg_temp`, EXECUTE revoked. INSERT: the event is a `meal` of `NEW.pet_id` and the pet is the caller's. UPDATE: `id`, `pet_id`, `event_id`, `position` frozen with `IS DISTINCT FROM OLD` (C-38). One RAISE naming `NEW.*` only (C-31).
- **RLS** `TO authenticated`: read, insert, update own pet. `WITH CHECK` adds `food_item_id IS NULL OR food_item_id IN (SELECT id FROM food_items WHERE created_by_user_id = (SELECT auth.uid()))` (the 040 cross-account food lesson). No DELETE policy; column-level grants that never include `created_at`; DELETE and TRUNCATE revoked from `service_role`.
- **Shares are stored as entered** and normalised at read over the live components. No cross-row sum check: it would block sync on a partial push.
- **No UNIQUE on `(event_id, position)`**, for 097's reason: two offline devices would hit a permanent 23505. Read rule: per position, the newest live row wins (`updated_at`, then `id`), in one shared helper (§4).
- **`component_count`** rides in the same row as `food_item_id`. **Live components always win over the parent:** two or more live components is a mix whatever the count says, and a count of 2 with fewer live components is **incomplete**. An incomplete or inconsistent mix is `unclassifiable` in the trial (disclosed), its day is never a signal control day, and no reader treats it as one food. _(Adversarial pass 1, break 3: device A takes a food out while offline device B edits the ratio; the merge leaves a NULL count over two live components.)_
- **Rejected shapes:** two nullable columns on `meals` (breaks R3); a "mix" food in the library (a transition would mint 3–4 library foods, and a mix of two permitted foods is not itself in `diet_trial_foods`, so it would classify off-diet); JSONB (no FK, no same-account check, no index).

**Migration Safety Pre-flight:** destructive **n** (one table, one nullable column, one function, two triggers). Rollback: `DROP TABLE public.meal_components; DROP FUNCTION public.enforce_meal_component_same_pet(); ALTER TABLE public.meals DROP COLUMN component_count;`. Backfill **N/A**: every existing meal is one food, and NULL count means one food. `get_advisors` differential after apply. `rls-privacy-reviewer` mandatory, handed the cross-account `food_item_id` attack and the `food_label` free-text question by name.

**Local mirror registration** (each has bitten this repo before):
1. DDL in `BASE_SCHEMA_SQL` (`lib/localSchema.ts`), with the unsynced partial index and `sync_attempts` / `sync_error`.
2. `component_count` in the add-column list (near `lib/localSchema.ts:687`).
3. `LOCAL_WIPE_TABLES` ahead of `meals` (`lib/hydration.ts:261`; `hydration.test.ts` enforces it).
4. `hydrateMealComponents` after `hydrateMeals`, with its own watermark and absence pass.
5. Push order events → meals → components inside `drainMealsQueue`, gated on `event_id` in the EN-4 shape (`lib/syncQueue.ts:552`, `:561`).
6. Component foods through `presyncFoodItems`; the unsynced-food scan (`lib/db.ts:96`) includes them.
7. `lib/functionHardening.test.ts` covers the new server joins.

**Sync semantics:** components sync as a **replace-whole-set** unit with tombstones; after any interleaving the live set equals one device's whole set, never a union. A ratio edit writes only components, and because a mix's `food_item_id` is always NULL (T2), a ratio change never rewrites the parent row. The parent is rewritten only when a meal becomes a mix or stops being one; then a stale `intake_rating` on it can overwrite another device's rating, the same whole-row hazard `updateMealFood` / `updateMealIntake` already carry (`lib/db.ts:769`, `:795`). Stated residual.

## §4 One composition helper

`lib/mealComposition.ts`, shared by the app and Edge Functions (the C-26 shared-module boundary). It is the only place that:

- applies the per-position read rule and normalises shares;
- returns the components, the dominant food (T2), and the **composition key**: the sorted set of component food keys, plus the ratio where a caller needs it;
- answers "is this meal incomplete."

**One writer:** `setMealComponents(eventId, components)` is the only path that adds, changes or removes a component. It sets `food_item_id` (NULL for a mix, the single food otherwise) and `component_count`, updates FAB recency, and re-runs the trial heads-up. It accepts only `food_type = 'meal'` foods as components: treats, human food and toppers stay their own logs (R1). Readers still evaluate every component's type, because a synced or future mix may not obey the picker. Removing a food down to one leaves a meal indistinguishable from one never mixed (`component_count = NULL`, no live components). There is no zero-food meal.

## §5 Clinical rules

### §5.1 Exposure is presence
Any component's proteins are an exposure at any share. Share never qualifies, softens, sorts or filters an exposure, and the words "a little", "only", "small" and any percentage are banned from exposure copy. **Falsification (held):** "10% of the old food is negligible." 10% of an 85 g can is about 8.5 g of food, roughly 1 g of protein [Dr. Chen's estimate], which sits at the dose that elicited 5.7% of reactions in the threshold study (`docs/research/2026-07-diet-trial-competitive-landscape.md:129`).

### §5.2 Trial classification of a bowl
`classifyFeeding` takes a bowl. The verdict is the worst component verdict in this order: `off_diet_protein` > `off_diet_unrecognised` > `unclassifiable` > `permitted`. Antigens are the union over all components, including a permitted one's. The bowl counts **once** in the denominator and once in the numerator if off-diet. A bowl with one unclassifiable component and one permitted one is `unclassifiable`: never permitted (reassurance) and never off-diet (blaming a gap in the record).

Before `started_at`, a bowl is `out_of_window` by construction (`lib/dietTrial.ts:553`) and stays so.

Three rules the bowl verdict must not erase (adversarial pass 1):
- **Refusal lane** (`lib/dietTrial.ts:2884-2926`): any bowl with a `primary_diet` component joins the trial-diet refusal population with the bowl's rating, **whatever the bowl's verdict**, and refusal is tallied **before** the `unclassifiable` skip. Otherwise a cat refusing every mixed bowl in days 1–14 while eating two plain trial bowls leaves the lane silent (break 1).
- **`attributionChecked`** for a bowl is the AND over its components, and `darkDays` is set per component. Otherwise an unchecked component can sit under appendix C's "carries nothing the trial diet does not" (break 5; the third-pass R7(c) failure in the diet trial spec).
- **Antigen provenance is per component.** A permitted component's antigen keeps its `fromPermitted` credit inside a bowl whose verdict is off-diet.

**Log-time heads-up** (`lib/mealTrialFlag.ts`, `lib/trialContaminant.ts`): evaluate every component; the flag's `foodId` is the **offending component**, for the once-per-food ledger and for Undo. Copy names the component: "This bowl has chicken in it, from {Chicken Pâté}." / "{Chicken Pâté} isn't on {pet}'s trial list." P-4 and P-5 govern the two special cases.

### §5.3 Share is stored, not fed to the engines
Share is a proportion of a bowl whose size is unknown (`meals.quantity` is always written `'unknown'`, `lib/meals.ts:108`), so share is not a dose. **CUL-229 stays blocked on portion capture**; this spec gives it half of what it needs and nothing more. A transition also raises share steadily over time, so share and time cannot be separated in v1. The signal engine's exposure set takes the **union** of component proteins (`generate-signal/pipeline.ts:359`, `detection.ts:3289`); missing a component turns an exposed day into a control day.

### §5.4 Intake on a mixed bowl
One rating, for the bowl.
- **Daily intake mean (Trigger A):** includes the bowl; it is a fact about the pet.
- **Per-food finished rate** (`lib/analytics.ts:598`): the bowl counts for **neither** food. The report discloses how many bowls were excluded.
- **Per-food decline (Trigger B,** `detection.ts:4455`**):** keeps the shipped rule, which fires on an outright **refusal** only (`detection.ts:~4479`). Two histories feed it: each food's single-food meals, and each **composition key**'s mixes. A refused mix trips Trigger B for any component with an eaten-well single-food history **or** for its composition key with an eaten-well mix history, labelled as the bowl: "refused Chicken mixed with Rabbit." Without the composition history, about 12 days of mixes only drain every single-food baseline (14 days, 3 samples, `detection.ts:2734-2738`) and Trigger B goes silent for the whole transition (pass 1, break 2).
- **Other bowl-rating readers** follow the per-food rule: the client `detectIntakeDecline` (`lib/analytics.ts:1026`, parity-pinned to the server) uses the same two histories; `lib/foodFavorites.ts` "reliable favorites" and the per-protein finished rate (`computeTopProteins`, `lib/analytics.ts:~722`; ports at `ask/tools.ts:1241`, `:1329`) exclude mixed bowls.
- Nothing may claim acceptance or rejection of either food from a bowl rating, or attribute a decline to "adjusting to the new food." A cat eating around the new food is unknowable from one rating (n=1); the sequence of ratings and the owner's note are the record.

## §6 The transition, derived at read

`transition_started_at` stays NULL; the app never writes it and never moves `started_at`. Everything here is computed from the record, at read, in one function beside `classifyFeeding`.

### §6.1 Before a trial (the transition in)
- **Matching is on undated identity.** Allowed-set membership is dated from `started_at` (`lib/dietTrialSetup.ts:444`, `membershipOn`), so before Day 1 nothing is "in" the set. §6 matches each component's food key against the `diet_trial_foods` rows in force **on `started_at`**, never against membership on the meal's own date; otherwise "first fed" comes back empty and the disclosure silently vanishes (pass 1, break 6b).
- **First fed:** the earliest meal containing a `primary_diet` food within a bounded lookback before `started_at`, with its share: "first fed Sep 25, mixed, about ¼."
- **First exclusive day:** the first day of the **unbroken** run of logged days, ending at `started_at` or today, where the day has **at least one non-treat feeding**, every bowl's components are all in the allowed set, **and** no free-choice arrangement for a non-allowed food is active (018 / 076). A treat-only day does not qualify (§5.1 excludes treats from coverage; 15.7% of covered days are treat-only). An unlogged day breaks the run, so the answer can be **Unknown** (pass 1, break 6a). **Falsification (held):** the owner runs out of chicken on day 3, feeds rabbit only for a day, then goes back to mixing; a naive "first trial-only day" lands on day 3, the unbroken-run rule does not.
- **"Previous diet"** on the report counts each bowl's non-trial components, and "Transition" counts its trial components. The dominant food decides neither. This is CUL-1997's fix.

### §6.2 After Day 1
Mixed bowls stay off-diet exposures (§5.2) and are disclosed as "N were mixed bowls containing the trial diet." Whether the owner also gets a heads-up is P-4.

### §6.3 Coming off a trial (reintroduction)
Not a declared rechallenge (out, D8). The report derives a **New foods introduced** line (P-6): the first date any amount of the food was fed (share does not matter), the ratio ramp across bowls, and symptoms in the forward window shown **side by side, never as attribution**. The window is the **union of per-exposure windows**, from first fed to last fed plus the species window (cat 7 days, dog 14, same day excluded: `CHALLENGE_WINDOW_DAYS`, `lib/dietTrial.ts:3372`), matching the shipped `isWithinChallengeWindow` (`:3387`). A window anchored only at first fed would miss a day-11 flare after a ramp that reached 100% on day 10 (pass 1, break 7). A zero count in the window is never rendered as "none." The ramp is context: a flare at 100% reads differently from one at 25% [Dr. Chen's judgment], but presence still sets the first-exposure date.

## §7 Surfaces

### §7.1 Owner logging (R6 B)
- **First mix:** "+ Mixed with another food" on the meal card (P-1), for `food_type = 'meal'`. The card hides and the picker opens bound to this event, the `pairedEventId` pattern (`app/log.tsx:76-115`), reusing `FoodPicker`'s SELECTION mode (`components/log/FoodPicker.tsx:39-50`) with the first food locked and a cap of 2. Banner: "Mixing with {food} in {Pet}'s bowl. Pick the other food."
- **Ratio step:** "About how much of each?" A compact sheet rising over the picker (mock M2), with a split bar, the five chips (P-2), first food on the left, nothing preselected. A chip tap picks and draws the bar; **Save** writes the bowl (PM, 2026-10-23, [CUL-2133](https://linear.app/projectnyx/issue/CUL-2133): this replaces "the chip tap is the save", because on device a mistap was recorded before the owner could change it; a timed auto save was rejected). Tapping the veil returns to the picker with nothing written. "Other amounts…" opens one unit picker shared by both foods (cans, cups, grams, %) and one field per food. There is no "Not sure" (P-3).
- **One unit per bowl** means a share always exists and the app never converts wet to dry. A bowl measured in two different units is out of v1; the owner enters a % instead.
- **After the fact:** the same line on the event detail screen, twin of the retroactive med entry (`app/event/[id].tsx:1022-1036`).
- **Repeat (the transition days):** a mix enters FAB recency as one item keyed by its **set of foods**, not its ratio (`lib/fabRecentFoods.ts`). The pill reads "⅓ Chicken + ⅔ Rabbit" and logs the latest ratio in one press.
- **Moving the ratio:** on a mix's completion card, the mixing slot becomes a two-way stepper: "More Chicken ‹ ⅓·⅔ › More Rabbit." One tap moves one stop in **either** direction. The app never picks the direction (R4).
- **No "transition in progress" state.** Nothing is declared, nothing is inferred into an owner-facing state, nothing ends. The pill ages out of the 14-day window once the mix stops being logged.
- **Undo** on the card removes the whole bowl through the one reversal, `reverseLoggedEvent` (C-20). **Fixing one food is an edit:** edit-event lists each food with "Change" and "Take {food} out of this bowl", through `setMealComponents`.
- **Voice:** past tense, no "!", and the word "transition" never appears in owner copy.

### §7.2 History, spine and card
One row, one node. Label "⅓ Chicken + ⅔ Rabbit"; with no share (a later path only, P-3), "Chicken + Rabbit". The ratio is text, never a pie (Principle 8; a pie at row size leans on colour). The spine glyph is the meal disc with a "+". Card title in the CUL-894 shape: "Logged · ⅓ Chicken + ⅔ Rabbit". On truncation the ratio is protected (`flexShrink: 0`, C-8). **Runs** (`lib/spineCompaction.ts:141-148`) key on the composition key **plus ratio**: identical mixes compact, and a ratio step breaks the run, so the step is visible in the record.

### §7.3 The vet report
- **Meal log (appendix E):** a mix is its own row, and every share is **named**, so a ramp cannot print inverted when position 0 differs between bowls: "Rabbit LID + Chicken Pâté, mixed · ×7 · Oct 19–25 · Rabbit about ⅔ → about ¼". The ratio is shown as the owner entered it and labelled owner-estimated (T8).
- **Trial block, page 1:** "Day 1: Sep 28, owner-entered. Trial diet first fed Sep 25, mixed with {old food} on 3 days before Day 1." The derived first exclusive day is shown **whenever it is later than Day 1 or Unknown**. The label never claims "trial diet only," because §6.2's after-Day-1 mixes can contradict it (P-6; pass 1).
- **Off-diet exposures (appendix C):** the row names the **offending component**, not `mealFoodLabel(e.meal!)` (`report.ts:5102`, which reads the dominant food and would list Rabbit as the off-diet food in a rabbit-dominant bowl). Adds "in a mixed bowl with the trial diet (×N)". A component edit made more than 24h after the meal shows "edited {date}".
- **Intake:** "Ate some (mixed bowl)." Mixed bowls are excluded from per-food rates, with the count disclosed.

### §7.4 The Foods tab and food detail
A mix is **never a library item** (team call, Designer lens, 2026-10-19; the PM can reverse). The library holds foods you buy; a mix is something you did with two of them, and §3 already rejected a "mix" food (a transition would mint three or four of them). So:
- **Foods tab rows** keep their recency note and count a food's mixed bowls in it, disclosed: "Last logged today · 12 times · 8 in a mix". This is recency, not a rate, so counting the bowl is honest (§5.4 keeps it out of every rate).
- **Food detail** gains one read-only section, "In mixed bowls", only when the food has been mixed: "8 bowls with Rabbit Pâté · last Oct 22", tapping through to those days in History.
- **The FAB and the picker's recent row** are where a mix lives as a thing you can repeat (§7.1). Nowhere else.

### §7.5 Motion and delight (mock round 2)
Every motion reuses a shipped constant (C-30); the feature adds **no new spring**. The delight is the record taking shape, not new choreography. Motion & IA lens, 2026-10-19; drawn and playable in round 2.

| Moment | Motion | Haptic | Reduce Motion |
|---|---|---|---|
| Card gains "+ Mixed with another food" | Arrives with the card's words (`SHEET_SPRING` rise, words 120→300 ms, `completionMotion.ts:43-69`). No pulse: a door stays still. | none of its own | 150 ms crossfade |
| Card → picker → card | The med-combo path unchanged: card exits 180 ms with 8 pt drift; picker on the platform modal; card returns 450 ms after `router.back()` (`app/log.tsx:432`). | — | crossfade |
| The split sheet rises | The shared sheet motion (`sheetMotion.ts`, `SHEET_SPRING`), its own veil fading with it; the picker stays put beneath. | none | crossfade |
| Tap a split | The bar draws in on the shipped "compare" kind: 420 ms `MARK_EASE`, second segment +120 ms (`drawInMotion.ts:59-61`), each segment carrying its fraction. A pick, not a save: Save closes at once, so D-M2's 540 ms hold is retired (CUL-2133). | none at the chip | bar appears at its split |
| Card returns as the mix | Full arrival and `commitRoutine` (D-M1: a real write reaches the hand). Title lands whole; **no number roll**. | `commitRoutine` | crossfade |
| Stepper tap | Value and title crossfade 180 ms in place; `rescheduleHide(1500)`; end stop dims to 0.4 and says why (C-7). | `selectChip` on save, same both directions | instant |
| MIX pill on the FAB | Ordinary recent-food pill: `FAN_SPRING`, 38 ms stagger, the disc's flight to the check on `FLIGHT_SPRING`. **No gold outline.** | `commitRoutine` at reveal | no flight, 150 ms crossfade |
| History | Still. Rows draw in once with the day; runs fold **within a day** (`spineCompaction.ts:141-148`). | — | — |
| Undo a mix | Shipped collapse: unwrite 180 ms, fold 300 ms, "Removed". The bowl goes as one. | `destructiveConfirm` | crossfade |
| Take out a food | History's `foldAway`: lift 180 ms + 8 pt, close 300 ms. **Staged until Save** (D-M4). | none | instant |

**Never:** a celebration at 100% of the new food; gold on a door; stepper arrows that hint a direction or auto-repeat; a rolling ratio; motion when a History run breaks; a spinner for a local save; a custom slide over the platform modal.

**Two shapes for the record, D-M3, deferred out of this build to [CUL-2049](https://linear.app/projectnyx/issue/CUL-2049) (PM, 2026-10-20):** a split bar on each mixed History row (one bowl = full width; dropped when a segment cannot carry its label), and a "switch strip" on food detail (one bar per bowl, this food's share, fractions under each, unlogged days as gaps, no target line or projection). Each needs a chart-table row and the Data Scientist's sign-off before build.

## §8 Consumers and build sequence

**Must be mix-aware before the first mix is written** (reading the dominant food here produces a false clinical statement):

| Consumer | False statement if it reads only the dominant food |
|---|---|
| Trial classifier (`lib/dietTrial.ts:972`; via `dietTrialFacts`, `trialContaminant`, `dietTrialCard`, `generate-report/trial.ts`) | A mostly-trial bowl with off-diet chicken "matched the trial diet." |
| Log-time heads-up (`lib/mealTrialFlag.ts:60`) | No warning for the minor component. |
| Signal exposure (`generate-signal/pipeline.ts:359`, `detection.ts:3289`) | An exposed day becomes a control day. |
| Report meal rows and dedupe (`generate-report/index.ts:1222`, `:529-557`; `report.ts:1248`) | "Rabbit" for a chicken and rabbit bowl; a same-minute plain rabbit re-log collapses the mix and loses the chicken. |
| Same-minute collapse (`lib/sameMinuteDuplicates.ts:79-80`) | Same as above, client side. Key on the composition key, in lockstep with `report.ts`. |
| Intake decline Trigger B (`detection.ts:4455`) | "Refused her usual Chicken." |
| Per-food finished rate (`lib/analytics.ts:598`) | "Rabbit finished 90%." |
| AI context and Ask (`analyze-vomit/index.ts:776`, `analyze-stool/index.ts:849`, `_shared/incidentMayWaitEvidence.ts:83`, `ask/index.ts:665`, `ask/tools.ts`) | "What she ate before this" omits a food; the vomit treat test must use "any non-treat component." |
| Trial refusal lane (`lib/dietTrial.ts:2884-2926`) | A cat refusing every mixed trial bowl reads as eating the trial diet (§5.2). |
| Client intake decline (`lib/analytics.ts:1026`) | The trial card shows the clean adherence line over a refused mix. |
| Favorites and per-protein finished rate (`lib/foodFavorites.ts`; `lib/analytics.ts:~722`; `ask/tools.ts:1241`, `:1329`) | A bowl rating becomes an acceptance claim about one food. |
| No-trial report filters and tallies (`report.ts:~5087`, `report.ts:3461`) | A chicken component of another food type loses its exposure. Evaluate type per component. |
| History and spine (`lib/db.ts:507-536`, `lib/spineNode.ts`, `lib/spineCompaction.ts`) | Not clinical, but it is the feature; v1 shows both foods. With `food_item_id` NULL (T2) it would otherwise show an unnamed meal. |

**May keep reading the dominant food in v1:** diet churn (`detection.ts:7017`, errs toward silence), meal timing (ignores food), widget snapshot, rundown, med strip, month reads, `collapseTreatRelogs` (treats only; key it on the composition anyway).

**Build rows** (readers before the writer, T9). **Forecast: 5 rows.**
1. Migration 103, schema only. Applied when the PM types `apply 103`. `rls-privacy-reviewer`.
2. `lib/mealComposition.ts`, the local mirror, sync and hydration (§3, §4). No writer.
3. Server readers (classifier in `generate-report/trial.ts`, signal exposure, report rows and dedupe, Trigger B, AI context, Ask) and the §6 derived transition. **`adversarial-reviewer` mandatory; `vet-report-cold-read` mandatory.** Deploys on merge.
4. App readers: trial card, heads-up, analytics, same-minute collapse, History and spine.
5. The writer and UI (§7.1), **unflagged** (PM, 2026-10-20: small enough to ship on for every account). It lands whole in one PR, because nothing hides a half-built surface, and merges only after the on-device check passes.

**Older builds:** with T2, an older build reads a mix as a meal naming no food: History shows it unnamed and the trial card discloses it as unclassifiable, which errs loud. **Residual, stated:** an older build editing that meal's food through `updateMealFood` gives the parent a food while components stay live; components win (§3), so the old build's edit vanishes. The pre-1.2.0 install base is small; not built for.

**Adversarial record.** Pass 1 (2026-10-19, isolated, spec stage): 10 breaks, 9 quiet and 1 loud, all folded in above and marked "pass 1". Held: union exposure on one `MealEvent`, constant-staple washout during a transition, denominator counted once, pre-start bowls out of window, mixed bowls excluded from per-food rates, unknown ratio inert in every engine, plain-vs-mix same-minute separation. A second pass on the revised §5–§6 has **not** run; the row 3 PR carries the mandatory build-time pass.

## §9 Mock round 1 (published 2026-10-19)

`docs/culprit-mixed-meals-mockups.html`, published at https://claude.ai/artifact/JsaLnSwdqeuyQZAXqgEWFY. It draws frames 1–3, 5–8, 10, 11, 14 and 15 of the list below, plus P-1 (b), P-4 (b), P-5 (b) and P-6 (b) as labelled options. Frames 4, 9, 12 and 13 and the real-timer prototype follow in round 2.


Drawn against the real 5000 ms / 1500 ms / 7000 ms card timers (the med-combo lesson, `docs/medication-food-combo-investigation.md` §9). Options that differ visually (P-1, P-2, P-4) render side by side.

1. The meal card at worst-case density: "+ Mixed with…", the med line and the trial panel together.
2. The picker in pairing mode: first food locked, banner, cap of 2.
3. The ratio step: split bar, five chips as ruled (P-2), "Other amounts…".
4. Custom amounts, same units and different units.
5. The mix card arriving, title in place, crossfade under Reduce Motion, with the stepper.
6. The FAB fan with a mix pill at 390 pt and at large text.
7. A mix card after one stepper tap.
8. A History day: a run of identical mixes, a ratio step breaking it, a refused mix, at the 12-event fixture.
9. The spine glyph for a mix.
10. Event detail's mixed-bowl section, and the retroactive line on a single meal.
11. Edit-event with "Change" and "Take out" per food.
12. Undo removing a mix.
13. Sam's week: the ratio rising while bowl ratings fall.
14. A trial heads-up on a mix with one non-allowed food, and P-4's option (b) beside option (a).
15. Report page 1 trial block and appendix E rows with mixes (P-6).

## §10 Acceptance criteria

**Schema (row 1):** migration applies cleanly; `get_advisors` differential clean; another account cannot read a component; an insert naming another account's `food_item_id` returns 42501; an insert whose event belongs to another pet is refused by the trigger; frozen columns cannot change; rollback verified on a branch.

**Composition and sync (row 2):** shares normalise over live components; the tie rule returns position 0; after any offline interleaving of two devices the live set equals one device's whole set; a meal with `component_count = 2` and one live component reads as incomplete; the table is in `LOCAL_WIPE_TABLES`; hydration lands components after meals.

**Clinical readers (rows 3–4):**
- A property test shows verdict, counts and antigens are unchanged when the dominant-food choice changes, and no trial or exposure reader reads `meals.food_item_id` for a mix.
- A trial-food + chicken bowl in window: one feeding, one off-diet exposure, antigens include chicken, appendix C names the chicken component.
- On-list rabbit + off-list rabbit of another brand: one `off_diet_unrecognised`, no new antigen. Two components with the same food key collapse to one.
- A bowl with any non-treat component counts toward coverage; an all-treat bowl does not.
- A purged component resolves through `food_label`; a component with no identity makes the bowl `unclassifiable`.
- A mix at 23:50 local the day before Day 1 is out of window; at 00:10 on Day 1 it is in. Pinned under UTC−7 and UTC+11 (C-29).
- A plain rabbit meal and a rabbit-dominant mix within 60 s do **not** collapse.
- A refused mix trips Trigger B for a component with a solid history; a finished mix adds to no per-food rate.
- Pass 1 fixtures, each a failing test first: refused mixed trial bowls on days 1–14 with two eaten plain bowls fire the refusal lane; 14 days of mixes only, then a refused mix, fires Trigger B on the composition key; a NULL count over two live components reads as a mix; an older-build reader over a mix discloses unclassifiable, never "all matched"; a bowl with one unchecked component never prints the rung-3 all-clear reason; a treat-only day never starts the exclusive run; a day-11 flare after a ramp ending on day 10 appears beside the food.
- Editing a meal into a mix after a vomit read never lowers or re-runs the stored read; the report recomputes the juxtaposition with no causal wording.
- CUL-1997's demo story renders "first fed" and the transition days on page 1. (Its second finding, the trial food listed under two names, is a food-identity fix outside this spec.)

**Writer and UI (row 5):** on a physical device, the first mix is logged from the meal card in under 15 s and a repeat from the FAB in one press (timed, in the QA script); undo removes the whole bowl; taking a food out leaves a plain meal; a synced 3-food mix renders "+1 more"; a 0% component cannot be saved; a single-food meal logs, reads and renders exactly as before (snapshot or render test over the meal card, History row and FAB pill; this replaces the flag-off differential, since there is no flag).

## §11 Copy (proposed, through `nyx-voice` at row 5)

| Where | Line |
|---|---|
| Meal card | "+ Mixed with another food" |
| Picker banner | "Mixing with {food} in {Pet}'s bowl. Pick the other food." |
| Ratio step | "About how much of each?" · "Other amounts…" |
| Custom fields | "Amounts, as you measured them" |
| Stepper | "More {food} in this bowl" |
| Event detail | "Mixed bowl · ¼ can Chicken, ½ can Rabbit (about ⅓ and ⅔)" |
| Heads-up, contents | "This bowl has {protein} in it, from {food}." |
| Heads-up, membership | "{food} isn't on {pet}'s trial list." |
| Heads-up, past target (P-5) | "If {pet}'s trial is over, ending it here keeps the record straight." |
