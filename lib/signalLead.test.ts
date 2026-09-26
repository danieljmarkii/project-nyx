// The Home card's loader (D2-3 · CUL-1065): the same reads as the screen, through the
// same window predicate, for the zone's pet — never the active one (C-9).

const mockReadSignalEpisodes = jest.fn();
const mockReadLoggedDays = jest.fn();
const mockReadSignalTrial = jest.fn();
jest.mock('./signalScreen', () => ({
  readSignalEpisodes: (...a: unknown[]) => mockReadSignalEpisodes(...a),
  readLoggedDays: (...a: unknown[]) => mockReadLoggedDays(...a),
  readSignalTrial: (...a: unknown[]) => mockReadSignalTrial(...a),
}));

import { loadSignalLead } from './signalLead';
import type { CachedFinding } from './signal';
import { usePetStore } from '../store/petStore';
import { dayKeyFromIndex, localDayIndexOf, toLocalDayKey } from './utils';

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
});

describe('loadSignalLead', () => {
  it('reads the ROUTE’s pet’s record — the trial for that pet, the episodes for the finding’s symptom — and draws the weeks', async () => {
    mockReadSignalEpisodes.mockResolvedValue([
      { eventId: 'a', occurredAt: '', dayKey: today, minutesSinceMeal: null, photo: null },
      { eventId: 'b', occurredAt: '', dayKey: shift(today, -8), minutesSinceMeal: null, photo: null },
    ]);
    const model = await loadSignalLead('pet-1', reflection);
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
    const model = await loadSignalLead('pet-1', reflection);
    expect(model.title).toBe('Vomiting, week over week');
    expect(model.trial?.dayCounter).toBe(21);
    expect(model.weekly?.mark?.day).toBe(shift(today, -20));
  });

  it('a finding that counts no symptom carries the title alone, and issues no episode read', async () => {
    const model = await loadSignalLead('pet-1', intake);
    expect(model).toMatchObject({ title: 'Eating less than usual', weekly: null, line: null, noun: null });
    expect(mockReadSignalEpisodes).not.toHaveBeenCalled();
  });

  it('a failed trial read still draws the card without the trial; an unknown pet reads no trial', async () => {
    mockReadSignalEpisodes.mockResolvedValue([]);
    mockReadSignalTrial.mockRejectedValue(new Error('sqlite'));
    const model = await loadSignalLead('pet-1', reflection);
    expect(model.trial).toBeNull();
    expect(model.title).toBe('Vomiting, week over week');
    await loadSignalLead('pet-9', reflection);
    expect(mockReadSignalTrial).toHaveBeenCalledTimes(1);
  });
});
