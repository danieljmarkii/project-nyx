// CUL-1834 (mock round 4, frames J, K, L): Settings → AI reading. The switch writes on
// every flip with source 'settings' and no confirm; while no answer is on file, Allow
// and Don't allow stand in for it. The store is stubbed at its seam: the writes'
// own rules are pinned in lib/aiConsent.test.ts.

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useFocusEffect: (cb: () => void | (() => void)) => {
    const { useEffect } = require('react');
    useEffect(() => cb(), [cb]);
  },
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: jest.fn(() => true) }));
jest.mock('../../hooks/useAppActive', () => ({ useAppActive: jest.fn(() => true) }));
jest.mock('../../store/aiConsentStore', () => ({
  loadAiConsent: jest.fn(),
  saveAiConsent: jest.fn(),
}));
jest.mock('../../lib/aiConsent', () => ({
  hasEverGrantedAiConsent: jest.fn(async () => false),
}));
jest.mock('../../hooks/useAppConfig', () => ({
  useAllowlistFlag: jest.fn(() => false),
}));

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AiReadingSettingsScreen from './ai-reading';
import { loadAiConsent, saveAiConsent } from '../../store/aiConsentStore';
import { hasEverGrantedAiConsent } from '../../lib/aiConsent';
import { useAllowlistFlag } from '../../hooks/useAppConfig';
import { useAuthStore } from '../../store/authStore';
import { usePetStore } from '../../store/petStore';

const loadMock = loadAiConsent as jest.Mock;
const saveMock = saveAiConsent as jest.Mock;
const everMock = hasEverGrantedAiConsent as jest.Mock;
const askFlag = useAllowlistFlag as jest.Mock;

const ROW = { copyVersion: '2026-10-12', source: 'settings', decidedAt: new Date(2026, 9, 14, 12).toISOString() };

beforeEach(() => {
  jest.clearAllMocks();
  askFlag.mockReturnValue(false);
  everMock.mockResolvedValue(false);
  useAuthStore.setState({ user: { id: 'u1' } as never });
  usePetStore.setState({ pets: [{ id: 'p1', name: 'Mochi' }] as never });
});

async function renderReady() {
  render(<AiReadingSettingsScreen />);
  await act(async () => { await Promise.resolve(); });
}

describe('AI reading settings', () => {
  it('shows a skeleton while the read is in flight, never an answer', () => {
    loadMock.mockReturnValue(new Promise(() => {}));
    render(<AiReadingSettingsScreen />);
    expect(screen.getByTestId('ai-reading-skeleton', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByText('Not set')).toBeNull();
    expect(screen.queryByTestId('ai-reading-switch')).toBeNull();
  });

  it('a failed read says so and retries, never shows Not set', async () => {
    loadMock.mockResolvedValueOnce({ status: 'error' }).mockResolvedValueOnce({ status: 'ok', row: null });
    await renderReady();
    expect(screen.getByText("Couldn't load your AI reading setting.")).toBeTruthy();
    expect(screen.queryByText('Not set')).toBeNull();
    await act(async () => { fireEvent.press(screen.getByText('Try again')); });
    await waitFor(() => expect(screen.getByText('Not set')).toBeTruthy());
  });

  it('L: unanswered shows Allow and Don\'t allow, not a switch, and each writes from settings', async () => {
    loadMock.mockResolvedValue({ status: 'ok', row: null });
    saveMock.mockResolvedValue({ status: 'saved', row: { ...ROW, granted: true } });
    await renderReady();
    expect(screen.getByText('Not set')).toBeTruthy();
    expect(screen.queryByTestId('ai-reading-switch')).toBeNull();
    await act(async () => { fireEvent.press(screen.getByText('Allow')); });
    expect(saveMock).toHaveBeenCalledWith('u1', true, 'settings');
    expect(screen.getByTestId('ai-reading-switch').props.value).toBe(true);
    expect(screen.getByText('On since 14 Oct 2026.')).toBeTruthy();
  });

  it('J: on shows the switch on and the date; one flip writes a no, with no confirm', async () => {
    loadMock.mockResolvedValue({ status: 'ok', row: { ...ROW, granted: true } });
    saveMock.mockResolvedValue({ status: 'saved', row: { ...ROW, granted: false } });
    await renderReady();
    expect(screen.getByText('On since 14 Oct 2026.')).toBeTruthy();
    await act(async () => { fireEvent(screen.getByTestId('ai-reading-switch'), 'valueChange', false); });
    expect(saveMock).toHaveBeenCalledWith('u1', false, 'settings');
    expect(screen.getByTestId('ai-reading-switch').props.value).toBe(false);
    // The owner just said yes before, so the reads line is true for them.
    expect(screen.getByText(/Reads that already ran stay on their records\./)).toBeTruthy();
  });

  it('K: off for an owner who never said yes does not mention past reads', async () => {
    loadMock.mockResolvedValue({ status: 'ok', row: { ...ROW, granted: false } });
    await renderReady();
    expect(screen.getByText(/^Off\. Nothing is sent\./)).toBeTruthy();
    expect(screen.queryByText(/Reads that already ran/)).toBeNull();
    expect(screen.getByText(/^When AI reading is on, Culprit sends/)).toBeTruthy();
  });

  it('K: off for an owner who said yes before mentions past reads', async () => {
    loadMock.mockResolvedValue({ status: 'ok', row: { ...ROW, granted: false } });
    everMock.mockResolvedValue(true);
    await renderReady();
    expect(screen.getByText(/Reads that already ran stay on their records\./)).toBeTruthy();
  });

  it('a failed flip leaves the switch where the server is, and says so', async () => {
    loadMock.mockResolvedValue({ status: 'ok', row: { ...ROW, granted: true } });
    saveMock.mockResolvedValue({ status: 'error' });
    await renderReady();
    await act(async () => { fireEvent(screen.getByTestId('ai-reading-switch'), 'valueChange', false); });
    expect(screen.getByTestId('ai-reading-switch').props.value).toBe(true);
    expect(screen.getByText("That didn't save. Check your connection and try again.")).toBeTruthy();
  });

  it('names Ask where it is on, and only there', async () => {
    loadMock.mockResolvedValue({ status: 'ok', row: { ...ROW, granted: true } });
    askFlag.mockReturnValue(true);
    await renderReady();
    expect(screen.getByText("Ask about Mochi's record")).toBeTruthy();
    expect(screen.getByText(/Ask sends your question/)).toBeTruthy();
  });

  it("What's sent opens in place and Done returns", async () => {
    loadMock.mockResolvedValue({ status: 'ok', row: null });
    await renderReady();
    fireEvent.press(screen.getByText("What's sent"));
    expect(screen.getByText("What's sent if you allow")).toBeTruthy();
    fireEvent.press(screen.getByText('Done'));
    expect(screen.getByText('Not set')).toBeTruthy();
  });

  it('a focus read that returns after a flip never puts the old answer back', async () => {
    let releaseSecond: (v: unknown) => void = () => {};
    loadMock
      .mockResolvedValueOnce({ status: 'ok', row: { ...ROW, granted: true } })
      .mockReturnValueOnce(new Promise((r) => { releaseSecond = r; }));
    saveMock.mockResolvedValue({ status: 'saved', row: { ...ROW, granted: false } });
    const { rerender } = render(<AiReadingSettingsScreen />);
    await act(async () => { await Promise.resolve(); });
    // A second read starts (the screen regained focus), then the owner flips.
    const { useFocusEffect } = jest.requireMock('expo-router');
    void useFocusEffect;
    await act(async () => { fireEvent.press(screen.getByText("What's sent")); });
    await act(async () => { fireEvent.press(screen.getByText('Done')); });
    rerender(<AiReadingSettingsScreen />);
    await act(async () => { fireEvent(screen.getByTestId('ai-reading-switch'), 'valueChange', false); });
    expect(screen.getByTestId('ai-reading-switch').props.value).toBe(false);
    await act(async () => { releaseSecond({ status: 'ok', row: { ...ROW, granted: true } }); });
    expect(screen.getByTestId('ai-reading-switch').props.value).toBe(false);
  });

  it('a write that throws frees the switch and says so', async () => {
    loadMock.mockResolvedValue({ status: 'ok', row: { ...ROW, granted: true } });
    saveMock.mockRejectedValue(new Error('network'));
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await renderReady();
    await act(async () => { fireEvent(screen.getByTestId('ai-reading-switch'), 'valueChange', false); });
    expect(screen.getByTestId('ai-reading-switch').props.disabled).toBe(false);
    expect(screen.getByText("That didn't save. Check your connection and try again.")).toBeTruthy();
    (console.warn as jest.Mock).mockRestore();
  });
});
