import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchComposerOpen, fetchComposerWindow } from '../lib/reportComposerApi';
import {
  createRequestLatch,
  type ComposerAfter,
  type ComposerCounts,
  type ComposerCountsState,
  type ComposerOpen,
  type ComposerScreenState,
  type ComposerWindow,
} from '../lib/reportComposer';

// The composer's reads and its selection (Vet report v2 PR-16, CUL-2296; spec §10.1, §14).
//
// HELD BY THE REPORT SCREEN, not by the composer view: Back from the preview remounts the view,
// and the owner's chosen window (custom dates included) must still be there (pm-feature-review).
//
// THE FIRST FRAME (GAP-13). Nothing paints until the open read answers: the live flags and the
// first window's counts arrive together, so the call card is in the screen's first painted frame
// or it is not on the screen at all. A failed open read is the `failed` state, which says nothing
// was checked; it never paints a composer with an empty card slot.
//
// A WINDOW CHANGE (GAP-14). The radio and the dates change in the same commit as the tap, the
// counts go to `counting` in that same commit, and only the newest ask may land (the latch). The
// live flags are never re-read: the safety row never moves.

export interface ReportComposerState {
  screen: ComposerScreenState;
  open: ComposerOpen | null;
  selected: ComposerWindow | null;
  counts: ComposerCounts | null;
  after: ComposerAfter | null;
  countsState: ComposerCountsState;
  /** Bumps each time new counts land for a window change (the crossfade and the announcement key on it). */
  landed: number;
  select: (w: ComposerWindow) => void;
  retry: () => void;
  /** Read everything again from the top (a new day: the windows on offer were today's). */
  reload: () => void;
}

export function useReportComposer(petId: string | undefined): ReportComposerState {
  const [screen, setScreen] = useState<ComposerScreenState>('loading');
  const [open, setOpen] = useState<ComposerOpen | null>(null);
  const [selected, setSelected] = useState<ComposerWindow | null>(null);
  const [counts, setCounts] = useState<ComposerCounts | null>(null);
  const [after, setAfter] = useState<ComposerAfter | null>(null);
  const [countsState, setCountsState] = useState<ComposerCountsState>('ready');
  const [landed, setLanded] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const latch = useRef(createRequestLatch()).current;

  useEffect(() => {
    if (!petId) return undefined;
    let cancelled = false;
    setScreen('loading');
    setOpen(null);
    setSelected(null);
    setCounts(null);
    setAfter(null);
    latch.next(); // any window read still in flight belongs to the previous pet or attempt
    fetchComposerOpen(petId)
      .then((o) => {
        if (cancelled) return;
        setOpen(o);
        setSelected(o.windows[0]);
        setCounts(o.counts);
        setAfter(o.after);
        setCountsState('ready');
        setScreen('ready');
      })
      .catch((e) => {
        if (cancelled) return;
        console.error('[ReportComposer] open read failed:', e);
        setScreen('failed');
      });
    return () => {
      cancelled = true;
    };
  }, [petId, attempt, latch]);

  const select = useCallback(
    (w: ComposerWindow) => {
      if (!petId) return;
      setSelected(w);
      setCountsState('counting');
      const stamp = latch.next();
      fetchComposerWindow(petId, w.startDate, w.endDate)
        .then((r) => {
          if (!latch.isCurrent(stamp)) return;
          setCounts(r.counts);
          setAfter(r.after);
          setCountsState('ready');
          setLanded((n) => n + 1);
        })
        .catch((e) => {
          if (!latch.isCurrent(stamp)) return;
          console.error('[ReportComposer] window read failed:', e);
          setCountsState('failed');
        });
    },
    [petId, latch],
  );

  const retry = useCallback(() => {
    if (screen === 'failed') {
      setAttempt((n) => n + 1);
      return;
    }
    if (selected) select(selected);
  }, [screen, selected, select]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  return { screen, open, selected, counts, after, countsState, landed, select, retry, reload };
}

/** The calendar's dots, a month at a time: each month's logged days, read once and kept. */
export function useMonthEntryDays(petId: string | undefined): {
  daysFor: (monthKey: string) => Set<string> | 'loading' | 'failed' | undefined;
  request: (monthKey: string, startDate: string, endDate: string) => void;
} {
  const [months, setMonths] = useState<Record<string, Set<string> | 'loading' | 'failed'>>({});
  const asked = useRef(new Set<string>());
  const request = useCallback(
    (monthKey: string, startDate: string, endDate: string) => {
      if (!petId || asked.current.has(monthKey)) return;
      asked.current.add(monthKey);
      setMonths((m) => ({ ...m, [monthKey]: 'loading' }));
      fetchComposerWindow(petId, startDate, endDate)
        .then((r) => {
          // No list is not an empty month (C-12): an unread month shows no dots and says so.
          setMonths((m) => ({ ...m, [monthKey]: r.counts.loggedDayKeys ? new Set(r.counts.loggedDayKeys) : 'failed' }));
        })
        .catch((e) => {
          console.warn('[ReportComposer] month read failed:', e);
          asked.current.delete(monthKey);
          setMonths((m) => ({ ...m, [monthKey]: 'failed' }));
        });
    },
    [petId],
  );
  const daysFor = useCallback((monthKey: string) => months[monthKey], [months]);
  return { daysFor, request };
}
