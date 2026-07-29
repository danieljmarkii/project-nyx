// B-422 — the effective end. The acceptance suite for the ONE staleness rule.
//
// The bug it closes is not a display bug and the tests are written to say so:
// nothing auto-completes a trial and §4.3's milestone needs an owner tap, so
// `status = 'active'` outlives the diet BY DEFAULT. Every surface that read it
// as "the pet is on this diet today" was therefore acting on a finished trial —
// most seriously the widget, which WRITES meal events naming the trial diet.
//
// Three properties are pinned here, and they are the three that make this one
// definition rather than a fourth:
//
//   (1) the arithmetic itself, including every degraded input;
//   (2) that `computeTrialFacts` — the module the client, `generate-report` and
//       `ask` all import — applies it to BOTH halves of the coverage ratio and
//       to the exposure window;
//   (3) that the widget's pure boundary drops a stale trial before it can reach
//       the one-tap rows.
import {
  TRIAL_OVERRUN_GRACE_DAYS,
  buildTrialContext,
  computeTrialFacts,
  isTrialRunning,
  trialEffectiveEndDayIndex,
  trialTargetEndDayIndex,
  type AllowedFood,
  type TrialFeeding,
  type TrialSpec,
} from './dietTrial';
import { localDayIndexOf } from './utils';

// Rex, a dog, on the 56-day dog·skin default (P-1), started 1 July 2026.
const TRIAL: TrialSpec = {
  id: 'trial-1',
  startedAt: '2026-07-01',
  targetDurationDays: 56,
  species: 'dog',
};

/** Day 56 of 56 is 25 August 2026; the grace runs 28 days past it. */
const LAST_TARGET_DAY = '2026-08-25';
const EFFECTIVE_END = '2026-09-22';

const DUCK: AllowedFood = {
  foodItemId: 'dry-duck',
  foodKey: 'royal caninduck dry',
  label: 'Royal Canin Duck Dry',
  role: 'primary_diet',
  allowedFrom: '2026-07-01',
  allowedUntil: null,
  primaryProtein: 'duck',
  proteins: ['duck'],
};

/** Local noon on a local day — never midnight, so no test depends on the
 *  runner's zone straddling a boundary. */
function at(day: string, hour = 12): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, hour, 0, 0).toISOString();
}

function feeding(over: Partial<TrialFeeding> & Pick<TrialFeeding, 'eventId'>): TrialFeeding {
  return {
    occurredAt: at('2026-07-10'),
    foodItemId: DUCK.foodItemId,
    foodKey: DUCK.foodKey,
    label: DUCK.label,
    foodType: 'meal',
    proteins: ['duck'],
    ...over,
  };
}

function dayIndex(day: string): number {
  const i = localDayIndexOf(day);
  if (i === null) throw new Error(`unparseable fixture day ${day}`);
  return i;
}

// ── (1) The arithmetic ───────────────────────────────────────────────────────

describe('trialEffectiveEndDayIndex', () => {
  it('is start + target - 1 + grace — day 1 IS the start day', () => {
    // The off-by-one this pins is not cosmetic: reading `start + target` as the
    // last target day makes every trial one day longer than the card says, so
    // the card's milestone and the staleness rule would key on different days.
    expect(trialTargetEndDayIndex(TRIAL)).toBe(dayIndex(LAST_TARGET_DAY));
    expect(trialEffectiveEndDayIndex(TRIAL)).toBe(dayIndex(EFFECTIVE_END));
    expect(dayIndex(EFFECTIVE_END) - dayIndex(LAST_TARGET_DAY)).toBe(TRIAL_OVERRUN_GRACE_DAYS);
  });

  it('is null — no effective end — when the target is zero, negative or absent', () => {
    // A trial with no target has no window to OVERRUN. `getDietTrialProgress`
    // already treats 0 as "never completes", and `target_duration_days` is
    // INTEGER NOT NULL with no CHECK (migration 001), so 0 and negatives reach
    // this function through sync. Returning an end anyway would expire such a
    // trial 28 days after it started.
    expect(trialEffectiveEndDayIndex({ ...TRIAL, targetDurationDays: 0 })).toBeNull();
    expect(trialEffectiveEndDayIndex({ ...TRIAL, targetDurationDays: -5 })).toBeNull();
    expect(trialEffectiveEndDayIndex({ startedAt: '2026-07-01' })).toBeNull();
    expect(trialEffectiveEndDayIndex({ ...TRIAL, targetDurationDays: Number.NaN })).toBeNull();
  });

  it('is null when the start date cannot be placed in time', () => {
    expect(trialEffectiveEndDayIndex({ ...TRIAL, startedAt: 'not-a-date' })).toBeNull();
    // The shape-valid-but-invalid case `localDayIndexOf` rejects on purpose.
    expect(trialEffectiveEndDayIndex({ ...TRIAL, startedAt: '2026-02-30' })).toBeNull();
  });

  it('honours the caller’s zone', () => {
    // The Edge Functions bucket by `user_profiles.timezone`; the client omits it
    // and gets the device's own midnight (B-421). Both must land on a real day.
    const auckland = trialEffectiveEndDayIndex(TRIAL, 'Pacific/Auckland');
    const la = trialEffectiveEndDayIndex(TRIAL, 'America/Los_Angeles');
    expect(auckland).not.toBeNull();
    expect(la).not.toBeNull();
    // A DATE-only `started_at` is zone-independent by construction (it is a
    // calendar day, not an instant), so the two agree — which is the property
    // that stops the widget and the report disagreeing about staleness.
    expect(auckland).toBe(la);
  });
});

describe('isTrialRunning', () => {
  it('runs through the last day of grace and stops the day after', () => {
    expect(isTrialRunning(TRIAL, Date.parse(at(EFFECTIVE_END)))).toBe(true);
    expect(isTrialRunning(TRIAL, Date.parse(at('2026-09-23')))).toBe(false);
  });

  it('still runs deep into overrun, before the grace expires', () => {
    // The population a staleness rule may not punish: §4.3 offers a NAMED one-tap
    // extension of +28d (skin) / +14d (GI), so an owner who means to keep going
    // and has not tapped yet must not be cut off inside that span.
    expect(isTrialRunning(TRIAL, Date.parse(at('2026-09-01')))).toBe(true);
  });

  it('is false for a terminal trial regardless of its dates', () => {
    const mid = Date.parse(at('2026-07-20'));
    expect(isTrialRunning({ ...TRIAL, status: 'completed' }, mid)).toBe(false);
    expect(isTrialRunning({ ...TRIAL, status: 'abandoned' }, mid)).toBe(false);
    expect(isTrialRunning({ ...TRIAL, status: 'active' }, mid)).toBe(true);
  });

  it('honours a declared end that lands EARLIER than the effective end', () => {
    const ended = { ...TRIAL, endedAt: '2026-07-19' };
    expect(isTrialRunning(ended, Date.parse(at('2026-07-19')))).toBe(true);
    expect(isTrialRunning(ended, Date.parse(at('2026-07-20')))).toBe(false);
  });

  it('answers TRUE on every input it cannot place in time', () => {
    // The failure direction is deliberate and load-bearing. This predicate exists
    // to WITHDRAW behaviour from a trial we can prove is over; proving nothing is
    // not proving it is over. Every degraded input therefore lands on the shipped
    // behaviour rather than on a new, unasked-for silence — a rule that made the
    // widget go quiet on unreadable data would be a worse bug than the one this
    // closes, because it would hit LIVE trials.
    const farFuture = Date.parse(at('2030-01-01'));
    expect(isTrialRunning({ ...TRIAL, targetDurationDays: 0 }, farFuture)).toBe(true);
    expect(isTrialRunning({ ...TRIAL, startedAt: 'not-a-date' }, farFuture)).toBe(true);
    expect(isTrialRunning(TRIAL, Number.NaN)).toBe(true);
  });

  it('treats an absent status as "the caller’s query already filtered it"', () => {
    // The widget's ACTIVE_DIET_TRIAL_QUERY and generate-signal's probe both put
    // `status` in the WHERE and never select it back.
    expect(isTrialRunning({ startedAt: '2026-07-01', targetDurationDays: 56 }, Date.parse(at('2026-07-20')))).toBe(true);
    expect(isTrialRunning({ startedAt: '2026-07-01', targetDurationDays: 56 }, Date.parse(at('2026-09-23')))).toBe(false);
  });
});

// ── (2) The measurement window ───────────────────────────────────────────────

describe('the effective end closes the measurement window', () => {
  it('freezes the coverage denominator instead of letting the calendar grow it', () => {
    // THE HARM, stated as a number. Before this, `daysElapsed` was
    // days-since-start, so a trial nobody ended kept accruing unlogged days
    // forever: a well-run 56-day trial read 56/56 in August and 56/238 the
    // following March — below COVERAGE_FLOOR, permanently `does_not_support`,
    // and §5.2 rules the exposure count a FLOOR, so the record claim is
    // suppressed for good on a trial that was actually run properly.
    const feedings: TrialFeeding[] = [];
    for (let d = 0; d < 56; d += 1) {
      const day = new Date(Date.UTC(2026, 6, 1 + d)).toISOString().slice(0, 10);
      feedings.push(feeding({ eventId: `m-${d}`, occurredAt: at(day) }));
    }
    const args = { trial: TRIAL, allowedFoods: [DUCK], feedings };

    const atEnd = computeTrialFacts({ ...args, nowMs: Date.parse(at(LAST_TARGET_DAY)) });
    expect(atEnd.coverage).toEqual({ daysLogged: 56, daysElapsed: 56, fraction: 1 });

    const muchLater = computeTrialFacts({ ...args, nowMs: Date.parse(at('2027-03-01')) });
    expect(muchLater.coverage).toEqual({ daysLogged: 56, daysElapsed: 56, fraction: 1 });
    expect(muchLater.interpretability).toBe('supports');
    expect(muchLater.belowCoverageFloor).toBe(false);
  });

  it('is bounded by TODAY, not by the effective end, while the trial still runs', () => {
    // The grace must not FORWARD-date the denominator either: a trial on day 10
    // of 56 has ten days elapsed, not eighty-four.
    const facts = computeTrialFacts({
      trial: TRIAL,
      allowedFoods: [DUCK],
      feedings: [feeding({ eventId: 'm1', occurredAt: at('2026-07-01') })],
      nowMs: Date.parse(at('2026-07-10')),
    });
    expect(facts.coverage?.daysElapsed).toBe(10);
    expect(facts.range?.closedByOverrun).toBe(false);
  });

  it('excludes a feeding logged after the effective end from the exposure window', () => {
    // The other half of §5.1's "one overlap range": a chicken treat fed in
    // November, long after an abandoned trial stopped, is not an off-diet
    // exposure DURING that trial — and must not reach the vet report as one.
    const facts = computeTrialFacts({
      trial: TRIAL,
      allowedFoods: [DUCK],
      feedings: [
        feeding({ eventId: 'in', occurredAt: at('2026-08-01') }),
        feeding({
          eventId: 'after',
          occurredAt: at('2026-11-01'),
          foodItemId: 'chicken-treat',
          foodKey: 'genericchicken strips',
          label: 'Generic Chicken Strips',
          foodType: 'treat',
          proteins: ['chicken'],
        }),
      ],
      nowMs: Date.parse(at('2026-11-02')),
    });
    expect(facts.exposures.totalFeedings).toBe(1);
    expect(facts.exposures.offDiet).toBe(0);
    expect(facts.exposures.items).toEqual([]);
  });

  it('reports closedByOverrun only for a trial nobody ended', () => {
    const args = { trial: TRIAL, allowedFoods: [DUCK], feedings: [feeding({ eventId: 'm1' })] };
    // Past the grace, un-ended.
    expect(
      computeTrialFacts({ ...args, nowMs: Date.parse(at('2026-11-01')) }).range?.closedByOverrun,
    ).toBe(true);
    // Same date, but the owner declared an end — that is a different fact and the
    // card would owe the owner a different sentence.
    expect(
      computeTrialFacts({
        ...args,
        trial: { ...TRIAL, endedAt: '2026-08-10' },
        nowMs: Date.parse(at('2026-11-01')),
      }).range?.closedByOverrun,
    ).toBe(false);
  });

  it('caps a declared end that lands AFTER the effective end', () => {
    // An owner who taps "This trial is done" in March authored a fact about the
    // paperwork, not about the diet. Taking `ended_at` at face value there
    // re-admits the unbounded denominator, deferred to the moment of the tap.
    const facts = computeTrialFacts({
      trial: { ...TRIAL, endedAt: '2027-03-01' },
      allowedFoods: [DUCK],
      feedings: [feeding({ eventId: 'm1', occurredAt: at('2026-07-01') })],
      nowMs: Date.parse(at('2027-03-02')),
    });
    expect(facts.range?.endDayIndex).toBe(dayIndex(EFFECTIVE_END));
    // A DECLARED end is the owner's own window, so the tail clip stays out of it:
    // the days between their last log and the end they named are genuine gaps.
    expect(facts.range?.closedByOverrun).toBe(false);
  });

  it('leaves a targetless trial unbounded, exactly as before', () => {
    const facts = computeTrialFacts({
      trial: { ...TRIAL, targetDurationDays: 0 },
      allowedFoods: [DUCK],
      feedings: [feeding({ eventId: 'm1', occurredAt: at('2026-07-01') })],
      nowMs: Date.parse(at('2026-12-01')),
    });
    expect(facts.range?.endDayIndex).toBe(dayIndex('2026-12-01'));
    expect(facts.range?.closedByOverrun).toBe(false);
  });

  it('does not move the window at all before the target end', () => {
    // Regression guard on the whole rule: nothing about an ordinary running
    // trial changes. Day 10 of 56, last logged on day 3 — days 4-10 are a real
    // gap and must stay in the denominator.
    const ctx = buildTrialContext(TRIAL, [DUCK]);
    expect(ctx.endDayIndex).toBe(dayIndex(EFFECTIVE_END));
    const facts = computeTrialFacts({
      trial: TRIAL,
      allowedFoods: [DUCK],
      feedings: [feeding({ eventId: 'm1', occurredAt: at('2026-07-03') })],
      nowMs: Date.parse(at('2026-07-10')),
    });
    expect(facts.range?.endDayIndex).toBe(dayIndex('2026-07-10'));
    expect(facts.coverage).toEqual({ daysLogged: 1, daysElapsed: 8, fraction: 0.125 });
    expect(facts.range?.closedByOverrun).toBe(false);
  });
});

// ── The tail clip — the grace never reaches a denominator ────────────────────

describe('the overrun tail clip', () => {
  function facts(lastLogDay: string, nowDay: string) {
    const feedings: TrialFeeding[] = [];
    const last = dayIndex(lastLogDay);
    for (let d = dayIndex('2026-07-01'); d <= last; d += 1) {
      feedings.push(
        feeding({ eventId: `m-${d}`, occurredAt: at(new Date(d * 86_400_000).toISOString().slice(0, 10)) }),
      );
    }
    return computeTrialFacts({
      trial: TRIAL,
      allowedFoods: [DUCK],
      feedings,
      nowMs: Date.parse(at(nowDay)),
    });
  }

  it('denominates a perfectly-run, never-closed trial over its OWN 56 days', () => {
    // THE CASE THAT DROVE THE DESIGN. Before the tail clip this rendered "56 of
    // 84 days" — 67%, `partially_supports` instead of `supports` — on a trial
    // that was run exactly as prescribed. On the vet report the harm is sharper
    // than a percentage: a vet who prescribed eight weeks and reads a denominator
    // of eighty-four concludes the owner ran a longer, sloppier trial than they
    // did. The grace is a tolerance for the owner's SILENCE; it is not a claim
    // that the diet continued, so it may not be counted as days they failed to log.
    const f = facts(LAST_TARGET_DAY, '2027-03-01');
    expect(f.coverage).toEqual({ daysLogged: 56, daysElapsed: 56, fraction: 1 });
    expect(f.interpretability).toBe('supports');
    expect(f.belowCoverageFloor).toBe(false);
    expect(f.range?.closedByOverrun).toBe(true);
  });

  it('extends the window when the RECORD shows the trial outlived its target', () => {
    // An owner still logging on day 70 was still running it on day 70. Those days
    // are evidence, not inference, so they stay in — clipped at the last one.
    const f = facts('2026-09-08', '2027-03-01'); // day 70
    expect(f.coverage).toEqual({ daysLogged: 70, daysElapsed: 70, fraction: 1 });
  });

  it('never extends past the effective end, however long the logging runs', () => {
    // Logging into November on a trial nobody ended: the record stops being
    // evidence about THIS trial at the effective end. Day 84 = 22 Sep.
    const f = facts('2026-11-01', '2026-11-02');
    expect(f.range?.endDayIndex).toBe(dayIndex(EFFECTIVE_END));
    expect(f.coverage?.daysElapsed).toBe(84);
  });

  it('does not let a stopped record shrink the window below the prescribed target', () => {
    // The inverse guard. Logging stopped on day 30 of 56 and today is day 60:
    // the four days past the target drop (they are past the prescription), but
    // days 31–56 are a GENUINE gap and must stay in the denominator.
    const f = facts('2026-07-30', '2026-08-29'); // day 30 logged, day 60 today
    expect(f.coverage).toEqual({ daysLogged: 30, daysElapsed: 56, fraction: 30 / 56 });
    expect(f.belowCoverageFloor).toBe(false); // 53.6% — above COVERAGE_FLOOR, just
  });

  it('cannot delete an off-diet exposure, because it anchors on EVERY feeding', () => {
    // §5.2 rules the exposure count a FLOOR, and a clip that could drop a logged
    // exposure would move it in the one direction it may never move. The tail
    // anchor deliberately includes treats — the opposite of the head clip — which
    // makes it provably unable to fall before any logged feeding.
    const f = computeTrialFacts({
      trial: TRIAL,
      allowedFoods: [DUCK],
      feedings: [
        feeding({ eventId: 'meal-1', occurredAt: at('2026-07-01') }),
        // A chicken treat on day 70 — past the target, inside the grace. The last
        // MEAL was on day 1, so a non-treat anchor would have clipped this away.
        feeding({
          eventId: 'treat-70',
          occurredAt: at('2026-09-08'),
          foodItemId: 'chicken-treat',
          foodKey: 'genericchicken strips',
          label: 'Generic Chicken Strips',
          foodType: 'treat',
          proteins: ['chicken'],
        }),
      ],
      nowMs: Date.parse(at('2027-03-01')),
    });
    expect(f.exposures.totalFeedings).toBe(2);
    expect(f.exposures.offDiet).toBe(1);
    expect(f.exposures.mostRecent?.label).toBe('Generic Chicken Strips');
  });
});
