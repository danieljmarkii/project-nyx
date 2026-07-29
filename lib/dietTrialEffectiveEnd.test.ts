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
//   (2) that `computeTrialFacts` applies it to the COVERAGE DENOMINATOR and to
//       nothing else — the evidence window (feedings, doses, arrangements, both
//       refusal populations) is never narrowed by it. Five of the six breaks an
//       `adversarial-reviewer` pass found in the first cut were the same mistake:
//       the effective end had been applied to evidence as well as to belief, so
//       the fix DELETED logged findings to make a denominator behave;
//   (3) that the widget's pure boundary drops a stale trial before it can reach
//       the one-tap rows.
import {
  TRIAL_OVERRUN_GRACE_DAYS,
  buildTrialContext,
  computeTrialFacts,
  isTrialRunning,
  mayClaimAllMatched,
  mayStateRecordClean,
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

/** Day 56 of 56 is 25 August 2026; the grace runs 56 days past it. */
const LAST_TARGET_DAY = '2026-08-25';
const EFFECTIVE_END = '2026-10-20';

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
    expect(isTrialRunning(TRIAL, Date.parse(at('2026-10-21')))).toBe(false);
  });

  it('covers ACVIM’s ≥12-week GI course on the 28-day dog·gut default', () => {
    // THE COUNTEREXAMPLE THAT SET THE CONSTANT. P-1's dog·gut default is 28d;
    // ACVIM 2026 says continue ≥12 weeks (84 days) before transitioning away. A
    // grace sized off §4.3's named extensions (+28d skin / +14d GI) sizes it off
    // the SKIN case and expires on day 56 of that 84-day course — and the
    // observable was not a soft degradation but the vet report's trial block
    // VANISHING mid-intervention (see the selectReportTrial suite).
    const gi = { startedAt: '2026-07-01', targetDurationDays: 28 };
    expect(isTrialRunning(gi, Date.parse(at('2026-09-22')))).toBe(true); // day 84
    // Every other P-1 cell clears its own clinical ceiling too.
    const catGut = { startedAt: '2026-07-01', targetDurationDays: 42 };
    expect(isTrialRunning(catGut, Date.parse(at('2026-09-22')))).toBe(true);
    expect(isTrialRunning(TRIAL, Date.parse(at('2026-09-22')))).toBe(true); // skin, 8–12wk
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
    expect(isTrialRunning({ startedAt: '2026-07-01', targetDurationDays: 56 }, Date.parse(at('2026-10-21')))).toBe(false);
  });
});

// ── (2) The window: belief, evidence, and the one denominator ────────────────
//
// THE DISTINCTION THIS SECTION EXISTS TO PIN. The effective end bounds BELIEF
// (`isTrialRunning`) and ONE DENOMINATOR (coverage). It must never bound
// EVIDENCE. The first cut of B-422 put it on `buildTrialContext.endDayIndex`,
// which is what `isInTrialWindow` reads, so the app stopped SEEING the record on
// a trial nobody ended — and an `adversarial-reviewer` pass turned that into
// four separate reassurance-direction failures in one sitting.

describe('the effective end never narrows the evidence window', () => {
  it('leaves buildTrialContext bounded by the DECLARED end alone', () => {
    expect(buildTrialContext(TRIAL, [DUCK]).endDayIndex).toBeNull();
    expect(buildTrialContext({ ...TRIAL, endedAt: '2026-07-19' }, [DUCK]).endDayIndex).toBe(
      dayIndex('2026-07-19'),
    );
  });

  it('still counts an off-diet feeding logged past the effective end', () => {
    // §5.2 rules the exposure count a FLOOR: it may only ever move toward
    // disclosing MORE. The first cut excluded this feeding and called it correct.
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
    expect(facts.exposures.totalFeedings).toBe(2);
    expect(facts.exposures.offDiet).toBe(1);
    expect(facts.exposures.mostRecent?.label).toBe('Generic Chicken Strips');
  });

  it('still counts an oral-route (C3) dose logged after the last meal', () => {
    // THE COUNTEREXAMPLE. A beef-flavoured chewable on trial-day 66, with the
    // last meal on day 61. The first cut bounded the DOSE loop on the coverage
    // clip — whose anchor is feedings — so the dose vanished, and because
    // `oralRoute` is one of the five withholding clauses, losing it flipped
    // `mayClaimAllMatched` FALSE → TRUE. Deleting a finding turned silence into
    // an affirmative claim.
    const facts = computeTrialFacts({
      trial: TRIAL,
      allowedFoods: [DUCK],
      feedings: [feeding({ eventId: 'm1', occurredAt: at('2026-08-30') })], // day 61
      doses: [
        {
          eventId: 'd1',
          occurredAt: at('2026-09-04'), // day 66 — after the last meal
          drugLabel: 'Heartgard',
          form: 'chewable',
          pairedEventId: null,
          adherence: 'given',
        },
      ],
      nowMs: Date.parse(at('2026-09-09')),
    });
    expect(facts.oralRoute).toHaveLength(1);
    expect(mayClaimAllMatched(facts)).toBe(false);
    expect(mayStateRecordClean(facts, { stoppedForRefusal: false })).toBe(false);
  });

  it('still sees a refusing cat past the effective end, and withholds the claim', () => {
    // THE WORST OF THE SIX, and the one that made this a redesign rather than a
    // patch. A cat eats every bowl for 61 days, then from trial-day 181 refuses
    // 38 of 38 rated bowls across 19 days — every one logged. The first cut
    // excluded all of them: `trialDietRefusal` went null, coverage read 61/61 =
    // 100% `supports`, and `mayStateRecordClean` flipped FALSE → TRUE. The card,
    // which B-422 deliberately keeps rendering forever, then showed the clean
    // two-fact presentation over an anorexic cat 100× past the feline 48h
    // hepatic-lipidosis window. That is reassurance-on-absence, produced by the
    // fix, on the exact surface B-494 exists to protect.
    const feedings: TrialFeeding[] = [];
    for (let d = 0; d < 61; d += 1) {
      feedings.push(
        feeding({
          eventId: `ate-${d}`,
          occurredAt: at(new Date((dayIndex('2026-07-01') + d) * 86_400_000).toISOString().slice(0, 10)),
          intakeRating: 'all',
        }),
      );
    }
    for (let d = 0; d < 19; d += 1) {
      const day = new Date((dayIndex('2026-07-01') + 180 + d) * 86_400_000).toISOString().slice(0, 10);
      feedings.push(feeding({ eventId: `ref-${d}a`, occurredAt: at(day, 8), intakeRating: 'refused' }));
      feedings.push(feeding({ eventId: `ref-${d}b`, occurredAt: at(day, 18), intakeRating: 'refused' }));
    }
    const facts = computeTrialFacts({
      trial: TRIAL,
      allowedFoods: [DUCK],
      feedings,
      nowMs: Date.parse(at(new Date((dayIndex('2026-07-01') + 199) * 86_400_000).toISOString().slice(0, 10))),
    });
    // The NOW-fact is the one that matters clinically and the one the first cut
    // erased: recency-bounded to the last 14 days of the EVIDENCE end, so it sees
    // 26 refusals across 13 days at a 100% share. (`rangeRefusal` is null here and
    // correctly so — over the whole range she ate 61 bowls and refused 38, which
    // is below the ratified 50% share. The history says "mixed"; the present says
    // "not eating". That is exactly why both populations exist.)
    expect(facts.trialDietRefusal).not.toBeNull();
    expect(facts.trialDietRefusal?.refusedFeedings).toBe(26);
    expect(facts.trialDietRefusal?.ratedFeedings).toBe(26);
    expect(facts.recentFinishedFeedings).toBe(0);
    expect(mayStateRecordClean(facts, { stoppedForRefusal: false })).toBe(false);
  });

  it('anchors the present-tense refusal window on TODAY, not on the clipped end', () => {
    // A cat refused every bowl on trial-days 71–84, then recovered and has eaten
    // all 232 bowls since. Anchoring the "now" fact on the coverage clip made the
    // card state the present-tense viability register — "needs a call today" —
    // from data 116 days stale, with the `recentFinished` stand-down evidence
    // structurally excluded. A false alarm the owner cannot clear.
    const feedings: TrialFeeding[] = [];
    for (let d = 70; d < 84; d += 1) {
      const day = new Date((dayIndex('2026-07-01') + d) * 86_400_000).toISOString().slice(0, 10);
      feedings.push(feeding({ eventId: `r-${d}a`, occurredAt: at(day, 8), intakeRating: 'refused' }));
      feedings.push(feeding({ eventId: `r-${d}b`, occurredAt: at(day, 18), intakeRating: 'refused' }));
    }
    for (let d = 84; d < 200; d += 1) {
      const day = new Date((dayIndex('2026-07-01') + d) * 86_400_000).toISOString().slice(0, 10);
      feedings.push(feeding({ eventId: `o-${d}a`, occurredAt: at(day, 8), intakeRating: 'all' }));
      feedings.push(feeding({ eventId: `o-${d}b`, occurredAt: at(day, 18), intakeRating: 'all' }));
    }
    const facts = computeTrialFacts({
      trial: TRIAL,
      allowedFoods: [DUCK],
      feedings,
      nowMs: Date.parse(at(new Date((dayIndex('2026-07-01') + 199) * 86_400_000).toISOString().slice(0, 10))),
    });
    expect(facts.trialDietRefusal).toBeNull();
    expect(facts.recentFinishedFeedings).toBeGreaterThan(0);
  });

  it('keeps a standing free-choice bowl visible past the effective end', () => {
    // The arrangement read is an OVERLAP query, so narrowing its window is the
    // same class of deletion: losing the bowl both flips the card's state and
    // removes a reason the affirmative claim is withheld.
    const facts = computeTrialFacts({
      trial: TRIAL,
      allowedFoods: [DUCK],
      feedings: [feeding({ eventId: 'm1' })],
      arrangements: [
        { foodItemId: 'kibble', foodKey: 'genericchicken kibble', label: 'Generic Chicken Kibble', startedAt: '2026-07-05', endedAt: null },
      ],
      nowMs: Date.parse(at('2027-03-01')),
    });
    expect(facts.intakeNotDirectlyObserved).toBe(true);
    expect(facts.intakeNotDirectlyObservedNow).toBe(true);
    expect(facts.arrangementExposures).toHaveLength(1);
    expect(mayClaimAllMatched(facts)).toBe(false);
  });

  it('renders a scoped report on an overrun trial instead of dropping the block', () => {
    // A since-visit scope (rung 1) starting AFTER the trial's target end. The
    // first cut clipped the range end below its own start, hit the early return,
    // and `buildTrialBlock` dropped the ENTIRE trial section — taking an
    // in-scope, in-window off-diet exposure with it.
    const facts = computeTrialFacts({
      trial: TRIAL,
      allowedFoods: [DUCK],
      feedings: [
        feeding({
          eventId: 'chicken',
          occurredAt: at('2026-09-30'), // trial-day 92, inside the scope
          foodItemId: 'chicken-treat',
          foodKey: 'genericchicken strips',
          label: 'Generic Chicken Strips',
          foodType: 'treat',
          proteins: ['chicken'],
        }),
      ],
      scopeStart: '2026-09-29', // trial-day 91 — a vet visit
      scopeEnd: '2026-10-04',
      nowMs: Date.parse(at('2026-10-04')),
    });
    expect(facts.range).not.toBeNull();
    expect(facts.exposures.offDiet).toBe(1);
    expect(facts.range?.closedByOverrun).toBe(true);
  });
});

// ── The tail clip — the grace never reaches a denominator ────────────────────

describe('the overrun tail clip', () => {
  function facts(lastLogDay: string, nowDay: string, extra: TrialFeeding[] = []) {
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
      feedings: [...feedings, ...extra],
      nowMs: Date.parse(at(nowDay)),
    });
  }

  it('denominates a perfectly-run, never-closed trial over its OWN 56 days', () => {
    // THE CASE THAT DROVE THE CLIP. Without it this rendered "56 of 84 days" —
    // 67%, `partially_supports` instead of `supports` — on a trial run exactly as
    // prescribed. On the vet report the harm is sharper than a percentage: a vet
    // who prescribed eight weeks and reads a longer denominator concludes the
    // owner ran a longer, sloppier trial than they did. The grace is a tolerance
    // for the owner's SILENCE; it is not a claim that the diet continued.
    const f = facts(LAST_TARGET_DAY, '2027-03-01');
    expect(f.coverage).toEqual({ daysLogged: 56, daysElapsed: 56, fraction: 1 });
    expect(f.interpretability).toBe('supports');
    expect(f.belowCoverageFloor).toBe(false);
    expect(f.range?.closedByOverrun).toBe(true);
  });

  it('is not moved by a single logged TREAT past the target', () => {
    // The anchor is non-treat feedings, matching the head clip and the coverage
    // numerator. Anchoring on every feeding — which the first cut did, to prove
    // the clip could not drop an exposure — let ONE permitted duck treat on day
    // 84 re-create the exact "56 of 84" harm above, and near the floor flip
    // `belowCoverageFloor` on. That proof is no longer needed: the clip does not
    // bound evidence at all now.
    const treat = feeding({
      eventId: 'treat-84',
      occurredAt: at('2026-09-22'),
      foodType: 'treat',
    });
    const f = facts(LAST_TARGET_DAY, '2027-03-01', [treat]);
    expect(f.coverage).toEqual({ daysLogged: 56, daysElapsed: 56, fraction: 1 });
    expect(f.interpretability).toBe('supports');
    // …and the treat is still COUNTED, because evidence is never narrowed.
    expect(f.exposures.totalFeedings).toBe(57);
  });

  it('extends the window when the RECORD shows the trial outlived its target', () => {
    // An owner still logging MEALS on day 70 was still running it on day 70.
    const f = facts('2026-09-08', '2027-03-01'); // day 70
    expect(f.coverage).toEqual({ daysLogged: 70, daysElapsed: 70, fraction: 1 });
  });

  it('never extends past the effective end, however long the logging runs', () => {
    // An owner who keeps logging for a year must not accrue a year of
    // denominator — that is the unbounded growth B-422 was filed for. Day 112 =
    // 2026-10-20 = the effective end.
    const f = facts('2026-12-31', '2027-03-01');
    expect(f.range?.endDayIndex).toBe(dayIndex(EFFECTIVE_END));
    expect(f.coverage?.daysElapsed).toBe(112);
  });

  it('does not let a stopped record shrink the window below the prescribed target', () => {
    // The inverse guard. Logging stopped on day 30 of 56 and today is day 60: the
    // four days past the target drop (they are past the prescription), but days
    // 31–56 are a GENUINE gap and stay in the denominator.
    const f = facts('2026-07-30', '2026-08-29');
    expect(f.coverage).toEqual({ daysLogged: 30, daysElapsed: 56, fraction: 30 / 56 });
  });

  it('leaves a DECLARED end alone — that window is the owner’s own assertion', () => {
    // The clip is inference, and inference must not overwrite a fact the owner
    // authored. Days between their last log and the end they named are genuine
    // gaps, so `closedByOverrun` is false and nothing is clipped.
    const f = computeTrialFacts({
      trial: { ...TRIAL, endedAt: '2026-09-30' },
      allowedFoods: [DUCK],
      feedings: [feeding({ eventId: 'm1', occurredAt: at('2026-07-01') })],
      nowMs: Date.parse(at('2026-11-01')),
    });
    expect(f.range?.endDayIndex).toBe(dayIndex('2026-09-30'));
    expect(f.range?.closedByOverrun).toBe(false);
  });

  it('leaves a targetless trial unbounded, exactly as before', () => {
    const f = computeTrialFacts({
      trial: { ...TRIAL, targetDurationDays: 0 },
      allowedFoods: [DUCK],
      feedings: [feeding({ eventId: 'm1', occurredAt: at('2026-07-01') })],
      nowMs: Date.parse(at('2026-12-01')),
    });
    expect(f.range?.endDayIndex).toBe(dayIndex('2026-12-01'));
    expect(f.range?.closedByOverrun).toBe(false);
  });

  it('does not move the window at all before the target end', () => {
    // Regression guard: nothing about an ordinary running trial changes. Day 10
    // of 56, last logged on day 3 — days 4-10 are a real gap and stay in.
    const f = computeTrialFacts({
      trial: TRIAL,
      allowedFoods: [DUCK],
      feedings: [feeding({ eventId: 'm1', occurredAt: at('2026-07-03') })],
      nowMs: Date.parse(at('2026-07-10')),
    });
    expect(f.range?.endDayIndex).toBe(dayIndex('2026-07-10'));
    expect(f.coverage).toEqual({ daysLogged: 1, daysElapsed: 8, fraction: 0.125 });
    expect(f.range?.closedByOverrun).toBe(false);
  });
});

// ── Invariants over generated inputs (adversarial round 2) ──────────────────
//
// Round 2 broke the range arithmetic twice, and both breaks were shapes no
// example test happened to name: an owner who kept logging after the trial was
// over (numerator bounded by the evidence end, denominator by the clip), and one
// whose first log landed past the effective end (head clip later than tail clip
// → `daysElapsed: -88`). Example lists do not find those. These do.

describe('range invariants', () => {
  const DAY = 86_400_000;
  const START = dayIndex('2026-07-01');

  /** A deterministic pseudo-random walk — seeded, so a failure reproduces. */
  function lcg(seed: number): () => number {
    let s = seed >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  }

  it('never renders daysLogged > daysElapsed, a fraction > 1, or an inverted range', () => {
    const rand = lcg(20260729);
    for (let trial = 0; trial < 400; trial += 1) {
      const target = Math.floor(rand() * 90); // includes 0 — the targetless trial
      const horizon = Math.floor(rand() * 400);
      const declaredEnd = rand() < 0.3 ? Math.floor(rand() * horizon) : null;
      const feedings: TrialFeeding[] = [];
      const n = Math.floor(rand() * 40);
      for (let i = 0; i < n; i += 1) {
        const offset = Math.floor(rand() * (horizon + 1));
        feedings.push(
          feeding({
            eventId: `f-${trial}-${i}`,
            occurredAt: at(new Date((START + offset) * DAY).toISOString().slice(0, 10)),
            foodType: rand() < 0.5 ? 'treat' : 'meal',
          }),
        );
      }
      const facts = computeTrialFacts({
        trial: {
          ...TRIAL,
          targetDurationDays: target,
          endedAt:
            declaredEnd === null
              ? null
              : new Date((START + declaredEnd) * DAY).toISOString().slice(0, 10),
        },
        allowedFoods: [DUCK],
        feedings,
        nowMs: Date.parse(at(new Date((START + horizon) * DAY).toISOString().slice(0, 10))),
      });
      if (!facts.range || !facts.coverage) continue;
      const where = `trial=${trial} target=${target} horizon=${horizon} declaredEnd=${declaredEnd}`;
      expect(`${where} inverted=${facts.range.endDayIndex < facts.range.startDayIndex}`).toContain('inverted=false');
      expect(`${where} elapsed=${facts.range.daysElapsed}`).toContain(`elapsed=${facts.range.daysElapsed}`);
      expect(facts.range.daysElapsed).toBeGreaterThan(0);
      expect(facts.coverage.daysLogged).toBeLessThanOrEqual(facts.coverage.daysElapsed);
      expect(facts.coverage.fraction).toBeLessThanOrEqual(1);
      expect(facts.coverage.fraction).toBeGreaterThanOrEqual(0);
    }
  });

  it('never drops a logged off-diet feeding from the itemisation', () => {
    // The invariant the module claims and `generate-report` broke: every feeding
    // the exposure COUNT includes is inside `exposureRange`, so a consumer that
    // walks that range reproduces the same set. A count without its items is what
    // unlocked the affirmative "every one matched" empty state on the report.
    const rand = lcg(511);
    for (let trial = 0; trial < 200; trial += 1) {
      const target = 1 + Math.floor(rand() * 80);
      const horizon = Math.floor(rand() * 400);
      const offsets: number[] = [];
      const feedings: TrialFeeding[] = [];
      for (let i = 0, n = Math.floor(rand() * 25); i < n; i += 1) {
        const offset = Math.floor(rand() * (horizon + 1));
        offsets.push(offset);
        feedings.push(
          feeding({
            eventId: `x-${trial}-${i}`,
            occurredAt: at(new Date((START + offset) * DAY).toISOString().slice(0, 10)),
            foodItemId: 'chicken',
            foodKey: 'genericchicken strips',
            label: 'Generic Chicken Strips',
            foodType: 'treat',
            proteins: ['chicken'],
          }),
        );
      }
      const facts = computeTrialFacts({
        trial: { ...TRIAL, targetDurationDays: target },
        allowedFoods: [DUCK],
        feedings,
        nowMs: Date.parse(at(new Date((START + horizon) * DAY).toISOString().slice(0, 10))),
      });
      if (!facts.exposureRange) continue;
      const { startDayIndex, endDayIndex } = facts.exposureRange;
      const walkable = offsets.filter(
        (o) => START + o >= startDayIndex && START + o <= endDayIndex,
      ).length;
      expect(walkable).toBe(facts.exposures.offDiet);
      expect(facts.exposures.items).toHaveLength(facts.exposures.offDiet);
    }
  });
});

describe('the coverage numerator and denominator share one window', () => {
  it('is not rescued to `supports` by logging that continues after the trial', () => {
    // A record that reads 19 of 56 (`does_not_support`, sub-floor) the moment the
    // owner taps Complete must not read 100 of 112 (`supports`) purely because
    // they didn't. The numerator was bounded by the evidence end and the
    // denominator by the tail clip, so post-trial logging un-suppressed §5.2's
    // record claim on exactly the under-capturing owner the floor exists for.
    const feedings: TrialFeeding[] = [];
    for (let d = 0; d < 300; d += 3) {
      feedings.push(
        feeding({
          eventId: `m-${d}`,
          occurredAt: at(new Date((dayIndex('2026-07-01') + d) * 86_400_000).toISOString().slice(0, 10)),
        }),
      );
    }
    const args = { allowedFoods: [DUCK], feedings, nowMs: Date.parse(at('2027-04-27')) };
    const unended = computeTrialFacts({ trial: TRIAL, ...args });
    const ended = computeTrialFacts({ trial: { ...TRIAL, endedAt: LAST_TARGET_DAY }, ...args });
    expect(unended.coverage!.fraction).toBeLessThanOrEqual(ended.coverage!.fraction + 0.01);
    expect(unended.belowCoverageFloor).toBe(true);
    expect(unended.interpretability).not.toBe('supports');
  });

  it('does not invert when the first log lands past the effective end', () => {
    // The owner who drifted off the app and re-engaged. The head clip is drawn
    // from the evidence window and the tail clip from the coverage one, so an
    // unguarded head could land AFTER the tail: `daysElapsed: -88`, rendered as
    // "Meals logged on 30 of -88 days".
    const feedings: TrialFeeding[] = [];
    for (let d = 200; d < 230; d += 1) {
      feedings.push(
        feeding({
          eventId: `late-${d}`,
          occurredAt: at(new Date((dayIndex('2026-07-01') + d) * 86_400_000).toISOString().slice(0, 10)),
        }),
      );
    }
    const facts = computeTrialFacts({
      trial: TRIAL,
      allowedFoods: [DUCK],
      feedings,
      nowMs: Date.parse(at(new Date((dayIndex('2026-07-01') + 235) * 86_400_000).toISOString().slice(0, 10))),
    });
    expect(facts.range!.daysElapsed).toBeGreaterThan(0);
    expect(facts.range!.endDayIndex).toBeGreaterThanOrEqual(facts.range!.startDayIndex);
    // Nothing was logged inside the trial's own window, and the record says so
    // rather than claiming a ratio over days it never covered.
    expect(facts.coverage!.daysLogged).toBe(0);
    // …and every one of those 30 late feedings is still EVIDENCE.
    expect(facts.exposures.totalFeedings).toBe(30);
  });
});
