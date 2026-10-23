// Food detail's "In mixed bowls" lines (Mixed meals, CUL-2085; spec §7.4), on a real
// engine over the app's own schema constants (C-35), through the production read
// (`getMixedBowls`) and the production grouping. The load-bearing promise: the lines sum
// to the Foods tab's "· N in a mix" for the same food, because both count one set.

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
import { PLAIN_INTAKE_STATS_SQL, getMixedBowls, mergeMixedBowlStats, type FoodIntakeStat } from './db';
import { foodIntakeKey } from './food';
import { foodMixLines } from './foodMixedBowls';
import { toLocalDayKey } from './utils';

const PET = 'p';
const RABBIT = foodIntakeKey('Acme', 'Rabbit Pâté');
let n = 0;

/** A local-day instant (C-29): noon on that LOCAL day, whatever zone the suite runs in. */
function at(month: number, day: number, year = 2026): string {
  return new Date(year, month - 1, day, 12).toISOString();
}
function meal(id: string, when: string, food: string | null, count: number | null = null, pet = PET) {
  mockDb.prepare(`INSERT INTO events (id, pet_id, event_type, occurred_at, source, occurred_at_source, created_at, updated_at, synced)
                  VALUES (?, ?, 'meal', ?, 'manual', 'manual', ?, ?, 1)`).run(id, pet, when, when, when);
  mockDb.prepare(`INSERT INTO meals (id, event_id, pet_id, food_item_id, component_count, created_at, updated_at, synced)
                  VALUES (?, ?, ?, ?, ?, ?, ?, 1)`).run(`m-${id}`, id, pet, food, count, when, when);
}
function set(eventId: string, ms: number, foods: string[], deleted: string | null = null, pet = PET) {
  foods.forEach((f, position) => {
    n += 1;
    mockDb.prepare(`INSERT INTO meal_components (id, pet_id, event_id, position, food_item_id, food_label, share, share_source, created_at, updated_at, deleted_at, synced)
                    VALUES (?, ?, ?, ?, ?, ?, 0.5, 'preset', ?, ?, ?, 1)`)
      .run(mintGenerationId(ms, 5, () => ((n * 37 + position * 11) % 100) / 100), pet, eventId, position, f, f, '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z', deleted);
  });
}
function mix(id: string, when: string, foods: string[], ms = 1_760_000_000_000 + n) {
  meal(id, when, null, foods.length);
  set(id, ms, foods);
}

const NOW = new Date(2026, 9, 23, 9).getTime();

beforeEach(async () => {
  mockDb = new DatabaseSync(':memory:');
  for (const sql of [BASE_SCHEMA_SQL, MEDICATION_SCHEMA_SQL, DIET_TRIAL_SCHEMA_SQL]) mockDb.exec(sql);
  await applyColumnUpgrades(async (sql: string) => mockDb.exec(sql));
  for (const [id, brand, product] of [
    ['rabbit', 'Acme', 'Rabbit Pâté'],
    // A second capture of the same bag: one library food, never its own partner.
    ['rabbit-2', 'ACME', 'rabbit pâté'],
    ['chicken', 'Acme', 'Chicken Pâté'],
    ['duck', 'Acme', 'Duck Loaf'],
  ]) {
    mockDb.prepare(`INSERT INTO food_items_cache (id, brand, product_name, format, food_type) VALUES (?, ?, ?, 'wet', 'meal')`).run(id, brand, product);
  }
});
afterEach(() => mockDb.close());

it('groups the bowls by what the food was mixed with, newest group first, and lands on the newest day', async () => {
  mix('a1', at(10, 19), ['rabbit', 'chicken']);
  mix('a2', at(10, 22), ['chicken', 'rabbit']); // position does not split a group
  mix('b1', at(10, 20), ['rabbit', 'duck']);
  mix('c1', at(10, 21), ['rabbit', 'chicken', 'duck']);
  mix('x1', at(10, 18), ['chicken', 'duck']); // no rabbit: not this food's bowl
  meal('p1', at(10, 23), 'rabbit'); // a plain meal is not a bowl

  const lines = foodMixLines(RABBIT, await getMixedBowls(PET, adapter as never), NOW);
  expect(lines.map((l) => l.text)).toEqual([
    '2 bowls with Acme Chicken Pâté · last Oct 22',
    '1 bowl with Acme Chicken Pâté and Acme Duck Loaf · last Oct 21',
    '1 bowl with Acme Duck Loaf · last Oct 20',
  ]);
  expect(lines[0].lastDayKey).toBe(toLocalDayKey(new Date(at(10, 22))));
  expect(lines[0].accessibilityLabel).toBe('2 bowls with Acme Chicken Pâté, last on Oct 22. Opens Oct 22 in History.');
});

it('sums to the Foods tab note for the same food: one set, counted by one rule', async () => {
  mix('a1', at(10, 19), ['rabbit', 'chicken']);
  mix('a2', at(10, 22), ['rabbit-2', 'chicken']); // the duplicate capture still counts as Rabbit
  mix('b1', at(10, 20), ['rabbit', 'duck']);
  mix('d1', at(10, 21), ['rabbit', 'rabbit-2']); // one food twice: still one bowl of it
  meal('i1', at(10, 17), null, 2); // incomplete: the other food never arrived
  set('i1', 1_760_000_000_900, ['rabbit']);
  meal('t1', at(10, 16), null, 2); // a tombstoned set never counts
  set('t1', 1_760_000_000_950, ['rabbit', 'duck'], '2026-10-16T13:00:00Z');

  const bowls = await getMixedBowls(PET, adapter as never);
  const lines = foodMixLines(RABBIT, bowls, NOW);
  const plain = await adapter.getAllAsync<Omit<FoodIntakeStat, 'mix_count'>>(PLAIN_INTAKE_STATS_SQL, [PET]);
  const stat = mergeMixedBowlStats(plain, bowls).find((s) => `${s.brand_key}\u001F${s.product_key}` === RABBIT);
  expect(stat?.mix_count).toBeGreaterThan(0);
  expect(lines.reduce((sum, l) => sum + l.bowlCount, 0)).toBe(stat?.mix_count);
  // The bowls with no other food on record say so rather than naming the food twice.
  expect(lines.find((l) => l.partnerNames.length === 0)?.text).toBe(
    "2 bowls with a food that wasn't recorded · last Oct 21",
  );
});

it('reads only this pet, and is empty for a food never mixed', async () => {
  meal('o1', at(10, 22), null, 2, 'other');
  set('o1', 1_760_000_000_000, ['rabbit', 'chicken'], null, 'other');
  mix('a1', at(10, 19), ['chicken', 'duck']);
  expect(foodMixLines(RABBIT, await getMixedBowls(PET, adapter as never), NOW)).toEqual([]);
});

it('stamps the year once the newest bowl is not this year (C-19)', async () => {
  mix('a1', at(12, 30, 2025), ['rabbit', 'chicken']);
  expect(foodMixLines(RABBIT, await getMixedBowls(PET, adapter as never), NOW)[0].text).toBe(
    '1 bowl with Acme Chicken Pâté · last Dec 30, 2025',
  );
});
