// The record's facts for History v2's pinned row (HV-9 / CUL-1166; spec §3.2, §3.8, §3.9):
// one read of everything the pills and the two sheets count, for the active pet, kept
// fresh the way the list is (GAP-18: every count re-derives after a write, a removal, a
// sync or a refresh).
//
// WHEN IT READS. On mount; when a sync cycle lands rows (`hydrationTick`); after a pull to
// refresh (`pullTick`: a pull syncs without moving the hydration tick); when a log lands in
// today's list (a write, an Undo); and on a return to the tab, which is how an edit or a
// removal made on a record screen reaches it. Never while the tab is out of
// view: a tab stays mounted behind the others, and a whole-record read on every Home
// refresh would be work nobody sees, so a change made elsewhere is read once, on return.
//
// ACROSS MIDNIGHT. Each read is for the day the list shows (`useHistoryToday`), taken at an
// instant on that day (`instantOnDay`), and the row resolves every window against the
// answer's day. The list's clock moves at midnight, and that tick re-reads here, so the
// pills and the count line are never on two sides of midnight: a screen left open through
// it no longer counts yesterday under the window the count line has moved to today (C-3).
//
// WHOSE ANSWER. Each answer is stamped with the pet and the day it was read for, and drawn
// only while both are on screen (CUL-1120's shape): a switch, or midnight, shows no numbers
// until the new read answers, never the last pet's under the new pet's name nor yesterday's
// under today's window. A newer read for the same pet and day replaces the last answer
// when it lands, so the numbers never blank between reads.
//
// A hook, not a component: nothing here lives in `components/historyV2/`, whose every
// exported function the flag-off guard wraps into a component.

import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { PHOTO_READING_OFF } from '../lib/historyControls';
import { instantOnDay } from '../lib/historyScreen';
import { readHistoryRecord, type HistoryRecordData } from '../lib/historyWindowFacts';
import { useEventStore } from '../store/eventStore';
import { useHistoryListStore, useHistoryToday } from '../store/historyListStore';
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
  const pullTick = useHistoryListStore((s) => s.pullTick);
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

  // The day the list shows (its clock moves at midnight): the read is for it, and the list's
  // tick re-reads here.
  const day = useHistoryToday();
  const [answer, setAnswer] = useState<{ petId: string; day: string; state: HistoryRecordState } | null>(null);
  const petId = activePet?.id ?? null;
  const name = activePet?.name;
  const species = activePet?.species;
  const sex = activePet?.sex;

  useEffect(() => {
    if (!focused || !petId || !name || !species) return;
    let cancelled = false;
    readHistoryRecord({ id: petId, name, species, sex }, PHOTO_READING_OFF, instantOnDay(day, Date.now()))
      .then((data) => {
        if (!cancelled) setAnswer({ petId, day, state: { status: 'ready', data } });
      })
      .catch((e: unknown) => {
        console.error('[useHistoryRecordFacts] reading the record failed:', e);
        if (!cancelled) setAnswer({ petId, day, state: { status: 'error' } });
      });
    return () => {
      cancelled = true;
    };
  }, [focused, petId, name, species, sex, hydrationTick, pullTick, todayEvents, day]);

  return answer !== null && answer.petId === petId && answer.day === day ? answer.state : LOADING;
}
