import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as Network from 'expo-network';
import { syncNow } from '../lib/sync';
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

    // A full sync cycle (push-before-pull, B-054 FR-2) lives in syncNow(), shared
    // with the History pull-to-refresh; the in-flight guard is module-level there
    // so overlapping triggers (mount/foreground/reconnect) serialize across both
    // entry points. Here we just run a cycle then refresh the pending-status badge.
    async function runSync() {
      await syncNow();
      const status = await getSyncStatus();
      setPendingStatus(status.pendingCount, status.oldestPendingAt);
    }

    // Swallow rejections at the call sites so a failed cycle can't surface as an
    // unhandled promise rejection.
    const safeRunSync = () => runSync().catch((e) => console.warn('[sync] cycle failed:', e));

    safeRunSync();

    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        safeRunSync();
      }
      appState.current = nextState;
    });

    // Flush the queue the moment connectivity is restored.
    const networkSub = Network.addNetworkStateListener((state) => {
      // isInternetReachable can be null while the check is in progress — treat
      // null as "still online" to avoid false-positive offline transitions.
      const isOnline = !!(state.isConnected && state.isInternetReachable !== false);
      if (!wasOnline.current && isOnline) {
        safeRunSync();
      }
      wasOnline.current = isOnline;
    });

    return () => {
      appStateSub.remove();
      networkSub.remove();
    };
  }, [session]);
}
