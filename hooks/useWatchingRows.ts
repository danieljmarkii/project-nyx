import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { usePetStore } from '../store/petStore';
import { useSyncStore } from '../store/syncStore';
import { getWatchingRows, type WatchingRow } from '../lib/signalWatching';

// The Signals v2 watching-rows hook (B-755 / CUL-14, spec §4.4; GA'd CUL-548). Reads the
// active pet's local data and returns the per-lane watching rows for the Signal empty
// state — but ONLY when `enabled`. `enabled` is the caller's empty-state gate (SignalZone:
// `!showSkeleton && (state === 'building' || 'no_pattern')`), so when the surface is
// `live`/`stale` or the load skeleton shows, this hook does ZERO local reads and returns []
// (the rows never render, no perf cost). The heavy read (vomit onsets + feedings + free-fed
// spans, through lib/mealTiming G9) is confined to exactly the empty moment.
//
// Rules of Hooks: called unconditionally by SignalZone; the gate is the `enabled`
// argument, never a conditional call. `dayNumber` comes from useSignal's local-day read
// (not re-read here), so the Change row's week count matches the E1 headline's.
export function useWatchingRows(enabled: boolean, dayNumber: number): WatchingRow[] {
  return useWatchingRowsRead(enabled, dayNumber).rows;
}

/**
 * TS-5 (CUL-1301) — the rows AND whether the read behind them has answered. `answered` is
 * true when the surface is not enabled (no read is owed, and no row can render) or once the
 * read for the current pet has resolved; false while it is in flight. The trial strip's
 * week lane waits on it, because the escalate-only gap row arrives from this read and an
 * unanswered read is never "no gap row" (C-12). `getWatchingRows` is fail-quiet, so a
 * failed read resolves as answered with no rows, the same thing the zone draws.
 */
export function useWatchingRowsRead(
  enabled: boolean,
  dayNumber: number,
): { rows: WatchingRow[]; answered: boolean } {
  const { activePet } = usePetStore();
  const petId = activePet?.id ?? null;
  // Re-read on a completed regen too (a fresh log changes the local episode/gap counts),
  // mirroring useSignal — so the watching rows refresh after logging without a re-focus.
  const signalTick = useSyncStore((s) => s.signalTick);
  const [rows, setRows] = useState<WatchingRow[]>([]);
  const [answeredKey, setAnsweredKey] = useState<string | null>(null);

  // Synchronous clear on a pet switch OR a disable (React's adjust-state-while-rendering
  // pattern, as useSignal does): the previous pet's rows must never flash under the new
  // pet, and turning the surface `live` must drop the rows in the same render, not a tick
  // later. `key` is null whenever the rows should be empty, so one comparison covers both.
  const key = enabled && petId ? petId : null;
  const keyRef = useRef<string | null>(null);
  if (key !== keyRef.current) {
    keyRef.current = key;
    setRows([]);
    setAnsweredKey(null);
  }

  useFocusEffect(
    useCallback(() => {
      if (!enabled || !petId) {
        setRows([]);
        return;
      }
      let cancelled = false;
      (async () => {
        // getWatchingRows is fail-quiet (returns [] on any read error), so this never
        // rejects; the try/catch is belt-and-suspenders for the CLAUDE.md async rule.
        try {
          const next = await getWatchingRows(petId, dayNumber, Date.now());
          if (!cancelled) setRows(next);
        } catch {
          if (!cancelled) setRows([]);
        }
        if (!cancelled) setAnsweredKey(petId);
      })();
      return () => {
        cancelled = true;
      };
    }, [enabled, petId, dayNumber, signalTick]),
  );

  return { rows, answered: key === null || answeredKey === key };
}
