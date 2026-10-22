// The mixed bowl's writer, push and hydration (Mixed meals row 2, CUL-2051; spec §3 points
// 1–6, §10 "Composition and sync (row 2)"), against a REAL database (node:sqlite over the
// app's own schema constants, C-35) and a fake PostgREST that records what was sent.
//
// Pinned here: setMealComponents writes one generation and the parent in one transaction,
// re-queues with a moved updated_at (C-23) and throws on a missing meal (C-39); a ratio edit
// never rewrites the parent; only meal foods can be mixed (R1); the push order is events →
// meals → components, a component waits for its event AND its meal row, and runs even when
// no meal is pending; hydration lands components after meals; the absence pass removes a
// synced ghost and never an unsynced row, and the meals pass shares it (CUL-2076).

const { DatabaseSync } = require('node:sqlite');

interface RawDb {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number };
    all(...params: unknown[]): Record<string, unknown>[];
    get(...params: unknown[]): Record<string, unknown> | undefined;
  };
  close(): void;
}

let mockDb: RawDb;
const mockStatements: string[] = [];
jest.mock('./db', () => ({
  getDb: () => ({
    runAsync: jest.fn(async (sql: string, params: unknown[] = []) => {
      mockStatements.push(sql);
      return mockDb.prepare(sql).run(...(params as never[]));
    }),
    getAllAsync: jest.fn(async (sql: string, params: unknown[] = []) => mockDb.prepare(sql).all(...(params as never[]))),
    getFirstAsync: jest.fn(async (sql: string, params: unknown[] = []) => mockDb.prepare(sql).get(...(params as never[])) ?? null),
    execAsync: jest.fn(async (sql: string) => mockDb.exec(sql)),
    withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => {
      mockDb.exec('BEGIN');
      try {
        await fn();
        mockDb.exec('COMMIT');
      } catch (e) {
        mockDb.exec('ROLLBACK');
        throw e;
      }
    }),
  }),
  getWatermark: jest.fn(async () => null),
  setWatermark: jest.fn(async () => undefined),
}));

/** What the fake server holds for a pull, per table. */
let mockServer: Record<string, Record<string, unknown>[]> = {};
/** Runs when a pull's exact count is read: the moment a beside-running push can land. */
let mockOnCount: ((table: string) => void) | null = null;
const mockUpserts: { table: string; rows: Record<string, unknown>[] }[] = [];
/** What a paged full pull (and its count) sees, per table, when it differs from the rows a
 *  targeted `.in('id', …)` read finds: a page shifted under a concurrent delete + insert. */
let mockPagedView: Record<string, Record<string, unknown>[]> = {};
function mockQuery(table: string, head: boolean): unknown {
  let ids: string[] | null = null;
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'order', 'range', 'gte', 'eq', 'is', 'not', 'lte', 'limit']) q[m] = () => q;
  q.in = (_col: string, values: string[]) => { ids = values; return q; };
  q.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
    if (head && mockOnCount) mockOnCount(table);
    const all = mockServer[table] ?? [];
    const rows = ids ? all.filter((r) => ids!.includes(r.id as string)) : (mockPagedView[table] ?? all);
    return Promise.resolve(head ? { count: rows.length, data: null, error: null } : { data: rows, error: null }).then(res, rej);
  };
  return q;
}
jest.mock('./supabase', () => ({
  supabase: {
    auth: { getSession: jest.fn(async () => ({ data: { session: { user: { id: 'u1' } } } })) },
    from: jest.fn((table: string) => ({
      upsert: (rows: Record<string, unknown>[]) => {
        mockUpserts.push({ table, rows });
        const result = { data: rows.map((r) => ({ id: r.id })), error: null };
        return { select: async () => result, then: (res: (v: unknown) => unknown) => Promise.resolve(result).then(res) };
      },
      select: (_cols: string, opts?: { head?: boolean }) => mockQuery(table, opts?.head === true),
    })),
    functions: { invoke: jest.fn(async () => ({ data: null, error: null })) },
    storage: { from: () => ({ download: async () => ({ data: null, error: { message: 'n/a' } }) }) },
  },
}));
jest.mock('./storage', () => ({ uploadPhoto: jest.fn(), compressForUpload: jest.fn() }));
jest.mock('./signal', () => ({ triggerSignalRegenDebounced: jest.fn() }));
jest.mock('./incidentFloorArrival', () => ({ onFloorLanded: jest.fn(async () => undefined) }));

import { BASE_SCHEMA_SQL, applyColumnUpgrades } from './localSchema';
import { MEDICATION_SCHEMA_SQL } from './medications';
import { DIET_TRIAL_SCHEMA_SQL } from './dietTrialMirror';
import { setMealComponents } from './mealComponents';
import { insertMeal } from './meals';
import { MealComponentInputError, generationOf, readMealComposition, type MealComponentRow } from './mealComposition';
import { hydrateFromCloud, syncPendingMeals } from './sync';

const PET = 'pet-a';
const AT = '2026-10-21T08:00:00.000Z';

function seedEvent(id: string, synced = 1): void {
  mockDb.prepare(
    `INSERT INTO events (id, pet_id, event_type, occurred_at, source, occurred_at_source, created_at, updated_at, synced)
     VALUES (?, ?, 'meal', ?, 'manual', 'manual', ?, ?, ?)`,
  ).run(id, PET, AT, AT, AT, synced);
}
function seedMeal(eventId: string, opts: { synced?: number; foodId?: string | null } = {}): void {
  mockDb.prepare(
    `INSERT INTO meals (id, event_id, pet_id, food_item_id, created_at, updated_at, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(`m-${eventId}`, eventId, PET, opts.foodId === undefined ? 'rabbit' : opts.foodId, AT, AT, opts.synced ?? 1);
}
function seedFood(id: string, foodType: string | null = 'meal', format = 'wet'): void {
  mockDb.prepare(
    `INSERT INTO food_items_cache (id, brand, product_name, format, food_type) VALUES (?, 'Brand', ?, ?, ?)`,
  ).run(id, id, format, foodType);
}
const components = () => mockDb.prepare('SELECT * FROM meal_components ORDER BY position, id').all() as unknown as (MealComponentRow & { synced: number; pet_id: string; event_id: string })[];
const meal = (eventId: string) => mockDb.prepare('SELECT * FROM meals WHERE event_id = ?').get(eventId) as Record<string, unknown>;
const mix = (a: number, b: number) => [
  { foodItemId: 'rabbit', foodLabel: 'Rabbit Pâté', share: a, shareSource: 'preset' as const },
  { foodItemId: 'chicken', foodLabel: 'Chicken Pâté', share: b, shareSource: 'preset' as const },
];
const sent = (table: string) => mockUpserts.filter((u) => u.table === table).flatMap((u) => u.rows);

beforeEach(async () => {
  mockDb = new DatabaseSync(':memory:');
  for (const sql of [BASE_SCHEMA_SQL, MEDICATION_SCHEMA_SQL, DIET_TRIAL_SCHEMA_SQL]) mockDb.exec(sql);
  await applyColumnUpgrades(async (sql: string) => mockDb.exec(sql));
  mockUpserts.length = 0;
  mockStatements.length = 0;
  mockServer = {};
  mockOnCount = null;
  mockPagedView = {};
  seedFood('rabbit');
  seedFood('chicken');
});
afterEach(async () => {
  // The writer's own fire-and-forget push must finish before the database closes.
  await syncPendingMeals();
  mockDb.close();
});

describe('setMealComponents (the one writer, spec §4)', () => {
  it('a first mix: one queued generation, and a parent that names no food', async () => {
    seedEvent('e1');
    seedMeal('e1');
    const parent = await setMealComponents('e1', mix(0.25, 0.5), new Date('2026-10-21T09:00:00.000Z'));
    expect(parent).toEqual({ food_item_id: null, component_count: 2 });
    const rows = components();
    expect(rows.map((r) => [r.position, r.food_item_id, r.share, r.synced, r.pet_id])).toEqual([
      [0, 'rabbit', 0.25, 0, PET],
      [1, 'chicken', 0.5, 0, PET],
    ]);
    expect(new Set(rows.map((r) => generationOf(r.id))).size).toBe(1);
    expect(meal('e1')).toEqual(expect.objectContaining({
      food_item_id: null, component_count: 2, synced: 0, updated_at: '2026-10-21T09:00:00.000Z',
    }));
    const read = readMealComposition({ food_item_id: null, component_count: 2 }, rows);
    expect(read.status).toBe('mix');
    expect(read.components.map((c) => c.normalizedShare)).toEqual([1 / 3, 2 / 3]);
  });

  it('a ratio edit tombstones the old set, writes a new one, and leaves the parent alone', async () => {
    seedEvent('e1');
    seedMeal('e1');
    await setMealComponents('e1', mix(0.5, 0.5), new Date('2026-10-21T09:00:00.000Z'));
    mockDb.prepare('UPDATE meals SET synced = 1').run();
    await setMealComponents('e1', mix(0.25, 0.75), new Date('2026-10-21T10:00:00.000Z'));
    const rows = components();
    expect(rows.filter((r) => r.deleted_at !== null)).toHaveLength(2);
    expect(rows.filter((r) => r.deleted_at !== null).every((r) => r.updated_at === '2026-10-21T10:00:00.000Z' && r.synced === 0)).toBe(true);
    expect(readMealComposition({ food_item_id: null, component_count: 2 }, rows).components.map((c) => c.share)).toEqual([0.25, 0.75]);
    expect(meal('e1')).toEqual(expect.objectContaining({ synced: 1, updated_at: '2026-10-21T09:00:00.000Z' }));
  });

  it('taking a food out leaves a plain meal, indistinguishable from one never mixed', async () => {
    seedEvent('e1');
    seedMeal('e1');
    // Distinct instants: two writes in one millisecond share a version, C-23's stated gap.
    await setMealComponents('e1', mix(0.5, 0.5), new Date('2026-10-21T09:00:00.000Z'));
    await setMealComponents('e1', [mix(0.5, 0.5)[1]], new Date('2026-10-21T09:01:00.000Z'));
    expect(meal('e1')).toEqual(expect.objectContaining({ food_item_id: 'chicken', component_count: null, synced: 0 }));
    expect(components().every((r) => r.deleted_at !== null)).toBe(true);
    expect(readMealComposition({ food_item_id: 'chicken', component_count: null }, components()).status).toBe('single');
  });

  it('refuses a treat, a topper and an unknown food, writing nothing', async () => {
    seedEvent('e1');
    seedMeal('e1');
    seedFood('jerky', 'treat');
    seedFood('sprinkle', 'meal', 'topper');
    for (const other of ['jerky', 'sprinkle', 'never-cached']) {
      await expect(setMealComponents('e1', [mix(0.5, 0.5)[0], { foodItemId: other, foodLabel: other, share: 0.5, shareSource: 'preset' }]))
        .rejects.toBeInstanceOf(MealComponentInputError);
    }
    expect(components()).toEqual([]);
    expect(meal('e1')).toEqual(expect.objectContaining({ food_item_id: 'rabbit', synced: 1 }));
  });

  it('throws on a meal it cannot find (C-39), and rolls the components back', async () => {
    seedEvent('e1');
    await expect(setMealComponents('e1', mix(0.5, 0.5))).rejects.toThrow('No meal row');
    expect(components()).toEqual([]);
  });
});

// Mixed meals row 5 (CUL-2054): the FAB's mix pill writes the event, the meal and its foods
// in ONE transaction. Two writes would leave a bowl saved as its first food alone whenever
// the second failed, which drops the second food's exposure from every reader.
describe('insertMeal with components (the one-press mix)', () => {
  const events = () => mockDb.prepare('SELECT * FROM events').all();

  it('writes the bowl as a mix in one go', async () => {
    const { eventId } = await insertMeal({
      petId: PET, foodId: 'rabbit', occurredAt: new Date(AT), occurredAtSource: 'now', components: mix(1 / 3, 2 / 3),
    });
    expect(meal(eventId)).toEqual(expect.objectContaining({ food_item_id: null, component_count: 2 }));
    expect(components().map((r) => [r.position, r.food_item_id, r.event_id])).toEqual([
      [0, 'rabbit', eventId],
      [1, 'chicken', eventId],
    ]);
  });

  it('a component write that fails rolls back the event and the meal too', async () => {
    mockDb.exec(`CREATE TRIGGER boom BEFORE INSERT ON meal_components BEGIN SELECT RAISE(ABORT, 'boom'); END`);
    await expect(insertMeal({
      petId: PET, foodId: 'rabbit', occurredAt: new Date(AT), occurredAtSource: 'now', components: mix(0.5, 0.5),
    })).rejects.toThrow();
    expect(events()).toEqual([]);
    expect(mockDb.prepare('SELECT * FROM meals').all()).toEqual([]);
  });

  it('refuses a treat in the bowl before writing anything', async () => {
    seedFood('jerky', 'treat');
    await expect(insertMeal({
      petId: PET, foodId: 'rabbit', occurredAt: new Date(AT), occurredAtSource: 'now',
      components: [mix(0.5, 0.5)[0], { foodItemId: 'jerky', foodLabel: 'Jerky', share: 0.5, shareSource: 'preset' }],
    })).rejects.toBeInstanceOf(MealComponentInputError);
    expect(events()).toEqual([]);
  });

  it('a plain meal writes exactly as before: no components, the food on the parent', async () => {
    const { eventId } = await insertMeal({ petId: PET, foodId: 'rabbit', occurredAt: new Date(AT), occurredAtSource: 'now' });
    expect(meal(eventId)).toEqual(expect.objectContaining({ food_item_id: 'rabbit', component_count: null }));
    expect(components()).toEqual([]);
  });
});

describe('the push: events → meals → components (spec §3 point 5)', () => {
  it('sends the meal, then its components, with no created_at', async () => {
    seedEvent('e1');
    seedMeal('e1');
    await setMealComponents('e1', mix(0.5, 0.5));
    mockUpserts.length = 0;
    await syncPendingMeals();
    const order = mockUpserts.map((u) => u.table).filter((t) => t === 'meals' || t === 'meal_components');
    expect(order).toEqual(['meals', 'meal_components', 'meal_components']);
    expect(sent('meals')[0]).toEqual(expect.objectContaining({ food_item_id: null, component_count: 2 }));
    // Sent twice (adversarial F1): the second send is the conflict update, so the server's
    // trigger stamps updated_at and another phone's incremental pull cannot miss the set.
    const batches = mockUpserts.filter((u) => u.table === 'meal_components');
    expect(batches).toHaveLength(2);
    expect(batches[1].rows).toEqual(batches[0].rows);
    expect(batches[0].rows).toHaveLength(2);
    expect(sent('meal_components').every((r) => !('created_at' in r))).toBe(true);
    expect(components().every((r) => r.synced === 1)).toBe(true);
  });

  it('a ratio edit alone (no meal pending) still goes up', async () => {
    seedEvent('e1');
    seedMeal('e1');
    await setMealComponents('e1', mix(0.5, 0.5), new Date('2026-10-21T09:00:00.000Z'));
    await syncPendingMeals();
    await setMealComponents('e1', mix(0.25, 0.75), new Date('2026-10-21T09:05:00.000Z'));
    expect(meal('e1')).toEqual(expect.objectContaining({ synced: 1 }));
    mockUpserts.length = 0;
    await syncPendingMeals();
    expect(sent('meals')).toEqual([]);
    expect(sent('meal_components')).toHaveLength(8); // two tombstones, two new rows, each sent twice
  });

  it('holds a component while its event or its meal row has not landed', async () => {
    seedEvent('e1', 0);
    seedMeal('e1');
    await setMealComponents('e1', mix(0.5, 0.5));
    await syncPendingMeals();
    expect(sent('meal_components')).toEqual([]);

    // The event lands; the meal row is now refused (quarantined) — a quarantined parent
    // holds nothing, so the components go up and take their own answer.
    mockDb.prepare('UPDATE events SET synced = 1').run();
    mockDb.prepare("UPDATE meals SET sync_error = '23514: refused'").run();
    await syncPendingMeals();
    expect(sent('meal_components')).toHaveLength(4);
  });

  it('pre-syncs a component food the server may not hold (Pattern 6)', async () => {
    seedEvent('e1');
    seedMeal('e1');
    await setMealComponents('e1', mix(0.5, 0.5));
    mockDb.prepare('UPDATE meals SET synced = 1').run();
    mockUpserts.length = 0;
    await syncPendingMeals();
    const foods = mockUpserts.findIndex((u) => u.table === 'food_items');
    expect(foods).toBeGreaterThanOrEqual(0);
    expect(foods).toBeLessThan(mockUpserts.findIndex((u) => u.table === 'meal_components'));
    expect(mockUpserts[foods].rows.map((r) => r.id).sort()).toEqual(['chicken', 'rabbit']);
  });
});

describe('hydration (spec §3 point 4)', () => {
  const G = '0199f000-0000-7abc-8000-00000000000';
  const serverComponent = (n: number, over: Record<string, unknown> = {}) => ({
    id: `${G}${n}`, pet_id: PET, event_id: 'e1', position: n, food_item_id: n === 0 ? 'rabbit' : 'chicken',
    food_label: n === 0 ? 'Rabbit Pâté' : 'Chicken Pâté', share: '0.500', share_source: 'preset',
    amount_value: null, amount_unit: null, created_at: AT, updated_at: AT, deleted_at: null, ...over,
  });

  beforeEach(() => {
    mockServer = {
      events: [{
        id: 'e1', pet_id: PET, event_type: 'meal', occurred_at: AT, severity: null, notes: null, source: 'manual',
        occurred_at_source: 'manual', occurred_at_confidence: null, occurred_at_earliest: null, occurred_at_latest: null,
        deleted_at: null, created_at: AT, updated_at: AT, logged_via: 'app',
      }],
      meals: [{
        id: 'm-e1', event_id: 'e1', pet_id: PET, food_item_id: null, quantity: 'unknown', is_full_portion: null,
        notes: null, created_at: AT, updated_at: AT, intake_rating: 'some', logged_via: 'app', component_count: 2,
      }],
      meal_components: [serverComponent(0), serverComponent(1)],
    };
  });

  it('lands a bowl\'s components after its meal, and reads as the server\'s mix', async () => {
    await hydrateFromCloud();
    const lastMeal = mockStatements.map((s, i) => (/INSERT INTO meals\b/.test(s) ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
    const firstComponent = mockStatements.findIndex((s) => /INSERT INTO meal_components\b/.test(s));
    expect(lastMeal).toBeGreaterThanOrEqual(0);
    expect(firstComponent).toBeGreaterThan(lastMeal);

    expect(meal('e1')).toEqual(expect.objectContaining({ food_item_id: null, component_count: 2, synced: 1 }));
    const rows = components();
    expect(rows.map((r) => [r.position, r.share, r.synced])).toEqual([[0, 0.5, 1], [1, 0.5, 1]]);
    expect(readMealComposition({ food_item_id: null, component_count: 2 }, rows).status).toBe('mix');
  });

  it('removes a synced ghost the server no longer has, and never an unsynced row', async () => {
    const insert = mockDb.prepare(
      `INSERT INTO meal_components (id, pet_id, event_id, position, food_label, share, share_source, created_at, updated_at, synced)
       VALUES (?, ?, 'e1', 0, 'x', 0.5, 'preset', ?, ?, ?)`,
    );
    insert.run('ghost', PET, AT, AT, 1);
    insert.run('pending', PET, AT, AT, 0);
    await hydrateFromCloud();
    const ids = components().map((r) => r.id).sort();
    expect(ids).toContain('pending');
    expect(ids).not.toContain('ghost');
    expect(ids).toEqual(expect.arrayContaining([`${G}0`, `${G}1`]));
  });

  it('never deletes a live row the paged id pull skipped, though the counts matched (pass 2)', async () => {
    // Locally synced and on the server, but the paged pull and its count both miss it.
    mockDb.prepare(
      `INSERT INTO meal_components (id, pet_id, event_id, position, food_label, share, share_source, created_at, updated_at, synced)
       VALUES (?, ?, 'e1', 0, 'Rabbit Pâté', 0.5, 'preset', ?, ?, 1)`,
    ).run(`${G}0`, PET, AT, AT);
    mockPagedView = { meal_components: [serverComponent(1)] };
    await hydrateFromCloud();
    expect(components().map((r) => r.id)).toContain(`${G}0`);
  });

  it('never deletes a row a beside-running push marked synced after the server was read', async () => {
    mockDb.prepare(
      `INSERT INTO meal_components (id, pet_id, event_id, position, food_label, share, share_source, created_at, updated_at, synced)
       VALUES ('just-landed', ?, 'e1', 0, 'x', 0.5, 'preset', ?, ?, 0)`,
    ).run(PET, AT, AT);
    // The push lands it while the absence pass is reading the server's set (which lacks it).
    mockOnCount = (table) => {
      if (table === 'meal_components') mockDb.prepare("UPDATE meal_components SET synced = 1 WHERE id = 'just-landed'").run();
    };
    await hydrateFromCloud();
    expect(components().map((r) => r.id)).toContain('just-landed');
  });

  it('never overwrites a component with an unpushed local tombstone', async () => {
    mockDb.prepare(
      `INSERT INTO meal_components (id, pet_id, event_id, position, food_label, share, share_source, created_at, updated_at, deleted_at, synced)
       VALUES (?, ?, 'e1', 0, 'Rabbit Pâté', 0.5, 'preset', ?, '2026-10-21T09:00:00.000Z', '2026-10-21T09:00:00.000Z', 0)`,
    ).run(`${G}0`, PET, AT);
    await hydrateFromCloud();
    expect(components().find((r) => r.id === `${G}0`)).toEqual(expect.objectContaining({ deleted_at: '2026-10-21T09:00:00.000Z', synced: 0 }));
  });
});

describe('the meals absence pass (CUL-2076)', () => {
  beforeEach(() => {
    mockServer = {
      events: [],
      meals: [{
        id: 'm-e1', event_id: 'e1', pet_id: PET, food_item_id: 'rabbit', quantity: 'unknown', is_full_portion: null,
        notes: null, created_at: AT, updated_at: AT, intake_rating: 'some', logged_via: 'app', component_count: 0,
      }],
      meal_components: [],
    };
    seedEvent('e1');
    seedMeal('e1');
  });
  const mealIds = () => (mockDb.prepare('SELECT id FROM meals ORDER BY id').all() as { id: string }[]).map((r) => r.id);

  it('removes a synced ghost the server no longer has, and never an unsynced meal', async () => {
    seedEvent('e2');
    seedMeal('e2');
    seedEvent('e3', 0);
    seedMeal('e3', { synced: 0 });
    await hydrateFromCloud();
    expect(mealIds()).toEqual(['m-e1', 'm-e3']);
  });

  it('never deletes a meal a beside-running push marked synced after the server was read', async () => {
    seedEvent('e2', 0);
    seedMeal('e2', { synced: 0 });
    // insertMeal's fire-and-forget push lands it while the pass reads the server's set (which lacks it).
    mockOnCount = (table) => {
      if (table === 'meals') mockDb.prepare("UPDATE meals SET synced = 1 WHERE id = 'm-e2'").run();
    };
    await hydrateFromCloud();
    expect(mealIds()).toContain('m-e2');
  });

  const serverMeal = (eventId: string) => ({ ...mockServer.meals[0], id: `m-${eventId}`, event_id: eventId });
  /** On the server and synced locally, but a page shift makes the paged pull and its count
   *  both miss m-e1 while the total still matches (two rows seen, two counted). */
  const shiftPages = () => {
    seedEvent('e2');
    seedMeal('e2');
    mockServer.meals.push(serverMeal('e2'), serverMeal('e9'));
    mockPagedView = { meals: [serverMeal('e2'), serverMeal('e9')] };
  };

  it('never deletes a live meal the paged id pull skipped, though the counts matched', async () => {
    shiftPages();
    await hydrateFromCloud();
    expect(mealIds()).toContain('m-e1');
  });

  it('never deletes when the by-id re-check alone went out anonymous and answered empty', async () => {
    shiftPages();
    const from = jest.requireMock('./supabase').supabase.from as jest.Mock;
    const inner = from.getMockImplementation()!;
    from.mockImplementation((table: string) => {
      const api = inner(table);
      return {
        ...api,
        select: (cols: string, opts?: { head?: boolean }) => {
          const q = api.select(cols, opts) as Record<string, unknown>;
          // RLS under the anon key: no rows, no error.
          if (table === 'meals') q.in = () => ({ then: (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res) });
          return q;
        },
      };
    });
    try {
      await hydrateFromCloud();
    } finally {
      from.mockImplementation(inner);
    }
    expect(mealIds()).toContain('m-e1');
  });

  it('never deletes on an empty server answer, the shape an anon-key fallback reads', async () => {
    // A dropped session sends the anon key; RLS answers zero meals with no error.
    mockServer = { events: [], meals: [], meal_components: [] };
    seedEvent('e2');
    seedMeal('e2');
    await hydrateFromCloud();
    expect(mealIds()).toEqual(['m-e1', 'm-e2']);
  });

  it('never deletes a ghost re-queued by an edit after the snapshot', async () => {
    seedEvent('e2');
    seedMeal('e2');
    // The edit lands while the pass confirms its candidates by id.
    const realFrom = jest.requireMock('./supabase').supabase.from as jest.Mock;
    const inner = realFrom.getMockImplementation()!;
    realFrom.mockImplementation((table: string) => {
      const api = inner(table);
      return {
        ...api,
        select: (cols: string, opts?: { head?: boolean }) => {
          const q = api.select(cols, opts) as Record<string, unknown>;
          const realIn = q.in as (c: string, v: string[]) => unknown;
          q.in = (c: string, v: string[]) => {
            if (table === 'meals') mockDb.prepare("UPDATE meals SET synced = 0, updated_at = '2026-10-21T09:00:00.000Z' WHERE id = 'm-e2'").run();
            return realIn(c, v);
          };
          return q;
        },
      };
    });
    try {
      await hydrateFromCloud();
    } finally {
      realFrom.mockImplementation(inner);
    }
    expect(mealIds()).toContain('m-e2');
  });
});
