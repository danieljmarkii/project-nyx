import { useMemo } from 'react';
import { useAllowlistFlagsRaw } from './useAppConfig';
import { useAuthStore } from '../store/authStore';
import { deriveBetaShelf, useBetaOptInStore, type BetaShelfState } from '../lib/betaFeatures';

// The React binding for the beta-shelf derivation (B-747). One hook, two
// consumers — app/settings.tsx's Beta row (visible iff ≥1 eligible; the "N on"
// trailing count) and app/settings/beta.tsx's shelf (cards vs. the B-729 empty
// state) — so the two surfaces can never disagree about which betas an account
// can see.
//
// Shape matters here: each store is read in BULK, once (the raw allowlist map,
// the caller's uid, the opt-in map), and the reduce over BETA_REGISTRY happens in
// plain JS inside the pure deriveBetaShelf. A per-entry useAllowlistFlag call
// inside a BETA_REGISTRY.map() would put hooks in a loop (rules-of-hooks) — the
// shape app/settings.tsx's old comment warned against, retired by this hook.
//
// Render-only, like every allowlist read: eligibility fails CLOSED (unset /
// unreachable / signed-out ⇒ not eligible), and the server re-checks any
// server-cost gate authoritatively.
export function useBetaShelf(): BetaShelfState {
  const raw = useAllowlistFlagsRaw();
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const optIns = useBetaOptInStore((s) => s.optIns);
  return useMemo(() => deriveBetaShelf(raw, userId, optIns), [raw, userId, optIns]);
}
