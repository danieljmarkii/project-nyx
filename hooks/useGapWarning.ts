import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { usePetStore } from '../store/petStore';
import { useSyncStore } from '../store/syncStore';
import { getGapWarning } from '../lib/signalWatching';

export interface GapWarningRead {
  text: string | null;
  answered: boolean;
  // The last read threw. Never "no warning": the zone draws a failure line in place of the
  // quiet line (CUL-1943, C-12). `text` keeps any sentence an earlier read found.
  failed: boolean;
  retry: () => void;
}

// The Signal's gap warning, read for the active pet (CUL-1838; the watching-rows hook it
// replaces read three lanes, and two retired with the quiet line). `enabled` is the zone's
// gate — off while the load skeleton shows, on in every other state, `stale` included
// (CUL-1468: a record that has gone quiet is exactly when the warning must still show).
//
// Rules of Hooks: called unconditionally; the gate is the argument, never a conditional call.
export function useGapWarning(enabled: boolean): GapWarningRead {
  const { activePet } = usePetStore();
  const petId = activePet?.id ?? null;
  // Re-read on a completed regen too (a fresh log moves the gaps and the logged clock).
  const signalTick = useSyncStore((s) => s.signalTick);
  const [retryTick, setRetryTick] = useState(0);
  const [text, setText] = useState<string | null>(null);
  const [answeredKey, setAnsweredKey] = useState<string | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);

  // Synchronous clear on a pet switch or a disable (adjust-state-while-rendering, as
  // useSignal does): one pet's warning must never flash under another pet's name.
  const key = enabled && petId ? petId : null;
  const keyRef = useRef<string | null>(null);
  if (key !== keyRef.current) {
    keyRef.current = key;
    setText(null);
    setAnsweredKey(null);
    setFailedKey(null);
  }

  useFocusEffect(
    useCallback(() => {
      if (!enabled || !petId) {
        setText(null);
        return;
      }
      let cancelled = false;
      (async () => {
        try {
          const next = await getGapWarning(petId, Date.now());
          if (!cancelled) {
            setText(next);
            setFailedKey(null);
          }
        } catch (e) {
          // Said, not swallowed, and never drawn as "no warning" (CUL-1943). The last
          // sentence stays: a re-read that throws must not drop a warning already on screen.
          console.warn('[useGapWarning] gap read failed:', e);
          if (!cancelled) setFailedKey(petId);
        }
        if (!cancelled) setAnsweredKey(petId);
      })();
      return () => {
        cancelled = true;
      };
    }, [enabled, petId, signalTick, retryTick]),
  );

  const retry = useCallback(() => setRetryTick((n) => n + 1), []);

  return {
    text,
    answered: key === null || answeredKey === key,
    failed: key !== null && failedKey === key,
    retry,
  };
}
