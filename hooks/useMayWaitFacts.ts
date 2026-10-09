// The phone's read behind call today's wait line (Engines v3 PR-27f, CUL-1629). Read only when
// the stored fact could grant the wait (`enabled`: a new-rule call today with `may_wait` TRUE),
// so every other read costs nothing, and the server's photo read never runs for them.
//
// Re-read when the row moves (`rowKey`) and on the floor facts' cadence (`tick`), so a log made on
// this phone, or a sync that lands, reaches the line without a reopen. Null until the read answers
// and on a failed read: the line keeps the louder words then (lib/mayWaitLine.ts). A moved row
// clears the last answer first, so a new read never stands on the old one's facts; a tick does
// not, so the line does not blink to the louder words every few minutes over facts that held.
import { useEffect, useState } from 'react';
import type { MayWaitFacts } from '../lib/mayWaitLine';
import { loadMayWaitFacts } from '../lib/mayWaitFacts';

export function useMayWaitFacts(
  eventId: string,
  petId: string,
  rowKey: string,
  tick: number,
  enabled: boolean,
): MayWaitFacts | null {
  const [facts, setFacts] = useState<MayWaitFacts | null>(null);
  useEffect(() => {
    setFacts(null);
  }, [eventId, petId, rowKey, enabled]);
  useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    void loadMayWaitFacts(eventId, petId, Date.now()).then((f) => {
      if (live) setFacts(f);
    });
    return () => {
      live = false;
    };
  }, [eventId, petId, rowKey, tick, enabled]);
  return facts;
}
