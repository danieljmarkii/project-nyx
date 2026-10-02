// Real-SQLite coverage for the two feeding reads the timing lane stands on (HV-2 / CUL-1159,
// CUL-1122): Home's bounded `readFeedingsSince` (lib/spineReads.ts) and the Patterns /
// Signal screen / trial panel's `readFeedingRows` (lib/patternsTiming.ts). Both now select the
// feeding's EVENT id and its intake rating, and both run against the PRODUCTION DDL here
// (`BASE_SCHEMA_SQL` + the column upgrades a device applies), because the two facts this PR adds
// are exactly the kind a hand-made test schema gets wrong silently: the local `meals` table has
// its OWN `id`, and `intake_rating` exists only through an upgrade. The monthReads.test.ts
// harness, reused.
//
// A separate file from any spineReads suite HV-5 may add, so the two parallel sessions never
// collide on one new file.

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');

interface Db {
  exec(sql: string): void;
  prepare(sql: string): {
    all(...a: unknown[]): Record<string, unknown>[];
    run(...a: unknown[]): unknown;
  };
}

let mockDb: Db;
jest.mock('./db', () => ({
  getDb: () => ({
    getAllAsync: async (sql: string, params: unknown[] = []) => mockDb.prepare(sql).all(...params),
  }),
}));
jest.mock('./supabase', () => ({ supabase: { from: jest.fn() } }));

import { BASE_SCHEMA_SQL, COLUMN_UPGRADES } from './localSchema';
import { readFeedingRows } from './patternsTiming';
import { readFeedingsSince } from './spineReads';
import { timingsByRow, type SpineEventInput } from './spineNode';
import { DEFAULT_MEAL_TIMING_CONFIG } from './mealTiming';

function freshDb(): Db {
  const d = new DatabaseSync(':memory:') as Db;
  d.exec(BASE_SCHEMA_SQL);
  // The columns a device gains by upgrade (`intake_rating` among them): the list `initDb` applies.
  for (const c of COLUMN_UPGRADES) {
    const cols = d.prepare(`PRAGMA table_info(${c.table})`).all() as { name: string }[];
    if (cols.length === 0 || cols.some((col) => col.name === c.column)) continue;
    d.exec(`ALTER TABLE ${c.table} ADD COLUMN ${c.column} ${c.type}`);
  }
  return d;
}

const PET = 'pet-1';

function ev(id: string, type: string, occurredAt: string, opts: { pet?: string; deleted?: boolean } = {}) {
  mockDb
    .prepare(
      `INSERT INTO events (id, pet_id, event_type, occurred_at, occurred_at_confidence, source, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, 'witnessed', 'app', ?, ?, ?)`,
    )
    .run(id, opts.pet ?? PET, type, occurredAt, occurredAt, occurredAt, opts.deleted ? occurredAt : null);
}

/** A meal event and its `meals` row. The meals row's own id is deliberately NOT the event id, as on
 *  a device, so a read that selected `m.id` would be caught. */
function meal(eventId: string, occurredAt: string, rating: string | null, opts: { pet?: string; deleted?: boolean } = {}) {
  ev(eventId, 'meal', occurredAt, opts);
  mockDb
    .prepare(`INSERT INTO meals (id, event_id, pet_id, food_item_id, intake_rating) VALUES (?, ?, ?, 'food-1', ?)`)
    .run(`meals-row-${eventId}`, eventId, opts.pet ?? PET, rating);
}

beforeEach(() => {
  mockDb = freshDb();
  mockDb
    .prepare(`INSERT INTO food_items_cache (id, brand, product_name, food_type, format) VALUES ('food-1', 'Acme', 'Kibble', 'meal', 'dry_kibble')`)
    .run();
});

describe('the two feeding reads carry the event id and the intake rating (HV-2)', () => {
  it('readFeedingRows: the EVENT id (never meals.id), the rating, soft-deletes and other pets out', async () => {
    meal('breakfast', '2026-09-20T08:00:00.000Z', null);
    meal('dinner', '2026-09-20T22:00:00.000Z', 'refused');
    meal('snack', '2026-09-20T15:00:00.000Z', 'picked');
    meal('gone', '2026-09-20T12:00:00.000Z', 'all', { deleted: true });
    meal('theirs', '2026-09-20T09:00:00.000Z', 'all', { pet: 'pet-2' });
    const rows = await readFeedingRows(PET);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.intakeRating]));
    expect(byId).toEqual({ breakfast: null, dinner: 'refused', snack: 'picked' });
    expect(rows.every((r) => !r.id.startsWith('meals-row-'))).toBe(true);
    expect(rows.find((r) => r.id === 'breakfast')).toMatchObject({ form: 'Acme · Kibble', foodType: 'meal', confidence: 'witnessed' });
  });

  it('readFeedingsSince: the same mapping, and the bound decided on parsed instants (C-40)', async () => {
    // The bound instant, spelled the way PostgREST hydrates it (`+00:00`), sorts BEFORE the app's
    // own `.000Z` spelling of the same second; a text comparison would drop it.
    meal('at-bound', '2026-09-20T04:00:00+00:00', 'most');
    meal('before-bound', '2026-09-20T03:59:59.000Z', 'all');
    meal('after', '2026-09-20T10:00:00.000Z', 'refused');
    const rows = await readFeedingsSince(PET, '2026-09-20T04:00:00.000Z');
    expect(rows.map((r) => [r.id, r.intakeRating]).sort()).toEqual([
      ['after', 'refused'],
      ['at-bound', 'most'],
    ]);
  });

  it('end to end: Pixel’s refused 10 PM bowl, read from the table, is never the meal her 10:05 vomit is timed from', async () => {
    meal('breakfast', '2026-09-20T08:00:00.000Z', null);
    meal('dinner', '2026-09-20T22:00:00.000Z', 'refused');
    const vomit: SpineEventInput = {
      id: 'v',
      pet_id: PET,
      event_type: 'vomit',
      occurred_at: '2026-09-20T22:05:00.000Z',
      occurred_at_confidence: 'witnessed',
    };
    const since = new Date(Date.parse(vomit.occurred_at) - DEFAULT_MEAL_TIMING_CONFIG.feedingLookbackHours * 3_600_000).toISOString();
    const feedings = await readFeedingsSince(PET, since);
    const lines = timingsByRow([vomit], [], feedings, [], DEFAULT_MEAL_TIMING_CONFIG);
    expect(lines.get('v')).toEqual({ text: '6h or more after eating', mealId: 'breakfast' });
  });
});
