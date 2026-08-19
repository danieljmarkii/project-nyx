# CUL-135 (B-178) — Edge-Function deploy ledger (token-free CI drift gate)

**Date:** 2026-08-19
**Mode:** BUILD · **PR:** #679 (draft) · **Follow-on filed:** CUL-541

## Outcome

Shipped (draft PR #679) a **deploy ledger** that closes B-178: merging a
`supabase/functions/**` change does not deploy it, so a merged Edge Function
silently drifts from `main` until someone notices (`analyze-vomit`'s B-028 ran a
month-old bundle in production for a month until the 2026-06-24 audit caught it).

The mechanism is a **token-free CI drift gate**, not auto-deploy — which was a
deliberate decision (below). Three parts:

- **`guards/edgeFunctionDeploy.test.ts`** — a jest guard in the shape of
  `guards/ownerFacingCopy.test.ts`, so it rides the already-required
  `App (typecheck + jest)` check and blocks **with no `ci.yml` change**. It walks
  each deployable function's *shipping import-closure* (`index.ts` + every local
  `.ts` it transitively inlines — `../../../lib/*`, `../_shared/*`, sibling
  functions; exactly what esbuild bundles in `scripts/deploy-edge.sh`),
  fingerprints it (sha256), and fails on unacknowledged drift: `DRIFT` /
  `UNTRACKED` (new fn) / `STALE` (removed fn) / `UNREASONED` / `UNRESOLVED`.
  16 self-tests cover the walker and every gate branch.
- **`supabase/functions/deploy-manifest.json`** — the ledger, 8 functions.
- **`docs/edge-deploy-runbook.md`** — a "Deploy ledger" section: the one new
  post-deploy step (bump the entry to `deployed`), the `hold`/`pending`
  acknowledgment model, and the scope boundary.

## The mechanism decision (presented as a brief; PM deferred to me)

The issue's framing ("post-merge deploy gate") reads naively as *auto-deploy on
merge*. That would be **wrong for this repo**: several functions are deliberately
merged-but-held (`generate-report` under B-494; `generate-signal` behind the
Signals-v2 gates; the analyze-*/ask ordering), because the DoD runs an
adversarial + Dr. Chen pass **before** clinical logic goes live. Auto-deploy
would bypass exactly those gates. So the goal is to make drift **loud and
tracked** while preserving the deliberate holds — a drift *detector*, not a
deployer. Presented Option ① (advisory reminder) / ② (blocking ledger gate) / ③
(live reconciler, token-gated); recommended **② blocking**, PM deferred. Filed ③
as **CUL-541**.

## Scope boundary (stated in the guard + runbook)

The guard is token-free and never contacts Supabase (keeps CI's `contents: read`
boundary intact), so it **cannot prove a deploy reached production** — the live
artifact is a bundle, not a source closure. Its promise is "no *silent* drift",
not "everything on `main` is live". Proving `deployed == main` needs the MCP /
`get_edge_function` + a fresh bundle of `main` → **CUL-541** (the live reconciler).

## Honest seed model

No function is seeded `deployed`, because live-vs-main wasn't verified per-function
(that's CUL-541). `generate-report` is the one confirmed `hold` (B-494); every
other function is `pending` (baseline, live state unverified). Each self-heals to
`deployed` on its next verified deploy. The gate is fully functional from day one
regardless: any future closure change flips the fingerprint → forces a reasoned
ledger update.

## Known, intended consequence (surfaced, not hidden)

Because the fingerprint spans the transitive closure, **editing a shared file an
edge function inlines (`lib/dietTrial.ts`, `_shared/http.ts`, …) drifts every
function that inlines it**, and that PR must acknowledge the redeploy in the
ledger. That is correct (those functions' shipping code did change and a redeploy
is owed), but it is a real tax on `lib/*` edits. It is bounded (a `pending` entry
+ reason) and safe-direction (over-fires toward "confirm a deploy", never toward
silent drift). If it proves noisy, a future refinement could gate the failure on
the PR's own diff touching the closure — noted, not built.

## Code review (code-reviewer subagent) — one fix-before-merge + nits, all applied

- **[fix-before-merge, applied]** The walker missed TypeScript's inline
  import-type query `import('./x').Type`, which is **live** at
  `generate-report/render.ts` (a `report.ts` type). It was harmless *today* only
  because a redundant top-level `import type` also pulls `report.ts` in — but if
  that were trimmed, the walker would silently stop tracing a real dependency with
  no `UNRESOLVED`, the exact miss the guard forbids. Added an `ImportTypeNode`
  branch + a self-test on the render.ts/report.ts shape.
- **[nits, applied]** forward-slash relpath normalization (cross-OS determinism —
  the path-separator sibling of the CRLF fix; this also removed a stray NUL that
  had become the serialization separator, now a plain space); parse plain `.ts` as
  `ScriptKind.TS` not TSX; `index.json` in the resolver; a documented-limits
  characterization test (non-literal dynamic import); `_README` `pending` wording.

## Base-drift finding (why the first CI run was red)

The first CI run failed `DRIFT` on `generate-report` + `generate-signal`. Root
cause: CI evaluates the PR's **merge commit** (branch + latest `main`), and `main`
had moved 1 commit (`1b48df0`) that changed `generate-report/report.ts` and
`generate-signal/photoComposition.ts` — files those two functions inline. My seed
predated them. **The guard was correct; the seed was stale.** Fixed by merging
`origin/main` and reseeding all 8 fingerprints against the merged tree (the
standard base-drift repair). This is also a live demonstration of the guard doing
its job — a real edge-code change on `main` that owed a redeploy.

## Definition of Done

- [x] AC: no `technical-spec.md` build-phase AC (CI/tooling, not a build step). The
  guard's own criteria (green clean; fails DRIFT/UNTRACKED/STALE/UNREASONED/
  UNRESOLVED) are each covered by a self-test.
- [x] Anti-patterns: none. Idiom-matches the sibling guard; no `any`; comments the
  why; token-free (respects the `app_config`-is-the-only-global rule by adding no
  table); no `ci.yml` trust-boundary change.
- [x] Types: `tsc --noEmit` clean. Tests: `jest` 240 suites / 5329 green; guard 16/16.
- [x] Automated tests: the new logic (walker + `evaluateLedger`) has 16 self-tests.
- [x] No new secret.
- [x] Persona sign-off: **Engineer ✓** (token-free, rides the existing gate, no
  `ci.yml` change, idiom-matched) — **Data/Dr. Chen N/A** (no clinical/statistical
  logic; no adversarial pass required) — **T&S N/A** (no data boundary; reads
  source only) — **code-reviewer ✓** (one fix-before-merge applied + nits).
- [x] Future-self review (new pattern): "would I want this in 12 months?" — yes; the
  cost (lib-edit tax) is named above and is the honest price of catching real drift.
- [x] Real-repo proof: perturbing `_shared/http.ts` flags exactly the 6 functions
  that inline it (the CUL-258 blast radius), sparing generate-report/delete-account.

## Files touched

- `guards/edgeFunctionDeploy.test.ts` (new) — the walker + ledger gate + self-tests
- `supabase/functions/deploy-manifest.json` (new) — the ledger (8 functions)
- `docs/edge-deploy-runbook.md` — new "Deploy ledger" section + two pointers
- `STATUS.md` — one Open-PM-Action-Items block tying the ledger to the deploy-gated items
- merged `origin/main` (`1b48df0`) for consistent fingerprints

Follow-on filed: **CUL-541** (live reconciler — prove `deployed == main`).
Shipped via #679.
