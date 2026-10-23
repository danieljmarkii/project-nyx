// CUL-2089 (mock A2): capture opened from the bowl picker hands the saved food back to the
// meal that asked, and only from its add only path. The meal log path (`fromLog`) writes a
// meal of its own and must never offer one, and a capture opened from anywhere else passes
// no key and offers nothing.

import { act, fireEvent, render } from '@testing-library/react-native';
import FoodCaptureScreen from './food-capture';
import { takeCapturedFood } from '../lib/captureHandBack';

let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), dismissAll: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => mockParams,
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
  supabase: {
    from: jest.fn(() => ({ upsert: jest.fn(() => Promise.resolve({ error: null })) })),
    functions: { invoke: jest.fn() },
  },
}));
jest.mock('../lib/db', () => ({ getDb: () => ({ runAsync: jest.fn(async () => ({ changes: 1 })), getAllAsync: jest.fn(async () => []) }) }));
jest.mock('../lib/storage', () => ({ uploadPhoto: jest.fn(), compressForUpload: jest.fn() }));
jest.mock('../lib/meals', () => ({ insertMeal: jest.fn() }));
jest.mock('../hooks/useReducedMotion', () => ({ useReducedMotion: jest.fn(() => true) }));
jest.mock('../hooks/useAppActive', () => ({ useAppActive: jest.fn(() => true) }));

async function saveByHand(view: ReturnType<typeof render>) {
  await act(async () => { fireEvent.press(view.getByText('Type it in instead')); });
  fireEvent.changeText(view.getByPlaceholderText('e.g. Royal Canin'), 'Weruva');
  fireEvent.changeText(view.getByPlaceholderText('e.g. Gastrointestinal Adult'), 'Duck Stew');
  await act(async () => { fireEvent.press(view.getByText('Save')); });
}

beforeEach(() => {
  takeCapturedFood('e1');
});

it('add only, with a key: the saved food is offered to that meal', async () => {
  mockParams = { returnTo: 'back', handBack: 'e1' };
  const view = render(<FoodCaptureScreen />);
  await saveByHand(view);
  expect(takeCapturedFood('e1')).toEqual(expect.objectContaining({
    brand: 'Weruva', product_name: 'Duck Stew', food_type: 'meal',
  }));
});

it('add only, with no key: nothing is offered (trial foods, vet visits, the Foods tab)', async () => {
  mockParams = { returnTo: 'back' };
  const view = render(<FoodCaptureScreen />);
  await saveByHand(view);
  expect(takeCapturedFood('e1')).toBeNull();
});

it('a key beside fromLog offers nothing: that path writes a meal of its own', async () => {
  // No active pet, so this commit writes no meal and falls through to the add only exit:
  // the one place the hand back sits. Only the gate on `fromLog` keeps it from offering.
  mockParams = { fromLog: '1', handBack: 'e1' };
  const view = render(<FoodCaptureScreen />);
  await act(async () => { fireEvent.press(view.getByText('Type it in instead')); });
  fireEvent.changeText(view.getByPlaceholderText('e.g. Royal Canin'), 'Weruva');
  fireEvent.changeText(view.getByPlaceholderText('e.g. Gastrointestinal Adult'), 'Duck Stew');
  await act(async () => { fireEvent.press(view.getByText('Save and log food')); });
  expect(view.getByText('Saved to your foods')).toBeTruthy();
  expect(takeCapturedFood('e1')).toBeNull();
});
