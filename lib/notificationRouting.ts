// Notification-tap routing (B-661 PR 4 — docs/nyx-notification-foundation-
// requirements.md §5.2 / §5.4). The pure decision layer for what a tapped
// notification does: which route it opens (behind the auth gate) and whether the
// tap counts as an interaction.
//
// The PREFERENCE reader and the schedule RECONCILE are NOT here — PR 3 shipped them
// as `readEnabledCategories` / `reconcileFromPreferences` in `lib/notificationSettings.ts`
// (the split-brain-safe read the PR 2 mirror header prescribed), and the settings
// screen already drives them. PR 4 reuses those rather than minting a second reader;
// this module owns only the tap-routing PR 3 did not build.
import {
  NOTIFICATION_CATEGORIES,
  ALL_NOTIFICATION_CATEGORIES,
  type NotificationCategory,
} from './notifications';

const KNOWN_CATEGORIES = new Set<string>(ALL_NOTIFICATION_CATEGORIES);

// Every category's tap route, derived from the registry so adding a category adds
// its route for free — and nothing else can be navigated to from a notification.
const SAFE_NOTIFICATION_ROUTES = new Set<string>(
  Object.values(NOTIFICATION_CATEGORIES).map((c) => c.route),
);

/** The `content.data` an OS notification carries back on tap (see `scheduleCategory`).
 *  Typed as `unknown` fields because it is round-tripped through the OS and a
 *  stale/foreign notification could carry anything. */
export interface NotificationTapData {
  category?: unknown;
  route?: unknown;
}

export interface NotificationRouteDecision {
  /** Record a last-interaction for this category (the self-pruning data B-288 will
   *  read, §5.4). Set whenever the owner tapped one of OUR notifications, regardless
   *  of whether routing proceeds — the tap IS the interaction. */
  recordCategory: NotificationCategory | null;
  /** Navigate here, or null to drop silently. Null when unauthenticated (the tap
   *  lands behind the auth gate like any deep link, §5.2) or when the route is not
   *  one of ours (G5 fail-safe — never navigate a stale/foreign payload blind). */
  routeTo: string | null;
}

/**
 * PURE: what a notification tap should do. Records the interaction for a known
 * category; routes only when authenticated AND the payload's route is a registered
 * one. Separated from the listener so the decision is testable without mocking
 * expo-notifications or the router.
 */
export function notificationRouteDecision(
  data: NotificationTapData | null | undefined,
  opts: { authed: boolean },
): NotificationRouteDecision {
  const rawCategory = typeof data?.category === 'string' ? data.category : null;
  const recordCategory =
    rawCategory && KNOWN_CATEGORIES.has(rawCategory)
      ? (rawCategory as NotificationCategory)
      : null;
  const rawRoute = typeof data?.route === 'string' ? data.route : null;
  const routeTo = opts.authed && rawRoute && SAFE_NOTIFICATION_ROUTES.has(rawRoute) ? rawRoute : null;
  return { recordCategory, routeTo };
}

/**
 * PURE: the per-delivery dedup that makes a notification tap route EXACTLY ONCE,
 * even though both the warm response listener and the cold-start read can surface
 * the SAME launch response. The signature keys on the schedule identifier PLUS the
 * delivery time, which gives the three behaviours the wiring needs:
 *   • one delivery surfaced twice (listener + cold read) → routes once (same sig);
 *   • a real second tap on a later day → routes again (the identifier alone repeats
 *     daily; the delivery time differs);
 *   • a tap that could not route yet (unauthenticated cold start, `routeTo` null)
 *     leaves the signature UNMARKED, so it re-routes once the session lands (§5.2)
 *     rather than being swallowed.
 *
 * `prevSig` is the last-routed signature; the returned `sig` advances ONLY when
 * `route` is true, which is exactly what preserves the pre-auth re-attempt.
 */
export function routeDedup(input: {
  identifier: string | null | undefined;
  deliveredAt: number | string | null | undefined;
  routeTo: string | null;
  prevSig: string | null;
}): { route: boolean; sig: string | null } {
  if (!input.routeTo) return { route: false, sig: input.prevSig };
  const sig = `${input.identifier ?? ''}|${input.deliveredAt ?? ''}`;
  if (sig === input.prevSig) return { route: false, sig: input.prevSig };
  return { route: true, sig };
}
