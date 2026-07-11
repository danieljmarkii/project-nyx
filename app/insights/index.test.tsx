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
// The frequency calendar's day drill-in sheet (DayEventsSheet) uses useSafeAreaInsets,
// which needs a provider jest-expo doesn't stand up by default — stub the module.
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  };
});
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
    // Calendar v3 N5b + B-310 — the calendar's month + paging-bound + intake-decline reads
    // (real impls hit the mocked DB, so stub them like the other getters).
    getSymptomFrequencyByMonth: jest.fn(),
    getIntakeDeclineByMonth: jest.fn(),
    getEarliestEventMonth: jest.fn(),
    getIntakeRateWithPrior: jest.fn(),
    getTopFoods: jest.fn(),
    getTopProteins: jest.fn(),
    getMealTreatComposition: jest.fn(),
  };
});

// The screen now reads the weight trend on the same load (getWeightHistory →
// computeWeightTrend). lib/weight imports ./sync → ./supabase, which throws on unset env
// at import time — so mock it here like ./db / ./feedingArrangements. Default: no
// readings, so every test renders the weight card's nudge state. The card's real trend
// logic is unit-tested in lib/weight.test.ts; this stays a screen-wiring smoke test.
jest.mock('../../lib/weight', () => ({
  getWeightHistory: jest.fn().mockResolvedValue([]),
  computeWeightTrend: () => ({
    readingCount: 0, seriesLbs: [], latestLbs: null,
    latestOccurredAt: null, earliestOccurredAt: null, deltaLbs: null, direction: null,
  }),
}));

import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
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
    pets: [{ id: 'p1', name: 'Nyx', species: 'cat', breed: null, date_of_birth: null, date_of_birth_precision: 'exact', sex: 'unknown', weight_kg: null, photo_path: null }],
    activePet: { id: 'p1', name: 'Nyx', species: 'cat', breed: null, date_of_birth: null, date_of_birth_precision: 'exact', sex: 'unknown', weight_kg: null, photo_path: null },
    isOnboarded: true,
  });
}

function emptyComposition(): MealTreatComposition {
  return { meal: 0, treat: 0, other: 0, unclassified: 0, total: 0 };
}

beforeEach(() => {
  jest.clearAllMocks();
  setActivePet();
  // Calendar defaults (overridden per-test where the buckets matter). clearAllMocks wipes
  // resolved values, so seed them here so every test's load() resolves both reads.
  A.getSymptomFrequencyByMonth.mockResolvedValue([]);
  A.getIntakeDeclineByMonth.mockResolvedValue([]);
  A.getEarliestEventMonth.mockResolvedValue(null);
});

describe('PatternsScreen', () => {
  it('cold-start (no symptoms, no feedings) → the designed empty state, no summary slot', async () => {
    A.getSymptomCounts.mockResolvedValue([]);
    A.getSymptomFrequencyByDay.mockResolvedValue([]);
    A.getIntakeRateWithPrior.mockResolvedValue({ current: notEnoughData(0, 4), prior: notEnoughData(0, 4) });
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
    A.getIntakeRateWithPrior.mockResolvedValue({ current: notEnoughData(2, 4), prior: notEnoughData(0, 4) });
    A.getTopFoods.mockResolvedValue(notEnoughData(0, 4));
    A.getTopProteins.mockResolvedValue(notEnoughData(0, 4));
    A.getMealTreatComposition.mockResolvedValue(composition);

    const { getByText, getAllByText, queryByText } = render(<PatternsScreen />);

    // useSummary is mocked to the building state, so the slot leads with its "still
    // gathering" copy (the summary's own ready/text rendering is covered in AiSummaryCard.test).
    await waitFor(() => expect(getByText(/still gathering/i)).toBeTruthy());
    // Safety symptom count card: big number + honest delta phrase (no verdict word).
    expect(getByText('3')).toBeTruthy();
    expect(getByText(/2 more than the previous 30 days/i)).toBeTruthy();
    // B-313: the count card carries an explicit trailing-window frame so it never
    // reads as contradicting the calendar-month grid under the same symptom.
    expect(getByText('Last 30 days')).toBeTruthy();
    // "Vomit" appears as the count-card label (the calendar is now titled "Calendar" —
    // B-310 rebrand — and names the symptom in its summary line instead of its header).
    expect(getAllByText('Vomit').length).toBeGreaterThanOrEqual(1);
    expect(getByText('Calendar')).toBeTruthy();
    // The health-trajectory weight card is wired into the ready branch — with no readings
    // it renders its forward-looking logging nudge + action (never reassures).
    expect(getByText(/no weigh-ins logged yet/i)).toBeTruthy();
    expect(getByText('Log a weigh-in')).toBeTruthy();
    // Not the cold-start state.
    expect(queryByText(/still getting to know/i)).toBeNull();
  });

  it('intake card: the rate, a proportion bar, and the "vs last month" delta (B-098 "Both")', async () => {
    A.getSymptomCounts.mockResolvedValue([]); // no symptom cards → the only MetricCard is intake
    A.getSymptomFrequencyByDay.mockResolvedValue([]);
    A.getIntakeRateWithPrior.mockResolvedValue({
      current: { rate: 0.29, finishedMeals: 2, ratedMeals: 7, freeFedExcluded: 0, intakeNotDirectlyObserved: false },
      prior: { rate: 0.41, finishedMeals: 7, ratedMeals: 17, freeFedExcluded: 0, intakeNotDirectlyObserved: false },
    });
    A.getTopFoods.mockResolvedValue(notEnoughData(0, 4));
    A.getTopProteins.mockResolvedValue(notEnoughData(0, 4));
    A.getMealTreatComposition.mockResolvedValue({ meal: 7, treat: 20, other: 0, unclassified: 0, total: 27 });

    const { getByText, getByTestId } = render(<PatternsScreen />);

    await waitFor(() => expect(getByText('29%')).toBeTruthy());
    // The shape (proportion bar) — never a bare big number.
    expect(getByTestId('metric-progress')).toBeTruthy();
    // The factual "vs the previous 30 days" read (a drop on a positive metric → neutral,
    // not alarmed). Trailing-window wording, not "last month" (B-313).
    expect(getByText('Down from 41% the previous 30 days')).toBeTruthy();
  });

  it('tapping a symptom count card opens its trend detail (B-093 doorway)', async () => {
    const counts: SymptomCount[] = [{ symptomType: 'vomit', current: 3, prior: 1, delta: 2 }];
    const buckets: DayFrequencyBucket[] = [
      { date: '2026-05-01', total: 1, byType: { vomit: 1 } },
      { date: '2026-05-02', total: 2, byType: { vomit: 2 } },
    ];
    A.getSymptomCounts.mockResolvedValue(counts);
    A.getSymptomFrequencyByDay.mockResolvedValue(buckets);
    A.getIntakeRateWithPrior.mockResolvedValue({ current: notEnoughData(2, 4), prior: notEnoughData(0, 4) });
    A.getTopFoods.mockResolvedValue(notEnoughData(0, 4));
    A.getTopProteins.mockResolvedValue(notEnoughData(0, 4));
    A.getMealTreatComposition.mockResolvedValue(emptyComposition());

    const { getByLabelText } = render(<PatternsScreen />);
    // The symptom COUNT card is the only tappable card (a button); its a11y label carries
    // the window caption + value + delta. The frequency calendar and intake card stay display-only.
    await waitFor(() => expect(getByLabelText(/Vomit, Last 30 days: 3/)).toBeTruthy());
    fireEvent.press(getByLabelText(/Vomit, Last 30 days: 3/));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/insights/[metric]',
      params: { metric: 'vomit' },
    });
  });
});
