import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import LoginScreen from './login';

// Locks the login screen's load-bearing wiring after its rebuild onto the B-251
// design system: the submit validation gate, the trimmed sign-in + tabs route,
// the calm server-error alert, and the B-039 post-deletion confirmation banner.
// Pure validation copy lives in lib/authValidation (unit-tested there); here we
// pin how this SCREEN wires it.

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), back: jest.fn(), push: jest.fn(), canGoBack: jest.fn(() => true) },
}));
jest.mock('../../lib/supabase', () => ({
  supabase: { auth: { signInWithPassword: jest.fn() } },
}));
// SafeAreaView needs a provider in a real tree; pass it through headless.
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});

const mockSignIn = supabase.auth.signInWithPassword as jest.Mock;
const mockReplace = router.replace as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  // Reset the one-shot deletion flag so it can't bleed between tests.
  useAuthStore.setState({ justDeletedAccount: false });
});

describe('LoginScreen — validation gate', () => {
  it('blocks the network call and shows calm inline errors on an empty submit', () => {
    const utils = render(<LoginScreen />);
    fireEvent.press(utils.getByTestId('login-submit'));

    expect(mockSignIn).not.toHaveBeenCalled();
    expect(utils.getByText('Enter your email address')).toBeTruthy();
    expect(utils.getByText('Enter your password')).toBeTruthy();
  });

  it('blocks a malformed email', () => {
    const utils = render(<LoginScreen />);
    fireEvent.changeText(utils.getByTestId('login-email'), 'nope');
    fireEvent.changeText(utils.getByTestId('login-password'), 'secret123');
    fireEvent.press(utils.getByTestId('login-submit'));

    expect(mockSignIn).not.toHaveBeenCalled();
    expect(utils.getByText("That doesn't look like an email address")).toBeTruthy();
  });
});

describe('LoginScreen — sign in', () => {
  it('signs in with the trimmed email and routes to the tabs on success', async () => {
    mockSignIn.mockResolvedValue({ error: null });
    const utils = render(<LoginScreen />);
    fireEvent.changeText(utils.getByTestId('login-email'), '  jordan@email.com  ');
    fireEvent.changeText(utils.getByTestId('login-password'), 'secret123');
    fireEvent.press(utils.getByTestId('login-submit'));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(tabs)'));
    expect(mockSignIn).toHaveBeenCalledWith({ email: 'jordan@email.com', password: 'secret123' });
  });

  it('shows a calm alert and does not route when sign-in fails', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockSignIn.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
    const utils = render(<LoginScreen />);
    fireEvent.changeText(utils.getByTestId('login-email'), 'jordan@email.com');
    fireEvent.changeText(utils.getByTestId('login-password'), 'wrongpass');
    fireEvent.press(utils.getByTestId('login-submit'));

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith("Couldn't sign you in", 'Invalid login credentials'),
    );
    expect(mockReplace).not.toHaveBeenCalledWith('/(tabs)');
    alertSpy.mockRestore();
  });
});

describe('LoginScreen — post-deletion banner (B-039)', () => {
  it('shows the deletion confirmation when the one-shot flag is armed', () => {
    useAuthStore.setState({ justDeletedAccount: true });
    const utils = render(<LoginScreen />);
    expect(
      utils.getByText('Your account and everything in it has been deleted.'),
    ).toBeTruthy();
    // The flag is a one-shot: reading it on mount clears it so a later remount
    // (an ordinary sign-out) won't resurface the banner.
    expect(useAuthStore.getState().justDeletedAccount).toBe(false);
  });

  it('hides the banner on an ordinary login (flag clear)', () => {
    const utils = render(<LoginScreen />);
    expect(
      utils.queryByText('Your account and everything in it has been deleted.'),
    ).toBeNull();
  });
});
