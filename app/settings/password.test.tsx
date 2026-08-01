import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useSnackbarStore } from '../../store/snackbarStore';
import ChangePasswordScreen from './password';

// Pins the change-password screen's load-bearing wiring (B-280 PR 3, §5.7):
//   • the submit validation gate (no network on bad input),
//   • the current-password RE-CHECK via signInWithPassword — a mismatch renders
//     inline, never as "wrong email", and never reaches updateUser,
//   • the write via updateUser, then the Snackbar confirmation + back, and
//   • the FR-18/FR-19 ordering: evict other sessions ONLY after a successful
//     write, and ONLY when the box is ticked.

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), back: jest.fn(), push: jest.fn(), canGoBack: jest.fn(() => true) },
}));
jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: jest.fn(),
      updateUser: jest.fn(),
      signOut: jest.fn(),
    },
  },
}));
// SafeAreaView needs a provider in a real tree; pass it through headless.
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});

const mockSignIn = supabase.auth.signInWithPassword as jest.Mock;
const mockUpdate = supabase.auth.updateUser as jest.Mock;
const mockSignOut = supabase.auth.signOut as jest.Mock;
const mockBack = router.back as jest.Mock;

const CURRENT = 'oldsecret123';
const NEXT = 'newsecret456';

function fillValidForm(utils: ReturnType<typeof render>) {
  fireEvent.changeText(utils.getByTestId('change-current-password'), CURRENT);
  fireEvent.changeText(utils.getByTestId('change-new-password'), NEXT);
}

beforeEach(() => {
  jest.clearAllMocks();
  // An authenticated session always carries an email; the re-check addresses it.
  useAuthStore.setState({ user: { email: 'jordan@email.com' } as never });
  useSnackbarStore.setState({ visible: false, payload: null });
});

describe('ChangePasswordScreen — validation gate', () => {
  it('blocks the network call and shows calm inline errors on an empty submit', () => {
    const utils = render(<ChangePasswordScreen />);
    fireEvent.press(utils.getByTestId('change-save'));

    expect(mockSignIn).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(utils.getByText('Enter your current password')).toBeTruthy();
    expect(utils.getByText('Choose a password')).toBeTruthy();
  });

  it('blocks a too-short new password with the shared signup rule', () => {
    const utils = render(<ChangePasswordScreen />);
    fireEvent.changeText(utils.getByTestId('change-current-password'), CURRENT);
    fireEvent.changeText(utils.getByTestId('change-new-password'), 'short');
    fireEvent.press(utils.getByTestId('change-save'));

    expect(mockSignIn).not.toHaveBeenCalled();
    expect(utils.getByText('Use at least 8 characters')).toBeTruthy();
  });

  it('blocks a new password identical to the current one (a no-op change)', () => {
    const utils = render(<ChangePasswordScreen />);
    fireEvent.changeText(utils.getByTestId('change-current-password'), CURRENT);
    fireEvent.changeText(utils.getByTestId('change-new-password'), CURRENT);
    fireEvent.press(utils.getByTestId('change-save'));

    expect(mockSignIn).not.toHaveBeenCalled();
    expect(utils.getByText(/different from your current one/i)).toBeTruthy();
  });
});

describe('ChangePasswordScreen — current-password re-check', () => {
  it('re-authenticates with the account email + current password before writing', async () => {
    mockSignIn.mockResolvedValue({ error: null });
    mockUpdate.mockResolvedValue({ error: null });
    const utils = render(<ChangePasswordScreen />);
    fillValidForm(utils);
    fireEvent.press(utils.getByTestId('change-save'));

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith({ password: NEXT }));
    expect(mockSignIn).toHaveBeenCalledWith({ email: 'jordan@email.com', password: CURRENT });
  });

  it('renders a wrong current password inline and never reaches updateUser', async () => {
    // A mismatch comes back as invalid_credentials from the re-check sign-in.
    mockSignIn.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
    const utils = render(<ChangePasswordScreen />);
    fillValidForm(utils);
    fireEvent.press(utils.getByTestId('change-save'));

    await waitFor(() =>
      expect(utils.getByText(/that doesn.t match your current password/i)).toBeTruthy(),
    );
    expect(mockUpdate).not.toHaveBeenCalled();
    // Enumeration posture: the inline copy names the current password, not the email.
    expect(utils.queryByText(/email/i)).toBeNull();
  });

  it('maps an offline re-check to calm copy, never a raw provider string', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockSignIn.mockResolvedValue({ error: { message: 'Network request failed' } });
    const utils = render(<ChangePasswordScreen />);
    fillValidForm(utils);
    fireEvent.press(utils.getByTestId('change-save'));

    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    const [title, message] = alertSpy.mock.calls[0];
    expect(title).toBe("Couldn't reach Culprit");
    expect(message).not.toContain('Network request failed');
    expect(mockUpdate).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});

describe('ChangePasswordScreen — success', () => {
  it('confirms with a Snackbar and pops back, without touching other sessions', async () => {
    // Stub the impl so the assertion holds without scheduling the store's real
    // reveal/hide timers (which would leak past the test).
    const showSpy = jest.spyOn(useSnackbarStore.getState(), 'show').mockImplementation(() => {});
    mockSignIn.mockResolvedValue({ error: null });
    mockUpdate.mockResolvedValue({ error: null });
    const utils = render(<ChangePasswordScreen />);
    fillValidForm(utils);
    fireEvent.press(utils.getByTestId('change-save'));

    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(showSpy).toHaveBeenCalledWith(
      { message: 'Password updated.' },
      expect.objectContaining({ delayMs: expect.any(Number) }),
    );
    // Box off (default) — the household is untouched.
    expect(mockSignOut).not.toHaveBeenCalled();
    showSpy.mockRestore();
  });
});

describe('ChangePasswordScreen — sign out other devices (FR-18 / FR-19)', () => {
  it('evicts other sessions after a successful write when the box is ticked', async () => {
    mockSignIn.mockResolvedValue({ error: null });
    mockUpdate.mockResolvedValue({ error: null });
    mockSignOut.mockResolvedValue({ error: null });
    const utils = render(<ChangePasswordScreen />);
    fireEvent.press(utils.getByTestId('change-signout-others'));
    fillValidForm(utils);
    fireEvent.press(utils.getByTestId('change-save'));

    await waitFor(() => expect(mockSignOut).toHaveBeenCalledWith({ scope: 'others' }));
    // Ordering: the write lands before the eviction — never sign the household out
    // for a change that then fails.
    expect(mockUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      mockSignOut.mock.invocationCallOrder[0],
    );
  });

  it('does NOT evict when the write fails, even with the box ticked', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockSignIn.mockResolvedValue({ error: null });
    mockUpdate.mockResolvedValue({ error: { message: 'boom' } });
    const utils = render(<ChangePasswordScreen />);
    fireEvent.press(utils.getByTestId('change-signout-others'));
    fillValidForm(utils);
    fireEvent.press(utils.getByTestId('change-save'));

    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});
