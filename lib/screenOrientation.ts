// The app is portrait; one route may turn (PM ruling (b) on CUL-2299's landscape fork, recorded
// on CUL-2298 2026-11-02). `app.json` declares `orientation: "default"` so the binary CAN rotate,
// and `expo-screen-orientation`'s `initialOrientation: "PORTRAIT_UP"` holds iOS to portrait from
// the first native frame. Android has no such plist default, so the root also locks portrait
// here at start. Exam-room mode (VR2-19) is the one route that unlocks, through
// `useRotationUnlocked`, and relocks portrait when it leaves.
//
// REQUIRED LAZILY, the `lib/reportSendActions.ts` / `lib/vetDocumentPickers.ts` precedent: the
// module calls `requireNativeModule` at import, which throws on any binary built before this
// dependency (today's dev client and TestFlight build). On those binaries the plist is still
// portrait-only, so a missing module changes nothing: every call here is a quiet no-op.
//
// Every call is fire-and-forget and never throws: an orientation that could not be set is a
// layout inconvenience, never a reason to fail a screen.

import { useEffect } from 'react';

type OrientationModule = typeof import('expo-screen-orientation');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const requireOrientation = (): unknown => require('expo-screen-orientation');

/** The module, or null on a binary built without it. Injected in tests. */
export function loadOrientation(load: () => unknown = requireOrientation): OrientationModule | null {
  try {
    return load() as OrientationModule;
  } catch {
    return null;
  }
}

export async function lockPortrait(mod: OrientationModule | null = loadOrientation()): Promise<void> {
  if (!mod) return;
  try {
    await mod.lockAsync(mod.OrientationLock.PORTRAIT_UP);
  } catch (e) {
    console.warn('[screenOrientation] portrait lock failed:', e);
  }
}

export async function unlockRotation(mod: OrientationModule | null = loadOrientation()): Promise<void> {
  if (!mod) return;
  try {
    await mod.unlockAsync();
  } catch (e) {
    console.warn('[screenOrientation] unlock failed:', e);
  }
}

/**
 * For the one route that may turn: rotation is unlocked while `active` and the screen is
 * mounted, and portrait is locked again when either ends.
 */
export function useRotationUnlocked(active: boolean): void {
  useEffect(() => {
    if (!active) return undefined;
    void unlockRotation();
    return () => {
      void lockPortrait();
    };
  }, [active]);
}
