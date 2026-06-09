// B-040 R1 (PR 2) — local-write + sync-push contract for the free-feeding
// standing fact. The behaviours that matter: a toggle ON writes a synced=0 row
// and kicks a push; a toggle ON when one's already active is a no-op (never a
// duplicate standing fact); a toggle OFF ends the row by active_until (never a
// hard delete) and pushes. Plus a B-057-class placeholder/param drift guard on
// the INSERT.
//
// jest hoists jest.mock() above the imports, so any variable a factory closes
// over must be `mock`-prefixed.

const mockRunAsync = jest.fn().mockResolvedValue(undefined);
const mockGetFirstAsync = jest.fn().mockResolvedValue(null); // null = not active
jest.mock('./db', () => ({
  getDb: () => ({ runAsync: mockRunAsync, getFirstAsync: mockGetFirstAsync }),
}));

const mockSyncPendingFeedingArrangements = jest.fn().mockResolvedValue(undefined);
jest.mock('./sync', () => ({
  syncPendingFeedingArrangements: (...a: unknown[]) => mockSyncPendingFeedingArrangements(...a),
}));

jest.mock('./utils', () => ({ uuid: () => 'arr-1' }));

import { startFreeChoice, endFreeChoice, localDateString } from './feedingArrangements';

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  mockRunAsync.mockClear();
  mockGetFirstAsync.mockClear();
  mockGetFirstAsync.mockResolvedValue(null);
  mockSyncPendingFeedingArrangements.mockClear();
});

describe('startFreeChoice', () => {
  it('inserts a synced=0 free_choice row and pushes when none is active', async () => {
    await startFreeChoice('pet-1', 'food-1');
    await flush();

    const insert = mockRunAsync.mock.calls.find((c) => /INSERT INTO feeding_arrangements/.test(c[0] as string));
    expect(insert).toBeDefined();
    const sql = insert![0] as string;
    const args = insert![1] as unknown[];
    // free_choice, active_until NULL (currently active), is_shared 0, synced 0.
    expect(sql).toMatch(/'free_choice'/);
    expect(args).toEqual(['arr-1', 'pet-1', 'food-1', localDateString(), expect.any(String), expect.any(String)]);
    // Placeholders === bound params (B-057 drift guard).
    expect((sql.match(/\?/g) ?? []).length).toBe(args.length);
    // Fire-and-forget push.
    expect(mockSyncPendingFeedingArrangements).toHaveBeenCalledTimes(1);
  });

  it('is idempotent — no insert when an arrangement is already active', async () => {
    mockGetFirstAsync.mockResolvedValue({ id: 'existing' }); // active row exists
    await startFreeChoice('pet-1', 'food-1');

    const insert = mockRunAsync.mock.calls.find((c) => /INSERT INTO feeding_arrangements/.test(c[0] as string));
    expect(insert).toBeUndefined();
    expect(mockSyncPendingFeedingArrangements).not.toHaveBeenCalled();
  });
});

describe('endFreeChoice', () => {
  it('ends the active row via active_until + synced=0 (never a DELETE) and pushes', async () => {
    await endFreeChoice('pet-1', 'food-1');
    await flush();

    const update = mockRunAsync.mock.calls.find((c) => /UPDATE feeding_arrangements/.test(c[0] as string));
    expect(update).toBeDefined();
    const sql = update![0] as string;
    expect(sql).toMatch(/active_until = \?/);
    expect(sql).toMatch(/synced = 0/);
    expect(sql).toMatch(/active_until IS NULL/); // only ends the currently-active row
    // No DELETE anywhere — soft lifecycle only.
    expect(mockRunAsync.mock.calls.some((c) => /DELETE/.test(c[0] as string))).toBe(false);
    expect(mockSyncPendingFeedingArrangements).toHaveBeenCalledTimes(1);
  });
});

describe('localDateString', () => {
  it('formats a date as a YYYY-MM-DD calendar day', () => {
    expect(localDateString(new Date(2026, 5, 2))).toBe('2026-06-02');
  });
});
