// Runs the shared weight SQL against an in-memory SQLite (the medicationQueries.test.ts
// harness), so the order and the soft-delete filter are exercised rather than mocked.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');
import { LATEST_WEIGHING_QUERY } from './weightQueries';

// [event id, pet id, kg, occurred_at, deleted_at]
type Reading = [string, string, number, string, string | null];

function latest(readings: Reading[], petId = 'p1') {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE events (id TEXT PRIMARY KEY, occurred_at TEXT, deleted_at TEXT);`);
  db.exec(`CREATE TABLE weight_checks (id TEXT PRIMARY KEY, event_id TEXT, pet_id TEXT, weight_kg REAL);`);
  const ie = db.prepare(`INSERT INTO events (id, occurred_at, deleted_at) VALUES (?, ?, ?)`);
  const iw = db.prepare(`INSERT INTO weight_checks (id, event_id, pet_id, weight_kg) VALUES (?, ?, ?, ?)`);
  for (const [id, pet, kg, at, del] of readings) {
    ie.run(id, at, del);
    iw.run(`wc-${id}`, id, pet, kg);
  }
  const row = db.prepare(LATEST_WEIGHING_QUERY).get(petId);
  db.close();
  return row;
}

describe('LATEST_WEIGHING_QUERY (CUL-1908 P9)', () => {
  it('returns the newest reading by when it was taken, with its date', () => {
    expect(latest([
      ['e1', 'p1', 19.3, '2026-10-02T13:00:00.000Z', null],
      // typed later, taken earlier: sorts to where it happened
      ['e2', 'p1', 18.9, '2026-09-20T13:00:00.000Z', null],
    ])).toEqual({ weight_kg: 19.3, occurred_at: '2026-10-02T13:00:00.000Z' });
  });

  it('skips a deleted reading and another pet\'s', () => {
    expect(latest([
      ['e1', 'p1', 19.3, '2026-10-02T13:00:00.000Z', '2026-10-03T00:00:00.000Z'],
      ['e2', 'p2', 4.1, '2026-10-05T13:00:00.000Z', null],
      ['e3', 'p1', 18.9, '2026-09-20T13:00:00.000Z', null],
    ])).toEqual({ weight_kg: 18.9, occurred_at: '2026-09-20T13:00:00.000Z' });
  });

  it('answers nothing for a pet never weighed', () => {
    expect(latest([])).toBeUndefined();
  });
});
