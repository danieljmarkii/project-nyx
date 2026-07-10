import { render, fireEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import HowItWorksScreen from './how-it-works';

// Smoke test for the "How it works" value-preview screen (B-284 PR N2b). The pager
// only mounts once the stage reports its width via onLayout (jest doesn't fire it),
// so this locks the always-present chrome + the navigation wiring: back (with its
// cold-deep-link fallback) and the repeated auth CTAs.

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});

const mockedPush = router.push as jest.Mock;
const mockedBack = router.back as jest.Mock;
const mockedReplace = router.replace as jest.Mock;
const mockedCanGoBack = router.canGoBack as jest.Mock;

describe('HowItWorksScreen', () => {
  beforeEach(() => {
    mockedPush.mockClear();
    mockedBack.mockClear();
    mockedReplace.mockClear();
    mockedCanGoBack.mockReturnValue(true);
  });

  it('renders the back control and both auth CTAs', () => {
    const { getByTestId } = render(<HowItWorksScreen />);
    expect(getByTestId('how-it-works-back')).toBeTruthy();
    expect(getByTestId('how-it-works-create-account')).toBeTruthy();
    expect(getByTestId('how-it-works-log-in')).toBeTruthy();
  });

  it('routes "Create account" and "Log in" to their screens', () => {
    const { getByTestId } = render(<HowItWorksScreen />);
    fireEvent.press(getByTestId('how-it-works-create-account'));
    expect(mockedPush).toHaveBeenCalledWith('/(auth)/signup');
    fireEvent.press(getByTestId('how-it-works-log-in'));
    expect(mockedPush).toHaveBeenCalledWith('/(auth)/login');
  });

  it('goes back when there is history', () => {
    const { getByTestId } = render(<HowItWorksScreen />);
    fireEvent.press(getByTestId('how-it-works-back'));
    expect(mockedBack).toHaveBeenCalled();
    expect(mockedReplace).not.toHaveBeenCalled();
  });

  it('falls back to the Landing when opened cold (no history)', () => {
    mockedCanGoBack.mockReturnValue(false);
    const { getByTestId } = render(<HowItWorksScreen />);
    fireEvent.press(getByTestId('how-it-works-back'));
    expect(mockedReplace).toHaveBeenCalledWith('/(auth)');
    expect(mockedBack).not.toHaveBeenCalled();
  });
});
