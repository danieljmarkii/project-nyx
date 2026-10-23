// The first mix (Mixed meals row 5, CUL-2054; spec §7.1, §7.5 D-M1, §10; CUL-2133).
//
// Pinned: the route reads the bowl's first food from the record; the picker is the
// mixable-only picker with that food locked; the split rises as a sheet over the picker; a
// chip tap only picks, and Save writes the bowl through the one writer; from the card, the card comes back AS the
// mix carrying the card it left (its trial heads-up above all), and from the detail
// screen nothing is shown. A failed write is said and nothing closes.

jest.mock('../lib/supabase', () => ({ supabase: {} }));
const mockBack = jest.fn();
let mockParams: Record<string, string> = {};
const mockPush = jest.fn();
// The focus callback runs once on mount, as the route opening; `refocus()` re-runs the
// latest one, as the route coming back into view (from capture, or a food's page).
let mockFocusCb: (() => void) | null = null;
jest.mock('expo-router', () => ({
  router: { back: (...a: unknown[]) => mockBack(...a), push: (...a: unknown[]) => mockPush(...a) },
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (cb: () => void) => {
    mockFocusCb = cb;
    jest.requireActual('react').useEffect(() => { cb(); }, []);
  },
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
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

import { Alert, Modal } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import MixRoute, { CARD_RETURN_DELAY_MS } from './mix';
import { useMomentStore } from '../store/momentStore';
import { usePetStore } from '../store/petStore';
import { holdMixReturn } from '../lib/mixReturn';
import { offerCapturedFood, takeCapturedFood } from '../lib/captureHandBack';
import type { LogTimeTrialFlag } from '../lib/trialContaminant';

const RABBIT = { food_item_id: 'rabbit', food_brand: 'Weruva', food_product_name: 'Rabbit Pâté', food_type: 'meal', food_format: 'wet', intake_rating: null };
const CHICKEN = { id: 'chicken', brand: 'Weruva', product_name: 'Chicken Pâté', format: 'wet', food_type: 'meal', photo_path: null };
const FLAG: LogTimeTrialFlag = { kind: 'off_trial_list', trialId: 't1', foodId: 'rabbit', trialStartedAt: '2026-10-01', trialTargetDurationDays: 42 };

async function openAndPick() {
  const view = render(<MixRoute />);
  await act(async () => {});
  return view;
}

function pickChicken() {
  act(() => (lastPickerProps!.onPickFood as (f: unknown) => void)(CHICKEN));
}

async function pickAndSave(view: ReturnType<typeof render>, chip: string) {
  fireEvent.press(view.getByText(chip));
  await act(async () => { fireEvent.press(view.getByTestId('mix-split-save')); });
}

beforeEach(() => {
  jest.useFakeTimers();
  mockBack.mockReset();
  mockPush.mockReset();
  mockFocusCb = null;
  takeCapturedFood('e1');
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

it('backing out of the picker returns the card it left, with nothing written', async () => {
  holdMixReturn({ eventId: 'e1', petId: 'p1', occurredAt: '2026-10-21T07:30:00.000Z', foodType: 'meal', intakeRating: 'all' });
  const view = await openAndPick();
  fireEvent.press(view.getByLabelText('Back'));
  await act(async () => { jest.advanceTimersByTime(CARD_RETURN_DELAY_MS + 10); });
  expect(mockBack).toHaveBeenCalledTimes(1);
  expect(mockSet).not.toHaveBeenCalled();
  expect(useMomentStore.getState().payload).toEqual(expect.objectContaining({ eventId: 'e1', intakeRating: 'all' }));
});

it('the first food cannot be picked as the second', async () => {
  const view = await openAndPick();
  act(() => (lastPickerProps!.onPickFood as (f: unknown) => void)({ ...CHICKEN, id: 'rabbit' }));
  expect(view.queryByText('About how much of each?')).toBeNull();
});

it('the split rises over the picker as a layer, never a second Modal (C-14)', async () => {
  const view = await openAndPick();
  pickChicken();
  view.getByText('About how much of each?');
  // The picker is still mounted beneath the sheet, and no RN Modal was presented.
  expect(lastPickerProps).not.toBeNull();
  expect(view.UNSAFE_queryAllByType(Modal)).toHaveLength(0);
});

it('a chip tap only picks: nothing is written until Save, and a mistap can be re-picked', async () => {
  const view = await openAndPick();
  pickChicken();
  // Nothing preselected (§7.1), so Save starts off.
  await act(async () => { fireEvent.press(view.getByTestId('mix-split-save')); });
  expect(mockSet).not.toHaveBeenCalled();
  fireEvent.press(view.getByText('¾·¼'));
  fireEvent.press(view.getByText('½·½'));
  await act(async () => { jest.advanceTimersByTime(2000); });
  expect(mockSet).not.toHaveBeenCalled();
  expect(mockBack).not.toHaveBeenCalled();
  await act(async () => { fireEvent.press(view.getByTestId('mix-split-save')); });
  expect(mockSet).toHaveBeenCalledTimes(1);
  expect(mockSet.mock.calls[0][1][0]).toEqual(expect.objectContaining({ share: 1 / 2 }));
});

it('tapping the veil goes back to the picker with nothing written', async () => {
  const view = await openAndPick();
  pickChicken();
  fireEvent.press(view.getByText('⅓·⅔'));
  fireEvent.press(view.getByLabelText('Back to the foods'));
  await act(async () => { jest.advanceTimersByTime(1000); });
  expect(view.queryByText('About how much of each?')).toBeNull();
  expect(mockSet).not.toHaveBeenCalled();
  expect(mockBack).not.toHaveBeenCalled();
  // And a second pick opens the sheet again.
  pickChicken();
  view.getByText('About how much of each?');
});

it('from the card: Save writes the bowl, closes, and the card returns as the mix with its heads-up', async () => {
  holdMixReturn({ eventId: 'e1', petId: 'p1', occurredAt: '2026-10-21T07:30:00.000Z', foodType: 'meal', intakeRating: 'all', trialFlag: FLAG });
  const view = await openAndPick();
  pickChicken();
  await pickAndSave(view, '⅓·⅔');
  expect(mockSet).toHaveBeenCalledWith('e1', [
    expect.objectContaining({ foodItemId: 'rabbit', foodLabel: 'Weruva Rabbit Pâté', share: 1 / 3, shareSource: 'preset' }),
    expect.objectContaining({ foodItemId: 'chicken', foodLabel: 'Weruva Chicken Pâté', shareSource: 'preset' }),
  ], expect.any(Date), { headsUp: 'card' });
  // The bar already answered the pick, so Save closes at once.
  expect(mockBack).toHaveBeenCalledTimes(1);
  await act(async () => { jest.advanceTimersByTime(CARD_RETURN_DELAY_MS + 10); });
  const p = useMomentStore.getState().payload;
  expect(p).toEqual(expect.objectContaining({ kind: 'meal', eventId: 'e1', intakeRating: 'all', trialFlag: FLAG }));
  expect(p?.kind === 'meal' && p.bowl?.foods.map((f) => f.rowName)).toEqual(['Rabbit Pâté', 'Chicken Pâté']);
});

it('from the detail screen: the route closes and no card shows', async () => {
  mockParams = { event: 'e1', pet: 'p1', from: 'detail' };
  const view = await openAndPick();
  pickChicken();
  await pickAndSave(view, '½·½');
  // CUL-2088: with no card to land on, the bowl's trial heads-up waits for the meal's screen.
  expect(mockSet).toHaveBeenCalledWith('e1', expect.any(Array), expect.any(Date), { headsUp: 'meal_screen' });
  await act(async () => { jest.advanceTimersByTime(CARD_RETURN_DELAY_MS + 10); });
  expect(mockBack).toHaveBeenCalledTimes(1);
  expect(useMomentStore.getState().payload).toBeNull();
});

it('a failed write is said, the step stays open, and the pick is kept for another Save', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  mockSet.mockRejectedValueOnce(new Error('disk'));
  const view = await openAndPick();
  pickChicken();
  await pickAndSave(view, '¾·¼');
  expect(alert).toHaveBeenCalledWith('Couldn’t save that', 'Something went wrong. Please try again.');
  expect(mockBack).not.toHaveBeenCalled();
  view.getByText('About how much of each?');
  await act(async () => { fireEvent.press(view.getByTestId('mix-split-save')); });
  expect(mockSet).toHaveBeenCalledTimes(2);
  expect(mockBack).toHaveBeenCalledTimes(1);
  alert.mockRestore();
});

it('Other amounts: one unit for both, and no save until both are above zero', async () => {
  const view = await openAndPick();
  pickChicken();
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
  ], expect.any(Date), { headsUp: 'card' });
});

// CUL-2089 (mock A1/A2): a food that isn't in the picker yet is added from it, and comes back
// to the bowl that asked.
describe('a food added from the bowl picker', () => {
  const DUCK = { id: 'new1', brand: 'Weruva', product_name: 'Duck Stew', format: 'wet', food_type: 'meal', photo_path: null };
  const refocus = () => act(() => { mockFocusCb!(); });

  it('opens capture in its add only mode, keyed to this meal', async () => {
    await openAndPick();
    act(() => (lastPickerProps!.onAddNew as () => void)());
    expect(mockPush).toHaveBeenCalledWith('/food-capture?returnTo=back&handBack=e1');
    // Never the meal log path, which would write a meal of its own.
    expect(mockPush.mock.calls[0][0]).not.toContain('fromLog');
  });

  it('the saved food comes back and the split rises with it', async () => {
    const view = await openAndPick();
    offerCapturedFood('e1', DUCK);
    refocus();
    view.getByText('About how much of each?');
    view.getByText('Duck Stew');
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('a food saved as a treat, topper or "Other" lands on the picker, not in the bowl', async () => {
    const view = await openAndPick();
    for (const f of [
      { ...DUCK, food_type: 'treat' },
      { ...DUCK, format: 'topper' },
      { ...DUCK, food_type: 'other' },
    ]) {
      offerCapturedFood('e1', f);
      refocus();
      expect(view.queryByText('About how much of each?')).toBeNull();
    }
  });

  it('a food offered for another meal is never taken by this one', async () => {
    const view = await openAndPick();
    offerCapturedFood('e2', DUCK);
    refocus();
    expect(view.queryByText('About how much of each?')).toBeNull();
    expect(takeCapturedFood('e2')).toEqual(DUCK);
  });

  it('an offer left from a capture that never came back is dropped when the route opens', async () => {
    offerCapturedFood('e1', DUCK);
    const view = await openAndPick();
    refocus();
    expect(view.queryByText('About how much of each?')).toBeNull();
  });

  it('a food not set as a meal opens its own page to set the type', async () => {
    await openAndPick();
    act(() => (lastPickerProps!.onOpenDetail as (f: unknown) => void)(DUCK));
    expect(mockPush).toHaveBeenCalledWith('/food/new1');
  });
});
