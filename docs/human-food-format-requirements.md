# "Human food" food category — Requirements

**Version:** 1.0 | **Status:** Spec — decisions ratified, ready for build | **Date:** 2026-06-15 | **Backlog:** B-102

> Output of a product-team spec session (2026-06-15), with all four PM decisions ratified the same day (§2). Read this **and** `CLAUDE.md` before starting the implementation session. It composes with **B-017** (the `food_format`/`food_type` axis reshape) and follows the **B-024** (jerky) additive precedent. The PR-by-PR build plan is §11.

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

## 2. Decisions (all ratified by PM 2026-06-15)

| # | Decision | Notes |
|---|---|---|
| **D1** | **`human_food` is a `format` enum value** (Option A), not a provenance dimension. | The team's recommended synthesis (§3); the engine reads the format value as a provenance signal rather than adding a column. Alternative (provenance column) recorded in §3 for a future revisit. |
| **D2** | **One bucket, not split.** A single `human_food` class, not separate home-cooked-vs-processed values. | Specificity is carried by the free-text `product_name` ("Turkey deli meat" vs "Rotisserie Chicken"). Splitting adds a decision at log time → fails the 10-second test. |
| **D3** | **Label = "Human food."** | PM-confirmed against the approved mockup. Enum value is `human_food` (snake_case, matches `fresh_cooked`/`dry_kibble`). "People food" was the considered alternative. |
| **D4** | **Ship standalone now** — additive `ALTER TYPE … ADD VALUE`, not bundled into B-017. | PM deferred to the team; team rec = B-024 (jerky) precedent. PR 1 ships independent of B-017, which carries the value forward in its later reshape. |
| **D5** | **First-class parity** — `human_food` must be "as supported as the existing formats (e.g. treats)." | PM directive. The backlog item (B-102) is a **PR-by-PR shipping guide** (§11). Parity is cheaper than it sounds — see §5. |
| **D6** | **Manual entry is the primary path.** Deli meat / rotisserie chicken have no pet-food packaging. | The photo+AI path still works (PR 3) but the hero path is "Enter manually" → pick the chip. |
| **D7** | **Engine treats `human_food` as a provenance signal** ("off-commercial-diet day"), derived from the format field — no separate column (per D1). | This is **net-new** work — detection keys off `food_type` today and ignores `format` (§5, §7). |
| **D8** | **No backfill; intake-chip gating unchanged.** | Additive value, existing rows untouched (re-classifiable via the food detail screen). The WSAVA intake chip (B-014) still gates on `food_type='meal'`; human food given as a `treat` gets no intake prompt — correct, consistent with all treats. |

---

## 3. The axis decision (D1 — RATIFIED: format value)

**Question was:** is `human_food` a **`format` value** or a **provenance dimension**?

- **Option A — `format` value `human_food` (CHOSEN).** One chip in the existing Format row. Cheap (`ADD VALUE`, B-024 precedent). Ships independent of B-017. *Cost:* conflates provenance into the physical-form axis — the mixing B-017 is meant to resolve. Mitigated by D7 (engine reads it as provenance).
- **Option B — provenance dimension** (e.g. `provenance` enum / `is_human_food` flag). Cleaner model + correlation covariate, but adds a second log-time decision (Principle 1 / 10-second test) and more schema; cheapest only if bundled into B-017. **Recorded for a future revisit** if the engine ever needs clean provenance separation — B-017 would be the moment to promote.

**Rationale for A:** one chip satisfies the Designer + the 10-second test; the engine still gets the "off-commercial-diet" covariate via D7; Eng gets the cheap path. The Data Scientist's purity objection (provenance ≠ physical form) is on record and outweighed for an MVP.

---

## 4. Schema change (PR 1)

Single additive migration, no UI bundled (migration-isolation rule).

```sql
-- Placed AFTER 'fresh_cooked' — its nearest semantic neighbor and picker position.
ALTER TYPE food_format ADD VALUE IF NOT EXISTS 'human_food' AFTER 'fresh_cooked';
```

**Migration Safety Pre-flight:**
- **Destructive:** `n` — additive enum value only; no column/data change.
- **Rollback:** Postgres cannot `DROP` an enum value; leaving `human_food` unused is harmless. (Identical to B-024.)
- **Backfill:** `N/A` — no existing rows change.

**Note:** a freshly added enum value is unusable until its transaction commits, so this statement must not share a transaction with code that writes `'human_food'`. It stands alone, so that's safe. When B-017's reshape lands, it carries `human_food` forward exactly as it carries `jerky`.

---

## 5. How cross-cutting is `format`? (Audit findings — 2026-06-15)

Parity ("as supported as treats", D5) is **cheaper than expected**, because `format` is barely a cross-cutting dimension. Verified this session:

| Surface | Reads `format`? | Parity impact |
|---|---|---|
| Schema enum (`food_format`) | — | PR 1 adds the value. |
| Capture/Edit picker (`FOOD_FORMATS`, `app/food-capture.tsx`) | **Yes** | PR 2 — add the chip. |
| Picker tile label (`FORMAT_LABEL`, `components/log/FoodTile.tsx`) | **Yes** | PR 2 — add the label. |
| Onboarding (`FORMAT_OPTIONS`, `app/onboarding/food.tsx`) | Subset | **Omit** for parity — `treat` is omitted too (it's not a staple). Document + fold into the line-68/B-068 "one source of truth" fix. |
| AI extractor (`extract-food-from-photo` enum + `mapFormatToDb`; client `mapAiFormat`) | **Yes** | PR 3 — add the mapping (else a snapped container → `other`). |
| History row (`components/history/EventRow.tsx`) | **No** (only a date helper) | No change. |
| Dashboard / analytics (`lib/analytics.ts`, `lib/dashboardCards.ts`) | **No** — groups by `food_type` (meal/treat) and food_item | A `human_food` item logged as a treat already flows correctly via `food_type`. PR 4 = verify + regression test, not new grouping code. |
| Signal engine (`generate-signal/detection.ts`) | **No** — keys off `food_type` and food_item | Parity is automatic (a human_food/treat counts as a treat). The provenance covariate (D7/PR 5) is **net-new** — teaching detection to read `format` at all. |
| Vet report (Step 9) | (not yet built) | PR 6 — a distinct human-food line. |

**Takeaway:** PRs 1–4 deliver full first-class parity and are small. PRs 5–6 are the clinical payoff and are where the genuine new work lives.

---

## 6. UX

- **One chip.** `human_food` appears as "Human food" in the existing **Format** chip row on the food-capture **Edit/confirm** screen. No new screen, no second decision. (See the approved mockup.)
- **Type stays separate.** The owner still picks `food_type` (Meal / Treat / Other); human food is almost always `treat`.
- **Picker tile** renders the format as metadata: `COSTCO · HUMAN FOOD`. Honest and scannable.
- **Manual-first** (D6). The 10-second test applies to *re-logging* an already-created human-food entry (one tap from Recent/Library), which this preserves.
- **Voice (nyx-voice + clinical-guardrails).** Neutral, non-judgmental. The category is a logging affordance, never a scold. No "preference" framing, no reassurance.

---

## 7. Detection / correlation-engine ingestion (D7 — PR 5, net-new)

- Detection currently **ignores `format`** entirely (keys off `food_type` + food_item). PR 5 teaches it to read `format='human_food'` as an **"off-commercial-diet" provenance signal** — a covariate for "did human-food days track with symptoms / weight?"
- **Descriptive/associational only**, never causal; bound by the existing Signal guardrails (never reassure on absence; counts attached; ranked below safety findings). It does not get to *sign* a correlation on its own.
- **Scope:** make the signal *available* to the engine. A dedicated human-food insight card is a **separate, later** detection-spec decision — do not auto-ship a card. This PR is clinically/statistically load-bearing → **adversarial-reviewer** required, tests required.

---

## 8. Vet report (PR 6, depends on Step 9)

- Human-food feeding should be a **distinct, scannable line/annotation** in the report's diet section — a vet must see "owner supplemented with human food N× this period" without hunting. **vet-report-cold-read** review once rendered.
- **Diet-trial confounder note (PR 7, Later):** logging `human_food` during an active `diet_trials` row is the canonical trial-confounder. A future pass may surface a warm, once-only note and/or a report flag. Touches `diet_trials` + copy/notification — its own feature, gated.

---

## 9. Out of scope

- **Provenance column** (Option B) — unless a future call promotes it via B-017 (§3).
- **Processed-vs-plain split** (deli/cured vs plain boiled chicken). One bucket for v1 (D2).
- **A dedicated human-food insight card** on the Signal surface — separate detection-spec call (§7).
- **A curated human-food catalog** — globally-scoped `food_items` with free-text names already covers "Rotisserie Chicken" / "Turkey deli meat" as reusable entries.

---

## 10. Open decisions

All ratified 2026-06-15: **D1** format value; **D3** label "Human food"; **D4** ship standalone; **D5** first-class parity. Onboarding inclusion resolved by the parity principle (omit, matching `treat`; §5). **Nothing blocks the build.**

---

## 11. PR-by-PR build plan

Each step its own PR; schema never bundled with UI. **PRs 1–4 = full parity (D5). PRs 5–6 = clinical value (recommended fast-follow). PR 7 = later.**

| PR | Title | Touches | Scope | Review |
|---|---|---|---|---|
| **1** | Schema: add `human_food` to `food_format` | `supabase/migrations/0NN_food_format_human_food.sql` | `ALTER TYPE … ADD VALUE 'human_food' AFTER 'fresh_cooked'`. Additive, non-destructive, no backfill. Ships now (D4). | Migration Safety Pre-flight |
| **2** | Capture + display parity | `app/food-capture.tsx` (`FOOD_FORMATS`), `components/log/FoodTile.tsx` (`FORMAT_LABEL`), `app/onboarding/food.tsx` (document the omission) | Add the "Human food" chip + tile label. No schema. This is the bulk of "as supported as treats." | code-reviewer; Designer (chip/voice) |
| **3** | AI-extraction support | `supabase/functions/extract-food-from-photo/index.ts` (tool enum + `mapFormatToDb`), `app/food-capture.tsx` (`mapAiFormat`) | A snapped human-food container maps to `human_food`, not `other`. Lower priority (manual is primary). | code-reviewer; Edge Function tests |
| **4** | Dashboard/analytics parity (verify) | `lib/analytics.ts`, `lib/dashboardCards.ts` (likely tests only) | Confirm a `human_food`-format item logged as a treat flows through top-foods + meals/treats composition via `food_type`. Add a regression test; fix only if a format-enumerating surface drops it. | code-reviewer; QA |
| **5** | Engine provenance signal *(net-new, beyond parity)* | `supabase/functions/generate-signal/detection.ts` (+ tests) | Read `format='human_food'` as an off-commercial-diet covariate; make it available to detection. No insight card. | **adversarial-reviewer** (load-bearing); tests |
| **6** | Vet-report human-food line | vet-report renderer (Step 9) | Distinct, scannable human-food line in the diet section. | **vet-report-cold-read** |
| **7** | Diet-trial confounder note *(Later)* | `diet_trials` consumers + copy/notification | Warm, once-only note when `human_food` is logged during an active trial; optional report flag. | Designer; clinical-guardrails |

---

## 12. Acceptance criteria

**Parity (PRs 1–4):**
- "Human food" is selectable as a **Format** and round-trips through `food_items` + `food_items_cache`.
- An existing human-food entry **re-logs in ≤10 seconds** from Recent/Library (one tap).
- The picker tile renders `… · HUMAN FOOD` (not a blank metadata line).
- Onboarding behavior is **explicit** (omitted + documented, matching `treat`).
- No existing food regresses (additive; no backfill).
- A `human_food`/treat item appears correctly in dashboard top-foods + composition (regression test).
- Copy passes `nyx-voice` + `clinical-guardrails` — neutral, no reassurance, no "preference" framing.
- *(PR 3)* a snapped human-food photo maps to `human_food`, not `other`.

**Clinical value (PRs 5–6):**
- The engine can identify human-food days; adversarial-reviewer confirms no false reassurance and no causal claim.
- The vet report shows human-food feeding as a distinct line; vet-report-cold-read returns CLINIC-READY.

---

## 13. Evidence appendix

- **Cat-treat cross-sectional study (n=337, US/Canada)** — 48% feed human food prepared for the pet; 23.6% frequently; jerky 19.3% frequently; treats median 15% of diet; table-scrap-daily → 4.22× overweight/obese odds (p=0.024). https://pmc.ncbi.nlm.nih.gov/articles/PMC10781132/
- **dvm360 clinician handout** (directional) — ~85% feed human food / ~25% feed table scraps. https://www.dvm360.com/view/client-handout-no-feeding-pets-table-scraps
- **Vetstreet reader/vet poll** (weak — non-scientific) — ~59% feed from the table; of those ~31% daily / ~34% weekly. https://www.vetstreet.com/our-pet-experts/do-you-feed-your-pet-from-the-table-we-polled-readers-and-veterinary-professionals
- **"How and why pet cats are fed" survey (n=1,172, 2019)** — baseline: 80.7% feed exclusively commercial. https://pubmed.ncbi.nlm.nih.gov/38381461/

**Data-quality note:** the n=337 study skews female, Canada-heavy, online, engaged owners — likely *over*-representing conscientious caregivers, so 48% is plausibly a floor for an engaged tracking-app audience (which is exactly Nyx's user).
