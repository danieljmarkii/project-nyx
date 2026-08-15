# B-777 — the `generate-signal` redeploy made byte-identical for flag-off accounts (the single-redeploy gate)

**Date:** 2026-08-15 · **shipped via #659**

The deploy-blocking fix the CUL-15 (PR 10) close-out surfaced. B-777 was the one thing standing between the Signals v2 track and its single `generate-signal` redeploy: the engine composed uniformly for every account while `signals_v2` gated only the **client**, so the redeploy would have moved cards for the whole (flag-off) base at deploy time. This session implements **option A** (gate the v2 surface of the engine on eligibility, server-side) + the cross-deploy flag-off byte-identical test + the mandatory `adversarial-reviewer` re-pass. No schema, no client-behaviour change, no redeploy from here (the bundle is rebuilt + deployed from the Codespace once the remaining copy calls land).

## The problem (recap)

`signals_v2` is a **client-render** gate. The engine ran the v2 lanes (L1 `empty_stomach_timing`, L2 `trial_response`, L4 `gap_shortening`), the `timing_story` composition merge, the episode-set-aware ⑤/L1→⑥ suppression, and the L3 photo-composition decoration **uniformly for every account**. The composition layer **mutates existing (shipped) findings**, so "the flag-off client safely drops the new types" is necessary but not sufficient:

1. `composeTimingStory` **removes** the shipped ⑤ `postprandial_timing` (+ L1) when they co-fire and emits a `timing_story` the flag-off client drops → the ⑤ card **vanishes**.
2. The episode-set-aware `suppressTimeOfDayWhenPostprandial` unions L1's long onsets, so an empty-stomach cat gets ⑥ **newly suppressed** with no flag-off replacement → the clock card vanishes, toward silence (the wrong direction).
3. `trial_response` (band 1) displaces a shipped reflection card + its summary clause via the visible-card cap.

A ⑥ removed server-side cannot be reconstructed by a flag-off client — so the fix must live **inside the composition**, where the original findings still exist.

## What shipped (code)

- **`detection.ts` — the gate.** `detectSignals(input, config, signalsV2Eligible = false)`:
  - **Lane-emission gate:** the DETECTOR_REGISTRY loop skips `SIGNALS_V2_DETECTOR_TYPES` = {`empty_stomach_timing` (L1), `trial_response` (L2), `gap_shortening` (L4)} when not eligible. A lane that never fires can't displace a shipped card via the cap and can't reach a flag-off client as a dropped type.
  - **Composition gate:** eligible → the episode-set-aware suppression then `composeTimingStory`; **not** eligible → the pre-v2 **unconditional** `suppressTimeOfDayWhenPostprandialLegacy` (restored verbatim from `0c0e20d~1`) and **no** merge, so ⑤ survives as itself and ⑥ follows the v27 rule.
  - `suppressWorseningWhenChronic` runs on **both** paths (⑦/B-182 is a separate, deploy-cleared track — not gated).
  - Default is **`false` (fail-closed):** v2 can only ever leak by an explicit `true`; a forgotten call site gets the byte-identical pre-v2 output.
- **`index.ts` — eligibility resolution.** `readGateConfig(client, userId)` now also reads the `signals_v2` `app_config` row and resolves it via `_shared/flags.ts` `resolveAllowlistFlag(raw, user.id, false)` — the **same primitive the client's Gate 1 uses**, so server and client agree on who is eligible. The phrasing flag + caps still fail **open** (degrade to templates / default caps); `signalsV2Eligible` fails **closed** (an unreadable/absent/malformed config → non-eligible → byte-identical). Threaded into `detectSignals(input, DEFAULT_CONFIG, signalsV2Eligible)`.
- **`index.ts` — L3 gate.** L3 (`computePhotoComposition`) is itself a v2 lane and decorates the **shipped** ⑤/⑥ cards (hair/bile, via `timingTarget`), so it's gated too: `signalsV2Eligible ? computePhotoComposition(...) : null`. A non-eligible account's ⑤/⑥ carry no new `photoComposition` field — byte-identical *output*, not merely a field a flag-off client ignores.
- **`lib/betaFeatures.ts` + `.test.ts` — comment correction only.** The beta-row rationale asserted "the lanes compute UNIFORMLY … so nothing gates server-side" — **falsified by B-777**. Corrected to describe the eligibility gate; `serverCost` **kept `false`** (the lanes add no metered/scaling resource — no LLM/DB/external, just CPU over already-fetched data; the gate exists for byte-identical output, not metering). Re-characterizing to `serverCost:true` (→ B-713 Phase-2 scope) is a PM call — see the decision brief below. Values unchanged; assertions unchanged.

## The cross-deploy flag-off byte-identical test

The close-out named the gap: "no CI test feeds new-engine output to a flag-off renderer." Added — every test flips **only** the eligibility arg, so any divergence is attributable to the gate alone (a bare `detectSignals(input)` is `eligible=false`; a new `detectSignalsEligible` helper is `true`):

- **`detection.test.ts` — a dedicated B-777 block** (4 tests): (1) a ⑤+L1 co-fire keeps the shipped ⑤ un-merged and emits **no** v2 type flag-off (composeTimingStory gated); (2) the ⑥ suppression **reverts** to the v27 unconditional rule — a disjoint ⑥ that *survives* flag-on is *dropped* flag-off (the RESCUE case); (3) empty-stomach vomits surface as the shipped ⑥ flag-off, with no L1 to consume them; (4) **transparency** — a v2-silent input (`todGolden`, ⑥-only) is **deep-equal** across the gate (proves the gate changes nothing when no v2 lane fires).
- **`detection.trialResponse.test.ts`** — the same trial fixture emits `trial_response` flag-on, nothing flag-off, no v2 type (no displacement).
- **`detection.gapShortening.test.ts`** — the same shortening-run fixture fires `gap_shortening` flag-on, silent flag-off.
- The 8 pre-existing v2 tests that asserted the flag-on path were routed through `detectSignalsEligible` (they were exercising the eligible path); the ~13 other bare `detectSignals(...)` calls now double as flag-off byte-identical assertions for the shipped detectors.

## Tests

- **generate-signal deno: 504 pass** (498 prior + 6 new). Full `supabase/functions` tree: **1339 pass**. Client `jest`: **5205 pass** on the rebased branch (232 suites — includes the #656/#657 recap/notification tests the rebase pulled in; my diff adds the `mealTiming.test.ts` B-788 tie-break pin, 32/32, and `betaFeatures.test.ts` stays 15/15). `tsc --noEmit` clean; `deno check detection.ts index.ts` clean.

## Post-review additions (from the adversarial pass — see Reviews)

- **`detection.ts`** — narrowed the overclaimed CUL-7 comment ("The rewrite is behaviour-preserving … match ⑤ as shipped") to name the audited same-ms tie-break exception and point at B-788.
- **`lib/mealTiming.test.ts`** — a test pinning `nearestPrecedingFeeding`'s current first-of-equal-ms tie-break as a known v27 divergence (so it can't drift again silently; flips to `FormB` if B-788 restores v27's behaviour).
- **`docs/backlog.md`** — filed **B-788** (the ⑤ mealTiming tie-break; Data/T&S + PM call; does NOT block the redeploy).

## Reviews

### Adversarial review (mandatory) — the gate HELD; ONE orthogonal pre-existing delta surfaced (→ B-788)

Method: v27 = `0c0e20d~1`; diffed every engine file (`detection.ts`, `index.ts`, `phrasing.ts`, `summary.ts`, `medContext.ts`) v27→fix, then ran a **12,000-scenario seeded differential fuzz** comparing v27 `detectSignals(input, cfg)` against `stripInternalOnsets(detectSignals(input, cfg, /*eligible*/false))`, plus targeted boundary/collision suites.

- **The B-777 gate mechanism HELD on every axis.** The v2 lanes / `composeTimingStory` / `timing_story` / L3 `photoComposition` all gate cleanly; `suppressTimeOfDayWhenPostprandialLegacy` is byte-for-byte v27; the internal onset arrays are stripped **unconditionally on both paths** (never reach the cache); `rankFindings` / `suppressWorseningWhenChronic` / the type-order tables are byte-identical, so the skip-loop + stable sort reproduce v27's exact order (0 rank diffs in 12k); eligibility **fails closed** on every `readGateConfig`/`resolveAllowlistFlag` path (error, catch, malformed, null/unknown uid, empty allowlist). The gate is also **load-bearing** (flag-ON *does* differ from v27), so "off == v27" is a real property, not vacuous.
- **The one FAIL (low severity) — B-788, orthogonal + pre-existing.** CUL-7 (PR 2) rerouted the **shipped** ⑤ detector through `lib/mealTiming.ts:nearestPrecedingFeeding`, whose strict `f.ms > best.ms` (`mealTiming.ts:302`) keeps the **first** of two same-ms feedings where v27's inline `nearestPreceding` kept the **last**. On a same-ms tie this flips ⑤'s `feedingFormsInEvidence` (`["FormB"]`→`["FormA"]`). Fuzz: 5,938/5,938 same-ms fires diverged on **this one field and nothing else** — no band, count, `eligibleCount`, rank, or firing decision moves, and the ⑤ card omits the form, so **no owner card changes**; but the label rides into the vet report. It is **ungated by B-777** because ⑤ is a shipped detector, not a v2 lane — outside this gate's remit.
- **Resolution (not expanding this PR):** the fix (align the shared G9 predicate to v27's last-of-equal-ms) also moves the client Patterns render + the report, so it is a Data/T&S + PM call → **filed B-788**. This PR (a) narrows the overclaimed "behaviour-preserving" comment on the ⑤ rewrite to name the exception, (b) pins the current tie-break in `lib/mealTiming.test.ts` so it can't drift again silently, and (c) corrects the "byte-identical" claim everywhere to "byte-identical for the composition + every owner-facing card; strict-field caveat = B-788."

**DoD line (verbatim):** Biostatistician: tried flag-off vs deployed-v27 across 12k fuzzed + boundary scenarios — v2 lanes/composition/timing_story/photoComposition gate cleanly, legacy ⑤→⑥ suppression byte-identical, onsets stripped both paths, ranking unchanged, eligibility fails closed ✓; BUT the ungated CUL-7 ⑤-refactor (`lib/mealTiming.ts:302`, strict `>`) flips the same-ms nearest-feeding tie-break, so a non-eligible account's ⑤ `feedingFormsInEvidence` changes (`["FormB"]`→`["FormA"]`) — evidence-only, no card/count/rank move, but strict byte-identity FAILS → B-788 ✗.

## GA & deploy status (unchanged except B-777)

- **B-777 is resolved.** The `generate-signal` redeploy is no longer blocked by a flag-off regression — the composition + every owner-facing card is byte-identical for a non-eligible account.
- **B-788 does NOT block the redeploy.** The one delta the fuzz found (the shipped ⑤ same-ms tie-break) moves no card/count/rank/firing — only the `feedingFormsInEvidence` label, which rides into the vet report. If strict *report* byte-identity is wanted, settle B-788 before the `generate-report` deploy (separately B-494-gated), not this one.
- **The deploy bundle must be REBUILT** — the shipped `a64c38d2…` predates this fix. Regenerate with `scripts/deploy-edge.sh generate-signal`, then deploy from the Codespace once the copy calls land.
- **Still GA/deploy-gating** (from the close-out, unchanged by this session): **B-766** (the trial card's pooled lead doesn't foot with its rows), the 3 server-template calls (the FEWER direction, the "two kinds of time" lead, **B-775** magnitude over-read), and B-768/769 (watching copy).
- The two **client** edges in the B-777 finding (the blank `live` stack; `gap_shortening` unhandled by `isSignalsV2Finding`/no renderer) are **flag-ON** concerns — unaffected by this flag-off fix, and now further insulated for flag-off (a non-eligible account never receives a v2 type). Their own follow-ups.

## Decision briefs (PM)

**1. `serverCost` re-characterization for the `signals_v2` beta row.**
- *Deciding:* whether the "Deeper signals" beta stays `serverCost: false` or flips to `true` now that approach A gates the v2 engine work server-side on eligibility.
- *Options:* **(A, recommended)** keep `false` — the lanes add no *metered/scaling* resource (no LLM, no extra DB read, no external call — deterministic CPU over already-fetched data); the eligibility gate exists for byte-identical output, not metering, so B-712's "server-cost ⇒ server gate" rule isn't triggered. **(B)** flip to `true` — the beta demonstrably has a server component and now a server gate; honest, but pulls `signals_v2` into **B-713's Phase-2 server-cost scope** and requires the `betaFeatures.test.ts` assertion to flip (the grep already finds `signals_v2` in an Edge Function).
- *Consequence:* (A) is a one-word status-quo with a corrected rationale; (B) is a scope decision about B-713. Code currently ships (A) with the comment corrected and the decision flagged.

**2. Spec `§5` amendment (Tier-2, awaiting PM approval — not written unilaterally).** The §5 rollout model still states "server additions are computed uniformly for every account (no per-cohort server cost → client gate sound)." B-777 falsifies that premise. Proposed edit: §5 records that the v2 lane emission + timing-lane composition + L3 decoration are gated **server-side on `signals_v2` eligibility** (the same allowlist the client resolves), so a non-eligible account runs the pre-v2 engine (byte-identical); the "uniform compute" sentence is replaced with "per-cohort by eligibility, which strengthens FR-FLAG-2 rather than weakening it." Migration `057`'s comment carries the same retired premise but is left untouched (an applied, point-in-time artifact; superseded by this record).

## DoD

- [x] **Byte-identical gate implemented** (option A) — lane emission + composition + suppression-rule + L3 decoration gated on `signals_v2` eligibility, fail-closed; resolved server-side via the same allowlist primitive as the client.
- [x] **Cross-deploy flag-off byte-identical test** — added (detection.test.ts B-777 block + paired flag-off tests in the trial/gap suites); flag-on fires each lane, flag-off drops it + reverts ⑤/⑥ + is deep-equal on a v2-silent input.
- [x] **Tests green** — 504 generate-signal deno / 1339 all-functions / 5120 jest; tsc + deno check clean.
- [x] **Adversarial review (mandatory)** — run (12k-scenario differential fuzz vs v27); the gate HELD on every axis; one orthogonal, pre-existing, low-severity delta surfaced (the shipped ⑤ mealTiming tie-break) → filed **B-788**, claim narrowed, tie-break pinned in `lib/mealTiming.test.ts`. Verdict + DoD line above.
- [x] **Anti-pattern scan** — no theme/RLS/sync/multi-pet violations (server-only logic change; the gate is additive and fail-closed).
- [x] **Persona sign-off** — Data/Adversarial (byte-identical guarantee) — Eng (fail-closed default, one gate for the whole v2 surface, legacy suppression restored verbatim/auditable) — QA (the flag-on/flag-off paired tests + the transparency deep-equal). Designer/Dr. Chen N/A (no copy, no clinical-logic change — the gate only decides *whether* v2 runs, never *what* it says).
- [x] **Tests exist for the new logic** — yes (the B-777 block + paired lane tests).
- [x] **No new secret.**

## Documentation updates

- **`docs/backlog.md`** — B-777 marked **Done — 2026-08-15 (option A)** with the resolution recorded (row kept per state-file hygiene).
- **STATUS.md** — the Signals v2 section's B-777 deploy-blocker updated to RESOLVED; the deploy-bundle note updated (rebuild required).
- **Spec `docs/nyx-signals-v2-requirements.md` §5** — proposed amendment flagged above (awaits PM approval).
- **`lib/betaFeatures.ts` / `.test.ts`** — the falsified "uniform compute" rationale corrected inline (comment-only; `serverCost` unchanged pending the PM brief).
