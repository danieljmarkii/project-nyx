// B-693 PR 2 — the meal completion card's two trial-flag registers, rendered.
//
// The lib layer owns the DECISION (which kind fires, its copy, its day-math):
// lib/trialContaminant.test.ts + lib/trialLogTimeFlag.test.ts. The store owns the
// hand-off: store/momentStore.test.ts. The add sheet owns its own render + the
// write is lib/dietTrialSetup.test.ts. What ONLY a rendered card can answer, and
// what this suite owns:
//   • the amber MEMBERSHIP panel actually draws its eyebrow, headline and the
//     "+ Add to the trial list" hatch — a flag the card forgot to render is the
//     exact way the PM's dogfood gap would silently return;
//   • the CONTENTS flag still renders its calm form and NOT the amber eyebrow —
//     the two registers do not bleed;
//   • tapping the hatch opens the shipped confirm sheet and, on confirm, writes
//     the RIGHT food to the RIGHT trial and the MEAL's pet — even when the active
//     pet has since been switched (the queue-then-switch wrong-pet guard).

// Stub the edges of the module graph the card pulls in. lib/dietTrialSetup is
// mocked so the write is assertable without SQLite; buildAddTrialFoodSheet is
// stubbed so the sheet renders without the analytics/day-math chain (its real
// output is covered by lib/trialFoodsScreen.test.ts + AddTrialFoodSheet.test.tsx).
jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../lib/db', () => ({ updateEvent: jest.fn(), updateMealIntake: jest.fn() }));
jest.mock('../../lib/undoLog', () => ({ reverseLoggedEvent: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../lib/sync', () => ({
  syncPendingEvents: jest.fn().mockResolvedValue(undefined),
  syncPendingMeals: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');

const mockAddTrialFood = jest.fn().mockResolvedValue('new-row-id');
jest.mock('../../lib/dietTrialSetup', () => ({
  addTrialFood: (args: unknown) => mockAddTrialFood(args),
  foodLabel: (f: { brand?: string; product_name?: string }) =>
    `${f.brand ?? ''} ${f.product_name ?? ''}`.trim(),
}));
jest.mock('../../lib/trialFoodsScreen', () => ({
  ADD_TRIAL_FOOD_ERROR: 'That didn’t save. Try again in a moment.',
  buildAddTrialFoodSheet: (petName: string, label: string) => ({
    title: `Add to ${petName}’s trial list?`,
    rows: [
      { label: 'Food', value: label },
      { label: 'Joins the list', value: 'Today · day 5' },
      { label: 'Earlier feedings', value: 'Keep the reading they already have' },
    ],
    caption: 'Extras are your vet’s call — Culprit just records the dates.',
    confirmLabel: 'Add to the list',
    cancelLabel: 'Not now',
  }),
}));

import { Alert } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { MealCompletionCard } from './MealCompletionCard';
import { useMomentStore } from '../../store/momentStore';
import { usePetStore } from '../../store/petStore';
import type { LogTimeTrialFlag } from '../../lib/trialContaminant';
import { reverseLoggedEvent } from '../../lib/undoLog';

const MEMBERSHIP_FLAG: LogTimeTrialFlag = {
  kind: 'off_trial_list',
  trialId: 'trial-1',
  foodId: 'food-9',
  trialStartedAt: '2026-06-01',
  trialTargetDurationDays: 84,
};

const CONTENTS_FLAG: LogTimeTrialFlag = {
  kind: 'off_diet_protein',
  proteins: ['chicken'],
  trialProteins: ['duck'],
  trialId: 'trial-1',
  foodId: 'food-9',
};

type MealOver = Partial<Parameters<ReturnType<typeof useMomentStore.getState>['showMeal']>[0]>;

function seedMeal(over: MealOver = {}, activePetId = 'p1') {
  usePetStore.setState({
    pets: [
      { id: 'p1', name: 'Biscuit' },
      { id: 'p2', name: 'Mochi' },
    ] as never,
    activePet: { id: activePetId, name: activePetId === 'p1' ? 'Biscuit' : 'Mochi' } as never,
  });
  act(() => {
    useMomentStore.getState().showMeal({
      eventId: 'e1',
      petId: 'p1',
      occurredAt: '2026-06-07T14:00:00.000Z',
      foodType: 'treat',
      foodBrand: 'PetCo',
      foodProductName: 'Dental Treats',
      intakeRating: null,
      ...over,
    });
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  useMomentStore.getState().hide();
  useMomentStore.setState({ payload: null, removed: false });
  (reverseLoggedEvent as jest.Mock).mockResolvedValue(undefined);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('MealCompletionCard — the two trial-flag registers (B-693)', () => {
  it('renders the amber MEMBERSHIP panel: eyebrow, headline, and the add hatch', () => {
    seedMeal({ trialFlag: MEMBERSHIP_FLAG });
    const { getByText } = render(<MealCompletionCard />);
    getByText('Off the trial list');
    getByText('This one isn’t on Biscuit’s trial list.');
    getByText('+ Add to the trial list');
  });

  it('renders the CONTENTS flag in its calm form — never the amber eyebrow', () => {
    seedMeal({ trialFlag: CONTENTS_FLAG });
    const { getByText, queryByText } = render(<MealCompletionCard />);
    getByText('This one has chicken.');
    // The two registers do not bleed: a contents flag never shows the membership
    // panel's eyebrow or its add hatch.
    expect(queryByText('Off the trial list')).toBeNull();
    expect(queryByText('+ Add to the trial list')).toBeNull();
  });

  it('renders no trial block at all when the flag is absent (never an all-clear)', () => {
    seedMeal();
    const { queryByText } = render(<MealCompletionCard />);
    expect(queryByText('Off the trial list')).toBeNull();
    expect(queryByText('+ Add to the trial list')).toBeNull();
    // No "no conflict" / all-clear copy exists to render.
    expect(queryByText(/no conflict|on the list/i)).toBeNull();
  });

  it('tapping "+ Add to the trial list" opens the shipped confirm sheet', () => {
    seedMeal({ trialFlag: MEMBERSHIP_FLAG });
    const { getByText, getByTestId } = render(<MealCompletionCard />);
    act(() => {
      fireEvent.press(getByText('+ Add to the trial list'));
    });
    // The shipped AddTrialFoodSheet — named for the meal's pet, carrying the food.
    getByTestId('add-trial-food-sheet');
    getByText('Add to Biscuit’s trial list?');
    getByText('PetCo Dental Treats');
  });

  it('confirming writes the flagged food to the flag\'s trial and the MEAL\'s pet', async () => {
    // The active pet is switched to p2 AFTER the meal (queue-then-switch), but the
    // add must still land on p1 (the meal's pet) and trial-1 (the flag's trial),
    // captured from the flag/payload — never a re-read active pet.
    seedMeal({ trialFlag: MEMBERSHIP_FLAG }, 'p2');
    const { getByText, getByTestId } = render(<MealCompletionCard />);
    act(() => {
      fireEvent.press(getByText('+ Add to the trial list'));
    });
    await act(async () => {
      fireEvent.press(getByTestId('add-trial-food-confirm'));
    });
    expect(mockAddTrialFood).toHaveBeenCalledTimes(1);
    expect(mockAddTrialFood).toHaveBeenCalledWith({
      trialId: 'trial-1',
      petId: 'p1',
      food: { id: 'food-9', brand: 'PetCo', product_name: 'Dental Treats', food_type: 'treat' },
    });
  });

  it('surfaces an error in-place on a failed write and does NOT close the sheet', async () => {
    // The card logs the failure by design; silence it so the intentional rejection
    // doesn't clutter the run.
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockAddTrialFood.mockRejectedValueOnce(new Error('device write failed'));
    seedMeal({ trialFlag: MEMBERSHIP_FLAG });
    const { getByText, getByTestId, queryByTestId } = render(<MealCompletionCard />);
    act(() => {
      fireEvent.press(getByText('+ Add to the trial list'));
    });
    await act(async () => {
      fireEvent.press(getByTestId('add-trial-food-confirm'));
    });
    // The sheet stays open (a silent close would leave the owner believing a food
    // is on the list when the record says otherwise) and renders the error.
    expect(queryByTestId('add-trial-food-sheet')).not.toBeNull();
    getByTestId('add-trial-food-error');
    errSpy.mockRestore();
  });
});


// ── Undo (CUL-612 · §5) ──────────────────────────────────────────────────────
//
// The reversal's mechanics are momentStore.test.ts's. What only this card can
// answer: that the removal line takes the WHOLE body with it. The meal card is
// the densest of the three — intake chips, both trial registers, the combo line —
// and every one of those is an offer to add something to a meal that, after Undo,
// is no longer in the record.
describe('MealCompletionCard — Undo', () => {
  async function pressUndo(view: ReturnType<typeof render>) {
    await act(async () => { fireEvent.press(view.getByLabelText('Undo — remove this log')); });
  }

  it('removes the meal and swaps the card to its removal line', async () => {
    seedMeal();
    const view = render(<MealCompletionCard />);
    await pressUndo(view);
    expect(reverseLoggedEvent).toHaveBeenCalledWith('e1');
    view.getByText('Removed');
    view.getByText('Taken out of Biscuit’s record');
  });

  it('takes the intake question with it — nothing asks how much of a removed meal was eaten', async () => {
    seedMeal({ foodType: 'meal' });
    const view = render(<MealCompletionCard />);
    view.getByText('How much did Biscuit eat?');
    await pressUndo(view);
    expect(view.queryByText('How much did Biscuit eat?')).toBeNull();
  });

  it('takes the trial heads-up and its add hatch with it', async () => {
    // The amber panel is a claim about a meal ("this one isn't on the trial
    // list"). Left standing over a removed meal it would be a claim about a row
    // that is gone — and the hatch would offer to add a food on its account.
    seedMeal({ trialFlag: MEMBERSHIP_FLAG });
    const view = render(<MealCompletionCard />);
    view.getByText('+ Add to the trial list');
    await pressUndo(view);
    expect(view.queryByText('Off the trial list')).toBeNull();
    expect(view.queryByText('+ Add to the trial list')).toBeNull();
  });

  it('takes the combo line with it — no adding a dose against a removed meal', async () => {
    seedMeal({ foodType: 'meal' });
    const view = render(<MealCompletionCard />);
    view.getByText('+ Add a med given with this');
    await pressUndo(view);
    expect(view.queryByText('+ Add a med given with this')).toBeNull();
  });

  it('names the MEAL’s pet, not a since-switched active one', async () => {
    seedMeal({}, 'p2');
    const view = render(<MealCompletionCard />);
    await pressUndo(view);
    view.getByText('Taken out of Biscuit’s record');
  });

  it('on a FAILED write, keeps the card intact rather than claiming a reversal', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    (reverseLoggedEvent as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
    seedMeal({ foodType: 'meal' });
    const view = render(<MealCompletionCard />);
    await pressUndo(view);
    expect(view.queryByText('Removed')).toBeNull();
    view.getByText('How much did Biscuit eat?');
    expect(alert.mock.calls[0][0]).toBe('Could not remove that log');
    alert.mockRestore();
  });
});

// ── CUL-614 · §5 "Dwell" — the WIRING ────────────────────────────────────────
// See the twin block in MedicationCompletionCard.test.tsx for the full reasoning. In
// short: store/momentStore.test.ts proves the state machine, and cannot see this
// file's two lines of JSX — so a swapped or dropped touch handler would leave every
// store test green while the card dismissed under the owner's finger.
//
// The meal card is here for its own sake, not for symmetry: the WSAVA intake row is
// five chips answered from a single reading pause, and it re-armed the same 1500ms
// hold the dose row did.
describe('MealCompletionCard — one card, one pet (CUL-574)', () => {
  // The card outlives a pet switch: it is queued against the pet captured at write
  // time, and the store can move under it. Every name on it must come from the
  // payload's petId. These two sites read the ACTIVE pet until CUL-574 — so a card
  // about Biscuit's treat asked how much MOCHI ate, while the removal line and the
  // trial heads-up on the same card said Biscuit.
  it('the intake question names the MEAL’s pet, not a since-switched active one', () => {
    seedMeal({}, 'p2');
    const view = render(<MealCompletionCard />);
    view.getByText('How much did Biscuit eat?');
    expect(view.queryByText('How much did Mochi eat?')).toBeNull();
  });

  it('the combo row’s screen-reader label names the MEAL’s pet too', () => {
    seedMeal({}, 'p2');
    const view = render(<MealCompletionCard />);
    view.getByLabelText(/given with Biscuit's/);
    expect(view.queryByLabelText(/given with Mochi's/)).toBeNull();
  });

  // `pets` holds only non-archived pets, so archiving the meal's pet makes the
  // lookup miss. It must fall to the anonymous form — the `?? activePet` rung this
  // line used to carry would have named Mochi here, which is the whole defect.
  it('falls to the anonymous form when the meal’s pet is gone, never to the active one', () => {
    seedMeal({}, 'p2');
    act(() => {
      usePetStore.setState({ pets: [{ id: 'p2', name: 'Mochi' }] as never });
    });
    const view = render(<MealCompletionCard />);
    view.getByText('How much did your pet eat?');
    expect(view.queryByText('How much did Mochi eat?')).toBeNull();
  });
});

describe('MealCompletionCard — the dwell pause is actually wired (CUL-614)', () => {
  it('a finger on the card holds it open past its dwell', () => {
    seedMeal();
    const { getByTestId } = render(<MealCompletionCard />);
    fireEvent(getByTestId('meal-card-surface'), 'touchStart');
    act(() => { jest.advanceTimersByTime(15_000); });
    expect(useMomentStore.getState().visible).toBe(true);
  });

  it('lifting the finger restores a window, so the card still dismisses', () => {
    seedMeal();
    const { getByTestId } = render(<MealCompletionCard />);
    const card = getByTestId('meal-card-surface');
    fireEvent(card, 'touchStart');
    fireEvent(card, 'touchEnd');
    act(() => { jest.advanceTimersByTime(4999); });
    expect(useMomentStore.getState().visible).toBe(true);
    act(() => { jest.advanceTimersByTime(2); });
    expect(useMomentStore.getState().visible).toBe(false);
  });

  it('a CANCELLED gesture resumes too — the responder can end a touch elsewhere', () => {
    seedMeal();
    const { getByTestId } = render(<MealCompletionCard />);
    const card = getByTestId('meal-card-surface');
    fireEvent(card, 'touchStart');
    fireEvent(card, 'touchCancel');
    act(() => { jest.advanceTimersByTime(5001); });
    expect(useMomentStore.getState().visible).toBe(false);
  });
});
