// Patterns × Noticed — the screen wiring, FLAG ON (CUL-874 / N-5).
//
// The sibling suite `app/insights/index.test.tsx` runs the flag-OFF path and asserts
// Patterns is unchanged. This one runs the three gates ON and asserts the four things
// only the SCREEN can get wrong: that the card appears, where it appears, that the shared
// withheld predicate reaches it, and that a failed look read costs the dashboard nothing.
//
// The card's own model is `lib/lookPatterns.test.ts`'s and its render is
// `components/dashboard/WhatYouNoticedCard.test.tsx`'s; nothing is re-asserted here.

jest.mock('react-native-gifted-charts', () => ({ LineChart: () => null }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('../../lib/db', () => ({ getDb: () => ({}) }));
jest.mock('../../lib/feedingArrangements', () => ({ getActiveArrangementsForPet: jest.fn() }));

// The three gates, mutable per test.
let mockFlagOn = true;
let mockOptedIn = true;
jest.mock('../../hooks/useAppConfig', () => ({ useAllowlistFlag: () => mockFlagOn }));
jest.mock('../../lib/betaFeatures', () => ({ useBetaOptIn: () => mockOptedIn }));
jest.mock('../../hooks/useDietTrial', () => ({
  useDietTrial: () => ({ input: null, isLoading: false, reload: jest.fn(), inputIsForActivePet: false }),
}));

const mockLoadLookDays = jest.fn();
const mockLoadVomitDays = jest.fn();
jest.mock('../../lib/looks', () => ({
  loadLookDays: (...a: unknown[]) => mockLoadLookDays(...a),
  loadVomitLocalDays: (...a: unknown[]) => mockLoadVomitDays(...a),
}));

// The SHARED predicate, kept real except for its I/O — `lookWithheld` itself is the thing
// Home and Patterns must agree on (T-20), so stubbing the decision would test nothing.
// Only the fact LOAD is stubbed; N-4b's own fixtures cover the arms.
let mockWithheldFacts: unknown = {
  petId: 'p1',
  serverIntakeDecline: false,
  trialNotEating: false,
  recentQualifyingMeals: [],
};
jest.mock('../../lib/lookWithheld', () => {
  const actual = jest.requireActual('../../lib/lookWithheld');
  return { ...actual, loadLookWithheldFacts: jest.fn(async () => mockWithheldFacts) };
});

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
jest.mock('../../lib/weight', () => ({
  getWeightHistory: jest.fn().mockResolvedValue([]),
  getWeightReadingCount: jest.fn().mockResolvedValue(0),
  computeWeightTrend: () => ({
    readingCount: 0, seriesLbs: [], latestLbs: null,
    latestOccurredAt: null, earliestOccurredAt: null, deltaLbs: null, direction: null,
  }),
}));

import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import PatternsScreen from './index';
import { usePetStore } from '../../store/petStore';
import * as analytics from '../../lib/analytics';
import { notEnoughData } from '../../lib/analytics';
import { LOOK_VOCAB_VERSION } from '../../constants/lookWords';
import { localDayIndex, dayKeyFromIndex } from '../../lib/utils';
import { NOTICED_CARD_HREF } from '../../lib/lookPatterns';

const A = analytics as jest.Mocked<typeof analytics>;
const NOW = Date.now();
const TODAY = localDayIndex(NOW);

const PET = {
  id: 'p1', name: 'Mochi', species: 'cat' as const, breed: null, date_of_birth: null,
  date_of_birth_precision: 'exact' as const, sex: 'female' as const, weight_kg: null, photo_path: null,
};

/** 24 answered days, *Off* on the three most recent. */
function record() {
  return Array.from({ length: 24 }, (_, i) => ({
    eventId: `e-${i}`,
    localDay: dayKeyFromIndex(TODAY - i),
    createdAt: new Date(NOW - i * 86_400_000).toISOString(),
    outcome: i < 3 ? ('observed' as const) : ('nothing_unusual' as const),
    words: i < 3 ? ['subdued'] : [],
    vocabVersion: LOOK_VOCAB_VERSION,
  }));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFlagOn = true;
  mockOptedIn = true;
  mockWithheldFacts = {
    petId: 'p1', serverIntakeDecline: false, trialNotEating: false, recentQualifyingMeals: [],
  };
  mockLoadLookDays.mockResolvedValue(record());
  mockLoadVomitDays.mockResolvedValue([]);
  usePetStore.setState({ pets: [PET], activePet: PET, isOnboarded: true });
  A.getSymptomCounts.mockResolvedValue([{ symptomType: 'vomit', current: 3, prior: 1, delta: 2 }]);
  A.getSymptomFrequencyByDay.mockResolvedValue([]);
  A.getSymptomFrequencyByMonth.mockResolvedValue([]);
  A.getIntakeDeclineByMonth.mockResolvedValue([]);
  A.getEarliestEventMonth.mockResolvedValue(null);
  A.getIntakeRateWithPrior.mockResolvedValue({ current: notEnoughData(0, 4), prior: notEnoughData(0, 4) });
  A.getTopFoods.mockResolvedValue(notEnoughData(0, 4));
  A.getTopProteins.mockResolvedValue(notEnoughData(0, 4));
  A.getMealTreatComposition.mockResolvedValue({ meal: 4, treat: 0, other: 0, unclassified: 0, total: 4 });
});

describe('the card appears when, and only when, all three gates hold', () => {
  it('renders with the flag, the opt-in and a species that has a vocabulary', async () => {
    const { findByTestId } = render(<PatternsScreen />);
    await findByTestId('what-you-noticed-card');
  });

  it('is absent off the FLAG, and the look record is never even read', async () => {
    mockFlagOn = false;
    const { queryByTestId, findByText } = render(<PatternsScreen />);
    await findByText('Meals finished');
    expect(queryByTestId('what-you-noticed-card')).toBeNull();
    expect(mockLoadLookDays).not.toHaveBeenCalled();
  });

  it('is absent without the OPT-IN', async () => {
    mockOptedIn = false;
    const { queryByTestId, findByText } = render(<PatternsScreen />);
    await findByText('Meals finished');
    expect(queryByTestId('what-you-noticed-card')).toBeNull();
  });

  it('is absent for a pet of species `other` — there is no vocabulary to read back', async () => {
    const other = { ...PET, species: 'other' as const };
    usePetStore.setState({ pets: [other], activePet: other });
    const { queryByTestId, findByText } = render(<PatternsScreen />);
    await findByText('Meals finished');
    expect(queryByTestId('what-you-noticed-card')).toBeNull();
    expect(mockLoadLookDays).not.toHaveBeenCalled();
  });
});

describe('where it lands', () => {
  it('sits below the symptom card and above the food rankings (E-13)', async () => {
    const { findByTestId, getByText, UNSAFE_root } = render(<PatternsScreen />);
    await findByTestId('what-you-noticed-card');
    // Order by the rendered text's position in the tree's flattened string content.
    const texts: string[] = [];
    const walk = (node: { children?: unknown[] }) => {
      for (const child of node.children ?? []) {
        if (typeof child === 'string') texts.push(child);
        else walk(child as { children?: unknown[] });
      }
    };
    walk(UNSAFE_root as unknown as { children?: unknown[] });
    const joined = texts.join(' ');
    getByText('What you noticed');
    expect(joined.indexOf('Vomit')).toBeLessThan(joined.indexOf('What you noticed'));
    expect(joined.indexOf('Meals finished')).toBeLessThan(joined.indexOf('What you noticed'));
    expect(joined.indexOf('What you noticed')).toBeLessThan(joined.indexOf('Top food'));
  });

  it('its door opens the record filtered to looks, not an unbuilt metric detail', async () => {
    const { findByTestId } = render(<PatternsScreen />);
    fireEvent.press(await findByTestId('what-you-noticed-card'));
    expect(router.push).toHaveBeenCalledWith(NOTICED_CARD_HREF);
    expect(router.push).not.toHaveBeenCalledWith(expect.stringContaining('/insights/'));
  });
});

describe('the shared withheld predicate reaches the card (T-20)', () => {
  it('a live server intake decline withholds here, exactly as it does on Home', async () => {
    mockWithheldFacts = {
      petId: 'p1', serverIntakeDecline: true, trialNotEating: false, recentQualifyingMeals: [],
    };
    const { findByTestId, queryByTestId } = render(<PatternsScreen />);
    await findByTestId('noticed-withheld');
    expect(queryByTestId('noticed-coverage')).toBeNull();
  });

  it('UNLOADED facts withhold too — the predicate fails closed and the screen inherits it', async () => {
    mockWithheldFacts = null;
    const { findByTestId } = render(<PatternsScreen />);
    await findByTestId('noticed-withheld');
  });

  it('an open record draws the denominator line', async () => {
    const { findByTestId, queryByTestId } = render(<PatternsScreen />);
    await findByTestId('noticed-coverage');
    expect(queryByTestId('noticed-withheld')).toBeNull();
  });
});

describe('a failed look read costs the dashboard nothing', () => {
  it('drops the card and leaves every other card standing — never a whole-screen error', async () => {
    mockLoadLookDays.mockRejectedValue(new Error('local read failed'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const { queryByTestId, findByText } = render(<PatternsScreen />);
    await findByText('Meals finished');
    expect(queryByTestId('what-you-noticed-card')).toBeNull();
    await waitFor(() => expect(console.error).toHaveBeenCalled());
  });
});

describe('the read’s window', () => {
  it('reads EIGHT weeks, so the comparison has an earlier half to count', async () => {
    const { findByTestId } = render(<PatternsScreen />);
    await findByTestId('what-you-noticed-card');
    const sinceDay = mockLoadLookDays.mock.calls[0][1] as string;
    // 56 days back, inclusive of today.
    expect(sinceDay).toBe(dayKeyFromIndex(TODAY - 55));
    expect(mockLoadVomitDays.mock.calls[0][1]).toBe(sinceDay);
  });
});
