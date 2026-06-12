// B-040 R1 (PR 2) — local-write + sync-push contract for the free-feeding
// standing fact. The behaviours that matter: a toggle ON writes a synced=0 row
// and kicks a push; a toggle ON when one's already active is a no-op (never a
// duplicate standing fact); a toggle OFF ends the row by active_until (never a
// hard delete) and pushes. Plus a B-057-class placeholder/param drift guard on
// the INSERT.
//
// jest hoists jest.mock() above the imports, so any variable a factory closes
// over must be `mock`-prefixed.

const mockRunAsync = jest.fn().mockResolvedValue({ changes: 1, lastInsertRowId: 0 });
const mockGetFirstAsync = jest.fn().mockResolvedValue(null); // null = not active
const mockGetAllAsync = jest.fn().mockResolvedValue([]);
jest.mock('./db', () => ({
  getDb: () => ({
    runAsync: mockRunAsync, getFirstAsync: mockGetFirstAsync, getAllAsync: mockGetAllAsync,
  }),
}));

const mockSyncPendingFeedingArrangements = jest.fn().mockResolvedValue(undefined);
jest.mock('./sync', () => ({
  syncPendingFeedingArrangements: (...a: unknown[]) => mockSyncPendingFeedingArrangements(...a),
}));

jest.mock('./utils', () => ({ uuid: () => 'arr-1' }));

import {
  startFreeChoice, endFreeChoice, localDateString,
  deriveBoundaryMarkers, confirmArrangementFresh, getActiveArrangementMeta,
  getActiveArrangementsForPets, getArrangementMetasForFood,
  groupArrangementsByFood, petNameList, arrangementPetsLine, sharedBowlHint,
  confirmedLabel, formatCalendarDate, isArrangementStale, FRESHNESS_STALE_DAYS,
  BoundaryArrangementRow, HouseholdArrangementView,
} from './feedingArrangements';

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  mockRunAsync.mockClear();
  mockRunAsync.mockResolvedValue({ changes: 1, lastInsertRowId: 0 });
  mockGetFirstAsync.mockClear();
  mockGetFirstAsync.mockResolvedValue(null);
  mockGetAllAsync.mockClear();
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

  it('does not push when no row matched (arrangement ended elsewhere)', async () => {
    mockRunAsync.mockResolvedValue({ changes: 0, lastInsertRowId: 0 });
    await confirmArrangementFresh('pet-1', 'food-1');
    await flush();
    expect(mockSyncPendingFeedingArrangements).not.toHaveBeenCalled();
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

// ── Multi-pet household view (spec §3.4) ─────────────────────────────────────

describe('getActiveArrangementsForPets / getArrangementMetasForFood', () => {
  it('returns [] without touching the db for an empty pet list', async () => {
    expect(await getActiveArrangementsForPets([])).toEqual([]);
    expect(await getArrangementMetasForFood('food-1', [])).toEqual([]);
    expect(mockGetAllAsync).not.toHaveBeenCalled();
  });

  it('binds one placeholder per pet id (B-057 drift guard)', async () => {
    await getActiveArrangementsForPets(['pet-1', 'pet-2']);
    let [sql, args] = mockGetAllAsync.mock.calls[0] as [string, unknown[]];
    expect((sql.match(/\?/g) ?? []).length).toBe(args.length);
    expect(args).toEqual(['pet-1', 'pet-2']);
    // Only currently-active, non-deleted free_choice rows surface.
    expect(sql).toMatch(/active_until IS NULL/);
    expect(sql).toMatch(/deleted_at IS NULL/);

    await getArrangementMetasForFood('food-1', ['pet-1', 'pet-2']);
    [sql, args] = mockGetAllAsync.mock.calls[1] as [string, unknown[]];
    expect((sql.match(/\?/g) ?? []).length).toBe(args.length);
    expect(args).toEqual(['food-1', 'pet-1', 'pet-2']);
    expect(sql).toMatch(/active_until IS NULL/);
    expect(sql).toMatch(/deleted_at IS NULL/);
  });
});

describe('groupArrangementsByFood', () => {
  const pets = [
    { id: 'pet-active', name: 'Pixel' },
    { id: 'pet-other', name: 'Juniper' },
  ];
  const row = (over: Partial<HouseholdArrangementView>): HouseholdArrangementView => ({
    id: 'arr-x',
    pet_id: 'pet-active',
    food_item_id: 'food-1',
    active_from: '2026-06-02',
    updated_at: '2026-06-02T10:00:00.000Z',
    brand: "Hill's",
    product_name: 'w/d',
    format: 'dry_kibble',
    ...over,
  });

  it('groups both pets on the same food into one entry, pets in display order', () => {
    const groups = groupArrangementsByFood(
      [
        // Rows arrive in query order (active_from desc) — Juniper's first here,
        // but the perPet order must follow the pets list (active pet first).
        row({ id: 'a2', pet_id: 'pet-other', active_from: '2026-06-05' }),
        row({ id: 'a1', pet_id: 'pet-active', active_from: '2026-06-02' }),
      ],
      pets,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].food_item_id).toBe('food-1');
    expect(groups[0].perPet.map((p) => p.petName)).toEqual(['Pixel', 'Juniper']);
  });

  it('keeps different foods as separate entries in row order', () => {
    const groups = groupArrangementsByFood(
      [
        row({ id: 'a1', food_item_id: 'food-1' }),
        row({ id: 'a2', food_item_id: 'food-2', pet_id: 'pet-other', brand: 'Purina' }),
      ],
      pets,
    );
    expect(groups.map((g) => g.food_item_id)).toEqual(['food-1', 'food-2']);
    expect(groups[1].perPet.map((p) => p.petName)).toEqual(['Juniper']);
  });

  it('drops rows for a pet not in the household list (e.g. just archived)', () => {
    const groups = groupArrangementsByFood(
      [row({ id: 'a1', pet_id: 'pet-archived' })],
      pets,
    );
    expect(groups).toEqual([]);
  });
});

describe('petNameList', () => {
  it('joins names in plain English', () => {
    expect(petNameList([], 'and')).toBe('');
    expect(petNameList(['Pixel'], 'or')).toBe('Pixel');
    expect(petNameList(['Pixel', 'Juniper'], 'and')).toBe('Pixel and Juniper');
    expect(petNameList(['Pixel', 'Juniper'], 'or')).toBe('Pixel or Juniper');
    expect(petNameList(['Pixel', 'Juniper', 'Mochi'], 'and')).toBe('Pixel, Juniper, and Mochi');
  });
});

describe('arrangementPetsLine', () => {
  it('labels each pet with its since-date, degrading to the bare name', () => {
    expect(
      arrangementPetsLine([
        { petName: 'Pixel', active_from: '2026-06-02' },
        { petName: 'Juniper', active_from: null },
      ]),
    ).toBe('Pixel since Jun 2 · Juniper');
  });
});

describe('sharedBowlHint', () => {
  it('is null below two pets (a single bowl is not shared)', () => {
    expect(sharedBowlHint([])).toBeNull();
    expect(sharedBowlHint([{ name: 'Pixel', species: 'cat' }])).toBeNull();
  });

  it('reads "both cats" for two same-species pets (mock B2 verbatim)', () => {
    expect(
      sharedBowlHint([
        { name: 'Pixel', species: 'cat' },
        { name: 'Juniper', species: 'cat' },
      ]),
    ).toBe("Down for both cats — quiet days don't mean nobody ate.");
  });

  it('falls back to names for mixed or unknown species, and for 3+', () => {
    expect(
      sharedBowlHint([
        { name: 'Pixel', species: 'cat' },
        { name: 'Rex', species: 'dog' },
      ]),
    ).toBe("Down for Pixel and Rex — quiet days don't mean nobody ate.");
    expect(
      sharedBowlHint([
        { name: 'Pixel', species: 'other' },
        { name: 'Juniper', species: 'other' },
      ]),
    ).toBe("Down for Pixel and Juniper — quiet days don't mean nobody ate.");
    expect(
      sharedBowlHint([
        { name: 'Pixel', species: 'cat' },
        { name: 'Juniper', species: 'cat' },
        { name: 'Mochi', species: 'cat' },
      ]),
    ).toBe("Down for Pixel, Juniper, and Mochi — quiet days don't mean nobody ate.");
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

describe('isArrangementStale', () => {
  const now = new Date('2026-06-20T12:00:00.000Z');
  it('is false for a recently-confirmed arrangement (within the window)', () => {
    expect(isArrangementStale('2026-06-20T11:00:00.000Z', now)).toBe(false); // today
    expect(isArrangementStale('2026-06-10T12:00:00.000Z', now)).toBe(false); // 10d < 14d
  });
  it('is true once past the stale window', () => {
    expect(isArrangementStale('2026-06-06T12:00:00.000Z', now)).toBe(true);  // exactly 14d
    expect(isArrangementStale('2026-05-01T12:00:00.000Z', now)).toBe(true);
  });
  it('never nags on a malformed timestamp', () => {
    expect(isArrangementStale('garbage', now)).toBe(false);
  });
  it('uses a sane default window', () => {
    expect(FRESHNESS_STALE_DAYS).toBe(14);
  });
});
