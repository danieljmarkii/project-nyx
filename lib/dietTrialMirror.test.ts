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

describe('row → Supabase upsert mappers', () => {
  const trial: LocalDietTrial = {
    id: 't1', pet_id: 'p1', food_item_id: 'f1', started_at: '2026-07-01',
    target_duration_days: 56, status: 'active', completed_at: null,
    vet_name: 'Dr Chen', notes: null, food_label: 'RC HP', indication: 'skin',
    phase: 'elimination', outcome: null, outcome_notes: null, stopped_reason: null,
    ended_at: null, transition_started_at: '2026-06-24',
    target_protein: 'duck', target_protein_set_at: '2026-07-01T00:00:00.000Z',
    created_at: '2026-07-01T00:00:00.000Z', updated_at: '2026-07-01T00:00:00.000Z',
  };

  const food: LocalDietTrialFood = {
    id: 'df1', diet_trial_id: 't1', pet_id: 'p1', food_item_id: 'f1',
    role: 'primary_diet', food_label: 'RC HP dry', allowed_from: '2026-07-01',
    allowed_until: null, deleted_at: null,
    created_at: '2026-07-01T00:00:00.000Z', updated_at: '2026-07-01T00:00:00.000Z',
  };

  it('forwards every diet_trials server column (the B-057 drift guard)', () => {
    // Completeness, asserted on the KEY SET: a column silently dropped here
    // desyncs forever and nothing else in the stack would notice.
    expect(Object.keys(dietTrialRowToRemote(trial)).sort()).toEqual(
      [
        'completed_at', 'created_at', 'ended_at', 'food_item_id', 'food_label', 'id',
        'indication', 'notes', 'outcome', 'outcome_notes', 'pet_id', 'phase',
        'started_at', 'status', 'stopped_reason', 'target_duration_days',
        'target_protein', 'target_protein_set_at',
        'transition_started_at', 'updated_at', 'vet_name',
      ].sort(),
    );
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
