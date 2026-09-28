// CUL-1396 — `ended_at` reaches an UPGRADED device. `feeding_arrangements` predates migration
// 076, so a phone that already has the table only gains the column through COLUMN_UPGRADES
// (C-39 / B-398: a column added to the DDL alone works on a fresh simulator and throws "no such
// column" on the owner's phone). This builds the table as it stood before 076, applies the
// upgrade list the way initDb does, and runs the real toggle-off statement against it.

import * as fs from 'fs';
import * as path from 'path';
import { DatabaseSync } from 'node:sqlite';

import { BASE_SCHEMA_SQL, COLUMN_UPGRADES } from './localSchema';

type Db = InstanceType<typeof DatabaseSync>;

/** The pre-076 table: today's DDL with the new column removed. */
function preUpgradeDb(): Db {
  const pre = BASE_SCHEMA_SQL.replace(/\n\s*ended_at\s+TEXT,/, '');
  expect(pre).not.toBe(BASE_SCHEMA_SQL); // the column is in the DDL, so a fresh install has it
  const d = new DatabaseSync(':memory:');
  d.exec(pre);
  return d;
}

function columns(d: Db): string[] {
  return (d.prepare('PRAGMA table_info(feeding_arrangements)').all() as { name: string }[]).map((c) => c.name);
}

/** The upgrade list as initDb applies it: an entry the table already has is the no-op
 *  initDb swallows ("duplicate column name"), so it is skipped here. */
function upgrade(d: Db): void {
  for (const c of COLUMN_UPGRADES.filter((u) => u.table === 'feeding_arrangements')) {
    if (columns(d).includes(c.column)) continue;
    d.exec(`ALTER TABLE ${c.table} ADD COLUMN ${c.column} ${c.type}`);
  }
}

describe('feeding_arrangements.ended_at on an upgraded device (CUL-1396)', () => {
  it('is absent before the upgrade list runs and present after it', () => {
    const d = preUpgradeDb();
    expect(columns(d)).not.toContain('ended_at');
    upgrade(d);
    expect(columns(d)).toContain('ended_at');
  });

  it('the toggle-off statement runs and records the instant beside the date', () => {
    const d = preUpgradeDb();
    upgrade(d);
    d.prepare(
      `INSERT INTO feeding_arrangements (id, pet_id, food_item_id, method, active_from, created_at, updated_at)
       VALUES ('a1', 'pet-1', 'food-1', 'free_choice', '2026-09-20', '2026-09-20T08:00:00.000Z', '2026-09-20T08:00:00.000Z')`,
    ).run();
    // The statement endFreeChoice issues (lib/feedingArrangements.ts), verbatim; the source is
    // checked below so a change there reds this test rather than leaving it green over a copy.
    const now = '2026-09-28T19:42:10.123Z';
    const r = d
      .prepare(
        `UPDATE feeding_arrangements
       SET active_until = ?, ended_at = ?, updated_at = ?, synced = 0, sync_attempts = 0, sync_error = NULL
     WHERE pet_id = ? AND food_item_id = ?
       AND method = 'free_choice'
       AND active_until IS NULL
       AND deleted_at IS NULL`,
      )
      .run('2026-09-28', now, now, 'pet-1', 'food-1');
    expect(r.changes).toBe(1);
    expect(d.prepare('SELECT active_until, ended_at FROM feeding_arrangements').get()).toEqual({
      active_until: '2026-09-28',
      ended_at: now,
    });
  });

  it('the statement above is the one endFreeChoice ships', () => {
    const src = fs.readFileSync(path.join(__dirname, 'feedingArrangements.ts'), 'utf8');
    expect(src).toContain('SET active_until = ?, ended_at = ?, updated_at = ?, synced = 0, sync_attempts = 0, sync_error = NULL');
  });

  it('hydrate writes a remote ended_at into an upgraded device (the statement from lib/sync.ts, run)', () => {
    const d = preUpgradeDb();
    upgrade(d);
    const src = fs.readFileSync(path.join(__dirname, 'sync.ts'), 'utf8');
    const m = src.match(/`(INSERT INTO feeding_arrangements[\s\S]*?WHERE feeding_arrangements\.synced = 1)`/);
    expect(m).not.toBeNull();
    const row = ['a1', 'pet-1', 'food-1', 'free_choice', '2026-09-20', '2026-09-28', '2026-09-28T19:42:10.123Z', 0, null, null,
      '2026-09-20T08:00:00.000Z', '2026-09-28T19:42:11.000Z'] as const;
    d.prepare(m![1]).run(...row);
    expect(d.prepare('SELECT active_until, ended_at, synced FROM feeding_arrangements').get()).toEqual({
      active_until: '2026-09-28', ended_at: '2026-09-28T19:42:10.123Z', synced: 1,
    });
    // A newer remote copy updates the instant too (the ON CONFLICT half).
    d.prepare(m![1]).run(...row.slice(0, 6), '2026-09-28T20:00:00.000Z', ...row.slice(7, 11), '2026-09-28T21:00:00.000Z');
    expect((d.prepare('SELECT ended_at FROM feeding_arrangements').get() as { ended_at: string }).ended_at).toBe(
      '2026-09-28T20:00:00.000Z',
    );
  });
});
