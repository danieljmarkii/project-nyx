import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as Network from 'expo-network';
import { syncNow } from '../lib/sync';
import { getSyncStatus, isLocalDataEmpty } from '../lib/db';
import { ingestCaptureInbox } from '../lib/captureInbox';
import { isOnlineFromState } from '../lib/network';
import { useAuthStore } from '../store/authStore';
import { usePetStore } from '../store/petStore';
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
        // B-290 — drain the App Group capture inbox BEFORE the cycle, so a
        // widget/intent tap made while the app was backgrounded lands in local
        // SQLite as synced=0 and rides THIS cycle's push (§4.1 Q4: the ingest is
        // foreground-driven and idempotent, so a crash mid-ingest re-runs
        // harmlessly — no lost taps). Reads the pet list at call time; an empty
        // list (not yet loaded) defers the whole pass rather than misjudging
        // records. Best-effort: an ingest failure must never block the sync.
        await ingestCaptureInbox(
          new Set(usePetStore.getState().pets.map((p) => p.id)),
        ).catch((e) => console.warn('[sync] inbox ingest failed:', e));
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

    // Flush the queue the moment connectivity is restored. isOnlineFromState is
    // the shared mapper (lib/network) — same "null reachability = still online"
    // rule the account-deletion offline guard uses, kept in one place.
    const networkSub = Network.addNetworkStateListener((state) => {
      const isOnline = isOnlineFromState(state);
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
