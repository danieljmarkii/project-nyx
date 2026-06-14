// Smoke test for the Patterns dashboard screen (B-023 PR 3). The load-bearing logic
// (ordering, the n=1 establishment gate, cold-start selection) is unit-tested in
// lib/dashboardScreen.test.ts; this verifies the screen WIRING — the cold-start empty
// branch vs the summary-led ready branch, and that the seeded cards render.
//
// Mocks mirror the PR-2 component tests: gifted-charts (the native chart path), ./db +
// ./feedingArrangements (the expo-sqlite/supabase chain dragged via analytics). The
// six analytics getters are mocked over the real module (requireActual keeps the
// sentinel helpers + types the screen and dashboardScreen rely on); expo-router's Stack
// is a no-op and useFocusEffect fires its callback once on mount.
jest.mock('react-native-gifted-charts', () => ({ LineChart: () => null }));
jest.mock('../../lib/db', () => ({ getDb: () => ({}) }));
jest.mock('../../lib/feedingArrangements', () => ({ getActiveArrangementsForPet: jest.fn() }));
// The AI summary (PR 4) is cache-only network I/O via useSummary → lib/summary → supabase.
// Mock the hook so this screen-wiring test stays on the local-SQLite card path (the summary's
// own logic is tested in lib/summaryCopy.test.ts + supabase/functions/.../summary.test.ts).
jest.mock('../../hooks/useSummary', () => ({
  useSummary: () => ({ summary: null, displayState: 'building', petName: 'Nyx', isLoading: false }),
}));

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    Stack: { Screen: () => null },
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
    getIntakeRate: jest.fn(),
    getIntakeRateSeries: jest.fn(),
    getTopFoods: jest.fn(),
    getTopProteins: jest.fn(),
    getMealTreatComposition: jest.fn(),
  };
});

import { render, waitFor } from '@testing-library/react-native';
import PatternsScreen from './index';
import { usePetStore } from '../../store/petStore';
import {
  notEnoughData,
  type SymptomCount,
  type DayFrequencyBucket,
  type MealTreatComposition,
} from '../../lib/analytics';
import * as analytics from '../../lib/analytics';

const A = analytics as jest.Mocked<typeof analytics>;

function setActivePet() {
  usePetStore.setState({
    pets: [{ id: 'p1', name: 'Nyx', species: 'cat', breed: null, date_of_birth: null, sex: 'unknown', weight_kg: null, photo_path: null }],
    activePet: { id: 'p1', name: 'Nyx', species: 'cat', breed: null, date_of_birth: null, sex: 'unknown', weight_kg: null, photo_path: null },
    isOnboarded: true,
  });
}

function emptyComposition(): MealTreatComposition {
  return { meal: 0, treat: 0, other: 0, unclassified: 0, total: 0 };
}

beforeEach(() => {
  jest.clearAllMocks();
  setActivePet();
});

describe('PatternsScreen', () => {
  it('cold-start (no symptoms, no feedings) → the designed empty state, no summary slot', async () => {
    A.getSymptomCounts.mockResolvedValue([]);
    A.getSymptomFrequencyByDay.mockResolvedValue([]);
    A.getIntakeRate.mockResolvedValue(notEnoughData(0, 4));
    A.getIntakeRateSeries.mockResolvedValue([]);
    A.getTopFoods.mockResolvedValue(notEnoughData(0, 4));
    A.getTopProteins.mockResolvedValue(notEnoughData(0, 4));
    A.getMealTreatComposition.mockResolvedValue(emptyComposition());

    const { getByText, queryByText } = render(<PatternsScreen />);

    // Match within a single text segment ({name} interpolation splits the node).
    await waitFor(() => expect(getByText(/still getting to know/i)).toBeTruthy());
    // The summary slot (AiSummaryCard) is not rendered in the empty state — its building
    // copy says "still gathering", which must be absent when the whole dashboard is empty.
    expect(queryByText(/still gathering/i)).toBeNull();
  });

  it('with data → summary-led: the AI summary slot leads, the safety symptom card renders', async () => {
    const counts: SymptomCount[] = [{ symptomType: 'vomit', current: 3, prior: 1, delta: 2 }];
    const buckets: DayFrequencyBucket[] = [
      { date: '2026-05-01', total: 1, byType: { vomit: 1 } },
      { date: '2026-05-02', total: 2, byType: { vomit: 2 } },
    ];
    const composition: MealTreatComposition = { meal: 8, treat: 2, other: 0, unclassified: 0, total: 10 };
    A.getSymptomCounts.mockResolvedValue(counts);
    A.getSymptomFrequencyByDay.mockResolvedValue(buckets);
    A.getIntakeRate.mockResolvedValue(notEnoughData(2, 4));
    A.getIntakeRateSeries.mockResolvedValue([]);
    A.getTopFoods.mockResolvedValue(notEnoughData(0, 4));
    A.getTopProteins.mockResolvedValue(notEnoughData(0, 4));
    A.getMealTreatComposition.mockResolvedValue(composition);

    const { getByText, getAllByText, queryByText } = render(<PatternsScreen />);

    // useSummary is mocked to the building state, so the slot leads with its "still
    // gathering" copy (the summary's own ready/text rendering is covered in AiSummaryCard.test).
    await waitFor(() => expect(getByText(/still gathering/i)).toBeTruthy());
    // Safety symptom count card: big number + honest delta phrase (no verdict word).
    expect(getByText('3')).toBeTruthy();
    expect(getByText(/2 more than last month/i)).toBeTruthy();
    // "Vomit" appears as both the count-card label and the frequency-calendar title.
    expect(getAllByText('Vomit').length).toBeGreaterThanOrEqual(1);
    // Not the cold-start state.
    expect(queryByText(/still getting to know/i)).toBeNull();
  });
});
