// CUL-1086 — the phone's and the server's intake-decline detectors agree over the same meals.
//
// Both headers claimed "the two surfaces can never disagree", and the DECLINE constants were a
// byte-exact mirror, but the INPUT set was not: the phone (`lib/analytics.ts`) dropped every
// rated meal of a currently free-fed food (§11 #6) and `generate-signal/detection.ts` kept them.
// A free-fed bowl rated "ate it all" could hold a real drop off Home while the phone saw it.
//
// This drives the two REAL detectors (no re-derived rule, C-34) over generated records and
// requires the same verdict: the same triggers, scores, day counts, refused food and sample
// size, or silence on both. Two floors keep it honest (C-36): enough records fire at all, and
// enough of them are records where the free-fed filter CHANGES the server's answer, so the
// agreement is measured where the defect lived rather than over records it could not reach.
//
// BY DATE (PM ruling 2026-09-28): the generator writes bowls as arrangement ROWS — a creation
// instant, an optional end DATE, some ended, some opened mid-record — and each side parses them
// its own production way: the phone through `parseFreeFedIntakeSpans` (what its read wrapper
// does), the server from `FeedingArrangement`s (what its callers hand it). Ratings land on both
// sides of every span edge, so the agreement covers the edges, not only the middle.

jest.mock('./db', () => ({ getDb: jest.fn() }));
jest.mock('./feedingArrangements', () => ({ getActiveArrangementsForPet: jest.fn() }));

import { detectIntakeDecline as phoneDetect } from './analytics';
import type { AnalyticsMeal, IntakeDeclineFlag } from './analytics';
import { detectIntakeDecline as serverDetect } from '../supabase/functions/generate-signal/detection';
import { parseFreeFedIntakeSpans, type FreeFedIntakeArrangement } from './freeFedIntake';
import type {
  FeedingArrangement,
  IntakeDeclineFinding,
  IntakeRating,
  MealEvent,
  Species,
} from '../supabase/functions/generate-signal/detection';

const MS_PER_HOUR = 3_600_000;
const BASE_NOW = Date.parse('2026-07-10T00:00:00.000Z');
const FOODS = ['f1', 'f2', 'f3', 'f4'] as const;
const RATINGS: (IntakeRating | null)[] = ['all', 'most', 'some', 'picked', 'refused', null];

/** mulberry32 — a seeded generator, so a failure names a reproducible record. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Rec {
  species: Species;
  nowMs: number;
  bowls: (FreeFedIntakeArrangement & { foodItemId: string })[];
  meals: { ms: number; foodItemId: string | null; foodType: string | null; rating: IntakeRating | null }[];
}

function generate(seed: number): Rec {
  const r = rng(seed);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
  const nowMs = BASE_NOW + Math.floor(r() * 24) * MS_PER_HOUR;
  // Bowls as the phone writes them: `created_at` an instant, the two DATEs the owner's LOCAL
  // day (a zone from UTC−12 to UTC+14 per record, round 2's point). Some rows have no
  // `created_at` (the fallback), some are toggled off and on again (two rows, one food), and
  // half are taken up. Ratings land on both sides of every edge.
  const offsetMs = (Math.floor(r() * 27) - 12) * MS_PER_HOUR;
  const localDay = (ms: number) => new Date(ms + offsetMs).toISOString().slice(0, 10);
  const bowls: Rec['bowls'] = [];
  for (const f of FOODS) {
    if (r() >= 0.4) continue;
    let createdMs = nowMs - Math.floor(r() * 20 * 24) * MS_PER_HOUR - Math.floor(r() * 60) * 60_000;
    const rows = r() < 0.25 ? 2 : 1;
    for (let k = 0; k < rows && createdMs <= nowMs; k++) {
      const last = k === rows - 1;
      const endMs = last && r() < 0.5 ? null : createdMs + Math.floor(r() * 6 * 24) * MS_PER_HOUR;
      bowls.push({
        foodItemId: f,
        createdAt: r() < 0.15 ? null : new Date(createdMs).toISOString(),
        activeFrom: localDay(createdMs),
        activeUntil: endMs === null ? null : localDay(endMs),
      });
      if (endMs === null) break;
      createdMs = endMs + Math.floor(r() * 36) * MS_PER_HOUR;
    }
  }
  // Each food gets a "usual" rating and a "lately" rating, so records split between steady
  // eaters and real drops — a uniform rating would almost never clear the decline triggers.
  const usual = new Map(FOODS.map((f) => [f, r() < 0.75 ? 'all' : pick(RATINGS)] as const));
  const lately = new Map(FOODS.map((f) => [f, r() < 0.5 ? usual.get(f)! : pick(RATINGS)] as const));
  const meals: Rec['meals'] = [];
  const n = Math.floor(r() * 40);
  for (let i = 0; i < n; i++) {
    const ageH = Math.floor(r() * 18 * 24);
    const foodItemId = r() < 0.1 ? null : pick(FOODS);
    const recent = ageH < 48;
    const base = foodItemId === null ? pick(RATINGS) : (recent ? lately : usual).get(foodItemId)!;
    meals.push({
      ms: nowMs - ageH * MS_PER_HOUR,
      foodItemId,
      foodType: r() < 0.85 ? 'meal' : pick(['treat', 'other', null] as const),
      rating: r() < 0.15 ? pick(RATINGS) : base,
    });
  }
  return { species: r() < 0.5 ? 'cat' : 'dog', nowMs, bowls, meals };
}

const labelOf = (id: string | null): string | null => (id === null ? null : `Food ${id}`);

function phoneVerdict(rec: Rec): Verdict[] {
  const meals: AnalyticsMeal[] = rec.meals.map((m) => ({
    ms: m.ms,
    foodItemId: m.foodItemId,
    foodLabel: labelOf(m.foodItemId),
    foodType: m.foodType,
    primaryProtein: null,
    intakeRating: m.rating,
  }));
  const res = phoneDetect({ species: rec.species, nowMs: rec.nowMs, meals, freeFedSpans: parseFreeFedIntakeSpans(rec.bowls) });
  return res.status === 'watch' ? res.flags.map(verdictOf) : [];
}

function serverVerdict(rec: Rec, withBowls: boolean): Verdict[] {
  const mealEvents: MealEvent[] = rec.meals.map((m, i) => ({
    id: `m${i}`,
    occurredAt: new Date(m.ms).toISOString(),
    foodItemId: m.foodItemId,
    primaryProtein: null,
    intakeRating: m.rating,
    foodType: m.foodType as MealEvent['foodType'],
    foodLabel: labelOf(m.foodItemId),
  }));
  return serverDetect({
    pet: { name: 'Pet', species: rec.species, dietTrialActive: false },
    symptomEvents: [],
    mealEvents,
    feedingArrangements: withBowls
      ? rec.bowls.map((b, i): FeedingArrangement => ({
          id: `a${i}`,
          primaryProtein: null,
          activeFrom: b.activeFrom,
          activeUntil: b.activeUntil,
          foodItemId: b.foodItemId,
          createdAt: b.createdAt,
        }))
      : [],
    now: new Date(rec.nowMs).toISOString(),
  }).map(verdictOf);
}

type Verdict = Pick<
  IntakeDeclineFlag,
  'trigger' | 'baselineScore' | 'recentScore' | 'daysBelowBaseline' | 'refusedFoodLabel' | 'ratedMealsConsidered'
>;

function verdictOf(f: IntakeDeclineFlag | IntakeDeclineFinding): Verdict {
  return {
    trigger: f.trigger,
    baselineScore: f.baselineScore,
    recentScore: f.recentScore,
    daysBelowBaseline: f.daysBelowBaseline,
    refusedFoodLabel: f.refusedFoodLabel,
    ratedMealsConsidered: f.ratedMealsConsidered,
  };
}

describe('intake-decline parity: phone and server over the same meals (CUL-1086)', () => {
  const RECORDS = 4000;

  it('reach the same verdict on every generated record, free-fed foods included', () => {
    let fired = 0;
    let filterDecided = 0;
    for (let seed = 1; seed <= RECORDS; seed++) {
      const rec = generate(seed);
      const phone = phoneVerdict(rec);
      const server = serverVerdict(rec, true);
      if (JSON.stringify(server) !== JSON.stringify(phone)) {
        throw new Error(
          `seed ${seed} disagrees\nphone:  ${JSON.stringify(phone)}\nserver: ${JSON.stringify(server)}`,
        );
      }
      if (phone.length > 0) fired++;
      if (JSON.stringify(serverVerdict(rec, false)) !== JSON.stringify(server)) filterDecided++;
    }
    // Non-vacuity. Measured at authoring (by date, zones and toggles): 357 records fired, and
    // on 260 the bowls changed the server's answer (of 4000). The floors sit under those so a harmless generator
    // tweak does not red the suite, and far above zero so a generator that stops reaching the
    // filter does.
    expect(fired).toBeGreaterThan(150);
    expect(filterDecided).toBeGreaterThan(150);
  });

  it('both surfaces free the masked drop: the free-fed "ate it all" bowl no longer hides it', () => {
    // The issue's own example, on both real detectors. A cat's watched wet food drops to
    // "picked" today while the free-fed kibble is rated "all" all along.
    const day = 24 * MS_PER_HOUR;
    const meals: Rec['meals'] = [];
    for (let d = 9; d >= 1; d--) {
      meals.push({ ms: BASE_NOW - d * day + 8 * MS_PER_HOUR, foodItemId: 'f1', foodType: 'meal', rating: 'all' });
      meals.push({ ms: BASE_NOW - d * day + 12 * MS_PER_HOUR, foodItemId: 'f2', foodType: 'meal', rating: 'all' });
    }
    meals.push({ ms: BASE_NOW + 8 * MS_PER_HOUR, foodItemId: 'f1', foodType: 'meal', rating: 'picked' });
    meals.push({ ms: BASE_NOW + 12 * MS_PER_HOUR, foodItemId: 'f2', foodType: 'meal', rating: 'all' });
    const bowl = { foodItemId: 'f2', createdAt: '2026-06-01T00:00:00.000Z', activeFrom: '2026-06-01', activeUntil: null };
    const rec: Rec = { species: 'cat', nowMs: BASE_NOW + 20 * MS_PER_HOUR, bowls: [bowl], meals };

    expect(serverVerdict(rec, false)).toEqual([]); // the defect: the server stayed quiet
    const phone = phoneVerdict(rec);
    expect(phone.map((v) => v.trigger)).toEqual(['consecutive_low']);
    expect(serverVerdict(rec, true)).toEqual(phone);
  });
});
