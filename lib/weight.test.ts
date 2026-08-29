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

// supabase.from('pets').update({ weight_kg }).eq('id', petId)[.eq('weight_kg', …)]
// Two shapes share this mock, so the first `.eq` returns something that is BOTH
// awaitable and chainable: `updateWeightCheck` (B-197) stops after one filter, while
// the CUL-641 delete-side reconcile adds a second — the identity gate, evaluated by
// the database in the write that depends on it.
const mockPetsEqWeight = jest.fn().mockResolvedValue({ error: null });
const mockPetsEq = jest.fn(() =>
  Object.assign(Promise.resolve({ error: null }), { eq: mockPetsEqWeight }),
);
const mockPetsUpdate = jest.fn(() => ({ eq: mockPetsEq }));
jest.mock('./supabase', () => ({
  supabase: { from: jest.fn(() => ({ update: mockPetsUpdate })) },
}));

import {
  kgToLbs, kgToLbsNum, lbsToKg, parseWeightLbsToKg, MAX_WEIGHT_LBS,
  insertWeightCheck, getLatestWeightKg, getWeightKgForEvent, updateWeightCheck,
  getWeightHistory, computeWeightTrend, reconcileWeightSnapshotAfterDelete,
  describeWeightDelta, formatWeightDate, type WeightTrend,
} from './weight';
import { usePetStore, type Pet } from '../store/petStore';

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
  mockPetsEq.mockClear();
  mockPetsEqWeight.mockClear().mockResolvedValue({ error: null });
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

// ── CUL-641: the delete-side snapshot reconcile ──────────────────────────────
//
// The defect this closes: `pets.weight_kg` is re-pointed on every weigh-in WRITE
// and was re-pointed on no delete at all, so undoing a fat-fingered "124" left the
// Profile chip, the next weigh-in's pre-fill and EditPetModal offering 124 forever.
// These cases are the rule stated in lib/weight.ts's delete-side header, one branch
// at a time — with the two that decide whether the fix loses data first.
describe('reconcileWeightSnapshotAfterDelete (CUL-641)', () => {
  const PET: Pet = {
    id: 'pet-1', name: 'Pixel', species: 'cat', breed: null,
    date_of_birth: null, date_of_birth_precision: 'exact', sex: 'unknown',
    weight_kg: 56.25, photo_path: null,
  } as Pet;

  /**
   * 1st getFirstAsync = the parent+child lookup (type, pet, the DELETED reading's own
   * value); 2nd = getLatestWeightKg. `deletedKg` defaults to the fixture pet's snapshot
   * so the common case is "the snapshot IS this reading" — the only case in which the
   * helper is allowed to touch anything.
   */
  function localReads(opts: {
    eventType?: string;
    deletedKg?: number | null;
    latestKg: number | null;
    petId?: string;
  }) {
    const eventType = opts.eventType ?? 'weight_check';
    const deletedKg = opts.deletedKg === undefined ? PET.weight_kg : opts.deletedKg;
    mockGetFirstAsync
      .mockResolvedValueOnce({ event_type: eventType, pet_id: opts.petId ?? PET.id, weight_kg: deletedKg })
      .mockResolvedValueOnce(opts.latestKg == null ? null : { weight_kg: opts.latestKg });
  }

  beforeEach(() => {
    // mockRESET, not the file-level mockClear: `mockClear` drops call data but leaves
    // the `mockResolvedValueOnce` QUEUE intact, and the not-a-weigh-in case below
    // deliberately queues a second read it never consumes (the early return is the
    // thing under test). That leftover then answered the NEXT test's pet_id lookup,
    // which is how two of these first went red — a leak the file-level reset cannot
    // reach because it does not know about the queue.
    mockGetFirstAsync.mockReset().mockResolvedValue(null);
    usePetStore.setState({ pets: [PET], activePet: PET, isOnboarded: true });
  });

  // Every server write below carries TWO filters: `.eq('id', …)` and
  // `.eq('weight_kg', <the deleted reading's own value>)`. That second one is the
  // identity gate, and it lives in the write rather than ahead of it — asked of the
  // database, against the authoritative value, atomically. The first version asked the
  // pet STORE and then acted on the server, and the adversarial pass broke it in both
  // directions: a stale store refused a correction the server needed (permanently, when
  // no reading remained), and permitted one the server had to refuse (a shared-credential
  // household where the other device had typed a profile weight).
  const gate = (kg: number) => expect(mockPetsEqWeight).toHaveBeenCalledWith('weight_kg', kg);

  it('re-points the snapshot at the latest REMAINING reading', async () => {
    localReads({ latestKg: 5.62 });
    const out = await reconcileWeightSnapshotAfterDelete('ev-1');
    expect(out).toEqual({ petId: 'pet-1', snapshotKg: 5.62 });
    await flush();
    expect(mockPetsUpdate).toHaveBeenCalledWith({ weight_kg: 5.62 });
    gate(56.25);
    expect(usePetStore.getState().activePet?.weight_kg).toBe(5.62);
  });

  it('restores the displaced value when NO reading remains — the first-ever weigh-in', async () => {
    // The case option A could not reach: with nothing left to reconcile TO, the profile
    // weight this log overwrote is the only correct answer.
    localReads({ latestKg: null });
    const out = await reconcileWeightSnapshotAfterDelete('ev-1', { restoreToKg: 4.2 });
    expect(out).toEqual({ petId: 'pet-1', snapshotKg: 4.2 });
    await flush();
    expect(mockPetsUpdate).toHaveBeenCalledWith({ weight_kg: 4.2 });
    gate(56.25);
    expect(usePetStore.getState().activePet?.weight_kg).toBe(4.2);
  });

  it('restores a displaced NULL — "no weight on file" is a value, not a missing one', async () => {
    localReads({ latestKg: null });
    const out = await reconcileWeightSnapshotAfterDelete('ev-1', { restoreToKg: null });
    expect(out).toEqual({ petId: 'pet-1', snapshotKg: null });
    await flush();
    expect(mockPetsUpdate).toHaveBeenCalledWith({ weight_kg: null });
    expect(usePetStore.getState().activePet?.weight_kg).toBeNull();
  });

  it('NULLS a snapshot that is the deleted reading itself, when nothing remains', async () => {
    // The History/detail Remove path on a first-ever weigh-in. The first draft left this
    // alone, reasoning it protected the owner's onboarding weight — but the WRITE side
    // already destroyed that at log time, so what "leave alone" preserved was the deleted
    // reading, which `WeightTrendCard` captions "From {pet}'s profile." and `EditPetModal`
    // writes back on Save. Null is the honest reading of a record holding no weigh-in.
    localReads({ latestKg: null });
    const out = await reconcileWeightSnapshotAfterDelete('ev-1');
    expect(out).toEqual({ petId: 'pet-1', snapshotKg: null });
    await flush();
    expect(mockPetsUpdate).toHaveBeenCalledWith({ weight_kg: null });
    gate(56.25);
    expect(usePetStore.getState().activePet?.weight_kg).toBeNull();
  });

  // ── The gate: a delete may only undo the snapshot write THIS reading made ───
  it('cannot destroy an owner-entered profile weight — the DB refuses the write', async () => {
    // The vector the un-gated version introduced. The owner types a vet-measured 18.0 kg
    // into Edit profile, then removes an unrelated older weigh-in. The local store
    // refuses the patch, and — the half that actually protects the server — the write
    // carries `weight_kg = 10.0`, the deleted reading's value, so it matches zero rows
    // against a snapshot holding 18.0. Asserting the FILTER rather than "no call" is the
    // point: the protection has to survive a stale local copy.
    usePetStore.setState({ pets: [{ ...PET, weight_kg: 18.0 }], activePet: { ...PET, weight_kg: 18.0 }, isOnboarded: true });
    localReads({ deletedKg: 10.0, latestKg: 20.0 });

    await reconcileWeightSnapshotAfterDelete('ev-old');

    await flush();
    gate(10.0);
    expect(usePetStore.getState().activePet?.weight_kg).toBe(18.0);
  });

  it('does not patch the local store when a NEWER reading owns the snapshot', async () => {
    localReads({ deletedKg: 4.0, latestKg: 56.25 });
    await reconcileWeightSnapshotAfterDelete('ev-old');
    await flush();
    gate(4.0);
    expect(usePetStore.getState().activePet?.weight_kg).toBe(56.25);
  });

  it('still asks the server even when the LOCAL copy says no — a stale store must not veto', async () => {
    // The other direction the first gate got wrong, and the costlier one. `app/log.tsx`
    // patches the store only when its server write succeeded AND the pet is still
    // active, so the store is knowingly allowed to lag. An offline weigh-in that syncs
    // later, or an Undo after a pet switch, leaves the store holding a value the server
    // does not have — and a store-only gate then refuses a correction the server needs,
    // permanently, because with no reading left nothing ever re-runs. The write goes out
    // regardless; the database decides.
    usePetStore.setState({ pets: [{ ...PET, weight_kg: 5.0 }], activePet: { ...PET, weight_kg: 5.0 }, isOnboarded: true });
    localReads({ deletedKg: 56.2, latestKg: null });

    await reconcileWeightSnapshotAfterDelete('ev-1');

    await flush();
    expect(mockPetsUpdate).toHaveBeenCalledWith({ weight_kg: null });
    gate(56.2);
  });

  it('compares the LOCAL patch at the precision the data has, not by float identity', async () => {
    usePetStore.setState({ pets: [{ ...PET, weight_kg: 0.1 + 0.2 }], activePet: { ...PET, weight_kg: 0.1 + 0.2 }, isOnboarded: true });
    localReads({ deletedKg: 0.3, latestKg: 5.62 });

    await reconcileWeightSnapshotAfterDelete('ev-1');

    expect(usePetStore.getState().activePet?.weight_kg).toBe(5.62);
  });

  it('treats an unhydrated child as an UNEVALUABLE weigh-in, not as a non-weigh-in', async () => {
    // On the PULL path `hydrateEvents` completes before `hydrateWeightChecks`, so on a
    // fresh install a weigh-in can render with no local child. Scoring that as "this
    // wasn't a weigh-in" is a logging gap read as an absence — and without the child
    // there is no value to gate on, so nothing is written either.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    localReads({ deletedKg: null, latestKg: 5.62 });

    expect(await reconcileWeightSnapshotAfterDelete('ev-1')).toBeNull();

    await flush();
    expect(mockPetsUpdate).not.toHaveBeenCalled();
    expect(mockGetFirstAsync).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('is a no-op for an event that is not a weigh-in', async () => {
    // Every delete path calls this unconditionally, so the overwhelmingly common input
    // is a vomit / meal / dose. One local read and nothing else.
    localReads({ eventType: 'vomit', latestKg: 9.9 });
    expect(await reconcileWeightSnapshotAfterDelete('ev-not-weight')).toBeNull();
    await flush();
    expect(mockGetFirstAsync).toHaveBeenCalledTimes(1);
    expect(mockPetsUpdate).not.toHaveBeenCalled();
  });

  it("patches the RECORD's pet even when another pet is active, and only that one", async () => {
    // The cross-pet MAINLINE, not a race. A record screen is reached by id for any pet —
    // the day-summary spine pushes /event/[id] for every pet's rows (CUL-574) — so
    // removing a non-active pet's weigh-in is ordinary. `updatePet` can only patch the
    // ACTIVE pet, so an is-it-active guard left the record's pet holding the deleted
    // reading; `selectPet` repoints into the already-loaded array without refetching.
    const other = { ...PET, id: 'pet-2', name: 'Juniper', weight_kg: 3.1 } as Pet;
    usePetStore.setState({ pets: [PET, other], activePet: other, isOnboarded: true });
    localReads({ latestKg: 5.62 });

    await reconcileWeightSnapshotAfterDelete('ev-1');
    await flush();

    expect(usePetStore.getState().pets.find((p) => p.id === 'pet-1')?.weight_kg).toBe(5.62);
    // The other animal is untouched — a by-id patch cannot land on the wrong pet.
    expect(usePetStore.getState().pets.find((p) => p.id === 'pet-2')?.weight_kg).toBe(3.1);
    expect(usePetStore.getState().activePet?.weight_kg).toBe(3.1);
  });

  it('survives a later switch to that pet — the defect was only visible after one', async () => {
    const other = { ...PET, id: 'pet-2', name: 'Juniper', weight_kg: 3.1 } as Pet;
    usePetStore.setState({ pets: [PET, other], activePet: other, isOnboarded: true });
    localReads({ latestKg: 5.62 });

    await reconcileWeightSnapshotAfterDelete('ev-1');
    await flush();
    usePetStore.getState().selectPet('pet-1');

    expect(usePetStore.getState().activePet?.weight_kg).toBe(5.62);
  });

  it('still corrects the SERVER for a record whose pet is not in the local list', async () => {
    // An archived pet's record. There is nothing on screen to patch, but the server
    // snapshot is still wrong and still gated, so the correction goes out.
    usePetStore.setState({ pets: [], activePet: null, isOnboarded: true });
    localReads({ latestKg: 5.62 });

    await reconcileWeightSnapshotAfterDelete('ev-1');
    await flush();

    expect(mockPetsUpdate).toHaveBeenCalledWith({ weight_kg: 5.62 });
    gate(56.25);
    expect(usePetStore.getState().activePet).toBeNull();
  });

  it('patches the store even when the server write fails — the device stays right offline', async () => {
    localReads({ latestKg: 5.62 });
    mockPetsEqWeight.mockResolvedValueOnce({ error: { message: 'network' } });
    await expect(reconcileWeightSnapshotAfterDelete('ev-1')).resolves.toEqual({
      petId: 'pet-1', snapshotKg: 5.62,
    });
    await flush();
    expect(usePetStore.getState().activePet?.weight_kg).toBe(5.62);
  });

  it('swallows a local read failure — a cosmetic snapshot never fails a reversal', async () => {
    // Best-effort by contract. The event is already soft-deleted and that is the
    // durable truth; throwing here would surface as a failed Undo over a denormalized
    // convenience, and tell the owner a removal did not happen when it did.
    mockGetFirstAsync.mockRejectedValueOnce(new Error('db closed'));
    await expect(reconcileWeightSnapshotAfterDelete('ev-1')).resolves.toBeNull();
  });
});
