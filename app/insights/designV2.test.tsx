// Patterns × Design v2 — the screen wiring, both ways (D2-5 / CUL-1067).
//
// The sibling suite `app/insights/index.test.tsx` runs the flag-OFF path against its
// existing expectations. This suite proves the two halves only the SCREEN can get wrong:
//
//   FLAG ON — the month instrument leads, then the weight as dots by date, then the
//   "what Nyx ate" cards and the shipped panels; the MetricCard column, the old calendar
//   and the old weight card are ABSENT.
//
//   FLAG OFF — the async half of the flag-off guard (guards/designV2FlagOff.test.tsx
//   states this blind spot and hands it here): the page renders no redesign node AND
//   ISSUES NO REDESIGN READ, over a fixture that WOULD answer if called. An absence
//   proves a gate only when the thing gated was available to leak (C-41).

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
jest.mock('../../hooks/useAppConfig', () => ({ useAllowlistFlag: () => false }));
jest.mock('../../lib/betaFeatures', () => ({ useBetaOptIn: () => false }));
jest.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));
jest.mock('../../hooks/useAppActive', () => ({ useAppActive: () => true }));

// THE gate, mutable per test. Mocked at the hook (the one file that reads the key), so
// the daily-look flags stay off and only the redesign toggles.
let mockDesignV2 = false;
jest.mock('../../hooks/useDesignV2', () => ({ useDesignV2: () => mockDesignV2 }));

jest.mock('../../hooks/useDietTrial', () => ({
  useDietTrial: () => ({
    input: { trial: { status: 'active', startedAt: '2026-07-25', targetDurationDays: 56 }, nowMs: 0, petName: 'Nyx' },
    isLoading: false,
    reload: jest.fn(),
    inputIsForActivePet: true,
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
jest.mock('../../hooks/useSummary', () => ({
  useSummary: () => ({ summary: null, displayState: 'building', petName: 'Nyx', isLoading: false }),
}));
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
    getSymptomFrequencyByDay: jest.fn(),
    getSymptomFrequencyByMonth: jest.fn(),
    getIntakeDeclineByMonth: jest.fn(),
    getEarliestEventMonth: jest.fn(),
    getIntakeRateWithPrior: jest.fn(),
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
  loggedDays: ['2026-09-01', '2026-09-02', '2026-09-03'],
  leftSomeDays: [],
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
  A.getSymptomFrequencyByDay.mockResolvedValue([{ date: '2026-09-02', total: 1, byType: { vomit: 1 } }]);
  A.getSymptomFrequencyByMonth.mockResolvedValue([]);
  A.getIntakeDeclineByMonth.mockResolvedValue([]);
  A.getEarliestEventMonth.mockResolvedValue(null);
  A.getIntakeRateWithPrior.mockResolvedValue({ current: notEnoughData(2, 4), prior: notEnoughData(0, 4) });
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
  it('flag ON: the month leads, then the weight by date; the KPI column, the old calendar and the old weight card are absent', async () => {
    mockDesignV2 = true;
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

  it('flag ON, cold start: the warm invitation leads and the month follows it (Principle 5)', async () => {
    mockDesignV2 = true;
    A.getSymptomCounts.mockResolvedValue([]);
    A.getSymptomFrequencyByDay.mockResolvedValue([]);
    A.getMealTreatComposition.mockResolvedValue({ meal: 0, treat: 0, other: 0, unclassified: 0, total: 0 });
    const weight = jest.requireMock('../../lib/weight') as { getWeightHistory: jest.Mock; getWeightReadingCount: jest.Mock };
    weight.getWeightHistory.mockResolvedValueOnce([]);
    weight.getWeightReadingCount.mockResolvedValueOnce(0);
    // Every read (the mount's and the focus refresh's) answers an empty record.
    mockReadMonthFacts.mockResolvedValue({ episodeDays: [], loggedDays: [], leftSomeDays: [], dosedDays: [], photoDays: [], recordStart: null });
    const { getByText, getByTestId, toJSON } = render(<PatternsScreen />);
    await waitFor(() => expect(getByText(/still getting to know/i)).toBeTruthy());
    await waitFor(() => expect(getByTestId('month-grid')).toBeTruthy());
    expect(getByTestId('month-line').props.children).toBe('Nothing logged yet · the month fills in from the first entry');
    const json = JSON.stringify(toJSON());
    expect(json.indexOf('still getting to know')).toBeLessThan(json.indexOf('month-instrument'));
  });

  it('flag OFF: no redesign node AND no redesign read, over a fixture that would answer (the async half of the guard)', async () => {
    mockDesignV2 = false;
    const { queryByTestId, getByText } = render(<PatternsScreen />);
    await waitFor(() => expect(getByText('Last 30 days')).toBeTruthy());
    expect(getByText('Calendar')).toBeTruthy();
    expect(queryByTestId('month-instrument')).toBeNull();
    expect(queryByTestId('weight-card-v2')).toBeNull();
    // The gate held at the READ, not just at the draw: the month's fixture was ready to
    // answer and was never asked.
    expect(mockReadMonthFacts).not.toHaveBeenCalled();
  });
});
