// CUL-2767 (Vet contacts PR-05, adversarial pass 1, B2 and B3): the saved moment's check is
// earned only by a CURRENT cache with no safety card, for every pet the contact was about. The
// record is a real node:sqlite database over the app's schema (C-35); only the cache READ is
// stood in, and the staleness rule is the shipped one (`isSignalCacheStale`, C-34).

const { DatabaseSync } = require('node:sqlite');

let mockDb: {
  exec(sql: string): void;
  prepare(sql: string): { run(...p: unknown[]): unknown; all(...p: unknown[]): unknown[] };
  close(): void;
};
let mockDbFails = false;
let mockGaps = { unsent: 0, refused: 0 };
jest.mock('./db', () => ({
  getDb: () => ({
    getAllAsync: jest.fn(async (sql: string, params: unknown[] = []) => {
      if (mockDbFails) throw new Error('db down');
      return mockDb.prepare(sql).all(...(params as never[]));
    }),
    runAsync: jest.fn(async (sql: string, params: unknown[] = []) => mockDb.prepare(sql).run(...(params as never[]))),
  }),
  countRecordGaps: jest.fn(async () => mockGaps),
}));
jest.mock('./supabase', () => ({ supabase: {} }));
jest.mock('./sync', () => ({ syncPendingEvents: jest.fn(), syncPendingMeals: jest.fn() }));

const mockReads: Record<string, { row: unknown; fromLast: boolean } | 'throws'> = {};
jest.mock('./signal', () => ({
  ...jest.requireActual('./signal'),
  readSignalCacheOrLast: jest.fn(async (petId: string) => {
    const r = mockReads[petId];
    if (r === 'throws' || r === undefined) throw new Error('offline');
    return r;
  }),
}));

import { BASE_SCHEMA_SQL, applyColumnUpgrades } from './localSchema';
import { contactHasOpenWarning, petHasOpenWarning } from './vetContactMoment';
import { clearSignalUnseen, markSignalUnseen, readSignalUnseenToken } from './signalUnseen';
import { useSyncStore } from '../store/syncStore';

const NOW = Date.parse('2026-11-14T18:00:00.000Z');
const row = (classes: Array<'safety' | 'insight'>, generatedAt = '2026-11-14T17:00:00.000Z') => ({
  signalText: null,
  isBuilding: false,
  coverage: [],
  generatedAt,
  expiresAt: '2026-11-15T17:00:00.000Z',
  findings: classes.map((c, rank) => ({
    rank,
    finding: c === 'safety' ? { type: 'intake_decline', priorityClass: 'safety' } : { type: 'reflection', priorityClass: 'insight' },
  })),
});

beforeEach(async () => {
  mockDb = new DatabaseSync(':memory:');
  mockDb.exec(BASE_SCHEMA_SQL);
  await applyColumnUpgrades(async (sql: string) => mockDb.exec(sql));
  mockDbFails = false;
  mockGaps = { unsent: 0, refused: 0 };
  for (const k of Object.keys(mockReads)) delete mockReads[k];
  useSyncStore.setState({ signalAcknowledging: {} });
});
afterEach(() => mockDb.close());

function logEvent(petId: string, updatedAt: string) {
  mockDb
    .prepare(
      `INSERT INTO events (id, pet_id, event_type, occurred_at, created_at, updated_at) VALUES (?, ?, 'meal', ?, ?, ?)`,
    )
    .run(`e-${updatedAt}`, petId, updatedAt, updatedAt, updatedAt);
}

describe('petHasOpenWarning', () => {
  it('a current cache with no safety card, and nothing logged since, is the one sure no', async () => {
    mockReads['pet-a'] = { row: row(['insight']), fromLast: false };
    logEvent('pet-a', '2026-11-14 16:50:00'); // SQLite's own spelling, before the cache's margin
    expect(await petHasOpenWarning('pet-a', NOW)).toBe(false);
  });

  it('a safety card is open', async () => {
    mockReads['pet-a'] = { row: row(['safety']), fromLast: false };
    expect(await petHasOpenWarning('pet-a', NOW)).toBe(true);
  });

  it.each([
    ['no row', { row: null, fromLast: false }],
    ['the last answered row, not a fresh read', { row: row([]), fromLast: true }],
    ['a row past its TTL', { row: { ...row([]), expiresAt: '2026-11-14T17:59:00.000Z' }, fromLast: false }],
    ['a row with no readable generation time', { row: row([], 'not a time'), fromLast: false }],
  ])('%s is open (B2)', async (_label, read) => {
    mockReads['pet-a'] = read;
    expect(await petHasOpenWarning('pet-a', NOW)).toBe(true);
  });

  it('a read that throws is open (C-12)', async () => {
    mockReads['pet-a'] = 'throws';
    expect(await petHasOpenWarning('pet-a', NOW)).toBe(true);
  });

  it('a rebuild in flight is open (B2)', async () => {
    mockReads['pet-a'] = { row: row([]), fromLast: false };
    useSyncStore.setState({ signalAcknowledging: { 'pet-a': true } });
    expect(await petHasOpenWarning('pet-a', NOW)).toBe(true);
  });

  it('a meal logged after the cache was written is open, whichever spelling the instant has (B2, C-40)', async () => {
    mockReads['pet-a'] = { row: row([]), fromLast: false };
    logEvent('pet-a', '2026-11-14T17:30:00.000Z');
    expect(await petHasOpenWarning('pet-a', NOW)).toBe(true);
  });

  it('another pet’s later meal does not open this one', async () => {
    mockReads['pet-a'] = { row: row([]), fromLast: false };
    logEvent('pet-b', '2026-11-14T17:30:00.000Z');
    expect(await petHasOpenWarning('pet-a', NOW)).toBe(false);
  });

  it('a record read that fails is open', async () => {
    mockReads['pet-a'] = { row: row([]), fromLast: false };
    mockDbFails = true;
    expect(await petHasOpenWarning('pet-a', NOW)).toBe(true);
  });
});

describe('pass 2: the cache can be current and still not have read the record', () => {
  beforeEach(() => {
    mockReads['pet-a'] = { row: row([]), fromLast: false };
  });

  it('a row on this phone the server has not seen (unsent or refused) is open', async () => {
    mockGaps = { unsent: 1, refused: 0 };
    expect(await petHasOpenWarning('pet-a', NOW)).toBe(true);
    mockGaps = { unsent: 0, refused: 1 };
    expect(await petHasOpenWarning('pet-a', NOW)).toBe(true);
  });

  it('a write stamped just BEFORE the build, inside the clock margin, is open (phone clock behind the server)', async () => {
    logEvent('pet-a', '2026-11-14T16:59:00.000Z'); // a minute before generatedAt
    expect(await petHasOpenWarning('pet-a', NOW)).toBe(true);
  });

  function readOn(eventId: string, status: string, updatedAt: string) {
    mockDb
      .prepare(`INSERT INTO events (id, pet_id, event_type, occurred_at, created_at, updated_at) VALUES (?, 'pet-a', 'vomit', ?, ?, ?)`)
      .run(eventId, '2026-11-14T10:00:00.000Z', '2026-11-14 10:00:00', '2026-11-14 10:00:00');
    const cols = (mockDb.prepare(`PRAGMA table_info(event_ai_verdicts)`).all() as Array<{ name: string; notnull: number; dflt_value: unknown }>)
      .filter((c) => c.notnull === 1 && c.dflt_value === null && !['event_id', 'status', 'updated_at'].includes(c.name));
    const names = ['event_id', 'status', 'updated_at', ...cols.map((c) => c.name)];
    const values = [eventId, status, updatedAt, ...cols.map(() => 'x')];
    mockDb.prepare(`INSERT INTO event_ai_verdicts (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`).run(...values);
  }

  it('an incident read that landed after the build is open', async () => {
    readOn('v1', 'completed', '2026-11-14T17:20:00+00:00');
    expect(await petHasOpenWarning('pet-a', NOW)).toBe(true);
  });

  it('an incident read still pending is open', async () => {
    readOn('v2', 'pending', '2026-11-14T10:00:05+00:00');
    expect(await petHasOpenWarning('pet-a', NOW)).toBe(true);
  });

  it('an old settled read is not', async () => {
    readOn('v3', 'completed', '2026-11-14T10:00:05+00:00');
    expect(await petHasOpenWarning('pet-a', NOW)).toBe(false);
  });
});

describe('contactHasOpenWarning (B3: every pet the contact was about)', () => {
  it('is open when the Also about pet has a live card, though the record’s pet is quiet', async () => {
    mockReads['pet-a'] = { row: row([]), fromLast: false };
    mockReads['pet-b'] = { row: row(['safety']), fromLast: false };
    expect(await contactHasOpenWarning(['pet-a'], NOW)).toBe(false);
    expect(await contactHasOpenWarning(['pet-a', 'pet-b'], NOW)).toBe(true);
  });

  it('no pet at all is never a sure no', async () => {
    expect(await contactHasOpenWarning([], NOW)).toBe(true);
  });
});

// CUL-2846: the phone's clock runs five minutes slow. The cat's breakfast is rated None AFTER the
// Signal was built (server 17:00), but the phone stamps it 16:56, before the build less the
// margin (16:58), so the time check reads it as seen. The write armed a rebuild, the row
// landed, and the app was killed before that rebuild ran. Only the debt on disk is left.
describe('petHasOpenWarning: a rebuild owed needs no clock (CUL-2846)', () => {
  const SLOW_STAMP = '2026-11-20 16:56:00'; // real time 17:01, phone 5 min slow
  const built = '2026-11-20T17:00:00.000Z';
  const NOW_20 = Date.parse('2026-11-20T17:05:00.000Z');

  it('slow clock, killed app: the debt keeps the check from showing', async () => {
    mockReads['pet-a'] = { row: { ...row(['insight'], built), expiresAt: '2026-11-21T17:00:00.000Z' }, fromLast: false };
    logEvent('pet-a', SLOW_STAMP); // landed (synced) — the event row carries synced = 1
    mockDb.prepare(`UPDATE events SET synced = 1`).run();
    // The time check alone misses it: this is the bug, measured.
    expect(await petHasOpenWarning('pet-a', NOW_20)).toBe(false);
    await markSignalUnseen('pet-a'); // what the write's triggerSignalRegenDebounced left on disk
    expect(await petHasOpenWarning('pet-a', NOW_20)).toBe(true);
  });

  it('once the rebuild that read it settles the debt, a quiet cache answers no again', async () => {
    mockReads['pet-a'] = { row: { ...row(['insight'], built), expiresAt: '2026-11-21T17:00:00.000Z' }, fromLast: false };
    await markSignalUnseen('pet-a');
    await clearSignalUnseen('pet-a', (await readSignalUnseenToken('pet-a')) as string);
    expect(await petHasOpenWarning('pet-a', NOW_20)).toBe(false);
  });

  it('a failed read of the debt is open', async () => {
    mockReads['pet-a'] = { row: { ...row(['insight'], built), expiresAt: '2026-11-21T17:00:00.000Z' }, fromLast: false };
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      mockDbFails = true;
      expect(await petHasOpenWarning('pet-a', NOW_20)).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });

  it('every pet the contact was about: one owed pet is enough', async () => {
    for (const p of ['pet-a', 'pet-b']) {
      mockReads[p] = { row: { ...row(['insight'], built), expiresAt: '2026-11-21T17:00:00.000Z' }, fromLast: false };
    }
    await markSignalUnseen('pet-b');
    expect(await contactHasOpenWarning(['pet-a', 'pet-b'], NOW_20)).toBe(true);
  });
});
