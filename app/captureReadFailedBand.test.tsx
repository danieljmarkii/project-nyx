import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import FoodCaptureScreen from './food-capture';
import MedicationCaptureScreen from './medication-capture';
import { supabase } from '../lib/supabase';
import { uploadPhoto } from '../lib/storage';
import { consentDoorState } from '../store/aiConsentStore';
import { useAuthStore } from '../store/authStore';
import { usePetStore } from '../store/petStore';

// CUL-2164: the failed read band on both capture screens says only what is true. Food
// promised a background retry nothing performs; medication claimed a saved label photo
// even when the upload itself had thrown (offline). Driven through the real screens so
// the text pinned is the text an owner reads after a failed read.

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({}),
}));
jest.mock('expo-image-picker', () => ({
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  MediaTypeOptions: { Images: 'Images' },
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('../lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({ insert: jest.fn(async () => ({ error: null })), upsert: jest.fn(async () => ({ error: null })) })),
    functions: { invoke: jest.fn() },
  },
}));
jest.mock('../lib/db', () => ({ getDb: () => ({ runAsync: jest.fn(), getAllAsync: jest.fn(async () => []) }) }));
jest.mock('../lib/storage', () => ({
  ...jest.requireActual('../lib/storage'),
  uploadPhoto: jest.fn(),
  compressForUpload: jest.fn(async () => 'file:///compressed.jpg'),
}));
jest.mock('../hooks/useReducedMotion', () => ({ useReducedMotion: jest.fn(() => true) }));
jest.mock('../hooks/useAppActive', () => ({ useAppActive: jest.fn(() => true) }));
jest.mock('../store/aiConsentStore', () => ({
  consentDoorState: jest.fn(),
  saveAiConsent: jest.fn(),
}));
jest.mock('../hooks/useAppConfig', () => ({
  ...jest.requireActual('../hooks/useAppConfig'),
  useAppConfig: () => ({
    ...jest.requireActual('../lib/appConfig').APP_CONFIG_DEFAULTS,
    ai_food_extraction_enabled: true,
    ai_med_extraction_enabled: true,
  }),
}));

const invokeMock = supabase.functions.invoke as jest.Mock;
const uploadMock = uploadPhoto as jest.Mock;

const FOOD_BAND = "Couldn't read the label. Fill in what you know below.";
const MED_BAND_UPLOADED = "Couldn't read the label. Fill in what you know below; the label photo is saved.";
const MED_BAND_NOT_UPLOADED = "Couldn't read the label. Fill in what you know below.";

// The first render pays the screen's module load, which can pass jest's 5s default.
jest.setTimeout(20000);

beforeEach(() => {
  jest.clearAllMocks();
  // The failure paths log by design; the band is what is under test.
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  (consentDoorState as jest.Mock).mockResolvedValue('proceed');
  (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///label.jpg', width: 1200, height: 1600 }],
  });
  useAuthStore.setState({ user: { id: 'u1' } as never });
  usePetStore.setState({
    pets: [{ id: 'p1', name: 'Mochi' }] as never,
    activePet: { id: 'p1', name: 'Mochi' } as never,
  });
});

async function failFoodRead() {
  const view = render(<FoodCaptureScreen />);
  await act(async () => { fireEvent.press(view.getByText('Take a photo')); });
  await waitFor(() => expect(view.getByText('Skip')).toBeTruthy());
  await act(async () => { fireEvent.press(view.getByText('Skip')); });
  await act(async () => { fireEvent.press(view.getByText('Skip')); });
  await act(async () => { fireEvent.press(view.getByText('Continue')); });
  return view;
}

async function failMedicationRead() {
  const view = render(<MedicationCaptureScreen />);
  await act(async () => { fireEvent.press(view.getByText('Take a photo')); });
  return view;
}

describe('food capture: the failed read band', () => {
  it('a read that ran and failed promises no retry', async () => {
    uploadMock.mockResolvedValue(undefined);
    invokeMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const view = await failFoodRead();
    await waitFor(() => expect(view.getByText(FOOD_BAND)).toBeTruthy());
    expect(view.queryByText(/retry|background|try reading/i)).toBeNull();
  });

  it('an upload that threw (offline) says the same, and nothing more', async () => {
    uploadMock.mockRejectedValue(new Error('Network request failed'));
    const view = await failFoodRead();
    await waitFor(() => expect(view.getByText(FOOD_BAND)).toBeTruthy());
    expect(invokeMock).not.toHaveBeenCalled();
  });
});

describe('medication capture: the failed read band', () => {
  it('claims the saved photo once the upload finished', async () => {
    uploadMock.mockResolvedValue(undefined);
    invokeMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const view = await failMedicationRead();
    await waitFor(() => expect(view.getByText(MED_BAND_UPLOADED)).toBeTruthy());
  });

  it('claims no photo when the upload itself threw (offline)', async () => {
    uploadMock.mockRejectedValue(new Error('Network request failed'));
    const view = await failMedicationRead();
    await waitFor(() => expect(view.getByText(MED_BAND_NOT_UPLOADED)).toBeTruthy());
    expect(view.queryByText(/photo is saved/)).toBeNull();
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
