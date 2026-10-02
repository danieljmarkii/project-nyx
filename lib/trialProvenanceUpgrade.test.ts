// CUL-1459 — a diet trial's window provenance and a course's or trial's visit link reach an
// UPGRADED phone, and are never pushed back over the server as NULL.
//
// A phone upgrading from a build that predates migrations 066 / 068 already pulled every
// trial and course, and gains the columns only through COLUMN_UPGRADES (as NULL). A re-pull
// at the same updated_at is rightly skipped by LWW, so before this the columns stayed NULL
// locally, and the next local edit pushed those NULLs over the server's values: the vet
// report's "window extended … at the vet's direction" (TE-4) and the visit link. This builds
// the tables as that build had them, runs initDb's upgrade-and-reset sequence, and replays
// the fill statements lib/sync.ts ships.

import * as fs from 'fs';
import * as path from 'path';
import { DatabaseSync } from 'node:sqlite';

import { BASE_SCHEMA_SQL, applyColumnUpgrades } from './localSchema';
import { MEDICATION_SCHEMA_SQL } from './medications';
import { DIET_TRIAL_SCHEMA_SQL } from './dietTrialMirror';

type Db = InstanceType<typeof DatabaseSync>;

const TRIAL_COLUMNS = [
  'target_duration_days_initial',
  'target_duration_set_at',
  'target_duration_vet_directed',
  'vet_visit_id',
];

/** Today's DDL with the named columns removed: the tables as an earlier build created them. */
function strip(ddl: string, columns: string[]): string {
  let out = ddl;
  for (const c of columns) {
    const next = out.replace(new RegExp(`\\n\\s*${c}\\s+[A-Z]+,`), '');
    expect(next).not.toBe(out); // the column is in today's DDL, so a fresh install has it
    out = next;
  }
  return out;
}

function preUpgradeDb(): Db {
  const d = new DatabaseSync(':memory:');
  d.exec(BASE_SCHEMA_SQL);
  d.exec(strip(MEDICATION_SCHEMA_SQL, ['vet_visit_id']));
  d.exec(strip(DIET_TRIAL_SCHEMA_SQL, TRIAL_COLUMNS));
  return d;
}

const syncSource = () => fs.readFileSync(path.join(__dirname, 'sync.ts'), 'utf8');

/** initDb's launch: the upgrade list, then a watermark reset for every `rehydrate` table it
 *  added a column to (the reset statement is read out of lib/db.ts, not re-typed). */
async function launch(d: Db) {
  const src = fs.readFileSync(path.join(__dirname, 'db.ts'), 'utf8');
  const reset = src.match(/'(DELETE FROM sync_watermarks WHERE table_name = \?)'/);
  expect(reset).not.toBeNull();
  const added = await applyColumnUpgrades(async (sql) => d.exec(sql));
  for (const t of new Set(added.filter((u) => u.rehydrate).map((u) => u.table))) d.prepare(reset![1]).run(t);
  return added;
}

const watermark = (d: Db, table: string) =>
  (d.prepare('SELECT watermark FROM sync_watermarks WHERE table_name = ?').get(table) as { watermark: string } | undefined)
    ?.watermark;

describe('upgrading past migrations 066 / 068 (CUL-1459)', () => {
  it('the launch that adds the columns re-pulls diet_trials and medications once, and nothing else', async () => {
    const d = preUpgradeDb();
    for (const t of ['diet_trials', 'medications', 'events']) {
      d.prepare('INSERT INTO sync_watermarks (table_name, watermark) VALUES (?, ?)').run(t, '2026-09-28T21:00:00Z');
    }
    const first = await launch(d);
    expect(new Set(first.filter((u) => u.rehydrate).map((u) => u.table))).toEqual(
      new Set(['diet_trials', 'medications']),
    );
    expect(watermark(d, 'diet_trials')).toBeUndefined();
    expect(watermark(d, 'medications')).toBeUndefined();
    expect(watermark(d, 'events')).toBe('2026-09-28T21:00:00Z');
    // A later launch adds nothing and leaves a watermark written since alone.
    d.prepare('INSERT INTO sync_watermarks (table_name, watermark) VALUES (?, ?)').run('diet_trials', '2026-09-29T08:00:00Z');
    expect(await launch(d)).toEqual([]);
    expect(watermark(d, 'diet_trials')).toBe('2026-09-29T08:00:00Z');
  });

  it("hydrate fills a trial's NULL provenance from the server on a synced row only (the statement from lib/sync.ts, run)", async () => {
    const d = preUpgradeDb();
    await launch(d);
    const m = syncSource().match(/`(UPDATE diet_trials SET\s+target_duration_days_initial = COALESCE[\s\S]*?AND synced = 1)`/);
    expect(m).not.toBeNull();
    const insert = (id: string, synced: number, setAt: string | null) =>
      d.prepare(
        `INSERT INTO diet_trials (id, pet_id, started_at, target_duration_days, status, target_duration_set_at,
           created_at, updated_at, synced)
         VALUES (?, 'pet-1', '2026-08-01', 84, 'active', ?, '2026-08-01T00:00:00Z', '2026-09-20T00:00:00Z', ?)`,
      ).run(id, setAt, synced);
    insert('pulled-by-old-build', 1, null);
    insert('pending-local-edit', 0, null);
    insert('already-known-here', 1, '2026-09-01T00:00:00Z');
    // The server's values for each row: the window was moved at the vet's direction, at a visit.
    for (const id of ['pulled-by-old-build', 'pending-local-edit', 'already-known-here']) {
      d.prepare(m![1]).run(56, '2026-09-17T10:00:00Z', 1, 'visit-1', id);
    }
    const row = (id: string) =>
      d.prepare(
        `SELECT target_duration_days_initial AS initial, target_duration_set_at AS setAt,
                target_duration_vet_directed AS vetDirected, vet_visit_id AS visit, updated_at AS updatedAt
           FROM diet_trials WHERE id = ?`,
      ).get(id);
    expect(row('pulled-by-old-build')).toEqual({
      initial: 56, setAt: '2026-09-17T10:00:00Z', vetDirected: 1, visit: 'visit-1', updatedAt: '2026-09-20T00:00:00Z',
    });
    // An unpushed local edit is never written under; a value this phone already holds stays.
    expect(row('pending-local-edit')).toMatchObject({ initial: null, setAt: null, vetDirected: null, visit: null });
    expect(row('already-known-here')).toMatchObject({ setAt: '2026-09-01T00:00:00Z' });
  });

  it("hydrate fills a course's NULL visit link from the server on a synced row only (the statement from lib/sync.ts, run)", async () => {
    const d = preUpgradeDb();
    await launch(d);
    const m = syncSource().match(/`(UPDATE medications SET vet_visit_id = \?[\s\S]*?AND synced = 1)`/);
    expect(m).not.toBeNull();
    const insert = (id: string, synced: number, visit: string | null) =>
      d.prepare(
        `INSERT INTO medications (id, pet_id, drug_name, started_at, status, vet_visit_id, created_at, updated_at, synced)
         VALUES (?, 'pet-1', 'Cerenia', '2026-09-01', 'active', ?, '2026-09-01T00:00:00Z', '2026-09-20T00:00:00Z', ?)`,
      ).run(id, visit, synced);
    insert('pulled-by-old-build', 1, null);
    insert('pending-local-edit', 0, null);
    insert('linked-here-first', 1, 'visit-local');
    for (const id of ['pulled-by-old-build', 'pending-local-edit', 'linked-here-first']) {
      d.prepare(m![1]).run('visit-1', id);
    }
    const visit = (id: string) =>
      (d.prepare('SELECT vet_visit_id AS visit FROM medications WHERE id = ?').get(id) as { visit: string | null }).visit;
    expect(visit('pulled-by-old-build')).toBe('visit-1');
    expect(visit('pending-local-edit')).toBeNull();
    expect(visit('linked-here-first')).toBe('visit-local');
  });
});
