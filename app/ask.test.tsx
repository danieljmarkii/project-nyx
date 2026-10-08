// Ask's empty-record door (CUL-503).
//
// The designed empty state (Principle 5) invites the owner to "Log something for
// {pet}". That door pushed the full-screen /log picker, so an owner arriving here met a
// different logging surface from the one the FAB opens. It now opens the app's one log
// sheet through `store/uiStore.ts`; the sheet is mounted at the root
// (components/log/LogSheetHost.tsx) precisely so it can present over a pushed screen
// like this one. Whether it DOES present over it on iOS is a device check, not a jest
// one: what this file pins is that the door asks for the sheet and pushes nothing.

// The screen is focused throughout, and expo-router's useFocusEffect re-runs a focused
// screen's effect whenever its callback changes, which is what the record re-read below
// rides on. Modelled here as an effect keyed on the callback.
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useFocusEffect: (cb: () => void | (() => void)) => {
    const { useEffect } = require('react');
    useEffect(() => cb(), [cb]);
  },
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});
// The answer card's sparkline pulls in a native chart; the repo's other screen tests
// stub it the same way.
jest.mock('react-native-gifted-charts', () => ({ LineChart: () => null }));
jest.mock('../lib/supabase', () => ({ supabase: {} }));
jest.mock('../lib/db', () => ({ getDb: jest.fn() }));
jest.mock('../hooks/useIsOnline', () => ({ useIsOnline: () => true }));
// requireActual (C-34): the screen uses the module's pure helpers as they ship. Only the
// two functions that reach storage or the network are stubbed, and the suggestion read
// answers with an empty record, which is the state under test.
jest.mock('../lib/ask', () => ({
  ...jest.requireActual('../lib/ask'),
  loadAskSuggestions: jest.fn(() => ({ total: 0, chips: [], hasLooks: false })),
  askQuestion: jest.fn(),
}));

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import AskScreen from './ask';
import { loadAskSuggestions } from '../lib/ask';
import { usePetStore } from '../store/petStore';
import { useUiStore } from '../store/uiStore';
import { useAskStore } from '../store/askStore';
import { useEventStore, type NyxEvent } from '../store/eventStore';

const mockedSuggestions = loadAskSuggestions as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  usePetStore.setState({
    pets: [{ id: 'p1', name: 'Nyx' }] as never,
    activePet: { id: 'p1', name: 'Nyx' } as never,
  });
  useUiStore.setState({ logSheet: null });
  useEventStore.setState({ todayEvents: [] });
  useAskStore.setState({
    petId: null, messages: [], thinking: false, capped: null, disabled: false,
    lastQuestion: null, lastActivityMs: 0,
  });
  mockedSuggestions.mockImplementation(() => ({ total: 0, chips: [], hasLooks: false }));
});

describe('Ask — the empty record’s door', () => {
  it('opens the log sheet at its grid and pushes nothing', () => {
    render(<AskScreen />);
    expect(useUiStore.getState().logSheet).toBeNull();

    fireEvent.press(screen.getByText('Log something for Nyx'));

    expect(useUiStore.getState().logSheet).toEqual({ initialType: null, veil: 'own' });
    expect(router.push).not.toHaveBeenCalled();
  });
});

// CUL-1475 — a record holding only daily looks is still empty to Ask (its tools are
// blind to looks), but the headline must not say nothing is logged over a record the
// owner has been answering (daily-look spec T-9).
describe('Ask — the empty record over a record of only looks', () => {
  it('names what the owner noticed, says Ask cannot read it, and keeps the door', () => {
    mockedSuggestions.mockImplementation(() => ({ total: 0, chips: [], hasLooks: true }));
    render(<AskScreen />);

    expect(screen.getByText("What you've noticed is on Nyx's record. Nothing else is logged yet.")).toBeTruthy();
    expect(
      screen.getByText(
        "Ask reads counts, trends, foods and meds, not the looks themselves. Log a meal or a symptom and I'll have something honest to say.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/Once a few days are logged/)).toBeNull();
    expect(screen.getByText('Log something for Nyx')).toBeTruthy();
  });

  it('keeps the first form on a record with no looks', () => {
    render(<AskScreen />);
    expect(screen.getByText("Once a few days are logged, I'll have things to answer.")).toBeTruthy();
    expect(screen.queryByText(/What you've noticed/)).toBeNull();
  });
});

/** A row the sheet's save puts into Today. */
function loggedRow(id: string): NyxEvent {
  const now = new Date().toISOString();
  return {
    id, pet_id: 'p1', event_type: 'vomit', occurred_at: now, occurred_at_confidence: 'witnessed',
    severity: null, notes: null, source: 'manual', deleted_at: null, created_at: now, updated_at: now,
  };
}

// QA (1.2.0) — the door above opens the sheet OVER this screen, and a sheet is an overlay:
// the screen never loses focus, so its record read never re-ran and it went on saying the
// record was empty after the owner had logged. The read now also keys on the Today store,
// which the sheet's save prepends to.
describe('Ask — a log saved from the empty record’s door', () => {
  it('re-reads the record, so the empty state gives way to the chips', () => {
    render(<AskScreen />);
    expect(screen.getByText('Log something for Nyx')).toBeTruthy();

    mockedSuggestions.mockImplementation(() => ({ total: 1, chips: ['When did Nyx last vomit?'], hasLooks: false }));
    act(() => useEventStore.getState().prependEvent(loggedRow('ev-1')));

    expect(screen.queryByText('Log something for Nyx')).toBeNull();
    expect(screen.getByText('When did Nyx last vomit?')).toBeTruthy();
  });

  // The re-read rides its own focus callback, apart from the conversation's re-scope,
  // because re-running `focusPet` ends a conversation that has gone idle. A log saved
  // anywhere (another device's, landing on a sync) is not a visit to this screen, so it
  // must not end the conversation the owner left up.
  it('never ends a conversation left on screen, however idle, when Today moves', () => {
    jest.useFakeTimers();
    try {
      const start = new Date(2026, 9, 2, 9, 0).getTime();
      jest.setSystemTime(start);
      useAskStore.setState({
        petId: 'p1',
        messages: [{ id: 'm1', role: 'user', text: 'How is Nyx eating?' }],
        lastActivityMs: start,
      });
      render(<AskScreen />);
      expect(screen.getByText('How is Nyx eating?')).toBeTruthy();

      jest.setSystemTime(start + 24 * 60 * 60 * 1000);
      act(() => useEventStore.getState().prependEvent(loggedRow('ev-2')));

      expect(screen.getByText('How is Nyx eating?')).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });
});
