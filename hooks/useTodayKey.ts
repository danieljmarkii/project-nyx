import { useEffect, useState } from 'react';
import { toLocalDayKey } from '../lib/utils';
import { useAppActive } from './useAppActive';

// Today's LOCAL day key ('YYYY-MM-DD'), kept true across midnight (CUL-1221).
//
// Home can sit open, or in the background, past midnight. A date read once at render
// then names yesterday, and the coverage door's window (which ends YESTERDAY) keeps
// counting a day that has become today's yesterday. So the key is re-read on the two
// occasions it can change under a mounted screen: the next local midnight (a timer armed
// for it) and the return to the foreground (a backgrounded timer does not fire on iOS).
// The key only changes when the day does, so a consumer's effect keyed on it re-runs
// once a day, not once a render.

/** A little past midnight, so a timer that fires a hair early still lands on the new day. */
const PAST_MIDNIGHT_MS = 1_000;

function msUntilNextLocalMidnight(nowMs: number): number {
  const next = new Date(nowMs);
  next.setHours(24, 0, 0, 0); // local midnight tomorrow; DST-safe because it is local
  return Math.max(0, next.getTime() - nowMs) + PAST_MIDNIGHT_MS;
}

export function useTodayKey(): string {
  const active = useAppActive();
  const [key, setKey] = useState(() => toLocalDayKey(new Date()));

  useEffect(() => {
    if (!active) return;
    const now = Date.now();
    setKey(toLocalDayKey(new Date(now)));
    const timer = setTimeout(() => setKey(toLocalDayKey(new Date())), msUntilNextLocalMidnight(now));
    return () => clearTimeout(timer);
  }, [active, key]);

  return key;
}
