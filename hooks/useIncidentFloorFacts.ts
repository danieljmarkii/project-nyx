// The record's floor facts for one incident (Engines v3 PR-27b, CUL-1510): read once on
// open and again whenever the read row moves (`refreshKey`), because the server's re-run
// raises a read when a neighbouring log lands, and the words under it should count that log.
//
// Null until the read answers, and null on a failed read: every line this feeds is additive
// (the watch-for list, "What to tell them"), so an unanswered read draws none of them rather
// than lines built over rows nobody read (C-12's spirit: never an empty record standing in
// for an unanswered one).
import { useEffect, useState } from 'react';
import { loadIncidentFloorFacts, type IncidentFloorFacts } from '../lib/incidentFloorFacts';

export function useIncidentFloorFacts(
  eventId: string,
  petId: string,
  refreshKey: string | null | undefined,
): IncidentFloorFacts | null {
  const [facts, setFacts] = useState<IncidentFloorFacts | null>(null);
  useEffect(() => {
    let live = true;
    void loadIncidentFloorFacts(eventId, petId).then((f) => {
      if (live) setFacts(f);
    });
    return () => {
      live = false;
    };
  }, [eventId, petId, refreshKey]);
  return facts;
}

/** The clock the floor's words resolve against, ticked once a minute while the screen is
 *  up, so a "by 9 PM" clause leaves the list when 9 PM passes rather than when the row
 *  next moves, and call today's line turns to "first thing tomorrow" at the hour. */
export function useMinuteNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}
