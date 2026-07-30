import { render, fireEvent, act } from '@testing-library/react-native';
import { router } from 'expo-router';
import LandingScreen from './index';
import { useAuthStore } from '../../store/authStore';
import type { Session } from '@supabase/supabase-js';

// Landing tests (B-284 PR N2b hero + the cold-start session guard). The hero
// chrome renders for a DECIDED signed-out owner; a live session on the focused
// Landing must redirect to the tabs — the missing route behind the TestFlight
// login-every-launch bug ("/" resolves to this screen for everyone, so without
// the guard a restored session still saw the login wall).

// Focus is controllable per-test: signup mints a session while the Landing sits
// unfocused beneath it, and the guard must not hijack that flow.
let mockFocused = true;
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useFocusEffect: (cb: () => void | (() => void)) => {
    const { useEffect } = require('react');
    useEffect(() => {
      if (mockFocused) return cb();
    }, [cb]);
  },
}));
// SafeAreaView needs a provider/context in a real tree; pass it through as a View
// so the screen renders headless.
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});

const mockedPush = router.push as jest.Mock;
const mockedReplace = router.replace as jest.Mock;

// Only the truthiness + user shape matter to the guard.
const liveSession = { user: { id: 'owner-1' } } as unknown as Session;

describe('LandingScreen', () => {
  beforeEach(() => {
    mockedPush.mockClear();
    mockedReplace.mockClear();
    mockFocused = true;
    // The decided signed-out state — what the pre-guard tests always implied.
    useAuthStore.setState({
      session: null,
      user: null,
      isLoading: false,
      recoveryInProgress: false,
    });
  });

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

  // ── The cold-start session guard ──────────────────────────────────────────

  it('routes a restored session straight past the Landing to the tabs', () => {
    useAuthStore.setState({ session: liveSession, user: liveSession.user });
    const { queryByTestId } = render(<LandingScreen />);
    expect(mockedReplace).toHaveBeenCalledWith('/(tabs)');
    // No login wall for a signed-in owner — the redirect frame shows the night
    // ground + lockup only.
    expect(queryByTestId('landing-log-in')).toBeNull();
    expect(queryByTestId('landing-create-account')).toBeNull();
  });

  it('routes in when the session arrives AFTER mount (the retain-then-refresh recovery)', () => {
    render(<LandingScreen />);
    expect(mockedReplace).not.toHaveBeenCalled();
    // TOKEN_REFRESHED lands while the owner is still sitting on the Landing.
    act(() => {
      useAuthStore.setState({ session: liveSession, user: liveSession.user });
    });
    expect(mockedReplace).toHaveBeenCalledWith('/(tabs)');
  });

  it('does NOT redirect while unfocused — an in-flight signup owns its own navigation', () => {
    mockFocused = false;
    useAuthStore.setState({ session: liveSession, user: liveSession.user });
    render(<LandingScreen />);
    expect(mockedReplace).not.toHaveBeenCalled();
  });

  it('does NOT redirect while the recovery gate is armed (B-280 Trap 1)', () => {
    useAuthStore.setState({
      session: liveSession,
      user: liveSession.user,
      recoveryInProgress: true,
    });
    render(<LandingScreen />);
    expect(mockedReplace).not.toHaveBeenCalled();
  });

  it('holds the auth CTAs until the cold-start session decision lands', () => {
    useAuthStore.setState({ isLoading: true });
    const { queryByTestId, getByLabelText } = render(<LandingScreen />);
    // Undecided: brand lockup only — never flash the login wall at an owner
    // whose session is about to restore.
    expect(getByLabelText('Culprit')).toBeTruthy();
    expect(queryByTestId('landing-create-account')).toBeNull();
    expect(queryByTestId('landing-log-in')).toBeNull();
    expect(queryByTestId('landing-how-it-works')).toBeNull();
    expect(mockedReplace).not.toHaveBeenCalled();
  });
});
