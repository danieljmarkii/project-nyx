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
import { LIBRARY_FOODS_QUERY } from './foodQueries';

interface LibRow {
  id: string;
  brand: string;
  product_name: string;
  format: string;
  food_type: string | null;
  photo_path: string | null;
}

// [id, brand, product_name, format, food_type, photo_path]
type Fixture = [string, string, string, string, string | null, string | null];

function runLibraryQuery(rows: Fixture[]): LibRow[] {
  const db = new DatabaseSync(':memory:');
  // Minimal mirror of the columns getLibraryFoods reads (lib/db.ts food_items_cache).
  db.exec(`CREATE TABLE food_items_cache (
    id TEXT PRIMARY KEY, brand TEXT, product_name TEXT, format TEXT,
    food_type TEXT, photo_path TEXT
  );`);
  const insert = db.prepare(
    `INSERT INTO food_items_cache (id, brand, product_name, format, food_type, photo_path)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  for (const r of rows) insert.run(...r);
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
