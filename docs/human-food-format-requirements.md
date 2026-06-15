# "Human food" food category — Requirements

**Version:** 0.1 | **Status:** Spec (pre-implementation) | **Date:** 2026-06-15 | **Backlog:** B-102

> Output of a product-team spec session (2026-06-15). Read this **and** `CLAUDE.md` before starting the implementation session. It composes with **B-017** (the `food_format`/`food_type` axis reshape) and follows the **B-024** (jerky) additive precedent. One decision (**D1**, §3) is provisional and needs PM ratification before the schema section is final.

---

## 1. Problem

People-food given to a pet — turkey deli meat, Costco rotisserie chicken, a piece of cheese, plain boiled chicken — has **no honest home** in the food model today.

- `food_type` (usage: `meal` / `treat` / `other`) handles it fine — it's almost always a `treat`.
- `format` (physical form: `dry_kibble` / `wet_canned` / `raw` / `freeze_dried` / `fresh_cooked` / `topper` / `treat` / `jerky` / `other`) has no value for it. The closest, `fresh_cooked`, over-implies a home-prepared bland diet; `other` carries no information.
- The `extract-food-from-photo` Edge Function's format enum (`dry`/`wet`/`raw`/`freeze_dried`/`jerky`/`treats`/`supplement`/`other`) has no value either, so a photo maps to `other`.

**Consequence:** a clinically meaningful, high-frequency class of feeding is invisible to the vet report and the correlation engine.

### 1.1 Why it's worth building (evidence)

Not an edge case. A peer-reviewed cross-sectional study of cat *treat* behavior (n=337, US/Canada) found:

- **48%** (162/337) feed "human food prepared for the pet" as a treat category.
- **23.6%** (78) feed human food **frequently** (daily or a few times weekly).
- **19.3%** (64) feed **jerky** frequently (independently validates B-024).
- Treats are a **median 15%** of total diet (above the 10% vet guideline).
- Cats fed table scraps **daily** had **4.22× odds** of being overweight/obese (p=0.024); very thin cats received human food significantly more often (p<0.003).

Directional corroboration: a dvm360 clinician handout cites ~85% feed human food / ~25% feed table scraps. Full citations in §13.

**Clinical significance (Dr. Chen):** deli meat = sodium / nitrates / frequent onion-garlic powder (allium toxicity); rotisserie skin = fat + seasoning. For the diet-trial wedge user, human food is the #1 confounder that silently invalidates a trial.

---

## 2. Decisions made this session

| # | Decision | Notes |
|---|---|---|
| D2 | **One bucket, not split.** A single `human_food` class, not separate home-cooked-vs-processed values. | Specificity is carried by the free-text `product_name` ("Turkey deli meat" vs "Rotisserie chicken"). Splitting adds a decision at log time → fails the 10-second test. Processed-vs-plain distinction deferred (§9). |
| D3 | **Label = "Human food."** Owner vocabulary, matches the study's wording. | Minor open item: "Human food" vs "People food" (§10). Enum value is `human_food` (snake_case, matches `fresh_cooked`/`dry_kibble`). |
| D4 | **Manual entry is the primary path.** Deli meat / rotisserie chicken have no pet-food packaging to photograph. | The photo+AI path still works if someone snaps a container, but the hero path is "Enter manually" → pick the chip. |
| D5 | **Engine treats `human_food` as a provenance signal** ("off-commercial-diet day"), derived from the format field — no separate column at v1. | This is how we get the Data Scientist's covariate without a second log-time decision. Contingent on D1. |
| D6 | **Vet report must surface human-food feeding** as a distinct, scannable class; **diet-trial flagging** is a desired downstream hook. | Rendering deferred to Step 9 / a diet-trial pass (§8). Spec the intent now so the report build accounts for it. |
| D7 | **No backfill.** Additive value; existing rows unaffected. | Legacy human foods currently mislabeled `fresh_cooked`/`other` stay as-is; the user can re-classify via the food detail screen. Mirrors B-024. |
| D8 | **Intake-chip gating unchanged.** The WSAVA intake chip (B-014) gates on `food_type='meal'`; human food given as a `treat` gets no intake prompt. | Correct for v1 — consistent with all other treats. Revisit only if treat-refusal capture (B-014's treat opt-in) makes it relevant. |

---

## 3. The axis decision (D1 — PROVISIONAL, needs PM ratification)

**Question:** is `human_food` a **`format` value** or a **provenance dimension**?

- **Option A — `format` value `human_food` (RECOMMENDED for v1).** One chip in the existing Format row. Cheap (`ADD VALUE`, B-024 precedent). Ships independent of B-017. *Cost:* conflates provenance into the physical-form axis — the exact mixing B-017 is meant to resolve.
- **Option B — provenance dimension** (e.g. `provenance` enum / `is_human_food` flag on `food_items`). Clean model, cleanest correlation covariate. *Cost:* a second decision at log time (Principle 1 / 10-second test) unless the UI hides it behind one chip; more schema. **Cheapest if bundled into B-017's already-destructive reshape**, most expensive standalone.

**Team recommendation:** **Option A**, with the detection/engine layer reading `format='human_food'` as the provenance signal (D5). Rationale: one chip satisfies the Designer + the 10-second test; the engine still gets the "off-commercial-diet" covariate; Eng gets the cheap path; the purity objection is real but outweighed for an MVP. Promotion to Option B is documented as the fallback if the engine later needs clean separation (and B-017 is the cheapest moment to do it).

**Dissent on record (Data Scientist):** provenance ≠ physical form; if we believe Option B is where this ends up, do it during B-017 rather than ship a throwaway format value first.

> The rest of this spec assumes **Option A**. If the PM ratifies Option B, §4–§5 change (new column + UI wiring instead of an enum value); §6–§13 are largely unaffected.

---

## 4. Schema change (Option A)

Single additive migration, no UI bundled (per CLAUDE.md migration-isolation rule).

```sql
-- Placed AFTER 'fresh_cooked' — its nearest semantic neighbor and picker position.
ALTER TYPE food_format ADD VALUE IF NOT EXISTS 'human_food' AFTER 'fresh_cooked';
```

**Migration Safety Pre-flight:**
- **Destructive:** `n` — additive enum value only; no column/data change.
- **Rollback:** Postgres cannot `DROP` an enum value; leaving `human_food` unused is harmless. A true reversal requires the full type-recreation dance and is only worth it if rows already use it. (Identical to B-024.)
- **Backfill:** `N/A` — no existing rows change.

**Note on `ADD VALUE`:** a freshly added enum value is unusable until the enclosing transaction commits, so this statement must not share a transaction with code that writes `'human_food'`. It stands alone, so that's safe.

**Composition with B-017:** when B-017's destructive reshape lands, it carries `human_food` forward exactly as it carries `jerky` (B-024). If D1 flips to Option B, fold the column into B-017 instead of shipping this migration.

---

## 5. Touch-point checklist — every list must learn the value

The recurring failure mode (B-024 / the line-68 onboarding gap) is a *partial* add where some lists know the value and others don't. The value is **not done** until all of these are handled:

1. **Migration** — `ALTER TYPE food_format ADD VALUE 'human_food'` (§4). *(confirmed needed)*
2. **`app/food-capture.tsx` → `FOOD_FORMATS`** — add `{ value: 'human_food', label: 'Human food' }` (after `fresh_cooked`). *(confirmed needed)*
3. **`components/log/FoodTile.tsx` → `FORMAT_LABEL`** — add `human_food: 'Human food'`. *(confirmed needed; otherwise the picker tile shows no format chip for it)*
4. **`app/onboarding/food.tsx` → `FORMAT_OPTIONS`** — **decide and document**: onboarding sets the pet's *staple* food, where human food is unlikely. Either deliberately omit it (and document the omission so it's not read as a bug) or add it. This list is *already* missing `topper`/`treat`/`jerky` — coordinate with the line-68/B-068 "derive both lists from one source" item rather than papering over it again. *(decision needed)*
5. **`supabase/functions/extract-food-from-photo/index.ts`** — add `human_food` to the tool's `format` enum + `mapFormatToDb`; add a client `mapAiFormat` case (`food-capture.tsx`). *(confirmed needed for the photo path; low priority since manual is primary — but without it a snapped container maps to `other`)*
6. **Local cache `food_items_cache`** — `format` is stored as TEXT (no enum constraint), so no migration there; **verify** no client-side validation rejects the new value.
7. **Analytics / dashboard** — audit `lib/analytics.ts` and the B-023 dashboard composition (`lib/dashboardCards.ts`, meals-vs-treats / format groupings) to confirm a new format value is handled gracefully (not dropped, not crashing a grouping). *(verify)*

---

## 6. UX

- **One chip.** `human_food` appears as "Human food" in the existing **Format** chip row on the food-capture **Edit/confirm** screen (`FOOD_FORMATS`). No new screen, no second decision.
- **Type stays separate.** The owner still picks `food_type` (Meal / Treat / Other) as today — human food is almost always `treat`, which is the default-after-meal behavior; no special-casing.
- **Picker tile** renders the format as metadata: `COSTCO · HUMAN FOOD` / `(brand) · HUMAN FOOD`. Honest and scannable.
- **Manual-first.** Because there's no packaging, the realistic flow is FAB → Meal → "Enter manually" → type brand/product, pick "Human food", pick "Treat" → log. The 10-second test applies to *re-logging* an already-created human-food library entry (one tap from Recent/Library), which this preserves.
- **Voice (nyx-voice + clinical-guardrails).** Neutral, non-judgmental. The category is a logging affordance, never a scold. No copy that implies "preference" or reassures (intake-is-not-preference / n=1-never-reassures invariants).

---

## 7. Detection / correlation-engine ingestion (D5)

- The engine reads `format='human_food'` as an **"off-commercial-diet" provenance signal** — a clean covariate for "did human-food days track with symptoms / weight?"
- This is **descriptive/associational**, not causal, and is bound by the existing Signal guardrails (never reassure on absence; counts attached; ranked below safety findings). It does not get to *sign* a correlation on its own.
- **v1 scope:** make the signal *available* to the engine (the format value flows through to wherever detection reads meals). Surfacing a human-food insight card is a **separate, later** detection-spec decision — do not auto-ship a card.

---

## 8. Vet report representation (intent — rendering deferred to Step 9)

- Human-food feeding should be a **distinct, scannable line/annotation** in the report's diet section — a vet must see "owner supplemented with human food N× this period" without hunting.
- **Diet-trial hook (desired, not v1):** logging `human_food` during an active `diet_trials` row is the canonical trial-confounder. A future pass may surface a warm, once-only note ("this may affect Bella's trial") and/or flag it on the report. Spec'd here so the Step 9 report build and any diet-trial work account for it; not in this item's build scope.

---

## 9. Out of scope (do not silently expand)

- **Processed-vs-plain split** (deli/cured vs plain boiled chicken). One bucket for v1; revisit only if clinical demand is shown.
- **Provenance column** (Option B) — unless D1 flips.
- **Diet-trial auto-warning UI** — desired hook (§8), separate build.
- **A dedicated human-food insight card** on the Signal surface — separate detection-spec call (§7).
- **A curated human-food catalog** — globally-scoped `food_items` with free-text names already covers "Rotisserie chicken" / "Turkey deli meat" as reusable entries; no seeded list needed.

---

## 10. Open decisions for the implementation session

| # | Question | Owner |
|---|---|---|
| D1 | `format` value vs. provenance dimension (§3). **Gates the schema section.** | PM |
| — | Label wording: "Human food" vs "People food". Low-stakes; spec assumes "Human food". | PM/Designer |
| — | Onboarding `FORMAT_OPTIONS`: omit `human_food` deliberately (staple-only) or include it — and fold into the line-68/B-068 "one source of truth" fix (§5.4). | Designer/Eng |
| — | Whether to ship standalone (B-024 path) or bundle into B-017. Depends on D1. | PM/Eng |

---

## 11. Build order (Option A)

Each step its own PR; schema never bundled with UI.

1. **Schema migration PR** — `ADD VALUE 'human_food'` only (§4). Migration Safety Pre-flight in the PR description.
2. **Picker/format wiring PR** — touch-points 2, 3, and the onboarding decision (4) from §5. Pure UI/constants; no schema.
3. **Edge Function PR** *(optional / low priority)* — extraction enum + mappings (touch-point 5), so a snapped container maps to `human_food` not `other`.
4. **Engine ingestion** *(folds into the next detection/Signal pass)* — make the provenance signal available (§7). Not a standalone PR unless a card is scoped.

---

## 12. Acceptance criteria

- Creating a food, "Human food" is selectable as a **Format** and persists (round-trips through `food_items` + `food_items_cache`).
- An existing already-created human-food entry **re-logs in ≤10 seconds** from Recent/Library (one tap).
- The picker tile renders the format label (`… · HUMAN FOOD`) — not a blank metadata line.
- Onboarding behavior for the value is **explicit** (present, or documented-omitted) — not an accidental gap.
- No existing food regresses (additive; no backfill).
- Copy passes the `nyx-voice` + `clinical-guardrails` review — neutral, no reassurance, no "preference" framing.
- *(If touch-point 5 shipped)* a snapped human-food photo maps to `human_food`, not `other`.

---

## 13. Evidence appendix

- **Cat-treat cross-sectional study (n=337, US/Canada)** — 48% feed human food prepared for the pet; 23.6% frequently; jerky 19.3% frequently; treats median 15% of diet; table-scrap-daily → 4.22× overweight/obese odds (p=0.024). https://pmc.ncbi.nlm.nih.gov/articles/PMC10781132/
- **dvm360 clinician handout** (directional) — ~85% feed human food / ~25% feed table scraps. https://www.dvm360.com/view/client-handout-no-feeding-pets-table-scraps
- **Vetstreet reader/vet poll** (weak — non-scientific) — ~59% feed from the table; of those ~31% daily / ~34% weekly. https://www.vetstreet.com/our-pet-experts/do-you-feed-your-pet-from-the-table-we-polled-readers-and-veterinary-professionals
- **"How and why pet cats are fed" survey (n=1,172, 2019)** — baseline context: 80.7% feed exclusively commercial. https://pubmed.ncbi.nlm.nih.gov/38381461/

**Data-quality note:** the n=337 study skews female, Canada-heavy, online, engaged owners — likely *over*-representing conscientious caregivers, so 48% is plausibly a floor for an engaged tracking-app audience (which is exactly Nyx's user).
