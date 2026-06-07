// B-059 regression guard. The bug this helper exists to kill was a *missing*
// side-effect (the AI-Signal regen) on two of the three meal entry points. So
// the test that matters most asserts insertMeal fires ALL of the side-effects —
// the durable writes, the sync push, and triggerSignalRegenDebounced — for a
// single call. If a future edit drops one, this fails.
//
// jest hoists jest.mock() above the imports, so any variable a factory closes
// over must be `mock`-prefixed (jest's escape hatch for the no-out-of-scope rule).

const mockRunAsync = jest.fn().mockResolvedValue(undefined);
jest.mock('./db', () => ({
  getDb: () => ({ runAsync: mockRunAsync }),
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
  mockRunAsync.mockClear();
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

  it('meal INSERT placeholder count matches its param count (B-057 drift guard)', async () => {
    await insertMeal(PARAMS);
    const mealCall = mockRunAsync.mock.calls.find((c) => /INSERT INTO meals/.test(c[0] as string))!;
    const sql = mealCall[0] as string;
    const args = mealCall[1] as unknown[];
    expect((sql.match(/\?/g) ?? []).length).toBe(args.length);
  });
});
