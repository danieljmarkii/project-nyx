import { useAllowlistFlag } from './useAppConfig';
import { useBetaOptIn } from '../lib/betaFeatures';

// The one gate every History v2 surface reads (History v2 · the record you can
// read, HV-1 / CUL-1158; spec §5.1, H-8). `live = eligible && optedIn`: the B-712
// two-gate shape (docs/nyx-beta-features-requirements.md §2) — eligibility is the
// server-owned `app_config.history_v2` allowlist (Gate 1), the opt-in is the
// owner's local Beta shelf switch (Gate 2), and being eligible turns nothing on.
//
// ONE hook for the same reason `useDesignV2` is one hook: the flag-off guard
// (guards/historyV2FlagOff.test.tsx) finds a consumer by its CALL SHAPE, and one
// name is one shape. So this is the only file allowed to read the key directly —
// the guard asserts `useAllowlistFlag('history_v2')` appears here and nowhere else
// — and a surface that reads `useHistoryV2()` is, by the same scan, a consumer that
// must draw through `components/historyV2/`.
//
// Render-only: fails CLOSED (unset / unreachable / signed-out / not yet hydrated ⇒
// false), and nothing behind the flag spends a server resource, so there is nothing
// server-side to re-check.
export function useHistoryV2(): boolean {
  const eligible = useAllowlistFlag('history_v2');
  const optedIn = useBetaOptIn('history_v2');
  return eligible && optedIn;
}
