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
import {
  ALLOWED_SET_SQL,
  ARRANGEMENTS_IN_WINDOW_SQL,
  dosesQuery,
  feedingsQuery,
} from './dietTrialFacts';

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
    CREATE TABLE feeding_arrangements (
      id TEXT PRIMARY KEY, pet_id TEXT NOT NULL, food_item_id TEXT NOT NULL,
      method TEXT NOT NULL DEFAULT 'free_choice',
      active_from TEXT, active_until TEXT, deleted_at TEXT
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

function addArrangement(
  db: Db,
  id: string,
  foodItemId: string,
  activeFrom: string | null,
  activeUntil: string | null,
  over: { method?: string; deletedAt?: string | null; pet?: string } = {},
) {
  db.prepare(
    `INSERT INTO feeding_arrangements
       (id, pet_id, food_item_id, method, active_from, active_until, deleted_at)
     VALUES (?,?,?,?,?,?,?)`,
  ).run(
    id, over.pet ?? PET, foodItemId, over.method ?? 'free_choice',
    activeFrom, activeUntil, over.deletedAt ?? null,
  );
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


// ── The loader→card CONTRACT, tested behaviourally ──────────────────────────
//
// The gap that let a merge-blocker through: this file tested only SQL strings,
// and `dietTrialCard.test.ts` tests only the resolver with hand-built inputs.
// Nothing tested the MAPPING — so a subtractive edit dropped
// `untrackedDaysBeforeFirstLog` from the loader's return while keeping the
// §10 S3 clip it discloses, and CI stayed green.
//
// The FIRST attempt at closing that gap asserted the field's NAME appeared in the
// return literal, and the adversarial pass broke it in one step: hardcode the
// field to `0` and the tests pass green while the disclosure never renders. A
// source-text test cannot see a value. These run the real `loadDietTrialFacts`
// against a stub db and assert what actually reaches the card.
describe('loadDietTrialFacts → TrialCardInput (behavioural)', () => {
  const TRIAL_ROW: {
    id: string;
    started_at: string;
    target_duration_days: number;
    status: string;
    ended_at: string | null;
    stopped_reason: string | null;
    outcome: string | null;
    indication: string;
    food_label: string;
  } = {
    id: 't1',
    started_at: '2026-07-03',
    target_duration_days: 56,
    status: 'active',
    ended_at: null,
    stopped_reason: null,
    outcome: null,
    indication: 'skin',
    food_label: 'Royal Canin Duck',
  };

  /** Drives the loader off in-memory rows: the trial, its allowed set, and one
   *  meal logged 28 days after the trial's start date — the clinic hand-off. */
  function stubDb(
    meals: Array<{ id: string; at: string; food: string | null }>,
    trialOver: Partial<typeof TRIAL_ROW> = {},
  ) {
    return {
      getFirstAsync: jest.fn().mockResolvedValue({ ...TRIAL_ROW, ...trialOver }),
      getAllAsync: jest.fn().mockImplementation((sql: string) => {
        if (sql.includes('diet_trial_foods')) {
          return Promise.resolve([{
            food_item_id: 'f1', role: 'primary_diet', food_label: 'Royal Canin Duck',
            allowed_from: '2026-07-03', allowed_until: null,
            brand: 'Royal Canin', product_name: 'Duck',
            primary_protein: 'duck', proteins: '["duck"]',
          }]);
        }
        if (sql.includes('FROM meals m')) {
          return Promise.resolve(meals.map((m) => ({
            event_id: m.id, occurred_at: m.at, food_item_id: m.food,
            brand: m.food ? 'Royal Canin' : null,
            product_name: m.food ? 'Duck' : null,
            food_type: 'meal', proteins: '["duck"]', intake_rating: 'all',
          })));
        }
        if (sql.includes('medication_administrations')) return Promise.resolve([]);
        if (sql.includes('feeding_arrangements')) return Promise.resolve([]);
        return Promise.resolve([]);
      }),
    };
  }

  async function load(
    meals: Parameters<typeof stubDb>[0],
    nowMs: number,
    trialOver: Partial<typeof TRIAL_ROW> = {},
  ) {
    jest.resetModules();
    const db = stubDb(meals, trialOver);
    jest.doMock('./db', () => ({ getDb: () => db }));
    jest.doMock('./analytics', () => ({
      getIntakeDecline: jest.fn().mockResolvedValue({ status: 'none', flags: [] }),
    }));
    jest.doMock('./trialContaminant', () => ({
      loadTrialProteinContext: jest.fn().mockResolvedValue(null),
      trialDietNote: jest.fn(),
    }));
    const mod = require('./dietTrialFacts') as typeof import('./dietTrialFacts');
    return mod.loadDietTrialFacts({
      pet: { id: 'pet-1', name: 'Biscuit', species: 'dog' },
      nowMs,
    });
  }

  // THE MERGE-BLOCKER, as a behavioural assertion. Trial back-dated to the
  // clinic visit; the owner starts logging 28 days later.
  it('carries the untracked head that explains its own clipped denominator', async () => {
    const input = await load(
      [
        { id: 'e1', at: new Date(2026, 6, 31, 8).toISOString(), food: 'f1' },
        { id: 'e2', at: new Date(2026, 7, 1, 8).toISOString(), food: 'f1' },
      ],
      new Date(2026, 7, 1, 20).getTime(),
    );
    // The clip is applied…
    expect(input.coverage).toEqual({ daysLogged: 2, daysElapsed: 2 });
    // …so the disclosure that explains it must be here too, with a real value.
    expect(input.untrackedDaysBeforeFirstLog).toBe(28);
  });

  // A trial logged from day 1 has no head, and must not invent one.
  it('reports no head when logging started with the trial', async () => {
    const input = await load(
      [
        { id: 'e1', at: new Date(2026, 6, 3, 8).toISOString(), food: 'f1' },
        { id: 'e2', at: new Date(2026, 6, 4, 8).toISOString(), food: 'f1' },
      ],
      new Date(2026, 6, 4, 20).getTime(),
    );
    expect(input.untrackedDaysBeforeFirstLog).toBe(0);
  });

  // The other field the split dropped and the source-text test could not see.
  it('carries the free-fed overlap flag as a value', async () => {
    const input = await load(
      [{ id: 'e1', at: new Date(2026, 6, 3, 8).toISOString(), food: 'f1' }],
      new Date(2026, 6, 4, 20).getTime(),
    );
    expect(input.freeFedOverlap).toBe(false);
    expect(input.allowedSetUnavailable).toBe(false);
    expect(input.exposures).not.toBeNull();
  });

  // A NULL RANGE IS NOT A ZERO RECORD.
  //
  // `computeTrialFacts` returns its all-zero `base` on the paths where it could
  // not establish a range at all — here, an `ended_at` that precedes
  // `started_at`. The loader read the record fields straight off that object, so
  // five logged feedings reached the card as `totalFeedings: 0` and it rendered
  // "0 feedings in total." — the app's own failure to compute, dressed as a
  // finding about the pet, in the reassuring direction.
  //
  // The start modal cannot produce this row; a sync or a hand-edited date can.
  describe('a range the module could not read', () => {
    const degenerate = { ended_at: '2026-06-01', status: 'completed' };
    const FIVE = [0, 1, 2, 3, 4].map((d) => ({
      id: `e${d}`, at: new Date(2026, 6, 4 + d, 8).toISOString(), food: 'f1',
    }));

    it('reports silence rather than a zero record', async () => {
      const input = await load(FIVE, new Date(2026, 6, 20, 20).getTime(), degenerate);
      // The pre-classifier shape: no claim in either direction.
      expect(input.exposures).toBeNull();
      expect(input.coverage).toBeNull();
      expect(input.belowCoverageFloor).toBe(false);
      expect(input.untrackedDaysBeforeFirstLog).toBe(0);
    });

    // …but the trial itself still renders, and so does everything computed off
    // the CONTEXT rather than the range. A range the app cannot read is not a
    // reason to go quiet about the animal.
    it('still carries the trial and the lanes that do not depend on a range', async () => {
      const input = await load(FIVE, new Date(2026, 6, 20, 20).getTime(), degenerate);
      expect(input.trial).not.toBeNull();
      expect(input.allowedSetUnavailable).toBe(false);
      expect(input).toHaveProperty('intakeDeclineHeadline');
    });

    // The same five meals over a WELL-FORMED range: proof the guard keys on the
    // range and not on the meals, and that it is not silently swallowing a
    // readable record.
    it('reports them as facts when the range is readable', async () => {
      const input = await load(FIVE, new Date(2026, 6, 20, 20).getTime());
      expect(input.exposures?.totalFeedings).toBe(5);
      expect(input.coverage).not.toBeNull();
    });
  });
});


// ── §5.6's free-choice bowls ────────────────────────────────────────────────
//
// The fourth predicate query, and the only one that reached `main` with no
// executable test: the last review pass read the overlap algebra, could not
// fault it, and declined to sign it off on exactly that ground. Every case below
// is a null combination over `active_from` / `active_until`, because those are
// what the algebra turns on and what a stub `getAllAsync` returning `[]` can
// never exercise.
//
// The direction that matters: this query feeding a bowl to the predicate is what
// WITHHOLDS the affirmative claim (`intakeNotDirectlyObserved`). A row it drops
// silently removes a reason the card is not allowed to say the record is clean —
// so a false negative here is the reassuring failure, and these tests exist to
// make it loud.
describe('ARRANGEMENTS_IN_WINDOW_SQL', () => {
  // The loader passes [petId, startKey, endKey, endKey] — `endKey` is null while
  // the trial is running and the end day once it is over.
  function run(db: Db, startKey: string, endKey: string | null) {
    return db
      .prepare(ARRANGEMENTS_IN_WINDOW_SQL)
      .all(PET, startKey, endKey, endKey) as Array<Record<string, unknown>>;
  }

  function seeded() {
    const db = freshDb() as unknown as Db;
    addFood(db, 'f-bowl', 'Purina', 'Kibble');
    return db;
  }

  it('keeps a bowl with NEITHER bound — no start, no end', () => {
    const db = seeded();
    addArrangement(db, 'a1', 'f-bowl', null, null);
    // Running trial…
    expect(run(db, '2026-07-03', null)).toHaveLength(1);
    // …and a finished one. An unbounded bowl overlaps every window.
    expect(run(db, '2026-07-03', '2026-08-27')).toHaveLength(1);
    db.close();
  });

  it('keeps a bowl that started before the trial and never ended', () => {
    const db = seeded();
    addArrangement(db, 'a1', 'f-bowl', '2026-01-01', null);
    expect(run(db, '2026-07-03', null)).toHaveLength(1);
    expect(run(db, '2026-07-03', '2026-08-27')).toHaveLength(1);
    db.close();
  });

  // The B-474 sub-floor case: the owner RECORDED the bowl's removal on day 3.
  // It overlapped, so it must still come back — the coverage denominator for
  // those days is unfair whether or not the bowl is there now.
  it('keeps a bowl removed DURING the trial', () => {
    const db = seeded();
    addArrangement(db, 'a1', 'f-bowl', '2026-06-01', '2026-07-06');
    expect(run(db, '2026-07-03', null)).toHaveLength(1);
    db.close();
  });

  it('drops a bowl that ended BEFORE the trial began', () => {
    const db = seeded();
    addArrangement(db, 'a1', 'f-bowl', '2026-05-01', '2026-07-02');
    expect(run(db, '2026-07-03', null)).toEqual([]);
    db.close();
  });

  // The boundary itself: `active_until >= startKey`, so a bowl removed ON day 1
  // was in force for part of day 1 and counts.
  it('keeps a bowl that ended ON the trial’s first day', () => {
    const db = seeded();
    addArrangement(db, 'a1', 'f-bowl', '2026-05-01', '2026-07-03');
    expect(run(db, '2026-07-03', null)).toHaveLength(1);
    db.close();
  });

  // The upper bound applies only once the trial has ended — `? IS NULL OR …`.
  // A bowl introduced after a FINISHED trial closed says nothing about it.
  it('drops a bowl that started after a finished trial ended', () => {
    const db = seeded();
    addArrangement(db, 'a1', 'f-bowl', '2026-09-01', null);
    expect(run(db, '2026-07-03', '2026-08-27')).toEqual([]);
    // …but the same row is in scope for a trial that is still running, because
    // there is no upper bound to compare it against.
    expect(run(db, '2026-07-03', null)).toHaveLength(1);
    db.close();
  });

  it('keeps a bowl that started ON the day a finished trial ended', () => {
    const db = seeded();
    addArrangement(db, 'a1', 'f-bowl', '2026-08-27', null);
    expect(run(db, '2026-07-03', '2026-08-27')).toHaveLength(1);
    db.close();
  });

  it('excludes a scheduled-feeding arrangement, another pet, and a soft delete', () => {
    const db = seeded();
    addArrangement(db, 'a1', 'f-bowl', null, null, { method: 'scheduled' });
    addArrangement(db, 'a2', 'f-bowl', null, null, { pet: OTHER_PET });
    addArrangement(db, 'a3', 'f-bowl', null, null, { deletedAt: '2026-07-04' });
    expect(run(db, '2026-07-03', null)).toEqual([]);
    db.close();
  });

  // The LEFT JOIN is load-bearing: a bowl whose food row has not synced must
  // still come back. `readArrangements` maps a null brand/product to a null key
  // and the predicate treats it as unmatched — dropping the row instead would
  // remove a reason the claim is withheld.
  it('keeps a bowl whose food row has not hydrated', () => {
    const db = freshDb() as unknown as Db;
    addArrangement(db, 'a1', 'f-missing', null, null);
    const rows = run(db, '2026-07-03', null);
    expect(rows).toHaveLength(1);
    expect(rows[0].brand).toBeNull();
    expect(rows[0].product_name).toBeNull();
    db.close();
  });
});
