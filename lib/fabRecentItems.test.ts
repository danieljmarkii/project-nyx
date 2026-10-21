// The FAB's recent pills with mixes (Mixed meals row 5, CUL-2054; spec §7.1, §7.4), against
// a REAL database built from the app's own schema constants (C-35).

const { DatabaseSync } = require('node:sqlite');

let mockDb: { exec(sql: string): void; prepare(sql: string): { run(...p: unknown[]): unknown; all(...p: unknown[]): unknown[]; get(...p: unknown[]): unknown }; close(): void };
jest.mock('./db', () => {
  const { recentFoodsQuery } = jest.requireActual('./foodQueries');
  const api = {
    getAllAsync: async (sql: string, params: unknown[] = []) => mockDb.prepare(sql).all(...params),
    getFirstAsync: async (sql: string, params: unknown[] = []) => mockDb.prepare(sql).get(...params) ?? null,
  };
  return {
    getDb: () => api,
    getRecentFoods: async (petId: string, daysBack: number | null, limit: number, bounds?: unknown) => {
      const { sql, params } = recentFoodsQuery(petId, daysBack, limit, bounds);
      return mockDb.prepare(sql).all(...params);
    },
  };
});

import { BASE_SCHEMA_SQL, applyColumnUpgrades } from './localSchema';
import { MEDICATION_SCHEMA_SQL } from './medications';
import { DIET_TRIAL_SCHEMA_SQL } from './dietTrialMirror';
import { fabMixComponents, fabMixLabel, getFabRecentItems } from './fabRecentItems';
import { mintGenerationId } from './mealComposition';

const PET = 'pet-a';
const BOUNDS = { after: '2026-10-07T00:00:00.000Z', before: '2026-10-21T00:00:00.000Z' };

function food(id: string, product: string, type = 'meal', format = 'wet', archived: string | null = null) {
  mockDb.prepare(
    `INSERT INTO food_items_cache (id, brand, product_name, format, food_type, archived_at) VALUES (?, 'Weruva', ?, ?, ?, ?)`,
  ).run(id, product, format, type, archived);
}
let n = 0;
function meal(at: string, foodId: string | null, count: number | null = null): string {
  const id = `e${++n}`;
  mockDb.prepare(
    `INSERT INTO events (id, pet_id, event_type, occurred_at, source, occurred_at_source, created_at, updated_at, synced)
     VALUES (?, ?, 'meal', ?, 'manual', 'now', ?, ?, 1)`,
  ).run(id, PET, at, at, at);
  mockDb.prepare(
    `INSERT INTO meals (id, event_id, pet_id, food_item_id, component_count, created_at, updated_at, synced) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
  ).run(`m-${id}`, id, PET, foodId, count, at, at);
  return id;
}
function mix(at: string, parts: [string, number, string?][]): string {
  const id = meal(at, null, parts.length);
  const ms = new Date(at).getTime();
  parts.forEach(([foodId, share, source], i) => {
    mockDb.prepare(
      `INSERT INTO meal_components (id, pet_id, event_id, position, food_item_id, food_label, share, share_source, created_at, updated_at, synced)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    ).run(mintGenerationId(ms, 7, () => (i + 1) / 10), PET, id, i, foodId, foodId, share, source ?? 'preset', at, at);
  });
  return id;
}

beforeEach(async () => {
  mockDb = new DatabaseSync(':memory:');
  for (const sql of [BASE_SCHEMA_SQL, MEDICATION_SCHEMA_SQL, DIET_TRIAL_SCHEMA_SQL]) mockDb.exec(sql);
  await applyColumnUpgrades(async (sql: string) => mockDb.exec(sql));
  n = 0;
  food('chicken', 'Chicken Pâté');
  food('rabbit', 'Rabbit Pâté');
  food('duck', 'Duck Stew');
});
afterEach(() => mockDb.close());

it('a plain-food history reads exactly as before (no mix pill, same order)', async () => {
  meal('2026-10-19T08:00:00.000Z', 'chicken');
  meal('2026-10-20T08:00:00.000Z', 'rabbit');
  const items = await getFabRecentItems(PET, BOUNDS, 3);
  expect(items.map((i) => i.id)).toEqual(['rabbit', 'chicken']);
  expect(items.every((i) => i.mix === undefined)).toBe(true);
});

it('one pill per SET of foods, carrying the latest split, slotted by recency', async () => {
  mix('2026-10-17T08:00:00.000Z', [['chicken', 0.667], ['rabbit', 0.333]]);
  meal('2026-10-18T08:00:00.000Z', 'duck');
  mix('2026-10-19T08:00:00.000Z', [['chicken', 0.333], ['rabbit', 0.667]]);
  const items = await getFabRecentItems(PET, BOUNDS, 3);
  expect(items.map((i) => i.id)).toEqual(['mix:chicken|rabbit', 'duck']);
  const pill = items[0].mix!;
  expect(fabMixLabel(pill)).toBe('⅓ Chicken Pâté + ⅔ Rabbit Pâté');
  expect(fabMixComponents(pill)).toEqual([
    expect.objectContaining({ foodItemId: 'chicken', foodLabel: 'Weruva Chicken Pâté', share: 0.333, shareSource: 'preset' }),
    expect.objectContaining({ foodItemId: 'rabbit', share: 0.667, shareSource: 'preset' }),
  ]);
});

it('a measured split repeats as measured, never relabelled a preset', async () => {
  mix('2026-10-19T08:00:00.000Z', [['chicken', 0.45, 'custom'], ['rabbit', 0.55, 'custom']]);
  const [item] = await getFabRecentItems(PET, BOUNDS, 3);
  expect(fabMixComponents(item.mix!).map((c) => c.shareSource)).toEqual(['custom', 'custom']);
  expect(fabMixLabel(item.mix!)).toBe('~45% Chicken Pâté + ~55% Rabbit Pâté');
});

it('nothing logged today moves a pill, and an old mix ages out (the window is the food pills’)', async () => {
  mix('2026-10-21T08:00:00.000Z', [['chicken', 0.5], ['rabbit', 0.5]]);
  mix('2026-10-01T08:00:00.000Z', [['duck', 0.5], ['rabbit', 0.5]]);
  expect(await getFabRecentItems(PET, BOUNDS, 3)).toEqual([]);
});

it('a mix whose food was archived, or a deleted mix, is not offered', async () => {
  food('old', 'Old Food', 'meal', 'wet', '2026-10-15T00:00:00.000Z');
  mix('2026-10-19T08:00:00.000Z', [['old', 0.5], ['rabbit', 0.5]]);
  const gone = mix('2026-10-18T08:00:00.000Z', [['chicken', 0.5], ['duck', 0.5]]);
  mockDb.prepare('UPDATE events SET deleted_at = ? WHERE id = ?').run('2026-10-18T09:00:00.000Z', gone);
  expect(await getFabRecentItems(PET, BOUNDS, 3)).toEqual([]);
});

it('caps the fan at the limit across foods and mixes together', async () => {
  meal('2026-10-15T08:00:00.000Z', 'chicken');
  meal('2026-10-16T08:00:00.000Z', 'rabbit');
  meal('2026-10-17T08:00:00.000Z', 'duck');
  mix('2026-10-18T08:00:00.000Z', [['chicken', 0.5], ['rabbit', 0.5]]);
  const items = await getFabRecentItems(PET, BOUNDS, 3);
  expect(items.map((i) => i.id)).toEqual(['mix:chicken|rabbit', 'duck', 'rabbit']);
});
