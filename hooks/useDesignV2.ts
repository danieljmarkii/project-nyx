import { useAllowlistFlag } from './useAppConfig';
import { useBetaOptIn } from '../lib/betaFeatures';

// The one gate every Design v2 surface reads (Design v2 — the whole day, D2-0 /
// CUL-1062). `live = eligible && optedIn`: the B-712 two-gate shape
// (docs/nyx-beta-features-requirements.md §2) — eligibility is the server-owned
// `app_config.design_v2` allowlist (Gate 1), the opt-in is the owner's local Beta
// shelf switch (Gate 2), and being eligible turns nothing on.
//
// ONE hook rather than the two reads at every call site (the AppointmentStrip
// shape) for a reason that is about the guard, not tidiness: the flag-off guard
// (guards/designV2FlagOff.test.tsx) finds a consumer by its CALL SHAPE, and one
// name is one shape. So this is the only file allowed to read the key directly —
// the guard asserts `useAllowlistFlag('design_v2')` appears here and nowhere else
// — and a surface that reads `useDesignV2()` is, by that same scan, a consumer
// that must draw through `components/designV2/`.
//
// Render-only, like every allowlist read: fails CLOSED (unset / unreachable /
// signed-out / not yet hydrated ⇒ false), and there is nothing server-side to
// re-check because nothing behind this flag spends a server resource.
export function useDesignV2(): boolean {
  const eligible = useAllowlistFlag('design_v2');
  const optedIn = useBetaOptIn('design_v2');
  return eligible && optedIn;
}
