// The first mix (Mixed meals row 5, CUL-2054; spec §7.1, §7.5 D-M1/D-M2, §10).
//
// Pinned: the route reads the bowl's first food from the record; the picker is the
// mixable-only picker with that food locked; a chip tap writes the bowl through the one
// writer; the step holds while the bar draws; from the card, the card comes back AS the
// mix carrying the card it left (its trial heads-up above all), and from the detail
// screen nothing is shown. A failed write is said and nothing closes.

jest.mock('../lib/supabase', () => ({ supabase: {} }));
const mockBack = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  router: { back: (...a: unknown[]) => mockBack(...a), push: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View };
});
const mockGetMeal = jest.fn();
jest.mock('../lib/db', () => ({ getMealForEvent: (...a: unknown[]) => mockGetMeal(...a) }));
const mockSet = jest.fn();
jest.mock('../lib/mealComponents', () => ({ setMealComponents: (...a: unknown[]) => mockSet(...a) }));
let lastPickerProps: Record<string, unknown> | null = null;
jest.mock('../components/log/FoodPicker', () => ({
  FoodPicker: (props: Record<string, unknown>) => {
    lastPickerProps = props;
    return null;
  },
}));

import { Alert } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import MixRoute, { CARD_RETURN_DELAY_MS } from './mix';
import { SPLIT_HOLD_MS } from '../components/log/MixSplitPanel';
import { useMomentStore } from '../store/momentStore';
import { usePetStore } from '../store/petStore';
import { holdMixReturn } from '../lib/mixReturn';
import type { LogTimeTrialFlag } from '../lib/trialContaminant';

const RABBIT = { food_item_id: 'rabbit', food_brand: 'Weruva', food_product_name: 'Rabbit Pâté', food_type: 'meal', food_format: 'wet', intake_rating: null };
const CHICKEN = { id: 'chicken', brand: 'Weruva', product_name: 'Chicken Pâté', format: 'wet', food_type: 'meal', photo_path: null };
const FLAG: LogTimeTrialFlag = { kind: 'off_trial_list', trialId: 't1', foodId: 'rabbit', trialStartedAt: '2026-10-01', trialTargetDurationDays: 42 };

async function openAndPick() {
  const view = render(<MixRoute />);
  await act(async () => {});
  return view;
}

beforeEach(() => {
  jest.useFakeTimers();
  mockBack.mockReset();
  mockSet.mockReset().mockResolvedValue({ food_item_id: null, component_count: 2 });
  mockGetMeal.mockReset().mockResolvedValue(RABBIT);
  lastPickerProps = null;
  usePetStore.setState({ pets: [{ id: 'p1', name: 'Pixel' }] as never });
  useMomentStore.setState({ visible: false, payload: null, removed: false });
  mockParams = { event: 'e1', pet: 'p1', from: 'card' };
});
afterEach(() => jest.useRealTimers());

it('names the bowl, locks its first food and offers meal foods only', async () => {
  const view = await openAndPick();
  view.getByText('Mixing with Rabbit Pâté in Pixel’s bowl. Pick the other food.');
  expect(lastPickerProps).toEqual(expect.objectContaining({ petId: 'p1', selectedFoodIds: ['rabbit'], mixableOnly: true }));
});

it('the first food cannot be picked as the second', async () => {
  const view = await openAndPick();
  act(() => (lastPickerProps!.onPickFood as (f: unknown) => void)({ ...CHICKEN, id: 'rabbit' }));
  expect(view.queryByText('About how much of each?')).toBeNull();
});

it('from the card: a chip writes the bowl, holds, and the card returns as the mix with its heads-up', async () => {
  holdMixReturn({ eventId: 'e1', petId: 'p1', occurredAt: '2026-10-21T07:30:00.000Z', foodType: 'meal', intakeRating: 'all', trialFlag: FLAG });
  const view = await openAndPick();
  act(() => (lastPickerProps!.onPickFood as (f: unknown) => void)(CHICKEN));
  view.getByText('About how much of each?');
  // Nothing preselected (§7.1).
  await act(async () => { fireEvent.press(view.getByText('⅓·⅔')); });
  expect(mockSet).toHaveBeenCalledWith('e1', [
    expect.objectContaining({ foodItemId: 'rabbit', foodLabel: 'Weruva Rabbit Pâté', share: 1 / 3, shareSource: 'preset' }),
    expect.objectContaining({ foodItemId: 'chicken', foodLabel: 'Weruva Chicken Pâté', shareSource: 'preset' }),
  ]);
  // D-M2: the step holds while the bar draws.
  expect(mockBack).not.toHaveBeenCalled();
  await act(async () => { jest.advanceTimersByTime(SPLIT_HOLD_MS); });
  expect(mockBack).toHaveBeenCalledTimes(1);
  await act(async () => { jest.advanceTimersByTime(CARD_RETURN_DELAY_MS + 10); });
  const p = useMomentStore.getState().payload;
  expect(p).toEqual(expect.objectContaining({ kind: 'meal', eventId: 'e1', intakeRating: 'all', trialFlag: FLAG }));
  expect(p?.kind === 'meal' && p.bowl?.foods.map((f) => f.rowName)).toEqual(['Rabbit Pâté', 'Chicken Pâté']);
});

it('from the detail screen: the route closes and no card shows', async () => {
  mockParams = { event: 'e1', pet: 'p1', from: 'detail' };
  const view = await openAndPick();
  act(() => (lastPickerProps!.onPickFood as (f: unknown) => void)(CHICKEN));
  await act(async () => { fireEvent.press(view.getByText('½·½')); });
  await act(async () => { jest.advanceTimersByTime(SPLIT_HOLD_MS + CARD_RETURN_DELAY_MS + 10); });
  expect(mockBack).toHaveBeenCalledTimes(1);
  expect(useMomentStore.getState().payload).toBeNull();
});

it('a failed write is said, and the step stays open', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  mockSet.mockRejectedValueOnce(new Error('disk'));
  const view = await openAndPick();
  act(() => (lastPickerProps!.onPickFood as (f: unknown) => void)(CHICKEN));
  await act(async () => { fireEvent.press(view.getByText('¾·¼')); });
  await act(async () => { jest.advanceTimersByTime(SPLIT_HOLD_MS + 10); });
  expect(alert).toHaveBeenCalledWith('Couldn’t save that', 'Something went wrong. Please try again.');
  expect(mockBack).not.toHaveBeenCalled();
  view.getByText('About how much of each?');
  alert.mockRestore();
});

it('Other amounts: one unit for both, and no save until both are above zero', async () => {
  const view = await openAndPick();
  act(() => (lastPickerProps!.onPickFood as (f: unknown) => void)(CHICKEN));
  fireEvent.press(view.getByText('Other amounts…'));
  view.getByText('Amounts, as you measured them');
  fireEvent.press(view.getByText('Cans'));
  fireEvent.changeText(view.getByLabelText('Rabbit Pâté, amount in cans'), '0.25');
  fireEvent.changeText(view.getByLabelText('Chicken Pâté, amount in cans'), '0');
  await act(async () => { fireEvent.press(view.getByTestId('mix-amounts-save')); });
  expect(mockSet).not.toHaveBeenCalled();
  fireEvent.changeText(view.getByLabelText('Chicken Pâté, amount in cans'), '0.5');
  await act(async () => { fireEvent.press(view.getByTestId('mix-amounts-save')); });
  expect(mockSet).toHaveBeenCalledWith('e1', [
    expect.objectContaining({ shareSource: 'amounts', amountValue: 0.25, amountUnit: 'can' }),
    expect.objectContaining({ shareSource: 'amounts', amountValue: 0.5, amountUnit: 'can' }),
  ]);
});
