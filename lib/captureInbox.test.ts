// Exercises the REAL inbox classification + ingest (lib/captureInbox.ts)
// against an in-memory SQLite. classifyInboxPayload is the pure trust boundary
// for everything the extension writes into the shared container — the record a
// widget tap becomes — and ingestCaptureRecords is the write that turns it into
// the same event+meal pair the app's own log flow produces. Both are the
// load-bearing new logic of B-290 (PR W3): the no-garbage rule (D2), the
// provenance narrowing, the no-lost-taps idempotency (§4.1 Q4), and the
// direct-REST-write reconciliation all live here.
//
// node:sqlite (Node ≥ 22) gives a real engine; a thin adapter wraps it in the
// async surface the production function declares (InboxDb) — the function under
// test is the real one, not a copy (the cacheFlush.test.ts pattern).

// captureInbox imports ./appGroup (expo-file-system) and ./signal (which pulls
// in the supabase client and its env guard); neither is used by the core ingest
// under test, so import-graph stubs are sufficient.
jest.mock('expo-file-system', () => ({
  Directory: class {},
  File: class {},
  Paths: { appleSharedContainers: {} },
}));
jest.mock('expo-sqlite', () => ({ openDatabaseSync: jest.fn() }));
jest.mock('./signal', () => ({ triggerSignalRegenDebounced: jest.fn() }));
jest.mock('./db', () => ({ getDb: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');
import {
  classifyInboxPayload,
  ingestCaptureRecords,
  CAPTURE_INBOX_SCHEMA_VERSION,
  INBOX_MAX_AGE_DAYS,
  type CaptureRecord,
  type InboxDb,
} from './captureInbox';

type RawDb = InstanceType<typeof DatabaseSync>;

function asyncAdapter(db: RawDb): InboxDb {
  return {
    async runAsync(sql: string, params: (string | number | null)[]): Promise<unknown> {
      return db.prepare(sql).run(...params);
    },
    async getFirstAsync<T>(sql: string, params: (string | number | null)[]): Promise<T | null> {
      return (db.prepare(sql).get(...params) as T) ?? null;
    },
  };
}

// Minimal mirrors of the columns the ingest writes/reads (lib/db.ts initDb).
function freshDb(): RawDb {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE events (
      id TEXT PRIMARY KEY, pet_id TEXT NOT NULL, event_type TEXT NOT NULL,
      occurred_at TEXT NOT NULL, severity INTEGER, notes TEXT,
      source TEXT NOT NULL DEFAULT 'manual',
      occurred_at_source TEXT NOT NULL DEFAULT 'manual',
      occurred_at_confidence TEXT, occurred_at_earliest TEXT, occurred_at_latest TEXT,
      logged_via TEXT NOT NULL DEFAULT 'app',
      deleted_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      synced INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE meals (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL UNIQUE REFERENCES events(id),
      pet_id TEXT NOT NULL, food_item_id TEXT,
      quantity TEXT NOT NULL DEFAULT 'unknown',
      is_full_portion INTEGER, notes TEXT, intake_rating TEXT,
      logged_via TEXT NOT NULL DEFAULT 'app',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      synced INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE food_items_cache (
      id TEXT PRIMARY KEY, brand TEXT, product_name TEXT, last_used_at TEXT
    );
  `);
  return db;
}

const PET = '11111111-1111-4111-9111-111111111111';
const FOOD = '22222222-2222-4222-9222-222222222222';
const EVT = '33333333-3333-4333-9333-333333333333';
const MEAL = '44444444-4444-4444-9444-444444444444';

function validRecord(overrides: Partial<CaptureRecord> = {}): CaptureRecord {
  return {
    schemaVersion: CAPTURE_INBOX_SCHEMA_VERSION,
    id: EVT,
    mealId: MEAL,
    kind: 'meal',
    petId: PET,
    foodItemId: FOOD,
    occurredAt: '2026-07-24T18:00:00.000Z',
    createdAt: '2026-07-24T18:00:00.000Z',
    loggedVia: 'widget',
    ...overrides,
  };
}

const NOW = new Date('2026-07-24T20:00:00.000Z');

describe('classifyInboxPayload (the extension→app trust boundary)', () => {
  it('accepts a well-formed v1 record', () => {
    const out = classifyInboxPayload(JSON.stringify(validRecord()));
    expect(out.status).toBe('valid');
    if (out.status === 'valid') expect(out.record.foodItemId).toBe(FOOD);
  });

  it('drops malformed JSON — it can never become ingestible', () => {
    expect(classifyInboxPayload('{not json').status).toBe('drop');
    expect(classifyInboxPayload('"just a string"').status).toBe('drop');
  });

  it('defers a record from a NEWER schema version (extension binary ahead of app JS)', () => {
    const out = classifyInboxPayload(
      JSON.stringify(validRecord({ schemaVersion: CAPTURE_INBOX_SCHEMA_VERSION + 1 })),
    );
    expect(out.status).toBe('defer');
  });

  it('defers an unknown kind (bowl_topup is reserved for W4) rather than destroying it', () => {
    const raw = JSON.stringify({ ...validRecord(), kind: 'bowl_topup' });
    expect(classifyInboxPayload(raw).status).toBe('defer');
  });

  it("enforces the no-garbage rule: a record without a named food can't exist", () => {
    const { foodItemId: _dropped, ...rest } = validRecord();
    expect(classifyInboxPayload(JSON.stringify(rest)).status).toBe('drop');
    expect(
      classifyInboxPayload(JSON.stringify(validRecord({ foodItemId: 'not-a-uuid' }))).status,
    ).toBe('drop');
  });

  it("drops forged provenance — an inbox record may never claim 'app'", () => {
    const raw = JSON.stringify({ ...validRecord(), loggedVia: 'app' });
    expect(classifyInboxPayload(raw).status).toBe('drop');
  });

  it('accepts both inbox surfaces (widget, intent)', () => {
    expect(classifyInboxPayload(JSON.stringify(validRecord({ loggedVia: 'intent' }))).status).toBe(
      'valid',
    );
  });

  it('drops unparseable timestamps and malformed row ids', () => {
    expect(
      classifyInboxPayload(JSON.stringify(validRecord({ occurredAt: 'yesterdayish' }))).status,
    ).toBe('drop');
    expect(classifyInboxPayload(JSON.stringify(validRecord({ id: 'evt-1' }))).status).toBe('drop');
  });
});

describe('ingestCaptureRecords (inbox → SQLite + sync queue)', () => {
  let raw: RawDb;
  let db: InboxDb;

  beforeEach(() => {
    raw = freshDb();
    db = asyncAdapter(raw);
    raw
      .prepare(`INSERT INTO food_items_cache (id, brand, product_name) VALUES (?, 'Hill''s', 'z/d')`)
      .run(FOOD);
  });

  const files = (...records: (CaptureRecord | string)[]) =>
    records.map((r, i) => ({
      name: `${i}.json`,
      raw: typeof r === 'string' ? r : JSON.stringify(r),
    }));

  it('writes the insertMeal-shaped event+meal pair: queued (synced=0), provenance stamped, unrated', async () => {
    const decisions = await ingestCaptureRecords(db, files(validRecord()), new Set([PET]), NOW);
    expect(decisions).toEqual([{ name: '0.json', action: 'applied', petId: PET }]);

    const evt = raw.prepare('SELECT * FROM events WHERE id = ?').get(EVT) as Record<string, unknown>;
    expect(evt.event_type).toBe('meal');
    expect(evt.logged_via).toBe('widget');
    expect(evt.synced).toBe(0); // rides the next push
    expect(evt.occurred_at_confidence).toBe('witnessed');
    expect(evt.occurred_at_source).toBe('now');

    const meal = raw.prepare('SELECT * FROM meals WHERE id = ?').get(MEAL) as Record<string, unknown>;
    expect(meal.event_id).toBe(EVT);
    expect(meal.food_item_id).toBe(FOOD);
    expect(meal.logged_via).toBe('widget');
    expect(meal.quantity).toBe('unknown'); // assumed portion (spec §2.3)…
    expect(meal.intake_rating).toBeNull(); // …never a witnessed rating (§3)
    expect(meal.synced).toBe(0);

    const food = raw.prepare('SELECT last_used_at FROM food_items_cache WHERE id = ?').get(FOOD) as {
      last_used_at: string | null;
    };
    expect(food.last_used_at).not.toBeNull(); // recency touched, insertMeal parity
  });

  it('is idempotent: re-ingesting the same record (crash between apply and delete) writes nothing new', async () => {
    await ingestCaptureRecords(db, files(validRecord()), new Set([PET]), NOW);
    const decisions = await ingestCaptureRecords(db, files(validRecord()), new Set([PET]), NOW);

    expect(decisions[0].action).toBe('applied'); // so the wrapper deletes the file
    expect((raw.prepare('SELECT COUNT(*) AS n FROM events').get() as { n: number }).n).toBe(1);
    expect((raw.prepare('SELECT COUNT(*) AS n FROM meals').get() as { n: number }).n).toBe(1);
  });

  it('never clobbers an existing row — a direct REST write that already hydrated wins untouched', async () => {
    // The intent wrote straight to Supabase while online; a sync cycle hydrated
    // the row locally (synced=1) BEFORE the inbox file was ingested.
    raw
      .prepare(
        `INSERT INTO events (id, pet_id, event_type, occurred_at, logged_via, created_at, updated_at, synced)
         VALUES (?, ?, 'meal', '2026-07-24T18:00:00.000Z', 'intent', 'c', 'u', 1)`,
      )
      .run(EVT, PET);

    await ingestCaptureRecords(db, files(validRecord({ loggedVia: 'intent' })), new Set([PET]), NOW);

    const evt = raw.prepare('SELECT synced FROM events WHERE id = ?').get(EVT) as { synced: number };
    expect(evt.synced).toBe(1); // untouched — an inbox record is a creation, never an edit
  });

  it('defers the whole pass when no pets are loaded (never misjudges records against an empty list)', async () => {
    const decisions = await ingestCaptureRecords(db, files(validRecord()), new Set(), NOW);
    expect(decisions[0].action).toBe('deferred');
    expect((raw.prepare('SELECT COUNT(*) AS n FROM events').get() as { n: number }).n).toBe(0);
  });

  it("defers a record naming a pet outside the account — never writes into this account's record", async () => {
    const foreign = validRecord({ petId: '99999999-9999-4999-9999-999999999999' });
    const decisions = await ingestCaptureRecords(db, files(foreign), new Set([PET]), NOW);
    expect(decisions[0].action).toBe('deferred');
    expect((raw.prepare('SELECT COUNT(*) AS n FROM events').get() as { n: number }).n).toBe(0);
  });

  it('defers a record whose food is not in the cache (a pushed meal would FK-poison the queue)', async () => {
    const unknownFood = validRecord({ foodItemId: '55555555-5555-4555-9555-555555555555' });
    const decisions = await ingestCaptureRecords(db, files(unknownFood), new Set([PET]), NOW);
    expect(decisions[0].action).toBe('deferred');
  });

  it('drops an aged-out deferral instead of deferring forever', async () => {
    const staleCreated = new Date(
      NOW.getTime() - (INBOX_MAX_AGE_DAYS + 1) * 24 * 60 * 60 * 1000,
    ).toISOString();
    // A record that would otherwise defer (foreign pet) but is past the window.
    const stale = validRecord({
      petId: '99999999-9999-4999-9999-999999999999',
      createdAt: staleCreated,
    });
    const decisions = await ingestCaptureRecords(db, files(stale), new Set([PET]), NOW);
    expect(decisions[0].action).toBe('dropped');
  });

  it('processes a mixed batch independently — one bad file strands nothing', async () => {
    const other = validRecord({
      id: '66666666-6666-4666-9666-666666666666',
      mealId: '77777777-7777-4777-9777-777777777777',
      kind: 'treat',
    });
    const decisions = await ingestCaptureRecords(
      db,
      files('{broken', validRecord(), other),
      new Set([PET]),
      NOW,
    );
    expect(decisions.map((d) => d.action)).toEqual(['dropped', 'applied', 'applied']);
    expect((raw.prepare('SELECT COUNT(*) AS n FROM meals').get() as { n: number }).n).toBe(2);
  });
});
