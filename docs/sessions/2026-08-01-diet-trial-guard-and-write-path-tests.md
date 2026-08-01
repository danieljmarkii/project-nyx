# Diet-trial day-math guard gap + write-path test coverage (B-517, B-544)

**Date:** 2026-08-01

Two test/guard-hardening follow-ups from the B-417 pre-ship review, closed
together because they share a subject (the diet-trial surfaces) and neither
touches runtime behaviour. Shipped via **#546** (draft).

## B-517 — the day-math guard did not cover the fourth consumer it was written to catch

`lib/dietTrialDayMath.guard.test.ts` enforces one day-math oracle across the trial
surfaces via a consumer list plus a `DAY_DIVISION` regex. `lib/dietTrialOutcomeFacts.ts`
was the fourth path B-421 existed to catch — and the one it missed. It declared its
own `MS_PER_DAY` and its own `index * MS_PER_DAY` inverse (`dayKeyFromIndex`), which
is **the exact site of B-417 PR 6's day-key inversion bug** (inverting the
UTC-anchored index with local getters, which lands on the previous day at negative
offsets and pushed the before/during windows toward "it improved"). That file was
never on the guard's list, and its multiplication evaded `DAY_DIVISION`, which
matches division only — so review caught the bug, not the guard, and nothing stopped
a fifth.

The backlog row offered two fixes; I took the second ("hoist the epoch-day helpers
into `lib/utils` so there is one implementation to guard"), because it is the one
that actually closes the gap and because the §5.3 one-predicate rule points straight
at it. The alternative — add the file to the list and carve out its multiplication
with a comment — recreates the unguarded gap at the exact site of the original bug.

- **`lib/utils.dayKeyFromIndex`** — the epoch-day inverse now lives once, beside its
  `localDayIndexOf` sibling, with the UTC-read rationale in its header. `lib/utils`
  is the guard-exempt home (it holds the one sanctioned `/ MS_PER_DAY` too), so the
  multiplication is fine there. This retires **one of six** near-identical copies of
  the inverse that had accreted across the trial surfaces; the other five
  (`dietTrialFacts`, `trialExposuresScreen`, and the inline `dietTrialCard` /
  `generate-report/trial.ts` copies) are noted below as a residual, not touched.
- **`lib/dietTrialOutcomeFacts.ts`** — imports the shared inverse; its local
  `MS_PER_DAY` and `dayKeyFromIndex` are gone. It now delegates the boundary in both
  directions and holds no epoch arithmetic. The excellent header comment that
  documented the PR-6 bug moved to `lib/utils` (the rationale) with a pointer left
  behind (the guard history).
- **The guard** — added a `DAY_MULTIPLICATION` regex and a guard block asserting
  `dietTrialOutcomeFacts.ts` uses `localDayIndexOf`/`dayKeyFromIndex` and contains
  neither operator. `DAY_MULTIPLICATION` is applied **only** to files that must hold
  no epoch math: `dietTrialCard.ts`'s `formatTrialDate` and `generate-report/trial.ts`
  legitimately do the inverse inline (each carved out with a comment) and keep only
  their `DAY_DIVISION` check, exactly as before. Making `DAY_DIVISION` itself match
  multiplication would have broken both of those existing assertions — a real trap,
  since both files contain `dayIndex * MS_PER_DAY`.

## B-544 — the sole `diet_trials` write path had no tests

`components/profile/StartTrialModal.tsx` (the only surface that creates a trial) and
`hooks/useDietTrial.ts` (behind both trial surfaces, where the B-534 staleness bug
lived) had a silent DoD exemption. Now covered:

- **`components/profile/StartTrialModal.test.tsx`** (8 cases). The heaviest pin is
  the **end-and-continue ordering**, because ending is destructive and the app has
  no un-end path: agreeing to end the running trial commits nothing (`endActiveTrial`
  is not called until Start); Start ends the old trial *before* creating the new one
  (asserted on `invocationCallOrder`); a failed end never creates the new trial
  (nothing partial lands, Alert shown); and cancelling after agreeing discards the
  pending end. Plus the **D-screen gate** (blocked when a trial is running / form
  when none / form on a read failure — never block the owner) and the fresh-start
  path with the inclusive day-1 counter. Db + sync are stubbed and the three
  db-touching functions replaced with spies; everything above the "Local writes"
  divider in `dietTrialSetup` (copy, `INDICATION_OPTIONS`, `canStartTrial`, the day
  math, the reason set) stays real via `requireActual`, so the flow renders the same
  strings the device does.
- **`hooks/useDietTrial.test.ts`** (5 cases). The B-534 regression guard: a trial
  write elsewhere bumps the shared hydration tick, and this instance must re-read
  **without its own `reload()`** (before the fix, Home's strip stayed on the
  pre-write trial). Plus `reload()`, the no-active-pet clear, and the last-good-input
  behaviour on a read failure (never flash an empty state — "no claim, in either
  direction"). Real zustand stores, stubbed `loadDietTrialFacts`.

## Checks

- `tsc --noEmit` clean.
- Full `jest` suite green via the pre-push hook: 176 suites / 3921 tests.
- Diet-trial regression sweep: 15 suites / 923 tests green.
- Adversarial review N/A — no clinical/statistical logic changed; the epoch-inverse
  hoist is byte-identical to the code it replaced and is now guarded against a
  private copy reappearing.

## Residual

Five more copies of the epoch-day inverse still exist (`lib/dietTrialFacts.ts`,
`lib/trialExposuresScreen.ts`, and the inline `dietTrialCard.ts` /
`generate-report/trial.ts` copies). Consolidating all of them onto
`lib/utils.dayKeyFromIndex` — and rewiring the Edge Function copy, which needs its
own Deno test + adversarial pass — is a larger change than B-517's scope and would
touch design-locked, heavily-reviewed files. Left as a possible future tidy; the
guard now at least stops a *new* private copy landing in a clean consumer.
