// CUL-1360: a cached trial finding is never titled with a trial it did not count.
//
// Every case drives the shipped pieces end to end (C-34): the trial window is built by
// `signalTrialWindowOf` (the loader's own builder), the engine's day number is that same
// builder asked at the instant the engine counted (the server's `trialDayCounter` over the
// same local-day helpers), and the verdicts are read off the real `visibleFindings`,
// `signalTitle`, `signalHomeLine` and `trialSignalDoor`. Every instant is built from LOCAL
// components, so the suite means the same thing in the non-UTC CI zones (B-514).

// `signalScreen` reaches the local store and the client at import; neither is read here.
jest.mock('./db', () => ({ getDb: () => ({}) }));
jest.mock('./supabase', () => ({ supabase: {} }));

import type { CachedFinding, SignalFinding, TrialResponseFinding } from './signal';
import type { TrialCardTrial } from './dietTrialCard';
import { signalHomeLine } from './signalHomeLine';
import { signalTrialWindowOf } from './signalScreen';
import { signalTitle } from './signalTitle';
import {
  GENERATION_LAG_CEILING_MS,
  countedAnotherTrial,
  countedStartDays,
  isOtherTrialReassurance,
  signalTrialWindowFor,
  type SignalTrialAnchor,
} from './signalTrialAnchor';
import { visibleFindings } from './signalVisible';
import type { SignalTrialWindow } from './signalWindows';
import { trialSignalDoor } from './trialSignalDoor';
import { dayKeyFromIndex, localDayIndexOf } from './utils';

const TODAY = '2026-09-27';
const shift = (key: string, days: number): string => dayKeyFromIndex((localDayIndexOf(key) as number) + days);
/** An instant at a local wall-clock time on a local day (timezone-honest). */
const at = (key: string, hour: number, minute = 0): number => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, hour, minute).getTime();
};
const NOW = at(TODAY, 15);

const trialRow = (protein: string, startedAt: string, targetDurationDays = 56): TrialCardTrial =>
  ({
    id: `trial-${protein}`,
    status: 'active',
    startedAt,
    endedAt: null,
    targetDurationDays,
    foodLabel: null,
    trialProtein: { protein, source: 'owner' },
  }) as TrialCardTrial;

const windowOf = (trial: TrialCardTrial, ms: number): SignalTrialWindow => {
  const w = signalTrialWindowOf(trial, ms);
  if (!w) throw new Error('fixture: the trial is not running at that instant');
  return w;
};

/** The finding the engine wrote for `trial` at `countedMs`: its day number is the local
 *  trial's day counter at that instant, which is what `detectTrialResponse` computes. */
const findingFor = (
  trial: TrialCardTrial,
  countedMs: number,
  dir: 'fewer_during_trial' | 'more_during_trial',
): TrialResponseFinding => {
  const day = windowOf(trial, countedMs).dayCounter;
  return {
    type: 'trial_response',
    priorityClass: 'insight',
    trialDayNumber: day,
    targetDurationDays: trial.targetDurationDays,
    trialLoggedDays: day,
    baselineLoggedDays: 45,
    baselineWindowDays: 49,
    pooledTrialCount: dir === 'fewer_during_trial' ? 2 : 11,
    pooledBaselineCount: dir === 'fewer_during_trial' ? 11 : 2,
    rapid: { trial: 1, baseline: 4 },
    long: { trial: 0, baseline: 1 },
    rapidWindowMinutes: 30,
    longGapHours: 6,
    treatShare: { trial: null, baseline: null },
    mealsPerDay: { trial: null, baseline: null },
    comparisonDirection: dir,
    trialWindowDays: day,
  };
};

const cachedOf = (finding: SignalFinding, rank = 0): CachedFinding => ({ rank, text: 'the server sentence', finding });
const iso = (ms: number): string => new Date(ms).toISOString();

// The counterexample the issue names: rabbit since Sep 5, replaced by chicken today; the
// cache was written yesterday afternoon, on rabbit's day 22.
const RABBIT = trialRow('rabbit', '2026-09-05');
const CHICKEN = trialRow('chicken', TODAY);
const GENERATED = at(shift(TODAY, -1), 16);

describe('the fixtures are what they claim to be', () => {
  it('rabbit was on day 22 when the engine counted; chicken is on day 1 today', () => {
    expect(findingFor(RABBIT, GENERATED, 'fewer_during_trial').trialDayNumber).toBe(22);
    expect(windowOf(CHICKEN, NOW)).toMatchObject({ identity: 'Chicken trial', dayCounter: 1, startDay: TODAY });
  });
});

describe('(1) replaced today — rabbit counted, chicken running', () => {
  const anchor: SignalTrialAnchor = { generatedAt: iso(GENERATED), trial: windowOf(CHICKEN, NOW) };

  it('the anchor recovers rabbit’s start day and says the finding counted another trial', () => {
    const fewer = findingFor(RABBIT, GENERATED, 'fewer_during_trial');
    expect(countedStartDays(fewer, anchor.generatedAt)).toEqual([localDayIndexOf('2026-09-05')]);
    expect(countedAnotherTrial(fewer, anchor)).toBe(true);
  });

  it('the falling pair is dropped from what Home draws; the rising pair stays', () => {
    const fewer = cachedOf(findingFor(RABBIT, GENERATED, 'fewer_during_trial'));
    const more = cachedOf(findingFor(RABBIT, GENERATED, 'more_during_trial'));
    expect(visibleFindings([fewer], false, NOW, anchor)).toEqual([]);
    expect(visibleFindings([more], false, NOW, anchor)).toEqual([more]);
    // Without the anchor (the pre-fix call) the falling pair was drawn.
    expect(visibleFindings([fewer], false, NOW)).toEqual([fewer]);
  });

  it('the rising pair is titled by its OWN day, never "Chicken trial, day 1 of 56"', () => {
    const more = findingFor(RABBIT, GENERATED, 'more_during_trial');
    expect(signalTitle(more, anchor.trial)).toBe('Chicken trial, day 1 of 56'); // the defect
    expect(signalTitle(more, signalTrialWindowFor(more, anchor))).toBe('Diet trial, day 22 of 56');
    expect(signalHomeLine(more, signalTrialWindowFor(more, anchor))?.headline).toBe('Diet trial, day 22 of 56');
  });

  it('the trial screen’s door: none for the falling pair, the own-day title for the rising one', () => {
    const door = (dir: 'fewer_during_trial' | 'more_during_trial') =>
      trialSignalDoor({
        petId: 'pet-1',
        findings: [cachedOf(findingFor(RABBIT, GENERATED, dir))],
        withholdFallingVomit: false,
        trialWindow: anchor.trial,
        generatedAt: anchor.generatedAt,
        nowMs: NOW,
      });
    expect(door('fewer_during_trial')).toBeNull();
    expect(door('more_during_trial')?.label).toBe('Diet trial, day 22 of 56');
  });

  it('a finding that is not the trial card is never re-windowed', () => {
    const reflection: SignalFinding = { type: 'reflection', priorityClass: 'insight', symptomType: 'vomit', currentCount: 1, priorCount: 4, direction: 'improving', windowDays: 14 };
    expect(signalTrialWindowFor(reflection, anchor)).toBe(anchor.trial);
    expect(isOtherTrialReassurance(reflection, anchor)).toBe(false);
  });
});

describe('the finding that DID count the running trial keeps its name', () => {
  it('counted yesterday on day 22, today is day 23: current, titled with the trial', () => {
    const anchor: SignalTrialAnchor = { generatedAt: iso(GENERATED), trial: windowOf(RABBIT, NOW) };
    const fewer = findingFor(RABBIT, GENERATED, 'fewer_during_trial');
    expect(countedAnotherTrial(fewer, anchor)).toBe(false);
    expect(signalTitle(fewer, signalTrialWindowFor(fewer, anchor))).toBe('Rabbit trial, day 23 of 56');
    expect(visibleFindings([cachedOf(fewer)], false, NOW, anchor)).toHaveLength(1);
  });

  it('counted weeks ago and never regenerated: still current (age alone is not another trial)', () => {
    const long = at('2026-09-08', 9);
    const anchor: SignalTrialAnchor = { generatedAt: iso(long), trial: windowOf(RABBIT, NOW) };
    expect(countedAnotherTrial(findingFor(RABBIT, long, 'fewer_during_trial'), anchor)).toBe(false);
  });
});

describe('(2) "Keep going" — the same trial, extended', () => {
  it('the start day is unchanged, so the finding is current and takes the new target', () => {
    const extended = trialRow('rabbit', '2026-09-05', 84);
    const anchor: SignalTrialAnchor = { generatedAt: iso(GENERATED), trial: windowOf(extended, NOW) };
    const more = findingFor(RABBIT, GENERATED, 'more_during_trial');
    expect(countedAnotherTrial(more, anchor)).toBe(false);
    expect(signalTitle(more, signalTrialWindowFor(more, anchor))).toBe('Rabbit trial, day 23 of 84');
  });
});

describe('(3) a trial ended, and another started days later', () => {
  // Rabbit ran Aug 1 – Aug 10; the cache last counted it on its day 2. Chicken started Sep 20
  // and is on day 8 today, so the finding's day (2) is BELOW the local counter (8): a
  // "finding day > local day" heuristic would call this current. The start day does not.
  const rabbit = trialRow('rabbit', '2026-08-01');
  const counted = at('2026-08-02', 11);
  const chicken = trialRow('chicken', '2026-09-20');
  const anchor: SignalTrialAnchor = { generatedAt: iso(counted), trial: windowOf(chicken, NOW) };

  it('the fixture is the case a day-number comparison misses', () => {
    const f = findingFor(rabbit, counted, 'fewer_during_trial');
    expect(f.trialDayNumber).toBeLessThan(anchor.trial?.dayCounter ?? 0);
  });

  it('the anchor still says another trial, and the falling pair is dropped', () => {
    const fewer = cachedOf(findingFor(rabbit, counted, 'fewer_during_trial'));
    expect(countedAnotherTrial(fewer.finding, anchor)).toBe(true);
    expect(visibleFindings([fewer], false, NOW, anchor)).toEqual([]);
  });

  it('a regen that ran before the new trial row synced (a FRESH stamp over the old trial) is still caught', () => {
    const freshStamp = at(TODAY, 9);
    // The server still held rabbit as running on its day 58 (a stale server row).
    const stale = trialRow('rabbit', '2026-08-01', 90);
    const f = findingFor(stale, freshStamp, 'more_during_trial');
    const a: SignalTrialAnchor = { generatedAt: iso(freshStamp), trial: windowOf(chicken, NOW) };
    expect(countedAnotherTrial(f, a)).toBe(true);
    expect(signalTitle(f, signalTrialWindowFor(f, a))).toBe('Diet trial, day 58 of 90');
  });

  it('two trials that start on the SAME day are the same windows, so the name may move', () => {
    const sameDayRabbit = trialRow('rabbit', TODAY);
    const f = findingFor(sameDayRabbit, at(TODAY, 9), 'fewer_during_trial');
    expect(countedAnotherTrial(f, { generatedAt: iso(at(TODAY, 9)), trial: windowOf(CHICKEN, NOW) })).toBe(false);
  });
});

describe('(4) the day boundary', () => {
  const anchorAt = (stampMs: number): SignalTrialAnchor => ({ generatedAt: iso(stampMs), trial: windowOf(RABBIT, NOW) });
  const midnight = at(TODAY, 0);

  it('the engine counted at 23:58 and the row was stamped at 00:03: the same trial, not another', () => {
    const f = findingFor(RABBIT, midnight - 2 * 60_000, 'fewer_during_trial');
    const stamp = midnight + 3 * 60_000;
    expect(countedStartDays(f, iso(stamp))).toHaveLength(2);
    expect(countedAnotherTrial(f, anchorAt(stamp))).toBe(false);
  });

  it('counted at 23:59 and stamped at 23:59: one candidate, current', () => {
    const f = findingFor(RABBIT, midnight - 60_000, 'fewer_during_trial');
    expect(countedStartDays(f, iso(midnight - 60_000))).toHaveLength(1);
    expect(countedAnotherTrial(f, anchorAt(midnight - 60_000))).toBe(false);
  });

  it('counted at 00:01 and stamped at 00:02: the new day’s count, current', () => {
    const f = findingFor(RABBIT, midnight + 60_000, 'fewer_during_trial');
    expect(countedAnotherTrial(f, anchorAt(midnight + 2 * 60_000))).toBe(false);
  });

  it('the band is the shipped ceiling: a previous-day count stamped past it reads as another trial', () => {
    const f = findingFor(RABBIT, midnight - 60_000, 'fewer_during_trial');
    expect(countedAnotherTrial(f, anchorAt(midnight + GENERATION_LAG_CEILING_MS - 60_000))).toBe(false);
    expect(countedAnotherTrial(f, anchorAt(midnight + GENERATION_LAG_CEILING_MS + 60_000))).toBe(true);
  });
});

describe('(5) a finding the anchor cannot read changes nothing', () => {
  const anchor: SignalTrialAnchor = { generatedAt: iso(GENERATED), trial: windowOf(CHICKEN, NOW) };
  const rabbitFewer = findingFor(RABBIT, GENERATED, 'fewer_during_trial');

  it.each([
    ['no generated_at', { ...anchor, generatedAt: null }, rabbitFewer],
    ['an unparseable generated_at', { ...anchor, generatedAt: 'not a date' }, rabbitFewer],
    ['no day number (an old cache)', anchor, { ...rabbitFewer, trialDayNumber: undefined } as unknown as TrialResponseFinding],
    ['a day number of zero', anchor, { ...rabbitFewer, trialDayNumber: 0 }],
    ['no running trial here', { ...anchor, trial: null }, rabbitFewer],
  ])('%s: not another trial, never dropped, the window passes through', (_label, a, f) => {
    expect(countedAnotherTrial(f, a)).toBe(false);
    expect(visibleFindings([cachedOf(f)], false, NOW, a)).toHaveLength(1);
    expect(signalTrialWindowFor(f, a)).toBe(a.trial);
  });
});
