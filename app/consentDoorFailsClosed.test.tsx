// CUL-1933 (the CUL-1930 stopgap): no AI consent door sends without a yes this phone
// holds. The server's gate that would refuse an unknown owner is held until PR-17, so
// an answer the phone cannot read (the read errors, throws, or passes the 4 s timeout,
// and the cache is empty) must stop at the door with a try-again notice and leave what
// the owner took or typed in place. The door and the consent store are real here; only
// the network read underneath them (`lib/aiConsent`) is stubbed, so each case drives
// the shipped decision rather than a restatement of it. Food detail's retry is the
// fourth door; `app/food/foodDetailRetry.test.tsx` covers it.

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: () => ({}),
  useFocusEffect: (cb: () => void | (() => void)) => {
    const { useEffect } = require('react');
    useEffect(() => cb(), [cb]);
  },
}));
jest.mock('expo-image-picker', () => ({
  launchCameraAsync: jest.fn(async () => ({ canceled: true, assets: [] })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: [] })),
  requestCameraPermissionsAsync: jest.fn(async () => ({ status: 'granted', granted: true })),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ status: 'granted', granted: true })),
  MediaTypeOptions: { Images: 'Images' },
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('react-native-gifted-charts', () => ({ LineChart: () => null }));
jest.mock('../lib/supabase', () => ({
  supabase: { from: jest.fn(), functions: { invoke: jest.fn() } },
}));
jest.mock('../lib/db', () => ({ getDb: () => ({ runAsync: jest.fn(), getAllAsync: jest.fn(async () => []) }) }));
jest.mock('../lib/storage', () => ({ uploadPhoto: jest.fn(), compressForUpload: jest.fn() }));
jest.mock('../hooks/useReducedMotion', () => ({ useReducedMotion: jest.fn(() => true) }));
jest.mock('../hooks/useAppActive', () => ({ useAppActive: jest.fn(() => true) }));
jest.mock('../hooks/useIsOnline', () => ({ useIsOnline: () => true }));
jest.mock('../lib/ask', () => ({
  ...jest.requireActual('../lib/ask'),
  loadAskSuggestions: jest.fn(() => ({ total: 0, chips: [], hasLooks: false })),
  askQuestion: jest.fn(async () => ({ ok: false })),
}));
jest.mock('../lib/aiConsent', () => ({
  ...jest.requireActual('../lib/aiConsent'),
  fetchAiConsent: jest.fn(),
  writeAiConsent: jest.fn(),
}));

import { Alert } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import FoodCaptureScreen from './food-capture';
import MedicationCaptureScreen from './medication-capture';
import AskScreen from './ask';
import { askQuestion } from '../lib/ask';
import { supabase } from '../lib/supabase';
import { fetchAiConsent, type AiConsentRow } from '../lib/aiConsent';
import { CONSENT_READ_TIMEOUT_MS, clearAiConsent, useAiConsentStore } from '../store/aiConsentStore';
import { useAuthStore } from '../store/authStore';
import { usePetStore } from '../store/petStore';
import { useAskStore } from '../store/askStore';
import { consentUnreadableNotice } from '../constants/aiConsentCopy';
import { RETRY_TRANSPORT_NOTICE } from '../lib/foodRetry';

const fetchMock = fetchAiConsent as jest.Mock;
const cameraMock = ImagePicker.launchCameraAsync as jest.Mock;
const libraryMock = ImagePicker.launchImageLibraryAsync as jest.Mock;
const invokeMock = supabase.functions.invoke as jest.Mock;
const askMock = askQuestion as jest.Mock;

const YES: AiConsentRow = { granted: true, copyVersion: 'v', source: 'backstop', decidedAt: '2026-10-13T09:00:00+00:00' };

// The three ways a read cannot answer, each over an empty cache.
type Unreadable = 'error' | 'throws' | 'timeout';
const UNREADABLE: Unreadable[] = ['error', 'throws', 'timeout'];

function readAnswers(how: Unreadable) {
  if (how === 'error') fetchMock.mockResolvedValue({ status: 'error' });
  else if (how === 'throws') fetchMock.mockRejectedValue(new Error('network'));
  else fetchMock.mockReturnValue(new Promise(() => {}));
}

// Lets a pending read settle, and carries a stalled one past the door's timeout.
async function settle(how: Unreadable) {
  await act(async () => {
    if (how === 'timeout') jest.advanceTimersByTime(CONSENT_READ_TIMEOUT_MS + 1);
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
}

let alertSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  clearAiConsent();
  useAuthStore.setState({ user: { id: 'u1' } as never });
  usePetStore.setState({
    pets: [{ id: 'p1', name: 'Mochi' }] as never,
    activePet: { id: 'p1', name: 'Mochi' } as never,
  });
  useAskStore.setState({
    petId: null, messages: [], thinking: false, capped: null, disabled: false,
    lastQuestion: null, lastActivityMs: 0,
  });
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

it("the label door's notice is the one food detail's retry already shows", () => {
  expect(consentUnreadableNotice('label')).toEqual(RETRY_TRANSPORT_NOTICE);
});

describe.each([
  ['Add a food', FoodCaptureScreen],
  ['Add a medication', MedicationCaptureScreen],
])('%s: the label door', (title, Screen) => {
  it.each(UNREADABLE)('an unreadable answer (%s) takes no photo, sends nothing and says try again', async (how) => {
    if (how === 'timeout') jest.useFakeTimers();
    readAnswers(how);
    render(<Screen />);
    fireEvent.press(screen.getByText('Take a photo'));
    await settle(how);
    expect(cameraMock).not.toHaveBeenCalled();
    expect(libraryMock).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith("Couldn't start reading the label", 'Try again in a moment.');
    // The owner stays on the capture step, so the next tap reads again.
    expect(screen.getByText(title)).toBeTruthy();
    expect(screen.getByText('Take a photo')).toBeTruthy();
  });

  it('a cached "no answer" that cannot be re-read is unreadable, never a yes', async () => {
    useAiConsentStore.getState().setRow('u1', null);
    readAnswers('error');
    render(<Screen />);
    fireEvent.press(screen.getByText('Choose from library'));
    await settle('error');
    expect(libraryMock).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledTimes(1);
  });

  it('a yes the phone holds opens the camera (the control: the door does open)', async () => {
    useAiConsentStore.getState().setRow('u1', YES);
    render(<Screen />);
    fireEvent.press(screen.getByText('Take a photo'));
    await settle('error');
    expect(cameraMock).toHaveBeenCalledTimes(1);
    expect(alertSpy).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('Ask: the ask door', () => {
  async function typeAndSend(text: string) {
    fireEvent.changeText(screen.getByPlaceholderText('Ask about Mochi…'), text);
    await act(async () => {
      fireEvent(screen.getByPlaceholderText('Ask about Mochi…'), 'submitEditing');
    });
  }

  it.each(UNREADABLE)('an unreadable answer (%s) sends no question and keeps it in the field', async (how) => {
    if (how === 'timeout') jest.useFakeTimers();
    readAnswers(how);
    render(<AskScreen />);
    await settle(how);
    // The open couldn't read the answer: Ask stays open, with no sheet.
    expect(router.back).not.toHaveBeenCalled();
    expect(screen.queryByText("Ask about Mochi's record")).toBeNull();

    await typeAndSend('Is Mochi eating less?');
    await settle(how);
    expect(askMock).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith("Couldn't send your question", "It's still here. Try again in a moment.");
    expect(screen.getByDisplayValue('Is Mochi eating less?')).toBeTruthy();
    expect(router.back).not.toHaveBeenCalled();
  });

  it('a send after the answer comes back reads it again and goes through', async () => {
    readAnswers('error');
    render(<AskScreen />);
    await settle('error');
    fetchMock.mockResolvedValue({ status: 'ok', row: YES });
    await typeAndSend('Is Mochi eating less?');
    await settle('error');
    expect(askMock).toHaveBeenCalledTimes(1);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('a no given in Settings while Ask stays open stops the next send', async () => {
    useAiConsentStore.getState().setRow('u1', YES);
    render(<AskScreen />);
    await settle('error');
    // Settings saved a no on this phone; the cache now holds it.
    useAiConsentStore.getState().setRow('u1', { ...YES, granted: false });
    await typeAndSend('Is Mochi eating less?');
    await settle('error');
    expect(askMock).not.toHaveBeenCalled();
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('a double tap during the send-time read reads once and never closes Ask', async () => {
    readAnswers('error');
    render(<AskScreen />);
    await settle('error');
    let release: (v: unknown) => void = () => {};
    fetchMock.mockReset();
    fetchMock.mockReturnValue(new Promise((r) => { release = r; }));
    fireEvent.changeText(screen.getByPlaceholderText('Ask about Mochi…'), 'Is Mochi eating less?');
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Send question'));
      fireEvent.press(screen.getByLabelText('Send question'));
    });
    await act(async () => { release({ status: 'ok', row: YES }); });
    await settle('error');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(router.back).not.toHaveBeenCalled();
    expect(askMock).toHaveBeenCalledTimes(1);
  });

  it('leaving Ask during the send-time read sends nothing and closes nothing', async () => {
    readAnswers('error');
    const view = render(<AskScreen />);
    await settle('error');
    let release: (v: unknown) => void = () => {};
    fetchMock.mockReset();
    fetchMock.mockReturnValue(new Promise((r) => { release = r; }));
    await typeAndSend('Is Mochi eating less?');
    view.unmount();
    await act(async () => { release({ status: 'ok', row: { ...YES, granted: false } }); });
    await settle('error');
    expect(askMock).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
  });

  it('a yes the phone holds sends with no second read (the control)', async () => {
    useAiConsentStore.getState().setRow('u1', YES);
    render(<AskScreen />);
    await settle('error');
    await typeAndSend('Is Mochi eating less?');
    await settle('error');
    expect(askMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
