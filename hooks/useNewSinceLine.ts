// "New since {date}: reads say how soon to call. {Pet}'s earlier reads keep the words they
// had." on a pet's first new-rule read (Engines v3 PR-27k, CUL-1513; tiers spec §5). Decided
// from the phone's copy of the pet's reads (`readPetSeamReads`), never a device key, so a
// second phone agrees. Null until the read answers, and on any failure: the line is a note
// beside a read, so its absence costs nothing and it never waits on the network. No read is
// issued unless the line could be said (a go-live day, and this read is a new-rule one).
import { useEffect, useRef, useState } from 'react';
import { isTieredRow, type TierRow } from '../lib/incidentTierWords';
import { readPetSeamReads } from '../lib/readCopy';
import { newSinceLineOf } from '../lib/ruleSeam';
import { useEn3LiveSince } from './useEn3LiveSince';

export function useNewSinceLine(
  eventId: string,
  petId: string,
  petName: string | null | undefined,
  /** The section's own row, fresher than the phone's copy of it (a Re-run that tiered this
   *  read lands here before the copy's next pull), so it stands in for the copy's row. */
  self: TierRow | null | undefined,
  /** Moves when the read does, so a re-read that tiers this row asks again. */
  refreshKey: string,
): string | null {
  const liveSince = useEn3LiveSince();
  const [line, setLine] = useState<string | null>(null);
  const armed = isTieredRow(self) && liveSince !== null;
  const selfRef = useRef(self);
  selfRef.current = self;
  useEffect(() => {
    if (!armed) {
      setLine(null);
      return;
    }
    let live = true;
    readPetSeamReads(petId)
      .then((reads) => {
        if (live) setLine(newSinceLineOf(eventId, reads, liveSince, petName, selfRef.current));
      })
      .catch((err: unknown) => {
        // A local read failure loses an informational note, never a verdict; said in the
        // log so it is not silent.
        console.warn('[useNewSinceLine] local read failed', err);
        if (live) setLine(null);
      });
    return () => {
      live = false;
    };
  }, [armed, eventId, petId, petName, liveSince, refreshKey]);
  return armed ? line : null;
}
