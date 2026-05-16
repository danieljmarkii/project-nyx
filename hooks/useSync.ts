import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as Network from 'expo-network';
import {
  syncPendingEvents, syncPendingMeals, refreshFoodCache,
  syncPendingVetVisits, syncPendingAttachments,
} from '../lib/sync';
import { getSyncStatus } from '../lib/db';
import { useAuthStore } from '../store/authStore';
import { useSyncStore } from '../store/syncStore';

export function useSync() {
  const { session } = useAuthStore();
  const { setPendingStatus } = useSyncStore();
  const appState = useRef<AppStateStatus>(AppState.currentState);
  // Tracks whether we were last known to be online so we can detect transitions.
  const wasOnline = useRef<boolean>(true);

  useEffect(() => {
    if (!session) return;

    // Events must complete before meals — meals FK references events.id.
    // Attachments, vet visits, and food cache are independent and run in parallel.
    // Upsert uses onConflict:'id' so the last row to arrive in Supabase wins.
    // For single-device MVP this is equivalent to last-write-wins on updated_at.
    // Multi-device LWW requires a server-side WHERE excluded.updated_at > events.updated_at.
    async function runSync() {
      await syncPendingEvents();
      await syncPendingMeals();
      syncPendingAttachments();
      syncPendingVetVisits();
      refreshFoodCache();

      const status = await getSyncStatus();
      setPendingStatus(status.pendingCount, status.oldestPendingAt);
    }

    runSync();

    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        runSync();
      }
      appState.current = nextState;
    });

    // Flush the queue the moment connectivity is restored.
    const networkSub = Network.addNetworkStateListener((state) => {
      // isInternetReachable can be null while the check is in progress — treat
      // null as "still online" to avoid false-positive offline transitions.
      const isOnline = !!(state.isConnected && state.isInternetReachable !== false);
      if (!wasOnline.current && isOnline) {
        runSync();
      }
      wasOnline.current = isOnline;
    });

    return () => {
      appStateSub.remove();
      networkSub.remove();
    };
  }, [session]);
}
