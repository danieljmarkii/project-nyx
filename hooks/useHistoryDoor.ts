import { useEffect, useRef } from 'react';
import { useLocalSearchParams } from 'expo-router';

import { historyDoorRequestOf, historyDoorTapKey, type HistoryDoorParams } from '../lib/historyDoorParams';
import { useHistoryScopeStore } from '../store/historyScopeStore';
import { usePetStore } from '../store/petStore';
import { useWidgetPetLink } from './useWidgetPetLink';

// History v2's door (CUL-1164 / HV-7; spec §5.8): the links that reach History today land in
// v2 from day one. The reading is `lib/historyDoorParams.ts`; this hook applies a tap ONCE.
// HV-11 (CUL-1168) owns it next: the registry, its guard, and any parameter a sender adds.
//
// It lives in `hooks/`, not in `components/historyV2/`, on purpose: the flag-off guard
// (`guards/historyV2FlagOff.test.tsx`) wraps every function a namespace module exports into a
// component, so a hook there would be a component under test and a hook in the app.
//
// ── ONCE PER TAP, FOR THE PET IT NAMES ─────────────────────────────────────────
// The History tab stays mounted with a link's params in place, so a tap is spent in a ref
// (C-22), keyed by the sender's nonce (`ts`) and the request. The widget names its pet, and
// `useWidgetPetLink` switches to it once per tap (CUL-1119); the switch resets the scope
// (the scope store follows the pet store), so the request waits until the pet it was made
// for is the active one and is then applied to THAT pet's scope, in one update
// (`applyDoor`: the filter, the window and the landing agree however the link was built,
// AC 37). A pet the account no longer has is ignored, as the widget hook ignores it, and the
// request lands on the pet on screen.
export function useHistoryDoor(): void {
  const params = useLocalSearchParams<HistoryDoorParams & Record<string, string>>();
  useWidgetPetLink(params.pet, params.ts);

  const activePetId = usePetStore((s) => s.activePet?.id ?? null);
  const pets = usePetStore((s) => s.pets);
  const spent = useRef<string | null>(null);

  const { date, day, src, ts, pet, type, window } = params;
  useEffect(() => {
    const doorParams: HistoryDoorParams = { date, day, src, ts, pet, type, window };
    const request = historyDoorRequestOf(doorParams);
    if (request === null || activePetId === null) return;
    const tap = historyDoorTapKey(doorParams, request);
    if (spent.current === tap) return;
    // The widget's pet first: its switch is applied by `useWidgetPetLink`, and the scope it
    // resets must be the one this request writes to.
    if (pet && pet !== activePetId && pets.some((p) => p.id === pet)) return;
    spent.current = tap;
    useHistoryScopeStore.getState().applyDoor(activePetId, request);
  }, [date, day, src, ts, pet, type, window, activePetId, pets]);
}
