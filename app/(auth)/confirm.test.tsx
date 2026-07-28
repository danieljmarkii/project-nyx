import { render, fireEvent, waitFor } from '@testing-library/react-native';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { updateOwnerName } from '../../lib/profile';
import ConfirmScreen from './confirm';

// The screen's WIRING (B-432 / B-483). The decisions themselves are pure and tested
// in lib/emailConfirm.test.ts; what's locked here is what only the screen can get
// wrong: exchanging exactly once, reading the session before deciding, writing the
// owner name at the one moment a session exists to write it with, and never leaving
// the owner on a state without a forward action.

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
}));
jest.mock('expo-linking', () => ({ useLinkingURL: jest.fn(() => null) }));
jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      exchangeCodeForSession: jest.fn(),
      signOut: jest.fn(),
    },
  },
}));
jest.mock('../../lib/profile', () => ({ updateOwnerName: jest.fn() }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});

const mockUseLinkingURL = Linking.useLinkingURL as jest.Mock;
const mockUseParams = useLocalSearchParams as unknown as jest.Mock;
const mockGetSession = supabase.auth.getSession as jest.Mock;
const mockExchange = supabase.auth.exchangeCodeForSession as jest.Mock;
const mockSignOut = supabase.auth.signOut as jest.Mock;
const mockReplace = router.replace as jest.Mock;
const mockUpdateOwnerName = updateOwnerName as jest.Mock;

const USER = { id: 'user-1', user_metadata: { first_name: 'Jordan', last_name: 'Rivera' } };

function noSession() {
  // getSession's genuinely-signed-out shape: null session, NO error.
  mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseLinkingURL.mockReturnValue(null);
  mockUseParams.mockReturnValue({});
  mockUpdateOwnerName.mockResolvedValue({ status: 'written' });
  mockSignOut.mockResolvedValue({ error: null });
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  (console.warn as jest.Mock).mockRestore?.();
});

describe('ConfirmScreen — the ordinary path', () => {
  it('exchanges the code and lands the owner in the app', async () => {
    noSession();
    mockUseLinkingURL.mockReturnValue('nyx:///confirm?code=abc');
    mockExchange.mockResolvedValue({ data: { session: { user: USER }, user: USER }, error: null });

    render(<ConfirmScreen />);

    await waitFor(() => expect(mockExchange).toHaveBeenCalledWith('abc'));
    // Into the app, not straight to onboarding: usePet owns the onboarding gate, so
    // routing to the disclaimer from here would re-onboard a returning owner.
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(tabs)'));
  });

  it('writes the owner name signup parked in metadata — the confirmation-ON gap', async () => {
    // With confirmation ON, signup's own name write never runs (no session ⇒ RLS
    // rejects it). Without this, turning confirmation on silently reintroduces
    // "Owner: not recorded" on every vet report.
    noSession();
    mockUseLinkingURL.mockReturnValue('nyx:///confirm?code=abc');
    mockExchange.mockResolvedValue({ data: { session: { user: USER }, user: USER }, error: null });

    render(<ConfirmScreen />);

    await waitFor(() =>
      expect(mockUpdateOwnerName).toHaveBeenCalledWith('user-1', 'Jordan', 'Rivera'),
    );
  });

  it('still signs the owner in when the name write fails', async () => {
    noSession();
    mockUseLinkingURL.mockReturnValue('nyx:///confirm?code=abc');
    mockExchange.mockResolvedValue({ data: { session: { user: USER }, user: USER }, error: null });
    mockUpdateOwnerName.mockResolvedValue({ status: 'error' });

    render(<ConfirmScreen />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(tabs)'));
  });

  it('exchanges once even as params re-render, so a single-use code is never spent twice', async () => {
    noSession();
    mockUseLinkingURL.mockReturnValue('nyx:///confirm?code=abc');
    mockExchange.mockResolvedValue({ data: { session: { user: USER }, user: USER }, error: null });

    const utils = render(<ConfirmScreen />);
    await waitFor(() => expect(mockExchange).toHaveBeenCalledTimes(1));
    utils.rerender(<ConfirmScreen />);
    utils.rerender(<ConfirmScreen />);

    expect(mockExchange).toHaveBeenCalledTimes(1);
  });

  it('reads the code from route params when no launch URL is available', async () => {
    noSession();
    mockUseLinkingURL.mockReturnValue(null);
    mockUseParams.mockReturnValue({ code: 'from-params' });
    mockExchange.mockResolvedValue({ data: { session: { user: USER }, user: USER }, error: null });

    render(<ConfirmScreen />);

    await waitFor(() => expect(mockExchange).toHaveBeenCalledWith('from-params'));
  });
});

describe('ConfirmScreen — a session is already live', () => {
  it('does NOT exchange, and says so honestly', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: USER } }, error: null });
    mockUseLinkingURL.mockReturnValue('nyx:///confirm?code=abc');

    const utils = render(<ConfirmScreen />);

    await waitFor(() => expect(utils.getByTestId('confirm-already_signed_in')).toBeTruthy());
    // The load-bearing assertion: no session swap onto a device still holding the
    // other account's local record and widget snapshots.
    expect(mockExchange).not.toHaveBeenCalled();
    expect(utils.getByText("You're already signed in")).toBeTruthy();
  });

  it('treats a transient refresh failure as signed in, not as signed out', async () => {
    // null session WITH an error: a stored session that failed to refresh. The
    // device still holds that account's data, so exchanging here would be the same
    // swap by another route.
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: { message: 'network request failed' },
    });
    mockUseLinkingURL.mockReturnValue('nyx:///confirm?code=abc');

    const utils = render(<ConfirmScreen />);

    await waitFor(() => expect(utils.getByTestId('confirm-already_signed_in')).toBeTruthy());
    expect(mockExchange).not.toHaveBeenCalled();
  });

  it('offers sign-out as the way through for a different account', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: USER } }, error: null });
    mockUseLinkingURL.mockReturnValue('nyx:///confirm?code=abc');

    const utils = render(<ConfirmScreen />);
    await waitFor(() => expect(utils.getByTestId('confirm-sign-out')).toBeTruthy());
    fireEvent.press(utils.getByTestId('confirm-sign-out'));

    // The root layout's SIGNED_OUT handler owns the teardown AND the routing — one
    // source of truth for the wipe — so this screen must not route itself.
    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('carries a forward action into the app', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: USER } }, error: null });
    mockUseLinkingURL.mockReturnValue('nyx:///confirm?code=abc');

    const utils = render(<ConfirmScreen />);
    await waitFor(() => expect(utils.getByTestId('confirm-action')).toBeTruthy());
    fireEvent.press(utils.getByTestId('confirm-action'));

    expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
  });
});

describe('ConfirmScreen — the failure states', () => {
  it('tells the owner they ARE confirmed when the exchange fails here', async () => {
    // GoTrue verified the token server-side before redirecting, so the address is
    // confirmed whatever happened on this device — including the wrong-device case,
    // where no local PKCE verifier exists. "Something went wrong" would be false.
    noSession();
    mockUseLinkingURL.mockReturnValue('nyx:///confirm?code=abc');
    mockExchange.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: 'both auth code and code verifier should be non-empty' },
    });

    const utils = render(<ConfirmScreen />);

    await waitFor(() => expect(utils.getByTestId('confirm-confirmed_needs_signin')).toBeTruthy());
    expect(utils.getByText('Your email is confirmed')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();

    fireEvent.press(utils.getByTestId('confirm-action'));
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/login');
  });

  it('renders the dead-link state for an expired link, without exchanging', async () => {
    noSession();
    mockUseLinkingURL.mockReturnValue('nyx:///confirm?error=access_denied&error_code=otp_expired');

    const utils = render(<ConfirmScreen />);

    await waitFor(() => expect(utils.getByTestId('confirm-link_dead')).toBeTruthy());
    expect(mockExchange).not.toHaveBeenCalled();
    expect(utils.getByText('That link no longer works')).toBeTruthy();
  });

  it('reads an error out of the URL fragment, which route params never carry', async () => {
    noSession();
    mockUseLinkingURL.mockReturnValue('nyx:///confirm#error_code=otp_expired');

    const utils = render(<ConfirmScreen />);

    await waitFor(() => expect(utils.getByTestId('confirm-link_dead')).toBeTruthy());
  });

  it('does not spin forever when the screen is reached with nothing to act on', async () => {
    noSession();
    mockUseLinkingURL.mockReturnValue(null);
    mockUseParams.mockReturnValue({});

    const utils = render(<ConfirmScreen />);

    await waitFor(() => expect(utils.getByTestId('confirm-link_dead')).toBeTruthy());
  });

  it('keeps waiting when the launch URL belongs to something else', async () => {
    // Cold-started from a widget deep link, with the confirmation arriving warm a
    // moment later. Rendering a failure here would be a verdict on a link we have
    // not seen yet.
    noSession();
    mockUseLinkingURL.mockReturnValue('nyx:///history?pet=abc');

    const utils = render(<ConfirmScreen />);

    await waitFor(() => expect(utils.getByTestId('confirm-working')).toBeTruthy());
    expect(mockExchange).not.toHaveBeenCalled();
  });
});
