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

// ── The fire instant (B-672 — the Day Summary fire-day anchor) ────────────────
//
// A tapped daily-summary notification opens /day-summary, which renders "today".
// But the 9pm notification fires FOR a given day, and an owner who taps the
// still-present notification after midnight (late at night, or over Sunday
// breakfast) would otherwise land on the new, near-empty day — a Saturday they
// diligently logged reading "Nothing in {pet}'s record today", the exact false-empty
// the summary works to avoid. The fix carries the instant the notification FIRED
// through to the screen, which anchors its day to that (with a staleness clamp —
// resolveDaySummaryAnchorMs in lib/daySummary.ts). This is the "carry the delivery
// instant in the tap payload" B-672 prescribes.
//
// The fire instant is the OS DELIVERY time (`response.notification.date`): the
// daily summary is a repeating DAILY trigger, so its content.data is scheduled ONCE
// and is static — it cannot carry a per-fire day. The timestamp the OS stamps on
// each delivery is the honest per-fire identity.
//
// THE UNIT TRAP (why this is not a bare pass-through): expo-notifications serializes
// `Notification.date` in SECONDS on iOS (`UNNotification.date` →
// `timeIntervalSince1970`, NotificationRecords.swift:441) but MILLISECONDS on
// Android (`Date.getTime()`, NotificationSerializer.java:52), and nothing in the JS
// layer reconciles them. Read raw, an iOS delivery (~1.7e9) resolves to a 1970 day
// and clamps to today on EVERY tap — the anchor would silently never fire on the
// iOS-first build. So a seconds-scale value is promoted to ms. The 1e12 threshold
// splits the two cleanly: any real recent instant is ~1.7e9 s / ~1.7e12 ms, and
// 1e12 ms is the year 2001 — below any ms epoch this app will ever see, above any
// seconds epoch it could. Returns null for a missing/garbage value (→ no anchor →
// the screen defaults to today, the pre-B-672 behaviour).

const FIRE_INSTANT_MS_THRESHOLD = 1e12;

export function normalizeFireInstant(
  rawDate: number | string | null | undefined,
): number | null {
  const n = typeof rawDate === 'string' ? Number(rawDate) : rawDate;
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return null;
  // Seconds-scale (iOS) → promote to ms; ms-scale (Android) → keep. Round either
  // way: iOS timeIntervalSince1970 is a fractional-second Double.
  return n < FIRE_INSTANT_MS_THRESHOLD ? Math.round(n * 1000) : Math.round(n);
}

// ── The tap's route params (the DR-3 arrival marker — spec §4) ────────────────
//
// PURE, and tested here rather than inline in the listener, because it carries a
// NAMED GATE: `source: 'notification'` marks the arrival as a notification tap so
// the in-context Daily Recap offer (`isNotificationArrival` in lib/dailyRecapOffer)
// never shows over it. It is UNCONDITIONAL — carried even when the fire instant did
// not normalize into `firedAt` (where `firedAt` alone would be absent and the screen
// would misread the tap as an in-app visit, re-opening the gate). A future edit to
// this shape fails a unit test rather than silently reopening the offer on taps.
// `firedAt` (B-672's fire-day anchor) rides along only when present.
export function notificationRouteParams(
  firedAtMs: number | null,
): { source: 'notification'; firedAt?: string } {
  return firedAtMs != null
    ? { source: 'notification', firedAt: String(firedAtMs) }
    : { source: 'notification' };
}
