// The Signal fold's per-pet state on Home (CUL-784, fold spec §5 / §6).
//
// The zone's memory of what this reader has seen: one read per pet from the fold store,
// the pure `reconcileFolds` against the SETTLED finding set, a write back when something
// moved, and the three owner actions — fold, unfold, touch. Nothing here decides what is
// material (that is `lib/signalFold`'s table) and nothing here animates (the card owns
// its own `LayoutAnimation`, gated on reduced motion).
//
// RECONCILE ONLY AGAINST A READ THAT ANSWERED. `reconcileFolds` deletes any entry whose
// key is absent from the set (release rule 1), so running it against the empty array the
// findings hook holds BEFORE its cache read lands — or after a read that THREW — would
// wipe every fold on the device on every launch. `useSignal.answered` is the gate: true
// once `readSignalCache` resolved for this pet (with rows or with none), false while in
// flight and after a failed read (C-12: a read that hasn't answered is never an empty
// record). The same gate holds the fold store's own read: `null` (unreadable) leaves the
// entries as they were, and nothing is written.
//
// KEYED ON THE PET THE FINDINGS BELONG TO. `useSignal` pairs `findings` with `petId` by
// construction (its render-time reset); this hook keys its state on that same id, so a
// pet switch never renders pet A's folds over pet B's cards — while the new pet's read is
// in flight the stack renders open, never with the previous pet's entries.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CachedFinding, SignalFinding } from '../lib/signal';
import type { LastEpisodeDates } from './useLastEpisodeDates';
import { usePetStore } from '../store/petStore';
import {
  canFold,
  foldIdentity,
  foldedEntry,
  pruneFoldStore,
  readFoldEntries,
  reconcileFolds,
  writeFoldEntries,
  type BackBecauseReason,
  type PetFoldEntries,
  type RecordFacts,
} from '../lib/signalFold';

export type FoldState = 'open' | 'folded';

export interface SignalFoldApi {
  /** The fold state of a finding on this device — `open` for anything not foldable. */
  stateOf: (finding: SignalFinding) => FoldState;
  /** The Back-because reason if this finding was re-opened by the record and not yet touched. */
  backBecauseOf: (finding: SignalFinding) => BackBecauseReason | null;
  /** The owner tapped `Keep it compact`. */
  fold: (finding: SignalFinding) => void;
  /** The owner tapped the strip. */
  unfold: (finding: SignalFinding) => void;
  /** The owner touched a re-opened card (any tap on it) — the Back-because line clears. */
  touch: (finding: SignalFinding) => void;
}

interface FoldSnapshot {
  petId: string | null;
  entries: PetFoldEntries;
}

const EMPTY: PetFoldEntries = {};

/** The record's facts for one finding — the standing safety types carry the newest-episode
 *  witness (CUL-785); every other type has none. */
export function recordFactsFor(finding: SignalFinding, lastEpisodes: LastEpisodeDates): RecordFacts {
  if (finding.type === 'symptom_chronicity' || finding.type === 'symptom_worsening') {
    return { lastEpisodeIso: lastEpisodes[finding.symptomType] ?? null };
  }
  return {};
}

export function useSignalFold({
  petId,
  findings,
  answered,
  lastEpisodes = {},
}: {
  petId: string | null;
  findings: CachedFinding[];
  /** `useSignal.answered` — the findings read for THIS pet resolved (rows or none). */
  answered: boolean;
  /** CUL-785 — the record's newest episode per symptom type (`useLastEpisodeDates`), the
   *  witness that re-opens a standing safety fold when the engine's fields have saturated.
   *  The reconcile re-runs when it moves, so a fold re-opens on a new episode even while the
   *  regen has not landed (offline). */
  lastEpisodes?: LastEpisodeDates;
}): SignalFoldApi {
  const [snapshot, setSnapshot] = useState<FoldSnapshot>({ petId: null, entries: EMPTY });

  // The entries this render may read: the loaded pet's, or none. A snapshot for another
  // pet is never consulted (the pet-switch rule above).
  const entries = snapshot.petId === petId ? snapshot.entries : EMPTY;

  // Findings change identity on every cache read; reconcile on their CONTENT, not the
  // array, so a re-read that produced the same payload does no work and no write.
  const findingsKey = useMemo(
    () => JSON.stringify(findings.map((f) => f.finding)),
    [findings],
  );
  const latestFindings = useRef(findings);
  latestFindings.current = findings;
  // The record's witness is content too: a new local episode moves it without any regen.
  const recordKey = useMemo(() => JSON.stringify(lastEpisodes), [lastEpisodes]);
  const latestRecord = useRef(lastEpisodes);
  latestRecord.current = lastEpisodes;
  const recordOf = useCallback((f: SignalFinding) => recordFactsFor(f, latestRecord.current), []);

  useEffect(() => {
    if (!petId || !answered) return;
    let cancelled = false;
    const nowIso = new Date().toISOString();
    (async () => {
      const stored = await readFoldEntries(petId);
      if (cancelled) return;
      // Storage did not answer: leave the surface as it was (C-12). Nothing written.
      if (stored === null) return;
      const set = latestFindings.current.map((f) => f.finding);
      const { entries: next, changed } = reconcileFolds(stored, set, nowIso, recordOf);
      setSnapshot({ petId, entries: next });
      if (changed) void writeFoldEntries(petId, next);
      // §5.1: entries whose pet this device no longer knows are pruned on read. Guarded on
      // the store KNOWING this pet — at a cold start the pet list can be momentarily empty,
      // and pruning against an empty list would delete every fold on the device.
      const known = usePetStore.getState().pets.map((p) => p.id);
      if (known.includes(petId)) void pruneFoldStore(known);
    })();
    return () => {
      cancelled = true;
    };
  }, [petId, answered, findingsKey, recordKey, recordOf]);

  // Every owner action applies to this render's entries and writes the whole map back
  // (the store is per pet; the shell handles the blob). The write is a plain side effect
  // of the tap, never issued from inside a state updater (StrictMode runs those twice).
  const commit = useCallback(
    (mutate: (prev: PetFoldEntries) => PetFoldEntries | null) => {
      if (!petId) return;
      const next = mutate(entries);
      if (next === null) return;
      setSnapshot({ petId, entries: next });
      void writeFoldEntries(petId, next);
    },
    [petId, entries],
  );

  const stateOf = useCallback(
    (finding: SignalFinding): FoldState => {
      if (!canFold(finding)) return 'open';
      return entries[foldIdentity(finding)]?.state === 'folded' ? 'folded' : 'open';
    },
    [entries],
  );

  const backBecauseOf = useCallback(
    (finding: SignalFinding): BackBecauseReason | null => {
      const entry = entries[foldIdentity(finding)];
      return entry?.state === 'reopened' ? entry.reason : null;
    },
    [entries],
  );

  const fold = useCallback(
    (finding: SignalFinding) => {
      if (!canFold(finding)) return;
      const key = foldIdentity(finding);
      const nowIso = new Date().toISOString();
      commit((prev) => ({ ...prev, [key]: foldedEntry(finding, nowIso, recordOf(finding)) }));
    },
    [commit, recordOf],
  );

  const remove = useCallback(
    (finding: SignalFinding, onlyState?: 'folded' | 'reopened') => {
      const key = foldIdentity(finding);
      commit((prev) => {
        const entry = prev[key];
        if (!entry) return null;
        if (onlyState && entry.state !== onlyState) return null;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    },
    [commit],
  );

  const unfold = useCallback((finding: SignalFinding) => remove(finding, 'folded'), [remove]);
  const touch = useCallback((finding: SignalFinding) => remove(finding, 'reopened'), [remove]);

  return { stateOf, backBecauseOf, fold, unfold, touch };
}
