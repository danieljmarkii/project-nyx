// CUL-1834 (mock frame C): Ask's first open asks for AI consent while no answer is on
// file, never answers a question before the owner answers this, and Don't allow and Not
// now close Ask. Same mocks as ask.test.tsx; the consent store is stubbed at its seam.

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useFocusEffect: (cb: () => void | (() => void)) => {
    const { useEffect } = require('react');
    useEffect(() => cb(), [cb]);
  },
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('react-native-gifted-charts', () => ({ LineChart: () => null }));
jest.mock('../lib/supabase', () => ({ supabase: {} }));
jest.mock('../lib/db', () => ({ getDb: jest.fn() }));
jest.mock('../hooks/useIsOnline', () => ({ useIsOnline: () => true }));
jest.mock('../lib/ask', () => ({
  ...jest.requireActual('../lib/ask'),
  loadAskSuggestions: jest.fn(() => ({ total: 0, chips: [], hasLooks: false })),
  askQuestion: jest.fn(),
}));
jest.mock('../store/aiConsentStore', () => ({
  needsAiConsentAsk: jest.fn(),
  saveAiConsent: jest.fn(),
}));

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import AskScreen from './ask';
import { askQuestion } from '../lib/ask';
import { needsAiConsentAsk, saveAiConsent } from '../store/aiConsentStore';
import { usePetStore } from '../store/petStore';
import { useAuthStore } from '../store/authStore';
import { useAskStore } from '../store/askStore';

const needsMock = needsAiConsentAsk as jest.Mock;
const saveMock = saveAiConsent as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: { id: 'u1' } as never });
  usePetStore.setState({
    pets: [{ id: 'p1', name: 'Mochi' }] as never,
    activePet: { id: 'p1', name: 'Mochi' } as never,
  });
  useAskStore.setState({
    petId: null, messages: [], thinking: false, capped: null, disabled: false,
    lastQuestion: null, lastActivityMs: 0,
  });
});

describe('Ask: the consent door', () => {
  it('asks on first open while no answer is on file, and sends no question meanwhile', async () => {
    needsMock.mockResolvedValue(true);
    render(<AskScreen />);
    await waitFor(() => expect(screen.getByText("Ask about Mochi's record")).toBeTruthy());
    fireEvent.changeText(screen.getByPlaceholderText('Ask about Mochi…'), 'Is Mochi eating less?');
    await act(async () => { fireEvent(screen.getByPlaceholderText('Ask about Mochi…'), 'submitEditing'); });
    expect(askQuestion).not.toHaveBeenCalled();
  });

  it('Not now closes Ask and writes nothing', async () => {
    needsMock.mockResolvedValue(true);
    render(<AskScreen />);
    await waitFor(() => expect(screen.getByText('Not now')).toBeTruthy());
    await act(async () => { fireEvent.press(screen.getByText('Not now')); });
    await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1), { timeout: 5000 });
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("Don't allow saves a no and closes Ask", async () => {
    needsMock.mockResolvedValue(true);
    saveMock.mockResolvedValue({ status: 'saved', row: {} });
    render(<AskScreen />);
    await waitFor(() => expect(screen.getByText("Don't allow")).toBeTruthy());
    await act(async () => { fireEvent.press(screen.getByText("Don't allow")); });
    expect(saveMock).toHaveBeenCalledWith('u1', false, 'backstop');
    await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1), { timeout: 5000 });
  });

  it('Allow saves a yes and leaves Ask open', async () => {
    needsMock.mockResolvedValue(true);
    saveMock.mockResolvedValue({ status: 'saved', row: {} });
    render(<AskScreen />);
    await waitFor(() => expect(screen.getByText('Allow')).toBeTruthy());
    await act(async () => { fireEvent.press(screen.getByText('Allow')); });
    expect(saveMock).toHaveBeenCalledWith('u1', true, 'backstop');
    await act(async () => { await new Promise((r) => setTimeout(r, 900)); });
    expect(router.back).not.toHaveBeenCalled();
  });

  it('an owner who already answered sees Ask with no sheet', async () => {
    needsMock.mockResolvedValue(false);
    render(<AskScreen />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByText("Ask about Mochi's record")).toBeNull();
    expect(router.back).not.toHaveBeenCalled();
  });
});
