// The findings that render (B-789, widened by CUL-1216): every FALLING VOMIT PAIR is withheld
// beside a not-eating record — the caller's register, or an intake decline in the Signal itself.

import { isFallingVomitPair, signalSaysNotEating, visibleFindings } from './signalVisible';
import type { CachedFinding, SignalFinding } from './signal';

const at = (rank: number, finding: SignalFinding): CachedFinding => ({ rank, text: `${finding.type} ${rank}`, finding });

const reflection = (over: Record<string, unknown> = {}): SignalFinding =>
  ({ type: 'reflection', priorityClass: 'insight', symptomType: 'vomit', currentCount: 1, priorCount: 4, direction: 'improving', windowDays: 14, ...over }) as SignalFinding;
const trialResponse = (dir: 'fewer_during_trial' | 'more_during_trial'): SignalFinding =>
  ({ type: 'trial_response', priorityClass: 'insight', comparisonDirection: dir, pooledTrialCount: 1, pooledBaselineCount: 4 }) as unknown as SignalFinding;
const decline: SignalFinding = {
  type: 'intake_decline',
  priorityClass: 'safety',
  trigger: 'consecutive_low',
  species: 'cat',
  daysBelowBaseline: 3,
  refusedFoodLabel: null,
  ratedMealsConsidered: 9,
};

describe('isFallingVomitPair', () => {
  it('is the trial card’s fewer direction and a falling VOMIT reflection — nothing else', () => {
    expect(isFallingVomitPair(trialResponse('fewer_during_trial'))).toBe(true);
    expect(isFallingVomitPair(reflection())).toBe(true);
    expect(isFallingVomitPair(trialResponse('more_during_trial'))).toBe(false);
    expect(isFallingVomitPair(reflection({ direction: 'flat' }))).toBe(false);
    expect(isFallingVomitPair(reflection({ symptomType: 'diarrhea' }))).toBe(false);
    expect(isFallingVomitPair(decline)).toBe(false);
  });
});

describe('visibleFindings — the not-eating register', () => {
  const set = [at(0, reflection()), at(1, trialResponse('fewer_during_trial')), at(2, trialResponse('more_during_trial')), at(3, reflection({ direction: 'flat' }))];

  it('with the register off, everything renders in rank order', () => {
    expect(visibleFindings(set, false).map((f) => f.rank)).toEqual([0, 1, 2, 3]);
  });

  // The issue's counterexample: day 40, every rated trial meal refused, a falling vomit
  // reflection leading Home above a strip that withheld its own line.
  it('with the register on, both falling vomit pairs go and the rise and the flat week stay', () => {
    expect(visibleFindings(set, true).map((f) => f.rank)).toEqual([2, 3]);
  });

  it('an intake decline in the Signal withholds on its own — a pet with no trial has no other register', () => {
    const withDecline = [at(0, decline), ...set.map((f) => ({ ...f, rank: f.rank + 1 }))];
    expect(signalSaysNotEating(withDecline)).toBe(true);
    expect(signalSaysNotEating(set)).toBe(false);
    expect(visibleFindings(withDecline, false).map((f) => f.finding.type)).toEqual(['intake_decline', 'trial_response', 'reflection']);
  });

  it('never withholds the intake decline itself, under either register state', () => {
    for (const on of [true, false]) expect(visibleFindings([at(0, decline)], on)).toHaveLength(1);
  });
});
