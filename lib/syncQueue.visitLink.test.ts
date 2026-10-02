// The vet-visit link gate (release QA, 2026-10-02): a row that names a vet visit is
// never pushed ahead of that visit, because the server's same-pet guard refuses it with
// a TERMINAL 23514 and the row is quarantined on its first try (lib/syncQueue.ts,
// `visitLandedSql`).
//
// Every statement here is the one that SHIPS: diet trials' is imported, and the three
// that live inline in lib/sync.ts are read out of its source, because a test that
// replays its own approximation of a statement proves nothing about the one that ships
// (the CUL-691 rule). Each runs against the real runtime schema: the schema constants
// plus the column upgrades, exactly what initDb applies.

// node:sqlite is Node ≥ 22 core; require() keeps it off the jest-expo transform path.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BASE_SCHEMA_SQL, applyColumnUpgrades } from './localSchema';
import { MEDICATION_SCHEMA_SQL } from './medications';
import { DIET_TRIAL_SCHEMA_SQL, DIET_TRIAL_PUSH_QUEUE_SQL } from './dietTrialMirror';
import { NOTIFICATION_SCHEMA_SQL } from './notificationPreferences';
import {
  NOT_QUARANTINED_SQL,
  VISIT_LINKED_TABLES,
  visitLandedSql,
  type VisitLinkedTable,
} from './syncQueue';

type Db = InstanceType<typeof DatabaseSync>;
interface Column { name: string; type: string; notnull: number; dflt_value: unknown; pk: number }

async function runtimeDb(): Promise<Db> {
  const db = new DatabaseSync(':memory:');
  for (const sql of [BASE_SCHEMA_SQL, MEDICATION_SCHEMA_SQL, DIET_TRIAL_SCHEMA_SQL, NOTIFICATION_SCHEMA_SQL]) {
    db.exec(sql);
  }
  await applyColumnUpgrades(async (sql) => db.exec(sql));
  return db;
}

/** A drain's row-selection statement exactly as lib/sync.ts ships it. */
function shippedSelect(table: Exclude<VisitLinkedTable, 'diet_trials'>): string {
  const src = readFileSync(join(__dirname, 'sync.ts'), 'utf8');
  const start = src.indexOf(`\`SELECT * FROM ${table} WHERE synced = 0`);
  if (start === -1) throw new Error(`the ${table} drain's SELECT is not where this test looks — did it move?`);
  const end = src.indexOf('`', start + 1);
  return src
    .slice(start + 1, end)
    .replace('${NOT_QUARANTINED_SQL}', NOT_QUARANTINED_SQL)
    .replace(/\$\{visitLandedSql\('(\w+)'\)\}/g, (_m, t: string) => visitLandedSql(t as VisitLinkedTable));
}

const PUSH_QUEUE_SQL: Record<VisitLinkedTable, () => string> = {
  vet_appointments: () => shippedSelect('vet_appointments'),
  medications: () => shippedSelect('medications'),
  vet_documents: () => shippedSelect('vet_documents'),
  diet_trials: () => DIET_TRIAL_PUSH_QUEUE_SQL,
};

function columns(db: Db, table: string): Column[] {
  return db.prepare(`PRAGMA table_info(${table})`).all() as Column[];
}

/** Insert a row, filling every required column the caller did not name. */
function insert(db: Db, table: string, values: Record<string, unknown>): void {
  const row: Record<string, unknown> = {};
  for (const c of columns(db, table)) {
    if (c.notnull && c.dflt_value === null) row[c.name] = /INT|REAL|NUM/i.test(c.type) ? 0 : `${c.name}-x`;
  }
  Object.assign(row, values);
  const keys = Object.keys(row);
  db.prepare(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`)
    .run(...keys.map((k) => row[k] as never));
}

function picked(db: Db, table: VisitLinkedTable): string[] {
  return (db.prepare(PUSH_QUEUE_SQL[table]()).all() as { id: string }[]).map((r) => r.id).sort();
}

describe.each([...VISIT_LINKED_TABLES])('the %s push queue', (table) => {
  let db: Db;
  beforeEach(async () => {
    db = await runtimeDb();
    insert(db, 'vet_visits', { id: 'v-waiting', pet_id: 'pet-1', synced: 0 });
    insert(db, 'vet_visits', { id: 'v-landed', pet_id: 'pet-1', synced: 1 });
    insert(db, 'vet_visits', { id: 'v-quarantined', pet_id: 'pet-1', synced: 0, sync_error: '23514: refused' });
    const child = (id: string, vetVisitId: string | null) =>
      insert(db, table, { id, pet_id: 'pet-1', vet_visit_id: vetVisitId, synced: 0 });
    child('waits', 'v-waiting');
    child('after-landing', 'v-landed');
    child('after-quarantine', 'v-quarantined');
    child('no-link', null);
    child('link-not-held-here', 'v-elsewhere');
  });
  afterEach(() => db.close());

  it('holds a row whose visit has not landed, and only that row', () => {
    expect(picked(db, table)).toEqual(['after-landing', 'after-quarantine', 'link-not-held-here', 'no-link']);
  });

  it('pushes the held row once its visit lands', () => {
    db.prepare('UPDATE vet_visits SET synced = 1 WHERE id = ?').run('v-waiting');
    expect(picked(db, table)).toContain('waits');
  });

  it('still skips a quarantined row, whatever its visit', () => {
    db.prepare(`UPDATE ${table} SET sync_error = '23514: refused' WHERE id = 'after-landing'`).run();
    expect(picked(db, table)).not.toContain('after-landing');
  });
});

// The set is derived from the schema, never from the list under test (C-38): every local
// table that can name a visit is gated, except the visit's own photos, which ride
// inside the visit's queue behind their parent row.
it('every local table carrying vet_visit_id is a gated queue', async () => {
  const db = await runtimeDb();
  const tables = (db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as { name: string }[])
    .map((r) => r.name)
    .filter((name) => columns(db, name).some((c) => c.name === 'vet_visit_id'));
  db.close();
  expect(tables.sort()).toEqual([...VISIT_LINKED_TABLES, 'vet_visit_attachments'].sort());
});
