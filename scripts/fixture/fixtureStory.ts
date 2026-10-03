// The device-pass fixture account's story — the SINGLE SOURCE OF TRUTH (CUL-1222, GC-2).
//
// The one device sitting (CUL-1529) walks Noticed, Design v2, History v2 and the trial
// screen with all four flags on, and most of its steps need a record shaped a
// particular way: a Home whose Signal leads with a benign insight (so the chart card
// renders at all, MFU-1), a Home that leads with a safety card, a pet on a running diet
// trial past day 7 with one off-diet feeding and one refused bowl, a refusing-trial pet,
// a second pet with no trial, a long day, a grazer's day, a brand-new pet. Nyx's own
// record cannot be any of those on demand, and every test row the pass logs there would
// land in the record the PM takes to Nyx's appointments (MFU-10). So the pass runs on a
// dedicated plus-alias account (lib/deviceFixture.ts), seeded from this module.
//
// THREE consumers import this ONE module, so what the seed WRITES and what the tests
// PROVE cannot drift (the demo story's discipline, scripts/demo/demoStory.ts):
//   • scripts/fixture/emitFixtureSql.ts                       — renders it to SQL
//   • supabase/functions/generate-signal/fixtureStory.detection.test.ts
//                                                             — each pet's declared lead,
//                                                               from the REAL engine (Deno)
//   • scripts/fixture/fixtureStory.test.ts                    — the SQL's shape, the trial
//                                                               facts, the Noticed seed's
//                                                               vomit days (jest)
//
// Each pet DECLARES its lead (`declaredLead`). The Deno test runs the shipped
// pipeline over the pet's rows under every Signal engine key and fails if the lead
// differs, so a change to the engine that would leave the PM judging the wrong card
// reds CI rather than wasting a sitting. The morning of the pass, the runbook's
// read of `ai_signals` checks the same declaration against what the server computed.
//
// WHAT IT NEVER WRITES. No `event_ai_analysis` row (an AI read lands only through a
// real analyze call, on the device), no look (looks go through `insertLook` on the dev
// client, `__seedNoticed`, because the day key is the client's), no medication (a dose
// is a step the PM performs), and no row for any pet outside the four below.
//
// TIMELESS AND UTC-ANCHORED, exactly like the demo story: every instant is a TimeSpec
// (a UTC day-offset + time of day), rendered `now()`-relative in SQL and
// `materializeInstant` in the tests. Intake-decline buckets by UTC date, so the
// refusing pet's low days are UTC-anchored and clamped to now − 5 min.

import { uuidV5 } from '../demo/uuidv5.ts';
import type { TimeSpec, IntakeRatingValue, OccurredAtConfidenceValue, FoodType } from '../demo/demoStory.ts';

export type { TimeSpec };

// ── Row types (self-contained, not the engine's — each consumer adapts) ──────

export type FixtureSpecies = 'dog' | 'cat';
export type FixtureEventType =
  | 'meal'
  | 'vomit'
  | 'diarrhea'
  | 'stool_normal'
  | 'itch'
  | 'other'
  | 'weight_check';

export interface FixtureFood {
  id: string;
  brand: string;
  productName: string;
  format: string;
  foodType: FoodType;
  primaryProtein: string;
  proteins: string[];
  isNovelProtein: boolean;
  label: string;
}

export interface FixtureMeal {
  mealId: string;
  food: FixtureFood;
  intakeRating: IntakeRatingValue | null;
}

export interface FixtureEvent {
  eventId: string;
  slotKey: string;
  type: FixtureEventType;
  time: TimeSpec;
  confidence: OccurredAtConfidenceValue;
  meal?: FixtureMeal;
  weight?: { weightCheckId: string; weightKg: number };
}

export interface FixtureTrial {
  id: string;
  startedDayOffset: number;
  transitionStartedDayOffset: number;
  targetDurationDays: number;
  foodLabel: string;
  targetProtein: string;
  food: FixtureFood;
  allowedFoodRowId: string;
}

/**
 * What a pet's Signal must lead with. `type` is the leading finding's `type` and
 * `priorityClass` its class; `none` means the engine returns nothing for the pet
 * (the brand-new pet). The detection test asserts the first ranked finding against
 * this, and that a `benign` pet carries no safety finding anywhere in its set.
 */
export type DeclaredLead =
  | { kind: 'safety'; type: string }
  | { kind: 'benign'; type: string }
  | { kind: 'none' }; // the quiet Home: the Signal's designed building state, no card

export interface FixturePet {
  key: 'juniper' | 'miso' | 'pepper' | 'fig';
  id: string;
  name: string;
  species: FixtureSpecies;
  breed: string;
  weightKg: number | null;
  /** What the sitting uses this pet for — copied into the runbook and the SQL header. */
  role: string;
  declaredLead: DeclaredLead;
  foods: FixtureFood[];
  trial: FixtureTrial | null;
  events: FixtureEvent[];
}

export interface FixtureStory {
  userId: string;
  timezone: string;
  pets: FixturePet[];
}

export interface FixtureStoryParams {
  userId: string;
  timezone: string;
}

// ── Shared shape ─────────────────────────────────────────────────────────────

/**
 * The days the Noticed seed (`__seedNoticed`, lib/lookDevSeed.ts `buildLookSeed`)
 * puts a vomit on, for the pet it targets (Pepper). They are written ON THE DEVICE, not
 * by this seed, but they are part of Pepper's record on the morning of the pass, so the
 * detection test includes them in Pepper's rows. `fixtureStory.test.ts` asserts this
 * list equals the vomit days `buildLookSeed` declares, so the two cannot drift.
 */
export const NOTICED_SEED_VOMIT_DAYS: readonly number[] = [4, 8, 14];

/** The pet `__seedNoticed` is run against — the one whose lead accounts for its vomits. */
export const NOTICED_SEED_PET_KEY = 'pepper' as const;

const MEAL_AM = { hour: 8, minute: 0 };
const MEAL_PM = { hour: 18, minute: 0 };

function idFor(userId: string, slot: string): string {
  return uuidV5(slot, userId);
}

function food(
  userId: string,
  key: string,
  f: Omit<FixtureFood, 'id' | 'label'>,
): FixtureFood {
  return { ...f, id: idFor(userId, `food:${key}`), label: `${f.brand} ${f.productName}` };
}

interface Builder {
  events: FixtureEvent[];
  meal(day: number, t: { hour: number; minute: number }, f: FixtureFood, rating: IntakeRatingValue | null, tag?: string, clampToNow?: boolean): void;
  simple(type: Exclude<FixtureEventType, 'meal' | 'weight_check'>, day: number, t: { hour: number; minute: number }, confidence?: OccurredAtConfidenceValue, tag?: string): void;
  weight(day: number, kg: number): void;
}

function builder(userId: string, petKey: string): Builder {
  const events: FixtureEvent[] = [];
  const slotted = (slot: string) => {
    if (events.some((e) => e.slotKey === slot)) throw new Error(`fixtureStory: duplicate slot ${slot}`);
    return slot;
  };
  return {
    events,
    meal(day, t, f, rating, tag = '', clampToNow = false) {
      const slot = slotted(`${petKey}:meal:d${day}:${t.hour}${String(t.minute).padStart(2, '0')}${tag}`);
      events.push({
        eventId: idFor(userId, `event:${slot}`),
        slotKey: slot,
        type: 'meal',
        time: { dayOffset: day, ...t, clampToNow },
        confidence: 'witnessed',
        meal: { mealId: idFor(userId, `meal:${slot}`), food: f, intakeRating: rating },
      });
    },
    simple(type, day, t, confidence = 'witnessed', tag = '') {
      const slot = slotted(`${petKey}:${type}:d${day}:${t.hour}${String(t.minute).padStart(2, '0')}${tag}`);
      events.push({
        eventId: idFor(userId, `event:${slot}`),
        slotKey: slot,
        type,
        // Today's rows clamp to now − 5 min so a morning seed never writes a future row
        // (BRK-48's defect, in the server seed's terms).
        time: { dayOffset: day, ...t, clampToNow: day === 0 },
        confidence,
      });
    },
    weight(day, kg) {
      const slot = slotted(`${petKey}:weight:d${day}`);
      events.push({
        eventId: idFor(userId, `event:${slot}`),
        slotKey: slot,
        type: 'weight_check',
        time: { dayOffset: day, hour: 12, minute: 0 },
        confidence: 'witnessed',
        weight: { weightCheckId: idFor(userId, `weight:${slot}`), weightKg: kg },
      });
    },
  };
}

// ── Juniper — the trial pet, the benign lead ─────────────────────────────────
//
// A dog on a venison elimination trial, Day 22 of 56, sent home for vomiting. Before
// the trial she vomited about twice a week on the old chicken food; on the trial it has
// all but stopped. One off-diet feeding (a chicken jerky treat, day −6) and one refused
// bowl (day −3, evening) are staged for the trial screen's ledger and Home's row. Her
// Signal leads with a benign insight, which is what lets the PM see Design v2's chart
// card at all (MFU-1: Nyx's own record leads with a safety card).

const JUNIPER_TRIAL_START = -21;
const JUNIPER_TRANSITION = -28;
const JUNIPER_PRE_TRIAL_FIRST_DAY = -56;
const JUNIPER_PRE_TRIAL_VOMITS = [-55, -51, -48, -44, -41, -37, -34, -30, -27, -24];
const JUNIPER_TRIAL_VOMITS = [-16];
const JUNIPER_OFF_DIET_DAY = -6;
const JUNIPER_REFUSED_DAY = -3;

function buildJuniper(userId: string): FixturePet {
  const key = 'juniper';
  const petId = idFor(userId, `pet:${key}`);
  const oldFood = food(userId, 'pantry-chicken', {
    brand: 'Pantry',
    productName: 'Classic Chicken & Rice',
    format: 'dry_kibble',
    foodType: 'meal',
    primaryProtein: 'chicken',
    proteins: ['chicken'],
    isNovelProtein: false,
  });
  const venison = food(userId, 'fieldstone-venison', {
    brand: 'Fieldstone',
    productName: 'Venison & Potato',
    format: 'dry_kibble',
    foodType: 'meal',
    primaryProtein: 'venison',
    proteins: ['venison'],
    isNovelProtein: true,
  });
  const jerky = food(userId, 'backyard-chicken-jerky', {
    brand: 'Backyard',
    productName: 'Chicken Jerky',
    format: 'treat',
    foodType: 'treat',
    primaryProtein: 'chicken',
    proteins: ['chicken'],
    isNovelProtein: false,
  });

  const b = builder(userId, key);
  for (let d = JUNIPER_PRE_TRIAL_FIRST_DAY; d <= 0; d++) {
    // The old food until the transition, venison from then on (the transition week
    // is fed venison too; the trial's exclusive window opens at the start date).
    const f = d < JUNIPER_TRANSITION ? oldFood : venison;
    const pmRating: IntakeRatingValue = d === JUNIPER_REFUSED_DAY ? 'refused' : 'all';
    b.meal(d, MEAL_AM, f, 'all', '', d === 0);
    // Today's evening meal is not seeded: the PM logs today's meals on the device.
    if (d < 0) b.meal(d, MEAL_PM, f, pmRating);
  }
  b.meal(JUNIPER_OFF_DIET_DAY, { hour: 15, minute: 30 }, jerky, null, ':off-diet');
  for (const d of [...JUNIPER_PRE_TRIAL_VOMITS, ...JUNIPER_TRIAL_VOMITS]) {
    b.simple('vomit', d, { hour: 21, minute: 15 }, d % 2 === 0 ? 'witnessed' : 'estimated');
  }
  for (const d of [-49, -35, -21, -14, -7, -1]) b.simple('stool_normal', d, { hour: 7, minute: 40 });
  b.weight(-42, 24.6);
  b.weight(-14, 24.9);

  return {
    key,
    id: petId,
    name: 'Juniper',
    species: 'dog',
    breed: 'Border collie mix',
    weightKg: 24.9,
    role: 'Diet trial past day 7, one off-diet feeding (day −6), one refused bowl (day −3). Benign insight lead: the chart card.',
    declaredLead: { kind: 'benign', type: 'timeofday_clustering' },
    foods: [oldFood, venison, jerky],
    trial: {
      id: idFor(userId, `trial:${key}`),
      startedDayOffset: JUNIPER_TRIAL_START,
      transitionStartedDayOffset: JUNIPER_TRANSITION,
      targetDurationDays: 56,
      foodLabel: 'Venison & Potato',
      targetProtein: 'venison',
      food: venison,
      allowedFoodRowId: idFor(userId, `trial-food:${key}`),
    },
    events: b.events,
  };
}

// ── Miso — the refusing-trial pet, the safety lead ───────────────────────────
//
// A cat on a rabbit trial, Day 13 of 56. She ate the rabbit for its first few days, and
// for the last eight she has picked at breakfast and refused dinner: intake-decline leads
// Home (a cat not eating is the fastest-killing contextual emergency) and the trial
// screen's refusal fact fires (more than half her bowls in its window not finished). Her vomiting FELL week over week
// (three last week, one this week), which is CUL-1529 step 32's case: Home must not
// print a "down from" card for a pet that is not eating.

const MISO_TRIAL_START = -12;
const MISO_TRANSITION = -16;
const MISO_FIRST_DAY = -30;
/** The last eight days: a refusal the trial screen's viability fact reads as one (more than
 *  half the rated bowls in its 14-day window not finished), not a single bad dinner. */
const MISO_LOW_DAYS = [-7, -6, -5, -4, -3, -2, -1, 0];
const MISO_VOMITS = [-12, -10, -9, -3];

function buildMiso(userId: string): FixturePet {
  const key = 'miso';
  const petId = idFor(userId, `pet:${key}`);
  const oldFood = food(userId, 'harbor-salmon', {
    brand: 'Harbor',
    productName: 'Salmon Pâté',
    format: 'wet_canned',
    foodType: 'meal',
    primaryProtein: 'salmon',
    proteins: ['salmon'],
    isNovelProtein: false,
  });
  const rabbit = food(userId, 'fieldstone-rabbit', {
    brand: 'Fieldstone',
    productName: 'Rabbit Feline',
    format: 'wet_canned',
    foodType: 'meal',
    primaryProtein: 'rabbit',
    proteins: ['rabbit'],
    isNovelProtein: true,
  });

  const b = builder(userId, key);
  for (let d = MISO_FIRST_DAY; d <= 0; d++) {
    const f = d < MISO_TRANSITION ? oldFood : rabbit;
    const low = MISO_LOW_DAYS.includes(d);
    b.meal(d, { hour: 7, minute: 0 }, f, low ? 'picked' : 'all', '', d === 0);
    if (d < 0) b.meal(d, { hour: 17, minute: 30 }, f, low ? 'refused' : 'all');
  }
  for (const d of MISO_VOMITS) b.simple('vomit', d, { hour: 6, minute: 20 }, 'estimated');
  b.weight(-28, 4.3);
  b.weight(-7, 4.2);

  return {
    key,
    id: petId,
    name: 'Miso',
    species: 'cat',
    breed: 'Domestic shorthair',
    weightKg: 4.2,
    role: 'Refusing trial: picked at breakfast and refused dinner for eight days; vomiting fell week over week. Safety lead.',
    declaredLead: { kind: 'safety', type: 'intake_decline' },
    foods: [oldFood, rabbit],
    trial: {
      id: idFor(userId, `trial:${key}`),
      startedDayOffset: MISO_TRIAL_START,
      transitionStartedDayOffset: MISO_TRANSITION,
      targetDurationDays: 56,
      foodLabel: 'Rabbit Feline',
      targetProtein: 'rabbit',
      food: rabbit,
      allowedFoodRowId: idFor(userId, `trial-food:${key}`),
    },
    events: b.events,
  };
}

// ── Pepper — no trial; the long day, the grazer's day, the Noticed pet ───────
//
// A dog with no trial, the second pet for CUL-1529 step 45. Yesterday is the long
// record (21 rows on one day, step 5); day −6 is the grazer's day (ten bowls, two
// refused, two picked at, one some — step 28's rows; its *Worth a call* row is a live
// photo read the PM logs, never seeded). `__seedNoticed` runs against Pepper, so its
// three vomits are part of his record; his lead accounts for them.

const PEPPER_FIRST_DAY = -42;
const PEPPER_LONG_DAY = -1;
const PEPPER_GRAZER_DAY = -6;

function buildPepper(userId: string): FixturePet {
  const key = 'pepper';
  const petId = idFor(userId, `pet:${key}`);
  const kibble = food(userId, 'pantry-lamb', {
    brand: 'Pantry',
    productName: 'Lamb & Brown Rice',
    format: 'dry_kibble',
    foodType: 'meal',
    primaryProtein: 'lamb',
    proteins: ['lamb'],
    isNovelProtein: false,
  });
  const topper = food(userId, 'harbor-turkey-topper', {
    brand: 'Harbor',
    productName: 'Turkey Topper',
    format: 'wet_canned',
    foodType: 'meal',
    primaryProtein: 'turkey',
    proteins: ['turkey'],
    isNovelProtein: false,
  });
  const biscuit = food(userId, 'backyard-peanut-biscuit', {
    brand: 'Backyard',
    productName: 'Peanut Butter Biscuit',
    format: 'treat',
    foodType: 'treat',
    primaryProtein: 'peanut',
    proteins: ['peanut'],
    isNovelProtein: false,
  });

  const b = builder(userId, key);
  for (let d = PEPPER_FIRST_DAY; d <= 0; d++) {
    if (d === PEPPER_GRAZER_DAY) continue; // the grazer's day writes its own bowls
    b.meal(d, MEAL_AM, kibble, 'all', '', d === 0);
    if (d < 0) b.meal(d, MEAL_PM, kibble, 'all');
  }

  // The grazer's day: ten small bowls through the day, step 28's mix.
  const grazerRatings: IntakeRatingValue[] = ['all', 'refused', 'all', 'picked', 'most', 'some', 'refused', 'all', 'picked', 'all'];
  grazerRatings.forEach((r, i) => {
    b.meal(PEPPER_GRAZER_DAY, { hour: 7 + i, minute: 10 }, i % 3 === 0 ? topper : kibble, r);
  });

  // The long day: the two bowls above plus 19 more rows, 21 in all.
  const LONG = PEPPER_LONG_DAY;
  b.meal(LONG, { hour: 12, minute: 30 }, topper, 'all');
  for (const [h, m] of [[9, 15], [10, 40], [13, 5], [14, 50], [16, 20], [19, 45], [21, 10]] as const) {
    b.meal(LONG, { hour: h, minute: m }, biscuit, null, ':treat');
  }
  for (const [h, m] of [[7, 30], [11, 55], [15, 35], [20, 25]] as const) {
    b.simple('stool_normal', LONG, { hour: h, minute: m });
  }
  // 'other', never a symptom: three itches yesterday against none the week before is a
  // week that rose, and the engine rightly leads with it — not the quiet Home this pet is for.
  for (const [h, m] of [[10, 5], [14, 15], [17, 40], [22, 0], [23, 10]] as const) {
    b.simple('other', LONG, { hour: h, minute: m });
  }
  b.weight(LONG, 18.2);

  for (const d of [-40, -33, -26, -19, -12, -5]) b.simple('stool_normal', d, { hour: 7, minute: 30 });
  b.weight(-30, 18.4);

  return {
    key,
    id: petId,
    name: 'Pepper',
    species: 'dog',
    breed: 'Beagle',
    weightKg: 18.2,
    role: 'No trial, no Signal card (the quiet Home). Yesterday is the long record (21 rows); day −6 is the grazer\'s day; `__seedNoticed` runs here.',
    declaredLead: { kind: 'none' },
    foods: [kibble, topper, biscuit],
    trial: null,
    events: b.events,
  };
}

// ── Fig — the brand-new pet ──────────────────────────────────────────────────

function buildFig(userId: string): FixturePet {
  return {
    key: 'fig',
    id: idFor(userId, 'pet:fig'),
    name: 'Fig',
    species: 'cat',
    breed: 'Domestic longhair',
    weightKg: null,
    role: 'Brand new: nothing logged. Every designed empty state.',
    declaredLead: { kind: 'none' },
    foods: [],
    trial: null,
    events: [],
  };
}

/** The whole fixture account, for one (userId, timezone). Deterministic ids (uuidV5). */
export function buildFixtureStory(params: FixtureStoryParams): FixtureStory {
  const { userId, timezone } = params;
  return {
    userId,
    timezone,
    pets: [buildJuniper(userId), buildMiso(userId), buildPepper(userId), buildFig(userId)],
  };
}

/** Day N of a trial on day-offset `today` (day 1 = the start date, B-421). */
export function trialDayNumber(trial: FixtureTrial, todayOffset = 0): number {
  return todayOffset - trial.startedDayOffset + 1;
}
