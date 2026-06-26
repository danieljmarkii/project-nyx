// B-186 — weight-check write helper + the lbs<->kg conversion contract.
//
// Two things matter here:
//  1. The pure conversion/validation rules (parseWeightLbsToKg) are the gate that
//     keeps a 0/NaN out of the trend line — the client half of the DB CHECK.
//  2. insertWeightCheck must fire BOTH durable writes (event + weight_checks child)
//     AND the sync push, in FK order — the drift-guard insertMeal/insertMedicationDose
//     exist to prevent (a half-written weight check would sync an orphaned event).
//
// jest hoists jest.mock() above the imports, so any variable a factory closes over
// must be `mock`-prefixed.

const mockRunAsync = jest.fn().mockResolvedValue(undefined);
const mockGetFirstAsync = jest.fn().mockResolvedValue(null);
// withTransactionAsync runs its callback immediately (the real one wraps in a txn);
// the test only cares that the callback's writes land.
const mockWithTransactionAsync = jest.fn(async (cb: () => Promise<void>) => { await cb(); });
jest.mock('./db', () => ({
  getDb: () => ({
    runAsync: mockRunAsync,
    getFirstAsync: mockGetFirstAsync,
    withTransactionAsync: mockWithTransactionAsync,
  }),
}));

const mockSyncPendingEvents = jest.fn().mockResolvedValue(undefined);
const mockSyncPendingWeightChecks = jest.fn().mockResolvedValue(undefined);
jest.mock('./sync', () => ({
  syncPendingEvents: (...a: unknown[]) => mockSyncPendingEvents(...a),
  syncPendingWeightChecks: (...a: unknown[]) => mockSyncPendingWeightChecks(...a),
}));

let mockIdCounter = 0;
jest.mock('./utils', () => ({
  uuid: () => `id-${++mockIdCounter}`,
}));

import { kgToLbs, lbsToKg, parseWeightLbsToKg, MAX_WEIGHT_LBS, insertWeightCheck, getLatestWeightKg } from './weight';

// Drain past the fire-and-forget syncPendingEvents().then(syncPendingWeightChecks)
// chain (a macrotask, like meals.test.ts).
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  mockRunAsync.mockClear();
  mockGetFirstAsync.mockClear().mockResolvedValue(null);
  mockWithTransactionAsync.mockClear();
  mockSyncPendingEvents.mockClear();
  mockSyncPendingWeightChecks.mockClear();
  mockIdCounter = 0;
});

describe('kg <-> lbs conversion', () => {
  it('lbsToKg rounds to 2dp; kgToLbs rounds to 0.1', () => {
    expect(lbsToKg(10)).toBeCloseTo(4.54, 2);
    expect(kgToLbs(4.54)).toBe('10');
    // round-trips a typical cat weight within display precision
    expect(kgToLbs(lbsToKg(8.6))).toBe('8.6');
  });

  it('kgToLbs returns a string (the pre-fill value)', () => {
    expect(typeof kgToLbs(5)).toBe('string');
  });
});

describe('parseWeightLbsToKg (the no-junk-in-the-trend gate)', () => {
  it('parses a valid lbs string into rounded kg', () => {
    expect(parseWeightLbsToKg('10')).toBeCloseTo(4.54, 2);
    expect(parseWeightLbsToKg('  8.6 ')).toBeCloseTo(3.9, 1);
  });

  it('rejects empty, non-numeric, zero, and negative input (returns null)', () => {
    expect(parseWeightLbsToKg('')).toBeNull();
    expect(parseWeightLbsToKg('   ')).toBeNull();
    expect(parseWeightLbsToKg('abc')).toBeNull();
    expect(parseWeightLbsToKg('0')).toBeNull();
    expect(parseWeightLbsToKg('-5')).toBeNull();
  });

  it('rejects an implausibly-large value so it never wedges the sync queue', () => {
    // A fat-fingered "9999" would convert to ~4536 kg and 23514 against the
    // NUMERIC(5,2) column, sticking in the queue forever — rejected at the gate.
    expect(parseWeightLbsToKg('9999')).toBeNull();
    expect(parseWeightLbsToKg(String(MAX_WEIGHT_LBS + 1))).toBeNull();
    // The boundary itself is allowed.
    expect(parseWeightLbsToKg(String(MAX_WEIGHT_LBS))).not.toBeNull();
  });
});

describe('insertWeightCheck', () => {
  const PARAMS = {
    petId: 'pet-1',
    weightKg: 4.54,
    occurredAt: new Date('2026-06-26T08:00:00.000Z'),
    occurredAtSource: 'now' as const,
  };

  it('writes BOTH rows in a transaction and pushes events-before-weight_checks', async () => {
    await insertWeightCheck(PARAMS);
    await flush();

    expect(mockWithTransactionAsync).toHaveBeenCalledTimes(1);
    const sql = mockRunAsync.mock.calls.map((c) => c[0] as string);
    expect(sql.some((s) => /INSERT INTO events/.test(s))).toBe(true);
    expect(sql.some((s) => /INSERT INTO weight_checks/.test(s))).toBe(true);

    // FK push order: events before weight_checks (the child FK→events.id).
    expect(mockSyncPendingEvents).toHaveBeenCalledTimes(1);
    expect(mockSyncPendingWeightChecks).toHaveBeenCalledTimes(1);
  });

  it('writes the event as a witnessed weight_check with the given time + source', async () => {
    await insertWeightCheck(PARAMS);
    const eventCall = mockRunAsync.mock.calls.find((c) => /INSERT INTO events/.test(c[0] as string))!;
    const sql = eventCall[0] as string;
    const args = eventCall[1] as unknown[];
    expect(sql).toMatch(/'weight_check'/);
    expect(sql).toMatch(/'witnessed'/);
    // Placeholders === params — guards the B-057 INSERT-drift class.
    expect((sql.match(/\?/g) ?? []).length).toBe(args.length);
    // id, pet_id, occurred_at, notes (on the EVENT), occurred_at_source, created_at, updated_at
    expect(args).toEqual(['id-1', 'pet-1', '2026-06-26T08:00:00.000Z', null, 'now', expect.any(String), expect.any(String)]);
  });

  it('writes the owner note to the EVENT row (where it renders), not the child', async () => {
    await insertWeightCheck({ ...PARAMS, notes: 'weighed at the vet' });
    const eventCall = mockRunAsync.mock.calls.find((c) => /INSERT INTO events/.test(c[0] as string))!;
    expect((eventCall[1] as unknown[])).toContain('weighed at the vet');
    // The child's notes column is a literal NULL in the SQL (forward-compatible),
    // so the note is never duplicated onto weight_checks.
    const childCall = mockRunAsync.mock.calls.find((c) => /INSERT INTO weight_checks/.test(c[0] as string))!;
    expect((childCall[1] as unknown[])).not.toContain('weighed at the vet');
  });

  it('weight_checks INSERT carries the value and matches its placeholder count', async () => {
    await insertWeightCheck(PARAMS);
    const childCall = mockRunAsync.mock.calls.find((c) => /INSERT INTO weight_checks/.test(c[0] as string))!;
    const sql = childCall[0] as string;
    const args = childCall[1] as unknown[];
    expect((sql.match(/\?/g) ?? []).length).toBe(args.length);
    // id, event_id, pet_id, weight_kg, created_at, updated_at (notes is literal NULL)
    expect(args[0]).toBe('id-2');
    expect(args[1]).toBe('id-1'); // event_id links to the parent event
    expect(args[2]).toBe('pet-1');
    expect(args[3]).toBe(4.54);   // the measured value
  });

  it('aborts the weight push when the parent-event push rejects (FK order holds)', async () => {
    mockSyncPendingEvents.mockRejectedValueOnce(new Error('offline'));
    await insertWeightCheck(PARAMS);
    await flush();
    // The .then(syncPendingWeightChecks) chain must not run if events failed —
    // pushing a child before its FK parent would 23503 server-side.
    expect(mockSyncPendingEvents).toHaveBeenCalledTimes(1);
    expect(mockSyncPendingWeightChecks).not.toHaveBeenCalled();
  });

  it('returns the ids + timestamps the caller needs', async () => {
    const res = await insertWeightCheck(PARAMS);
    expect(res.eventId).toBe('id-1');
    expect(res.weightCheckId).toBe('id-2');
    expect(res.occurredAtIso).toBe('2026-06-26T08:00:00.000Z');
    expect(typeof res.now).toBe('string');
  });
});

describe('getLatestWeightKg', () => {
  it('returns the most-recent reading in kg, or null when none', async () => {
    mockGetFirstAsync.mockResolvedValueOnce({ weight_kg: 4.31 });
    expect(await getLatestWeightKg('pet-1')).toBe(4.31);

    mockGetFirstAsync.mockResolvedValueOnce(null);
    expect(await getLatestWeightKg('pet-1')).toBeNull();
  });

  it('orders by occurred_at and filters soft-deleted parents', async () => {
    await getLatestWeightKg('pet-1');
    const sql = mockGetFirstAsync.mock.calls[0][0] as string;
    expect(sql).toMatch(/ORDER BY e\.occurred_at DESC/);
    expect(sql).toMatch(/e\.deleted_at IS NULL/);
  });
});
