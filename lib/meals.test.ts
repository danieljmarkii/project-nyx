// B-059 regression guard. The bug this helper exists to kill was a *missing*
// side-effect (the AI-Signal regen) on two of the three meal entry points. So
// the test that matters most asserts insertMeal fires ALL of the side-effects —
// the durable writes, the sync push, and triggerSignalRegenDebounced — for a
// single call. If a future edit drops one, this fails.
//
// jest hoists jest.mock() above the imports, so any variable a factory closes
// over must be `mock`-prefixed (jest's escape hatch for the no-out-of-scope rule).

const mockRunAsync = jest.fn().mockResolvedValue(undefined);
// withTransactionAsync runs its callback immediately (the real one wraps it in
// BEGIN/COMMIT); the tests assert both that the callback's writes land and WHICH
// writes are inside it (B-126).
const mockWithTransactionAsync = jest.fn(async (cb: () => Promise<void>) => { await cb(); });
jest.mock('./db', () => ({
  getDb: () => ({ runAsync: mockRunAsync, withTransactionAsync: mockWithTransactionAsync }),
}));

const mockSyncPendingEvents = jest.fn().mockResolvedValue(undefined);
const mockSyncPendingMeals = jest.fn().mockResolvedValue(undefined);
jest.mock('./sync', () => ({
  syncPendingEvents: (...a: unknown[]) => mockSyncPendingEvents(...a),
  syncPendingMeals: (...a: unknown[]) => mockSyncPendingMeals(...a),
}));

const mockTriggerSignalRegenDebounced = jest.fn();
jest.mock('./signal', () => ({
  triggerSignalRegenDebounced: (...a: unknown[]) => mockTriggerSignalRegenDebounced(...a),
}));

let mockIdCounter = 0;
jest.mock('./utils', () => ({
  uuid: () => `id-${++mockIdCounter}`,
}));

import { insertMeal } from './meals';

// Lets the fire-and-forget syncPendingEvents().then(syncPendingMeals) chain
// settle so we can assert the second call landed. A bare Promise.resolve() is
// insufficient: the .then(syncPendingMeals) callback is itself a microtask
// queued after syncPendingEvents()'s promise resolves, so we need a macrotask
// (setTimeout 0) to drain past it.
const flush = () => new Promise((r) => setTimeout(r, 0));

const PARAMS = {
  petId: 'pet-1',
  foodId: 'food-1',
  occurredAt: new Date('2026-06-07T08:00:00.000Z'),
  occurredAtSource: 'now' as const,
};

beforeEach(() => {
  // mockReset (not mockClear) so a `…Once` queued by one test cannot leak into
  // the next; the base resolved value is re-established right after.
  mockRunAsync.mockReset();
  mockRunAsync.mockResolvedValue(undefined);
  mockWithTransactionAsync.mockClear();
  mockSyncPendingEvents.mockClear();
  mockSyncPendingMeals.mockClear();
  mockTriggerSignalRegenDebounced.mockClear();
  mockIdCounter = 0;
});

describe('insertMeal', () => {
  it('fires every side-effect: event+meal+cache write, sync push, signal regen', async () => {
    await insertMeal(PARAMS);
    await flush();

    const sql = mockRunAsync.mock.calls.map((c) => c[0] as string);
    expect(sql.some((s) => /INSERT INTO events/.test(s))).toBe(true);
    expect(sql.some((s) => /INSERT INTO meals/.test(s))).toBe(true);
    expect(sql.some((s) => /UPDATE food_items_cache SET last_used_at/.test(s))).toBe(true);

    // The §2-freshness side-effect that drifted in B-059 — the whole point.
    expect(mockTriggerSignalRegenDebounced).toHaveBeenCalledWith('pet-1');

    // Push order: events before meals (meals FK → events.id).
    expect(mockSyncPendingEvents).toHaveBeenCalledTimes(1);
    expect(mockSyncPendingMeals).toHaveBeenCalledTimes(1);
  });

  it('writes the event as a witnessed meal with the given occurrence time + source', async () => {
    await insertMeal(PARAMS);

    const eventCall = mockRunAsync.mock.calls.find((c) => /INSERT INTO events/.test(c[0] as string))!;
    const sql = eventCall[0] as string;
    const args = eventCall[1] as unknown[];
    // Meals are always witnessed (no found-path window).
    expect(sql).toMatch(/'witnessed'/);
    // Placeholders === params — guards against the B-057 INSERT-drift class.
    expect((sql.match(/\?/g) ?? []).length).toBe(args.length);
    expect(args).toEqual(['id-1', 'pet-1', '2026-06-07T08:00:00.000Z', 'now', expect.any(String), expect.any(String)]);
  });

  it('returns the ids + timestamps the caller needs for prependEvent/toast', async () => {
    const res = await insertMeal(PARAMS);
    expect(res.eventId).toBe('id-1');
    expect(res.mealId).toBe('id-2');
    expect(res.occurredAtIso).toBe('2026-06-07T08:00:00.000Z');
    expect(typeof res.now).toBe('string');
  });

  // B-126. A meal is an event + its 1:1 child; a half-write would sync an
  // orphaned event_type='meal' row with no food, quantity or intake rating — a
  // meal the record asserts happened but can say nothing about. These two tests
  // pin the atomicity: what is inside the transaction, and that a failure is not
  // swallowed into a fire-and-forget push of a meal that does not exist.
  it('writes the event + meal rows inside ONE transaction, cache touch outside', async () => {
    const inTxn: string[] = [];
    mockWithTransactionAsync.mockImplementationOnce(async (cb: () => Promise<void>) => {
      const before = mockRunAsync.mock.calls.length;
      await cb();
      inTxn.push(...mockRunAsync.mock.calls.slice(before).map((c) => c[0] as string));
    });

    await insertMeal(PARAMS);

    expect(mockWithTransactionAsync).toHaveBeenCalledTimes(1);
    expect(inTxn.some((s) => /INSERT INTO events/.test(s))).toBe(true);
    expect(inTxn.some((s) => /INSERT INTO meals/.test(s))).toBe(true);
    // The local-only recency stamp stays OUT: rolling back a correctly-written
    // meal because a cosmetic picker-ordering touch failed trades a real loss
    // for a cosmetic one.
    expect(inTxn.some((s) => /food_items_cache/.test(s))).toBe(false);
  });

  it('survives a failed recency touch: the committed meal still pushes and regens', async () => {
    // Event + meal INSERTs succeed (the transaction commits), then the cosmetic
    // cache touch throws. The meal exists durably, so the follow-through must
    // still run — and the caller must not see a failure for a meal that landed.
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockRunAsync
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('cache table missing'));

    const res = await insertMeal(PARAMS);
    await flush();

    expect(res.mealId).toBe('id-2');
    expect(mockSyncPendingEvents).toHaveBeenCalledTimes(1);
    expect(mockSyncPendingMeals).toHaveBeenCalledTimes(1);
    expect(mockTriggerSignalRegenDebounced).toHaveBeenCalledWith('pet-1');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('propagates a failed child INSERT and pushes nothing (rolled-back meal)', async () => {
    // Event INSERT succeeds, meal INSERT throws — the exact half-write shape.
    mockRunAsync.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('disk full'));

    await expect(insertMeal(PARAMS)).rejects.toThrow('disk full');
    await flush();

    // The real withTransactionAsync rolls the event back on the throw; what this
    // helper must not do is fire the sync push or the Signal regen for a meal
    // that no longer exists locally.
    expect(mockSyncPendingEvents).not.toHaveBeenCalled();
    expect(mockSyncPendingMeals).not.toHaveBeenCalled();
    expect(mockTriggerSignalRegenDebounced).not.toHaveBeenCalled();
  });

  it('meal INSERT placeholder count matches its param count (B-057 drift guard)', async () => {
    await insertMeal(PARAMS);
    const mealCall = mockRunAsync.mock.calls.find((c) => /INSERT INTO meals/.test(c[0] as string))!;
    const sql = mealCall[0] as string;
    const args = mealCall[1] as unknown[];
    expect((sql.match(/\?/g) ?? []).length).toBe(args.length);
  });
});
