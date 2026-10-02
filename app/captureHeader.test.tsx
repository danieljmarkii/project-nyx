import { fireEvent, render } from '@testing-library/react-native';
import { router } from 'expo-router';
import FoodCaptureScreen from './food-capture';
import MedicationCaptureScreen from './medication-capture';

// CUL-399 (B-075): both capture screens draw their top bar with the shared
// components/ui/Header rather than a local copy. The guard (guards/sharedHeader.test.ts)
// forbids the copy; this pins the call site the guard cannot read. The shared bar
// renders its leading control only when `leading` is set, so a migration that kept
// `onLeadingPress` and dropped `leading="close"` would compile and silently leave the
// first step with no way out. The local copy had no accessible label, so these reds on
// the pre-migration tree too.

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({}),
}));
jest.mock('expo-image-picker', () => ({
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  MediaTypeOptions: { Images: 'Images' },
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('../lib/supabase', () => ({
  supabase: { from: jest.fn(), functions: { invoke: jest.fn() } },
}));
jest.mock('../lib/db', () => ({ getDb: () => ({ runAsync: jest.fn(), getAllAsync: jest.fn(async () => []) }) }));
jest.mock('../lib/storage', () => ({ uploadPhoto: jest.fn(), compressForUpload: jest.fn() }));
jest.mock('../hooks/useReducedMotion', () => ({ useReducedMotion: jest.fn(() => true) }));
jest.mock('../hooks/useAppActive', () => ({ useAppActive: jest.fn(() => true) }));

describe('the capture screens use the shared header (CUL-399)', () => {
  beforeEach(() => {
    (router.back as jest.Mock).mockClear();
  });

  it('Add a food: the first step closes through the shared bar', () => {
    const { getByText, getByLabelText } = render(<FoodCaptureScreen />);
    expect(getByText('Add a food')).toBeTruthy();
    fireEvent.press(getByLabelText('Close'));
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('Add a medication: the first step closes through the shared bar', () => {
    const { getByText, getByLabelText } = render(<MedicationCaptureScreen />);
    expect(getByText('Add a medication')).toBeTruthy();
    fireEvent.press(getByLabelText('Close'));
    expect(router.back).toHaveBeenCalledTimes(1);
  });
});
