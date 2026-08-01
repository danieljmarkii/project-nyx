// The predicate's own answers, for the surface that renders the ITEMS — B-616 PR 4.
//
// `useDietTrial` fronts the same reads for the CARD, and returns a `TrialCardInput`
// that flattens the exposure summary to four numbers. The exposures screen needs the
// per-feeding classifications behind those numbers, so it reads
// `loadTrialPredicateFacts` — the same five reads over the same five tables, shared
// deliberately: two loaders is how the card's count and the screen's list start
// disagreeing about the same trial.
//
// `facts === null` and `status === 'unknown'` are different facts and stay apart, the
// same split `useTrialAllowedSet` carries: "there is no trial" is something the app
// knows, and "the record could not be read" is not. The screen renders each
// differently, and neither is an empty list.
import { useEffect, useState } from 'react';
import { loadTrialPredicateFacts } from '../lib/dietTrialFacts';
import type { TrialFacts } from '../lib/dietTrial';
import { usePetStore } from '../store/petStore';
import { useSyncStore } from '../store/syncStore';

export type TrialFactsState =
  /** STILL READING. Render a spinner — and only here, because this is the only
   *  state that resolves on its own. */
  | { status: 'unknown' }
  /** THE READ FAILED. Held apart from `unknown` because a spinner is an honest
   *  rendering of "not yet" and a dead end for "not ever": the screen owes the
   *  owner a cause and a next action (`nyx-voice` Pattern 8), and it may never
   *  degrade into an empty list, which would say "nothing happened" about a
   *  record nobody could read. */
  | { status: 'unreadable' }
  /** No card-eligible trial for this pet (none, or one whose grace window closed). */
  | { status: 'no_trial' }
  /** A trial exists. `facts` is null when its record could not be read or computed —
   *  which is still not an empty record, and the screen says so. */
  | { status: 'ready'; facts: TrialFacts | null };

export function useTrialFacts(): TrialFactsState {
  const activePet = usePetStore((s) => s.activePet);
  const hydrationTick = useSyncStore((s) => s.hydrationTick);
  // The answer is stored with the pet it is an answer for, for the reason
  // `useTrialAllowedSet` spells out: the read is async, so switching pets would
  // otherwise leave pet A's exposures on screen under pet B's name for a frame or
  // more. A mismatch resolves to `unknown` during render, before anything is drawn.
  const [state, setState] = useState<{ petId: string | null; value: TrialFactsState }>({
    petId: null,
    value: { status: 'unknown' },
  });

  const petId = activePet?.id ?? null;
  const petName = activePet?.name;
  const species = activePet?.species;
  const sex = activePet?.sex;

  useEffect(() => {
    if (!petId || !petName || !species) {
      setState({ petId: null, value: { status: 'unknown' } });
      return;
    }
    let cancelled = false;
    loadTrialPredicateFacts({ id: petId, name: petName, species, sex })
      .then((core) => {
        if (cancelled) return;
        setState({
          petId,
          value: core === null ? { status: 'no_trial' } : { status: 'ready', facts: core.facts },
        });
      })
      .catch((e) => {
        // Never a fabricated "no trial": that would render the designed
        // no-trial state over a live trial whose read simply threw. And never a
        // silent return to `unknown` either — that is the spinner, and a spinner
        // over a permanent failure is a screen that never answers.
        console.error('[useTrialFacts] load failed:', e);
        if (!cancelled) setState({ petId, value: { status: 'unreadable' } });
      });
    return () => {
      cancelled = true;
    };
  }, [petId, petName, species, sex, hydrationTick]);

  return state.petId === petId ? state.value : { status: 'unknown' };
}
