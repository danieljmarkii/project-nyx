// Exercises the REAL getLibraryFoods query (LIBRARY_FOODS_QUERY) against an
// in-memory SQLite. The lib/db.ts jest harness mocks getAllAsync, so the SQL is
// otherwise unexercised — and the B-108 fix lives ENTIRELY in the SQL (a
// MAX(photo_path) aggregate + SQLite's bare-column rule), so a JS-level test could
// never catch a regression. node:sqlite (Node ≥ 22) gives us a real engine to run
// the production string against fixtures.
//
// Loaded via require() — node:sqlite is a core module typed loosely here, and the
// require keeps it off the babel/jest-expo import path. It is available in the
// jest run (probed before adding this test).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');
import { LIBRARY_FOODS_QUERY, ARCHIVED_FOODS_QUERY } from './foodQueries';

interface LibRow {
  id: string;
  brand: string;
  product_name: string;
  format: string;
  food_type: string | null;
  photo_path: string | null;
}

// [id, brand, product_name, format, food_type, photo_path, archived_at?]
// archived_at is optional (defaults to null = active) so the pre-B-005 fixtures
// read unchanged; only the archive-filter tests pass the 7th element.
type Fixture = [string, string, string, string, string | null, string | null, (string | null)?];

function runLibraryQuery(rows: Fixture[]): LibRow[] {
  const db = new DatabaseSync(':memory:');
  // Minimal mirror of the columns getLibraryFoods reads (lib/db.ts food_items_cache).
  db.exec(`CREATE TABLE food_items_cache (
    id TEXT PRIMARY KEY, brand TEXT, product_name TEXT, format TEXT,
    food_type TEXT, photo_path TEXT, archived_at TEXT
  );`);
  const insert = db.prepare(
    `INSERT INTO food_items_cache (id, brand, product_name, format, food_type, photo_path, archived_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const r of rows) insert.run(r[0], r[1], r[2], r[3], r[4], r[5], r[6] ?? null);
  const out = db.prepare(LIBRARY_FOODS_QUERY).all() as unknown as LibRow[];
  db.close();
  return out;
}

describe('LIBRARY_FOODS_QUERY — B-108 photo dedup', () => {
  it('prefers a non-null photo when a photo-less duplicate of the same food exists', () => {
    // The exact bug: "Tiki Cat / after DARK" had one capture WITH photos and the
    // dedup arbitrarily projected a photo-less row → the no-photo placeholder.
    const rows = runLibraryQuery([
      ['A', 'Tiki Cat', 'after DARK Rabbit & Chicken Liver Recipe', 'wet_canned', 'meal', null],
      ['B', 'Tiki Cat', 'after DARK Rabbit & Chicken Liver Recipe', 'wet_canned', 'meal', 'B/0-front.jpg'],
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].photo_path).toBe('B/0-front.jpg');
  });

  it('projects a single internally-consistent row (id/format/food_type follow the photo row)', () => {
    // SQLite's single-max bare-column rule: the projected id/format/food_type come
    // from the SAME row that supplied MAX(photo_path), so tapping the row opens the
    // capture whose photo is shown — not an arbitrary mix across the dedup group.
    const rows = runLibraryQuery([
      ['no-photo', 'Acme', 'Stew', 'wet_canned', 'treat', null],
      ['has-photo', 'Acme', 'Stew', 'fresh_cooked', 'meal', 'has-photo/0.jpg'],
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'has-photo',
      format: 'fresh_cooked',
      food_type: 'meal',
      photo_path: 'has-photo/0.jpg',
    });
  });

  it('returns a null photo (no crash) for a fully photo-less group', () => {
    const rows = runLibraryQuery([
      ['A', 'Acme', 'Typed Food', 'dry_kibble', 'treat', null],
      ['B', 'Acme', 'Typed Food', 'dry_kibble', 'treat', null],
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].photo_path).toBeNull();
  });

  it('leaves a single (non-duplicated) food untouched', () => {
    const rows = runLibraryQuery([
      ['E', 'Solo', 'Only One', 'raw', 'meal', 'E/0.jpg'],
    ]);
    expect(rows).toEqual([
      { id: 'E', brand: 'Solo', product_name: 'Only One', format: 'raw', food_type: 'meal', photo_path: 'E/0.jpg' },
    ]);
  });

  it('dedups case-insensitively on brand+product (one row per food)', () => {
    const rows = runLibraryQuery([
      ['A', 'Fancy Feast', 'Tender Beef', 'wet_canned', 'meal', null],
      ['B', 'fancy feast', 'tender beef', 'wet_canned', 'meal', 'B/0.jpg'],
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].photo_path).toBe('B/0.jpg');
  });

  it('orders alpha by brand then product, case-insensitively', () => {
    const rows = runLibraryQuery([
      ['1', 'zebra', 'Bravo', 'raw', 'meal', null],
      ['2', 'Apple', 'Beta', 'raw', 'meal', null],
      ['3', 'Apple', 'alpha', 'raw', 'meal', null],
    ]);
    expect(rows.map((r) => `${r.brand}/${r.product_name}`)).toEqual([
      'Apple/alpha', 'Apple/Beta', 'zebra/Bravo',
    ]);
  });
});

describe('LIBRARY_FOODS_QUERY — B-005 archive filter', () => {
  it('hides an archived food from the library list', () => {
    const rows = runLibraryQuery([
      ['active', 'Acme', 'Kept', 'dry_kibble', 'meal', null, null],
      ['gone', 'Acme', 'Archived', 'dry_kibble', 'meal', null, '2026-07-17T00:00:00Z'],
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('active');
    expect(rows[0].product_name).toBe('Kept');
  });

  it('drops a food only when ALL of its duplicate captures are archived', () => {
    // Two captures of the same food; one archived, one active. The food is still
    // in the pantry (its active capture forms the displayed group) — a per-row
    // archive of a duplicate must not evict a still-active food. The WHERE runs
    // pre-aggregation, so only the active row enters the GROUP.
    const rows = runLibraryQuery([
      ['dup-archived', 'Tiki', 'after DARK', 'wet_canned', 'meal', null, '2026-07-17T00:00:00Z'],
      ['dup-active', 'Tiki', 'after DARK', 'wet_canned', 'meal', 'dup-active/0.jpg', null],
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('dup-active');
    expect(rows[0].photo_path).toBe('dup-active/0.jpg');
  });

  it('drops a food entirely when every capture of it is archived', () => {
    const rows = runLibraryQuery([
      ['a1', 'Solo', 'All Gone', 'raw', 'meal', null, '2026-07-17T00:00:00Z'],
      ['a2', 'Solo', 'All Gone', 'raw', 'meal', 'a2/0.jpg', '2026-07-17T00:00:00Z'],
    ]);
    expect(rows).toHaveLength(0);
  });
});

interface ArchRow {
  id: string;
  brand: string;
  product_name: string;
  format: string;
  food_type: string | null;
  archived_ids: string;
  archived_at: string;
}

function runArchivedQuery(rows: Fixture[]): ArchRow[] {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE food_items_cache (
    id TEXT PRIMARY KEY, brand TEXT, product_name TEXT, format TEXT,
    food_type TEXT, photo_path TEXT, archived_at TEXT
  );`);
  const insert = db.prepare(
    `INSERT INTO food_items_cache (id, brand, product_name, format, food_type, photo_path, archived_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const r of rows) insert.run(r[0], r[1], r[2], r[3], r[4], r[5], r[6] ?? null);
  const out = db.prepare(ARCHIVED_FOODS_QUERY).all() as unknown as ArchRow[];
  db.close();
  return out;
}

describe('ARCHIVED_FOODS_QUERY — B-005 PR 3 Archived section', () => {
  it('returns only archived foods, never active ones', () => {
    const rows = runArchivedQuery([
      ['active', 'Acme', 'Kept', 'dry_kibble', 'meal', null, null],
      ['gone', 'Acme', 'Removed', 'dry_kibble', 'meal', null, '2026-07-17T00:00:00Z'],
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].product_name).toBe('Removed');
  });

  it('collapses duplicate captures of one food into a single unit, concatenating their ids', () => {
    // archiveFood stamps a whole brand+product+format group at once, so both
    // captures carry the same stamp and Restore must revert both — GROUP_CONCAT
    // hands the id set back to the server revert.
    const rows = runArchivedQuery([
      ['x1', 'Tiki', 'after DARK', 'wet_canned', 'meal', null, '2026-07-17T00:00:00Z'],
      ['x2', 'Tiki', 'after DARK', 'wet_canned', 'meal', 'x2/0.jpg', '2026-07-17T00:00:00Z'],
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].archived_ids.split(',').sort()).toEqual(['x1', 'x2']);
    expect(rows[0].archived_at).toBe('2026-07-17T00:00:00Z');
  });

  it('does NOT surface a food that still has an active capture (mutual exclusivity with the library)', () => {
    // One capture archived, one active, same brand+product+format. The food is
    // still in the library via its active capture — it must NOT also appear here,
    // or it would show in both lists at once. HAVING drops the partial group.
    const rows = runArchivedQuery([
      ['dup-archived', 'Tiki', 'after DARK', 'wet_canned', 'meal', null, '2026-07-17T00:00:00Z'],
      ['dup-active', 'Tiki', 'after DARK', 'wet_canned', 'meal', 'dup-active/0.jpg', null],
    ]);
    expect(rows).toHaveLength(0);
  });

  it('keeps a same-named food in different formats as separate archive-units', () => {
    // Format is part of the grouping (archiveFood's unit), so a food removed as a
    // treat is distinct from one removed as kibble — each restores independently.
    const rows = runArchivedQuery([
      ['k', 'House', 'Chicken', 'dry_kibble', 'meal', null, '2026-07-17T00:00:00Z'],
      ['t', 'House', 'Chicken', 'treat', 'treat', null, '2026-07-16T00:00:00Z'],
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.format)).toEqual(['dry_kibble', 'treat']); // most-recent stamp first
  });

  it('orders most-recently-archived first (easiest mistake to undo on top)', () => {
    const rows = runArchivedQuery([
      ['old', 'A', 'Older', 'raw', 'meal', null, '2026-07-10T00:00:00Z'],
      ['new', 'B', 'Newer', 'raw', 'meal', null, '2026-07-17T00:00:00Z'],
    ]);
    expect(rows.map((r) => r.product_name)).toEqual(['Newer', 'Older']);
  });

  it('returns nothing when no food is archived', () => {
    const rows = runArchivedQuery([
      ['a', 'A', 'One', 'raw', 'meal', null, null],
      ['b', 'B', 'Two', 'raw', 'meal', null, null],
    ]);
    expect(rows).toHaveLength(0);
  });
});
