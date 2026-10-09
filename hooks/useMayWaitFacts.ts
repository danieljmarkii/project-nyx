// The phone's read behind call today's wait line (Engines v3 PR-27f, CUL-1629). Read only when
// the stored fact could grant the wait (`enabled`: a new-rule call today with `may_wait` TRUE),
// so every other read costs nothing, and the server's photo read never runs for them.
//
// Re-read when the row moves (`rowKey`), every minute (`tick`) and on every log this phone commits
// (`lastLogged`), so a log made over the record, or a sync that lands, reaches the line at once.
// Null until the read answers and on a failed read: the line keeps the louder words then
// (lib/mayWaitLine.ts). A moved row clears the last answer first, so a new read never stands on
// the old one's facts; a tick does not, so the line does not blink every minute.
//
// NO READ IS CANCELLED BY THE NEXT ONE (second adversarial pass, F1): on a network slower than the
// tick, cancel-on-tick starved every answer and left the last clean one on screen for good. Each
// read runs to its end, the newest STARTED read wins, and every answer carries `readAt`, which the
// line's `stale` gate refuses once it is older than two minutes or older than the newest log.
import { useEffect, useRef, useState } from 'react';
import type { MayWaitFacts } from '../lib/mayWaitLine';
import { loadMayWaitFacts } from '../lib/mayWaitFacts';

export function useMayWaitFacts(
  eventId: string,
  petId: string,
  rowKey: string,
  /** Moves every minute: re-read. */
  tick: string,
  /** The last log this phone committed (its completion card's payload): re-read. */
  lastLogged: unknown,
  enabled: boolean,
): MayWaitFacts | null {
  const [facts, setFacts] = useState<MayWaitFacts | null>(null);
  const started = useRef(0);
  const landed = useRef(0);
  const scope = useRef(0);
  useEffect(() => {
    // A new question: every read already in flight answers the old one.
    scope.current = started.current;
    setFacts(null);
  }, [eventId, petId, rowKey, enabled]);
  useEffect(() => {
    if (!enabled) return;
    const seq = ++started.current;
    void loadMayWaitFacts(eventId, petId, Date.now()).then((f) => {
      if (seq <= scope.current || seq < landed.current) return;
      landed.current = seq;
      setFacts(f);
    });
  }, [eventId, petId, rowKey, tick, lastLogged, enabled]);
  return facts;
}
