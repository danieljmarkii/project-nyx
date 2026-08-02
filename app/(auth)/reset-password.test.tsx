import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { usePetStore } from '../../store/petStore';
import ResetPasswordScreen from './reset-password';

// The set-password screen renders PURELY from store state the §6.4 handler drives, so
// these tests set that state directly and lock: the terminal states (§5.5/§5.5b), the
// success path (updateUser → evict others FR-18 → release gate → into the app, never
// a login form), and the FR-16 escape.

jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));
jest.mock('expo-linking', () => ({ useLinkingURL: jest.fn(() => null) }));
jest.mock('../../lib/supabase', () => ({
  supabase: { auth: { updateUser: jest.fn(), signOut: jest.fn() } },
}));
jest.mock('../../lib/recoveryDeepLink', () => ({ retryRecoveryExchange: jest.fn() }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});

const mockUpdateUser = supabase.auth.updateUser as jest.Mock;
const mockSignOut = supabase.auth.signOut as jest.Mock;
const mockReplace = router.replace as jest.Mock;
const B_SESSION = { user: { id: 'user-b' } } as never;

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  (Linking.useLinkingURL as jest.Mock).mockReturnValue(null);
  mockUpdateUser.mockResolvedValue({ error: null });
  mockSignOut.mockResolvedValue({ error: null });
  useAuthStore.setState({
    session: null,
    recoveryInProgress: false,
    recoveryScreen: null,
    recoveryEmail: null,
  });
  usePetStore.setState({ pets: [{ id: 'p1', name: 'Luna' }] as never });
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => (console.warn as jest.Mock).mockRestore?.());

describe('ResetPasswordScreen — terminal states', () => {
  it('renders §5.5b wrong-device and sends a fresh link from this device', () => {
    useAuthStore.setState({ recoveryScreen: 'wrong_device' });
    const utils = render(<ResetPasswordScreen />);
    expect(utils.getByText('Open this link on the phone you asked from')).toBeTruthy();
    fireEvent.press(utils.getByTestId('reset-wrong-device-primary'));
    // No recoveryEmail (a wrong device never asked) → a blank request screen.
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/(auth)/forgot-password', params: {} });
  });

  it('renders §5.5 link-no-longer-works and pre-fills the new-link request (FR-12)', () => {
    useAuthStore.setState({ recoveryScreen: 'link_unusable', recoveryEmail: 'jordan@email.com' });
    const utils = render(<ResetPasswordScreen />);
    expect(utils.getByText('That link no longer works')).toBeTruthy();
    fireEvent.press(utils.getByTestId('reset-link-unusable-primary'));
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(auth)/forgot-password',
      params: { email: 'jordan@email.com' },
    });
  });

  it('shows the working spinner when the exchange is in flight (gate armed, no session)', () => {
    useAuthStore.setState({ recoveryInProgress: true, session: null, recoveryScreen: null });
    const utils = render(<ResetPasswordScreen />);
    expect(utils.getByTestId('reset-working')).toBeTruthy();
  });

  it('never dead-ends on the working spinner: falls to failed if the exchange stalls', () => {
    jest.useFakeTimers();
    try {
      useAuthStore.setState({ recoveryInProgress: true, session: null, recoveryScreen: null });
      const utils = render(<ResetPasswordScreen />);
      expect(utils.getByTestId('reset-working')).toBeTruthy();
      // A stalled exchange never resolves; the watchdog gives the one exit-less state
      // an exit (§5.6 failed → Try again / Back to log in).
      act(() => {
        jest.advanceTimersByTime(20_000);
      });
      expect(useAuthStore.getState().recoveryScreen).toBe('failed');
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('ResetPasswordScreen — the set-password form (§5.4)', () => {
  beforeEach(() => {
    useAuthStore.setState({ recoveryInProgress: true, session: B_SESSION, recoveryScreen: null });
  });

  it('names the pet from the local mirror', () => {
    const utils = render(<ResetPasswordScreen />);
    expect(utils.getByText(/take you back to Luna/)).toBeTruthy();
  });

  it('blocks a weak password with the same rule as signup (FR-8)', () => {
    const utils = render(<ResetPasswordScreen />);
    fireEvent.changeText(utils.getByTestId('reset-password-input'), 'short');
    fireEvent.press(utils.getByTestId('reset-save'));
    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(utils.getByText('Use at least 8 characters')).toBeTruthy();
  });

  it('writes the password, evicts other sessions (FR-18), releases the gate, and lands in the app', async () => {
    const utils = render(<ResetPasswordScreen />);
    fireEvent.changeText(utils.getByTestId('reset-password-input'), 'a-strong-password');
    fireEvent.press(utils.getByTestId('reset-save'));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(tabs)'));
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'a-strong-password' });
    // FR-18: evict AFTER the successful write, scoped to OTHERS (this device stays in).
    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'others' });
    expect(mockUpdateUser.mock.invocationCallOrder[0]).toBeLessThan(
      mockSignOut.mock.invocationCallOrder[0],
    );
    // Gate released; never routed back to a login form (Jordan's rule).
    expect(useAuthStore.getState().recoveryInProgress).toBe(false);
    expect(mockReplace).not.toHaveBeenCalledWith('/(auth)/login');
  });

  it('does NOT evict when the write fails (FR-18 ordering) and keeps the owner on the form', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockUpdateUser.mockResolvedValue({ error: { code: 'weak_password', message: 'weak' } });
    const utils = render(<ResetPasswordScreen />);
    fireEvent.changeText(utils.getByTestId('reset-password-input'), 'a-strong-password');
    fireEvent.press(utils.getByTestId('reset-save'));

    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalledWith('/(tabs)');
    // Never the raw provider string.
    const [, message] = alertSpy.mock.calls[0] as unknown as [string, string];
    expect(message).not.toBe('weak');
    alertSpy.mockRestore();
  });

  it('escapes cleanly (FR-16): local sign-out, gate released, to the Landing', async () => {
    const utils = render(<ResetPasswordScreen />);
    fireEvent.press(utils.getByTestId('reset-escape'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(auth)'));
    // scope: 'local' drops only this device's copy — never B's real sessions.
    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(useAuthStore.getState().recoveryInProgress).toBe(false);
  });
});
