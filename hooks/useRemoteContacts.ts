import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAllowlistFlag } from './useAppConfig';
import { useBetaOptIn } from '../lib/betaFeatures';
import { useSyncStore } from '../store/syncStore';
import { readRemoteContacts, type RemoteContact } from '../lib/vetContactLine';

/**
 * Vet contacts PR-07 (CUL-2769): the pet's logged calls, texts and emails, for Home's awareness
 * line. Null until the read has answered for THIS pet (C-12, C-9), and null on a failed read:
 * either way the cards draw exactly what they draw today, which is the line's only fallback.
 * Flag off (`vet_contacts_enabled` plus the owner's opt-in): nothing is read (C-36).
 */
export function useRemoteContacts(petId: string | null): readonly RemoteContact[] | null {
  const flagOn = useAllowlistFlag('vet_contacts_enabled');
  const optedIn = useBetaOptIn('vet_contacts_enabled');
  const on = flagOn && optedIn;
  const hydrationTick = useSyncStore((s) => s.hydrationTick);
  const [answer, setAnswer] = useState<{ petId: string; contacts: RemoteContact[] } | null>(null);
  // A contact is logged on another screen and Home stays mounted under the tabs, so coming back
  // to Home re-reads: the line appears on return, never a sync later.
  const [focusTick, setFocusTick] = useState(0);
  useFocusEffect(useCallback(() => setFocusTick((t) => t + 1), []));

  useEffect(() => {
    if (!on || !petId) {
      setAnswer(null);
      return;
    }
    let cancelled = false;
    readRemoteContacts(petId)
      .then((contacts) => {
        if (!cancelled) setAnswer({ petId, contacts });
      })
      .catch((e) => {
        console.warn('[remote-contacts] read failed:', e);
        if (!cancelled) setAnswer(null);
      });
    return () => {
      cancelled = true;
    };
  }, [on, petId, hydrationTick, focusTick]);

  // Derived in render: a switch never lends one pet's contacts to another for a frame.
  if (!on || !petId || answer?.petId !== petId) return null;
  return answer.contacts;
}
