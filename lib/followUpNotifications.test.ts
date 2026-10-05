// Engines v3 PR-36 (CUL-1419): the follow-up's notification decides in the safe direction
// (G5, G6) and its body names no record fact (G1/D3, AC 11).
jest.mock('expo-notifications', () => ({}));
jest.mock('./notifications', () => ({ ensurePermission: jest.fn() }));
jest.mock('./vetCallReads', () => ({ readWaitingFollowUps: jest.fn(async () => []) }));

import {
  callIdFromFollowUpIdentifier,
  computeFollowUpActions,
  followUpIdentifier,
} from './followUpNotifications';
import { callConfirmation, followUpNotificationBody } from './vetCallState';

const NOW = Date.parse('2026-10-05T12:00:00.000Z');
const later = new Date(NOW + 3600_000).toISOString();
const earlier = new Date(NOW - 3600_000).toISOString();

describe('computeFollowUpActions', () => {
  it('cancels everything it scheduled when the switch, the permission or the flag says no', () => {
    expect(
      computeFollowUpActions({ allowed: false, wanted: [{ callId: 'a', dueAt: later, petName: null }], scheduledCallIds: ['a', 'b'], now: NOW }),
    ).toEqual({ schedule: [], cancel: ['a', 'b'] });
  });

  it('schedules a waiting question once, and cancels one no longer wanted (answered, undone)', () => {
    expect(
      computeFollowUpActions({
        allowed: true,
        wanted: [{ callId: 'a', dueAt: later, petName: null }, { callId: 'b', dueAt: later, petName: null }],
        scheduledCallIds: ['b', 'gone'],
        now: NOW,
      }),
    ).toEqual({ schedule: [{ callId: 'a', dueAt: later, petName: null }], cancel: ['gone'] });
  });

  it('never schedules a due time already past: the question is on screen by then', () => {
    expect(
      computeFollowUpActions({ allowed: true, wanted: [{ callId: 'a', dueAt: earlier, petName: null }], scheduledCallIds: [], now: NOW }),
    ).toEqual({ schedule: [], cancel: [] });
  });
});

describe('identifiers', () => {
  it('round-trip, and live outside the category registry\'s prefix', () => {
    const id = followUpIdentifier('c-1');
    expect(id.startsWith('nyx.notif.')).toBe(false);
    expect(callIdFromFollowUpIdentifier(id)).toBe('c-1');
    expect(callIdFromFollowUpIdentifier('nyx.notif.daily_summary')).toBeNull();
  });
});

describe('the words (G1, AC 11)', () => {
  const RECORD_WORDS = /vomit|stool|blood|call|vet|sick|fine|well/i;
  it('the body names no record fact, with or without the pet\'s name', () => {
    expect(followUpNotificationBody(null)).not.toMatch(RECORD_WORDS);
    expect(followUpNotificationBody('Mo')).toBe('A question about Mo');
    expect(followUpNotificationBody('Mo')).not.toMatch(RECORD_WORDS);
  });
  it('the confirmation never names a day', () => {
    const DAYS = /monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow/i;
    expect(callConfirmation({ notificationsOn: true })).not.toMatch(DAYS);
    expect(callConfirmation({ notificationsOn: false })).not.toMatch(DAYS);
  });
});
