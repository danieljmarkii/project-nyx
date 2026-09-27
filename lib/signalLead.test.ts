// The Home card's loader (D2-3 · CUL-1065): the same reads as the screen, through the
// same window predicate, for the zone's pet — never the active one (C-9).

const mockReadSignalEpisodes = jest.fn();
const mockReadLoggedDays = jest.fn();
const mockReadSignalTrial = jest.fn();
const mockReadGateLoggedDays = jest.fn();
jest.mock('./signalScreen', () => ({
  readSignalEpisodes: (...a: unknown[]) => mockReadSignalEpisodes(...a),
  readLoggedDays: (...a: unknown[]) => mockReadLoggedDays(...a),
  readSignalTrial: (...a: unknown[]) => mockReadSignalTrial(...a),
  readGateLoggedDays: (...a: unknown[]) => mockReadGateLoggedDays(...a),
}));

import { loadSignalLead } from './signalLead';
import type { CachedFinding } from './signal';
import { usePetStore } from '../store/petStore';
import { dayKeyFromIndex, localDayIndexOf, toLocalDayKey } from './utils';
import { weekStartIndex } from './chartModels';

const shift = (key: string, d: number) => dayKeyFromIndex((localDayIndexOf(key) as number) + d);
const today = toLocalDayKey(new Date());

const reflection: CachedFinding = {
  rank: 0,
  text: 'Nyx vomited 2 times this week, 3 the week before.',
  finding: { type: 'reflection', priorityClass: 'insight', symptomType: 'vomit', currentCount: 2, priorCount: 3, direction: 'flat', windowDays: 14 },
};
const intake: CachedFinding = {
  rank: 0,
  text: 'Nyx has eaten less than usual for 3 days.',
  finding: { type: 'intake_decline', priorityClass: 'safety', trigger: 'consecutive_low', species: 'cat', daysBelowBaseline: 3, refusedFoodLabel: null, ratedMealsConsidered: 9 },
};

beforeEach(() => {
  jest.clearAllMocks();
  usePetStore.setState({
    pets: [
      { id: 'pet-1', name: 'Nyx', species: 'cat', sex: 'female' },
      { id: 'pet-2', name: 'Other', species: 'dog', sex: 'male' },
    ] as never,
    activePet: { id: 'pet-2', name: 'Other', species: 'dog', sex: 'male' } as never,
  });
  mockReadLoggedDays.mockResolvedValue({ loggedDays: [today, shift(today, -1)], recordStart: shift(today, -100) });
  mockReadSignalTrial.mockResolvedValue(null);
  // The gate's days follow the coverage days unless a case says otherwise (every fixture
  // day holds a symptom or a meal).
  mockReadGateLoggedDays.mockImplementation(async () => (await mockReadLoggedDays()).loggedDays);
});

describe('loadSignalLead', () => {
  it('reads the ROUTE’s pet’s record — the trial for that pet, the episodes for the finding’s symptom — and draws the weeks', async () => {
    mockReadSignalEpisodes.mockResolvedValue([
      { eventId: 'a', occurredAt: '', dayKey: today, minutesSinceMeal: null, photo: null },
      { eventId: 'b', occurredAt: '', dayKey: shift(today, -8), minutesSinceMeal: null, photo: null },
    ]);
    const model = await loadSignalLead('pet-1', reflection, false, null);
    expect(mockReadSignalTrial).toHaveBeenCalledWith(expect.objectContaining({ id: 'pet-1', name: 'Nyx', species: 'cat' }), expect.any(Number));
    expect(mockReadSignalEpisodes).toHaveBeenCalledWith('pet-1', 'vomit');
    expect(model.title).toBe('Vomiting, week over week');
    expect(model.noun).toBe('vomiting');
    expect(model.weekly?.total).toBe(2);
    const weeks = model.weekly?.weeks ?? [];
    expect(model.line).toBe(`${weeks[weeks.length - 1].count} this week${weeks[weeks.length - 1].partial ? ' so far' : ''} · ${weeks[weeks.length - 2].count} last week`);
  });

  it('a running trial marks the chart; the title is the claim, the same on a trial day (D2, CUL-1270)', async () => {
    mockReadSignalEpisodes.mockResolvedValue([]);
    mockReadSignalTrial.mockResolvedValue({ startDay: shift(today, -20), identity: 'Rabbit trial', dayCounter: 21, targetDays: 56, foodLabel: null });
    const model = await loadSignalLead('pet-1', reflection, false, null);
    expect(model.title).toBe('Vomiting, week over week');
    expect(model.trial?.dayCounter).toBe(21);
    expect(model.weekly?.mark?.day).toBe(shift(today, -20));
  });

  it('a finding that counts no symptom carries the title alone, and issues no episode read', async () => {
    const model = await loadSignalLead('pet-1', intake, false, null);
    expect(model).toMatchObject({ title: 'Eating less than usual', weekly: null, line: null, noun: null });
    expect(mockReadSignalEpisodes).not.toHaveBeenCalled();
  });

  // CUL-1218: a correlation's population is its matched episodes, which no local read counts;
  // bars of every vomit under "Vomiting after chicken" counted what the finding never did.
  it('a correlation carries its title alone: no bars, no line, no episode or gate read', async () => {
    const correlation: CachedFinding = {
      rank: 0,
      text: "Nyx's vomiting has tended to follow meals with chicken, across 4 matched days of logs.",
      finding: {
        type: 'food_symptom_correlation',
        priorityClass: 'insight',
        tier: 'established',
        symptomType: 'vomit',
        protein: 'chicken',
        matchedPairs: 4,
        symptomEventCount: 20,
        correlationWindowHours: 12,
      },
    };
    const model = await loadSignalLead('pet-1', correlation, false, null);
    expect(model).toMatchObject({ title: 'Vomiting after chicken', weekly: null, line: null, noun: null });
    expect(mockReadSignalEpisodes).not.toHaveBeenCalled();
    expect(mockReadGateLoggedDays).not.toHaveBeenCalled();
  });

  it('a failed trial read still draws the card without the trial; an unknown pet reads no trial', async () => {
    mockReadSignalEpisodes.mockResolvedValue([]);
    mockReadSignalTrial.mockRejectedValue(new Error('sqlite'));
    const model = await loadSignalLead('pet-1', reflection, false, null);
    expect(model.trial).toBeNull();
    expect(model.title).toBe('Vomiting, week over week');
    await loadSignalLead('pet-9', reflection, false, null);
    expect(mockReadSignalTrial).toHaveBeenCalledTimes(1);
  });
});

// CUL-1216 (BRK-4 / BRK-6): the lead line's falling pair carries its gates — the zone's
// not-eating register, the engine's density verdict, and the two drawn weeks' logging.
describe('loadSignalLead — the falling week pair is withheld where the shipped card withheld it', () => {
  // A pinned Thursday (C-29 / CUL-831): "this week so far" then holds five arrived days,
  // enough to clear the gate's floor, on every calendar day the suite runs.
  const NOW = new Date(2026, 8, 17, 12).getTime();
  const today = '2026-09-17';
  const todayIdx = localDayIndexOf(today) as number;
  const thisSunday = weekStartIndex(todayIdx);
  const lastWeekDays = [1, 2, 3, 4, 5, 6, 7].map((d) => dayKeyFromIndex(thisSunday - d));
  const thisWeekDays = Array.from({ length: todayIdx - thisSunday + 1 }, (_, i) => dayKeyFromIndex(thisSunday + i));
  const episodesLastWeek = [1, 3, 5].map((d) => ({
    eventId: `e${d}`,
    occurredAt: '',
    dayKey: dayKeyFromIndex(thisSunday - d),
    minutesSinceMeal: null,
    photo: null,
  }));
  const falling: CachedFinding = {
    ...reflection,
    finding: { ...reflection.finding, direction: 'improving', currentCount: 0, priorCount: 3 } as CachedFinding['finding'],
  };

  it('a falling vomit pair beside a not-eating record prints this week alone', async () => {
    mockReadSignalEpisodes.mockResolvedValue(episodesLastWeek);
    mockReadLoggedDays.mockResolvedValue({ loggedDays: [...lastWeekDays, ...thisWeekDays], recordStart: shift(today, -100) });
    const model = await loadSignalLead('pet-1', falling, true, null, NOW);
    expect(model.lineWithheld).toBe('not_eating');
    expect(model.line).not.toMatch(/last week/);
    expect(model.line).toMatch(/^0 this week/);
  });

  it('the same record with the pet eating prints the pair (the gate withholds only what it must)', async () => {
    mockReadSignalEpisodes.mockResolvedValue(episodesLastWeek);
    mockReadLoggedDays.mockResolvedValue({ loggedDays: [...lastWeekDays, ...thisWeekDays], recordStart: shift(today, -100) });
    const model = await loadSignalLead('pet-1', falling, false, null, NOW);
    expect(model.lineWithheld).toBeNull();
    expect(model.line).toMatch(/· 3 last week$/);
  });

  it('a falling pair whose drawn weeks were not logged alike prints this week alone (the counterexample: 4 of 7 days)', async () => {
    mockReadSignalEpisodes.mockResolvedValue(episodesLastWeek);
    // Last week fully logged; nothing logged this week so far.
    mockReadLoggedDays.mockResolvedValue({ loggedDays: lastWeekDays, recordStart: shift(today, -100) });
    const model = await loadSignalLead('pet-1', falling, false, null, NOW);
    expect(model.lineWithheld).toBe('thin');
    expect(model.line).not.toMatch(/last week/);
  });

  it('the engine’s own density verdict withholds the pair even where the drawn weeks look alike', async () => {
    mockReadSignalEpisodes.mockResolvedValue(episodesLastWeek);
    mockReadLoggedDays.mockResolvedValue({ loggedDays: [...lastWeekDays, ...thisWeekDays], recordStart: shift(today, -100) });
    const engineWithheld: CachedFinding = {
      ...falling,
      finding: { ...falling.finding, density: { comparable: false, currentLoggingDays: 4, priorLoggingDays: 7 } } as CachedFinding['finding'],
    };
    const model = await loadSignalLead('pet-1', engineWithheld, false, null, NOW);
    expect(model.lineWithheld).toBe('density');
    expect(model.line).not.toMatch(/last week/);
  });

  it('a RISE is never withheld, not even beside a not-eating record', async () => {
    mockReadSignalEpisodes.mockResolvedValue([{ eventId: 't', occurredAt: '', dayKey: today, minutesSinceMeal: null, photo: null }]);
    mockReadLoggedDays.mockResolvedValue({ loggedDays: thisWeekDays, recordStart: shift(today, -100) });
    const model = await loadSignalLead('pet-1', reflection, true, null, NOW);
    expect(model.lineWithheld).toBeNull();
    expect(model.line).toMatch(/· 0 last week$/);
  });

  // Adversarial pass F3: a dose confirm or a look keeps the day count up while vomit logging
  // lapses (maropitant + fatigue). The gate counts only the days that could show the sign.
  it('the maropitant record: coverage full, the gate’s days thin — the falling line is withheld', async () => {
    mockReadSignalEpisodes.mockResolvedValue(episodesLastWeek);
    mockReadLoggedDays.mockResolvedValue({ loggedDays: [...lastWeekDays, ...thisWeekDays], recordStart: shift(today, -100) });
    mockReadGateLoggedDays.mockResolvedValue([...lastWeekDays, thisWeekDays[0]]);
    const model = await loadSignalLead('pet-1', falling, false, null, NOW);
    expect(model.lineWithheld).toBe('thin');
    expect(model.line).not.toMatch(/last week/);
  });

  // Adversarial pass F1: "this week · last week" across a trial's start is a before/during
  // pair with none of the strip's gates, and below the floor it contradicts the screen's own
  // "no before-and-during compare yet".
  it('a falling week pair drawn across a running trial’s start is withheld', async () => {
    mockReadSignalEpisodes.mockResolvedValue(episodesLastWeek);
    mockReadLoggedDays.mockResolvedValue({ loggedDays: [...lastWeekDays, ...thisWeekDays], recordStart: shift(today, -100) });
    mockReadSignalTrial.mockResolvedValue({ startDay: dayKeyFromIndex(thisSunday), identity: 'Rabbit trial', dayCounter: todayIdx - thisSunday + 1, targetDays: 56, foodLabel: null });
    const model = await loadSignalLead('pet-1', falling, false, null, NOW);
    expect(model.lineWithheld).toBe('trial_start');
    expect(model.line).not.toMatch(/last week/);
    // Both weeks inside the trial: a week-over-week pair within it, under the other gates.
    mockReadSignalTrial.mockResolvedValue({ startDay: dayKeyFromIndex(thisSunday - 14), identity: 'Rabbit trial', dayCounter: todayIdx - thisSunday + 15, targetDays: 56, foodLabel: null });
    const inside = await loadSignalLead('pet-1', falling, false, null, NOW);
    expect(inside.lineWithheld).toBeNull();
  });

  // Re-review N1: a failed trial read is unanswered, not "no trial" — a falling line across
  // an unknown start withholds, for any symptom (the vomit gate alone would miss a cough).
  it('a failed trial read withholds a falling line, even a non-vomit one', async () => {
    mockReadSignalEpisodes.mockResolvedValue(episodesLastWeek);
    mockReadLoggedDays.mockResolvedValue({ loggedDays: [...lastWeekDays, ...thisWeekDays], recordStart: shift(today, -100) });
    mockReadSignalTrial.mockRejectedValue(new Error('sqlite'));
    const cough: CachedFinding = { ...falling, finding: { ...falling.finding, symptomType: 'cough' } as CachedFinding['finding'] };
    const model = await loadSignalLead('pet-1', cough, false, null, NOW);
    expect(model.trial).toBeNull();
    expect(model.lineWithheld).toBe('trial_start');
    expect(model.line).not.toMatch(/last week/);
  });
});

// CUL-1360: the lead card titles and charts a trial finding in the window of the trial it
// counted. Rabbit's pair was counted just after midnight today on its day 20 (so rabbit
// started nineteen days ago); the phone now runs chicken, started today.
describe('loadSignalLead — a trial finding counted over a trial since replaced', () => {
  const [y, m, d] = today.split('-').map(Number);
  const counted = new Date(y, m - 1, d, 0, 30).toISOString();
  const rabbitPair: CachedFinding = {
    rank: 0,
    text: "We've logged 11 episodes of vomiting for Nyx in the trial's 20 days, compared with 2 in the 49 days before it — worth reviewing with your vet.",
    finding: {
      type: 'trial_response',
      priorityClass: 'insight',
      trialDayNumber: 20,
      targetDurationDays: 56,
      trialLoggedDays: 20,
      baselineLoggedDays: 45,
      baselineWindowDays: 49,
      pooledTrialCount: 11,
      pooledBaselineCount: 2,
      rapid: { trial: 4, baseline: 1 },
      long: { trial: 1, baseline: 0 },
      rapidWindowMinutes: 30,
      longGapHours: 6,
      treatShare: { trial: null, baseline: null },
      mealsPerDay: { trial: null, baseline: null },
      comparisonDirection: 'more_during_trial',
      trialWindowDays: 20,
    },
  };

  beforeEach(() => mockReadSignalEpisodes.mockResolvedValue([]));

  it('another trial running: its own day, and no trial window under the chart', async () => {
    mockReadSignalTrial.mockResolvedValue({ startDay: today, identity: 'Chicken trial', dayCounter: 1, targetDays: 56, foodLabel: null });
    const model = await loadSignalLead('pet-1', rabbitPair, false, counted);
    expect(model.title).toBe('Diet trial, day 20 of 56');
    expect(model.trial).toBeNull();
  });

  it('the trial it counted still running: the trial’s name and window', async () => {
    const running = { startDay: shift(today, -19), identity: 'Rabbit trial', dayCounter: 20, targetDays: 56, foodLabel: null };
    mockReadSignalTrial.mockResolvedValue(running);
    const model = await loadSignalLead('pet-1', rabbitPair, false, counted);
    expect(model.title).toBe('Rabbit trial, day 20 of 56');
    expect(model.trial).toEqual(running);
  });
});
