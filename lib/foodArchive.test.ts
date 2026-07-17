// Tests for archiveFood / restoreFood (B-005 PR 2).
//
// The functions coordinate a Supabase update (server archived_at flip) with a
// local SQLite cache mirror. Both are mocked: we assert the QUERY SHAPE (the
// dedup-group collection, the .select() RLS guard, the exact cache SQL + params,
// and the stamp-scoped reversal) rather than a live backend. supabase-js builders
// are thenable and chainable, so the mock returns a per-`from()` builder whose
// terminal await resolves the next queued result.

const mockRunAsync = jest.fn();

// A chainable, thenable builder. Every filter/verb returns the same builder;
// awaiting it (via `then`) resolves the next queued result. One builder per
// from() call, so multiple queued results are consumed in call order.
let resultQueue: Array<{ data: unknown; error: unknown }> = [];
const calls: { from: string[]; update: unknown[]; select: string[] } = { from: [], update: [], select: [] };

function makeBuilder() {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.select = jest.fn((...a: unknown[]) => { calls.select.push(a[0] as string); return builder; });
  builder.update = jest.fn((...a: unknown[]) => { calls.update.push(a[0]); return builder; });
  builder.eq = jest.fn(chain);
  builder.in = jest.fn(chain);
  builder.is = jest.fn(chain);
  builder.then = (resolve: (v: unknown) => unknown) =>
    resolve(resultQueue.shift() ?? { data: [], error: null });
  return builder;
}

const mockFrom = jest.fn((table: string) => { calls.from.push(table); return makeBuilder(); });

jest.mock('./supabase', () => ({
  supabase: { from: (...a: unknown[]) => mockFrom(...(a as [string])) },
}));
jest.mock('./db', () => ({
  getDb: () => ({ runAsync: (...a: unknown[]) => mockRunAsync(...a) }),
}));

import { archiveFood, restoreFood } from './foodArchive';

const ROW = { id: 'f1', brand: 'Blue Buffalo', product_name: 'Chicken Dinner', format: 'wet_canned' };

beforeEach(() => {
  resultQueue = [];
  calls.from = []; calls.update = []; calls.select = [];
  mockFrom.mockClear();
  mockRunAsync.mockReset();
  mockRunAsync.mockResolvedValue(undefined);
});

describe('archiveFood', () => {
  it('archives the whole dedup group (representative + duplicate captures) and mirrors to cache', async () => {
    // 1st await: dup-group collection returns a sibling capture f2.
    // 2nd await: the update .select('id') returns both flipped ids.
    resultQueue = [
      { data: [{ id: 'f2' }], error: null },
      { data: [{ id: 'f1' }, { id: 'f2' }], error: null },
    ];

    const result = await archiveFood(ROW);

    // Group union includes the representative row.id + the server duplicate.
    expect(result.foodIds.sort()).toEqual(['f1', 'f2']);
    expect(typeof result.archivedAt).toBe('string');
    expect(result.descriptor).toEqual(ROW);

    // Server: two food_items queries (collect, then update-with-stamp).
    expect(calls.from).toEqual(['food_items', 'food_items']);
    expect(calls.update[0]).toEqual({ archived_at: result.archivedAt });

    // Cache: one UPDATE stamping archived_at by the group descriptor.
    expect(mockRunAsync).toHaveBeenCalledTimes(1);
    const [sql, params] = mockRunAsync.mock.calls[0];
    expect(sql).toMatch(/UPDATE food_items_cache/);
    expect(sql).toMatch(/SET archived_at = \?/);
    expect(params).toEqual([result.archivedAt, ROW.brand, ROW.product_name, ROW.format]);
  });

  it('archives a lone food (no duplicate captures)', async () => {
    resultQueue = [
      { data: [], error: null },            // no dups
      { data: [{ id: 'f1' }], error: null }, // update flipped the one row
    ];
    const result = await archiveFood(ROW);
    expect(result.foodIds).toEqual(['f1']);
    expect(mockRunAsync).toHaveBeenCalledTimes(1);
  });

  it('throws and does NOT touch the cache when the dup-collection query errors', async () => {
    resultQueue = [{ data: null, error: { message: 'boom' } }];
    await expect(archiveFood(ROW)).rejects.toEqual({ message: 'boom' });
    expect(mockRunAsync).not.toHaveBeenCalled();
  });

  it('throws on a silent RLS block (update returns 0 rows) — never a no-op that looks like success', async () => {
    resultQueue = [
      { data: [], error: null },   // no dups
      { data: [], error: null },   // update affected nothing → RLS block
    ];
    await expect(archiveFood(ROW)).rejects.toThrow(/permission denied/i);
    // Cache is not swept when the server rejected the flip.
    expect(mockRunAsync).not.toHaveBeenCalled();
  });
});

describe('restoreFood', () => {
  it('clears archived_at on the exact stamped rows (server + cache)', async () => {
    resultQueue = [{ data: [{ id: 'f1' }, { id: 'f2' }], error: null }];
    const stamp = '2026-07-17T10:00:00.000Z';

    await restoreFood({ foodIds: ['f1', 'f2'], archivedAt: stamp, descriptor: ROW });

    expect(calls.from).toEqual(['food_items']);
    expect(calls.update[0]).toEqual({ archived_at: null });

    // Cache revert is scoped to rows still carrying our stamp (so a re-archive
    // with a newer stamp is never un-done by a stale Undo).
    expect(mockRunAsync).toHaveBeenCalledTimes(1);
    const [sql, params] = mockRunAsync.mock.calls[0];
    expect(sql).toMatch(/SET archived_at = NULL/);
    expect(sql).toMatch(/AND archived_at = \?/);
    expect(params).toEqual([ROW.brand, ROW.product_name, ROW.format, stamp]);
  });

  it('throws and does NOT touch the cache when the server revert errors', async () => {
    resultQueue = [{ data: null, error: { message: 'nope' } }];
    await expect(
      restoreFood({ foodIds: ['f1'], archivedAt: 's', descriptor: ROW }),
    ).rejects.toEqual({ message: 'nope' });
    expect(mockRunAsync).not.toHaveBeenCalled();
  });

  it('throws on a silent no-op (revert affected 0 rows) so Undo surfaces a failure, not a false success', async () => {
    // The guard that makes an Undo that didn't take reach armUndo's catch instead
    // of resolving quietly and leaving the food archived.
    resultQueue = [{ data: [], error: null }];
    await expect(
      restoreFood({ foodIds: ['f1'], archivedAt: 's', descriptor: ROW }),
    ).rejects.toThrow(/permission denied/i);
    expect(mockRunAsync).not.toHaveBeenCalled();
  });
});
