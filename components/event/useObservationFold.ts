// The observation fold's read/write hook (CUL-803 · incident spec §5.3).
//
// Shared by both analysis sections so the store's two rules live in one place:
//
//  1. A READ THAT HAS NOT ANSWERED IS NOT "NOT FOLDED" (C-12). The grid starts expanded
//     and only ever COLLAPSES once storage answers — so a device whose AsyncStorage
//     throws shows the owner every finding, which is the direction that cannot hide a
//     fact. There is no skeleton here on purpose: the expanded grid is the correct
//     first frame, not a placeholder for one.
//  2. The write is fire-and-forget and best-effort (the store logs, never throws), so the
//     local state moves first and the persistence follows. A fold that fails to stick
//     costs one tap on the next visit; an owner-facing error about it would cost more.
import { useCallback, useEffect, useState } from 'react';
import { readObservationFold, setObservationFold } from '../../lib/observationFold';

export function useObservationFold(
  petId: string,
  eventId: string,
): [boolean, (next: boolean) => void] {
  const [folded, setFolded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // A missing pet id would key the whole account's folds under one bucket — skip
    // rather than write a record we could never wipe per pet.
    if (!petId || !eventId) return;
    readObservationFold(petId, eventId).then((stored) => {
      // `null` is "storage did not answer" — leave the grid open (rule 1).
      if (!cancelled && stored === true) setFolded(true);
    });
    return () => { cancelled = true; };
  }, [petId, eventId]);

  const toggle = useCallback((next: boolean) => {
    setFolded(next);
    if (!petId || !eventId) return;
    void setObservationFold(petId, eventId, next);
  }, [petId, eventId]);

  return [folded, toggle];
}
