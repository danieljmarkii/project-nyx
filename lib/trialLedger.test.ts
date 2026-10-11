// The day ledger (TS-2, CUL-1298). Every fixture that feeds a parity assertion goes
// through the REAL loaders — `loadDietTrialFacts` for the card input and
// `loadTrialPredicateFacts` for the facts — over one stubbed database, because the
// ledger's whole claim is that it agrees with what those two hand a screen (C-35:
// a fixture shaped unlike production is green over nothing).
//
// The database is the edge that is stubbed: the loaders' SQL is covered against a
// real engine in `dietTrialFacts.test.ts`, and the stub here returns rows in the
// columns those queries select.

jest.mock('./feedingArrangements', () => ({
  getActiveArrangementsForPet: jest.fn().mockResolvedValue([]),
}));

const mockDb = {
  trial: null as Record<string, unknown> | null,
  allowed: [] as Array<Record<string, unknown>>,
  feedings: [] as Array<Record<string, unknown>>,
  arrangements: [] as Array<Record<string, unknown>>,
};
jest.mock('./db', () => ({
  getDb: () => ({
    getFirstAsync: jest.fn(async () => mockDb.trial),
    getAllAsync: jest.fn(async (sql: string) => {
      if (sql.includes('diet_trial_foods')) return mockDb.allowed;
      if (sql.includes('FROM meals m')) return mockDb.feedings;
      if (sql.includes('medication_administrations')) return [];
      if (sql.includes('feeding_arrangements')) return mockDb.arrangements;
      return [];
    }),
  }),
}));
jest.mock('./analytics', () => ({
  ...jest.requireActual('./analytics'),
  getIntakeDecline: jest.fn().mockResolvedValue({ status: 'none', flags: [] }),
}));
jest.mock('./trialContaminant', () => ({
  loadTrialProteinContext: jest.fn().mockResolvedValue(null),
  trialDietNote: jest.fn().mockReturnValue(null),
  antigenPausedNote: jest.fn(() => ({ title: 'paused', body: 'paused' })),
}));

import { computeTrialFacts, type TrialFacts } from './dietTrial';
import { loadDietTrialFacts, loadTrialPredicateFacts } from './dietTrialFacts';
import { withholdingReasons, type TrialCardInput } from './dietTrialCard';
import { buildTrialLedger, thisWeekLane, type TrialLedger } from './trialLedger';
import { localDayIndex, localDayIndexOf } from './utils';

// ── The fixture record ───────────────────────────────────────────────────────

const PET = { id: 'pet-1', name: 'Mochi', species: 'dog' as const };
const START = { y: 2026, m: 6, d: 3 }; // Jul 3, 2026 (month is 0-based)
const START_KEY = '2026-07-03';

/** Local wall time on trial day `n` (day 1 = the start day). */
function onDay(n: number, hour = 12, minute = 0): Date {
  return new Date(START.y, START.m, START.d + n - 1, hour, minute);
}

/**
 * What an extra bowl was logged against (CUL-1348): the trial diet (default), a
 * re-photographed bag of it (a new `food_item_id` and product name, so food identity
 * misses), a rival meal, a treat, or no food at all. `trialTypedTreat` is the trial
 * diet's own row typed `treat` in the library: narrow by role, outside the wide
 * population by type, which is the one shape the union exists for.
 */
type ExtraFood = 'trial' | 'trialTypedTreat' | 'rephoto' | 'rival' | 'treat' | 'none';

const EXTRA_FOOD: Record<ExtraFood, Record<string, unknown>> = {
  trial: { food_item_id: 'f1', brand: 'Royal Canin', product_name: 'Rabbit', food_type: 'meal', proteins: '["rabbit"]' },
  trialTypedTreat: { food_item_id: 'f1', brand: 'Royal Canin', product_name: 'Rabbit', food_type: 'treat', proteins: '["rabbit"]' },
  rephoto: { food_item_id: 'f2', brand: 'Royal Canin', product_name: 'Selected Protein Adult PR', food_type: 'meal', proteins: null },
  rival: { food_item_id: 'fz', brand: 'Acme', product_name: 'Salmon Dinner', food_type: 'meal', proteins: '["salmon"]' },
  treat: { food_item_id: 'fx', brand: 'Acme', product_name: 'Chicken Jerky', food_type: 'treat', proteins: '["chicken"]' },
  none: { food_item_id: null, brand: null, product_name: null, food_type: null, proteins: null },
};

interface Rec {
  target: number;
  targetInitial?: number | null;
  status?: 'active' | 'completed' | 'abandoned';
  endedDay?: number | null;
  /** Trial days carrying a trial-diet meal. */
  mealDays: number[];
  /** Trial days carrying an off-diet TREAT (never coverage). */
  treatDays?: number[];
  /** Trial days carrying an off-diet MEAL (coverage and an exposure). */
  offMealDays?: number[];
  /** Intake rating on the trial meals. */
  rating?: string | null;
  noAllowedSet?: boolean;
  freeChoice?: boolean;
  /** Extra trial-diet bowls, each with its own day, hour and rating (CUL-1344). */
  extraMeals?: Array<{ day: number; hour: number; rating: string | null; food?: ExtraFood }>;
  nowDay: number;
  nowHour?: number;
}

function seed(rec: Rec) {
  const endedKey =
    rec.endedDay != null
      ? (() => {
          const d = onDay(rec.endedDay);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        })()
      : null;
  mockDb.trial = {
    id: 't1',
    started_at: START_KEY,
    target_duration_days: rec.target,
    target_duration_days_initial: rec.targetInitial ?? null,
    target_duration_set_at: null,
    status: rec.status ?? 'active',
    ended_at: endedKey,
    completed_at: null,
    stopped_reason: null,
    outcome: null,
    indication: 'skin',
    food_label: 'Royal Canin Rabbit',
    target_protein: null,
  };
  mockDb.allowed = rec.noAllowedSet
    ? []
    : [
        {
          food_item_id: 'f1', role: 'primary_diet', food_label: 'Royal Canin Rabbit',
          allowed_from: START_KEY, allowed_until: null,
          brand: 'Royal Canin', product_name: 'Rabbit', primary_protein: 'rabbit', proteins: '["rabbit"]',
        },
      ];
  const feedings: Array<Record<string, unknown>> = [];
  for (const d of rec.mealDays) {
    feedings.push({
      event_id: `m${d}`, occurred_at: onDay(d, 8).toISOString(), food_item_id: 'f1',
      brand: 'Royal Canin', product_name: 'Rabbit', food_type: 'meal', proteins: '["rabbit"]',
      intake_rating: rec.rating === undefined ? 'all' : rec.rating,
    });
  }
  for (const m of rec.extraMeals ?? []) {
    feedings.push({
      event_id: `x${m.day}-${m.hour}`, occurred_at: onDay(m.day, m.hour).toISOString(),
      ...EXTRA_FOOD[m.food ?? 'trial'],
      intake_rating: m.rating,
    });
  }
  for (const d of rec.treatDays ?? []) {
    feedings.push({
      event_id: `t${d}`, occurred_at: onDay(d, 19).toISOString(), food_item_id: 'fx',
      brand: 'Acme', product_name: 'Chicken Jerky', food_type: 'treat', proteins: '["chicken"]',
      intake_rating: null,
    });
  }
  for (const d of rec.offMealDays ?? []) {
    feedings.push({
      event_id: `o${d}`, occurred_at: onDay(d, 13).toISOString(), food_item_id: 'fy',
      brand: 'Acme', product_name: 'Chicken Dinner', food_type: 'meal', proteins: '["chicken"]',
      intake_rating: 'all',
    });
  }
  mockDb.feedings = feedings;
  mockDb.arrangements = rec.freeChoice
    ? [{ food_item_id: 'f1', active_from: START_KEY, active_until: null, brand: 'Royal Canin', product_name: 'Rabbit' }]
    : [];
}

async function load(rec: Rec): Promise<{ input: TrialCardInput; facts: TrialFacts | null; ledger: TrialLedger | null }> {
  seed(rec);
  const nowMs = onDay(rec.nowDay, rec.nowHour ?? 20).getTime();
  const [input, core] = await Promise.all([
    loadDietTrialFacts({ pet: PET, nowMs }),
    loadTrialPredicateFacts(PET, nowMs),
  ]);
  const facts = core?.facts ?? null;
  return { input, facts, ledger: buildTrialLedger({ input, facts }) };
}

const startIndex = localDayIndexOf(START_KEY)!;
const idx = (trialDay: number) => startIndex + trialDay - 1;
const days = (l: TrialLedger) => l.rows.flatMap((r) => r.days);

/** The invariants every drawn ledger owes, against the facts it was drawn from. */
function assertInvariants(l: TrialLedger, facts: TrialFacts, input: TrialCardInput) {
  const range = facts.range!;
  // C-3 — the rows partition the caption's two numbers exactly.
  const counted = l.rows.map((r) => r.count).filter((c): c is NonNullable<typeof c> => c !== null);
  expect(counted.reduce((s, c) => s + c.covered, 0)).toBe(facts.coverage!.daysLogged);
  expect(counted.reduce((s, c) => s + c.elapsed, 0)).toBe(facts.coverage!.daysElapsed);
  expect(input.coverage).toEqual({
    daysLogged: facts.coverage!.daysLogged,
    daysElapsed: facts.coverage!.daysElapsed,
  });

  // No row past the target end or the coverage end, whichever is later.
  const targetEnd = startIndex + input.trial!.targetDurationDays - 1;
  const last = Math.max(targetEnd, range.endDayIndex);
  const drawn = days(l);
  expect(Math.max(...drawn.map((d) => d.dayIndex))).toBe(last);
  expect(drawn[0].dayIndex).toBe(startIndex);
  // Days are contiguous and each row is a trial week.
  drawn.forEach((d, i) => expect(d.dayIndex).toBe(startIndex + i));
  l.rows.forEach((r, i) => {
    expect(r.week).toBe(i + 1);
    expect(r.days[0].trialDay).toBe(i * 7 + 1);
    expect(r.days.length).toBeLessThanOrEqual(7);
  });

  // CUL-1855 — the extension band: only on an un-ended trial whose tail clip bit,
  // only past the designed end, never in `count`, painted from its own fact.
  const ext = drawn.filter((d) => d.extension);
  if (l.extension === null) {
    expect(ext).toHaveLength(0);
    l.rows.forEach((r) => expect(r.extensionCount).toBeNull());
  } else {
    expect(input.trial!.status).toBe('active');
    expect(range.coverageClippedAtWindowEnd).toBe(true);
    expect(ext.length).toBeGreaterThan(0);
    ext.forEach((d) => {
      expect(d.dayIndex).toBeGreaterThan(range.endDayIndex);
      expect(d.dayIndex).toBeLessThanOrEqual(targetEnd);
    });
    // Every day after the designed end is in the band, and nothing before it.
    expect(drawn.filter((d) => d.dayIndex > range.endDayIndex)).toEqual(ext);
    expect(ext.filter((d) => d.fill === 'meals_logged').map((d) => d.dayIndex)).toEqual(
      facts.extensionCoveredDayIndices.filter((d) => d <= targetEnd),
    );
    const today = localDayIndex(input.nowMs);
    const reached = ext.filter((d) => d.dayIndex <= today);
    const extCounts = l.rows.map((r) => r.extensionCount).filter((c): c is NonNullable<typeof c> => c !== null);
    expect(extCounts.reduce((s, c) => s + c.elapsed, 0)).toBe(reached.length);
    expect(extCounts.reduce((s, c) => s + c.covered, 0)).toBe(
      reached.filter((d) => d.fill === 'meals_logged').length,
    );
    ext.filter((d) => d.dayIndex > today).forEach((d) => expect(d.fill).toBe('not_reached'));
    // The end line sits on the designed end; the band carries the end set now.
    expect(l.endAfterRowIndex).toBe(Math.floor((range.endDayIndex - startIndex) / 7));
    expect(l.endLabel).toMatch(/, the end you first set\. The count above stops here\.$/);
    expect(l.extension.endLabel).toMatch(new RegExp(`· day ${input.trial!.targetDurationDays}, the end you set$`));
  }
  const countedDays = drawn.filter((d) => !d.extension);

  // The untracked head is exactly the facts' head, never counted, never "none logged".
  const head = drawn.filter((d) => d.fill === 'not_tracked');
  expect(head.length).toBe(facts.untrackedDaysBeforeFirstLog);
  head.forEach((d) => expect(d.dayIndex).toBeLessThan(range.startDayIndex));
  countedDays
    .filter((d) => d.fill === 'none_logged' || d.fill === 'today_open' || d.fill === 'meals_logged')
    .forEach((d) => {
      expect(d.dayIndex).toBeGreaterThanOrEqual(range.startDayIndex);
      expect(d.dayIndex).toBeLessThanOrEqual(range.endDayIndex);
    });
  // "meals logged" is coveredDayIndices, exactly.
  expect(countedDays.filter((d) => d.fill === 'meals_logged').map((d) => d.dayIndex)).toEqual(
    facts.coveredDayIndices,
  );

  // The off-diet overlay: on every drawn day carrying an item, and no other.
  const itemDays = new Set(facts.exposures.items.map((i) => localDayIndexOf(i.occurredAt)!));
  const expected = facts.allowedSetUnavailable
    ? []
    : drawn.filter((d) => itemDays.has(d.dayIndex)).map((d) => d.dayIndex);
  expect(drawn.filter((d) => d.offDiet).map((d) => d.dayIndex)).toEqual(expected);
  // An item the grid does not draw can only be past its last day (a post-target
  // exposure on an overrun, which the receipt carries).
  if (!facts.allowedSetUnavailable) {
    for (const d of itemDays) if (d < startIndex || d > last) expect(d).toBeGreaterThan(last);
  }

  // The lane IS the current row — and only where Home's strip states its ratio.
  const lane = thisWeekLane(l, input);
  if (l.currentRowIndex === null || withholdingReasons(input).length > 0) expect(lane).toBeNull();
  else expect(lane?.row).toBe(l.rows[l.currentRowIndex]);
  // An ended trial has no "this week", and no row says "so far".
  if (input.trial!.status !== 'active') {
    expect(drawn.some((d) => d.fill === 'today_open')).toBe(false);
    expect(l.currentRowIndex).toBeNull();
    expect(l.rows.some((r) => r.count?.soFar)).toBe(false);
  }
  // No counted row below the end line on a trial still running.
  if (input.trial!.status === 'active') {
    l.rows.slice(l.endAfterRowIndex + 1).forEach((r) => expect(r.count).toBeNull());
  }
}

// ── The round-2 frame ────────────────────────────────────────────────────────

describe('buildTrialLedger — the round-2 frame (Mochi, day 23 of 56)', () => {
  it('draws the mock: weeks, fills, counts, edges, one off-diet dot', async () => {
    // Days 1–22 logged except day 11; day 23 (today) open; a treat on day 17.
    const mealDays = Array.from({ length: 22 }, (_, i) => i + 1).filter((d) => d !== 11);
    const { input, facts, ledger } = await load({ target: 56, mealDays, treatDays: [17], nowDay: 23 });
    expect(ledger).not.toBeNull();
    const l = ledger!;
    assertInvariants(l, facts!, input);

    expect(l.rows).toHaveLength(8);
    expect(l.rows.map((r) => r.countLabel)).toEqual([
      '7 of 7', '6 of 7', '7 of 7', '1 of 2 so far', null, null, null, null,
    ]);
    expect(l.rows.map((r) => r.label)).toEqual(['Wk 1', 'Wk 2', 'Wk 3', 'Wk 4', 'Wk 5', 'Wk 6', 'Wk 7', 'Wk 8']);
    expect(l.rows[1].firstDate).toBe('Jul 10');
    expect(l.rows[1].days[3].fill).toBe('none_logged'); // day 11
    expect(l.rows[3].days[1].fill).toBe('today_open'); // day 23
    expect(l.rows[3].days.slice(2).every((d) => d.fill === 'not_reached')).toBe(true);
    expect(days(l).filter((d) => d.offDiet).map((d) => d.trialDay)).toEqual([17]);
    expect(l.startLabel).toBe('Jul 3 · day 1');
    expect(l.endLabel).toBe('Aug 27 · day 56, the end you set');
    expect(l.endAfterRowIndex).toBe(7);
    expect(l.currentRowIndex).toBe(3);
    expect(l.legend).toEqual(['meals_logged', 'none_logged', 'off_diet']);
    expect(l.accessibilityLabel).toBe(
      "Mochi's trial by week: week 1, meals logged 7 of 7 days; week 2, meals logged 6 of 7 days; " +
        'week 3, meals logged 7 of 7 days with an off-diet feeding logged on Jul 19; ' +
        'week 4, meals logged 1 of 2 days so far. Weeks 5 to 8 not reached.',
    );
    expect(thisWeekLane(l, input)?.label).toBe('Week 4 · meals logged 1 of 2 so far');
    expect(thisWeekLane(l, input)?.accessibilityLabel).toBe(
      'Week 4 of the trial: meals logged on 1 of 2 days so far',
    );
  });

  it('never states an off-diet COUNT, even for two feedings on one day', async () => {
    const { ledger } = await load({ target: 56, mealDays: [1, 2, 3], offMealDays: [2], treatDays: [2], nowDay: 3 });
    expect(ledger!.accessibilityLabel).toContain('with an off-diet feeding logged on Jul 4');
    expect(ledger!.accessibilityLabel).not.toMatch(/\b(one|two|2) off-diet/);
  });
});

// ── The off-diet overlay (§3.5, §12 finding 4) ──────────────────────────────

describe('the off-diet mark is an overlay on any fill', () => {
  it('dots a treat-only day (hollow) and a treat in the untracked head', async () => {
    // First meal on day 4: days 1–3 untracked. Treat on day 2 (head) and day 6 (treat-only).
    const { input, facts, ledger } = await load({
      target: 56, mealDays: [4, 5, 7, 8], treatDays: [2, 6], nowDay: 9,
    });
    const l = ledger!;
    assertInvariants(l, facts!, input);
    const byDay = new Map(days(l).map((d) => [d.trialDay, d]));
    expect(byDay.get(2)).toMatchObject({ fill: 'not_tracked', offDiet: true });
    expect(byDay.get(6)).toMatchObject({ fill: 'none_logged', offDiet: true });
    expect(byDay.get(1)).toMatchObject({ fill: 'not_tracked', offDiet: false });
    expect(l.legend).toContain('not_tracked');
    expect(l.rows[0].countLabel).toBe('3 of 4'); // days 4–7: head days are not counted
  });

  it('draws no marks while the allowed set is unusable', async () => {
    const { input, facts, ledger } = await load({
      target: 56, mealDays: [1, 2, 3, 4], treatDays: [2], noAllowedSet: true, nowDay: 5,
    });
    expect(facts!.allowedSetUnavailable).toBe(true);
    expect(facts!.exposures.items.length).toBeGreaterThan(0);
    expect(days(ledger!).some((d) => d.offDiet)).toBe(false);
    assertInvariants(ledger!, facts!, input);
  });
});

// ── Absent (§3.5, §0.3, PM ruling 2026-09-26) ───────────────────────────────

describe('the ledger is absent', () => {
  const clean: Rec = { target: 56, mealDays: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], nowDay: 10 };

  it('draws for the clean baseline these cases perturb (non-vacuity)', async () => {
    expect((await load(clean)).ledger).not.toBeNull();
  });

  it('while the pet may not be eating — a live intake decline', async () => {
    const { input, facts } = await load(clean);
    expect(buildTrialLedger({ input: { ...input, intakeDeclineHeadline: 'Mochi ate less' }, facts })).toBeNull();
  });

  it('while the trial diet is being refused (a refused bowl still counts as a logged day)', async () => {
    const { input, facts, ledger } = await load({ ...clean, rating: 'refused' });
    expect(facts!.coverage!.daysLogged).toBe(10); // the reason the grid would lie
    expect(facts!.trialDietRefusal ?? facts!.rangeRefusal).not.toBeNull();
    expect(ledger).toBeNull();
    // …and a stood-down range refusal hides it too, on the raw reason.
    expect(
      buildTrialLedger({ input: { ...input, trialDietRefusal: null, rangeRefusal: facts!.rangeRefusal }, facts }),
    ).toBeNull();
  });

  it('for a free-fed trial, now or overlapping', async () => {
    expect((await load({ ...clean, freeChoice: true })).ledger).toBeNull();
    const { input, facts } = await load(clean);
    expect(buildTrialLedger({ input: { ...input, freeFedOverlap: true }, facts })).toBeNull();
    expect(buildTrialLedger({ input: { ...input, freeFed: { loggedFeedings: 3 } }, facts })).toBeNull();
  });

  it('at the milestone, and returns the day after (overrun keeps it to the end line)', async () => {
    const all = Array.from({ length: 58 }, (_, i) => i + 1);
    expect((await load({ target: 56, mealDays: all.slice(0, 56), nowDay: 56 })).ledger).toBeNull();
    const over = await load({ target: 56, mealDays: all, treatDays: [58], nowDay: 58 });
    const l = over.ledger!;
    assertInvariants(l, over.facts!, over.input);
    expect(days(l).at(-1)!.trialDay).toBe(56);
    expect(l.currentRowIndex).toBeNull();
    expect(thisWeekLane(l, over.input)).toBeNull();
    // The day-58 exposure is evidence, carried by the receipt, not drawn.
    expect(over.facts!.exposures.items).toHaveLength(1);
    expect(days(l).some((d) => d.offDiet)).toBe(false);
  });


  it('before the designed window closes, an extended trial draws with no band (CUL-1855)', async () => {
    const all = Array.from({ length: 40 }, (_, i) => i + 1);
    const { input, facts, ledger } = await load({ target: 84, targetInitial: 56, mealDays: all, nowDay: 40 });
    assertInvariants(ledger!, facts!, input);
    expect(ledger!.extension).toBeNull();
  });

  it('on an un-ended trial whose window was SHORTENED below its designed length', async () => {
    // Latent (changeTrialWindow refuses a non-forward move), found by the adversarial
    // pass: coverage runs to the designed day 56 while the end line says day 28.
    const all = Array.from({ length: 70 }, (_, i) => i + 1);
    expect((await load({ target: 28, targetInitial: 56, mealDays: all, nowDay: 40 })).ledger).toBeNull();
    expect((await load({ target: 28, targetInitial: 56, mealDays: all, nowDay: 70 })).ledger).toBeNull();
    // Inside both windows the two agree, and it draws.
    const early = await load({ target: 28, targetInitial: 56, mealDays: all.slice(0, 20), nowDay: 20 });
    assertInvariants(early.ledger!, early.facts!, early.input);
  });

  it('when the two reads disagree about coverage', async () => {
    const { input, facts } = await load(clean);
    const stale = { ...input, coverage: { daysLogged: 9, daysElapsed: 10 } };
    expect(buildTrialLedger({ input: stale, facts })).toBeNull();
    expect(buildTrialLedger({ input: { ...input, coverage: null }, facts })).toBeNull();
    expect(buildTrialLedger({ input, facts: null })).toBeNull();
    expect(buildTrialLedger({ input: { ...input, trial: null }, facts })).toBeNull();
  });
});

// ── The extension weeks (CUL-1855, PM ruling option A) ──────────────────────

describe('the extension weeks of a trial extended past its designed window (CUL-1855)', () => {
  const upTo = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

  it("draws the PM's record: 56 counted days, then the band to day 84", async () => {
    // Set for 56, extended to 84, every day logged, today is day 78.
    const { input, facts, ledger } = await load({
      target: 84, targetInitial: 56, mealDays: upTo(78), offMealDays: [30, 61], nowDay: 78,
    });
    const l = ledger!;
    expect(l).not.toBeNull();
    assertInvariants(l, facts!, input);
    expect(facts!.coverage).toMatchObject({ daysLogged: 56, daysElapsed: 56 });
    expect(l.rows).toHaveLength(12);
    expect(l.rows.map((r) => r.countLabel)).toEqual([...Array(8).fill('7 of 7'), null, null, null, null]);
    expect(l.rows.map((r) => r.extensionCountLabel)).toEqual([
      ...Array(8).fill(null), '7 of 7', '7 of 7', '7 of 7', '1 of 1 so far',
    ]);
    expect(l.endAfterRowIndex).toBe(7);
    expect(l.endLabel).toBe('Aug 27 · day 56, the end you first set. The count above stops here.');
    expect(l.extension).toEqual({
      headerLabel: 'Extended to Sep 24 · not in the count above',
      endLabel: 'Sep 24 · day 84, the end you set',
    });
    // The off-diet meal on day 61 is marked in the band; day 30's in the count.
    const byDay = new Map(days(l).map((d) => [d.trialDay, d]));
    expect(byDay.get(30)!.offDiet).toBe(true);
    expect(byDay.get(61)).toMatchObject({ offDiet: true, extension: true });
    expect(byDay.get(79)!.fill).toBe('not_reached');
    // No lane on Home: the lane is the counted ratio drawn, and these days aren't in it.
    expect(l.currentRowIndex).toBeNull();
    expect(thisWeekLane(l, input)).toBeNull();
    // A screen reader hears the band after the count, and never inside it.
    expect(l.accessibilityLabel).toContain(
      'week 8, meals logged 7 of 7 days. Extended weeks, not in the count: week 9, meals logged 7 of 7 days with an off-diet feeding logged on Sep 1;',
    );
    expect(l.accessibilityLabel).toContain('week 12, meals logged 1 of 1 day so far.');
  });

  it('paints a gap in the band hollow, and today open', async () => {
    const mealDays = upTo(70).filter((d) => d !== 63);
    // A treat-only day 63 is not a logged meal there, as it is not one in the count.
    const { input, facts, ledger } = await load({ target: 84, targetInitial: 56, mealDays, treatDays: [63], nowDay: 71 });
    assertInvariants(ledger!, facts!, input);
    const byDay = new Map(days(ledger!).map((d) => [d.trialDay, d.fill]));
    expect(byDay.get(63)).toBe('none_logged');
    expect(byDay.get(71)).toBe('today_open');
    expect(ledger!.rows[8].extensionCountLabel).toBe('6 of 7');
    expect(ledger!.rows[10].extensionCountLabel).toBe('0 of 1 so far');
  });

  it('splits a week that straddles the designed end, each half counted on its own', async () => {
    // Designed 52 days (ends mid-week 8), extended to 66.
    const { input, facts, ledger } = await load({ target: 66, targetInitial: 52, mealDays: upTo(60), nowDay: 60 });
    const l = ledger!;
    assertInvariants(l, facts!, input);
    const wk8 = l.rows[7];
    expect(wk8.countLabel).toBe('3 of 3');
    expect(wk8.extensionCountLabel).toBe('4 of 4');
    expect(wk8.days.filter((d) => d.extension).map((d) => d.trialDay)).toEqual([53, 54, 55, 56]);
    expect(wk8.extensionFirstDate).toBe('Aug 24');
  });

  it("withholds the whole ledger over an unfinished bowl in today's extension week (CUL-1344's rule)", async () => {
    const base = { target: 84, targetInitial: 56, mealDays: upTo(66), nowDay: 66 };
    expect((await load(base)).ledger).not.toBeNull();
    const refused = await load({ ...base, extraMeals: [{ day: 65, hour: 18, rating: 'refused' }] });
    expect(refused.facts!.unfinishedMealDayIndices).toContain(idx(65));
    expect(refused.ledger).toBeNull();
    // A bowl left in an earlier extension week does not withhold this week.
    const earlier = await load({ ...base, extraMeals: [{ day: 58, hour: 18, rating: 'refused' }] });
    expect(earlier.ledger).not.toBeNull();
  });

  it('keeps the band off an ended trial, and off a trial past its new end too', async () => {
    const ended = await load({ target: 84, targetInitial: 56, mealDays: upTo(70), nowDay: 72, status: 'completed', endedDay: 70 });
    if (ended.ledger) expect(ended.ledger.extension).toBeNull();
    const past = await load({ target: 84, targetInitial: 56, mealDays: upTo(90), nowDay: 90 });
    if (past.ledger) {
      assertInvariants(past.ledger, past.facts!, past.input);
      expect(Math.max(...days(past.ledger).map((d) => d.trialDay))).toBe(84);
    }
  });

  it('stays absent on an overrun whose tail clip did not bite (no fact reaches those days)', async () => {
    // Unreachable through the loaders, which always read the whole trial, so the clip
    // always bites; pinned directly so the defensive gate cannot drift away unseen.
    const { input, facts } = await load({ target: 84, targetInitial: 56, mealDays: upTo(70), nowDay: 70 });
    expect(buildTrialLedger({ input, facts })).not.toBeNull();
    const unclipped = { ...facts!, range: { ...facts!.range!, coverageClippedAtWindowEnd: false } };
    expect(buildTrialLedger({ input, facts: unclipped })).toBeNull();
  });

  it('the extension fact is empty wherever the tail clip did not bite', async () => {
    const plain = await load({ target: 56, mealDays: upTo(40), nowDay: 40 });
    expect(plain.facts!.extensionCoveredDayIndices).toEqual([]);
    const overrun = await load({ target: 56, mealDays: upTo(60), nowDay: 60 });
    // An overrun of an UN-extended trial: no window to draw into, the grid ends at 56.
    expect(Math.max(...days(overrun.ledger!).map((d) => d.trialDay))).toBe(56);
    expect(overrun.ledger!.extension).toBeNull();
  });
});

// ── The lane's own gate (§5.1, found by the adversarial pass) ───────────────

describe('thisWeekLane', () => {
  it('is withheld wherever Home withholds its ratio, though the ledger still draws', async () => {
    // First log on day 4: an untracked head, one of the strip's withholding reasons.
    const { input, facts, ledger } = await load({ target: 56, mealDays: [4, 5, 6, 7, 8, 9, 10], nowDay: 10 });
    expect(withholdingReasons(input)).toContain('untracked_head');
    expect(ledger).not.toBeNull();
    expect(ledger!.currentRowIndex).toBe(1);
    expect(thisWeekLane(ledger, input)).toBeNull();
    assertInvariants(ledger!, facts!, input);
  });

  it('draws the current row where nothing is withheld', async () => {
    const all = Array.from({ length: 10 }, (_, i) => i + 1);
    const { input, ledger } = await load({ target: 56, mealDays: all, nowDay: 10 });
    expect(withholdingReasons(input)).toEqual([]);
    expect(thisWeekLane(ledger, input)?.row).toBe(ledger!.rows[1]);
    expect(thisWeekLane(null, input)).toBeNull();
  });
});

// ── Ended trials (PM ruling 2) ───────────────────────────────────────────────

describe('ended trials', () => {
  it('a trial completed after its target keeps its counted days past the end line', async () => {
    const all = Array.from({ length: 61 }, (_, i) => i + 1);
    const { input, facts, ledger } = await load({
      target: 56, mealDays: all, status: 'completed', endedDay: 61, nowDay: 63,
    });
    const l = ledger!;
    assertInvariants(l, facts!, input);
    expect(facts!.coverage!.daysElapsed).toBe(61);
    expect(days(l).at(-1)!.trialDay).toBe(61);
    expect(l.endAfterRowIndex).toBe(7);
    expect(l.rows).toHaveLength(9);
    expect(l.currentRowIndex).toBeNull();
  });

  it('a trial completed TODAY has no current row, no "so far" and no lane', async () => {
    const all = Array.from({ length: 20 }, (_, i) => i + 1);
    const { input, facts, ledger } = await load({
      target: 28, mealDays: all, status: 'completed', endedDay: 20, nowDay: 20,
    });
    const l = ledger!;
    assertInvariants(l, facts!, input);
    expect(l.rows[2].countLabel).toBe('6 of 6');
    expect(l.currentRowIndex).toBeNull();
    expect(thisWeekLane(l, input)).toBeNull();
    expect(l.accessibilityLabel).not.toContain('so far');
  });

  it("an ended trial's last day, unlogged, is none logged — never today open", async () => {
    const { input, facts, ledger } = await load({
      target: 28, mealDays: [1, 2, 3, 4, 5], status: 'abandoned', endedDay: 6, nowDay: 6,
    });
    assertInvariants(ledger!, facts!, input);
    expect(days(ledger!).find((d) => d.trialDay === 6)!.fill).toBe('none_logged');
    expect(days(ledger!).some((d) => d.fill === 'today_open')).toBe(false);
  });

  it('a stray ended_at on an ACTIVE row does not reopen the shortened-window hole', async () => {
    const all = Array.from({ length: 40 }, (_, i) => i + 1);
    const { input, facts } = await load({ target: 28, targetInitial: 56, mealDays: all, nowDay: 40 });
    const stray = { ...input, trial: { ...input.trial!, endedAt: '2026-08-11' } };
    expect(buildTrialLedger({ input: stray, facts })).toBeNull();
  });

  it('an abandoned trial draws the days it never reached as not reached', async () => {
    const { input, facts, ledger } = await load({
      target: 56, mealDays: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], status: 'abandoned', endedDay: 10, nowDay: 14,
    });
    const l = ledger!;
    assertInvariants(l, facts!, input);
    const byDay = new Map(days(l).map((d) => [d.trialDay, d.fill]));
    expect(byDay.get(12)).toBe('not_reached');
    expect(byDay.get(14)).toBe('not_reached'); // today, but the trial had ended
    expect(l.currentRowIndex).toBeNull();
  });
});

// ── The property sweep (C-3 over the real loaders) ───────────────────────────

describe('parity property: rows partition the coverage sentence on every drawn record', () => {
  // A small seeded generator, so a failure names its seed and reproduces.
  function rng(seedValue: number) {
    let s = seedValue >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 2 ** 32;
    };
  }

  it('holds across 400 generated records, and the sweep reaches every shape', async () => {
    const shapes = {
      drawn: 0, head: 0, gap: 0, dots: 0, endedLate: 0, overrun: 0, partialRow: 0,
      endedToday: 0, movedWindow: 0, lane: 0, band: 0, straddle: 0,
    };
    for (let seedValue = 1; seedValue <= 400; seedValue++) {
      const r = rng(seedValue);
      const target = [28, 42, 56, 60][Math.floor(r() * 4)];
      const nowDay = 1 + Math.floor(r() * (target + 20));
      const ended = r() < 0.25;
      const endedDay = ended
        ? r() < 0.25
          ? nowDay // ended today
          : Math.max(1, Math.min(nowDay, 1 + Math.floor(r() * (target + 10))))
        : null;
      // A moved window: extended (designed < set) or shortened (designed > set).
      const moved = r();
      // Half the extensions move a designed end that falls mid-week (CUL-1855's straddle).
      const targetInitial = moved < 0.07 ? target - 17 : moved < 0.15 ? target - 14 : moved < 0.25 ? target + 14 : null;
      const firstLog = r() < 0.3 ? 1 + Math.floor(r() * 6) : 1;
      const density = 0.5 + r() * 0.5;
      const lastDay = endedDay ?? nowDay;
      const mealDays: number[] = [];
      const treatDays: number[] = [];
      const offMealDays: number[] = [];
      for (let d = 1; d <= lastDay + 3; d++) {
        if (d >= firstLog && r() < density) mealDays.push(d);
        if (r() < 0.06) treatDays.push(d);
        if (r() < 0.03) offMealDays.push(d);
      }
      const rec: Rec = {
        target, targetInitial, mealDays, treatDays, offMealDays, nowDay,
        status: ended ? (r() < 0.5 ? 'completed' : 'abandoned') : 'active',
        endedDay,
      };
      const { input, facts, ledger } = await load(rec);
      if (!ledger || !facts) continue;
      try {
        assertInvariants(ledger, facts, input);
      } catch (e) {
        throw new Error(`seed ${seedValue}: ${(e as Error).message}\n${JSON.stringify(rec)}`);
      }
      shapes.drawn += 1;
      const all = days(ledger);
      if (all.some((d) => d.fill === 'not_tracked')) shapes.head += 1;
      if (all.some((d) => d.fill === 'none_logged')) shapes.gap += 1;
      if (all.some((d) => d.offDiet)) shapes.dots += 1;
      if (all.at(-1)!.dayIndex > startIndex + target - 1) shapes.endedLate += 1;
      if (facts.range!.closedByOverrun) shapes.overrun += 1;
      if (ledger.rows.at(-1)!.days.length < 7) shapes.partialRow += 1;
      if (rec.endedDay === nowDay) shapes.endedToday += 1;
      if (targetInitial !== null) shapes.movedWindow += 1;
      if (thisWeekLane(ledger, input)) shapes.lane += 1;
      if (ledger.extension) shapes.band += 1;
      if (ledger.rows.some((row) => row.count && row.extensionCount)) shapes.straddle += 1;
    }
    // Non-vacuity: the sweep is only evidence if it reached each shape it claims to.
    expect(shapes.drawn).toBeGreaterThan(150);
    expect(shapes.head).toBeGreaterThan(10);
    expect(shapes.gap).toBeGreaterThan(50);
    expect(shapes.dots).toBeGreaterThan(50);
    expect(shapes.endedLate).toBeGreaterThan(3);
    expect(shapes.overrun).toBeGreaterThan(3);
    expect(shapes.partialRow).toBeGreaterThan(3);
    expect(shapes.endedToday).toBeGreaterThan(3);
    expect(shapes.movedWindow).toBeGreaterThan(10);
    expect(shapes.lane).toBeGreaterThan(10);
    expect(shapes.band).toBeGreaterThan(10);
    expect(shapes.straddle).toBeGreaterThan(3);
  });
});

// ── Day keys under the extreme zones (B-514, C-29) ──────────────────────────

describe('day keys at 00:30 and 23:30 local, in UTC−10, UTC+12:45 and UTC+14', () => {
  // July: Chatham is on standard time (+12:45); neither other zone has DST.
  const ZONES = [
    { tz: 'Pacific/Honolulu', offsetMin: -600 },
    { tz: 'Pacific/Chatham', offsetMin: 765 },
    { tz: 'Pacific/Kiritimati', offsetMin: 840 },
  ];
  /** The UTC instant of a wall-clock time on trial day `n`, in a zone. */
  const wall = (offsetMin: number, n: number, h: number, m: number) =>
    new Date(Date.UTC(2026, 6, 3 + n - 1, h, m) - offsetMin * 60_000).toISOString();

  it.each(ZONES)('$tz', ({ tz, offsetMin }) => {
    const feed = (id: string, day: number, h: number, m: number, off: boolean) => ({
      eventId: id,
      occurredAt: wall(offsetMin, day, h, m),
      foodItemId: off ? 'fx' : 'f1',
      foodKey: null,
      label: off ? 'Acme Chicken Jerky' : 'Royal Canin Rabbit',
      foodType: off ? 'treat' : 'meal',
      proteins: off ? ['chicken'] : ['rabbit'],
      intakeRating: off ? null : 'all',
    });
    const nowMs = new Date(wall(offsetMin, 10, 23, 30)).getTime();
    const trial = { id: 't1', startedAt: START_KEY, endedAt: null, targetDurationDays: 28, species: 'dog' as const };
    const facts = computeTrialFacts({
      trial,
      allowedFoods: [{
        foodItemId: 'f1', foodKey: null, label: 'Royal Canin Rabbit', role: 'primary_diet',
        allowedFrom: START_KEY, allowedUntil: null, primaryProtein: 'rabbit', proteins: ['rabbit'],
      }],
      feedings: [
        feed('a', 3, 0, 30, false), // the first log, at the very start of day 3
        feed('b', 5, 23, 30, false), // the very end of day 5
        feed('c', 7, 23, 30, true), // a treat-only day 7, at its last half hour
        feed('d', 8, 0, 30, true), // …and one at the first half hour of day 8
      ],
      doses: [],
      arrangements: [],
      nowMs,
      timeZone: tz,
    });
    const input: TrialCardInput = {
      trial: { id: 't1', status: 'active', startedAt: START_KEY, endedAt: null, targetDurationDays: 28 },
      nowMs,
      petName: 'Mochi',
      coverage: { daysLogged: facts.coverage!.daysLogged, daysElapsed: facts.coverage!.daysElapsed },
      // As `loadDietTrialFacts` passes it through: the head is a withholding reason.
      untrackedDaysBeforeFirstLog: facts.untrackedDaysBeforeFirstLog,
    };
    const l = buildTrialLedger({ input, facts, timeZone: tz })!;
    expect(l).not.toBeNull();
    const fill = days(l).map((d) => d.fill);
    expect(fill.slice(0, 14)).toEqual([
      'not_tracked', 'not_tracked', 'meals_logged', 'none_logged', 'meals_logged', 'none_logged', 'none_logged',
      'none_logged', 'none_logged', 'today_open', 'not_reached', 'not_reached', 'not_reached', 'not_reached',
    ]);
    expect(days(l).filter((d) => d.offDiet).map((d) => d.trialDay)).toEqual([7, 8]);
    expect(l.rows.map((r) => r.countLabel).slice(0, 2)).toEqual(['2 of 5', '0 of 3 so far']);
    expect(facts.coverage).toMatchObject({ daysLogged: 2, daysElapsed: 8 });
    expect(thisWeekLane(l, input)).toBeNull(); // an untracked head: Home withholds its ratio
    expect(l.currentRowIndex).toBe(1);
  });
});

// CUL-1344 (PM ruling 2026-09-27): a rated, unfinished trial-diet bowl in the current
// trial week withholds the ledger (and so the lane) BELOW the refusal fact's floors.
// The adversarial pass on TS-5 executed the case this closes: a day-1 cat with two
// refused bowls cleared no floor, and the lane drew "1 of 1 so far".
describe('an unfinished bowl in the current trial week, below the refusal floor', () => {
  const clean: Rec = { target: 56, mealDays: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], nowDay: 10 };

  it('the day-1 cat with 2 of 2 rated bowls refused: no fact fires, and no ledger or lane draws', async () => {
    const { input, facts, ledger } = await load({
      target: 56,
      mealDays: [],
      extraMeals: [
        { day: 1, hour: 8, rating: 'refused' },
        { day: 1, hour: 18, rating: 'refused' },
      ],
      nowDay: 1,
      nowHour: 20,
    });
    // The premise, asserted: nothing the strip withholds on has fired.
    expect(facts!.trialDietRefusal).toBeNull();
    expect(facts!.rangeRefusal).toBeNull();
    expect(withholdingReasons(input)).toEqual([]);
    expect(facts!.coveredDayIndices).toEqual([idx(1)]); // the day WOULD draw filled
    expect(facts!.unfinishedDayIndices).toEqual([idx(1)]);
    expect(ledger).toBeNull();
    expect(thisWeekLane(ledger, input)).toBeNull();
  });

  it('"some" and "picked" are unfinished too; "most" is finished (the one predicate, feedingWasFinished)', async () => {
    for (const rating of ['some', 'picked']) {
      const r = await load({ ...clean, extraMeals: [{ day: 10, hour: 13, rating }] });
      expect(r.facts!.unfinishedDayIndices).toEqual([idx(10)]);
      expect(r.ledger).toBeNull();
    }
    const most = await load({ ...clean, extraMeals: [{ day: 10, hour: 13, rating: 'most' }] });
    expect(most.facts!.unfinishedDayIndices).toEqual([]);
    expect(most.ledger).not.toBeNull();
  });

  it('an unrated bowl is unknown, never unfinished: the ledger still draws', async () => {
    const r = await load({ ...clean, rating: null });
    expect(r.facts!.unfinishedDayIndices).toEqual([]);
    expect(r.ledger).not.toBeNull();
  });

  it('an unfinished bowl in an EARLIER trial week does not withhold this week', async () => {
    // Day 3 is week 1; today (day 10) is week 2.
    const r = await load({ ...clean, extraMeals: [{ day: 3, hour: 13, rating: 'refused' }] });
    expect(r.facts!.trialDietRefusal).toBeNull();
    expect(r.facts!.unfinishedDayIndices).toEqual([idx(3)]);
    expect(r.ledger).not.toBeNull();
    assertInvariants(r.ledger!, r.facts!, r.input);
  });

  // CUL-1348 (PM ruling 2026-10-03, 1(a)): the withhold reads the WIDE population,
  // every rated non-treat meal. The adversarial pass on CUL-1344 executed the case:
  // two refused bowls logged against a re-photographed bag, or against no food, never
  // reached the narrow set, and the lane drew "1 of 1 so far".
  it.each(['rephoto', 'none'] as const)(
    'the day-1 cat whose 2 refused bowls were logged against %s: no fact fires, and no ledger or lane draws',
    async (food) => {
      const { input, facts, ledger } = await load({
        target: 56,
        mealDays: [],
        extraMeals: [
          { day: 1, hour: 8, rating: 'refused', food },
          { day: 1, hour: 18, rating: 'refused', food },
        ],
        nowDay: 1,
        nowHour: 20,
      });
      // The premise, asserted: the narrow set misses these rows and no fact fired.
      expect(facts!.trialDietRefusal).toBeNull();
      expect(facts!.rangeRefusal).toBeNull();
      expect(withholdingReasons(input)).toEqual([]);
      expect(facts!.unfinishedDayIndices).toEqual([]);
      expect(facts!.coveredDayIndices).toEqual([idx(1)]); // the day WOULD draw filled
      expect(facts!.unfinishedMealDayIndices).toEqual([idx(1)]);
      expect(ledger).toBeNull();
      expect(thisWeekLane(ledger, input)).toBeNull();
    },
  );

  it('a refused rival meal withholds the week too (the ruled cost: withholding only)', async () => {
    const r = await load({ ...clean, extraMeals: [{ day: 10, hour: 13, rating: 'refused', food: 'rival' }] });
    expect(r.facts!.unfinishedDayIndices).toEqual([]);
    expect(r.facts!.unfinishedMealDayIndices).toEqual([idx(10)]);
    expect(r.facts!.trialDietRefusal).toBeNull();
    expect(r.ledger).toBeNull();
  });

  it('a refused TREAT never withholds: the wide population excludes treats, as the fill does', async () => {
    const r = await load({ ...clean, extraMeals: [{ day: 10, hour: 19, rating: 'refused', food: 'treat' }] });
    expect(r.facts!.unfinishedMealDayIndices).toEqual([]);
    expect(r.ledger).not.toBeNull();
  });

  it('the wide set is a superset of the narrow one, so the move can only withhold more', async () => {
    const r = await load({
      ...clean,
      extraMeals: [
        { day: 3, hour: 13, rating: 'refused' },
        { day: 5, hour: 13, rating: 'picked', food: 'none' },
        { day: 9, hour: 13, rating: 'some', food: 'rephoto' },
      ],
    });
    expect(r.facts!.unfinishedDayIndices).toEqual([idx(3)]);
    expect(r.facts!.unfinishedMealDayIndices).toEqual([idx(3), idx(5), idx(9)]);
    for (const d of r.facts!.unfinishedDayIndices) expect(r.facts!.unfinishedMealDayIndices).toContain(d);
    expect(r.ledger).toBeNull(); // day 9 is the current week (day 10)
  });

  it('the union: a trial-diet bowl typed treat is narrow-only, and still withholds', async () => {
    const r = await load({ ...clean, extraMeals: [{ day: 10, hour: 13, rating: 'refused', food: 'trialTypedTreat' }] });
    expect(r.facts!.unfinishedDayIndices).toEqual([idx(10)]);
    expect(r.facts!.unfinishedMealDayIndices).toEqual([idx(10)]);
    expect(r.ledger).toBeNull();
  });

  it('an unfinished unmatched bowl in an EARLIER trial week does not withhold this week (the boundary stays as ruled)', async () => {
    const r = await load({ ...clean, extraMeals: [{ day: 7, hour: 13, rating: 'refused', food: 'none' }] });
    expect(r.facts!.unfinishedMealDayIndices).toEqual([idx(7)]);
    expect(r.ledger).not.toBeNull();
    assertInvariants(r.ledger!, r.facts!, r.input);
  });

  it('the week boundary: day 8 is the current week on day 10, day 7 is not', async () => {
    const inWeek = await load({ ...clean, extraMeals: [{ day: 8, hour: 13, rating: 'refused' }] });
    expect(inWeek.ledger).toBeNull();
    const before = await load({ ...clean, extraMeals: [{ day: 7, hour: 13, rating: 'refused' }] });
    expect(before.ledger).not.toBeNull();
  });
});

