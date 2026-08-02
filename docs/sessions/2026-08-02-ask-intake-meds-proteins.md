# Ask tool-layer closures — intake_trend, honest dose buckets, set-membership proteins

**Date:** 2026-08-02

**Shipped via #573** (draft). Branch `claude/clinical-guardrails-intake-meds-protein-2t5fhv`.
Closes **B-382**, **B-395**, **B-467**.

## What this is

Three PM-directed closures in `supabase/functions/ask/tools.ts` (+ `answer.ts`,
`index.ts`, and the B-467 half in `generate-signal/summary.ts`), built under
`clinical-guardrails` with the mandated adversarial-reviewer pass:

- **B-382** — new `intakeTrend` tool: window-vs-prior finished-rate delta, so a
  falling finished-rate is *visible to the planner*, not just unsayable by the
  phraser (the A7 counterexample-(c) structural gap). Same qualifying-meal
  denominator as `intakeSummary` in both windows; per-window floors (below-floor
  prior ⇒ `prior: null` + the honest count, never a fabricated comparison);
  direction descriptive only — the engine's `intake_decline` detector stays the
  sole escalation minter (§7.2, via `safetyLead`), and the tool description
  routes a `down` to the calm health register, never "picky".
- **B-395** — `MedicationEntry` gains `dosesPartial` + `dosesUnconfirmed`. The
  four buckets now partition every logged dose (given / partial / missed+refused
  / null-or-off-enum → unconfirmed), client-tally parity. Previously partial and
  null fell into *neither* bucket — safe-direction, but a possible disease
  signal silently vanished from every Ask answer. Never-reassure unchanged:
  neither bucket is ever given or "last given".
- **B-467** — `topProteins` (Ask) and `topMealProtein` (AI monthly summary)
  re-keyed onto the captured protein SET (`readProteinSet`), matching the
  correlation engine + Patterns card (B-351 slice 6). Hidden-secondary exposure
  counts; shares no longer sum to 1; floors count feedings, not instances;
  absent set degrades byte-identically to the primary. The `summary.ts`
  widening was done under the PM's explicit task directive — the "explicit nod"
  its header required — and the deliberate treats-out clause narrowing is kept,
  with the nod recorded in the header. `ask/index.ts` widens the food join to
  select `proteins`.

## Deploy holds (deliberate, merge-only)

- `ask` **not redeployed** — gated on the B-665 authorization (#572's F1 embed
  fix + post-Jul-19 promotion, open PM action item). These tools go live there.
- `generate-signal` **not redeployed** — the standing B-182 deploy gate holds.

## Sequencing note — QW-13 does not exist

The task said "sequence after QW-13 (same file)". No QW-13 exists anywhere
discoverable: the quick-wins doc (#529) tops out at QW-10; no branch, PR, or
commit references QW-13; no open PR touches `ask/tools.ts`. Proceeded against
current `main` and flagged in the PR body.

## The adversarial pass FAILED round 1 — and the failures were all at the seam

The mandated `adversarial-reviewer` run (isolated, counterexamples executed
against the real code) confirmed **every counting claim held** — 4,000-fixture
byte-identical parity between Ask's `topProteins` and the client's
`computeTopProteins`, exact four-bucket dose partitions over 3,000 fixtures,
floors/dedup/degrade/treat handling all unbroken — and **FAILED the round on
four seam findings**, all fixed on this branch before merge:

1. **Flat-at-zero (the B-494 shape on a new surface).** A 0-of-19
   uniformly-refusing cat reads `direction: 'flat'`, the relative engine can't
   fire (so `safetyLead` is null), and *"there's been no drop in her eating"*
   cleared `validateAnswer` — absence of a *delta* read as a negative result.
   Fix: tool-description register rules (flat/up is never good news; a
   zero-finished current window LEADS) + `REASSURANCE_RE` arms for the
   demonstrated family (`no drop/dip/decline/fall`, `nothing has changed`,
   `hasn't changed`, `picked up`), with the honest recount pinned as passing.
2. **Rating-density collapse.** 12 meals fed, only the 4 eaten rated → `'up'`.
   Fix: `currentUnratedMeals`/`priorUnratedMeals` on the result + a structural
   provenance disclosure ("unrated meals not compared: 8 this window") — the
   C5 lesson, disclosure beside the verdict, never a revert. Single-window
   `intake_summary` has the same blindness → **B-683** (filed).
3. **The alphabetical tie-break decided a clinical superlative.** Post-widening,
   an exact tie is the *default* for a single multi-protein food, and "Chicken
   was the most-logged" on a duck formula was decided by `'c' < 'd'`. Fix:
   `topMealProtein` returns a STRICT winner or null — a tie yields no clause
   (no claim beats a false one). The joint-clause alternative is new
   clinically-reviewed copy → **B-684** (filed, deliberately not minted).
4. **`medications` had no server-built provenance**, so the new honest buckets
   were prompt-dependent and *"taking her Amoxicillin as prescribed"* passed
   over a 1-partial/2-unconfirmed record. Fix: a `buildProvenance` case
   rendering the four buckets structurally (client-copy vocabulary — "not
   fully taken") + compliance-assertion validator arms (`as prescribed`,
   `on schedule`, `hasn't/never missed`, `none missed`, `every dose`) + the
   tool-description ban. Minor residual (two same-label entries for a dose
   linked to a ghost regimen) is fixture-only today — `index.ts` fetches every
   regimen and meds have no soft delete — noted, not built around.

DoD adversarial line (from the reviewer, verbatim): *tried the
duck-formula-hiding-chicken + devoured-chicken-treat fixture → hidden secondary
counts as real exposure, finished-rate stays the meals' 0/6 and never the
treats' ceiling ✓; 4,000-fixture parity with computeTopProteins ✓; rating-density
collapse → direction 'up' ✗ (fixed: disclosure); 0-of-19 refusing cat → 'flat' +
"no drop" passed ✗ (fixed: register + validator); 13 off-enum adherence values →
exact partition ✓, "as prescribed" passed ✗ (fixed: provenance + validator).*

## Tests

Edge Functions suite 1097 → 1134 (all green): intakeTrend ×6 (decline visible,
per-window floors, no-prior windows, treat/free-fed exclusion, intakeSummary
parity), B-395 buckets ×3 (incl. partition/reconciliation + off-enum), B-467 set
membership ×3 in tools.test.ts + dispatch/provenance/tiles in answer.test.ts +
hidden-secondary clause ×2 in summary.test.ts. App `tsc --noEmit` clean.
`deno.lock` hunk = workspace-manifest sync after #567 (expo-notifications).
