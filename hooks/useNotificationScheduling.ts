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
import { reconcileDailySummary, notificationRouteDecision } from '../lib/notificationSchedule';

export function useNotificationScheduling(): void {
  const appActive = useAppActive();
  const hydrationTick = useSyncStore((s) => s.hydrationTick);
  const session = useAuthStore((s) => s.session);

  // ── Reconcile on foreground + when a synced pref may have changed ───────────
  // reconcileDailySummary reads permission with request=false, so this NEVER fires
  // the system prompt; computeReconcileActions is a no-op when already in sync, so
  // there is no churn. Failures inside are swallowed by the loader (fail-safe []).
  useEffect(() => {
    if (!appActive) return;
    void reconcileDailySummary();
  }, [appActive, hydrationTick]);

  // ── Route a tap ─────────────────────────────────────────────────────────────
  // Routing is deduped per DELIVERY (identifier + delivery date) so the launch
  // response — which both the listener and the cold-start read can surface — routes
  // once, while a real second tap on a different day (same schedule id, new date)
  // still routes. The signature is marked ONLY on a real navigation, so a pre-auth
  // cold-start tap re-routes once the session lands rather than being swallowed.
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
    if (!decision.routeTo) return; // unauthenticated, or not one of our routes (G5)
    const sig = `${req?.identifier ?? ''}|${resp.notification?.date ?? ''}`;
    if (routedSigRef.current === sig) return;
    routedSigRef.current = sig;
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

  // Cold-start tap: the response that launched the app, routed once a session
  // exists (the auth gate — §5.2 "cold-start tap routes after hydration"). Re-runs
  // when the session transitions in, covering a tap that beat hydration.
  useEffect(() => {
    if (!session) return;
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
