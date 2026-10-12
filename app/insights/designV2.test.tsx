// Patterns × Design v2 — the screen wiring (D2-5 / CUL-1067; GA by CUL-1071).
//
// Design v2 is the only Patterns page now, so this suite proves what only the SCREEN can
// get wrong: the month instrument leads, then the weight as dots by date, then the
// "what Nyx ate" cards and the shipped panels; the retired MetricCard column, the old
// calendar and the old weight card do not come back.

jest.mock('react-native-gifted-charts', () => ({ LineChart: () => null }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('../../lib/db', () => ({ getDb: () => ({}), getTimeline: jest.fn(async () => []) }));
// lib/weight (kept real for its kg → lbs conversion) reaches lib/supabase through lib/sync.
jest.mock('../../lib/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('../../lib/sync', () => ({
  syncPendingEvents: jest.fn(),
  ensureEventAttachmentsSynced: jest.fn(),
  syncPendingFeedingArrangements: jest.fn(),
}));
jest.mock('../../lib/feedingArrangements', () => ({ getActiveArrangementsForPet: jest.fn() }));
jest.mock('../../hooks/useAppConfig', () => ({ useAllowlistFlag: () => false, useAllowlistFlagsRaw: () => ({}) }));
jest.mock('../../lib/betaFeatures', () => ({ useBetaOptIn: () => false }));
jest.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));
jest.mock('../../hooks/useAppActive', () => ({ useAppActive: () => true }));

jest.mock('../../hooks/useDietTrial', () => ({
  useDietTrial: () => ({
    input: { trial: { status: 'active', startedAt: '2026-07-25', targetDurationDays: 56 }, nowMs: 0, petName: 'Nyx' },
    isLoading: false,
    reload: jest.fn(),
    inputIsForPet: true,
  }),
}));
jest.mock('../../lib/looks', () => ({ loadLookDays: jest.fn(async () => []), loadVomitLocalDays: jest.fn(async () => []) }));
jest.mock('../../lib/lookWithheld', () => ({ loadLookWithheldFacts: jest.fn(async () => null), lookWithheld: () => true }));
jest.mock('../../lib/patternsTiming', () => {
  const actual = jest.requireActual('../../lib/patternsTiming');
  return { ...actual, getTimingPanel: jest.fn().mockResolvedValue(null) };
});
jest.mock('../../lib/patternsTrial', () => {
  const actual = jest.requireActual('../../lib/patternsTrial');
  return { ...actual, getTrialPanel: jest.fn().mockResolvedValue(null) };
});
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    Stack: { Screen: () => null },
    router: { push: jest.fn() },
    useFocusEffect: (cb: () => void | (() => void)) => {
      React.useEffect(() => cb(), []);
    },
  };
});
jest.mock('../../lib/analytics', () => {
  const actual = jest.requireActual('../../lib/analytics');
  return {
    ...actual,
    getSymptomCounts: jest.fn(),
    getTopFoods: jest.fn(),
    getTopProteins: jest.fn(),
    getMealTreatComposition: jest.fn(),
  };
});
jest.mock('../../lib/weight', () => {
  const actual = jest.requireActual('../../lib/weight');
  return {
    ...actual,
    getWeightHistory: jest.fn().mockResolvedValue([
      { weightKg: 4.6, occurredAt: '2026-07-03T08:00:00Z' },
      { weightKg: 4.4, occurredAt: '2026-09-12T08:00:00Z' },
    ]),
    getWeightReadingCount: jest.fn().mockResolvedValue(2),
  };
});
// The month's reads — a fixture that WOULD answer, so an absent read is a gate held and
// never a read that had nothing to say.
const SOME_FACTS: import('../../lib/monthReads').MonthFacts = {
  episodeDays: ['2026-09-02'],
  continuationDays: [],
  loggedDays: ['2026-09-01', '2026-09-02', '2026-09-03'],
  answeringDays: ['2026-09-01', '2026-09-02', '2026-09-03'],
  leftSomeDays: [],
  ratedMealDays: [],
  refusedMealDays: [],
  leftSomeMealDays: [],
  symptomEntryDays: {},
  dosedDays: [],
  photoDays: [],
  recordStart: '2026-06-01',
};
const mockReadMonthFacts = jest.fn(async () => SOME_FACTS);
jest.mock('../../lib/monthReads', () => ({
  readMonthFacts: (...a: unknown[]) => mockReadMonthFacts(...(a as [])),
  readDayRows: jest.fn(async () => []),
}));

import { configure, render, waitFor } from '@testing-library/react-native';
import PatternsScreen from './index';
import { usePetStore } from '../../store/petStore';
import { notEnoughData, type SymptomCount } from '../../lib/analytics';
import * as analytics from '../../lib/analytics';

const A = analytics as jest.Mocked<typeof analytics>;

// The charts hide their internals behind one spoken label; the queries below reach them.
configure({ defaultIncludeHiddenElements: true });

function seed() {
  const pet = { id: 'p1', name: 'Nyx', species: 'cat', breed: null, date_of_birth: null, date_of_birth_precision: 'exact', sex: 'unknown', weight_kg: null, photo_path: null } as never;
  usePetStore.setState({ pets: [pet], activePet: pet, isOnboarded: true });
  const counts: SymptomCount[] = [{ symptomType: 'vomit', current: 3, prior: 1, delta: 2 }];
  A.getSymptomCounts.mockResolvedValue(counts);
  A.getTopFoods.mockResolvedValue(notEnoughData(0, 4));
  A.getTopProteins.mockResolvedValue(notEnoughData(0, 4));
  A.getMealTreatComposition.mockResolvedValue({ meal: 8, treat: 2, other: 0, unclassified: 0, total: 10 });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockReadMonthFacts.mockResolvedValue(SOME_FACTS);
  seed();
});

describe('Patterns × Design v2', () => {
  it('the month leads, then the weight by date; the KPI column, the old calendar and the old weight card are absent', async () => {
    const { getByTestId, queryByText, queryByTestId, getByText, toJSON } = render(<PatternsScreen />);
    await waitFor(() => expect(getByTestId('month-instrument')).toBeTruthy());
    await waitFor(() => expect(getByTestId('month-grid')).toBeTruthy());
    expect(mockReadMonthFacts).toHaveBeenCalledWith('p1', expect.objectContaining({ toKey: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }));
    // The trial's start reaches the bars through the same loader Home uses.
    // (The nine weeks end with the real clock's week, so the mark may be off the chart —
    // in which case it is SAID, never dropped.)
    expect(getByTestId('weekly-mark-label').props.children).toMatch(/^trial · Jul 25/);
    // The weight as dots by date, with the record's count in its header.
    expect(getByTestId('weight-card-v2')).toBeTruthy();
    expect(getByTestId('weight-card-header').props.children).toBe('Weight · 2 readings');
    // The MetricCard column is absent: no "Last 30 days" frame, no symptom count tile.
    expect(queryByText('Last 30 days')).toBeNull();
    expect(queryByTestId('metric-progress')).toBeNull();
    // The old calendar and the old weight card are absent.
    expect(queryByText('Calendar')).toBeNull();
    expect(queryByText(/Last weighed/)).toBeNull();
    // The month comes before the weight in the tree.
    const json = JSON.stringify(toJSON());
    expect(json.indexOf('month-instrument')).toBeGreaterThan(-1);
    expect(json.indexOf('month-instrument')).toBeLessThan(json.indexOf('weight-card-v2'));
    expect(getByText('Log a weigh-in')).toBeTruthy();
  });

  it('cold start: the warm invitation leads and the month follows it (Principle 5)', async () => {
    A.getSymptomCounts.mockResolvedValue([]);
    A.getMealTreatComposition.mockResolvedValue({ meal: 0, treat: 0, other: 0, unclassified: 0, total: 0 });
    const weight = jest.requireMock('../../lib/weight') as { getWeightHistory: jest.Mock; getWeightReadingCount: jest.Mock };
    weight.getWeightHistory.mockResolvedValueOnce([]);
    weight.getWeightReadingCount.mockResolvedValueOnce(0);
    // Every read (the mount's and the focus refresh's) answers an empty record.
    mockReadMonthFacts.mockResolvedValue({ episodeDays: [], continuationDays: [], loggedDays: [], answeringDays: [], leftSomeDays: [], ratedMealDays: [], refusedMealDays: [], leftSomeMealDays: [], symptomEntryDays: {}, dosedDays: [], photoDays: [], recordStart: null });
    const { getByText, getByTestId, toJSON } = render(<PatternsScreen />);
    await waitFor(() => expect(getByText(/still getting to know/i)).toBeTruthy());
    await waitFor(() => expect(getByTestId('month-grid')).toBeTruthy());
    expect(getByTestId('month-line').props.children).toBe('Nothing logged yet · the month fills in from the first entry');
    const json = JSON.stringify(toJSON());
    expect(json.indexOf('still getting to know')).toBeLessThan(json.indexOf('month-instrument'));
  });
});
