// Q14 (CUL-772) — what a Signal rebuild counts as "rows the server has not received".
//
// Driven over the REAL runtime schema (the DDL constants plus initDb's column upgrades), because
// the defect this count exists to avoid is a shape only the real SQL shows: a meal, weigh-in or
// look whose parent event the server refused is held by its drain for good (`e.synced = 1`
// never comes), so it reads `synced = 0, sync_error IS NULL` forever. Counted, it would pin
// every pet's Signal at the 1-hour expiry and spend the per-pet cap (adversarial review, this PR).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  EVENT_GATED_QUEUES,
  HELD_FOR_GOOD_SQL,
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

  it.each(EVENT_GATED_QUEUES)('a %s row held for good behind a refused event does not count', async (table) => {
    const db = await realSchemaDb();
    insert(db, 'events', { id: 'e1', synced: 0, sync_error: REFUSED });
    insert(db, table, { id: 'c1', event_id: 'e1', synced: 0, sync_error: null });
    // The defect, reproduced: the general pending count still holds the child.
    expect(pending(db)).toBe(1);
    expect(unsent(db)).toBe(0);
  });

  it.each(EVENT_GATED_QUEUES)('a %s row behind an event still waiting to land DOES count, and so does the event', async (table) => {
    const db = await realSchemaDb();
    insert(db, 'events', { id: 'e1', synced: 0, sync_error: null });
    insert(db, table, { id: 'c1', event_id: 'e1', synced: 0, sync_error: null });
    expect(unsent(db)).toBe(2);
  });

  it.each(EVENT_GATED_QUEUES)('a %s row whose event has landed counts', async (table) => {
    const db = await realSchemaDb();
    insert(db, 'events', { id: 'e1', synced: 1, sync_error: null });
    insert(db, table, { id: 'c1', event_id: 'e1', synced: 0, sync_error: null });
    expect(unsent(db)).toBe(1);
  });

  it('a child under parentLandedSql still counts behind a refused event: it goes up and takes its own answer', async () => {
    // intake_checks' gate lets a refused parent hold nothing (lib/syncQueue.ts parentLandedSql),
    // so the row is pushed and either lands or is refused itself; until then it is unsent.
    const db = await realSchemaDb();
    insert(db, 'events', { id: 'e1', synced: 0, sync_error: REFUSED });
    insert(db, 'intake_checks', { id: 'c1', event_id: 'e1', synced: 0, sync_error: null });
    expect(unsent(db)).toBe(1);
  });

  // EN-4's re-check marker waits on its event's meal (floorTriggerLandedSql). When that meal is
  // held for good behind a refused event, so is the marker (adversarial pass 2, this PR).
  it('a floor marker waiting on a meal held for good does not count, and its drain indeed never sends it', async () => {
    const db = await realSchemaDb();
    insert(db, 'events', { id: 'e1', event_type: 'meal', synced: 0, sync_error: REFUSED });
    insert(db, 'meals', { id: 'm1', event_id: 'e1', synced: 0, sync_error: null });
    insert(db, 'incident_floor_queue', { id: 'f1', event_id: 'e1', synced: 0, sync_error: null });
    expect(db.prepare(incidentFloorPushQueueSql()).all()).toHaveLength(0);
    expect(pending(db)).toBe(2);
    expect(unsent(db)).toBe(0);
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
});

describe('EVENT_GATED_QUEUES is exactly the drains that wait on `e.synced = 1`', () => {
  // A new drain gated the same way would hold its children behind a refused event for good and
  // pin every Signal at the hour; a listed queue whose drain stopped gating would hide real
  // unsent rows. Read from the drains themselves, both directions.
  const src = readFileSync(join(__dirname, 'sync.ts'), 'utf8');
  const gated = [
    ...src.matchAll(
      /FROM (\w+) (\w+)\s+(?:INNER\s+)?JOIN events (\w+) ON \3\.id\s*=\s*\2\.event_id\s+WHERE [^`]*?\b\3\.synced\s*=\s*1\b/g,
    ),
  ].map((m) => m[1]);

  it('finds the drains (non-vacuous)', () => {
    expect(gated.length).toBeGreaterThanOrEqual(3);
  });

  it('matches the list', () => {
    expect([...new Set(gated)].sort()).toEqual([...EVENT_GATED_QUEUES].sort());
  });
});

describe('a gate that waits on an event-gated child is held for good with it (nested holds)', () => {
  // Pass 2's case: floorTriggerLandedSql waits on `meals`, which the meals drain holds behind a
  // refused event, so the marker is held too. Any gate in the queue code that waits on an
  // EVENT_GATED_QUEUES table must be registered in HELD_FOR_GOOD_SQL, or its rows pin every
  // Signal at the hour. Scans every lib file a drain's gate lives in.
  const files = ['syncQueue.ts', 'sync.ts'];
  const nested = files.flatMap((f) => {
    const src = readFileSync(join(__dirname, f), 'utf8');
    const out: string[] = [];
    for (const m of src.matchAll(/NOT EXISTS \(SELECT 1 FROM (\w+) \w+\s+WHERE \w+\.event_id = (\w+)\.event_id/g)) {
      if ((EVENT_GATED_QUEUES as readonly string[]).includes(m[1])) out.push(m[2]);
    }
    return out;
  });

  it('finds the floor marker gate (non-vacuous)', () => {
    expect(nested).toContain('incident_floor_queue');
  });

  it('every queue so gated is registered', () => {
    for (const q of nested) expect(Object.keys(HELD_FOR_GOOD_SQL)).toContain(q);
  });

  it('the registry holds exactly the event-gated queues and the nested ones', () => {
    expect(Object.keys(HELD_FOR_GOOD_SQL).sort()).toEqual([...new Set([...EVENT_GATED_QUEUES, ...nested])].sort());
  });
});
