# Signal GA — Phase 1: retire both Signal flags client-side (CUL-547 + CUL-548)

**Date:** 2026-08-20

Shipped via **#690** (draft). Executes **Phase 1** of the CUL-546 GA plan — one combined client-removal PR covering CUL-547 (`signal_design_v2`) + CUL-548 (`signals_v2`), per the "phase-per-session" comment on CUL-546. Branch `claude/retire-signal-flags-phase-1-da01sx`, off `main` at #689 (Phase 0).

## What shipped

The PM called GA on the Signal/Home design uplift and the Signals-v2 lanes after dogfooding both flag-on. This PR retires the **client** half of both flags — the uplift receipts/register/empty-states and the v2 timing-story / trial / watching surfaces now render **unconditionally**, and the pre-uplift flag-off render path is deleted.

- **`lib/appConfig.ts`** — dropped `signal_design_v2` + `signals_v2` from `ALLOWLIST_FLAG_KEYS` / `ALLOWLIST_FLAGS_UNSET` (the two keys are no longer in the client `AllowlistFlagKey` union).
- **`lib/betaFeatures.ts`** — removed both `BETA_REGISTRY` rows (registry 4 → 2). A persisted opt-in for either key self-cleans (`parseBetaOptIns` keeps only known keys) — no storage migration.
- **`components/home/SignalZone.tsx` / `InsightCard.tsx`** — deleted the flag reads, the flag-off components (`BuildingState` / `NoPatternState`), the `designV2` / `signalsV2` props, and the LiveStack v2-type filter. E1/E2, the SR-3 register (receded chrome + ack line), the watching system, and the v2 story/trial cards are now the only path.
- **Un-gated every consumer the key-removal would otherwise break to compile:** `app/insights/{index,timing,trial}.tsx` (the panels/routes render on data presence; the `!signalsV2` "not available yet" leak guards removed), `hooks/useDietTrial.ts` (now passes `signalsV2: true` — `lib/dietTrialFacts.ts` untouched, still gates its own read on `isTrialRunning`), `app/settings/beta.tsx` (the two `presentationFor` cases removed).
- **Folded away** the now-unused `isSignalsV2Finding` predicate and the dead pre-uplift `buildingIntro` / `noPatternIntro` copy (only their own voice test referenced them). Swept the residual "behind the flag" / "flag-off byte-identical" comments across the touched files + `useWatchingRows.ts` / `TrialStrip.tsx` / `lib/signal.ts`.
- **Tests:** deleted the FR-FLAG-2 byte-identical-off suites + the InsightCard/SignalZone flag-off snapshots (the off path no longer exists — deleting them is the point). Rewrote `SignalZone.test.tsx` / `InsightCard.test.tsx` so the uplift/v2 behavior is the default; **kept the G10 unknown-type null-render contract test**. Trimmed `betaFeatures.test` (→2), `appConfig.test` (dropped the two key describes), `session.test` (wipe fixture), `signalCopy.test`, `useDietTrial.test`, and both insights suites.

## The load-bearing constraint that survived untouched

**B-789 `fewer_during_trial` safety suppression.** SignalZone's LiveStack drops a reassuring `trial_response` card over a not-eating record. This is a **safety gate, not a beta gate** — it was verified to have never been coupled to the removed flags, and after the removal it depends only on `suppressTrialResponse` + `comparisonDirection` (still preserving the `more_during_trial` escalation, per the direction-aware adversarial ruling). The 5 B-789 tests pass with no flag mocking.

## Scope discipline (untouched by design, per CUL-546's ordering rules)

- **`supabase/functions/**`** — the server-side B-777 `signals_v2` eligibility gate stays until **GA-3**. A gate-free client against the still-gated server is safe: it receives pre-v2 payload and renders the shipped types (v2 renderers fire only when v2 types arrive). The Edge Functions deno CI job stayed green, confirming the server code is unaffected.
- **The two `app_config` rows** — old builds still read them; deleted at **GA-4**.
- **`widget_enabled` / `log_picker_v2` betas** — the shelf, `resolveAllowlistFlag`, `useAllowlistFlag`, and the opt-in store all stay. This removed two registry rows and two keys, never the mechanism.

## Verification / review

- `tsc --noEmit` clean; full `jest --ci` green — **241 suites / 5362 tests**. Both required CI checks green + the B-514 non-UTC-timezone job green (the diff changes no date/time logic).
- **`code-reviewer` verdict: ship-ready** — no correctness bugs. It confirmed the SignalZone ternary collapse preserves the original nesting, the InsightCard registry+G10 subtraction is clean, B-789 is intact and decoupled, Rules-of-Hooks are clean (no hook after a conditional return in any touched file), and the `useDietTrial` threading has no dead state. Its one CLEANUP finding (dead `buildingIntro`/`noPatternIntro`) was already resolved in-PR; the five stale-comment nits it flagged were swept in the second commit.
- **Adversarial review: N/A** — this PR removes gating around already-shipped, already-tested detection/safety logic; it changes no detection/correlation/escalation math. (The code-reviewer independently reached the same conclusion.)

## The one small judgment call

The two removed copy helpers (`buildingIntro`/`noPatternIntro`) and the `isSignalsV2Finding` predicate were not in the child issues' literal file-scope lists, but they were the pre-uplift path's own dead code once their last render caller was deleted. Removing them (vs. leaving dead exports) completes the "delete the flag-off render path" intent and avoids the beta-graveyard smell — `staleIntro` (still live on the `stale` branch) was kept and re-tested.

## Residuals / next

- **CUL-527** (empty-`live` stack displayState) stays open and gets *narrower* after this PR — the `signals_v2` filter was one of its two suppression sources; B-789's remains. Not fixed in passing (scope discipline).
- **Next per CUL-546:** Phase 2 = the `app_config` flip (CUL-549), gated on the GA build being on the PM's device (the human gate). Then Phase 3 = CUL-550 (server B-777 gate removal + Codespace redeploy) then CUL-551 (row-deletion migration + Tier-2 doc closeout + close stale track issues).
