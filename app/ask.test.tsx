// Ask's empty-record door (CUL-503).
//
// The designed empty state (Principle 5) invites the owner to "Log something for
// {pet}". That door pushed the full-screen /log picker, so an owner arriving here met a
// different logging surface from the one the FAB opens. It now opens the app's one log
// sheet through `store/uiStore.ts`; the sheet is mounted at the root
// (components/log/LogSheetHost.tsx) precisely so it can present over a pushed screen
// like this one. Whether it DOES present over it on iOS is a device check, not a jest
// one: what this file pins is that the door asks for the sheet and pushes nothing.

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useFocusEffect: (cb: () => void | (() => void)) => {
    const { useEffect } = require('react');
    useEffect(() => cb(), []);
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
  loadAskSuggestions: jest.fn(() => ({ total: 0, chips: [] })),
  askQuestion: jest.fn(),
}));

import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import AskScreen from './ask';
import { usePetStore } from '../store/petStore';
import { useUiStore } from '../store/uiStore';

beforeEach(() => {
  jest.clearAllMocks();
  usePetStore.setState({
    pets: [{ id: 'p1', name: 'Nyx' }] as never,
    activePet: { id: 'p1', name: 'Nyx' } as never,
  });
  useUiStore.setState({ logSheet: null });
});

describe('Ask — the empty record’s door', () => {
  it('opens the log sheet at its grid and pushes nothing', () => {
    render(<AskScreen />);
    expect(useUiStore.getState().logSheet).toBeNull();

    fireEvent.press(screen.getByText('Log something for Nyx'));

    expect(useUiStore.getState().logSheet).toEqual({ initialType: null });
    expect(router.push).not.toHaveBeenCalled();
  });
});
