import { useEffect } from 'react';
import { Alert, AppState } from 'react-native';
import * as Network from 'expo-network';
import { drainPendingKeeps, pendingKeepMissNotice } from '../lib/reportKeep';
import { isOnlineFromState } from '../lib/network';
import { currentSignOutEpoch } from '../lib/signOutEpoch';
import { useAuthStore } from '../store/authStore';
import { usePetStore } from '../store/petStore';

// Vet report v2 PR-32 (CUL-2522): a kept copy survives the app closing. A keep still retrying
// when the app was closed left its row in the phone's ledger (lib/reportKeepLedger.ts); this
// tries it again on open, on every foreground and on reconnect, and says a miss once.
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
        if (notice) Alert.alert(notice.title, notice.body);
      });
    };

    drain();
    const appSub = AppState.addEventListener('change', (next) => {
      if (/inactive|background/.test(appState) && next === 'active') drain();
      appState = next;
    });
    const netSub = Network.addNetworkStateListener((state) => {
      const online = isOnlineFromState(state);
      if (!wasOnline && online) drain();
      wasOnline = online;
    });
    return () => {
      appSub.remove();
      netSub.remove();
    };
  }, [session]);
}
