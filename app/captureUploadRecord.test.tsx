import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import FoodCaptureScreen from './food-capture';
import MedicationCaptureScreen from './medication-capture';
import { supabase } from '../lib/supabase';
import { uploadPhoto } from '../lib/storage';
import { consentDoorState } from '../store/aiConsentStore';
import { useAuthStore } from '../store/authStore';
import { usePetStore } from '../store/petStore';

// CUL-2170: a capture commit records a photo path only for a photo whose upload
// finished. Offline, the photo never reaches Storage, so neither the remote row's
// `photo_paths` nor the local cache's `photo_path` may name it. Driven through the
// real screens to the save, asserting the writes themselves.

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
const mockUpsert = jest.fn(async () => ({ error: null }));
const mockRunAsync = jest.fn(async () => ({ changes: 1 }));
jest.mock('../lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      insert: jest.fn(async () => ({ error: null })),
      upsert: mockUpsert,
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    })),
    functions: { invoke: jest.fn() },
  },
}));
jest.mock('../lib/db', () => ({ getDb: () => ({ runAsync: mockRunAsync, getAllAsync: jest.fn(async () => []) }) }));
jest.mock('../lib/storage', () => ({
  ...jest.requireActual('../lib/storage'),
  uploadPhoto: jest.fn(),
  compressForUpload: jest.fn(async () => 'file:///compressed.jpg'),
}));
jest.mock('../hooks/useReducedMotion', () => ({ useReducedMotion: jest.fn(() => true) }));
jest.mock('../hooks/useAppActive', () => ({ useAppActive: jest.fn(() => true) }));
let mockOnline = true;
jest.mock('../hooks/useIsOnline', () => ({ useIsOnline: () => mockOnline }));
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
const fromMock = supabase.from as jest.Mock;

jest.setTimeout(20000);

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  (consentDoorState as jest.Mock).mockResolvedValue('proceed');
  mockOnline = true;
  (ImagePicker.launchCameraAsync as jest.Mock)
    .mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///front.jpg', width: 1200, height: 1600 }] })
    .mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///ingredients.jpg', width: 1200, height: 1600 }] });
  // The read always fails, so both screens land on the typed form after the upload.
  invokeMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
  useAuthStore.setState({ user: { id: 'u1' } as never });
  usePetStore.setState({
    pets: [{ id: 'p1', name: 'Mochi' }] as never,
    activePet: { id: 'p1', name: 'Mochi' } as never,
  });
});

// The row the commit upserted into the named table on save.
function savedRow(table: string): Record<string, unknown> {
  expect(fromMock).toHaveBeenCalledWith(table);
  const call = mockUpsert.mock.calls.find((c) => 'photo_paths' in ((c as unknown[])[0] as object));
  expect(call).toBeTruthy();
  return (call as unknown[])[0] as Record<string, unknown>;
}

// The photo_path bound into the cache table's INSERT (the column's position in VALUES).
function cachedPhotoPath(table: string, index: number): unknown {
  const call = mockRunAsync.mock.calls.find((c) => String((c as unknown[])[0]).includes(`INSERT INTO ${table}`));
  expect(call).toBeTruthy();
  return ((call as unknown[])[1] as unknown[])[index];
}

async function saveFood(withIngredients: boolean) {
  const view = render(<FoodCaptureScreen />);
  await act(async () => { fireEvent.press(view.getByText('Take a photo')); });
  await waitFor(() => expect(view.getByText('Read the label')).toBeTruthy());
  if (withIngredients) {
    // A later slot asks camera or library first; take the camera.
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.text === 'Take photo')?.onPress?.();
    });
    await act(async () => { fireEvent.press(view.getByTestId('capture-slot-ingredients')); });
    await waitFor(() => expect(view.getByLabelText('Ingredients photo added. Replace it')).toBeTruthy());
  }
  await act(async () => { fireEvent.press(view.getByText('Read the label')); });
  await waitFor(() => expect(view.getByPlaceholderText('e.g. Royal Canin')).toBeTruthy());
  fireEvent.changeText(view.getByPlaceholderText('e.g. Royal Canin'), 'Weruva');
  fireEvent.changeText(view.getByPlaceholderText('e.g. Gastrointestinal Adult'), 'Duck Stew');
  await act(async () => { fireEvent.press(view.getByText('Save')); });
  await waitFor(() => expect(mockUpsert).toHaveBeenCalled());
  return view;
}

async function saveMedication() {
  const view = render(<MedicationCaptureScreen />);
  await act(async () => { fireEvent.press(view.getByText('Take a photo')); });
  await waitFor(() => expect(view.getByPlaceholderText('e.g. Prednisolone, Apoquel')).toBeTruthy());
  fireEvent.changeText(view.getByPlaceholderText('e.g. Prednisolone, Apoquel'), 'Prednisolone');
  await act(async () => { fireEvent.press(view.getByText('Save')); });
  await waitFor(() => expect(mockUpsert).toHaveBeenCalled());
  return view;
}

// food_items_cache VALUES (id, brand, product_name, format, food_type, photo_path, cached_at)
const FOOD_CACHE_PHOTO = 5;
// medication_items_cache VALUES (id, generic, brand, strength, form, route, is_rx, photo_path, now)
const MED_CACHE_PHOTO = 7;

describe('food capture: the commit records only photos that uploaded', () => {
  it('offline: no photo path on the row or in the cache', async () => {
    uploadMock.mockRejectedValue(new Error('Network request failed'));
    await saveFood(false);
    expect(uploadMock).toHaveBeenCalled();
    expect(savedRow('food_items').photo_paths).toEqual([]);
    expect(cachedPhotoPath('food_items_cache', FOOD_CACHE_PHOTO)).toBeNull();
  });

  it('uploaded: the front is recorded on the row and in the cache', async () => {
    uploadMock.mockResolvedValue(undefined);
    await saveFood(false);
    const paths = savedRow('food_items').photo_paths as string[];
    expect(paths).toHaveLength(1);
    expect(paths[0]).toMatch(/\/0-front\.jpg$/);
    expect(cachedPhotoPath('food_items_cache', FOOD_CACHE_PHOTO)).toBe(paths[0]);
  });

  it('partial: only the photo whose upload finished is recorded', async () => {
    uploadMock.mockImplementation(async (_bucket: string, path: string) => {
      if (path.includes('ingredients')) throw new Error('Network request failed');
    });
    await saveFood(true);
    expect(uploadMock).toHaveBeenCalledTimes(2);
    const paths = savedRow('food_items').photo_paths as string[];
    expect(paths).toHaveLength(1);
    expect(paths[0]).toMatch(/\/0-front\.jpg$/);
  });
});

describe('food capture: a late upload is waited for, not dropped', () => {
  it('a failure does not reach the form while a sibling upload is still in flight', async () => {
    let finishFront: () => void = () => {};
    uploadMock.mockImplementation((_bucket: string, path: string) => {
      if (path.includes('ingredients')) return Promise.reject(new Error('Network request failed'));
      return new Promise<void>((resolve) => { finishFront = resolve; });
    });
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.text === 'Take photo')?.onPress?.();
    });
    const view = render(<FoodCaptureScreen />);
    await act(async () => { fireEvent.press(view.getByText('Take a photo')); });
    await waitFor(() => expect(view.getByTestId('capture-slot-ingredients')).toBeTruthy());
    await act(async () => { fireEvent.press(view.getByTestId('capture-slot-ingredients')); });
    await waitFor(() => expect(view.getByLabelText('Ingredients photo added. Replace it')).toBeTruthy());
    await act(async () => { fireEvent.press(view.getByText('Read the label')); });
    // The ingredients upload has failed; the front has not settled. No form yet.
    expect(uploadMock).toHaveBeenCalledTimes(2);
    expect(view.queryByPlaceholderText('e.g. Royal Canin')).toBeNull();
    await act(async () => { finishFront(); });
    await waitFor(() => expect(view.getByPlaceholderText('e.g. Royal Canin')).toBeTruthy());
    fireEvent.changeText(view.getByPlaceholderText('e.g. Royal Canin'), 'Weruva');
    fireEvent.changeText(view.getByPlaceholderText('e.g. Gastrointestinal Adult'), 'Duck Stew');
    await act(async () => { fireEvent.press(view.getByText('Save')); });
    await waitFor(() => expect(mockUpsert).toHaveBeenCalled());
    const paths = savedRow('food_items').photo_paths as string[];
    expect(paths).toHaveLength(1);
    expect(paths[0]).toMatch(/\/0-front\.jpg$/);
  });
});

// CUL-1910: the record says AI read only when a read landed. Before it, a photo alone
// was enough, so a food typed in before any read ran (P8's offline path, or the camera
// refused mid-flow) was stored as 'completed' / 'ai_extracted'.
describe('food capture: what the commit says about the read', () => {
  it('offline, typed in from the photos step: no read ran, so nothing claims one', async () => {
    mockOnline = false;
    const view = render(<FoodCaptureScreen />);
    await act(async () => { fireEvent.press(view.getByText('Take a photo')); });
    await waitFor(() => expect(view.getByTestId('capture-offline')).toBeTruthy());
    // The read cannot start: its button is disabled and says why (C-7).
    expect(view.getByLabelText('Read the label · needs a connection').props.accessibilityState).toMatchObject({ disabled: true });
    await act(async () => { fireEvent.press(view.getByText('Type it in now')); });
    fireEvent.changeText(view.getByPlaceholderText('e.g. Royal Canin'), 'Weruva');
    fireEvent.changeText(view.getByPlaceholderText('e.g. Gastrointestinal Adult'), 'Duck Stew');
    await act(async () => { fireEvent.press(view.getByText('Save')); });
    await waitFor(() => expect(mockUpsert).toHaveBeenCalled());
    const row = savedRow('food_items');
    expect(uploadMock).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalled();
    expect(row.source).toBe('user');
    expect(row.ai_extraction_status).toBe('manual');
    expect(row.photo_paths).toEqual([]);
  });

  it('a read that was asked for and failed is recorded as failed, never as read', async () => {
    uploadMock.mockResolvedValue(undefined);
    await saveFood(false);
    const row = savedRow('food_items');
    expect(row.source).toBe('user');
    expect(row.ai_extraction_status).toBe('failed');
  });

  it('a read missing its brand sends Looks right to the form, never a silent no-op', async () => {
    uploadMock.mockResolvedValue(undefined);
    invokeMock.mockResolvedValue({ data: { extraction: { brand: null, product_name: 'Duck Stew', format: 'wet' } }, error: null });
    const view = render(<FoodCaptureScreen />);
    await act(async () => { fireEvent.press(view.getByText('Take a photo')); });
    await act(async () => { fireEvent.press(view.getByText('Read the label')); });
    await waitFor(() => expect(view.getByText('Looks right')).toBeTruthy());
    await act(async () => { fireEvent.press(view.getByText('Looks right')); });
    expect(view.getByPlaceholderText('e.g. Royal Canin')).toBeTruthy();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('a read that landed and was confirmed is recorded as the AI read', async () => {
    uploadMock.mockResolvedValue(undefined);
    invokeMock.mockResolvedValue({
      data: { extraction: { brand: 'Weruva', product_name: 'Duck Stew', format: 'wet', primary_protein: 'duck', proteins: ['duck'] } },
      error: null,
    });
    const view = render(<FoodCaptureScreen />);
    await act(async () => { fireEvent.press(view.getByText('Take a photo')); });
    await act(async () => { fireEvent.press(view.getByText('Read the label')); });
    await waitFor(() => expect(view.getByText('Looks right')).toBeTruthy());
    // P4: every field the read produced is shown, the format included.
    expect(view.getByLabelText('Brand, Weruva')).toBeTruthy();
    expect(view.getByLabelText('Product, Duck Stew')).toBeTruthy();
    expect(view.getByLabelText('Format, Wet / canned')).toBeTruthy();
    await act(async () => { fireEvent.press(view.getByText('Looks right')); });
    await waitFor(() => expect(mockUpsert).toHaveBeenCalled());
    const row = savedRow('food_items');
    expect(row.source).toBe('ai_extracted');
    expect(row.ai_extraction_status).toBe('completed');
    // P10: the library beat names the food it saved.
    expect(view.getByText('Weruva · Duck Stew')).toBeTruthy();
  });
});

describe('medication capture: the commit records only a label that uploaded', () => {
  it('offline: no photo path on the row or in the cache', async () => {
    uploadMock.mockRejectedValue(new Error('Network request failed'));
    await saveMedication();
    expect(uploadMock).toHaveBeenCalled();
    expect(savedRow('medication_items').photo_paths).toEqual([]);
    expect(cachedPhotoPath('medication_items_cache', MED_CACHE_PHOTO)).toBeNull();
  });

  it('uploaded: the label is recorded on the row and in the cache', async () => {
    uploadMock.mockResolvedValue(undefined);
    await saveMedication();
    const paths = savedRow('medication_items').photo_paths as string[];
    expect(paths).toHaveLength(1);
    expect(paths[0]).toMatch(/0-label/);
    expect(cachedPhotoPath('medication_items_cache', MED_CACHE_PHOTO)).toBe(paths[0]);
  });
});
