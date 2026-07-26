// B-417 PR 5 — the card's data wiring, where the shared predicate's numbers turn
// into the `TrialCardInput` an owner reads.
//
// The pure resolver is tested in dietTrialCard.test.ts and the predicate in
// dietTrial.test.ts. What only THIS layer can get wrong is the assembly, and the
// assembly is where B-351 slice 4's adversarial pass found every one of its six
// breaks — so the two rules that keep a compliant owner from being accused are
// pinned here rather than assumed:
//
//   1. NO ALLOWED SET → NO EXPOSURE CLAIM. With an empty allowed set every
//      feeding classifies off-diet, so a count computed before `diet_trial_foods`
//      hydrates would flag a perfectly compliant owner on every meal.
//   2. Coverage still renders in that state. It is a statement about the RECORD
//      and needs no allowed set — dropping it too would hand the emptiest card in
//      the app to an owner whose only problem is a cold cache.

const db = {
  trial: null as Record<string, unknown> | null,
  feedings: [] as Record<string, unknown>[],
  doses: [] as Record<string, unknown>[],
};

jest.mock('./db', () => ({
  getDb: () => ({
    getFirstAsync: () => Promise.resolve(db.trial),
    getAllAsync: (sql: string) =>
      Promise.resolve(sql.includes('medication_administrations') ? db.doses : db.feedings),
  }),
}));

const trialCtx = { value: null as unknown };
jest.mock('./trialContaminant', () => ({
  loadTrialProteinContext: () => Promise.resolve(trialCtx.value),
  trialDietNote: () => null,
}));

const declineResult = { value: { status: 'none', flags: [] } as unknown };
jest.mock('./analytics', () => {
  const actual = jest.requireActual('./analytics') as Record<string, unknown>;
  return { ...actual, getIntakeDecline: () => Promise.resolve(declineResult.value) };
});

const arrangementRows = { value: [] as unknown[] };
jest.mock('./feedingArrangements', () => ({
  getActiveArrangementsForPet: () => Promise.resolve(arrangementRows.value),
}));

import { loadDietTrialFacts } from './dietTrialFacts';

const PET = { id: 'pet-1', name: 'Rex', species: 'dog' as const };
const NOW = new Date(2026, 6, 10, 12).getTime(); // 10 July, day 10 of the trial

/** A meal of the trial diet on a given local day. */
function meal(day: number, over: Record<string, unknown> = {}) {
  return {
    id: `m-${day}`,
    occurred_at: new Date(2026, 6, day, 8).toISOString(),
    food_item_id: 'trial-food',
    brand: 'Zignature',
    product_name: 'Duck Formula',
    food_type: 'meal',
    proteins: JSON.stringify(['duck']),
    ...over,
  };
}

const ALLOWED_CTX = {
  trialId: 't-1',
  petId: 'pet-1',
  primaryCount: 1,
  primaryResolved: 1,
  allowedFoods: [
    {
      foodItemId: 'trial-food',
      foodKey: 'zignature\u001Fduck formula',
      label: 'Zignature Duck Formula',
      role: 'primary_diet',
      allowedFrom: '2026-07-01',
      allowedUntil: null,
      primaryProtein: 'duck',
      proteins: ['duck'],
    },
  ],
};

beforeEach(() => {
  db.trial = {
    id: 't-1',
    started_at: '2026-07-01',
    target_duration_days: 56,
    status: 'active',
    ended_at: null,
    stopped_reason: null,
    outcome: null,
    food_label: 'Zignature Duck Formula',
  };
  db.feedings = [];
  db.doses = [];
  trialCtx.value = ALLOWED_CTX;
  declineResult.value = { status: 'none', flags: [] };
  arrangementRows.value = [];
});

it('reports coverage and exposures as two facts with their own denominators', async () => {
  db.feedings = [meal(1), meal(2), meal(3)];
  const input = await loadDietTrialFacts({ pet: PET, nowMs: NOW });
  expect(input.coverage).toEqual({ daysLogged: 3, daysElapsed: 10 });
  expect(input.exposures).toMatchObject({ totalFeedings: 3, offDiet: 0 });
});

it('RULE 1 — an unhydrated allowed set yields no exposure claim at all', async () => {
  // The false-accusation direction, and the reason this file exists: with no
  // allowed set every one of these three trial-diet meals classifies off-diet.
  db.feedings = [meal(1), meal(2), meal(3)];
  trialCtx.value = null;
  const input = await loadDietTrialFacts({ pet: PET, nowMs: NOW });
  expect(input.exposures).toBeNull();
  expect(input.belowCoverageFloor).toBe(false);
  // RULE 2 — the record fact still renders.
  expect(input.coverage).toEqual({ daysLogged: 3, daysElapsed: 10 });
});

it('an allowed set that resolved to ZERO primary foods is the same state', async () => {
  db.feedings = [meal(1)];
  trialCtx.value = { ...ALLOWED_CTX, primaryCount: 0, allowedFoods: [] };
  expect((await loadDietTrialFacts({ pet: PET, nowMs: NOW })).exposures).toBeNull();
});

it('counts an off-diet feeding and names its antigen in the note', async () => {
  db.feedings = [
    meal(1),
    meal(2, {
      id: 'jerky',
      occurred_at: new Date(2026, 6, 9, 18, 40).toISOString(),
      food_item_id: 'zukes',
      brand: 'Zuke’s',
      product_name: 'Mini Naturals',
      food_type: 'treat',
      proteins: JSON.stringify(['chicken']),
    }),
  ];
  const input = await loadDietTrialFacts({ pet: PET, nowMs: NOW });
  expect(input.exposures).toMatchObject({ totalFeedings: 2, offDiet: 1 });
  // The design-locked shape: the food, the antigen, and a recognisable time.
  expect(input.exposures?.mostRecent?.label).toBe('Zuke’s Mini Naturals (chicken)');
  expect(input.exposures?.mostRecent?.when).toMatch(/^Yesterday, /);
  // Coverage counts DAYS WITH A NON-TREAT FEEDING, so the treat day is not in it.
  expect(input.coverage).toEqual({ daysLogged: 1, daysElapsed: 10 });
});

it('a rung-3 exposure names the food alone — never a contaminant assertion', async () => {
  db.feedings = [
    meal(9, {
      id: 'biscuit',
      food_item_id: 'biscuit',
      brand: 'Generic',
      product_name: 'Biscuit',
      proteins: null,
    }),
  ];
  const input = await loadDietTrialFacts({ pet: PET, nowMs: NOW });
  expect(input.exposures?.offDiet).toBe(1);
  expect(input.exposures?.mostRecent?.label).toBe('Generic Biscuit');
});

it('a chewable dose does not enter the feeding ratio', async () => {
  db.feedings = [meal(1)];
  db.doses = [{
    id: 'd-1',
    occurred_at: new Date(2026, 6, 5, 9).toISOString(),
    paired_event_id: null,
    form: 'chewable',
    adherence: 'missed',
    vehicle_food_item_id: null,
    vehicle_brand: null,
    vehicle_product_name: null,
    generic_name: 'afoxolaner',
    brand_name: 'NexGard',
  }];
  const input = await loadDietTrialFacts({ pet: PET, nowMs: NOW });
  expect(input.exposures).toMatchObject({ totalFeedings: 1, offDiet: 0 });
});

it('sets belowCoverageFloor once the record is thin enough to be uninterpretable', async () => {
  db.feedings = [meal(1)];
  const input = await loadDietTrialFacts({ pet: PET, nowMs: NOW });
  expect(input.belowCoverageFloor).toBe(true);
});

it('raises no floor alarm before the record is old enough to read', async () => {
  // §5.2 is two-sided: below the minimum span there is no claim AND no alarm.
  db.feedings = [];
  const input = await loadDietTrialFacts({ pet: PET, nowMs: new Date(2026, 6, 3, 12).getTime() });
  expect(input.belowCoverageFloor).toBe(false);
});

// ── The adversarial pass's breaks — the wiring half ──────────────────────────
//
// Every one of these produced a false sentence on a real card. They are grouped
// here rather than in `dietTrial.test.ts` because the module was right in all
// four cases and this file was where the answer got thrown away.

describe('adversarial regressions — the wiring half', () => {
  // BREAK 3 — the guard was half-applied. `primaryCount === 0` catches an allowed
  // set that has not arrived; it does NOT catch one whose `food_items_cache` rows
  // have not, which reports a positive count with null keys and empty arrays. The
  // measured result: 40 feedings of the PRESCRIBED diet rendering as "0 matched,
  // 40 did not", naming the trial's own protein as the contaminant — three lines
  // under a standing note reading "the trial food hasn't loaded on this device
  // yet, so there's nothing to compare against".
  it('an allowed set whose FOOD ROWS have not hydrated makes no exposure claim', async () => {
    db.feedings = Array.from({ length: 40 }, (_, i) => meal((i % 9) + 1, { id: `m${i}`, food_item_id: 'trial-food-v2' }));
    trialCtx.value = {
      ...ALLOWED_CTX,
      primaryResolved: 0,
      allowedFoods: [{ ...ALLOWED_CTX.allowedFoods[0], foodKey: null, primaryProtein: null, proteins: [] }],
    };
    const input = await loadDietTrialFacts({ pet: PET, nowMs: NOW });
    expect(input.exposures).toBeNull();
    expect(input.belowCoverageFloor).toBe(false);
  });

  // BREAK 1 — §5.2 proof #1. `detectIntakeDecline` returns `{status:'none'}` for a
  // diet refused from day 1 (no prior baseline to decline FROM), so the card's
  // structural replacement never fired and the clean two-fact sentence rendered
  // over a cat that had not eaten in two weeks.
  it('a refused trial diet replaces the adherence line and withholds the claim', async () => {
    db.feedings = Array.from({ length: 20 }, (_, i) =>
      meal(Math.floor(i / 2) + 1, { id: `r${i}`, intake_rating: 'refused' }),
    );
    const input = await loadDietTrialFacts({ pet: PET, nowMs: NOW });
    expect(input.exposures).toBeNull();
    expect(input.intakeDeclineHeadline).toMatch(/logged as refused/);
    expect(input.intakeDeclineHeadline).not.toMatch(/pick|fussy|prefer/i);
    // The owner kept a perfect record and is not scored for the pet's illness.
    expect(input.coverage).toEqual({ daysLogged: 10, daysElapsed: 10 });
  });

  it('the CLINICAL detector always wins the replacement slot', async () => {
    // §6.5: the trial's viability line never softens or displaces the health
    // lane. When `detectIntakeDecline` speaks, it is what renders.
    declineResult.value = {
      status: 'watch',
      flags: [{ trigger: 'refused_normal_food', class: 'health_watch', refusedFoodLabel: 'her usual dinner' }],
    };
    db.feedings = Array.from({ length: 20 }, (_, i) =>
      meal(Math.floor(i / 2) + 1, { id: `r${i}`, intake_rating: 'refused' }),
    );
    const input = await loadDietTrialFacts({ pet: PET, nowMs: NOW });
    expect(input.intakeDeclineHeadline).toMatch(/just turned down her usual dinner/);
  });

  // BREAK 2 — the free-choice bowl. Its off-list membership was computed and
  // discarded, and the card affirmed the opposite; separately, `loggedFeedings`
  // counted RAW rows while `offDiet` counted CLASSIFIED ones, so the two sides of
  // the free-fed sentence were on different denominators.
  it('an off-list free-choice bowl withholds the claim, on one denominator', async () => {
    arrangementRows.value = [{
      id: 'a1',
      food_item_id: 'aldi-chicken',
      active_from: '2026-06-01',
      updated_at: new Date(2026, 5, 1).toISOString(),
      brand: 'Aldi',
      product_name: 'Chicken Dry',
      format: 'dry_kibble',
    }];
    db.feedings = [meal(1), meal(2), meal(3, { food_item_id: null, brand: null, product_name: null })];
    const input = await loadDietTrialFacts({ pet: PET, nowMs: NOW });
    expect(input.exposures).toBeNull();
    // 3 raw rows, 2 classifiable → the replacement count is the CLASSIFIED one.
    expect(input.freeFed).toEqual({ loggedFeedings: 2 });
  });

  // BREAK 6 — a chewable was computed as an oral-route exposure and then dropped,
  // under a qualifier telling the reader that flavoured products "aren't visible
  // here". The one that IS visible must not be the one dropped.
  it('an oral-route exposure withholds the affirmative claim', async () => {
    db.feedings = [meal(1), meal(2)];
    db.doses = [{
      id: 'd-1',
      occurred_at: new Date(2026, 6, 5, 9).toISOString(),
      paired_event_id: null,
      form: 'chewable',
      adherence: 'given',
      vehicle_food_item_id: null,
      vehicle_brand: null,
      vehicle_product_name: null,
      generic_name: 'afoxolaner',
      brand_name: 'NexGard',
    }];
    expect((await loadDietTrialFacts({ pet: PET, nowMs: NOW })).exposures).toBeNull();
  });

  it('a REAL exposure still renders — the gate withholds the claim, not the finding', async () => {
    db.feedings = [
      meal(1),
      meal(2, { id: 'jerky', food_item_id: 'zukes', brand: 'Zuke’s', product_name: 'Mini Naturals', food_type: 'treat', proteins: JSON.stringify(['chicken']) }),
    ];
    db.doses = [{
      id: 'd-1',
      occurred_at: new Date(2026, 6, 5, 9).toISOString(),
      paired_event_id: null,
      form: 'chewable',
      adherence: 'given',
      vehicle_food_item_id: null,
      vehicle_brand: null,
      vehicle_product_name: null,
      generic_name: 'afoxolaner',
      brand_name: 'NexGard',
    }];
    const input = await loadDietTrialFacts({ pet: PET, nowMs: NOW });
    expect(input.exposures).toMatchObject({ totalFeedings: 2, offDiet: 1 });
  });

  // BREAK 5 — a dose that never went in, and a pill hidden in the trial diet.
  it('a missed dose and a dose hidden in the trial diet are not exposures', async () => {
    db.feedings = [meal(1), meal(2)];
    db.doses = [
      { id: 'd-1', occurred_at: new Date(2026, 6, 5, 9).toISOString(), paired_event_id: null, form: 'chewable', adherence: 'missed', vehicle_food_item_id: null, vehicle_brand: null, vehicle_product_name: null, generic_name: 'afoxolaner', brand_name: 'NexGard' },
      { id: 'd-2', occurred_at: new Date(2026, 6, 6, 9).toISOString(), paired_event_id: 'm-1', form: 'tablet', adherence: 'given', vehicle_food_item_id: 'trial-food', vehicle_brand: 'Zignature', vehicle_product_name: 'Duck Formula', generic_name: 'oclacitinib', brand_name: 'Apoquel' },
    ];
    // Neither withholds the claim, because neither is an exposure.
    expect((await loadDietTrialFacts({ pet: PET, nowMs: NOW })).exposures)
      .toMatchObject({ totalFeedings: 2, offDiet: 0 });
  });
});
