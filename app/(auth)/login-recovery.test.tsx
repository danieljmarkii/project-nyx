import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import LoginScreen from './login';

// The login screen's recovery wiring with PASSWORD_RECOVERY_ENABLED forced ON — the
// state PR 4 flips into. Locks FR-1 (the entry link), §5.1b/FR-13 (the failure alert
// carries a Reset password action, never a raw string), and FR-20 §5.6b (the evicted
// co-resident's banner). The flag-OFF invisibility is covered in login.test.tsx.

jest.mock('../../constants/flags', () => ({
  PASSWORD_RECOVERY_ENABLED: true,
  SOCIAL_AUTH_ENABLED: false,
}));
jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), back: jest.fn(), push: jest.fn(), canGoBack: jest.fn(() => true) },
}));
jest.mock('../../lib/supabase', () => ({
  supabase: { auth: { signInWithPassword: jest.fn(), resend: jest.fn() } },
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});

const mockSignIn = supabase.auth.signInWithPassword as jest.Mock;
const mockPush = router.push as jest.Mock;

type AlertButtonCall = { text: string; onPress?: () => void | Promise<void> };
function alertButtons(spy: jest.SpyInstance): AlertButtonCall[] {
  const call = spy.mock.calls[0] as unknown as [string, string, AlertButtonCall[]];
  return call[2];
}

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({
    justDeletedAccount: false,
    signedOutInvoluntarily: false,
    deliberateSignOut: false,
  });
});

describe('LoginScreen — FR-1 the recovery entry link', () => {
  it('renders the Forgot password link and carries the typed email into the request screen (FR-2)', () => {
    const utils = render(<LoginScreen />);
    fireEvent.changeText(utils.getByTestId('login-email'), '  jordan@email.com  ');
    fireEvent.press(utils.getByTestId('login-forgot'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(auth)/forgot-password',
      params: { email: 'jordan@email.com' },
    });
  });
});

describe('LoginScreen — §5.1b the failure alert carries recovery (FR-13)', () => {
  it('offers Reset password inside the invalid-credentials alert, no raw server string', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockSignIn.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
    const utils = render(<LoginScreen />);
    fireEvent.changeText(utils.getByTestId('login-email'), 'jordan@email.com');
    fireEvent.changeText(utils.getByTestId('login-password'), 'wrongpass');
    fireEvent.press(utils.getByTestId('login-submit'));

    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    const [title, message] = alertSpy.mock.calls[0] as unknown as [string, string];
    expect(title).toBe("Couldn't sign you in");
    expect(message).toBe("We couldn't sign you in with that email and password.");
    expect(message).not.toContain('Invalid login credentials');

    const buttons = alertButtons(alertSpy);
    expect(buttons.map((b) => b.text)).toEqual(['Reset password', 'Try again']);
    // Tapping Reset password lands on the request screen, pre-filled.
    await buttons[0].onPress?.();
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(auth)/forgot-password',
      params: { email: 'jordan@email.com' },
    });
    alertSpy.mockRestore();
  });
});

describe('LoginScreen — FR-20 §5.6b evicted-device banner', () => {
  it('shows the "You were signed out" banner and consumes the one-shot', () => {
    useAuthStore.setState({ signedOutInvoluntarily: true });
    const utils = render(<LoginScreen />);
    expect(utils.getByTestId('login-evicted-banner')).toBeTruthy();
    expect(utils.getByText('You were signed out')).toBeTruthy();
    // The body names the likely cause without asserting it (§7.2.3).
    expect(utils.getByText(/usually happens when the account password is changed/)).toBeTruthy();
    // One-shot: cleared on mount so a later remount won't resurface it.
    expect(useAuthStore.getState().signedOutInvoluntarily).toBe(false);
  });

  it('a deletion banner wins over the eviction banner (a deletion is not an eviction)', () => {
    useAuthStore.setState({ justDeletedAccount: true, signedOutInvoluntarily: true });
    const utils = render(<LoginScreen />);
    expect(utils.queryByTestId('login-evicted-banner')).toBeNull();
    expect(utils.getByText('Your account and everything in it has been deleted.')).toBeTruthy();
  });
});
