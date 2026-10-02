// TS-9 (CUL-1305): the trial screen's door to the Signal's trial finding. The rule under
// test is "the door exists exactly when Home would draw the card", so every case drives the
// real `visibleFindings` (never a restatement of it, C-34) over a finding set shaped like the
// cache the loader returns.
import { signalTitle } from './signalTitle';
import type { CachedFinding, SignalFinding } from './signal';
import type { SignalTrialWindow } from './signalWindows';
import { SIGNAL_DOOR_SUB, trialSignalDoor } from './trialSignalDoor';
import { hasTitleVerdictWord } from './signalTitle';

const NOW = Date.UTC(2026, 8, 27, 15, 0, 0);

const trialResponse = (dir: 'fewer_during_trial' | 'more_during_trial'): SignalFinding =>
  ({
    type: 'trial_response',
    priorityClass: 'insight',
    trialDayNumber: 55,
    targetDurationDays: 56,
    trialLoggedDays: 51,
    baselineLoggedDays: 44,
    baselineWindowDays: 55,
    pooledTrialCount: 3,
    pooledBaselineCount: 11,
    rapid: { trial: 1, baseline: 4 },
    long: { trial: 0, baseline: 0 },
    rapidWindowMinutes: 30,
    longGapHours: 6,
    treatShare: { trial: null, baseline: null },
    mealsPerDay: { trial: null, baseline: null },
    comparisonDirection: dir,
    trialWindowDays: 55,
  }) as unknown as SignalFinding;

const decline = {
  type: 'intake_decline',
  priorityClass: 'safety',
  trigger: 'consecutive_low',
  species: 'cat',
  daysBelowBaseline: 3,
  refusedFoodLabel: null,
  ratedMealsConsidered: 9,
} as unknown as SignalFinding;

const reflection = {
  type: 'reflection',
  priorityClass: 'insight',
  symptomType: 'vomit',
  currentCount: 1,
  priorCount: 4,
  direction: 'improving',
  windowDays: 14,
} as unknown as SignalFinding;

const at = (rank: number, finding: SignalFinding): CachedFinding => ({ rank, text: `t${rank}`, finding });

const window: SignalTrialWindow = {
  startDay: '2026-09-05',
  identity: 'Rabbit trial',
  dayCounter: 23,
  targetDays: 56,
  foodLabel: 'Royal Canin Selected Protein PR',
};

const door = (findings: CachedFinding[], withhold: boolean, trialWindow: SignalTrialWindow | null = window) =>
  trialSignalDoor({ petId: 'pet-1', findings, withholdFallingVomit: withhold, trialWindow, generatedAt: null, nowMs: NOW });

describe('trialSignalDoor — the door exists exactly when Home draws the card', () => {
  it('names the Signal screen it opens, with the ruled sub-line, and pushes Home’s own href', () => {
    expect(door([at(0, trialResponse('more_during_trial'))], false)).toEqual({
      label: 'Rabbit trial, day 23 of 56',
      sub: 'Vomiting, from the Signal',
      href: '/signal/trial_response?pet=pet-1',
    });
  });

  it('the head is the Signal screen’s title for the same finding and window, and carries no count or verdict', () => {
    for (const dir of ['fewer_during_trial', 'more_during_trial'] as const) {
      const f = trialResponse(dir);
      for (const w of [window, null]) {
        const d = door([at(0, f)], false, w);
        expect(d?.label).toBe(signalTitle(f, w));
        expect(hasTitleVerdictWord(`${d?.label} ${d?.sub}`)).toBe(false);
        // No number beyond the trial's own day and length.
        expect(d?.label.match(/\d+/g)).toEqual(w ? ['23', '56'] : ['55', '56']);
      }
    }
    expect(SIGNAL_DOOR_SUB).not.toMatch(/\d/);
  });

  it('no trial finding in the cache: no door', () => {
    expect(door([], false)).toBeNull();
    expect(door([at(0, reflection)], false)).toBeNull();
  });

  // B-789 (§5.2): the counterexample the gate exists for. A cat refusing the trial food has an
  // empty stomach, so "fewer vomits in the trial" beside it is the reassurance Home withholds.
  it('a FALLING pair over a pet that may not be eating has no door, because Home draws no card', () => {
    expect(door([at(0, trialResponse('fewer_during_trial'))], true)).toBeNull();
    expect(door([at(0, trialResponse('fewer_during_trial'))], false)).not.toBeNull();
  });

  it('the Signal’s own intake decline withholds the falling pair even when the trial register says eating', () => {
    expect(door([at(0, decline), at(1, trialResponse('fewer_during_trial'))], false)).toBeNull();
  });

  it('a RISING pair keeps its door under either register (S7: never less than Home when it escalates)', () => {
    for (const withhold of [true, false]) {
      expect(door([at(0, trialResponse('more_during_trial'))], withhold)).not.toBeNull();
      expect(door([at(0, decline), at(1, trialResponse('more_during_trial'))], withhold)).not.toBeNull();
    }
  });

  it('encodes the pet into the href exactly as Home does', () => {
    const d = trialSignalDoor({
      petId: 'a b/c',
      findings: [at(0, trialResponse('more_during_trial'))],
      withholdFallingVomit: false,
      trialWindow: window,
      generatedAt: null,
      nowMs: NOW,
    });
    expect(d?.href).toBe('/signal/trial_response?pet=a%20b%2Fc');
  });
});
