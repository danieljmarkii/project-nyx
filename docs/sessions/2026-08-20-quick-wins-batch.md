# 2026-08-20 — Quick-Wins batch (verify-then-act over the Linear "Quick Win" backlog)

**Date:** 2026-08-20
**Shipped via:** #685 (CUL-98) and #686 (CUL-293). Plus 5 stale issues reconciled → Done directly in Linear.

## What this session was
A first run of a "verify-then-act" batch: take the top open `Quick Win`-labelled issues in Linear (team Culprit) by priority, and knock out the ones that are purely-engineering, parallelizable, and need no manual PM step. The PM ran it as an experiment in agent-driven batch execution.

## The headline finding: the Quick Win backlog is ~60% stale
The `Quick Win` + `Legacy` issues were migrated from `docs/backlog.md` months ago and never reconciled against the code, which has since moved. Of the 8 top-priority issues verified against current source, **5 were already implemented**:

- **CUL-133** (FAB recent-meals stale) — `FAB.tsx:72` already uses shared `getRecentFoods`.
- **CUL-151** (FAB quick-symptom NULL confidence) — `FAB.tsx:275,283` route to `/log?type=…`; quick-meal writes `'witnessed'` (`:130`).
- **CUL-84** (deploy-edge comment mojibake) — `deploy-edge.sh:187-188` has `--charset=ascii` + `--legal-comments=none`.
- **CUL-92** (search_path hardening) — done in migration `047` (B-403), Part 2a/2b.
- **CUL-446** (Foods tab photos) — B-004 PR 6 thumbnail pipeline present (`foods.tsx` `thumbFor`/`resolveThumbnails`; `foodQueries.ts:36` selects `MAX(photo_path)`).

Each was closed Done with a file:line evidence comment. Two were genuinely open and shipped (below). One (**CUL-223**, weight-history tap-through) is genuinely open but **held** — verified real (no `weight-history` route; `getWeightHistory` data layer exists) but a net-new screen wants Designer input, so it's not batch-shaped; left `Todo`.

**Lesson banked:** building blind off this backlog wastes sessions — the batch's verify-first design is what caught it. A one-pass `backlog-groomer` reconciliation of the whole `Quick Win` set against current code is worth doing on its own.

## CUL-98 — one vocabulary for the three timing bands (shipped via #685)
Home (`lib/signalCopy.ts`) named the bands "30 min–6h" / "6h+ after eating"; Patterns (`lib/patternsTiming.ts`) named the same three "30 min to 6h" / "6h or more after eating" — an owner crossing Home→Patterns saw the same fact relabeled (surfaced by the CUL-15 pm-feature-review).

Extracted one shared pure formatter `lib/timingBandLabels.ts` (`formatTimingBandLabel(band, rapidMin, longH)`). `patternsTiming.timingBandLabel` now delegates to it (output byte-identical → its 4 render consumers + tests untouched); `signalCopy`'s `timingStoryBandRows` + `trialResponseCompareRows` call it. The band phrasing also appeared in **two prose lines on the same A2 card** (`photoCompositionLines`, `timingStoryVetLine`) — unified those to "6h or more" so Home is internally consistent, not just consistent with Patterns.

Kept the plain-spoken "to"/"or more" wording (nyx-voice "smart, caring friend" register — the form Patterns already shipped). New `timingBandLabels.test.ts` covers the formatter + a delegation drift-guard pinning Patterns to the shared vocab. code-reviewer: **SHIP** (2 comment-citation nits applied). CI green.

## CUL-293 — offline-safe weight snapshot (shipped via #686)
The `pets.weight_kg` snapshot is written inline at log/edit time by a best-effort direct `supabase.from('pets').update(...)` with **no offline retry** — offline it fails silently and the server snapshot drifts from the reliably-synced `weight_checks`.

**Implement-vs-flag judgment.** The fix turned out to touch the sync engine (the most guardrail-heavy area) and hit a `weight.ts ↔ sync.ts` import cycle — bigger than the issue implied. I weighed flagging it (the batch's scope-valve), but implemented because the fix is **purely additive** (a best-effort safety net; the inline writes are untouched), can't corrupt the sync queue by construction, and the impact is narrow-but-real: `generate-report:365` treats `pets.weight_kg` as "the onboarding snapshot, NOT a weigh-in" and both the report and `ask` read weigh-ins from `weight_checks`, so only a fresh-device profile pre-fill is affected.

`syncPendingWeightChecks` now reconciles `pets.weight_kg` from the pet's latest local reading for each pet whose weight row actually **landed** (runs on foreground + reconnect). New best-effort `reconcilePetWeightSnapshot`. The code-reviewer's cleanup resolved the one smell: extracted the shared latest-weight SQL to an I/O-free `lib/weightQueries.ts` leaf module (the `foodQueries.ts` pattern) — eliminating **both** the duplication and the import cycle.

**Reviews (both adversarial, both with stated falsification attempts):**
- **rls-privacy-reviewer: PASS — boundary held.** Tried a user-B JWT reconciling pet-A → blocked at two barriers (the RLS-aware `landed` gate drops any foreign `pet_id` before reconcile; `pets_owner` RLS no-ops the update on 0 rows — the same barrier the inline writes already rely on). Shared-device stale row → `weight_checks` is wiped on sign-out. Keyed on `pet_id`, no multi-pet bleed.
- **code-reviewer: ship-ready.** Pattern 1-compliant by construction (never touches queue `synced` state); `landed` filter correct; session-freshness inherited; multi-pet isolation correct.

Acknowledged non-regression: within-account last-write-wins snapshot drift (a device flushing old queued readings can momentarily write an older "latest local"); self-heals on next hydrate; no worse than the inline writes it backstops. Minor residual (the issue's secondary note): `updateWeightCheck` writes the snapshot unconditionally (no `!== current` guard) — explicitly harmless; a 1-line follow-up if ever wanted.

## DoD
Both PRs: `tsc` clean; jest green (CUL-98 full-suite 5363; CUL-293 sync+weight 105 incl. 6 new); CI green (both jobs); persona sign-off in each PR body; no schema, no secrets, no PM action items. **Adversarial-reviewer (statistics): N/A** — neither PR changed detection/correlation/escalation/AI-read logic; CUL-293's boundary got the rls-privacy adversarial pass (attacks stated above).

## Process notes
- Two build PRs from one session — a deliberate departure from "one PR per session" for the batch experiment; each PR is focused and independently reviewed. This session record rides in #686.
- **STATUS.md unchanged:** the batch didn't advance the build phase and added no PM action items or blocking questions.
- No PR check-in armed (per the PR-check-in rule; the PM merges by hand and the subscriptions cover CI/comment webhooks).
