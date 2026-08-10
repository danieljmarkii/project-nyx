# Demo-account plan (B-271 v2) — convened specialist-panel review

**Date:** 2026-08-10 · **Outcome:** shipped via #626

## What happened

PM asked this session to convene the team — especially the specialists — over the finalized demo-account plan (`docs/nyx-demo-account-requirements.md` v2, #623): review it, name what's going well and what needs improvement, and produce the refined PR-by-PR breakdown.

Ran **four isolated specialist lanes in parallel** (isolation deliberate — none anchored by the spec conversation's optimism):

1. **App Store submission specialist** — the Apple lens, *and* made the §3.5 Tier 2/3 call the spec left "for the consultant."
2. **adversarial-reviewer** — did not read the story as prose: **built the §3.2 sequence and executed it through the shipped `detectSignals` + `computeTrialFacts`, 26 variants.**
3. **Dir. of Engineering** — mechanism verification against code + the live project (v14/v27 confirmed live), §12.1 topology, emitter design.
4. **rls-privacy-reviewer** — attack pass on the seed path, credentials, teardown.

Full record + findings + the refined plan: **`docs/demo-account-plan-review-2026-08.md`** (the deliverable).

## Headline results

- **Architecture verified sound** (rendering-path split, D5 inversion, story-module topology — proven by the existing `lib/dietTrial.ts` cross-runtime import precedent, seed-not-migration).
- **The honesty properties held under executed attack:** venison structurally cannot co-fire (control eligibility is created by venison itself → `riskDifference ≤ 0` by construction); off-diet flags exactly the 3 beef feedings; `trialDietRefusal: null` so the B-494 dodge is real.
- **Four blockers, all fixable as spec amendments (v2.1):** seeded foods reaped in ~30 min without `ai_extraction_status='manual'` (cascade kills both findings); the unguarded service-role delete (prod's only other tenant = the PM's real pets) → guarded deterministic-id **upsert**; **the spec's durability rationale is backwards** — the intake-dip "backstop" is the fragile finding (UTC-date bucketing, expires at next UTC midnight via the client's own stale-cache regen) while the correlation survived every time-shift; the correlation has zero margin at 3 exposures (4–5 is the measured safe band; 6 flips to Established) and dies silently without proteins/meal-times pinned.
- **Consultant ruling made:** Tier 1+2 ship, Tier 3 out — the "cheapest promotion" (med course) rejected *because of the screenshot plan's no-MedStrip freeze* — plus one scope add: a second minimal deletion-test account (reviewers test the required deletion flow; running it on the demo account kills the ASC credentials mid-review).
- **Cross-doc conflict surfaced (not resolved — PM's call):** demo spec D9 vs. screenshot plan D-SS4 on `signal_design_v2`, both ratified 2026-08-09, directly contradictory once SR deems v2 presentable.
- **Two discoveries filed:** **B-743** `generate-report` lacks the `getUser()` gate `generate-signal` has (service-role bearer renders any pet's report; rides the B-494 redeploy) · **B-744** `app_config` allowlists (incl. user UUIDs) readable by every authenticated user.

## PM decisions queued (decision briefs in the review doc §4)

- **DB-1** — `signal_design_v2` reconciliation (recommend: OFF everywhere for v1; D9 stands; plain-cards hero fallback).
- **DB-2** — second deletion-test demo account (recommend: yes).
- **DB-3** — ratify the v2.1 amendment list (review doc §6) so PR 1 builds against the amended story.

## What this changes about the build

The two-PR shape survives. PR 1 (story module + emitter + validations) is still fully offline and unblocked the moment DB-3 lands — now with deterministic-id upserts, the assertion prelude, the 24-UTC-hour sweep validation, drift-tolerance assertions, and `rls-privacy-reviewer` added to its gates. PR 2 (reviewer notes) is rebuilt around the consultant's scripted golden path, no "clinical-grade" in reviewer-facing text, the negatives block, and the second-credentials deletion note. The runbook becomes v2: PM-in-app photo (password never enters a session), demo-JWT-or-PM-opens-Home for the regen, credential smoke test, account freeze rule, standing 24–48h re-seed cadence, in-app-only teardown.

## Files

- `docs/demo-account-plan-review-2026-08.md` — new (the panel record + refined plan).
- `docs/backlog.md` — +B-743, +B-744.
- `STATUS.md` — B-271 section updated (review recorded; PM to-do reshaped; consultant item closed).
- No app code, no schema, no spec edits (Tier 2 — the v2.1 amendments await DB-3).
