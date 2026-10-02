// Patterns reads its record ONCE per focus.
//
// `load` is a useCallback keyed on `trialNotEating`, and the focus effect is keyed on
// `load` — and expo-router's real `useFocusEffect` invokes a changed callback at once
// while the screen is focused (the note in `app/(tabs)/history.test.tsx`). The trial
// loader used to read on every open and every pet switch whatever the flags, and its
// answer flipped `trialNotEating` null → false a beat after the first load, re-running
// all eleven local reads for EVERY account. Its only readers are dark: Noticed's
// withheld predicate (`daily_look`) and the month's trial mark (`design_v2`).
//
// So this suite runs the REAL `useDietTrial` — only its read, `loadDietTrialFacts`, is
// stubbed, and it answers a beat late as the real one does — under a focus mock that
// re-fires on the callback's identity, and counts loads by the one read every load makes.
// Its siblings mock `useDietTrial` to a constant and fire the focus effect once on mount,
// which is why neither could see a second load.

jest.mock('react-native-gifted-charts', () => ({ LineChart: () => null }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('../../lib/db', () => ({ getDb: () => ({}) }));
jest.mock('../../lib/monthReads', () => ({ readMonthFacts: jest.fn(), readDayRows: jest.fn() }));
jest.mock('../../lib/feedingArrangements', () => ({ getActiveArrangementsForPet: jest.fn() }));

// The gates, mutable per test: `mockLookOn` turns the daily look's two gates on, and
// the pet below is a cat, so Noticed is live exactly when it is set.
let mockLookOn = false;
let mockDesignV2 = false;
jest.mock('../../hooks/useAppConfig', () => ({ useAllowlistFlag: () => mockLookOn }));
jest.mock('../../lib/betaFeatures', () => ({ useBetaOptIn: () => mockLookOn }));
jest.mock('../../hooks/useDesignV2', () => ({ useDesignV2: () => mockDesignV2 }));
// Design v2's month is drawn by its own suites; here it only reports the trial mark it
// was handed, which is the one thing it reads from the trial loader.
const mockTrialMarks: unknown[] = [];
jest.mock('../../components/designV2/patterns/MonthInstrument', () => ({
  MonthInstrument: ({ trialMark }: { trialMark: unknown }) => {
    mockTrialMarks.push(trialMark);
    return null;
  },
}));
jest.mock('../../components/designV2/patterns/WeightCard', () => ({ WeightCard: () => null }));

// The trial loader's READ. The hook around it is the real one.
const mockLoadTrialFacts = jest.fn();
jest.mock('../../lib/dietTrialFacts', () => ({
  ...jest.requireActual('../../lib/dietTrialFacts'),
  loadDietTrialFacts: (...a: unknown[]) => mockLoadTrialFacts(...a),
}));

jest.mock('../../lib/looks', () => ({
  loadLookDays: jest.fn(async () => []),
  loadVomitLocalDays: jest.fn(async () => []),
}));
const mockLoadWithheldFacts = jest.fn();
jest.mock('../../lib/lookWithheld', () => ({
  ...jest.requireActual('../../lib/lookWithheld'),
  loadLookWithheldFacts: (...a: unknown[]) => mockLoadWithheldFacts(...a),
}));
jest.mock('../../lib/patternsTiming', () => ({
  ...jest.requireActual('../../lib/patternsTiming'),
  getTimingPanel: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../lib/patternsTrial', () => ({
  ...jest.requireActual('../../lib/patternsTrial'),
  getTrialPanel: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../hooks/useSummary', () => ({
  useSummary: () => ({ summary: null, displayState: 'building', petName: 'Mochi', isLoading: false }),
}));
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    Stack: { Screen: () => null },
    router: { push: jest.fn() },
    // `[cb]`, NOT `[]`: the real hook re-runs the focus body when the memoized
    // callback's identity changes while focused, and that is the defect's whole path.
    useFocusEffect: (cb: () => void | (() => void)) => {
      React.useEffect(() => cb(), [cb]);
    },
  };
});
jest.mock('../../lib/analytics', () => ({
  ...jest.requireActual('../../lib/analytics'),
  getSymptomCounts: jest.fn(),
  getSymptomFrequencyByDay: jest.fn(),
  getSymptomFrequencyByMonth: jest.fn(),
  getIntakeDeclineByMonth: jest.fn(),
  getEarliestEventMonth: jest.fn(),
  getIntakeRateWithPrior: jest.fn(),
  getTopFoods: jest.fn(),
  getTopProteins: jest.fn(),
  getMealTreatComposition: jest.fn(),
}));
jest.mock('../../lib/weight', () => ({
  getWeightHistory: jest.fn().mockResolvedValue([]),
  getWeightReadingCount: jest.fn().mockResolvedValue(0),
  computeWeightTrend: () => ({
    readingCount: 0, seriesLbs: [], latestLbs: null,
    latestOccurredAt: null, earliestOccurredAt: null, deltaLbs: null, direction: null,
  }),
}));

import { act, render } from '@testing-library/react-native';
import PatternsScreen from './index';
import { usePetStore } from '../../store/petStore';
import * as analytics from '../../lib/analytics';
import { notEnoughData } from '../../lib/analytics';

const A = analytics as jest.Mocked<typeof analytics>;

const PET = {
  id: 'p1', name: 'Mochi', species: 'cat' as const, breed: null, date_of_birth: null,
  date_of_birth_precision: 'exact' as const, sex: 'female' as const, weight_kg: null, photo_path: null,
};

/** A pet on a trial that is eating — `isAnimalNotEating` reads false once it answers. */
const TRIAL_INPUT = {
  trial: { status: 'active', startedAt: '2026-07-25', targetDurationDays: 56 },
  nowMs: 0,
  petName: 'Mochi',
};

/** Every timer, promise and effect the screen has queued, settled. */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLookOn = false;
  mockDesignV2 = false;
  mockTrialMarks.length = 0;
  usePetStore.setState({ pets: [PET], activePet: PET, isOnboarded: true });
  // The loader answers a beat after it is asked, as the real local read does: after
  // the first load has already started.
  mockLoadTrialFacts.mockImplementation(
    () => new Promise((resolve) => setTimeout(() => resolve(TRIAL_INPUT), 0)),
  );
  mockLoadWithheldFacts.mockResolvedValue(null);
  A.getSymptomCounts.mockResolvedValue([]);
  A.getSymptomFrequencyByDay.mockResolvedValue([]);
  A.getSymptomFrequencyByMonth.mockResolvedValue([]);
  A.getIntakeDeclineByMonth.mockResolvedValue([]);
  A.getEarliestEventMonth.mockResolvedValue(null);
  A.getIntakeRateWithPrior.mockResolvedValue({ current: notEnoughData(0, 4), prior: notEnoughData(0, 4) });
  A.getTopFoods.mockResolvedValue(notEnoughData(0, 4));
  A.getTopProteins.mockResolvedValue(notEnoughData(0, 4));
  A.getMealTreatComposition.mockResolvedValue({ meal: 0, treat: 0, other: 0, unclassified: 0, total: 0 });
});

describe('Patterns — one load per focus', () => {
  it('with every flag off: one load, and the trial loader never reads', async () => {
    render(<PatternsScreen />);
    await settle();
    expect(A.getSymptomCounts).toHaveBeenCalledTimes(1);
    expect(mockLoadTrialFacts).not.toHaveBeenCalled();
  });

  it('under design_v2 alone: the trial still reaches the month, and still one load', async () => {
    // The month's trial mark is the loader's other reader, so the read must survive
    // here — and its answer must not re-key the dashboard's load on the way.
    mockDesignV2 = true;
    render(<PatternsScreen />);
    await settle();
    expect(mockLoadTrialFacts).toHaveBeenCalled();
    expect(mockTrialMarks[mockTrialMarks.length - 1]).toEqual(
      expect.objectContaining({ day: '2026-07-25' }),
    );
    expect(A.getSymptomCounts).toHaveBeenCalledTimes(1);
  });

  it('with Noticed live, the withheld predicate is re-read once the trial answers', async () => {
    // The one reader of `trialNotEating`: until the trial answers it is ignorance and
    // the card fails closed, so the answer must reach it on this visit, not the next.
    mockLookOn = true;
    render(<PatternsScreen />);
    await settle();
    expect(mockLoadTrialFacts).toHaveBeenCalled();
    expect(mockLoadWithheldFacts).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'p1' }),
      false,
      expect.any(Number),
    );
  });
});
