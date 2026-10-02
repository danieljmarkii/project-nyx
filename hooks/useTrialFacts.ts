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
import { useCallback, useEffect, useMemo, useState } from 'react';
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
   *  which is still not an empty record, and the screen says so.
   *
   *  `trialId` is the trial these facts were computed FOR (CUL-1336). The hook is keyed
   *  by pet, and a pet's trial can change under it (replaced from the Pet tab, then back);
   *  a consumer that pairs these facts with another read's trial checks the id rather
   *  than trusting the key. Always set by this hook; absent only on a hand-built state
   *  that carries no facts to mis-pair (Get ready's `NO_LEDGER_FACTS`). */
  | { status: 'ready'; trialId?: string; facts: TrialFacts | null };

/** The state, plus a way to ask again (CUL-1336): the trial screen's *Try again* over an
 *  unreadable read, and its re-read on coming back from a list edit. */
export type TrialFactsRead = TrialFactsState & { reload: () => void };

// CUL-1297 — reads the pet it is HANDED (C-9), never `activePet`; the exposures
// screen passes its `?pet=` param, falling back to the active pet.
export function useTrialFacts(petId: string | null): TrialFactsRead {
  const pets = usePetStore((s) => s.pets);
  const pet = petId ? pets.find((p) => p.id === petId) : undefined;
  const hydrationTick = useSyncStore((s) => s.hydrationTick);
  // The answer is stored with the pet it is an answer for, for the reason
  // `useTrialAllowedSet` spells out: the read is async, so switching pets would
  // otherwise leave pet A's exposures on screen under pet B's name for a frame or
  // more. A mismatch resolves to `unknown` during render, before anything is drawn.
  const [state, setState] = useState<{ petId: string | null; value: TrialFactsState }>({
    petId: null,
    value: { status: 'unknown' },
  });
  const [tick, setTick] = useState(0);
  // The previous answer stays on screen while the re-read runs, as `useDietTrial`'s does:
  // a re-read is not "not yet", and flipping to `unknown` would blank the whole screen.
  const reload = useCallback(() => setTick((t) => t + 1), []);

  const resolvedId = pet?.id ?? null;
  const petName = pet?.name;
  const species = pet?.species;
  const sex = pet?.sex;

  useEffect(() => {
    if (!resolvedId || !petName || !species) {
      setState({ petId: null, value: { status: 'unknown' } });
      return;
    }
    let cancelled = false;
    loadTrialPredicateFacts({ id: resolvedId, name: petName, species, sex })
      .then((core) => {
        if (cancelled) return;
        setState({
          petId: resolvedId,
          value:
            core === null
              ? { status: 'no_trial' }
              : { status: 'ready', trialId: core.trial.id, facts: core.facts },
        });
      })
      .catch((e) => {
        // Never a fabricated "no trial": that would render the designed
        // no-trial state over a live trial whose read simply threw. And never a
        // silent return to `unknown` either — that is the spinner, and a spinner
        // over a permanent failure is a screen that never answers.
        console.error('[useTrialFacts] load failed:', e);
        if (!cancelled) setState({ petId: resolvedId, value: { status: 'unreadable' } });
      });
    return () => {
      cancelled = true;
    };
  }, [resolvedId, petName, species, sex, hydrationTick, tick]);

  const value: TrialFactsState = state.petId === resolvedId ? state.value : UNKNOWN;
  return useMemo(() => ({ ...value, reload }), [value, reload]);
}

const UNKNOWN: TrialFactsState = { status: 'unknown' };
