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
// sides of every span edge, so the agreement covers the edges, not only the middle. Rows carry
// the toggle-off instant (`ended_at`, migration 076) or, like a pre-076 end, do not.

jest.mock('./db', () => ({ getDb: jest.fn() }));
jest.mock('./feedingArrangements', () => ({ getActiveArrangementsForPet: jest.fn() }));

import { detectIntakeDecline as phoneDetect } from './analytics';
import type { AnalyticsMeal, IntakeDeclineFlag } from './analytics';
import { detectIntakeDecline as serverDetect } from '../supabase/functions/generate-signal/detection';
import { parseFreeFedIntakeSpans, type FreeFedIntakeArrangement } from './freeFedIntake';
import { localDayIndex } from './utils';
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
  /** The owner's IANA zone, handed to BOTH detectors (CUL-94: every per-day rule is local). */
  zone: string;
}

// CUL-94 — the zones the two detectors' day boundary is checked in: the extremes, the US
// evening (where UTC midnight lands at dinner), a half-hour and a quarter-hour offset, a
// half-hour DST shift, and UTC itself. Both sides get the same valid zone; the server's
// no-zone fallback (UTC) has its own test in detection.test.ts.
const ZONES = [
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
  'Pacific/Honolulu',
  'Pacific/Kiritimati',
  'Asia/Kathmandu',
  'Australia/Lord_Howe',
] as const;

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
        // Migration 076: a current build writes the toggle-off instant; a pre-076 end has none.
        endedAt: endMs === null || r() < 0.2 ? null : new Date(endMs).toISOString(),
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
  // The zone is drawn LAST so every earlier draw, and so every pre-CUL-94 record, is unchanged.
  const species: Species = r() < 0.5 ? 'cat' : 'dog';
  return { species, nowMs, bowls, meals, zone: pick(ZONES) };
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
  const res = phoneDetect({
    species: rec.species,
    nowMs: rec.nowMs,
    meals,
    freeFedSpans: parseFreeFedIntakeSpans(rec.bowls),
    timeZone: rec.zone,
  });
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
          endedAt: b.endedAt,
        }))
      : [],
    now: new Date(rec.nowMs).toISOString(),
    timezone: rec.zone,
  }).map(verdictOf);
}

// `trigger` is the server's wider union: I5's `refused_then_vomited` (PR-30s) is server-only and
// never fires here (the server runs DEFAULT_CONFIG, which carries no `en5`), so equality still
// means the phone and the server reached the same verdict.
type Verdict = Pick<
  IntakeDeclineFlag,
  'baselineScore' | 'recentScore' | 'daysBelowBaseline' | 'refusedFoodLabel' | 'ratedMealsConsidered'
> & { trigger: IntakeDeclineFinding['trigger'] };

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
    let zoneDecided = 0;
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
      if (JSON.stringify(serverVerdict({ ...rec, zone: 'UTC' }, true)) !== JSON.stringify(server)) zoneDecided++;
    }
    // Non-vacuity. Measured at authoring (by instant, zones, toggles, pre-076 ends): 352 records
    // fired, and on 228 the bowls changed the server's answer (of 4000). The floors sit under those so a harmless generator
    // tweak does not red the suite, and far above zero so a generator that stops reaching the
    // filter does.
    expect(fired).toBeGreaterThan(150);
    expect(filterDecided).toBeGreaterThan(150);
    // CUL-94: and enough records where the owner's day, not UTC's, decides the verdict, so the
    // agreement is measured where the calendar matters. Measured at CUL-94: 578 fired, the bowls
    // decided 434 and the zone 304. Fired rose from 352 mostly because a low day now holds its
    // card until the next day's first rated meal (ruling (a) on CUL-94).
    expect(zoneDecided).toBeGreaterThan(100);
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
    const bowl = { foodItemId: 'f2', createdAt: '2026-06-01T00:00:00.000Z', activeFrom: '2026-06-01', activeUntil: null, endedAt: null };
    const rec: Rec = { species: 'cat', nowMs: BASE_NOW + 20 * MS_PER_HOUR, bowls: [bowl], meals, zone: 'UTC' };

    expect(serverVerdict(rec, false)).toEqual([]); // the defect: the server stayed quiet
    const phone = phoneVerdict(rec);
    expect(phone.map((v) => v.trigger)).toEqual(['consecutive_low']);
    expect(serverVerdict(rec, true)).toEqual(phone);
  });
});

const RECORDS_FOR_PROPERTY = 8000;
// Measured at CUL-94: 619 of 8000 records fire and carry a buffer-day meal to append after.
const PROPERTY_FLOOR = 300;

describe('CUL-94 property: an evening refusal on the buffer day never quiets the day-count card', () => {
  // Both adversarial passes broke the same shape: the day before the judged days holds the
  // onset (a good morning, then refusals), and a reading of that day that takes the refusals in
  // whole or leaves the morning out lets ONE more refusal silence a card. The detectors read the
  // day at every cut, so appending a refusal after the day's last meal leaves every earlier
  // reading intact and can never remove the card. Driven over the generator, both detectors.
  it('holds on every generated record that fires, in every zone', () => {
    let checked = 0;
    for (let seed = 1; seed <= RECORDS_FOR_PROPERTY; seed++) {
      const rec = generate(seed);
      const before = serverVerdict(rec, true);
      if (!before.some((v) => v.trigger === 'consecutive_low')) continue;
      // The buffer day as the detector defines it (anchor today if today has a rated meal).
      const dayOf = (ms: number) => localDayIndex(ms, rec.zone);
      const today = dayOf(rec.nowMs);
      const rated = rec.meals.filter((m) => m.foodType === 'meal' && m.rating !== null && m.ms <= rec.nowMs);
      const anchor = rated.some((m) => dayOf(m.ms) === today) ? today : today - 1;
      const n = rec.species === 'cat' ? 1 : 2;
      const buffer = anchor - n;
      const onBuffer = rated.filter((m) => dayOf(m.ms) === buffer);
      if (onBuffer.length === 0) continue;
      const t = Math.max(...onBuffer.map((m) => m.ms)) + 60_000;
      if (dayOf(t) !== buffer) continue;
      const after = { ...rec, meals: [...rec.meals, { ms: t, foodItemId: 'f1', foodType: 'meal', rating: 'refused' as const }] };
      const phone = phoneVerdict(after);
      expect(serverVerdict(after, true)).toEqual(phone);
      expect({ seed, triggers: phone.map((v) => v.trigger) }).toEqual({ seed, triggers: expect.arrayContaining(['consecutive_low']) });
      checked++;
    }
    // Non-vacuity (C-36). Reverting to whole-day readings of the buffer reds this test (measured).
    expect(checked).toBeGreaterThan(PROPERTY_FLOOR);
  });
});
