import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import FoodCaptureScreen from './food-capture';
import MedicationCaptureScreen from './medication-capture';
import { consentDoorState, saveAiConsent } from '../store/aiConsentStore';
import { useAuthStore } from '../store/authStore';
import { usePetStore } from '../store/petStore';

// CUL-1834 (mock frame A): the AI consent door on Add by photo. No photo is taken,
// or picked, before the owner answers; Don't allow and Not now open the typed form.
// The store is stubbed at its seam: what is pinned here is the screen's ORDER (ask,
// then picker), and the writes themselves are pinned in lib/aiConsent.test.ts.

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({}),
}));
jest.mock('expo-image-picker', () => ({
  launchCameraAsync: jest.fn(async () => ({ canceled: true, assets: [] })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: [] })),
  requestCameraPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
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
jest.mock('../store/aiConsentStore', () => ({
  consentDoorState: jest.fn(),
  saveAiConsent: jest.fn(),
}));
// Both capture screens skip to the typed form when their extraction flag is off, and
// the shipped defaults are off. The door only exists on the photo path.
jest.mock('../hooks/useAppConfig', () => ({
  ...jest.requireActual('../hooks/useAppConfig'),
  useAppConfig: () => ({
    ...jest.requireActual('../lib/appConfig').APP_CONFIG_DEFAULTS,
    ai_food_extraction_enabled: true,
    ai_med_extraction_enabled: true,
  }),
}));

const needsMock = consentDoorState as jest.Mock;
const saveMock = saveAiConsent as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: { id: 'u1' } as never });
  usePetStore.setState({
    pets: [{ id: 'p1', name: 'Mochi' }] as never,
    activePet: { id: 'p1', name: 'Mochi' } as never,
  });
});

const SCREENS = [
  { name: 'food', Screen: FoodCaptureScreen },
  { name: 'medication', Screen: MedicationCaptureScreen },
];

for (const { name, Screen } of SCREENS) {
  describe(`${name} capture: the consent door`, () => {
    for (const source of ['Take a photo', 'Choose from library'] as const) {
      it(`${source}: no picker opens before an answer, and Not now writes nothing`, async () => {
        needsMock.mockResolvedValue('ask');
        const { getByText, queryByText } = render(<Screen />);
        await act(async () => { fireEvent.press(getByText(source)); });
        expect(getByText('Snap the label, skip the typing')).toBeTruthy();
        expect(ImagePicker.requestCameraPermissionsAsync).not.toHaveBeenCalled();
        expect(ImagePicker.requestMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
        await act(async () => { fireEvent.press(getByText("Not now, I'll type it in")); });
        // The typed form, not the picker.
        await waitFor(() => expect(queryByText(source)).toBeNull(), { timeout: 5000 });
        expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
        expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
        expect(saveMock).not.toHaveBeenCalled();
      });
    }

    it('Allow saves a yes, then opens the picker', async () => {
      needsMock.mockResolvedValue('ask');
      saveMock.mockResolvedValue({ status: 'saved', row: {} });
      const { getByText } = render(<Screen />);
      await act(async () => { fireEvent.press(getByText('Take a photo')); });
      await act(async () => { fireEvent.press(getByText('Allow')); });
      expect(saveMock).toHaveBeenCalledWith('u1', true, 'backstop');
      await waitFor(() => expect(ImagePicker.launchCameraAsync).toHaveBeenCalledTimes(1), { timeout: 5000 });
    });

    it("Don't allow saves a no and opens the typed form, never the picker", async () => {
      needsMock.mockResolvedValue('ask');
      saveMock.mockResolvedValue({ status: 'saved', row: {} });
      const { getByText, queryByText } = render(<Screen />);
      await act(async () => { fireEvent.press(getByText('Take a photo')); });
      await act(async () => { fireEvent.press(getByText("Don't allow")); });
      expect(saveMock).toHaveBeenCalledWith('u1', false, 'backstop');
      await waitFor(() => expect(queryByText('Take a photo')).toBeNull(), { timeout: 5000 });
      expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
    });

    it('an owner who already said no gets the typed form, no sheet and no picker', async () => {
      needsMock.mockResolvedValue('declined');
      const { getByText, queryByText } = render(<Screen />);
      await act(async () => { fireEvent.press(getByText('Take a photo')); });
      expect(queryByText('Snap the label, skip the typing')).toBeNull();
      await waitFor(() => expect(queryByText('Take a photo')).toBeNull(), { timeout: 5000 });
      expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
      expect(saveMock).not.toHaveBeenCalled();
    });

    it('an owner who already said yes goes straight to the picker', async () => {
      needsMock.mockResolvedValue('proceed');
      const { getByText, queryByText } = render(<Screen />);
      await act(async () => { fireEvent.press(getByText('Take a photo')); });
      expect(queryByText('Snap the label, skip the typing')).toBeNull();
      await waitFor(() => expect(ImagePicker.launchCameraAsync).toHaveBeenCalledTimes(1));
    });
  });
}

it('the close control still leaves without answering', async () => {
  needsMock.mockResolvedValue('ask');
  const { getByLabelText } = render(<FoodCaptureScreen />);
  fireEvent.press(getByLabelText('Close'));
  expect(router.back).toHaveBeenCalledTimes(1);
  expect(saveMock).not.toHaveBeenCalled();
});
