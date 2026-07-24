// Widget resolution lib — unit tests (W4 DoD: pure lib logic ⇒ tests).
//
// All fixtures build timestamps from device-LOCAL Date components
// (new Date(y, m, d, h) → toISOString()), so the slot math — which runs on the
// kitchen clock — asserts identically in any test-runner timezone.

// widgetResolution → analytics → db/feedingArrangements: import-graph stubs
// (the pure trial math under test doesn't touch either).
jest.mock('./db', () => ({ getDb: jest.fn() }));
jest.mock('./feedingArrangements', () => ({
  getActiveArrangementsForPet: jest.fn().mockResolvedValue([]),
}));

import {
  assignPetSlots,
  buildMealChoices,
  buildSlotRows,
  buildTreatChoices,
  formatApproxTime,
  learnMealSlots,
  resolveTrialContext,
  slotLabelFor,
  MAX_MEAL_CHOICES,
  PET_SLOT_COUNT,
  SLOT_MIN_DAYS,
  TREAT_LOOKBACK_DAYS,
  type LearnedSlot,
  type PetSlotIndex,
  type ResolutionMealRow,
} from './widgetResolution';

const iso = (y: number, mo: number, d: number, h: number, min = 0) =>
  new Date(y, mo, d, h, min).toISOString();

// "Now": local 2026-07-24 20:00.
const NOW = new Date(2026, 6, 24, 20, 0);

function meal(
  occurredAt: string,
  food: { id: string; brand: string; product: string } | null = null,
  foodType: string | null = 'meal',
): ResolutionMealRow {
  return {
    occurred_at: occurredAt,
    food_item_id: food?.id ?? null,
    food_type: foodType,
    brand: food?.brand ?? null,
    product_name: food?.product ?? null,
  };
}

const ZD = { id: 'food-zd', brand: "Hill's", product: 'z/d' };
const KIBBLE = { id: 'food-kb', brand: 'Acme', product: 'Kibble' };
const TEMPTATIONS = { id: 'treat-t1', brand: 'Temptations', product: 'Chicken' };

// A daily routine: `days` consecutive local days ending yesterday, at local
// hour `h` (jitterMin shifts alternate days to exercise clustering).
function routine(
  h: number,
  days: number,
  food: { id: string; brand: string; product: string } | null = ZD,
  jitterMin = 0,
): ResolutionMealRow[] {
  const out: ResolutionMealRow[] = [];
  for (let i = 1; i <= days; i++) {
    const jitter = i % 2 === 0 ? jitterMin : 0;
    out.push(meal(iso(2026, 6, 24 - i, h, jitter), food));
  }
  return out;
}

describe('learnMealSlots', () => {
  it('learns two daily routines as time-ordered slots with honest centers', () => {
    const slots = learnMealSlots([...routine(8, 7), ...routine(18, 7)], NOW);
    expect(slots).toHaveLength(2);
    expect(slots[0].label).toBe('Breakfast');
    expect(slots[0].centerMinutes).toBe(8 * 60);
    expect(slots[1].label).toBe('Dinner');
    expect(slots[1].centerMinutes).toBe(18 * 60);
  });

  it(`requires ≥${SLOT_MIN_DAYS} distinct days — a coincidence is not a routine`, () => {
    expect(learnMealSlots(routine(8, SLOT_MIN_DAYS - 1), NOW)).toHaveLength(0);
    expect(learnMealSlots(routine(8, SLOT_MIN_DAYS), NOW)).toHaveLength(1);
  });

  it('clusters jittered times (within the gap) into one slot', () => {
    // 18:00 / 18:45 alternating — one dinner routine, not two.
    const slots = learnMealSlots(routine(18, 8, ZD, 45), NOW);
    expect(slots).toHaveLength(1);
    expect(slots[0].label).toBe('Dinner');
  });

  it('ignores treats and rows outside the 14-day lookback', () => {
    const old = [
      // A strong routine, but 3 weeks ago.
      ...routine(8, 7).map((r) => ({
        ...r,
        occurred_at: iso(2026, 6, 24 - 21, 8),
      })),
    ];
    const treats = routine(15, 7, TEMPTATIONS).map((r) => ({ ...r, food_type: 'treat' }));
    expect(learnMealSlots([...old, ...treats], NOW)).toHaveLength(0);
  });

  it('names a stable usual food; withholds an unstable one (status row, no one-tap)', () => {
    const stable = learnMealSlots(routine(8, 7, ZD), NOW);
    expect(stable[0].usualFood).toEqual({ foodItemId: 'food-zd', label: "Hill's z/d" });

    // 50/50 split across two foods — below the 60% share floor.
    const mixed = [
      ...routine(8, 8, ZD).slice(0, 4),
      ...routine(8, 8, KIBBLE).slice(4, 8),
    ];
    const slots = learnMealSlots(mixed, NOW);
    expect(slots).toHaveLength(1);
    expect(slots[0].usualFood).toBeNull();
  });

  it('counts unknown-food meals in the stability denominator', () => {
    // 3 named + 4 unnamed: the named food is only 3/7 — not "usual".
    const rows = [
      ...routine(8, 7, null),
      meal(iso(2026, 6, 21, 8, 10), ZD),
      meal(iso(2026, 6, 22, 8, 10), ZD),
      meal(iso(2026, 6, 23, 8, 10), ZD),
    ];
    const slots = learnMealSlots(rows, NOW);
    expect(slots).toHaveLength(1);
    expect(slots[0].usualFood).toBeNull();
  });
});

describe('buildSlotRows', () => {
  const slots: LearnedSlot[] = [
    { label: 'Breakfast', centerMinutes: 8 * 60, dayCount: 7, usualFood: null },
    { label: 'Dinner', centerMinutes: 18 * 60, dayCount: 7, usualFood: null },
  ];

  it('an unlogged slot is a null gap — never an assumed ✓ (B-156 G1)', () => {
    const rows = buildSlotRows(slots, []);
    expect(rows).toEqual([
      { label: 'Breakfast', expectedWindow: '~8a', loggedAt: null },
      { label: 'Dinner', expectedWindow: '~6p', loggedAt: null },
    ]);
  });

  it('a today-meal near a slot center claims it; distant meals claim nothing', () => {
    const rows = buildSlotRows(slots, [meal(iso(2026, 6, 24, 8, 20), ZD)]);
    expect(rows[0].loggedAt).toBe(iso(2026, 6, 24, 8, 20));
    expect(rows[1].loggedAt).toBeNull();
  });

  it('one meal never ticks two slots; two meals fill both by closeness', () => {
    // 13:00 is >90min from both 8:00 and 18:00 — claims neither.
    expect(
      buildSlotRows(slots, [meal(iso(2026, 6, 24, 13, 0), ZD)]).every((r) => r.loggedAt === null),
    ).toBe(true);
    const rows = buildSlotRows(slots, [
      meal(iso(2026, 6, 24, 7, 45), ZD),
      meal(iso(2026, 6, 24, 18, 30), KIBBLE),
    ]);
    expect(rows[0].loggedAt).toBe(iso(2026, 6, 24, 7, 45));
    expect(rows[1].loggedAt).toBe(iso(2026, 6, 24, 18, 30));
  });

  it('treats never claim a meal slot', () => {
    const rows = buildSlotRows(slots, [
      meal(iso(2026, 6, 24, 8, 0), TEMPTATIONS, 'treat'),
    ]);
    expect(rows[0].loggedAt).toBeNull();
  });
});

describe('buildMealChoices', () => {
  const slotWithFood: LearnedSlot = {
    label: 'Dinner',
    centerMinutes: 18 * 60,
    dayCount: 7,
    usualFood: { foodItemId: 'food-zd', label: "Hill's z/d" },
  };
  const rowUnlogged = { label: 'Dinner', expectedWindow: '~6p', loggedAt: null };

  it('the next unlogged slot with its named food leads (the mock lead row)', () => {
    const choices = buildMealChoices([slotWithFood], [rowUnlogged], null);
    expect(choices).toEqual([{ foodItemId: 'food-zd', label: "Dinner — Hill's z/d" }]);
  });

  it('a logged slot is not a choice; a nameless slot is the app door, not a row', () => {
    expect(
      buildMealChoices([slotWithFood], [{ ...rowUnlogged, loggedAt: 'x' }], null),
    ).toEqual([]);
    expect(
      buildMealChoices([{ ...slotWithFood, usualFood: null }], [rowUnlogged], null),
    ).toEqual([]);
  });

  it('during a trial, the slot food IS the trial diet (§2.2) — overrides the learned usual', () => {
    const choices = buildMealChoices([slotWithFood], [rowUnlogged], {
      startedAt: '2026-07-13',
      targetDurationDays: 28,
      foodItemId: 'food-trial',
      foodLabel: 'Royal Canin PD',
    });
    expect(choices).toEqual([{ foodItemId: 'food-trial', label: 'Dinner — Royal Canin PD' }]);
  });

  it('a trial pet with no learned slots still gets one bare trial-diet row (the wedge is never locked out)', () => {
    const choices = buildMealChoices([], [], {
      startedAt: '2026-07-13',
      targetDurationDays: 28,
      foodItemId: 'food-trial',
      foodLabel: 'Royal Canin PD',
    });
    expect(choices).toEqual([{ foodItemId: 'food-trial', label: 'Royal Canin PD' }]);
  });

  it('but a trial pet whose slots are ALL logged today gets NO extra row — the app door, not an overfeed nudge', () => {
    const choices = buildMealChoices(
      [slotWithFood],
      [{ ...rowUnlogged, loggedAt: iso(2026, 6, 24, 18, 0) }],
      {
        startedAt: '2026-07-13',
        targetDurationDays: 28,
        foodItemId: 'food-trial',
        foodLabel: 'Royal Canin PD',
      },
    );
    expect(choices).toEqual([]);
  });

  it(`caps at ${MAX_MEAL_CHOICES} one-tap rows (D3)`, () => {
    const slots = [7, 12, 18].map((h, i) => ({
      label: (['Breakfast', 'Lunch', 'Dinner'] as const)[i],
      centerMinutes: h * 60,
      dayCount: 7,
      usualFood: { foodItemId: `f${i}`, label: `Food ${i}` },
    }));
    const rows = slots.map((s) => ({
      label: s.label,
      expectedWindow: '~x',
      loggedAt: null,
    }));
    expect(buildMealChoices(slots, rows, null)).toHaveLength(MAX_MEAL_CHOICES);
  });
});

describe('buildTreatChoices', () => {
  it('top-2 by count over the lookback; case-folded brand+product pools duplicate captures', () => {
    const dupeA = { id: 'treat-a1', brand: 'Temptations', product: 'Chicken' };
    const dupeB = { id: 'treat-a2', brand: 'temptations', product: 'chicken' };
    const other = { id: 'treat-b', brand: 'Greenies', product: 'Dental' };
    const third = { id: 'treat-c', brand: 'Churu', product: 'Tuna' };
    const rows = [
      meal(iso(2026, 6, 20, 15), dupeA, 'treat'),
      meal(iso(2026, 6, 21, 15), dupeB, 'treat'), // most recent of the pooled pair
      meal(iso(2026, 6, 22, 15), other, 'treat'),
      meal(iso(2026, 6, 23, 15), other, 'treat'),
      meal(iso(2026, 6, 23, 16), other, 'treat'),
      meal(iso(2026, 6, 19, 15), third, 'treat'),
    ];
    const choices = buildTreatChoices(rows, NOW);
    expect(choices).toHaveLength(2);
    expect(choices[0]).toEqual({ foodItemId: 'treat-b', label: 'Greenies Dental' });
    // The pooled pair counts 2 (beats third's 1); the tapped id is the most
    // RECENT member — a real cache-known row.
    expect(choices[1].foodItemId).toBe('treat-a2');
  });

  it(`ignores treats older than ${TREAT_LOOKBACK_DAYS} days and meals entirely`, () => {
    const rows = [
      meal(new Date(NOW.getTime() - (TREAT_LOOKBACK_DAYS + 1) * 86_400_000).toISOString(), TEMPTATIONS, 'treat'),
      meal(iso(2026, 6, 23, 8), ZD, 'meal'),
    ];
    expect(buildTreatChoices(rows, NOW)).toEqual([]);
  });
});

describe('resolveTrialContext', () => {
  it('delegates the day math to analytics (B-084 day-aligned counter)', () => {
    const out = resolveTrialContext(
      { startedAt: '2026-07-13', targetDurationDays: 28, foodItemId: null, foodLabel: null },
      Date.parse('2026-07-24T20:00:00.000Z'),
    );
    expect(out).toEqual({ trialDay: 12, trialTargetDays: 28 });
  });

  it('null trial (or unparseable start) → nulls, never a fabricated day', () => {
    expect(resolveTrialContext(null, NOW.getTime())).toEqual({
      trialDay: null,
      trialTargetDays: null,
    });
    expect(
      resolveTrialContext(
        { startedAt: 'not-a-date', targetDurationDays: 28, foodItemId: null, foodLabel: null },
        NOW.getTime(),
      ),
    ).toEqual({ trialDay: null, trialTargetDays: null });
  });
});

describe('formatApproxTime / slotLabelFor', () => {
  it('renders the mock forms', () => {
    expect(formatApproxTime(18 * 60)).toBe('~6p');
    expect(formatApproxTime(7 * 60 + 30)).toBe('~7:30a');
    expect(formatApproxTime(0)).toBe('~12a');
    expect(formatApproxTime(12 * 60)).toBe('~12p');
  });

  it('labels by time-of-day band', () => {
    expect(slotLabelFor(8 * 60)).toBe('Breakfast');
    expect(slotLabelFor(12 * 60)).toBe('Lunch');
    expect(slotLabelFor(18 * 60)).toBe('Dinner');
    expect(slotLabelFor(22 * 60)).toBe('Dinner'); // a 10pm cat dinner is still Dinner
  });
});

describe('assignPetSlots (D5 — sticky slots with tombstones)', () => {
  const pixel = { id: 'pet-1', name: 'Pixel' };
  const juniper = { id: 'pet-2', name: 'Juniper' };
  const mochi = { id: 'pet-3', name: 'Mochi' };

  it('assigns fresh pets ascending from slot 1', () => {
    const index = assignPetSlots(null, [pixel, juniper]);
    expect(index.assignments).toEqual([
      { slot: 1, petId: 'pet-1', petName: 'Pixel', active: true },
      { slot: 2, petId: 'pet-2', petName: 'Juniper', active: true },
    ]);
  });

  it('a pet keeps its slot across publishes and renames — a bound widget never re-points (B-086)', () => {
    const first = assignPetSlots(null, [pixel, juniper]);
    // Pet list reorders AND Pixel is renamed — slots must not move.
    const second = assignPetSlots(first, [juniper, { ...pixel, name: 'Pixel II' }]);
    expect(second.assignments.find((a) => a.petId === 'pet-1')).toEqual({
      slot: 1, petId: 'pet-1', petName: 'Pixel II', active: true,
    });
    expect(second.assignments.find((a) => a.petId === 'pet-2')!.slot).toBe(2);
  });

  it('a removed pet becomes a TOMBSTONE; a new pet takes a fresh slot, not the tombstone', () => {
    const first = assignPetSlots(null, [pixel, juniper]);
    const second = assignPetSlots(first, [pixel, mochi]); // Juniper left
    expect(second.assignments).toEqual([
      { slot: 1, petId: 'pet-1', petName: 'Pixel', active: true },
      { slot: 2, petId: 'pet-2', petName: 'Juniper', active: false },
      { slot: 3, petId: 'pet-3', petName: 'Mochi', active: true },
    ]);
  });

  it('reuses a tombstone only when every fresh slot is exhausted', () => {
    let index = assignPetSlots(
      null,
      Array.from({ length: PET_SLOT_COUNT }, (_, i) => ({ id: `p${i}`, name: `Pet ${i}` })),
    );
    // p0 leaves; a new pet arrives with no fresh slot left → takes p0's slot.
    index = assignPetSlots(index, [
      ...Array.from({ length: PET_SLOT_COUNT - 1 }, (_, i) => ({ id: `p${i + 1}`, name: `Pet ${i + 1}` })),
      { id: 'new', name: 'New' },
    ]);
    const reused = index.assignments.find((a) => a.slot === 1)!;
    expect(reused).toEqual({ slot: 1, petId: 'new', petName: 'New', active: true });
  });

  it(`a concurrent ${PET_SLOT_COUNT + 1}th pet stays unassigned (the app remains its surface)`, () => {
    const pets = Array.from({ length: PET_SLOT_COUNT + 1 }, (_, i) => ({ id: `p${i}`, name: `Pet ${i}` }));
    const index = assignPetSlots(null, pets);
    expect(index.assignments).toHaveLength(PET_SLOT_COUNT);
    expect(index.assignments.some((a) => a.petId === `p${PET_SLOT_COUNT}`)).toBe(false);
  });

  it('sanitizes a corrupt previous index (out-of-range/duplicate slots) instead of propagating it', () => {
    const corrupt = {
      schemaVersion: 1,
      assignments: [
        { slot: 0, petId: 'pet-1', petName: 'Pixel', active: true }, // out of range
        { slot: 2, petId: 'pet-2', petName: 'Juniper', active: true },
        { slot: 2, petId: 'pet-9', petName: 'Ghost', active: true }, // dup slot
      ],
    } as PetSlotIndex;
    const index = assignPetSlots(corrupt, [pixel, juniper]);
    expect(index.assignments.find((a) => a.petId === 'pet-2')!.slot).toBe(2);
    expect(index.assignments.find((a) => a.petId === 'pet-1')!.slot).toBe(1); // reassigned fresh
    expect(index.assignments.some((a) => a.petId === 'pet-9')).toBe(false);
  });
});
