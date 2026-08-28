# Event taxonomy — W1-PR-3b session 1: the per-lane membership map (CUL-676)

**Date:** 2026-08-28
**Shipped via #TBD.** _(Same calendar session as PR-3a's #730 — the PM explicitly
directed starting 3b after #730 merged, overriding one-PR-per-session for the day;
the branch was restarted fresh from `main` per the merged-PR follow-up convention.)_

## What this was

The behaviour-neutral half of W1-PR-3b (taxonomy spec v1.3 §9/§13a; hard review
HR-1; the four PM rulings recorded on CUL-676, 2026-08-28): build the engine
infrastructure that makes per-lane symptom membership POSSIBLE, without enrolling
cough in anything. Session 2 (the feature half) then flips ruled cells as visible
one-line diffs: cough → the fetch union + the ⑦ cell + its perType floors +
the R4 both-stated mechanism + the report co-work + the redeploy.

## What shipped

- **`detection.ts` — the HR-1 split.** One list (`CORRELATION_SYMPTOM_TYPES`,
  driving the fetch AND five lanes) became three concerns:
  `SYMPTOM_TYPE_UNIVERSE` (what the module can NAME — 7 types, cough/sneeze
  included, which compile-forces the label map and lets fixtures exercise an
  unenrolled leaf without a cast) · `CORRELATION_SYMPTOM_TYPES` (the FETCH union —
  still the five; the client walk-table row that pins it stayed green untouched) ·
  `LANE_SYMPTOM_TYPES` (per-lane cells: ① correlation / ③④ symptomDelta /
  ⑦ chronicity / L4 gapShortening / the diagnostics floor — each cell exactly the
  pre-taxonomy five). The five lane loops and their three tie-breaks now read
  their own cell. ⑤/⑥/L1/L2-timing stay single-type constants (the corrected
  HR-1 inventory — deliberately not cells), and the header documents the R3
  ruling: the logged-day denominators read the fetched input by construction,
  so denominator set == fetch union, now as policy rather than accident.
- **The per-type chronicity floor slot** (`config.chronicity.perType`, empty
  today) + `chronicityFloorsFor` — resolved INSIDE `isChronic` and
  `resolveChronicityTier`, so ⑦'s fire predicate, its tier, and the ③-valve
  share per-type floors by construction (the §5.3 one-predicate rule; a consumer
  cannot forget to resolve). `windowDays` deliberately not overridable — a
  per-type window would be a different lane, not a different floor.
- **`phrasing.ts`** — server `SYMPTOM_LABEL` gains `coughing`/`sneezing`
  (compile-forced by the universe; unreachable until a lane cell carries the
  type; matches the client mirror).
- **HR-30** — the stale "do NOT redeploy" registry comment deleted (false since
  Signals v2; replaced with the dated correction).
- **`laneMembership.test.ts` (21 cases)** — the decision table pinned (universe /
  fetch / every cell / the two NEVER-cells), a negative fixture per lane **each
  paired with a positive control on the identical event shape** (the CUL-613
  answer to the unfalsifiable-⑤-fixture class the review itself flagged), the
  perType slot's unit + integration cases (raised floor silences the council
  case; per-type firmSpanDays flips the tier; the ③-valve provably reopens under
  a per-type override — the resolver-sharing proof), and the sweep (a
  cough-saturated record through `detectSignals` names cough nowhere).
- **Deploy-manifest re-acknowledgment** — the split rode into both closures:
  `generate-signal` re-fingerprinted `pending` (redeploy rides session 2, gated
  on a live build carrying #730) and `generate-report` re-fingerprinted with the
  **CUL-19/B-494 hold unchanged** (behaviour-neutral note appended; session 2's
  report co-work re-acknowledges again).

## Verification

- **Behaviour-neutral, proven at the suite:** all **1,369 pre-existing Deno
  tests pass unchanged**; with the new suite, **1,390/1,390**. App side
  untouched by the engine change: `tsc` clean, **jest 5,987/5,987** (the
  membership walk's source-scan rows re-verified green over the new declaration
  shape; the deploy-ledger guard went red on the closure drift exactly as
  designed and was satisfied by the reasoned re-acknowledgment, not weakened).
- **The CUL-613 red-check, run before the fixtures were trusted:** cough was
  temporarily enrolled in the `gapShortening` + `diagnosticsFloor` cells — the
  broken tree failed exactly the four paired guards (both cell pins, the L4
  cadence card appearing for cough, three coughs opening `staple_washout`), then
  the tree was disarmed surgically.
- Two fixture drafts were themselves caught by the harness and fixed: `ago(t, 0)`
  landed exactly ON `now` and fell out of the half-open window (span 40 ≠ firm),
  and the valve fixture's q2-day course read 4-vs-3 week-over-week and tripped
  the layer's WORSENING gate — masking the chronicity valve it was measuring.
  The committed valve fixture uses a flat-cadence chronic course for exactly
  that reason.
- `adversarial-reviewer` run on the diff (mandatory — detection change); verdict
  and any findings recorded on CUL-676 and in the PR.

## Decisions taken in-session (build-level)

- `PRE_TAXONOMY_LANE_TYPES` is typed `readonly SymptomType[]` (wide element
  type) so lane-cell `indexOf` accepts the 7-wide stat type; the cells' contents
  are pinned by test, not by tuple types.
- The one-line `deno.lock` workspace-mirror refresh the local toolchain produced
  was reverted — B-434 owns lockfile drift; out of scope.

## Residuals / next

- **3b session 2** (the feature half): cough → fetch + ⑦ cell + Dr. Chen's
  perType floors (B-755) + R3 denominators (both client mirrors + parity and
  before/after fixtures in the same PR) + R4's both-stated mechanism (the
  displacement fixture is the acceptance test) + report co-work
  (`REPORT_SYMPTOM_TYPES`, `render.ts` labels, HR-7 canonical-count) + the
  `generate-signal` redeploy, gated on a live build carrying #730.
- The ⑦ negatives in `laneMembership.test.ts` flip deliberately in session 2;
  the ① and diagnostics-floor negatives never flip (§9 / R2).
