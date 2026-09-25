import { useEffect } from 'react';
import { useLocalSearchParams } from 'expo-router';

import { historyDoorRequestOf, historyDoorTapKey, type HistoryDoorParams } from '../lib/historyDoorParams';
import { isWidgetPetTapSpent } from '../lib/widgetPetTap';
import { useHistoryScopeStore } from '../store/historyScopeStore';
import { usePetStore } from '../store/petStore';
import { useWidgetPetLink } from './useWidgetPetLink';

// History v2's door (CUL-1164 / HV-7, CUL-1168 / HV-11; spec §5.8): every link into History
// lands in v2 on the filter, window or day it names. The reading is `lib/historyDoorParams.ts`;
// the senders are the rows of `lib/historyDoors.ts`; this hook applies a tap ONCE.
//
// It lives in `hooks/`, not in `components/historyV2/`, on purpose: the flag-off guard
// (`guards/historyV2FlagOff.test.tsx`) wraps every function a namespace module exports into a
// component, so a hook there would be a component under test and a hook in the app.
//
// ── ONCE PER TAP, ACROSS EVERY MOUNT (HV-11) ────────────────────────────────────
// The History tab stays mounted with a link's params in place, so a tap is spent (C-22),
// keyed by the sender's nonce (`ts`) and the request. HV-7 kept that in a ref, which is once
// per MOUNT, and the tab mounts a fresh screen when `history_v2` flips: flipping off and on
// again re-applied an old link over whatever the owner had chosen since. So the spent taps
// live at module scope, for the app's session, like the widget's pet (`lib/widgetPetTap.ts`).
// The first mount after a flip still applies a tap v2 has never seen: the screen that mounts
// lands where the link says, whichever screen the link was tapped on (AC 37).
//
// ── FOR THE PET IT NAMES ─────────────────────────────────────────────────────────
// The widget names its pet, and `useWidgetPetLink` switches to it once per tap (CUL-1119);
// the switch resets the scope (the scope store follows the pet store), so the request is
// applied to THAT pet's scope, in one update (`applyDoor`: the filter, the window and the
// landing agree however the link was built, AC 37). Both are read from the LIVE store, not
// the render's closure: the widget hook's effect runs first in the same flush and has
// already switched. While the switch is still to come (the pet list loading on a cold start)
// the request waits. Once the switch for this tap is spent and the owner is on another pet
// (they switched away before a flag flip mounted this screen), the link is over and is
// dropped: it never lands late, on whichever pet the owner reaches next. A pet the account
// no longer has is ignored, as the widget hook ignores it, and the request lands on the pet
// on screen.
const spentTaps = new Set<string>();

/** Tests only: forget every spent tap (module state outlives a test, not a test file). */
export function __resetHistoryDoorForTest(): void {
  spentTaps.clear();
}

export function useHistoryDoor(): void {
  const params = useLocalSearchParams<HistoryDoorParams & Record<string, string>>();
  useWidgetPetLink(params.pet, params.ts);

  // Subscribed so the effect re-runs when the pet list loads or the switch lands; read live
  // inside it.
  const activePetId = usePetStore((s) => s.activePet?.id ?? null);
  const petCount = usePetStore((s) => s.pets.length);

  const { date, day, src, ts, pet, type, window, course } = params;
  useEffect(() => {
    const doorParams: HistoryDoorParams = { date, day, src, ts, pet, type, window, course };
    const request = historyDoorRequestOf(doorParams);
    if (request === null) return;
    const tap = historyDoorTapKey(doorParams, request);
    if (spentTaps.has(tap)) return;
    const live = usePetStore.getState();
    const liveId = live.activePet?.id ?? null;
    if (liveId === null) return;
    const named = pet && live.pets.some((p) => p.id === pet) ? pet : null;
    if (named !== null && named !== liveId) {
      // The switch is still to come: wait for it.
      if (!isWidgetPetTapSpent(named, ts)) return;
      // The switch happened and the owner has left that pet since: the link is over.
      spentTaps.add(tap);
      return;
    }
    spentTaps.add(tap);
    useHistoryScopeStore.getState().applyDoor(liveId, request);
  }, [date, day, src, ts, pet, type, window, course, activePetId, petCount]);
}
