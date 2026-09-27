// The Pet tab's door row (TS-6 · CUL-1302; spec §5.2, R-3; the safety-face ruling, PM
// 2026-09-27 option (a)). Every expected string is a literal, and every withholding is
// asserted beside the non-vacuity half: the thing withheld was there to leak.

jest.mock('./supabase', () => ({ supabase: {} }));

import { resolveTrialCard, resolveTrialStrip, type TrialCardInput } from './dietTrialCard';
import { buildTrialDoorRow, type TrialDoorRowModel } from './trialDoorRow';
import { buildTrialScreenModel } from './trialScreenModel';

// Local noon on Jul 25, 2026: the trial started Jul 3, so today is day 23 of 56.
const NOW = new Date(2026, 6, 25, 12, 0).getTime();

function input(over: Partial<TrialCardInput> = {}, trialOver: Partial<NonNullable<TrialCardInput['trial']>> = {}): TrialCardInput {
  return {
    trial: {
      id: 't-1',
      status: 'active',
      startedAt: '2026-07-03',
      targetDurationDays: 56,
      foodLabel: 'Royal Canin Rabbit',
      ...trialOver,
    },
    nowMs: NOW,
    petName: 'Mochi',
    species: 'dog',
    coverage: { daysLogged: 23, daysElapsed: 23 },
    exposures: { totalFeedings: 40, offDiet: 1, mayStateRecordClean: false, mostRecent: null },
    otherPetNames: [],
    ...over,
  };
}

function row(i: TrialCardInput | null): TrialDoorRowModel {
  const r = buildTrialDoorRow(i);
  if (r === null) throw new Error('expected a door row');
  return r;
}

describe('the Pet tab door (§5.2)', () => {
  it('a running trial: eyebrow, the strip’s header, the day bar, {food} · ends {date}', () => {
    const r = row(input());
    expect(r).toEqual({
      eyebrow: 'Diet trial',
      title: 'Diet trial · day 23 of 56',
      progressFraction: resolveTrialCard(input()).progressFraction,
      subline: 'Royal Canin Rabbit · ends Aug 27',
      accessibilityLabel: 'Diet trial · day 23 of 56. Royal Canin Rabbit · ends Aug 27. Open the diet trial.',
    });
    // The title IS the strip's header, and the bar is DAY progress (R2).
    expect(r.title).toBe(resolveTrialStrip(input())!.header);
    expect(r.progressFraction).toBeCloseTo(23 / 56, 5);
  });

  it('agrees with the screen on when the trial ends', () => {
    const i = input();
    const screen = buildTrialScreenModel({
      petId: 'p', pet: { id: 'p', name: 'Mochi' }, petsLoaded: true, petName: 'Mochi', isActivePet: true,
      trial: { status: 'loaded', input: i, inputIsForPet: true },
      facts: { status: 'ready', facts: null },
      allowedSet: { status: 'unknown' },
      appointment: null,
    });
    if (screen.kind !== 'trial') throw new Error('expected a trial');
    expect(screen.title).toBe(row(i).title);
    expect(screen.subline).toBe('Royal Canin Rabbit · since Jul 3 · ends Aug 27');
    expect(screen.subline!.endsWith(row(i).subline!.split(' · ').pop()!)).toBe(true);
  });

  it('past the window: the overrun header and "window ended"', () => {
    const i = input({ nowMs: new Date(2026, 8, 1, 12, 0).getTime(), coverage: { daysLogged: 61, daysElapsed: 61 } });
    const r = row(i);
    expect(r.title).toBe('Diet trial · day 61 — 5 days past');
    expect(r.subline).toBe('Royal Canin Rabbit · window ended Aug 27');
  });

  it('no trial: no row (the start card stays)', () => {
    expect(buildTrialDoorRow(null)).toBeNull();
    expect(buildTrialDoorRow(input({ trial: null }))).toBeNull();
  });

  it('an ended trial inside its grace: the card’s kicker and its date range, no end clause', () => {
    const i = input({}, { status: 'completed', endedAt: '2026-07-20', targetDurationDays: 17 });
    const card = resolveTrialCard(i);
    expect(card.state).toBe('completed');
    const r = row(i);
    expect(r.title).toBe(card.kicker);
    expect(r.subline).toBe(`Royal Canin Rabbit · ${card.dayLine}`);
    expect(r.subline).not.toMatch(/ends|window ended/);
  });
});

describe('the safety faces draw no bar and no end date (PM ruling, 2026-09-27, (a))', () => {
  it('an intake decline', () => {
    const i = input({ intakeDeclineHeadline: 'Mochi has eaten less than usual for 2 days.' });
    expect(resolveTrialCard(i).state).toBe('intake_decline');
    const r = row(i);
    expect(r.title).toBe('Diet trial · day 23 of 56');
    expect(r.progressFraction).toBeNull();
    expect(r.subline).toBe('Royal Canin Rabbit');
    // Non-vacuity: the same trial without the flag has both to leak.
    expect(row(input()).progressFraction).not.toBeNull();
    expect(row(input()).subline).toMatch(/ends Aug 27$/);
  });

  it('a trial refusal', () => {
    const i = input({
      species: 'cat',
      trialDietRefusal: { refusedFeedings: 4, ratedFeedings: 5, days: 2, population: 'trial_diet' },
    });
    expect(resolveTrialCard(i).state).toBe('trial_refusal');
    const r = row(i);
    expect(r.progressFraction).toBeNull();
    expect(r.subline).toBe('Royal Canin Rabbit');
    // The row never carries a register line of its own.
    expect(JSON.stringify(r)).not.toMatch(/call|unfinished|refus/i);
  });
});
