// CUL-2088 — the trial heads-up line on a meal's own screen, against the REAL meal-screen
// store and the REAL one-per-food ledger (AsyncStorage's jest mock).
//
// The ledger rule the card holds, held here too: spend only once the line is on screen
// (focused, the meal still holds the food, the food still unspent), never twice for one
// food, and a heads-up that is never shown spends nothing.

jest.mock('../../lib/supabase', () => ({ supabase: {} }));
let mockFocused = true;
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a) },
  useIsFocused: () => mockFocused,
}));
const mockRunning = jest.fn();
jest.mock('../../lib/trialContaminant', () => ({
  ...jest.requireActual('../../lib/trialContaminant'),
  isRunningTrialForPet: (...a: unknown[]) => mockRunning(...a),
}));
const mockAddTrialFood = jest.fn();
jest.mock('../../lib/dietTrialSetup', () => ({
  ...jest.requireActual('../../lib/dietTrialSetup'),
  addTrialFood: (...a: unknown[]) => mockAddTrialFood(...a),
}));

import { AccessibilityInfo } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TrialHeadsUpLine } from './TrialHeadsUpLine';
import { useMealScreenFlagStore } from '../../store/mealScreenFlagStore';
import {
  clearTrialHeadsUpLedger,
  hasFlaggedFoodInTrial,
  noteTrialFlagShown,
  type LogTimeTrialFlag,
} from '../../lib/trialContaminant';

const TRIAL = 'trial-1';
const EVENT = 'evt-1';

const CONTENTS: LogTimeTrialFlag = {
  kind: 'off_diet_protein',
  trialId: TRIAL,
  foodId: 'chicken',
  proteins: ['chicken'],
  trialProteins: ['rabbit'],
  bowl: { foodLabel: 'Chicken Pâté', pastTarget: false },
};
const OFF_LIST: LogTimeTrialFlag = {
  kind: 'off_trial_list',
  trialId: TRIAL,
  foodId: 'turkey',
  trialStartedAt: '2026-10-01T07:00:00.000Z',
  trialTargetDurationDays: 42,
};
const PAST: LogTimeTrialFlag = {
  ...CONTENTS,
  bowl: { foodLabel: 'Chicken Pâté', pastTarget: true, trialLabel: 'Rabbit trial', targetDays: 42 },
};
const TURKEY = { id: 'turkey', brand: 'Hill’s', product_name: 'Turkey', food_type: 'meal' };

const mockReveal = jest.fn();
function line(mealFoodIds: string[] | null, revealReady = true, petName = 'Pixel') {
  return (
    <TrialHeadsUpLine
      eventId={EVENT} petId="pet-1" petName={petName} mealFoodIds={mealFoodIds}
      reveal={mockReveal} revealReady={revealReady}
    />
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  mockFocused = true;
  mockAddTrialFood.mockResolvedValue('row-1');
  mockReveal.mockResolvedValue(true);
  mockRunning.mockResolvedValue(true);
  await AsyncStorage.clear();
  await clearTrialHeadsUpLedger();
  useMealScreenFlagStore.getState().reset();
});

describe('the heads-up line on the meal\'s screen (CUL-2088)', () => {
  it('shows the card\'s sentence for the edit, and spends the food once it shows', async () => {
    useMealScreenFlagStore.getState().put(EVENT, { flag: CONTENTS, food: null });
    const view = render(line(['rabbit', 'chicken']));
    await view.findByText('This bowl has chicken in it, from Chicken Pâté.');
    view.getByText('Pixel’s rabbit trial should skip chicken. The change is saved and counts in the trial record. Maybe a note for your vet.');
    await waitFor(async () => expect(await hasFlaggedFoodInTrial(TRIAL, 'chicken')).toBe(true));
    // Taken: one line per waiting heads-up.
    expect(useMealScreenFlagStore.getState().pending[EVENT]).toBeUndefined();
    // A contents flag carries no door, as on the card.
    expect(view.queryByText(/^\+ /)).toBeNull();
  });

  it('rendered is not seen: below the fold and never brought into view, it spends nothing', async () => {
    mockReveal.mockResolvedValue(false);
    useMealScreenFlagStore.getState().put(EVENT, { flag: CONTENTS, food: null });
    const view = render(line(['chicken']));
    await view.findByText('This bowl has chicken in it, from Chicken Pâté.');
    await waitFor(() => expect(mockReveal).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(await hasFlaggedFoodInTrial(TRIAL, 'chicken')).toBe(false);
  });

  it('brought into view, it is spent and announced', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    useMealScreenFlagStore.getState().put(EVENT, { flag: CONTENTS, food: null });
    render(line(['chicken']));
    await waitFor(async () => expect(await hasFlaggedFoodInTrial(TRIAL, 'chicken')).toBe(true));
    expect(announce).toHaveBeenCalledWith(
      'This bowl has chicken in it, from Chicken Pâté. Pixel’s rabbit trial should skip chicken. The change is saved and counts in the trial record. Maybe a note for your vet.',
    );
    announce.mockRestore();
  });

  it('leaving during the reveal spends nothing; coming back reveals again and spends once', async () => {
    let release: (seen: boolean) => void = () => undefined;
    mockReveal.mockImplementationOnce(() => new Promise<boolean>((r) => { release = r; }));
    useMealScreenFlagStore.getState().put(EVENT, { flag: CONTENTS, food: null });
    const view = render(line(['chicken']));
    await view.findByText('This bowl has chicken in it, from Chicken Pâté.');
    await waitFor(() => expect(mockReveal).toHaveBeenCalledTimes(1));
    mockFocused = false;
    view.rerender(line(['chicken']));
    await act(async () => { release(true); });
    expect(await hasFlaggedFoodInTrial(TRIAL, 'chicken')).toBe(false);
    mockFocused = true;
    view.rerender(line(['chicken']));
    await waitFor(async () => expect(await hasFlaggedFoodInTrial(TRIAL, 'chicken')).toBe(true));
    expect(mockReveal).toHaveBeenCalledTimes(2);
  });

  it('waits while the layout above can still move it, then reveals', async () => {
    useMealScreenFlagStore.getState().put(EVENT, { flag: CONTENTS, food: null });
    const view = render(line(['chicken'], false));
    await view.findByText('This bowl has chicken in it, from Chicken Pâté.');
    await act(async () => {});
    expect(mockReveal).not.toHaveBeenCalled();
    expect(await hasFlaggedFoodInTrial(TRIAL, 'chicken')).toBe(false);
    view.rerender(line(['chicken'], true));
    await waitFor(async () => expect(await hasFlaggedFoodInTrial(TRIAL, 'chicken')).toBe(true));
  });

  it('a pet name arriving late, or a refocus, never announces a spent heads-up again', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    useMealScreenFlagStore.getState().put(EVENT, { flag: CONTENTS, food: null });
    const view = render(line(['chicken'], true, 'your pet'));
    await waitFor(() => expect(announce).toHaveBeenCalledTimes(1));
    view.rerender(line(['chicken'], true, 'Pixel'));
    mockFocused = false;
    view.rerender(line(['chicken'], true, 'Pixel'));
    mockFocused = true;
    view.rerender(line(['chicken'], true, 'Pixel'));
    await act(async () => {});
    expect(announce).toHaveBeenCalledTimes(1);
    expect(mockReveal).toHaveBeenCalledTimes(1);
    announce.mockRestore();
  });

  it('a heads-up whose trial has ended is dropped, never offering to end the next one', async () => {
    mockRunning.mockResolvedValue(false);
    useMealScreenFlagStore.getState().put(EVENT, { flag: PAST, food: null });
    const view = render(line(['chicken']));
    await waitFor(() => expect(useMealScreenFlagStore.getState().pending[EVENT]).toBeUndefined());
    expect(view.queryByText('+ End the trial')).toBeNull();
    expect(mockRunning).toHaveBeenCalledWith('pet-1', TRIAL);
  });

  it('never twice: a remount after it showed shows nothing', async () => {
    useMealScreenFlagStore.getState().put(EVENT, { flag: CONTENTS, food: null });
    const first = render(line(['chicken']));
    await first.findByText('This bowl has chicken in it, from Chicken Pâté.');
    first.unmount();
    const again = render(line(['chicken']));
    await act(async () => {});
    expect(again.queryByText('This bowl has chicken in it, from Chicken Pâté.')).toBeNull();
  });

  it('waits while the screen is not in front of the owner, spending nothing', async () => {
    mockFocused = false;
    useMealScreenFlagStore.getState().put(EVENT, { flag: CONTENTS, food: null });
    const view = render(line(['chicken']));
    await act(async () => {});
    expect(view.queryByText('This bowl has chicken in it, from Chicken Pâté.')).toBeNull();
    expect(await hasFlaggedFoodInTrial(TRIAL, 'chicken')).toBe(false);
    expect(useMealScreenFlagStore.getState().pending[EVENT]).toBeDefined();
    mockFocused = true;
    view.rerender(line(['chicken']));
    await view.findByText('This bowl has chicken in it, from Chicken Pâté.');
  });

  it('waits for the screen\'s own read of the meal before deciding', async () => {
    useMealScreenFlagStore.getState().put(EVENT, { flag: CONTENTS, food: null });
    const view = render(line(null));
    await act(async () => {});
    expect(view.queryByText('This bowl has chicken in it, from Chicken Pâté.')).toBeNull();
    expect(useMealScreenFlagStore.getState().pending[EVENT]).toBeDefined();
  });

  it('a food the screen\'s read does not show yet keeps waiting, unspent, until a fresh read does', async () => {
    // Back from the edit screen, focus can arrive before the re-read replaces the old food.
    useMealScreenFlagStore.getState().put(EVENT, { flag: CONTENTS, food: null });
    const view = render(line(['rabbit']));
    await act(async () => {});
    expect(view.queryByText('This bowl has chicken in it, from Chicken Pâté.')).toBeNull();
    expect(useMealScreenFlagStore.getState().pending[EVENT]).toBeDefined();
    expect(await hasFlaggedFoodInTrial(TRIAL, 'chicken')).toBe(false);
    view.rerender(line(['rabbit', 'chicken']));
    await view.findByText('This bowl has chicken in it, from Chicken Pâté.');
  });

  it('a food already spoken for since (a card elsewhere) stays quiet', async () => {
    await noteTrialFlagShown(CONTENTS, 'evt-other');
    useMealScreenFlagStore.getState().put(EVENT, { flag: CONTENTS, food: null });
    const view = render(line(['chicken']));
    await waitFor(() => expect(useMealScreenFlagStore.getState().pending[EVENT]).toBeUndefined());
    expect(view.queryByText('This bowl has chicken in it, from Chicken Pâté.')).toBeNull();
  });

  it('the line holds still through a refocus re-read, and goes with the food when an edit takes it out', async () => {
    useMealScreenFlagStore.getState().put(EVENT, { flag: CONTENTS, food: null });
    const view = render(line(['chicken']));
    await view.findByText('This bowl has chicken in it, from Chicken Pâté.');
    view.rerender(line(null));
    view.getByText('This bowl has chicken in it, from Chicken Pâté.');
    view.rerender(line(['rabbit']));
    expect(view.queryByText('This bowl has chicken in it, from Chicken Pâté.')).toBeNull();
  });

  it('off the list: the card\'s eyebrow and its add door, which writes for the meal\'s pet', async () => {
    useMealScreenFlagStore.getState().put(EVENT, { flag: OFF_LIST, food: TURKEY });
    const view = render(line(['turkey']));
    await view.findByText('This one isn’t on Pixel’s trial list.');
    view.getByText('Off the trial list');
    view.getByLabelText('Off the trial list. This one isn’t on Pixel’s trial list. The change is saved and counts in the trial record. If your vet okayed this food, adding it to the list keeps the record straight.');
    view.getByText('The change is saved and counts in the trial record. If your vet okayed this food, adding it to the list keeps the record straight.');
    fireEvent.press(view.getByText('+ Add to the trial list'));
    view.getByText('Add to Pixel’s trial list?');
    await act(async () => { fireEvent.press(view.getByText('Add to the list')); });
    expect(mockAddTrialFood).toHaveBeenCalledWith({ trialId: TRIAL, petId: 'pet-1', food: TURKEY });
    expect(view.queryByText('This one isn’t on Pixel’s trial list.')).toBeNull();
  });

  it('off the list with no food row on this phone: the line, without a door it cannot open', async () => {
    useMealScreenFlagStore.getState().put(EVENT, { flag: OFF_LIST, food: null });
    const view = render(line(['turkey']));
    await view.findByText('This one isn’t on Pixel’s trial list.');
    expect(view.queryByText('+ Add to the trial list')).toBeNull();
  });

  it('past the target: the card\'s eyebrow and the door to the trial\'s end sheet', async () => {
    useMealScreenFlagStore.getState().put(EVENT, { flag: PAST, food: null });
    const view = render(line(['chicken']));
    await view.findByText('Rabbit trial · past its 42 days');
    view.getByText('The change is saved and counts in the trial record. If Pixel’s trial is over, ending it keeps the record straight.');
    fireEvent.press(view.getByText('+ End the trial'));
    expect(mockPush).toHaveBeenCalledWith('/trial/pet-1?open=end');
    // Taken, the door leaves with its line: no live "End the trial" on an ended trial.
    expect(view.queryByText('+ End the trial')).toBeNull();
  });
});
