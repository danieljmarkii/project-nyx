// The app's one bowl read (Mixed meals row 4, CUL-2053; spec §3, §4, §5.2, §10 "Clinical
// readers"), against a REAL database built from the app's own schema constants (C-35), and
// held to the server's read of the same bowl.
//
// Pinned here: a plain meal never comes back as a bowl; a mix comes back with each
// component's own food row; tombstones and older generations are not the bowl; a NULL
// count over two live components is a mix and a count over one live component is
// incomplete (pass 1, break 3); the phone's trial feeding for a bowl is the server's,
// field for field, so the card and the vet report give one bowl one verdict; and the
// verdict does not move when the dominant food does.

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');

interface RawDb {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number };
    all(...params: unknown[]): Record<string, unknown>[];
  };
  close(): void;
}

let mockDb: RawDb;
jest.mock('./db', () => ({
  getDb: () => ({
    getAllAsync: jest.fn(async (sql: string, params: unknown[] = []) => mockDb.prepare(sql).all(...(params as never[]))),
  }),
}));
// `dietTrialFacts` pulls `analytics → feedingArrangements → sync → supabase`; only the
// pure bowl mapping is exercised here (as `dietTrialFacts.test.ts` stubs it).
jest.mock('./feedingArrangements', () => ({
  getActiveArrangementsForPet: jest.fn().mockResolvedValue([]),
}));

import { BASE_SCHEMA_SQL, applyColumnUpgrades } from './localSchema';
import { MEDICATION_SCHEMA_SQL } from './medications';
import { DIET_TRIAL_SCHEMA_SQL } from './dietTrialMirror';
import { mintGenerationId } from './mealComposition';
import { bowlFoodType, loadMealBowls, mealBowlsQuery, type AppBowl } from './mealBowls';
import { bowlRowLabel } from './mealBowlLabel';
import { bowlDetailLine } from './mixDetail';
import { feedingOfBowl } from './dietTrialFacts';
import { buildTrialContext, classifyFeeding, type AllowedFood, type TrialSpec } from './dietTrial';
import { toTrialFeeding, type TrialMealSource } from '../supabase/functions/generate-report/trial';
import { bowlFoodType as serverBowlFoodType } from '../supabase/functions/_shared/mealBowl';

const PET = 'pet-a';
const AT = '2026-07-05T17:00:00.000Z';

function seedFood(id: string, product: string, opts: { type?: string | null; primary?: string | null; proteins?: string[] } = {}) {
  mockDb.prepare(
    `INSERT INTO food_items_cache (id, brand, product_name, format, food_type, primary_protein, proteins)
     VALUES (?, 'Brand', ?, 'wet', ?, ?, ?)`,
  ).run(id, product, opts.type === undefined ? 'meal' : opts.type, opts.primary ?? null, JSON.stringify(opts.proteins ?? []));
}
function seedMeal(eventId: string, opts: { foodId?: string | null; count?: number | null } = {}) {
  mockDb.prepare(
    `INSERT INTO events (id, pet_id, event_type, occurred_at, source, occurred_at_source, created_at, updated_at, synced)
     VALUES (?, ?, 'meal', ?, 'manual', 'manual', ?, ?, 1)`,
  ).run(eventId, PET, AT, AT, AT);
  mockDb.prepare(
    `INSERT INTO meals (id, event_id, pet_id, food_item_id, component_count, created_at, updated_at, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
  ).run(`m-${eventId}`, eventId, PET, opts.foodId === undefined ? null : opts.foodId, opts.count === undefined ? null : opts.count, AT, AT);
}
let seq = 0;
const rnd = () => ((seq = (seq * 9301 + 49297) % 233280) / 233280);
/** One generation of components, written at `ms`. */
function seedSet(eventId: string, ms: number, parts: { food: string | null; label: string; share: number }[], deletedAt: string | null = null) {
  const randA = Math.floor(rnd() * 4096);
  parts.forEach((p, position) => {
    mockDb.prepare(
      `INSERT INTO meal_components (id, pet_id, event_id, position, food_item_id, food_label, share, share_source,
         created_at, updated_at, deleted_at, synced)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'preset', ?, ?, ?, 1)`,
    ).run(mintGenerationId(ms, randA, rnd), PET, eventId, position, p.food, p.label, p.share, AT, AT, deletedAt);
  });
}

beforeEach(async () => {
  mockDb = new DatabaseSync(':memory:');
  for (const sql of [BASE_SCHEMA_SQL, MEDICATION_SCHEMA_SQL, DIET_TRIAL_SCHEMA_SQL]) mockDb.exec(sql);
  await applyColumnUpgrades(async (sql: string) => mockDb.exec(sql));
  seedFood('duck', 'Duck Dry', { primary: 'duck', proteins: [] }); // a legacy row: the primary alone names it
  seedFood('chicken', 'Chicken Pâté', { primary: 'chicken', proteins: ['chicken'] });
  seedFood('treat', 'Chews', { type: 'treat', primary: 'beef', proteins: ['beef'] });
});
afterEach(() => mockDb.close());

describe('loadMealBowls over the real schema', () => {
  it('a plain meal is not a bowl, and a mix carries each component’s own food row', async () => {
    seedMeal('plain', { foodId: 'duck' });
    seedMeal('mix', { count: 2 });
    seedSet('mix', 1_760_000_000_000, [
      { food: 'duck', label: 'Duck Dry', share: 0.667 },
      { food: 'chicken', label: 'Chicken Pâté', share: 0.333 },
    ]);
    const bowls = await loadMealBowls(['plain', 'mix', 'not-a-meal']);
    expect([...bowls.keys()]).toEqual(['mix']);
    const b = bowls.get('mix')!;
    expect(b.status).toBe('mix');
    expect(b.consistent).toBe(true);
    expect(b.components.map((c) => [c.foodItemId, c.food?.productName, c.food?.primaryProtein])).toEqual([
      ['duck', 'Duck Dry', 'duck'],
      ['chicken', 'Chicken Pâté', 'chicken'],
    ]);
    expect(b.compositionKey).toBe('id:chicken+id:duck');
  });

  it('the newest generation is the bowl; tombstones and an older set are not', async () => {
    seedMeal('mix', { count: 2 });
    seedSet('mix', 1_760_000_000_000, [
      { food: 'duck', label: 'Duck Dry', share: 0.5 },
      { food: 'treat', label: 'Chews', share: 0.5 },
    ], AT);
    seedSet('mix', 1_760_000_001_000, [
      { food: 'duck', label: 'Duck Dry', share: 0.75 },
      { food: 'chicken', label: 'Chicken Pâté', share: 0.25 },
    ]);
    const b = (await loadMealBowls(['mix'])).get('mix')!;
    expect(b.components.map((c) => c.foodItemId)).toEqual(['duck', 'chicken']);
  });

  it('a NULL count over two live components is a mix; a count over one live component is incomplete', async () => {
    seedMeal('raced', { count: null, foodId: null });
    seedSet('raced', 1_760_000_000_000, [
      { food: 'duck', label: 'Duck Dry', share: 0.5 },
      { food: 'chicken', label: 'Chicken Pâté', share: 0.5 },
    ]);
    seedMeal('partial', { count: 2 });
    seedSet('partial', 1_760_000_000_000, [{ food: 'chicken', label: 'Chicken Pâté', share: 0.5 }]);
    seedMeal('count-only', { count: 2 });
    const bowls = await loadMealBowls(['raced', 'partial', 'count-only']);
    expect(bowls.get('raced')!.status).toBe('mix');
    expect(bowls.get('raced')!.consistent).toBe(false);
    expect(bowls.get('partial')!.status).toBe('incomplete');
    expect(bowls.get('count-only')!.status).toBe('incomplete');
    expect(bowls.get('count-only')!.components).toEqual([]);
  });

  it('reads across the chunk boundary', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 450; i++) {
      ids.push(`e${i}`);
      seedMeal(`e${i}`, { foodId: 'duck' });
    }
    seedMeal('last', { count: 2 });
    seedSet('last', 1_760_000_000_000, [
      { food: 'duck', label: 'Duck Dry', share: 0.5 },
      { food: 'chicken', label: 'Chicken Pâté', share: 0.5 },
    ]);
    expect([...(await loadMealBowls([...ids, 'last'])).keys()]).toEqual(['last']);
  });

  it('the query string is the one the loader runs', () => {
    expect(mealBowlsQuery(2)).toMatch(/IN \(\?,\?\)$/);
  });
});

describe('bowlFoodType is the server’s rule', () => {
  it('agrees on every pair and triple of types', () => {
    const types = ['meal', 'treat', 'other', null];
    for (const a of types) for (const b of types) {
      expect(bowlFoodType([a, b])).toBe(serverBowlFoodType([a, b]));
      for (const c of types) expect(bowlFoodType([a, b, c])).toBe(serverBowlFoodType([a, b, c]));
    }
    expect(bowlFoodType([])).toBe(serverBowlFoodType([]));
  });
});

// ── Parity with the vet report ─────────────────────────────────────────────────

/** The same bowl as the report's events pull hands it to `toTrialFeeding`. */
function asServerSource(eventId: string, occurredAt: string, intake: string | null, bowl: AppBowl): TrialMealSource {
  return {
    id: eventId,
    occurredAt,
    meal: {
      foodItemId: null,
      intakeRating: intake,
      foodType: serverBowlFoodType(bowl.components.map((c) => c.food?.foodType ?? null)),
      brand: null,
      productName: null,
      proteins: null,
      bowl: {
        status: bowl.status,
        components: bowl.components.map((c) => ({
          foodItemId: c.foodItemId,
          foodKey: c.foodKey,
          snapshotLabel: c.foodLabel,
          brand: c.food?.brand ?? null,
          productName: c.food?.productName ?? null,
          foodType: c.food?.foodType ?? null,
          proteins: c.food ? c.food.proteins : null,
          primaryProtein: c.food?.primaryProtein ?? null,
          normalizedShare: c.normalizedShare,
        })),
      },
    },
  };
}

const TRIAL: TrialSpec = { id: 't', startedAt: '2026-07-01', targetDurationDays: 56, species: 'dog' };
const DUCK_ROW: AllowedFood = {
  foodItemId: 'duck',
  foodKey: null,
  label: 'Brand Duck Dry',
  role: 'primary_diet',
  allowedFrom: '2026-07-01',
  allowedUntil: null,
  primaryProtein: 'duck',
  proteins: ['duck'],
};

describe('the phone reads a bowl the way the vet report does (spec §8: one verdict per bowl)', () => {
  async function bothFeedings(eventId: string) {
    const bowl = (await loadMealBowls([eventId])).get(eventId)!;
    const phone = feedingOfBowl(eventId, AT, 'refused', bowl);
    const server = toTrialFeeding(asServerSource(eventId, AT, 'refused', bowl));
    return { phone, server };
  }

  it('a trial food + chicken bowl: identical feeding, one off-diet exposure naming chicken', async () => {
    seedMeal('mix', { count: 2 });
    seedSet('mix', 1_760_000_000_000, [
      { food: 'duck', label: 'Duck Dry', share: 0.75 },
      { food: 'chicken', label: 'Chicken Pâté', share: 0.25 },
    ]);
    const { phone, server } = await bothFeedings('mix');
    expect(phone).toEqual(server);
    const c = classifyFeeding(buildTrialContext(TRIAL, [DUCK_ROW]), phone);
    expect(c.verdict).toBe('off_diet_protein');
    expect(c.countsAsFeeding).toBe(true);
    expect(c.antigens).toContain('chicken');
  });

  it('a purged component (no food row, no id) resolves through its snapshot name, identically', async () => {
    seedMeal('purged', { count: 2 });
    seedSet('purged', 1_760_000_000_000, [
      { food: 'duck', label: 'Duck Dry', share: 0.5 },
      { food: null, label: 'Old Chicken Can', share: 0.5 },
    ]);
    const { phone, server } = await bothFeedings('purged');
    expect(phone).toEqual(server);
    expect(phone.components![1].foodKey).not.toBeNull();
  });

  it('an incomplete bowl: identical, and a visible off-list food is off-diet as on the server (CUL-2078)', async () => {
    seedMeal('partial', { count: 2 });
    seedSet('partial', 1_760_000_000_000, [{ food: 'chicken', label: 'Chicken Pâté', share: 0.5 }]);
    const { phone, server } = await bothFeedings('partial');
    expect(phone).toEqual(server);
    expect(phone.incompleteBowl).toBe(true);
    expect(classifyFeeding(buildTrialContext(TRIAL, [DUCK_ROW]), phone).offDiet).toBe(true);
  });

  it('an incomplete bowl of only the trial food is unclassifiable, never "matched"', async () => {
    seedMeal('partial', { count: 2 });
    seedSet('partial', 1_760_000_000_000, [{ food: 'duck', label: 'Duck Dry', share: 0.5 }]);
    const { phone } = await bothFeedings('partial');
    expect(classifyFeeding(buildTrialContext(TRIAL, [DUCK_ROW]), phone).verdict).toBe('unclassifiable');
  });

  // CUL-2096: phone A made the meal duck + chicken, lost both answers, phone B went back to
  // duck alone (tombstoning both rows), and A's stale parent retry won: count 2, no live row.
  it('a mix with no live foods reads as its last recorded foods: chicken is named and off-diet', async () => {
    seedMeal('stale', { count: 2 });
    seedSet('stale', 1_760_000_000_000, [
      { food: 'duck', label: 'Duck Dry', share: 0.5 },
      { food: 'chicken', label: 'Chicken Pâté', share: 0.5 },
    ], AT);
    const bowl = (await loadMealBowls(['stale'])).get('stale')!;
    expect(bowl.status).toBe('incomplete');
    expect(bowl.lastRecorded).toBe(true);
    expect(bowl.components.map((c) => c.foodItemId)).toEqual(['duck', 'chicken']);
    const { phone, server } = await bothFeedings('stale');
    expect(phone).toEqual(server);
    const c = classifyFeeding(buildTrialContext(TRIAL, [DUCK_ROW]), phone);
    expect(c.offDiet).toBe(true);
    expect(c.antigens).toContain('chicken');
    expect(bowlRowLabel(bowl).text).toBe('Duck Dry + Chicken Pâté, as last recorded');
    expect(bowlDetailLine(bowl)).toBe('Duck Dry + Chicken Pâté, as last recorded');
  });

  it('a last recorded set of only the trial food stays unclassifiable, never "on diet"', async () => {
    seedMeal('stale', { count: 2 });
    seedSet('stale', 1_760_000_000_000, [
      { food: 'duck', label: 'Duck Dry', share: 0.5 },
      { food: 'duck', label: 'Duck Dry', share: 0.5 },
    ], AT);
    const { phone } = await bothFeedings('stale');
    const c = classifyFeeding(buildTrialContext(TRIAL, [DUCK_ROW]), phone);
    expect(c.verdict).toBe('unclassifiable');
    expect(c.countsAsFeeding).toBe(false);
  });

  it('before/after: a meal back to one food over the same tombstones is still a plain meal', async () => {
    seedMeal('single', { foodId: 'duck', count: null });
    seedSet('single', 1_760_000_000_000, [
      { food: 'duck', label: 'Duck Dry', share: 0.5 },
      { food: 'chicken', label: 'Chicken Pâté', share: 0.5 },
    ], AT);
    expect((await loadMealBowls(['single'])).has('single')).toBe(false);
  });

  it('the verdict, counts and antigens do not move when the dominant food changes (§10 property)', async () => {
    const shares = [0.25, 0.333, 0.5, 0.667, 0.75];
    const verdicts = new Set<string>();
    for (const [i, s] of shares.entries()) {
      seedMeal(`m${i}`, { count: 2 });
      seedSet(`m${i}`, 1_760_000_000_000 + i, [
        { food: 'duck', label: 'Duck Dry', share: s },
        { food: 'chicken', label: 'Chicken Pâté', share: Math.round((1 - s) * 1000) / 1000 },
      ]);
      const bowl = (await loadMealBowls([`m${i}`])).get(`m${i}`)!;
      const c = classifyFeeding(buildTrialContext(TRIAL, [DUCK_ROW]), feedingOfBowl(`m${i}`, AT, null, bowl));
      verdicts.add(JSON.stringify([c.verdict, c.countsAsFeeding, c.offDiet, c.antigens]));
    }
    expect(verdicts.size).toBe(1);
  });
});

// ── The Day-1 boundary, pinned on both sides of UTC (spec §10, C-29) ──────────────

describe.each([
  { zone: 'Etc/GMT+7', offset: '-07:00' }, // UTC−7
  { zone: 'Etc/GMT-11', offset: '+11:00' }, // UTC+11
])('a mix at the trial’s first local midnight ($zone)', ({ zone, offset }) => {
  async function verdictAt(local: string) {
    seedMeal('edge', { count: 2 });
    seedSet('edge', 1_760_000_000_000, [
      { food: 'duck', label: 'Duck Dry', share: 0.5 },
      { food: 'chicken', label: 'Chicken Pâté', share: 0.5 },
    ]);
    const bowl = (await loadMealBowls(['edge'])).get('edge')!;
    const occurredAt = new Date(`${local}${offset}`).toISOString();
    const ctx = buildTrialContext(TRIAL, [DUCK_ROW], { timeZone: zone });
    const phone = classifyFeeding(ctx, feedingOfBowl('edge', occurredAt, null, bowl));
    const server = classifyFeeding(ctx, toTrialFeeding(asServerSource('edge', occurredAt, null, bowl)));
    expect(server).toEqual(phone);
    return phone.verdict;
  }

  it('23:50 the evening before Day 1 is out of window', async () => {
    expect(await verdictAt('2026-06-30T23:50:00')).toBe('out_of_window');
  });

  it('00:10 on Day 1 is in, and the chicken in it counts', async () => {
    expect(await verdictAt('2026-07-01T00:10:00')).toBe('off_diet_protein');
  });
});
