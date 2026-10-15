import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as Network from 'expo-network';
import { syncNow } from '../lib/sync';
import { getSyncStatus, isLocalDataEmpty } from '../lib/db';
import { hasHydratedRecord, holdColdStartWait, shouldShowColdStartWait } from '../lib/coldStart';
import { consumeForcedColdStart } from '../lib/devColdStart';
import { ingestCaptureInbox } from '../lib/captureInbox';
import { getIsOnline, isOnlineFromState } from '../lib/network';
import { useAuthStore } from '../store/authStore';
import { usePetStore } from '../store/petStore';
import { useSyncStore } from '../store/syncStore';

export function useSync() {
  const { session } = useAuthStore();
  const { setPendingStatus, setColdStartHydrating, bumpHydrationTick } = useSyncStore();
  const appState = useRef<AppStateStatus>(AppState.currentState);
  // Tracks whether we were last known to be online so we can detect transitions.
  const wasOnline = useRef<boolean>(true);
  // CUL-1214 — the account whose first sync this launch already ran. The effect re-runs
  // on every session object (a token refresh is a new one), and a re-run must not raise
  // the wait a second time over an owner already using the app.
  const initialRunFor = useRef<string | null>(null);

  useEffect(() => {
    if (!session) return;
    const userId = session.user.id;

    // Idempotent: the ceiling, the settle and an offline transition may each call it.
    const releaseColdStartWait = () => {
      if (useSyncStore.getState().coldStartHydrating) setColdStartHydrating(false);
    };

    // A full sync cycle (push-before-pull, B-054 FR-2) lives in syncNow(), shared
    // with the History pull-to-refresh; the in-flight guard is module-level there
    // so overlapping triggers (mount/foreground/reconnect) serialize across both
    // entry points. Here we run a cycle, then refresh the pending-status badge and
    // bump the hydration tick so screens re-read what just landed locally.
    //
    // B-054 §6 (block-only-when-empty): only the FIRST run after a session is
    // established can put up the blocking cold-start wait, and only on a device that
    // has never read this account's record. Foreground/reconnect re-syncs never block.
    //
    // CUL-1214: "never read" is decided from the watermark, not a row count, so an
    // owner with a pet and nothing logged reconciles silently like any returning
    // device; the wait lets go at a ceiling; and an offline launch never blocks
    // (lib/coldStart.ts holds all three rules).
    //
    // Account-switch ordering: on sign-out, _layout.tsx awaits clearLocalData()
    // BEFORE setSession(null), and this effect keys on `session`, so by the time a
    // new session triggers a fresh initial run the wipe has already completed —
    // the watermarks and the store read fully cleared, not mid-wipe. (A switch
    // is also a multi-second UI flow, far longer than the wipe.)
    async function runSync(isInitial: boolean) {
      let blocking = false;
      if (isInitial) {
        try {
          const [hydrated, localEmpty, online] = await Promise.all([
            hasHydratedRecord(userId),
            isLocalDataEmpty(),
            getIsOnline(),
          ]);
          blocking = shouldShowColdStartWait({ hydrated, localEmpty, online });
        } catch (e) {
          console.warn('[sync] cold-start check failed:', e);
        }
        // CUL-1222 — a developer's armed cold start (`__forceColdStart`) blocks this one
        // first sync over a populated store, so the device pass can see the wait. Read
        // and cleared on every first sync, so the arm never outlives one launch.
        if (__DEV__ && (await consumeForcedColdStart())) blocking = true;
        if (blocking) setColdStartHydrating(true);
      }
      const cycle = async () => {
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
      };
      try {
        // The wait lets go when the cycle settles (succeeded or threw — never strand
        // it) or at the ceiling, whichever comes first.
        if (blocking) await holdColdStartWait(cycle, releaseColdStartWait);
        else await cycle();
      } finally {
        // Reactive refresh-after-hydrate: bump even on a throw. A cycle that
        // failed partway may still have written some hydrated rows before the
        // error (hydrateFromCloud isolates each table), so the screens should
        // re-read whatever did land. Idempotent and cheap.
        bumpHydrationTick();
      }
      const status = await getSyncStatus();
      setPendingStatus(status.pendingCount, status.oldestPendingAt, status.quarantinedCount);
    }

    // Swallow rejections at the call sites so a failed cycle can't surface as an
    // unhandled promise rejection (and can't leave the cold-start overlay stuck).
    const safeRunSync = (isInitial = false) =>
      runSync(isInitial).catch((e) => {
        if (isInitial) releaseColdStartWait();
        console.warn('[sync] cycle failed:', e);
      });

    const isInitialForAccount = initialRunFor.current !== userId;
    initialRunFor.current = userId;
    safeRunSync(isInitialForAccount);

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
      // CUL-1214 — offline never blocks: a connection lost during the wait lets go of
      // the screen now rather than at the ceiling. Home shows what has landed.
      if (!isOnline) releaseColdStartWait();
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
