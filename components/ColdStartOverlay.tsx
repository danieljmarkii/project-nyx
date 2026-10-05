import { useSyncStore } from '../store/syncStore';
import { usePetStore } from '../store/petStore';
import { ColdStartSilhouette } from './designV2/waits/ColdStartSilhouette';
import { TAB_HEIGHT } from './nav/NyxTabBar';

// B-054 §6 — the block-only-when-empty cold-start state.
//
// Shown ONLY while the first hydration after login is populating a genuinely empty
// local store (new device / reinstall / account switch after the sign-out wipe). It
// exists so a freshly-logged-in device never shows a bare, empty timeline that reads
// as data loss — the exact moment that kicked off B-054 (the PM's wife logging into
// the shared account on a second phone and seeing nothing).
//
// The wait is Home's own silhouette, which crossfades into Home when the store hydrates
// — no night screen, no takeover (Design v2 round 2, R2-4; D2-7 / CUL-1068, GA'd by
// CUL-1071). Gated on an active pet so it can never sit over onboarding: the silhouette
// is Home's shape, and Home exists only with a pet. Once local has data,
// foreground/reconnect re-syncs reconcile silently — coldStartHydrating is never set,
// so this never appears on a returning device.
export function ColdStartOverlay() {
  const coldStartHydrating = useSyncStore((s) => s.coldStartHydrating);
  const activePet = usePetStore((s) => s.activePet);
  const petName = activePet?.name;

  if (!petName) return null;

  return <ColdStartSilhouette hydrating={coldStartHydrating} tabBarHeight={TAB_HEIGHT} petName={petName} />;
}
