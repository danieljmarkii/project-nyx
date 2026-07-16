import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { updateOwnerName } from '../../lib/profile';
import { PRIVACY_POLICY_URL, TERMS_URL } from '../../constants/links';
import SignupScreen from './signup';

// Covers the load-bearing auth path (B-251 PR 6 AC): validation gate, the
// session-present name write + onboarding route, the soft-verify branch, and the
// already-registered redirect. Pure validation copy lives in lib/authValidation
// (unit-tested there); the name derive/write lives in lib/profile (tested there) —
// here we lock the SCREEN's wiring of those pieces.

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), back: jest.fn(), push: jest.fn() },
}));
jest.mock('../../lib/supabase', () => ({
  supabase: { auth: { signUp: jest.fn(), resend: jest.fn() } },
}));
jest.mock('../../lib/profile', () => ({ updateOwnerName: jest.fn() }));
// SafeAreaView needs a provider in a real tree; pass it through headless.
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});

const mockSignUp = supabase.auth.signUp as jest.Mock;
const mockReplace = router.replace as jest.Mock;
const mockUpdateOwnerName = updateOwnerName as jest.Mock;

function fillValidForm(utils: ReturnType<typeof render>, emailValue = 'jordan@email.com') {
  fireEvent.changeText(utils.getByTestId('signup-first-name'), 'Jordan');
  fireEvent.changeText(utils.getByTestId('signup-last-name'), 'Rivera');
  fireEvent.changeText(utils.getByTestId('signup-email'), emailValue);
  fireEvent.changeText(utils.getByTestId('signup-password'), 'password123');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdateOwnerName.mockResolvedValue({ status: 'written' });
});

describe('SignupScreen — brand mark', () => {
  it('carries the Culprit brand mark so the account form matches the branded flow', () => {
    const utils = render(<SignupScreen />);
    // The shared AuthBrandMark exposes one grouped "Culprit" label.
    expect(utils.getByLabelText('Culprit')).toBeTruthy();
  });
});

describe('SignupScreen — legal links (B-229/B-230)', () => {
  it('opens the hosted Terms and Privacy Policy from the acceptance line — no more stubs', async () => {
    const openSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const utils = render(<SignupScreen />);

    fireEvent.press(utils.getByText('Terms'));
    await waitFor(() => expect(openSpy).toHaveBeenCalledWith(TERMS_URL));

    fireEvent.press(utils.getByText('Privacy Policy'));
    await waitFor(() => expect(openSpy).toHaveBeenCalledWith(PRIVACY_POLICY_URL));
    openSpy.mockRestore();
  });
});

describe('SignupScreen — validation gate', () => {
  it('blocks the network call and shows calm inline errors on an empty submit', () => {
    const utils = render(<SignupScreen />);
    fireEvent.press(utils.getByTestId('signup-submit'));

    expect(mockSignUp).not.toHaveBeenCalled();
    expect(utils.getByText('Add your first name')).toBeTruthy();
    expect(utils.getByText('Enter your email address')).toBeTruthy();
    expect(utils.getByText('Choose a password')).toBeTruthy();
  });

  it('blocks a malformed email / too-short password', () => {
    const utils = render(<SignupScreen />);
    fireEvent.changeText(utils.getByTestId('signup-first-name'), 'Jordan');
    fireEvent.changeText(utils.getByTestId('signup-last-name'), 'Rivera');
    fireEvent.changeText(utils.getByTestId('signup-email'), 'nope');
    fireEvent.changeText(utils.getByTestId('signup-password'), 'short');
    fireEvent.press(utils.getByTestId('signup-submit'));

    expect(mockSignUp).not.toHaveBeenCalled();
    expect(utils.getByText("That doesn't look like an email address")).toBeTruthy();
    expect(utils.getByText('Use at least 8 characters')).toBeTruthy();
  });
});

describe('SignupScreen — session present (email confirmation off)', () => {
  it('signs up with the trimmed email, writes the owner name, and routes to onboarding', async () => {
    mockSignUp.mockResolvedValue({
      data: { session: { access_token: 't' }, user: { id: 'u1', identities: [{}] } },
      error: null,
    });
    const utils = render(<SignupScreen />);
    fillValidForm(utils, '  jordan@email.com  ');
    fireEvent.press(utils.getByTestId('signup-submit'));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/onboarding/disclaimer'));
    expect(mockSignUp).toHaveBeenCalledWith({ email: 'jordan@email.com', password: 'password123' });
    expect(mockUpdateOwnerName).toHaveBeenCalledWith('u1', 'Jordan', 'Rivera');
  });

  it('still routes to onboarding when the owner-name write fails (best-effort, non-blocking)', async () => {
    // The name write is intentionally best-effort — a hiccup on it must not trap
    // the user on the account screen (the name is re-enterable in Profile, and
    // updateOwnerName logs its own failure). Routing must proceed regardless.
    mockSignUp.mockResolvedValue({
      data: { session: { access_token: 't' }, user: { id: 'u1', identities: [{}] } },
      error: null,
    });
    mockUpdateOwnerName.mockResolvedValue({ status: 'error' });
    const utils = render(<SignupScreen />);
    fillValidForm(utils);
    fireEvent.press(utils.getByTestId('signup-submit'));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/onboarding/disclaimer'));
    expect(mockUpdateOwnerName).toHaveBeenCalled();
  });
});

describe('SignupScreen — no session (email confirmation on)', () => {
  it('shows the soft verify state for a genuine new account (never routes away)', async () => {
    mockSignUp.mockResolvedValue({
      data: { session: null, user: { id: 'u1', identities: [{}] } },
      error: null,
    });
    const utils = render(<SignupScreen />);
    fillValidForm(utils);
    fireEvent.press(utils.getByTestId('signup-submit'));

    await waitFor(() => expect(utils.getByText('Check your inbox')).toBeTruthy());
    // Soft, not enforced: the name is NOT written (no auth session) and we do not
    // route into the app.
    expect(mockUpdateOwnerName).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(utils.getByTestId('verify-resend')).toBeTruthy();
    expect(utils.getByTestId('verify-continue')).toBeTruthy();
  });

  it('lets a stranded user go back from verify to fix a mistyped email (no dead end)', async () => {
    mockSignUp.mockResolvedValue({
      data: { session: null, user: { id: 'u1', identities: [{}] } },
      error: null,
    });
    const utils = render(<SignupScreen />);
    fillValidForm(utils);
    fireEvent.press(utils.getByTestId('signup-submit'));
    await waitFor(() => expect(utils.getByText('Check your inbox')).toBeTruthy());

    fireEvent.press(utils.getByTestId('verify-back'));
    // Back on the form (email field is present again), not stranded on verify.
    expect(utils.getByTestId('signup-email')).toBeTruthy();
    expect(utils.queryByText('Check your inbox')).toBeNull();
  });

  it('redirects an already-registered email to login instead of the verify state', async () => {
    // Empty identities array = the email is already registered (Supabase hides this
    // while confirmation is on).
    mockSignUp.mockResolvedValue({
      data: { session: null, user: { id: 'u1', identities: [] } },
      error: null,
    });
    const utils = render(<SignupScreen />);
    fillValidForm(utils);
    fireEvent.press(utils.getByTestId('signup-submit'));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(auth)/login'));
    expect(utils.queryByText('Check your inbox')).toBeNull();
  });
});

describe('SignupScreen — social auth flag', () => {
  it('hides the Apple/Google block while SOCIAL_AUTH_ENABLED is off (clean store build)', () => {
    const utils = render(<SignupScreen />);
    expect(utils.queryByTestId('signup-social')).toBeNull();
  });
});
