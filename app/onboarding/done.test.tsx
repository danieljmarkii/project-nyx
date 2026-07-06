import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { markOnboardingComplete } from '../../lib/profile';
import DoneScreen from './done';

// Locks the completion screen (B-251 PR 10): the escape hatch when no pet exists,
// the durable onboarding_completed_at write firing ON MOUNT (§6 / D12 — so a quit
// here is still recorded complete), and "Go to home" REPLACING into the tabs so
// Home has no onboarding screen behind it.

let mockUser: unknown = { id: 'user-1' };
let mockActivePet: unknown = { id: 'pet-1', name: 'Luna', species: 'cat' };

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
  // done.tsx locks its back gesture via <Stack.Screen options={{ gestureEnabled: false }} />.
  Stack: { Screen: () => null },
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});
jest.mock('../../store/authStore', () => ({
  useAuthStore: jest.fn(() => ({ user: mockUser })),
}));
jest.mock('../../store/petStore', () => ({
  usePetStore: jest.fn(() => ({ activePet: mockActivePet })),
}));
jest.mock('../../lib/profile', () => ({
  markOnboardingComplete: jest.fn(() => Promise.resolve({ status: 'written', completedAt: 'x' })),
}));

const mockedReplace = router.replace as jest.Mock;
const mockedComplete = markOnboardingComplete as jest.Mock;

describe('DoneScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { id: 'user-1' };
    mockActivePet = { id: 'pet-1', name: 'Luna', species: 'cat' };
  });

  it('bounces to the type step when there is no active pet (stray entry)', () => {
    mockActivePet = null;
    render(<DoneScreen />);
    expect(mockedReplace).toHaveBeenCalledWith('/onboarding/pet-type');
    expect(mockedComplete).not.toHaveBeenCalled(); // no pet ⇒ no completion recorded
  });

  it('writes the durable completion flag once on mount, scoped to the user', async () => {
    render(<DoneScreen />);
    await waitFor(() => expect(mockedComplete).toHaveBeenCalledWith('user-1'));
    expect(mockedComplete).toHaveBeenCalledTimes(1);
  });

  it('a rejected completion write is swallowed (never throws) — the finish is never blocked', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockedComplete.mockRejectedValueOnce(new Error('network down'));
    // Renders + the "Go to home" CTA still work despite the rejection; the §6 legacy
    // rule is the durable fallback (has-pet + null-completion ⇒ never re-onboarded).
    const { getByTestId } = render(<DoneScreen />);
    await waitFor(() => expect(warn).toHaveBeenCalled());
    fireEvent.press(getByTestId('done-go-home'));
    expect(mockedReplace).toHaveBeenCalledWith('/(tabs)');
  });

  it('"Go to home" replaces into the tabs (no onboarding screen behind Home)', () => {
    const { getByTestId } = render(<DoneScreen />);
    fireEvent.press(getByTestId('done-go-home'));
    expect(mockedReplace).toHaveBeenCalledWith('/(tabs)');
  });

  it('shows the warm payoff copy with the pet name', () => {
    const { getByText } = render(<DoneScreen />);
    expect(getByText('Say hi to Luna — their home is ready.')).toBeTruthy();
  });
});
