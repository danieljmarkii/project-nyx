import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert, Linking } from 'react-native';
import { router } from 'expo-router';
import { recordDisclaimerAcceptance } from '../../lib/legal';
import { DISCLAIMER_URL } from '../../constants/links';
import DisclaimerScreen from './disclaimer';

// Locks the acknowledgment screen's load-bearing behaviours (B-270): the button
// tap records acceptance server-side BEFORE advancing (an unrecorded acceptance
// is the failure the feature exists to prevent), a failed write keeps the owner
// here with a calm retry, an already-recorded re-walk advances cleanly, and the
// full-document link opens the hosted URL.

let mockUser: unknown = { id: 'user-1' };

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => false) },
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});
jest.mock('../../store/authStore', () => ({
  useAuthStore: jest.fn(() => ({ user: mockUser })),
}));
jest.mock('../../lib/legal', () => ({
  recordDisclaimerAcceptance: jest.fn(() => Promise.resolve({ status: 'recorded' })),
}));

const mockedReplace = router.replace as jest.Mock;
const mockedRecord = recordDisclaimerAcceptance as jest.Mock;

describe('DisclaimerScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { id: 'user-1' };
  });

  it('shows the verbatim acknowledgment copy and control label (appendix, nyx-voice checked)', () => {
    const { getByText } = render(<DisclaimerScreen />);
    expect(
      getByText(
        "Culprit helps you notice and record — it can't examine your pet, and it never gives the all-clear. For diagnosis, treatment, or anything urgent, your vet is the call.",
      ),
    ).toBeTruthy();
    expect(
      getByText('I understand Culprit is not a substitute for veterinary care.'),
    ).toBeTruthy();
  });

  it('records acceptance for the signed-in user, then advances to pet setup', async () => {
    const { getByTestId } = render(<DisclaimerScreen />);
    fireEvent.press(getByTestId('disclaimer-acknowledge'));
    await waitFor(() => expect(mockedRecord).toHaveBeenCalledWith('user-1'));
    await waitFor(() => expect(mockedReplace).toHaveBeenCalledWith('/onboarding/pet-type'));
  });

  it('an already-recorded acceptance (mid-flow-quit re-walk) advances cleanly', async () => {
    mockedRecord.mockResolvedValueOnce({ status: 'already-recorded' });
    const { getByTestId } = render(<DisclaimerScreen />);
    fireEvent.press(getByTestId('disclaimer-acknowledge'));
    await waitFor(() => expect(mockedReplace).toHaveBeenCalledWith('/onboarding/pet-type'));
  });

  it('a failed write keeps the owner here with a calm retry — never advances unrecorded', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockedRecord.mockResolvedValueOnce({ status: 'error' });
    const { getByTestId } = render(<DisclaimerScreen />);
    fireEvent.press(getByTestId('disclaimer-acknowledge'));
    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(
        "Couldn't save your acknowledgment",
        'Check your connection and try again.',
      ),
    );
    expect(mockedReplace).not.toHaveBeenCalled();

    // The retry path works: a second press with a healthy write advances.
    fireEvent.press(getByTestId('disclaimer-acknowledge'));
    await waitFor(() => expect(mockedReplace).toHaveBeenCalledWith('/onboarding/pet-type'));
    alertSpy.mockRestore();
  });

  it('opens the hosted full disclaimer from the link', async () => {
    const openSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const { getByTestId } = render(<DisclaimerScreen />);
    fireEvent.press(getByTestId('disclaimer-full-link'));
    await waitFor(() => expect(openSpy).toHaveBeenCalledWith(DISCLAIMER_URL));
    openSpy.mockRestore();
  });

  it('a failed link open falls back to naming the URL — never silent', async () => {
    const openSpy = jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no handler'));
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { getByTestId } = render(<DisclaimerScreen />);
    fireEvent.press(getByTestId('disclaimer-full-link'));
    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(
        "Couldn't open link",
        `You can find the full disclaimer at ${DISCLAIMER_URL}.`,
      ),
    );
    openSpy.mockRestore();
    alertSpy.mockRestore();
    warn.mockRestore();
  });

  it('renders nothing without a session (stray render mid-signout)', () => {
    mockUser = null;
    const { toJSON } = render(<DisclaimerScreen />);
    expect(toJSON()).toBeNull();
    expect(mockedRecord).not.toHaveBeenCalled();
  });
});
