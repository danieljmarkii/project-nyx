import { useCallback } from 'react';
import { getDb } from '../lib/db';
import { readTodayEvents } from '../lib/todayEventsQuery';
import type { NyxEvent } from '../store/eventStore';
import { useEventStore } from '../store/eventStore';
import { usePetStore } from '../store/petStore';

export function useEvents() {
  const { activePet } = usePetStore();
  const { todayEvents, setTodayEvents, setTodayRead, prependEvent } = useEventStore();

  const loadTodayEvents = useCallback(async () => {
    if (!activePet) return;
    const db = getDb();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    // The read's state, per pet (C-12). A re-read for the SAME pet keeps `ready` — the
    // rows on screen are still that pet's and a skeleton over them on every sync tick
    // would flash; a switch or a cold open starts at `loading`.
    const prior = useEventStore.getState().todayRead;
    if (!prior || prior.petId !== activePet.id || prior.state === 'failed') {
      setTodayRead({ petId: activePet.id, state: 'loading' });
    }

    // The read is `readTodayEvents` (`lib/todayEventsQuery.ts`), whose header says why it
    // joins each table: the shared day row's rules read the meal's intake, the dose's
    // course, its stored pair and the weight (History v2 HV-6 / CUL-1163), the Noticed card
    // reads the look's child (CUL-871), and a dose names its drug on a cold open (B-161).
    // A field the query leaves out fails silently (an unrated meal, an unpaired dose), which
    // is why it is a constant a test runs against the real schema; and it decides the day
    // on parsed instants, since a row pulled at exactly midnight is spelled differently (C-40).
    try {
      const events = await readTodayEvents<NyxEvent>(db, activePet.id, todayStart);
      setTodayEvents(events);
      setTodayRead({ petId: activePet.id, state: 'ready' });
    } catch (e) {
      // No silent failures in the data path (house rule) — and the widened
      // medication JOIN gives the read more ways to fail (e.g. a cache table
      // not yet populated on a fresh install). Log and leave prior state intact;
      // a focus/refresh re-runs this load rather than blanking Today on a transient error.
      console.warn('[useEvents] loadTodayEvents failed:', e);
      setTodayRead({ petId: activePet.id, state: 'failed' });
    }
  }, [activePet, setTodayEvents, setTodayRead]);

  return { todayEvents, loadTodayEvents, prependEvent };
}
