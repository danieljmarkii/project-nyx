// The in-context offer's screen wiring on the Daily Recap (DR-3 / CUL-26, spec §4).
//
// THE NAMED GATE: the consent path is banner → primer → prompt, NEVER banner →
// prompt. This renders the REAL screen with the REAL useDailyRecapOffer hook (only
// its I/O is stubbed), so it pins the actual wiring: tapping the banner's "Turn on"
// opens the primer and does NOT fire ensurePermission(true); only the primer's own
// "Turn on" reaches the OS prompt. It also pins the two other §4 behaviours — the
// banner shows only on an IN-APP arrival, and "Not now" quiets it for 30 days.
//
// The pure decision + markers are unit-tested in lib/dailyRecapOffer.test.ts; this is
// the integration layer the pure test can't reach.

jest.mock('../lib/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('expo-status-bar', () => ({ setStatusBarStyle: jest.fn() }));
// Off the native SVG/animation path — the primer's PrimaryButton loading spinner.
jest.mock('../components/brand/WhorlSpinner', () => ({ WhorlSpinner: () => null }));

// The arrival is set per-test by swapping what useLocalSearchParams returns.
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => false },
    useLocalSearchParams: () => mockParams,
    useFocusEffect: (cb: () => void | (() => void)) => {
      React.useEffect(() => cb(), []);
    },
  };
});

// The screen's day model is stubbed to a single-pet ready-with-content state, so the
// ScrollView (and therefore the offer banner at its foot) renders.
const mockState = jest.fn();
jest.mock('../hooks/useDaySummary', () => ({ useDaySummary: () => mockState() }));
jest.mock('../store/syncStore', () => ({
  useSyncStore: { getState: () => ({ bumpHydrationTick: jest.fn() }) },
}));

// The offer hook's I/O: permission + preference stubbed; the primer copy is the REAL
// registry descriptor (DR-4). lib/dailyRecapOffer (the decision + markers) is NOT
// mocked — it runs for real against the in-memory AsyncStorage mock.
jest.mock('../lib/notifications', () => ({
  ensurePermission: jest.fn(),
  NOTIFICATION_CATEGORIES: jest.requireActual('../lib/notifications').NOTIFICATION_CATEGORIES,
}));
jest.mock('../lib/notificationSettings', () => ({
  readCategoryEnabled: jest.fn(),
  applyCategoryPreference: jest.fn(),
}));
let mockPets: { id: string; name: string }[] = [{ id: 'p1', name: 'Biscuit' }];
jest.mock('../store/petStore', () => ({
  usePetStore: (sel: (s: { pets: { id: string; name: string }[] }) => unknown) =>
    sel({ pets: mockPets }),
}));
const mockSnackbar = jest.fn();
jest.mock('../store/snackbarStore', () => ({
  useSnackbarStore: { getState: () => ({ show: mockSnackbar }) },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import DaySummaryScreen from './day-summary';
import { ensurePermission } from '../lib/notifications';
import { readCategoryEnabled, applyCategoryPreference } from '../lib/notificationSettings';
import { readOfferState } from '../lib/dailyRecapOffer';
import type { DaySummaryModel } from '../lib/daySummary';

const mockEnsure = ensurePermission as jest.Mock;
const mockReadCategory = readCategoryEnabled as jest.Mock;
const mockApply = applyCategoryPreference as jest.Mock;

// A ready single-pet model with one spine row, so the ScrollView renders.
function readyModel(): { status: 'ready'; anchorMs: number; model: DaySummaryModel } {
  return {
    status: 'ready',
    anchorMs: Date.parse('2026-08-15T21:00:00Z'),
    model: {
      sections: [
        {
          petId: 'p1',
          petName: 'Biscuit',
          species: 'dog',
          isZeroLog: false,
          rows: [
            {
              id: 'e1', eventType: 'meal', category: 'meal', title: 'Hill’s z/d',
              detail: null, formatTag: null, time: '7:42 AM', timeMs: 0, subline: null,
            },
          ],
        },
      ],
      isEmpty: false,
      petCount: 1,
      lead: 'Three meals in Biscuit’s record.',
      chips: [],
      trialStrip: null,
      medStrips: [],
      forward: null,
    } as unknown as DaySummaryModel,
  };
}

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  mockParams = {}; // in-app arrival by default
  mockPets = [{ id: 'p1', name: 'Biscuit' }];
  mockState.mockReturnValue(readyModel());
  mockReadCategory.mockResolvedValue(false); // recap off
  mockApply.mockResolvedValue(undefined);
  mockEnsure.mockResolvedValue('undetermined'); // never asked
});

describe('the offer shows only on an IN-APP arrival (§4)', () => {
  it('renders the banner on an in-app visit while off + not denied', async () => {
    const { findByText } = render(<DaySummaryScreen />);
    expect(
      await findByText('Culprit can let you know each evening when the day’s record is ready.'),
    ).toBeTruthy();
  });

  it('NEVER renders over a notification-tap arrival (source=notification)', async () => {
    mockParams = { source: 'notification', firedAt: '1700000000000' };
    const { queryByLabelText } = render(<DaySummaryScreen />);
    // Give the (skipped) eligibility read a tick to prove it stays hidden.
    await waitFor(() => expect(mockReadCategory).not.toHaveBeenCalled());
    expect(queryByLabelText('Turn on the daily summary')).toBeNull();
  });

  it('does not render once the recap is already on', async () => {
    mockReadCategory.mockResolvedValue(true);
    const { queryByLabelText } = render(<DaySummaryScreen />);
    await waitFor(() => expect(mockReadCategory).toHaveBeenCalled());
    expect(queryByLabelText('Turn on the daily summary')).toBeNull();
  });

  it('never renders to an OS-denied account', async () => {
    mockEnsure.mockResolvedValue('denied');
    const { queryByLabelText } = render(<DaySummaryScreen />);
    await waitFor(() => expect(mockEnsure).toHaveBeenCalledWith(false));
    expect(queryByLabelText('Turn on the daily summary')).toBeNull();
  });
});

describe('the consent path — banner → primer → prompt, NEVER banner → prompt (§4)', () => {
  it('tapping the banner’s "Turn on" opens the primer and does NOT fire the OS prompt', async () => {
    const { findByLabelText, findByText } = render(<DaySummaryScreen />);
    fireEvent.press(await findByLabelText('Turn on the daily summary'));

    // The primer is up (its c2 headline)…
    expect(await findByText('The day, read back to you.')).toBeTruthy();
    // …and the ONE prompt has NOT been spent — only the eligibility read (false).
    expect(mockEnsure).toHaveBeenCalledWith(false);
    expect(mockEnsure).not.toHaveBeenCalledWith(true);
    expect(mockApply).not.toHaveBeenCalled();
  });

  it('only the primer’s "Turn on" reaches the prompt → granted enables the recap', async () => {
    mockEnsure.mockResolvedValueOnce('undetermined'); // eligibility read
    mockEnsure.mockResolvedValueOnce('granted'); // the primer's requested prompt
    const { findByLabelText } = render(<DaySummaryScreen />);

    fireEvent.press(await findByLabelText('Turn on the daily summary'));
    // The primer's own CTA, by its exact accessibilityLabel. getByLabelText matches
    // ONLY accessibilityLabel (never child text), so "Turn on" hits the primer's
    // PrimaryButton alone — the banner's button is labelled "Turn on the daily
    // summary", and its visible "Turn on" Text (which byRole name would also match)
    // is not an accessibility label.
    fireEvent.press(await findByLabelText('Turn on'));

    await waitFor(() => expect(mockEnsure).toHaveBeenCalledWith(true));
    expect(mockApply).toHaveBeenCalledWith('daily_summary', true);
  });

  it('a denied prompt never persists the opt-in (§2 — no on-while-denied lie)', async () => {
    mockEnsure.mockResolvedValueOnce('undetermined'); // eligibility read
    mockEnsure.mockResolvedValueOnce('denied'); // the prompt came back denied
    const { findByLabelText } = render(<DaySummaryScreen />);

    fireEvent.press(await findByLabelText('Turn on the daily summary'));
    fireEvent.press(await findByLabelText('Turn on')); // the primer's PrimaryButton

    await waitFor(() => expect(mockEnsure).toHaveBeenCalledWith(true));
    expect(mockApply).not.toHaveBeenCalled();
  });
});

describe('the banner’s "Not now" quiets it for 30 days (§4)', () => {
  it('hides the banner and writes a quiet-until marker', async () => {
    const { findByLabelText, queryByLabelText } = render(<DaySummaryScreen />);
    fireEvent.press(await findByLabelText('Not now, hide the daily summary offer'));

    // Hidden immediately (optimistic)…
    await waitFor(() => expect(queryByLabelText('Turn on the daily summary')).toBeNull());
    // …and the quiet marker persisted (the real lib/dailyRecapOffer write).
    await waitFor(async () => {
      const state = await readOfferState();
      expect(state.quietUntilMs).toBeGreaterThan(Date.now());
    });
    // Declining the banner is not the primer — the OS prompt is never touched.
    expect(mockEnsure).not.toHaveBeenCalledWith(true);
  });
});
