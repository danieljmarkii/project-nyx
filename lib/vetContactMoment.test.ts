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
jest.mock('./db', () => ({
  getDb: () => ({
    getAllAsync: jest.fn(async (sql: string, params: unknown[] = []) => {
      if (mockDbFails) throw new Error('db down');
      return mockDb.prepare(sql).all(...(params as never[]));
    }),
  }),
  countRecordGaps: jest.fn(),
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
    logEvent('pet-a', '2026-11-14 16:00:00'); // SQLite's own spelling, before the cache
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
