// The Foods tab's recency line over mixed bowls (Mixed meals row 4, CUL-2053; spec §7.4),
// on a real engine over the app's own schema constants (C-35): a mix counts toward each
// food it held, once, and is disclosed; a bowl is read through the one composition read,
// so a tombstoned set or an older generation never counts.

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');

interface RawDb {
  exec(sql: string): void;
  prepare(sql: string): { run(...p: unknown[]): unknown; all(...p: unknown[]): Record<string, unknown>[] };
  close(): void;
}
let mockDb: RawDb;
const adapter = {
  getAllAsync: async <T,>(sql: string, params: unknown[] = []) => mockDb.prepare(sql).all(...(params as never[])) as T[],
};

import { BASE_SCHEMA_SQL, applyColumnUpgrades } from './localSchema';
import { MEDICATION_SCHEMA_SQL } from './medications';
import { DIET_TRIAL_SCHEMA_SQL } from './dietTrialMirror';
import { mintGenerationId } from './mealComposition';
import { MIX_CANDIDATES_SQL, PLAIN_INTAKE_STATS_SQL, mergeMixedBowlStats, type FoodIntakeStat } from './db';
import { loadMealBowls } from './mealBowls';

/** `getFoodIntakeStats`'s three reads and its merge, against the real engine. (The
 *  function itself opens the device database, which jest cannot; its body is these
 *  four calls in this order.) */
async function getFoodIntakeStats(petId: string): Promise<FoodIntakeStat[]> {
  const plain = await adapter.getAllAsync<Omit<FoodIntakeStat, 'mix_count'>>(PLAIN_INTAKE_STATS_SQL, [petId]);
  const candidates = await adapter.getAllAsync<{ event_id: string; occurred_at: string }>(MIX_CANDIDATES_SQL, [petId]);
  const bowls = await loadMealBowls(candidates.map((c) => c.event_id), adapter as never);
  return mergeMixedBowlStats(plain, candidates.flatMap((c) => {
    const bowl = bowls.get(c.event_id);
    return bowl ? [{ occurredAt: c.occurred_at, bowl }] : [];
  }));
}

const PET = 'p';
let n = 0;
function meal(id: string, at: string, food: string | null, count: number | null = null) {
  mockDb.prepare(`INSERT INTO events (id, pet_id, event_type, occurred_at, source, occurred_at_source, created_at, updated_at, synced)
                  VALUES (?, ?, 'meal', ?, 'manual', 'manual', ?, ?, 1)`).run(id, PET, at, at, at);
  mockDb.prepare(`INSERT INTO meals (id, event_id, pet_id, food_item_id, component_count, created_at, updated_at, synced)
                  VALUES (?, ?, ?, ?, ?, ?, ?, 1)`).run(`m-${id}`, id, PET, food, count, at, at);
}
function set(eventId: string, ms: number, foods: string[], deleted: string | null = null) {
  foods.forEach((f, position) => {
    n += 1;
    mockDb.prepare(`INSERT INTO meal_components (id, pet_id, event_id, position, food_item_id, food_label, share, share_source, created_at, updated_at, deleted_at, synced)
                    VALUES (?, ?, ?, ?, ?, ?, 0.5, 'preset', ?, ?, ?, 1)`)
      .run(mintGenerationId(ms, 5, () => ((n * 37 + position * 11) % 100) / 100), PET, eventId, position, f, f, '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z', deleted);
  });
}

beforeEach(async () => {
  mockDb = new DatabaseSync(':memory:');
  for (const sql of [BASE_SCHEMA_SQL, MEDICATION_SCHEMA_SQL, DIET_TRIAL_SCHEMA_SQL]) mockDb.exec(sql);
  await applyColumnUpgrades(async (sql: string) => mockDb.exec(sql));
  for (const [id, product] of [['rabbit', 'Rabbit Pâté'], ['chicken', 'Chicken Pâté'], ['duck', 'Duck Loaf']]) {
    mockDb.prepare(`INSERT INTO food_items_cache (id, brand, product_name, format, food_type) VALUES (?, 'Acme', ?, 'wet', 'meal')`).run(id, product);
  }
});
afterEach(() => mockDb.close());

it('counts each mix toward every food it held, once, and discloses it', async () => {
  meal('p1', '2026-10-01T08:00:00.000Z', 'rabbit');
  meal('p2', '2026-10-02T08:00:00.000Z', 'rabbit');
  meal('x1', '2026-10-03T08:00:00.000Z', null, 2);
  set('x1', 1_760_000_000_000, ['chicken', 'rabbit']);
  meal('x2', '2026-10-04T08:00:00+00:00', null, 2); // the pulled spelling: compared parsed (C-40)
  set('x2', 1_760_000_000_100, ['chicken', 'rabbit']);
  // An older set of x2 held duck: a tombstoned generation never counts.
  set('x2', 1_760_000_000_050, ['duck', 'rabbit'], '2026-10-04T09:00:00Z');
  const stats = await getFoodIntakeStats(PET);
  const by = new Map(stats.map((s) => [s.product_key, s]));
  expect(by.get('rabbit pâté')).toMatchObject({ meal_count: 4, mix_count: 2, last_fed_at: '2026-10-04T08:00:00+00:00' });
  expect(by.get('chicken pâté')).toMatchObject({ meal_count: 2, mix_count: 2 });
  expect(by.has('duck loaf')).toBe(false);
});

it('a meal an older build put a food back on, over live components, is read as the bowl', async () => {
  meal('raced', '2026-10-05T08:00:00.000Z', 'rabbit');
  set('raced', 1_760_000_000_200, ['chicken', 'rabbit']);
  const by = new Map((await getFoodIntakeStats(PET)).map((s) => [s.product_key, s]));
  expect(by.get('rabbit pâté')).toMatchObject({ meal_count: 1, mix_count: 1 });
  expect(by.get('chicken pâté')).toMatchObject({ meal_count: 1, mix_count: 1 });
});

it('a name with a non-ASCII capital keys the same on both sides (SQLite LOWER folds ASCII only)', async () => {
  mockDb.prepare(`INSERT INTO food_items_cache (id, brand, product_name, format, food_type) VALUES ('ecl', 'Éclair', 'Pâté Royal', 'wet', 'meal')`).run();
  meal('pl', '2026-10-01T08:00:00.000Z', 'ecl');
  meal('mx', '2026-10-02T08:00:00.000Z', null, 2);
  set('mx', 1_760_000_000_300, ['ecl', 'rabbit']);
  const rows = (await getFoodIntakeStats(PET)).filter((s) => s.product_key.includes('royal'));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ meal_count: 2, mix_count: 1 });
});
