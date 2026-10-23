import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { usePetStore } from '../store/petStore';
import { useSyncStore } from '../store/syncStore';
import { getGapWarningRead } from '../lib/signalWatching';

// The time box on every read, first or re-read (adversarial pass, CUL-1943): a hung re-read
// after a calm answer must not leave that calm standing while a fresh log may have moved the
// gaps. The same beat as the Signal's own load skeleton (B-734).
export const GAP_READ_TIMEOUT_MS = 1500;

// The longest Home goes between gap reads while it stays focused (CUL-1949). The warning
// can come back with the clock alone (48h of silence drops out of the logged clock), so
// each read schedules the next at the instant `nextGapChangeMs` names; this ceiling is the
// backstop for a boundary that function does not know, and keeps the delay inside
// setTimeout's 32-bit range.
export const GAP_REREAD_CEILING_MS = 60 * 60_000;

export interface GapWarningRead {
  text: string | null;
  answered: boolean;
  // The last read threw, or has not answered within GAP_READ_TIMEOUT_MS. Never "no warning":
  // the zone draws a failure line in place of the quiet line (CUL-1943, C-12). `text` keeps
  // any sentence an earlier read found.
  failed: boolean;
  retry: () => void;
  // A read is in flight right now, first or re-read. The zone holds the arrival's decision
  // on it: a regen's tick starts both the state change and the re-read that may find a
  // warning, so a celebration decided before the re-read answers can land over one
  // (adversarial pass 2, CUL-1943).
  reading: boolean;
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
  // And on a local write that moved the record (CUL-1947): a log from the root log sheet
  // leaves Home focused, so no focus re-run fires, and a failed regen bumps no signalTick.
  const recordTick = useSyncStore((s) => s.recordTick);
  // And on a completed sync: a restore or a time edit can land from the server or another
  // device, and there is no local restore of an event to bump recordTick.
  const hydrationTick = useSyncStore((s) => s.hydrationTick);
  const [retryTick, setRetryTick] = useState(0);
  // Bumped by the clock (CUL-1949): no log, sync or focus fires when time alone moves the
  // answer, and a phone kept awake on Home sees none of those.
  const [clockTick, setClockTick] = useState(0);
  const [text, setText] = useState<string | null>(null);
  const [answeredKey, setAnsweredKey] = useState<string | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [readingKey, setReadingKey] = useState<string | null>(null);
  // When the oldest still-unsettled read for this pet began. A burst of ticks re-runs the
  // effect faster than the box, so each run measures from this, never from its own start:
  // a hung read must not keep the calm up by being asked again (adversarial pass 2, R2).
  const outstandingSince = useRef<{ petId: string; at: number } | null>(null);

  // Synchronous clear on a pet switch or a disable (adjust-state-while-rendering, as
  // useSignal does): one pet's warning must never flash under another pet's name.
  const key = enabled && petId ? petId : null;
  const keyRef = useRef<string | null>(null);
  if (key !== keyRef.current) {
    keyRef.current = key;
    setText(null);
    setAnsweredKey(null);
    setFailedKey(null);
    setReadingKey(null);
  }

  useFocusEffect(
    useCallback(() => {
      if (!enabled || !petId) {
        setText(null);
        return;
      }
      let cancelled = false;
      let settled = false;
      let clockTimer: ReturnType<typeof setTimeout> | null = null;
      setReadingKey(petId);
      const now = Date.now();
      if (outstandingSince.current?.petId !== petId) outstandingSince.current = { petId, at: now };
      const since = outstandingSince.current;
      // Past the box, the read is failed until it answers (a late answer still lands below).
      const timeout = setTimeout(() => {
        if (!cancelled && !settled) {
          console.warn('[useGapWarning] gap read did not answer in time');
          setFailedKey(petId);
          setAnsweredKey(petId);
        }
      }, Math.max(0, since.at + GAP_READ_TIMEOUT_MS - now));
      (async () => {
        // A failed read waits out the ceiling: it knows no boundary.
        let nextChangeMs: number | null = null;
        try {
          const next = await getGapWarningRead(petId, Date.now());
          nextChangeMs = next.nextChangeMs;
          if (!cancelled) {
            setText(next.text);
            setFailedKey(null);
          }
        } catch (e) {
          // Said, not swallowed, and never drawn as "no warning" (CUL-1943). The last
          // sentence stays: a re-read that throws must not drop a warning already on screen.
          console.warn('[useGapWarning] gap read failed:', e);
          if (!cancelled) setFailedKey(petId);
        }
        settled = true;
        clearTimeout(timeout);
        // Any read that settles, even a superseded one, proves the store is answering.
        if (outstandingSince.current === since) outstandingSince.current = null;
        if (!cancelled) {
          setAnsweredKey(petId);
          setReadingKey(null);
          const untilChange = nextChangeMs === null ? Infinity : nextChangeMs - Date.now();
          clockTimer = setTimeout(
            () => setClockTick((n) => n + 1),
            Math.max(0, Math.min(untilChange, GAP_REREAD_CEILING_MS)),
          );
        }
      })();
      // Blur, unmount, a pet switch and every re-run clear the schedule: one timer at most.
      return () => {
        cancelled = true;
        clearTimeout(timeout);
        if (clockTimer !== null) clearTimeout(clockTimer);
      };
    }, [enabled, petId, signalTick, recordTick, hydrationTick, retryTick, clockTick]),
  );

  const retry = useCallback(() => setRetryTick((n) => n + 1), []);

  return {
    text,
    answered: key === null || answeredKey === key,
    failed: key !== null && failedKey === key,
    retry,
    reading: key !== null && readingKey === key,
  };
}
