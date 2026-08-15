// Notification-tap routing tests (B-661 PR 4). The tap auth-gate and the
// route-exactly-once dedup — the two behaviours the wiring depends on — proven
// as pure functions, no expo-notifications listener or router involved.
//
// (The enabled-category reader + reconcile live in lib/notificationSettings.ts,
// shipped and tested by PR 3; PR 4 reuses them rather than re-testing them here.)

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  cancelAllScheduledNotificationsAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  SchedulableTriggerInputTypes: { DAILY: 'daily' },
  AndroidImportance: { DEFAULT: 3 },
}));

import {
  notificationRouteDecision,
  routeDedup,
  normalizeFireInstant,
  notificationRouteParams,
} from './notificationRouting';

// ── notificationRouteDecision (the tap auth gate) ────────────────────────────
describe('notificationRouteDecision', () => {
  const data = { category: 'daily_summary', route: '/day-summary' };

  it('routes an authed tap and records the interaction', () => {
    expect(notificationRouteDecision(data, { authed: true })).toEqual({
      recordCategory: 'daily_summary',
      routeTo: '/day-summary',
    });
  });

  it('records the interaction but does NOT route when unauthenticated (behind the auth gate)', () => {
    expect(notificationRouteDecision(data, { authed: false })).toEqual({
      recordCategory: 'daily_summary',
      routeTo: null,
    });
  });

  it('never routes a foreign/stale route, even authed (G5 fail-safe)', () => {
    expect(
      notificationRouteDecision({ category: 'daily_summary', route: '/settings' }, { authed: true }),
    ).toEqual({ recordCategory: 'daily_summary', routeTo: null });
  });

  it('records no interaction for an unknown category', () => {
    expect(
      notificationRouteDecision({ category: 'mystery', route: '/day-summary' }, { authed: true }),
    ).toEqual({ recordCategory: null, routeTo: '/day-summary' });
  });

  it('tolerates a missing/garbage payload without throwing', () => {
    expect(notificationRouteDecision(null, { authed: true })).toEqual({
      recordCategory: null,
      routeTo: null,
    });
    expect(notificationRouteDecision({ category: 5, route: {} }, { authed: true })).toEqual({
      recordCategory: null,
      routeTo: null,
    });
  });
});

// ── routeDedup (route-exactly-once + the pre-auth re-attempt) ─────────────────
describe('routeDedup', () => {
  const delivery = { identifier: 'nyx.notif.daily_summary', deliveredAt: 1_700_000_000_000 };

  it('routes a fresh delivery and advances the signature', () => {
    const out = routeDedup({ ...delivery, routeTo: '/day-summary', prevSig: null });
    expect(out.route).toBe(true);
    expect(out.sig).toBe('nyx.notif.daily_summary|1700000000000');
  });

  it('does NOT route the same delivery twice (listener + cold read surface it once)', () => {
    const first = routeDedup({ ...delivery, routeTo: '/day-summary', prevSig: null });
    const second = routeDedup({ ...delivery, routeTo: '/day-summary', prevSig: first.sig });
    expect(second.route).toBe(false);
    expect(second.sig).toBe(first.sig);
  });

  it('routes AGAIN for a later day (same schedule id, new delivery time)', () => {
    const day1 = routeDedup({ ...delivery, routeTo: '/day-summary', prevSig: null });
    const day2 = routeDedup({
      identifier: delivery.identifier,
      deliveredAt: 1_700_086_400_000, // +1 day
      routeTo: '/day-summary',
      prevSig: day1.sig,
    });
    expect(day2.route).toBe(true);
    expect(day2.sig).not.toBe(day1.sig);
  });

  it('leaves the signature UNMARKED when it cannot route yet (pre-auth cold start)', () => {
    // routeTo null (unauthenticated) → no route, and the sig must NOT advance, or
    // the post-auth re-attempt below would be swallowed.
    const preAuth = routeDedup({ ...delivery, routeTo: null, prevSig: null });
    expect(preAuth).toEqual({ route: false, sig: null });

    // Session lands → same delivery, now with a route → it routes (the swallowed-tap
    // regression this guards against).
    const postAuth = routeDedup({ ...delivery, routeTo: '/day-summary', prevSig: preAuth.sig });
    expect(postAuth.route).toBe(true);
  });
});

// ── normalizeFireInstant (B-672 — the fire-day anchor's instant) ─────────────
// The unit trap: expo serializes Notification.date in SECONDS on iOS and
// MILLISECONDS on Android. Read raw, an iOS delivery would resolve to a 1970 day and
// clamp to today on every tap — the anchor would silently never fire on the
// iOS-first build. This normalizer is what makes the delivery instant usable.
describe('normalizeFireInstant', () => {
  // A real recent whole-second delivery: iOS gives seconds, Android gives ms.
  const ms = Date.parse('2026-08-01T21:00:00Z');
  const secs = ms / 1000; // exact — the instant is on a whole second

  it('keeps an Android millisecond delivery as-is', () => {
    expect(normalizeFireInstant(ms)).toBe(ms);
  });

  it('promotes an iOS second delivery to milliseconds (same wall-clock instant)', () => {
    // The bug this exists to kill: read raw, `secs` (~1.79e9) is 1970-01-21 in ms.
    expect(normalizeFireInstant(secs)).toBe(secs * 1000);
    // …and that lands on the SAME day the ms form does.
    expect(normalizeFireInstant(secs)).toBe(ms - (ms % 1000));
  });

  it('parses a stringified value (route params arrive as strings)', () => {
    expect(normalizeFireInstant(String(ms))).toBe(ms);
    expect(normalizeFireInstant(String(secs))).toBe(secs * 1000);
  });

  it('rounds an iOS fractional-second Double to integer ms', () => {
    // timeIntervalSince1970 is a Double — sub-second precision must not leak through.
    expect(normalizeFireInstant(secs + 0.5)).toBe(secs * 1000 + 500);
  });

  it('returns null for a missing / non-positive / unparseable value (→ no anchor)', () => {
    for (const bad of [null, undefined, 0, -5, NaN, Infinity, 'not-a-number', '']) {
      expect(normalizeFireInstant(bad as never)).toBeNull();
    }
  });
});

// ── notificationRouteParams (the DR-3 arrival marker — spec §4, a NAMED GATE) ──
//
// `source: 'notification'` must ride EVERY tap so the in-context offer never shows
// over a notification-tap arrival — including the branch where the fire instant did
// not normalize (firedAt absent). Pinning it here is what keeps a future edit to the
// tap params from silently reopening the offer on taps.
describe('notificationRouteParams', () => {
  it('carries source:notification AND firedAt when the fire instant is present', () => {
    expect(notificationRouteParams(1_700_000_000_000)).toEqual({
      source: 'notification',
      firedAt: '1700000000000',
    });
  });

  it('carries source:notification even when the fire instant is absent (the belt)', () => {
    // The load-bearing case: no firedAt to fall back on, yet the arrival is still a
    // tap — so `source` alone must mark it, or the offer would show over it.
    expect(notificationRouteParams(null)).toEqual({ source: 'notification' });
  });
});
