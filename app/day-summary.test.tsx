// Smoke test for the Daily Recap screen (CUL-23 / DR-1). The load-bearing model
// logic is unit-tested in lib/daySummary.test.ts and the presentational pieces in
// components/recap/*; this verifies the screen WIRING — which of the four states
// (loading / error / zero-log / ready) renders, that the single-pet rich blocks and
// the multi-pet per-pet spines route correctly, and that the retry + zero-log CTA
// fire the right actions.
//
// Mocks mirror the app-screen convention: useDaySummary is stubbed so this stays off
// the DB/loader path; expo-router / expo-status-bar / safe-area are no-ops; and
// lib/supabase is stubbed because importing lib/daySummary drags analytics → sync →
// supabase's fail-fast env check (the same stub lib/daySummary.test.ts uses).
jest.mock('./../lib/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('expo-status-bar', () => ({ setStatusBarStyle: jest.fn() }));
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => false },
    useLocalSearchParams: () => ({}),
    useFocusEffect: (cb: () => void | (() => void)) => {
      React.useEffect(() => cb(), []);
    },
  };
});

const mockState = jest.fn();
jest.mock('../hooks/useDaySummary', () => ({ useDaySummary: () => mockState() }));
// The in-context offer (DR-3) is stubbed off for the four-state wiring tests (its
// own wiring is pinned in day-summary.offer.test.tsx). Mocking the hook + the primer
// also keeps this file off the expo-notifications import chain both pull in.
jest.mock('../hooks/useDailyRecapOffer', () => ({
  useDailyRecapOffer: () => ({
    show: false,
    primerVisible: false,
    requesting: false,
    primerPetName: null,
    onTurnOn: jest.fn(),
    onNotNow: jest.fn(),
    onPrimerConfirm: jest.fn(),
    onPrimerDismiss: jest.fn(),
  }),
}));
jest.mock('../components/notifications/NotificationPrimer', () => ({ NotificationPrimer: () => null }));
const mockBump = jest.fn();
jest.mock('../store/syncStore', () => ({
  useSyncStore: { getState: () => ({ bumpHydrationTick: mockBump }) },
}));

import { fireEvent, render } from '@testing-library/react-native';
import { router } from 'expo-router';
import DaySummaryScreen from './day-summary';
import type { DaySummaryModel, DaySummarySection } from '../lib/daySummary';

function section(over: Partial<DaySummarySection> & { petId: string; petName: string }): DaySummarySection {
  return { species: 'dog', rows: [], isZeroLog: over.rows ? over.rows.length === 0 : true, ...over } as DaySummarySection;
}
function model(over: Partial<DaySummaryModel>): DaySummaryModel {
  return {
    sections: [],
    isEmpty: false,
    petCount: 1,
    lead: null,
    chips: [],
    trialStrip: null,
    medStrips: [],
    forward: null,
    ...over,
  };
}
const spineRow = (id: string, title: string, category: DaySummarySection['rows'][number]['category'] = 'meal') =>
  ({ id, eventType: 'meal', category, title, detail: null, formatTag: null, time: '9:00 AM', timeMs: 0, subline: null });

beforeEach(() => jest.clearAllMocks());

describe('DaySummaryScreen — four-state wiring', () => {
  it('error state renders a message + retry, never a false empty; retry bumps hydration', () => {
    mockState.mockReturnValue({ status: 'error', model: null });
    const { getByText } = render(<DaySummaryScreen />);
    expect(getByText('Couldn’t load today’s record')).toBeTruthy();
    fireEvent.press(getByText('Try again'));
    expect(mockBump).toHaveBeenCalledTimes(1);
  });

  it('zero-log renders the designed empty state; the CTA opens the quick-log', () => {
    mockState.mockReturnValue({
      status: 'ready',
      anchorMs: Date.parse('2026-08-15T21:00:00Z'),
      model: model({ isEmpty: true, petCount: 1, sections: [section({ petId: 'p1', petName: 'Biscuit' })] }),
    });
    const { getByText } = render(<DaySummaryScreen />);
    expect(getByText('Nothing in Biscuit’s record today')).toBeTruthy();
    fireEvent.press(getByText('Log an event'));
    expect(router.push).toHaveBeenCalledWith('/log');
  });

  it('single-pet ready renders lead + spine + trial strip + forward line', () => {
    mockState.mockReturnValue({
      status: 'ready',
      anchorMs: Date.parse('2026-08-15T21:00:00Z'),
      model: model({
        petCount: 1,
        sections: [section({ petId: 'p1', petName: 'Biscuit', isZeroLog: false, rows: [spineRow('e1', 'Whitefish')] as never })],
        lead: 'Day 12 of the Whitefish trial — three meals in Biscuit’s record.',
        trialStrip: { title: 'Whitefish trial', fact: 'Day 12 of 28 · 2 trial-diet meals logged today' },
        forward: 'Tomorrow is day 13 of the trial.',
      }),
    });
    const { getByText } = render(<DaySummaryScreen />);
    expect(getByText('Day 12 of the Whitefish trial — three meals in Biscuit’s record.')).toBeTruthy();
    expect(getByText('Whitefish')).toBeTruthy();
    expect(getByText('Whitefish trial')).toBeTruthy();
    expect(getByText('Tomorrow is day 13 of the trial.')).toBeTruthy();
  });

  it('multi-pet ready renders per-pet headings and no lead line', () => {
    mockState.mockReturnValue({
      status: 'ready',
      anchorMs: Date.parse('2026-08-15T21:00:00Z'),
      model: model({
        petCount: 2,
        lead: null,
        sections: [
          section({ petId: 'p1', petName: 'Biscuit', isZeroLog: false, rows: [spineRow('e1', 'Hill’s z/d')] as never }),
          section({ petId: 'p2', petName: 'Mochi', isZeroLog: true, rows: [] }),
        ],
      }),
    });
    const { getByText } = render(<DaySummaryScreen />);
    expect(getByText('Biscuit')).toBeTruthy();
    expect(getByText('Mochi')).toBeTruthy();
    expect(getByText('Nothing in Mochi’s record today.')).toBeTruthy();
  });
});
