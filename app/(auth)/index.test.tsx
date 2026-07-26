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

  it('renders the mark static — no ping rings on the Landing (PM 2026-07-26)', () => {
    // The ring-train ping is retired from this surface (Option B,
    // docs/culprit-landing-hero-mockups.html): CulpritMark gets no `live`, so its
    // pulse layers (the only stroked circles the hero would ever draw — the moon,
    // dot, and stars are all fills) must not render. A stroked circle appearing
    // here means someone re-added the pulse.
    const tree = render(<LandingScreen />).toJSON();
    const strokedCircles: any[] = [];
    const visit = (n: any) => {
      if (!n) return;
      if (Array.isArray(n)) return n.forEach(visit);
      if (n.type === 'RNSVGCircle' && n.props?.stroke != null) strokedCircles.push(n);
      (n.children ?? []).forEach(visit);
    };
    visit(tree);
    expect(strokedCircles).toHaveLength(0);
  });
});
