# Nyx — Free-Feeding / Always-Available Food Requirements

**Status:** Design — build-ready for the R1 slice (this doc). Consolidates the B-040 backlog row into a single source of truth. **Revised 2026-06-09** with the design-review decisions (§11): free-feeding lives in the **food domain** (food detail = edit, food library = consolidated view), **never the pet page**; History renders it (ambient strip + boundary markers, §6a); engine ingestion promoted into R1 scope (§8).
**Backlog:** B-040 (`docs/backlog.md`)
**Evidence base:** `docs/research/2026-05-feeding-windows-and-partial-eating.md` (§1 free-feeding prevalence + multi-cat attribution; §3/§4 diet-trial integrity + WSAVA feeding-*method* field; §6 clinical implications)
**Team session:** 2026-06-07 (this doc). Prior kickoff + scoping captured on the B-040 row (2026-05-26 / -27).

---

## 0. What this doc covers — and deliberately does not

B-040 is large. The team + PM scoped the **first build slice** to **R1 only — the free-choice standing fact** (2026-06-07). This doc specifies that slice and explicitly fences off the rest so a future session does not silently expand it.

**In scope (R1):**
- Represent that a specific pet has a specific food **continuously available** ("free-fed / always down"), as a low-friction **standing fact** set once — not a per-nibble log.
- Render that fact as the **WSAVA feeding-method** on any vet-facing output.
- Carry the fact into the correlation engine as **background context / a confounder**, never as a stream of clean point events.

**Out of scope (deferred, each its own future item):**
| Deferred piece | Why deferred | Where it goes |
|---|---|---|
| **Option C — optional witnessed-eating log** | Composes cleanly on top of R1; PM-endorsed but sequenced *after* R1. | B-040 fast-follow (new child item when scoped). |
| **Shared-bowl per-cat attribution** | "Unsolved without hardware" (research §1/§4). The clinically sharpest part of the PM's own scenario (Nyx grazing Theia's bowl) lives here. | Multi-pet architecture sprint. |
| **Quantity recovery** (refill logs, photo plate-waste, consumption %) | Re-ignites the Designer/Jordan ↔ Dr. Chen/Data conflict; not needed to solve the representation gap. | B-040 layer B/D (deferred). |
| **Wet-food / general offered-vs-consumed *timing windows*** | Dir. of Eng blast-radius flag: touches the **core meal/event model + correlation engine**, not an additive edge feature. | Separate item (composes with B-010 windowing). |
| **Diet-trial uncontrolled-access confound treatment** | PM punted to implementation time; no active trial in the dogfood household. | Revisit when a trial-anchored detector ships. |

---

## 1. Purpose & current state

### The pain (dogfooding, 2026-06-07)
The PM's cats are the canonical case from the research brief: **Nyx** eats wet food meal-fed in the morning (logs today) **and** grazes a dry bowl; **Theia** gets weight-management **dry food that is down 24/7**; the dry bowl is **shared**. Theia's dry food **cannot be represented in Nyx today at all** — so any future vet report would omit a real part of intake (a lie by omission, per Dr. Chen).

### Why it's structural, not a missing button
Today the data model has **no pet↔food standing relationship**:
- `meals` is a **point event** (`occurred_at`, `quantity`, `intake_rating`) — it assumes discrete, witnessed feeding. A 24/7 bowl is a *duration / standing exposure*, not a point.
- `food_items` is **globally scoped** (no `user_id`/`pet_id`) — so "*this pet* is free-fed *this food*" has nowhere to live on the food row.
- The pet↔food link exists only transiently, per logged meal (`meals.food_item_id`).

R1 introduces the missing concept: a standing fact joining a pet to a food it always has access to.

---

## 2. Clinical framing (Dr. Chen + research brief)

- **Feeding method is a first-class WSAVA field.** The WSAVA Diet History Form asks meal-vs-free-choice explicitly — implicitly conceding "offered ≠ consumed." Anything Nyx outputs to a vet should read as a *superset* of those fields (research §4, §6).
- **Free-feeding is common and cat-skewed.** ~40–60% of cats are free-fed, dry food disproportionately so (research §1). It is **first-class for single-cat households too** — not an expansion-tier concern (PM listening-check 2026-05-27).
- **The 48hr feline anorexia window is partly *invisible* under free-feeding.** You cannot see "stopped eating" through meal logs when the bowl is always down — "a 30–50% drop in 24h intake can occur without an owner registering a single missed-meal event" (research §5/§6). R1 does **not** recover this signal; it must not pretend to.

### Non-negotiable guardrail (Dr. Chen sign-off is conditional on it)
> **Absence of witnessed intake is NEVER read as "didn't eat," and a free-fed food NEVER produces reassurance.**
> A standing free-fed food means intake is *not directly observed*. Every surface that touches it (vet report, AI Signal, any future intake read) must carry that caveat and must never reassure on the absence of a problem. This is the cross-incident application of the n=1 asymmetry already enforced by the `clinical-guardrails` skill: escalate on presence, never reassure on absence.

---

## 3. The two confidence axes (Data Scientist)

Every intake signal carries **two orthogonal** confidence dimensions. R1 sets up the model so later layers and hardware slot in without rework:

1. **Attribution confidence** — did *this* pet eat it?
   - Single-cat free-fed = **high / near-certain** even when unwitnessed (no other pet *could* have).
   - Multi-cat shared bowl = **low** ("probably had some") — the hardware-deferred case.
2. **Quantity fidelity** — how much? `unknown` / `proxy` / `owner-estimate` / `measured-hardware`.
   - A single-cat free-fed bowl is **attribution-high, quantity-unknown** → "she ate from this bowl today, definitely her; how much/when unknown." That is a **usable correlation input if tagged as such**, with no hardware.

**Engine rule:** a standing free-fed food is **background context**, not point events. It feeds the correlation engine only as a **confounder that caps the confidence tier** (a finding cannot reach *Established* while an unattributed/standing exposure is in-window) and **never produces a clean correlate** on its own. This is exactly the attribution-confidence input B-050's case-crossover detector was already built to *honor* — R1 is the capture side of that contract.

---

## 4. Schema — proposed `feeding_arrangements` table

A new pet↔food join table (because `food_items` is global and cannot carry per-pet facts). Additive, RLS'd, multi-pet-ready by construction.

```sql
CREATE TYPE feeding_method AS ENUM (
  'free_choice',   -- always available / ad libitum / grazing (R1 target)
  'meal_fed'       -- discrete meals (recorded as a standing fact for vet-report completeness)
);

CREATE TABLE feeding_arrangements (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pet_id          UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  food_item_id    UUID NOT NULL REFERENCES food_items(id) ON DELETE CASCADE,
  method          feeding_method NOT NULL DEFAULT 'free_choice',
  -- active window: the standing fact is true between these. NULL ended = currently active.
  active_from     DATE,
  active_until    DATE,
  -- forward-compat for shared-bowl (multi-pet) WITHOUT building it now:
  -- when multi-pet ships, a low-attribution shared arrangement is just is_shared = TRUE.
  is_shared       BOOLEAN NOT NULL DEFAULT FALSE,
  notes           TEXT,
  deleted_at      TIMESTAMPTZ,         -- soft delete (Eng hard constraint)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_feeding_arrangements_pet
  ON feeding_arrangements(pet_id)
  WHERE deleted_at IS NULL;
```

**RLS:** owner-scoped via `pet_id → pets.user_id` (same pattern as every other pet-child table). Read/insert/update/delete gated on the pet belonging to `auth.uid()`.

**Notes / decisions baked in:**
- `method` includes `meal_fed` so the vet report can render a complete feeding-method picture, not just free-choice — but R1's *capture UX* targets `free_choice` (the gap). Whether to surface `meal_fed` capture in R1 UX is a §7 open item (lean: infer meal-fed from the existence of logged meals, don't ask).
- `is_shared` is **present but inert** in R1 (always `FALSE` via UX) — it reserves the multi-pet attribution hook so that sprint is additive, not a reshape.
- **No `quantity`/`intake` fields here** — a standing fact has no per-meal amount by definition. Quantity recovery is deferred (§0).
- Soft delete (`deleted_at`) per the Eng hard constraint — a discontinued arrangement stays for historical correlation context.

### Migration Safety Pre-flight (for the eventual migration PR)
- **Destructive y/n:** `n` — new table + new enum, purely additive.
- **Rollback:** `DROP TABLE feeding_arrangements; DROP TYPE feeding_method;`
- **Backfill:** `N/A` — no existing rows; users declare arrangements going forward.
- Schema change ships in **its own PR** (migration-isolation rule), separate from any UX.

---

## 5. UX — set-once standing fact (Designer + Sam + Jordan)

The interaction must be a **standing fact set once**, never a per-nibble prompt. This is what dissolves the long-standing Designer/Jordan ↔ Dr. Chen/Data conflict — at this scope the whole team agrees.

**Entry point (DECIDED 2026-06-09 — food domain only; see §11):** free-feeding lives **entirely in the food domain — never the pet page** (PM: "food belongs with food; splitting it across the pet page and the food library doesn't make sense").
- **Edit home — food detail screen** (`app/food/[id].tsx`): a single *"Always available for {pet}?"* toggle that creates/ends a `free_choice` arrangement. In a multi-pet household this becomes a per-pet selector ("Always available for: ◉ Theia ◯ Nyx"); single-pet today = implicit.
- **Consolidated view — food library**: an *"Always available"* section pinned above the regular food grid, styled distinctly from meal-loggable tiles (this is a standing fact, not a log-tap). It is the natural top-of-tab anchor when the food library graduates to its own tab.
- **Pet profile screen: nothing.** The pet-level clinical picture is carried by the **vet report** (§6), not the profile screen — Dr. Chen withdrew the "vet wants it at the pet level" objection on that basis.
- Onboarding: not an added step; free-choice can be set post-onboarding from the food the staple was created as.

**Copy register (nyx-voice):** first-person-pet / second-person-owner, no exclamation, no "picky." e.g. label *"Always available"*; helper *"{pet} can graze this throughout the day — we'll note it as free-choice on the vet report."* Never frame absence of logs as a problem.

**Principle compliance:**
- **P1 (zero decisions at moment of event):** R1 adds *no* decision to the quick-log flow. It's a setup affordance, not an event prompt.
- **P2 (confirmation over entry):** toggle, not typing.
- **P5 (empty states):** the food library's *Always available* section, when empty, shows a designed, warm empty state ("Nothing always-out yet — if {pet} grazes a bowl that's down all day, add it here and we'll note it as free-choice for the vet").

**QA / 3am test:** the toggle's tap zone ≥44pt (`hitSlop` if visually smaller). Setting an arrangement must not interfere with the existing 10-second meal-log path.

---

## 6. Vet report rendering (Dr. Chen + Principle 6)

When Step 9 (vet report) renders, free-choice arrangements appear as a **feeding-method line** in the diet-history section, e.g.:

> **Feeding method:** Free-choice (always available) — {Brand} {Product} (dry). Intake not directly observed.

- Reads as a superset of the WSAVA Diet History Form's feeding-method field.
- Carries the **"intake not directly observed"** caveat verbatim — the guardrail in clinical-grade form.
- If/when multi-pet + shared arrangements exist, the report additionally flags **shared/uncontrolled exposure** and marks per-pet attribution **low-confidence** (future; the `is_shared` hook is reserved for it).

This is a Step 9 consumer; R1 ships the *data*, the rendering lands when Step 9 does (note for the Step 9 session).

---

## 6a. History tab rendering (DECIDED 2026-06-09 — Option C; Designer + Sam + Jordan)

The History tab is a flat, filterable list of **discrete events** (meals, vomits…). Free-feeding is a *standing fact* with no events, so it has no native home there — yet it is food and it is intake, so it must be **visible** (PM). The risk the PM named: a free-fed bowl goes *out of sight, out of mind* and is forgotten. Resolution = **Option C**:

- **Persistent ambient strip, pinned to the top of History** — e.g. *"Always available: Hill's w/d · since Jun 2"* — rendered as standing **context, visibly not an event** (quieter treatment, no timestamp, not an editable event row). Present every time the tab opens, so it can't be forgotten — the direct answer to the out-of-sight risk.
- **Boundary markers, inline in the stream** — discrete, *real* events at the lifecycle edges: *"Started free-feeding Hill's w/d" / "Stopped" / "Switched to …"*. These are true discrete facts and belong on a timeline (and give Jordan the trial-relevant context).
- **Passive freshness, NOT a push** (food library + food detail): a *"last confirmed {date}"* line with a one-tap **"still accurate?"** confirm, shown **only when the owner is already there**. No notification. Sam's hard line: never push "is the bowl still down?" — that's the nag that makes her quit apps.
- **Rejected — synthetic grazing events.** Fabricated daily "ate from bowl" rows are per-nibble logging through the back door (Principle 1/2) and a data-integrity violation (Dr. Chen/Data — a meal the owner never witnessed, read as observed intake). Absolute no.

**Data-integrity rationale for freshness (Data Scientist):** a stale arrangement that *actually ended* but was never toggled off is a **false ongoing exposure** — it would keep capping confidence tiers and show wrong intake on the vet report. Passive freshness is the cheapest honest guard. A forgotten-but-accurate arrangement is fine; a forgotten-and-wrong one is the hazard.

**Open (non-blocking, PM-noted):** whether a *months-stale* arrangement earns a single **pull-surfaced** (never push) in-app prompt. Lean = not in v1 (passive freshness + library visibility suffice). Sam/Designer stopped short of endorsing even one prompt.

---

## 7. Open decisions for the build session (not blocking this doc)

1. ~~Entry-point placement~~ **DECIDED 2026-06-09 (§5 / §11):** food domain only — food detail = edit, food library = consolidated view, pet page = nothing.
2. **`meal_fed` capture in R1** — do we let owners declare meal-fed staples too, or infer meal-fed from logged meals and only *capture* free-choice? Lean: capture free-choice only; infer the rest. (Keeps R1 small.)
3. **Active-window UX** — R1 likely just needs an on/off toggle (start = today, end = on toggle-off). Explicit date editing can wait.
4. **Local SQLite + sync** — `feeding_arrangements` is a new synced pet-child table → it must go through the local-first sync queue (`supabase-sync` skill: pet-ownership, last-write-wins, never `INSERT OR REPLACE`). Confirm hydration coverage (B-054) includes it.

---

## 8. Build order (when R1 is greenlit for build) — revised 2026-06-09

1. **PR 1 — schema:** `feeding_arrangements` migration + RLS, on its own (Migration Safety Pre-flight above). Generate TS types.
2. **PR 2 — capture + view UX:** the food-detail standing-fact toggle, the **food-library "Always available" section** (+ empty state), local SQLite table + sync-queue + hydration wiring (§7.4 / B-054). nyx-voice copy pass; Designer + Sam + QA (3am/44pt) sign-off. Pet page untouched.
3. **PR 3 — History rendering (§6a):** ambient strip + boundary markers + passive "last confirmed" freshness. No synthetic events.
4. **PR 4 — engine ingestion (PROMOTED out of "Later" per PM #3, 2026-06-09):** `detection.ts` ingests active `feeding_arrangements` as in-window background exposures so free-fed food is **never silently absent from Signals**. Honor the Biostatistician's reality: a 24/7-constant food is matched-out (no contrast → never a clean correlate); its **window boundaries** are analyzable; it caps tiers as a confounder (shared-bowl teeth deferred to multi-pet). Adversarial review required (clinically/statistically load-bearing).
5. **Later (unchanged):** Option C witnessed-eating log; Step 9 vet-report feeding-method rendering (R1 ships the data).

---

## 9. Persona sign-off (this scoping)

- **Sam ✓✓** — her exact reality; set-once, no nag.
- **Dr. Chen ✓** — *conditional* on the §2 guardrail (absence ≠ didn't eat; never reassure; "intake not directly observed" on the report).
- **Data Scientist ✓** — *conditional* on the §3 engine rule (background confounder, caps tier, never a clean correlate; no denominator from free-fed data).
- **Designer ✓ / Jordan ✓** — at R1 scope (standing fact, no per-nibble logging) the Principle 1/2 friction is resolved.
- **Dir. of Eng ✓** — additive new table is cheap; explicitly *not* folding in the wet-food window generalization (that's the blast-radius item).
- **Product Owner ✓** — B-040 row now points here; this doc is the single source of truth for the R1 slice.
- **Trust & Privacy** — N/A for R1 (no new export/deletion surface; `feeding_arrangements` is covered by the same pet-cascade as every other child table — note it in B-039's deletion cascade when that ships).

---

## 10. Sequencing note (PM roadmap call — flagged, not resolved here)

B-040 is `Now`, but so are B-039 (App Store account-deletion blocker), B-051/B-052 (live AI-Signal quality), and Step 9 (vet report) is the formal current phase. Starting the R1 *build* means one of those slips. This doc makes R1 build-ready; **whether to start it next is the PM's roadmap call** (Dir. of Eng flag, carried from the backlog row).

---

## 11. Design-review decisions (2026-06-09)

Team reconvened on the mockup demo (`docs/mockups/free-feeding-r1-mockup.html`). PM decisions, now binding on this spec:

1. **Free-feeding lives in the food domain, never the pet page** (#1). Food detail = edit; food library = consolidated "Always available" section (styled distinctly; future top-of-tab anchor); pet profile shows nothing; the vet report carries the pet-level clinical picture. Dr. Chen withdrew the "vet wants it at the pet level" objection — satisfied by the report, not the profile screen.
2. **Set-once standing fact confirmed** (#2 listening check ✓): set when the behavior starts, touched again only when it ends/changes. No recurring interaction.
3. **Free-fed food IS a first-class Signals input** (#3) — engine ingestion **promoted into R1 build scope** (§8 PR 4), no longer "Later." Honest ceiling (Biostatistician): an always-available food is a constant → matched-out → rarely if ever a clean correlate; it earns its place via vet-report completeness, window-boundary analyzability, and confounder tier-capping. **Framing rule:** ship as *honesty/completeness*, not "Signals now finds patterns in free-fed food."
4. **History rendering = Option C** (#4; §6a): persistent ambient strip + boundary markers + passive freshness; no synthetic events.
5. **Mockup nit** (#5): the food-library free-choice badge is smaller/quieter (dot + label), not a loud filled chip.

**Team sentiment (gut-check):** aligned on direction, clear-eyed on the ceiling. Strong: Sam, Dr. Chen, Designer/Jordan, PO. Reserved (in a good way): Data Scientist — the washout reality means we must not oversell free-fed correlation. One watch (Dir. of Eng): R1 now touches `detection.ts` (engine ingestion), so it's no longer a pure additive edge feature — still small, but the one place scope grew.
