// Vet contacts PR-07 (CUL-2769): the awareness line's rule. Fixtures are LOCAL day keys and
// instants built from local components (C-29), so every zone the CI runs in reads the same day.

jest.mock('./db', () => ({ getDb: jest.fn() }));

import { getDb } from './db';
import type { SignalFinding } from './signal';
import { cardFirstDay, cardStart, contactLineFor, contactSentence, contactsFromRows, readRemoteContacts, type RemoteContact } from './vetContactLine';

const TODAY = '2026-11-14';
const at = (y: number, mo: number, d: number, h: number, mi: number) => new Date(y, mo - 1, d, h, mi).toISOString();

const intake: SignalFinding = {
  type: 'intake_decline',
  priorityClass: 'safety',
  trigger: 'consecutive_low',
  species: 'cat',
  daysBelowBaseline: 2,
  refusedFoodLabel: null,
  ratedMealsConsidered: 7,
};
const chronic: SignalFinding = {
  type: 'symptom_chronicity',
  priorityClass: 'safety',
  symptomType: 'vomit',
  episodeCount: 14,
  spanDays: 40,
  activeWeeks: 5,
  symptomDays: 12,
  daysSinceLastEpisode: 1,
  firstOnsetIso: at(2026, 10, 1, 9, 0),
  tier: 'firm',
  windowDays: 56,
};
const burden: SignalFinding = {
  type: 'symptom_burden',
  priorityClass: 'safety',
  symptomType: 'vomit',
  count: 5,
  days: 3,
  runDays: 3,
  daysSinceRunEnd: 1,
  countArm: true,
  persistenceArm: true,
  tier: 'today',
  windowDays: 7,
};
const worsening: SignalFinding = {
  type: 'symptom_worsening',
  priorityClass: 'safety',
  symptomType: 'cough',
  currentCount: 7,
  priorCount: 2,
  currentDays: 5,
  priorDays: 2,
  trigger: 'more_days',
  tier: 'firm',
  windowDays: 7,
};
const redFlag: SignalFinding = {
  type: 'incident_red_flag',
  priorityClass: 'safety',
  incidentType: 'vomit',
  flags: ['foreign_material'],
  mostRecentFlaggedIso: at(2026, 11, 12, 15, 0),
  flaggedIncidentCount: 1,
  windowDays: 14,
  tier: 'call_today',
  tierIso: at(2026, 11, 13, 8, 0),
};
const reflection: SignalFinding = { type: 'reflection', priorityClass: 'insight', symptomType: 'vomit', currentCount: 2, priorCount: 3, direction: 'flat', windowDays: 14 };

const A = (day: string, iso: string | null = null) => ({ day, iso });
const c = (id: string, day: string, channel: RemoteContact['channel'], contactedAt: string | null = null): RemoteContact => ({ id, day, channel, contactedAt });

describe('the card’s first day: the latest start its own words defend', () => {
  it.each([
    ['intake, 2 days below', intake, '2026-11-13'],
    ['intake with no day count starts on the anchor', { ...intake, daysBelowBaseline: 0 } as SignalFinding, TODAY],
    ['burden: a 3-day run that ended yesterday', burden, '2026-11-11'],
    ['chronicity: its first onset', chronic, '2026-10-01'],
    ['worsening: its current window', worsening, '2026-11-08'],
    ['red flag: the earliest read it speaks of', redFlag, '2026-11-12'],
    ['red flag, call only: the call’s read', { ...redFlag, flags: [], callOnly: true } as SignalFinding, '2026-11-13'],
  ])('%s', (_name, f, day) => {
    expect(cardFirstDay(f, A(TODAY))).toBe(day);
  });

  it('an insight card, or a type this build cannot date, gains no line (silence, never a guess)', () => {
    expect(cardFirstDay(reflection, A(TODAY))).toBeNull();
    expect(cardFirstDay({ type: 'weight_change', priorityClass: 'safety' } as unknown as SignalFinding, A(TODAY))).toBeNull();
    expect(contactLineFor(reflection, [c('a', TODAY, 'email')], TODAY, A(TODAY))).toBeNull();
  });

  it('a chronicity card with a malformed onset gains no line', () => {
    expect(cardFirstDay({ ...chronic, firstOnsetIso: 'not a date' } as SignalFinding, A(TODAY))).toBeNull();
  });
});

describe('the sentence (mock §E, "You called on" shape)', () => {
  it('E1: today with the owner’s time', () => {
    expect(contactSentence(c('a', TODAY, 'email', at(2026, 11, 14, 16, 10)), TODAY)).toBe('You emailed the vet today, 4:10 pm.');
  });
  it('today with no time says today', () => {
    expect(contactSentence(c('a', TODAY, 'phone'), TODAY)).toBe('You called the vet today.');
  });
  it('a time from another day is never printed under today', () => {
    expect(contactSentence(c('a', TODAY, 'text', at(2026, 11, 12, 9, 0)), TODAY)).toBe('You texted the vet today.');
  });
  it('E2: an earlier day by its weekday and date, never a time', () => {
    expect(contactSentence(c('a', '2026-11-13', 'email', at(2026, 11, 13, 16, 10)), TODAY)).toBe('You emailed the vet on Fri, Nov 13.');
  });
  it('across a new year the year is printed', () => {
    expect(contactSentence(c('a', '2025-12-30', 'phone'), '2026-01-02')).toBe('You called the vet on Tue, Dec 30, 2025.');
  });
  it('every channel’s verb, and no exclamation or reassurance', () => {
    const words = (['phone', 'text', 'email'] as const).map((ch) => contactSentence(c('a', TODAY, ch), TODAY));
    expect(words).toEqual(['You called the vet today.', 'You texted the vet today.', 'You emailed the vet today.']);
    for (const w of words) expect(w).not.toMatch(/!|handled|done|all set|fine|okay|resolved/i);
  });
});

describe('which contact, and when none', () => {
  it('the newest contact on or after the first day wins', () => {
    const list = [c('a', '2026-11-13', 'phone'), c('b', TODAY, 'email', at(2026, 11, 14, 16, 10)), c('c', TODAY, 'text')];
    expect(contactLineFor(intake, list, TODAY, A(TODAY))).toBe('You emailed the vet today, 4:10 pm.');
  });
  it('a contact before the card began is not about this card', () => {
    expect(contactLineFor(intake, [c('a', '2026-11-12', 'phone')], TODAY, A(TODAY))).toBeNull();
  });
  it('a contact dated after today is never printed', () => {
    expect(contactLineFor(intake, [c('a', '2026-11-15', 'phone')], TODAY, A(TODAY))).toBeNull();
  });
  it('no contacts, no line', () => {
    expect(contactLineFor(intake, [], TODAY, A(TODAY))).toBeNull();
  });
  it('the card’s days run back from when the engine counted, not from today', () => {
    // Counted yesterday, 3 days below: the card began Nov 11, so Nov 12's call is about it.
    const three = { ...intake, daysBelowBaseline: 3 } as SignalFinding;
    expect(contactLineFor(three, [c('a', '2026-11-12', 'phone')], TODAY, A('2026-11-13'))).toBe('You called the vet on Thu, Nov 12.');
    // Counted today, the same card began Nov 12, and an untimed call that day says nothing.
    expect(contactLineFor(three, [c('a', '2026-11-12', 'phone')], TODAY, A(TODAY))).toBeNull();
  });
});

describe('the first day itself: a contact must come after the problem (adversarial pass, CUL-2769)', () => {
  const flagToday: SignalFinding = { ...redFlag, tier: 'call_now', mostRecentFlaggedIso: at(2026, 11, 14, 15, 0), tierIso: at(2026, 11, 14, 15, 0) } as SignalFinding;
  it('a 9:00 am call is not about a 3:00 pm call-now red flag', () => {
    expect(contactLineFor(flagToday, [c('a', TODAY, 'phone', at(2026, 11, 14, 9, 0))], TODAY, A(TODAY))).toBeNull();
  });
  it('an untimed call on the flag’s own day may be either, so it is not said', () => {
    expect(contactLineFor(flagToday, [c('a', TODAY, 'phone')], TODAY, A(TODAY))).toBeNull();
  });
  it('a call after the flag is said', () => {
    expect(contactLineFor(flagToday, [c('a', TODAY, 'phone', at(2026, 11, 14, 16, 0))], TODAY, A(TODAY))).toBe('You called the vet today, 4:00 pm.');
  });
  it('an intake refusal counted this evening: a morning call is not about it, a later one is', () => {
    const tonight = A(TODAY, at(2026, 11, 14, 19, 0));
    const fresh = { ...intake, daysBelowBaseline: 0, trigger: 'sustained_refusal' } as SignalFinding;
    expect(cardStart(fresh, tonight)).toEqual({ day: TODAY, instant: new Date(2026, 10, 14, 19, 0).getTime() });
    expect(contactLineFor(fresh, [c('a', TODAY, 'phone', at(2026, 11, 14, 8, 0))], TODAY, tonight)).toBeNull();
    expect(contactLineFor(fresh, [c('a', TODAY, 'email', at(2026, 11, 14, 20, 5))], TODAY, tonight)).toBe('You emailed the vet today, 8:05 pm.');
  });
  it('a card that began before the count’s day has no instant on its first day: that day says nothing', () => {
    expect(cardStart(intake, A(TODAY, at(2026, 11, 14, 7, 0)))).toEqual({ day: '2026-11-13', instant: null });
    expect(contactLineFor(intake, [c('a', '2026-11-13', 'phone', at(2026, 11, 13, 23, 0))], TODAY, A(TODAY))).toBeNull();
  });
  it('chronicity: a call later on the onset day counts, an earlier one does not', () => {
    const onset = '2026-10-01';
    expect(contactLineFor(chronic, [c('a', onset, 'phone', at(2026, 10, 1, 8, 0))], TODAY, A(TODAY))).toBeNull();
    expect(contactLineFor(chronic, [c('a', onset, 'phone', at(2026, 10, 1, 10, 0))], TODAY, A(TODAY))).toBe('You called the vet on Thu, Oct 1.');
  });
});

describe('AC 18 — the double line (R11), on a card long under way', () => {
  const calledOn = '2026-11-13';
  it('E3: a phone contact on the shipped line’s own day adds nothing', () => {
    expect(contactLineFor(chronic, [c('a', calledOn, 'phone')], '2026-11-13', A('2026-11-13'), calledOn)).toBeNull();
  });
  it('E4: an email the next day is a different fact, so it is said', () => {
    const list = [c('a', calledOn, 'phone'), c('b', TODAY, 'email', at(2026, 11, 14, 16, 10))];
    expect(contactLineFor(chronic, list, TODAY, A(TODAY), calledOn)).toBe('You emailed the vet today, 4:10 pm.');
  });
  it('a different channel on the same day is said', () => {
    expect(contactLineFor(chronic, [c('a', calledOn, 'text')], TODAY, A(TODAY), calledOn)).toBe('You texted the vet on Fri, Nov 13.');
  });
  it('a phone contact on another day is said', () => {
    expect(contactLineFor(chronic, [c('a', TODAY, 'phone')], TODAY, A(TODAY), calledOn)).toBe('You called the vet today.');
  });
  it('Home passes no called day today, so the phone contact is said once (PM ruling A, 2026-11-19)', () => {
    expect(contactLineFor(chronic, [c('a', calledOn, 'phone')], TODAY, A(TODAY))).toBe('You called the vet on Fri, Nov 13.');
  });
});

describe('the read', () => {
  it('parses rows and drops what it cannot trust: an exam, an unknown channel, a bad day', () => {
    expect(
      contactsFromRows([
        { id: 'a', visited_at: '2026-11-14', channel: 'email', contacted_at: null },
        { id: 'b', visited_at: '2026-11-14', channel: 'in_clinic', contacted_at: null },
        { id: 'c', visited_at: '2026-11-14', channel: null, contacted_at: null },
        { id: 'd', visited_at: '2026-02-30', channel: 'phone', contacted_at: null },
        { id: 'e', visited_at: '2026-11-13T00:00:00Z', channel: 'text', contacted_at: null },
      ]),
    ).toEqual([c('a', '2026-11-14', 'email'), c('e', '2026-11-13', 'text')]);
  });

  it('SELECTs the pet’s live remote contacts, and runs nothing else', async () => {
    const getAllAsync = jest.fn(async () => [{ id: 'a', visited_at: '2026-11-14', channel: 'phone', contacted_at: null }]);
    const runAsync = jest.fn();
    (getDb as jest.Mock).mockReturnValue({ getAllAsync, runAsync });
    await expect(readRemoteContacts('pet-1')).resolves.toEqual([c('a', '2026-11-14', 'phone')]);
    const [sql, params] = getAllAsync.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toMatch(/^\s*SELECT/);
    expect(sql).toMatch(/deleted_at IS NULL/);
    expect(sql).toMatch(/channel IN \('phone', 'text', 'email'\)/);
    expect(params).toEqual(['pet-1']);
    expect(runAsync).not.toHaveBeenCalled();
  });
});
