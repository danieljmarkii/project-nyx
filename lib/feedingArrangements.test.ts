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

import {
  startFreeChoice, endFreeChoice, localDateString,
  deriveBoundaryMarkers, confirmArrangementFresh, getActiveArrangementMeta,
  confirmedLabel, formatCalendarDate, BoundaryArrangementRow,
} from './feedingArrangements';

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

describe('confirmArrangementFresh', () => {
  it('bumps updated_at + synced=0 on the active row (never a DELETE) and pushes', async () => {
    await confirmArrangementFresh('pet-1', 'food-1');
    await flush();

    const update = mockRunAsync.mock.calls.find((c) => /UPDATE feeding_arrangements/.test(c[0] as string));
    expect(update).toBeDefined();
    const sql = update![0] as string;
    expect(sql).toMatch(/updated_at = \?/);
    expect(sql).toMatch(/synced = 0/);
    expect(sql).toMatch(/active_until IS NULL/);   // only the currently-active row
    expect(sql).toMatch(/deleted_at IS NULL/);
    // Re-confirming is not a new lifecycle row and never a hard delete.
    expect(sql).not.toMatch(/INSERT/);
    expect(mockRunAsync.mock.calls.some((c) => /DELETE/.test(c[0] as string))).toBe(false);
    expect(mockSyncPendingFeedingArrangements).toHaveBeenCalledTimes(1);
  });
});

describe('getActiveArrangementMeta', () => {
  it('returns the active row meta when one exists', async () => {
    mockGetFirstAsync.mockResolvedValue({ id: 'a1', active_from: '2026-06-02', updated_at: '2026-06-02T10:00:00.000Z' });
    const meta = await getActiveArrangementMeta('pet-1', 'food-1');
    expect(meta).toEqual({ id: 'a1', active_from: '2026-06-02', updated_at: '2026-06-02T10:00:00.000Z' });
  });

  it('returns null when no active arrangement', async () => {
    mockGetFirstAsync.mockResolvedValue(null);
    expect(await getActiveArrangementMeta('pet-1', 'food-1')).toBeNull();
  });
});

describe('deriveBoundaryMarkers', () => {
  const row = (over: Partial<BoundaryArrangementRow> & Pick<BoundaryArrangementRow, 'id'>): BoundaryArrangementRow => ({
    food_item_id: 'food-' + over.id,
    active_from: null,
    active_until: null,
    brand: 'Hill\'s',
    product_name: 'w/d',
    ...over,
  });

  it('emits a started marker for active_from and a stopped marker for active_until', () => {
    const m = deriveBoundaryMarkers([
      row({ id: 'a', active_from: '2026-06-02' }),
      row({ id: 'b', active_from: '2026-06-01', active_until: '2026-06-05' }),
    ]);
    const kinds = m.map((x) => `${x.kind}:${x.date}`);
    expect(kinds).toContain('started:2026-06-02');
    expect(kinds).toContain('started:2026-06-01');
    expect(kinds).toContain('stopped:2026-06-05');
    expect(m.find((x) => x.kind === 'started')!.foodLabel).toBe("Hill's w/d");
  });

  it('collapses a same-day stop of one food + start of another into a switch', () => {
    const m = deriveBoundaryMarkers([
      row({ id: 'a', food_item_id: 'food-a', brand: 'Old', product_name: 'kibble', active_until: '2026-06-05' }),
      row({ id: 'b', food_item_id: 'food-b', brand: 'New', product_name: 'kibble', active_from: '2026-06-05' }),
    ]);
    expect(m).toHaveLength(1);
    expect(m[0].kind).toBe('switched');
    expect(m[0].foodLabel).toBe('Old kibble');     // away from
    expect(m[0].toFoodLabel).toBe('New kibble');    // to
  });

  it('does NOT collapse a same-food stop+restart on the same day', () => {
    const m = deriveBoundaryMarkers([
      row({ id: 'a', food_item_id: 'food-x', active_until: '2026-06-05' }),
      row({ id: 'b', food_item_id: 'food-x', active_from: '2026-06-05' }),
    ]);
    expect(m).toHaveLength(2);
    expect(m.map((x) => x.kind).sort()).toEqual(['started', 'stopped']);
  });

  it('skips malformed/absent dates and orders newest first', () => {
    const m = deriveBoundaryMarkers([
      row({ id: 'a', active_from: 'not-a-date' }),
      row({ id: 'b', active_from: '2026-06-01' }),
      row({ id: 'c', active_from: '2026-06-10' }),
    ]);
    expect(m.map((x) => x.date)).toEqual(['2026-06-10', '2026-06-01']);
  });
});

describe('formatCalendarDate / confirmedLabel', () => {
  it('formats a bare calendar day without timezone drift', () => {
    expect(formatCalendarDate('2026-06-02')).toBe('Jun 2');
    expect(formatCalendarDate(null)).toBeNull();
    expect(formatCalendarDate('garbage')).toBeNull();
  });

  it('reads "today" for a same-day confirmation, else the date', () => {
    expect(confirmedLabel(new Date().toISOString())).toBe('today');
    expect(confirmedLabel('2020-01-15T08:00:00.000Z')).toBe('Jan 15');
  });
});
