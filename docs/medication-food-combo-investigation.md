# Combo-log: medication given with food or treat — Investigation & Decision

**Backlog:** B-156 | **Date:** 2026-06-22 | **Status:** Investigated — **build deferred (PM)**. This is a *decision record*, not a build-ready spec. It captures the team's read so a future build doesn't re-derive it.

---

## Decision (lead with it)

**Keep treats and medications as separate logs for now.** The PM, after this investigation, chose to **not build the combo this cycle** and to keep the two as independent one-tap logs. B-156 is re-prioritized **Now → Later** with a named revisit trigger (below).

The investigation did **not** conclude "bad idea" — it concluded "real, but not now." The clinical value is genuine (see §2) and the main worry the PM raised is fully solvable (§3); the cost is concentrated in one scarce design surface (§4). When the trigger conditions arrive, §5–§7 are the recommended shape.

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

## 9. Evidence / references

- B-156 backlog row (`docs/backlog.md`).
- Medication model + safety invariants: `docs/nyx-medication-logging-requirements.md` (§6.2 refusal-is-a-signal, §8 confounder pass), migration `020_medication_logging.sql`.
- The hot paths this would touch: `app/log.tsx` (`handlePickFood`, `handlePickMedication`), `components/ui/MealCompletionCard.tsx` (the narrow-surface warning), `components/ui/MedicationCompletionCard.tsx`, `components/log/IntakeChipRow.tsx`, `components/log/AdherenceChipRow.tsx`, `store/momentStore.ts`.
- The trap's precedent: B-010 saw-it/found-it (CLAUDE.md → Open Questions → Resolved), `components/log/TimeConfidenceField.tsx`.
- Personas consulted: Sam (cat/intake ambiguity — the motivating case), Dr. Chen (adherence truth), Data Scientist (intake-is-not-preference; confounder), Designer (narrow-surface budget), Engineer (single-event-timeline), QA (refused-vehicle / offline / multi-pet / delete edge cases) — `docs/personas.md`.
