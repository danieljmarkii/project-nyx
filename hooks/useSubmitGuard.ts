import { useCallback, useRef } from 'react';

// B-336 — the double-submit guard for one-tap write paths (the picker tiles).
//
// A picker tile IS the write: tap a food or a medication and an event lands, with
// no confirm step in between (Principle 1 — zero decisions at moment of event).
// That makes the tile re-entrant by construction: the write is async (SQLite +
// child row + sync push), the tile stays live for those tens of milliseconds, and
// a rapid double-tap runs the handler twice — two dose events for one pill. On the
// B-325 retroactive-combo path the second run also overwrote the first's pending
// confirm-sheet state, so the first dose's "did it still get in?" prompt never
// showed (it survives via the History "Unconfirmed" tag — no false 'given', but a
// silently skipped prompt).
//
// The guard latches on the FIRST tap and drops every tap that arrives while the
// write is in flight. Whether it stays latched afterwards is the caller's call, and
// it is deliberately explicit rather than inferred: the guarded function returns
// `true` when it COMMITTED something (an event was written — the screen is
// dismissing, so no later tap on the same visit may write again) and `false` when
// nothing was written (a failed or refused write — the owner is still on the picker
// looking at an alert, so the tile must work again). A throw releases too: an
// unexpected failure must never leave the picker permanently dead.
//
// It lives here, at the handler, rather than as a `disabled` prop on the tiles:
// FoodPicker also serves a SELECTION surface (StartTrialModal), where a tap toggles
// a set and re-tapping is the whole point. Guarding the write path guards exactly
// the paths that write.
export type SubmitGuard = (write: () => Promise<boolean>) => Promise<void>;

export function useSubmitGuard(): SubmitGuard {
  const inFlight = useRef(false);

  return useCallback(async (write: () => Promise<boolean>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    let committed = false;
    try {
      committed = await write();
    } finally {
      if (!committed) inFlight.current = false;
    }
  }, []);
}
