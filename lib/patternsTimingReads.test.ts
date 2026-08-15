// Real-SQLite coverage for the Patterns panels' DB-read layer (Signals v2 / B-755 PR 9,
// CUL-11). The pure model is tested in patternsTiming.test.ts / patternsTrial.test.ts with
// mocked data; this suite runs the ACTUAL SQL strings against a real engine, because a
// column-name or JOIN typo in a raw query passes tsc + the mocked tests and only surfaces
// on-device (where the panel's try/catch silently degrades it to "no panel"). Same
// instrument + reasoning as dietTrialFacts.test.ts / medStripFacts.test.ts: node:sqlite
// (Node ≥ 22), require()'d to stay off the babel/jest-expo import path.
//
// patternsTiming imports only ./db (mocked here) + ./mealTiming (pure) — no lib/supabase
// edge — so this suite needs no other stubs.

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');

interface Db {
  exec(sql: string): void;
  prepare(sql: string): { all(...a: unknown[]): Record<string, unknown>[] };
}

let mockDb: Db;
jest.mock('./db', () => ({
  getDb: () => ({
    // The three reads use getAllAsync(sql, params); adapt to node:sqlite's sync all().
    getAllAsync: async (sql: string, params: unknown[] = []) => mockDb.prepare(sql).all(...params),
  }),
}));

import { getTimingPanel, readCorrelationSymptomMs } from './patternsTiming';

// Minimal schema — just the columns the three queries touch (events + meals +
// food_items_cache + feeding_arrangements), no more.
function freshDb(): Db {
  const d = new DatabaseSync(':memory:') as Db;
  d.exec(`
    CREATE TABLE events (
      id TEXT PRIMARY KEY, pet_id TEXT NOT NULL, event_type TEXT NOT NULL,
      occurred_at TEXT NOT NULL, occurred_at_confidence TEXT, deleted_at TEXT
    );
    CREATE TABLE meals (id TEXT PRIMARY KEY, event_id TEXT NOT NULL, food_item_id TEXT);
    CREATE TABLE food_items_cache (
      id TEXT PRIMARY KEY, food_type TEXT, brand TEXT, product_name TEXT
    );
    CREATE TABLE feeding_arrangements (
      id TEXT PRIMARY KEY, pet_id TEXT NOT NULL, method TEXT NOT NULL,
      active_from TEXT, active_until TEXT, deleted_at TEXT
    );
  `);
  return d;
}

function ev(id: string, pet: string, type: string, at: string, conf: string | null, del: string | null = null) {
  mockDb.prepare(
    `INSERT INTO events (id, pet_id, event_type, occurred_at, occurred_at_confidence, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).all(id, pet, type, at, conf, del);
}
function meal(id: string, eventId: string, foodItemId: string | null) {
  mockDb.prepare(`INSERT INTO meals (id, event_id, food_item_id) VALUES (?, ?, ?)`).all(id, eventId, foodItemId);
}
function food(id: string, type: string, brand: string, product: string) {
  mockDb.prepare(`INSERT INTO food_items_cache (id, food_type, brand, product_name) VALUES (?, ?, ?, ?)`).all(
    id, type, brand, product,
  );
}
function arrangement(id: string, pet: string, method: string, from: string | null, until: string | null, del: string | null = null) {
  mockDb.prepare(
    `INSERT INTO feeding_arrangements (id, pet_id, method, active_from, active_until, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).all(id, pet, method, from, until, del);
}

beforeEach(() => {
  mockDb = freshDb();
  // ── pet p1's record ──
  food('f_kibble', 'meal', 'Acme', 'Kibble');
  food('f_wet', 'treat', 'Acme', 'Wet');
  // feedings (event + meal join)
  ev('e_m1', 'p1', 'meal', '2026-05-01T08:00:00Z', 'witnessed');
  meal('m1', 'e_m1', 'f_kibble');
  ev('e_m2', 'p1', 'meal', '2026-05-01T20:00:00Z', 'witnessed');
  meal('m2', 'e_m2', 'f_wet');
  ev('e_m4', 'p1', 'meal', '2026-05-05T07:00:00Z', 'witnessed');
  meal('m4', 'e_m4', 'f_kibble');
  // vomits
  ev('v1', 'p1', 'vomit', '2026-05-01T08:15:00Z', 'witnessed'); // 15m → rapid
  ev('v2', 'p1', 'vomit', '2026-05-02T03:00:00Z', 'witnessed'); // 7h → long
  ev('v3', 'p1', 'vomit', '2026-05-03T12:00:00Z', 'estimated'); // not witnessed → untimed
  ev('v4', 'p1', 'vomit', '2026-05-05T09:00:00Z', 'witnessed'); // free-fed on 05-05 → untimed
  ev('v_del', 'p1', 'vomit', '2026-05-06T08:00:00Z', 'witnessed', '2026-05-06T09:00:00Z'); // soft-deleted
  ev('d1', 'p1', 'diarrhea', '2026-05-06T10:00:00Z', 'witnessed'); // a non-vomit correlation symptom
  // a free-choice bowl down all of 05-05 (covers v4); plus excluded arrangements
  arrangement('fa1', 'p1', 'free_choice', '2026-05-05', '2026-05-05');
  arrangement('fa_del', 'p1', 'free_choice', '2026-05-01', null, '2026-05-02T00:00:00Z'); // deleted
  arrangement('fa_mealfed', 'p1', 'meal_fed', '2026-05-01', null); // not free_choice
  // ── pet p2 (scope check — must never appear in p1's reads) ──
  ev('v_other', 'p2', 'vomit', '2026-05-01T08:15:00Z', 'witnessed');
  ev('e_m_other', 'p2', 'meal', '2026-05-01T08:00:00Z', 'witnessed');
  meal('m_other', 'e_m_other', 'f_kibble');
  arrangement('fa_other', 'p2', 'free_choice', '2026-05-01', null);
});

describe('getTimingPanel — the three reads run end-to-end against a real engine', () => {
  it('scopes to the pet, excludes soft-deletes, joins the food cache, and applies free-fed exclusion', async () => {
    const model = await getTimingPanel('p1');
    expect(model).not.toBeNull();
    // v1 rapid, v2 long, v3 not-witnessed, v4 free-fed; v_del + p2 rows excluded.
    expect(model!.totalCount).toBe(4);
    expect(model!.eligibleCount).toBe(2);
    const [rapid, mid, long] = model!.bandRows;
    expect([rapid.count, mid.count, long.count]).toEqual([1, 0, 1]);
    expect(model!.untimedReasons).toEqual({ not_witnessed: 1, free_fed: 1, no_preceding_feeding: 0 });
  });

  it('returns null for a pet with no vomiting logged', async () => {
    expect(await getTimingPanel('p_none')).toBeNull();
  });
});

describe('readCorrelationSymptomMs — the IN-clause query covers all correlation types', () => {
  it('returns every non-deleted correlation-symptom instant for the pet, no other pet', async () => {
    const ms = await readCorrelationSymptomMs('p1');
    // v1, v2, v3, v4 (vomit) + d1 (diarrhea) = 5; v_del excluded (soft-deleted), p2 excluded.
    expect(ms).toHaveLength(5);
    expect(ms).toContain(Date.parse('2026-05-06T10:00:00Z')); // the diarrhea day proves the IN clause
    expect(ms).not.toContain(Date.parse('2026-05-06T08:00:00Z')); // the soft-deleted vomit
  });
});
