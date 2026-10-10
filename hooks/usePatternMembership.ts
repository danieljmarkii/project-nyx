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
  /** Moves when the read does, so a re-read or a regenerated Signal asks again. */
  refreshKey: string,
): PatternMembership | null {
  const [membership, setMembership] = useState<PatternMembership | null>(null);
  const { petId, eventId, eventType } = input;
  useEffect(() => {
    if (!candidate) {
      setMembership(null);
      return;
    }
    let live = true;
    // `readPatternMembership` never throws: a failure is null, logged there.
    void readPatternMembership({ petId, eventId, eventType }).then((m) => {
      if (live) setMembership(m);
    });
    return () => {
      live = false;
    };
  }, [candidate, petId, eventId, eventType, refreshKey]);
  return candidate ? membership : null;
}
