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
});
