// The trial-facts loader's SQL, run against a REAL engine (B-533).
//
// The `lib/db.ts` jest harness mocks `getAllAsync`, so every query in
// `dietTrialFacts.ts` is otherwise unexercised until it reaches a device — and
// the load-bearing parts of these three queries ARE the SQL: the soft-delete
// filter, the dated-membership rule that deliberately does NOT filter
// `allowed_until`, the vehicle join that stops a pill hidden in the prescribed
// diet counting as a daily exposure, and the window bounds. A JS-level test
// could not catch a regression in any of them.
//
// Same instrument and the same reasoning as `lib/foodQueries.test.ts`:
// `node:sqlite` (Node ≥ 22) gives a real engine to run the production strings
// against fixtures. Required via `require()` to keep it off the babel/jest-expo
// import path.
//
// The module under test imports `lib/analytics`, which pulls
// `feedingArrangements → lib/sync → lib/supabase` and its fail-fast env check.
// Only the SQL strings are exercised here, so stub the edge of the graph exactly
// as `dietTrialCard.test.ts` does.
jest.mock('./feedingArrangements', () => ({
  getActiveArrangementsForPet: jest.fn().mockResolvedValue([]),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');
import { ALLOWED_SET_SQL, dosesQuery, feedingsQuery } from './dietTrialFacts';

/** The columns these three queries actually touch, mirroring `lib/localSchema.ts`,
 *  `lib/medications.ts` and the `lib/db.ts` ALTERs (`food_type`, `intake_rating`)
 *  — enough of the real shape to run the real SQL, and no more. */
function freshDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE events (
      id TEXT PRIMARY KEY, pet_id TEXT NOT NULL, event_type TEXT,
      occurred_at TEXT NOT NULL, deleted_at TEXT
    );
    CREATE TABLE meals (
      id TEXT PRIMARY KEY, event_id TEXT NOT NULL, pet_id TEXT,
      food_item_id TEXT, intake_rating TEXT
    );
    CREATE TABLE food_items_cache (
      id TEXT PRIMARY KEY, brand TEXT, product_name TEXT,
      food_type TEXT, primary_protein TEXT, proteins TEXT
    );
    CREATE TABLE diet_trial_foods (
      id TEXT PRIMARY KEY, diet_trial_id TEXT, food_item_id TEXT, role TEXT,
      food_label TEXT, allowed_from TEXT, allowed_until TEXT, deleted_at TEXT
    );
    CREATE TABLE medication_administrations (
      id TEXT PRIMARY KEY, event_id TEXT, pet_id TEXT, medication_item_id TEXT,
      adherence TEXT, paired_event_id TEXT
    );
    CREATE TABLE medication_items_cache (
      id TEXT PRIMARY KEY, generic_name TEXT, brand_name TEXT, form TEXT
    );
  `);
  return db;
}

interface Db {
  exec(sql: string): void;
  prepare(sql: string): { all(...a: unknown[]): unknown[]; run(...a: unknown[]): unknown };
  close(): void;
}

const PET = 'pet-1';
const OTHER_PET = 'pet-2';

function addEvent(db: Db, id: string, at: string, deletedAt: string | null = null, pet = PET) {
  db.prepare('INSERT INTO events (id, pet_id, event_type, occurred_at, deleted_at) VALUES (?,?,?,?,?)')
    .run(id, pet, 'meal', at, deletedAt);
}

function addMeal(db: Db, eventId: string, foodItemId: string | null, rating: string | null = null) {
  db.prepare('INSERT INTO meals (id, event_id, pet_id, food_item_id, intake_rating) VALUES (?,?,?,?,?)')
    .run(`m-${eventId}`, eventId, PET, foodItemId, rating);
}

function addFood(db: Db, id: string, brand: string, product: string, foodType: string | null = 'meal') {
  db.prepare('INSERT INTO food_items_cache (id, brand, product_name, food_type, proteins) VALUES (?,?,?,?,?)')
    .run(id, brand, product, foodType, '["duck"]');
}

// ── The allowed set ─────────────────────────────────────────────────────────

describe('ALLOWED_SET_SQL', () => {
  function run(db: Db, trialId = 't1') {
    return db.prepare(ALLOWED_SET_SQL).all(trialId) as Array<Record<string, unknown>>;
  }

  function addAllowed(
    db: Db,
    id: string,
    foodItemId: string,
    role: string,
    allowedFrom: string,
    allowedUntil: string | null = null,
    deletedAt: string | null = null,
    trialId = 't1',
  ) {
    db.prepare(
      `INSERT INTO diet_trial_foods
         (id, diet_trial_id, food_item_id, role, food_label, allowed_from, allowed_until, deleted_at)
       VALUES (?,?,?,?,?,?,?,?)`,
    ).run(id, trialId, foodItemId, role, `Label ${id}`, allowedFrom, allowedUntil, deletedAt);
  }

  // THE POINT OF DATED MEMBERSHIP. A food removed on day 30 must still be
  // VISIBLE, because the predicate resolves membership on the FEEDING's date and
  // has to permit the twenty-nine days it was allowed for. Filtering
  // `allowed_until` in SQL would retroactively re-score that history as off-diet
  // — invisibly, and on the vet's artifact.
  it('does NOT filter an expired row out — membership resolves on the feeding date', () => {
    const db = freshDb();
    addFood(db, 'f1', 'Royal Canin', 'Duck');
    addAllowed(db, 'a1', 'f1', 'primary_diet', '2026-07-01', '2026-07-30');
    const rows = run(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].allowed_until).toBe('2026-07-30');
    db.close();
  });

  it('excludes a soft-deleted row', () => {
    const db = freshDb();
    addFood(db, 'f1', 'Royal Canin', 'Duck');
    addAllowed(db, 'a1', 'f1', 'primary_diet', '2026-07-01', null, '2026-07-15T00:00:00Z');
    expect(run(db)).toHaveLength(0);
    db.close();
  });

  it('scopes to its own trial', () => {
    const db = freshDb();
    addFood(db, 'f1', 'Royal Canin', 'Duck');
    addAllowed(db, 'a1', 'f1', 'primary_diet', '2026-07-01');
    addAllowed(db, 'a2', 'f1', 'primary_diet', '2026-07-01', null, null, 'OTHER-TRIAL');
    expect(run(db)).toHaveLength(1);
    db.close();
  });

  // The food row can hydrate AFTER the allowed-set row — the LEFT JOIN is what
  // keeps the entry in the permit set meanwhile. An INNER JOIN here would drop a
  // permitted food and flag a compliant owner.
  it('keeps an allowed row whose food has not hydrated (null brand/product)', () => {
    const db = freshDb();
    addAllowed(db, 'a1', 'not-yet-cached', 'primary_diet', '2026-07-01');
    const rows = run(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].brand).toBeNull();
    expect(rows[0].food_label).toBe('Label a1');
    db.close();
  });
});

// ── Feedings ────────────────────────────────────────────────────────────────

describe('feedingsQuery', () => {
  function run(db: Db, from: string, until?: string) {
    const sql = feedingsQuery(until !== undefined);
    const args = until === undefined ? [PET, from] : [PET, from, until];
    return db.prepare(sql).all(...args) as Array<Record<string, unknown>>;
  }

  it('excludes a soft-deleted event', () => {
    const db = freshDb();
    addFood(db, 'f1', 'Royal Canin', 'Duck');
    addEvent(db, 'e1', '2026-07-05T08:00:00Z');
    addMeal(db, 'e1', 'f1');
    addEvent(db, 'e2', '2026-07-05T18:00:00Z', '2026-07-06T00:00:00Z');
    addMeal(db, 'e2', 'f1');
    const rows = run(db, '2026-07-01T00:00:00Z');
    expect(rows.map((r) => r.event_id)).toEqual(['e1']);
    db.close();
  });

  it('excludes another pet in the same household', () => {
    const db = freshDb();
    addFood(db, 'f1', 'Royal Canin', 'Duck');
    addEvent(db, 'e1', '2026-07-05T08:00:00Z');
    addMeal(db, 'e1', 'f1');
    addEvent(db, 'e2', '2026-07-05T09:00:00Z', null, OTHER_PET);
    addMeal(db, 'e2', 'f1');
    expect(run(db, '2026-07-01T00:00:00Z').map((r) => r.event_id)).toEqual(['e1']);
    db.close();
  });

  it('carries intake_rating and food_type through to the predicate', () => {
    const db = freshDb();
    addFood(db, 'f1', 'Royal Canin', 'Duck', 'meal');
    addFood(db, 'f2', 'Zuke’s', 'Mini Naturals', 'treat');
    addEvent(db, 'e1', '2026-07-05T08:00:00Z');
    addMeal(db, 'e1', 'f1', 'refused');
    addEvent(db, 'e2', '2026-07-05T15:00:00Z');
    addMeal(db, 'e2', 'f2', null);
    const rows = run(db, '2026-07-01T00:00:00Z');
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.event_id === 'e1')).toMatchObject({
      intake_rating: 'refused',
      food_type: 'meal',
      brand: 'Royal Canin',
    });
    expect(rows.find((r) => r.event_id === 'e2')).toMatchObject({
      intake_rating: null,
      food_type: 'treat',
    });
    db.close();
  });

  // `ON DELETE SET NULL` on `meals.food_item_id` is bulk-triggerable, and the
  // round that measured it found one such meal withholding TWELVE genuine
  // off-diet exposures. The row must survive the read as `unclassifiable`, never
  // vanish from it.
  it('keeps a meal whose food row was deleted out from under it', () => {
    const db = freshDb();
    addEvent(db, 'e1', '2026-07-05T08:00:00Z');
    addMeal(db, 'e1', null);
    const rows = run(db, '2026-07-01T00:00:00Z');
    expect(rows).toHaveLength(1);
    expect(rows[0].food_item_id).toBeNull();
    expect(rows[0].brand).toBeNull();
    db.close();
  });

  it('applies the upper bound only when the trial has ended', () => {
    const db = freshDb();
    addFood(db, 'f1', 'Royal Canin', 'Duck');
    addEvent(db, 'e1', '2026-07-05T08:00:00Z');
    addMeal(db, 'e1', 'f1');
    addEvent(db, 'e2', '2026-07-25T08:00:00Z');
    addMeal(db, 'e2', 'f1');
    expect(run(db, '2026-07-01T00:00:00Z')).toHaveLength(2);
    expect(run(db, '2026-07-01T00:00:00Z', '2026-07-10T00:00:00Z').map((r) => r.event_id))
      .toEqual(['e1']);
    db.close();
  });
});

// ── Doses (rung 4 — the oral route) ─────────────────────────────────────────

describe('dosesQuery', () => {
  function run(db: Db, from: string, until?: string) {
    const sql = dosesQuery(until !== undefined);
    const args = until === undefined ? [PET, PET, from] : [PET, PET, from, until];
    return db.prepare(sql).all(...args) as Array<Record<string, unknown>>;
  }

  function addDose(
    db: Db,
    eventId: string,
    itemId: string | null,
    pairedEventId: string | null = null,
    adherence = 'given',
  ) {
    db.prepare(
      `INSERT INTO medication_administrations
         (id, event_id, pet_id, medication_item_id, adherence, paired_event_id)
       VALUES (?,?,?,?,?,?)`,
    ).run(`d-${eventId}`, eventId, PET, itemId, adherence, pairedEventId);
  }

  // WITHOUT THE VEHICLE JOIN a daily pill hidden in the PRESCRIBED DIET counts
  // as an exposure on every day of the trial — C2's alarm-fatigue failure
  // applied to the one food the owner cannot stop feeding.
  it('resolves the vehicle meal’s food identity through paired_event_id', () => {
    const db = freshDb();
    addFood(db, 'f-diet', 'Royal Canin', 'Hydrolyzed');
    addEvent(db, 'meal-1', '2026-07-05T08:00:00Z');
    addMeal(db, 'meal-1', 'f-diet');
    addEvent(db, 'dose-1', '2026-07-05T08:01:00Z');
    addDose(db, 'dose-1', 'mi-1', 'meal-1');
    db.prepare('INSERT INTO medication_items_cache (id, generic_name, brand_name, form) VALUES (?,?,?,?)')
      .run('mi-1', 'ciclosporin', 'Atopica', 'chewable');
    const rows = run(db, '2026-07-01T00:00:00Z');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      form: 'chewable',
      brand_name: 'Atopica',
      vehicle_food_item_id: 'f-diet',
      vehicle_brand: 'Royal Canin',
      vehicle_product_name: 'Hydrolyzed',
    });
    db.close();
  });

  it('returns a standalone dose with a null vehicle rather than dropping it', () => {
    const db = freshDb();
    addEvent(db, 'dose-1', '2026-07-05T08:00:00Z');
    addDose(db, 'dose-1', null, null);
    const rows = run(db, '2026-07-01T00:00:00Z');
    expect(rows).toHaveLength(1);
    expect(rows[0].vehicle_food_item_id).toBeNull();
    // A dose whose drug row has not hydrated must still arrive — the LEFT JOIN
    // is what keeps it from vanishing out of the oral-route lane.
    expect(rows[0].form).toBeNull();
    db.close();
  });

  it('excludes a soft-deleted dose event and another pet’s doses', () => {
    const db = freshDb();
    addEvent(db, 'dose-1', '2026-07-05T08:00:00Z');
    addDose(db, 'dose-1', null);
    addEvent(db, 'dose-2', '2026-07-05T09:00:00Z', '2026-07-06T00:00:00Z');
    addDose(db, 'dose-2', null);
    addEvent(db, 'dose-3', '2026-07-05T10:00:00Z', null, OTHER_PET);
    db.prepare(
      `INSERT INTO medication_administrations
         (id, event_id, pet_id, medication_item_id, adherence, paired_event_id)
       VALUES (?,?,?,?,?,?)`,
    ).run('d-3', 'dose-3', OTHER_PET, null, 'given', null);
    expect(run(db, '2026-07-01T00:00:00Z').map((r) => r.event_id)).toEqual(['dose-1']);
    db.close();
  });

  // The pet filter is on `e.pet_id` so the planner can use `idx_events_pet_time`;
  // `ma.pet_id` rides alongside it. The two are equal by invariant (migration
  // 023's same-pet trigger), so the redundant predicate must not change the
  // answer — which is only true while that invariant holds, so assert it.
  it('the doubled pet predicate is redundant, not restrictive', () => {
    const db = freshDb();
    addEvent(db, 'dose-1', '2026-07-05T08:00:00Z');
    addDose(db, 'dose-1', null);
    const both = run(db, '2026-07-01T00:00:00Z');
    const eventOnly = db
      .prepare(dosesQuery(false).replace('AND ma.pet_id = ?', ''))
      .all(PET, '2026-07-01T00:00:00Z') as unknown[];
    expect(both).toHaveLength(eventOnly.length);
    db.close();
  });
});

// ── The `TrialCardInput` shape — the gap that let a merge-blocker through ────
//
// This file previously exercised only the SQL strings, and `dietTrialCard.test.ts`
// only exercises the resolver with hand-built inputs. Nothing tested the MAPPING
// between them — so when a subtractive edit dropped `untrackedDaysBeforeFirstLog`
// from the loader's return while keeping the §10 S3 clip it discloses, CI stayed
// green and the card shipped a strictly more reassuring ratio than the one it
// replaced. These assert the contract itself: every disclosure the module
// computes reaches the surface that renders it.
describe('the loader maps every computed disclosure onto the card input', () => {
  // Read off the module's own shape rather than a hand-copied list, so a NEW
  // disclosure channel cannot be added to `TrialFacts` and silently not wired.
  const MUST_REACH_THE_CARD = [
    'coverage',
    'exposures',
    'belowCoverageFloor',
    'allowedSetUnavailable',
    'untrackedDaysBeforeFirstLog',
    'rangeRefusal',
    'freeFed',
    'freeFedOverlap',
  ] as const;

  function loaderReturnBlock(): string {
    const src = require('node:fs').readFileSync(
      require('node:path').join(__dirname, 'dietTrialFacts.ts'),
      'utf8',
    ) as string;
    return src.slice(src.lastIndexOf('  return {\n    ...base,'));
  }

  it('names every field the card needs, so a dropped one is a failing test', () => {
    const ret = loaderReturnBlock();
    for (const field of MUST_REACH_THE_CARD) {
      expect(ret.includes(`\n    ${field}:`)).toBe(true);
    }
  });

  // The specific pairing that broke: the clip changes the DENOMINATOR, and the
  // head is the only thing that explains it. They may not ship apart.
  it('ships the coverage clip and its disclosure together', () => {
    const ret = loaderReturnBlock();
    const clipped = /coverage: facts\?\.coverage/.test(ret);
    const disclosed = /untrackedDaysBeforeFirstLog:/.test(ret);
    expect(clipped).toBe(disclosed);
  });
});
