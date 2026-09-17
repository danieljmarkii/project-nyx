// B-417 PR 2 — the three testable halves of the diet-trial local-mirror plumbing:
//
//   1. DIET_TRIAL_SCHEMA_SQL — the EXACT production local DDL lib/db.ts initDb
//      runs — exercised against an in-memory node:sqlite (the same harness as
//      lib/medications.test.ts / lib/foodQueries.test.ts). The expo-sqlite jest
//      mock never runs the DDL, so the load-bearing behaviours — the dated
//      membership UNIQUE constraint, the deliberately NON-unique local active
//      index, the soft-delete round trip — are otherwise unverified until
//      on-device.
//   2. ACTIVE_DIET_TRIAL_QUERY — including the conflict rule that a SYNCED
//      active trial outranks an unsynced local one, which is the only thing
//      standing between a split-brain device and a widget rendering a day
//      counter for a trial no other device agrees exists.
//   3. The pure row→Supabase-payload mappers and the terminal-error classifier
//      the §3.3 UNIQUE active-trial index made necessary.

import {
  DIET_TRIAL_SCHEMA_SQL,
  ACTIVE_DIET_TRIAL_QUERY,
  DIET_TRIAL_PUSH_QUEUE_SQL,
  DIET_TRIAL_FOOD_PUSH_QUEUE_SQL,
  DIET_TRIAL_FOOD_COLLISION_SQL,
  dietTrialRowToRemote,
  dietTrialFoodRowToRemote,
  isTerminalSyncError,
  formatSyncError,
  TERMINAL_SYNC_ERROR_CODES,
  type LocalDietTrial,
  type LocalDietTrialFood,
} from './dietTrialMirror';
import { COLUMN_UPGRADES, applyColumnUpgrades } from './localSchema';
import { readFileSync } from 'fs';
import { join } from 'path';

// node:sqlite is Node ≥ 22 core; require() keeps it off the babel/jest-expo path
// (same loader trick as lib/medications.test.ts).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');

type Row = Record<string, unknown>;

function freshDb() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  // The food cache is the ACTIVE_DIET_TRIAL_QUERY join target. Only the columns
  // the label COALESCE touches — the full production DDL is exercised elsewhere.
  db.exec(`CREATE TABLE food_items_cache (
    id TEXT PRIMARY KEY, brand TEXT, product_name TEXT
  );`);
  db.exec(DIET_TRIAL_SCHEMA_SQL);
  return db;
}

/** The columns a table actually has, read back from a built database. */
function columnsOf(db: { prepare: (sql: string) => { all: () => unknown[] } }, table = 'diet_trials'): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
}

function insertTrial(db: ReturnType<typeof freshDb>, overrides: Record<string, string> = {}) {
  const v = {
    id: 'trial-1',
    pet_id: 'pet-1',
    started_at: '2026-07-01',
    target_duration_days: '56',
    status: 'active',
    ...overrides,
  };
  db.exec(
    `INSERT INTO diet_trials (id, pet_id, started_at, target_duration_days, status)
     VALUES ('${v.id}', '${v.pet_id}', '${v.started_at}', ${v.target_duration_days}, '${v.status}')`,
  );
}

describe('DIET_TRIAL_SCHEMA_SQL — production local DDL', () => {
  it('round-trips a trial, defaulting to unsynced / active / elimination / no error', () => {
    const db = freshDb();
    insertTrial(db);
    const t = db.prepare('SELECT * FROM diet_trials WHERE id = ?').get('trial-1') as Row;
    expect(t.status).toBe('active'); // server default mirrored
    expect(t.phase).toBe('elimination'); // migration 040's NOT NULL DEFAULT
    expect(t.synced).toBe(0); // queued for push
    expect(t.sync_error).toBeNull(); // nothing has failed yet
    db.close();
  });

  it('carries every migration-040 column, so a hydrated row loses nothing', () => {
    // The mirror must be able to HOLD what the server sends; a column missing
    // here reads back undefined on device and silently blanks a vet-report field.
    const db = freshDb();
    insertTrial(db);
    db.exec(`UPDATE diet_trials SET
      food_label = 'Royal Canin HP', indication = 'skin', outcome = 'improved',
      outcome_notes = 'itching down', stopped_reason = NULL, ended_at = '2026-08-26',
      transition_started_at = '2026-06-24', completed_at = '2026-08-26',
      vet_name = 'Dr Chen', notes = 'strict'
      WHERE id = 'trial-1'`);
    const t = db.prepare('SELECT * FROM diet_trials WHERE id = ?').get('trial-1') as Row;
    expect(t.food_label).toBe('Royal Canin HP');
    expect(t.indication).toBe('skin');
    expect(t.outcome).toBe('improved');
    expect(t.ended_at).toBe('2026-08-26');
    expect(t.transition_started_at).toBe('2026-06-24');
    db.close();
  });

  it('carries the B-704 trial-protein columns, defaulting NULL for a never-set trial', () => {
    // migration 053: two nullable columns the vet-report naming reads. A column
    // missing from the local DDL reads back undefined on device and silently blanks
    // the report's protein identity — the same failure mode the 040 test guards.
    // insertTrial sets neither, so both default NULL (the honest value: the owner
    // has confirmed nothing, and derivation still runs at read).
    const db = freshDb();
    insertTrial(db);
    let t = db.prepare('SELECT * FROM diet_trials WHERE id = ?').get('trial-1') as Row;
    expect(t.target_protein).toBeNull();
    expect(t.target_protein_set_at).toBeNull();

    // A hydrated owner-confirmed protein round-trips, with its ISO/UTC provenance
    // stamp intact (TEXT locally, so it compares on one clock — the mirror header's
    // TIMESTAMPTZ→ISO rule).
    db.exec(`UPDATE diet_trials SET
      target_protein = 'duck', target_protein_set_at = '2026-07-03T09:00:00.000Z'
      WHERE id = 'trial-1'`);
    t = db.prepare('SELECT * FROM diet_trials WHERE id = ?').get('trial-1') as Row;
    expect(t.target_protein).toBe('duck');
    expect(t.target_protein_set_at).toBe('2026-07-03T09:00:00.000Z');
    db.close();
  });

  it('carries the CUL-1037 window-provenance columns, defaulting NULL for a trial that never moved', () => {
    // migration 068: three nullable columns the vet report reads to say a window
    // MOVED. A column missing from the local DDL reads back undefined on device
    // and silently blanks the report's window history — the same failure mode the
    // 040 and 053 tests guard. insertTrial sets none of them, and NULL is the
    // honest value: this trial's window has never moved.
    const db = freshDb();
    insertTrial(db);
    let t = db.prepare('SELECT * FROM diet_trials WHERE id = ?').get('trial-1') as Row;
    expect(t.target_duration_days_initial).toBeNull();
    expect(t.target_duration_set_at).toBeNull();
    expect(t.target_duration_vet_directed).toBeNull();

    // A moved window round-trips: the designed length, the ISO/UTC stamp (TEXT
    // locally so it compares on one clock), and the owner's box as SQLite's 1 —
    // there is no BOOLEAN affinity here, which is why the column is INTEGER.
    db.exec(`UPDATE diet_trials SET
      target_duration_days_initial = 56,
      target_duration_set_at = '2026-09-19T14:00:00.000Z',
      target_duration_vet_directed = 1
      WHERE id = 'trial-1'`);
    t = db.prepare('SELECT * FROM diet_trials WHERE id = ?').get('trial-1') as Row;
    expect(t.target_duration_days_initial).toBe(56);
    expect(t.target_duration_set_at).toBe('2026-09-19T14:00:00.000Z');
    expect(t.target_duration_vet_directed).toBe(1);

    // The two-sided rule's storage half (spec §5.1): an UNCHECKED box is storable
    // as either NULL or 0 and the mirror keeps them apart as values while the
    // render treats both as silence. Asserted here so a future reader cannot
    // conclude from the column alone that 0 means "the owner did this on their
    // own" — the DDL permits both spellings precisely because neither is a claim.
    db.exec(`UPDATE diet_trials SET target_duration_vet_directed = 0 WHERE id = 'trial-1'`);
    t = db.prepare('SELECT * FROM diet_trials WHERE id = ?').get('trial-1') as Row;
    expect(t.target_duration_vet_directed).toBe(0);
    db.close();
  });

  it('does NOT enforce one active trial per pet locally (the split-brain must be representable)', () => {
    // Server-side this is a UNIQUE index (migration 040 §3.3). Locally it must
    // NOT be: a device that lost the race holds its own unsynced active row AND
    // must still be able to hydrate the server's winner. A local UNIQUE would
    // make that hydrate throw, leaving the loser in place and unfixable — the
    // exact failure 040's header describes.
    const db = freshDb();
    insertTrial(db, { id: 'mine' });
    expect(() => insertTrial(db, { id: 'theirs' })).not.toThrow();
    const n = db.prepare(
      `SELECT COUNT(*) AS c FROM diet_trials WHERE pet_id = 'pet-1' AND status = 'active'`,
    ).get() as Row;
    expect(n.c).toBe(2);
    db.close();
  });

  it('rejects a same-day re-add of the same food at the same role (dated membership)', () => {
    // UNIQUE (diet_trial_id, food_item_id, role, allowed_from), mirrored from the
    // server so the collision surfaces AT THE ACTION, offline, where PR 3 can
    // revive the existing row — instead of queueing an insert already doomed.
    const db = freshDb();
    insertTrial(db);
    db.exec(`INSERT INTO diet_trial_foods
      (id, diet_trial_id, pet_id, food_item_id, role, food_label, allowed_from)
      VALUES ('f1', 'trial-1', 'pet-1', 'food-1', 'permitted_treat', 'Dental chew', '2026-07-10')`);
    // Removal is an UPDATE, never a DELETE (migration 040's own reading).
    db.exec(`UPDATE diet_trial_foods SET deleted_at = '2026-07-10T12:00:00Z' WHERE id = 'f1'`);
    // Same day, same food, same role → a double-tap, not a history.
    expect(() =>
      db.exec(`INSERT INTO diet_trial_foods
        (id, diet_trial_id, pet_id, food_item_id, role, food_label, allowed_from)
        VALUES ('f2', 'trial-1', 'pet-1', 'food-1', 'permitted_treat', 'Dental chew', '2026-07-10')`),
    ).toThrow(/UNIQUE/i);
    db.close();
  });

  it('accepts a re-add on a LATER day as a new row (a real removal-then-re-add)', () => {
    const db = freshDb();
    insertTrial(db);
    db.exec(`INSERT INTO diet_trial_foods
      (id, diet_trial_id, pet_id, food_item_id, role, food_label, allowed_from, allowed_until)
      VALUES ('f1', 'trial-1', 'pet-1', 'food-1', 'permitted_treat', 'Dental chew', '2026-07-10', '2026-07-12')`);
    db.exec(`INSERT INTO diet_trial_foods
      (id, diet_trial_id, pet_id, food_item_id, role, food_label, allowed_from)
      VALUES ('f2', 'trial-1', 'pet-1', 'food-1', 'permitted_treat', 'Dental chew', '2026-07-20')`);
    const rows = db.prepare(
      `SELECT id, allowed_from, allowed_until FROM diet_trial_foods ORDER BY allowed_from`,
    ).all() as Row[];
    // Two rows, two windows — the exposure history of days 10-12 is untouched by
    // the day-20 re-add, which is the whole point of dated membership.
    expect(rows.map((r) => r.id)).toEqual(['f1', 'f2']);
    expect(rows[0].allowed_until).toBe('2026-07-12');
    expect(rows[1].allowed_until).toBeNull();
    db.close();
  });

  it('accepts the same food at a DIFFERENT role on the same day', () => {
    // role is part of the key on purpose: a food can be the primary diet and a
    // permitted treat, and those are different membership facts.
    const db = freshDb();
    insertTrial(db);
    db.exec(`INSERT INTO diet_trial_foods
      (id, diet_trial_id, pet_id, food_item_id, role, food_label, allowed_from)
      VALUES ('f1', 'trial-1', 'pet-1', 'food-1', 'primary_diet', 'RC HP dry', '2026-07-10')`);
    expect(() =>
      db.exec(`INSERT INTO diet_trial_foods
        (id, diet_trial_id, pet_id, food_item_id, role, food_label, allowed_from)
        VALUES ('f2', 'trial-1', 'pet-1', 'food-1', 'permitted_treat', 'RC HP dry', '2026-07-10')`),
    ).not.toThrow();
    db.close();
  });

  it('declares no SQLite foreign key, so an allowed food can hydrate before its trial', () => {
    // Per-table pulls mean the child can arrive first. A local FK would reject
    // the insert outright (lib/medications.ts:75-78, same rule).
    const db = freshDb();
    db.exec(`INSERT INTO diet_trial_foods
      (id, diet_trial_id, pet_id, food_item_id, role, food_label, allowed_from)
      VALUES ('f1', 'no-such-trial', 'pet-1', 'no-such-food', 'primary_diet', 'X', '2026-07-10')`);
    const f = db.prepare('SELECT * FROM diet_trial_foods WHERE id = ?').get('f1') as Row;
    expect(f.diet_trial_id).toBe('no-such-trial');
    expect(f.synced).toBe(0);
    db.close();
  });
});

describe('the push queues skip quarantined rows', () => {
  it('excludes a row carrying a sync_error, and includes it again once cleared', () => {
    // The terminal branch's whole purpose: a row that can never land stops being
    // re-sent every cycle — WITHOUT being flagged synced, which would be a lie.
    const db = freshDb();
    insertTrial(db);
    expect((db.prepare(DIET_TRIAL_PUSH_QUEUE_SQL).all() as Row[]).length).toBe(1);

    db.exec(`UPDATE diet_trials SET sync_error = '23505: duplicate key' WHERE id = 'trial-1'`);
    expect((db.prepare(DIET_TRIAL_PUSH_QUEUE_SQL).all() as Row[]).length).toBe(0);
    // Still honestly unsynced — the quarantine never claims otherwise.
    const t = db.prepare('SELECT synced FROM diet_trials WHERE id = ?').get('trial-1') as Row;
    expect(t.synced).toBe(0);

    // The contract for every local write path: synced = 0, sync_error = NULL.
    db.exec(`UPDATE diet_trials SET synced = 0, sync_error = NULL WHERE id = 'trial-1'`);
    expect((db.prepare(DIET_TRIAL_PUSH_QUEUE_SQL).all() as Row[]).length).toBe(1);
    db.close();
  });

  it('applies the same quarantine filter to the allowed set', () => {
    const db = freshDb();
    insertTrial(db);
    db.exec(`INSERT INTO diet_trial_foods
      (id, diet_trial_id, pet_id, food_item_id, role, food_label, allowed_from)
      VALUES ('f1', 'trial-1', 'pet-1', 'food-1', 'primary_diet', 'RC HP', '2026-07-10')`);
    expect((db.prepare(DIET_TRIAL_FOOD_PUSH_QUEUE_SQL).all() as Row[]).length).toBe(1);
    db.exec(`UPDATE diet_trial_foods SET sync_error = '23505: dup' WHERE id = 'f1'`);
    expect((db.prepare(DIET_TRIAL_FOOD_PUSH_QUEUE_SQL).all() as Row[]).length).toBe(0);
    db.close();
  });
});

describe('DIET_TRIAL_FOOD_COLLISION_SQL (hydration natural-key resolution)', () => {
  // Setup shared by both cases: a local row already occupies the tuple, and the
  // server's row for the SAME tuple arrives under a different id.
  function collidingDb(localSynced: 0 | 1) {
    const db = freshDb();
    insertTrial(db);
    db.exec(`INSERT INTO diet_trial_foods
      (id, diet_trial_id, pet_id, food_item_id, role, food_label, allowed_from, synced)
      VALUES ('local', 'trial-1', 'pet-1', 'food-1', 'primary_diet', 'RC HP', '2026-07-10', ${localSynced})`);
    return db;
  }

  const HYDRATED_INSERT = `INSERT INTO diet_trial_foods
    (id, diet_trial_id, pet_id, food_item_id, role, food_label, allowed_from, synced)
    VALUES ('remote', 'trial-1', 'pet-1', 'food-1', 'primary_diet', 'RC HP', '2026-07-10', 1)`;

  it('clears an UNSYNCED duplicate so the server’s row can land', () => {
    // Device B lost the push race, so its local row can never reach the server;
    // device A's row comes down with a different id. Without this, the insert
    // violates the natural key and aborts the whole table's hydration.
    const db = collidingDb(0);
    expect(() => db.exec(HYDRATED_INSERT)).toThrow(/UNIQUE/i); // the hazard, unhandled
    db.close();

    const db2 = collidingDb(0);
    db2.prepare(DIET_TRIAL_FOOD_COLLISION_SQL).run(
      'trial-1', 'food-1', 'primary_diet', '2026-07-10', 'remote',
    );
    expect(() => db2.exec(HYDRATED_INSERT)).not.toThrow();
    const rows = db2.prepare('SELECT id FROM diet_trial_foods').all() as Row[];
    expect(rows.map((r) => r.id)).toEqual(['remote']);
    db2.close();
  });

  it('never destroys a SYNCED row', () => {
    // The guard's whole point. A synced row is one the server has, and the server
    // enforces the same UNIQUE constraint — so this case is unreachable, and the
    // filter fails LOUD (the insert still throws) rather than deleting real data.
    const db = collidingDb(1);
    db.prepare(DIET_TRIAL_FOOD_COLLISION_SQL).run(
      'trial-1', 'food-1', 'primary_diet', '2026-07-10', 'remote',
    );
    const rows = db.prepare('SELECT id FROM diet_trial_foods').all() as Row[];
    expect(rows.map((r) => r.id)).toEqual(['local']);
    db.close();
  });

  it('leaves the row alone when it IS the arriving row (an ordinary re-hydrate)', () => {
    // The common path: the same id coming down again. Deleting here would turn
    // every update into a delete + insert and lose the id's local history.
    const db = collidingDb(0);
    db.prepare(DIET_TRIAL_FOOD_COLLISION_SQL).run(
      'trial-1', 'food-1', 'primary_diet', '2026-07-10', 'local',
    );
    expect((db.prepare('SELECT id FROM diet_trial_foods').all() as Row[]).length).toBe(1);
    db.close();
  });

  it('leaves a DIFFERENT-day membership row alone (dated history is not a collision)', () => {
    const db = collidingDb(0);
    db.prepare(DIET_TRIAL_FOOD_COLLISION_SQL).run(
      'trial-1', 'food-1', 'primary_diet', '2026-07-20', 'remote',
    );
    expect((db.prepare('SELECT id FROM diet_trial_foods').all() as Row[]).length).toBe(1);
    db.close();
  });
});

describe('ACTIVE_DIET_TRIAL_QUERY', () => {
  it('returns the pet’s active trial with the cache label', () => {
    const db = freshDb();
    db.exec(`INSERT INTO food_items_cache (id, brand, product_name)
             VALUES ('food-1', 'Royal Canin', 'Hydrolyzed Protein')`);
    insertTrial(db, { id: 'trial-1' });
    db.exec(`UPDATE diet_trials SET food_item_id = 'food-1' WHERE id = 'trial-1'`);
    const row = db.prepare(ACTIVE_DIET_TRIAL_QUERY).get('pet-1') as Row;
    expect(row.started_at).toBe('2026-07-01');
    expect(row.target_duration_days).toBe(56);
    expect(row.food_label).toBe('Royal Canin Hydrolyzed Protein');
    db.close();
  });

  it('falls back to the denormalized food_label when the cache has not hydrated', () => {
    // food_item_id is ON DELETE SET NULL server-side and the cache is a separate
    // pull, so the join can miss. The snapshot column exists for exactly this.
    const db = freshDb();
    insertTrial(db);
    db.exec(`UPDATE diet_trials SET food_item_id = 'food-1', food_label = 'RC HP (saved)' WHERE id = 'trial-1'`);
    const row = db.prepare(ACTIVE_DIET_TRIAL_QUERY).get('pet-1') as Row;
    expect(row.food_label).toBe('RC HP (saved)');
    db.close();
  });

  it('returns null-ish label rather than whitespace when neither source names the food', () => {
    // A bare ' ' label would render as a blank one-tap choice on the widget; the
    // no-garbage rule wants an absent name, which buildMealChoices then skips.
    const db = freshDb();
    db.exec(`INSERT INTO food_items_cache (id, brand, product_name) VALUES ('food-1', NULL, NULL)`);
    insertTrial(db);
    db.exec(`UPDATE diet_trials SET food_item_id = 'food-1' WHERE id = 'trial-1'`);
    const row = db.prepare(ACTIVE_DIET_TRIAL_QUERY).get('pet-1') as Row;
    expect(row.food_label).toBeNull();
    db.close();
  });

  it('ignores completed and abandoned trials', () => {
    const db = freshDb();
    insertTrial(db, { id: 'old', status: 'completed' });
    insertTrial(db, { id: 'quit', status: 'abandoned' });
    expect(db.prepare(ACTIVE_DIET_TRIAL_QUERY).get('pet-1')).toBeUndefined();
    db.close();
  });

  it('scopes to the pet — another pet’s trial never leaks into this snapshot', () => {
    const db = freshDb();
    insertTrial(db, { id: 'other', pet_id: 'pet-2', started_at: '2026-06-01' });
    expect(db.prepare(ACTIVE_DIET_TRIAL_QUERY).get('pet-1')).toBeUndefined();
    db.close();
  });

  it('prefers the SYNCED active trial over an unsynced local one (the split-brain rule)', () => {
    // Two devices start a trial offline; one loses the UNIQUE active index race
    // and its row can never land. The server is authoritative under the house's
    // last-write-wins-with-no-merge rule, so the row that ACTUALLY LANDED is the
    // one the widget counts days against. Without this the loser could win on
    // started_at and publish a day counter no other device agrees with.
    const db = freshDb();
    insertTrial(db, { id: 'loser', started_at: '2026-07-20' }); // newer, unsynced
    insertTrial(db, { id: 'winner', started_at: '2026-07-01' });
    db.exec(`UPDATE diet_trials SET synced = 1 WHERE id = 'winner'`);
    const row = db.prepare(ACTIVE_DIET_TRIAL_QUERY).get('pet-1') as Row;
    expect(row.started_at).toBe('2026-07-01');
    db.close();
  });

  it('is deterministic between two rows of equal sync state (newest start, then id)', () => {
    const db = freshDb();
    insertTrial(db, { id: 'b', started_at: '2026-07-01' });
    insertTrial(db, { id: 'a', started_at: '2026-07-05' });
    const first = db.prepare(ACTIVE_DIET_TRIAL_QUERY).get('pet-1') as Row;
    expect(first.started_at).toBe('2026-07-05');
    db.close();
  });

  it('does not select indication (diagnosis-grade — must not cross into the App Group)', () => {
    // 'skin' names a suspected condition, the snapshot persists on disk in the
    // shared container, and the widget only renders a day counter. Constraint
    // carried from PR 1's rls-privacy-reviewer pass.
    expect(ACTIVE_DIET_TRIAL_QUERY).not.toMatch(/indication/);
    const db = freshDb();
    insertTrial(db);
    db.exec(`UPDATE diet_trials SET indication = 'skin' WHERE id = 'trial-1'`);
    const row = db.prepare(ACTIVE_DIET_TRIAL_QUERY).get('pet-1') as Row;
    expect(Object.keys(row)).toEqual(
      expect.not.arrayContaining(['indication', 'vet_name', 'notes', 'outcome_notes']),
    );
    db.close();
  });
});

describe('COLUMN_UPGRADES — the ALTER path an already-installed device takes (CUL-1037)', () => {
  // DIET_TRIAL_SCHEMA_SQL reaches a FRESH install. It cannot reach the PM's
  // phone: `diet_trials` predates migration 068, so CREATE TABLE IF NOT EXISTS is
  // a no-op there and only COLUMN_UPGRADES can add the columns. That asymmetry is
  // the bug class this whole list exists for — it works on the simulator and is
  // missing on the device — so the upgrade is driven here against a table built
  // the way a pre-068 build actually left it, not asserted by re-reading the
  // constant.
  const WINDOW_COLUMNS = [
    'target_duration_days_initial',
    'target_duration_set_at',
    'target_duration_vet_directed',
  ] as const;

  /** The diet_trials DDL exactly as the build before 068 shipped it. */
  function pre068Ddl(): string {
    const stripped = DIET_TRIAL_SCHEMA_SQL.split('\n').filter(
      (line) => !/^\s*target_duration_(days_initial|set_at|vet_directed)\s+\w+,\s*$/.test(line),
    );
    // Non-vacuity floor: if the strip matched nothing, every assertion below is
    // green over a table that already has the columns and measures nothing.
    expect(DIET_TRIAL_SCHEMA_SQL.split('\n').length - stripped.length).toBe(WINDOW_COLUMNS.length);
    return stripped.join('\n');
  }

  it('adds all three window-provenance columns to a pre-068 diet_trials', async () => {
    const db = new DatabaseSync(':memory:');
    db.exec(pre068Ddl());

    // The other half of the floor: the fixture must genuinely lack them, or the
    // upgrade is being credited with work the DDL already did. Asserted PER
    // COLUMN — expect.not.arrayContaining over the whole set only fails when
    // every member is present, so it would pass over a fixture that kept two of
    // the three.
    for (const c of WINDOW_COLUMNS) expect(columnsOf(db)).not.toContain(c);

    await applyColumnUpgrades(
      async (sql) => db.exec(sql),
      COLUMN_UPGRADES.filter((u) => u.table === 'diet_trials'),
    );
    expect(columnsOf(db)).toEqual(expect.arrayContaining([...WINDOW_COLUMNS]));
    db.close();
  });

  it("unblocks the PR 2 write that would otherwise throw 'no such column' on device", async () => {
    // The mutation proof, run both ways in one test: the exact UPDATE shape the
    // window-change write path will issue fails against a pre-068 table and
    // succeeds after the upgrade. Deleting the three COLUMN_UPGRADES entries reds
    // this; deleting them and the DDL lines together still reds it.
    const write = `UPDATE diet_trials SET
      target_duration_days_initial = 56,
      target_duration_set_at = '2026-09-19T14:00:00.000Z',
      target_duration_vet_directed = 1
      WHERE id = 'trial-1'`;

    const db = new DatabaseSync(':memory:');
    db.exec(pre068Ddl());
    db.exec(`INSERT INTO diet_trials (id, pet_id, started_at, target_duration_days, status)
             VALUES ('trial-1', 'pet-1', '2026-07-26', 56, 'active')`);
    expect(() => db.exec(write)).toThrow(/no such column/i);

    await applyColumnUpgrades(
      async (sql) => db.exec(sql),
      COLUMN_UPGRADES.filter((u) => u.table === 'diet_trials'),
    );
    expect(() => db.exec(write)).not.toThrow();
    const t = db.prepare('SELECT * FROM diet_trials WHERE id = ?').get('trial-1') as Row;
    expect(t.target_duration_days_initial).toBe(56);
    expect(t.target_duration_vet_directed).toBe(1);
    db.close();
  });

  it('is idempotent — a second launch re-runs every add and swallows the duplicate', async () => {
    // applyColumnUpgrades catches per column, so the second launch of an upgraded
    // app must be a silent no-op rather than a startup failure. Driven against the
    // FRESH DDL, where every add is already a duplicate on the first pass.
    const db = new DatabaseSync(':memory:');
    db.exec(DIET_TRIAL_SCHEMA_SQL);
    const before = columnsOf(db);
    const upgrades = COLUMN_UPGRADES.filter((u) => u.table === 'diet_trials');
    await expect(applyColumnUpgrades(async (sql) => db.exec(sql), upgrades)).resolves.toBeUndefined();
    await expect(applyColumnUpgrades(async (sql) => db.exec(sql), upgrades)).resolves.toBeUndefined();
    expect(columnsOf(db)).toEqual(before);
    db.close();
  });
});

describe('row → Supabase upsert mappers', () => {
  const trial: LocalDietTrial = {
    id: 't1', pet_id: 'p1', food_item_id: 'f1', started_at: '2026-07-01',
    target_duration_days: 56, status: 'active', completed_at: null,
    vet_name: 'Dr Chen', notes: null, food_label: 'RC HP', indication: 'skin',
    phase: 'elimination', outcome: null, outcome_notes: null, stopped_reason: null,
    ended_at: null, transition_started_at: '2026-06-24',
    target_protein: 'duck', target_protein_set_at: '2026-07-01T00:00:00.000Z',
    // CUL-1039 (migration 068) — the steady state of a trial whose window has
    // never moved. NULL across all three, and `days_initial` NULL specifically
    // means NOT RECORDED (068's backfill cannot reach a trial created after the
    // apply), never a number.
    target_duration_days_initial: null, target_duration_set_at: null,
    target_duration_vet_directed: null,
    vet_visit_id: null, // CUL-899 — no writer until VV-3, so null is the steady state
    created_at: '2026-07-01T00:00:00.000Z', updated_at: '2026-07-01T00:00:00.000Z',
  };

  const food: LocalDietTrialFood = {
    id: 'df1', diet_trial_id: 't1', pet_id: 'p1', food_item_id: 'f1',
    role: 'primary_diet', food_label: 'RC HP dry', allowed_from: '2026-07-01',
    allowed_until: null, deleted_at: null,
    created_at: '2026-07-01T00:00:00.000Z', updated_at: '2026-07-01T00:00:00.000Z',
  };

  // Columns that exist LOCALLY and deliberately never travel. Not drift — the
  // mapper's own contract is to drop them (B-398's quarantine pair plus `synced`).
  const LOCAL_ONLY_COLUMNS = ['synced', 'sync_attempts', 'sync_error'] as const;

  // Server columns that exist but which the mapper does NOT yet forward, each
  // with the issue that lands it. THE EMPTY SET IS THE ASSERTION (C-32): adding a
  // column to the mapper without emptying this registry reds the test below, and
  // so does leaving a registered column unforwarded — the two halves cannot drift
  // apart. Keep this at zero entries; an entry is a dated exception, not a
  // parking space.
  // Emptied by CUL-1039, in the same change that added the three columns to the
  // mapper — the two halves cannot be separated without reddening this file, which
  // is the registry's whole purpose and was proved by mutation on #866.
  const PENDING_MAPPER_COLUMNS: Readonly<Record<string, string>> = {};

  it('forwards every diet_trials server column (the B-057 drift guard)', () => {
    // Completeness, asserted on the KEY SET: a column silently dropped here
    // desyncs forever and nothing else in the stack would notice.
    //
    // The expected set is DERIVED from the DDL this repo actually executes, not
    // from a list re-typed beside it (C-38: derive the expected set from the
    // repository, never from the constant under test). The hardcoded literal this
    // replaced could not see the one thing it exists to catch — proven by
    // mutation: with migration 068's three columns in the DDL and absent from the
    // mapper, it was GREEN, and adding them, the correct fix, turned it RED. A
    // guard that is green on the drift and red on the repair is worse than none.
    const db = freshDb();
    const serverColumns = columnsOf(db)
      .filter((c) => !(LOCAL_ONLY_COLUMNS as readonly string[]).includes(c))
      .filter((c) => !(c in PENDING_MAPPER_COLUMNS));
    db.close();

    // Non-vacuity floor: a derivation that yielded nothing would pass over an
    // empty mapper.
    expect(serverColumns.length).toBeGreaterThan(15);
    expect(Object.keys(dietTrialRowToRemote(trial)).sort()).toEqual(serverColumns.sort());
  });

  it('has no unforwarded server column beyond the registered pending set', () => {
    // The other direction, and the reason PENDING_MAPPER_COLUMNS cannot rot: a
    // registered column that the mapper HAS now is a stale entry, and an
    // unregistered column it lacks is drift. Either reds here.
    const db = freshDb();
    const local = columnsOf(db);
    db.close();
    const forwarded = new Set(Object.keys(dietTrialRowToRemote(trial)));
    const unforwarded = local
      .filter((c) => !(LOCAL_ONLY_COLUMNS as readonly string[]).includes(c))
      .filter((c) => !forwarded.has(c));
    expect(unforwarded.sort()).toEqual(Object.keys(PENDING_MAPPER_COLUMNS).sort());
  });

  it('forwards the visit link as-is, and it moves NO other value (CUL-899)', () => {
    // The link is PROVENANCE — where the trial came from — and CUL-746/TG-5 make
    // that a rule with teeth: it must never become a source of numbers. So this
    // asserts both halves. The link rides (absent and set), and setting it changes
    // nothing else on the payload — in particular not `started_at`, which is the
    // date every coverage denominator in the report is measured from.
    expect(dietTrialRowToRemote(trial).vet_visit_id).toBeNull();
    const linked = dietTrialRowToRemote({ ...trial, vet_visit_id: 'visit-9' });
    expect(linked.vet_visit_id).toBe('visit-9');
    expect({ ...linked, vet_visit_id: null }).toEqual(dietTrialRowToRemote(trial));
  });

  it('coerces the vet-directed flag INTEGER → BOOLEAN, and never invents a false (CUL-1039)', () => {
    // SQLite has no boolean type, so the mirror stores 1/0/NULL against a server
    // BOOLEAN. The mapping is one to one in BOTH directions, and the third state is
    // the point: §5.1's two-sided rule makes NULL and false indistinguishable
    // DOWNSTREAM — both are silence — but a mapper that normalised NULL to false on
    // the wire would be answering, in the record, a question the owner was never
    // asked. Asserted with `toBeNull` / `toBe(false)` rather than a truthiness
    // check, which cannot tell them apart.
    expect(dietTrialRowToRemote({ ...trial, target_duration_vet_directed: 1 })
      .target_duration_vet_directed).toBe(true);
    expect(dietTrialRowToRemote({ ...trial, target_duration_vet_directed: 0 })
      .target_duration_vet_directed).toBe(false);
    expect(dietTrialRowToRemote({ ...trial, target_duration_vet_directed: null })
      .target_duration_vet_directed).toBeNull();
  });

  it('forwards the window provenance as-is, and it moves NO other value (CUL-1039)', () => {
    // The same two-sided shape as the visit link above, for the same reason: these
    // three columns exist to let the report say the window MOVED, and a mapper that
    // also nudged `target_duration_days` or `started_at` would be moving the
    // numbers the disclosure is about.
    const moved = dietTrialRowToRemote({
      ...trial,
      target_duration_days: 84,
      target_duration_days_initial: 56,
      target_duration_set_at: '2026-09-19T10:00:00.000Z',
      target_duration_vet_directed: 1,
    });
    expect(moved.target_duration_days_initial).toBe(56);
    expect(moved.target_duration_set_at).toBe('2026-09-19T10:00:00.000Z');
    expect(moved.target_duration_days).toBe(84);
    expect({
      ...moved,
      target_duration_days: 56,
      target_duration_days_initial: null,
      target_duration_set_at: null,
      target_duration_vet_directed: null,
    }).toEqual(dietTrialRowToRemote(trial));
  });

  it('never forwards the local-only synced / sync_error columns', () => {
    const payload = dietTrialRowToRemote({
      ...trial,
      // Deliberately shaped like a row read by SELECT *, which DOES carry both.
      ...({ synced: 0, sync_error: '23505: dup' } as unknown as Partial<LocalDietTrial>),
    });
    expect(payload).not.toHaveProperty('synced');
    expect(payload).not.toHaveProperty('sync_error');
  });

  it('forwards the B-704 trial-protein columns by value, and a null protein as null', () => {
    // The mapper is what carries an owner-confirmed protein UP to the server. The
    // key-set test proves the columns are present; this proves the VALUES ride,
    // including the null case (a cleared / never-set / hydrolyzed trial), which
    // must travel as null rather than being dropped.
    expect(dietTrialRowToRemote(trial).target_protein).toBe('duck');
    expect(dietTrialRowToRemote(trial).target_protein_set_at).toBe('2026-07-01T00:00:00.000Z');
    const cleared = dietTrialRowToRemote({ ...trial, target_protein: null, target_protein_set_at: null });
    expect(cleared.target_protein).toBeNull();
    expect(cleared.target_protein_set_at).toBeNull();
  });

  it('forwards every diet_trial_foods server column', () => {
    expect(Object.keys(dietTrialFoodRowToRemote(food)).sort()).toEqual(
      [
        'allowed_from', 'allowed_until', 'created_at', 'deleted_at', 'diet_trial_id',
        'food_item_id', 'food_label', 'id', 'pet_id', 'role', 'updated_at',
      ].sort(),
    );
  });

  it('carries deleted_at so a removal TRAVELS to the other device', () => {
    // The cross-device acceptance criterion in one line: removing a food is a
    // soft delete that rides the upsert (Pattern 5), never a separate DELETE.
    const removed = dietTrialFoodRowToRemote({ ...food, deleted_at: '2026-07-14T09:00:00.000Z' });
    expect(removed.deleted_at).toBe('2026-07-14T09:00:00.000Z');
  });

  it('preserves an open-ended membership as null rather than defaulting it', () => {
    expect(dietTrialFoodRowToRemote(food).allowed_until).toBeNull();
  });
});

// ── The PULL side's column lists, derived from the same DDL (CUL-1039) ───────
//
// WHY THIS EXISTS. `dietTrialRowToRemote` has a completeness guard; `hydrateDietTrials`
// did not, and its two column lists are hand-written strings. A column absent from
// the SELECT never comes down — no error, no log, the value simply stays on the
// server forever — and a column absent from the INSERT is dropped on arrival.
// `lib/sqlShape.test.ts` proves the INSERT's four lists COUNT OUT the same; it has
// nothing to say about a column missing from all four at once, which is exactly the
// drift shape migration 068 shipped with.
//
// The expected set is DERIVED from the executed DDL (C-38), so a future column is
// enrolled by existing, not by being remembered here.
//
// STATED BLIND SPOTS, because an undocumented one reads as coverage: this checks
// PRESENCE, not order, not the placeholder count (sqlShape's job), not that the
// param in that position is the right one, and not the two tables the same function
// does not touch. It is scoped to `diet_trials` deliberately — the other hydrators
// have the same hole and closing them is not this PR's (they are named in the
// session record).
describe('hydrateDietTrials column lists cover the local DDL (CUL-1039)', () => {
  const hydrateSource = (): string => {
    const src = readFileSync(join(__dirname, 'sync.ts'), 'utf8');
    const start = src.indexOf('async function hydrateDietTrials(');
    const end = src.indexOf('async function hydrateDietTrialFoods(', start);
    // Non-vacuity: a rename upstream must fail here rather than silently hand the
    // assertions an empty string, which every `toContain` below would pass over.
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return src.slice(start, end);
  };

  /** The server columns, from the DDL this repo actually executes. */
  const serverColumns = (): string[] => {
    const db = freshDb();
    const cols = columnsOf(db).filter(
      (c) => !['synced', 'sync_attempts', 'sync_error'].includes(c),
    );
    db.close();
    expect(cols.length).toBeGreaterThan(15); // the same floor the push guard uses
    return cols;
  };

  /** `indexOf` from a known-earlier anchor, refusing -1. The first draft of these
   *  tests searched the whole function body for `WHERE diet_trials.synced = 1` and
   *  found it in the function's own LEADING COMMENT, 2,000 characters before the
   *  statement — which inverted a slice into an empty string and reported every
   *  column missing. A marker that also appears in prose is not an anchor. */
  const at = (body: string, needle: string, from = 0): number => {
    const i = body.indexOf(needle, from);
    expect(i).toBeGreaterThan(-1);
    return i;
  };

  it('pulls every server column down (the SELECT list)', () => {
    const body = hydrateSource();
    const after = at(body, "'diet_trials',");
    const selectList = body.slice(after + "'diet_trials',".length, at(body, 'floor ?', after));
    const selected = (selectList.match(/'([^']*)'/g) ?? [])
      .map((q) => q.slice(1, -1))
      .join('')
      .split(',')
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    expect(selected.length).toBeGreaterThan(15);
    expect(serverColumns().filter((c) => !selected.includes(c))).toEqual([]);
  });

  it('writes every server column locally (the INSERT list)', () => {
    const body = hydrateSource();
    const insert = body.slice(at(body, 'INSERT INTO diet_trials'));
    const written = insert
      .slice(at(insert, '(') + 1, at(insert, ')'))
      .split(',')
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    expect(written.length).toBeGreaterThan(15);
    expect(serverColumns().filter((c) => !written.includes(c))).toEqual([]);
  });

  it('refreshes every server column on the conflict branch, except the immutable ones', () => {
    // A column in the INSERT but absent from ON CONFLICT DO UPDATE lands on the
    // first pull and then never changes again — a window that moved on another
    // device would arrive once and go stale, which is the same silence as not
    // pulling it. `id` is the conflict key and `created_at` is write-once by
    // definition; both are named rather than derived, because they are decisions.
    const body = hydrateSource();
    const conflictAt = at(body, 'ON CONFLICT(id) DO UPDATE SET');
    const clause = body.slice(conflictAt, at(body, 'WHERE diet_trials.synced = 1', conflictAt));
    expect(clause.length).toBeGreaterThan(200);
    const refreshed = serverColumns().filter((c) => !['id', 'created_at'].includes(c));
    expect(refreshed.length).toBeGreaterThan(15);
    expect(refreshed.filter((c) => !clause.includes(`${c}=excluded.${c}`))).toEqual([]);
  });
});

describe('isTerminalSyncError', () => {
  it('treats a 23505 as terminal — the UNIQUE active-trial index cannot be waited out', () => {
    expect(isTerminalSyncError({ code: '23505' })).toBe(true);
  });

  it('treats migration 041’s same-pet check_violation as terminal', () => {
    expect(isTerminalSyncError({ code: '23514' })).toBe(true);
  });

  it('treats a malformed row (not-null / bad enum text) as terminal', () => {
    expect(isTerminalSyncError({ code: '23502' })).toBe(true);
    expect(isTerminalSyncError({ code: '22P02' })).toBe(true);
  });

  it('does NOT treat an FK violation as terminal — the parent may land next cycle', () => {
    // 23503 is the expected mid-cycle state Pattern 1 and Pattern 6 exist to ride
    // out. Parking it would strand a perfectly good trial forever.
    expect(isTerminalSyncError({ code: '23503' })).toBe(false);
  });

  it('does NOT treat an RLS rejection as terminal (session / hydration race)', () => {
    expect(isTerminalSyncError({ code: '42501' })).toBe(false);
  });

  it('does NOT treat a codeless failure (network, timeout) as terminal', () => {
    expect(isTerminalSyncError({ message: 'Network request failed' } as { code?: string })).toBe(false);
    expect(isTerminalSyncError(null)).toBe(false);
    expect(isTerminalSyncError(undefined)).toBe(false);
  });

  it('pins the terminal set, so widening it is a deliberate edit', () => {
    expect([...TERMINAL_SYNC_ERROR_CODES]).toEqual(['23505', '23514', '23502', '22P02']);
  });
});

describe('formatSyncError', () => {
  it('leads with the code so the column is greppable by failure class', () => {
    expect(formatSyncError({ code: '23505', message: 'duplicate key value' }))
      .toBe('23505: duplicate key value');
  });

  it('degrades to the code alone when there is no message', () => {
    expect(formatSyncError({ code: '23505' })).toBe('23505');
    expect(formatSyncError({})).toBe('unknown');
  });

  it('truncates a long Postgres detail chain — this is a diagnostic, not a record', () => {
    const out = formatSyncError({ code: '23505', message: 'x'.repeat(1000) });
    expect(out.length).toBeLessThanOrEqual(300 + '23505: '.length);
  });
});
