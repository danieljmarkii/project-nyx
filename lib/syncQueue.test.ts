// Tests for the push-queue contract (B-398) and the derived sign-out file wipe
// (B-519).
//
// Three kinds of test live here, and the split is deliberate:
//
//   1. POLICY — classifySyncFailure and the retry budget. Pure functions, but the
//      one place in this codebase where getting a boolean backwards silently
//      destroys an owner's health log, so they are tested hard.
//   2. FAIL-CLOSED GUARDS — the registry and the file-wipe derivation are both
//      checked against a REAL database built from the production DDL, the B-424
//      shape. A hand-written expected list would fail open on exactly the case the
//      guard exists for (a new table nobody remembered), so `sqlite_master` is the
//      source of truth and each guard is mutation-verified: a scratch table proves
//      the derivation actually derives rather than returning a fixture.
//   3. A SOURCE SCAN — the "every local mutation clears the quarantine" contract,
//      which cannot be enforced by types and would otherwise be enforced by memory.
//
// node:sqlite is Node ≥ 22 core; require() keeps it off the babel/jest-expo
// transform path (the precedent set by medications.test.ts / hydration.test.ts).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  SYNC_QUEUES,
  QUARANTINE_COLUMNS,
  MAX_SYNC_ATTEMPTS,
  TERMINAL_SYNC_ERROR_CODES,
  RLS_FILTERED_ERROR,
  classifySyncFailure,
  isTerminalSyncError,
  formatSyncError,
  exhaustedAttemptsError,
  pendingStatusSql,
  quarantineCountSql,
} from './syncQueue';
import {
  BASE_SCHEMA_SQL,
  COLUMN_UPGRADES,
  LOCAL_URI_TABLES_SQL,
  KNOWN_LOCAL_URI_TABLES,
  applyColumnUpgrades,
  localUriUnionSql,
} from './localSchema';
import { MEDICATION_SCHEMA_SQL } from './medications';
import { DIET_TRIAL_SCHEMA_SQL } from './dietTrialMirror';

type Db = InstanceType<typeof DatabaseSync>;

// The REAL runtime schema: the three DDL constants plus initDb's column-upgrade
// path. Both halves matter — a column added only by ALTER (logged_via, the
// quarantine pair on an upgrading device) exists on every real phone and in none
// of the constants, and a guard that saw only the constants would be checking a
// schema no device actually runs.
async function realSchemaDb(): Promise<Db> {
  const db = new DatabaseSync(':memory:');
  for (const sql of [BASE_SCHEMA_SQL, MEDICATION_SCHEMA_SQL, DIET_TRIAL_SCHEMA_SQL]) db.exec(sql);
  await applyColumnUpgrades(async (sql) => db.exec(sql));
  return db;
}

const TABLES_WITH_COLUMN = (db: Db, column: string): string[] =>
  db
    .prepare(
      `SELECT m.name AS name FROM sqlite_master m
         JOIN pragma_table_info(m.name) p
        WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%' AND p.name = ?
        ORDER BY m.name`,
    )
    .all(column)
    .map((r: { name: string }) => r.name);

// ── 1. Policy ────────────────────────────────────────────────────────────────

describe('classifySyncFailure — the retry budget\'s safety line (B-398)', () => {
  // THE test in this file. A retry budget that counts network failures is a
  // data-destroying bug wearing a durability feature's clothes: the diet-trial
  // owner logging meals in a flat with no signal would come back online to find
  // their whole queue quarantined by a server that never saw a single row.
  it('NEVER charges an attempt for a failure the server never saw', () => {
    expect(classifySyncFailure(undefined)).toBe('transient');
    expect(classifySyncFailure(null)).toBe('transient');
    expect(classifySyncFailure({})).toBe('transient');
    expect(classifySyncFailure({ code: null })).toBe('transient');
    expect(classifySyncFailure({ code: '' })).toBe('transient');
    // supabase-js wraps a fetch failure with a message and no SQLSTATE.
    expect(
      classifySyncFailure({ message: 'Network request failed' } as { code?: string }),
    ).toBe('transient');
  });

  it('treats a REQUEST-level failure as transient, not as the row\'s fault', () => {
    // PGRST301 = expired JWT. Every row in the batch failed for one reason that
    // belongs to none of them, so charging each an attempt would punish the
    // innocent and isolating would fire N identical, guaranteed failures.
    expect(classifySyncFailure({ code: 'PGRST301' })).toBe('transient');
    expect(classifySyncFailure({ code: 'PGRST116' })).toBe('transient');
  });

  it('treats infrastructure SQLSTATEs as transient even though they are well-formed', () => {
    expect(classifySyncFailure({ code: '08006' })).toBe('transient'); // connection failure
    expect(classifySyncFailure({ code: '53300' })).toBe('transient'); // too many connections
    expect(classifySyncFailure({ code: '57014' })).toBe('transient'); // statement timeout
  });

  it('charges an attempt only when Postgres evaluated THIS ROW and refused it', () => {
    expect(classifySyncFailure({ code: '23503' })).toBe('rejected'); // FK parent not landed
    expect(classifySyncFailure({ code: '42501' })).toBe('rejected'); // RLS
    expect(classifySyncFailure({ code: '22001' })).toBe('rejected'); // value too long
  });

  it('gives up immediately on the four codes that can never succeed', () => {
    for (const code of TERMINAL_SYNC_ERROR_CODES) {
      expect(classifySyncFailure({ code })).toBe('terminal');
      expect(isTerminalSyncError({ code })).toBe(true);
    }
    // And the near-misses that must NOT be terminal: each genuinely resolves on a
    // later cycle, and parking them would strand a good row forever.
    expect(isTerminalSyncError({ code: '23503' })).toBe(false);
    expect(isTerminalSyncError({ code: '42501' })).toBe(false);
    expect(isTerminalSyncError(null)).toBe(false);
  });

  it('classifies the returned-no-rows sentinel as a row rejection', () => {
    // A PostgREST write that returns { error: null } and zero rows was silently
    // filtered by a policy — the 009 trap. It must cost an attempt (or it is
    // re-sent forever) but must NOT be terminal (an RLS miss is reachable from a
    // pet-hydration race that resolves).
    expect(classifySyncFailure(RLS_FILTERED_ERROR)).toBe('rejected');
    expect(isTerminalSyncError(RLS_FILTERED_ERROR)).toBe(false);
  });
});

describe('the recorded reason', () => {
  it('leads with the code so the column is greppable by failure class', () => {
    expect(formatSyncError({ code: '23505', message: 'duplicate key value' }))
      .toBe('23505: duplicate key value');
    expect(formatSyncError({ code: '23505' })).toBe('23505');
    expect(formatSyncError({})).toBe('unknown');
  });

  it('truncates — a Postgres detail chain is a diagnostic, not a record', () => {
    expect(formatSyncError({ code: '23505', message: 'x'.repeat(1000) }).length)
      .toBeLessThan(320);
  });

  it('says how many attempts were spent, so a parked row explains itself', () => {
    const text = exhaustedAttemptsError({ code: '42501', message: 'no' });
    expect(text).toContain('42501');
    expect(text).toContain(String(MAX_SYNC_ATTEMPTS));
  });

  it('keeps the budget generous — a tight budget quarantines on a passing problem', () => {
    // A row is attempted at most once per cycle and cycles fire on foreground or
    // reconnect, so this is days-to-weeks of the server refusing the same row every
    // single time. The cost of being too late is wasted requests; the cost of being
    // too early is an owner's log dropping out of the queue while the reason was
    // temporary. Pinned so a future "let's make it 3" is a deliberate argument.
    expect(MAX_SYNC_ATTEMPTS).toBeGreaterThanOrEqual(10);
  });
});

// ── 2. Fail-closed guards ────────────────────────────────────────────────────

describe('SYNC_QUEUES covers the real schema (B-398, the B-424 shape)', () => {
  let db: Db;
  beforeAll(async () => { db = await realSchemaDb(); });
  afterAll(() => db.close());

  // The badge is only honest if this set is complete, and it FAILS OPEN by
  // construction: a queue missing from SYNC_QUEUES is silently never counted, so a
  // wedged table reports zero pending and the owner is told everything is fine.
  it('counts EVERY table that has a push queue — none can be added silently', () => {
    const queued = TABLES_WITH_COLUMN(db, 'synced');
    const uncounted = queued.filter((t) => !SYNC_QUEUES.some((q) => q.table === t));
    // If this fails: the named table(s) hold rows that can be stuck unsent and
    // nothing counts them, so getSyncStatus reports zero pending while the owner's
    // record sits on one phone. Add them to SYNC_QUEUES.
    expect(uncounted).toEqual([]);
  });

  it('names no table the schema does not have', () => {
    const real = TABLES_WITH_COLUMN(db, 'synced');
    expect(SYNC_QUEUES.map((q) => q.table).filter((t) => !real.includes(t))).toEqual([]);
  });

  it('is DERIVED, not a fixture — a new queue table is picked up immediately', () => {
    // Mutation-verification. Without this, the two assertions above would still
    // pass if the derivation quietly returned a hardcoded list, which is the exact
    // failure B-424 removed from the sign-out wipe guard.
    const scratch = new DatabaseSync(':memory:');
    scratch.exec('CREATE TABLE brand_new_mirror (id TEXT PRIMARY KEY, synced INTEGER NOT NULL DEFAULT 0)');
    expect(TABLES_WITH_COLUMN(scratch, 'synced')).toContain('brand_new_mirror');
    expect(SYNC_QUEUES.some((q) => q.table === 'brand_new_mirror')).toBe(false);
    scratch.close();
  });

  it('gives every queue the quarantine columns', () => {
    for (const column of QUARANTINE_COLUMNS) {
      const have = TABLES_WITH_COLUMN(db, column);
      expect(SYNC_QUEUES.map((q) => q.table).filter((t) => !have.includes(t))).toEqual([]);
    }
  });

  it('names a pendingSince column that actually exists on each table', () => {
    // `MIN(updated_at)` over a table with no updated_at is not a wrong number, it
    // is a thrown statement — and it would take the whole badge down, not one arm.
    for (const q of SYNC_QUEUES) {
      const columns = db
        .prepare(`SELECT name FROM pragma_table_info(?)`)
        .all(q.table)
        .map((r: { name: string }) => r.name);
      expect({ table: q.table, has: columns.includes(q.pendingSince) })
        .toEqual({ table: q.table, has: true });
    }
  });
});

describe('the badge queries, against a real database', () => {
  let db: Db;
  beforeAll(async () => { db = await realSchemaDb(); });
  afterAll(() => db.close());
  beforeEach(() => {
    for (const q of SYNC_QUEUES) db.exec(`DELETE FROM ${q.table}`);
  });

  const seedEvent = (id: string, updatedAt: string, synced = 0, error: string | null = null) =>
    db
      .prepare(
        `INSERT INTO events (id, pet_id, event_type, occurred_at, created_at, updated_at, synced, sync_error)
         VALUES (?, 'p1', 'vomit', ?, ?, ?, ?, ?)`,
      )
      .run(id, updatedAt, updatedAt, updatedAt, synced, error);

  // FKs are ON (initDb sets the PRAGMA on the shared connection), so a meal needs
  // a real parent event — and the parent is seeded ALREADY SYNCED so it never adds
  // to the counts under test.
  const seedMeal = (id: string, updatedAt: string, synced = 0, error: string | null = null) => {
    seedEvent(`evt-${id}`, updatedAt, 1);
    db
      .prepare(
        `INSERT INTO meals (id, event_id, pet_id, created_at, updated_at, synced, sync_error)
         VALUES (?, ?, 'p1', ?, ?, ?, ?)`,
      )
      .run(id, `evt-${id}`, updatedAt, updatedAt, synced, error);
  };

  const pending = () => db.prepare(pendingStatusSql()).get() as { count: number; oldest: string | null };
  const quarantined = () => (db.prepare(quarantineCountSql()).get() as { count: number }).count;

  it('runs at all — every arm of the UNION is a valid statement', () => {
    expect(pending()).toEqual({ count: 0, oldest: null });
    expect(quarantined()).toBe(0);
  });

  it('COUNTS A WEDGED MEALS QUEUE — the lie B-398 exists to end', () => {
    // The pre-B-398 query read `events` and nothing else. A meals queue stuck for
    // three weeks reported zero pending, so SyncBanner (which keys on the oldest
    // pending timestamp) stayed silent while the household's food log — the diet
    // owner's entire reason for using the app — sat on one phone.
    seedMeal('m1', '2026-07-01T08:00:00.000Z');
    seedMeal('m2', '2026-07-02T08:00:00.000Z');
    expect(pending()).toEqual({ count: 2, oldest: '2026-07-01T08:00:00.000Z' });
  });

  it('reports the oldest across ALL queues, not the oldest within one', () => {
    seedEvent('e1', '2026-07-05T08:00:00.000Z');
    seedMeal('m1', '2026-07-01T08:00:00.000Z');
    expect(pending()).toEqual({ count: 2, oldest: '2026-07-01T08:00:00.000Z' });
  });

  it('ignores rows that already landed', () => {
    seedEvent('e1', '2026-07-05T08:00:00.000Z', 1);
    expect(pending().count).toBe(0);
  });

  it('holds quarantined rows APART from pending — they are not waiting for a network', () => {
    // Folding them together would have the banner tell this owner to check their
    // connection about a row no amount of connectivity moves.
    seedEvent('e1', '2026-07-05T08:00:00.000Z', 0, '23505: duplicate key value');
    seedMeal('m1', '2026-07-01T08:00:00.000Z');
    expect(pending()).toEqual({ count: 1, oldest: '2026-07-01T08:00:00.000Z' });
    expect(quarantined()).toBe(1);
  });

  it('still counts an unsynced SOFT DELETE — an untravelled deletion is unsent too', () => {
    // The old events-only query excluded deleted_at rows. On a two-device household
    // a deletion that has not travelled is exactly as misleading as a log that
    // has not: the other phone still shows the entry.
    db.prepare(
      `INSERT INTO events (id, pet_id, event_type, occurred_at, created_at, updated_at, deleted_at, synced)
       VALUES ('e1', 'p1', 'vomit', '2026-07-05', '2026-07-05', '2026-07-05', '2026-07-06', 0)`,
    ).run();
    expect(pending().count).toBe(1);
  });
});

// ── 3. The write-path contract, as a source scan ─────────────────────────────

const SOURCE_DIRS = ['lib', 'store', 'hooks', 'app', 'components'];

function sourceLines(): { file: string; line: number; text: string }[] {
  const out: { file: string; line: number; text: string }[] = [];
  const walk = (dir: string, rel: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      const relPath = `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(full, relPath);
      else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
        readFileSync(full, 'utf8').split('\n').forEach((text, i) => {
          out.push({ file: relPath, line: i + 1, text });
        });
      }
    }
  };
  for (const dir of SOURCE_DIRS) walk(join(__dirname, '..', dir), dir);
  return out;
}

describe('every local mutation clears the quarantine (B-398 write-path contract)', () => {
  // WHY THIS IS A TEST AND NOT A CONVENTION. A quarantined row is skipped by the
  // push queue, so the ONLY way back in is an owner-visible edit clearing
  // sync_error. If one write path forgets, that row is unrecoverable from inside
  // the app forever — the owner re-saves the entry, sees it accepted, and it still
  // never reaches their records. There is no type that can catch that, and it is
  // invisible until someone is already missing data.
  it('never sets `synced = 0` without also clearing sync_error and sync_attempts', () => {
    const offenders = sourceLines()
      // A WRITE, not a predicate: `synced = 0` inside a SET clause, or pushed onto
      // a dynamically-assembled SET list (lib/db.ts updateEvent). A `WHERE synced =
      // 0` queue read is not a mutation and must not be flagged.
      .filter((l) => /\bsynced\s*=\s*0\b/.test(l.text) && (/\bSET\b/.test(l.text) || /\.push\(/.test(l.text)))
      .filter((l) => !/sync_error\s*=\s*NULL/.test(l.text) || !/sync_attempts\s*=\s*0/.test(l.text))
      .map((l) => `${l.file}:${l.line}`);
    expect(offenders).toEqual([]);
  });

  it('finds the write sites it claims to police (not vacuously green)', () => {
    // A regex that stops matching would make the assertion above pass while
    // policing nothing — the same fail-open shape as the guard it protects.
    const writes = sourceLines().filter(
      (l) => /\bsynced\s*=\s*0\b/.test(l.text) && (/\bSET\b/.test(l.text) || /\.push\(/.test(l.text)),
    );
    expect(writes.length).toBeGreaterThanOrEqual(10);
  });
});

// ── The column-upgrade path ──────────────────────────────────────────────────

describe('COLUMN_UPGRADES (the ALTER path every existing install takes)', () => {
  it('adds the quarantine pair to a table that predates it', async () => {
    // The upgrading device, simulated: the table exists in its old shape, so
    // `CREATE TABLE IF NOT EXISTS` no-ops and ONLY the ALTER can add the columns.
    // Get this wrong and every push on every existing phone fails with "no such
    // column" while the simulator is perfectly green.
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE events (id TEXT PRIMARY KEY, synced INTEGER NOT NULL DEFAULT 0)');
    db.prepare("INSERT INTO events (id, synced) VALUES ('e1', 0)").run();

    await applyColumnUpgrades(
      async (sql) => db.exec(sql),
      COLUMN_UPGRADES.filter((u) => u.table === 'events'),
    );

    const row = db.prepare('SELECT sync_attempts, sync_error FROM events').get() as {
      sync_attempts: number; sync_error: string | null;
    };
    // A pre-upgrade row starts with a FULL budget and no quarantine — it must not
    // inherit a give-up it never earned.
    expect(row).toEqual({ sync_attempts: 0, sync_error: null });
    db.close();
  });

  it('is idempotent — a second launch re-runs every ALTER harmlessly', async () => {
    const db = await realSchemaDb();
    await expect(applyColumnUpgrades(async (sql) => db.exec(sql))).resolves.toBeUndefined();
    expect(TABLES_WITH_COLUMN(db, 'sync_error').length).toBe(SYNC_QUEUES.length);
    db.close();
  });

  it('covers every queue table, generated from SYNC_QUEUES rather than typed out', () => {
    for (const q of SYNC_QUEUES) {
      for (const column of QUARANTINE_COLUMNS) {
        expect(COLUMN_UPGRADES.some((u) => u.table === q.table && u.column === column)).toBe(true);
      }
    }
  });
});

// ── B-519: the sign-out FILE wipe, derived ───────────────────────────────────

describe('the sign-out file wipe derives its tables (B-519)', () => {
  let db: Db;
  beforeAll(async () => { db = await realSchemaDb(); });
  afterAll(() => db.close());

  const derive = (target: Db): string[] =>
    target.prepare(LOCAL_URI_TABLES_SQL).all().map((r: { table_name: string }) => r.table_name);

  // The bug this closes is the nastiest fail-open in the repo: a mirror table
  // missing from the old hardcoded UNION had its ROWS wiped by LOCAL_WIPE_TABLES
  // while its FILES stayed on disk — and once the row naming a file is gone,
  // nothing can ever find that file again. An un-deletable photo of the previous
  // account's pet, on a device now in someone else's hands.
  it('finds every table carrying captured files, from the real schema', () => {
    expect(derive(db)).toEqual([...KNOWN_LOCAL_URI_TABLES].sort());
  });

  it('keeps the runtime fallback list honest', () => {
    // clearLocalData prefers the derivation and falls back to KNOWN_LOCAL_URI_TABLES
    // only if introspection fails on a device. Pinning them equal here is what stops
    // the fallback becoming a stale second hardcoded list — the thing B-519 removed.
    expect([...KNOWN_LOCAL_URI_TABLES].sort()).toEqual([...KNOWN_LOCAL_URI_TABLES]);
    expect(derive(db)).toEqual([...KNOWN_LOCAL_URI_TABLES]);
  });

  it('is DERIVED — a new file-bearing table is covered the moment it is created', () => {
    // Mutation-verification, and the whole point of the change: this is what the
    // hardcoded UNION could never do.
    const scratch = new DatabaseSync(':memory:');
    scratch.exec(`
      CREATE TABLE brand_new_captures (id TEXT PRIMARY KEY, local_uri TEXT NOT NULL);
      CREATE TABLE no_files_here (id TEXT PRIMARY KEY, storage_path TEXT NOT NULL);
    `);
    expect(derive(scratch)).toEqual(['brand_new_captures']);
    scratch.close();
  });

  it('builds a UNION that actually runs and returns every table\'s files', () => {
    const sql = localUriUnionSql(derive(db));
    expect(sql).not.toBeNull();
    db.prepare(
      `INSERT INTO events (id, pet_id, event_type, occurred_at) VALUES ('e1', 'p1', 'vomit', '2026-07-05')`,
    ).run();
    db.prepare(
      `INSERT INTO event_attachments (id, event_id, pet_id, local_uri, storage_path)
       VALUES ('a1', 'e1', 'p1', 'file:///a.jpg', 'k/a.jpg')`,
    ).run();
    db.prepare(
      `INSERT INTO vet_documents (id, pet_id, document_group_id, source, local_uri, storage_path, mime_type)
       VALUES ('d1', 'p1', 'g1', 'camera', 'file:///d.pdf', 'k/d.pdf', 'application/pdf')`,
    ).run();
    const rows = db.prepare(sql!).all().map((r: { local_uri: string }) => r.local_uri);
    expect(rows.sort()).toEqual(['file:///a.jpg', 'file:///d.pdf']);
    db.exec('DELETE FROM event_attachments; DELETE FROM vet_documents; DELETE FROM events;');
  });

  it('returns null rather than a broken statement on an empty list', () => {
    // So the caller can tell "nothing to clean" from "the derivation failed" — the
    // difference between a no-op and silently skipping the wipe.
    expect(localUriUnionSql([])).toBeNull();
  });
});
