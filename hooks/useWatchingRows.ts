import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { usePetStore } from '../store/petStore';
import { useSyncStore } from '../store/syncStore';
import { getWatchingRows, type WatchingRow } from '../lib/signalWatching';

// The Signals v2 watching-rows hook (B-755 / CUL-14, spec §4.4). Reads the active pet's
// local data and returns the per-lane watching rows for the Signal empty state — but
// ONLY when `enabled`. `enabled` is the caller's `signals_v2 && empty-state` gate
// (SignalZone), so when the flag is off, or the surface is `live`/`stale`, this hook does
// ZERO local reads and returns [] — the flag-off path stays byte-identical and pays no
// perf cost (the rows never render). The heavy read (vomit onsets + feedings + free-fed
// spans, through lib/mealTiming G9) is confined to exactly the flag-on empty moment.
//
// Rules of Hooks: called unconditionally by SignalZone; the gate is the `enabled`
// argument, never a conditional call. `dayNumber` comes from useSignal's local-day read
// (not re-read here), so the Change row's week count matches the E1 headline's.
export function useWatchingRows(enabled: boolean, dayNumber: number): WatchingRow[] {
  const { activePet } = usePetStore();
  const petId = activePet?.id ?? null;
  // Re-read on a completed regen too (a fresh log changes the local episode/gap counts),
  // mirroring useSignal — so the watching rows refresh after logging without a re-focus.
  const signalTick = useSyncStore((s) => s.signalTick);
  const [rows, setRows] = useState<WatchingRow[]>([]);

  // Synchronous clear on a pet switch OR a disable (React's adjust-state-while-rendering
  // pattern, as useSignal does): the previous pet's rows must never flash under the new
  // pet, and turning the surface `live` must drop the rows in the same render, not a tick
  // later. `key` is null whenever the rows should be empty, so one comparison covers both.
  const key = enabled && petId ? petId : null;
  const keyRef = useRef<string | null>(null);
  if (key !== keyRef.current) {
    keyRef.current = key;
    setRows([]);
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
      })();
      return () => {
        cancelled = true;
      };
    }, [enabled, petId, dayNumber, signalTick]),
  );

  return rows;
}
