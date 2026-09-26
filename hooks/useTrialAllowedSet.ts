// The allowed set, for the surfaces that render it — B-616 PR 1 (spec §3).
//
// A thin hook over `loadTrialAllowedSet`, deliberately shaped like
// `useDietTrial`: one loader behind every trial-aware surface, re-read on the
// same `hydrationTick` a sync cycle bumps, so a trial food added on another
// device reaches the Foods tab without a manual refresh. `notifyTrialChanged`
// bumps the same tick, which is what makes a mid-trial add (FR-12) land on the
// list the owner is looking at.
//
// SCOPED TO THE PET IT IS HANDED (D7; CUL-1297). The library is per-account and
// trials are per-pet, so every consumer of this hook is rendering pet-context
// chrome. The Foods tab, the picker and the Pet tab hand it the ACTIVE pet, so pet
// A's trial marks nothing there while pet B is selected; `/trial-foods` hands it
// the pet its route names, which may not be the active one (C-9).
//
// While it loads, the state is `unknown` — which the contract already defines as
// RENDER NOTHING. There is no loading flag here on purpose: a surface that
// treats "not yet known" the same as "known to be nothing" is exactly the guess
// R2 forbids, and giving callers a spinner-shaped alternative invites one.
import { useEffect, useState } from 'react';
import {
  loadTrialAllowedSet,
  UNKNOWN_ALLOWED_SET,
  UNREADABLE_ALLOWED_SET,
  type TrialAllowedSet,
} from '../lib/trialAllowedSet';
import { useSyncStore } from '../store/syncStore';

export function useTrialAllowedSet(petId: string | null): TrialAllowedSet {
  const hydrationTick = useSyncStore((s) => s.hydrationTick);
  // THE ANSWER IS STORED WITH THE PET IT IS AN ANSWER FOR, and that pairing is
  // what makes D7 hold in the gap (B-616 PR 3).
  //
  // The read is async, so switching the active pet leaves the previous pet's
  // resolved set in state until SQLite comes back — a window of one or more
  // frames in which pet A's trial marks foods on a per-account library while pet
  // B is selected. That is the precise leak D7 forbids, and it was invisible
  // while one surface consumed this hook; PR 3 put it behind three (the Foods-tab
  // strip, the row chips, the food-detail row), which is what surfaced it.
  //
  // Clearing state in an effect would not fix it — an effect runs AFTER the
  // render that already drew the stale chrome. So the pet is stored alongside
  // its answer and the mismatch is resolved during render below: the instant
  // named pet changes, this hook reports `unknown`, which the whole track
  // already defines as RENDER NOTHING. A wrong mark is worse than no mark (R1).
  const [state, setState] = useState<{ petId: string | null; set: TrialAllowedSet }>({
    petId: null,
    set: UNKNOWN_ALLOWED_SET,
  });

  useEffect(() => {
    if (!petId) {
      setState({ petId: null, set: UNKNOWN_ALLOWED_SET });
      return;
    }
    let cancelled = false;
    loadTrialAllowedSet(petId)
      .then((next) => {
        if (!cancelled) setState({ petId, set: next });
      })
      .catch((e) => {
        // The loader already narrows its own failures to `unreadable`; this is the
        // belt-and-braces path. It resets rather than keeping the previous
        // answer: a stale allowed set would keep marking foods for a pet whose
        // trial may have ended, and a wrong mark is worse than no mark (R1).
        // `unreadable`, not `unknown` (CUL-400): `unknown` is a spinner that
        // waits for an answer this read is not going to give.
        console.error('[useTrialAllowedSet] load failed:', e);
        if (!cancelled) setState({ petId, set: UNREADABLE_ALLOWED_SET });
      });

    return () => {
      cancelled = true;
    };
  }, [petId, hydrationTick]);

  // Note what this deliberately does NOT do: reset on a `hydrationTick` bump.
  // The tick fires on every sync cycle, and clearing the answer each time would
  // flash the strip and every chip off and back on while the pet has not changed
  // at all. Only a pet mismatch withholds.
  return state.petId === petId ? state.set : UNKNOWN_ALLOWED_SET;
}
