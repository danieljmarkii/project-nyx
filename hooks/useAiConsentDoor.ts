import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useAuthStore } from '../store/authStore';
import { usePetStore } from '../store/petStore';
import { consentDoorState, saveAiConsent, type ConsentDoorState } from '../store/aiConsentStore';
import { CONSENT_WRITE_FAILED, consentPetName, type ConsentDoor } from '../constants/aiConsentCopy';
import type { ConsentChoice } from '../components/consent/AiConsentSheet';

// One in-context consent door (CUL-1834): before a label photo, before Ask. The
// screen awaits `ask()` at the moment AI would help and branches on the outcome;
// this hook owns the read, the sheet and the write.
//
//   'proceed'  a yes is on file: one this phone holds, cached or just read.
//   'unreadable' the read failed, threw or stalled, or no one is signed in. Nothing
//              is sent and the screen says try again, keeping what the owner already
//              took or typed (CUL-1933). The server's gate that would refuse an
//              unknown owner is held until PR-17, so the phone is the only door; and a
//              door never re-asks here, since the owner may already have answered.
//   'allowed'  the owner tapped Allow and the yes is saved.
//   'declined' the owner tapped Don't allow and the no is saved, or a no was already
//              on file. A recorded no is honoured here as well as on the server
//              (rls-privacy-reviewer F1), with no sheet: the owner already answered.
//   'not_now'  nothing was written (D13); the next door asks again.
//
// Every door writes source 'backstop' (team call on CUL-1832, no migration).
//
// The resolver lives in a ref, not state (C-22): a one-shot answer read from state
// can fire twice through a stale effect closure.

export type ConsentDoorOutcome = 'proceed' | 'allowed' | 'declined' | 'not_now' | 'unreadable';

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
    if (fallbackRef.current) clearTimeout(fallbackRef.current);
    if (Platform.OS === 'ios') {
      fallbackRef.current = setTimeout(finish, DISMISS_FALLBACK_MS);
    } else {
      finish();
    }
  }, [finish]);

  // Unmounting inside the iOS window clears the timer without resolving: the awaiting
  // handler belongs to a screen that is gone, so there is nothing left to continue.
  useEffect(() => () => {
    if (fallbackRef.current) clearTimeout(fallbackRef.current);
  }, []);

  // Set synchronously, before the first await, so a double tap during the read starts
  // one door, not two (a second resolver would orphan the first tap's handler).
  const inFlightRef = useRef(false);
  // Same for a write: a fast double tap on Allow sends one answer.
  const writingRef = useRef(false);

  const ask = useCallback(async (): Promise<ConsentDoorOutcome> => {
    // A second tap while a door is reading or open joins nothing: it does not proceed.
    if (inFlightRef.current) return 'not_now';
    if (!userId) return 'unreadable';
    inFlightRef.current = true;
    setSettling(true);
    let state: ConsentDoorState = 'unreadable';
    try {
      state = await consentDoorState(userId);
    } catch (e) {
      console.warn('[useAiConsentDoor] consent read failed:', e);
    }
    if (state !== 'ask') {
      inFlightRef.current = false;
      setSettling(false);
      return state;
    }
    return new Promise<ConsentDoorOutcome>((resolve) => {
      resolverRef.current = (outcome) => {
        inFlightRef.current = false;
        resolve(outcome);
      };
      setVisible(true);
    });
  }, [userId]);

  const onChoose = useCallback(async (choice: ConsentChoice) => {
    if (!userId || writingRef.current) return;
    writingRef.current = true;
    setSaving(choice);
    setError(null);
    let saved = false;
    try {
      const result = await saveAiConsent(userId, choice === 'allow', 'backstop');
      saved = result.status === 'saved';
    } catch (e) {
      console.warn('[useAiConsentDoor] consent write failed:', e);
    } finally {
      writingRef.current = false;
    }
    if (!saved) {
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
