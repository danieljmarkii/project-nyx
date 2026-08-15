// The notification primitive (B-661 PR 1). The load-bearing logic is the pure
// core — the registry, the budget, and above all computeReconcileActions, which
// decides what gets scheduled vs cancelled — so it is tested exhaustively with no
// native module in sight. The thin I/O shell is tested with expo-notifications
// mocked: the assertions that matter there are "never fires the prompt on a read"
// and "cancel-all is actually called" (the Trust & Safety piece).

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

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import {
  NOTIFICATION_CATEGORIES,
  ALL_NOTIFICATION_CATEGORIES,
  PER_ACCOUNT_NOTIFICATION_BUDGET,
  scheduleIdentifier,
  categoryFromIdentifier,
  totalBudgetWeight,
  wouldExceedBudget,
  computeReconcileActions,
  ensurePermission,
  getScheduledCategories,
  getScheduledCategoryState,
  scheduleCategory,
  cancelCategory,
  reconcileSchedules,
  cancelAllScheduledNotifications,
  readCategoryInteractions,
  recordCategoryInteraction,
  clearNotificationInteractions,
  resolveDailySummaryContent,
  contentSignature,
  type NotificationCategory,
} from './notifications';

const getPermissionsAsync = Notifications.getPermissionsAsync as jest.Mock;
const requestPermissionsAsync = Notifications.requestPermissionsAsync as jest.Mock;
const scheduleNotificationAsync = Notifications.scheduleNotificationAsync as jest.Mock;
const cancelScheduledNotificationAsync =
  Notifications.cancelScheduledNotificationAsync as jest.Mock;
const cancelAllScheduledNotificationsAsync =
  Notifications.cancelAllScheduledNotificationsAsync as jest.Mock;
const getAllScheduledNotificationsAsync =
  Notifications.getAllScheduledNotificationsAsync as jest.Mock;
const setNotificationChannelAsync =
  Notifications.setNotificationChannelAsync as jest.Mock;

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  getAllScheduledNotificationsAsync.mockResolvedValue([]);
  scheduleNotificationAsync.mockResolvedValue('id');
  cancelScheduledNotificationAsync.mockResolvedValue(undefined);
  cancelAllScheduledNotificationsAsync.mockResolvedValue(undefined);
  setNotificationChannelAsync.mockResolvedValue(undefined);
});

// ── The registry ─────────────────────────────────────────────────────────────
describe('NOTIFICATION_CATEGORIES (v1 registers exactly daily_summary)', () => {
  it('registers exactly one category', () => {
    expect(ALL_NOTIFICATION_CATEGORIES).toEqual(['daily_summary']);
  });

  it('fires the daily summary at 21:00 device-local and opens /day-summary', () => {
    const c = NOTIFICATION_CATEGORIES.daily_summary;
    expect(c).toMatchObject({ hour: 21, minute: 0, route: '/day-summary', budgetWeight: 1 });
  });

  it('uses channel = category (the Android channel id is the category id)', () => {
    expect(NOTIFICATION_CATEGORIES.daily_summary.channelId).toBe('daily_summary');
  });

  it('carries a G1-safe body — the ritual, never the record contents (PR 4)', () => {
    const c = NOTIFICATION_CATEGORIES.daily_summary;
    // Neutral, multi-pet-safe: no pet name, no counts, no "incident"/"symptom" — a
    // lock-screen body computed at schedule time must never assert what the record
    // holds (D3 / clinical-guardrails). And nyx-voice: no exclamation.
    const text = `${c.title} ${c.body}`.toLowerCase();
    for (const banned of ['incident', 'symptom', 'vomit', 'no ', 'nothing', 'all clear', 'medication']) {
      expect(text).not.toContain(banned);
    }
    expect(`${c.title}${c.body}`).not.toContain('!');
    expect(c.body.trim().length).toBeGreaterThan(0);
  });
});

// ── The pet-name opt-in content resolver (DR-6) ──────────────────────────────
describe('resolveDailySummaryContent', () => {
  const neutral = {
    title: NOTIFICATION_CATEGORIES.daily_summary.title,
    body: NOTIFICATION_CATEGORIES.daily_summary.body,
  };

  it('returns the NAMED body when opted in with a single pet name', () => {
    const c = resolveDailySummaryContent({ usePetName: true, petName: 'Biscuit' });
    expect(c.title).toBe('Biscuit’s day');
    expect(c.body).toBe('Biscuit’s day is ready to read.');
  });

  it('stays neutral when the opt-in is off, even with a name (default = neutral)', () => {
    expect(resolveDailySummaryContent({ usePetName: false, petName: 'Biscuit' })).toEqual(neutral);
  });

  it('stays neutral when there is no single pet to name (multi-pet by construction)', () => {
    // The caller passes petName = null for a multi-pet or nameless account.
    expect(resolveDailySummaryContent({ usePetName: true, petName: null })).toEqual(neutral);
    expect(resolveDailySummaryContent({ usePetName: true, petName: undefined })).toEqual(neutral);
  });

  it('treats a blank / whitespace name as no name (neutral, never a stray possessive)', () => {
    expect(resolveDailySummaryContent({ usePetName: true, petName: '   ' })).toEqual(neutral);
  });

  it('trims surrounding whitespace from the name', () => {
    expect(resolveDailySummaryContent({ usePetName: true, petName: '  Gus  ' }).title).toBe('Gus’s day');
  });

  it('the named body is G1-safe and nyx-voice-clean (no record assertion, no "!")', () => {
    const c = resolveDailySummaryContent({ usePetName: true, petName: 'Biscuit' });
    const text = `${c.title} ${c.body}`.toLowerCase();
    for (const banned of ['incident', 'symptom', 'vomit', 'nothing', 'all clear', 'medication']) {
      expect(text).not.toContain(banned);
    }
    expect(`${c.title}${c.body}`).not.toContain('!');
  });
});

describe('contentSignature', () => {
  it('distinguishes distinct copy and cannot collide across the title/body seam', () => {
    const a = contentSignature({ title: 'A', body: 'B C' });
    const b = contentSignature({ title: 'A B', body: 'C' });
    expect(a).not.toBe(b); // the JSON encoding prevents the "A B C" seam collision
    // Parses back to the exact copy — a printable JSON string that round-trips
    // safely through the OS notification payload (no raw control-char separator).
    expect(JSON.parse(a)).toEqual({ t: 'A', b: 'B C' });
    expect(contentSignature({ title: 'A', body: 'B' })).toBe(contentSignature({ title: 'A', body: 'B' }));
  });
});

// ── Identifiers ──────────────────────────────────────────────────────────────
describe('scheduleIdentifier / categoryFromIdentifier', () => {
  it('round-trips a category through its deterministic identifier', () => {
    for (const c of ALL_NOTIFICATION_CATEGORIES) {
      expect(categoryFromIdentifier(scheduleIdentifier(c))).toBe(c);
    }
  });

  it('rejects a foreign identifier (a schedule from another source)', () => {
    expect(categoryFromIdentifier('some-other-app-notification')).toBeNull();
    expect(categoryFromIdentifier('nyx.notif.not_a_category')).toBeNull();
    expect(categoryFromIdentifier(null)).toBeNull();
    expect(categoryFromIdentifier(undefined)).toBeNull();
  });
});

// ── Budget (D1's guardrail — the enforcement point exists) ───────────────────
describe('budget', () => {
  it('sums weights, deduped', () => {
    expect(totalBudgetWeight([])).toBe(0);
    expect(totalBudgetWeight(['daily_summary'])).toBe(1);
    expect(totalBudgetWeight(['daily_summary', 'daily_summary'])).toBe(1);
  });

  it("v1's single category is trivially within budget", () => {
    expect(wouldExceedBudget('daily_summary', [])).toBe(false);
    expect(totalBudgetWeight(ALL_NOTIFICATION_CATEGORIES)).toBeLessThanOrEqual(
      PER_ACCOUNT_NOTIFICATION_BUDGET,
    );
  });

  it('refuses once the summed weight would exceed the ceiling (enforcement point)', () => {
    // The mechanism, exercised against a small budget arg (the number B-288 owns).
    // Re-adding an already-enabled category is the union, so it never double-counts.
    expect(wouldExceedBudget('daily_summary', [], 1)).toBe(false);
    expect(wouldExceedBudget('daily_summary', ['daily_summary'], 1)).toBe(false);
    expect(wouldExceedBudget('daily_summary', [], 0)).toBe(true);
  });
});

// ── computeReconcileActions — the load-bearing pure decision ──────────────────
describe('computeReconcileActions (drift repair, safe direction only)', () => {
  it('schedules a desired, permitted category that is not yet live', () => {
    const a = computeReconcileActions({
      desired: ['daily_summary'],
      permissionGranted: true,
      scheduled: [],
    });
    expect(a).toEqual({ toSchedule: ['daily_summary'], toCancel: [] });
  });

  it('leaves an already-scheduled desired category alone (no churn)', () => {
    const a = computeReconcileActions({
      desired: ['daily_summary'],
      permissionGranted: true,
      scheduled: ['daily_summary'],
    });
    expect(a).toEqual({ toSchedule: [], toCancel: [] });
  });

  it('cancels a scheduled category the owner has turned off', () => {
    const a = computeReconcileActions({
      desired: [],
      permissionGranted: true,
      scheduled: ['daily_summary'],
    });
    expect(a).toEqual({ toSchedule: [], toCancel: ['daily_summary'] });
  });

  it('cancels EVERY live schedule when OS permission is gone, and schedules nothing', () => {
    // The orphan case: a desired-on category must not be (re)scheduled without
    // permission, and anything already scheduled is now an orphan to cancel.
    const a = computeReconcileActions({
      desired: ['daily_summary'],
      permissionGranted: false,
      scheduled: ['daily_summary'],
    });
    expect(a).toEqual({ toSchedule: [], toCancel: ['daily_summary'] });
  });

  it('schedules nothing when nothing is desired and nothing is scheduled', () => {
    const a = computeReconcileActions({ desired: [], permissionGranted: true, scheduled: [] });
    expect(a).toEqual({ toSchedule: [], toCancel: [] });
  });

  it('the budget backstop can only ever schedule fewer, never more', () => {
    // A pathological desired set at budget 0 schedules nothing (belt-and-braces —
    // reconcile applies the same ceiling scheduleCategory does).
    const many = ['daily_summary'] as NotificationCategory[];
    const a = computeReconcileActions({ desired: many, permissionGranted: true, scheduled: [] });
    // At the real budget it schedules; the point is it never EXCEEDS what is desired.
    expect(a.toSchedule.length).toBeLessThanOrEqual(many.length);
    expect(new Set(a.toSchedule).size).toBe(a.toSchedule.length); // no duplicates
  });
});

// ── ensurePermission (I/O) ───────────────────────────────────────────────────
describe('ensurePermission', () => {
  it('NEVER fires the system prompt on a status read (the one-prompt-per-install rule)', async () => {
    getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true });
    const status = await ensurePermission(); // default: read only
    expect(status).toBe('undetermined');
    expect(requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('returns granted without asking again when already granted', async () => {
    getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: false });
    expect(await ensurePermission(true)).toBe('granted');
    expect(requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('maps a permanent denial to "denied" (drives the iOS-Settings inert state, PR 3)', async () => {
    getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false });
    expect(await ensurePermission()).toBe('denied');
  });

  it('fires the prompt only when explicitly asked, on an undetermined status', async () => {
    getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true });
    requestPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: false });
    expect(await ensurePermission(true)).toBe('granted');
    expect(requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('degrades to undetermined on a native failure (never a false granted)', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    getPermissionsAsync.mockRejectedValue(new Error('native gone'));
    expect(await ensurePermission()).toBe('undetermined');
  });
});

// ── getScheduledCategories (I/O) ─────────────────────────────────────────────
describe('getScheduledCategories', () => {
  it('maps our identifiers back to categories and ignores foreign schedules', async () => {
    getAllScheduledNotificationsAsync.mockResolvedValue([
      { identifier: scheduleIdentifier('daily_summary') },
      { identifier: 'some-other-schedule' },
      { identifier: null },
    ]);
    expect(await getScheduledCategories()).toEqual(['daily_summary']);
  });

  it('returns [] and does not throw when the native read fails', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    getAllScheduledNotificationsAsync.mockRejectedValue(new Error('native gone'));
    expect(await getScheduledCategories()).toEqual([]);
  });
});

// ── getScheduledCategoryState (the content-drift read, DR-6) ──────────────────
describe('getScheduledCategoryState', () => {
  it('surfaces each category with its stamped contentSig', async () => {
    getAllScheduledNotificationsAsync.mockResolvedValue([
      { identifier: scheduleIdentifier('daily_summary'), content: { data: { contentSig: 'sig-x' } } },
    ]);
    expect(await getScheduledCategoryState()).toEqual([
      { category: 'daily_summary', contentSig: 'sig-x' },
    ]);
  });

  it('reports contentSig = null for a schedule stamped before DR-6 (no sig in data)', async () => {
    getAllScheduledNotificationsAsync.mockResolvedValue([
      { identifier: scheduleIdentifier('daily_summary'), content: { data: {} } },
    ]);
    expect(await getScheduledCategoryState()).toEqual([
      { category: 'daily_summary', contentSig: null },
    ]);
  });

  it('ignores foreign schedules and degrades to [] on a native read failure', async () => {
    getAllScheduledNotificationsAsync.mockResolvedValue([{ identifier: 'someone.elses.notif' }]);
    expect(await getScheduledCategoryState()).toEqual([]);
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    getAllScheduledNotificationsAsync.mockRejectedValue(new Error('native gone'));
    expect(await getScheduledCategoryState()).toEqual([]);
  });
});

// ── scheduleCategory / cancelCategory (I/O) ──────────────────────────────────
describe('scheduleCategory', () => {
  it('schedules a daily 21:00 trigger under the category identifier', async () => {
    expect(await scheduleCategory('daily_summary')).toBe(true);
    expect(scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const req = scheduleNotificationAsync.mock.calls[0][0];
    expect(req.identifier).toBe(scheduleIdentifier('daily_summary'));
    expect(req.trigger).toMatchObject({ type: 'daily', hour: 21, minute: 0 });
    expect(req.content.data).toMatchObject({ category: 'daily_summary', route: '/day-summary' });
    // The scheduled body is the registry's G1-safe copy, not the retired placeholder.
    expect(req.content.title).toBe(NOTIFICATION_CATEGORIES.daily_summary.title);
    expect(req.content.body).toBe(NOTIFICATION_CATEGORIES.daily_summary.body);
  });

  it('stamps a contentSig for the default copy (so reconcile can detect drift)', async () => {
    await scheduleCategory('daily_summary');
    const req = scheduleNotificationAsync.mock.calls[0][0];
    expect(req.content.data.contentSig).toBe(
      contentSignature({
        title: NOTIFICATION_CATEGORIES.daily_summary.title,
        body: NOTIFICATION_CATEGORIES.daily_summary.body,
      }),
    );
  });

  it('schedules an explicit content override (DR-6 named body) and stamps its sig', async () => {
    const content = { title: 'Biscuit’s day', body: 'Biscuit’s day is ready to read.' };
    await scheduleCategory('daily_summary', content);
    const req = scheduleNotificationAsync.mock.calls[0][0];
    expect(req.content.title).toBe(content.title);
    expect(req.content.body).toBe(content.body);
    expect(req.content.data.contentSig).toBe(contentSignature(content));
  });

  it('is idempotent — cancels any existing schedule before re-adding (no duplicate)', async () => {
    await scheduleCategory('daily_summary');
    expect(cancelScheduledNotificationAsync).toHaveBeenCalledWith(
      scheduleIdentifier('daily_summary'),
    );
  });

  it('does not create an Android channel on iOS (the QA target)', async () => {
    // Platform.OS defaults to ios under jest-expo; the channel is Android-only.
    await scheduleCategory('daily_summary');
    expect(setNotificationChannelAsync).not.toHaveBeenCalled();
  });

  it('returns false and schedules nothing when the native call throws', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    scheduleNotificationAsync.mockRejectedValue(new Error('native gone'));
    expect(await scheduleCategory('daily_summary')).toBe(false);
  });
});

describe('cancelCategory', () => {
  it('cancels by the category identifier', async () => {
    await cancelCategory('daily_summary');
    expect(cancelScheduledNotificationAsync).toHaveBeenCalledWith(
      scheduleIdentifier('daily_summary'),
    );
  });
});

// ── reconcileSchedules (I/O — pure decision + execution) ─────────────────────
describe('reconcileSchedules', () => {
  it('schedules a desired category when permission is granted and nothing is live', async () => {
    getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: false });
    getAllScheduledNotificationsAsync.mockResolvedValue([]);
    const actions = await reconcileSchedules(['daily_summary']);
    expect(actions).toEqual({ toSchedule: ['daily_summary'], toCancel: [] });
    expect(scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });

  it('cancels an orphaned schedule when permission has been revoked', async () => {
    getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false });
    getAllScheduledNotificationsAsync.mockResolvedValue([
      { identifier: scheduleIdentifier('daily_summary') },
    ]);
    const actions = await reconcileSchedules(['daily_summary']);
    expect(actions).toEqual({ toSchedule: [], toCancel: ['daily_summary'] });
    expect(cancelScheduledNotificationAsync).toHaveBeenCalledWith(
      scheduleIdentifier('daily_summary'),
    );
    expect(scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('schedules a brand-new category with the supplied content override (DR-6)', async () => {
    getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: false });
    getAllScheduledNotificationsAsync.mockResolvedValue([]);
    const named = { title: 'Biscuit’s day', body: 'Biscuit’s day is ready to read.' };
    await reconcileSchedules(['daily_summary'], { daily_summary: named });
    expect(scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(scheduleNotificationAsync.mock.calls[0][0].content.body).toBe(named.body);
  });

  // ── Content-drift refresh: the crux of DR-6's "reconcile carries it" ──
  describe('content-drift refresh on a KEPT schedule', () => {
    const named = { title: 'Biscuit’s day', body: 'Biscuit’s day is ready to read.' };
    const neutral = {
      title: NOTIFICATION_CATEGORIES.daily_summary.title,
      body: NOTIFICATION_CATEGORIES.daily_summary.body,
    };

    beforeEach(() => getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: false }));

    it('reschedules when the live copy no longer matches the desired copy', async () => {
      // Live schedule carries the NEUTRAL sig; the owner just opted into the name.
      getAllScheduledNotificationsAsync.mockResolvedValue([
        {
          identifier: scheduleIdentifier('daily_summary'),
          content: { data: { contentSig: contentSignature(neutral) } },
        },
      ]);
      const actions = await reconcileSchedules(['daily_summary'], { daily_summary: named });
      // computeReconcileActions keeps it (present + desired), so the refresh is what
      // reschedules — with the named body.
      expect(actions).toEqual({ toSchedule: [], toCancel: [] });
      expect(scheduleNotificationAsync).toHaveBeenCalledTimes(1);
      expect(scheduleNotificationAsync.mock.calls[0][0].content.body).toBe(named.body);
    });

    it('does NOT reschedule when the live copy already matches (no needless churn)', async () => {
      getAllScheduledNotificationsAsync.mockResolvedValue([
        {
          identifier: scheduleIdentifier('daily_summary'),
          content: { data: { contentSig: contentSignature(named) } },
        },
      ]);
      await reconcileSchedules(['daily_summary'], { daily_summary: named });
      expect(scheduleNotificationAsync).not.toHaveBeenCalled();
    });

    it('refreshes a pre-DR-6 schedule (null sig) once to stamp the current copy', async () => {
      getAllScheduledNotificationsAsync.mockResolvedValue([
        { identifier: scheduleIdentifier('daily_summary'), content: { data: {} } },
      ]);
      await reconcileSchedules(['daily_summary'], { daily_summary: neutral });
      expect(scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    });

    it('does not refresh copy while permission is denied (nothing may be scheduled)', async () => {
      getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false });
      getAllScheduledNotificationsAsync.mockResolvedValue([
        {
          identifier: scheduleIdentifier('daily_summary'),
          content: { data: { contentSig: contentSignature(neutral) } },
        },
      ]);
      await reconcileSchedules(['daily_summary'], { daily_summary: named });
      // Permission gone → the orphan is cancelled, never rescheduled with new copy.
      expect(scheduleNotificationAsync).not.toHaveBeenCalled();
      expect(cancelScheduledNotificationAsync).toHaveBeenCalledWith(
        scheduleIdentifier('daily_summary'),
      );
    });
  });
});

// ── cancelAllScheduledNotifications (the Trust & Safety piece) ────────────────
describe('cancelAllScheduledNotifications', () => {
  it('cancels every scheduled OS notification', async () => {
    await cancelAllScheduledNotifications();
    expect(cancelAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1);
  });

  it('never throws when the native call fails (teardown must always complete)', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    cancelAllScheduledNotificationsAsync.mockRejectedValue(new Error('native gone'));
    await expect(cancelAllScheduledNotifications()).resolves.toBeUndefined();
  });
});

// ── Interaction accounting (the data B-288's self-pruning will read) ─────────
describe('interaction accounting', () => {
  it('records and reads back a per-category last-interaction timestamp', async () => {
    expect(await readCategoryInteractions()).toEqual({});
    await recordCategoryInteraction('daily_summary', '2026-08-02T21:05:00.000Z');
    expect(await readCategoryInteractions()).toEqual({
      daily_summary: '2026-08-02T21:05:00.000Z',
    });
  });

  it('overwrites the prior timestamp for the same category', async () => {
    await recordCategoryInteraction('daily_summary', '2026-08-01T21:00:00.000Z');
    await recordCategoryInteraction('daily_summary', '2026-08-02T21:00:00.000Z');
    expect((await readCategoryInteractions()).daily_summary).toBe('2026-08-02T21:00:00.000Z');
  });

  it('clears the ledger — account state outside SQLite, wiped on sign-out', async () => {
    await recordCategoryInteraction('daily_summary', '2026-08-02T21:00:00.000Z');
    await clearNotificationInteractions();
    expect(await readCategoryInteractions()).toEqual({});
  });

  it('ignores corrupt stored JSON rather than throwing', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await AsyncStorage.setItem('nyx.notificationInteractions', '{not json');
    expect(await readCategoryInteractions()).toEqual({});
  });

  it('drops foreign keys / non-string values from a tampered blob', async () => {
    await AsyncStorage.setItem(
      'nyx.notificationInteractions',
      JSON.stringify({ daily_summary: '2026-08-02T21:00:00.000Z', bogus: 1, other: 'x' }),
    );
    expect(await readCategoryInteractions()).toEqual({
      daily_summary: '2026-08-02T21:00:00.000Z',
    });
  });
});
