# Signals v2 GA — the flip (CUL-549) + GA-3 server-gate removal (CUL-550)

**Date:** 2026-08-21

Advanced the CUL-546 GA graduation of the two Signal betas (`signal_design_v2` "Signal redesign" + `signals_v2` "Deeper signals") through **Phase 2 (the flip)** and **Phase 3 GA-3 (the server-gate removal)**. GA-3 shipped via **#691** (ready for review; CI green; adversarial PASS). The remaining gates are both the PM's: merge #691, then the Codespace redeploy. GA-4 (CUL-551, row deletion) stays queued behind that deploy.

## What shipped

- **Phase 2 — the flip (CUL-549, no PR).** Set both `app_config` rows to `{"enabled": true}` via the Supabase MCP after the PM confirmed the GA build was on-device. Looked before overwriting (both were `{"enabled": false, "allowlist": [<PM uid>]}`), verified the shared `resolveAllowlistFlag` semantics first (`{ enabled: true }` = on-for-everyone, allowlist ignored — confirmed by the primitive's own tests in both runtimes), scoped the write to exactly the two keys (2 rows), preserved the rows (GA-4's delete untouched), and did not touch the B-777 server gate (GA-3's job). Read-back confirmed both `{"enabled": true}`. CUL-549 → Done.
- **Phase 3 GA-3 (CUL-550) — shipped via #691.** Removed the now-dead B-777 `signals_v2` per-account eligibility gate from the `generate-signal` engine:
  - `index.ts`: no longer reads the `signals_v2` app_config row or `resolveAllowlistFlag`; calls `detectSignals(input, DEFAULT_CONFIG)` and always computes L3 `computePhotoComposition`.
  - `detection.ts`: the third `detectSignals` parameter renamed `signalsV2Eligible` → `composeV2`, default flipped `false` → `true`. No detector logic, threshold, or ordering changed.
  - Deploy ledger: `generate-signal` fingerprint bumped (`sha256:29df1af6…b30f6e`, `pending` — Codespace deploy owed); `generate-report` fingerprint bumped (stays `hold` for B-494, behavior-neutral).

## The decision this session forced — Option A (PM-ruled)

The plan (CUL-550) said "delete the fork entirely; v2 is the only path." Mid-build I found that `detection.ts` is **shared**: `generate-report/report.ts` inlines it and calls `detectSignals(detInput, DEFAULT_CONFIG)` — the 2-arg form that, under the old signature, meant `signalsV2Eligible = false` (pre-v2). The report's `runDetection` renders only the pre-v2 finding taxonomy (`postprandial_timing`/`timeofday_clustering`) and drops `timing_story`/`empty_stomach_timing`/`trial_response`/`gap_shortening` on `default: break`.

So the naive param-removal would have silently flipped the **vet report** to v2 and **dropped a postprandial ⑤ finding merged into a `timing_story` it ignores** — a latent clinical-report regression (Principle 6) the plan hadn't anticipated. Rather than resolve it silently, I stopped and surfaced an A/B decision brief.

**PM ruled Option A** (preserve the report). Implementation: keep a `composeV2` toggle on `detectSignals` (default **on** — every Signal account), and have `report.ts` pass `composeV2: false` explicitly with a comment. The app_config eligibility gate is fully removed (GA achieved for the Signal surface); the legacy composition path + lane-emission skip survive **solely** for the report, pinned to pre-v2 until it adopts the v2 finding types. That adoption + the final toggle/legacy-path deletion is filed as **CUL-564** (a change to the vet report → Tier-2 doc edit + a fresh `vet-report-cold-read` are mandatory there).

## Adversarial review (mandatory — `detection.ts` is clinically load-bearing) — PASS

Ran the `adversarial-reviewer` with a 5,000-input differential fuzz of `OLD(HEAD~1)` vs `NEW` `detectSignals`. All five load-bearing claims survived a stated counterexample:

- **A** — `NEW(true)` == `OLD(true)` and `NEW(default)` == `OLD(true)`, 0 divergence over 98 genuinely-v2-active inputs (coverage not vacuous).
- **B** — `NEW(false)` == `OLD(false)` == `OLD(default)`, 0 divergence, including the ⑤→`timing_story` merge case the report drops → **report output byte-identical**.
- **C** — the `detection.ts` diff is comments + rename + default-flip + fork/skip variable rename only; no threshold/ordering change.
- **D** — only two runtime callers: `index.ts` (default-true, v2) and `report.ts` (explicit false). No third caller silently flipped.
- **E** — always-on L3 returns null on a clean read → byte-identical no-op; present-only/escalate-only; runs post-curate so it cannot reorder/suppress/reassure.

**Caveat carried to the deploy (not the merge):** preservation is *per-code-path, not per-account*. Every previously-`signals_v2`-ineligible account now runs the v2 arm + always-on L3, so their Signal cards **will change** at the redeploy (⑤/L1 may merge into a `timing_story`, ⑥ suppression becomes episode-set-aware, `trial_response`/`gap_shortening`/L3 evidence can appear). That is the intended GA graduation and the safe/escalate direction — and it lands at the deploy, not the merge (`generate-signal` is `pending` in the ledger). This PR certifies the code, not the deployed engine.

## Validation

- `deno test`: **generate-signal 505/505**, **generate-report 432/432** (report byte-identical); `deno check` clean on the shipping entry points (had to install deno 2.9.5 locally — lockfile v5 needs >2.2; the cloud session ships no deno).
- Full jest **5361/5361** (pre-push hook); fingerprint guard green.
- **CI green** — all three required jobs (`App (typecheck + jest)`, `Edge Functions (deno test)`, `App (jest, non-UTC timezones)`).

## Process notes

- Honored the BUILD-mode plan-gate: posted a file-level plan and held for the go-ahead before touching code.
- Held the push when the Option A/B question surfaced (the working tree implemented B at that point) rather than baking in an unresolved decision, then reworked to A after the ruling.
- Per-issue trail: outcome comment on CUL-550; CUL-549 → Done; CUL-564 filed (Signals v2 project, Todo).

## Residuals / follow-ups

- **CUL-564** — `generate-report` adopts the v2 finding types (then delete the `composeV2` toggle + legacy path). Gated on a vet-report Tier-2 edit + cold-read; relates to the B-494 report-redeploy hold.
- **GA-4 (CUL-551)** — delete the two retired `app_config` rows (migration) + docs closeout (the "ships dark → GA'd" CLAUDE.md/spec edits) — queued behind the GA-3 deploy.

## PM gates

1. Merge **#691**.
2. Deploy from the Codespace after merge: `scripts/deploy-edge.sh generate-signal --deploy`, verify, set the ledger `generate-signal` → `deployed` (`sha256:29df1af6…b30f6e`).

Personas engaged: **Engineer** (the shared-module seam, the toggle design, the ledger), **Data Scientist / Biostatistician** (the adversarial falsification of behavior preservation), **Dr. Chen lens** (the clinical-report regression that forced the A/B decision), **Product Owner** (CUL-564 + the per-issue trail).
