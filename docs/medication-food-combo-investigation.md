# Combo-log: medication given with food or treat — Investigation & Decision

**Backlog:** B-156 | **Date:** 2026-06-22 | **Status:** Investigated — **build deferred (PM)**. This is a *decision record*, not a build-ready spec. It captures the team's read so a future build doesn't re-derive it.

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
- **R2 — Editing a combo.** With meds + treats split into separate events, do we edit them as two independent instances or as one combo unit? Undecided — needs a designed answer.

**Pet-owner verdicts:**
- **Flow C (`how_given`) — WORKS-FOR-ME.** Confirmed the right first slice: cheap, optional, no hot-path cost, dissolves the trap by construction. Caveat: no adherence safety on its own — the false-adherence hole stays open until the combo lands; name that gap.
- **Flow D (trap resolved) — WORKS-FOR-ME.** Clearest part; the per-event-link reasoning is owner-legible — answers Sam's exact fear ("will it assume every Delectable has a pill?").
- **Flow A (combo) — NEEDS-WORK.** Architecture is right, but **mis-framed as one-tap** — engaging the combo is tap→read→tap→navigate(picker)→find→tap→read→tap. Honest framing: the combo is the *slowest* path on the card, justified by value, not speed.
- **Flow B (safety catch) — NEEDS-WORK, and the most important.** Copy + intent excellent (both invariants honored), but its home — an auto-dismissing card — collides with reality (below). A static mock cannot validate it; a **live clickable prototype with the real timers** is required.

**The headline catch (R1, sharpened):** the safety prompt that justifies the whole feature sits on a card that auto-dismisses at **5000ms**, and a chip tap **replaces** that timer with **1500ms** (it does *not* extend it — `store/momentStore.ts:186`). Meanwhile the owner needs 20+ seconds and both hands to pill a squirming cat and watch whether the vehicle actually goes down. **For Sam — the target user — the moment she most needs the prompt is the moment she's least able to answer it in time.** → The safety prompt likely **cannot live on the auto-dismissing card at all**; it must persist until answered, or survive as a Home insight ("a dose may be in doubt"). This is the **same problem** as the live CLAUDE.md open question *"Medication completion card — diverge for safety / land the dose `unrated` until touched / hold longer?"* — **decide them together.**

**New catches the personas surfaced (beyond R1/R2):**
- **"Vehicle eaten, pill NOT delivered."** Cats eat *around* a pill — lick the Delectable clean, leave the dry tablet. The treat reads "All," so the coupling leaves the dose "Given" with no prompt → a **false-adherence record in exactly the feline case the feature exists to prevent.** A blind spot in the safety story; decide detect-and-prompt vs. document-as-known-limit.
- **Edit model (R2) is where "two events" vs. "one act" collides.** `paired_event_id`-on-the-dose implies two separate History edits; the owner expects to fix one thing. Designed answer required before build.
- **Discoverability tension.** A quiet line on a 5s card is easy to never notice — good for Jordan (skips it), bad for Sam (needs it daily). Resolve only with a prototype + "did Sam find it unprompted?"
- **Multi-pet attribution.** The dose inherits the pet from the treat event; in Sam's shared-bowl reality a wrong-pet dose is a real adherence error. Show active-pet context on the combo card.
- **A3 reads as asking twice.** The dose row's "Given" badge + a "Did Pixel take it?" chip row with "Given" pre-selected reads as redundant → owner taps nothing and misses the downgrade affordance.
- **"+ Gave a med with this?" tense is ambiguous** (already gave / about to give).

**Refined recommendation (sharpens §6 — substance unchanged):**
1. **Flow C (`how_given`) first** — owner-validated, safe, cheap. Name the false-adherence gap that persists until the combo ships.
2. **Before any combo build, run a live clickable prototype** with the real 5000/1500ms timers — the cheapest way to answer the timing question the static mock can't.
3. **Resolve the safety-prompt-persistence question** (with the existing B-117 open question) **and the edit model** before committing to the card as the combo's host.

## 10. Evidence / references

- **`docs/medication-food-combo-mock.html`** — concept mock of the recommended shape (the combo flow, the safety catch, the Slice-B `how_given` foundation, and the trap-resolved Recent case), built to the live design tokens + shipped components.
- **Pet-owner review (2026-06-22)** — `pm-feature-review` subagent as Jordan + Sam (§9 above); verdicts + the auto-dismiss-timing catch.
- B-156 backlog row (`docs/backlog.md`).
- Medication model + safety invariants: `docs/nyx-medication-logging-requirements.md` (§6.2 refusal-is-a-signal, §8 confounder pass), migration `020_medication_logging.sql`.
- The hot paths this would touch: `app/log.tsx` (`handlePickFood`, `handlePickMedication`), `components/ui/MealCompletionCard.tsx` (the narrow-surface warning), `components/ui/MedicationCompletionCard.tsx`, `components/log/IntakeChipRow.tsx`, `components/log/AdherenceChipRow.tsx`, `store/momentStore.ts`.
- The trap's precedent: B-010 saw-it/found-it (CLAUDE.md → Open Questions → Resolved), `components/log/TimeConfidenceField.tsx`.
- Personas consulted: Sam (cat/intake ambiguity — the motivating case), Dr. Chen (adherence truth), Data Scientist (intake-is-not-preference; confounder), Designer (narrow-surface budget), Engineer (single-event-timeline), QA (refused-vehicle / offline / multi-pet / delete edge cases) — `docs/personas.md`.
