// CUL-2727: the vet visit reminder scheduler decides in the safe direction (G5, G6) and
// keeps to its own identifiers (§3.5).
jest.mock('expo-notifications', () => ({}));
jest.mock('./notifications', () => ({ ensurePermission: jest.fn() }));
jest.mock('./notificationSettings', () => ({
  CATEGORY_PREFERENCE_READ_SQL: 'SELECT …',
}));
jest.mock('./db', () => ({ getDb: jest.fn() }));

import {
  computeVetReminderActions,
  isVetReminderIdentifier,
  vetReminderIdentifier,
  vetReminderSignature,
  vetRemindersOn,
} from './vetReminderNotifications';
import type { PlannedVetReminder } from './vetReminders';
import { getDb } from './db';

function planned(over: Partial<PlannedVetReminder> = {}): PlannedVetReminder {
  return {
    kind: 'day_of',
    dayKey: '2026-11-16',
    fireAt: new Date(2026, 10, 16, 8).toISOString(),
    appointmentId: 'a',
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

  it('a moved time, a rename or a new window on the same day reschedules (cancel + schedule)', () => {
    const before = planned();
    for (const after of [
      planned({ fireAt: new Date(2026, 10, 16, 7, 30).toISOString() }),
      planned({ title: 'Mo sees the vet today at 10:30 am' }),
      planned({ body: 'Make a report of Sep 16 to today to take along.' }),
      planned({ appointmentId: null }),
    ]) {
      expect(computeVetReminderActions({ allowed: true, planned: [after], live: [live(before)] })).toEqual({
        schedule: [after],
        cancel: [vetReminderIdentifier('day_of', '2026-11-16')],
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
