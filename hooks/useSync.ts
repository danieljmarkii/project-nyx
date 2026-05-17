import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as Network from 'expo-network';
import {
  syncPendingEvents, syncPendingMeals, refreshFoodCache,
  syncPendingVetVisits, syncPendingAttachments, downloadRemoteData,
} from '../lib/sync';
import { getSyncStatus } from '../lib/db';
import { useAuthStore } from '../store/authStore';
import { usePetStore } from '../store/petStore';
import { useSyncStore } from '../store/syncStore';

export function useSync() {
  const { session } = useAuthStore();
  const { activePet } = usePetStore();
  const { setPendingStatus } = useSyncStore();
  const appState = useRef<AppStateStatus>(AppState.currentState);
  // Tracks whether we were last known to be online so we can detect transitions.
  const wasOnline = useRef<boolean>(true);
  const petId = activePet?.id;

  useEffect(() => {
    if (!session) return;

    // Order matters:
    //   1. Upload local→remote first. Anything still synced=0 after this is
    //      a brand-new edit made *during* the sync; downloadRemoteData below
    //      will not overwrite it (its upsert has WHERE synced = 1).
    //   2. Download remote→local for the active pet. Closes the second-device
    //      gap — without this, a fresh install signed into an existing
    //      account sees an empty timeline.
    //   3. Independent flushes (attachments, vet visits, food cache) fire
    //      after — they don't gate the timeline being populated.
    // Upsert uses onConflict:'id' so the last row to arrive in Supabase wins.
    // For single-device MVP this is equivalent to last-write-wins on updated_at.
    // Multi-device LWW requires a server-side WHERE excluded.updated_at > events.updated_at.
    async function runSync() {
      await syncPendingEvents();
      await syncPendingMeals();
      if (petId) await downloadRemoteData(petId);
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
    // petId is in the dep array so the download pass fires once the pet
    // resolves — the first runSync after sign-in happens before usePet has
    // loaded activePet, and we need a second pass that includes the pull.
  }, [session, petId]);
}
