import { Alert } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import PaywallScreen from './paywall';

// Locks the mocked paywall (B-251 PR 10): the escape hatch when no pet exists, and
// that BOTH the "Maybe later" skip and the mocked "Start 7-day free trial" CTA
// simply advance to the completion screen — no purchase, no write. Also guards the
// Principle-7 free-tier line, the one load-bearing invariant on this screen.

let mockActivePet: unknown = { id: 'pet-1', name: 'Luna', species: 'cat' };
// T2-5: the screen bounces to done when the paywall is flagged off. Default the flag
// ON so the existing render/interaction tests exercise the real paywall; the bounce
// test flips it.
let mockPaywallEnabled = true;

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
  // The status-bar focus effect is not under test — no-op it so it doesn't run.
  useFocusEffect: jest.fn(),
}));
jest.mock('../../hooks/useAppConfig', () => ({
  useAppConfig: jest.fn(() => ({ paywall_enabled: mockPaywallEnabled })),
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});
jest.mock('expo-status-bar', () => ({ setStatusBarStyle: jest.fn() }));
jest.mock('../../store/petStore', () => ({
  usePetStore: jest.fn(() => ({ activePet: mockActivePet })),
}));

const mockedPush = router.push as jest.Mock;
const mockedReplace = router.replace as jest.Mock;

describe('PaywallScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockActivePet = { id: 'pet-1', name: 'Luna', species: 'cat' };
    mockPaywallEnabled = true;
  });

  it('bounces to the type step when there is no active pet (stray entry)', () => {
    mockActivePet = null;
    render(<PaywallScreen />);
    expect(mockedReplace).toHaveBeenCalledWith('/onboarding/pet-type');
  });

  it('T2-5: bounces to done when the paywall is flagged off (stale client / deep link)', () => {
    mockPaywallEnabled = false;
    const { queryByTestId } = render(<PaywallScreen />);
    // No dead trial CTA renders while the guard bounces...
    expect(queryByTestId('paywall-start-trial')).toBeNull();
    // ...and it hands straight to the completion screen (not back to pet-type: the
    // pet exists, so the no-pet escape hatch doesn't fire).
    expect(mockedReplace).toHaveBeenCalledWith('/onboarding/done');
    expect(mockedReplace).not.toHaveBeenCalledWith('/onboarding/pet-type');
  });

  it('"Maybe later" advances to the completion screen', () => {
    const { getByTestId } = render(<PaywallScreen />);
    fireEvent.press(getByTestId('paywall-maybe-later'));
    expect(mockedPush).toHaveBeenCalledWith('/onboarding/done');
  });

  it('the mocked trial CTA honestly acknowledges Premium is not live, then advances', () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const { getByTestId } = render(<PaywallScreen />);
    fireEvent.press(getByTestId('paywall-start-trial'));

    // It does NOT silently no-op or push straight through — it explains first.
    expect(mockedPush).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledTimes(1);
    const [title, message, buttons] = alertSpy.mock.calls[0];
    expect(title).toMatch(/Premium/i);
    expect(message).toMatch(/already free/i); // reinforces the free-tier promise
    // Invoking the "Continue" action advances to the completion screen (no purchase).
    const continueButton = (buttons as { text: string; onPress?: () => void }[])[0];
    continueButton.onPress?.();
    expect(mockedPush).toHaveBeenCalledWith('/onboarding/done');
  });

  it('states the Principle-7 free-tier line (care stays free)', () => {
    const { getByText } = render(<PaywallScreen />);
    // Split across two Text nodes ("Always free:" + the rest); assert the care list.
    expect(getByText(/logging, health alerts, trends & vet reports/)).toBeTruthy();
    expect(getByText('Always free:')).toBeTruthy();
  });
});
