// Smoke test for the Patterns dashboard screen (B-023 PR 3; Design v2 by CUL-1071). The
// load-bearing logic (ordering, cold-start selection) is unit-tested in
// lib/dashboardScreen.test.ts; the month and the weight-by-date wiring are
// app/insights/designV2.test.tsx. This verifies the remaining screen WIRING — the
// cold-start empty branch vs the ready branch, that the seeded descriptive cards render,
// and the warm error + retry.
//
// Mocks: gifted-charts (the native chart path), ./db + ./feedingArrangements (the
// expo-sqlite/supabase chain dragged via analytics). The analytics getters the screen
// reads are mocked over the real module (requireActual keeps the sentinel helpers + types
// the screen and dashboardScreen rely on); expo-router's Stack is a no-op and
// useFocusEffect fires its callback once on mount.
jest.mock('react-native-gifted-charts', () => ({ LineChart: () => null }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  };
});
jest.mock('../../lib/db', () => ({ getDb: () => ({}) }));
// The month draws and reads on its own (app/insights/designV2.test.tsx and its own
// suite); here it is a placeholder so this suite stays on the dashboard read.
jest.mock('../../lib/monthReads', () => ({ readMonthFacts: jest.fn(), readDayRows: jest.fn() }));
jest.mock('../../components/designV2/patterns/MonthInstrument', () => {
  const { View } = require('react-native');
  return { MonthInstrument: () => <View testID="month-instrument" /> };
});
jest.mock('../../lib/feedingArrangements', () => ({ getActiveArrangementsForPet: jest.fn() }));

// Noticed (CUL-874 / N-5) is GA and live for this suite's cat; its reads are stubbed to
// an empty record (the card's wiring is app/insights/noticed.test.tsx). The config mocks
// exist because the screen's imports reach `lib/appConfig` → `lib/supabase`, which throws
// under jest without env.
jest.mock('../../hooks/useAppConfig', () => ({ useAllowlistFlag: () => false }));
jest.mock('../../lib/betaFeatures', () => ({ useBetaOptIn: () => false }));
jest.mock('../../hooks/useDietTrial', () => ({
  useDietTrial: () => ({ input: null, isLoading: false, reload: jest.fn(), inputIsForPet: false }),
}));
jest.mock('../../lib/looks', () => ({
  loadLookDays: jest.fn(async () => []),
  loadVomitLocalDays: jest.fn(async () => []),
}));
jest.mock('../../lib/lookWithheld', () => ({
  loadLookWithheldFacts: jest.fn(async () => null),
  lookWithheld: () => true,
}));

// The Signals v2 panels (B-755 PR 9) GA'd (CUL-548): they now load whenever there's an
// active pet and render when their model has data — no flag gate. This screen-wiring smoke
// test keeps them OUT of the frame by stubbing both panel loaders to null (no model → no
// panel), so the suite's existing expectations are unchanged. Keep the panels' real copy/
// geometry via requireActual; the panels' own render + navigation is covered in
// signalsV2Panels.test.tsx.
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

// The screen reads the weight series on the same load (getWeightHistory →
// computeWeightTrend). lib/weight imports ./sync → ./supabase, which throws on unset env
// at import time — so mock it here like ./db / ./feedingArrangements. Default: no
// readings, so every test renders the weight card's nudge state. The card's real trend
// logic is unit-tested in lib/weight.test.ts; this stays a screen-wiring smoke test.
jest.mock('../../lib/weight', () => ({
  getWeightHistory: jest.fn().mockResolvedValue([]),
  // The count is read alongside the 12-reading window (CUL-223): the card speaks it as
  // a fact about the record and it labels the tap-through to every reading, so it can
  // no longer be derived from the capped series.
  getWeightReadingCount: jest.fn().mockResolvedValue(0),
  computeWeightTrend: () => ({
    readingCount: 0, seriesLbs: [], latestLbs: null,
    latestOccurredAt: null, earliestOccurredAt: null, deltaLbs: null, direction: null,
  }),
}));

import { render, waitFor, fireEvent } from '@testing-library/react-native';
import PatternsScreen from './index';
import { usePetStore } from '../../store/petStore';
import {
  notEnoughData,
  type SymptomCount,
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
});

describe('PatternsScreen', () => {
  it('cold-start (no symptoms, no feedings, no weight) → the designed empty state leads the month', async () => {
    A.getSymptomCounts.mockResolvedValue([]);
    A.getTopFoods.mockResolvedValue(notEnoughData(0, 4));
    A.getTopProteins.mockResolvedValue(notEnoughData(0, 4));
    A.getMealTreatComposition.mockResolvedValue(emptyComposition());

    const { getByText, getByTestId, toJSON } = render(<PatternsScreen />);

    // Match within a single text segment ({name} interpolation splits the node).
    await waitFor(() => expect(getByText(/still getting to know/i)).toBeTruthy());
    expect(getByTestId('month-instrument')).toBeTruthy();
    const json = JSON.stringify(toJSON());
    expect(json.indexOf('still getting to know')).toBeLessThan(json.indexOf('month-instrument'));
  });

  it('with data → not the cold start; the month, the weight nudge and the descriptive cards render', async () => {
    const counts: SymptomCount[] = [{ symptomType: 'vomit', current: 3, prior: 1, delta: 2 }];
    const composition: MealTreatComposition = { meal: 8, treat: 2, other: 0, unclassified: 0, total: 10 };
    A.getSymptomCounts.mockResolvedValue(counts);
    A.getTopFoods.mockResolvedValue(notEnoughData(0, 4));
    A.getTopProteins.mockResolvedValue(notEnoughData(0, 4));
    A.getMealTreatComposition.mockResolvedValue(composition);

    const { getByText, getByTestId, queryByText } = render(<PatternsScreen />);

    await waitFor(() => expect(getByText('Top food')).toBeTruthy());
    expect(getByTestId('month-instrument')).toBeTruthy();
    expect(getByText('Top protein')).toBeTruthy();
    // With both panel loaders stubbed to null, neither v2 panel renders (CUL-548 GA — the
    // panels key on model presence, not a flag); their render is in signalsV2Panels.test.
    expect(queryByText('The trial so far')).toBeNull();
    expect(queryByText('Vomiting, timed from meals')).toBeNull();
    // The weight card is wired into the ready branch — with no readings it renders its
    // forward-looking logging nudge + action (never reassures).
    expect(getByText(/no weigh-ins logged yet/i)).toBeTruthy();
    expect(getByText('Log a weigh-in')).toBeTruthy();
    // Not the cold-start state.
    expect(queryByText(/still getting to know/i)).toBeNull();
  });

  it('a failed read is a warm error with a retry, never a wrong number; the retry reads again', async () => {
    A.getSymptomCounts.mockRejectedValueOnce(new Error('disk')).mockResolvedValue([]);
    A.getTopFoods.mockResolvedValue(notEnoughData(0, 4));
    A.getTopProteins.mockResolvedValue(notEnoughData(0, 4));
    A.getMealTreatComposition.mockResolvedValue({ meal: 1, treat: 0, other: 0, unclassified: 0, total: 1 });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { getByText, getByLabelText } = render(<PatternsScreen />);

    await waitFor(() => expect(getByText(/couldn't pull Nyx's patterns/i)).toBeTruthy());
    fireEvent.press(getByLabelText('Try again'));
    await waitFor(() => expect(getByText('Top food')).toBeTruthy());
    expect(A.getSymptomCounts).toHaveBeenCalledTimes(2);
    errorSpy.mockRestore();
  });
});
