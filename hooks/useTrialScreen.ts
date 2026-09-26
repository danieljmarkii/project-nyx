import { useAllowlistFlag } from './useAppConfig';
import { useBetaOptIn } from '../lib/betaFeatures';

// The one gate every trial-screen surface reads (Diet trial — its own screen, TS-0 /
// CUL-1296; spec §0.2 T-2, §7). `live = eligible && optedIn`: the B-712 two-gate
// shape (docs/nyx-beta-features-requirements.md §2) — eligibility is the
// server-owned `app_config.trial_screen` allowlist (Gate 1), the opt-in is the
// owner's local Beta shelf switch (Gate 2), and being eligible turns nothing on.
//
// ONE hook for the same reason `useHistoryV2` is one hook: the flag-off guard
// (guards/trialScreenFlagOff.test.tsx) finds a consumer by its CALL SHAPE, and one
// name is one shape. So this is the only file allowed to read the key directly —
// the guard asserts `useAllowlistFlag('trial_screen')` appears here and nowhere
// else — and a surface that reads `useTrialScreen()` is, by the same scan, a
// consumer that must draw through `components/trialScreen/`.
//
// Render-only: fails CLOSED (unset / unreachable / signed-out / not yet hydrated ⇒
// false), and nothing behind the flag spends a server resource, so there is nothing
// server-side to re-check.
export function useTrialScreen(): boolean {
  const eligible = useAllowlistFlag('trial_screen');
  const optedIn = useBetaOptIn('trial_screen');
  return eligible && optedIn;
}
