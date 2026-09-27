import { useEffect, useState } from 'react';
import { useDesignV2 } from './useDesignV2';
import { readSignalCache, type CachedFinding } from '../lib/signal';
import { signalTrialWindowOf } from '../lib/signalScreen';
import { trialSignalDoor, type TrialSignalDoor } from '../lib/trialSignalDoor';
import type { TrialCardTrial } from '../lib/dietTrialCard';
import { useSyncStore } from '../store/syncStore';

// The trial screen's door to the Signal's trial finding (TS-9 · CUL-1305). The rule is
// `lib/trialSignalDoor.ts`; this hook holds the two things it cannot: the gate and the read.
//
// THE GATE. The door opens `app/signal/[id]`, which answers with its flag-off screen unless
// Design v2 is live for the account (spec §3.7). So the door exists only under `useDesignV2()`,
// and with the gate off the Signal cache is NEVER READ: nothing here spends a request on a
// door that cannot draw (proved in the trial screen's suite over a cache that would answer).
// This file reads the gate to DECIDE; it draws nothing of the redesign, which is its entry in
// `guards/designV2FlagOff.test.tsx`'s `DRAWS_ELSEWHERE_OK`.
//
// THE READ is the route's pet's cache (C-9), stored with the pet it answers for, so a pet
// switch never shows the previous pet's door for a frame (`useTrialFacts`' shape). A read
// that fails draws no door: the door is a convenience, never a claim about the record, and
// the trial screen's own vomiting line does not depend on it.

export interface TrialSignalDoorInput {
  /** The route's pet. */
  petId: string;
  /** The trial row the screen is drawing, for the title's window; null when none. */
  trial: TrialCardTrial | null;
  /** Home's not-eating register for this pet (`isAnimalNotEating`); null while the screen's
   *  facts have not answered, which withholds (fail closed, as Home does). */
  notEating: boolean | null;
  nowMs: number;
}

export function useTrialSignalDoor({ petId, trial, notEating, nowMs }: TrialSignalDoorInput): TrialSignalDoor | null {
  const live = useDesignV2();
  const hydrationTick = useSyncStore((s) => s.hydrationTick);
  const [state, setState] = useState<{ petId: string; findings: readonly CachedFinding[] } | null>(null);

  useEffect(() => {
    if (!live) {
      setState(null);
      return;
    }
    let cancelled = false;
    readSignalCache(petId)
      .then((row) => {
        if (!cancelled) setState({ petId, findings: row?.findings ?? [] });
      })
      .catch((e) => {
        console.warn('[useTrialSignalDoor] signal cache read failed:', e);
        if (!cancelled) setState({ petId, findings: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [live, petId, hydrationTick]);

  if (!live || !state || state.petId !== petId) return null;
  return trialSignalDoor({
    petId,
    findings: state.findings,
    withholdFallingVomit: notEating !== false,
    trialWindow: trial ? signalTrialWindowOf(trial, nowMs) : null,
    nowMs,
  });
}
