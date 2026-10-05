// EN-14's client gate and the follow-up notification's triggers (Engines v3 PR-36, CUL-1419).
//
// THE GATE. Every EN-14 surface (the incident screen's "I've called", the call record in Vet
// visits and History, Home's follow-up line, the Settings switch) draws only while
// `engines_v3_en14` resolves on for the signed-in account: fail-closed, absent reads off, so
// the build ships dark (PMD-12 keeps the allowlist to the PM's account, CUL-1313). The call
// screen itself does not gate: a call that exists was made under the flag, and its owner may
// always read it back.
import { useEffect } from 'react';
import { useAllowlistFlag } from './useAppConfig';
import { useAppActive } from './useAppActive';
import { useSyncStore } from '../store/syncStore';
import { usePetStore } from '../store/petStore';
import { syncFollowUpNotifications } from '../lib/followUpNotifications';

export const EN14_FLAG = 'engines_v3_en14' as const;

export function useEn14(): boolean {
  return useAllowlistFlag(EN14_FLAG);
}

/** Reconcile the follow-up notifications now, from a write (an answer, a call, an Undo) or the
 *  Settings switch. Names come from the store at call time, never a closure. */
export function refreshFollowUpNotifications(flagOn: boolean): Promise<void> {
  const names = new Map(usePetStore.getState().pets.map((p) => [p.id, p.name]));
  return syncFollowUpNotifications({ flagOn, petNames: names });
}

/** Mounted once beside `useNotificationScheduling`: reconcile on each foreground and each
 *  hydration tick, which is when an answer or a call from another phone lands. */
export function useFollowUpNotificationSync(): void {
  const flagOn = useEn14();
  const appActive = useAppActive();
  const hydrationTick = useSyncStore((s) => s.hydrationTick);
  useEffect(() => {
    if (!appActive) return;
    void refreshFollowUpNotifications(flagOn);
  }, [flagOn, appActive, hydrationTick]);
}
