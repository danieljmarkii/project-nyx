// Day-summary schedule-wiring tests (B-661 PR 4). The load-bearing pieces are the
// synced-preferred resolver (the cross-device split-brain rule the PR 2 mirror
// header pinned), the account-wide read (run against a real node:sqlite so the
// production SQL is exercised), and the tap-routing auth gate.

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn().mockResolvedValue('id'),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
  getAllScheduledNotificationsAsync: jest.fn().mockResolvedValue([]),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
  SchedulableTriggerInputTypes: { DAILY: 'daily' },
  AndroidImportance: { DEFAULT: 3 },
}));

// Isolate from db.ts's native expo-sqlite import; per-test control of the read.
const mockGetAllAsync = jest.fn();
jest.mock('./db', () => ({ getDb: () => ({ getAllAsync: mockGetAllAsync }) }));

const { DatabaseSync } = require('node:sqlite');
import * as Notifications from 'expo-notifications';
import { NOTIFICATION_SCHEMA_SQL } from './notificationPreferences';
import { scheduleIdentifier } from './notifications';
import {
  ACCOUNT_WIDE_PREFS_QUERY,
  resolveEnabledCategories,
  loadEnabledCategories,
  reconcileDailySummary,
  notificationRouteDecision,
  type AccountPreferenceRow,
} from './notificationSchedule';

const getPermissionsAsync = Notifications.getPermissionsAsync as jest.Mock;
const scheduleNotificationAsync = Notifications.scheduleNotificationAsync as jest.Mock;
const cancelScheduledNotificationAsync = Notifications.cancelScheduledNotificationAsync as jest.Mock;
const getAllScheduledNotificationsAsync = Notifications.getAllScheduledNotificationsAsync as jest.Mock;

const row = (over: Partial<AccountPreferenceRow>): AccountPreferenceRow => ({
  category: 'daily_summary',
  enabled: 1,
  synced: 1,
  updated_at: '2026-08-02T00:00:00.000Z',
  id: 'a',
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  getAllScheduledNotificationsAsync.mockResolvedValue([]);
  scheduleNotificationAsync.mockResolvedValue('id');
  cancelScheduledNotificationAsync.mockResolvedValue(undefined);
});

// ── resolveEnabledCategories (the synced-preferred split-brain rule) ──────────
describe('resolveEnabledCategories', () => {
  it('returns an enabled, synced, known category', () => {
    expect(resolveEnabledCategories([row({ enabled: 1 })])).toEqual(['daily_summary']);
  });

  it('omits a disabled category (G6 — off is the absence of a schedule)', () => {
    expect(resolveEnabledCategories([row({ enabled: 0 })])).toEqual([]);
  });

  it('prefers the SYNCED row over a stale quarantined loser for the same key', () => {
    // The cross-device 23505: two rows for (daily_summary, pet_id IS NULL). The
    // unsynced loser says OFF with a newer updated_at; the synced winner says ON.
    // Preferring synced first (not just freshest) is the rule — the freshest is the
    // one that lost the server's race.
    const rows = [
      row({ id: 'loser', enabled: 0, synced: 0, updated_at: '2026-08-02T10:00:00.000Z' }),
      row({ id: 'winner', enabled: 1, synced: 1, updated_at: '2026-08-02T09:00:00.000Z' }),
    ];
    expect(resolveEnabledCategories(rows)).toEqual(['daily_summary']);
  });

  it('breaks a same-synced tie by freshest updated_at, then id', () => {
    const rows = [
      row({ id: 'old', enabled: 1, synced: 0, updated_at: '2026-08-01T00:00:00.000Z' }),
      row({ id: 'new', enabled: 0, synced: 0, updated_at: '2026-08-02T00:00:00.000Z' }),
    ];
    // Both unsynced → freshest wins → disabled.
    expect(resolveEnabledCategories(rows)).toEqual([]);
  });

  it('skips a category the registry does not know (a foreign/newer-client row)', () => {
    expect(resolveEnabledCategories([row({ category: 'med_reminder', enabled: 1 })])).toEqual([]);
  });

  it('returns [] for no rows', () => {
    expect(resolveEnabledCategories([])).toEqual([]);
  });
});

// ── ACCOUNT_WIDE_PREFS_QUERY against a real node:sqlite ──────────────────────
describe('ACCOUNT_WIDE_PREFS_QUERY (production SQL over node:sqlite)', () => {
  function freshDb() {
    const db = new DatabaseSync(':memory:');
    db.exec(NOTIFICATION_SCHEMA_SQL);
    return db;
  }
  const insert = (db: any, r: Partial<AccountPreferenceRow> & { pet_id?: string | null }) => {
    db.prepare(
      `INSERT INTO notification_preferences (id, pet_id, category, enabled, fire_local_time, created_at, updated_at, synced)
       VALUES (?, ?, ?, ?, '21:00', ?, ?, ?)`,
    ).run(
      r.id ?? 'a',
      r.pet_id ?? null,
      r.category ?? 'daily_summary',
      r.enabled ?? 1,
      r.updated_at ?? '2026-08-02T00:00:00.000Z',
      r.updated_at ?? '2026-08-02T00:00:00.000Z',
      r.synced ?? 1,
    );
  };

  it('selects account-wide (pet_id IS NULL) rows and resolves them enabled', () => {
    const db = freshDb();
    insert(db, { id: 'x', enabled: 1 });
    const rows = db.prepare(ACCOUNT_WIDE_PREFS_QUERY).all() as AccountPreferenceRow[];
    expect(resolveEnabledCategories(rows)).toEqual(['daily_summary']);
  });

  it('excludes a pet-scoped row (a future shape) from the account-wide read', () => {
    const db = freshDb();
    insert(db, { id: 'scoped', pet_id: 'pet-1', enabled: 1 });
    const rows = db.prepare(ACCOUNT_WIDE_PREFS_QUERY).all() as AccountPreferenceRow[];
    expect(rows).toHaveLength(0);
  });
});

// ── loadEnabledCategories (fail-safe read) ───────────────────────────────────
describe('loadEnabledCategories', () => {
  it('reads and resolves the enabled categories from the mirror', async () => {
    mockGetAllAsync.mockResolvedValue([row({ enabled: 1 })]);
    expect(await loadEnabledCategories()).toEqual(['daily_summary']);
  });

  it('fails safe to [] on a read error (never a guessed on)', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockGetAllAsync.mockRejectedValue(new Error('db gone'));
    expect(await loadEnabledCategories()).toEqual([]);
  });
});

// ── reconcileDailySummary (the end-to-end wiring) ────────────────────────────
describe('reconcileDailySummary', () => {
  it('cancels a stray schedule when no preference is enabled (the pre-PR-3 default)', async () => {
    mockGetAllAsync.mockResolvedValue([]); // nothing enabled (no toggle yet)
    getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: false });
    getAllScheduledNotificationsAsync.mockResolvedValue([
      { identifier: scheduleIdentifier('daily_summary') },
    ]);
    const actions = await reconcileDailySummary();
    expect(actions).toEqual({ toSchedule: [], toCancel: ['daily_summary'] });
    expect(cancelScheduledNotificationAsync).toHaveBeenCalledWith(scheduleIdentifier('daily_summary'));
    expect(scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('schedules the summary once a preference is enabled and permission is granted', async () => {
    // Proves PR 3's toggle-on results in a schedule with no further wiring.
    mockGetAllAsync.mockResolvedValue([row({ enabled: 1, synced: 1 })]);
    getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: false });
    getAllScheduledNotificationsAsync.mockResolvedValue([]);
    const actions = await reconcileDailySummary();
    expect(actions).toEqual({ toSchedule: ['daily_summary'], toCancel: [] });
    expect(scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });

  it('schedules nothing when an enabled preference lacks OS permission (safe direction)', async () => {
    mockGetAllAsync.mockResolvedValue([row({ enabled: 1 })]);
    getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true });
    getAllScheduledNotificationsAsync.mockResolvedValue([]);
    const actions = await reconcileDailySummary();
    expect(actions).toEqual({ toSchedule: [], toCancel: [] });
    expect(scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});

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
