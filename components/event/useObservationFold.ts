// The observation fold's read/write hook (CUL-803 · incident spec §5.3).
//
// Shared by both analysis sections so the store's three rules live in one place:
//
//  1. A READ THAT HAS NOT ANSWERED IS NOT "NOT FOLDED" (C-12). The grid starts expanded
//     and only ever COLLAPSES once storage answers with a definite `true` — so a device
//     whose AsyncStorage throws shows the owner every finding, which is the direction that
//     cannot hide a fact. There is no skeleton here on purpose: the expanded grid is the
//     correct first frame, not a placeholder for one.
//  2. THE RECORD RE-OPENS A FOLD — the fold spec's rule, and the one the first cut was
//     missing. `Re-run analysis` sits directly under the folded strip, so a re-analysis
//     (or a late realtime resolution, or the add-photo re-read) can land a NEW blood or
//     foreign-material finding into a grid the owner has already compressed. When the
//     observation set changes, the fold releases. The baseline is adopted at mount rather
//     than stored, so a fold made in an earlier session is honoured on arrival and only an
//     IN-SESSION change re-opens it: the owner who left and came back is looking at the
//     strip's new values and count, not at a stale summary of a read they never saw.
//  3. The write is fire-and-forget and best-effort (the store logs, never throws), so the
//     local state moves first and the persistence follows. A fold that fails to stick
//     costs one tap on the next visit; an owner-facing error about it would cost more.
import { useCallback, useEffect, useRef, useState } from 'react';
import { readObservationFold, setObservationFold } from '../../lib/observationFold';

export function useObservationFold(
  petId: string,
  eventId: string,
  /** A stable digest of what the grid currently shows, or `null` while the analysis row
   *  has not loaded. A change between two KNOWN digests releases the fold; arriving at
   *  the first known one never does. */
  fingerprint: string | null,
): [boolean, (next: boolean) => void] {
  const [folded, setFolded] = useState(false);
  // Deliberately a ref, not state: this is a baseline the effect compares against, and
  // holding it in state would re-run the comparison against its own write.
  const seen = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // A missing pet id would key the whole account's folds under one bucket — skip
    // rather than write a record we could never wipe per pet.
    if (!petId || !eventId) return;
    readObservationFold(petId, eventId).then((stored) => {
      // `null` is "storage did not answer" — leave the grid open (rule 1). A definite
      // `false` is written back rather than assumed: today the initial state already
      // holds it, because expo-router mints a fresh screen instance per navigation and
      // this hook remounts with it. Relying on that would make the hook correct only by
      // its caller's lifecycle — add a `getId` to the `event/[id]` route and a fold from
      // one incident would ride onto the next with nothing able to clear it.
      if (!cancelled && stored !== null) setFolded(stored);
    });
    return () => { cancelled = true; };
  }, [petId, eventId]);

  const toggle = useCallback((next: boolean) => {
    setFolded(next);
    if (!petId || !eventId) return;
    void setObservationFold(petId, eventId, next);
  }, [petId, eventId]);

  // Rule 2. The first KNOWN fingerprint is the baseline, never a release. Both halves of
  // that are load-bearing: without the baseline, the stored fold is undone by the very
  // first render that establishes what it covers; and without the `null` skip, the
  // baseline is captured on the pre-load render and the row's own arrival — going from
  // "nothing loaded" to "four findings" — reads as a change and releases every restored
  // fold on mount.
  useEffect(() => {
    if (fingerprint === null) return;
    const previous = seen.current;
    seen.current = fingerprint;
    if (previous === null || previous === fingerprint) return;
    // Release through `toggle`, so the store forgets it too: an owner returning later
    // should meet the new findings open, exactly as they are meeting them now.
    toggle(false);
  }, [fingerprint, toggle]);

  return [folded, toggle];
}
