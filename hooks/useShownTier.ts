// The call tier this phone already showed for one read (Engines v3 PR-28b, CUL-1436; spec
// §8.7), read once when the record opens. It is the baseline a landing is measured
// against: a stored tier arrives only ABOVE it. Read once on purpose: what the record
// itself shows while open is recorded for the NEXT opening, and must not silence the
// landing it is showing now. Null while unread, on a failed read, or with the floor off.
import { useEffect, useState } from 'react';
import { readShownTiers } from '../lib/incidentTierShown';
import type { FloorTier } from '../lib/incidentFloor';

export function useShownTier(eventId: string, enabled: boolean): FloorTier | null {
  const [tier, setTier] = useState<FloorTier | null>(null);
  useEffect(() => {
    if (!enabled) {
      setTier(null);
      return;
    }
    let live = true;
    readShownTiers([eventId])
      .then((m) => {
        if (live) setTier(m.get(eventId) ?? null);
      })
      .catch((e: unknown) => console.warn('[floor] shown tier not read:', e));
    return () => {
      live = false;
    };
  }, [eventId, enabled]);
  return tier;
}
