# B-618 PR 2 — the `dosesTowardTarget` predicate + the doses-course data path

**Date:** 2026-08-01

Shipped via **#533** (merged to `main`). The client data path for a fixed medication course denominated in **doses** (migration 049, PR 1 / #531), plus the single count predicate every future consumer reads. No UI — the `days | doses` entry chip is PR 3, the "Dose n of N" card is PR 4.

## What shipped

- **`dosesTowardTarget(tally) = tally.given + tally.partial`** (`lib/medications.ts`) — the one exported definition of "does this administration advance the count" (D6). It means *therapy delivered* (D1), matching the vet report's shipped `administered = given + partial`; `refused` / `missed` / `unrated` (and the derived `unconfirmed`, stored as `unrated`) never advance it — they stay visible through `regimenFlagLine`.
- **Local mirror:** `MEDICATION_SCHEMA_SQL` gained `target_duration_doses INTEGER` (B-424's schema-constant rule), plus a `COLUMN_UPGRADES` ALTER in `lib/localSchema.ts` so already-installed devices get the column (`CREATE TABLE IF NOT EXISTS` can't add a column to an existing table).
- **Sync, both directions:** push (`LocalMedication` / `RemoteMedicationUpsert` / `medicationRowToRemote`) and pull (`lib/sync.ts` `RemoteMedication` type + `hydrateMedications` select / insert / conflict-update / params). A doses course round-trips device↔server.
- **Write path:** `Regimen` / `RegimenFormValues` / `RegimenWritePayload` / `buildRegimenPayload` carry the field. The modal's `formValues()` writes it `null` for now (PR 3 adds the unit chip), which keeps the DB's `medications_one_duration_denomination` CHECK satisfied by construction — the form cannot set both denominations until PR 3 makes them mutually exclusive in the UI.
- **Tests:** §4's four required tests + three data-path tests (schema round-trip, mapper forwarding, payload forwarding).

## The one real decision: two count definitions that must stay apart

`dosesTowardTarget` and `computeRegimenCompliance.administeredDoses` count the same tally and **deliberately disagree**. The dose counter is `given + partial` (therapy delivered toward the bottle — a partial dose still got drug into the patient, so it counts against the 28). The compliance numerator is `given` only, because it feeds an adherence *rate* and a partial is not a cleanly-given dose. The two answer different questions — "how far through the course?" vs "how reliably is it being given?" — and reconciling them would corrupt one of the two.

The hazard is a future well-meaning "consistency fix." So the gap is pinned rather than left to a comment: the last §4 test asserts `dosesTowardTarget(t) - compliance.administeredDoses === t.partial` across a spread of tallies, so any edit that makes the two agree trips a red test whose comment points back at the predicate's docstring. This is the diet-trial §5.3 lesson applied preemptively — there, a second contradictory off-diet definition shipped and had to be re-based; here there is exactly one predicate (D6) and a test that defends the deliberate divergence from being "corrected" into a bug.

## Why touch `profile.tsx` in a "no UI" PR

§9 lists the `Regimen` type for PR 2. `Regimen` is shared (defined in `AddMedicationModal`, consumed by `profile.tsx`), so making it honest required two one-line data-path touches outside the modal: `loadMedications` selects the new column, and `openEditRegimen` passes it through the edit literal. Neither renders anything — no card line, no chip. The card render ("Dose n of N") and the entry chip are PR 4 / PR 3. Called out in the PR body so the scope creep is visible and bounded.

## The count follows the record (soft-delete)

A soft-deleted dose event already falls out of the tally at the query layer — `attributeDosesToRegimens` skips any dose whose parent event carries a `deleted_at` — so deleting a mislogged dose correctly decrements the count. §4 asks this be asserted rather than assumed, so the suite builds a three-dose regimen with one soft-deleted dose end-to-end through `attributeDosesToRegimens` → `dosesTowardTarget` and shows 2, then flips the same doses all-live and shows 3, proving the decrement is the deletion's doing and not a fixed cap.

## Falsification attempts

Per the DoD's "state the counterexample you tried." Spec §9's adversarial posture makes the `adversarial-reviewer` subagent optional here — the predicate is a deterministic one-line sum with exhaustive property tests, no statistical engine touched.

- *Tried the refused-tail course that must never read complete* — a 28-dose course where the last doses are all refused. `dosesTowardTarget` counts only `given + partial`, so the refused tail advances it by nothing; a refused course can never reach its target. Covered by the "never advances on refused / missed / unrated" test. (D7 — that reaching the target renders no completion language — is PR 4's to enforce at the card; the schema/predicate layer can only guarantee nothing here sets `status`.)
- *Tried to overrun the bar* — could `given + partial` ever exceed the doses actually logged and render "Dose 30 of 28" from thin air? The property test enumerates the full 4⁵ bucket cross-product and asserts `dosesTowardTarget(t) ≤ loggedDoses` (both the hand-summed total and `computeRegimenCompliance.loggedDoses`), so the count can never exceed what was logged. Past-target overrun from *extra logged doses* is real and is disclosed, not hidden — that's PR 4's "cap the bar, disclose the extras" (§6), out of scope here.
- *The taper* — a variable-frequency schedule where a dose total still beats days but the projection needs per-phase frequency. Explicitly out of scope (§2); named so PR 4 / B-394 inherit it rather than rediscover it.

## Merge notes

Branch was one commit behind `main` at wrap (sibling **#530**, B-616 PR 4). Merged `main` in; the only shared file was `app/(tabs)/profile.tsx` and it auto-merged clean (my `loadMedications`/`openEditRegimen` edits and #530's trial-exposures additions are in different regions). Full suite green on the merged tree: **169 suites / 3801 tests**, `tsc --noEmit` clean.

## Residuals

None new. No new secret, no new reader, no new grant. **Next: PR 3** — the `days | doses` entry `ChipGroup` + edit-preserves-unit (§5), the first surface where `targetDurationDoses` becomes user-settable, and where the "write exactly one denomination" rule moves from "the form only offers days" to a real mutual-exclusion in the UI. Then **PR 4**, the card (and D7's real enforcement point). B-621 (dose→regimen attribution's UTC-vs-local compare) remains open and is untouched here.
