import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useAuthStore } from '../store/authStore';
import { usePetStore } from '../store/petStore';
import { needsAiConsentAsk, saveAiConsent } from '../store/aiConsentStore';
import { CONSENT_WRITE_FAILED, consentPetName, type ConsentDoor } from '../constants/aiConsentCopy';
import type { ConsentChoice } from '../components/consent/AiConsentSheet';

// One in-context consent door (CUL-1834): before a label photo, before Ask. The
// screen awaits `ask()` at the moment AI would help and branches on the outcome;
// this hook owns the read, the sheet and the write.
//
//   'proceed'  an answer was already on file (either way), or the read failed. The
//              server's gate decides what a declined or unknown owner gets, so a door
//              never second-guesses it, and never re-asks an owner who answered.
//   'allowed'  the owner tapped Allow and the yes is saved.
//   'declined' the owner tapped Don't allow and the no is saved.
//   'not_now'  nothing was written (D13); the next door asks again.
//
// Every door writes source 'backstop' (team call on CUL-1832, no migration).
//
// The resolver lives in a ref, not state (C-22): a one-shot answer read from state
// can fire twice through a stale effect closure.

export type ConsentDoorOutcome = 'proceed' | 'allowed' | 'declined' | 'not_now';

// iOS will not present the camera while a Modal is still sliding away, so an
// answer waits for the sheet's onDismiss. The fallback covers an onDismiss that
// never fires, so the door can never hang.
const DISMISS_FALLBACK_MS = 700;

export function useAiConsentDoor(door: ConsentDoor) {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const pets = usePetStore((s) => s.pets);
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState<ConsentChoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  // True from the first ask until it resolves, so a screen can hold its own action
  // (Ask's send) while the answer is being read or given.
  const [settling, setSettling] = useState(false);
  const resolverRef = useRef<((o: ConsentDoorOutcome) => void) | null>(null);
  const outcomeRef = useRef<ConsentDoorOutcome | null>(null);
  const fallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const finish = useCallback(() => {
    if (fallbackRef.current) {
      clearTimeout(fallbackRef.current);
      fallbackRef.current = null;
    }
    const resolve = resolverRef.current;
    const outcome = outcomeRef.current;
    resolverRef.current = null;
    outcomeRef.current = null;
    setSettling(false);
    if (resolve && outcome) resolve(outcome);
  }, []);

  const close = useCallback((outcome: ConsentDoorOutcome) => {
    outcomeRef.current = outcome;
    setVisible(false);
    setSaving(null);
    setError(null);
    if (Platform.OS === 'ios') {
      fallbackRef.current = setTimeout(finish, DISMISS_FALLBACK_MS);
    } else {
      finish();
    }
  }, [finish]);

  useEffect(() => () => {
    if (fallbackRef.current) clearTimeout(fallbackRef.current);
  }, []);

  const ask = useCallback(async (): Promise<ConsentDoorOutcome> => {
    // A second tap while a door is open joins nothing: it simply does not proceed.
    if (resolverRef.current) return 'not_now';
    if (!userId) return 'proceed';
    setSettling(true);
    let needs = false;
    try {
      needs = await needsAiConsentAsk(userId);
    } catch (e) {
      console.warn('[useAiConsentDoor] consent read failed:', e);
    }
    if (!needs) {
      setSettling(false);
      return 'proceed';
    }
    return new Promise<ConsentDoorOutcome>((resolve) => {
      resolverRef.current = resolve;
      setVisible(true);
    });
  }, [userId]);

  const onChoose = useCallback(async (choice: ConsentChoice) => {
    if (!userId) return;
    setSaving(choice);
    setError(null);
    const result = await saveAiConsent(userId, choice === 'allow', 'backstop');
    if (result.status === 'error') {
      setSaving(null);
      setError(CONSENT_WRITE_FAILED);
      return;
    }
    close(choice === 'allow' ? 'allowed' : 'declined');
  }, [userId, close]);

  const onNotNow = useCallback(() => close('not_now'), [close]);

  const onDismissed = useCallback(() => {
    if (outcomeRef.current) finish();
  }, [finish]);

  return {
    ask,
    settling,
    sheetProps: {
      visible,
      door,
      petName: consentPetName(pets.map((p) => p.name)),
      onChoose,
      onNotNow,
      onDismissed,
      saving,
      error,
    },
  };
}
