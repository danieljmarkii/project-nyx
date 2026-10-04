# PR-50 — Noticed stops reading its beta flag (CUL-876, step 2)

**Date:** 2026-10-04
**One thing:** S3 L1 — Retiring a flag takes three moves: flip the row, remove the code, delete the row · check: pending

This was a dispatched session (Out of beta — Noticed, Design v2, History v2, the trial screen · PR-50). It shipped via #1066. Step 2 of CUL-876 is the only work here. Step 1, the `app_config` flip, is the PM's. Step 3, deleting the row, is PR-61's migration. Neither was run.

## What shipped

**The flag.**
- `'daily_look'` is gone from `ALLOWLIST_FLAG_KEYS` and `ALLOWLIST_FLAGS_UNSET`. The `lib/appConfig.ts` header now lists it as the sixth graduated key.
- Its `BETA_REGISTRY` row is gone, so the early-access shelf no longer carries a Noticed card. `app/settings/beta.tsx` lost the `Eye` case.

**The gate.**
- `lookCardLive` (`lib/lookCard.ts`) now takes `species` only. Every surface still calls it, so the cat-and-dog rule (CUL-864) has one home. The surfaces are:
  - Home's `LookCard` and the design_v2 `LookHeader`;
  - `TodayZone`'s nudge and `TodayCard`'s quiet line;
  - Patterns;
  - History v2's `PinnedRow`;
  - the shelf's Design v2 hint.
- `LookCard` had restated the predicate inline. It now calls the shared one, per the code review (C-34).

**The report.** *Include your Noticed notes* is always on screen, and the build sends the switch's state. CUL-1464's hidden-switch-sends-false rule went with the only thing that could hide the switch.

**Tests.**
- Flag-off cases became species-`other` cases where one did not already exist. Otherwise they were deleted, since they tested only the removed gate.
- The shelf and settings tests use `design_v2` as the non-widget beta.
- `lib/appConfig.test.ts` now pins the retirement: an `app_config` row named `daily_look` is ignored.

**Docs.** The CLAUDE.md status line and Read-These row (CLAUDE.md is a net shrink, so the budget guard holds), STATUS.md's Home v2 row, and the spec header (v1.4, GA 2026-10-04).

## Decisions

**The report's notes switch is not species-gated.** Gating it means reading the report pet's species out of the pet list. While that list is still loading, the gate would read `null`, hide the switch and send `false`. That would quietly drop a cat owner's notes from a report they asked for, which is the "what does `null` cost this caller" trap (C-12). For a species-`other` pet the switch does nothing: the server prints the appendix only when look rows exist. A visible, harmless switch beats a silent drop. This is stated in the PR body.

**The "device pass Done" criterion is superseded.** The PM skipped the sitting on 2026-10-04 (CUL-1529, Canceled) and is testing in production. It is recorded in the DoD as superseded, not as a failure.

## Found

**CUL-1589, filed.** With Noticed live, Patterns runs its full local load twice per visit. `load` is keyed on `trialNotEating`, and that value flips when the trial loader answers a beat after mount. This was measured by adding `expect(A.getSymptomCounts).toHaveBeenCalledTimes(1)` to the Noticed-live case in `app/insights/index.loads.test.tsx`: it went red at 2 calls. The double load predates this PR, but it used to happen only on flag-on accounts, and GA widens it to every cat and dog. It was not fixed here, to keep the removal PR tight for PR-51 → PR-53 on the same hotspot files.

## DoD

- **AC.** The issue's acceptance criteria:
  - The device pass is superseded (CUL-1529).
  - N-4b, N-5 and N-3b are merged ✓.
  - `npm test` is green: 618 suites, 14,169 passed ✓.
  - No flag-off branch survives (grep) ✓.
  - The wipe list is unchanged ✓.
  - The runtime is named: OTA, since the change is JS-only ✓.
- **Anti-patterns:** none introduced. No new colours, inline styles or `any`, and no new copy.
- **Types and tests:** `tsc` is clean. The full jest run and the pre-push hook passed.
- **Secrets:** none.
- **Personas:** Engineer ✓ (the one predicate kept; no dead code); Designer ✓ (Principle 5, so species `other` still sees the shipped nudge rather than a silence); Trust & Safety ✓ (the report switch is visible with an explicit boolean; the share-link exclusion is untouched); Product Owner ✓ (CUL-1589 filed). Data N/A. Dr. Chen N/A.
- **Adversarial review:** N/A. A rollout gate is removed, and no detection, clinical or statistical logic changed. `code-reviewer` called it ship-ready with no blockers. Of its three nits, two were fixed and one (the species gate on the report switch) is answered above.
- **Future self:** no new pattern. This is the CUL-547 / CUL-548 / CUL-905 retirement shape.

## Teach

A beta flag is a switch the app reads from a server table, so the PM could turn Noticed on for one account without shipping a new app. Retiring one takes three moves, in a fixed order. First, flip the row to "on for everyone". Second, delete the code that reads it, which is this PR. Third, delete the row itself. The order matters because phones that never update keep running old code, and old code still asks the row. Delete the row first and an old build asks a question nobody answers, so it fails closed and Noticed vanishes for those owners. One real line from today's diff, in `lib/lookCard.ts`:

```ts
return lookSpeciesOf(params.species) !== null;
```

Yesterday this line was `params.eligible && params.optedIn && lookSpeciesOf(params.species) !== null`. The two words that left were the flag and the opt-in. What stayed is the one rule the product still wants: a cat or a dog.

Check question: once this PR merges, why must the `app_config` row for `daily_look` still not be deleted until PR-61?
