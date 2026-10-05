import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { readSignalCache, type CachedFinding } from '../lib/signal';
import { signalTrialWindowOf } from '../lib/signalScreen';
import { trialSignalDoor, type TrialSignalDoor } from '../lib/trialSignalDoor';
import type { TrialCardTrial } from '../lib/dietTrialCard';
import { useSyncStore } from '../store/syncStore';

// The trial screen's door to the Signal's trial finding (TS-9 · CUL-1305). The rule is
// `lib/trialSignalDoor.ts`; this hook holds the one thing it cannot: the read.
//
// The door opens `app/signal/[id]`, the Signal's own screen, on for every account since
// Design v2's GA (CUL-1071).
//
// THE READ is the route's pet's cache (C-9), stored with the pet it answers for, so a pet
// switch never shows the previous pet's door for a frame (`useTrialFacts`' shape). It re-reads
// when a regen lands (`signalTick`) and on every focus, as Home's `useSignal` does: a snapshot
// held across a regen that flipped the pair's direction would keep a door Home had dropped, or
// miss one Home had added (adversarial pass). A read that fails draws no door: the door is a
// convenience, never a claim about the record, and the trial screen's own vomiting line does
// not depend on it. The destination re-checks on its own (`loadSignalScreen` answers only for
// a finding Home would draw), so a door a beat stale can never open onto a withheld pair.

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
  const hydrationTick = useSyncStore((s) => s.hydrationTick);
  const signalTick = useSyncStore((s) => s.signalTick);
  const [state, setState] = useState<{ petId: string; findings: readonly CachedFinding[]; generatedAt: string | null } | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      readSignalCache(petId)
        .then((row) => {
          if (!cancelled) setState({ petId, findings: row?.findings ?? [], generatedAt: row?.generatedAt ?? null });
        })
        .catch((e) => {
          console.warn('[useTrialSignalDoor] signal cache read failed:', e);
          if (!cancelled) setState({ petId, findings: [], generatedAt: null });
        });
      return () => {
        cancelled = true;
      };
    }, [petId, hydrationTick, signalTick]),
  );

  if (!state || state.petId !== petId) return null;
  return trialSignalDoor({
    petId,
    findings: state.findings,
    withholdFallingVomit: notEating !== false,
    trialWindow: trial ? signalTrialWindowOf(trial, nowMs) : null,
    generatedAt: state.generatedAt,
    nowMs,
  });
}
