# Combo-log: medication given with food or treat — Investigation & Decision

**Backlog:** B-156 | **Date:** 2026-06-22 (updated 2026-06-23) | **Status:** Phase A (Slice B `how_given`) shipped (A1–A3, #225–#227); **Phase B (the combo): B1 schema (#229) + B2 plumbing (#230) + B2b entry UI (#231) landed; PR B3 — the intake→adherence safety coupling — BUILT this session** (adversarial-reviewer PASS; G4 resolved as document-as-known-limit). All four Phase-B gates now resolved (G1 PM #221; G2 #230; G3 #228; G4 PR B3). **Remaining: PR B4 (edit-a-combo cross-link) + Phase C (engine confounder, gated/adversarial).** §10 carries the live PR status.

**Look & feel:** a concept mock of the recommended shape (Flows A–D below) lives at **`docs/medication-food-combo-mock.html`** — open it in a browser. It is a picture of the *deferred* recommendation, not a shipped/ratified design.

---

## Decision (lead with it)

**Keep treats and medications as separate logs for now.** The PM, after this investigation, chose to **not build the combo this cycle** and to keep the two as independent one-tap logs. B-156 is re-prioritized **Now → Later** with a named revisit trigger (below).

The investigation did **not** conclude "bad idea" — it concluded "real, but not now." The clinical value is genuine (see §2) and the main worry the PM raised is fully solvable (§3); the cost is concentrated in one scarce design surface (§4). When the trigger conditions arrive, §5–§7 are the recommended shape. A **pet-owner review** (Jordan + Sam, 2026-06-22 — §9) endorsed the direction and sharpened the revisit-time open questions; its headline: the **safety prompt (Flow B) likely cannot live on the auto-dismissing completion card**, and the combo's **edit model** needs a designed answer.

This changes **nothing** in the codebase today: no schema, no UI, no migration. Doses and meals/treats remain separate events, exactly as shipped.

---

## 1. The question

Owners frequently give a medication *with* food — a pill in a Delectable, a pill pocket, a tablet crushed into wet food. The owner experiences this as **one act** ("I gave her her treat with her pill"), but Nyx makes it **two unlinked logs** today (`FAB → Meal → Delectable`, then `FAB → Medication → Zyrtec`). Should we piggyback medication capture onto the meal/treat flow so it's one flow?

The PM pre-identified the trap: **Recent foods are saved for fast re-add, so binding "Delectable = Delectable + pill" would be false** — the same treat carries a pill some days and not others.

## 2. Why this isn't "just convenience" — the clinical reframe (Dr. Chen)

The strongest argument for the combo is **adherence accuracy, not saved taps**:

- A pill hidden in food the pet **doesn't finish** is a **dose in doubt**. Today, two unlinked logs — *treat: "picked"* and *dose: "given"* — produce a **false-adherence record**: the app asserts the dose was given when the vehicle (and therefore likely the drug) wasn't fully consumed.
- That is exactly what the medication **n=1-never-reassures** invariant forbids (`docs/nyx-medication-logging-requirements.md` §6.2; `clinical-guardrails`). A `refused`/`partial` vehicle is a possible **disease** signal *and* a missed dose — never "fussy."
- The combo is the **only** place we can honestly couple *"vehicle not finished → dose uncertain,"* because the intake truth ("did she eat it?") and the adherence truth ("did she get the drug?") are captured in the same moment.
- Secondary value: **"give with food" is a real dosing instruction** for many drugs (absorption), and the AI-Signal §8 confounder pass gets sharper if it knows a drug rides inside a specific food (blame the drug, not the chicken in the treat).

So B-156 is best understood as an **adherence-accuracy feature with a convenience payoff** — the reverse of how the backlog row originally framed it.

## 3. The recent-treats trap — real, but solved by construction (Data Scientist)

The PM's worry dissolves with one rule, and it's a rule we already use elsewhere:

> **The food↔med pairing is a per-event fact, derived from what the owner does in *this* session — never a property of the `food_items` library row.**

This is the **same shape as saw-it / found-it (B-010)**, where time-confidence is derived from the affordance the owner touches in-session and is never stamped onto the food. Consequences:

- **Recent re-adds the bare food.** Tapping "Delectable" from Recent tomorrow logs *only* a treat — never a phantom Zyrtec.
- The link lives on the **dose event** (`medication_administrations`), not the catalog. The catalog stays clean; the pairing is history, not identity.

So the trap is not a reason to avoid the feature — it's a constraint on *where the link lives*.

## 4. The one real cost — the meal-card "third affordance" (Designer)

The meal completion card is **deliberately the narrowest surface in the app**. Its own source carries the warning: *"If a third affordance is ever proposed here, stop and reconsider — the surface is intentionally narrow."* (`components/ui/MealCompletionCard.tsx`). It already holds **Change-time + intake chips**. A food-card "gave a med with this" makes **three**.

This is spendable, but it is a real product call, not a freebie. Non-negotiable guardrail for any future build: **the ~99% of meals with no medication must stay exactly one tap** — any combo affordance is a quiet, opt-in line the no-med majority never interacts with (Principle 1).

## 5. The design space considered

| Option | What | Verdict |
|---|---|---|
| **A — Keep separate** | Status quo: two independent logs. | **Chosen for now.** Clean, zero cost — but leaves the §2 false-adherence hole open. |
| **B — `how_given` on the dose** | A small enum on `medication_administrations` (`direct` / `in_food` / `in_treat` / `in_pill_pocket`). No cross-event link. | **Recommended first slice when revisited.** Captures the clinical "with food" fact, dissolves the trap by construction, touches only the med path (no meal-hot-path cost), and is the hook the combo needs. Nearly free, strictly more correct. Does **not** deliver one-flow logging on its own. |
| **C — Piggyback combo** | From the treat/meal card, an opt-in "gave a med with this" → logs a *linked* dose; couples intake → adherence. | **Recommended second slice.** Delivers the wedge *and* the §2 safety coupling. Costs the §4 meal-card budget + a per-event link + the (clinically load-bearing) coupling logic → **adversarial-reviewer mandatory**. |
| **D — One merged "meal+dose" event** | A single event row that is both a meal and a dose. | **Rejected.** Breaks the decided single-event-timeline (Option A) architecture — one event = one type. A combo is **two events**, never a merged row. |

## 6. Recommended shape when revisited (team rec; entry point = team's call, PM deferred)

Phased, so risk is sequenced correctly:

1. **`how_given` on the dose** (Option B) — additive enum, med-path only, no hot-path cost. Capturable as a quiet optional chip on the existing `MedicationCompletionCard`. Ships the clinical fact immediately.
2. **The piggyback combo** (Option C) — **entry point: the treat/meal completion card** (team recommendation, since the PM deferred). Rationale: it matches the owner's mental model (one act) and sits next to the intake chips, which is the **natural home for the intake → adherence coupling**. The §4 Designer tension is real and is resolved by making it a single quiet opt-in line, not a dismissible step. The coupling — *vehicle `refused`/`picked` → dose adherence in doubt, owner-confirmed, never silent* — is the load-bearing piece and is **adversarial-review-gated**.
3. **AI-Signal §8 engine** reads the pairing as a sharper confounder (later; composes with B-117 PR 9).

Architecture is friendly (Engineer): a combo is two events; the link is a **nullable `paired_event_id` on `medication_administrations` → the meal's `events.id`**, additive and FK-ordered on sync exactly like `meals` → `events`. No migration risk. Sketch in §8.

## 7. When to revisit (triggers)

Any of:
- **Real medication usage** shows owners routinely pilling-in-food (the §2 hole actually bites on real data), or first real-user feedback asks for it.
- **B-153 / B-154** (dose↔regimen linking; "log a dose" from the regimen card) get built — they touch the same dose-write path, so the combo should compose, not be built twice.
- **§8 med-confounder pass** wants the food-dose pairing for precision.

## 8. Schema sketch — for the future build only (NOT ratified, NOT applied)

Recorded so future-us starts from the team's read, not a blank page. Both pieces are **additive / non-destructive** (Migration Safety Pre-flight clean):

```sql
-- Option B — how the dose was administered (vehicle). Additive enum + column.
CREATE TYPE dose_route_vehicle AS ENUM ('direct','in_food','in_treat','in_pill_pocket','other');
ALTER TABLE medication_administrations ADD COLUMN how_given dose_route_vehicle;  -- nullable; NULL renders clean

-- Option C — the per-event link to a co-logged meal/treat (NEVER on food_items).
ALTER TABLE medication_administrations
  ADD COLUMN paired_event_id UUID REFERENCES events(id) ON DELETE SET NULL;     -- nullable; the meal event
```

Notes for the build:
- `paired_event_id` is **`SET NULL`** so deleting the meal leaves the historical dose intact (link dangles, dose survives) — mirrors the existing `medication_id`/`medication_item_id` `SET NULL` discipline in migration 020.
- Allow **N doses per food event** (two pills in one treat) — no uniqueness on `paired_event_id`.
- The vehicle-treat-as-its-own-intake-event question (does a pure-vehicle treat inflate diet/Top-Proteins stats? cf. B-111) is a **build-time sub-decision**, not a blocker: recommend the food is a real event only if the owner logged it as a meal/treat, and the §8 engine learns to discount a pure-vehicle pairing.

## 9. Pet-owner review & refinements (added 2026-06-22)

After the PM endorsed the direction, two things happened and **converged hard**: the PM raised two refinements, and the pet-owner personas (Jordan + Sam) reviewed the mock via the `pm-feature-review` lens.

**PM reactions (recorded):**
- **R1 — Toast dwell vs. the physical task.** The completion cards auto-dismiss quickly; the owner must have time to actually finish giving the treat / pilling the cat **and then** interact. The interaction window must accommodate the real-world action, not just reading speed.
- **R2 — Editing a combo. RESOLVED 2026-06-23 (G2, see §10) → two independent, cross-linked instances** (not one merged unit). A combo IS two events (single-event-timeline; the merged-row Option D was rejected §5) and History already displays two rows, so each is edited via its own existing detail screen — the meal-intake edit + the dose adherence/`how_given` edit on `event/[id].tsx` (built in A3) — with **zero** new coordinated-write surface. Adherence stays independently/explicitly editable and is **never auto-recomputed** from an intake edit (never-auto-flip / n=1-never-reassures). The one requirement so "one act" stays legible: the link must be **visible + tappable on both rows** (cross-navigation), never merged — the B4/display job.

**Pet-owner verdicts:**
- **Flow C (`how_given`) — WORKS-FOR-ME.** Confirmed the right first slice: cheap, optional, no hot-path cost, dissolves the trap by construction. Caveat: no adherence safety on its own — the false-adherence hole stays open until the combo lands; name that gap.
- **Flow D (trap resolved) — WORKS-FOR-ME.** Clearest part; the per-event-link reasoning is owner-legible — answers Sam's exact fear ("will it assume every Delectable has a pill?").
- **Flow A (combo) — NEEDS-WORK.** Architecture is right, but **mis-framed as one-tap** — engaging the combo is tap→read→tap→navigate(picker)→find→tap→read→tap. Honest framing: the combo is the *slowest* path on the card, justified by value, not speed.
- **Flow B (safety catch) — NEEDS-WORK, and the most important.** Copy + intent excellent (both invariants honored), but its home — an auto-dismissing card — collides with reality (below). A static mock cannot validate it; a **live clickable prototype with the real timers** is required.

**The headline catch (R1, sharpened):** the safety prompt that justifies the whole feature sits on a card that auto-dismisses at **5000ms**, and a chip tap **replaces** that timer with **1500ms** (it does *not* extend it — `store/momentStore.ts:186`). Meanwhile the owner needs 20+ seconds and both hands to pill a squirming cat and watch whether the vehicle actually goes down. **For Sam — the target user — the moment she most needs the prompt is the moment she's least able to answer it in time.** → **RESOLVED (G1, §10): the card auto-dismisses, and the safety lives in the *recorded value*, not the card's dwell.** The earlier framing ("the prompt can't live on the card") was half-right: the *card* can and should auto-dismiss (never trap/nag); what must not happen is an *unanswered* prompt recording a false "given." Because the prompt only fires after the owner marked the vehicle picked/refused, a lapse-to-"given" asserts compliance against the owner's own evidence — the false-adherence hole the feature exists to close (n=1-never-reassures; `clinical-guardrails` Pattern 1/2: no path to a reassuring verdict by construction). Safe shape: card auto-dismisses → unanswered dose lands **unconfirmed (never "given"), not counted compliant** → the question **resurfaces calmly** (Home insight / History flag). Informs the coupled CLAUDE.md med-card open question; the **critical-drug explicit-confirm** slice of it stays open.

**New catches the personas surfaced (beyond R1/R2):**
- **"Vehicle eaten, pill NOT delivered."** Cats eat *around* a pill — lick the Delectable clean, leave the dry tablet. The treat reads "All," so the coupling leaves the dose "Given" with no prompt → a **false-adherence record in exactly the feline case the feature exists to prevent.** A blind spot in the safety story; decide detect-and-prompt vs. document-as-known-limit.
- **Edit model (R2) is where "two events" vs. "one act" collides. RESOLVED (G2, §10): two independent cross-linked edits** — `paired_event_id`-on-the-dose deliberately keeps the two History edits separate (the architecture- and safety-correct choice), and the visible cross-link on both rows is what makes "one act" legible without merging the edit.
- **Discoverability tension.** A quiet line on a 5s card is easy to never notice — good for Jordan (skips it), bad for Sam (needs it daily). Resolve only with a prototype + "did Sam find it unprompted?"
- **Multi-pet attribution.** The dose inherits the pet from the treat event; in Sam's shared-bowl reality a wrong-pet dose is a real adherence error. Show active-pet context on the combo card.
- **A3 reads as asking twice.** The dose row's "Given" badge + a "Did Pixel take it?" chip row with "Given" pre-selected reads as redundant → owner taps nothing and misses the downgrade affordance.
- **"+ Gave a med with this?" tense is ambiguous** (already gave / about to give).

**Refined recommendation (sharpens §6 — substance unchanged):**
1. **Flow C (`how_given`) first** — owner-validated, safe, cheap. Name the false-adherence gap that persists until the combo ships.
2. **Before any combo build, run a live clickable prototype** with the real 5000/1500ms timers — the cheapest way to answer the timing question the static mock can't.
3. **Resolve the safety-prompt-persistence question** (with the existing B-117 open question) **and the edit model** before committing to the card as the combo's host.

## 10. PR-by-PR build plan (gated)

The plan exists; the **combo phase is gated** (§9). It deliberately sequences the unknowns: build the owner-validated safe slice first, run a timing spike, and gate the combo PRs on the two open design decisions. Conventions per CLAUDE.md: schema PRs are isolated + additive (Migration Safety Pre-flight); store/`lib/`/Edge changes carry tests (DoD); the safety-coupling + engine PRs are `adversarial-reviewer`-mandatory.

**Gates before the combo phase (Phase B) can build:**
- **G1 — RESOLVED 2026-06-22 (PM): the card auto-dismisses** (same 5s timer; never trap/nag — Principles 1/4). **Non-negotiable guardrail it travels with (`clinical-guardrails`):** an *unanswered* prompt must never record a false "given" — the prompt only fires after the owner marked the vehicle picked/refused, so a lapse-to-"given" asserts compliance against the owner's own evidence. Safe shape = auto-dismiss → unanswered dose lands **unconfirmed (not "given"), never counted compliant** → **resurfaces calmly** (Home insight / History flag; the build-time sub-choice). The standalone one-tap "given" is untouched (owner's positive statement, not an inference). PR 0 is **downgraded from a gate to a recommended de-risk** (the safety-design question is decided; the spike now only tunes the combo flow's feel/discoverability). Informs the coupled CLAUDE.md med-card open question; the **critical-drug explicit-confirm** slice stays open.
- **G2 — edit model — RESOLVED 2026-06-23 (this session): two independent, cross-linked instances** (not one merged unit). Each event is edited via its own existing detail screen (the meal-intake edit + the A3 dose adherence/`how_given` edit on `event/[id].tsx`), so there is **zero** new coordinated-write surface; adherence is **never auto-recomputed** from an intake edit (never-auto-flip / n=1-never-reassures); and the `paired_event_id` link is rendered **visible + tappable on both rows** so "one act" stays legible without merging. Architecture-consistent (a combo IS two events — Option D rejected §5), safety-correct, and reuses the tested edit paths; the schema is G2-agnostic (B1) so nothing is foreclosed. Recommend-and-proceed (awaiting PM ratification). Rationale §9 R2. → with G1+G2+G3 all resolved, **Phase B is now ungated**; the only remaining combo decision is the build-time **G4**.
- **G3 — composes with B-153/B-154** (the dose↔regimen link) — **SATISFIED (#228, 2026-06-23):** both shipped, and PR B2 (this session) extended that same shared `insertMedicationDose` path with the `pairedEventId` param rather than rebuilding it.
- **G4 — "ate-around-the-pill"** (build-time, PR B3): **RESOLVED 2026-06-23 → document-as-known-limit** (not detect-and-prompt). No owner-reported signal exists to fire on, and prompting on every finished-vehicle combo would over-nag the majority that went fine (Principle 4). Folded the adversarial review's `some`-edge sibling in. A future detect-and-prompt needs a dedicated "pill spat out / found later" affordance (Dr. Chen) — Phase-C / B-17x.

### Phase 0 — De-risk (gates Phase B)
- **PR 0 — Combo timing spike (branch-only, NOT merged) — now a recommended DE-RISK, no longer a gate** (G1 decided the safety-design question without it). A clickable prototype exercising the combo on the completion card with the real `5000ms`/`1500ms` timers (`store/momentStore.ts`), tested on-device *while actually pilling a pet*, to tune the combo flow's feel + the opt-in line's discoverability. **Deliverable = a short findings note**, not shippable code. No schema, no merge. (Mirrors the B-007 FAB prototype-on-branch precedent.)

### Phase A — Slice B: `how_given` (safe, buildable now, NO gates)
- **PR A1 — Schema migration** (`022_dose_how_given.sql`, server-only, isolated). Add `dose_route_vehicle` enum (`direct`/`in_food`/`in_treat`/`in_pill_pocket`/`other`) + nullable `how_given` column on `medication_administrations`. Pre-flight: additive / non-destructive / no backfill. Reviewers: Data Scientist + `rls-privacy-reviewer` (new column on the RLS'd dose table; RLS unchanged). PM applies via Supabase MCP. **AC:** column + enum live; existing rows unchanged; RLS still pet-scoped.
- **PR A2 — Local mirror + sync + write path** (client; **tests required**). Add `how_given` to the `medication_administrations` SQLite mirror (`lib/db.ts`), to the sync upsert column/placeholder/param lists (mind the **B-057** placeholder-drift trap), and as an optional param on `insertMedicationDose`. `supabase-sync` skill. **AC:** `how_given` round-trips device→Supabase→another device; null renders clean.
- **PR A3 — Capture + display UI** (no schema). Optional "How was it given?" chip row on `MedicationCompletionCard` (subordinate, skippable, default-null — the intake-chip pattern) + edit on `app/medication/[id].tsx` + read display in History/event-detail. Reviewers: Designer + `nyx-voice`. **AC:** skippable; default null; never blocks dismiss; reads clean when unset.

### Phase B — Slice C: the combo (G1+G2+G3 ALL RESOLVED — ungated; G4 is a build-time call inside PR B3)
- **PR B1 — Schema migration** (`023_dose_paired_event.sql`, isolated) — **BUILT 2026-06-23 (#229; applied live; draft pending the G2 ruling, now resolved).** Adds nullable `paired_event_id UUID REFERENCES events(id) ON DELETE SET NULL` on `medication_administrations` + a partial reverse-lookup index + a `BEFORE INSERT/UPDATE` **same-pet trigger** (`enforce_dose_paired_event_same_pet`, the cross-event-ref defense-at-rest the bare FK can't give). Pre-flight: additive / non-destructive / no backfill. Reviewers: Data Scientist + `rls-privacy-reviewer` (BOUNDARY HOLDS); no uniqueness on `paired_event_id` (N doses per food event). **AC (met):** link persists; cross-pet link rejected; deleting the food event SET-NULLs the link, the dose survives.
- **PR B2 — `paired_event_id` local mirror + sync + write-path plumbing — BUILT 2026-06-23 (this session; tests required).** The data layer only, the exact A2 analog: the `paired_event_id` column on the `medication_administrations` SQLite mirror (`MEDICATION_SCHEMA_SQL` in `lib/medications.ts` + an upgrade ALTER in `lib/db.ts`), the push mapper (`administrationRowToRemote`) + the hydration pull (`lib/sync.ts` — fetch column list, INSERT/`DO UPDATE`/params in lock-step against the **B-057** placeholder-drift trap), and an optional `pairedEventId` param on `insertMedicationDose`. **No UI** — the combo entry point is PR B2b. `supabase-sync` skill. **AC (met):** the link round-trips device→Supabase→device; an unlinked dose is a clean NULL; tsc + **732** jest green (+4).
- **PR B2b — Combo entry UI (next; host = the auto-dismissing card, G1).** The opt-in "+ Gave a med with this?" line on the treat/meal completion card → `MedicationPicker` → calls the B2 write path with `paired_event_id` (+ `how_given` inferred from the food's type). The "Logged together" confirmation surface; show active-pet context (multi-pet catch). Reviewers: Designer + Jordan + Sam + QA. **AC:** the no-med path stays one tap; the combo links correctly; wrong-pet guarded (the same-pet caller + the migration-023 server trigger). _(This is the UI half of the original single "PR B2"; the PM re-sliced it data-layer-first, mirroring the A2→A3 split.)_
- **PR B3 — Safety coupling (Flow B) — `adversarial-reviewer` MANDATORY — BUILT 2026-06-23 (this session).** When a combo dose's linked vehicle is marked `refused`/`picked`, the dose lands **UNCONFIRMED (adherence null), never an auto `given`**, the auto-dismissing card (G1) **sharpens its prompt** to "Did {pet} still get it?" (no pre-lit chip + a faint reason line), and the dose **resurfaces calmly** — a rose "Unconfirmed" tag on the History row + a soft-rose note on the dose-detail screen with the adherence chips above to resolve it. **never auto-flip, never silent-given** held by construction. **Architecture (key decision): couple at CREATION + DERIVE at read-time.** The starting adherence is computed once in `handlePickMedication` from the just-logged vehicle's intake (pure `initialComboDoseAdherence`: refused/picked → null, else `given`); the in-doubt RESURFACE state is a pure read-time derivation (`isComboDoseInDoubt`: combo + vehicle refused/picked + adherence null) joined live in `getTimeline`/`getEventById` (`paired_vehicle_intake`) — **no new enum value, no new column, no stored flag, no auto-flip** (a null adherence already counts as un-given toward compliance; `bucketAdherence` → `unrated`). The card uses a creation-time snapshot (`vehicleIntake` on the moment payload); the resurface uses the live join, so a dose created in-doubt **self-heals** if the vehicle rating later changes either way. An EXPLICIT owner answer (including `given` — they may have pilled directly after the refusal) clears the doubt and is never re-nagged. **The G1 fail-safe is load-bearing and is a TEST, not a comment** (`clinical-guardrails` Pattern 8): `lib/medications.test.ts` pins refused/picked → null, the never-coerce wire path, and a reassurance/"fussy"/`!` regex scan over every owner-facing string this PR emits. This is the medication analog of `analyze-vomit`'s escalation floor (Pattern 2: no path to a reassuring verdict by construction). **Two named residuals** (below). Reviewers: `adversarial-reviewer` (MANDATORY) + `clinical-guardrails` + Dr. Chen + `nyx-voice`. **AC met:** a not-finished vehicle never records a clean "given" — including when the card auto-dismisses unanswered. **No schema; tsc + 756 jest green (+18).**
  - **G4 "ate-around-the-pill" residual (named) — incl. the `some` edge:** a cat licks a Delectable clean but leaves the dry tablet → the vehicle reads `all`/finished → the dose stays `given` with NO prompt. The coupling keys off the VEHICLE'S intake, which says nothing about whether the pill specifically was swallowed; B3 cannot see this. The adversarial review (attack 8) added the **`some` edge** as the softest sibling: `some` ("ate a portion") → `given`, yet a pill could sit in the abandoned portion. **Decision: document-as-known-limit for B3** (not detect-and-prompt) — there is no owner-reported signal to fire on, and prompting on every finished/partly-eaten combo would over-nag the ~majority that went fine (Principle 4). A future detect-and-prompt would need a dedicated "pill found later / spat out" affordance (Dr. Chen); tracked for the Phase-C engine + a B-17x row. The owner can always downgrade on the card/detail.
  - **Scenario-2 residual (named):** a combo dose that auto-defaulted `given` (vehicle finished/unrated AT log time) and whose vehicle is marked refused/picked AFTERWARD is NOT re-flagged — a stored `given` cannot be told from an explicit owner `given` without an adherence-provenance field (a future schema PR), and re-flagging would over-nag a legitimate explicit answer. The dominant flow (intake rated before the combo, the chips sitting directly above the combo line on the meal card) is fully covered; closure = a one-bit `adherence_source` (auto vs owner) column, deferred.
  - **Soft-deleted vehicle — HANDLED (not a residual).** The adversarial review (attack 6) flagged that an in-doubt dose whose vehicle the owner later removes (soft delete) would keep its flag but point at a meal gone from History. Fixed in-code: the paired-vehicle join routes through `events pe … AND pe.deleted_at IS NULL`, so a removed vehicle nulls `paired_vehicle_intake`/`paired_food_name` → the dose drops out of in-doubt (the owner deleted the evidence; the dose stays un-given/unrated, never a false `given`). Safe direction + no orphaned-copy wart.
  - **Detection/`null` interaction — Phase-C note (not a B3 regression).** `generate-signal/detection.ts` `doseToMedicationWindow` treats a `null`-adherence dose as "drug on board" (the §5.1 default), so an in-doubt dose feeds a confounder window as if administered. B3 did NOT change this (a refused-vehicle combo was `given`→on-board before; now `null`→on-board), and the direction is safe (under-detecting a confounder never false-reassures). **Flagged for the PR C1 / B-117 PR-9 gate** so the two layers' meaning of `null` (B3: "unconfirmed, don't count"; detection: "administered") is reconciled deliberately — a refused-vehicle in-doubt dose arguably should NOT contribute an on-board window. Sibling of B-138.
- **PR B4 — Edit a combo** (implements the resolved G2 model = **two independent, cross-linked instances**). No new unified surface: the owner edits the treat's intake and the dose's adherence/vehicle on their existing separate detail screens; this PR adds the **visible, tappable cross-link on both rows** (dose → "given with [food]"; meal → "+ [drug] dose") so the combo is legible, and makes a soft-deleted vehicle drop the link label cleanly (B1: SET NULL only on hard delete). Adherence is never auto-recomputed from an intake edit (a calm resurface-prompt is allowed; an auto-flip is not). Reviewers: Designer + QA. **AC:** the owner can correct both the intake and the adherence independently; the link survives an edit; neither edit silently changes the other.

### Phase C — Engine consumer (gated, adversarial)
- **PR C1 — §8 confounder precision** (`generate-signal/detection.ts`; `adversarial-reviewer` MANDATORY). The engine reads the pairing so a drug riding in a food is attributed to the drug, not the food. Composes with B-117 PR 9 (`medicationWindows`). Reviewers: Data Scientist + Dr. Chen + `adversarial-reviewer`. Gated on combo data flowing. **AC:** a paired drug+food in a symptom window doesn't surface "food → symptom"; never falsely reassures.

### Parallelism & sequencing
- **Run now, no gates:** Phase A (A1→A2→A3, strict chain) + PR 0 (spike) — concurrent with each other and with B-153/B-154.
- **Strict chains:** A1→A2→A3 (done); B1 (done)→B2 (done)→B2b→B3→B4.
- **Gated:** Phase B was on G2 + G3 — **both now resolved (G1 too), so Phase B is ungated**; G4 is a build-time call inside PR B3. Phase C on Phase B data + adversarial.
- **Shared-file collisions (mostly retired):** `insertMedicationDose` / the dose-write path was the A2 / B2 / B-153/B-154 overlap — **all of them have now landed on it** (B2b just adds a caller, no new field). `lib/medications.ts`/`lib/db.ts` + `lib/sync.ts` column lists carried A2 + B2 cleanly; `STATUS.md` at every wrap.

### Embedded PM decisions
- **G1 safety-prompt host — RESOLVED 2026-06-22 (PM): auto-dismissing card + the non-negotiable fail-safe** (unanswered ⇒ unconfirmed, never "given"; resurfaces calmly). Resurface mechanism (Home insight vs History flag) is a build-time sub-choice; critical-drug explicit-confirm stays open in the coupled CLAUDE.md question.
- **G2 edit model — RESOLVED 2026-06-23: two independent, cross-linked instances** (not a merged unit). Recommend-and-proceed, awaiting PM ratification.
- **G3 cross-track order — SATISFIED (#228):** B-153/B-154 shipped before the combo; PR B2 extended the shared dose-write path.
- **G4 ate-around-the-pill — RESOLVED 2026-06-23 (PR B3): document-as-known-limit** (incl. the `some` edge). Future detect-and-prompt = Phase-C / B-17x.
- **Promotion** — Slice B (Phase A) to active build now, or held behind the `Now` med-track items?

## 11. Evidence / references

- **`docs/medication-food-combo-mock.html`** — concept mock of the recommended shape (the combo flow, the safety catch, the Slice-B `how_given` foundation, and the trap-resolved Recent case), built to the live design tokens + shipped components.
- **Pet-owner review (2026-06-22)** — `pm-feature-review` subagent as Jordan + Sam (§9 above); verdicts + the auto-dismiss-timing catch.
- B-156 backlog row (`docs/backlog.md`).
- Medication model + safety invariants: `docs/nyx-medication-logging-requirements.md` (§6.2 refusal-is-a-signal, §8 confounder pass), migration `020_medication_logging.sql`.
- The hot paths this would touch: `app/log.tsx` (`handlePickFood`, `handlePickMedication`), `components/ui/MealCompletionCard.tsx` (the narrow-surface warning), `components/ui/MedicationCompletionCard.tsx`, `components/log/IntakeChipRow.tsx`, `components/log/AdherenceChipRow.tsx`, `store/momentStore.ts`.
- The trap's precedent: B-010 saw-it/found-it (CLAUDE.md → Open Questions → Resolved), `components/log/TimeConfidenceField.tsx`.
- Personas consulted: Sam (cat/intake ambiguity — the motivating case), Dr. Chen (adherence truth), Data Scientist (intake-is-not-preference; confounder), Designer (narrow-surface budget), Engineer (single-event-timeline), QA (refused-vehicle / offline / multi-pet / delete edge cases) — `docs/personas.md`.
