// Wires the notification schedule to the app's lifecycle (B-661 PR 4). Mounted
// once, in the root layout. Two jobs, both from the spec:
//
//   • RECONCILE ON FOREGROUND (§3) — the integrity mechanism. No OS schedule is
//     ever trusted to still exist, so on each foreground (and each hydration tick,
//     which is when a preference another device toggled lands) the live schedule is
//     diffed against the enabled prefs + permission and drift is repaired in the
//     SAFE direction. Until PR 3 ships a toggle, nothing is ever enabled, so this
//     only ever cancels a stray — which also makes it a second backstop, alongside
//     `wipeLocalSession`, against a schedule surviving a sign-out.
//
//   • ROUTE A TAP (§5.2 / §5.4) — a tapped daily-summary notification opens the
//     Day Summary screen (behind the auth gate) and records the interaction (the
//     self-pruning data §5.4 accrues). Warm taps come through the response listener;
//     a COLD-START tap (app was killed) is the launch response, routed once the
//     session has hydrated — so the deep link lands behind auth like any other.
//
// The routing DECISION is the pure `notificationRouteDecision`; this hook is the
// thin I/O around it (the same pure-core split as everywhere else).
import { useCallback, useEffect, useRef } from 'react';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useAppActive } from './useAppActive';
import { useAuthStore } from '../store/authStore';
import { useSyncStore } from '../store/syncStore';
import { recordCategoryInteraction } from '../lib/notifications';
// The reconcile itself is PR 3's (lib/notificationSettings) — one reconcile
// function, driven here on foreground and by the settings screen on focus. PR 4
// owns only the tap-routing decision (lib/notificationRouting).
import { reconcileFromPreferences } from '../lib/notificationSettings';
import { notificationRouteDecision, routeDedup } from '../lib/notificationRouting';

export function useNotificationScheduling(): void {
  const appActive = useAppActive();
  const hydrationTick = useSyncStore((s) => s.hydrationTick);
  const session = useAuthStore((s) => s.session);

  // ── Reconcile on foreground + when a synced pref may have changed ───────────
  // §3's app-foreground reconcile. reconcileFromPreferences (PR 3) reads permission
  // with request=false, so this NEVER fires the system prompt; computeReconcileActions
  // is a no-op when already in sync, so there is no churn. Complements the settings
  // screen's on-focus reconcile (PR 3, AC 6) — same function, a second trigger.
  useEffect(() => {
    if (!appActive) return;
    void reconcileFromPreferences().catch((e) =>
      console.warn('[notifications] foreground reconcile failed:', e),
    );
  }, [appActive, hydrationTick]);

  // ── Route a tap ─────────────────────────────────────────────────────────────
  // The dedup that makes a tap route EXACTLY ONCE (the launch response can surface
  // through BOTH the warm listener and the cold-start read) lives in the pure
  // `routeDedup` — tested there. This ref just holds the last-routed signature it
  // advances, so a pre-auth cold-start tap re-routes once the session lands rather
  // than being swallowed.
  const routedSigRef = useRef<string | null>(null);

  const routeFromResponse = useCallback((resp: Notifications.NotificationResponse | null) => {
    if (!resp) return;
    const req = resp.notification?.request;
    const data = req?.content?.data ?? null;
    const decision = notificationRouteDecision(data, {
      authed: !!useAuthStore.getState().session,
    });
    // The tap IS the interaction (§5.4). recordCategoryInteraction just overwrites a
    // timestamp, so calling it again on a re-surfaced launch response is harmless.
    if (decision.recordCategory) void recordCategoryInteraction(decision.recordCategory);
    const { route, sig } = routeDedup({
      identifier: req?.identifier,
      deliveredAt: resp.notification?.date,
      routeTo: decision.routeTo,
      prevSig: routedSigRef.current,
    });
    routedSigRef.current = sig;
    if (!route || !decision.routeTo) return;
    // `routeTo` is a runtime string that notificationRouteDecision has already
    // validated against the registry's known routes (SAFE_NOTIFICATION_ROUTES), so
    // it is a real Href; the cast only bridges the opaque-string → typed-route gap.
    router.push(decision.routeTo as never);
  }, []);

  // Warm taps (app already running).
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(routeFromResponse);
    return () => sub.remove();
  }, [routeFromResponse]);

  // Cold-start tap: the response that launched the app, read ONCE the first time a
  // session exists (the auth gate — §5.2 "cold-start tap routes after hydration").
  // The one-shot ref keeps a later session-reference change (a token refresh) from
  // re-invoking the native read for no purpose past the first check.
  const launchCheckedRef = useRef(false);
  useEffect(() => {
    if (!session || launchCheckedRef.current) return;
    launchCheckedRef.current = true;
    let cancelled = false;
    Notifications.getLastNotificationResponseAsync?.()
      .then((resp) => {
        if (!cancelled) routeFromResponse(resp);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [session, routeFromResponse]);
}
