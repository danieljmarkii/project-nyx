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
// CUL-2542: `File` records each sidecar stamp write, so the wrapper suite can assert the
// first-deferral stamp the ingest leaves beside a record.
const mockStampWrites: { name: string; text: string }[] = [];
jest.mock('expo-file-system', () => ({
  Directory: class {},
  File: class {
    name: string;
    constructor(_dir: unknown, name: string) {
      this.name = name;
    }
    write(text: string) {
      mockStampWrites.push({ name: this.name, text });
    }
  },
  Paths: { appleSharedContainers: {} },
}));
jest.mock('expo-sqlite', () => ({ openDatabaseSync: jest.fn() }));
jest.mock('./signal', () => ({ triggerSignalRegenDebounced: jest.fn() }));
jest.mock('./db', () => ({ getDb: jest.fn() }));
// The wrapper suite drives the inbox through a fake directory; everything else
// leaves it returning null (wrapper no-ops, core functions don't touch it).
jest.mock('./appGroup', () => ({
  APP_GROUP_ID: 'group.test',
  getCaptureInboxDirectory: jest.fn(() => null),
  getSnapshotDirectory: jest.fn(() => null),
  clearWidgetData: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');

import { BASE_SCHEMA_SQL, applyColumnUpgrades } from './localSchema';
import {
  classifyInboxPayload,
  countUnclaimedInbox,
  countUnclaimedInboxPayloads,
  readUnclaimedInbox,
  summarizeUnclaimedInboxPayloads,
  withUnclaimedInbox,
  UNKNOWN_AGE_PENDING_AT,
  ingestCaptureRecords,
  ingestCaptureInbox,
  inboxFileSortKey,
  CAPTURE_INBOX_SCHEMA_VERSION,
  INBOX_MAX_AGE_DAYS,
  INBOX_DEFERRAL_STAMP_SUFFIX,
  MAX_INGEST_PER_PASS,
  withArchivedPetIds,
  type BowlTopUpCaptureRecord,
  type CaptureRecord,
  type MealCaptureRecord,
  type InboxDb,
} from './captureInbox';
import { getCaptureInboxDirectory } from './appGroup';
import { getDb } from './db';
import { notifySignedOut } from './signOutEpoch';
import { triggerSignalRegenDebounced } from './signal';
import { usePetStore } from '../store/petStore';

type RawDb = InstanceType<typeof DatabaseSync>;

function asyncAdapter(db: RawDb): InboxDb {
  return {
    async runAsync(sql: string, params: (string | number | null)[]): Promise<unknown> {
      return db.prepare(sql).run(...params);
    },
    async getFirstAsync<T>(sql: string, params: (string | number | null)[]): Promise<T | null> {
      return (db.prepare(sql).get(...params) as T) ?? null;
    },
    async getAllAsync<T>(sql: string, params: (string | number | null)[]): Promise<T[]> {
      return db.prepare(sql).all(...params) as T[];
    },
  };
}

// The REAL local DDL, not an approximation. This block used to hand-mirror "the
// columns the ingest writes/reads", which is exactly the drift B-424 removed from
// the wipe guard: B-398 added `sync_attempts`/`sync_error` to the production
// schema and this copy silently diverged until the ingest's own UPDATE failed on
// it. Building from BASE_SCHEMA_SQL means a column added to the real schema is
// present here for free — and a column the ingest needs that the schema lacks now
// fails loudly instead of passing against a fixture.
//
// One deliberate deviation: feeding_arrangements rows are seeded as already-synced
// in these tests (the D6 re-attest asserts the ingest flips a SYNCED row back to
// 0), so the seed sets `synced` explicitly rather than relying on the DDL default.
function freshDb(): RawDb {
  const db = new DatabaseSync(':memory:');
  db.exec(BASE_SCHEMA_SQL);
  // The runtime schema is the DDL constants PLUS initDb's column upgrades — a
  // column added by ALTER (intake_rating, logged_via, occurred_at_source, the
  // B-398 quarantine pair) exists on every real device and in none of the
  // constants. Applying both is what makes this the genuine article. Synchronous
  // node:sqlite exec wrapped to the async signature; the promise resolves before
  // any test body runs because nothing here awaits I/O.
  void applyColumnUpgrades(async (sql) => db.exec(sql));
  return db;
}

const PET = '11111111-1111-4111-9111-111111111111';
const FOOD = '22222222-2222-4222-9222-222222222222';
const EVT = '33333333-3333-4333-9333-333333333333';
const MEAL = '44444444-4444-4444-9444-444444444444';

function validRecord(overrides: Partial<MealCaptureRecord> = {}): MealCaptureRecord {
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

function topUpRecord(overrides: Partial<BowlTopUpCaptureRecord> = {}): BowlTopUpCaptureRecord {
  return {
    schemaVersion: CAPTURE_INBOX_SCHEMA_VERSION,
    id: EVT,
    kind: 'bowl_topup',
    petId: PET,
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
    if (out.status === 'valid' && out.record.kind !== 'bowl_topup') {
      expect(out.record.foodItemId).toBe(FOOD);
    }
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

  it('defers an unknown kind (the next W-track addition) rather than destroying it', () => {
    const raw = JSON.stringify({ ...validRecord(), kind: 'water_refill' });
    expect(classifyInboxPayload(raw).status).toBe('defer');
  });

  it("accepts a bowl_topup record — no mealId/foodItemId, it names the standing fact (D6)", () => {
    const out = classifyInboxPayload(JSON.stringify(topUpRecord()));
    expect(out.status).toBe('valid');
    if (out.status === 'valid') expect(out.record.kind).toBe('bowl_topup');
  });

  it('still validates ids/timestamps/provenance on a bowl_topup', () => {
    expect(classifyInboxPayload(JSON.stringify(topUpRecord({ id: 'nope' }))).status).toBe('drop');
    expect(
      classifyInboxPayload(JSON.stringify(topUpRecord({ occurredAt: 'whenever' }))).status,
    ).toBe('drop');
    expect(
      classifyInboxPayload(JSON.stringify({ ...topUpRecord(), loggedVia: 'app' })).status,
    ).toBe('drop');
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

  it('normalizes offset-form timestamps to canonical UTC Z-form at the boundary (stored-UTC constraint)', () => {
    const out = classifyInboxPayload(
      JSON.stringify(validRecord({ occurredAt: '2026-07-24T14:00:00-04:00' })),
    );
    expect(out.status).toBe('valid');
    if (out.status === 'valid') {
      expect(out.record.occurredAt).toBe('2026-07-24T18:00:00.000Z');
    }
  });
});

describe('inboxFileSortKey (FIFO ordering)', () => {
  it('orders by the record createdAt; unparseable files sort last', () => {
    const older = JSON.stringify(validRecord({ createdAt: '2026-07-24T10:00:00.000Z' }));
    const newer = JSON.stringify(validRecord({ createdAt: '2026-07-24T12:00:00.000Z' }));
    expect(inboxFileSortKey(older)).toBeLessThan(inboxFileSortKey(newer));
    expect(inboxFileSortKey('{broken')).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('ingestCaptureRecords (inbox → SQLite + sync queue)', () => {
  let raw: RawDb;
  let db: InboxDb;

  beforeEach(() => {
    raw = freshDb();
    db = asyncAdapter(raw);
    raw
      .prepare(`INSERT INTO food_items_cache (id, brand, product_name, format) VALUES (?, 'Hill''s', 'z/d', 'wet')`)
      .run(FOOD);
  });

  const files = (...records: (CaptureRecord | string)[]) =>
    records.map((r, i) => ({
      name: `${i}.json`,
      raw: typeof r === 'string' ? r : JSON.stringify(r),
    }));
  // CUL-2542: the same files, each carrying a first-deferral stamp (the sidecar's time).
  const stampedFiles = (firstDeferredAt: string, ...records: (CaptureRecord | string)[]) =>
    files(...records).map((f) => ({ ...f, firstDeferredAt }));
  const daysBefore = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

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
    const decisions = await ingestCaptureRecords(
      db,
      stampedFiles(daysBefore(INBOX_MAX_AGE_DAYS + 1), stale),
      new Set([PET]),
      NOW,
    );
    expect(decisions[0].action).toBe('dropped');
  });

  // CUL-2503: the age check used to run FIRST, so a capture the app could apply was dropped
  // once it was 45 days old. Only a record that cannot land ages out now.
  describe('age-out drops only what cannot land (CUL-2503)', () => {
    const staleCreated = () =>
      new Date(NOW.getTime() - (INBOX_MAX_AGE_DAYS + 1) * 24 * 60 * 60 * 1000).toISOString();

    it("applies a 46-day-old treat for the account's own pet whose food is cached", async () => {
      const old = validRecord({ kind: 'treat', createdAt: staleCreated(), occurredAt: staleCreated() });
      const decisions = await ingestCaptureRecords(db, files(old), new Set([PET]), NOW);
      expect(decisions).toEqual([{ name: '0.json', action: 'applied', petId: PET }]);
      expect((raw.prepare('SELECT COUNT(*) AS n FROM meals').get() as { n: number }).n).toBe(1);
    });

    it('clamps a tap stamped in the future to the ingest time (adversarial pass 2)', async () => {
      const ahead = new Date(NOW.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString();
      await ingestCaptureRecords(db, files(validRecord({ createdAt: ahead })), new Set([PET]), NOW);
      const evt = raw.prepare('SELECT updated_at FROM events WHERE id = ?').get(EVT) as { updated_at: string };
      const meal = raw.prepare('SELECT updated_at FROM meals WHERE id = ?').get(MEAL) as { updated_at: string };
      expect(evt.updated_at).toBe(NOW.toISOString());
      expect(meal.updated_at).toBe(NOW.toISOString());
    });

    it('stamps the TAP time as updated_at, so an old capture still pending ages from its tap (CUL-2489)', async () => {
      // Every pending count (and the SyncBanner's over-a-day line) ages a row from updated_at.
      // Stamped with the ingest time, a capture tapped days ago restarted that clock.
      const tapped = '2026-07-21T08:00:00.000Z';
      await ingestCaptureRecords(db, files(validRecord({ createdAt: tapped })), new Set([PET]), NOW);
      const evt = raw.prepare('SELECT updated_at FROM events WHERE id = ?').get(EVT) as { updated_at: string };
      const meal = raw.prepare('SELECT updated_at FROM meals WHERE id = ?').get(MEAL) as { updated_at: string };
      expect(evt.updated_at).toBe(tapped);
      expect(meal.updated_at).toBe(tapped);
      expect(NOW.toISOString()).not.toBe(tapped);
    });

    it('drops the same record when its food is not cached (it cannot land)', async () => {
      const old = validRecord({
        createdAt: staleCreated(),
        foodItemId: '55555555-5555-4555-9555-555555555555',
      });
      const decisions = await ingestCaptureRecords(db, stampedFiles(staleCreated(), old), new Set([PET]), NOW);
      expect(decisions[0].action).toBe('dropped');
      expect(decisions[0].reason).toBe('aged out (food not in cache)');
    });

    it('defers, never drops, an old valid record held back only by the pass cap', async () => {
      const second = validRecord({
        id: '66666666-6666-4666-9666-666666666666',
        mealId: '77777777-7777-4777-9777-777777777777',
        createdAt: staleCreated(),
      });
      const decisions = await ingestCaptureRecords(
        db,
        files(validRecord({ createdAt: staleCreated() }), second),
        new Set([PET]),
        NOW,
        1,
      );
      expect(decisions.map((d) => [d.action, d.reason])).toEqual([
        ['applied', undefined],
        ['deferred', 'pass cap'],
      ]);
    });

    it('defers, never drops, an old valid record the sign-out fence stopped', async () => {
      const decisions = await ingestCaptureRecords(
        db,
        files(validRecord({ createdAt: staleCreated() })),
        new Set([PET]),
        NOW,
        MAX_INGEST_PER_PASS,
        () => true,
      );
      expect(decisions).toEqual([{ name: '0.json', action: 'deferred', reason: 'signed out' }]);
    });

    it('keeps a classify-level deferral (a newer schema) however old it is', async () => {
      const newer = validRecord({
        schemaVersion: CAPTURE_INBOX_SCHEMA_VERSION + 1,
        createdAt: staleCreated(),
      });
      const decisions = await ingestCaptureRecords(db, files(newer), new Set([PET]), NOW);
      expect(decisions[0].action).toBe('deferred');
    });

    it('a record one second inside the window still defers when it cannot land', async () => {
      const edge = new Date(NOW.getTime() - INBOX_MAX_AGE_DAYS * 24 * 60 * 60 * 1000 + 1000).toISOString();
      const foreign = validRecord({ petId: '99999999-9999-4999-9999-999999999999', createdAt: edge });
      const decisions = await ingestCaptureRecords(db, files(foreign), new Set([PET]), NOW);
      expect(decisions[0]).toMatchObject({ action: 'deferred', reason: 'pet not in account' });
    });
  });

  // CUL-2542: the 45 days run from the FIRST pass that found a record unusable (its sidecar
  // stamp), never from its tap. Every fixture here is a capture tapped long ago whose food
  // is missing for the moment: the case the tap-age rule dropped on first sight.
  describe('age-out counts from the first deferral, never the tap (CUL-2542)', () => {
    const MISSING_FOOD = '55555555-5555-4555-9555-555555555555';
    const tappedLongAgo = () =>
      validRecord({ foodItemId: MISSING_FOOD, createdAt: daysBefore(200), occurredAt: daysBefore(200) });

    it('defers a 200-day-old capture on its first unusable pass, marked for a stamp', async () => {
      const decisions = await ingestCaptureRecords(db, files(tappedLongAgo()), new Set([PET]), NOW);
      expect(decisions).toEqual([
        { name: '0.json', action: 'deferred', reason: 'food not in cache', unusable: true },
      ]);
    });

    it('keeps it through day 45 of deferral and drops it after', async () => {
      // Derived from the shipped constant, one second either side of the boundary.
      const inside = new Date(NOW.getTime() - INBOX_MAX_AGE_DAYS * 86_400_000 + 1000).toISOString();
      const past = new Date(NOW.getTime() - INBOX_MAX_AGE_DAYS * 86_400_000 - 1000).toISOString();
      const kept = await ingestCaptureRecords(db, stampedFiles(inside, tappedLongAgo()), new Set([PET]), NOW);
      expect(kept[0]).toMatchObject({ action: 'deferred', unusable: true });
      const gone = await ingestCaptureRecords(db, stampedFiles(past, tappedLongAgo()), new Set([PET]), NOW);
      expect(gone[0]).toMatchObject({ action: 'dropped', reason: 'aged out (food not in cache)' });
    });

    it('a stamp it cannot read, or one in the future, never ages the record', async () => {
      for (const stamp of ['not-a-date', '', daysBefore(-400)]) {
        const d = await ingestCaptureRecords(db, stampedFiles(stamp, tappedLongAgo()), new Set([PET]), NOW);
        expect(d[0]).toMatchObject({ action: 'deferred', unusable: true });
      }
    });

    it('applies a long-deferred capture the moment its food arrives, however old the stamp', async () => {
      raw
        .prepare(`INSERT INTO food_items_cache (id, brand, product_name, format) VALUES (?, 'B', 'P', 'dry')`)
        .run(MISSING_FOOD);
      const d = await ingestCaptureRecords(db, stampedFiles(daysBefore(400), tappedLongAgo()), new Set([PET]), NOW);
      expect(d[0].action).toBe('applied');
    });

    it('a deferral about the pass (cap, sign-out, no pets) is never marked for a stamp', async () => {
      const capped = await ingestCaptureRecords(
        db,
        files(validRecord(), validRecord({ id: uuidAt(1, 'a'), mealId: uuidAt(1, 'b') })),
        new Set([PET]),
        NOW,
        1,
      );
      expect(capped[1]).toEqual({ name: '1.json', action: 'deferred', reason: 'pass cap' });
      const fenced = await ingestCaptureRecords(db, files(validRecord()), new Set([PET]), NOW, 200, () => true);
      expect(fenced[0].unusable).toBeUndefined();
      const empty = await ingestCaptureRecords(db, files(validRecord()), new Set(), NOW);
      expect(empty[0].unusable).toBeUndefined();
    });
  });

  it('caps APPLIES per pass, not classification — a deferral never consumes the budget', async () => {
    const second = validRecord({
      id: '66666666-6666-4666-9666-666666666666',
      mealId: '77777777-7777-4777-9777-777777777777',
    });
    const deferrable = validRecord({
      id: '88888888-8888-4888-9888-888888888888',
      mealId: '99999999-9999-4999-9999-999999999999',
      petId: '99999999-9999-4999-9999-999999999999', // foreign pet → defers
    });
    const decisions = await ingestCaptureRecords(
      db,
      files(deferrable, validRecord(), second),
      new Set([PET]),
      NOW,
      1, // apply budget of one this pass
    );
    // The deferral cost nothing; the first valid record used the budget; the
    // second valid record waits for the next pass (deferred, file left alone).
    expect(decisions.map((d) => d.action)).toEqual(['deferred', 'applied', 'deferred']);
    expect(decisions[2].reason).toBe('pass cap');
    expect((raw.prepare('SELECT COUNT(*) AS n FROM meals').get() as { n: number }).n).toBe(1);
  });

  describe('bowl_topup (the D6 arrangement re-attest)', () => {
    const ARR = 'aaaaaaaa-aaaa-4aaa-9aaa-aaaaaaaaaaaa';
    const OLD_STAMP = '2026-07-20T09:00:00.000Z';

    function insertArrangement(overrides: { active_until?: string | null; deleted_at?: string | null } = {}) {
      raw
        .prepare(
          `INSERT INTO feeding_arrangements
             (id, pet_id, food_item_id, method, active_until, deleted_at, created_at, updated_at, synced)
           VALUES (?, ?, ?, 'free_choice', ?, ?, ?, ?, 1)`,
        )
        .run(ARR, PET, FOOD, overrides.active_until ?? null, overrides.deleted_at ?? null, OLD_STAMP, OLD_STAMP);
    }

    it('CUL-2503: applies a 46-day-old top-up while its free-fed bowl is active, drops it once none is', async () => {
      const stale = new Date(NOW.getTime() - (INBOX_MAX_AGE_DAYS + 1) * 24 * 60 * 60 * 1000).toISOString();
      const old = topUpRecord({ createdAt: stale, occurredAt: stale });
      const none = await ingestCaptureRecords(db, stampedFiles(stale, old), new Set([PET]), NOW);
      expect(none[0]).toMatchObject({ action: 'dropped', reason: 'aged out (no active free-fed arrangement)' });
      insertArrangement();
      const some = await ingestCaptureRecords(db, files(old), new Set([PET]), NOW);
      expect(some[0].action).toBe('applied');
    });

    it('bumps the active arrangement to the TAP time, queues the push, writes no event/meal/rating', async () => {
      insertArrangement();
      const decisions = await ingestCaptureRecords(db, files(topUpRecord()), new Set([PET]), NOW);
      // No petId on the decision: applied, but a freshness bump must not
      // trigger a Signal regen.
      expect(decisions).toEqual([{ name: '0.json', action: 'applied' }]);

      const arr = raw.prepare('SELECT updated_at, synced FROM feeding_arrangements WHERE id = ?').get(ARR) as {
        updated_at: string; synced: number;
      };
      expect(arr.updated_at).toBe('2026-07-24T18:00:00.000Z'); // the tap time
      expect(arr.synced).toBe(0); // rides syncPendingFeedingArrangements
      // Never an intake claim (D6): nothing else was written.
      expect((raw.prepare('SELECT COUNT(*) AS n FROM events').get() as { n: number }).n).toBe(0);
      expect((raw.prepare('SELECT COUNT(*) AS n FROM meals').get() as { n: number }).n).toBe(0);
    });

    it('never moves freshness BACKWARDS — an in-app re-attest newer than the tap wins', async () => {
      insertArrangement();
      raw.prepare('UPDATE feeding_arrangements SET updated_at = ? WHERE id = ?').run(
        '2026-07-24T19:30:00.000Z', // the owner re-attested in-app AFTER the offline tap
        ARR,
      );
      const decisions = await ingestCaptureRecords(db, files(topUpRecord()), new Set([PET]), NOW);
      expect(decisions[0].action).toBe('applied'); // file consumed — the newer stamp stands
      const arr = raw.prepare('SELECT updated_at, synced FROM feeding_arrangements WHERE id = ?').get(ARR) as {
        updated_at: string; synced: number;
      };
      expect(arr.updated_at).toBe('2026-07-24T19:30:00.000Z');
      expect(arr.synced).toBe(1); // untouched — no spurious push
    });

    it('compares freshness by PARSED time across mixed formats — never lexical SQL (B-055 class)', async () => {
      insertArrangement();
      // Hydrated PostgREST offset form, chronologically NEWER than the tap
      // (18:00:00Z) — lexically '2026-07-24T18:00:30.123456+00:00' vs
      // '2026-07-24T18:00:00.000Z' is format-dependent; parsed ms must decide,
      // and the newer in-app stamp must survive.
      raw.prepare('UPDATE feeding_arrangements SET updated_at = ? WHERE id = ?').run(
        '2026-07-24T18:00:30.123456+00:00',
        ARR,
      );
      await ingestCaptureRecords(db, files(topUpRecord()), new Set([PET]), NOW);
      const newer = raw.prepare('SELECT updated_at FROM feeding_arrangements WHERE id = ?').get(ARR) as {
        updated_at: string;
      };
      expect(newer.updated_at).toBe('2026-07-24T18:00:30.123456+00:00');

      // And the mirror case: an offset-form stamp chronologically OLDER than
      // the tap must be bumped even if it lexically sorts after it.
      raw.prepare('UPDATE feeding_arrangements SET updated_at = ? WHERE id = ?').run(
        '2026-07-24T17:59:59.999999+00:00',
        ARR,
      );
      await ingestCaptureRecords(db, files(topUpRecord()), new Set([PET]), NOW);
      const bumped = raw.prepare('SELECT updated_at FROM feeding_arrangements WHERE id = ?').get(ARR) as {
        updated_at: string;
      };
      expect(bumped.updated_at).toBe('2026-07-24T18:00:00.000Z');
    });

    it('is idempotent on re-ingest (crash between apply and delete)', async () => {
      insertArrangement();
      await ingestCaptureRecords(db, files(topUpRecord()), new Set([PET]), NOW);
      raw.prepare('UPDATE feeding_arrangements SET synced = 1 WHERE id = ?').run(ARR); // push happened
      const decisions = await ingestCaptureRecords(db, files(topUpRecord()), new Set([PET]), NOW);
      expect(decisions[0].action).toBe('applied');
      const arr = raw.prepare('SELECT synced FROM feeding_arrangements WHERE id = ?').get(ARR) as { synced: number };
      expect(arr.synced).toBe(1); // the guard made the re-apply a true no-op
    });

    it('defers when the pet has no active free-fed arrangement (ended, deleted, or not yet hydrated)', async () => {
      insertArrangement({ active_until: '2026-07-22' });
      const decisions = await ingestCaptureRecords(db, files(topUpRecord()), new Set([PET]), NOW);
      expect(decisions[0].action).toBe('deferred');
      const arr = raw.prepare('SELECT updated_at FROM feeding_arrangements WHERE id = ?').get(ARR) as {
        updated_at: string;
      };
      expect(arr.updated_at).toBe(OLD_STAMP); // an ended bowl is never re-attested
    });

    it('still honors the pet allowlist and the apply budget', async () => {
      insertArrangement();
      const foreign = topUpRecord({ petId: '99999999-9999-4999-9999-999999999999' });
      expect(
        (await ingestCaptureRecords(db, files(foreign), new Set([PET]), NOW))[0].action,
      ).toBe('deferred');
      const capped = await ingestCaptureRecords(
        db,
        files(validRecord(), topUpRecord({ id: '66666666-6666-4666-9666-666666666666' })),
        new Set([PET]),
        NOW,
        1,
      );
      expect(capped.map((d) => d.action)).toEqual(['applied', 'deferred']);
      expect(capped[1].reason).toBe('pass cap');
    });
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

// ── The file-system wrapper (ingestCaptureInbox) over a fake inbox directory ──
// The core above is exercised against real SQL; this suite pins the wrapper's
// own load-bearing behavior: FIFO ordering under the apply cap (the starvation
// class), and the delete-applied/delete-dropped/leave-deferred file lifecycle.

interface FakeFile {
  name: string;
  deleted: boolean;
  textSync(): string;
  delete(): void;
}

function fakeFile(name: string, raw: string): FakeFile {
  const f: FakeFile = {
    name,
    deleted: false,
    textSync: () => raw,
    delete: () => {
      f.deleted = true;
    },
  };
  return f;
}

// Distinct valid uuids from an index (decimal digits are valid hex).
const uuidAt = (i: number, nibble: string) =>
  `${String(i).padStart(8, '0')}-0000-4000-8000-${nibble.repeat(12)}`;

describe('ingestCaptureInbox (wrapper: ordering + file lifecycle)', () => {
  let raw: RawDb;

  // The wrapper reads the REAL clock for its age-out check (INBOX_MAX_AGE_DAYS
  // = 45), unlike the suites above, which are handed an explicit `now`. So a
  // wrapper fixture pinned to an absolute date silently ages out 45 days after
  // that date and the suite starts failing on a calendar boundary — this one
  // did, on 2026-09-07, 45 days after its 2026-07-24 fixtures. Anchor wrapper
  // fixtures to now instead. Per CLAUDE.md's B-514 rule the production
  // signature is NOT widened to take a `now` just to make this pinnable.
  const freshIso = (msAgo = 60_000) => new Date(Date.now() - msAgo).toISOString();
  const freshRecord = (overrides: Partial<MealCaptureRecord> = {}) =>
    validRecord({ occurredAt: freshIso(), createdAt: freshIso(), ...overrides });

  beforeEach(() => {
    raw = freshDb();
    raw
      .prepare(`INSERT INTO food_items_cache (id, brand, product_name, format) VALUES (?, 'Hill''s', 'z/d', 'wet')`)
      .run(FOOD);
    (getDb as jest.Mock).mockReturnValue(asyncAdapter(raw));
  });

  function installInbox(entries: FakeFile[]) {
    (getCaptureInboxDirectory as jest.Mock).mockReturnValue({ list: () => entries });
  }

  it('deletes applied and dropped files, leaves deferred ones for the next pass', async () => {
    const applied = fakeFile('a.json', JSON.stringify(freshRecord()));
    const dropped = fakeFile('b.json', '{broken');
    const deferred = fakeFile(
      'c.json',
      JSON.stringify(
        freshRecord({
          id: '66666666-6666-4666-9666-666666666666',
          mealId: '77777777-7777-4777-9777-777777777777',
          petId: '99999999-9999-4999-9999-999999999999', // foreign pet
        }),
      ),
    );
    const ignored = fakeFile('readme.txt', 'not a record');
    installInbox([applied, dropped, deferred, ignored]);

    await ingestCaptureInbox(new Set([PET]));

    expect(applied.deleted).toBe(true);
    expect(dropped.deleted).toBe(true);
    expect(deferred.deleted).toBe(false); // waits for the pet to appear / age-out
    expect(ignored.deleted).toBe(false); // non-.json is never touched
    expect((raw.prepare('SELECT COUNT(*) AS n FROM events').get() as { n: number }).n).toBe(1);
  });

  it('drains oldest-first under the apply cap — a newest-first listing cannot starve the oldest tap', async () => {
    // One MORE valid record than the per-pass apply budget, listed newest first
    // (the adversarial enumeration order). The oldest capture must be applied
    // this pass; the NEWEST is the one that waits.
    const count = MAX_INGEST_PER_PASS + 1;
    // Anchored to now (see freshIso above): i=0 is the oldest and must still be
    // inside the age-out window, or the pass drops every record and applies 0.
    const oldestMs = Date.now() - count * 1000 - 60_000;
    const entries: FakeFile[] = [];
    for (let i = count - 1; i >= 0; i--) {
      // i=0 is the oldest capture; createdAt encodes the order.
      const createdAt = new Date(oldestMs + i * 1000).toISOString();
      entries.push(
        fakeFile(
          `${i}.json`,
          JSON.stringify(
            validRecord({
              id: uuidAt(i, 'a'),
              mealId: uuidAt(i, 'b'),
              createdAt,
              occurredAt: createdAt,
            }),
          ),
        ),
      );
    }
    installInbox(entries);

    await ingestCaptureInbox(new Set([PET]));

    const applied = (raw.prepare('SELECT COUNT(*) AS n FROM events').get() as { n: number }).n;
    expect(applied).toBe(MAX_INGEST_PER_PASS);
    // The OLDEST record landed…
    const oldest = raw.prepare('SELECT id FROM events WHERE id = ?').get(uuidAt(0, 'a'));
    expect(oldest).toBeTruthy();
    // …and the one deferred to the next pass is the NEWEST, still in the inbox.
    const newestEntry = entries.find((e) => e.name === `${count - 1}.json`)!;
    expect(newestEntry.deleted).toBe(false);
    const newestRow = raw.prepare('SELECT id FROM events WHERE id = ?').get(uuidAt(count - 1, 'a'));
    expect(newestRow).toBeUndefined();
  });
});

// ── A pass already running at sign-out (CUL-1968) ─────────────────────────────
//
// `wipeLocalSession` bumps the sign-out epoch, then awaits `clearLocalData`, and
// only then resets the pet store, so the allowlist still names the old pets for the
// whole wipe. The fence is landed from INSIDE a write's await, which is where a real
// sign-out lands, and the assertion is over the real tables: nothing after it.
describe('a capture-inbox pass already running at sign-out stops before its next write', () => {
  let raw: RawDb;
  const SECOND_EVT = '55555555-5555-4555-9555-555555555555';
  const SECOND_MEAL = '66666666-6666-4666-9666-666666666666';
  const count = (table: string) =>
    (raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
  const lastUsed = () =>
    (raw.prepare('SELECT last_used_at FROM food_items_cache WHERE id = ?').get(FOOD) as {
      last_used_at: string | null;
    }).last_used_at;

  // The real adapter, with `onSql` run inside the matching statement's await.
  function fencingDb(match: RegExp, onSql: () => void): InboxDb {
    const real = asyncAdapter(raw);
    let fired = false;
    return {
      ...real,
      async runAsync(sql, params) {
        const out = await real.runAsync(sql, params);
        if (!fired && match.test(sql)) {
          fired = true;
          onSql();
        }
        return out;
      },
    };
  }

  beforeEach(() => {
    raw = freshDb();
    raw
      .prepare(`INSERT INTO food_items_cache (id, brand, product_name, format) VALUES (?, 'Hill''s', 'z/d', 'wet')`)
      .run(FOOD);
    (triggerSignalRegenDebounced as jest.Mock).mockClear();
  });

  const twoRecords = () => [
    { name: 'a.json', raw: JSON.stringify(validRecord()) },
    { name: 'b.json', raw: JSON.stringify(validRecord({ id: SECOND_EVT, mealId: SECOND_MEAL })) },
  ];

  it("fenced between a record's events and meals inserts: no meal, no cache touch, no later record", async () => {
    let signedOut = false;
    const db = fencingDb(/INTO events/, () => {
      signedOut = true;
    });
    const decisions = await ingestCaptureRecords(
      db, twoRecords(), new Set([PET]), NOW, MAX_INGEST_PER_PASS, () => signedOut,
    );
    expect(count('events')).toBe(1); // issued before the fence: the wipe's DELETE erases it
    expect(count('meals')).toBe(0);
    expect(lastUsed()).toBeNull();
    expect(raw.prepare('SELECT id FROM events WHERE id = ?').get(SECOND_EVT)).toBeUndefined();
    expect(decisions).toEqual([
      { name: 'a.json', action: 'deferred', reason: 'signed out' },
      { name: 'b.json', action: 'deferred', reason: 'signed out' },
    ]);
  });

  it("fenced between a record's meals insert and its cache touch: the touch never runs", async () => {
    let signedOut = false;
    const db = fencingDb(/INTO meals/, () => {
      signedOut = true;
    });
    await ingestCaptureRecords(db, twoRecords(), new Set([PET]), NOW, MAX_INGEST_PER_PASS, () => signedOut);
    expect(count('meals')).toBe(1);
    expect(lastUsed()).toBeNull();
    expect(count('events')).toBe(1);
  });

  it('fenced between two bowl top-up writes: the second arrangement is never touched', async () => {
    for (const id of ['a1111111-1111-4111-9111-111111111111', 'a2222222-2222-4222-9222-222222222222']) {
      raw
        .prepare(
          `INSERT INTO feeding_arrangements (id, pet_id, food_item_id, method, created_at, updated_at, synced)
           VALUES (?, ?, ?, 'free_choice', '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z', 1)`,
        )
        .run(id, PET, FOOD);
    }
    let signedOut = false;
    const db = fencingDb(/UPDATE feeding_arrangements/, () => {
      signedOut = true;
    });
    const decisions = await ingestCaptureRecords(
      db,
      [{ name: 't.json', raw: JSON.stringify(topUpRecord()) }],
      new Set([PET]),
      NOW,
      MAX_INGEST_PER_PASS,
      () => signedOut,
    );
    const queued = (raw.prepare('SELECT COUNT(*) AS n FROM feeding_arrangements WHERE synced = 0').get() as {
      n: number;
    }).n;
    expect(queued).toBe(1);
    expect(decisions).toEqual([{ name: 't.json', action: 'deferred', reason: 'signed out' }]);
  });

  it('fenced during the food lookup (no write yet): the record writes nothing at all', async () => {
    let signedOut = false;
    const real = asyncAdapter(raw);
    const db: InboxDb = {
      ...real,
      async getFirstAsync<T>(sql: string, params: (string | number | null)[]) {
        const out = await real.getFirstAsync<T>(sql, params);
        if (/food_items_cache/.test(sql)) signedOut = true;
        return out;
      },
    };
    const decisions = await ingestCaptureRecords(
      db, twoRecords(), new Set([PET]), NOW, MAX_INGEST_PER_PASS, () => signedOut,
    );
    expect(count('events')).toBe(0);
    expect(count('meals')).toBe(0);
    expect(decisions.map((d) => d.action)).toEqual(['deferred', 'deferred']);
  });

  it('an unfenced live pass still writes every record', async () => {
    const decisions = await ingestCaptureRecords(
      asyncAdapter(raw), twoRecords(), new Set([PET]), NOW, MAX_INGEST_PER_PASS, () => false,
    );
    expect(count('events')).toBe(2);
    expect(count('meals')).toBe(2);
    expect(lastUsed()).toBe(NOW.toISOString());
    expect(decisions.map((d) => d.action)).toEqual(['applied', 'applied']);
  });

  describe('through the wrapper both callers run', () => {
    const freshIso = () => new Date(Date.now() - 60_000).toISOString();
    const freshFiles = () => [
      fakeFile('a.json', JSON.stringify(validRecord({ occurredAt: freshIso(), createdAt: freshIso() }))),
      fakeFile(
        'b.json',
        JSON.stringify(
          validRecord({ id: SECOND_EVT, mealId: SECOND_MEAL, occurredAt: freshIso(), createdAt: freshIso() }),
        ),
      ),
    ];

    function runWith(onEventsInsert: () => void) {
      (getDb as jest.Mock).mockReturnValue(fencingDb(/INTO events/, onEventsInsert));
      const entries = freshFiles();
      (getCaptureInboxDirectory as jest.Mock).mockReturnValue({ list: () => entries });
      return entries;
    }

    afterEach(() => {
      (getCaptureInboxDirectory as jest.Mock).mockReturnValue(null);
    });

    it("the sync cycle's pre-sync ingest: a sign-out mid-record writes nothing more, deletes no file, arms no regen", async () => {
      const entries = runWith(() => notifySignedOut());
      // What hooks/useSync.ts passes: a plain Set and no fence of its own.
      await ingestCaptureInbox(new Set([PET]));
      expect(count('meals')).toBe(0);
      expect(count('events')).toBe(1);
      expect(entries.map((e) => e.deleted)).toEqual([false, false]);
      expect(triggerSignalRegenDebounced).not.toHaveBeenCalled();
    });

    it("the residual drain's ingest: its own fence stops the record already past the allowlist", async () => {
      let drainFenced = false;
      const entries = runWith(() => {
        drainFenced = true;
      });
      // What lib/widgetBridge.ts passes: the allowlist AND the fence. A plain Set here
      // isolates the second argument, which is what reaches the in-flight record.
      await ingestCaptureInbox(new Set([PET]), () => drainFenced);
      expect(count('meals')).toBe(0);
      expect(count('events')).toBe(1);
      expect(entries.map((e) => e.deleted)).toEqual([false, false]);
      expect(triggerSignalRegenDebounced).not.toHaveBeenCalled();
    });

    it('a sign-out after an earlier record applied: that record arms no regen and keeps its file', async () => {
      let n = 0;
      const real = asyncAdapter(raw);
      (getDb as jest.Mock).mockReturnValue({
        ...real,
        async runAsync(sql: string, params: (string | number | null)[]) {
          const out = await real.runAsync(sql, params);
          if (/INTO events/.test(sql) && ++n === 2) notifySignedOut(); // the SECOND record's insert
          return out;
        },
      });
      const entries = freshFiles();
      (getCaptureInboxDirectory as jest.Mock).mockReturnValue({ list: () => entries });
      await ingestCaptureInbox(new Set([PET]));
      expect(count('meals')).toBe(1); // the first record, before the fence; the wipe erases it
      expect(triggerSignalRegenDebounced).not.toHaveBeenCalled();
      expect(entries.map((e) => e.deleted)).toEqual([false, false]);
    });

    it('a live session still ingests, deletes the files and arms the regen', async () => {
      const entries = runWith(() => undefined);
      await ingestCaptureInbox(new Set([PET]), () => false);
      expect(count('meals')).toBe(2);
      expect(entries.map((e) => e.deleted)).toEqual([true, true]);
      expect(triggerSignalRegenDebounced).toHaveBeenCalledWith(PET);
    });
  });
});

// CUL-2468 — what the vet report's unsent gates count as still waiting in the inbox.
describe('countUnclaimedInboxPayloads / countUnclaimedInbox (CUL-2468)', () => {
  const OTHER_PET = '55555555-5555-4555-9555-555555555555';
  const mine = new Set([PET]);
  const treat = (petId = PET) => JSON.stringify(validRecord({ kind: 'treat', petId }));

  afterEach(() => {
    (getCaptureInboxDirectory as jest.Mock).mockReturnValue(null);
  });

  it('counts a treat, a meal and a top-up for one of this account\'s pets', () => {
    const raws = [treat(), JSON.stringify(validRecord()), JSON.stringify(topUpRecord())];
    expect(countUnclaimedInboxPayloads(raws, mine)).toBe(3);
  });

  it('counts a record the ingest defers for version skew, when it names our pet', () => {
    const newer = JSON.stringify({ ...validRecord(), schemaVersion: CAPTURE_INBOX_SCHEMA_VERSION + 1 });
    const newKind = JSON.stringify({ ...validRecord(), kind: 'water' });
    expect(classifyInboxPayload(newer).status).toBe('defer');
    expect(countUnclaimedInboxPayloads([newer, newKind], mine)).toBe(2);
  });

  it('does not count another pet\'s record (it ages out; a 45-day "waiting" line would be a lie)', () => {
    expect(countUnclaimedInboxPayloads([treat(OTHER_PET)], mine)).toBe(0);
  });

  it('does not count a file the ingest will drop', () => {
    const forged = JSON.stringify({ ...validRecord(), loggedVia: 'app' });
    expect(countUnclaimedInboxPayloads(['{not json', forged], mine)).toBe(0);
  });

  it('an empty pet set (the list not loaded yet) counts every record that will not drop (CUL-2489)', () => {
    // An offline cold launch never fills the pet list; "unknown" is not "not ours".
    expect(countUnclaimedInboxPayloads([treat(), treat(OTHER_PET), '{not json'], new Set())).toBe(2);
  });

  it('a deferred record with no readable pet id counts: it cannot be shown to be foreign', () => {
    const { petId: _drop, ...rest } = validRecord();
    void _drop;
    const noPet = JSON.stringify({ ...rest, schemaVersion: CAPTURE_INBOX_SCHEMA_VERSION + 1, petIds: [PET] });
    expect(classifyInboxPayload(noPet).status).toBe('defer');
    expect(countUnclaimedInboxPayloads([noPet], mine)).toBe(1);
  });

  it('reads the directory: .json files only, an unreadable one counts', () => {
    const unreadable = {
      name: 'b.json',
      textSync: () => {
        throw new Error('io');
      },
      delete: () => undefined,
    };
    const entries = [fakeFile('a.json', treat()), unreadable, fakeFile('c.tmp', treat()), { name: 'dir' }];
    (getCaptureInboxDirectory as jest.Mock).mockReturnValue({ list: () => entries });
    expect(countUnclaimedInbox(mine)).toBe(2);
  });

  it('no inbox (Android) is zero; a listing that fails throws for the caller', () => {
    expect(countUnclaimedInbox(mine)).toBe(0);
    (getCaptureInboxDirectory as jest.Mock).mockReturnValue({
      list: () => {
        throw new Error('list');
      },
    });
    expect(() => countUnclaimedInbox(mine)).toThrow('list');
  });
});

// CUL-2489: the SyncBanner's half. The banner's pending line keys on the OLDEST unsent entry being
// over a day old, so the inbox has to hand over WHEN, not only how many.
describe('summarizeUnclaimedInboxPayloads / readUnclaimedInbox / withUnclaimedInbox (CUL-2489)', () => {
  const mine = new Set([PET]);
  const OTHER_PET = '55555555-5555-4555-9555-555555555555';
  const at = (createdAt: string, petId = PET) => JSON.stringify(validRecord({ kind: 'treat', petId, createdAt }));
  const ROWS_NONE = { pendingCount: 0, oldestPendingAt: null, quarantinedCount: 0 };

  afterEach(() => {
    (getCaptureInboxDirectory as jest.Mock).mockReturnValue(null);
  });

  it('counts the same population as countUnclaimedInboxPayloads, and names the oldest counted capture', () => {
    const raws = [
      at('2026-07-10T08:00:00.000Z'),
      at('2026-07-01T08:00:00.000Z', OTHER_PET), // not counted, so not the oldest either
      at('2026-07-05T08:00:00.000Z'),
      '{not json',
    ];
    expect(summarizeUnclaimedInboxPayloads(raws, mine)).toEqual({
      count: countUnclaimedInboxPayloads(raws, mine),
      oldestAt: '2026-07-05T08:00:00.000Z',
      unknownAge: 0,
    });
    expect(countUnclaimedInboxPayloads(raws, mine)).toBe(2);
  });

  it('a version-skew deferral reads its own createdAt; an offset stamp is normalised to UTC', () => {
    const newer = JSON.stringify({
      ...validRecord(),
      schemaVersion: CAPTURE_INBOX_SCHEMA_VERSION + 1,
      createdAt: '2026-07-01T04:00:00-04:00',
    });
    expect(summarizeUnclaimedInboxPayloads([newer], mine)).toEqual({
      count: 1,
      oldestAt: '2026-07-01T08:00:00.000Z',
      unknownAge: 0,
    });
  });

  it('a capture stamped in the future ages from now, never from that future date', () => {
    const now = new Date('2026-11-05T12:00:00.000Z');
    expect(summarizeUnclaimedInboxPayloads([at('2027-03-01T08:00:00.000Z')], mine, now)).toEqual({
      count: 1,
      oldestAt: '2026-11-05T12:00:00.000Z',
      unknownAge: 0,
    });
  });

  it('a version-skew deferral with no readable time counts with unknown age', () => {
    const newer = JSON.stringify({
      ...validRecord(),
      schemaVersion: CAPTURE_INBOX_SCHEMA_VERSION + 1,
      createdAt: 'later',
    });
    expect(summarizeUnclaimedInboxPayloads([newer], mine)).toEqual({ count: 1, oldestAt: null, unknownAge: 1 });
  });

  it('reads the directory: an unreadable file counts with unknown age', () => {
    const unreadable = {
      name: 'b.json',
      textSync: () => {
        throw new Error('io');
      },
      delete: () => undefined,
    };
    (getCaptureInboxDirectory as jest.Mock).mockReturnValue({
      list: () => [fakeFile('a.json', at('2026-07-05T08:00:00.000Z')), unreadable],
    });
    expect(readUnclaimedInbox(mine)).toEqual({ count: 2, oldestAt: '2026-07-05T08:00:00.000Z', unknownAge: 1 });
    expect(countUnclaimedInbox(mine)).toBe(2);
  });

  it('no inbox (Android) is empty; a listing that fails throws for the caller', () => {
    expect(readUnclaimedInbox(mine)).toEqual({ count: 0, oldestAt: null, unknownAge: 0 });
    (getCaptureInboxDirectory as jest.Mock).mockReturnValue({
      list: () => {
        throw new Error('list');
      },
    });
    expect(() => readUnclaimedInbox(mine)).toThrow('list');
  });

  it('adds a deferred capture to an empty queue: the banner now has an oldest entry to age', () => {
    const out = withUnclaimedInbox(ROWS_NONE, { count: 1, oldestAt: '2026-07-01T08:00:00.000Z', unknownAge: 0 });
    expect(out).toEqual({ pendingCount: 1, oldestPendingAt: '2026-07-01T08:00:00.000Z', quarantinedCount: 0 });
  });

  it('takes the earlier of the two, comparing instants, never text (C-40)', () => {
    // The same instant in both spellings: the row's PostgREST form must not lose to the inbox's Z
    // form as text ('+' sorts before '.'), and an earlier inbox capture must win.
    const rows = { pendingCount: 2, oldestPendingAt: '2026-07-03T08:00:00+00:00', quarantinedCount: 1 };
    expect('2026-07-03T08:00:00+00:00' < '2026-07-03T08:00:00.000Z').toBe(true);
    expect(withUnclaimedInbox(rows, { count: 1, oldestAt: '2026-07-03T08:00:00.000Z', unknownAge: 0 })).toEqual({
      pendingCount: 3,
      oldestPendingAt: '2026-07-03T08:00:00+00:00',
      quarantinedCount: 1,
    });
    expect(
      withUnclaimedInbox(rows, { count: 1, oldestAt: '2026-07-02T08:00:00.000Z', unknownAge: 0 }).oldestPendingAt,
    ).toBe('2026-07-02T08:00:00.000Z');
    expect(
      withUnclaimedInbox(rows, { count: 1, oldestAt: '2026-07-04T08:00:00.000Z', unknownAge: 0 }).oldestPendingAt,
    ).toBe('2026-07-03T08:00:00+00:00');
  });

  it('an entry of unknown age reads as old, so the banner errs loud', () => {
    const out = withUnclaimedInbox(
      { pendingCount: 1, oldestPendingAt: '2026-07-03T08:00:00.000Z', quarantinedCount: 0 },
      { count: 1, oldestAt: null, unknownAge: 1 },
    );
    expect(out).toEqual({ pendingCount: 2, oldestPendingAt: UNKNOWN_AGE_PENDING_AT, quarantinedCount: 0 });
  });

  it('an unreadable listing counts as ONE pending entry of unknown age (CUL-2507 ruling (a))', () => {
    expect(withUnclaimedInbox(ROWS_NONE, null)).toEqual({
      pendingCount: 1,
      oldestPendingAt: UNKNOWN_AGE_PENDING_AT,
      quarantinedCount: 0,
    });
  });

  it('an empty inbox changes nothing', () => {
    const rows = { pendingCount: 2, oldestPendingAt: 'not-a-date', quarantinedCount: 3 };
    expect(withUnclaimedInbox(rows, { count: 0, oldestAt: null, unknownAge: 0 })).toBe(rows);
  });
});

// ── CUL-2542: the first-deferral stamp's lifecycle, through the wrapper ────────────────
describe('ingestCaptureInbox: the first-deferral stamp (CUL-2542)', () => {
  const MISSING_FOOD = '55555555-5555-4555-9555-555555555555';
  const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
  const recordFile = (name: string, overrides: Partial<MealCaptureRecord> = {}) =>
    fakeFile(name, JSON.stringify(validRecord({ createdAt: daysAgo(200), occurredAt: daysAgo(200), ...overrides })));
  const stampFile = (record: string, at: string) => fakeFile(`${record}${INBOX_DEFERRAL_STAMP_SUFFIX}`, at);

  beforeEach(() => {
    const raw = freshDb();
    raw
      .prepare(`INSERT INTO food_items_cache (id, brand, product_name, format) VALUES (?, 'Hill''s', 'z/d', 'wet')`)
      .run(FOOD);
    (getDb as jest.Mock).mockReturnValue(asyncAdapter(raw));
    mockStampWrites.length = 0;
  });
  afterEach(() => {
    (getCaptureInboxDirectory as jest.Mock).mockReturnValue(null);
  });
  const install = (entries: FakeFile[]) =>
    (getCaptureInboxDirectory as jest.Mock).mockReturnValue({ list: () => entries });

  it('stamps a record on its first unusable pass and keeps it, however old its tap', async () => {
    const waiting = recordFile('w.json', { foodItemId: MISSING_FOOD });
    install([waiting]);
    const before = Date.now();
    await ingestCaptureInbox(new Set([PET]));
    expect(waiting.deleted).toBe(false);
    expect(mockStampWrites).toHaveLength(1);
    expect(mockStampWrites[0].name).toBe(`w.json${INBOX_DEFERRAL_STAMP_SUFFIX}`);
    expect(Date.parse(mockStampWrites[0].text)).toBeGreaterThanOrEqual(before);
  });

  it('never rewrites a readable stamp, so the clock does not restart', async () => {
    install([recordFile('w.json', { foodItemId: MISSING_FOOD }), stampFile('w.json', daysAgo(10))]);
    await ingestCaptureInbox(new Set([PET]));
    expect(mockStampWrites).toHaveLength(0);
  });

  it('replaces an unreadable stamp rather than ageing from it', async () => {
    const stamp = stampFile('w.json', 'garbage');
    install([recordFile('w.json', { foodItemId: MISSING_FOOD }), stamp]);
    await ingestCaptureInbox(new Set([PET]));
    expect(mockStampWrites.map((w) => w.name)).toEqual([`w.json${INBOX_DEFERRAL_STAMP_SUFFIX}`]);
    expect(stamp.deleted).toBe(false);
  });

  it('drops a record 46 days after its first deferral, with its stamp', async () => {
    const record = recordFile('w.json', { foodItemId: MISSING_FOOD });
    const stamp = stampFile('w.json', daysAgo(INBOX_MAX_AGE_DAYS + 1));
    install([record, stamp]);
    await ingestCaptureInbox(new Set([PET]));
    expect(record.deleted).toBe(true);
    expect(stamp.deleted).toBe(true);
  });

  it('deletes the stamp of a record that applies, and an orphan stamp, and nothing else', async () => {
    const landing = recordFile('a.json');
    const landingStamp = stampFile('a.json', daysAgo(3));
    const orphan = stampFile('gone.json', daysAgo(3));
    const other = fakeFile('readme.txt', 'x');
    install([landing, landingStamp, orphan, other]);
    await ingestCaptureInbox(new Set([PET]));
    expect(landing.deleted).toBe(true);
    expect(landingStamp.deleted).toBe(true);
    expect(orphan.deleted).toBe(true);
    expect(other.deleted).toBe(false);
  });

  it('a record whose file cannot be read keeps its stamp', async () => {
    const unreadable: FakeFile = {
      name: 'u.json',
      deleted: false,
      textSync: () => {
        throw new Error('io');
      },
      delete() {
        this.deleted = true;
      },
    };
    const stamp = stampFile('u.json', daysAgo(3));
    install([unreadable, stamp]);
    await ingestCaptureInbox(new Set([PET]));
    expect(stamp.deleted).toBe(false);
  });

  it('the stamp is never read as a record by the count', () => {
    install([stampFile('w.json', daysAgo(3))]);
    expect(countUnclaimedInbox(new Set([PET]))).toBe(0);
  });

  it('a sign-out leaves even a lone orphan stamp alone (the wipe owns the inbox)', async () => {
    const orphan = stampFile('gone.json', daysAgo(3));
    install([orphan]);
    await ingestCaptureInbox(new Set([PET]), () => true);
    expect(orphan.deleted).toBe(false);
  });

  it('a sign-out mid-pass writes and deletes no stamp', async () => {
    const orphan = stampFile('gone.json', daysAgo(3));
    install([recordFile('w.json', { foodItemId: MISSING_FOOD }), orphan]);
    await ingestCaptureInbox(new Set([PET]), () => true);
    expect(mockStampWrites).toHaveLength(0);
    expect(orphan.deleted).toBe(false);
  });
});

// ── CUL-2542: an archived pet's capture is the owner's ──────────────────────────────────
describe('archived pets count as the account (CUL-2542)', () => {
  const ARCHIVED = '12121212-1212-4212-9212-121212121212';
  const STRANGER = '99999999-9999-4999-9999-999999999999';
  let raw: RawDb;

  beforeEach(() => {
    raw = freshDb();
    raw
      .prepare(`INSERT INTO food_items_cache (id, brand, product_name, format) VALUES (?, 'Hill''s', 'z/d', 'wet')`)
      .run(FOOD);
    (getDb as jest.Mock).mockReturnValue(asyncAdapter(raw));
    usePetStore.getState().reset();
  });
  afterEach(() => {
    (getCaptureInboxDirectory as jest.Mock).mockReturnValue(null);
    usePetStore.getState().reset();
  });

  it('withArchivedPetIds adds the archived ids, and leaves an empty (not loaded) set empty', () => {
    usePetStore.getState().addArchivedPetIds([ARCHIVED]);
    expect([...withArchivedPetIds(new Set([PET]))].sort()).toEqual([ARCHIVED, PET].sort());
    expect(withArchivedPetIds(new Set()).size).toBe(0);
  });

  it("applies a waiting capture for a pet archived before the app took it in", async () => {
    usePetStore.getState().addArchivedPetIds([ARCHIVED]);
    const entry = fakeFile(
      'a.json',
      JSON.stringify(validRecord({ petId: ARCHIVED, createdAt: new Date().toISOString() })),
    );
    (getCaptureInboxDirectory as jest.Mock).mockReturnValue({ list: () => [entry] });
    await ingestCaptureInbox(new Set([PET]));
    expect(entry.deleted).toBe(true);
    expect(raw.prepare('SELECT pet_id FROM events').all()).toEqual([{ pet_id: ARCHIVED }]);
  });

  it('archiving a pet in the app (removePet) adds it to the set', () => {
    usePetStore.getState().setPets([
      { id: PET, name: 'A' } as never,
      { id: ARCHIVED, name: 'B' } as never,
    ]);
    usePetStore.getState().removePet(ARCHIVED);
    expect(usePetStore.getState().archivedPetIds).toEqual([ARCHIVED]);
    usePetStore.getState().reset();
    expect(usePetStore.getState().archivedPetIds).toEqual([]);
  });

  it('the inbox count counts an archived pet’s capture and still skips a stranger’s', () => {
    usePetStore.getState().addArchivedPetIds([ARCHIVED]);
    const at = new Date().toISOString();
    (getCaptureInboxDirectory as jest.Mock).mockReturnValue({
      list: () => [
        fakeFile('a.json', JSON.stringify(validRecord({ petId: ARCHIVED, createdAt: at }))),
        fakeFile('s.json', JSON.stringify(validRecord({ id: uuidAt(2, 'a'), petId: STRANGER, createdAt: at }))),
      ],
    });
    expect(countUnclaimedInbox(new Set([PET]))).toBe(1);
  });
});
