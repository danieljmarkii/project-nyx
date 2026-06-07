import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as Network from 'expo-network';
import { syncNow } from '../lib/sync';
import { getSyncStatus, isLocalDataEmpty } from '../lib/db';
import { useAuthStore } from '../store/authStore';
import { useSyncStore } from '../store/syncStore';

export function useSync() {
  const { session } = useAuthStore();
  const { setPendingStatus, setColdStartHydrating, bumpHydrationTick } = useSyncStore();
  const appState = useRef<AppStateStatus>(AppState.currentState);
  // Tracks whether we were last known to be online so we can detect transitions.
  const wasOnline = useRef<boolean>(true);

  useEffect(() => {
    if (!session) return;

    // A full sync cycle (push-before-pull, B-054 FR-2) lives in syncNow(), shared
    // with the History pull-to-refresh; the in-flight guard is module-level there
    // so overlapping triggers (mount/foreground/reconnect) serialize across both
    // entry points. Here we run a cycle, then refresh the pending-status badge and
    // bump the hydration tick so screens re-read what just landed locally.
    //
    // B-054 §6 (block-only-when-empty): only the FIRST run after a session is
    // established can put up the blocking "Catching up…" overlay, and only if the
    // local store is genuinely empty (true cold start). Foreground/reconnect
    // re-syncs never block — local is already populated, so they reconcile silently.
    //
    // Account-switch ordering: on sign-out, _layout.tsx awaits clearLocalData()
    // BEFORE setSession(null), and this effect keys on `session`, so by the time a
    // new session triggers a fresh initial run the wipe has already completed —
    // isLocalDataEmpty() reads a fully-cleared store, not one mid-wipe. (A switch
    // is also a multi-second UI flow, far longer than the wipe.)
    async function runSync(isInitial: boolean) {
      let blocking = false;
      if (isInitial) {
        try {
          blocking = await isLocalDataEmpty();
        } catch (e) {
          console.warn('[sync] cold-start emptiness check failed:', e);
        }
        if (blocking) setColdStartHydrating(true);
      }
      try {
        await syncNow();
      } finally {
        // Clear the overlay whether the cycle succeeded or threw — never strand it.
        if (blocking) setColdStartHydrating(false);
        // Reactive refresh-after-hydrate: bump even on a throw. A cycle that
        // failed partway may still have written some hydrated rows before the
        // error (hydrateFromCloud isolates each table), so the screens should
        // re-read whatever did land. Idempotent and cheap.
        bumpHydrationTick();
      }
      const status = await getSyncStatus();
      setPendingStatus(status.pendingCount, status.oldestPendingAt);
    }

    // Swallow rejections at the call sites so a failed cycle can't surface as an
    // unhandled promise rejection (and can't leave the cold-start overlay stuck).
    const safeRunSync = (isInitial = false) =>
      runSync(isInitial).catch((e) => {
        if (isInitial) setColdStartHydrating(false);
        console.warn('[sync] cycle failed:', e);
      });

    safeRunSync(true);

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
