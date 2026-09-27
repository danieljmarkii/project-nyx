// CUL-1364 (CUL-1360's Get ready half): "Worth raising" reads the Signal's trial anchor,
// so a trial finding counted over a trial since replaced gets Home's answer here too. The
// windows are built by the loader's own `signalTrialWindowOf` and the engine's day number
// by that builder at the instant the engine counted (C-34); every instant is built from
// LOCAL components (B-514), anchored to today's clock (C-29, the time axis).

// `lib/rundown` and `lib/signalScreen` reach the client and the local store at import;
// `buildWorthRaising` is pure and reads neither.
jest.mock('./supabase', () => ({ supabase: {} }));
jest.mock('./db', () => ({ getDb: () => ({}) }));

import { buildWorthRaising, type WorthRaisingInput } from './getReady';
import type { Rundown } from './rundown';
import type { CachedFinding, TrialResponseFinding } from './signal';
import type { TrialCardTrial } from './dietTrialCard';
import { signalTrialWindowOf } from './signalScreen';
import type { SignalTrialAnchor } from './signalTrialAnchor';
import { dayKeyFromIndex, localDayIndexOf, toLocalDayKey } from './utils';

const NOW = Date.now();
const TODAY = toLocalDayKey(new Date(NOW));
const shift = (key: string, days: number): string => dayKeyFromIndex((localDayIndexOf(key) as number) + days);
const at = (key: string, hour: number): number => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, hour).getTime();
};

const trialRow = (protein: string, startedAt: string): TrialCardTrial =>
  ({
    id: `trial-${protein}`,
    status: 'active',
    startedAt,
    endedAt: null,
    targetDurationDays: 56,
    foodLabel: null,
    trialProtein: { protein, source: 'owner' },
  }) as TrialCardTrial;

// Rabbit started 21 days ago and was counted yesterday afternoon (its day 21); the owner
// replaced it with chicken today.
const RABBIT = trialRow('rabbit', shift(TODAY, -21));
const CHICKEN = trialRow('chicken', TODAY);
const COUNTED = at(shift(TODAY, -1), 16);

const pair = (dir: 'fewer_during_trial' | 'more_during_trial'): CachedFinding => {
  const w = signalTrialWindowOf(RABBIT, COUNTED);
  if (!w) throw new Error('fixture: rabbit was not running when the engine counted');
  const [trial, before] = dir === 'fewer_during_trial' ? [2, 11] : [11, 2];
  const finding: TrialResponseFinding = {
    type: 'trial_response',
    priorityClass: 'insight',
    trialDayNumber: w.dayCounter,
    targetDurationDays: 56,
    trialLoggedDays: w.dayCounter,
    baselineLoggedDays: 45,
    baselineWindowDays: 49,
    pooledTrialCount: trial,
    pooledBaselineCount: before,
    rapid: { trial: 1, baseline: 1 },
    long: { trial: 0, baseline: 0 },
    rapidWindowMinutes: 30,
    longGapHours: 6,
    treatShare: { trial: null, baseline: null },
    mealsPerDay: { trial: null, baseline: null },
    comparisonDirection: dir,
    trialWindowDays: w.dayCounter,
  };
  return {
    rank: 1,
    text: `We've logged ${trial} episodes of vomiting for Mochi in the trial's ${w.dayCounter} days, compared with ${before} in the 49 days before it — worth reviewing with your vet.`,
    finding,
  };
};

const rundown = {
  generatedAtMs: NOW,
  facts: { courses: [], medItemNames: new Map() },
  tiles: [],
} as unknown as Rundown;

const input = (findings: CachedFinding[], signalAnchor: SignalTrialAnchor): WorthRaisingInput => ({
  findings,
  withholdFallingVomit: false,
  signalAnchor,
  trialStrip: null,
  trialScreen: null,
  trialFacts: { status: 'unknown' },
  trialResponseCounts: null,
  intakeDecline: [],
  rundown,
  nowMs: NOW,
});

const anchorOn = (trial: TrialCardTrial): SignalTrialAnchor => ({
  generatedAt: new Date(COUNTED).toISOString(),
  trial: signalTrialWindowOf(trial, NOW),
});
const quoted = (w: ReturnType<typeof buildWorthRaising>, f: CachedFinding) => w.rows.find((r) => r.text === f.text);

describe('Worth raising honours the trial anchor (CUL-1364)', () => {
  it('the fixtures are the counterexample: rabbit on day 21 when counted, chicken on day 1 now', () => {
    expect((pair('fewer_during_trial').finding as TrialResponseFinding).trialDayNumber).toBe(21);
    expect(signalTrialWindowOf(CHICKEN, NOW)).toMatchObject({ identity: 'Chicken trial', dayCounter: 1 });
  });

  it('an older trial’s FALLING pair is not quoted under the new trial', () => {
    const fewer = pair('fewer_during_trial');
    expect(quoted(buildWorthRaising(input([fewer], anchorOn(CHICKEN))), fewer)).toBeUndefined();
  });

  it('an older trial’s RISING pair stays, quoted verbatim and named by its own day', () => {
    const more = pair('more_during_trial');
    const row = quoted(buildWorthRaising(input([more], anchorOn(CHICKEN))), more);
    expect(row).toBeDefined();
    expect(row?.detail).toBe('Diet trial, day 21 of 56');
  });

  it('the trial it counted still running: the pair is quoted as before, with no detail', () => {
    const fewer = pair('fewer_during_trial');
    const row = quoted(buildWorthRaising(input([fewer], anchorOn(RABBIT))), fewer);
    expect(row).toBeDefined();
    expect(row?.detail).toBeNull();
  });

  it('an anchor that cannot answer changes nothing', () => {
    const fewer = pair('fewer_during_trial');
    const row = quoted(buildWorthRaising(input([fewer], { generatedAt: null, trial: signalTrialWindowOf(CHICKEN, NOW) })), fewer);
    expect(row).toBeDefined();
    expect(row?.detail).toBeNull();
  });
});
