import { useSyncStore } from '../store/syncStore';
import { usePetStore } from '../store/petStore';
import { NightMoment } from './brand/NightMoment';

// B-054 §6 — block-only-when-empty cold-start state, rebuilt onto the B-284 §6 night
// moment (the marquee full-screen wait: night → dissolve → Home).
//
// Shown ONLY while the first hydration after login is populating a genuinely empty
// local store (new device / reinstall / account switch after the sign-out wipe). It
// exists so a freshly-logged-in device never shows a bare, empty timeline that reads
// as data loss — the exact moment that kicked off B-054 (the PM's wife logging into
// the shared account on a second phone and seeing nothing).
//
// Gated on an active pet so it can never flash over onboarding: a brand-new account
// also starts with an empty local store, but has no pet yet, so this stays hidden and
// the normal "Nothing logged yet" empty states take over once the (instant) empty
// hydration resolves. Once local has data, foreground/reconnect re-syncs reconcile
// silently — coldStartHydrating is never set, so this never appears on a returning device.
//
// The NightMoment stays mounted while a pet exists (returning null only before a pet
// resolves) so its dissolve-to-Home can play when hydration finishes — the overlay
// toggles `visible`, the moment owns the min-hold + fade-out (§6). The headline REQUIRES
// the pet name, so there is no meaningful version before usePet resolves the pet; on an
// existing account the pet lands fast (typically alongside the hydration), so that
// pre-pet window is short and is NOT the misleading populated-but-empty timeline B-054
// fixes — we accept it rather than render a nameless "Catching up on 's history…".
export function ColdStartOverlay() {
  const coldStartHydrating = useSyncStore((s) => s.coldStartHydrating);
  const activePet = usePetStore((s) => s.activePet);
  const petName = activePet?.name;

  if (!petName) return null;

  return (
    <NightMoment
      visible={coldStartHydrating}
      title={`Catching up on ${petName}'s history…`}
      subtitle="This only takes a moment."
    />
  );
}
