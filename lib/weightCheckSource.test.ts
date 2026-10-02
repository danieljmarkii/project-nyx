// Engines v3 PR-18 (CUL-1412) / migration 081 — each weight reading's source reaches the local
// mirror on an UPGRADED phone, the log weigh-in labels itself, and hydrate carries a remote label
// down. `weight_checks` predates 081, so an installed phone gains the columns only through
// COLUMN_UPGRADES (C-39 / B-398). Every statement below is read out of the shipped source and run
// against a real SQLite database, so a change to it reds this file rather than leaving it green
// over a copy (C-34).

import * as fs from 'fs';
import * as path from 'path';
import { DatabaseSync } from 'node:sqlite';

import { BASE_SCHEMA_SQL, COLUMN_UPGRADES } from './localSchema';

type Db = InstanceType<typeof DatabaseSync>;

const MIGRATION = fs.readFileSync(
  path.join(__dirname, '..', 'supabase', 'migrations', '081_weight_check_source.sql'),
  'utf8',
);

/** The one backtick template in `file` containing `needle`, verbatim. */
function shippedStatement(file: string, needle: string): string {
  const src = fs.readFileSync(path.join(__dirname, file), 'utf8');
  const hits = [...src.matchAll(/`([^`]*)`/g)].map((m) => m[1]).filter((s) => s.includes(needle));
  expect(hits).toHaveLength(1);
  return hits[0];
}

/** The pre-081 table: today's DDL with the two columns (and their comment) removed. */
function preUpgradeDb(): Db {
  const pre = BASE_SCHEMA_SQL.replace(
    /\n\s*-- Migration 081[\s\S]*?source_basis\s+TEXT NOT NULL DEFAULT 'legacy',/,
    '',
  );
  expect(pre).not.toBe(BASE_SCHEMA_SQL); // the columns are in the DDL, so a fresh install has them
  const d = new DatabaseSync(':memory:');
  d.exec(pre);
  return d;
}

function columns(d: Db): string[] {
  return (d.prepare('PRAGMA table_info(weight_checks)').all() as { name: string }[]).map((c) => c.name);
}

/** The upgrade list as initDb applies it (an existing column is initDb's swallowed no-op). */
function upgrade(d: Db): void {
  for (const c of COLUMN_UPGRADES.filter((u) => u.table === 'weight_checks')) {
    if (columns(d).includes(c.column)) continue;
    d.exec(`ALTER TABLE ${c.table} ADD COLUMN ${c.column} ${c.type}`);
  }
}

function seedEvent(d: Db, id: string): void {
  d.prepare(
    `INSERT INTO events (id, pet_id, event_type, occurred_at, source, created_at, updated_at, synced)
     VALUES (?, 'pet-1', 'weight_check', '2026-09-16T15:00:00.000Z', 'manual', 't', 't', 1)`,
  ).run(id);
}

/** The server default for `column`, read out of the migration. */
function serverDefault(column: string): string {
  const m = MIGRATION.match(new RegExp(`ADD COLUMN ${column} TEXT NOT NULL DEFAULT '([a-z_]+)'`));
  expect(m).not.toBeNull();
  return m![1];
}

describe('weight_checks.source / source_basis (migration 081)', () => {
  it('an upgraded phone gains both columns, and its existing rows read as the server backfilled them', () => {
    const d = preUpgradeDb();
    expect(columns(d)).not.toContain('source');
    seedEvent(d, 'e-old');
    d.prepare(
      `INSERT INTO weight_checks (id, event_id, pet_id, weight_kg, created_at, updated_at, synced)
       VALUES ('w-old', 'e-old', 'pet-1', 3.73, 't', 't', 1)`,
    ).run();

    upgrade(d);

    // W2: home scale, labelled by rule. The same values the server's ADD COLUMN wrote, so a
    // synced row agrees across the two stores with no pull.
    expect(d.prepare(`SELECT source, source_basis FROM weight_checks WHERE id = 'w-old'`).get()).toEqual({
      source: serverDefault('source'),
      source_basis: serverDefault('source_basis'),
    });
    expect(serverDefault('source')).toBe('home_scale');
    expect(serverDefault('source_basis')).toBe('legacy');
  });

  it('a fresh install and an upgraded phone end with the same defaults', () => {
    const fresh = new DatabaseSync(':memory:');
    fresh.exec(BASE_SCHEMA_SQL);
    const up = preUpgradeDb();
    upgrade(up);
    const shape = (d: Db) =>
      (d.prepare('PRAGMA table_info(weight_checks)').all() as { name: string; dflt_value: string | null; notnull: number }[])
        .filter((c) => c.name === 'source' || c.name === 'source_basis')
        .map(({ name, dflt_value, notnull }) => ({ name, dflt_value, notnull }))
        .sort((a, b) => a.name.localeCompare(b.name));
    expect(shape(fresh)).toEqual(shape(up));
    expect(shape(fresh)).toHaveLength(2);
  });

  it('both upgrade entries re-pull the table, so a label another device wrote reaches this one', () => {
    const entries = COLUMN_UPGRADES.filter(
      (u) => u.table === 'weight_checks' && (u.column === 'source' || u.column === 'source_basis'),
    );
    expect(entries.map((u) => u.column).sort()).toEqual(['source', 'source_basis']);
    expect(entries.every((u) => u.rehydrate === true)).toBe(true);
  });

  it('the log weigh-in writes home_scale by its entry path, never the legacy default', () => {
    const d = preUpgradeDb();
    upgrade(d);
    seedEvent(d, 'e-new');
    const insert = shippedStatement('weight.ts', 'INSERT INTO weight_checks');
    d.prepare(insert).run('w-new', 'e-new', 'pet-1', 3.9, 'now', 'now');
    expect(d.prepare(`SELECT source, source_basis FROM weight_checks WHERE id = 'w-new'`).get()).toEqual({
      source: 'home_scale',
      source_basis: 'entry',
    });
  });

  it('hydrate writes a remote label down, and refreshes a synced row when the label changes', () => {
    const d = preUpgradeDb();
    upgrade(d);
    seedEvent(d, 'e1');
    const hydrate = shippedStatement('sync.ts', 'INSERT INTO weight_checks');
    const pull = (source: string, basis: string, updatedAt: string) =>
      d.prepare(hydrate).run('w1', 'e1', 'pet-1', 3.73, null, source, basis, 't0', updatedAt);

    pull('home_scale', 'entry', 't1');
    expect(d.prepare(`SELECT source, source_basis FROM weight_checks WHERE id = 'w1'`).get()).toEqual({
      source: 'home_scale',
      source_basis: 'entry',
    });

    // An owner correction on another device (PR-37's sheet) arrives as a newer row.
    pull('clinic', 'owner', 't2');
    expect(d.prepare(`SELECT source, source_basis FROM weight_checks WHERE id = 'w1'`).get()).toEqual({
      source: 'clinic',
      source_basis: 'owner',
    });
  });

  it('the re-pull fills a synced row whose updated_at is unchanged (the step LWW skips)', () => {
    const d = preUpgradeDb();
    seedEvent(d, 'e1');
    seedEvent(d, 'e2');
    // An earlier build pulled both rows, before it knew the columns.
    d.prepare(
      `INSERT INTO weight_checks (id, event_id, pet_id, weight_kg, created_at, updated_at, synced)
       VALUES ('w1', 'e1', 'pet-1', 3.73, 't0', '2026-09-16T15:00:00.000Z', 1),
              ('w2', 'e2', 'pet-1', 3.80, 't0', '2026-09-17T15:00:00.000Z', 0)`,
    ).run();
    upgrade(d);
    // The server holds another device's label; same version, spelled the server's way.
    const fill = shippedStatement('sync.ts', 'UPDATE weight_checks SET source = ?, source_basis = ?');
    const r1 = d.prepare(fill).run('clinic', 'owner', 'w1', 'clinic', 'owner');
    const r2 = d.prepare(fill).run('clinic', 'owner', 'w2', 'clinic', 'owner');
    expect(r1.changes).toBe(1);
    expect(r2.changes).toBe(0); // an unpushed row keeps its own label
    expect(d.prepare(`SELECT source, source_basis, updated_at FROM weight_checks WHERE id = 'w1'`).get()).toEqual({
      source: 'clinic',
      source_basis: 'owner',
      updated_at: '2026-09-16T15:00:00.000Z', // a fill records, it never re-versions
    });
  });

  it('hydrate never overwrites a label this phone has not pushed yet', () => {
    const d = preUpgradeDb();
    upgrade(d);
    seedEvent(d, 'e1');
    d.prepare(
      `INSERT INTO weight_checks (id, event_id, pet_id, weight_kg, source, source_basis, created_at, updated_at, synced)
       VALUES ('w1', 'e1', 'pet-1', 3.73, 'clinic', 'owner', 't0', 't3', 0)`,
    ).run();
    const hydrate = shippedStatement('sync.ts', 'INSERT INTO weight_checks');
    d.prepare(hydrate).run('w1', 'e1', 'pet-1', 3.73, null, 'home_scale', 'legacy', 't0', 't4');
    expect(d.prepare(`SELECT source, source_basis, synced FROM weight_checks WHERE id = 'w1'`).get()).toEqual({
      source: 'clinic',
      source_basis: 'owner',
      synced: 0,
    });
  });

  it('the migration keeps both defaults and constrains both columns to their closed sets', () => {
    expect(MIGRATION).toMatch(/CHECK \(source IN \('clinic', 'home_scale', 'estimate'\)\)/);
    expect(MIGRATION).toMatch(/CHECK \(source_basis IN \('entry', 'owner', 'legacy'\)\)/);
    // An installed build upserts without either column; dropping a default would fail its
    // every weigh-in push with 23502 (the header's "why the defaults stay").
    expect(MIGRATION).not.toMatch(/DROP DEFAULT/);
  });
});
