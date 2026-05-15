import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { syncPendingEvents, refreshFoodCache } from '../lib/sync';
import { useAuthStore } from '../store/authStore';

export function useSync() {
  const { session } = useAuthStore();
  const appState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    if (!session) return;

    // Sync on mount
    syncPendingEvents();
    refreshFoodCache();

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        syncPendingEvents();
        refreshFoodCache();
      }
      appState.current = nextState;
    });

    return () => subscription.remove();
  }, [session]);
}
