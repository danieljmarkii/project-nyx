import { render, fireEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import LandingScreen from './index';

// Smoke test for the Landing entry (B-251 PR 5). The paging preview stack only
// mounts once the stage reports its width via onLayout, which jest doesn't fire —
// so this locks the always-present chrome instead: the logo, and the two pinned
// auth CTAs wired to the right routes (the load-bearing wiring of this screen).

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

  it('anchors the Culprit wordmark and both persistent auth CTAs', () => {
    const { getByText, getByTestId } = render(<LandingScreen />);
    expect(getByText('Culprit')).toBeTruthy();
    expect(getByTestId('landing-create-account')).toBeTruthy();
    expect(getByTestId('landing-log-in')).toBeTruthy();
  });

  it('routes "Create account" to the account path', () => {
    const { getByTestId } = render(<LandingScreen />);
    fireEvent.press(getByTestId('landing-create-account'));
    expect(mockedPush).toHaveBeenCalledWith('/(auth)/signup');
  });

  it('routes "Log in" to the existing login screen', () => {
    const { getByTestId } = render(<LandingScreen />);
    fireEvent.press(getByTestId('landing-log-in'));
    expect(mockedPush).toHaveBeenCalledWith('/(auth)/login');
  });
});
