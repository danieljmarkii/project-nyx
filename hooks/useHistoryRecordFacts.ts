// The record's facts for History v2's pinned row (HV-9 / CUL-1166; spec §3.2, §3.8, §3.9):
// one read of everything the pills and the two sheets count, for the active pet, kept
// fresh the way the list is (GAP-18: every count re-derives after a write, a removal, a
// sync or a refresh).
//
// WHEN IT READS. On mount; when a sync cycle lands rows (`hydrationTick`); when a log
// lands in today's list (a write, an Undo); and on a return to the tab, which is how an
// edit or a removal made on a record screen reaches it. Never while the tab is out of
// view: a tab stays mounted behind the others, and a whole-record read on every Home
// refresh would be work nobody sees, so a change made elsewhere is read once, on return.
//
// WHOSE ANSWER. Each answer is stamped with the pet it was read for and drawn only while
// that pet is on screen (CUL-1120's shape): a switch shows no numbers until the new pet's
// read answers, never the last pet's under the new pet's name. A newer read for the same
// pet replaces the last answer when it lands, so the numbers never blank between reads.
//
// A hook, not a component: nothing here lives in `components/historyV2/`, whose every
// exported function the flag-off guard wraps into a component.

import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { PHOTO_READING_OFF } from '../lib/historyControls';
import { readHistoryRecord, type HistoryRecordData } from '../lib/historyWindowFacts';
import { useEventStore } from '../store/eventStore';
import { usePetStore } from '../store/petStore';
import { useSyncStore } from '../store/syncStore';

export type HistoryRecordState =
  /** No answer for this pet yet: draw no number (C-12). */
  | { status: 'loading' }
  /** The read failed: still no number, and never a zero standing in for one. */
  | { status: 'error' }
  | { status: 'ready'; data: HistoryRecordData };

/** One loading answer, so a consumer memoising on the state sees no change between frames. */
const LOADING: HistoryRecordState = { status: 'loading' };

export function useHistoryRecordFacts(): HistoryRecordState {
  const { activePet } = usePetStore();
  const hydrationTick = useSyncStore((s) => s.hydrationTick);
  const todayEvents = useEventStore((s) => s.todayEvents);

  // In view. Mounted counts as in view, so the mount reads once; a blur and a return flip
  // it back to true, and the effect below re-runs on that change: the return's read.
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  const [answer, setAnswer] = useState<{ petId: string; state: HistoryRecordState } | null>(null);
  const petId = activePet?.id ?? null;
  const name = activePet?.name;
  const species = activePet?.species;
  const sex = activePet?.sex;

  useEffect(() => {
    if (!focused || !petId || !name || !species) return;
    let cancelled = false;
    readHistoryRecord({ id: petId, name, species, sex }, PHOTO_READING_OFF)
      .then((data) => {
        if (!cancelled) setAnswer({ petId, state: { status: 'ready', data } });
      })
      .catch((e: unknown) => {
        console.error('[useHistoryRecordFacts] reading the record failed:', e);
        if (!cancelled) setAnswer({ petId, state: { status: 'error' } });
      });
    return () => {
      cancelled = true;
    };
  }, [focused, petId, name, species, sex, hydrationTick, todayEvents]);

  return answer !== null && answer.petId === petId ? answer.state : LOADING;
}
