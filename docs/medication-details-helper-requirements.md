# Medication-Details Helper Copy + Popular-Name Examples — Requirements

**Version:** 1.0 (DRAFT) | Created: 2026-06-22 | Backlog: **B-160**
**Status:** Spec drafted, awaiting PM ratification. No code shipped in the spec session. Parent: B-117 (`docs/nyx-medication-logging-requirements.md`). This is a small "quick win" — the spec is proportionate to it, but the one clinical-safety catch in §3 is load-bearing and must not be skipped at build.

---

## 1. Problem

The manual medication-details path is the screen an owner lands on when the label photo can't be read (offline, blurry, compounded drug) or when they choose "Enter manually" — `app/medication-capture.tsx`, `step='edit'` (Header title **"Medication details"**) and its sibling `step='confirm'`. Both ask the owner to free-type the drug **name** and **strength**.

Two problems with raw free-text here, both surfaced by the medication QA pass (the B-160 row):

1. **Drug names are easy to mis-type.** "Metronidazole", "oclacitinib", "levetiracetam" — long, unfamiliar spellings. A misspelled name fractures the organically-built `medication_items` library, weakens the PR 9 Signal confounder key (which keys on a stable `medication_item_id`/name), and reads sloppy on the vet report. It also re-introduces the exact free-text canonicalization mess B-052 is fighting for proteins.
2. **Strength is the single most error-prone field, and the most dangerous to get wrong.** A transposed "5 mg → 50 mg" is a 10× dosing error. This is precisely why §6.5 already gates save behind a deliberate "the strength matches the label" tick. The free-text field gives the owner no scaffolding for *how* to write a strength (unit? format?), so it stays the field most likely to be entered wrong.

The fix is two cheap, calm levers: **example chips for the drug name** (a typing shortcut that cuts misspellings) and **richer helper copy** on the fields (strength especially). Neither adds a decision to the per-dose log — this is the configure-once setup surface (parent spec §3), where a little guidance is appropriate.

---

## 2. Scope

| In scope | Out of scope |
|---|---|
| Tappable **drug-name** example chips on the medication-details screen (`step='edit'` + `step='confirm'`). | Strength **value** chips of any kind (see §3 — clinically forbidden). |
| Richer per-field **helper copy** (name, brand, strength), nyx-voice. | A curated/centralized drug **catalog** or pre-seeded library rows (that's parent S5, an explicit future refactor). |
| A single curated `COMMON_MEDICATIONS` source in `lib/medications.ts` (+ unit test). | AI-extracting schedule/frequency (B-159), Ongoing-vs-fixed framing (B-158), combo-logging (B-156) — sibling rows, separate work. |
| **(Recommended)** the same name chips + helper copy on the regimen modal's "Medication" field (`AddMedicationModal.tsx`), since it's the identical free-text field. PM scope toggle — see §6 D5. | Owner-set `is_critical` (parent §10 / S2); form/route already have chips. |

---

## 3. The one clinical catch — strength gets helper copy, NEVER value chips

> **Read of the ticket that is WRONG:** "cut error-prone free-text (strength especially)" → add tappable strength chips (5 mg / 10 mg / 20 mg …).
> **Why it's wrong (Dr. Chen / clinical-guardrails):** A given drug ships in many strengths (prednisolone 1/5/20 mg; gabapentin 100/300/400 mg). A tappable strength value invites the owner to pick *a* strength rather than read *their* label — and tapping a chip *feels like confirmation*, which directly erodes the §6.5 dose-confirm gate whose whole purpose is to force a deliberate check of strength against the physical label. A name typo is a data-hygiene problem; a wrong strength is a 10× dosing hazard. They are not the same class of error and must not get the same affordance.

**Resolution (no PM call needed — it falls straight out of §6.5):**
- **Drug NAME** → example chips. A name is a stable identifier; cleaner spelling helps the library, the Signal key, and the vet report. ✓
- **STRENGTH** → **no value chips, ever.** The "strength especially" lever is *format helper copy* — guide the owner to copy the printed value exactly, with its unit — plus the existing §6.5 gate. The gate is untouched by this work.

This asymmetry is the heart of B-160. Everything else is copy and a chip row.

---

## 4. Design

### 4.1 The curated list — `COMMON_MEDICATIONS` (single source, `lib/medications.ts`)

Pure data, no imports (keeps the module I/O-free and unit-testable, like `MEDICATION_FORM_OPTIONS`). The chip renders **only `name`**; `species` drives ordering so a cat owner sees feline-relevant drugs first. It is a **union**, never a species filter — a cross-species drug is never hidden.

```ts
// A typing shortcut, NOT a catalog. Tapping a chip fills the NAME text field only;
// it creates no medication_items row, sets no medication_item_id, and fills no
// strength/form/route. The library is still built organically (parent §D2).
// `name` = the owner-recognizable name (generic where owners know it, brand where
// that's what's on the bottle). `critical` is forward-looking only (see §7) and is
// NOT rendered. Final list is a Dr. Chen trim/extend at build (S1 below).
export interface CommonMedication {
  name: string;
  species: 'dog' | 'cat' | 'both';
  critical?: boolean; // reuse candidate for the PR-9 is_critical match; not shown
}
```

**Recommended starter set** (companion-animal, ~owner-frequency order — Dr. Chen to ratify/trim):

| Name (as owners say it) | Generic / brand | Species | Class | critical |
|---|---|---|---|---|
| Apoquel | oclacitinib (brand) | both | allergy / itch | |
| Prednisolone | generic | both | steroid | |
| Gabapentin | generic | both | pain / anxiety | |
| Metronidazole | generic (Flagyl) | both | GI / antibiotic | |
| Clavamox | amox-clav (brand) | both | antibiotic | |
| Carprofen | generic (Rimadyl) | dog | NSAID | |
| Meloxicam | generic (Metacam) | both | NSAID | |
| Cerenia | maropitant (brand) | both | anti-nausea | |
| Mirtazapine | generic | cat | appetite stimulant | |
| Methimazole | generic (Felimazole) | cat | hyperthyroid | |
| Gabapentin / Trazodone | generic | dog | anxiety / sedation | |
| Fluoxetine | generic (Prozac) | both | behavior | |
| Insulin | — | both | diabetes | ✓ |
| Furosemide | generic (Lasix) | both | cardiac / diuretic | ✓ |
| Pimobendan | generic (Vetmedin) | dog | cardiac | ✓ |
| Levetiracetam | generic (Keppra) | both | anti-seizure | ✓ |

The **chip row shows ~8–10** (the field still accepts free text — chips are shortcuts, never a closed list). Recommend a horizontal scroll row (reuse the existing `ChipScroll` pattern from `medication-capture.tsx`) under the name input, **shown only when the name field is empty** — so the happy AI-confirm path (name pre-filled) never shows clutter, and the chips help exactly the manual/empty case they're for.

A small selector keeps ordering testable and the screen dumb:

```ts
// Species-first ordering; 'both' drugs always included. Pure → unit-tested.
export function commonMedicationsForSpecies(
  species: 'dog' | 'cat' | null | undefined,
): CommonMedication[] { /* species matches first, then 'both', stable order */ }
```

### 4.2 Helper copy (nyx-voice — plain, calm, no exclamation marks)

| Field | Where | Copy |
|---|---|---|
| Medication name | tiny line above the chip row (empty state only) | `Tap a common one below, or type the name from the label.` |
| Brand (optional) | placeholder (keep) + no helper line | `e.g. the brand on the label` (unchanged) |
| **Strength** | helper line under the input, shown **even when empty** (it's format guidance) | `Copy the strength exactly as printed — include the unit, like 5 mg or 16 mg/mL.` |

The strength helper sits alongside (does not replace) the existing §6.5 `StrengthGate` hint ("Worth a quick check — the strength is the one thing worth getting exactly right.") — one is *format* guidance (always), the other is the *confirm* prompt (only when a value is present). Both stay. No copy on this screen asserts wellness or uses `!` (nyx-voice Patterns 4/6); strength copy is format-not-value (§3).

### 4.3 Behavior / wiring (Engineer)

- Tapping a name chip sets the **name** field's text and nothing else. It must route through the **same change handler** the keyboard uses, so existing invariants hold:
  - In `medication-capture.tsx`: sets `genericName` (the §6.5 strength gate keys on *strength*, so a name chip never touches `strengthConfirmed` — correct by construction).
  - In `AddMedicationModal.tsx`: must call `onChangeDrugName(name)` (NOT a bare `setDrugName`), so the **unlink-on-edit** rule still fires — a free-text chip name must clear any stale `medication_item_id`, exactly as typing does (`buildRegimenPayload` trusts this).
- The chip fill is a plain text set — the owner can still edit/overwrite it. Chips are a shortcut, not a constraint.
- No new enum, no schema, no migration. `COMMON_MEDICATIONS` is the only new data; the rest is copy + one reused chip row.

---

## 5. Safety / boundary invariants this work must preserve

1. **§6.5 dose-confirm gate is untouched.** No strength value chips; name chips never affect `strengthConfirmed`. (§3.)
2. **No back-door catalog.** A name chip fills a text field only — it creates no `medication_items` row, sets no `medication_item_id`, links nothing. The library stays organically built (parent §D2); centralized catalog remains the explicit future refactor (S5). This also keeps the list free of the B-122 PII surface — it's a fixed product-name list, never owner/pet data.
3. **A name list is a spelling aid, not clinical advice.** It lists names of drugs a pet may *already* be prescribed; it recommends no drug and no dose. State this in the source comment so it isn't mistaken for a formulary.
4. **nyx-voice holds on all new copy** — no `!`, plain language, no reassurance (this is setup copy, but the bar is the same).

---

## 6. Open sub-decisions (build-time; recommend-and-proceed, PM/expert to confirm)

| # | Question | Recommendation | Owner |
|---|---|---|---|
| S1 | Final `COMMON_MEDICATIONS` contents + ordering. | Ship the §4.1 starter set; Dr. Chen trims/extends. Keep it ≤~16 so the source stays curated, not a formulary. | Dr. Chen |
| S2 | Separate **brand** example chips? | **No.** The name field already accepts a generic *or* a brand (existing placeholder), and the chips use owner-recognizable names, so they cover the "drug/brand" recognition need. A brand can imply a specific strength — a chip for it would brush against §3. | Designer + Dr. Chen |
| S3 | Generic-vs-brand field semantics — tapping "Apoquel" lands a brand in the `generic_name` field. | Accept for v1 (the field is functionally "what it's called", and consistency is what the key needs). A future refinement could fill *both* fields via a generic↔brand map — out of scope here. | Data Scientist |
| S4 | When to show the name chip row. | **When the name field is empty** (so the AI-confirm happy path stays clean). | Designer |
| S5 | Surface coverage — D5 below. | Include the regimen modal in the same PR (identical field, shared source). | PM |

**D5 (surface coverage):** the backlog row names "the medication-details screen," which is `medication-capture.tsx`. The *same* error-prone free-text name field also lives in `AddMedicationModal.tsx` ("Medication", placeholder "e.g. Prednisolone"). **Recommend including it in the same PR** — it reuses `COMMON_MEDICATIONS` and the chip row verbatim, and leaving one entry point inconsistent is worse than the small extra diff. Flagged as a PM toggle in case you'd rather keep B-160 strictly to the capture screen and split the modal to a fast-follow.

---

## 7. Forward-looking efficiency (not a dependency)

The curated `COMMON_MEDICATIONS` list (esp. the `critical` flag) is a **reusable asset for parent S2 / PR 9** — the deterministic `is_critical` curated-match that gates the missed-critical-dose escalation. B-160 should *define* the data so PR 9 can consume it; B-160 does **not** itself wire any escalation (that stays clinical, derived, adversarial-reviewed at PR 9). Noting the synergy so the list is designed once, not twice.

---

## 8. Build plan

**One PR (small, mostly copy + data):**
1. `COMMON_MEDICATIONS` + `commonMedicationsForSpecies` in `lib/medications.ts` + unit tests (data contract: no dupes, species union never drops a 'both' drug, stable ordering) — **required, it's a shared `lib/` util (DoD)**.
2. A name-suggestion chip row (reuse `ChipScroll`) + the §4.2 helper copy, wired into `medication-capture.tsx` `step='edit'` and `step='confirm'` (name field empty-state only; strength helper always).
3. **(S5, recommended)** the same in `AddMedicationModal.tsx` via `onChangeDrugName`.

No schema, no migration, no Edge Function. Can split (2) and (3) if the PM prefers.

**DoD reviewers:** Designer (calm, shortcut-not-quiz, Principle 1 N/A on setup) · **Dr. Chen + clinical-guardrails** (the §3 strength-no-chips decision — the load-bearing sign-off) · QA (AC below). **Adversarial-reviewer: N/A** — no statistical/clinical *logic* is added (the clinical judgment is the §3 decision, reviewed by Dr. Chen, not a falsifiable engine). `tests` = the curated-list contract.

---

## 9. Acceptance criteria (QA — before merge)

- Manual-entry path: the drug-name field shows a row of common-medication chips when empty; tapping one fills the name and the owner can still edit it.
- The chip row leads with the **active pet's species** (a cat → methimazole/mirtazapine surface; a dog → carprofen/pimobendan), and never hides a `both` drug.
- Chips disappear once the name field has a value (AI-confirm happy path shows none).
- **Strength shows format helper copy and NO value chips.** Entering a strength still requires the §6.5 tick to save; tapping a name chip does **not** open that gate. (The single most important check.)
- In the regimen modal (if S5 included), tapping a name chip clears any linked library item (free-text name ships no stale `medication_item_id`).
- No new copy uses `!`; nothing asserts wellness.
- `lib/medications.ts` unit tests pass; `tsc` clean; no theme-token / hardcoded-value regressions.

---

## 10. References

- Backlog: B-160 (this), siblings B-154/B-155/B-156/B-158/B-159 (med-QA pass), parent B-117.
- Parent spec: `docs/nyx-medication-logging-requirements.md` (§3 configure-once model, §6.5 dose-confirm gate, §D2 organic library, §10/S2 is_critical, S5 centralized-catalog refactor).
- Screens/data: `app/medication-capture.tsx` (`step='edit'`/`'confirm'`, `StrengthGate`, `ChipScroll`), `components/profile/AddMedicationModal.tsx` (`onChangeDrugName`), `lib/medications.ts` (`MEDICATION_FORM_OPTIONS`, `initialStrengthConfirmed`, `canSaveMedicationCapture`).
- Skills: `clinical-guardrails` (the §3 catch), `nyx-voice` (Patterns 4/5/6 — copy register). Canonicalization context: B-052.
