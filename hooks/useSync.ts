import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as Network from 'expo-network';
import {
  syncPendingEvents, syncPendingMeals, refreshFoodCache,
  syncPendingVetVisits, syncPendingAttachments, hydrateFromCloud,
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

    // Push-before-pull (B-054 FR-2): flush local writes UP first, then hydrate
    // remote rows DOWN — so a not-yet-pushed local edit is sent before remote
    // state is read back, and an older remote copy can't clobber it. Events
    // must complete before meals (meals FK → events.id); the push path and the
    // hydrate path both honor that ordering.
    //
    // Phase-1 reconcile is the naive guard in lib/hydration.ts (insert-if-
    // absent, else replace-if-strictly-newer). Trigger-correct LWW — the
    // set_updated_at server trigger rewriting updated_at on every write — is
    // Phase 2 (docs/multi-device-sync-requirements.md §5.2 FR-5).
    async function runSync() {
      // Push up.
      await syncPendingEvents();
      await syncPendingMeals();
      await syncPendingAttachments();
      await syncPendingVetVisits();
      // Pull down.
      await hydrateFromCloud();
      await refreshFoodCache();

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
