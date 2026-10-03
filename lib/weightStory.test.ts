// The weight lane's predicate (EN-8, PR-19, CUL-1413). Every worked case in
// docs/nyx-weight-lane-requirements.md §5.3 and every counterexample on
// docs/clinical-ruling-sheet-2026-10.md §2.3, driven through the real function, plus the
// properties the spec names: the caveat and a raised row never together, an estimate never
// anchors, confirmation both ways, order invariance.
import {
  weightStory,
  noiseBandKg,
  isJuvenile,
  WEIGHT_RULES,
  type WeightReading,
  type WeightStoryInput,
} from './weightStory';

const NOW = Date.parse('2026-10-03T12:00:00Z');
const ADULT = '2020-01-01';
const home = (kg: number, at: string): WeightReading => ({ kg, occurredAt: `${at}T09:00:00Z`, source: 'home_scale' });
const clinic = (kg: number, at: string): WeightReading => ({ kg, occurredAt: `${at}T09:00:00Z`, source: 'clinic' });
const estimate = (kg: number, at: string): WeightReading => ({ kg, occurredAt: `${at}T09:00:00Z`, source: 'estimate' });
const story = (readings: WeightReading[], extra: Partial<WeightStoryInput> = {}) =>
  weightStory({ readings, nowMs: NOW, dateOfBirth: ADULT, ...extra });

describe('the states below a comparison', () => {
  it('none with no readings, one_reading with one', () => {
    expect(story([]).state).toBe('none');
    const one = story([clinic(3.73, '2026-09-16')]);
    expect(one.state).toBe('one_reading');
    expect(one.latest).toEqual({ kg: 3.73, occurredAt: '2026-09-16T09:00:00Z', source: 'clinic', confirmed: true });
    expect(story([home(3.73, '2026-09-16')]).latest?.confirmed).toBe(false);
  });

  it('a reading outside the 12-month window is not counted', () => {
    expect(story([home(4.4, '2025-09-01'), clinic(3.73, '2026-09-16')]).state).toBe('one_reading');
  });

  it('a future reading is not counted', () => {
    expect(story([clinic(3.73, '2026-09-16'), clinic(3.0, '2026-12-01')]).state).toBe('one_reading');
  });
});

describe('spec §5.3 worked cases', () => {
  const steady = [home(4.5, '2026-06-03'), home(4.23, '2026-07-03'), home(3.98, '2026-08-03'), home(3.74, '2026-09-03')];

  it('a steady 1.5%-a-week loss, monthly at home: a plain-row state at the 3rd reading, a row at the 4th', () => {
    const third = weightStory({ readings: steady.slice(0, 3), nowMs: Date.parse('2026-08-04T00:00:00Z'), dateOfBirth: ADULT });
    expect(third.row).toBeNull();
    // 4.23 is a confirmed level and 3.98 one reading below it past 5%: CUL-1390 W5's state.
    expect(third.state).toBe('drop_unconfirmed');
    const fourth = story(steady);
    expect(fourth.row).not.toBeNull();
    // W2 (adopted with W1): 4.50 → 3.74 is 0.76 kg, which confirms both ends; 16.9% is firm.
    // The sheet's "soft at the 4th reading" predates W2's adoption; this is the louder reading.
    expect(fourth.state).toBe('drop_firm');
    expect(fourth.row?.basis).toBe('noise_scaled');
    expect(fourth.row?.high.kg).toBe(4.5);
    expect(fourth.row?.low.kg).toBe(3.74);
  });

  it('a stable cat with one spike: no row, and the caveat (one end is a single reading)', () => {
    const s = story([home(4.0, '2026-06-04'), home(4.0, '2026-07-04'), home(4.2, '2026-08-04'), home(4.0, '2026-09-04')]);
    expect(s.row).toBeNull();
    expect(s.state).toBe('within_noise');
    expect(s.highBefore).toMatchObject({ kg: 4.2, confirmed: false });
  });

  it("GAP-20's counterexample 4.0, 4.5, 4.05: no row, no plain row, and the sentence names the peak as one reading", () => {
    const s = story([home(4.0, '2026-07-04'), home(4.5, '2026-08-04'), home(4.05, '2026-09-04')]);
    expect(s.row).toBeNull();
    expect(s.state).toBe('down_unsupported');
    expect(s.highBefore).toMatchObject({ kg: 4.5, confirmed: false });
    expect(s.latest).toMatchObject({ kg: 4.05, confirmed: false });
  });

  it('a kitten levelling off: nothing', () => {
    const s = weightStory({
      readings: [home(2.05, '2026-09-01'), home(2.02, '2026-09-08'), home(2.04, '2026-09-15')],
      nowMs: NOW,
      dateOfBirth: '2026-03-01',
    });
    expect(s.row).toBeNull();
  });

  it('clinic 4.50, then a home scale that reads 0.25 low twice: nothing (line plus band)', () => {
    const s = story([clinic(4.5, '2026-07-01'), home(4.25, '2026-08-01'), home(4.26, '2026-09-01')]);
    expect(s.row).toBeNull();
  });
});

describe('ruling sheet §2.3 counterexamples', () => {
  it('W1/W2 · the Nyx record (4.4 kg home in June, 3.73 kg at the clinic): the firm row, both ends named', () => {
    const s = story([home(4.4, '2026-06-15'), clinic(3.73, '2026-09-16')]);
    expect(s.state).toBe('drop_firm');
    expect(s.row).toMatchObject({
      tier: 'firm',
      basis: 'noise_scaled',
      mixedInstruments: true,
      high: { kg: 4.4, source: 'home_scale', confirmed: true },
      low: { kg: 3.73, source: 'clinic', confirmed: true },
    });
  });

  it('W1 · the Nyx record with Sep 16 left on a home scale: still the firm row (W2 confirms both ends)', () => {
    expect(story([home(4.4, '2026-06-15'), home(3.73, '2026-09-16')]).state).toBe('drop_firm');
  });

  it('W1 · today\'s Nyx record (one reading): silent', () => {
    expect(story([home(3.73, '2026-09-16')]).row).toBeNull();
  });

  it('W1 · a lone high reading, then lower readings that differ: the soft row, saying the high was one reading', () => {
    // 4.2 once, then three readings that are not exact copies (the sheet's 3.73 × 3, see below).
    const s = story([home(4.2, '2026-06-03'), home(3.74, '2026-07-03'), home(3.73, '2026-08-03'), home(3.72, '2026-09-03')]);
    expect(s.state).toBe('drop_confirmed');
    expect(s.row).toMatchObject({ tier: 'soft', basis: 'single_high', high: { kg: 4.2, confirmed: false } });
  });

  it('⚠ W1 · the sheet\'s literal 4.2 then 3.73 × 3: silent, because exact copies never pair (§4.3; filed on CUL-1413)', () => {
    const s = story([home(4.2, '2026-06-03'), home(3.73, '2026-07-03'), home(3.73, '2026-08-03'), home(3.73, '2026-09-03')]);
    expect(s.row).toBeNull();
  });

  it('W2 · a 3 kg cat, 3.0 once then 2.6 twice: the soft row through W1\'s fix', () => {
    const s = story([home(3.0, '2026-07-03'), home(2.6, '2026-08-03'), home(2.61, '2026-09-03')]);
    expect(s.row).toMatchObject({ tier: 'soft', basis: 'single_high' });
  });

  it('W2 · 0.6 kg confirms both ends but the 5% line still applies: a 30 kg dog down 0.6 kg raises nothing', () => {
    expect(story([home(30, '2026-08-03'), home(29.4, '2026-09-03')]).row).toBeNull();
  });

  it('W4 · a healthy cat at 4.12 kg in March, 3.90 kg in July on a kitchen scale: needs two agreeing readings', () => {
    const one = story([home(4.12, '2026-03-03'), home(3.9, '2026-07-03')]);
    expect(one.row).toBeNull();
    // Two agreeing readings at each end confirm both levels: 4.10 → 3.91 is 4.6%, under 5%.
    const pairs = story([home(4.12, '2026-03-03'), home(4.1, '2026-04-03'), home(3.9, '2026-07-03'), home(3.91, '2026-08-03')]);
    expect(pairs.row).toBeNull();
    // A real 6% between confirmed levels fires.
    const real = story([home(4.12, '2026-03-03'), home(4.1, '2026-04-03'), home(3.84, '2026-07-03'), home(3.85, '2026-08-03')]);
    expect(real.row).toMatchObject({ tier: 'soft', basis: 'confirmed_levels' });
  });

  it('W5 · a kitten weighed weekly that peaks then slides raises a row once a confirmed drop clears the band', () => {
    const kg = [1.0, 1.1, 1.2, 1.1, 1.05, 1.0, 0.95];
    const days = ['2026-08-01', '2026-08-08', '2026-08-15', '2026-08-22', '2026-08-29', '2026-09-05', '2026-09-12'];
    const kitten = (n: number) =>
      weightStory({ readings: kg.slice(0, n).map((k, i) => home(k, days[i])), nowMs: NOW, dateOfBirth: '2026-04-01' });
    const firstRow = [3, 4, 5, 6, 7].find((n) => kitten(n).row !== null);
    // The sheet measured the seventh reading on PMD-9 alone. W1's louder fix (adopted with it)
    // raises the soft row at the sixth: 1.05 confirmed is 12.5% below the single 1.2 peak.
    expect(firstRow).toBe(6);
    expect(kitten(6).row).toMatchObject({ tier: 'soft', basis: 'single_high', high: { kg: 1.2, confirmed: false } });
    // A 10% confirmed drop is firm for a juvenile too (W5's first fix), never capped at soft.
    const sharp = weightStory({
      readings: [home(1.2, '2026-08-01'), home(1.21, '2026-08-08'), home(1.05, '2026-08-15'), home(1.06, '2026-08-22')],
      nowMs: NOW,
      dateOfBirth: '2026-04-01',
    });
    expect(sharp.row?.tier).toBe('firm');
  });

  it('W5 · an unknown birthday reads young', () => {
    expect(isJuvenile(null, NOW)).toBe(true);
    expect(isJuvenile('not a date', NOW)).toBe(true);
    expect(isJuvenile('2026-03-01', NOW)).toBe(true);
    expect(isJuvenile('2025-10-02', NOW)).toBe(false);
    // A confirmed 4.5% drop (0.27 kg, past the 0.23 kg band): soft for a juvenile, nothing for an adult.
    const readings = [home(6.0, '2026-07-01'), home(6.01, '2026-07-08'), home(5.72, '2026-09-01'), home(5.73, '2026-09-08')];
    expect(weightStory({ readings, nowMs: NOW, dateOfBirth: null }).row?.tier).toBe('soft');
    expect(weightStory({ readings, nowMs: NOW, dateOfBirth: ADULT }).row).toBeNull();
  });

  it('W6 · a plan: the soft line is off, 2% a week is firm, and the cumulative line fires at 10%', () => {
    const plan = { startedAt: '2026-08-01T00:00:00Z', recheckAt: '2026-12-01T00:00:00Z' };
    // 6% confirmed over eight weeks: under 2% a week and under 10%: silent while planned.
    const slow = [home(5.0, '2026-08-02'), home(5.01, '2026-08-09'), home(4.7, '2026-09-20'), home(4.71, '2026-09-27')];
    expect(story(slow, { plans: [plan] }).row).toBeNull();
    expect(story(slow).row?.tier).toBe('soft');
    // 5.8% in eight days: faster than 2% a week.
    const fast = [home(5.0, '2026-09-12'), home(5.01, '2026-09-13'), home(4.7, '2026-09-19'), home(4.71, '2026-09-20')];
    expect(story(fast, { plans: [plan] }).row).toMatchObject({ tier: 'firm', basis: 'planned_rate', planned: true });
    // 1.5% a week for eight weeks, about 12%: under the rate, past the cumulative 10%.
    const long = [home(5.0, '2026-08-02'), home(5.01, '2026-08-03'), home(4.4, '2026-09-27'), home(4.41, '2026-09-28')];
    expect(story(long, { plans: [plan] }).row).toMatchObject({ tier: 'firm', planned: true });
  });

  it('W6 · a plan lapses at its recheck date, or 12 weeks after it was set; then the loss is measured from its END level', () => {
    const slow = [home(5.0, '2026-08-02'), home(5.01, '2026-08-09'), home(4.7, '2026-09-20'), home(4.71, '2026-09-27')];
    // Lapsed Sep 30: the 6% the plan asked for is never measured against the pre-plan weight.
    expect(story(slow, { plans: [{ startedAt: '2026-08-01T00:00:00Z', recheckAt: '2026-09-30T00:00:00Z' }] }).row).toBeNull();
    // A further loss after the lapse, from the end level (4.71), is an ordinary soft row.
    const after = [...slow, home(4.45, '2026-10-01'), home(4.46, '2026-10-02')];
    expect(story(after, { plans: [{ startedAt: '2026-08-01T00:00:00Z', recheckAt: '2026-09-30T00:00:00Z' }] }).row).toMatchObject({
      tier: 'soft',
      planned: false,
      high: { kg: 4.7 },
    });
    // No recheck date: lapses 12 weeks on (Jul 1 → Sep 23), and the same rule applies.
    expect(story(slow, { plans: [{ startedAt: '2026-07-01T00:00:00Z' }] }).row).toBeNull();
  });

  it('W6 · a target above 10% is honoured: losing what the plan asked is not a card (adversarial pass)', () => {
    const plan = { startedAt: '2026-07-01T00:00:00Z', recheckAt: '2026-12-01T00:00:00Z', targetLossFrac: 0.15 };
    // 4.2 → 3.75 kg (10.7%) over eleven weeks, about 1% a week.
    const onPlan = [home(4.2, '2026-07-02'), home(4.21, '2026-07-09'), home(3.75, '2026-09-17'), home(3.76, '2026-09-24')];
    expect(story(onPlan, { plans: [plan] }).row).toBeNull();
    // Past the plan's own 15%: firm.
    const past = [home(4.2, '2026-07-02'), home(4.21, '2026-07-09'), home(3.5, '2026-09-24'), home(3.51, '2026-10-01')];
    expect(story(past, { plans: [plan] }).row).toMatchObject({ tier: 'firm', planned: true });
  });

  it('W6 · a plan that ends right after a single reading never re-raises its own loss (adversarial pass 2)', () => {
    const plan = { startedAt: '2026-08-01T00:00:00Z', recheckAt: '2026-12-01T00:00:00Z', endedAt: '2026-09-10T12:00:00Z', targetLossFrac: 0.15 };
    const readings = [home(5.0, '2026-08-01'), home(5.02, '2026-08-08'), home(4.4, '2026-09-10'), home(4.38, '2026-09-30')];
    expect(story(readings, { plans: [plan] }).row).toBeNull();
  });

  it('W6 · the visit\'s weigh-in just before the plan was set is its start level', () => {
    const plan = { startedAt: '2026-07-01T10:00:00Z', recheckAt: '2026-12-01T00:00:00Z' };
    const before = { kg: 5.0, occurredAt: '2026-07-01T09:40:00Z', source: 'clinic' as const };
    expect(story([before, clinic(4.3, '2026-08-30')], { plans: [plan] }).row).toMatchObject({ tier: 'firm', high: { kg: 5.0 } });
    // A reading days before the plan is not its start level.
    expect(story([clinic(5.0, '2026-06-20'), clinic(4.3, '2026-08-30')], { plans: [plan] }).row).toBeNull();
  });

  it('W6 · a target is clamped, and a plan that ends before it starts is ignored', () => {
    const readings = [home(5.0, '2026-08-02'), home(5.1, '2026-08-09'), home(4.9, '2026-09-20'), home(4.94, '2026-09-27')];
    // 1% would fire inside the noise band; the 2% floor keeps it quiet.
    expect(story(readings, { plans: [{ startedAt: '2026-08-01T00:00:00Z', recheckAt: '2026-12-01T00:00:00Z', targetLossFrac: 0.01 }] }).row).toBeNull();
    // 100% (or a percent typed as 10) would switch the cumulative line off; capped at 30%.
    const big = [home(5.0, '2026-07-02'), home(5.01, '2026-07-03'), home(3.4, '2026-09-27'), home(3.41, '2026-09-28')];
    expect(story(big, { plans: [{ startedAt: '2026-07-01T00:00:00Z', recheckAt: '2026-12-01T00:00:00Z', targetLossFrac: 10 }] }).row?.tier).toBe('firm');
    const broken = { startedAt: '2026-08-01T00:00:00Z', endedAt: '2026-07-01T00:00:00Z' };
    const loss = [home(5.0, '2026-06-01'), home(5.02, '2026-06-08'), home(4.4, '2026-09-20'), home(4.42, '2026-09-27')];
    expect(story(loss, { plans: [broken] }).row?.tier).toBe('firm');
  });

  it('W6 · a recheck date before the start is read as none (adversarial pass 3)', () => {
    const readings = [home(6.0, '2026-01-01'), home(6.02, '2026-01-02'), home(5.4, '2026-09-25'), home(5.42, '2026-09-26')];
    const typo = { startedAt: '2026-09-20T12:00:00Z', recheckAt: '2026-02-01T00:00:00Z' };
    // Read as a running plan from Sep 20 (12 weeks): the earlier loss is pre-plan and does not
    // anchor, but no history is erased by a phantom end on Feb 1.
    expect(story(readings, { plans: [typo] }).row).toBeNull();
    expect(story(readings).row).not.toBeNull();
    // An older typo plan lapses 12 weeks after its start (Apr 4), not on its phantom recheck;
    // the readings before its start still never anchor again (attack 12).
    const old = { startedAt: '2026-01-10T12:00:00Z', recheckAt: '2025-12-01T00:00:00Z' };
    expect(story(readings, { plans: [old] }).row).toBeNull();
  });

  it('W6 · a plan that ended at its goal: the cat holding there raises nothing (counterexample 1)', () => {
    const readings = [home(7.0, '2026-03-02'), home(7.01, '2026-03-09'), home(6.3, '2026-06-20'), home(6.31, '2026-06-27'), home(6.3, '2026-09-01'), home(6.31, '2026-09-20')];
    expect(story(readings, { plans: [{ startedAt: '2026-03-01T00:00:00Z', recheckAt: '2026-07-15T00:00:00Z', endedAt: '2026-06-30T00:00:00Z' }] }).row).toBeNull();
  });

  it('W6 · pre-plan readings never anchor again, during the plan or after it ends (attack 12)', () => {
    const readings = [home(6.0, '2026-06-01'), home(6.01, '2026-06-08'), home(5.3, '2026-09-20'), home(5.31, '2026-09-27')];
    expect(story(readings).row?.tier).toBe('firm');
    const ended = { startedAt: '2026-07-01T00:00:00Z', endedAt: '2026-09-01T00:00:00Z' };
    expect(story(readings, { plans: [ended] }).row).toBeNull();
  });

  it('W8 · species is not an input: every species gets the rows', () => {
    // The predicate takes no species; detection passes every pet through.
    expect(story([home(4.4, '2026-06-15'), clinic(3.73, '2026-09-16')]).row).not.toBeNull();
  });
});

describe('estimates (WG-3, attack 6)', () => {
  it('an estimate never anchors, never counts, and is listed as not counted', () => {
    const s = story([estimate(4.4, '2026-06-15'), clinic(3.73, '2026-09-16')]);
    expect(s.state).toBe('one_reading');
    expect(s.row).toBeNull();
    expect(s.notCounted).toEqual([estimate(4.4, '2026-06-15')]);
  });

  it('relabelling a low reading as an estimate removes it from the decision and keeps it listed', () => {
    const s = story([clinic(4.4, '2026-06-15'), estimate(3.73, '2026-09-16')]);
    expect(s.row).toBeNull();
    expect(s.notCounted).toHaveLength(1);
  });
});

describe('stand-downs (spec §5.5, attack 11)', () => {
  it('the drop the owner stood down never re-raises itself; a further loss after it does', () => {
    const readings = [clinic(4.4, '2026-06-15'), clinic(3.73, '2026-09-16')];
    expect(story(readings).row).not.toBeNull();
    expect(story(readings, { standDowns: ['2026-09-20T00:00:00Z'] }).row).toBeNull();
    const after = [...readings, clinic(3.9, '2026-09-25'), clinic(3.5, '2026-10-01')];
    expect(story(after, { standDowns: ['2026-09-20T00:00:00Z'] }).row).toMatchObject({ tier: 'firm', high: { kg: 3.9 } });
  });

  it('a relapse after "she\'s gained it back" is measured from the weight she regained (adversarial pass)', () => {
    const readings = [
      home(4.5, '2026-03-01'), home(4.48, '2026-03-08'),
      home(4.0, '2026-05-01'), home(4.02, '2026-05-08'),
      home(4.5, '2026-07-01'), home(4.49, '2026-07-08'),
      home(4.2, '2026-08-01'), home(4.21, '2026-08-15'), home(4.21, '2026-09-01'), home(4.19, '2026-09-15'),
    ];
    const s = story(readings, { standDowns: ['2026-07-10T00:00:00Z'] });
    expect(s.row).toMatchObject({ tier: 'soft' });
    // The row names the level the stand-down kept (the lower of the regained pair), never the
    // March high before it.
    expect(s.row?.says.highBefore).toMatchObject({ kg: 4.49, confirmed: true });
  });

  // Adversarial pass 3.
  it('a vet-confirmed regain anchors the next finding: a relapse after it raises a row', () => {
    const readings = [
      home(5.0, '2026-06-01'), home(5.02, '2026-06-02'), home(4.4, '2026-07-01'), home(4.42, '2026-07-02'),
      clinic(5.1, '2026-08-01'), home(4.3, '2026-09-10'), home(4.32, '2026-09-11'),
    ];
    expect(story(readings, { standDowns: ['2026-08-02T00:00:00Z'] }).row).toMatchObject({ tier: 'firm', high: { kg: 5.1, source: 'clinic' } });
  });

  it('a spike and its pre-filled copy before a stand-down never become the anchor', () => {
    const readings = [
      home(5.0, '2026-08-01'), home(5.02, '2026-08-02'), home(4.4, '2026-08-10'), home(4.42, '2026-08-11'),
      home(5.5, '2026-08-20'), home(5.5, '2026-08-21'), home(4.4, '2026-09-10'), home(4.42, '2026-09-11'),
    ];
    expect(story(readings, { standDowns: ['2026-08-22T00:00:00Z'] }).row).toBeNull();
    const sameInstant = [home(6.32, '2026-08-01'), home(7.38, '2026-08-02'), home(7.38, '2026-08-02'), home(6.3, '2026-09-10'), home(6.31, '2026-09-11')];
    expect(story(sameInstant, { standDowns: ['2026-08-03T00:00:00Z'] }).row).toBeNull();
  });

  // Adversarial pass 2: a row raised on a single low reading, then stood down, came straight back.
  it('a stood-down drop on a single low reading stays down, home pair or clinic + home', () => {
    const homeDrop = [home(5.0, '2026-08-01'), home(5.02, '2026-08-08'), home(4.4, '2026-08-15')];
    expect(story(homeDrop).row?.tier).toBe('firm');
    expect(story(homeDrop, { standDowns: ['2026-08-15T12:00:00Z'] }).row).toBeNull();
    expect(story([...homeDrop, home(4.38, '2026-08-22')], { standDowns: ['2026-08-15T12:00:00Z'] }).row).toBeNull();
    expect(
      story([...homeDrop, home(4.38, '2026-08-22')], { standDowns: ['2026-08-15T12:00:00Z', '2026-08-20T00:00:00Z'] }).row,
    ).toBeNull();
    const mixed = [clinic(5.0, '2026-08-01'), home(4.4, '2026-08-08')];
    expect(story(mixed).row).not.toBeNull();
    expect(story(mixed, { standDowns: ['2026-08-08T12:00:00Z'] }).row).toBeNull();
    // …and a further real loss from the stood-down weight still raises a new row.
    const further = [...homeDrop, home(3.95, '2026-09-20'), home(3.96, '2026-09-27')];
    expect(story(further, { standDowns: ['2026-08-15T12:00:00Z'] }).row).toMatchObject({ high: { kg: 4.4 } });
  });
});

describe('the caveat and the sentence (adversarial pass)', () => {
  it('a slow, steady home-scale decline never carries the noise caveat (attack 5)', () => {
    const kg = [4.0, 3.98, 3.96, 3.94, 3.92, 3.9, 3.88, 3.86, 3.84, 3.82, 3.81];
    for (let n = 3; n <= kg.length; n++) {
      const readings = kg.slice(0, n).map((k, i) => home(k, `2026-07-${String(i + 1).padStart(2, '0')}`));
      expect(story(readings).state).not.toBe('within_noise');
    }
  });

  it('a single dip after two agreeing readings keeps its caveat (adversarial pass 2)', () => {
    expect(story([home(4.0, '2026-08-01'), home(3.99, '2026-08-08'), home(3.81, '2026-08-15')]).state).toBe('within_noise');
  });

  it('two readings ten months apart never support each other', () => {
    const s = story([home(4.0, '2025-11-10'), home(3.91, '2026-09-10')]);
    expect(s.highBefore?.confirmed).toBe(false);
    expect(s.latest?.confirmed).toBe(false);
  });

  it('a paired high is not "one reading"; a lone latest reading is', () => {
    const s = story([home(4.5, '2026-06-01'), home(4.48, '2026-06-08'), home(4.2, '2026-08-01'), home(4.22, '2026-08-08'), home(3.95, '2026-09-20')]);
    expect(s.highBefore).toMatchObject({ kg: 4.5, confirmed: true });
    expect(s.latest).toMatchObject({ kg: 3.95, confirmed: false });
  });

  it('a reading a few minutes ahead of the server clock still counts (the weigh-in\'s own regen)', () => {
    const soon = new Date(NOW + 5 * 60_000).toISOString();
    expect(story([clinic(4.4, '2026-06-15'), { kg: 3.73, occurredAt: soon, source: 'clinic' }]).row).not.toBeNull();
  });
});

describe('confirmation, both ways', () => {
  it('a clinic reading is confirmed alone; a home reading needs its neighbour', () => {
    expect(story([clinic(4.4, '2026-06-15'), clinic(3.95, '2026-09-16')]).row?.tier).toBe('firm');
    // 4.4 → 3.95 (10.2%) on single home readings: 0.45 kg is under W2's 0.6 kg, and no level is
    // confirmed, so no row; W1's fix needs a CONFIRMED low.
    expect(story([home(4.4, '2026-06-15'), home(3.95, '2026-09-16')]).row).toBeNull();
    expect(story([home(4.4, '2026-06-15'), home(3.95, '2026-09-16'), home(3.94, '2026-09-23')]).row).toMatchObject({
      basis: 'single_high',
    });
  });

  it('a low clinic reading never becomes its own comparison (attack 2)', () => {
    const s = story([clinic(4.0, '2026-06-15'), clinic(3.6, '2026-09-16')]);
    expect(s.row?.high.kg).toBe(4.0);
    expect(s.highBefore?.kg).toBe(4.0);
  });
});

describe('properties', () => {
  // A deterministic generator: no Math.random, so a failure reproduces.
  function lcg(seed: number) {
    let x = seed >>> 0;
    return () => {
      x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
      return x / 2 ** 32;
    };
  }
  const SOURCES = ['clinic', 'home_scale', 'home_scale', 'estimate'] as const;
  function randomRecord(rand: () => number): WeightReading[] {
    const n = Math.floor(rand() * 8);
    const base = 2 + rand() * 30;
    const out: WeightReading[] = [];
    let t = NOW - 360 * 86_400_000;
    for (let i = 0; i < n; i++) {
      t += Math.floor(rand() * 50 + 1) * 86_400_000;
      if (t > NOW) break;
      const kg = Math.round(base * (0.8 + rand() * 0.3) * 100) / 100;
      out.push({ kg, occurredAt: new Date(t).toISOString(), source: SOURCES[Math.floor(rand() * SOURCES.length)] });
    }
    return out;
  }

  it('the caveat state and a raised row never come from one input; row is set exactly on the drop states', () => {
    const rand = lcg(1413);
    for (let k = 0; k < 4000; k++) {
      const s = story(randomRecord(rand), { dateOfBirth: rand() < 0.3 ? null : ADULT });
      const raised = s.state === 'drop_confirmed' || s.state === 'drop_firm';
      expect(raised).toBe(s.row !== null);
      if (s.state === 'within_noise') expect(s.row).toBeNull();
      if (s.row) {
        expect(s.row.low.confirmed).toBe(true);
        expect(s.row.high.kg).toBeGreaterThan(s.row.low.kg);
        expect(s.row.high.confirmed || s.row.basis === 'single_high').toBe(true);
        if (s.row.basis === 'single_high') expect(s.row.tier).toBe('soft');
      }
    }
  });

  it('an estimate never changes the decision, wherever it sits', () => {
    const rand = lcg(7);
    for (let k = 0; k < 2000; k++) {
      const rec = randomRecord(rand).filter((r) => r.source !== 'estimate');
      const withEstimates = [...rec, estimate(50, '2026-05-01'), estimate(1, '2026-09-30')];
      const a = story(rec);
      const b = story(withEstimates);
      expect(b.state).toBe(a.state);
      expect(b.row).toEqual(a.row);
    }
  });

  it('the answer does not depend on the order the read returned', () => {
    const rand = lcg(99);
    for (let k = 0; k < 2000; k++) {
      const rec = randomRecord(rand);
      const a = story(rec);
      const b = story([...rec].reverse());
      expect(b.state).toBe(a.state);
      expect(b.row).toEqual(a.row);
    }
  });

  it('the band is the smaller of 5% and 0.5 lb', () => {
    expect(noiseBandKg(2)).toBeCloseTo(0.1);
    expect(noiseBandKg(30)).toBeCloseTo(WEIGHT_RULES.noiseKg);
  });
});
