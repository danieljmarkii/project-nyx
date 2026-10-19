// Q14 (CUL-772) — what a Signal rebuild counts as "rows the server has not received".
//
// Driven over the REAL runtime schema (the DDL constants plus initDb's column upgrades). PR-24
// had to leave out a meal, weigh-in or look whose parent event the server refused, because its
// drain held it for good (`e.synced = 1` never came) and counting it would pin every pet's
// Signal at the 1-hour expiry and spend the per-pet cap. CUL-1986 retired that hold: a refused
// parent holds nothing (`parentLandedSql`), so such a child goes up and is answered within a
// cycle, and the count is every pending row again. The last describe keeps the hold retired.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  incidentFloorPushQueueSql,
  pendingStatusSql,
  unsentForSignalSql,
} from './syncQueue';
import { BASE_SCHEMA_SQL, applyColumnUpgrades } from './localSchema';
import { MEDICATION_SCHEMA_SQL } from './medications';
import { DIET_TRIAL_SCHEMA_SQL } from './dietTrialMirror';
import { NOTIFICATION_SCHEMA_SQL } from './notificationPreferences';

type Db = InstanceType<typeof DatabaseSync>;

async function realSchemaDb(): Promise<Db> {
  const db = new DatabaseSync(':memory:');
  for (const sql of [BASE_SCHEMA_SQL, MEDICATION_SCHEMA_SQL, DIET_TRIAL_SCHEMA_SQL, NOTIFICATION_SCHEMA_SQL]) {
    db.exec(sql);
  }
  await applyColumnUpgrades(async (sql) => db.exec(sql));
  // The fixtures insert children without their full parent graph (pets, food items); the
  // count reads only the columns below, so the foreign keys are not what is under test.
  db.exec('PRAGMA foreign_keys = OFF');
  return db;
}

const TS = '2026-10-16T08:00:00.000Z';

// Inserts a row giving every NOT NULL column without a default a placeholder, so a fixture
// names only the columns the count reads.
function insert(db: Db, table: string, over: Record<string, unknown>): void {
  const cols = db
    .prepare(`SELECT name, "notnull" AS nn, dflt_value AS d, type FROM pragma_table_info('${table}')`)
    .all() as { name: string; nn: number; d: string | null; type: string }[];
  const row: Record<string, unknown> = {};
  for (const c of cols) {
    if (c.nn && c.d === null) row[c.name] = /INT|REAL|NUM/i.test(c.type) ? 0 : 'x';
  }
  for (const c of cols) if (c.name === 'created_at' || c.name === 'updated_at') row[c.name] = TS;
  Object.assign(row, over);
  const keys = Object.keys(row);
  db.prepare(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`).run(
    ...keys.map((k) => row[k] as string | number | null),
  );
}

const unsent = (db: Db): number => (db.prepare(unsentForSignalSql()).get() as { count: number }).count;
const pending = (db: Db): number => (db.prepare(pendingStatusSql()).get() as { count: number }).count;

const REFUSED = '23514: check violation';

describe('Q14 (CUL-772) — unsentForSignalSql over the real schema', () => {
  it('an empty device holds nothing unsent', async () => {
    expect(unsent(await realSchemaDb())).toBe(0);
  });

  it('a row never refused counts at any age (a network failure never spends a retry)', async () => {
    const db = await realSchemaDb();
    insert(db, 'events', { id: 'e1', synced: 0, sync_error: null, updated_at: '2026-08-01T08:00:00.000Z' });
    expect(unsent(db)).toBe(1);
  });

  it('a row the server refused does not count (it is the stuck-row banner\'s, Q6)', async () => {
    const db = await realSchemaDb();
    insert(db, 'events', { id: 'e1', synced: 0, sync_error: REFUSED });
    expect(unsent(db)).toBe(0);
  });

  // The drains that used to hold these for good behind a refused event (CUL-1986).
  const EVENT_CHILDREN = ['meals', 'weight_checks', 'looks'] as const;

  it.each(EVENT_CHILDREN)('a %s row behind a refused event counts: its drain sends it and it is answered', async (table) => {
    const db = await realSchemaDb();
    insert(db, 'events', { id: 'e1', synced: 0, sync_error: REFUSED });
    insert(db, table, { id: 'c1', event_id: 'e1', synced: 0, sync_error: null });
    expect(unsent(db)).toBe(1);
    // Once it is refused itself it stops counting: no retry is coming.
    db.prepare(`UPDATE ${table} SET sync_error = ? WHERE id = 'c1'`).run(REFUSED);
    expect(unsent(db)).toBe(0);
  });

  it.each(EVENT_CHILDREN)('a %s row behind an event still waiting to land DOES count, and so does the event', async (table) => {
    const db = await realSchemaDb();
    insert(db, 'events', { id: 'e1', synced: 0, sync_error: null });
    insert(db, table, { id: 'c1', event_id: 'e1', synced: 0, sync_error: null });
    expect(unsent(db)).toBe(2);
  });

  it.each(EVENT_CHILDREN)('a %s row whose event has landed counts', async (table) => {
    const db = await realSchemaDb();
    insert(db, 'events', { id: 'e1', synced: 1, sync_error: null });
    insert(db, table, { id: 'c1', event_id: 'e1', synced: 0, sync_error: null });
    expect(unsent(db)).toBe(1);
  });

  it('a child under parentLandedSql still counts behind a refused event: it goes up and takes its own answer', async () => {
    const db = await realSchemaDb();
    insert(db, 'events', { id: 'e1', synced: 0, sync_error: REFUSED });
    insert(db, 'intake_checks', { id: 'c1', event_id: 'e1', synced: 0, sync_error: null });
    expect(unsent(db)).toBe(1);
  });

  // EN-4's re-check marker waits on its event's meal (floorTriggerLandedSql). Behind a refused
  // event that meal used to be held for good, and the marker with it; now the meal is sent, so
  // the marker waits only while the meal can still land, and both count meanwhile.
  it('a floor marker waits on a meal behind a refused event only until the meal is answered', async () => {
    const db = await realSchemaDb();
    insert(db, 'events', { id: 'e1', event_type: 'meal', synced: 0, sync_error: REFUSED });
    insert(db, 'meals', { id: 'm1', event_id: 'e1', synced: 0, sync_error: null });
    insert(db, 'incident_floor_queue', { id: 'f1', event_id: 'e1', synced: 0, sync_error: null });
    expect(db.prepare(incidentFloorPushQueueSql()).all()).toHaveLength(0);
    expect(unsent(db)).toBe(2);
    db.prepare(`UPDATE meals SET sync_error = '23503: fk' WHERE id = 'm1'`).run();
    expect(db.prepare(incidentFloorPushQueueSql()).all()).toHaveLength(1);
    expect(unsent(db)).toBe(1);
  });

  it('a floor marker under a refused event with no held meal counts: its drain sends it', async () => {
    const db = await realSchemaDb();
    insert(db, 'events', { id: 'e1', event_type: 'vomit', synced: 0, sync_error: REFUSED });
    insert(db, 'incident_floor_queue', { id: 'f1', event_id: 'e1', synced: 0, sync_error: null });
    expect(db.prepare(incidentFloorPushQueueSql()).all()).toHaveLength(1);
    expect(unsent(db)).toBe(1);
  });

  it('a floor marker waiting on a meal that can still land counts, with the meal and its event', async () => {
    const db = await realSchemaDb();
    insert(db, 'events', { id: 'e1', event_type: 'meal', synced: 0, sync_error: null });
    insert(db, 'meals', { id: 'm1', event_id: 'e1', synced: 0, sync_error: null });
    insert(db, 'incident_floor_queue', { id: 'f1', event_id: 'e1', synced: 0, sync_error: null });
    expect(unsent(db)).toBe(3);
  });

  it('with no refused parent the count is exactly the pending count (the exclusion takes nothing else)', async () => {
    const db = await realSchemaDb();
    insert(db, 'events', { id: 'e1', synced: 0, sync_error: null });
    insert(db, 'events', { id: 'e2', synced: 1, sync_error: null });
    insert(db, 'meals', { id: 'm1', event_id: 'e2', synced: 0, sync_error: null });
    insert(db, 'weight_checks', { id: 'w1', event_id: 'e1', synced: 0, sync_error: null });
    insert(db, 'looks', { id: 'l1', event_id: 'e2', synced: 0, sync_error: null });
    insert(db, 'intake_checks', { id: 'i1', event_id: 'e1', synced: 0, sync_error: null });
    expect(pending(db)).toBe(5);
    expect(unsent(db)).toBe(pending(db));
  });

  it('behind a refused parent the count is still exactly the pending count: nothing is held for good', async () => {
    const db = await realSchemaDb();
    insert(db, 'events', { id: 'e1', event_type: 'meal', synced: 0, sync_error: REFUSED });
    for (const t of ['meals', 'weight_checks', 'looks', 'intake_checks', 'incident_floor_queue']) {
      insert(db, t, { id: `${t}-1`, event_id: 'e1', synced: 0, sync_error: null });
    }
    expect(pending(db)).toBe(5);
    expect(unsent(db)).toBe(pending(db));
  });
});

describe('no drain holds a child behind its event for good (CUL-1986)', () => {
  // The retired shape: a drain that joins `events` and requires `e.synced = 1` waits on a
  // landing a REFUSED event never makes, so its child is never sent, never refused and never
  // counted as stuck, and the Signal's unsent flag would need its exclusion back. A child
  // waits on its parent through `parentLandedSql`, where a refused parent holds nothing.
  const HOLD_FOR_GOOD =
    /FROM (\w+) (\w+)\s+(?:INNER\s+)?JOIN events (\w+) ON \3\.id\s*=\s*\2\.event_id\s+WHERE [^`]*?\b\3\.synced\s*=\s*1\b/g;
  const found = (src: string) => [...src.matchAll(HOLD_FOR_GOOD)].map((m) => m[1]);

  it('recognises the retired shape (non-vacuous)', () => {
    const retired = `SELECT m.* FROM meals m
       JOIN events e ON e.id = m.event_id
      WHERE m.synced = 0 AND m.sync_error IS NULL AND e.synced = 1
      LIMIT 100`;
    expect(found(retired)).toEqual(['meals']);
  });

  it('finds it in no queue file', () => {
    for (const f of ['sync.ts', 'syncQueue.ts', 'dietTrialMirror.ts']) {
      expect({ file: f, held: found(readFileSync(join(__dirname, f), 'utf8')) }).toEqual({ file: f, held: [] });
    }
  });
});
