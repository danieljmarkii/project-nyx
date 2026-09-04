// The last-episode date for the standing safety strips (CUL-785, fold spec §3.4).
//
// A folded chronicity or worsening strip ends with the DATE of the pet's most recent episode
// of that symptom — a date, never a days-since counter (Dr. Chen: a ticking "N days since"
// on an always-visible strip is a countdown to relief). The source of truth is the LOCAL
// RECORD, not the cached finding: `MAX(occurred_at)` over the pet's non-deleted events of
// the finding's `symptomType` (the engine maps `event_type` → `symptomType` one-to-one, so
// one key per query and no symptom list to register — C-11). The engine's own recency
// (`daysSinceLastEpisode`) is up to a day stale by the cache TTL and is the FALLBACK, applied
// by the zone through `chronicityLastEpisodeFallbackIso` when this read did not answer.
//
// SYNCHRONOUS, MEMOIZED ON THE TICKS. The read is one indexed aggregate per symptom type
// (`idx_events_pet_occurred`, partial on `deleted_at IS NULL`) and runs inside a `useMemo`,
// so the FIRST PAINT of a strip already carries the record's date — a date that flipped a
// frame after mount would look like the pet moved. It re-runs on `hydrationTick` (a sync
// cycle or a pull-to-refresh landed other-device rows), on `signalTick` (the post-log regen
// settled — the same moment the fold reconciles), and on every focus (a log sheet closing
// over Home), the same triggers `useSignal` reads on.
//
// KEYED ON THE PET THE FINDINGS BELONG TO. The memo's inputs are the pet id and the symptom
// set; a pet switch re-runs it synchronously in the same render, so a strip can never print
// the previous pet's last episode over the new pet's card.
//
// `null` per type means EITHER the read did not answer OR the record holds no such event
// (`MAX()` over zero rows is null). The two are deliberately not told apart: a standing
// safety finding exists only because episodes were logged, so "no rows" is itself a sign the
// local record is incomplete (a fresh install before hydration), and both cases want the
// same outcome — no date printed, the fold's witness left untouched (`keepWitnesses`).

import { useCallback, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { getDb } from '../lib/db';
import { useSyncStore } from '../store/syncStore';

/** Symptom type → the ISO of the pet's most recent logged episode, or `null` if unread. */
export type LastEpisodeDates = Readonly<Record<string, string | null>>;

/**
 * One read, exported so the hook's SQL shape has a direct test: the pet's newest non-deleted
 * event of `symptomType`, or `null` when there is none or the store did not answer.
 */
export function readLastEpisodeIso(petId: string, symptomType: string): string | null {
  try {
    const rows = getDb().getAllSync<{ last: string | null }>(
      `SELECT MAX(occurred_at) AS last FROM events
       WHERE pet_id = ? AND event_type = ? AND deleted_at IS NULL`,
      [petId, symptomType],
    );
    return rows[0]?.last ?? null;
  } catch {
    return null;
  }
}

export function useLastEpisodeDates({
  petId,
  symptomTypes,
}: {
  petId: string | null;
  /** The symptom types of the findings that will show a date (order-insensitive). */
  symptomTypes: readonly string[];
}): LastEpisodeDates {
  const hydrationTick = useSyncStore((s) => s.hydrationTick);
  const signalTick = useSyncStore((s) => s.signalTick);
  // A focus is a tick too: Home regaining focus after a log sheet is when a new episode is
  // most likely to have landed locally without any sync or regen having ticked yet. The
  // focus that accompanies the mount is skipped — the first render already read.
  const [focusTick, setFocusTick] = useState(0);
  const mountFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (mountFocus.current) {
        mountFocus.current = false;
        return;
      }
      setFocusTick((t) => t + 1);
    }, []),
  );
  // Content key, not array identity — the zone rebuilds the type list every render.
  const typesKey = [...new Set(symptomTypes)].sort().join('|');

  return useMemo<LastEpisodeDates>(() => {
    if (!petId || typesKey === '') return {};
    const out: Record<string, string | null> = {};
    for (const t of typesKey.split('|')) out[t] = readLastEpisodeIso(petId, t);
    return out;
    // The ticks are inputs by intent: they are what says "the record may have moved".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId, typesKey, hydrationTick, signalTick, focusTick]);
}
