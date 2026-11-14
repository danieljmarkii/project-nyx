// CUL-2727: the vet visit reminder scheduler decides in the safe direction (G5, G6) and
// keeps to its own identifiers (§3.5).
jest.mock('expo-notifications', () => ({
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  setNotificationChannelAsync: jest.fn(async () => undefined),
  SchedulableTriggerInputTypes: { DATE: 'date' },
  AndroidImportance: { DEFAULT: 3 },
}));
jest.mock('./notifications', () => ({ ensurePermission: jest.fn(async () => 'granted') }));
// The READ is stubbed; the date helpers the planner uses stay real (C-34).
jest.mock('./vetVisits', () => ({
  ...jest.requireActual('./vetVisits'),
  readReminderInputs: jest.fn(async () => ({ appointments: [] })),
}));
jest.mock('./notificationSettings', () => ({
  CATEGORY_PREFERENCE_READ_SQL: 'SELECT …',
}));
jest.mock('./db', () => ({ getDb: jest.fn() }));

import * as Notifications from 'expo-notifications';
import {
  computeVetReminderActions,
  syncVetReminderNotifications,
  isVetReminderIdentifier,
  vetReminderIdentifier,
  vetReminderSignature,
  vetRemindersOn,
} from './vetReminderNotifications';
import type { PlannedVetReminder } from './vetReminders';
import { getDb } from './db';
import { readReminderInputs } from './vetVisits';

function planned(over: Partial<PlannedVetReminder> = {}): PlannedVetReminder {
  return {
    kind: 'day_of',
    dayKey: '2026-11-16',
    fireAt: new Date(2026, 10, 16, 8).toISOString(),
    appointmentId: 'a',
    petId: 'p',
    title: 'Nyx sees the vet today at 10:30 am',
    body: 'Make a report to take along.',
    ...over,
  };
}

const live = (p: PlannedVetReminder, sig: string | null = vetReminderSignature(p)) => ({
  identifier: vetReminderIdentifier(p.kind, p.dayKey),
  sig,
});

describe('computeVetReminderActions', () => {
  it('cancels every live reminder when the switch or the permission says no', () => {
    const p = planned();
    expect(computeVetReminderActions({ allowed: false, planned: [p], live: [live(p)] })).toEqual({
      schedule: [],
      cancel: ['nyx.vetreminder.day_of.2026-11-16'],
    });
  });

  it('leaves a matching reminder alone, schedules a missing one, cancels one no longer planned', () => {
    const keep = planned();
    const add = planned({ kind: 'ahead', dayKey: '2026-11-13', fireAt: new Date(2026, 10, 13, 18).toISOString() });
    const gone = planned({ dayKey: '2026-12-01' });
    expect(computeVetReminderActions({ allowed: true, planned: [keep, add], live: [live(keep), live(gone)] })).toEqual({
      schedule: [add],
      cancel: ['nyx.vetreminder.day_of.2026-12-01'],
    });
  });

  it('a moved time, a rename or a new window on the same day reschedules in place (no cancel)', () => {
    const before = planned();
    for (const after of [
      planned({ fireAt: new Date(2026, 10, 16, 7, 30).toISOString() }),
      planned({ title: 'Mo sees the vet today at 10:30 am' }),
      planned({ body: 'Tap to get ready for both.' }),
      planned({ appointmentId: null }),
      planned({ petId: 'q' }),
    ]) {
      expect(computeVetReminderActions({ allowed: true, planned: [after], live: [live(before)] })).toEqual({
        schedule: [after],
        cancel: [],
      });
    }
  });

  it('a live reminder with no readable signature is replaced, never trusted', () => {
    const p = planned();
    expect(computeVetReminderActions({ allowed: true, planned: [p], live: [live(p, null)] }).schedule).toEqual([p]);
  });
});

describe('identifiers', () => {
  it('live outside the daily registry and the follow-up prefixes', () => {
    const id = vetReminderIdentifier('ahead', '2026-11-13');
    expect(id).toBe('nyx.vetreminder.ahead.2026-11-13');
    expect(id.startsWith('nyx.notif.')).toBe(false);
    expect(id.startsWith('nyx.followup.')).toBe(false);
    expect(isVetReminderIdentifier(id)).toBe(true);
    expect(isVetReminderIdentifier('nyx.notif.daily_summary')).toBe(false);
    expect(isVetReminderIdentifier('nyx.followup.abc')).toBe(false);
  });
});

describe('the switch (G6)', () => {
  const mocked = getDb as jest.Mock;
  it('reads the vet_visit row and is on only when enabled', async () => {
    const getFirstAsync = jest.fn(async () => ({ id: 'p', enabled: 1 }));
    mocked.mockReturnValue({ getFirstAsync });
    await expect(vetRemindersOn()).resolves.toBe(true);
    expect(getFirstAsync).toHaveBeenCalledWith('SELECT …', ['vet_visit']);
  });
  it('a missing row, a disabled row or a failed read is off', async () => {
    mocked.mockReturnValue({ getFirstAsync: jest.fn(async () => null) });
    await expect(vetRemindersOn()).resolves.toBe(false);
    mocked.mockReturnValue({ getFirstAsync: jest.fn(async () => ({ id: 'p', enabled: 0 })) });
    await expect(vetRemindersOn()).resolves.toBe(false);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mocked.mockReturnValue({ getFirstAsync: jest.fn(async () => { throw new Error('locked'); }) });
    await expect(vetRemindersOn()).resolves.toBe(false);
    warn.mockRestore();
  });
});

describe('syncVetReminderNotifications (the run)', () => {
  const N = Notifications as unknown as Record<string, jest.Mock>;
  const read = readReminderInputs as jest.Mock;
  const NOW = new Date(2026, 10, 9, 12);
  const booking = { id: 'a', pet_id: 'p', scheduled_at: new Date(2026, 10, 16, 10, 30).toISOString() };
  const input = (over: Partial<{ petsLoaded: boolean; names: [string, string][] }> = {}) => () => ({
    petNames: new Map(over.names ?? [['p', 'Nyx']]),
    petsLoaded: over.petsLoaded ?? true,
    now: NOW,
  });

  beforeEach(() => {
    for (const fn of Object.values(N)) if (typeof fn === 'function' && 'mockClear' in fn) fn.mockClear();
    read.mockReset();
    (getDb as jest.Mock).mockReturnValue({ getFirstAsync: jest.fn(async () => ({ id: 'p', enabled: 1 })) });
    read.mockResolvedValue({ appointments: [booking] });
    N.getAllScheduledNotificationsAsync.mockResolvedValue([]);
  });

  it('schedules both reminders for a booking, under its own identifiers and channel', async () => {
    await syncVetReminderNotifications(input());
    expect(N.scheduleNotificationAsync.mock.calls.map((c) => c[0].identifier)).toEqual([
      'nyx.vetreminder.ahead.2026-11-13',
      'nyx.vetreminder.day_of.2026-11-16',
    ]);
    expect(N.scheduleNotificationAsync.mock.calls[1][0].content.data).toMatchObject({
      kind: 'vet_visit',
      appointmentId: 'a',
      petId: 'p',
    });
    expect(N.scheduleNotificationAsync.mock.calls[0][0].trigger.channelId).toBe('vet_visit');
  });

  it('touches nothing while the pet list has not answered', async () => {
    N.getAllScheduledNotificationsAsync.mockResolvedValue([
      { identifier: 'nyx.vetreminder.ahead.2026-11-13', content: { data: { sig: 'x' } } },
    ]);
    await syncVetReminderNotifications(input({ petsLoaded: false, names: [] }));
    expect(read).not.toHaveBeenCalled();
    expect(N.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
    expect(N.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('an answered empty list (every pet archived) cancels what is live, and never touches other modules', async () => {
    N.getAllScheduledNotificationsAsync.mockResolvedValue([
      { identifier: 'nyx.vetreminder.ahead.2026-11-13', content: { data: { sig: 'x' } } },
      { identifier: 'nyx.notif.daily_summary', content: { data: {} } },
      { identifier: 'nyx.followup.c-1', content: { data: {} } },
    ]);
    await syncVetReminderNotifications(input({ names: [] }));
    expect(N.cancelScheduledNotificationAsync.mock.calls).toEqual([['nyx.vetreminder.ahead.2026-11-13']]);
    expect(N.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('overlapping calls run one at a time, and the calls arriving mid-run share ONE fresh run', async () => {
    let active = 0;
    let maxActive = 0;
    read.mockImplementation(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      return { appointments: [booking] };
    });
    await Promise.all([1, 2, 3, 4].map(() => syncVetReminderNotifications(input())));
    expect(maxActive).toBe(1);
    // The first run, then one trailing run for the three that arrived during it.
    expect(read).toHaveBeenCalledTimes(2);
  });
});
