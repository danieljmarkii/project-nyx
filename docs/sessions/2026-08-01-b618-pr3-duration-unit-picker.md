# B-618 PR 3 — the `days | doses` entry unit picker

**Date:** 2026-08-01

Shipped via **#535** (draft). The entry UI that makes a doses-denominated medication course settable — the first surface where `target_duration_doses` (migration 049, PR 1 / #531; data path, PR 2 / #533) becomes user-settable. No schema, no card yet (the "Dose n of N" card is PR 4).

## What shipped

- **`AddMedicationModal`'s "Set an end" path** now reveals a second visible `days | doses` `ChipGroup` (closed set, two options, `allowDeselect` off, default **days** per D2) that gates the number field's unit suffix and placeholder (`days` / `e.g. 14` ↔ `doses` / `e.g. 28`).
- **`resolveDurationColumns({ mode, unit, value })`** (`lib/medications.ts`) — the one place the course-length controls resolve to the two denomination columns. Both columns branch on the **same** `unit`, so a two-unit write is **unrepresentable** from the form (the client half of the DB's `medications_one_duration_denomination` CHECK, satisfied by construction rather than validated). A blank / zero / ongoing field writes **both null** and never fakes a course — the same rule the pre-B-618 `target_duration_days` path enforced. Extracted so the two invariants are a unit test, not inline modal logic (the module's house convention).
- **Edit preserves the stored unit:** a doses course opens with the doses chip lit + its dose count; a days course with days + its day count; an ongoing course defaults to days (the unit the owner meets if they later pick "Set an end"). Switching units **clears** the number — converts nothing, the owner restates it (§5) — so "14 days" is never silently reread as "14 doses" (a real dosing-error class). Re-tapping the already-lit chip does not wipe an in-progress value (the `opt.value !== durationUnit` guard is load-bearing: with `allowDeselect` off, `ChipGroup` fires `onChange` with the same value on a re-tap).
- **`formValues()`** now calls `resolveDurationColumns` and forwards its two columns; the PR 2 hardcoded-`null` for doses is gone. The `medications_one_duration_denomination` invariant that PR 2 held "because the form only offered days" is now a real mutual exclusion in the UI.
- **Tests:** `resolveDurationColumns` — days-only, doses-only, ongoing-nulls-both, blank/zero/leading-zero, and a **mode × unit × value cross-product** asserting both denominations are never set together (the test that fails first if a refactor ever writes the two columns independently).

## The one design call: the two chip rows read as one group

Code-review (ship-ready, no BUG/ANTI-PATTERN) raised one NIT it deferred to the Designer pass: the `days | doses` row sat directly under the "Course length" section label with no label of its own, so the two chip rows (`[Ongoing][Set an end]` then `[Days][Doses]`) could read as one wrapping group.

The concrete cause was spacing, not a missing label: the unit chips had `marginBottom: space1`, so with the form's `gap: space1` between children they sat **8px** from the mode toggle above but **16px** from the number field below — whitespace grouped them **upward** with the mode chips instead of **downward** with the field they govern. Designer fix: move the extra spacing above the row (`marginTop: space1`), so the unit chips group with the field (`[Days][Doses] → [14] days` reads as one control) and separate from the mode toggle. A label was deliberately *not* added — the revealed detail (unit chips + number field) carries no sub-label exactly as the pre-existing number field never did, so a label would break the section's internal consistency and over-weight a binary. Style-only follow-up commit (e99ae0c).

## Falsification attempts

Per the DoD's "state the counterexample you tried." Spec §9's adversarial posture makes the `adversarial-reviewer` subagent optional here — pure entry-form UI/validation, no detection/escalation logic touched.

- *Tried to write both denominations from the form* — impossible by construction: `resolveDurationColumns` computes one number `n` and lands it in `target_duration_days` **or** `target_duration_doses` on the same `unit` branch, so both-set cannot arise from any (mode, unit, value). The cross-product property test enumerates it and asserts `!(days != null && doses != null)`.
- *Tried to fake a zero-length course* — `'0'`/`'00'` parse to 0, `0 > 0` is false, and `mode !== 'fixed'` short-circuits — all three write both null, so "Set an end" with a blank/zero field saves ongoing, never a 0-day/0-dose course.
- *Tried a silent unit conversion* — switching the unit chip clears the field, so a 14 entered as days can never be saved as 14 doses; the owner must restate. The clear-guard's equality check keeps a same-chip re-tap from wiping a mid-entry value.

## DoD

- **AC (§8):** AC-6 (days/ongoing regress unchanged — seed is a superset, days stays default; the card `profile.tsx` is untouched) ✓ · AC-7 (edit days → days lit + value intact; switch to doses → field cleared, save writes doses + nulls days) ✓ · "write exactly one denomination" ✓ (cross-product test). The card-side items (AC-1–5) are PR 4's.
- **Types/tests:** `tsc --noEmit` clean; full jest green (169 suites / **3807** tests, +6). No new secret, no new reader, no new grant.
- **No completion/stop language** added anywhere — D7 is PR 4's card enforcement point.
- **Persona sign-off:** Designer ✓ (principle 3 — a setup decision, not moment-of-event; B-146 closed-set chip rule; the chip-grouping spacing call above; nyx-voice on the `days`/`doses` suffix) — Engineer ✓ (one extracted predicate, DB-CHECK-by-construction, house testability convention) — code-reviewer ✓ (ship-ready) — Data/Dr. Chen N/A (no clinical/statistical logic).

## Residuals

None new. **Next: PR 4** — the "Dose {n} of {target}" card (§6): `n = dosesTowardTarget(tally)`, bar encodes `n / target`, past-target disclosed not hidden, and **D7's real enforcement point** (reaching the target renders no completion/stop language). Gated on `pm-feature-review` + the §8 QA matrix + an on-device pass. B-441 (the days-path day-math fix, D4's soft pair) and B-621 (dose→regimen attribution's UTC-vs-local compare) remain open, untouched here.
