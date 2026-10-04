// The record's facts for History v2's pinned row (HV-9 / CUL-1166, CUL-1228; spec §3.2,
// §3.8, §3.9): everything the pills and the two sheets count, for the active pet.
//
// ONE READ, NOT TWO (CUL-1228). The row no longer reads the record for itself. The list's
// load reads it once (`readHistoryRecord`) and publishes it on the same snapshot as the
// window it slices, so the pills and the count line land in one store update: there is no
// moment after a write when one has re-read and the other has not, and a two-year record
// is read once per refresh rather than twice. The row's freshness is the list's (GAP-18):
// a write, a removal, a sync, a pull, a return to the tab and midnight each reload the list,
// and every one of those reads the record fresh.
//
// WHOSE ANSWER. The record is drawn only while it is for the pet on screen and the day the
// list shows (`useHistoryToday`), CUL-1120's shape: a switch, or midnight, shows no numbers
// until the new read answers, never the last pet's under the new pet's name nor yesterday's
// under today's window. The record does not depend on the filter, the window or the search,
// so a scope change keeps the pills while the list reads the new scope. A newer read for
// the same pet and day replaces the last answer when it lands, so the numbers never blank
// between reads.
//
// A hook, not a component: nothing here lives in `components/historyV2/`, whose every
// exported function the flag-off guard wraps into a component.

import { useMemo } from 'react';
import type { HistoryRecordData } from '../lib/historyWindowFacts';
import { useHistoryListStore, useHistoryToday } from '../store/historyListStore';
import { usePetStore } from '../store/petStore';

export type HistoryRecordState =
  /** No answer for this pet yet: draw no number (C-12). */
  | { status: 'loading' }
  /** The list's latest load failed with nothing for this pet and day to draw: still no
   *  number, and never a zero standing in for one. A new load clears it. */
  | { status: 'error' }
  | { status: 'ready'; data: HistoryRecordData };

/** One answer per state, so a consumer memoising on the state sees no change between frames. */
const LOADING: HistoryRecordState = { status: 'loading' };
const ERROR: HistoryRecordState = { status: 'error' };

export function useHistoryRecordFacts(): HistoryRecordState {
  const petId = usePetStore((s) => s.activePet?.id ?? null);
  const day = useHistoryToday();
  const record = useHistoryListStore((s) => s.snapshot?.record ?? null);
  const failed = useHistoryListStore((s) => s.failedRequest !== null);
  const drawn = record !== null && petId !== null && record.petId === petId && record.windowFacts.today === day ? record : null;
  return useMemo<HistoryRecordState>(
    () => (drawn !== null ? { status: 'ready', data: drawn } : failed ? ERROR : LOADING),
    [drawn, failed],
  );
}
