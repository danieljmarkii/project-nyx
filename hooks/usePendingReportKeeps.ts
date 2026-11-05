import { useEffect } from 'react';
import { Alert, AppState } from 'react-native';
import * as Network from 'expo-network';
import { acknowledgeKeepMisses, drainPendingKeeps, pendingKeepMissNotice } from '../lib/reportKeep';
import { isOnlineFromState } from '../lib/network';
import { currentSignOutEpoch } from '../lib/signOutEpoch';
import { useAuthStore } from '../store/authStore';
import { usePetStore } from '../store/petStore';

// Vet report v2 PR-32 (CUL-2522): a kept copy survives the app closing. A keep still retrying
// when the app was closed left its row in the phone's ledger (lib/reportKeepLedger.ts); this
// tries it again on open, on every foreground and on reconnect, and says a miss once: its rows go
// when the owner taps OK.
//
// The epoch is the sign-out guard useSync uses (CUL-1968): a drain that started under one account
// never shows its notice after a sign-out, since the wipe took the rows and the pets it names.
export function usePendingReportKeeps(): void {
  const { session } = useAuthStore();

  useEffect(() => {
    if (!session) return;
    const epoch = currentSignOutEpoch();
    let wasOnline = true;
    let appState = AppState.currentState ?? 'unknown';

    const drain = () => {
      void drainPendingKeeps().then((misses) => {
        if (currentSignOutEpoch() !== epoch) return;
        const pets = usePetStore.getState().pets;
        const notice = pendingKeepMissNotice(misses, (id) => pets.find((p) => p.id === id)?.name ?? '');
        // The rows go only on dismissal: an alert that never shows (Android with no activity, a
        // kill before the tap) is said again at the next launch (adversarial-reviewer finding 3).
        if (notice) Alert.alert(notice.title, notice.body, [{ text: 'OK', onPress: () => void acknowledgeKeepMisses(misses) }], {
          cancelable: false,
        });
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
  }, [session]);
}
