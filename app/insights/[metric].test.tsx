// Smoke test for the metric DETAIL route (B-093). The load-bearing assembly + clinical
// "vs your baseline" copy is unit-tested in lib/metricDetail.test.ts; this verifies the
// WIRING — params → per-window analytics load → assemble → render, plus the segmented
// control switching windows. Mocks mirror the dashboard screen test: gifted-charts (the
// native chart), ./db + ./feedingArrangements (the analytics chain), expo-router (the
// dynamic param + a no-op Stack + a focus effect that fires once).
jest.mock('react-native-gifted-charts', () => ({ LineChart: () => null }));
jest.mock('../../lib/db', () => ({ getDb: () => ({}) }));
jest.mock('../../lib/feedingArrangements', () => ({ getActiveArrangementsForPet: jest.fn() }));

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    Stack: { Screen: () => null },
    router: { push: jest.fn() },
    useLocalSearchParams: () => ({ metric: 'vomit' }),
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
  };
});

import { render, waitFor, fireEvent } from '@testing-library/react-native';
import MetricDetailRoute from './[metric]';
import { usePetStore } from '../../store/petStore';
import {
  type AnalyticsWindow,
  type SymptomCount,
  type DayFrequencyBucket,
} from '../../lib/analytics';
import * as analytics from '../../lib/analytics';

const A = analytics as jest.Mocked<typeof analytics>;

function setActivePet() {
  const pet = {
    id: 'p1', name: 'Nyx', species: 'cat' as const, breed: null, date_of_birth: null,
    sex: 'unknown' as const, weight_kg: null, photo_path: null,
  };
  usePetStore.setState({ pets: [pet], activePet: pet, isOnboarded: true });
}

// Per-window vomit counts: a rising month (9 vs 4), a rising week (2 vs 1).
const COUNTS: Record<AnalyticsWindow, SymptomCount[]> = {
  week: [{ symptomType: 'vomit', current: 2, prior: 1, delta: 1 }],
  month: [{ symptomType: 'vomit', current: 9, prior: 4, delta: 5 }],
  '3month': [{ symptomType: 'vomit', current: 20, prior: 18, delta: 2 }],
};
const BUCKETS: DayFrequencyBucket[] = [
  { date: '2026-05-01', total: 1, byType: { vomit: 1 } },
  { date: '2026-05-02', total: 2, byType: { vomit: 2 } },
];

beforeEach(() => {
  jest.clearAllMocks();
  setActivePet();
  A.getSymptomCounts.mockImplementation((_petId: string, w: AnalyticsWindow) =>
    Promise.resolve(COUNTS[w]),
  );
  A.getSymptomFrequencyByDay.mockResolvedValue(BUCKETS);
});

describe('MetricDetailRoute', () => {
  it('opens on the Month window with the assembled "vs your baseline" read + big number', async () => {
    const { getByText } = render(<MetricDetailRoute />);
    await waitFor(() =>
      expect(getByText('A busier month than usual for Nyx — worth keeping an eye on.')).toBeTruthy(),
    );
    expect(getByText('9')).toBeTruthy();
  });

  it('switches the window via the segmented control', async () => {
    const { getByText, getByRole } = render(<MetricDetailRoute />);
    await waitFor(() => expect(getByText('9')).toBeTruthy());
    fireEvent.press(getByRole('tab', { name: 'Week' }));
    expect(getByText('A busier week than usual for Nyx — worth keeping an eye on.')).toBeTruthy();
    expect(getByText('2')).toBeTruthy();
  });

  // SAFETY INVARIANT (adversarial review): a symptom active ~3 weeks ago is empty at the
  // WEEK scale but active at the MONTH scale. The route MUST open on Month so the owner
  // leads with the burden, never a window-scoped "No vomit logged this week." that reads as
  // an all-clear. This pins initialWindow="month" so the default can't be flipped unnoticed.
  it('opens on Month with the burden, not a week "all-clear", for a quiet-this-week / active-this-month symptom', async () => {
    const byWindow: Record<AnalyticsWindow, SymptomCount[]> = {
      week: [], // nothing in either 7-day week span
      month: [{ symptomType: 'vomit', current: 6, prior: 0, delta: 6 }],
      '3month': [{ symptomType: 'vomit', current: 6, prior: 0, delta: 6 }],
    };
    A.getSymptomCounts.mockImplementation((_petId: string, w: AnalyticsWindow) =>
      Promise.resolve(byWindow[w]),
    );
    A.getSymptomFrequencyByDay.mockImplementation((_petId: string, w: AnalyticsWindow) =>
      Promise.resolve(w === 'week' ? [] : BUCKETS),
    );

    const { getByText, getByRole, queryByText } = render(<MetricDetailRoute />);
    // On open (Month): the rising read + the burden number — NOT the week empty state.
    await waitFor(() =>
      expect(getByText('A busier month than usual for Nyx — worth keeping an eye on.')).toBeTruthy(),
    );
    expect(getByText('6')).toBeTruthy();
    expect(queryByText('No vomit logged this week.')).toBeNull();
    // The week empty state is honest + correctly scoped — only on explicit selection.
    fireEvent.press(getByRole('tab', { name: 'Week' }));
    expect(getByText('No vomit logged this week.')).toBeTruthy();
  });
});
