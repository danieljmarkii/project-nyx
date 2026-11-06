import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import * as Network from 'expo-network';
import { acknowledgeKeepMisses, drainPendingKeeps, pendingKeepMissNotice, type KeepMiss } from '../lib/reportKeep';
import { isOnlineFromState } from '../lib/network';
import { currentSignOutEpoch } from '../lib/signOutEpoch';
import { useAuthStore } from '../store/authStore';
import { keepLossNotice, mayHearKeepLoss, useKeepLossStore } from '../store/keepLossStore';
import { usePetStore } from '../store/petStore';

/** The miss notice on screen, and the misses its OK dismisses. */
export interface KeepMissNoticeState {
  title: string;
  body: string;
  misses: readonly KeepMiss[];
}

// Vet report v2 PR-32 (CUL-2522): a kept copy survives the app closing. A keep still retrying
// when the app was closed left its row in the phone's ledger (lib/reportKeepLedger.ts); this
// tries it again on open, on every foreground and on reconnect, and says a miss once: its rows go
// when the owner taps OK.
//
// The epoch is the sign-out guard useSync uses (CUL-1968): a drain that started under one account
// never shows its notice after a sign-out, since the wipe took the rows and the pets it names.
//
// THE NOTICE IS THE APP'S, NOT THE SYSTEM'S (CUL-2576). A system Alert cannot be closed from code,
// so one raised before a forced sign-out stayed up on the sign-in screen naming the previous
// owner's pet. The notice is state here, rendered by `PendingReportKeepsHost`, and it closes the
// moment the session goes or changes account; its rows were the wipe's, so nothing is
// acknowledged. A notice closed that way and never wiped is said again at the next launch.
//
// A FORCED SIGN-OUT'S LOSS IS SAID HERE TOO (CUL-2573): `store/keepLossStore.ts` holds what a
// forced wipe took; it is said once, signed out or to the account that lost it, and dropped
// unsaid if another account is signed in by then. That line names no pet.
export function usePendingReportKeeps(): { notice: KeepMissNoticeState | null; dismiss: () => void } {
  const { session } = useAuthStore();
  const userId = session?.user.id ?? null;
  const [notice, setNotice] = useState<(KeepMissNoticeState & { userId: string }) | null>(null);
  const lost = useKeepLossStore((s) => s.lost);
  // The forced sign-out's line, and the account it is about (rls-privacy-reviewer L1: drawn here,
  // not as a system Alert, so it too closes when another account's session arrives).
  const [loss, setLoss] = useState<{ title: string; body: string; lostUserId: string | null } | null>(null);

  // Any session change closes a notice raised under another account (or none).
  const shown = notice !== null && notice.userId === userId ? notice : null;
  useEffect(() => {
    if (notice !== null && notice.userId !== userId) setNotice(null);
  }, [notice, userId]);

  useEffect(() => {
    if (!lost) return;
    const taken = useKeepLossStore.getState().take();
    if (!taken || !mayHearKeepLoss(taken.userId, userId)) return;
    const line = keepLossNotice(taken.count);
    if (line) setLoss({ ...line, lostUserId: taken.userId });
  }, [lost, userId]);

  const lossShown = loss !== null && mayHearKeepLoss(loss.lostUserId, userId) ? loss : null;
  useEffect(() => {
    if (loss !== null && !mayHearKeepLoss(loss.lostUserId, userId)) setLoss(null);
  }, [loss, userId]);

  useEffect(() => {
    if (!userId) return;
    const epoch = currentSignOutEpoch();
    let wasOnline = true;
    let appState = AppState.currentState ?? 'unknown';

    const drain = () => {
      void drainPendingKeeps().then((misses) => {
        if (currentSignOutEpoch() !== epoch) return;
        if (useAuthStore.getState().session?.user.id !== userId) return;
        const pets = usePetStore.getState().pets;
        const line = pendingKeepMissNotice(misses, (id) => pets.find((p) => p.id === id)?.name ?? '');
        // The rows go only on dismissal: a notice that never shows (a kill before the tap) is
        // said again at the next launch (adversarial-reviewer finding 3).
        if (line) setNotice({ ...line, misses, userId });
      });
    };

    drain();
    const appSub = AppState.addEventListener('change', (next) => {
      if (/inactive|background/.test(appState) && next === 'active') drain();
      appState = next;
    });
    const netSub = Network.addNetworkStateListener((state) => {
      const online = isOnlineFromState(state);
      // Only in the foreground: a notice raised behind the app may never show.
      if (!wasOnline && online && AppState.currentState === 'active') drain();
      wasOnline = online;
    });
    return () => {
      appSub.remove();
      netSub.remove();
    };
  }, [userId]);

  const dismiss = useCallback(() => {
    if (shown) {
      // Acknowledged only under the account it was raised for: a notice closed by a sign-out
      // acknowledges nothing.
      if (useAuthStore.getState().session?.user.id === shown.userId) void acknowledgeKeepMisses(shown.misses);
      setNotice(null);
      return;
    }
    setLoss(null);
  }, [shown]);

  // One card at a time: the miss (a session's own) first, then the sign-out's line.
  const card: KeepMissNoticeState | null = shown ?? (lossShown ? { title: lossShown.title, body: lossShown.body, misses: [] } : null);
  return { notice: card, dismiss };
}
