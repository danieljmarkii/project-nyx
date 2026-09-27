// The Pet tab's door row (TS-6 · CUL-1302; spec §5.2, R-3; the safety-face ruling, PM
// 2026-09-27 option (a)). Every expected string is a literal, and every withholding is
// asserted beside the non-vacuity half: the thing withheld was there to leak.

jest.mock('./supabase', () => ({ supabase: {} }));

import { isAnimalNotEating, resolveTrialCard, resolveTrialStrip, type TrialCardInput } from './dietTrialCard';
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
      alert: null,
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

// Ruling (a), then (a′) after the adversarial pass (PM, 2026-09-27): wherever the screen
// leads with its safety block, the row draws no bar and no end date, and carries the
// screen's first safety sentence verbatim. "Wherever" is the screen's own test (the card's
// register lines), so the two cannot disagree about whether something is wrong.

function screenFor(i: TrialCardInput) {
  const m = buildTrialScreenModel({
    petId: 'p', pet: { id: 'p', name: 'Mochi' }, petsLoaded: true, petName: 'Mochi', isActivePet: true,
    trial: { status: 'loaded', input: i, inputIsForPet: true },
    facts: { status: 'ready', facts: null },
    allowedSet: { status: 'unknown' },
    appointment: null,
  });
  if (m.kind !== 'trial') throw new Error('expected a trial');
  return m;
}

const REFUSAL = { refusedFeedings: 4, ratedFeedings: 5, days: 2, population: 'trial_diet' as const };
const DECLINE = 'Mochi has eaten less than usual for 2 days.';

describe('the safety faces: the screen’s first sentence, no bar, no end date (rulings (a), (a′))', () => {
  it('a trial refusal on a cat — the case the Signal cannot see (B-789)', () => {
    const i = input({ species: 'cat', trialDietRefusal: REFUSAL });
    expect(resolveTrialCard(i).state).toBe('trial_refusal');
    const r = row(i);
    // Both sentences (PM, 2026-09-27): the fact, then the ask, which is where the call lives.
    expect(r.alert).toEqual([
      '4 feedings of the 5 trial-diet feedings you’ve rated were left unfinished, across 2 days.',
      'A diet Mochi isn’t eating can’t answer the question the trial was started for — and a cat that isn’t eating what’s put down needs a call today, whatever the trial is doing. Culprit isn’t reading these days as a clean run while this is going on.',
    ]);
    expect(r.alert).toEqual(screenFor(i).safety!.slice(0, 2));
    expect(r.progressFraction).toBeNull();
    expect(r.subline).toBe('Royal Canin Rabbit');
    expect(r.accessibilityLabel).toBe(
      'Diet trial · day 23 of 56. 4 feedings of the 5 trial-diet feedings you’ve rated were left unfinished, across 2 days. A diet Mochi isn’t eating can’t answer the question the trial was started for — and a cat that isn’t eating what’s put down needs a call today, whatever the trial is doing. Culprit isn’t reading these days as a clean run while this is going on. Royal Canin Rabbit. Open the diet trial.',
    );
  });

  it('an intake decline', () => {
    const i = input({ intakeDeclineHeadline: DECLINE });
    expect(resolveTrialCard(i).state).toBe('intake_decline');
    const r = row(i);
    expect(r.title).toBe('Diet trial · day 23 of 56');
    expect(r.alert).toEqual([
      DECLINE,
      'A pet that goes off their food needs a call, whatever the trial is doing. Culprit isn’t reading these days as a clean run while this is going on.',
    ]);
    expect(r.alert).toEqual(screenFor(i).safety!.slice(0, 2));
    expect(r.progressFraction).toBeNull();
    expect(r.subline).toBe('Royal Canin Rabbit');
    // Non-vacuity: the same trial without the flag has a bar and an end date to leak.
    expect(row(input()).progressFraction).not.toBeNull();
    expect(row(input()).subline).toMatch(/ends Aug 27$/);
    expect(row(input()).alert).toBeNull();
  });

  it('an ended trial with a live decline: the screen leads with the warning, so the door carries it', () => {
    // Keyed on the lines, never the state: the state here is `completed`.
    const i = input({ species: 'cat', intakeDeclineHeadline: DECLINE }, { status: 'completed', endedAt: '2026-07-20', targetDurationDays: 17 });
    expect(resolveTrialCard(i).state).toBe('completed');
    expect(screenFor(i).safety).not.toBeNull();
    const r = row(i);
    expect(r.alert?.[0]).toBe(DECLINE);
    expect(r.alert?.[1]).toMatch(/needs a call today/);
    expect(r.progressFraction).toBeNull();
  });

  it('a refusal the register has stood down: no warning on the screen, so none on the door', () => {
    // The screen withholds coverage over it (S7) but shows no safety block, and neither does
    // the door: the two agree, and neither says more than Home's strip in either direction.
    const i = input({ rangeRefusal: { refusedFeedings: 3, ratedFeedings: 6, days: 3, population: 'trial_diet' } });
    // Non-vacuity: the record does say the pet may not be eating.
    expect(isAnimalNotEating(i)).toBe(true);
    expect(screenFor(i).safety).toBeNull();
    expect(row(i).alert).toBeNull();
  });
});
