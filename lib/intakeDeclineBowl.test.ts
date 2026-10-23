// Mixed meals row 4 (CUL-2053; spec §5.4, §10 "Clinical readers") — the phone's intake
// readers over a MIXED BOWL, held to the server's.
//
// The client `detectIntakeDecline` is parity-pinned to detection.ts detector ② (CUL-94),
// and row 3 (CUL-2052) gave the server two histories for a mix. Every decline fixture
// here runs through BOTH real detectors and asserts they agree before it is read (C-34),
// under UTC−7 and UTC+11 (C-29: a zone on each side of UTC, instants written with their
// local offset). Then the per-food and per-protein rates: a bowl's rating is a fact about
// the bowl, never about either food.

jest.mock('./db', () => ({ getDb: jest.fn() }));
jest.mock('./feedingArrangements', () => ({ getActiveArrangementsForPet: jest.fn() }));

import {
  computeTopFoods,
  computeTopProteins,
  detectIntakeDecline as phoneDetect,
  type AnalyticsBowl,
  type AnalyticsMeal,
} from './analytics';
import { detectIntakeDecline as serverDetect } from '../supabase/functions/generate-signal/detection';
import type { IntakeRating, MealEvent } from '../supabase/functions/generate-signal/detection';

const MINUS_7 = 'Etc/GMT+7';
const PLUS_11 = 'Etc/GMT-11';
const ZONES: { zone: string; offset: string }[] = [
  { zone: MINUS_7, offset: '-07:00' },
  { zone: PLUS_11, offset: '+11:00' },
];

const CHICKEN = { foodItemId: 'chicken', foodLabel: 'Acme Chicken Pâté', foodType: 'meal', primaryProtein: 'chicken', proteins: ['chicken'] };
const RABBIT = { foodItemId: 'rabbit', foodLabel: 'Acme Rabbit Pâté', foodType: 'meal', primaryProtein: 'rabbit', proteins: ['rabbit'] };
const MIX: AnalyticsBowl = { status: 'mix', compositionKey: 'id:chicken+id:rabbit', components: [CHICKEN, RABBIT] };

interface M {
  iso: string;
  rating: IntakeRating;
  /** A plain food id, or the bowl. */
  food: 'chicken' | 'rabbit' | AnalyticsBowl;
}

const LABEL: Record<string, string> = { chicken: CHICKEN.foodLabel, rabbit: RABBIT.foodLabel };

function phoneRows(meals: M[]): AnalyticsMeal[] {
  return meals.map((m) =>
    typeof m.food === 'string'
      ? { ms: Date.parse(m.iso), foodItemId: m.food, foodLabel: LABEL[m.food], foodType: 'meal', primaryProtein: m.food, proteins: [m.food], intakeRating: m.rating }
      : {
          ms: Date.parse(m.iso),
          foodItemId: null,
          foodLabel: `${CHICKEN.foodLabel} mixed with ${RABBIT.foodLabel}`,
          foodType: 'meal',
          primaryProtein: null,
          proteins: ['chicken', 'rabbit'],
          intakeRating: m.rating,
          bowl: m.food,
        },
  );
}

function serverEvents(meals: M[]): MealEvent[] {
  return meals.map((m, i) =>
    typeof m.food === 'string'
      ? { id: `m${i}`, occurredAt: new Date(Date.parse(m.iso)).toISOString(), foodItemId: m.food, primaryProtein: m.food, proteins: [m.food], intakeRating: m.rating, foodType: 'meal', foodLabel: LABEL[m.food] }
      : {
          id: `m${i}`,
          occurredAt: new Date(Date.parse(m.iso)).toISOString(),
          foodItemId: null,
          primaryProtein: null,
          proteins: ['chicken', 'rabbit'],
          intakeRating: m.rating,
          foodType: 'meal',
          foodLabel: `${CHICKEN.foodLabel} mixed with ${RABBIT.foodLabel}`,
          bowl: { status: m.food.status, compositionKey: m.food.compositionKey, components: m.food.components.map((c) => ({ foodItemId: c.foodItemId, foodLabel: c.foodLabel })) },
        },
  );
}

/** Both real detectors, one verdict: [trigger, refused label] pairs, which must agree. */
function verdict(meals: M[], nowIso: string, zone: string, species: 'cat' | 'dog' = 'cat'): string[][] {
  const phoneRes = phoneDetect({ species, nowMs: Date.parse(nowIso), meals: phoneRows(meals), freeFedSpans: [], timeZone: zone });
  const phone = phoneRes.status === 'watch' ? phoneRes.flags.map((f) => [f.trigger, f.refusedFoodLabel ?? '']) : [];
  const server = serverDetect({
    pet: { name: 'Pixel', species, dietTrialActive: false },
    symptomEvents: [],
    mealEvents: serverEvents(meals),
    feedingArrangements: [],
    now: new Date(Date.parse(nowIso)).toISOString(),
    timezone: zone,
  }).map((f) => [f.trigger, (f as { refusedFoodLabel?: string | null }).refusedFoodLabel ?? '']);
  expect(server).toEqual(phone);
  return phone;
}

const verdictDog = (meals: M[], nowIso: string, zone: string) => verdict(meals, nowIso, zone, 'dog');
const day = (d: number) => `2026-10-${String(d).padStart(2, '0')}`;
const refusals = (v: string[][]) => v.filter(([t]) => t === 'refused_normal_food').map(([, label]) => label);

describe.each(ZONES)('Trigger B over mixed bowls ($zone)', ({ zone, offset }) => {
  it('14 days of mixes eaten well, then a refused mix, fires on the composition and names the bowl (pass 1)', () => {
    const meals: M[] = [];
    for (let d = 1; d <= 14; d++) meals.push({ iso: `${day(d)}T08:00:00${offset}`, rating: 'all', food: MIX });
    meals.push({ iso: `${day(15)}T08:00:00${offset}`, rating: 'refused', food: MIX });
    expect(refusals(verdict(meals, `${day(15)}T12:00:00${offset}`, zone))).toEqual([
      `${CHICKEN.foodLabel} mixed with ${RABBIT.foodLabel}`,
    ]);
  });

  it('a refused mix trips Trigger B for a component with a solid plain history (spec §10)', () => {
    const meals: M[] = [];
    for (let d = 5; d <= 9; d++) meals.push({ iso: `${day(d)}T08:00:00${offset}`, rating: 'all', food: 'chicken' });
    meals.push({ iso: `${day(10)}T08:00:00${offset}`, rating: 'refused', food: MIX });
    expect(refusals(verdict(meals, `${day(10)}T12:00:00${offset}`, zone)).length).toBeGreaterThan(0);
  });

  it('partly eaten mixes do not drag a solid plain history under the floor (break A)', () => {
    const meals: M[] = [];
    for (let d = 3; d <= 6; d++) meals.push({ iso: `${day(d)}T08:00:00${offset}`, rating: 'all', food: 'chicken' });
    for (let d = 7; d <= 10; d++) meals.push({ iso: `${day(d)}T08:00:00${offset}`, rating: 'picked', food: MIX });
    meals.push({ iso: `${day(11)}T08:00:00${offset}`, rating: 'refused', food: MIX });
    expect(refusals(verdict(meals, `${day(11)}T12:00:00${offset}`, zone)).length).toBeGreaterThan(0);
  });

  it('a later plain meal eaten well stands the component down; an eaten mix never does', () => {
    const base: M[] = [];
    for (let d = 3; d <= 7; d++) base.push({ iso: `${day(d)}T08:00:00${offset}`, rating: 'all', food: 'chicken' });
    base.push({ iso: `${day(8)}T08:00:00${offset}`, rating: 'refused', food: MIX });
    const withPlain = [...base, { iso: `${day(8)}T18:00:00${offset}`, rating: 'all' as IntakeRating, food: 'chicken' as const }];
    expect(refusals(verdict(withPlain, `${day(9)}T07:00:00${offset}`, zone))).toEqual([]);
    const withMix = [...base, { iso: `${day(8)}T18:00:00${offset}`, rating: 'all' as IntakeRating, food: MIX }];
    expect(refusals(verdict(withMix, `${day(9)}T07:00:00${offset}`, zone)).length).toBeGreaterThan(0);
  });

  it('a dog refusing the new food plainly after a mixed switch is flagged, naming that food (CUL-2083)', () => {
    const meals: M[] = [];
    for (let d = 2; d <= 11; d++) {
      meals.push({ iso: `${day(d)}T08:00:00${offset}`, rating: 'all', food: MIX });
      meals.push({ iso: `${day(d)}T18:00:00${offset}`, rating: 'all', food: MIX });
    }
    for (const d of [12, 13]) meals.push({ iso: `${day(d)}T08:00:00${offset}`, rating: 'all', food: 'rabbit' });
    meals.push({ iso: `${day(14)}T08:00:00${offset}`, rating: 'refused', food: 'rabbit' });
    const flags = verdictDog(meals, `${day(14)}T12:00:00${offset}`, zone);
    expect(flags).toContainEqual(['refused_normal_food', RABBIT.foodLabel]);
  });

  it('an incomplete bowl feeds no history, but its visible food is tested', () => {
    const partial: AnalyticsBowl = { status: 'incomplete', compositionKey: 'id:chicken', components: [CHICKEN] };
    const meals: M[] = [];
    for (let d = 3; d <= 7; d++) meals.push({ iso: `${day(d)}T08:00:00${offset}`, rating: 'all', food: 'chicken' });
    meals.push({ iso: `${day(8)}T08:00:00${offset}`, rating: 'refused', food: partial });
    expect(refusals(verdict(meals, `${day(8)}T12:00:00${offset}`, zone)).length).toBeGreaterThan(0);
  });
});

// ── Per-food and per-protein rates: a bowl's rating claims nothing about a food ──────

describe('a finished mix adds to no per-food or per-protein rate (spec §5.4, §10)', () => {
  const at = (d: number, h: number) => Date.parse(`${day(d)}T${String(h).padStart(2, '0')}:00:00-07:00`);
  function plain(food: typeof CHICKEN, d: number, h: number, rating: string): AnalyticsMeal {
    return { ms: at(d, h), foodItemId: food.foodItemId, foodLabel: food.foodLabel, foodType: 'meal', primaryProtein: food.primaryProtein, proteins: food.proteins, intakeRating: rating };
  }
  function bowl(d: number, h: number, rating: string): AnalyticsMeal {
    return { ms: at(d, h), foodItemId: null, foodLabel: 'mix', foodType: 'meal', primaryProtein: null, proteins: ['chicken', 'rabbit'], intakeRating: rating, bowl: MIX };
  }
  // Rabbit eaten plain four times (the rate floor), picked at; ten finished mixes on top.
  const rows: AnalyticsMeal[] = [
    plain(RABBIT, 1, 18, 'picked'),
    plain(RABBIT, 1, 8, 'picked'),
    plain(RABBIT, 2, 8, 'picked'),
    plain(RABBIT, 3, 8, 'picked'),
    plain(CHICKEN, 4, 8, 'all'),
    ...Array.from({ length: 10 }, (_, i) => bowl(5 + i, 8, 'all')),
  ];

  it('top foods: the bowl counts as a feeding of each food, and the rabbit rate is its plain meals only', () => {
    const top = computeTopFoods(rows);
    if (!Array.isArray(top)) throw new Error('expected a ranking');
    const rabbit = top.find((f) => f.foodItemId === 'rabbit')!;
    expect(rabbit.count).toBe(14);
    expect(rabbit.ratedMeals).toBe(4);
    expect(rabbit.finishedRate).toBe(0);
    // Each bowl is one feeding in the denominator, not two.
    expect(rabbit.shareOfDiet).toBeCloseTo(14 / 15);
  });

  it('top proteins: the bowl exposes both proteins once, and no protein rate reads it', () => {
    const top = computeTopProteins(rows);
    if (!Array.isArray(top)) throw new Error('expected a ranking');
    const rabbit = top.find((p) => p.protein === 'rabbit')!;
    expect(rabbit.count).toBe(14);
    expect(rabbit.ratedMeals).toBe(4);
    expect(rabbit.finishedRate).toBe(0);
    expect(top.find((p) => p.protein === 'chicken')!.count).toBe(11);
  });
});
