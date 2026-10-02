import { useEffect, useState } from 'react';

import { readWindowFacts } from '../lib/historyWindowFacts';
import { isWindowOffered } from '../lib/historyWindows';
import { usePetStore } from '../store/petStore';

// Does History v2 offer *Since the trial started* for the active pet today? (HV-11 /
// CUL-1168; spec §3.9, CUL-498.)
//
// Ask's answer card asks before it offers "Open in History" for a count since the trial
// started: Ask counts over any `status = 'active'` trial, History offers the window only
// while the trial runs (B-422), and a link History would widen to All time is a list that
// shows more than the count it audits (B-378). So the answer is read through the SAME
// assembly History's own controls read (`readWindowFacts`), never a second trial read that
// could disagree with it about which trial, or which day.
//
// `enabled` is false for every answer that does not need it, so a conversation does not read
// the trial once per card. Until the read answers, and when it fails, the answer is false:
// the link stays on Patterns, which makes no count promise. The answer is stamped with the
// pet it was read for, and a mismatch reads as false during render (CUL-1120's shape). It is
// read once per pet: a card left open across midnight or a trial ended meanwhile keeps the
// answer it had, and History resolves the window again when the link lands (a window it no
// longer offers shows All time there, with its own name on the pill).
export function useHistoryTrialOffered(enabled: boolean): boolean {
  const activePet = usePetStore((s) => s.activePet);
  const petId = activePet?.id ?? null;
  const [answer, setAnswer] = useState<{ petId: string; offered: boolean } | null>(null);

  useEffect(() => {
    if (!enabled || !activePet) return;
    let cancelled = false;
    const { id, name, species, sex } = activePet;
    readWindowFacts({ id, name, species, sex })
      .then((facts) => {
        if (!cancelled) setAnswer({ petId: id, offered: isWindowOffered({ kind: 'trial' }, facts) });
      })
      .catch((e: unknown) => {
        console.error('[useHistoryTrialOffered] reading the trial window failed:', e);
        if (!cancelled) setAnswer({ petId: id, offered: false });
      });
    return () => {
      cancelled = true;
    };
    // The pet's identity is the trigger; its other fields are read inside.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, petId]);

  return enabled && answer !== null && answer.petId === petId && answer.offered;
}
