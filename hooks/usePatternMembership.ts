// "Part of a pattern" on the record (K2, CUL-1515; `lib/incidentPattern.ts`). Which tracked
// finding, if any, counts this read among its episodes. No read is issued unless the record's
// read could take the word (a new-rule `logged` read, or one still being read, whose landing
// must be spoken in the card's words): a call and a settled earlier-rule read cost nothing. Null
// until the read answers and on any failure, so the read says "Keep an eye out" (its shipped
// words) until a finding is found, and never anything calmer.
import { useEffect, useState } from 'react';
import { readPatternMembership, type PatternMembership } from '../lib/incidentPattern';

export function usePatternMembership(
  input: { petId: string; eventId: string; eventType: string },
  /** The record's read could take the word: a new-rule `logged` read, or one in flight. */
  candidate: boolean,
  /** Moves when the read does, so a re-read asks again. A Signal regenerated while the record
   *  stays open is picked up on the next open, not live: the mark can outlast a finding by a
   *  visit, which errs louder, never calmer. */
  refreshKey: string,
): PatternMembership | null {
  const { petId, eventId, eventType } = input;
  // Keyed to the record it answered for, so a screen reused for another record never shows
  // the last one's finding (or its door) while the new answer is in flight.
  const key = `${petId}|${eventId}|${eventType}`;
  const [answer, setAnswer] = useState<{ key: string; membership: PatternMembership | null } | null>(null);
  useEffect(() => {
    if (!candidate) {
      setAnswer(null);
      return;
    }
    let live = true;
    // `readPatternMembership` never throws: a failure is null, logged there.
    void readPatternMembership({ petId, eventId, eventType }).then((membership) => {
      if (live) setAnswer({ key: `${petId}|${eventId}|${eventType}`, membership });
    });
    return () => {
      live = false;
    };
  }, [candidate, petId, eventId, eventType, refreshKey]);
  return candidate && answer?.key === key ? answer.membership : null;
}
