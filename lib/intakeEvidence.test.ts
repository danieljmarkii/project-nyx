// The shared intake vocabulary (Engines v3 PR-30, CUL-1722; GAP-28). The app (the daily look's
// arm 3, the emergency door, the analytics filters) and the vomit read import these, so the
// rules below are the ones both sides speak.

import {
  isKnownIntakeRating,
  isPositiveIntakeRating,
  isQualifyingIntakeMeal,
  isRefusedOrPickedRating,
  NOTICED_REFUSAL_RECENCY_DAYS,
  noticedRefusalAt,
  noticedRefusalPattern,
  type IntakeEvidenceMeal,
} from './intakeEvidence';
import { intakeArm, LOOK_REFUSAL_LOOKBACK, LOOK_REFUSAL_MIN, LOOK_REFUSAL_RECENCY_DAYS } from './lookWithheld';

jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() }));
jest.mock('./db', () => ({ getDb: () => ({ getAllAsync: jest.fn(), getFirstAsync: jest.fn() }) }));
jest.mock('./feedingArrangements', () => ({ getActiveArrangementsForPet: jest.fn() }));

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 8, 10, 12);
const m = (hoursAgo: number, rating: string | null, foodType: string | null = 'meal', foodItemId: string | null = 'f'): IntakeEvidenceMeal => ({
  ms: NOW - hoursAgo * 3_600_000,
  foodItemId,
  foodType,
  intakeRating: rating,
});

describe('the scale', () => {
  it('positive is Most or All; refusal-class is Refused or Picked; Some is neither', () => {
    expect(['refused', 'picked', 'some', 'most', 'all'].map(isPositiveIntakeRating)).toEqual([false, false, false, true, true]);
    expect(['refused', 'picked', 'some', 'most', 'all'].map(isRefusedOrPickedRating)).toEqual([true, true, false, false, false]);
  });
  it('an unrated or unknown rating is unknown: never positive, never a refusal', () => {
    for (const r of [null, undefined, '', 'bogus']) {
      expect(isPositiveIntakeRating(r)).toBe(false);
      expect(isRefusedOrPickedRating(r)).toBe(false);
      expect(isKnownIntakeRating(r)).toBe(false);
    }
  });
});

describe('the qualifying meal', () => {
  it('drops treats, unrated meals and free-fed bowls', () => {
    const spans = [{ foodItemId: 'bowl', fromMs: NOW - 10 * DAY, untilMs: Infinity }];
    expect(isQualifyingIntakeMeal(m(1, 'refused'), spans)).toBe(true);
    expect(isQualifyingIntakeMeal(m(1, 'refused', 'treat'), spans)).toBe(false);
    expect(isQualifyingIntakeMeal(m(1, null), spans)).toBe(false);
    expect(isQualifyingIntakeMeal(m(1, 'refused', 'meal', 'bowl'), spans)).toBe(false);
    // A bowl set down AFTER the refusal never excuses it (CUL-1237).
    expect(isQualifyingIntakeMeal(m(1, 'refused', 'meal', 'bowl'), [{ foodItemId: 'bowl', fromMs: NOW, untilMs: Infinity }])).toBe(true);
  });
});

describe('the Noticed predicate', () => {
  it('is the one the daily look reads (the same constants and the same answer)', () => {
    expect([LOOK_REFUSAL_RECENCY_DAYS, LOOK_REFUSAL_MIN, LOOK_REFUSAL_LOOKBACK]).toEqual([3, 2, 3]);
    const cases: IntakeEvidenceMeal[][] = [
      [m(1, 'refused'), m(5, 'picked'), m(9, 'all')],
      [m(1, 'refused'), m(5, 'all'), m(9, 'all')],
      [m(1, 'all'), m(5, 'refused'), m(9, 'picked'), m(12, 'refused')],
      [m(1, 'some'), m(5, 'some')],
      [],
    ];
    for (const c of cases) {
      const analyticsShape = c.map((x) => ({ ...x, foodLabel: null, primaryProtein: null }));
      expect(intakeArm(analyticsShape)).toBe(noticedRefusalPattern(c));
    }
    expect(cases.map(noticedRefusalPattern)).toEqual([true, false, true, false, false]);
  });

  it('noticedRefusalAt bounds the rows to the three days before the instant, and ignores later rows', () => {
    expect(noticedRefusalAt([m(10, 'refused'), m(20, 'picked')], [], NOW)).toBe(true);
    // Past the recency bound.
    const old = NOTICED_REFUSAL_RECENCY_DAYS * 24 + 1;
    expect(noticedRefusalAt([m(old, 'refused'), m(old + 1, 'picked')], [], NOW)).toBe(false);
    // A meal after the instant is not evidence about it.
    expect(noticedRefusalAt([m(-2, 'refused'), m(10, 'picked')], [], NOW)).toBe(false);
    // Unrated rows never take a slot: two refusals behind three unrated still fire.
    expect(noticedRefusalAt([m(1, null), m(2, null), m(3, null), m(10, 'refused'), m(20, 'picked')], [], NOW)).toBe(true);
    expect(noticedRefusalAt([m(10, 'refused'), m(20, 'picked')], [], Number.NaN)).toBe(false);
  });
});
