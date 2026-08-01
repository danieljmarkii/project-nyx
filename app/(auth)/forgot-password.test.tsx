import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { recordRecoveryRequest } from '../../lib/recoveryMarker';
import ForgotPasswordScreen from './forgot-password';

// The request screen's wiring (B-280 §5.2/§5.3/§5.6). The pure resend/cooldown logic
// is unit-tested in lib/passwordRecovery.test.ts; here we lock what only the screen
// gets right: pre-fill (FR-2), the marker recorded BEFORE the send (FR-12/FR-14),
// the neutral Sent copy (D2), and a failed request surfacing a designed state, never
// a false Sent (FR-10).

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => false) },
  useLocalSearchParams: jest.fn(() => ({})),
}));
jest.mock('../../lib/supabase', () => ({
  supabase: { auth: { resetPasswordForEmail: jest.fn() } },
}));
jest.mock('../../lib/recoveryMarker', () => ({ recordRecoveryRequest: jest.fn() }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});

const mockReset = supabase.auth.resetPasswordForEmail as jest.Mock;
const mockRecord = recordRecoveryRequest as jest.Mock;
const mockParams = useLocalSearchParams as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockParams.mockReturnValue({ email: 'jordan@email.com' });
  mockRecord.mockResolvedValue(undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => (console.warn as jest.Mock).mockRestore?.());

describe('ForgotPasswordScreen — request', () => {
  it('pre-fills the address the owner typed on login (FR-2)', () => {
    const utils = render(<ForgotPasswordScreen />);
    expect(utils.getByTestId('forgot-email').props.value).toBe('jordan@email.com');
  });

  it('records the marker BEFORE sending, and sends with the recovery redirect', async () => {
    mockReset.mockResolvedValue({ error: null });
    const utils = render(<ForgotPasswordScreen />);
    fireEvent.press(utils.getByTestId('forgot-submit'));

    await waitFor(() => expect(mockReset).toHaveBeenCalled());
    // FR-12/FR-14: the local request must be recorded before the email is on its way.
    expect(mockRecord).toHaveBeenCalledWith('jordan@email.com', expect.any(Number));
    const recordOrder = mockRecord.mock.invocationCallOrder[0];
    const sendOrder = mockReset.mock.invocationCallOrder[0];
    expect(recordOrder).toBeLessThan(sendOrder);
    expect(mockReset).toHaveBeenCalledWith('jordan@email.com', {
      redirectTo: 'nyx:///reset-password',
    });
  });

  it('blocks a malformed email with an inline error and no network call', () => {
    mockParams.mockReturnValue({ email: 'nope' });
    const utils = render(<ForgotPasswordScreen />);
    fireEvent.press(utils.getByTestId('forgot-submit'));
    expect(mockReset).not.toHaveBeenCalled();
    expect(utils.getByText("That doesn't look like an email address")).toBeTruthy();
  });
});

describe('ForgotPasswordScreen — Sent state (D2 neutral)', () => {
  it('shows the enumeration-neutral copy and a cooled-from-first-paint resend (D7)', async () => {
    mockReset.mockResolvedValue({ error: null });
    const utils = render(<ForgotPasswordScreen />);
    fireEvent.press(utils.getByTestId('forgot-submit'));

    // The copy never asserts an account exists — byte-identical for every address.
    await waitFor(() =>
      expect(utils.getByText(/If jordan@email\.com has an account/)).toBeTruthy());
    expect(utils.getByText(/check your spam folder/)).toBeTruthy();
    // The cooldown clock starts at the INITIAL send, so the resend is already cooling.
    expect(utils.getByText('Resend in 60s')).toBeTruthy();
    expect(utils.getByTestId('forgot-resend').props.accessibilityState.disabled).toBe(true);
  });

  it('returns to the request screen to fix a typo (rescues D2 neutrality)', async () => {
    mockReset.mockResolvedValue({ error: null });
    const utils = render(<ForgotPasswordScreen />);
    fireEvent.press(utils.getByTestId('forgot-submit'));
    await waitFor(() => expect(utils.getByTestId('forgot-edit-email')).toBeTruthy());
    fireEvent.press(utils.getByTestId('forgot-edit-email'));
    // Back on the form, value intact so the owner can correct it.
    expect(utils.getByTestId('forgot-email').props.value).toBe('jordan@email.com');
  });
});

describe('ForgotPasswordScreen — request failed (FR-10, §5.6)', () => {
  it('shows the OFFLINE copy, never a false Sent state', async () => {
    mockReset.mockResolvedValue({ error: { message: 'Network request failed' } });
    const utils = render(<ForgotPasswordScreen />);
    fireEvent.press(utils.getByTestId('forgot-submit'));
    await waitFor(() => expect(utils.getByTestId('forgot-retry')).toBeTruthy());
    expect(utils.getByText(/You're offline/)).toBeTruthy();
    // Never routed the owner to a Sent state that lies.
    expect(utils.queryByText(/has an account/)).toBeNull();
  });

  it('blames our end (not the owner\'s wifi) for a non-network failure', async () => {
    mockReset.mockResolvedValue({ error: { message: 'For security purposes, you can only request this after 40 seconds' } });
    const utils = render(<ForgotPasswordScreen />);
    fireEvent.press(utils.getByTestId('forgot-submit'));
    await waitFor(() => expect(utils.getByText(/Something went wrong on our end/)).toBeTruthy());
  });
});
