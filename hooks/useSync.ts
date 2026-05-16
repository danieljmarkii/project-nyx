import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import {
  syncPendingEvents, syncPendingMeals, refreshFoodCache,
  syncPendingVetVisits, syncPendingAttachments,
} from '../lib/sync';
import { useAuthStore } from '../store/authStore';

export function useSync() {
  const { session } = useAuthStore();
  const appState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    if (!session) return;

    // Events must complete before meals — meals FK references events.id.
    // Attachments, vet visits, and food cache are independent and run in parallel.
    async function runSync() {
      await syncPendingEvents();
      await syncPendingMeals();
      syncPendingAttachments();
      syncPendingVetVisits();
      refreshFoodCache();
    }

    runSync();

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        runSync();
      }
      appState.current = nextState;
    });

    return () => subscription.remove();
  }, [session]);
}
