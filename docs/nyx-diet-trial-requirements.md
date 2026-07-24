# Diet Trial Lifecycle — Requirements

**Version:** 1.0 (build-ready pending D3 ratification) | **Last Updated:** 2026-07-24
**Backlog:** B-417 | **Status:** requirements + PR plan complete; D3 flagged recommend-and-proceed

---

## 1. Problem

Nyx's stated wedge is *"reactive tracking for owners sent home with a diet trial or symptom monitoring directive"* (CLAUDE.md). Half of that wedge is unreachable: **an owner cannot tell Nyx they are on a diet trial.**

`diet_trials` has existed since migration 001. Nothing in the app writes to it. The only writer is the B-271 App-Review demo seed.

### 1.1 What already reads a row that cannot exist

| Surface | Reference |
|---|---|
| Profile "Diet trial" card (day N of M + "% compliance") | `app/(tabs)/profile.tsx:754` |
| Day-math helper (pure, tested) | `lib/analytics.ts:838` `getDietTrialProgress` |
| Widget header `Day 12 of 28` | `lib/widgetResolution.ts:350`, `lib/widgetSnapshot.ts:291` |
| Vet report — trial section, compliance tile, scope cascade rung 2 | `supabase/functions/generate-report/report.ts:439`, `:2854` |
| Signal engine — trial-pet suppressions (staple-washout, diet-churn) | `supabase/functions/generate-signal/detection.ts` |
| Ask | `supabase/functions/ask/tools.ts` |

Six surfaces are built on a substrate no user can populate.

### 1.2 The consequence for Step 9

`docs/nyx-vet-report-requirements.md:21` names the report's **first** clinical question: *"Is this diet trial working?"* — compliance, symptom trend across the trial window, confounders.

The report's default scope cascade (`report.ts:439`) is: (1) since last vet visit → (2) **else the active diet-trial window** → (3) else 90-day fallback. Rung 2 has never fired for a real user. The spec says so at line 30: *"The live pet **Nyx** has **no diet trial and no vet visit**."*

Step 9 has been designed, built, cold-read, and shipped **without ever being exercised against its own primary use case.** This track is what makes that possible.

### 1.3 The live mislabel

`app/(tabs)/profile.tsx:192` pulls every `meal` event since `started_at`, counts distinct days, and divides by days elapsed:

```ts
const distinctDays = new Set((mealEvents ?? []).map((e) => new Date(e.occurred_at).toDateString())).size;
const compliance = Math.round((distinctDays / daysElapsed) * 100);
```

There is **no filter on the trial's `food_item_id`.** An owner feeding chicken every day through a novel-protein trial reads **100% compliance**.

The server computes the same numerator (`report.ts:2854` `countTrialDaysLogged`) but renders it honestly — `render.ts:1021` labels the tile *"Trial-diet days logged (≥1 meal) / not a clean-elimination count"*. **The vet report is not lying. The profile card is.**

> **Dr. Chen:** A vet handed "94% compliance" concludes the elimination was clean and rules out food-responsive disease. That is a false negative on a patient who has one. This number is worse than no number.

### 1.4 Why this is not "just" a missing form

From `docs/nyx-research-v1_0.md:72–119`:

- Elimination trials run **8–12 weeks** (skin) / **3–4 weeks** (GI)
- **>90% complete remission** in food-responsive disease — *only if the owner completes the trial*
- Owner adherence to 8–12 week diet trials collapses to **20–30%**
- Vets know the protocol works and know most owners won't finish it without support

**The gap between 90% efficacy and 25% completion is the product.** A trial that Nyx knows about is a trial Nyx can help finish.

---

## 2. Decisions

| | Decision | Ruling |
|---|---|---|
| **D1** | v1 scope | **RATIFIED (PM, 2026-07-24) — lifecycle + allowed-set adherence.** Start / track / complete, plus a trial allowed-food set and real off-diet exposure counting. Guided trial mode (wizard, reintroduction challenge) is out. |
| **D2** | What "compliance" means | **RATIFIED (PM, 2026-07-24) — split the metric, folded into this track** (not a standalone hotfix). Coverage (days logged) and adherence (off-diet exposures) are reported as two separate facts. The single blended "% compliance" is deleted. |
| **D3** | Allowed-food set vs. B-351 D6 | **RECOMMEND-AND-PROCEED — flagged for ratification.** B-351 D6 deferred an `excluded_proteins` *column* in favour of deriving contaminants from the trial food's own protein set. That is a different axis (proteins, derived) from an allowed-**food** set (foods, explicit). Both ship; **one detection path consults both** (§6.3). See §2.1 for why derivation alone is insufficient. |
| **D4** | Contamination detection | **Compose with B-351 D2's ratified deterministic contaminant flag** — soft at add, non-blocking at log (Principle 1). Do not build a second detector. |
| **D5** | Where trials are created | **Profile card**, mirroring `components/profile/AddMedicationModal.tsx` exactly. Consistent with `medications`, which was itself modeled on `diet_trials`. |
| **D6** | Trial end | **Milestone prompt** at day N → complete / extend / abandon, with an **owner-reported** outcome. Never an app verdict on whether the trial worked. |
| **D7** | Local SQLite mirror | **Yes.** `medications` — the table explicitly modeled on `diet_trials` (`nyx-medication-logging-requirements.md` §4.3) — has a local mirror (`lib/db.ts:85`); the original never got one. Closes B-408. |
| **D8** | Reintroduction / challenge phase | **Out of v1.** Additive `phase` column so the schema does not foreclose it. |
| **D9** | Trial-aware surfaces (B-357 rotation shelf, food picker) | **Fast-follows**, not v1. |

### 2.1 Why protein-derivation alone is insufficient (the D3 rationale)

B-351 D6's derive-from-the-trial-food approach covers the common novel-protein trial well. It structurally cannot cover three real cases:

1. **Hydrolyzed / prescription diets.** The therapeutic mechanism is not the protein identity. Feeding a *different* duck food is off-diet, but protein-derivation sees `duck == duck` and passes it.
2. **The permitted treat.** Vets routinely allow exactly one named treat through a trial. Derivation flags it as a contaminant at every single feeding — and an owner who is warned about a permitted food learns to dismiss all warnings, including the real ones. This is the alarm-fatigue failure that makes contaminant detection worthless.
3. **Foods with no protein data.** Owner-added, never extracted. `proteins` is empty; there is nothing to compare. **Weakened, not eliminated, by B-416** (merged #433, 2026-07-24): the re-derivation pass recovers full protein sets for the 51 of 59 live foods that already carry panel text in `ingredients_notes`. The residual is the ~8 with no panel text plus every future owner-added food — a permanent trickle, not a one-off backlog.

The allowed-food set is the explicit-inclusion complement to D6's derived exclusion. Neither subsumes the other. **Cases 1 and 2 are untouched by B-416** — no amount of protein-set completeness tells you a hydrolyzed trial forbids a different duck food, or that the vet permitted one named treat.

> **Product Owner:** flagged, not silently taken. If the PM reads D6 as binding on trial-scoped food modeling generally, PR 1 drops `diet_trial_foods` and v1 reports coverage only — adherence then waits for B-351 Phase B.

---

## 3. Schema (PR 1 — additive, own PR)

Migration **040**. Migration Safety Pre-flight: **destructive = `n`** (purely additive), **rollback** = `DROP TABLE diet_trial_foods; ALTER TABLE diet_trials DROP COLUMN …`, **backfill** = N/A (existing rows keep NULL; the single live trial is demo-seed data).

### 3.1 `diet_trials` — additive columns

```sql
CREATE TYPE diet_trial_phase   AS ENUM ('elimination', 'reintroduction');   -- D8: reintroduction unused in v1
CREATE TYPE diet_trial_outcome AS ENUM ('improved', 'no_change', 'worse', 'unsure');

ALTER TABLE diet_trials
  ADD COLUMN food_label  TEXT,                    -- denormalized display fallback (see note)
  ADD COLUMN indication  TEXT,                    -- 'skin' / 'GI' / free text; drives the duration default
  ADD COLUMN phase       diet_trial_phase NOT NULL DEFAULT 'elimination',
  ADD COLUMN outcome     diet_trial_outcome,      -- owner-reported at completion (D6); NULL while active
  ADD COLUMN outcome_notes TEXT;
```

> **`food_label` denormalization.** `nyx-medication-logging-requirements.md` §4.3 explicitly called out that `diet_trials` relies on the `food_items` join with **no name fallback** — "a known minor gap" — and chose to denormalize `drug_name` for meds precisely to avoid it. `food_item_id` is `ON DELETE SET NULL`, so archiving or deleting the trial food today silently blanks the trial's identity on the profile card *and the vet report*. This closes that gap on the original table. Composes with B-005 (tombstoned deletes).

`status` already carries the lifecycle states (`trial_status` ENUM: `active` / `completed` / `abandoned`) — no change needed.

### 3.2 `diet_trial_foods` — the allowed set (D3)

```sql
CREATE TYPE diet_trial_food_role AS ENUM ('primary_diet', 'permitted_treat', 'permitted_other');

CREATE TABLE diet_trial_foods (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  diet_trial_id  UUID NOT NULL REFERENCES diet_trials(id) ON DELETE CASCADE,
  food_item_id   UUID NOT NULL REFERENCES food_items(id) ON DELETE CASCADE,
  role           diet_trial_food_role NOT NULL DEFAULT 'primary_diet',
  food_label     TEXT,                            -- same fallback rationale as §3.1
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (diet_trial_id, food_item_id)
);

CREATE INDEX idx_diet_trial_foods_trial ON diet_trial_foods(diet_trial_id);

ALTER TABLE diet_trial_foods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "diet_trial_foods_owner" ON diet_trial_foods
  FOR ALL USING (
    diet_trial_id IN (
      SELECT dt.id FROM diet_trials dt
      JOIN pets p ON p.id = dt.pet_id
      WHERE p.user_id = auth.uid()
    )
  );
```

`ON DELETE CASCADE` on `food_item_id` (not `SET NULL`): a row whose food is gone carries no meaning in an allowed set, and `food_label` preserves the display record on the parent trial. Per-account catalog (B-354) means the food and the trial always share an owner — no cross-account reference is possible.

> **`rls-privacy-reviewer` is mandatory at PR 1** — new table, new policy, nested-subquery ownership path.

### 3.3 Local mirror (PR 2 — D7)

Mirror `diet_trials` + `diet_trial_foods` into SQLite alongside `medications`, following the established `synced` / watermark pattern in `lib/db.ts`. `supabase-sync` skill applies: pet-ownership scoping, last-write-wins, no unchecked-upsert-marks-synced.

Removes the network dependency in `lib/widgetSnapshot.ts:291` and the `resolveTrialContext` degradation noted at `lib/widgetResolution.ts:265`.

---

## 4. Capture & lifecycle UX

### 4.1 Start a trial (PR 3)

Entry point: profile screen, **"Start a diet trial"**, mirroring the medication regimen flow (`AddMedicationModal.tsx`).

Fields:
- **Trial food** — food picker (required). Writes `diet_trial_foods` `role='primary_diet'` **and** `diet_trials.food_item_id` for back-compat with the six existing readers.
- **Also allowed** — optional multi-select (permitted treat / other). Directly mirrors B-351 D8's ratified two-line "Main protein / Also contains" picker shape, which the PM rated "10/10, super clear."
- **What's it for** — `indication`: Skin / GI / Other. Sets the duration default.
- **Duration** — `target_duration_days`, prefilled from indication (**GI → 28 days**, **Skin → 56 days**), owner-editable. Defaults are clinical (§1.4), never silent — the field shows its own number.
- **Vet** — `vet_name`, optional.
- **Start date** — defaults today, back-datable (an owner sets Nyx up mid-trial).

One active trial per pet (the existing `idx_diet_trials_active` partial index assumes it). Starting a second offers to complete the first.

### 4.2 The trial card v2 (PR 4 — executes D2)

Replaces the current card. Three facts, never blended:

```
Diet trial · Day 12 of 28
Royal Canin Hydrolyzed Protein

Logged on 11 of 12 days
No off-diet foods logged            ← adherence, only with §7.2 framing
```

The single **"% compliance"** string is deleted. Progress math moves to `getDietTrialProgress` (`lib/analytics.ts:838`) — one implementation, already pure and tested, replacing the inline arithmetic at `profile.tsx:184` (closes F6).

### 4.3 Completion (PR 6 — D6)

At `dayCounter >= targetDays`, the card surfaces a **milestone**, not a nudge (it is state, not a push; Principle 4 untouched):

> **Day 28 of 28 — the trial window is done.**
> How did it go? → `Better` · `No change` · `Worse` · `Not sure`
> `Complete trial` · `Extend` · `Stopped early`

Writes `outcome` + `status`. **The owner reports the outcome. Nyx never scores the trial** (§7.1).

Extend re-prompts `target_duration_days`. "Stopped early" → `abandoned`, which is a legitimate clinical fact, never framed as failure (`nyx-voice`).

---

## 5. Adherence & exposure model (PR 5 — clinically load-bearing)

### 5.1 Two independent facts, never one number

| Metric | Definition | Answers |
|---|---|---|
| **Coverage** | distinct local days in-window with ≥1 logged meal ÷ days elapsed | *How completely was this tracked?* |
| **Off-diet exposures** | count of in-window meal/treat events whose food is **not** in the allowed set | *Was the elimination clean?* |

Existing `countTrialDaysLogged` (`report.ts:2854`) already computes coverage correctly and is already labeled honestly server-side. It is **kept as-is** and renamed at the call sites to stop implying adherence.

### 5.2 The denominator rule (non-negotiable)

**An exposure count is never rendered without its coverage denominator.** "0 off-diet foods" over 30% coverage is not a clean trial — it is an untracked one. Coverage below a floor suppresses the exposure claim entirely in favour of an honest coverage statement.

This is the local instance of `n=1 never reassures`: absence of a logged exposure is not evidence of absence.

### 5.3 One detection path (D3 + D4)

A single function resolves whether a logged feeding is off-diet, consulting **both** signals in order:

1. **Explicit allowed set** — `food_item_id ∈ diet_trial_foods` → permitted, stop. (Resolves the permitted-treat alarm-fatigue case.)
2. **B-351 derived protein contaminant** — the ratified Phase A PR 4 flag → off-diet.
3. **Neither** (food not in set, no protein data) → off-diet, flagged `low_confidence` and rendered as "not recognised as trial food", never as a contaminant assertion.

No second detector. B-351 PR 4's flag is the protein arm of this function, not a parallel system.

> **`adversarial-reviewer` is mandatory at PR 5.** This feeds the vet report and a vet's rule-in/rule-out decision on food-responsive disease.

---

## 6. Clinical safety invariants (`clinical-guardrails` applies)

1. **Nyx never scores the trial.** No "the trial is working" / "no improvement — try another protein." Causal attribution on a diet trial is the vet's diagnosis. The app reports coverage, exposures, and the symptom trend as separate facts; the owner reports the outcome.
2. **Absence of logged exposure never reassures** (§5.2). Every clean-trial statement carries its coverage denominator.
3. **A contaminant flag is disclosure, not blame.** Copy names the fact ("chicken — outside the trial diet"), never the owner's discipline. `nyx-voice`: no "you broke the trial."
4. **Non-blocking at the moment of the event** (Principle 1). The flag never gates or interrupts logging. B-351 D2's ratified soft-at-add / non-blocking-at-log shape governs.
5. **Refusal of the trial diet routes to the health lane, not preference.** A pet refusing a hydrolyzed diet is the intake-is-not-preference invariant verbatim — a refusal is a possible disease signal, never "picky about the new food." Existing `detectIntakeDecline` already owns this; the trial must not shadow it with a compliance framing.
6. **An abandoned trial is a clinical fact, not a failure state.** ~70–80% of trials don't complete (§1.4). Copy stays neutral and forward-looking (Principle 5).

---

## 7. Vet report (PR 7)

Step 9's first clinical question finally has a substrate. Changes are **content, not layout**:

- Trial section renders the allowed set (primary diet + permitted foods) with `food_label` provenance
- Coverage and off-diet exposures as separate rendered facts (§5.1) — the §5 "no compliance on a contaminated or absent trial" rule (`nyx-vet-report-requirements.md:78`) already anticipates this
- Off-diet exposures itemized with dates, feeding the existing Appendix B confounder section (`:88`)
- Owner-reported outcome rendered as **owner-reported**, attributed, never as a finding
- Scope cascade rung 2 (`report.ts:439`) becomes reachable — a report can now legitimately scope to the trial window

> **`vet-report-cold-read` is mandatory** on the rendered artifact. This is the first time the report's primary question renders with real data; the cold read must confirm a vet can distinguish coverage from adherence at a glance.

---

## 8. Cross-cutting touch-points

| Area | Effect |
|---|---|
| `lib/analytics.ts:838` | Becomes the single day-math path (closes F6) |
| `lib/widgetSnapshot.ts:264` | Local mirror removes the best-effort network fetch (closes **B-408**) |
| `detection.ts` trial suppressions | Staple-washout / diet-churn suppressions become reachable for real pets — **verify they suppress correctly rather than silently** |
| B-094 | Trial progress dashboard card — unblocked, still deferred |
| B-357 / B-356 | Rotation shelf trial-awareness + single-food label — fast-follows (D9) |
| B-217 | WSAVA "Previous diet" — adjacent capture, still open |
| B-234 | `feeding_arrangements` diet-start date — **unrelated table**, unchanged |
| Ask (`ask/tools.ts`) | Trial context becomes real; rundown gains trial state |

---

## 9. Out of scope for v1

| Item | Why |
|---|---|
| Reintroduction / challenge phase | The diagnostic confirmation step. Real clinical value, own track. `phase` column reserves it (D8). |
| Trial reminders / push | Blocked on the push-provider open question + the Principle-4 carve-out debate (B-288). Same posture as medication reminders (B-117 D3). |
| Multi-pet shared-bowl trial contamination | Depends on B-292 household + B-040 free-fed attribution |
| Trial templates ("standard 8-week novel protein") | Wants real usage data first |
| Vet-prescribed trials via share link | Depends on a vet-side surface that doesn't exist |

---

## 10. Open sub-decisions (build-time, not PM-blocking)

- **S1** — Coverage floor below which §5.2 suppresses the exposure claim. Proposal: **< 50%**. Needs Dr. Chen.
- **S2** — Do treats count in the coverage denominator, or meals only? Composes with B-011 (treats vs meals) and the §11 #1 finished-rate precedent.
- **S3** — Back-dated trial start: cap how far back? Proposal: no cap; coverage honesty handles it.
- **S4** — Does completing a trial archive its foods (B-005 / B-354 interaction)?
- **S5** — Widget header behaviour at day > target before the owner completes.

---

## 11. PR-by-PR build plan

| PR | Scope | Gates |
|---|---|---|
| **1** | Migration 040 — §3.1 columns + `diet_trial_foods` + RLS. Schema only. | **`rls-privacy-reviewer` mandatory.** Migration Safety Pre-flight. Own PR (schema isolation). |
| **2** | Local SQLite mirror + sync for both tables (D7) | `supabase-sync` skill. Closes B-408. |
| **3** | Start-a-trial UX — `AddDietTrialModal` + allowed-set picker (D5) | Designer (P1, P2), `nyx-voice`, Jordan |
| **4** | Trial card v2 — coverage/exposure split; delete "% compliance"; unify day math (D2) | Designer (P6), Dr. Chen, `nyx-voice` |
| **5** | Off-diet exposure detection — the one path (§5.3) | **`adversarial-reviewer` mandatory.** Data Scientist, Dr. Chen |
| **6** | Completion milestone + owner-reported outcome (D6) | Designer (P4, P5), `nyx-voice`, `clinical-guardrails` |
| **7** | Vet report render (§7) | **`vet-report-cold-read` mandatory.** Dr. Chen |

**Parallelism:** PRs 1→2 are sequential. PR 3 and PR 4 are independent once PR 1 lands (disjoint files: modal vs. card). PR 5 gates PR 7. PRs 3/4 can run concurrently with PR 5's detection work in separate sessions — expect `STATUS.md` as the only shared-file collision at wrap.

**Deploy-gating (the B-182 lesson):** PR 7 changes `generate-report` output. Do **not** deploy the Edge Function until the PR 4 client renderer has landed, or a report will render fields the app cannot display.

---

## 12. Acceptance criteria (QA — per PR)

**PR 1** — migration applies cleanly; `get_advisors` clean (no missing-RLS, no unindexed FK); a second account cannot read another's `diet_trial_foods` row (`rls-privacy-reviewer` names the attack tried); rollback verified on a branch.

**PR 2** — a trial created offline survives reconnect + flush; the widget header renders `Day N of M` with the device in airplane mode; no unchecked-upsert-marks-synced.

**PR 3** — a trial can be created in under 30 seconds; back-dated start works; the allowed-set writes both `diet_trial_foods` and `diet_trials.food_item_id`; a second active trial is refused with an offer to complete the first.

**PR 4** — the string "compliance" appears nowhere on the card; coverage and exposures render as separate facts; day math comes from `getDietTrialProgress`; card renders correctly at day 1, mid-trial, day = target, and day > target.

**PR 5** — a permitted treat never flags (the §2.1 case 2 alarm-fatigue test); a different-brand same-protein food **does** flag on a hydrolyzed trial (case 1); a food with no protein data flags `low_confidence` with hedged copy (case 3); an exposure count never renders without its coverage denominator (§5.2); `adversarial-reviewer` states the counterexample tried and why it held.

**PR 6** — outcome is owner-reported and rendered as such; abandoning carries no failure framing; extend re-prompts duration.

**PR 7** — `vet-report-cold-read` returns CLINIC-READY; a vet can distinguish coverage from adherence in the 60-second scan; scope cascade rung 2 verified reachable with a real trial.

---

## 13. Evidence / references

- `docs/nyx-research-v1_0.md:72–119` — trial durations, >90% remission, 20–30% adherence
- `docs/nyx-vet-report-requirements.md:21, 28, 30, 78, 88, 139` — the report's first question, substrate honesty, scope cascade
- `docs/nyx-medication-logging-requirements.md` §4.3, §5.4 — the mirror-of-`diet_trials` precedent this track inverts
- `docs/nyx-multi-protein-requirements.md` D2, D6, D7, D8 — contaminant flag, `excluded_proteins` deferral, disclosure tiers, picker shape
- `docs/research/2026-06-vet-council-nyx-deep-dive.md` — nutritionist lens on uninterpretable diets
- `docs/nyx-multi-protein-requirements.md` §10 D3a — the Class-A / Class-B canonicalization merge rule (merged #433); the trial's detection path inherits it via the protein arm
- Backlog: **B-417** (this), B-416 (protein re-derivation — strengthens the derived arm of §5.3), B-408, B-357, B-356, B-094, B-217, B-011, B-005
