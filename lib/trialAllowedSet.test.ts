// B-616 PR 1 — the allowed-set read layer, and the one property that makes it
// safe to render (spec §6 AC 1–3, 5).
//
// What is worth pinning here, in rough order of what would hurt if it broke:
//   • THE CONVERGENCE PROPERTY. The library may never disagree with the
//     classifier about what is on the list — a food marked "Trial diet" on the
//     Foods tab and recorded as an off-diet exposure on the vet report is the
//     failure this whole track has to avoid. Swept over a cross-product of foods
//     and days, with a deliberately naive re-derivation checked to FAIL the same
//     sweep so the property cannot pass vacuously;
//   • membership is DATE-GATED — a food added today is not on the list
//     yesterday, which is what stops a mid-trial add rewriting history;
//   • the KEY arm — a re-photographed bag (new id, same brand+product) still
//     reads on-list, or the prescribed diet shows unmarked in the owner's own
//     library (§5.4);
//   • `isTrialRunning`, never raw `status` — a stale active trial renders no
//     chrome (B-422, FR-4);
//   • an unhydrated set is `unknown`, never a ready-and-empty one: the second
//     un-marks the prescribed diet and prints "0 foods on the trial list".

const mockGetFirstAsync = jest.fn();
const mockGetAllAsync = jest.fn();
jest.mock('./db', () => ({
  getDb: () => ({ getFirstAsync: mockGetFirstAsync, getAllAsync: mockGetAllAsync }),
}));

import {
  classifyFeeding,
  dayIndexOf,
  isInTrialWindow,
  trialFoodKey,
  type TrialFeeding,
} from './dietTrial';
import {
  isOnTrialList,
  loadTrialAllowedSet,
  trialListFoodsOn,
  trialListMembership,
  type TrialAllowedSet,
  type TrialListFood,
} from './trialAllowedSet';

const NOW = Date.parse('2026-07-20T12:00:00Z');

/** Midday UTC, so the instant lands on the same local day in every zone jest
 *  might run in — and BOTH sides of the property are handed the same instant
 *  rather than the same string, so the comparison never turns into a test of the
 *  runner's timezone. */
const at = (dayKey: string) => Date.parse(`${dayKey}T12:00:00Z`);

interface AllowedRowFixture {
  food_item_id: string;
  role: string;
  food_label: string;
  allowed_from: string;
  allowed_until?: string | null;
  brand?: string | null;
  product_name?: string | null;
  primary_protein?: string | null;
  proteins?: string | null;
}

function trialRow(over: Record<string, unknown> = {}) {
  return {
    id: 'trial-1',
    started_at: '2026-07-01',
    ended_at: null,
    target_duration_days: 56,
    status: 'active',
    ...over,
  };
}

function allowedRow(r: AllowedRowFixture) {
  return {
    allowed_until: null,
    brand: null,
    product_name: null,
    primary_protein: null,
    proteins: null,
    ...r,
  };
}

const ROWS = [
  // The prescribed diet.
  allowedRow({
    food_item_id: 'food-dry',
    role: 'primary_diet',
    food_label: 'Zignature Kangaroo Formula',
    allowed_from: '2026-07-01',
    brand: 'Zignature',
    product_name: 'Kangaroo Formula',
    primary_protein: 'kangaroo',
    proteins: 'kangaroo',
  }),
  // A vet-sanctioned extra added mid-trial (D5) — membership opens on day 10.
  allowedRow({
    food_item_id: 'food-jerky',
    role: 'permitted_treat',
    food_label: 'Real Meat Kangaroo Jerky',
    allowed_from: '2026-07-10',
    brand: 'Real Meat',
    product_name: 'Kangaroo Jerky',
    primary_protein: 'kangaroo',
    proteins: 'kangaroo',
  }),
  // An allowed food whose `food_items_cache` row has not hydrated: no brand, no
  // product, so the id is the only identity available.
  allowedRow({
    food_item_id: 'food-unhydrated',
    role: 'permitted_other',
    food_label: 'Whatever the vet okayed',
    allowed_from: '2026-07-01',
  }),
  // Dated removal (§5 edge 2 — no UI writes this in v1, reads must honour it).
  allowedRow({
    food_item_id: 'food-removed',
    role: 'permitted_other',
    food_label: 'Hills Chicken Topper',
    allowed_from: '2026-07-01',
    allowed_until: '2026-07-15',
    brand: 'Hills',
    product_name: 'Chicken Topper',
  }),
  // A role this build cannot read — B-556's single narrower must take it to
  // `permitted_other`, never to `primary_diet`.
  allowedRow({
    food_item_id: 'food-chew',
    role: 'permitted_chew',
    food_label: 'Greenies Dental Chew',
    allowed_from: '2026-07-01',
    brand: 'Greenies',
    product_name: 'Dental Chew',
  }),
];

async function loadReady(
  rows = ROWS,
  trial = trialRow(),
  nowMs = NOW,
): Promise<TrialAllowedSet> {
  mockGetFirstAsync.mockResolvedValue(trial);
  mockGetAllAsync.mockResolvedValue(rows);
  return loadTrialAllowedSet('pet-1', nowMs);
}

beforeEach(() => {
  mockGetFirstAsync.mockReset();
  mockGetAllAsync.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('loadTrialAllowedSet', () => {
  it('resolves the running trial and maps its dated rows', async () => {
    const ready = await loadReady();
    expect(ready.status).toBe('ready');
    if (ready.status !== 'ready') return;

    expect(ready.trial).toEqual({
      id: 'trial-1',
      startedAt: '2026-07-01',
      targetDurationDays: 56,
      endedAt: null,
    });
    expect(ready.foods).toHaveLength(ROWS.length);
    expect(ready.foods[0]).toMatchObject({
      foodItemId: 'food-dry',
      foodKey: trialFoodKey('Zignature', 'Kangaroo Formula'),
      role: 'primary_diet',
      allowedFrom: '2026-07-01',
    });
    // The unhydrated row keeps a NULL key — not the bare separator, which two
    // unnamed rows would collide on.
    expect(ready.foods[2].foodKey).toBeNull();
    // B-556: an unreadable role narrows to `permitted_other`. Never
    // `primary_diet`, which would let it widen the sanctioned comparator.
    expect(ready.foods[4].role).toBe('permitted_other');
    expect(mockGetFirstAsync).toHaveBeenCalledWith(expect.any(String), ['pet-1']);
    expect(mockGetAllAsync).toHaveBeenCalledWith(expect.any(String), ['trial-1']);
  });

  it('is `no_trial` when the pet has no active row', async () => {
    mockGetFirstAsync.mockResolvedValue(null);
    await expect(loadTrialAllowedSet('pet-1', NOW)).resolves.toEqual({ status: 'no_trial' });
    expect(mockGetAllAsync).not.toHaveBeenCalled();
  });

  it('is `no_trial` for a STALE active trial — isTrialRunning, never raw status', async () => {
    // Started in January with a 28-day target: past its target end plus the
    // 56-day overrun grace, and nothing auto-completes a trial, so `status` is
    // still 'active'. FR-4: no strip, no chips.
    const set = await loadReady(ROWS, trialRow({ started_at: '2026-01-01', target_duration_days: 28 }));
    expect(set).toEqual({ status: 'no_trial' });
  });

  it('honours an `ended_at` written on a still-active row', async () => {
    const set = await loadReady(ROWS, trialRow({ ended_at: '2026-07-10' }));
    expect(set).toEqual({ status: 'no_trial' });
  });

  it('is `unknown` — not ready-and-empty — when the allowed set has not hydrated', async () => {
    const set = await loadReady([]);
    expect(set).toEqual({ status: 'unknown' });
  });

  it('is `unknown` when the read throws', async () => {
    mockGetFirstAsync.mockRejectedValue(new Error('database is locked'));
    await expect(loadTrialAllowedSet('pet-1', NOW)).resolves.toEqual({ status: 'unknown' });
  });
});

describe('membership lookups', () => {
  const DRY: TrialListFood = { id: 'food-dry', brand: 'Zignature', productName: 'Kangaroo Formula' };

  it('marks a food on the list today, with its role and dated fact', async () => {
    const set = await loadReady();
    expect(trialListMembership(set, DRY, NOW)).toEqual({
      role: 'primary_diet',
      allowedFrom: '2026-07-01',
      label: 'Zignature Kangaroo Formula',
      matchedBy: 'food_id',
    });
  });

  it('AC1 — membership is DATE-GATED: a mid-trial add is not on the list before it was added', async () => {
    const set = await loadReady();
    const jerky: TrialListFood = { id: 'food-jerky', brand: 'Real Meat', productName: 'Kangaroo Jerky' };
    expect(isOnTrialList(set, jerky, at('2026-07-09'))).toBe(false);
    expect(isOnTrialList(set, jerky, at('2026-07-10'))).toBe(true);
    expect(isOnTrialList(set, jerky, NOW)).toBe(true);
  });

  it('AC2 — the KEY arm: a re-photographed bag reads on-list under a new id', async () => {
    const set = await loadReady();
    const rebought: TrialListFood = {
      // A new `food_items` row minted by re-photographing the same bag — the
      // library action the app actively encourages (§5.4).
      id: 'food-dry-rephotographed',
      brand: 'ZIGNATURE',
      productName: 'kangaroo formula',
    };
    expect(trialListMembership(set, rebought, NOW)).toMatchObject({
      role: 'primary_diet',
      matchedBy: 'food_key',
    });
  });

  it('honours a dated removal (§5 edge 2)', async () => {
    const set = await loadReady();
    const removed: TrialListFood = { id: 'food-removed', brand: 'Hills', productName: 'Chicken Topper' };
    expect(isOnTrialList(set, removed, at('2026-07-15'))).toBe(true);
    expect(isOnTrialList(set, removed, at('2026-07-16'))).toBe(false);
  });

  it('marks nothing for a food that is not on the list', async () => {
    const set = await loadReady();
    expect(trialListMembership(set, { id: 'food-other', brand: 'Purina', productName: 'Pro Plan' }, NOW))
      .toBeNull();
  });

  it('never matches a food with no usable identity', async () => {
    const set = await loadReady();
    expect(isOnTrialList(set, { id: null, brand: null, productName: null }, NOW)).toBe(false);
    expect(isOnTrialList(set, { id: null, brand: '', productName: '  ' }, NOW)).toBe(false);
  });

  it('AC5 — an unknown or absent set marks nothing and lists nothing', async () => {
    for (const set of [{ status: 'unknown' } as const, { status: 'no_trial' } as const]) {
      expect(trialListMembership(set, DRY, NOW)).toBeNull();
      expect(isOnTrialList(set, DRY, NOW)).toBe(false);
      expect(trialListFoodsOn(set, NOW)).toEqual([]);
    }
  });

  it('lists the rows in force on the day, deduped by identity', async () => {
    const set = await loadReady([
      ...ROWS,
      // A double-add of a food already on the list: same brand+product, new row.
      allowedRow({
        food_item_id: 'food-dry-again',
        role: 'permitted_other',
        food_label: 'Zignature Kangaroo Formula',
        allowed_from: '2026-07-12',
        brand: 'Zignature',
        product_name: 'Kangaroo Formula',
      }),
    ]);
    const labels = trialListFoodsOn(set, NOW).map((f) => f.label);
    // The removed food is gone (its membership closed on the 15th); the
    // duplicate collapses onto the first row, so the count the strip renders and
    // the membership a chip renders cannot disagree.
    expect(labels).toEqual([
      'Zignature Kangaroo Formula',
      'Real Meat Kangaroo Jerky',
      'Whatever the vet okayed',
      'Greenies Dental Chew',
    ]);
    // Day 9: the jerky has not joined yet, the topper is still in force.
    expect(trialListFoodsOn(set, at('2026-07-09')).map((f) => f.label)).toContain(
      'Hills Chicken Topper',
    );
  });
});

// ── THE CONVERGENCE PROPERTY (§6 AC 3) ───────────────────────────────────────
//
// R2 made executable: every (food, day) the library calls on-list is a (food,
// day) `classifyFeeding` rungs to `permitted`, and vice versa. The two carve-outs
// are stated rather than assumed — a day outside the trial window is not a
// verdict about the food (`out_of_window`), which is the ONE thing the library's
// question and the record's question differ on.

interface SweepFood {
  name: string;
  id: string | null;
  brand: string | null;
  product: string | null;
}

const SWEEP_FOODS: SweepFood[] = [
  { name: 'the prescribed diet', id: 'food-dry', brand: 'Zignature', product: 'Kangaroo Formula' },
  { name: 're-photographed bag', id: 'food-dry-2', brand: 'Zignature', product: 'Kangaroo Formula' },
  { name: 'mid-trial permitted treat', id: 'food-jerky', brand: 'Real Meat', product: 'Kangaroo Jerky' },
  { name: 'unhydrated allowed food', id: 'food-unhydrated', brand: null, product: null },
  { name: 'dated-removed food', id: 'food-removed', brand: 'Hills', product: 'Chicken Topper' },
  { name: 'unreadable-role food', id: 'food-chew', brand: 'Greenies', product: 'Dental Chew' },
  { name: 'an off-list food', id: 'food-other', brand: 'Purina', product: 'Pro Plan' },
  { name: 'off-list, same brand', id: 'food-other-2', brand: 'Zignature', product: 'Trout Formula' },
  { name: 'no identity at all', id: null, brand: null, product: null },
  { name: 'blank-named food', id: null, brand: '', product: '' },
];

const SWEEP_DAYS = [
  '2026-06-25', // before the trial started
  '2026-06-30',
  '2026-07-01', // day 1
  '2026-07-05',
  '2026-07-09', // the day before the mid-trial add
  '2026-07-10', // the add
  '2026-07-15', // the removal's last day
  '2026-07-16',
  '2026-07-20', // today
  '2026-09-30', // past the target end, trial never ended
];

function feedingOf(food: SweepFood, dayKey: string): TrialFeeding {
  return {
    eventId: `${food.id ?? 'none'}-${dayKey}`,
    occurredAt: new Date(at(dayKey)).toISOString(),
    foodItemId: food.id,
    // The same derivation `readFeedings` does, so the sweep compares the two
    // QUESTIONS rather than two ways of spelling an identity.
    foodKey: food.brand !== null || food.product !== null ? trialFoodKey(food.brand, food.product) : null,
    label: null,
    foodType: null,
    proteins: [],
  };
}

describe('convergence with classifyFeeding (R2)', () => {
  it('never disagrees with the classifier about what is on the list', async () => {
    const set = await loadReady();
    expect(set.status).toBe('ready');
    if (set.status !== 'ready') return;

    const disagreements: string[] = [];
    for (const food of SWEEP_FOODS) {
      for (const dayKey of SWEEP_DAYS) {
        const feeding = feedingOf(food, dayKey);
        const cls = classifyFeeding(set.ctx, feeding);
        const membership = trialListMembership(
          set,
          { id: food.id, brand: food.brand, productName: food.product },
          at(dayKey),
        );
        const inWindow = isInTrialWindow(set.ctx, dayIndexOf(set.ctx, feeding.occurredAt));
        const classifierSaysPermitted = cls.verdict === 'permitted';
        const librarySaysOnList = membership !== null;

        if (classifierSaysPermitted !== (inWindow && librarySaysOnList)) {
          disagreements.push(
            `${food.name} on ${dayKey}: classifier=${cls.verdict}, library=${
              librarySaysOnList ? membership.role : 'not on list'
            }`,
          );
        }
        // And when they agree it IS permitted, they agree about WHY — the role
        // the chip renders and the role the vet report attributes are one value.
        if (classifierSaysPermitted && membership) {
          expect(membership.role).toBe(cls.role);
          expect(membership.matchedBy).toBe(cls.matchedBy);
        }
      }
    }
    expect(disagreements).toEqual([]);
  });

  it('the sweep has teeth: a naive re-derivation fails it', async () => {
    const set = await loadReady();
    if (set.status !== 'ready') throw new Error('fixture');

    // What a surface writes when it filters the allowed set for itself instead
    // of calling rung 1: id-only, undated. This is the exact shape the one
    // predicate rule exists to prevent, and it must be caught here — otherwise
    // the property above could pass while proving nothing.
    const naiveOnList = (food: SweepFood) =>
      set.foods.some((f) => f.foodItemId === food.id);

    const misses: string[] = [];
    for (const food of SWEEP_FOODS) {
      for (const dayKey of SWEEP_DAYS) {
        const cls = classifyFeeding(set.ctx, feedingOf(food, dayKey));
        const inWindow = isInTrialWindow(
          set.ctx,
          dayIndexOf(set.ctx, feedingOf(food, dayKey).occurredAt),
        );
        if ((cls.verdict === 'permitted') !== (inWindow && naiveOnList(food))) {
          misses.push(`${food.name} on ${dayKey}`);
        }
      }
    }
    // It misses the re-photographed bag on every in-window day (the key arm),
    // and it permits the mid-trial add before it was added and the removed food
    // after it was removed (the date gate).
    expect(misses.length).toBeGreaterThan(0);
    expect(misses.join('\n')).toContain('re-photographed bag');
    expect(misses.join('\n')).toContain('mid-trial permitted treat');
    expect(misses.join('\n')).toContain('dated-removed food');
  });
});
