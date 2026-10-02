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
import { DIET_TRIAL_SCHEMA_SQL, DIET_TRIAL_PUSH_QUEUE_SQL, DIET_TRIAL_FOOD_PUSH_QUEUE_SQL } from './dietTrialMirror';
import { NOTIFICATION_SCHEMA_SQL } from './notificationPreferences';
import {
  NOT_QUARANTINED_SQL,
  PARENT_GATED_QUEUES,
  VISIT_LINKED_TABLES,
  parentLandedSql,
  visitLandedSql,
  type ParentGatedQueue,
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
function shippedSelect(
  table: Exclude<VisitLinkedTable, 'diet_trials'> | Exclude<ParentGatedQueue, 'diet_trial_foods'>,
): string {
  const src = readFileSync(join(__dirname, 'sync.ts'), 'utf8');
  const start = src.indexOf(`\`SELECT * FROM ${table} WHERE synced = 0`);
  if (start === -1) throw new Error(`the ${table} drain's SELECT is not where this test looks — did it move?`);
  const end = src.indexOf('`', start + 1);
  const sql = src
    .slice(start + 1, end)
    .replace('${NOT_QUARANTINED_SQL}', NOT_QUARANTINED_SQL)
    .replace(/\$\{visitLandedSql\('(\w+)'\)\}/g, (_m, t: string) => visitLandedSql(t as VisitLinkedTable))
    .replace(/\$\{parentLandedSql\('(\w+)'\)\}/g, (_m, t: string) => parentLandedSql(t as ParentGatedQueue));
  if (sql.includes('${')) throw new Error(`the ${table} drain's SELECT interpolates something this test cannot replay`);
  return sql;
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

/** Every row the fixture below queues, none of them quarantined. */
const EVERY_QUEUED_ROW = ['after-landing', 'after-quarantine', 'link-not-held-here', 'no-link', 'other-pet', 'waits'];

describe.each([...VISIT_LINKED_TABLES])('the %s push queue', (table) => {
  let db: Db;
  beforeEach(async () => {
    db = await runtimeDb();
    insert(db, 'vet_visits', { id: 'v-waiting', pet_id: 'pet-1', synced: 0 });
    insert(db, 'vet_visits', { id: 'v-landed', pet_id: 'pet-1', synced: 1 });
    insert(db, 'vet_visits', { id: 'v-quarantined', pet_id: 'pet-1', synced: 0, sync_error: '23514: refused' });
    const child = (id: string, vetVisitId: string | null, petId = 'pet-1') =>
      insert(db, table, { id, pet_id: petId, vet_visit_id: vetVisitId, synced: 0 });
    child('waits', 'v-waiting');
    child('after-landing', 'v-landed');
    child('after-quarantine', 'v-quarantined');
    child('no-link', null);
    child('link-not-held-here', 'v-elsewhere');
    child('other-pet', null, 'pet-2');
  });
  afterEach(() => db.close());

  if (table === 'diet_trials') {
    // Trials hold more than the one row: while one of a pet's queued trials waits on its
    // visit, all of that pet's queued trials wait with it (`petTrialsVisitLandedSql`; each
    // arm of that clause is pinned in the next describe).
    it("holds every queued trial of the pet while one waits on its visit, and no other pet's", () => {
      expect(picked(db, table)).toEqual(['other-pet']);
    });
  } else {
    it('holds a row whose visit has not landed, and only that row', () => {
      expect(picked(db, table)).toEqual(['after-landing', 'after-quarantine', 'link-not-held-here', 'no-link', 'other-pet']);
    });
  }

  it('pushes the held row, and anything it held, once its visit lands', () => {
    db.prepare('UPDATE vet_visits SET synced = 1 WHERE id = ?').run('v-waiting');
    expect(picked(db, table)).toEqual(EVERY_QUEUED_ROW);
  });

  it('holds nothing once its visit is quarantined: there is no landing left to wait for', () => {
    db.prepare(`UPDATE vet_visits SET sync_error = '23514: refused' WHERE id = ?`).run('v-waiting');
    expect(picked(db, table)).toEqual(EVERY_QUEUED_ROW);
  });

  it('still skips a quarantined row, whatever its visit', () => {
    db.prepare(`UPDATE ${table} SET sync_error = '23514: refused' WHERE id = 'after-landing'`).run();
    expect(picked(db, table)).not.toContain('after-landing');
  });
});

// The pet-level hold on diet trials (`petTrialsVisitLandedSql`), arm by arm, in the shape
// it exists for: trial A linked to a visit that has not landed and then ended, trial B
// started beside it with no link. The drain can only push A's ending ahead of B if it is
// handed both, so B must wait while A does. Each case below breaks exactly one arm of the
// clause, so deleting that arm reds exactly one case.
describe('the diet_trials queue holds a pet\'s trials together while one waits on its visit', () => {
  let db: Db;
  beforeEach(async () => {
    db = await runtimeDb();
    insert(db, 'vet_visits', { id: 'v-waiting', pet_id: 'pet-1', synced: 0 });
    insert(db, 'diet_trials', { id: 'a-ending', pet_id: 'pet-1', status: 'abandoned', vet_visit_id: 'v-waiting', synced: 0 });
    insert(db, 'diet_trials', { id: 'b-starting', pet_id: 'pet-1', status: 'active', vet_visit_id: null, synced: 0 });
    insert(db, 'diet_trials', { id: 'other-pet', pet_id: 'pet-2', status: 'active', vet_visit_id: null, synced: 0 });
  });
  afterEach(() => db.close());

  it("holds the start beside the held ending, and not another pet's trial (the pet arm)", () => {
    expect(picked(db, 'diet_trials')).toEqual(['other-pet']);
  });

  it('releases both together once the visit lands (the visit-synced arm)', () => {
    db.prepare('UPDATE vet_visits SET synced = 1 WHERE id = ?').run('v-waiting');
    expect(picked(db, 'diet_trials')).toEqual(['a-ending', 'b-starting', 'other-pet']);
  });

  it('releases both once the visit is quarantined (the visit-quarantine arm)', () => {
    db.prepare(`UPDATE vet_visits SET sync_error = '23514: refused' WHERE id = ?`).run('v-waiting');
    expect(picked(db, 'diet_trials')).toEqual(['a-ending', 'b-starting', 'other-pet']);
  });

  it('a trial parked on its own refusal holds none of its siblings (the trial-quarantine arm)', () => {
    // A row an older build pushed ahead of its visit and had refused (the bug d8992fa
    // closed): it never pushes again, so waiting on it would be waiting for nothing.
    db.prepare(`UPDATE diet_trials SET sync_error = '23514: refused' WHERE id = ?`).run('a-ending');
    expect(picked(db, 'diet_trials')).toEqual(['b-starting', 'other-pet']);
  });

  it('a trial already landed holds nothing, even when its visit has an unsent edit (the trial-synced arm)', () => {
    // The visit landed, the trial landed naming it, and the owner then edited the visit,
    // which queues it again. The server already holds both, so nothing needs to wait.
    db.prepare('UPDATE diet_trials SET synced = 1 WHERE id = ?').run('a-ending');
    expect(picked(db, 'diet_trials')).toEqual(['b-starting', 'other-pet']);
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

// ── A child of a held parent is held too (code review of d8992fa, item 3) ──────
//
// The visit gate holds a trial or a course; their children (an allowed food, a dose)
// would still go out ahead of them, into a terminal 23514 (041) or a budget-spending
// 23503. `parentLandedSql` holds them while the parent waits. The same replay of the
// SHIPPED statements as above, one per gated child.

const CHILD_PUSH_QUEUE_SQL: Record<ParentGatedQueue, () => string> = {
  diet_trial_foods: () => DIET_TRIAL_FOOD_PUSH_QUEUE_SQL,
  medication_administrations: () => shippedSelect('medication_administrations'),
};

function pickedChildren(db: Db, child: ParentGatedQueue): string[] {
  return (db.prepare(CHILD_PUSH_QUEUE_SQL[child]()).all() as { id: string }[]).map((r) => r.id).sort();
}

describe.each(Object.keys(PARENT_GATED_QUEUES) as ParentGatedQueue[])('the %s push queue', (child) => {
  const { parent, column } = PARENT_GATED_QUEUES[child];
  let db: Db;
  beforeEach(async () => {
    db = await runtimeDb();
    insert(db, parent, { id: 'p-waiting', pet_id: 'pet-1', synced: 0 });
    insert(db, parent, { id: 'p-landed', pet_id: 'pet-1', synced: 1 });
    insert(db, parent, { id: 'p-quarantined', pet_id: 'pet-1', synced: 0, sync_error: '23514: refused' });
    const row = (id: string, parentId: string | null) => {
      // A dose is its event's child on this phone (a real foreign key), one per event.
      if (child === 'medication_administrations') insert(db, 'events', { id: `ev-${id}`, pet_id: 'pet-1' });
      insert(db, child, {
        id, pet_id: 'pet-1', [column]: parentId, synced: 0,
        ...(child === 'medication_administrations' ? { event_id: `ev-${id}` } : {}),
      });
    };
    row('waits', 'p-waiting');
    row('after-landing', 'p-landed');
    row('after-quarantine', 'p-quarantined');
    row('parent-not-held-here', 'p-elsewhere');
    // An ad-hoc dose names no course; an allowed food always names its trial.
    if (child === 'medication_administrations') row('no-parent', null);
  });
  afterEach(() => db.close());

  const unheld = () => [
    'after-landing', 'after-quarantine', 'parent-not-held-here',
    ...(child === 'medication_administrations' ? ['no-parent'] : []),
  ].sort();

  it(`holds a row whose ${parent} row has not landed, and only that row`, () => {
    expect(pickedChildren(db, child)).toEqual(unheld());
  });

  it('pushes the held row once its parent lands', () => {
    db.prepare(`UPDATE ${parent} SET synced = 1 WHERE id = ?`).run('p-waiting');
    expect(pickedChildren(db, child)).toEqual([...unheld(), 'waits'].sort());
  });

  it('holds nothing behind a quarantined parent: there is no landing left to wait for', () => {
    db.prepare(`UPDATE ${parent} SET sync_error = '23514: refused' WHERE id = ?`).run('p-waiting');
    expect(pickedChildren(db, child)).toEqual([...unheld(), 'waits'].sort());
  });

  it('still skips a quarantined row, whatever its parent', () => {
    db.prepare(`UPDATE ${child} SET sync_error = '23503: fk' WHERE id = 'after-landing'`).run();
    expect(pickedChildren(db, child)).not.toContain('after-landing');
  });
});

// Derived from the schema rather than from the map under test (C-38): every column on a
// queue table that names another queue table's row by the `<parent>_id` convention is a
// parent the push must wait for. Two parents are out of this scan's scope and say so:
// `vet_visit_id` is the visit gate's (pinned above), and `event_id` is each event
// child's own drain's (meals, weight checks and looks join `events`; event attachments
// and doses do not, which this scan does not judge).
it('every queue column that names another queue table\'s row is parent-gated', async () => {
  const db = await runtimeDb();
  const queues = (db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as { name: string }[])
    .map((r) => r.name)
    .filter((name) => columns(db, name).some((c) => c.name === 'synced'));
  const found: string[] = [];
  for (const table of queues) {
    for (const c of columns(db, table)) {
      const m = /^(\w+)_id$/.exec(c.name);
      if (!m || c.name === 'event_id' || c.name === 'vet_visit_id') continue;
      if (queues.includes(`${m[1]}s`)) found.push(`${table}.${c.name} -> ${m[1]}s`);
    }
  }
  db.close();
  // Non-vacuity: the convention does find the parents this gate exists for.
  expect(found.length).toBeGreaterThan(0);
  expect(found.sort()).toEqual(
    Object.entries(PARENT_GATED_QUEUES).map(([child, { parent, column }]) => `${child}.${column} -> ${parent}`).sort(),
  );
});
