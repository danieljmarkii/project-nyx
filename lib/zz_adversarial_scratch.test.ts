import { computeTrialFacts, REFUSAL_SHARE, REFUSAL_MIN_RATED, type AllowedFood, type TrialFeeding, type TrialSpec } from './dietTrial';

const TRIAL: TrialSpec = { id: 't', startedAt: '2026-07-01', targetDurationDays: 56, species: 'cat' };
function at(day: string, hour = 12): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, hour, 0, 0).toISOString();
}
function food(over: Partial<AllowedFood> & Pick<AllowedFood, 'foodItemId'>): AllowedFood {
  return { foodKey: null, label: 'Food', role: 'primary_diet', allowedFrom: '2026-07-01', allowedUntil: null, primaryProtein: null, proteins: [], ...over };
}
function feeding(over: Partial<TrialFeeding> & Pick<TrialFeeding, 'eventId'>): TrialFeeding {
  return { occurredAt: at('2026-07-10'), foodItemId: null, foodKey: null, label: null, foodType: 'meal', proteins: [], ...over };
}
// The trial's permit row points at a food UUID that no logged feeding carries —
// the re-photographed bag. Rung 1 misses on every feeding.
const STALE_PRIMARY = food({ foodItemId: 'zd-old-uuid', foodKey: 'hillszd', label: 'z/d', primaryProtein: 'hydrolysate', proteins: ['hydrolysate'] });
const day = (n: number) => `2026-07-${String(n).padStart(2, '0')}`;

describe('ADV — B-530 wide population', () => {
  // ATTACK 1: healthy pet, cold/broken permit set, sparse attention-biased ratings.
  it('A1 — healthy cat, dark permit set, 3 rated meals of which 2 "some" → does the lane fire?', () => {
    const feedings: TrialFeeding[] = [];
    // 14 days x 2 meals of an unmatched-but-real food; only 3 carry a rating.
    for (let d = 8; d <= 21; d += 1) {
      feedings.push(feeding({ eventId: `m${d}a`, occurredAt: at(day(d), 8), foodItemId: 'zd-new-uuid', foodKey: 'hills zd feline food', label: 'z/d Feline Food' }));
      feedings.push(feeding({ eventId: `m${d}b`, occurredAt: at(day(d), 19), foodItemId: 'zd-new-uuid', foodKey: 'hills zd feline food', label: 'z/d Feline Food' }));
    }
    // The three ratings the owner actually tapped: two "some" (she noticed leftovers), one "all".
    feedings[0].intakeRating = 'some';           // 08 @08
    feedings[3].intakeRating = 'some';           // 09 @19
    feedings[10].intakeRating = 'all';           // 13 @08
    const f = computeTrialFacts({ trial: TRIAL, allowedFoods: [STALE_PRIMARY], feedings, nowMs: new Date(2026, 6, 21, 22).getTime() });
    console.log('A1 allowedSetUnavailable', f.allowedSetUnavailable);
    console.log('A1 trialDietRefusal', JSON.stringify(f.trialDietRefusal));
    console.log('A1 rangeRefusal', JSON.stringify(f.rangeRefusal));
    console.log('A1 recentFinished/recentRated', f.recentFinishedFeedings, f.recentRatedFeedings);
  });

  // ATTACK 2: the reassuring direction. Cat refuses the prescribed (unmatched) diet
  // every single bowl, but the owner caves and feeds tuna, which the cat finishes.
  it('A2 — cat refuses 100% of the prescribed diet but finishes table food → stand-down?', () => {
    const feedings: TrialFeeding[] = [];
    for (let d = 8; d <= 21; d += 1) {
      feedings.push(feeding({ eventId: `zd${d}`, occurredAt: at(day(d), 8), foodItemId: 'zd-new-uuid', foodKey: 'hills zd feline food', label: 'z/d Feline Food', intakeRating: 'refused' }));
      feedings.push(feeding({ eventId: `tuna${d}`, occurredAt: at(day(d), 12), foodItemId: 'tuna', foodKey: 'tuna', label: 'Tuna', intakeRating: 'all' }));
      feedings.push(feeding({ eventId: `tuna2${d}`, occurredAt: at(day(d), 19), foodItemId: 'tuna', foodKey: 'tuna', label: 'Tuna', intakeRating: 'all' }));
    }
    const f = computeTrialFacts({ trial: TRIAL, allowedFoods: [STALE_PRIMARY], feedings, nowMs: new Date(2026, 6, 21, 22).getTime() });
    console.log('A2 allowedSetUnavailable', f.allowedSetUnavailable);
    console.log('A2 trialDietRefusal', JSON.stringify(f.trialDietRefusal));
    console.log('A2 rangeRefusal', JSON.stringify(f.rangeRefusal));
    console.log('A2 recentFinished/recentRated', f.recentFinishedFeedings, f.recentRatedFeedings);
    console.log('A2 isEatingNow-would-be', f.recentRatedFeedings >= REFUSAL_MIN_RATED && f.recentFinishedFeedings / f.recentRatedFeedings >= 1 - REFUSAL_SHARE);
  });

  // ATTACK 3: is narrow always empty when allowedSetUnavailable? Partial hydration:
  // a primary row that matches SOME feedings (1 of 40).
  it('A3 — one primary match across 40 feedings: which population speaks?', () => {
    const GOOD = food({ foodItemId: 'zd-new-uuid', foodKey: 'hills zd feline food', label: 'z/d', primaryProtein: 'hydrolysate', proteins: ['hydrolysate'] });
    const feedings: TrialFeeding[] = [];
    // one matched primary feeding, refused
    feedings.push(feeding({ eventId: 'match', occurredAt: at(day(8), 8), foodItemId: 'zd-new-uuid', intakeRating: 'refused' }));
    for (let d = 8; d <= 21; d += 1) {
      feedings.push(feeding({ eventId: `x${d}a`, occurredAt: at(day(d), 12), foodItemId: 'zd-rephoto', foodKey: 'hills zd feline food dry', label: 'z/d Feline Dry', intakeRating: 'refused' }));
      feedings.push(feeding({ eventId: `x${d}b`, occurredAt: at(day(d), 19), foodItemId: 'zd-rephoto', foodKey: 'hills zd feline food dry', label: 'z/d Feline Dry', intakeRating: 'refused' }));
    }
    const f = computeTrialFacts({ trial: TRIAL, allowedFoods: [GOOD], feedings, nowMs: new Date(2026, 6, 21, 22).getTime() });
    console.log('A3 allowedSetUnavailable', f.allowedSetUnavailable);
    console.log('A3 trialDietRefusal', JSON.stringify(f.trialDietRefusal));
    console.log('A3 intakeRating', JSON.stringify(f.intakeRating));
  });

  // ATTACK 4: R1a — nobody rates anything.
  it('A4 — zero ratings anywhere, dark permit set', () => {
    const feedings: TrialFeeding[] = [];
    for (let d = 8; d <= 21; d += 1) {
      feedings.push(feeding({ eventId: `m${d}`, occurredAt: at(day(d), 8), foodItemId: 'zd-new-uuid', foodKey: 'k' }));
      feedings.push(feeding({ eventId: `n${d}`, occurredAt: at(day(d), 19), foodItemId: 'zd-new-uuid', foodKey: 'k' }));
    }
    const f = computeTrialFacts({ trial: TRIAL, allowedFoods: [STALE_PRIMARY], feedings, nowMs: new Date(2026, 6, 21, 22).getTime() });
    console.log('A4', f.allowedSetUnavailable, JSON.stringify(f.trialDietRefusal), JSON.stringify(f.rangeRefusal));
  });

  // ATTACK 5: the UNHYDRATED_SET_FLOOR boundary — exactly 9 vs 10 total feedings,
  // with a primary row that matches nothing and every feeding refused.
  it('A5 — boundary at UNHYDRATED_SET_FLOOR', () => {
    const GOOD = food({ foodItemId: 'never-logged', foodKey: 'never logged food', label: 'z/d' });
    const mk = (n: number) => {
      const feedings: TrialFeeding[] = [];
      for (let i = 0; i < n; i += 1) {
        feedings.push(feeding({ eventId: `f${i}`, occurredAt: at(day(8 + Math.floor(i / 2)), i % 2 ? 19 : 8), foodItemId: 'other', foodKey: 'other food', intakeRating: 'refused' }));
      }
      return computeTrialFacts({ trial: TRIAL, allowedFoods: [GOOD], feedings, nowMs: new Date(2026, 6, 21, 22).getTime() });
    };
    for (const n of [8, 9, 10, 11]) {
      const f = mk(n);
      console.log(`A5 n=${n} unavailable=${f.allowedSetUnavailable} refusal=${JSON.stringify(f.trialDietRefusal)}`);
    }
  });
});
