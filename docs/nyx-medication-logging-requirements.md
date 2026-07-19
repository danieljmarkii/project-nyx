# Medication Logging — Requirements

**Version:** 1.0 | Created: 2026-06-19 | Backlog: **B-117**
**Status:** Decisions ratified by PM (2026-06-19). Build queued — this doc is the build-ready spec + PR-by-PR guide. No schema or code shipped in the spec session.

---

## 1. Problem

`medication` is a live `event_type` enum value (`supabase/migrations/001_schema.sql:88`) but has no model and no UI — `constants/eventTypes.ts:34-35` explicitly parks it post-MVP. There is no drug/dose/route/frequency data, no medication library, and no "did the owner actually give the dose?" adherence. Today the app cannot answer "what is this pet on, and are they getting it?"

This is a real clinical gap, not a convenience feature:

- **Meds are a first-order symptom confounder.** A "chicken → vomit" finding from the Signal engine (Step 10) might really be "antibiotic → nausea." The diet trial then "fails" for the wrong reason. Medication adherence is one of the most common reasons real diet trials get misread — and the engine currently can't see meds at all.
- **The vet report (Step 9) is clinically incomplete without them.** Dr. Chen cannot assess a diet trial or a symptom trend without knowing what drugs the pet is on, the dose, and whether they're actually being given. The Step 9 spec (`nyx-technical-spec-v1_0.md:218`) currently lists no medication content.
- **Adherence is the load-bearing question, and it mirrors a problem we've already solved.** "Did the owner give the dose?" is the same offered-vs-consumed split that `meals.intake_rating` (B-014) solved for food.

### 1.1 The clinical asymmetry vs. food (why this is *not* just "food for pills")

| | Food intake (B-014) | Medication adherence (B-117) |
|---|---|---|
| Missing a "dose" | Suboptimal nutrition; trial inconclusive | Infection untreated; seizure / cardiac / glycemic risk on a **critical** drug |
| Absence of a log | No clinical concern | A **clinical gap** — forgot? spat out? unclear instructions? |
| False-reassurance risk | Medium | **High** — "no missed doses → all good" is forbidden (see §6) |
| Confounding the Signal | Medium | **High** — steroids/antibiotics/antihistamines shift the whole symptom baseline |

---

## 2. Decisions (all ratified by PM, 2026-06-19)

| # | Decision | Ruling |
|---|---|---|
| **D1** | Data model shape | **Regimen + dose events.** A `medications` regimen table (mirrors `diet_trials`) + each dose as a `medication` event with a child `medication_administrations` row (mirrors `meals` + `intake_rating`). This is the only shape consistent with the decided "single event timeline / Option A" architecture (`nyx-technical-spec-v1_0.md:245`) **and** the only one that makes the 10-second test passable (see §5). |
| **D2** | Drug identity | **Photo-first capture seeding an organically-built `medication_items` library, food-model style.** First log of a new drug = a photo of the label (like `food-capture.tsx`); follow-up doses are one-tap picks from a library-like picker. Library is **per-account** scoped by `created_by_user_id` (like `food_items` — *re-scoped from global to per-account by B-354 / migration 033*; *not* pre-curated). **A centralized/curated drug catalog is an explicit future refactor, not v1.** (PM, verbatim: "eventually we could want to refactor to a centralized library… similar capture as food. Take a photo of the initial event and then select follow-up doses from a library-like experience.") |
| **D3** | Reminders | **Owner-initiated logging only in v1. Reminders deferred.** Blocked on the unresolved push-notification-provider open question (`nyx-technical-spec-v1_0.md:273`) and Principle 4 nudge discipline. See §10. |
| **D4** | Vet report | **"Current medications" section + a one-line adherence summary per drug** (e.g. "given consistently" / "some doses missed"). Computed from logged doses, not owner-asserted. Rendering rides Step 9; the **schema must capture what the report needs now** (it does — see §3, §8). |

**Field set (D-implied, recommend-and-proceed — open to Data Scientist / Dr. Chen trim at PR 1):**
- On the **library item** (`medication_items`): generic name, brand name, strength, form, default route, `is_prescription`, `is_critical`.
- On the **regimen** (`medications`): dose per administration, route, doses-per-day (for compliance %), schedule notes, indication, prescriber, start date, target duration, status.
- On the **dose event** (`medication_administrations`): adherence rating, actual dose, notes.

---

## 3. The food-model mapping

"Food-style" (B-117) resolves into **three** existing patterns, and medication maps cleanly onto all three. This is the spine of the whole spec.

| Food pattern | Schema | Medication analog (new) |
|---|---|---|
| `food_items` — per-account catalog (`created_by_user_id` = owner scope, RLS default-deny cross-account; re-scoped from global by B-354 / migration 033), photo-first AI extraction | `001_schema.sql:61`, `007_food_library_redesign.sql`, `033_per_account_food_med_library.sql` | **`medication_items`** — the drug-product library (per-account, same B-354 re-scope, migration 033) |
| `meals` — 1:1 child of an `event` (unique `event_id`) + nullable `intake_rating` (offered-vs-consumed) | `001_schema.sql:131`, `011_meal_intake_rating.sql` | **`medication_administrations`** — the dose event child + nullable `adherence` |
| `diet_trials` — pet-scoped ongoing **regimen** with status + compliance % | `001_schema.sql:147` | **`medications`** — the prescription/regimen |

The same three layers also resolve the obvious design conflict before it happens:

> **Designer:** dose + route + frequency on every dose log is a wall of decisions at the moment of event — violates Principles 1 & 2.
> **Data Scientist:** but the vet report is clinically useless without structured dose/route/frequency.
> **Resolution (no PM call needed — it's the food model exactly):** the **regimen** carries the structured fields, entered *once* (like setting up a diet trial or adding a food). Thereafter, logging a dose is a **single tap** ("gave it"), which passes the 10-second test. Configure once → confirm-don't-enter forever after.

---

## 4. Proposed schema (PR 1 — finalize with Data Scientist + `rls-privacy-reviewer`)

> Presented as the proposed design; PR 1 is schema-only and isolated (no UI), Migration Safety Pre-flight **additive / non-destructive / no backfill**. `medication` is already in the `event_type` enum — no change there.

### 4.1 Enums

```sql
CREATE TYPE medication_route AS ENUM
  ('oral','topical','otic','ophthalmic','injectable','inhaled','rectal','other');

CREATE TYPE medication_form AS ENUM
  ('tablet','capsule','liquid','chewable','transdermal','injection','drops','ointment','powder','other');

CREATE TYPE medication_status AS ENUM ('active','completed','stopped');

-- The adherence scale on a dose event — the medication analog of intake_rating.
-- Deliberately distinguishes pet-refused (a possible DISEASE signal, §6) from
-- owner-missed (an adherence gap). Final vocabulary is a Dr. Chen call at build (§13).
CREATE TYPE dose_adherence AS ENUM ('given','partial','missed','refused');
```

### 4.2 `medication_items` — the library (mirrors `food_items`)

```sql
CREATE TABLE medication_items (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  generic_name             TEXT NOT NULL,                 -- "prednisolone"
  brand_name               TEXT,                          -- "Apoquel"
  strength                 TEXT,                          -- "5 mg", "16 mg/mL" (free text v1)
  form                     medication_form,
  default_route            medication_route,
  is_prescription          BOOLEAN NOT NULL DEFAULT TRUE,
  is_critical              BOOLEAN NOT NULL DEFAULT FALSE, -- insulin/anti-seizure/cardiac → missed-dose escalation (§6)
  photo_paths              TEXT[] NOT NULL DEFAULT '{}',   -- nyx-medication-photos; [0]=label/front
  ai_extraction_status     TEXT NOT NULL DEFAULT 'pending', -- pending|completed|failed|manual
  ai_extraction_confidence JSONB,
  ai_extraction_error      TEXT,
  notes                    TEXT,
  created_by_user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Per-account scoped (no `pet_id`; owned via `created_by_user_id` — re-scoped from global by B-354 / migration 033). RLS: read/insert/update all gated on `created_by_user_id = auth.uid()` (default-deny cross-account) — identical to `food_items` (`001_schema.sql:245-252`, `033_per_account_food_med_library.sql`).

### 4.3 `medications` — the regimen (mirrors `diet_trials`)

```sql
CREATE TABLE medications (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pet_id               UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  medication_item_id   UUID REFERENCES medication_items(id) ON DELETE SET NULL,
  drug_name            TEXT NOT NULL,                 -- denormalized display fallback (clinical robustness > strict normalization; see note)
  dose_amount          TEXT,                          -- "5 mg", "1 tablet", "0.5 mL"
  route                medication_route,
  doses_per_day        NUMERIC(4,2),                  -- expected/day for compliance %; NULL = PRN/as-needed
  schedule_notes       TEXT,                          -- "8am & 8pm", "with food"
  indication           TEXT,                          -- vet-report context
  prescribed_by        TEXT,
  started_at           DATE NOT NULL,
  target_duration_days INTEGER,                       -- NULL = ongoing/indefinite
  status               medication_status NOT NULL DEFAULT 'active',
  ended_at             DATE,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

> **Note on `drug_name` denormalization:** `diet_trials` relies on the `food_items` join with no name fallback (a known minor gap). For meds, losing the drug name when an item is deleted is clinically worse, so we keep a denormalized `drug_name` as a display/report fallback. Data Scientist to confirm at PR 1.

### 4.4 `medication_administrations` — the dose event child (mirrors `meals`)

```sql
CREATE TABLE medication_administrations (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id            UUID NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,
  pet_id              UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  medication_id       UUID REFERENCES medications(id) ON DELETE SET NULL,       -- the regimen (NULL = ad-hoc one-off dose)
  medication_item_id  UUID REFERENCES medication_items(id) ON DELETE SET NULL,  -- the drug product
  adherence           dose_adherence,                                           -- nullable; capture UI defaults to 'given'
  dose_amount         TEXT,                                                     -- actual administered (defaults from regimen)
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

The dose itself is an `events` row (`event_type='medication'`, `occurred_at` = administration time, soft-deletable) + this 1:1 child via **unique `event_id`** — exactly the meal pattern. `adherence` is nullable like `intake_rating` (NULL renders clean — no placeholder).

### 4.5 RLS + indexes
- `medications` and `medication_administrations`: pet-scoped `_owner` policy (`pet_id IN (SELECT id FROM pets WHERE user_id = auth.uid())`) — identical to `meals`/`diet_trials`.
- `medication_items`: the three `food_items`-style policies (read-authenticated, insert/update by creator).
- Indexes mirroring `meals`/`diet_trials`: `(pet_id, status) WHERE status='active'` on `medications`; `UNIQUE(event_id)` + `(pet_id, medication_id)` on `medication_administrations`; `(generic_name, brand_name)` on `medication_items`.

### 4.6 Local SQLite mirror (PR 2, client)
Mirror in `lib/db.ts` with the established discipline (ISO/UTC `updated_at`, `synced` flag, soft-delete, pet-id denormalization): `medication_items_cache`, `medications`, `medication_administrations`. Wire push/pull + watermarks into `lib/sync.ts` (FK order: items → events → regimens → administrations). The `supabase-sync` skill governs the upsert-marks-synced / 0-byte-blob / SQL-bucket traps.

---

## 5. Capture & logging UX

### 5.1 Log a dose — the one-tap path (the 10-second test)
- FAB → **Medication** (new `EVENT_TYPES.medication`, `Pill` Lucide icon, `hasFood:false`) → a **medication picker** (mirrors `FoodPicker`): Recent meds (last 14d) on top, then the library.
- Tap a med → dose logged with `adherence='given'`, `occurred_at=now`, dose defaulted from the active regimen. **One tap, done** — the warmed completion card offers the adherence chips (given / partial / missed / refused) as a confirm-over-entry follow-up, exactly like the meal intake moment.
- Pre-selected pet, auto-stamped time, confirmed-not-entered drug → Principle 1 satisfied.

### 5.2 Add a new medication — photo-first capture (D2)
- "Snap a new medication" → `app/medication-capture.tsx` (mirrors `food-capture.tsx`): photo of the label → upload to `nyx-medication-photos` → `extract-medication-from-photo` Edge Function (Sonnet 4.6 vision) returns generic/brand/strength/form/route → **confirm screen**.
- **Clinical-safety override on the confirm screen (see §6):** strength/dose fields from AI extraction are **never silently trusted** — the confirm screen requires explicit confirmation of strength before save, and the label photo is retained as the source-of-truth attachment. A manual-entry fallback ("type it instead") is always present (offline, blurry label, compounded drug).
- On confirm → a `medication_items` row is created (organically building the library) → optionally seed a regimen → log the first dose.

### 5.3 Detail / edit
- `app/medication/[id].tsx` (mirrors `app/food/[id].tsx`): edit drug fields, reclassify form/route, toggle `is_critical`, view/replace the label photo.
- Event detail (`app/event/[id].tsx`) shows the drug + adherence chip; adherence is editable retroactively (optimistic update → `updateAdherence` → sync), mirroring the meal intake-edit path.

### 5.4 Regimen + pet profile
- Pet profile gains a **"Current medications"** card listing active regimens (drug, dose, route, frequency), mirroring the diet-trial card and `AddConditionModal`. Adherence/compliance % is computed like diet-trial compliance (doses logged ÷ expected from `doses_per_day` × elapsed days).

---

## 6. Clinical safety invariants (non-negotiable — `clinical-guardrails` skill applies)

Medication adherence is a new surface that **inherits both** of Nyx's safety invariants, plus a dose-extraction one:

1. **n=1 never reassures.** "No missed doses this week → Mochi is doing great" is **forbidden** — absence of a logged dose ≠ wellness (the owner may simply not have logged). A single dose-given event is a fact, never an all-clear. Reassurance, if ever, comes only from a careful cross-incident, multi-sample read.
2. **Refusal is not stubbornness (the intake-is-not-preference analog).** A `refused`/`partial` dose routes toward a *health* flag — a pet too nauseated or painful to take a pill is a disease signal — never softened to "fussy." This is exactly why the enum splits `refused` (pet rejected) from `missed` (owner skipped).
3. **Missed dose of a critical drug escalates.** `medication_items.is_critical` (insulin, anti-seizure, cardiac) gates a calm-but-clear flag on a missed/refused dose. Critical-drug classification is curated/derived, never owner-judged (see §13).
4. **A double-dose is a flag, not normalized.** Two `given` doses inside a regimen's interval surfaces a gentle check, never silence.
5. **Never silently trust an AI-extracted dose.** Misreading "0.5 mg" as "5 mg" off a label is a dosing hazard with no food analog. The §5.2 confirm screen requires explicit strength confirmation; the label photo is retained.
6. **No causal/diagnostic claims.** The app never says "the medication is why symptoms improved." It may state observations ("vomiting has been steady since the antibiotic started on June 1") — fact, not attribution.

Copy follows `nyx-voice` (first-person pet, no exclamation marks, no DAU-nudge tone): ✅ "Mochi got prednisolone every day, June 1–7." ❌ "Great job keeping Mochi on her meds!"

---

## 7. Vet report (D4 — PR 10, gated on Step 9)

A new **"Current medications"** section (Principle 6, clinical-grade, no decoration):
- Per active regimen: drug, strength, dose, route, frequency, indication, start date.
- A **one-line adherence summary** per drug, computed from logged doses over the report window: e.g. "Given consistently (28/28 logged doses)" / "Some doses missed (24/28; 3 missed, 1 refused June 8–10)."
- Adherence is **computed, never owner-asserted**, and never reassuring on absence (a regimen with zero logged doses reads "adherence not tracked," not "compliant").

Rendering rides the Step 9 PDF build (blocked on the PDF-library open question). The schema in §4 already captures everything this section needs. Reviewed by Dr. Chen + the `vet-report-cold-read` subagent on the rendered artifact.

---

## 8. Signal engine — medication as confounder (PR 9, gated, adversarial)

Medications enter the deterministic detection engine (`supabase/functions/generate-signal/detection.ts`) as **context/confounders, not correlates**:
- A new `medicationWindows` input (active regimens + dose events) joins `symptoms` / `meals` / `feedingArrangements` in `DetectionInput`.
- When a relevant drug is active in a symptom window, a food→symptom correlation is **caveated or suppressed**, preventing the false "chicken → vomit" attribution when an antibiotic is the real cause.
- Correlation keys on the stable **`medication_item_id`**, which *sidesteps* the B-052 free-text canonicalization problem entirely — the library model (D2) is what makes this clean.
- **`adversarial-reviewer` is mandatory** (clinically/statistically load-bearing; DoD). The reviewer must state the counterexample tried (e.g. "antibiotic + chicken both active → engine correctly declines to blame chicken, doesn't falsely reassure").

This is the deepest clinical value of B-117 and the most review-heavy slice. It depends on dose data flowing (PRs 1–8) and on the `is_critical` / canonicalization groundwork.

---

## 9. Cross-cutting touch-points (audit — grounds the build map)

From the food-template blueprint (the food model is the 1:1 reference):

| Layer | Food reference | Medication file (new/changed) |
|---|---|---|
| Quick-log entry | `app/log.tsx` (`?type=` route bypass, `handlePickFood`) | `app/log.tsx` (+ `?type=medication`) |
| Picker | `components/log/FoodPicker.tsx`, `FoodTile.tsx` | `components/log/MedicationPicker.tsx` |
| Photo capture | `app/food-capture.tsx` | `app/medication-capture.tsx` |
| AI extraction | `extract-food-from-photo` Edge Function | `extract-medication-from-photo` |
| Detail/edit | `app/food/[id].tsx`, `app/edit-event.tsx` | `app/medication/[id].tsx`, `app/edit-event.tsx` |
| Adherence chip | `components/log/IntakeChipRow.tsx` | `components/log/AdherenceChipRow.tsx` (relabel + recolor) |
| Local mirror | `lib/db.ts` (events/meals/food_items_cache) | `lib/db.ts` (+ 3 tables) |
| Sync | `lib/sync.ts` (`syncPendingMeals`, hydration, watermarks) | `lib/sync.ts` (+ 3 tables) |
| Storage | `lib/storage.ts` (`getSignedUrls`), `nyx-food-photos` | `lib/storage.ts`, `nyx-medication-photos` |
| Store | `store/eventStore.ts` (`prependEvent`, `patchInToday`) | reuse `eventStore` + a `medicationStore` |
| Regimen UI | diet-trial card + `AddConditionModal` (pet profile) | "Current medications" card |
| Constants | `constants/eventTypes.ts` | `+ medication` entry |
| Detection | `generate-signal/detection.ts` | `+ medicationWindows` confounder pass |
| Vet report | Step 9 (pending) | `+ "Current medications"` section |

---

## 10. Out of scope for v1 (deferred, with reasons)

- **Reminders / scheduled dose notifications (D3).** Blocked on the push-notification-provider open question + Principle 4 nudge discipline. No reminder infra exists today. When it ships, a missed-dose nudge must be calm and low-urgency ("Haven't logged Mochi's morning dose yet — did she take it?"), never an alarm. → keep on the backlog as a B-117 follow-up.
- **Curated/centralized drug catalog + normalization.** D2 is an organically-built library; the centralized refactor is explicitly future. Drug-name canonicalization (for cross-owner/cross-item matching) lands with the Signal pass (§8) if needed, reusing the B-052 approach.
- **Owner-set `is_critical`.** Critical classification is clinical, not owner-judgment — derived from a curated known-critical-drug match, deferred to the escalation slice (§13).
- **Barcode/NDC scan, refill tracking, drug-interaction checks, dose calculators.** Out of MVP scope; a dose calculator would be a clinical-liability surface requiring real veterinary review.

---

## 11. Open sub-decisions (build-time; not PM-blocking now)

| # | Question | Owner | When |
|---|---|---|---|
| S1 | Final `dose_adherence` vocabulary — is `given/partial/missed/refused` right, or add `vomited-up-after-dosing` (both an adherence event and a symptom)? | Dr. Chen + Data Scientist | PR 1 (enum) / PR 3 (chip) |
| S2 | `is_critical` source — curated drug list match? confidence? which drug classes? | Dr. Chen | PR 9 (escalation) |
| S3 | AI dose-extraction confirm UX — how forcefully must the owner confirm strength before save? | Designer + Dr. Chen + `clinical-guardrails` | PR 5 |
| S4 | Library scope display — the `medication_items` catalog is per-account (D2 as re-scoped by B-354 / migration 033), but the picker should show "for which pet?" in multi-pet households. | Designer + Sam | PR 6 |
| S5 | Centralized-library refactor trigger — what conditions promote D2's organic library to a curated catalog? | PM | post-v1 |

---

## 12. PR-by-PR build plan

Schema-isolated, mostly additive, food model as the 1:1 reference. Grouped into four phases; dependencies and gates marked.

**Phase A — Foundation (logging works, text-first)**
- **PR 1 — Schema migration** (`020_medication_logging.sql`, server-only, isolated). §4 enums + 3 tables + RLS + indexes. Migration Safety Pre-flight: additive / non-destructive / no backfill. Data Scientist + `rls-privacy-reviewer`. Adversarial N/A (DDL). PM action: apply to live DB.
- **PR 2 — Local mirror + sync plumbing** (client, no UI). `lib/db.ts` 3 local tables + `lib/sync.ts` push/pull/watermarks + a medication store. `supabase-sync` skill. **Tests required** (sync path — DoD).
- **PR 3 — Quick-log medication, text-first.** `EVENT_TYPES.medication` (`Pill`) + FAB path + `MedicationPicker` + one-tap adherence (default `given`) + `AdherenceChipRow`. The 10-second log against a text-entered library. Designer / Jordan / QA. No schema.

**Phase B — Photo-first capture + library (D2)**
- **PR 4 — Storage bucket + RLS.** `nyx-medication-photos` (**PM creates via dashboard** — SQL-bucket landmine) + RLS migration + `lib/storage.ts` wiring. `rls-privacy-reviewer` (new health-photo bucket).
- **PR 5 — Photo capture + AI extraction.** `app/medication-capture.tsx` + `extract-medication-from-photo` (Sonnet 4.6) + the **dose-confirm-required** screen (§6.5). `clinical-guardrails` + Dr. Chen + **adversarial-reviewer** (AI read of load-bearing data). PM action: deploy Edge Function.
- **PR 6 — Picker library experience + detail/edit screen.** `app/medication/[id].tsx`; Recent + library sections; edit/reclassify/mark-critical. Designer.

**Phase C — Regimen + surfaces**
- **PR 7 — Regimen + "Current medications" card.** Regimen setup (mirror `AddConditionModal`/diet-trial card) + pet-profile card + compliance %. Designer / Dr. Chen.
- **PR 8 — Timeline + retroactive adherence edit.** Medication events in History; event-detail drug + adherence; edit adherence retroactively (mirror meal intake edit). Designer / QA.

**Phase D — Clinical consumers (gated)**
- **PR 9 — Signal confounder pass** (`detection.ts`). §8. Data Scientist + Dr. Chen + **adversarial-reviewer mandatory**. Gated on Phase A–C data flowing.
- **PR 10 — Vet-report "Current medications" + adherence summary.** §7. Rides **Step 9** (PDF-library open question). Dr. Chen + `vet-report-cold-read`.

**Parallelism:** PR 1 → 2 → 3 are a strict chain. PR 4's bucket is a PM dashboard action that can be prepped any time. PRs 9 and 10 are gated (9 on data + adversarial review; 10 on Step 9). Phases A–C are the shippable v1; Phase D is the clinical payoff that depends on it.

---

## 13. Acceptance criteria (QA — per PR, before merge)

- **PR 1:** All 3 tables + 4 enums exist on the live DB; RLS verified (a second account cannot read another pet's `medications`/`medication_administrations`); `medication_items` readable by any authenticated user, writable only by creator. Zero existing rows changed.
- **PR 2:** A medication event logged offline reaches Supabase on reconnect (`synced=1` only after upsert); hydration pulls another device's doses; soft-deleted dose disappears cross-device. Unit tests for the sync logic pass.
- **PR 3:** FAB → Medication → pick → dose logged in **under 10 seconds, one-handed** (the 3am test). Adherence defaults to `given`; the chip confirm works; NULL adherence renders clean. Pet pre-selected, time auto-stamped.
- **PR 5:** Label photo → AI extraction → confirm screen **blocks save until strength is confirmed**; manual fallback works offline; the label photo persists as an attachment. `adversarial-reviewer` PASS (extraction never silently mis-doses).
- **PR 7:** "Current medications" card shows active regimens with a correct compliance %; refused/missed routes to a flag, never "fussy."
- **PR 9:** With an active antibiotic + chicken meals both in a vomit window, the engine declines to surface "chicken → vomit" (or caveats it); it never falsely reassures. `adversarial-reviewer` states the counterexample tried.
- **PR 10:** A vet reading the rendered report cold sees what the pet is on and whether it's being given, in the 60-second scan. `vet-report-cold-read` CLINIC-READY.

---

## 14. Evidence / references

- B-117 backlog row (`docs/backlog.md`) — the gap statement and the four routed decisions.
- Food model: `001_schema.sql` (`food_items`/`meals`/`diet_trials`), `007_food_library_redesign.sql`, `011_meal_intake_rating.sql`, `app/log.tsx`, `app/food-capture.tsx`, `components/log/FoodPicker.tsx`, `components/log/IntakeChipRow.tsx`, `lib/sync.ts`, `lib/db.ts`.
- Safety: `.claude/skills/clinical-guardrails/`, `docs/personas.md` (Data Scientist intake/n=1 anti-patterns; Dr. Chen).
- Vet report: `nyx-technical-spec-v1_0.md:211` (Step 7/9 spec). Signal: `generate-signal/detection.ts`, `docs/nyx-ai-signal-requirements.md`.
- Deferred deps: push-notification provider (`nyx-technical-spec-v1_0.md:273`), PDF library (CLAUDE.md Open Questions / Step 9), B-052 canonicalization.
