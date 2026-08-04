# Medication history PR 1 — the shared course derivation (`lib/medicationHistory.ts`)

**Date:** 2026-08-04 · **shipped via #585**

## What shipped

**PR 1 of the B-140 (extended) track — the one course-grain derivation all four surfaces will read.** No UI change; pure logic + tests.

1. **`lib/medicationHistory.ts` (new) — `deriveMedicationCourses(input)`.** Folds a pet's `medications` rows + dose rows into `MedicationCourse[]`: one course per regimen (enriched — start/end dates, `dosesPerDay`/schedule/route, `plannedDoses`, `runDays`, the two end registers) plus one per drug whose doses attach to no regimen (dose-derived — first/last dose, count, `medicationItemId` for the surface to name). Pure, **clock-free**, deterministic — a function of `(regimens, doses, timeZone)` only, no `Date.now()`.
2. **`lib/medications.ts` refactor.** Extracted **`attributeDoses`** — the one attribution pass — returning `{ tallies, grouped, unattributed }`; `attributeDosesToRegimens` now delegates to it (`return attributeDoses(...).tallies`), so its returned tallies are **byte-for-byte** what they always were (all existing callers + the full 4283-test suite confirm it). Added **`tallyDoses`** (the shared adherence bucketer). Switched its `./utils` import to `./utils.ts` so the whole chain resolves under Deno.
3. **Tests** — `lib/medicationHistory.test.ts` (new) + a focused block appended to `lib/medications.test.ts`.

## The load-bearing design decision

The spec (§3/§5) forbids a rival attribution/count definition (H4 — the diet-trial §5.3 lesson). The subtlety: the report's `buildMedicationAdherence` counts a regimen's doses by **explicit `medicationId` only**, but the client's `attributeDosesToRegimens` **also** attributes unlinked doses by **item+window**. Since the spec mandates reusing `attributeDosesToRegimens`, the dose-derived (orphan) courses had to be the **exact complement** of *that* pass — otherwise an item+window dose would count in a regimen tally **and** as an orphan (a double-count).

The only honest way to get that complement without a second attribution definition is to surface the leftovers from the **same** pass. Hence `attributeDoses` emits `tallies` (regimen counts → the H4 count via `dosesTowardTarget`), `grouped` (attributed doses per regimen → first/last dose), and `unattributed` (the orphans). One attribution definition; the derivation reads it, never re-derives it.

**H1 (no ending from silence)** is made *unrepresentable-otherwise* by the `end` union type: `{ kind: 'ended', … }` is constructed only from `status ∈ {completed, stopped}`; everything else is `{ kind: 'none', lastDoseIso }`. A dose-derived course has no regimen/status, so it can never carry an ending — by construction.

## What broke (and how)

Two test fixtures failed on the first run — and it was the *fixtures*, not the derivation. I'd modelled a 14-day, 2×/day ended course as "26 daily doses starting Mar 3", which spilled 13 doses past the course's `ended_at` (Mar 16). That exposed a real, **pre-existing** boundary in `attributeDoses`' item+window match: a dose on the exact `ended_at` date (any time of day) is excluded (`occurred_at > ended_at`, lexicographically — a full timestamp `> 'YYYY-MM-DD'`). I deliberately did **not** change that shared predicate (it would move the profile-card / med-strip counts and needs its own review); instead the fixtures now log an ended course's doses as **linked** (the realistic B-153 path, which is authoritative and bypasses the window). Documented the inherited boundary in the test helper.

## Adversarial review — PASS

`adversarial-reviewer` ran the mandated counterexamples (spec §5 / PR-plan). Falsification attempts, all held:
- `status='active'`/`'paused'`/unknown token **with `ended_at` set** → never `end.kind:'ended'`; only owner `completed`/`stopped` does; orphan courses can't end (H1 held).
- dose linked to an absent regimen / unlinked dose past `ended_at` / null-item dose / soft-deleted dose → each lands in **exactly one** of regimen-tally/orphan, none double-counted or dropped (`grouped ⊍ unattributed = live`; partition held).
- `dosesLogged === dosesTowardTarget(attributeDosesToRegimens(...).get(id))` byte-for-byte, incl. a garbage-`occurred_at` case (H4 held).
- `runDays` zone-stable across UTC/LA/Auckland/Kiritimati; two-no-dose sort has no `-Infinity − -Infinity` NaN and is order-independent (deterministic).

Its five findings are all **downstream cautions for PRs 2/3/5, not PR-1 defects** — carried into the PR body. The one worth repeating: an ended course's count / `lastDoseDay` can legitimately **post-date `ended_at`** via an authoritative B-153 link (an owner who kept logging after marking it complete); `runDays` is unaffected (DATE-based). Documented inline at the regimen-course construction so **PR 5's mandatory `vet-report-cold-read`** confirms the lifetime table's date-range and count read coherently.

## Verification

`tsc` clean · new suites 246/246 · **full jest 4283/4283** (refactor broke no consumer) · green under the non-UTC CI zones (UTC+14 / +12:45 / −10, B-514) · **`deno check`** on the module + its import chain (real Deno-compat for PR 5's `generate-report` import). CI on #585: all three checks green. Merged `origin/main` (siblings #583/#584) cleanly before wrap — disjoint files.

## Residuals / next

PRs 2/3/4 are **unblocked and mutually parallel-safe** (disjoint files: `profile.tsx` / `medication/[id].tsx` / `rundown.*`). PR 5 stays **D2-gated** (the lifetime-table PM ruling — the standing PM action item) and rides the B-494 `generate-report` redeploy, never its own.
