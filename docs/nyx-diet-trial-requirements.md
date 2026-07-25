# Diet Trial Lifecycle — Requirements

**Version:** 1.0 — **BUILD-READY. Every gate, conflict and design decision is ruled; mocks are design-locked.** | **Last Updated:** 2026-07-25
**Backlog:** B-417 | **Status:** problem, evidence, schema, UX, detection model, vet-report render, PR plan and acceptance criteria — all ratified.

> **Readiness in one line:** **all seven PRs are specified and buildable.** PR 5 sequences after B-351 completes (PM is finishing it now). Two clinical values carry **provisional decisions pending Dr. Chen's ratification** and are named at the PR that consumes them — neither blocks a build.

> **What changed at v1.0 (2026-07-25).** Four mock rounds against `docs/nyx-diet-trial-mockups.html` (design-locked; also published as an artifact), a `pm-feature-review` pass as Jordan, and PM rulings on everything the rounds surfaced. Substantive changes, not confirmations: the trial diet takes **multiple foods** (§4.1); a running trial appears on **Home**, not only the Pet tab (§4.2); the completion sheet **leads with the symptom data** before asking for the owner's read (§4.3); **secondary proteins** are in the detection path by construction (§5.3); the contamination standing fact **extends to permitted extras** and a permitted feeding **still records its antigen** (D-A/D-B, §5.5); §7 is **two-element** (C4); **A-3 is cut** and there is **no `paused` state** (A-2); and both **LOCKED** strings were wrong and are rewritten (§5.2).
>
> **What changed at v0.97 (2026-07-25).** All four gates (G1/G2/G3/§0.2) and all six conflicts (C1–C6) were **ruled by the PM** — record in §0 of `docs/diet-trial-requirements-review-2026-07.md`. Two rulings changed substance: **C3** (detect the oral-route lane in v1) and **C5** (severity comes from logged events, so no severity columns; §7 discloses logging density instead).
>
> **What changed at v0.95 (2026-07-25).** A full requirements review against `docs/research/2026-07-diet-trial-competitive-landscape.md` and a 5-lane codebase audit (32 grounded findings). Headline corrections: the app may **never** render "No off-diet foods logged" at any coverage (§5.2); a **seventh** reader was missing from §1.1; and `§7.2` did not exist and is now written.

---

## 0. Readiness

### 0.1 Per-PR readiness

| PR | Ready? | Sequencing |
|---|---|---|
| **1** — migration 040 + `diet_trial_foods` | **YES** | Start here. Production holds **zero** `diet_trials` rows, so every schema choice is still free. **No `diet_class` column** (C4 landed two-element) and **no `paused` enum value** (A-2). |
| **2** — local SQLite mirror | **YES**, on PR 1 | §3.4 carries the ~10-point registration checklist. Closes B-408. |
| **3** — start-a-trial modal | **YES** | Mock design-locked. Consumes the **provisional duration table** (§4.3) — flag for Dr. Chen at this PR, do not block on it. |
| **4** — trial card v2 + Home | **YES**, on PR 1 | Mock design-locked. Scope includes `useTrend`/`TrendZone` (§1.1) **and the new Home strip** (§4.2). B-421 must land first. |
| **5** — `lib/dietTrial.ts` | **YES**, after **B-351 completes** | The one shared predicate. Carries D-A/D-B and the §5.1 metric definition, which the coverage floor is set from. `adversarial-reviewer` **mandatory**. |
| **6** — completion milestone | **YES**, after PR 7 | **Must not ship before PR 7** (§7) — completing a trial currently deletes it from the report. |
| **7** — vet report render | **YES**, after PR 5 | Two-element trial block (C4). `vet-report-cold-read` **mandatory**. |

### 0.2 The B-351 relationship — settled

**PM ruling: all of B-351 ships**, so the protein arm has no external dependency. Two consequences:

- **PR 5 sequences after B-351 completes.** Not blocked by it in principle — rungs 1, 3 and 4 are a correct closed-world detector on their own (C1) — but there is no reason to ship a deliberately half-lit predicate when the other half is days away.
- **The collision is dissolved, not sequenced** (§0.2 option (c), ruled 2026-07-25): slice 4's diet-trial-card note is **cut** from B-351 and rebuilt in PR 4; **PR 5 owns the predicate** as a shared pure module and B-351's Tier-2 flag becomes a *consumer* of it.

> **Backlog truth (Product Owner):** B-351's row claims slices 3/4/5 are *"parallelizable, disjoint files."* That is false as of this spec and must be corrected.

### 0.3 Clinical gates — all ruled

- **G1 — D3 ✅ RATIFIED.** Both axes ship, one detection path (§2.1, §5.3).
- **G2 — ✅ RULED as a rule, not a threshold.** The negative claim is **deleted from the product at every coverage, on every surface** (§5.2). A floor still exists but gates §7.2's interpretability statement only.
- **G3 — ✅ RULED: keyed on species × indication, semantics fixed.** Skin 56d **is** the >90% diagnostic-sensitivity band, not "the low end". The **four-cell table is provisional pending Dr. Chen** — §4.3.

### 0.4 The two provisional decisions

Both are **clinical values, not product decisions**. Each is named at the PR that consumes it, ships with the provisional value, and is flagged for Dr. Chen's ratification. Per CLAUDE.md's stale-question rule, a provisional decision that lets work proceed beats a stall.

| # | Provisional decision | Consumed by | What ratification could change |
|---|---|---|---|
| **P-1** | **Duration defaults, all four cells:** dog·skin **56d**, dog·gut **28d**, cat·skin **56d**, cat·gut **42d**. Only cat·gut is new — raised from the dog's 28 because cats reach only ~50% remission at 4 weeks against dogs >90% at 5. | PR 3 (the lookup table) | A number. Lookup constant, no schema, no migration. |
| **P-2** | **No `paused` state.** A trial is active or it is not; a vet-directed hold records as *stopped early → the vet said to stop*, then a new trial. | PR 1 (by omission) | Adding an enum value later is a migration. The cost of the provisional: one clinical episode becomes two rows, neither of which is a continuous window. |

### 0.5 Design lock

`docs/nyx-diet-trial-mockups.html` — **design-locked at round 4.** Covers all three UI surfaces, all eleven card states, the three reason sheets, both list screens, the Home strip, and §7's trial block. Reviewed by `pm-feature-review` as Jordan (round 1b), which caught three defects including a clean-trial statement rendering over a pet that refused the diet.

The **`nyx-voice` copy pack** is the one remaining artifact, and it now has a hard input: **every string in this doc says "Culprit"** — the B-274 rename is ruled and applies to all LOCKED copy.

---

## 1. Problem

Nyx's stated wedge is *"reactive tracking for owners sent home with a diet trial or symptom monitoring directive"* (CLAUDE.md). Half of that wedge is unreachable: **an owner cannot tell Nyx they are on a diet trial.**

`diet_trials` has existed since migration 001. Nothing in the app writes to it. **Production holds zero rows** — not even the B-271 demo seed.

### 1.1 What already reads a row that cannot exist

| Surface | Reference |
|---|---|
| Profile "Diet trial" card (day N of M + "% compliance" + a compliance-bound progress bar) | `app/(tabs)/profile.tsx:205`, `:763-775` |
| **Home Trend zone — a second, unlisted "% compliance"** | `hooks/useTrend.ts:116-129`, `components/home/TrendZone.tsx:35, :184-190` |
| Day-math helper (pure, tested) | `lib/analytics.ts:838` `getDietTrialProgress` |
| Widget header `Day 12 of 28` | `lib/widgetResolution.ts:350`, `lib/widgetSnapshot.ts:291` |
| Vet report — trial section, compliance tile, scope cascade rung 2 | `supabase/functions/generate-report/report.ts:439`, `:2854` |
| Signal engine — four `dietTrialActive` gates | `detection.ts:3348`, `:3404`, `:3478`, `:3938` |
| Ask | `supabase/functions/ask/tools.ts:1157` |

**Seven** surfaces are built on a substrate no user can populate. v0.9 listed six and missed the Home Trend zone — which matters because `TrendZone.tsx:35` tests compliance mode **before** symptom mode, so starting a trial *replaces the Home symptom chart with a compliance bar*. **PR 4's scope includes both files; without them D2 is not delivered.**

### 1.2 The consequence for Step 9

`docs/nyx-vet-report-requirements.md:21` names the report's **first** clinical question: *"Is this diet trial working?"*

The report's default scope cascade (`report.ts:439`) is: (1) since last vet visit → (2) **else the active diet-trial window** → (3) else 90-day fallback. Rung 2 has never fired. Step 9 has been designed, built, cold-read and shipped **without ever being exercised against its own primary use case.** This track is what makes that possible.

> **Corollary the review surfaced:** because `hasTrial` gates them, the trial branches of the vet report — the Appendix C caption, the trial tile set, the `diet_trial_working` framing — **have never rendered in any artifact `vet-report-cold-read` has ever seen.** Changing them re-litigates nothing.

### 1.3 The live mislabel

`app/(tabs)/profile.tsx:193-205` pulls every `meal` event since `started_at`, counts distinct days, and divides by days elapsed:

```ts
const distinctDays = new Set((mealEvents ?? []).map((e) => new Date(e.occurred_at).toDateString())).size;
const compliance = Math.round((distinctDays / daysElapsed) * 100);
```

There is **no filter on the trial's `food_item_id`.** An owner feeding chicken every day through a novel-protein trial reads **100% compliance**.

**And the number is not the worst of it.** `profile.tsx:770` binds the **progress bar's width** to `compliance`:

```tsx
<View style={[styles.progressBar, { width: `${Math.min(100, dietTrial.compliance)}%` }]} />
```

So an owner on day 2 of a 56-day skin trial who logged both days sees a **nearly full progress bar** — reading as "almost done" at 3.5% elapsed. Deleting the string alone leaves the more misleading artifact in place, and v0.9's acceptance criterion ("the string 'compliance' appears nowhere on the card") would have passed it.

The server computes the same numerator (`report.ts:2854`) but renders it honestly — `render.ts:1021` labels the tile *"Trial-diet days logged (≥1 meal) / not a clean-elimination count"*. **The vet report is not lying. The profile card and the Home Trend zone are.**

> **Dr. Chen:** A vet handed "94% compliance" concludes the elimination was clean and rules out food-responsive disease. That is a false negative on a patient who has one. This number is worse than no number.

### 1.4 Why this is not "just" a missing form

- Elimination trials run **8–12 weeks** (skin) / **≥2 weeks to assess, ≥12 weeks before transitioning away** (GI — ACVIM 2026 CIE consensus)
- An 8-week elimination trial reaches **>90% diagnostic sensitivity** for cutaneous adverse food reaction *among animals that have it* (Olivry/Mueller/Prélaud) — this is a **sensitivity** figure, not a treatment-efficacy one
- Adherence is widely described as the limiting factor. AAHA 2023: *"a properly performed diet trial is difficult to conduct and client compliance can be challenging"*; corroborated qualitatively by Jackson & Dembele 2024 and dermavet 2026

> ⚠️ **v0.9 asserted "owner adherence collapses to 20–30%." That figure could not be traced to any published veterinary source in two independent research lanes** (landscape §9 #1). The argument — *the gap between efficacy and completion is the product* — survives on the qualitative evidence. The number does not, and it has appeared in investor-adjacent material. **Re-source or downgrade before external use (B-420).**

---

## 2. Decisions

| | Decision | Ruling |
|---|---|---|
| **D1** | v1 scope | **RATIFIED (PM, 2026-07-24) — lifecycle + allowed-set adherence.** Stress-tested 2026-07-25 and **held** — see §2.2 and review record §5. |
| **D2** | What "compliance" means | **RATIFIED (PM, 2026-07-24) — split the metric.** Coverage and adherence are two facts; the blended "% compliance" is deleted. **Externally validated:** no adherence number is documented in the public materials of Monash, mySymptoms or Vyla, and no clinical source computes a blended one. D2 is convergence with the mature category, not a downgrade. |
| **D3** | Allowed-food set vs. B-351 D6 | **RATIFIED (PM, 2026-07-25) — both ship, one detection path.** D6 keeps the protein axis; this adds the explicit food axis. Unanimous across all nine lenses, backed by live data (§2.1). |
| **D4** | Contamination detection | **One predicate, one shared module — not one documented intention.** `classifyFeeding` lives in `lib/dietTrial.ts` and is imported by the client, `generate-report` and `ask`. B-351's Tier-2 flag is this function's protein arm, **consumed** on B-351's surfaces — not a parallel system. See §5.3. |
| **D5** | Where trials are created | **Profile card** — pet-scoped, where an owner already tells Nyx standing facts. The *location* mirrors `AddMedicationModal.tsx`; **the modal's shape does not** — that modal is 566 lines and collects eight fields (§4.1). |
| **D6** | Trial end | **Milestone prompt** at day N → complete / extend / abandon, with an **owner-reported** outcome. Never an app verdict. **Amended:** the milestone is *sticky*, action-first, and never reads as permission to stop (§4.3). |
| **D7** | Local SQLite mirror | **Yes.** Closes B-408. Requires `updated_at` + a tombstone on both tables (§3.3). |
| **D8** | Reintroduction / challenge phase | **Out of v1 — empirically safe:** only ~10% of owners ever re-challenge. Additive `phase` column. **Clarification:** `phase` reserves a **lifecycle state, not a data model** — a challenge is N per-food windows with quantities and washouts and needs its own child table (§9). |
| **D9** | Trial-aware surfaces (B-357 shelf, food picker) | **Fast-follows**, not v1. |

### 2.1 Why protein-derivation alone is insufficient (the D3 rationale)

B-351 D6's derive-from-the-trial-food approach covers the common novel-protein trial well. It structurally cannot cover these:

1. **Hydrolyzed / prescription diets.** The mechanism is not protein identity. A *different* duck food is off-diet, but derivation sees `duck == duck`. **Dr. Chen: this is the case, not an edge case** — a hydrolysate is prescribed *after* a novel-protein trial has already failed, so these are the most refractory patients, and derivation is blindest exactly there.
2. **The permitted treat.** Vets routinely allow one named treat. Derivation flags it at every feeding — and an owner warned about a permitted food learns to dismiss all warnings. This is the alarm-fatigue failure that makes contaminant detection worthless.
3. **Foods with no protein data.** Weakened but not eliminated by B-416; the residual is a permanent trickle.
4. **Label unreliability — the strongest independent argument.** Mislabeling runs **33–83% specifically in the novel/limited-ingredient products marketed for these trials** (Olivry & Mueller CAT(5)); 65% of 29 OTC dry foods carried undeclared chicken DNA (Kępińska-Pacelik 2023). **An explicit set is a record of *intent* that survives a wrong ingredient panel; derivation inherits the panel's errors directly.**
5. **Owner recall.** GP-advice recall falls from 83.1% at two instructions to **28.6% at four**; a trial's rule set is 5+ instructions given once, verbally, expected to hold 56 days. An explicit set is a re-readable rule list. Derivation is invisible to the owner and cannot do this job at all.
6. **The empirical argument (live data).** Applied to the production account, the **shipped** off-diet definition (`report.ts:2246`, treat-or-human-food) would report **~530 off-diet exposures across 645 feedings**, because 82% of logged feedings are treats. No layout rescues 530 exposures — it is unreadable to a vet and unfaceable for an owner. **The explicit allowed set is what makes an exposure count small enough to mean anything.**

Also: without the set, PR 5's *"a permitted treat never flags"* test is literally **unwritable** — derivation has no representation of *"the vet said this one is fine."*

> **Product Owner:** flagged, not silently taken. If the PM reads D6 as binding on trial-scoped food modeling generally, PR 1 drops `diet_trial_foods` and v1 reports coverage only — adherence then waits for B-351 Phase B.

### 2.2 Amendments proposed against ratified decisions

Recorded so they neither widen D1/D6 silently nor get lost. **All are PM rulings** — full argument in the review record §3.

| # | Amendment | Against | Outcome |
|---|---|---|---|
| **A-1** | Owner-scored 0–10 severity at trial start and completion (skin only) | D1 | **❌ REJECTED (PM, 2026-07-25) — and the premise corrected.** Severity comes from the **logged events**, not a subjective score. **No severity columns in migration 040.** The review's argument for it contradicted Dr. Chen's own persona (*"she trusts frequency over owner-rated severity"*), Jordan's (*"Jordan doesn't know what '3 out of 5' means clinically"*), and a shipped app-wide decision — **every** event type carries `hasSeverity: false`, not just `itch`. The clinical finding underneath survives and is **not** discharged: owner-logged streams decay with attention, so an itch count is biased toward apparent improvement. The remedy changed — **§7 discloses logging density alongside the symptom trend** so the bias is visible rather than corrected by an instrument the app has refused everywhere else. |
| **A-2** | A `paused` lifecycle state | `trial_status` enum | **OPEN.** A vet-directed hold ("stop the trial, she's on metronidazole" — routine under ACVIM's antibiotic guidance) today lands only on `abandoned`, destroying a trial that will resume. Paused days would leave the coverage denominator. Schema-or-nothing: it is free in PR 1 and a migration afterwards. |
| **A-3** | A mid-trial card state at ~40% of target | D6 | **OPEN.** D6 places its only moment *after* the window in which owners quit. Card state only, never a push — Principle 4 untouched. Not schema; can land any time. |
| **A-4** | Setup line prompting the flavoured-medication **substitution** | D1 scope | **✅ RULED IN (PM, 2026-07-25)**, alongside C3's detection. The clinical instruction is to substitute, not detect — every source prescribes a pre-trial switch, and the line acts on day 0 where the detector fires on day 14. |

---

## 3. Schema (PR 1 — additive, own PR)

Migration **040**. **Migration Safety Pre-flight:** destructive = **`y`** (v0.9 said `n`; the UNIQUE active-trial index requires dropping and recreating an existing index — see §3.4). Backfill = **N/A**; production holds **zero** `diet_trials` rows and zero `diet_trial_foods`.

> **This is the last cheap moment this schema will ever have.** Nine decisions below; every one is free today and a migration later.

### 3.1 `diet_trials` — additive columns

```sql
CREATE TYPE diet_trial_phase      AS ENUM ('elimination', 'reintroduction');  -- D8: reintroduction unused in v1
CREATE TYPE diet_trial_outcome    AS ENUM ('improved', 'no_change', 'worse', 'unsure');
CREATE TYPE diet_trial_indication AS ENUM ('skin', 'gi', 'other');            -- NOT free text — see note

ALTER TYPE trial_status ADD VALUE 'paused';                                   -- A-2, pending PM ruling

ALTER TABLE diet_trials
  ADD COLUMN food_label     TEXT,                        -- denormalized display fallback
  ADD COLUMN indication     diet_trial_indication,       -- drives the duration default
  ADD COLUMN phase          diet_trial_phase NOT NULL DEFAULT 'elimination',
  ADD COLUMN outcome        diet_trial_outcome,          -- owner-reported at completion (D6)
  ADD COLUMN outcome_notes  TEXT,
  ADD COLUMN stopped_reason TEXT,                        -- see §4.3
  ADD COLUMN ended_at       DATE,                        -- written on BOTH completed and abandoned
  ADD COLUMN transition_started_at DATE;                 -- see §4.1 — the countdown starts AFTER the transition
```

**`indication` is an ENUM, not `TEXT`.** §4.1 specifies a closed set with a closed mapping (GI→28, Skin→56). Stored as free text, any value that isn't exactly `'skin'`/`'gi'` falls through to a default silently — and the string reaches a clinician verbatim on §7 and crosses the LLM boundary in Ask.

**`ended_at` is not optional.** `completed_at` alone leaves an **abandoned** trial with no end date, so `report.ts:2813` treats a null end as *"open-ended → active through the window end"* and renders it as an intervention still ongoing; `getDietTrialProgress` renders "Day 104 of 28". Mirrors the already-shipped `medications.ended_at`.

> **`food_label` denormalization.** `food_item_id` is `ON DELETE SET NULL`, so archiving the trial food today silently blanks the trial's identity on the card *and the vet report*. Closes the gap `nyx-medication-logging-requirements.md` §4.3 called "a known minor gap."

### 3.2 `diet_trial_foods` — the allowed set (D3)

```sql
CREATE TYPE diet_trial_food_role AS ENUM
  ('primary_diet', 'permitted_treat', 'permitted_other', 'supplement');

CREATE TABLE diet_trial_foods (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  diet_trial_id  UUID NOT NULL REFERENCES diet_trials(id) ON DELETE CASCADE,
  pet_id         UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,   -- house hard constraint
  food_item_id   UUID NOT NULL REFERENCES food_items(id) ON DELETE CASCADE,
  role           diet_trial_food_role NOT NULL DEFAULT 'primary_diet',
  food_label     TEXT NOT NULL,                                          -- survives the food's deletion
  allowed_from   DATE NOT NULL DEFAULT CURRENT_DATE,                     -- membership is DATED
  allowed_until  DATE,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),                     -- required by the mirror
  deleted_at     TIMESTAMPTZ,                                            -- soft delete
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (diet_trial_id, food_item_id, role, allowed_from)
);

CREATE INDEX idx_diet_trial_foods_pet  ON diet_trial_foods(pet_id, diet_trial_id);
CREATE INDEX idx_diet_trial_foods_food ON diet_trial_foods(food_item_id);

CREATE TRIGGER trg_diet_trial_foods_updated_at
  BEFORE UPDATE ON diet_trial_foods
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE diet_trial_foods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "diet_trial_foods_owner" ON diet_trial_foods
  FOR ALL USING (
    pet_id IN (SELECT id FROM pets WHERE user_id = (select auth.uid()))
  )
  WITH CHECK (
    pet_id IN (SELECT id FROM pets WHERE user_id = (select auth.uid()))
    AND food_item_id IN (SELECT id FROM food_items WHERE created_by_user_id = (select auth.uid()))
  );
```

Five corrections against v0.9, each with its reason:

- **`pet_id` is required.** CLAUDE.md: *"Every other new table includes `pet_id` and RLS."* And `grep JOIN supabase/migrations/*.sql` returns **zero matches across all 40 migrations** — the nested-subquery form v0.9 proposed exists nowhere in this repo. The convention is stated three times in-migration, each naming the join as the thing avoided. It also **couples the child's boundary to every future SELECT policy on `diet_trials`** — the `026_drop_vet_reports_public_share` failure one table removed, and §9 contemplates exactly such a policy ("vet-prescribed trials via share link").
- **The `WITH CHECK` names the food-ownership predicate.** FK checks **bypass RLS**, so without it account A can insert account B's `food_item_id`; when B deletes their account the CASCADE removes a row from **A's allowed set**, and A's permitted treat becomes an off-diet exposure with no user action and no trace. This repo litigated the identical hazard at `023_dose_paired_event.sql:106-114`. **v0.9's claim that "no cross-account reference is possible" is false and must be deleted** — it pre-answered, wrongly, the question it assigns to `rls-privacy-reviewer`.
- **Membership is dated.** Without `allowed_from`/`allowed_until`, editing the set **retroactively rewrites the trial's entire exposure history with no audit trail**: add the contraband on day 13 and 12 prior exposures silently re-score as permitted, the card flips to clean, and the appendix empties. Mirrors `018_feeding_arrangements.sql:69-75`.
- **`updated_at` + `deleted_at` are what make §3.3 possible at all.** A `created_at`-only table forces insert-if-absent, whose contract is *"never overwrite an existing local row"* — so removing a food on one device could **never** propagate to another, and the two devices would compute different exposure counts with the phone holding the reassuring one.
- **`food_label` is `NOT NULL`.** v0.9 copied it with the comment "same fallback rationale as §3.1" while pairing it with `ON DELETE CASCADE` — so the row carrying the label dies with the food. It is dead by construction unless the label survives independently.

### 3.3 Enforcing one active trial per pet

```sql
DROP INDEX idx_diet_trials_active;
CREATE UNIQUE INDEX idx_diet_trials_active ON diet_trials(pet_id) WHERE status = 'active';
```

v0.9 asserted *"the existing `idx_diet_trials_active` partial index assumes it."* It is a **plain, non-UNIQUE** index (`001_schema.sql:161`) — nothing enforces anything. Under the house's offline last-write-wins with no merge logic, two devices produce two active rows with different ids, so LWW never fires. Then: the profile card throws `PGRST116` and renders **nothing** (`profile.tsx:177` `.maybeSingle()` → caught at `:209` with a `console.error`), Home's trend reverts silently, the widget first-wins on an unordered query, and the report describes trial A inside a window anchored to trial B. **The owner cannot fix it, because the surface that would let them edit it is the one that stopped rendering.**

**Free right now: zero live rows.** Two consequences to carry: this makes the Pre-flight `destructive = y`, and it turns §4.1's *"starting a second offers to complete the first"* into a hard server constraint, so PR 3's complete-then-start must be **ordered**, and PR 2 needs a terminal-error branch (a `23505` is permanent, not retryable — the existing `syncPending*` shape has none).

### 3.4 Local mirror (PR 2 — D7)

Mirror `diet_trials` + `diet_trial_foods` into SQLite alongside `medications`. **§3.3 in v0.9 was one sentence for what the `medications` precedent shows is ~10 registration points**, each of which has bitten this repo before:

1. DDL as a testable constant, run in `lib/db.ts` with explicit ordering
2. An `idx_*_unsynced` index
3. **Local FKs are plain TEXT, not SQLite FKs** — a child can hydrate before its parent (`lib/medications.ts:75-78`)
4. `ALTER TABLE … ADD COLUMN` upgrade paths for existing installs
5. **Two `LOCAL_WIPE_TABLES` entries, children first** — without them a shared device retains the prior account's trial: the food, the vet's name, and `indication='skin'`, which together are a de facto diagnosis disclosure that survives sign-out
6. Two `sync_watermarks` keys
7. A `Remote*` interface + `hydrate*` with the `WHERE … synced = 1` backstop
8. Two `syncPending*` pushes, with the new terminal-error branch (§3.3)
9. Registration in **both** `hydrateFromCloud` and `syncNow`, in FK order
10. A test against in-memory SQLite

Also **PR-2 scope, not a side effect:** rewriting `lib/widgetSnapshot.ts:283-310` to read the mirror. PR 2's own airplane-mode acceptance criterion cannot pass while `fetchActiveTrials` still hits Supabase, and the module-scope `trialCache` at `:280` is never cleared on sign-out.

> **`rls-privacy-reviewer` is mandatory at PR 1.** Hand it the §3.2 cross-account-food attack **by name** rather than letting the spec pre-answer it.

---

## 4. Capture & lifecycle UX

### 4.1 Start a trial (PR 3)

Entry point: the profile screen's Diet trial card, **which always renders** — with a designed empty state when no trial exists (§4.2 state 0), mirroring the medications card.

**The field test: the modal asks only what an owner can answer standing in a clinic car park holding a bag of food.** `AddMedicationModal.tsx` is the right *location* precedent, not the right *shape* one — it is 566 lines and collects eight fields.

**Entry point (ruled 2026-07-25):** the **Pet tab's** Diet trial card, which always renders — designed empty state when no trial exists (§4.2 state 0). It is the **only** way in; there is no menu item and no second path.

**Primary screen:**
- **Trial diet — MULTIPLE foods (ruled 2026-07-25).** A real trial is often a wet and a dry of the same diet, or two forms the vet named together. Writes **N** `diet_trial_foods` rows at `role='primary_diet'`. The schema always allowed this; v0.9's prose said "a food picker (required)", singular, and that singular was the only constraint.
  - **`diet_trials.food_item_id` is display-only legacy.** Write the first-picked primary food for back-compat with the seven existing readers. **No computation may read it** — every protein and membership decision reads `diet_trial_foods`.
  - **Build note:** `components/log/FoodPicker.tsx` is **single-select** today. Multi-select is net-new behaviour inside PR 3, not a prop.
- **What's it for** — `indication`: Skin / GI / Other. Sets and **shows** the duration default.

**Behind one "More options" disclosure:**
- **Also allowed** — optional multi-select (permitted treat / other / supplement). Copy locked to **provenance** — *"anything your vet said is OK"*, never *"treats you'll still give"*, or the field becomes a self-granted loophole that silently zeroes the exposure count.
- **Duration** — `target_duration_days`, prefilled from **species × indication** (§4.3), owner-editable, and **rendering its resulting end date**, not just a day count.
- **Start date** — **relabelled.** Day 1 is the first day of **exclusive** feeding, after a ≥1-week transition — CAVD: *"Start the 8-week countdown on the first day you feed only the elimination diet."* Label: **"First day on the trial diet only"**, defaulting to today as a *value*, not a semantic. `transition_started_at` lets transition-window feedings be excluded from the exposure count **by construction** rather than by owner discipline.
- **Vet** — `vet_name`, optional.

One active trial per pet, now enforced in the database (§3.3). Starting a second offers to complete the first, **ordered**.

**Two locked lines after creation** (PR 3, through `nyx-voice`):

> **LOCKED:** *"Everyone who feeds {pet} needs to know about the trial — Culprit can only count what gets logged here."*
> Undisclosed feeding by other people is **tip #1 of 7** in the diet manufacturer's own owner handout, and it is a channel Nyx is structurally blind to. Zero engineering.

> **LOCKED (A-4, pending ruling):** *"Ask your vet about anything else that goes in {pet}'s mouth — flavoured chewables (heartworm, flea, joint supplements) and flavoured toothpaste are the most commonly missed."*
> Every clinical source instructs a **pre-trial substitution**. A detector that flags a chewable on day 14 is fourteen days late; this line acts on day 0.

**Disclosure — ✅ C6 RULED (PM, 2026-07-25): name the itemisation, at the confirm action.**

> **LOCKED:** *"While the trial runs, Culprit records which feedings matched the trial diet and which didn't, with dates. That's the part your vet needs."*

This is the one place the app tells an owner that it is about to start keeping a dated record of **their own conduct**, rendered to the person who prescribed the diet — Nyx's first record that is a judgment about a *person* rather than a fact about a pet, on an artifact that already names both owner and vet. §6.3's disclosure-not-blame invariant governs how Nyx *phrases* things; it does not govern what the owner knew they were agreeing to, and it cannot control how a vet reads the list. **"They consented by tapping Start" is not consent to a disclosure never shown to them.** It renders *before* the commit, not on the card afterwards.

### 4.2 The trial card v2 (PR 4 — executes D2)

**The card's job is keeping the owner in the trial; the report's job is letting the vet act.** The hierarchy therefore differs by artifact, deliberately: the **card leads with progress and a forward line**, record-quality subordinate; the **report leads with coverage and exposures** (§7).

```
Diet trial · Day 12 of 28              ← progress bar encodes DAY progress only
Royal Canin Hydrolyzed Protein
Ends 14 August

Logged on 11 of 12 days
All 34 feedings matched the trial diet     ← positive form, never "no off-diet foods logged"
Culprit only sees what's logged.               ← qualifier INLINE, never a page legend
```

The single **"% compliance"** string is deleted — **and so is the compliance-bound progress bar** (§1.3). Day math moves to `getDietTrialProgress`, which must be **made timezone-honest first** (§8). The same deletion applies to `hooks/useTrend.ts` + `components/home/TrendZone.tsx`.

**Eleven states** — eight numbered plus three conditional **replacements** that belong to no numbered state and are the ones most likely to ship broken, because the bug they prevent is a normal-looking card rendering over an abnormal pet:

(0) no trial — designed empty state; (1) day 1; (2) mid-trial, clean; (3) mid-trial, with exposures — *the day after a slip*; (4) **below the coverage floor**; (5) day = target — the milestone; (6) day > target — overrun; (7a) completed; (7b) abandoned. **Replacements:** (8) **intake decline live** — replaces the adherence line entirely (§5.2); (9) **free-fed** — replaces the coverage *ratio* with `intakeNotDirectlyObserved` (§5.6); (10) **multi-pet** — replaces the clean-trial assertion with a scope caveat (§5.6).

**Three UI rulings from the mock round:**

- **A running trial appears on Home** — a **compact strip** (day count, day-progress bar, one line), rendered **only while a trial is active**, sitting **below `SignalZone` and above `TodayZone`**. Deliberate placement: Principle 3 says safety insights always lead, and a trial is *context*, not an insight. Tapping opens the Pet tab card. The Pet tab is not a surface the wedge owner visits daily; the trial is the thing they live with for eight weeks.
- **The card carries no "Log a meal" action.** Logging is the FAB (`components/log/FAB.tsx`). A second door to the same room is not a feature.
- **A-3 is CUT** (PM, 2026-07-25). No mid-trial "long middle" state. Owners are motivated by their own animal; the app does not need to coach them through week four.

**One card, one layout.** The eleven states are *which strings occupy the fact and note lines* — a switch, not eleven components. This matters for scoping: the whole feature is **six screens** (start sheet, the card, one reason sheet, the milestone + outcome sheet, and two list screens).

> **Jordan's binding constraint on state 4:** the sub-floor card must not go blank, empty or scary. *"The owner below the floor is by definition the one logging least, which is the one closest to quitting; handing them the emptiest, most disapproving card in the app is exactly backwards."*

> **Designer:** the card the owner sees the day after a slip is the only screen that decides whether they finish six weeks, and v0.9 drew only the good week.

### 4.3 Completion (PR 6 — D6)

At `dayCounter >= targetDays` the card surfaces a **persistent milestone** — state, not a push (Principle 4 untouched) — which **never expires and re-surfaces until acted on**.

**Action first. The verdict is asked only after the owner has decided what happens next.**

> **Day 28 of 28 — the window you set is done.**
> Your vet decides when the diet changes.
> `Keep going — 4 more weeks` · `This trial is done` · `Stopped early`

Then, and only then, the outcome sheet — which **leads with the data, not the question** (ruled 2026-07-25):

> **What changed over the 56 days**
> Scratching: **14 events** in the 8 weeks before the trial · **3** during it.
> Skin flare-ups: **4** before · **1** during.
> *You logged about as often in both stretches, so the drop isn't just less logging.*
>
> **Does that match what you've seen?** → `Better` · `No change` · `Worse` · `Not sure`

**Why this does not breach §6.1.** Counts are facts; nothing on the sheet says the trial worked, and the *verdict* still belongs to the vet. The C5 logging-density line is mandatory here for the same reason it is on §7 — a symptom drop that tracks a logging drop is uninterpretable, and an owner reading a flattering number is the person who stops a diet early. The owner's read is still captured because it is **the one thing the counts cannot supply**: how the animal actually seems.

**The duration lookup — provisional, P-1 (§0.4).** Keyed on `pets.species` × `indication`: dog·skin **56d**, dog·gut **28d**, cat·skin **56d**, cat·gut **42d**. Flag for Dr. Chen at PR 3.

Three requirements the v0.9 milestone missed:

- **It must never read as permission to stop.** On the **GI** default this is the live clinical harm: ACVIM 2026 says continue the diet **≥12 weeks** before transitioning away, so a day-28 milestone saying "trial complete" tells an owner to stop a diet their vet wanted continued for three months.
- **`Keep going` carries equal visual weight to `This trial is done`**, and offers a **named default** — +28d for skin (carrying 8wk→12wk in one tap), +14d for GI — not a blank field. At day 56, 5–10% of true CAFR patients have not yet remitted.
- **`Stopped early` captures a structured `stopped_reason`** (wouldn't eat it / cost / too hard to keep clean / vet advised stopping / symptoms resolved / other). A vet reading *"stopped at day 19 — wouldn't eat it"* prescribes differently than *"stopped — cost."* **A reason of refusal routes to the intake-decline health lane and is never rendered as a compliance outcome.**

An abandoned trial is a legitimate clinical fact, never framed as failure.

---

## 5. Adherence & exposure model (PR 5 — clinically load-bearing)

### 5.1 Two independent facts, never one number

| Metric | Definition | Answers |
|---|---|---|
| **Coverage** | distinct local days in-window with ≥1 logged **non-treat** feeding ÷ days elapsed, over **one explicit overlap range** | *How completely was this tracked?* |
| **Off-diet exposures** | in-window feedings classified off-diet by §5.3, **with their own feeding denominator** | *Was the elimination clean?* |

Four definitional corrections, each of which changes the number:

- **The day boundary is local midnight**, defined once here. `getDietTrialProgress` is currently **UTC**-anchored (`analytics.ts:841`) while both coverage numerators are local-day — three shipped implementations already disagree by up to two days on one screen unlock (profile Day 14 / widget Day 13 / Home Trend Day 12). Fix the helper **before** PR 4 consumes it, and move the `ask/tools.ts:1168` port in lockstep (**B-421**).
- **One overlap range.** v0.9's numerator is window-scoped while its denominator is trial-scoped, so a well-logged 8-week trial with a week-4 recheck renders **"27 / 56"**. Compute both over `max(scope.start, trial.start) … scope.end` and **render the range explicitly** ("28 of 29 days since the 12 Jun recheck").
- **Treats are excluded from the coverage numerator and included in the exposure numerator.** On live data 82% of feedings are treats and **15.7% of covered days are treat-only** — so a coverage floor is otherwise clearable entirely by treat data. (This resolves v0.9's S2, which was not a build-time detail.)
- **Coverage does not read intake, and must.** See §5.2.

`countTrialDaysLogged` (`report.ts:2854`) is honest about what it counts but its **headline noun phrase is not** — it counts a meal of *any* food. Rename at the definition, not just the call sites.

### 5.2 What the app is permitted to say (G2 — reframed)

**The negative claim is never rendered, at any coverage, on any surface.** *"No off-diet foods logged"* is deleted from the product.

Four code-grounded proofs that no floor rescues it:

1. **Coverage never reads `intakeRating`.** A cat that refuses the hydrolyzed diet every day, whose owner dutifully puts the bowl down and logs it, scores **100% coverage and 0 exposures** — a maximally clean trial rendered over a starving animal, seven times past the feline 48h hepatic-lipidosis window. §6.5 asserts `detectIntakeDecline` "already owns this"; nothing in §5 makes the two surfaces compose, and the trial card is not among that detector's three consumers.
2. **Treat-only days clear any floor** (15.7% of live covered days).
3. **The metric is day-granular and saturates** on the first meal of the day — so the once-a-day logger whose partner slips an unlogged jerky every evening reads 100% forever. That is precisely the under-capturing profile the guard exists to catch.
4. **The oral-product channel is invisible by construction**, and 25% of dogs in a 93-owner survey had access to unmonitored food sources.

**What replaces it:**

- **Positive form, describing the record — as TWO sentences with their own denominators** (corrected 2026-07-25; the single-sentence form was wrong):
  > **LOCKED:** *"Meals logged on 22 of 30 days."*
  > **LOCKED:** *"84 feedings in total — all 84 matched the trial diet or a permitted food."*
  > **LOCKED:** *"84 feedings in total — 81 matched, 3 did not."*
  >
  > **Why the split.** v0.97's *"84 feedings logged across 22 of 30 days"* welded a **treat-inclusive** feeding count to a **non-treat-only** day ratio (§5.1 excludes treats from the coverage numerator). A treat-only day is therefore *excluded* from the 22 and *included* in the 84 — and 15.7% of live covered days are treat-only, so the sentence is false in a common case. Coverage is about **days with meals**; exposure is about **all feedings**. They never share a sentence.
- **The qualifier is inline and permanent on the claim itself**, never a page-level legend:
  > **LOCKED:** *"Culprit only sees what's logged — flavoured liquids and tablets, other households and foraging aren't visible here."*
  >
  > **Why the change.** v0.97 said *"flavoured medications … aren't visible here"* — written before **C3** ruled the chewable lane INTO v1. Rung 4 now *detects* flavoured chewables, so the old line contradicted a shipped detector, and on the vet report it told the clinician to discount a line in his own Appendix C. The residual it must still name is **B-419**: flavoured *non-chewable* forms.
- **The exposure count is a floor, never a total.** No surface may state or imply that high coverage makes it complete.
- **Two-sided.** Below the floor Nyx may neither claim a clean trial **nor** raise an absence-based alarm — the ">3 days without a stool" escalation is the mirror case, and at 40% coverage that is *unknowable*, not alarming.
- **A floor still exists**, but it gates the report's **interpretability statement** (§7.2) — *"this log does not support interpreting this trial"* — not the exposure count. That is the *uninterpretable-vs-negative* distinction a specialist draws first.

**Coverage must also compose with intake.** The trial card subscribes to the same `IntakeDeclineFlag` the dashboard already consumes, and a live flag **replaces** the adherence line rather than rendering beside it.

> This is the local instance of `n=1 never reassures`: absence of a logged exposure is not evidence of absence. **The Data Scientist's caveat stands:** the floor's *number* remains undefined until the metric is pinned — three defensible definitions of coverage read **100% / 84% / 19%** over the same 70 days of live data.

### 5.3 One detection path (D3 + D4)

**The rule above the steps: the allowed set is the ONLY permit path. The protein arm may only ADD an off-diet verdict; it can never remove one.** An unknown, unread or incomplete protein set yields silence — never an "all clear" (B-351 D10, PM-ratified). The chain is **closed-world**, not permit/deny.

**Scope: feedings AND the oral route.** ✅ **C3 RULED (PM, 2026-07-25) — detect in v1**, overriding the chair's recommendation to defer. Flavoured chewables and supplements are named by eight independent guideline sources as trial-invalidating, and `diet_trial_foods` — a set of `food_items` — structurally cannot hold a medication. This is rulable at **zero new schema** because `medication_items.form` already ships `'chewable'` as an owner-selectable value.

`classifyFeeding` lives in **`lib/dietTrial.ts`** as a shared pure module imported by the client, `generate-report` and `ask` — one implementation, not one documented intention.

1. **Explicit allowed set** — the food is in `diet_trial_foods` **on the feeding's date** (`allowed_from … allowed_until`) → `permitted`, stop. Membership resolves on the **case-folded brand + product identity group**, not the raw UUID (§5.4).
2. **B-351 derived protein contaminant** → `off_diet_protein`. **The comparison is over FULL protein ARRAYS, not primaries** (ruled 2026-07-25):
   - **The sanctioned set is the union of every protein of every `role='primary_diet'` food** — each food's whole `food_items.proteins` array, never `proteins[0]`.
   - **Rung 2 fires on any member of the fed food's array that is not in the sanctioned set.** The duck formula that also lists chicken by-product meal flags on the chicken — the exact case migration 039 was written for.
   - **An empty array is silence, never an all-clear** (B-351 D10, ratified): a protein-unknown food falls through to rung 3.
   - **What this arm does NOT do is catch the food.** An unsanctioned food already fails rung 1 and is recorded regardless — the chain is closed-world. Rung 2 supplies the **antigen**, which on a hydrolyzed or novel-protein trial is the finding a dermatologist reads ("4 poultry exposures", not "4 off-diet feedings"). A dark rung 2 costs attribution, not detection.
   - **Permanent residual:** an **undeclared** protein is not on the label and therefore cannot be in the array. Mislabeling runs 33–83% in precisely the novel/limited-ingredient products these trials use. That is what §5.5's standing fact **discloses** rather than detects.
3. **Neither** → `off_diet_unrecognised`, rendered as *"not recognised as trial food"*, never as a contaminant assertion.
4. **The oral route (C3)** — an in-window `medication` event whose item carries `form = 'chewable'`, **or** any dose carrying a `paired_event_id` food vehicle (B-156's shipped pairing), enters the exposure set. Rendered as an oral-route exposure, never as a dosing error and never as a reason to skip a dose — **a missed critical dose is a worse outcome than a contaminated trial**, and §6.7's record-and-continue governs the copy.

> **The substitution beats the detection, and both ship (A-4).** Every clinical source instructs a **pre-trial switch** to unflavoured forms, not vigilance. A detector firing on day 14 is fourteen days after the exposure it reports; the §4.1 setup line acts on day 0. Rung 4 is the backstop for the owner who didn't make the switch, not the primary intervention.
>
> **What is still out (B-419):** flavoured *non-chewable* forms — a flavoured liquid antibiotic, a flavoured tablet. Detecting those needs a `flavored` attribute on `medication_items`, which needs new owner capture on the medication surface and was deliberately cut (the datum is not reliably owner-knowable). §5.2's blind-spot line names this residual.

**Every flag must be tappable to its reason**, naming which rung fired. §6.3 says a flag is "disclosure, not blame" — but a flag the owner cannot interrogate is an unfalsifiable accusation. And rung 3 is the **modal** case on real libraries, not the edge case, so it needs a designed first-class copy treatment rather than a fallback.

**A permitted food is counted, never silenced — and now carries its antigen (D-B, ruled 2026-07-25).** Step 1 returns `permitted` *and records a permitted-food feeding* **and records any unsanctioned protein in that food's array as an antigen exposure**.

> **D-B — record the antigen, keep the verdict.** The feeding stays `permitted`: it was vet-approved, and flagging it would score the *owner* for following instructions (§6.9). But the vet report's antigen tally counts the protein, because *"6 poultry exposures, all from an approved treat"* is a finding available from no other surface. This keeps the two facts structurally separate — **compliance is about the owner and stays clean; antigen exposure is about the animal and stays complete.** Without it, rung 1's `stop` makes a vet-approved treat with a hidden protein permitted, counted, and never protein-checked: the same failure §5.5 addresses for the trial diet, displaced onto the food nobody is watching. `adversarial-reviewer` covers this at PR 5. Otherwise six dental chews a day reads as a clean elimination to both owner and vet — a **stronger** false negative than the §1.3 mislabel it replaces, because it carries the authority of a two-fact presentation. §7 renders *"Permitted foods: DentaStix — 168 feedings over 28 days"*, reusing the count-led rendering already at `render.ts:1177-1186`.

### 5.4 Food identity, and why it is not the UUID

Membership resolves on the same key the app already groups on — **case-folded brand + product name** (`lib/foodQueries.ts:27-32`), which is **Class A** under B-414's ratified D3a and therefore permitted on read and retroactively.

Matching the raw `food_item_id` breaks on an action the app actively encourages: re-photographing the bag mints a new row, the picker's `MAX(photo_path)` tie-break starts projecting it, step 1 fails, step 2 can't fire (identical proteins), and **every remaining meal of the prescribed diet flags off-diet** on a 100%-compliant owner. Four duplicate brand+product groups already exist in a 59-row library, and `lib/db.ts:876-879` states the house rule outright: *"a meal may reference any of them."*

### 5.5 The trial diet's own contamination is a trial-level fact

B-351's shape ① — the trial food's own protein set contains more than its intended novel protein — is **not** evaluated per feeding. Evaluated per feeding it fires on the **prescribed** food 100+ times across a 56-day trial, which is §2.1 case 2's alarm-fatigue failure inverted onto the one food the owner cannot stop feeding.

It is instead a **standing fact**, computed once per trial and surfaced once on the card and in §7's trial block.

**D-A (ruled 2026-07-25) — the standing fact covers PERMITTED EXTRAS too, not only the trial diet.** Two distinct sets, and the distinction is load-bearing:

- **`sanctionedProteins` derives from `primary_diet` rows ONLY** — unchanged. A permitted extra never *widens* what counts as on-diet, or the allowed list becomes a self-granted loophole.
- **The contamination standing fact is computed over `primary_diet` rows AND permitted extras.** The vet-approved rabbit jerky that also lists chicken fat is exactly as trial-invalidating as a contaminated primary diet, and less likely to be noticed. Cost: one more set union, no new alarm surface, no per-feeding verdict — C2's alarm-fatigue reasoning (never flag a food the owner cannot stop feeding) applies identically to a treat the vet told them to keep giving.
- **Copy is disclosure, not accusation:** *"One of the foods on {pet}'s allowed list also lists chicken."*

> **`adversarial-reviewer` is mandatory at PR 5.** The pre-build pass is done (review record §6): the step-ordering, cascade, derive-at-read and policy-shape attacks **held**; the intake, treat-only, saturation, identity, temporal and free-fed attacks **broke** and are fixed above. A named counterexample for the build-time pass: **exposure↔symptom juxtaposition must use a 1–14 day forward window, species-dependent, never same-day and never a nearest-preceding-meal join** — this repo shipped that exact attribution bug once under three ceremonial sign-offs.

### 5.6 Free-fed and multi-pet households

v0.9's §5 has no model for either, and §9's shared-bowl deferral does not discharge §5.2's claim.

- **Free-fed.** A `free_choice` arrangement emits no meal events, so the most tightly controlled feline trial scores near-zero coverage and the app spends eight weeks telling a compliant owner she is failing. Mirroring `lib/analytics.ts` invariant #6: an overlapping active arrangement **replaces the coverage ratio** with the `intakeNotDirectlyObserved` marker — the denominator has no meaning — and an arrangement whose food is **not** in the allowed set is itself a **standing off-diet exposure**. §5.3 takes `feeding_arrangements` as a second input, not only `events`.
- **Multi-pet.** Coverage is per-pet by construction, so the clean-trial statement renders most confidently in the household where it is most likely false. Gate the **claim** even though detection stays deferred. **The trigger is household pet count alone** (corrected 2026-07-25): `feeding_arrangements.is_shared` ships **INERT** — `018_feeding_arrangements.sql:81` states *"the UX always writes FALSE"* — so a shared bowl is **not knowable** and no copy may imply it is. Reuses the shipped `attributionConfidence` axis; needs no household model. **LOCKED:** *"{pet} shares a home with {other}. Culprit records food against one pet at a time, so it can't rule out {pet} eating something logged for {other}."*

---

## 6. Clinical safety invariants (`clinical-guardrails` applies)

1. **Culprit never scores the trial.** The app reports coverage, exposures and symptom trend as separate facts; the owner reports the outcome. *(This needs an owner-facing **sentence**, which v0.9 never wrote — say plainly on the completion milestone that Nyx reports what happened and the vet decides what it means.)*
2. **Absence of logged exposure never reassures** (§5.2). No negative claim, at any coverage.
3. **A contaminant flag is disclosure, not blame** — and disclosure includes **explainability**: every flag is tappable to its reason.
4. **Non-blocking at the moment of the event** (Principle 1). *Externally validated:* no elimination app in any species warns or colour-codes at **log** time; the ones that verdict do so at **scan** time, on a shop product. A pre-decision surface may verdict; a record surface may not.
5. **Refusal of the trial diet routes to the health lane, not preference.** `detectIntakeDecline` owns it and the trial must not shadow it — and §5.2 now makes that composition structural rather than asserted. A *second, non-clinical* path may surface "this diet isn't being eaten" as a **trial-viability** fact pointing at the vet (a different hydrolysate is the standard answer), without softening the first.
6. **An abandoned trial is a clinical fact, not a failure state.**
7. **Record and continue (new).** Every exposure surface carries an explicit continuation statement, and **no copy on any surface may imply the trial is voided, compromised, or must be restarted.** No consulted source instructs a restart. CAVD, verbatim in both handouts: *"Don't panic! If you make a mistake, it's OK. Record it on the calendar and keep going with the diet trial."* And **no quantified reassurance** — never "a small amount probably won't matter" — because the cross-contact threshold is explicitly unknown (reactions were elicited at 1 g in 5.7% of challenges).
8. **An oral-route exposure is never a reason to skip a dose (new — C3).** Rung 4 flags a flavoured chewable as a trial exposure; it must never read as *"don't give this."* **A missed critical dose is a worse outcome than a contaminated trial.** The copy names the fact and points at the vet for a substitution — never at the next dose. §6.7's record-and-continue governs, and this composes with B-117's missed-critical-dose escalation rather than competing with it.
9. **Culprit never scores the owner (new).** Coverage is a data-quality statement about the **record**, never a performance statement about the **person** — never a percentage, grade, bar, streak or badge on any surface. Feedback-intervention evidence: over ⅓ of interventions *decreased* performance, worst when attention moves toward the self. On a diet trial the streak break and the real clinical slip fall on the same day, so a streak stacks the abandonment mechanism onto the event most likely to end the trial.

---

## 7. Vet report (PR 7)

Step 9's first clinical question finally has a substrate. **The report leads with coverage and exposures** — the opposite hierarchy from the card (§4.2), deliberately: different readers, different jobs.

- **Re-base the off-diet computation onto `classifyFeeding` (§5.3) whenever a trial overlaps the window.** This is not a content tweak: `report.ts:2246`'s `confounderFeedings` (every treat + human food, never consulting the trial), the page-1 off-diet tile, the antigen tally, the protein-over-time chart and Appendix C all currently share a **different member set** — one that lists the vet-permitted treat as a contaminant and cannot show a different-brand kibble fed as a meal at all. **Invariant: one definition of off-diet across page 1, the tile and the appendix.** Retain the heuristic verbatim for no-trial reports.
- **Fix the caption.** `render.ts:2340` claims *"Everything fed outside the trial diet"* over a computation that does no such thing. **Add a generalisable AC: every caption is checked against the code beneath it.**
- **Concurrent medications during the trial window — required, and it is re-siting, not addition.** Drug, date span, still-active-at-report-end, and whether the span overlaps the last 7 days. **Explicitly not judged** — antipruritics are permitted throughout a trial and a 2–3 week prednisolone course is a documented protocol, so an app that flagged steroids as a compliance violation would be scolding an owner for following their vet. `render.ts:1678-1697` already computes this beside the off-diet line; it moves inside the trial block. **Without it a derm trial is unreadable — a steroid course and a successful elimination produce the identical improving curve.** Flag an antibiotic course in a GI-indication trial specifically: a steroid's effect withdraws, a course of metronidazole's effect on the microbiome does not.
- Coverage and off-diet exposures as separate rendered facts, each with its own denominator (§5.1)
- **The symptom trend is rendered against logging density over the same window** — ✅ **C5 RULED (PM, 2026-07-25).** Severity comes from the logged events, not a subjective score; **no owner-scored severity instrument ships** (§2.2 A-1). But an owner-logged event stream decays with attention — highest at trial start, lowest by week 6 — so a falling itch count is **biased toward apparent improvement** and a vet cannot tell a real remission from a tiring owner. Rendering the two series together makes the bias visible: if the itch count falls while total logging also falls, the trend is uninterpretable and the vet can see that at a glance. This is §5.2's coverage-denominator honesty applied one surface over — **measure and disclose the bias rather than correct it with an instrument the app has deliberately refused on every event type.**
- Off-diet exposures itemized with dates, feeding **Appendix C** (v0.9 said Appendix B — the spec and the code disagreed)
- Permitted foods rendered **with counts**, not just membership (§5.3)
- The allowed set rendered with `food_label` provenance and **effective dates**, plus a line when the set changed after `started_at`
- Owner-reported outcome rendered as **owner-reported**, attributed, never as a finding. The words **confirmed**, **diagnosis** and **food allergy** may not appear near it.
- Scope cascade rung 2 becomes reachable — with a **minimum-window floor** (B-423): a trial started today otherwise collapses the report to a one-day window at the highest-intent moment in the product.

> **✅ C4 CLOSED (PM, 2026-07-25, against the round-2 mock) — TWO-ELEMENT.** Both variants were rendered in the report's own register; the PM chose the two-element block, deferring the final word to Dr. Chen. **Ships: medication overlap + the interpretability statement.** **Cut: `diet_class` and the derived prior-diet line.**
>
> Three consequences, all recorded here so they are not re-derived:
> 1. **G2's coverage floor keeps its home.** The flagged risk was that a "medication overlap only" outcome would orphan §7.2. Two-element **contains** the interpretability statement, so the floor keeps the one behaviour attached to it.
> 2. **`diet_class` does NOT enter migration 040.** It was needed only under a four-element ruling, and it was the one addition requiring new capture — there is **no hydrolyzed flag anywhere in the schema**, and hydrolyzed is precisely the class the clinical argument turns on. **PR 1 ships as specified.**
> 3. **The prior-diet line survives as a fast-follow (B-217)**, not as lost scope — it is derived from meals already logged, so it costs nothing to produce whenever it is wanted.

### 7.2 The interpretability statement

> *This section did not exist in v0.9. §4.2's clean-trial line was annotated "only with §7.2 framing", and "7.2" appeared exactly once in the document — in that reference. The one safety qualifier on the app's clean-trial statement was a null pointer, and PR 4's acceptance criterion only checked that the word "compliance" was absent.*

The report carries one sentence, derived from coverage + exposures + any uncontrolled-access flag, stating whether **this log supports / partially supports / does not support** interpreting this trial. It is strictly a statement about the **record**, never about the pet and never about the owner — which keeps §6.1 intact and gives G2's floor its copy home.

*"Uninterpretable, not negative"* is the distinction a specialist draws first, and v0.9 had the inputs for it with nowhere to say it.

> **`vet-report-cold-read` is mandatory** on the rendered artifact — the first time the report's primary question renders with real data. The cold read must confirm a vet can distinguish coverage from adherence at a glance, and cannot mistake an owner-reported "improved" for a diagnosis.

---

## 8. Cross-cutting touch-points

| Area | Effect |
|---|---|
| `lib/analytics.ts:838` | Becomes the single day-math path — **after** it is made timezone-honest (§5.1, B-421) |
| `hooks/useTrend.ts` + `components/home/TrendZone.tsx` | **In PR 4's scope. ✅ RULED 2026-07-25 — ADDITIVE, NOT REPLACEMENT.** `TrendZone.tsx:35` currently tests compliance mode *before* symptom mode, so starting a trial **replaces** the Home symptom chart with a compliance bar. Delete that branch: the symptom chart **stays** and gains a trial start marker. The symptom is *why* the trial exists, and Principle 3 says concern leads. PR 4 additionally adds the **Home trial strip** (§4.2) below `SignalZone` and above `TodayZone`. |
| `lib/widgetSnapshot.ts:264` | Local mirror removes the network fetch (closes **B-408**); also gate the trial-food write path on staleness (B-422) |
| `detection.ts` trial gates | Four paths flip the first time a real trial exists. **`detectMealTypeCollapse` deserves a second look** — it fires on treat-only days, which under an elimination trial is the failure mode the trial cares about, and it is suppressed on exactly those pets |
| `ask/tools.ts` | `dietTrialStatus` returns a day counter only; the rundown should gain coverage, exposures and outcome |
| B-094 / B-357 / B-356 / B-217 | Fast-follows (D9). **B-217 is worth pulling forward**: a derived *"foods logged in the 90 days before this trial started"* line answers a question the specialist already asks, from existing meal events, with zero new capture |

---

## 9. Out of scope for v1

| Item | Why |
|---|---|
| **Reintroduction / provocation challenge** | Empirically safe: only ~10% of owners ever re-challenge. **`phase` reserves a lifecycle state, not a data model** — a challenge is N per-food windows with quantities and washouts and needs its own child table. |
| **Flavoured *non-chewable* oral products** | A flavoured liquid antibiotic or flavoured tablet — **B-419 (narrowed)**. C3 ruled the **chewable** lane INTO v1 (§5.3 rung 4), which needs no new schema. The residual needs a `flavored` attribute on `medication_items`, which needs new owner capture on a surface outside this track and is not reliably owner-knowable. §5.2's blind-spot line names it. |
| Flavoured toothpaste | Captured nowhere in Nyx. Blind-spot line only. |
| Coprophagy, foraging, undisclosed feeding by others | Structurally undetectable. **A one-time teaching moment at setup and a named blind-spot line on the report — never a detector, and never recurring alarms.** |
| Trial reminders / push | Blocked on the push-provider question + B-288. **Worth recording so a future session doesn't treat push as the adherence unlock:** electronic reminders pool at d≈0.29, the *smallest* credible mechanic in the literature. |
| Streaks, badges, perfect-week, owner scores | Barred by §6.8. |
| Paid trial-adherence support | Principle 7 — and the evidence wouldn't justify it anyway (financial incentives moved adherence by d=0.03). |
| Multi-pet shared-bowl contamination *detection* | B-292 + B-040. **The claim is still gated** (§5.6). |
| Trial templates | Wants real usage data. |

---

## 10. Build-time sub-decisions

> **§10 is dissolved.** v0.9 filed five items here; S1 was already found to be misclassified and promoted to G2, and the review found that was a **pattern**, not a one-off. Redistributed: **S2** (treats in the denominator) → §5.1, ruled with G2 — on live data it is the *dominant* term, not a detail. **S3** (back-dated start) → §5.2 — coverage reports from `max(trial start, first log)`, with the pre-adoption span *named as untracked* rather than counted as failure. **S5** (day > target) → §4.2 state 6 + §7 + the staleness rule (B-422) — it is three display surfaces plus a **write-path integrity** rule. **S4** (does completing archive the foods?) is the only genuine build-time item and moves to §8.

---

## 11. PR-by-PR build plan

| PR | Scope | Gates |
|---|---|---|
| **1** | Migration 040 — §3.1 columns, `diet_trial_foods` (§3.2), the UNIQUE active index (§3.3). Schema only. | **`rls-privacy-reviewer` mandatory**, handed the §3.2 cross-account-food attack by name. Pre-flight destructive = `y`. |
| **2** | Local mirror + sync for both tables, per §3.4's checklist; `widgetSnapshot` rewrite | `supabase-sync`. Closes B-408. |
| **3** | Start-a-trial UX (§4.1) — **multi-select trial diet** (net-new on `FoodPicker`) + the allowed-set picker; consumes the **P-1** duration table | Designer (P1, P2), `nyx-voice`, Jordan, T&S (the C6 disclosure). **Flag P-1 for Dr. Chen at this PR.** |
| **4** | Trial card v2 (eleven states) + the **Home trial strip** + `useTrend`/`TrendZone` (symptom chart **restored**, compliance branch deleted) + the two list screens; delete the string **and the bar**; unify day math (D2) | Designer (P3, P6), Dr. Chen, `nyx-voice`. **B-421 must land first.** |
| **5** | `lib/dietTrial.ts` — the one predicate (§5.3–§5.6), incl. **full-array protein comparison**, **D-A** and **D-B**; pins the §5.1 metric and then sets the coverage floor | **`adversarial-reviewer` mandatory.** Data Scientist, Dr. Chen. **Sequences after B-351 completes.** |
| **6** | Completion milestone + owner-reported outcome (§4.3) | Designer (P4, P5), `nyx-voice`, `clinical-guardrails`. **Must not ship before PR 7.** |
| **7** | Vet report render (§7) — **two-element** trial block (C4); the antigen tally consumes D-B | **`vet-report-cold-read` mandatory.** Dr. Chen |

**Parallelism:** 1→2 sequential. PR 3 and PR 4 are independent once PR 1 lands (modal vs. card). PR 5 gates PR 7. **PR 6 is gated on PR 7** — completing a trial currently deletes it from the report, since every report surface gates on `status='active'`; the day after the owner taps Complete the trial section, coverage, off-diet list and clinical framing all vanish and the window falls to the 90-day fallback. The most valuable report this feature produces would be the one it destroys.

**Cross-track:** the real shared file with B-351 slice 4 is `app/(tabs)/profile.tsx`. Under §0.2 option (c) neither PR 4 nor PR 5 is blocked.

**Deploy-gating (the B-182 lesson):** PR 7 changes `generate-report` output. Do **not** deploy the Edge Function until the PR 4 client renderer has landed.

---

## 12. Acceptance criteria (QA — per PR)

> **QA's finding on v0.9's criteria:** not one of the seven named a harness or an oracle, and the three client surfaces carrying this feature (`profile.tsx`, `useTrend.ts`, `TrendZone.tsx`) have **no test file at all** — there is not a single test anywhere under `app/(tabs)/`. Every card criterion was a manual assertion against an undefined oracle. Each criterion below names its harness and a literal expected value.

**PR 1** — migration applies cleanly; `get_advisors` **differential** clean (baseline is 47 lints; no *new* rows attributable to these tables); a second account cannot read another's `diet_trial_foods` row; **an insert naming another account's `food_item_id` returns 42501**; **deleting account B does not mutate account A's allowed set**; a second active trial for one pet is rejected by the database; rollback verified on a branch, including all four ENUMs.

**PR 2** — a trial created offline survives reconnect + flush; **a food removed from the allowed set on device A stops being permitted on device B after a flush**; the widget header renders `Day N of M` in airplane mode; a `23505` is not retried forever; `LOCAL_WIPE_TABLES` contains both tables, children first, and the exact-set test is extended.

**PR 3** — on a **physical device**, the **default path** (trial food + indication, "More options" never opened) completes in **under 15 seconds, timed and recorded in the manual QA script**; the duration field renders its resulting **end date**; back-dating works; the allowed set writes both `diet_trial_foods` and `diet_trials.food_item_id`; a second active trial is refused with an **ordered** offer to complete the first.

**PR 4** — **no blended coverage/adherence metric renders in any form — string, bar width, ring, meter, badge, grade or colour**; any progress bar encodes `getDietTrialProgress().fraction` and nothing else, **asserted on the computed width prop, not on the absence of a word**; **`TrendZone` renders no `%`**; coverage and exposures render as separate facts with their own denominators; **the day counter is pinned under UTC−7 and UTC+11 at 00:30 and 23:30 local and agrees with the server**; the card renders correctly in **all eleven states** (§4.2), each with its literal expected string; **the Home strip renders only while a trial is active** and sits below `SignalZone`; **`TrendZone` renders the symptom chart during a trial** (the compliance branch is gone); **no "Log a meal" action exists on the card**.

**PR 5** *(jest, `lib/dietTrial.test.ts`)* — a permitted treat classifies `permitted` on **every** feeding (the alarm-fatigue test); **a food whose array contains an unsanctioned protein flags at rung 2 even when `proteins[0]` is sanctioned** (the duck-that-lists-chicken test); **a permitted food carrying an unsanctioned protein classifies `permitted` AND emits an antigen exposure** (D-B); **the contamination standing fact is computed over permitted extras as well as `primary_diet` rows** (D-A); **`sanctionedProteins` is NOT widened by a permitted extra**; **a re-captured duplicate of the trial food does not flag**; a different-brand same-protein food **does** flag on a hydrolyzed trial; a food with no protein data flags `off_diet_unrecognised` with hedged copy; **a 14-day all-refused trial renders no clean-trial statement anywhere**; **a chewable preventive given mid-trial appears in the exposure list, and its copy never implies the dose should have been skipped** (C3); **no surface renders a negative claim about the world** (greppable in CI); an exposure figure never renders without both denominators; every flag is tappable to its reason; `adversarial-reviewer` states the counterexample tried and why it held.

**PR 6** — the milestone renders **action-first**; **it never reads as permission to stop the diet**; `Keep going` has equal visual weight to `This trial is done` and cannot set a target at or below the current day; outcome is owner-reported and rendered as such; abandoning carries no failure framing; a refusal `stopped_reason` routes to the intake lane.

**PR 7** — `vet-report-cold-read` returns CLINIC-READY; a vet can distinguish coverage from adherence in the 60-second scan; **one definition of off-diet across page 1, the tile and the appendix**; **every caption matches the computation beneath it**; a trial with an overlapping anti-pruritic renders the overlap **inside** the trial block; **a report generated the day after completion still renders the trial section**; **no `day N of M` where N > M**; rung 2 verified reachable **and floored**.

---

## 13. Evidence / references

**Primary clinical sources** (cite these directly, not via the frozen research doc):
- Olivry, Mueller & Prélaud — critically appraised topic on elimination-diet duration (209 dogs, 40 cats): 8 weeks → >90% diagnostic sensitivity in both species
- Olivry & Mueller — oral food challenge timing: dog TTF90 14d, cat TTF90 7d
- **ACVIM 2026 consensus on canine chronic inflammatory enteropathy**: ≥2 weeks exclusive feeding for a complete trial, response typically 10–14 days, diet continued **≥12 weeks** before transitioning away
- AAHA 2023 — 4–12 weeks, >90% at 8; lokivetmab extends a trial past 60 days
- COSCAD'18 — PVAS10 validated; OGATE explicitly not validated
- Kępińska-Pacelik 2023; Ricci et al. 2018 — diet mislabeling
- CAVD, NWVDS, Bridgeport, Tufts Petfoodology — owner handouts (the transition rule, the contamination checklist, the record-and-continue register)

**Session artifacts:**
- `docs/research/2026-07-diet-trial-competitive-landscape.md` — the evidence base, incl. **§9 research debt: four cited claims REFUTED in verification**
- `docs/diet-trial-requirements-review-2026-07.md` — the review record: agreed edits, persona conflicts C1–C6, the rulings tee-up, what survived, what was cut

**Repo cross-references:** `nyx-vet-report-requirements.md` §21/§78/§88 · `nyx-medication-logging-requirements.md` §4.3/§5.4 · `nyx-multi-protein-requirements.md` D2/D6/D7/D8/D10 + §10 D3a · `docs/research/2026-06-vet-council-nyx-deep-dive.md`

**Backlog:** **B-417** (this) · B-418 (Home Trend mislabel) · B-419 (oral-route detection) · B-420 (re-source the adherence figure) · B-421 (day-math timezone) · B-422 (trial staleness) · B-423 (rung-2 floor) · B-424 (`LOCAL_WIPE_TABLES` fails open) · B-425 (stale `food_items` constraint in `personas.md`) · B-416, B-408, B-357, B-356, B-094, B-217, B-011, B-005
