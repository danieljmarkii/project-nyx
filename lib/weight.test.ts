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
const mockGetAllAsync = jest.fn().mockResolvedValue([]);
// withTransactionAsync runs its callback immediately (the real one wraps in a txn);
// the test only cares that the callback's writes land.
const mockWithTransactionAsync = jest.fn(async (cb: () => Promise<void>) => { await cb(); });
jest.mock('./db', () => ({
  getDb: () => ({
    runAsync: mockRunAsync,
    getFirstAsync: mockGetFirstAsync,
    getAllAsync: mockGetAllAsync,
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

// supabase.from('pets').update({ weight_kg }).eq('id', petId) → { error } — the
// snapshot re-point in updateWeightCheck (B-197).
const mockPetsEq = jest.fn().mockResolvedValue({ error: null });
const mockPetsUpdate = jest.fn(() => ({ eq: mockPetsEq }));
jest.mock('./supabase', () => ({
  supabase: { from: jest.fn(() => ({ update: mockPetsUpdate })) },
}));

import {
  kgToLbs, kgToLbsNum, lbsToKg, parseWeightLbsToKg, MAX_WEIGHT_LBS,
  insertWeightCheck, getLatestWeightKg, getWeightKgForEvent, updateWeightCheck,
  getWeightHistory, computeWeightTrend,
  describeWeightDelta, formatWeightDate, type WeightTrend,
} from './weight';

// Drain past the fire-and-forget syncPendingEvents().then(syncPendingWeightChecks)
// chain (a macrotask, like meals.test.ts).
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  mockRunAsync.mockClear();
  mockGetFirstAsync.mockClear().mockResolvedValue(null);
  mockGetAllAsync.mockClear().mockResolvedValue([]);
  mockWithTransactionAsync.mockClear();
  mockSyncPendingEvents.mockClear();
  mockSyncPendingWeightChecks.mockClear();
  mockPetsEq.mockClear().mockResolvedValue({ error: null });
  mockPetsUpdate.mockClear();
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

describe('getWeightKgForEvent (edit pre-fill, B-197)', () => {
  it('returns the child weight_kg for the event, or null when none', async () => {
    mockGetFirstAsync.mockResolvedValueOnce({ weight_kg: 4.31 });
    expect(await getWeightKgForEvent('evt-1')).toBe(4.31);
    mockGetFirstAsync.mockResolvedValueOnce(null);
    expect(await getWeightKgForEvent('evt-1')).toBeNull();
  });

  it('reads the child by event_id', async () => {
    mockGetFirstAsync.mockResolvedValueOnce({ weight_kg: 4.31 });
    await getWeightKgForEvent('evt-1');
    const [sql, args] = mockGetFirstAsync.mock.calls[0];
    expect(sql).toMatch(/FROM weight_checks WHERE event_id = \?/);
    expect(args).toEqual(['evt-1']);
  });
});

describe('updateWeightCheck (edit the value, B-197)', () => {
  it('updates the child (synced=0), re-points the snapshot, does NOT self-push, returns petId+snapshot', async () => {
    // 1st getFirstAsync = pet_id lookup; 2nd = getLatestWeightKg (the new snapshot).
    mockGetFirstAsync
      .mockResolvedValueOnce({ pet_id: 'pet-1' })
      .mockResolvedValueOnce({ weight_kg: 4.2 });

    const res = await updateWeightCheck('evt-9', 4.2);
    await flush();

    // child UPDATE, marked unsynced so it re-pushes under last-write-wins
    const upd = mockRunAsync.mock.calls.find((c) => /UPDATE weight_checks SET/.test(c[0] as string))!;
    expect(upd[0]).toMatch(/weight_kg = \?/);
    expect(upd[0]).toMatch(/synced = 0/);
    expect(upd[0]).toMatch(/WHERE event_id = \?/);
    expect(upd[1]).toEqual([4.2, expect.any(String), 'evt-9']);

    // snapshot re-pointed to the latest reading (by occurred_at)
    expect(mockPetsUpdate).toHaveBeenCalledWith({ weight_kg: 4.2 });
    expect(mockPetsEq).toHaveBeenCalledWith('id', 'pet-1');

    // Does NOT self-push: the child's sync gate needs the parent event synced=1,
    // but the caller (edit-event) just marked it synced=0 — so the ordered push
    // (events → then meals + weight_checks) is the caller's job (B-197 review).
    expect(mockSyncPendingWeightChecks).not.toHaveBeenCalled();
    expect(res).toEqual({ petId: 'pet-1', snapshotKg: 4.2 });
  });

  it('no-ops when the event has no weight child (returns null; no write, snapshot, or sync)', async () => {
    mockGetFirstAsync.mockResolvedValueOnce(null); // pet_id lookup misses
    const res = await updateWeightCheck('evt-x', 4.2);
    await flush();
    expect(res).toBeNull();
    expect(mockRunAsync).not.toHaveBeenCalled();
    expect(mockPetsUpdate).not.toHaveBeenCalled();
    expect(mockSyncPendingWeightChecks).not.toHaveBeenCalled();
  });
});

describe('kgToLbsNum', () => {
  it('returns a number rounded to 0.1 lb, matching kgToLbs', () => {
    expect(kgToLbsNum(4.54)).toBe(10);
    expect(typeof kgToLbsNum(5)).toBe('number');
    // The string and numeric forms agree (one rounding rule, so chart === caption).
    expect(String(kgToLbsNum(3.9))).toBe(kgToLbs(3.9));
  });
});

describe('getWeightHistory', () => {
  it('reverses the DESC-LIMIT query into oldest-first readings', async () => {
    // Query returns most-recent-first (so LIMIT keeps the latest window); the card
    // draws oldest-first, so the helper reverses.
    mockGetAllAsync.mockResolvedValueOnce([
      { weight_kg: 4.3, occurred_at: '2026-06-20T08:00:00.000Z' },
      { weight_kg: 4.5, occurred_at: '2026-06-10T08:00:00.000Z' },
      { weight_kg: 4.7, occurred_at: '2026-06-01T08:00:00.000Z' },
    ]);
    const readings = await getWeightHistory('pet-1');
    expect(readings.map((r) => r.weightKg)).toEqual([4.7, 4.5, 4.3]);
    expect(readings[0].occurredAt).toBe('2026-06-01T08:00:00.000Z');
  });

  it('joins to events for occurred_at, filters soft-deletes, scopes by pet + limit', async () => {
    await getWeightHistory('pet-1', 12);
    const [sql, args] = mockGetAllAsync.mock.calls[0];
    expect(sql).toMatch(/JOIN events e ON e\.id = wc\.event_id/);
    expect(sql).toMatch(/e\.deleted_at IS NULL/);
    expect(sql).toMatch(/ORDER BY e\.occurred_at DESC/);
    expect(sql).toMatch(/LIMIT \?/);
    expect(args).toEqual(['pet-1', 12]);
  });

  it('returns [] when there are no readings', async () => {
    mockGetAllAsync.mockResolvedValueOnce([]);
    expect(await getWeightHistory('pet-1')).toEqual([]);
  });
});

describe('computeWeightTrend (descriptive, never a verdict)', () => {
  const r = (weightKg: number, occurredAt: string) => ({ weightKg, occurredAt });

  it('returns the empty shape for no readings', () => {
    const t = computeWeightTrend([]);
    expect(t.readingCount).toBe(0);
    expect(t.seriesLbs).toEqual([]);
    expect(t.latestLbs).toBeNull();
    expect(t.deltaLbs).toBeNull();
    expect(t.direction).toBeNull();
  });

  it('a single reading is a point, not a trend — value but no delta/direction', () => {
    const t = computeWeightTrend([r(4.54, '2026-06-10T08:00:00.000Z')]);
    expect(t.readingCount).toBe(1);
    expect(t.latestLbs).toBe(10);
    expect(t.seriesLbs).toEqual([10]);
    expect(t.deltaLbs).toBeNull();
    expect(t.direction).toBeNull();
  });

  it('sorts defensively into oldest-first and builds the lbs series', () => {
    const t = computeWeightTrend([
      r(4.3, '2026-06-20T08:00:00.000Z'),
      r(4.7, '2026-06-01T08:00:00.000Z'),
      r(4.5, '2026-06-10T08:00:00.000Z'),
    ]);
    // 4.7kg→10.4, 4.5→9.9, 4.3→9.5
    expect(t.seriesLbs).toEqual([10.4, 9.9, 9.5]);
    expect(t.latestLbs).toBe(9.5);
    expect(t.latestOccurredAt).toBe('2026-06-20T08:00:00.000Z');
    expect(t.earliestOccurredAt).toBe('2026-06-01T08:00:00.000Z');
  });

  it('a falling weight reads "down" — the delta is latest − earliest of the DRAWN numbers', () => {
    const t = computeWeightTrend([
      r(4.7, '2026-06-01T08:00:00.000Z'), // 10.4 lbs
      r(4.3, '2026-06-20T08:00:00.000Z'), // 9.5 lbs
    ]);
    // Delta is computed from the rounded display values so chart === caption: 9.5 − 10.4.
    expect(t.deltaLbs).toBe(-0.9);
    expect(t.direction).toBe('down');
  });

  it('a rising weight reads "up" — never softened (rising ≠ wellness)', () => {
    const t = computeWeightTrend([
      r(4.3, '2026-06-01T08:00:00.000Z'),
      r(4.7, '2026-06-20T08:00:00.000Z'),
    ]);
    expect(t.deltaLbs).toBe(0.9);
    expect(t.direction).toBe('up');
  });

  it('no measurable change reads "flat" (0 delta), never "stable"/reassuring', () => {
    const t = computeWeightTrend([
      r(4.54, '2026-06-01T08:00:00.000Z'),
      r(4.54, '2026-06-20T08:00:00.000Z'),
    ]);
    expect(t.deltaLbs).toBe(0);
    expect(t.direction).toBe('flat');
  });
});

describe('describeWeightDelta (the shared, never-reassuring delta phrase)', () => {
  const r = (weightKg: number, occurredAt: string) => ({ weightKg, occurredAt });
  const trendFrom = (...readings: { weightKg: number; occurredAt: string }[]): WeightTrend =>
    computeWeightTrend(readings);

  it('returns null with no trend yet (zero or one reading)', () => {
    expect(describeWeightDelta(computeWeightTrend([]))).toBeNull();
    expect(describeWeightDelta(trendFrom(r(4.54, '2026-06-10T08:00:00.000Z')))).toBeNull();
  });

  it('a falling weight reads "Down X lbs since …" — loss is never softened', () => {
    const text = describeWeightDelta(
      trendFrom(r(4.7, '2026-06-01T08:00:00.000Z'), r(4.3, '2026-06-20T08:00:00.000Z')),
    );
    expect(text).toMatch(/^Down 0\.9 lbs since /);
  });

  it('a rising weight reads "Up X lbs since …" — rising is not framed as wellness', () => {
    const text = describeWeightDelta(
      trendFrom(r(4.3, '2026-06-01T08:00:00.000Z'), r(4.7, '2026-06-20T08:00:00.000Z')),
    );
    expect(text).toMatch(/^Up 0\.9 lbs since /);
  });

  it('no change reads "No change since …", never "stable"/"steady"/"holding"', () => {
    const text = describeWeightDelta(
      trendFrom(r(4.54, '2026-06-01T08:00:00.000Z'), r(4.54, '2026-06-20T08:00:00.000Z')),
    );
    expect(text).toMatch(/^No change since /);
  });

  // GUARDRAIL: a weight trend never reassures — no verdict word in any direction.
  it('carries no reassuring/valenced vocabulary in any direction', () => {
    const cases = [
      trendFrom(r(4.7, '2026-06-01T08:00:00.000Z'), r(4.3, '2026-06-20T08:00:00.000Z')), // down
      trendFrom(r(4.3, '2026-06-01T08:00:00.000Z'), r(4.7, '2026-06-20T08:00:00.000Z')), // up
      trendFrom(r(4.54, '2026-06-01T08:00:00.000Z'), r(4.54, '2026-06-20T08:00:00.000Z')), // flat
    ];
    const banned = /improv|stable|steady|holding|healthy|better|worse|good|great|fine|on track/i;
    for (const t of cases) {
      const text = describeWeightDelta(t);
      expect(text).not.toBeNull();
      expect(text!).not.toMatch(banned);
    }
  });
});

describe('formatWeightDate', () => {
  it('omits the year for a reading in the current year', () => {
    const thisYear = new Date().getFullYear();
    const out = formatWeightDate(`${thisYear}-06-01T08:00:00.000Z`);
    // No 4-digit year shown when it's this year (an ambiguous date would read as now).
    expect(out).not.toMatch(/\d{4}/);
  });

  it('shows the year for a reading in a different year (an old reading is not "now")', () => {
    const lastYear = new Date().getFullYear() - 1;
    const out = formatWeightDate(`${lastYear}-06-01T08:00:00.000Z`);
    expect(out).toContain(String(lastYear));
  });
});
