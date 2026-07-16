import { render, fireEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import LandingScreen from './index';

// Smoke test for the Landing hero (B-284 PR N2b). The hero (carved moon +
// wordmark + sub + "See how it works") and the pinned auth CTAs render
// unconditionally, so this locks the always-present chrome and the load-bearing
// navigation wiring — including the new "See how it works" route.

jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));
// SafeAreaView needs a provider/context in a real tree; pass it through as a View
// so the screen renders headless.
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});

const mockedPush = router.push as jest.Mock;

describe('LandingScreen', () => {
  beforeEach(() => mockedPush.mockClear());

  it('anchors the Culprit lockup and the persistent auth CTAs', () => {
    const { getByText, getByTestId, getByLabelText } = render(<LandingScreen />);
    expect(getByText('Culprit')).toBeTruthy();
    // The moon + wordmark are grouped as one "Culprit" a11y image.
    expect(getByLabelText('Culprit')).toBeTruthy();
    expect(getByTestId('landing-create-account')).toBeTruthy();
    expect(getByTestId('landing-log-in')).toBeTruthy();
  });

  it('routes "Create account" to the signup path', () => {
    const { getByTestId } = render(<LandingScreen />);
    fireEvent.press(getByTestId('landing-create-account'));
    expect(mockedPush).toHaveBeenCalledWith('/(auth)/signup');
  });

  it('routes "Log in" to the login screen', () => {
    const { getByTestId } = render(<LandingScreen />);
    fireEvent.press(getByTestId('landing-log-in'));
    expect(mockedPush).toHaveBeenCalledWith('/(auth)/login');
  });

  it('routes "See how it works" to the value-preview screen', () => {
    const { getByTestId } = render(<LandingScreen />);
    fireEvent.press(getByTestId('landing-how-it-works'));
    expect(mockedPush).toHaveBeenCalledWith('/(auth)/how-it-works');
  });
});
