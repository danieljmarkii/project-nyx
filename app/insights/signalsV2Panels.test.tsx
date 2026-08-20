// Render wiring for the Signals v2 Patterns panels (B-755 PR 9, CUL-11; GA'd CUL-548).
// Proves that with each panel's model present, the Timing + "The trial so far" cards render
// below the seeded dashboard, and tapping each opens its metric-detail route. The models
// themselves are unit-tested in lib/patternsTiming.test / lib/patternsTrial.test; this is
// the screen render + navigation proof. (The model-null case — neither panel — is asserted
// in index.test.tsx.)
jest.mock('react-native-gifted-charts', () => ({ LineChart: () => null }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('../../lib/db', () => ({ getDb: () => ({}) }));
jest.mock('../../lib/feedingArrangements', () => ({ getActiveArrangementsForPet: jest.fn() }));
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
jest.mock('../../lib/weight', () => ({
  getWeightHistory: jest.fn().mockResolvedValue([]),
  computeWeightTrend: () => ({
    readingCount: 0, seriesLbs: [], latestLbs: null,
    latestOccurredAt: null, earliestOccurredAt: null, deltaLbs: null, direction: null,
  }),
}));
// Keep the panels' copy/geometry real; stub only the DB-backed loaders.
jest.mock('../../lib/patternsTiming', () => {
  const actual = jest.requireActual('../../lib/patternsTiming');
  return { ...actual, getTimingPanel: jest.fn() };
});
jest.mock('../../lib/patternsTrial', () => {
  const actual = jest.requireActual('../../lib/patternsTrial');
  return { ...actual, getTrialPanel: jest.fn() };
});

import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import PatternsScreen from './index';
import { usePetStore } from '../../store/petStore';
import {
  notEnoughData,
  type SymptomCount,
  type MealTreatComposition,
} from '../../lib/analytics';
import * as analytics from '../../lib/analytics';
import { buildTimingDistribution, getTimingPanel } from '../../lib/patternsTiming';
import { buildTrialSoFar, getTrialPanel } from '../../lib/patternsTrial';

const A = analytics as jest.Mocked<typeof analytics>;
const ms = (iso: string): number => Date.parse(iso);
const MS_PER_DAY = 86_400_000;

function setActivePet() {
  const pet = { id: 'p1', name: 'Nyx', species: 'cat' as const, breed: null, date_of_birth: null, date_of_birth_precision: 'exact' as const, sex: 'unknown' as const, weight_kg: null, photo_path: null };
  usePetStore.setState({ pets: [pet], activePet: pet, isOnboarded: true });
}

const timingModel = buildTimingDistribution({
  feedings: [{ ms: ms('2026-05-01T08:00:00Z'), confidence: 'witnessed', form: 'Kibble' }],
  vomitOnsets: [{ ms: ms('2026-05-01T08:15:00Z'), confidence: 'witnessed' }],
  freeFedSpans: [],
});
const trialModel = buildTrialSoFar({
  progress: { dayCounter: 25, targetDays: 31 },
  exposureRange: { startDayIndex: 100, endDayIndex: 130 },
  foodLabel: 'Royal Canin HP',
  vomitOnsets: [{ ms: 105 * MS_PER_DAY + 8.3 * 3_600_000, confidence: 'witnessed' }],
  feedings: [{ ms: 105 * MS_PER_DAY + 8 * 3_600_000, confidence: 'witnessed', form: 'Kibble', foodType: 'meal' }],
  freeFedSpans: [],
  symptomEventMs: [105 * MS_PER_DAY + 8.3 * 3_600_000],
  dayIndexOf: (m) => Math.floor(m / MS_PER_DAY),
});

beforeEach(() => {
  jest.clearAllMocks();
  setActivePet();
  A.getSymptomFrequencyByMonth.mockResolvedValue([]);
  A.getIntakeDeclineByMonth.mockResolvedValue([]);
  A.getEarliestEventMonth.mockResolvedValue(null);
  // A non-empty dashboard (a vomit + composition) so the screen reaches the ready branch.
  const counts: SymptomCount[] = [{ symptomType: 'vomit', current: 3, prior: 1, delta: 2 }];
  const composition: MealTreatComposition = { meal: 8, treat: 2, other: 0, unclassified: 0, total: 10 };
  A.getSymptomCounts.mockResolvedValue(counts);
  A.getSymptomFrequencyByDay.mockResolvedValue([{ date: '2026-05-01', total: 1, byType: { vomit: 1 } }]);
  A.getIntakeRateWithPrior.mockResolvedValue({ current: notEnoughData(2, 4), prior: notEnoughData(0, 4) });
  A.getTopFoods.mockResolvedValue(notEnoughData(0, 4));
  A.getTopProteins.mockResolvedValue(notEnoughData(0, 4));
  A.getMealTreatComposition.mockResolvedValue(composition);
  (getTimingPanel as jest.Mock).mockResolvedValue(timingModel);
  (getTrialPanel as jest.Mock).mockResolvedValue(trialModel);
});

describe('PatternsScreen — Signals v2 panels (GA)', () => {
  it('renders both panels below the seeded dashboard when the models exist', async () => {
    const { getByText } = render(<PatternsScreen />);
    await waitFor(() => expect(getByText('Vomiting, timed from meals')).toBeTruthy());
    expect(getByText('The trial so far')).toBeTruthy();
    // The trial context line proves the real copy layer ran (not a stub).
    expect(getByText('Royal Canin HP · Day 25 of 31')).toBeTruthy();
  });

  it('tapping the Timing panel opens /insights/timing', async () => {
    const { getByLabelText } = render(<PatternsScreen />);
    await waitFor(() => expect(getByLabelText(/Vomiting, timed from meals:/)).toBeTruthy());
    fireEvent.press(getByLabelText(/Vomiting, timed from meals:/));
    expect(router.push).toHaveBeenCalledWith('/insights/timing');
  });

  it('tapping the trial panel opens /insights/trial', async () => {
    const { getByLabelText } = render(<PatternsScreen />);
    await waitFor(() => expect(getByLabelText(/The trial so far:/)).toBeTruthy());
    fireEvent.press(getByLabelText(/The trial so far:/));
    expect(router.push).toHaveBeenCalledWith('/insights/trial');
  });

  it('a trial with no logged vomiting drops the phenotype section — no "0 timed of 0" wall', async () => {
    const emptyPhenotype = buildTrialSoFar({
      progress: { dayCounter: 3, targetDays: 56 },
      exposureRange: { startDayIndex: 100, endDayIndex: 130 },
      foodLabel: 'Royal Canin HP',
      vomitOnsets: [], // just-started trial, nothing logged yet
      feedings: [{ ms: 101 * MS_PER_DAY + 8 * 3_600_000, confidence: 'witnessed', form: 'Kibble', foodType: 'meal' }],
      freeFedSpans: [],
      symptomEventMs: [],
      dayIndexOf: (m) => Math.floor(m / MS_PER_DAY),
    });
    (getTrialPanel as jest.Mock).mockResolvedValue(emptyPhenotype);
    const { getByText, queryByText } = render(<PatternsScreen />);
    await waitFor(() => expect(getByText('The trial so far')).toBeTruthy());
    // The panel exists (diet-structure still shown) but NOT the vomiting-timing zero-wall.
    expect(queryByText('Vomiting timing')).toBeNull();
    expect(queryByText(/0 timed of 0/)).toBeNull();
    expect(getByText('Diet during the trial')).toBeTruthy();
  });

  it('a pet with no vomiting and no trial shows neither panel (models null)', async () => {
    (getTimingPanel as jest.Mock).mockResolvedValue(null);
    (getTrialPanel as jest.Mock).mockResolvedValue(null);
    const { queryByText, getByText } = render(<PatternsScreen />);
    await waitFor(() => expect(getByText('Calendar')).toBeTruthy());
    expect(queryByText('Vomiting, timed from meals')).toBeNull();
    expect(queryByText('The trial so far')).toBeNull();
  });
});
