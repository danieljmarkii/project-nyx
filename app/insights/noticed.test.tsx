// Patterns × Noticed — the screen wiring (CUL-874 / N-5; GA by CUL-876).
//
// This suite asserts the four things only the SCREEN can get wrong: that the card appears, where it appears, that the shared
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
// The month (Design v2, GA by CUL-1071) draws and reads on its own — its wiring is
// app/insights/designV2.test.tsx — so here it is a placeholder, and its reads (which
// reach lib/supabase at import time) are stubbed for the import edge only.
jest.mock('../../lib/monthReads', () => ({ readMonthFacts: jest.fn(), readDayRows: jest.fn() }));
jest.mock('../../components/designV2/patterns/MonthInstrument', () => {
  const { View } = require('react-native');
  return { MonthInstrument: () => <View testID="month-instrument" /> };
});
jest.mock('../../lib/feedingArrangements', () => ({ getActiveArrangementsForPet: jest.fn() }));

jest.mock('../../hooks/useDietTrial', () => ({
  useDietTrial: () => ({ input: null, isLoading: false, reload: jest.fn(), inputIsForPet: false }),
}));

// CUL-914 (c): the pairing is held, and the vomit-day read exists only for it. The mock is
// the module object both the screen and `lib/lookPatterns` read the switch off, so a test
// lifts the hold by writing to it (`setPairingOn`). `__esModule` is load-bearing: spread
// drops the actual module's non-enumerable flag, and without it Babel's interop hands each
// importer a copy taken at import time, so a lifted hold would never reach the screen.
jest.mock('../../lib/lookPairing', () => ({
  ...jest.requireActual('../../lib/lookPairing'),
  __esModule: true,
  LOOK_PAIRING_ON_PATTERNS: false,
}));
function setPairingOn(on: boolean): void {
  (jest.requireMock('../../lib/lookPairing') as { LOOK_PAIRING_ON_PATTERNS: boolean }).LOOK_PAIRING_ON_PATTERNS = on;
}

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
import { noticedCardHref } from '../../lib/lookPatterns';

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
  setPairingOn(false);
  mockWithheldFacts = {
    petId: 'p1', serverIntakeDecline: false, trialNotEating: false, recentQualifyingMeals: [],
  };
  mockLoadLookDays.mockResolvedValue(record());
  mockLoadVomitDays.mockResolvedValue([]);
  usePetStore.setState({ pets: [PET], activePet: PET, isOnboarded: true });
  A.getSymptomCounts.mockResolvedValue([{ symptomType: 'vomit', current: 3, prior: 1, delta: 2 }]);
  A.getTopFoods.mockResolvedValue(notEnoughData(0, 4));
  A.getTopProteins.mockResolvedValue(notEnoughData(0, 4));
  A.getMealTreatComposition.mockResolvedValue({ meal: 4, treat: 0, other: 0, unclassified: 0, total: 4 });
});

describe('the card appears for every cat and dog, and only for them (Noticed GA, CUL-876)', () => {
  it('renders for a species that has a vocabulary, with no flag or opt-in', async () => {
    const { findByTestId } = render(<PatternsScreen />);
    await findByTestId('what-you-noticed-card');
  });

  it('is absent for a pet of species `other` — there is no vocabulary to read back', async () => {
    const other = { ...PET, species: 'other' as const };
    usePetStore.setState({ pets: [other], activePet: other });
    const { queryByTestId, findByText } = render(<PatternsScreen />);
    await findByText('Top food');
    expect(queryByTestId('what-you-noticed-card')).toBeNull();
    expect(mockLoadLookDays).not.toHaveBeenCalled();
  });
});

describe('where it lands', () => {
  it('sits last — after the month, the weight and the food rankings (Design v2 page order)', async () => {
    const { findByTestId, getByText, toJSON } = render(<PatternsScreen />);
    await findByTestId('what-you-noticed-card');
    getByText('What you noticed');
    const json = JSON.stringify(toJSON());
    const at = json.indexOf('what-you-noticed-card');
    expect(json.indexOf('month-instrument')).toBeGreaterThan(-1);
    expect(json.indexOf('month-instrument')).toBeLessThan(at);
    expect(json.indexOf('weight-card-v2')).toBeGreaterThan(-1);
    expect(json.indexOf('weight-card-v2')).toBeLessThan(at);
    expect(json.indexOf('Top food')).toBeGreaterThan(-1);
    expect(json.indexOf('Top food')).toBeLessThan(at);
  });

  it('its door opens the record filtered to looks, not an unbuilt metric detail', async () => {
    const { findByTestId } = render(<PatternsScreen />);
    fireEvent.press(await findByTestId('what-you-noticed-card'));
    expect(router.push).toHaveBeenCalledWith(expect.stringContaining('/history?type=check_in'));
    expect(router.push).not.toHaveBeenCalledWith(expect.stringContaining('/insights/'));
  });

  it('the door carries a NONCE, so a second tap re-applies the filter', async () => {
    // History is a mounted tab whose filter effect returns early on `!params.ts`. Without
    // this the card's promise ("Opens every look in the record") holds on the first tap
    // only — an owner who changed the scope in between lands wherever she left it.
    const { findByTestId } = render(<PatternsScreen />);
    fireEvent.press(await findByTestId('what-you-noticed-card'));
    const href = (router.push as jest.Mock).mock.calls[0][0] as string;
    expect(href).toMatch(/[?&]ts=\d+/);
    // And it MOVES between taps, which is the whole point of a nonce.
    expect(noticedCardHref(1)).not.toBe(noticedCardHref(2));
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
    await findByText('Top food');
    expect(queryByTestId('what-you-noticed-card')).toBeNull();
    await waitFor(() => expect(console.error).toHaveBeenCalled());
  });
});

describe('the read’s window', () => {
  it('reads the WHOLE look record — a first date is a claim about the record, not a window', async () => {
    // Bounded, this card would name its horizon's first day while Home and the report
    // named the record's, for the same word, one tap apart — and in the under-stating
    // direction. Every COUNT is bounded inside the model regardless.
    const { findByTestId } = render(<PatternsScreen />);
    await findByTestId('what-you-noticed-card');
    expect(mockLoadLookDays.mock.calls[0][1]).toBeUndefined();
  });

  it('makes NO vomit-day read while the pairing is held — and a read that would fail cannot blank the card', async () => {
    // The fixture would answer if asked, and would fail if asked: an absence proves the
    // gate only when the thing gated was available (C-41).
    mockLoadVomitDays.mockRejectedValue(new Error('vomit read failed'));
    const { findByTestId } = render(<PatternsScreen />);
    await findByTestId('what-you-noticed-card');
    expect(mockLoadVomitDays).not.toHaveBeenCalled();
  });

  it('with the hold lifted, reads EIGHT weeks of vomit days, so the pairing’s read is not narrower than the compare’s', async () => {
    setPairingOn(true);
    const { findByTestId } = render(<PatternsScreen />);
    await findByTestId('what-you-noticed-card');
    expect(mockLoadVomitDays.mock.calls[0][1]).toBe(dayKeyFromIndex(TODAY - 55));
  });
});
