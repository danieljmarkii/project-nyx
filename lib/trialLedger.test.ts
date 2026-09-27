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
import { localDayIndexOf } from './utils';

// ── The fixture record ───────────────────────────────────────────────────────

const PET = { id: 'pet-1', name: 'Mochi', species: 'dog' as const };
const START = { y: 2026, m: 6, d: 3 }; // Jul 3, 2026 (month is 0-based)
const START_KEY = '2026-07-03';

/** Local wall time on trial day `n` (day 1 = the start day). */
function onDay(n: number, hour = 12, minute = 0): Date {
  return new Date(START.y, START.m, START.d + n - 1, hour, minute);
}

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

  // The untracked head is exactly the facts' head, never counted, never "none logged".
  const head = drawn.filter((d) => d.fill === 'not_tracked');
  expect(head.length).toBe(facts.untrackedDaysBeforeFirstLog);
  head.forEach((d) => expect(d.dayIndex).toBeLessThan(range.startDayIndex));
  drawn
    .filter((d) => d.fill === 'none_logged' || d.fill === 'today_open' || d.fill === 'meals_logged')
    .forEach((d) => {
      expect(d.dayIndex).toBeGreaterThanOrEqual(range.startDayIndex);
      expect(d.dayIndex).toBeLessThanOrEqual(range.endDayIndex);
    });
  // "meals logged" is coveredDayIndices, exactly.
  expect(drawn.filter((d) => d.fill === 'meals_logged').map((d) => d.dayIndex)).toEqual(
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
    expect(thisWeekLane(l, input)?.label).toBe('Week 4 · 1 of 2 so far');
    expect(thisWeekLane(l, input)?.accessibilityLabel).toBe(
      'This trial week, week 4: meals logged on 1 of 2 days so far',
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

  it('on an extended trial past its designed window (PM ruling 1, CUL-1317)', async () => {
    const all = Array.from({ length: 70 }, (_, i) => i + 1);
    const { facts, ledger } = await load({ target: 84, targetInitial: 56, mealDays: all, nowDay: 70 });
    expect(facts!.range!.endDayIndex).toBe(idx(56));
    expect(ledger).toBeNull();
    // Before the designed window closes, the extended trial still draws.
    expect((await load({ target: 84, targetInitial: 56, mealDays: all.slice(0, 40), nowDay: 40 })).ledger).not.toBeNull();
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
      endedToday: 0, movedWindow: 0, lane: 0,
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
      const targetInitial = moved < 0.15 ? target - 14 : moved < 0.25 ? target + 14 : null;
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
