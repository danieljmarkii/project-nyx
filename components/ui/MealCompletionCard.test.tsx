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
// getEventSource defaults to 'exif' so the provenance assertions below are
// meaningful: insertMeal takes occurred_at_source as a PARAMETER, and both photo
// paths pass 'exif' (app/log.tsx handlePickFood, app/food-capture.tsx), so a meal
// reaching this card really can carry a photo's own stamp. beforeEach re-arms it.
jest.mock('../../lib/db', () => ({
  updateEvent: jest.fn(),
  updateMealIntake: jest.fn(),
  getEventSource: jest.fn(),
  // The pet a rating's Signal refresh is for, read off the row by `rateMealIntake`.
  getEventPetId: jest.fn(() => Promise.resolve('p1')),
}));
// The refresh edge, stubbed so a chip tap is assertable and arms no real timer.
jest.mock('../../lib/signal', () => ({ triggerSignalRegenDebounced: jest.fn() }));
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
// The door the floor line and the combo row open, observable (CUL-1691 §2.3's guards).
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) }, usePathname: () => '/' }));
// The test renderer reports no AppState; the app is foregrounded unless a test says not.
let mockAppActive = true;
jest.mock('../../hooks/useAppActive', () => ({ useAppActive: () => mockAppActive }));

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

import { Alert, Animated, LayoutAnimation, StyleSheet } from 'react-native';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import { MealCompletionCard } from './MealCompletionCard';
import { useMomentStore } from '../../store/momentStore';
import { usePetStore } from '../../store/petStore';
import { useReducedMotionStore } from '../../store/reducedMotionStore';
import type { LogTimeTrialFlag } from '../../lib/trialContaminant';
import { reverseLoggedEvent } from '../../lib/undoLog';
import { updateEvent, updateMealIntake, getEventSource } from '../../lib/db';
import { triggerSignalRegenDebounced } from '../../lib/signal';
import { formatTime } from '../../lib/utils';
import { COMPLETION_MOTION } from '../motion/completionMotion';
import { FOLD_MOTION } from '../motion/foldMotion';
import { REMOVED_DURATION_MS } from '../../store/momentStore';
import { SHEET_SPRING } from '../motion/sheetMotion';
import { OPAQUE_HEX, shadowedGrounds } from '../../testUtils/tree';

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
  (getEventSource as jest.Mock).mockResolvedValue('exif');
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
    expect(reverseLoggedEvent).toHaveBeenCalledWith('e1', undefined);
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

// ── The "Change time" sheet (CUL-621) ────────────────────────────────────────
// This card carried its own inline copy of the picker modal and had NO coverage
// of it at all — so the adoption of the shared <TimeEditSheet/> would have been a
// blind swap on the app's best-loved surface. These pin the behaviour that must
// survive the swap (the question asked, the three fields written, cancel writing
// nothing) plus the one thing the shared sheet adds: a real button role on its
// two actions, which the inline copy never had.
describe('MealCompletionCard — a rating stated ELSEWHERE is not erasable here (CUL-870)', () => {
  it('a tap on the chip the card ARRIVED lit with does not clear the rating', async () => {
    // The adversarial pass's blocking find, executed against the pre-fix tree as
    // `updateMealIntake('e1', null)`. The intake door writes the arm the owner chose in
    // its own sheet and reveals this card with that chip already lit — so a tap on it is
    // the natural "yes, that's right" gesture on a highlighted answer, and IntakeChipRow
    // reads a tap on an active chip as CLEAR. One tap turned her refusal into the unrated
    // meal row the intake door exists to prevent: no confirm, no way back, card gone
    // 1500 ms later (C-21).
    seedMeal({ foodType: 'meal', intakeRating: 'refused' });
    const { getByText } = render(<MealCompletionCard />);
    await act(async () => {
      fireEvent.press(getByText('Refused'));
    });
    expect(updateMealIntake).not.toHaveBeenCalled();
    expect(useMomentStore.getState().payload).toMatchObject({ intakeRating: 'refused' });
  });

  it('but she can still CHANGE her mind to a different arm', async () => {
    // The correction the card is actually for. Blocking the clear must not block this.
    seedMeal({ foodType: 'meal', intakeRating: 'refused' });
    const { getByText } = render(<MealCompletionCard />);
    await act(async () => {
      fireEvent.press(getByText('Some'));
    });
    expect(updateMealIntake).toHaveBeenCalledWith('e1', 'some');
  });

  it('once she has CHANGED it here, the clear works again', async () => {
    // The re-run's over-strictness find: the first cut blocked every clear for the life
    // of the card, so an owner who arrived at `refused`, changed to `some` HERE, then
    // wanted to clear entirely met a chip that did nothing and said nothing. The rule is
    // "a clear is honoured when this card set the value" — and by then it had.
    seedMeal({ foodType: 'meal', intakeRating: 'refused' });
    const { getByText } = render(<MealCompletionCard />);
    await act(async () => {
      fireEvent.press(getByText('Some'));
    });
    expect(updateMealIntake).toHaveBeenLastCalledWith('e1', 'some');
    await act(async () => {
      fireEvent.press(getByText('Some'));
    });
    expect(updateMealIntake).toHaveBeenLastCalledWith('e1', null);
  });

  it('and every PRE-DOOR path keeps its toggle exactly', async () => {
    // The picker, the FAB and photo capture all reveal with nothing lit, so a tap there
    // is the owner's first statement about that bowl and un-tapping it is her taking it
    // back — which is what a toggle should do. The guard keys on the PRESENTED rating,
    // so it is inert on all three.
    seedMeal({ foodType: 'meal', intakeRating: null });
    const { getByText } = render(<MealCompletionCard />);
    await act(async () => {
      fireEvent.press(getByText('Most'));
    });
    expect(updateMealIntake).toHaveBeenLastCalledWith('e1', 'most');
    await act(async () => {
      fireEvent.press(getByText('Most'));
    });
    expect(updateMealIntake).toHaveBeenLastCalledWith('e1', null);
  });
});

describe('MealCompletionCard — a refusal is acknowledged, never celebrated (CUL-894)', () => {
  // The halo is drawn (CUL-1691), so its presence is a node inside the mark, not a style.
  const haloOf = (view: ReturnType<typeof render>) =>
    within(view.getByTestId('meal-card-check')).queryByTestId('completion-mark-halo') ?? undefined;

  it('a refused reveal names the record, not the act', () => {
    seedMeal({ foodType: 'meal', intakeRating: 'refused' });
    const view = render(<MealCompletionCard />);
    view.getByText('Refused · PetCo Dental Treats');
    expect(view.queryByText('Logged · PetCo Dental Treats')).toBeNull();
  });

  it('a picked-at reveal names it in the drill-in\'s own words', () => {
    seedMeal({ foodType: 'meal', intakeRating: 'picked' });
    const view = render(<MealCompletionCard />);
    view.getByText('Picked at · PetCo Dental Treats');
  });

  it.each([
    ['refused', 'Food refused'],
    ['picked', 'Food picked at'],
    ['all', 'Food logged'],
  ] as const)('the nameless fallback on %s still says what happened', (rating, title) => {
    seedMeal({ foodType: 'meal', intakeRating: rating, foodBrand: null, foodProductName: null });
    const view = render(<MealCompletionCard />);
    view.getByText(title);
  });

  it('drops the gold halo over a refusal and keeps it on an eaten meal', () => {
    // Mutation-checked 2026-10-03: with the halo rendered unconditionally the first
    // assertion reds.
    seedMeal({ foodType: 'meal', intakeRating: 'refused' });
    const refused = render(<MealCompletionCard />);
    expect(haloOf(refused)).toBeUndefined();
    refused.unmount();
    seedMeal({ eventId: 'e2', foodType: 'meal', intakeRating: 'all' });
    const eaten = render(<MealCompletionCard />);
    expect(haloOf(eaten)).toBeDefined();
    eaten.getByText('Logged · PetCo Dental Treats');
  });

  it('the door\'s card holds up her answer rather than asking again', () => {
    seedMeal({ foodType: 'meal', intakeRating: 'refused' });
    const view = render(<MealCompletionCard />);
    view.getByText('You said · tap another to change');
    expect(view.queryByText('How much did Biscuit eat?')).toBeNull();
  });

  it('a pre-door card still asks, and re-titles when she answers Refused here', async () => {
    const { AccessibilityInfo, Platform } = jest.requireActual<typeof import('react-native')>('react-native');
    const prevOS = Platform.OS;
    Platform.OS = 'ios';
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    try {
    seedMeal({ foodType: 'meal', intakeRating: null });
    const view = render(<MealCompletionCard />);
    view.getByText('How much did Biscuit eat?');
    view.getByText('Logged · PetCo Dental Treats');
    await act(async () => {
      fireEvent.press(view.getByText('Refused'));
    });
    view.getByText('Refused · PetCo Dental Treats');
    // The re-title is spoken, not only painted (CUL-1275's iOS half).
    expect(announce).toHaveBeenLastCalledWith(
      `Refused · PetCo Dental Treats. ${formatTime(new Date('2026-06-07T14:00:00.000Z'))}`,
    );
    // The question stays a question: she answered it on THIS card.
    view.getByText('How much did Biscuit eat?');
    } finally {
      announce.mockRestore();
      Platform.OS = prevOS;
    }
  });

  it('a door card she corrects and then clears asks again', async () => {
    seedMeal({ foodType: 'meal', intakeRating: 'refused' });
    const view = render(<MealCompletionCard />);
    await act(async () => { fireEvent.press(view.getByText('Some')); });
    await act(async () => { fireEvent.press(view.getByText('Some')); });
    expect(useMomentStore.getState().payload).toMatchObject({ intakeRating: null });
    view.getByText('How much did Biscuit eat?');
  });
});

describe('MealCompletionCard — a rating refreshes the Signal (CUL-1087)', () => {
  it('a chip tap asks the Signal to rebuild for the meal\'s pet', async () => {
    // A rating tapped after the log's own regen has fired is the case the insert's
    // refresh cannot cover, and a decline is exactly what it would miss.
    seedMeal({ foodType: 'meal', intakeRating: null });
    const { getByText } = render(<MealCompletionCard />);
    await act(async () => {
      fireEvent.press(getByText('Picked'));
    });
    expect(updateMealIntake).toHaveBeenCalledWith('e1', 'picked');
    expect(triggerSignalRegenDebounced).toHaveBeenCalledWith('p1');
  });

  it('a failed write refreshes nothing', async () => {
    (updateMealIntake as jest.Mock).mockRejectedValueOnce(new Error('No meal row for event e1'));
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    seedMeal({ foodType: 'meal', intakeRating: null });
    const { getByText } = render(<MealCompletionCard />);
    await act(async () => {
      fireEvent.press(getByText('Picked'));
    });
    expect(triggerSignalRegenDebounced).not.toHaveBeenCalled();
  });
});

describe('MealCompletionCard — Change time', () => {
  function openPicker(view: ReturnType<typeof render>) {
    fireEvent.press(view.getByLabelText('Change time of this log'));
  }

  it('asks about OCCURRENCE — a meal is witnessed by construction', () => {
    seedMeal();
    const view = render(<MealCompletionCard />);
    openPicker(view);
    view.getByText('When did this happen?');
  });

  it('writes the moved time, stamps manual, and re-asserts witnessed', async () => {
    // The meal card's deliberate divergence from the named card: it RE-ASSERTS
    // confidence witnessed rather than omitting the key, because a meal is
    // witnessed by construction (CUL-606's split — this must not generalize).
    seedMeal();
    const view = render(<MealCompletionCard />);
    openPicker(view);
    // The picker opens on THIS record's time. Asserted before any change event,
    // because a `change` overrides the seed — so every assertion downstream of one
    // passes just as happily when the card seeds the sheet from the wrong value
    // (a stale closure, the wrong field, another pet's payload). The write path is
    // covered by the eventId check below; this covers the read path.
    expect(view.UNSAFE_getByType('DateTimePicker' as never).props.value)
      .toEqual(new Date('2026-06-07T14:00:00.000Z'));
    const moved = new Date(2026, 5, 7, 9, 30);
    await act(async () => {
      fireEvent(view.UNSAFE_getByType('DateTimePicker' as never), 'change', {}, moved);
    });
    await act(async () => { fireEvent.press(view.getByText('Save')); });

    const [id, fields] = (updateEvent as jest.Mock).mock.calls[0];
    expect(id).toBe('e1');
    expect(fields.occurred_at).toBe(moved.toISOString());
    expect(fields.occurred_at_source).toBe('manual');
    expect(fields.confidence).toEqual({ value: 'witnessed', earliest: null, latest: null });
    // Save is its own confirmation — the card goes rather than lingering.
    expect(useMomentStore.getState().visible).toBe(false);
  });

  // ── Provenance on a peek-and-save (CUL-701) ────────────────────────────────
  // Save is live the moment the sheet opens, so "tap Change time, look, tap Save"
  // is a real gesture that scrubs nothing — and this card used to answer it by
  // writing occurred_at_source: 'manual' unconditionally. That column is how the
  // vet report and the correlation engine tell an app-stamped time from an
  // owner-chosen one, so the write asserted a human decision nobody made.
  //
  // On THIS card the cost is worse than a false claim. insertMeal takes the
  // source as a parameter and both photo paths pass 'exif' (app/log.tsx
  // handlePickFood; app/food-capture.tsx), so a meal logged from a photo carries
  // that photo's own stamp — and the peek destroyed it. Same data loss the named
  // card's adversarial pass found, on the surface meals actually use.
  it('preserves EXIF provenance on a peek-and-save', async () => {
    seedMeal();
    const view = render(<MealCompletionCard />);
    openPicker(view);
    await act(async () => { fireEvent.press(view.getByText('Save')); });

    expect(getEventSource).toHaveBeenCalledWith('e1');
    const fields = (updateEvent as jest.Mock).mock.calls[0][1];
    expect(fields.occurred_at_source).toBe('exif');
    // The save still HAPPENED — this is a provenance rule, not a refusal to write.
    expect(fields.occurred_at).toBe('2026-06-07T14:00:00.000Z');
  });

  // The issue's headline case: the one-tap meal, auto-stamped 'now' at insert.
  // Nothing owner-authored is destroyed here, but the record still gains a claim
  // the owner never made — CUL-576's rule ("a defaulted timestamp is the app's
  // claim") read back off the column instead of into it.
  it("preserves an auto-stamped 'now' on a peek-and-save", async () => {
    (getEventSource as jest.Mock).mockResolvedValue('now');
    seedMeal();
    const view = render(<MealCompletionCard />);
    openPicker(view);
    await act(async () => { fireEvent.press(view.getByText('Save')); });

    expect((updateEvent as jest.Mock).mock.calls[0][1].occurred_at_source).toBe('now');
  });

  it('Cancel writes nothing and leaves the card standing', async () => {
    seedMeal();
    const view = render(<MealCompletionCard />);
    openPicker(view);
    await act(async () => {
      fireEvent(view.UNSAFE_getByType('DateTimePicker' as never), 'change', {}, new Date(2026, 5, 7, 9, 30));
    });
    await act(async () => { fireEvent.press(view.getByText('Cancel')); });

    expect(updateEvent as jest.Mock).not.toHaveBeenCalled();
    expect(useMomentStore.getState().visible).toBe(true);
    // …and the sheet is GONE. Without this line the test passes with `onCancel`
    // wired to a no-op — Cancel becomes a dead button, the sheet sticks open over
    // the card, and "writes nothing / card still standing" are both still true.
    // Found by the code-reviewer's mutation pass on this very suite.
    expect(view.queryByText('When did this happen?')).toBeNull();
  });

  // CUL-703 — `severity` and `notes` used to ride along as explicit nulls, which
  // updateEvent treats as CLEAR (an omitted key preserves — CUL-606). Harmless
  // while no meal path writes a note, and destructive the day one does, with
  // nothing failing. The edit must name the time and nothing else.
  it('a time edit never restates notes or severity', async () => {
    seedMeal();
    const view = render(<MealCompletionCard />);
    openPicker(view);
    await act(async () => { fireEvent.press(view.getByText('Save')); });

    const fields = (updateEvent as jest.Mock).mock.calls[0][1];
    expect(fields).not.toHaveProperty('notes');
    expect(fields).not.toHaveProperty('severity');
  });

  // CUL-709 — `present()` swaps the payload IN PLACE, and the sheet's draft was
  // seeded from the record the owner opened it on. Save used to read
  // `payload.eventId` live, so a second meal landing mid-edit would have had it
  // write the FIRST meal's draft time (and a 'manual' stamp) onto the second
  // meal's row — re-dating a record the owner never looked at. The store's undo /
  // patchTrialFlag / patchDoubleDose all refuse on this; Save now does too.
  it('writes nothing when another log replaced the card while the sheet was open', async () => {
    seedMeal();
    const view = render(<MealCompletionCard />);
    openPicker(view);
    await act(async () => {
      fireEvent(view.UNSAFE_getByType('DateTimePicker' as never), 'change', {}, new Date(2026, 5, 7, 9, 30));
    });
    // A second meal lands: same card, new record, sheet still up.
    seedMeal({ eventId: 'e2', occurredAt: '2026-06-07T16:00:00.000Z' });
    await act(async () => { fireEvent.press(view.getByText('Save')); });

    expect(updateEvent as jest.Mock).not.toHaveBeenCalled();
    // The sheet closes — its draft described a row that is no longer on screen —
    // and the card stands, now about the second meal.
    expect(view.queryByText('When did this happen?')).toBeNull();
    expect(useMomentStore.getState().payload?.eventId).toBe('e2');
  });

  // The inline copy's Cancel/Save were bare TouchableOpacitys — reachable by
  // sight, announced by VoiceOver as plain text. The shared sheet declares the
  // role, so adoption is an assistive-tech fix as well as a de-duplication.
  it('announces its two actions as buttons', () => {
    seedMeal();
    const view = render(<MealCompletionCard />);
    openPicker(view);
    view.getByRole('button', { name: 'Cancel' });
    view.getByRole('button', { name: 'Save' });
  });
});

// ── CUL-1275 — the card SPEAKS ────────────────────────────────────────────────
//
// The header had no live region at all and the removal line's was Android-only, so a
// meal was confirmed to NEITHER screen reader and an Undo to TalkBack alone. The header
// is now one summary node with a live region (Android), and `useLiveRegionAnnouncement`
// is its iOS half. These cases pin the string both halves are handed.
describe('MealCompletionCard — the VoiceOver announcement (CUL-1275)', () => {
  const { AccessibilityInfo, Platform } = jest.requireActual<typeof import('react-native')>('react-native');
  const HEADER = `Logged · PetCo Dental Treats. ${formatTime(new Date('2026-06-07T14:00:00.000Z'))}`;
  let announce: jest.SpyInstance;
  const prevOS = Platform.OS;

  beforeEach(() => {
    Platform.OS = 'ios';
    // RN's jest preset already makes this a `jest.fn`, and `spyOn` over a mock returns
    // THAT mock, calls and all — so every earlier render in the file is still on it.
    announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    announce.mockClear();
  });
  afterEach(() => {
    announce.mockRestore();
    Platform.OS = prevOS;
  });

  it('speaks the food and the time when the card appears — the header is one summary node', () => {
    seedMeal();
    const view = render(<MealCompletionCard />);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith(HEADER);
    const node = view.getByLabelText(HEADER);
    expect(node.props.accessible).toBe(true);
    // The Android half, on the same node: before CUL-1275 the header had none.
    expect(node.props.accessibilityLiveRegion).toBe('polite');
  });

  it('keeps the nameless-food fallback in what it speaks — never a bare "Logged"', () => {
    seedMeal({ foodBrand: null, foodProductName: null });
    render(<MealCompletionCard />);
    expect(announce.mock.calls[0][0]).toMatch(/^Food logged\. /);
  });

  it('speaks the reversal when Undo lands', async () => {
    seedMeal();
    const view = render(<MealCompletionCard />);
    announce.mockClear();
    await act(async () => { fireEvent.press(view.getByLabelText('Undo — remove this log')); });
    expect(announce).toHaveBeenCalledWith('Removed. Taken out of Biscuit’s record');
    expect(view.getByLabelText('Removed. Taken out of Biscuit’s record').props.accessible).toBe(true);
  });

  it('names the MEAL’s pet in the reversal, not a since-switched active one', async () => {
    seedMeal({}, 'p2');
    const view = render(<MealCompletionCard />);
    await act(async () => { fireEvent.press(view.getByLabelText('Undo — remove this log')); });
    expect(announce).toHaveBeenLastCalledWith('Removed. Taken out of Biscuit’s record');
  });

  it('says nothing for a payload it does not paint (the named card’s)', () => {
    render(<MealCompletionCard />);
    act(() => {
      useMomentStore.getState().showNamed({
        tone: 'calm', eventId: 'n1', petId: 'p1', occurredAt: '2026-06-07T14:00:00.000Z',
        record: { kind: 'event', typeLabel: 'Vomit', confidence: 'witnessed', earliest: null, latest: null },
      });
    });
    expect(announce).not.toHaveBeenCalled();
  });

  it('is silent on Android — the live region already speaks there', () => {
    Platform.OS = 'android';
    seedMeal();
    render(<MealCompletionCard />);
    expect(announce).not.toHaveBeenCalled();
  });
});

// CUL-1633 — the card honours Reduce Motion (C-43). Under the setting, or while it is
// still unknown, the card crossfades in place: no rise, no spring, and the mark is drawn
// at rest. The fade stays, so the owner still SEES the confirmation arrive.
//
// CUL-1691 PR 2 moved the check's scale into the mark's DISC layer (it lives on the
// card's clock now, never a spring), and the rise to the 24pt `SHEET_SPRING`.
describe('MealCompletionCard — Reduce Motion (CUL-1633, CUL-1691)', () => {
  afterEach(() => {
    useReducedMotionStore.setState({ reduceMotion: null });
  });

  type Style = Record<string, unknown> | undefined;
  function transformsOf(node: { props: { style?: unknown } }): Record<string, unknown>[] {
    const flat = StyleSheet.flatten(node.props.style as never) as Style;
    return Array.isArray(flat?.transform) ? (flat.transform as Record<string, unknown>[]) : [];
  }

  function mount() {
    const spring = jest.spyOn(Animated, 'spring');
    const timing = jest.spyOn(Animated, 'timing');
    const view = render(<MealCompletionCard />);
    seedMeal();
    const disc = view.getByTestId('completion-mark-disc-layer');
    // The wrapper is the Animated.View carrying translateY, an ancestor of the surface.
    let wrapper = view.getByTestId('meal-card-surface').parent;
    while (wrapper && !transformsOf(wrapper).some((t) => 'translateY' in t)) wrapper = wrapper.parent;
    return { view, spring, timing, disc, wrapper };
  }

  for (const setting of [true, null] as const) {
    it(`reduceMotion ${String(setting)}: crossfades in place, the mark at rest`, () => {
      useReducedMotionStore.setState({ reduceMotion: setting });
      const { spring, timing, disc, wrapper } = mount();
      try {
        expect(spring).not.toHaveBeenCalled();
        // The fade is the one motion left: a crossfade to full over crossfadeMs.
        expect(timing).toHaveBeenCalledWith(
          expect.anything(), expect.objectContaining({ toValue: 1, duration: COMPLETION_MOTION.crossfadeMs }),
        );
        expect(transformsOf(disc)).toEqual([{ scale: 1 }]);
        expect(wrapper).toBeTruthy();
        expect(transformsOf(wrapper!)).toEqual([{ translateY: 0 }]);
      } finally {
        spring.mockRestore();
        timing.mockRestore();
      }
    });
  }

  it('reduceMotion false: the card rises 24pt on SHEET_SPRING and nothing springs on the check', () => {
    useReducedMotionStore.setState({ reduceMotion: false });
    const { spring, disc, wrapper } = mount();
    try {
      expect(spring).toHaveBeenCalledTimes(1);
      expect(spring).toHaveBeenCalledWith(
        expect.anything(), expect.objectContaining({ toValue: 0, ...SHEET_SPRING }),
      );
      // The rise's first frame: 24pt down; the disc's first frame: 60%.
      expect(transformsOf(wrapper!)).toEqual([{ translateY: COMPLETION_MOTION.riseFromPt }]);
      expect(transformsOf(disc)).toEqual([{ scale: COMPLETION_MOTION.discFromScale }]);
    } finally {
      spring.mockRestore();
    }
  });
});

// CUL-1691 PR 1 (spec §1): the daylight ground is OPAQUE under its shadow. iOS traces a
// layer shadow off the composite alpha, so a translucent card grains (#1125).
describe('MealCompletionCard — the opaque daylight ground (CUL-1691)', () => {
  it('puts its shadow on an opaque ground', () => {
    const view = render(<MealCompletionCard />);
    seedMeal();
    const grounds = shadowedGrounds(view.UNSAFE_root);
    expect(grounds.length).toBeGreaterThan(0);
    for (const g of grounds) expect(g).toMatch(OPAQUE_HEX);
  });
});

// ── CUL-1691 PR 2 — the motion, the tone, the patched notes (spec §2.1 to §2.5) ─────
//
// The native driver never steps a value in the test renderer, so a beat is asserted by
// the animation it STARTS, by the layer it mounts, or by the value a valve PINS (valves
// are JS timers and do run). `includeHiddenElements` wherever the leaving body is read.
const LINE = {
  eventId: 'v1', vomitAt: '2026-06-07T13:00:00.000Z', tier: 'call_today', self: false, device: true, petId: 'p1',
  raised: [{ eventId: 'v1', tier: 'call_today' }],
} as never;

function haloLayer(view: ReturnType<typeof render>) {
  return view.queryByTestId('completion-mark-halo-layer', { includeHiddenElements: true });
}
/** The live value of a node's Animated opacity, read off the composite that carries it
 *  (the host holds the value as it was when it last rendered). */
function liveOpacity(host: { props: { style?: unknown }; parent: unknown }): number {
  let n = host as { props: { style?: unknown }; parent: unknown } | null;
  while (n) {
    const styles = ([] as unknown[]).concat(n.props.style ?? []).flat(Infinity) as { opacity?: unknown }[];
    for (const st of styles) {
      const o = st?.opacity as { __getValue?: () => number } | undefined;
      if (o && typeof o.__getValue === 'function') return o.__getValue();
    }
    n = n.parent as typeof n;
  }
  throw new Error('no animated opacity');
}
function advance(ms: number) {
  act(() => { jest.advanceTimersByTime(ms); });
}
const afterThis: (() => void)[] = [];
afterEach(() => { while (afterThis.length) afterThis.pop()!(); });

describe('MealCompletionCard — the halo follows the one tone predicate (CUL-1691 §2.1)', () => {
  beforeEach(() => { useReducedMotionStore.setState({ reduceMotion: false }); });
  afterEach(() => { useReducedMotionStore.setState({ reduceMotion: null }); });

  it('an eaten meal mounts the gold and its valve pins it at 1', () => {
    const view = render(<MealCompletionCard />);
    seedMeal({ foodType: 'meal', intakeRating: 'all' });
    expect(haloLayer(view)).not.toBeNull();
    advance(COMPLETION_MOTION.haloDelayMs + COMPLETION_MOTION.haloFadeMs + COMPLETION_MOTION.valveSlackMs + 10);
    expect(liveOpacity(haloLayer(view)!)).toBe(1);
  });

  it('a refused meal never mounts the gold, at any frame', () => {
    const view = render(<MealCompletionCard />);
    seedMeal({ foodType: 'meal', intakeRating: 'refused' });
    for (const ms of [0, 100, 200, 300, 500]) {
      advance(ms);
      expect(haloLayer(view)).toBeNull();
    }
  });

  it('a card carrying a vet-call line is calm (team call; Dr. Chen confirms on CUL-1712)', () => {
    const view = render(<MealCompletionCard />);
    seedMeal({ foodType: 'meal', intakeRating: 'all', floorLine: LINE });
    for (const ms of [0, 260, 500]) {
      advance(ms);
      expect(haloLayer(view)).toBeNull();
    }
    view.getByText(/vet/i);
  });

  it('a Refused tap during the arrival leaves no gold at any frame (the tone is read at touch-end)', () => {
    const view = render(<MealCompletionCard />);
    seedMeal({ foodType: 'meal', intakeRating: null });
    advance(200);
    const surface = view.getByTestId('meal-card-surface');
    act(() => { fireEvent(surface, 'touchStart'); });
    act(() => { fireEvent.press(view.getByText('Refused')); });
    act(() => { fireEvent(surface, 'touchEnd'); });
    expect(haloLayer(view)).toBeNull();
    advance(600);
    expect(haloLayer(view)).toBeNull();
  });

  it('a correction to eaten crossfades the gold in over haloFadeMs; the disc never replays', () => {
    const timing = jest.spyOn(Animated, 'timing');
    try {
      const view = render(<MealCompletionCard />);
      seedMeal({ foodType: 'meal', intakeRating: 'refused' });
      advance(600);
      timing.mockClear();
      act(() => { fireEvent.press(view.getByText('All')); });
      expect(haloLayer(view)).not.toBeNull();
      expect(timing).toHaveBeenCalledWith(
        expect.anything(), expect.objectContaining({ toValue: 1, duration: COMPLETION_MOTION.haloFadeMs }),
      );
      // No second arrival: the card's clock was not restarted.
      expect(timing).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ toValue: 300, duration: 300 }));
    } finally {
      timing.mockRestore();
    }
  });

  it('a stale valve never pins a second log’s rewrite', () => {
    // The clock never reports its end here, so the valves are its only pinners.
    const real = Animated.timing;
    const timing = jest.spyOn(Animated, 'timing').mockImplementation((value, config) => {
      const anim = real(value, config);
      return config.toValue === 300 ? { ...anim, start: () => undefined } : anim;
    });
    afterThis.push(() => timing.mockRestore());
    const view = render(<MealCompletionCard />);
    seedMeal({ foodType: 'meal' });
    advance(100);
    act(() => {
      useMomentStore.getState().showMeal({
        eventId: 'e2', petId: 'p1', occurredAt: '2026-06-07T14:05:00.000Z', foodType: 'meal',
        foodBrand: 'PetCo', foodProductName: 'Kibble', intakeRating: null,
      });
    });
    const words = () => liveOpacity(view.getByLabelText(/Logged · PetCo Kibble/));
    // e1's valve was due at 360ms; e2's is due at 100 + 360.
    advance(300);
    expect(words()).toBe(0);
    advance(100);
    expect(words()).toBe(1);
  });
});

describe('MealCompletionCard — a note patched in after the reveal (CUL-1691 §2.3)', () => {
  beforeEach(() => { useReducedMotionStore.setState({ reduceMotion: false }); });
  afterEach(() => { useReducedMotionStore.setState({ reduceMotion: null }); });

  function spies() {
    const timing = jest.spyOn(Animated, 'timing');
    const spring = jest.spyOn(Animated, 'spring');
    const seen: { clock: number; rise: number }[] = [];
    const configureNext = jest.spyOn(LayoutAnimation, 'configureNext').mockImplementation(() => {
      const clock = timing.mock.calls.find(([, c]) => c.toValue === 300 && c.duration === 300)?.[0] as Animated.Value;
      const rise = spring.mock.calls[0]?.[0] as Animated.Value;
      seen.push({
        clock: (clock as unknown as { __getValue(): number }).__getValue(),
        rise: (rise as unknown as { __getValue(): number }).__getValue(),
      });
    });
    return { timing, spring, configureNext, seen, restore: () => { timing.mockRestore(); spring.mockRestore(); configureNext.mockRestore(); } };
  }

  it('at the reveal (the picker path): it lays out with the card, no FOLD_LAYOUT, and the gold follows the intake alone (D5)', () => {
    const s = spies();
    try {
      const view = render(<MealCompletionCard />);
      seedMeal({ foodType: 'meal', intakeRating: null });
      act(() => { useMomentStore.getState().patchTrialFlag('e1', MEMBERSHIP_FLAG); });
      view.getByText('Off the trial list');
      expect(s.configureNext).not.toHaveBeenCalled();
      advance(500);
      expect(liveOpacity(haloLayer(view)!)).toBe(1);
    } finally {
      s.restore();
    }
  });

  it('later (the + path’s release): FOLD_LAYOUT only after every beat has stopped, and the gold still ends at 1', () => {
    const s = spies();
    try {
      const view = render(<MealCompletionCard />);
      seedMeal({ foodType: 'meal', intakeRating: null });
      advance(200);
      expect(view.queryByText('Off the trial list')).toBeNull();
      act(() => { useMomentStore.getState().patchTrialFlag('e1', MEMBERSHIP_FLAG); });
      view.getByText('Off the trial list');
      expect(s.configureNext).toHaveBeenCalledTimes(1);
      // At the call, the clock had been pinned at its end and the rise at rest.
      expect(s.seen[0]).toEqual({ clock: 300, rise: 0 });
      expect(haloLayer(view)).not.toBeNull();
      expect(s.timing).toHaveBeenCalledWith(
        expect.anything(), expect.objectContaining({ toValue: 1, duration: COMPLETION_MOTION.haloFadeMs }),
      );
    } finally {
      s.restore();
    }
  });

  it('on a refused meal the gold never mounts, flag or no flag', () => {
    const s = spies();
    try {
      const view = render(<MealCompletionCard />);
      seedMeal({ foodType: 'meal', intakeRating: 'refused' });
      advance(200);
      act(() => { useMomentStore.getState().patchTrialFlag('e1', MEMBERSHIP_FLAG); });
      expect(haloLayer(view)).toBeNull();
      advance(500);
      expect(haloLayer(view)).toBeNull();
    } finally {
      s.restore();
    }
  });

  it('a vet-call line patched onto a celebrate card takes the standing gold away', () => {
    const s = spies();
    try {
      const view = render(<MealCompletionCard />);
      seedMeal({ foodType: 'meal', intakeRating: 'all' });
      advance(500);
      expect(liveOpacity(haloLayer(view)!)).toBe(1);
      act(() => { useMomentStore.getState().patchFloorLine('e1', LINE); });
      expect(s.timing).toHaveBeenCalledWith(
        expect.anything(), expect.objectContaining({ toValue: 0, duration: COMPLETION_MOTION.haloLeaveMs }),
      );
      advance(COMPLETION_MOTION.haloLeaveMs + 20);
      expect(haloLayer(view)).toBeNull();
    } finally {
      s.restore();
    }
  });
});

// §2.3 — Undo: inert from the tap, the motion on `removed`. Each guard is called through
// its control's PROP, because `fireEvent.press` honours `pointerEvents="none"` and would
// pass with no guard at all. Mutation-proven: delete any one `inertNow` guard and its
// row below reds.
describe('MealCompletionCard — the leaving body after Undo (CUL-1691 §2.3)', () => {
  beforeEach(() => { useReducedMotionStore.setState({ reduceMotion: false }); mockPush.mockClear(); });
  afterEach(() => { useReducedMotionStore.setState({ reduceMotion: null }); });

  const HIDDEN = { includeHiddenElements: true } as const;

  function seedAll() {
    seedMeal({ foodType: 'meal', trialFlag: MEMBERSHIP_FLAG, floorLine: LINE });
  }

  type Pressable = { props: { onPress?: () => void; onChange?: (v: unknown) => void; onOpen?: () => void }; parent: Pressable | null };
  function controls(view: ReturnType<typeof render>) {
    // The control's own `onPress` prop, on the composite above the labelled host.
    const byLabel = (re: RegExp) => {
      let n: Pressable | null = view.getByLabelText(re, HIDDEN) as unknown as Pressable;
      while (n && typeof n.props.onPress !== 'function') n = n.parent;
      if (!n) throw new Error(`no onPress for ${String(re)}`);
      return n;
    };
    const chipRow = view.UNSAFE_root.findAll((n: { props: Record<string, unknown> }) =>
      typeof n.props.onChange === 'function' && n.props.size === 'compact')[0] as unknown as Pressable;
    const floor = view.UNSAFE_root.findAll((n: { props: Record<string, unknown> }) =>
      typeof n.props.onOpen === 'function' && n.props.line !== undefined)[0] as unknown as Pressable;
    return {
      intake: () => chipRow.props.onChange!('all'),
      combo: () => byLabel(/Add a medication given with/).props.onPress!(),
      addToList: () => byLabel(/Add to the trial list/).props.onPress!(),
      changeTime: () => byLabel(/Change time of this log/).props.onPress!(),
      openRead: () => floor.props.onOpen!(),
    };
  }

  function assertNothingWritten(view: ReturnType<typeof render>) {
    expect(updateMealIntake).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(view.queryByTestId('add-trial-food-sheet', HIDDEN)).toBeNull();
    expect(view.queryByText('When did this happen?', HIDDEN)).toBeNull();
    expect(useMomentStore.getState().payload).toHaveProperty('intakeRating', null);
  }

  it('from the tap, before the reversal lands: every write and door is refused, and nothing visual changes', async () => {
    (reverseLoggedEvent as jest.Mock).mockImplementationOnce(() => new Promise(() => {}));
    seedAll();
    const view = render(<MealCompletionCard />);
    const c = controls(view);
    act(() => { fireEvent.press(view.getByLabelText('Undo — remove this log')); });
    expect(useMomentStore.getState().undoing).toBe('e1');
    expect(useMomentStore.getState().removed).toBe(false);
    // Nothing visual changes on the tap (CUL-612): the body is not hidden yet.
    expect(view.getByTestId('meal-card-body').props.accessibilityElementsHidden).toBeUndefined();
    expect(view.getByTestId('meal-card-surface').props.pointerEvents).toBe('none');
    await act(async () => {
      c.intake(); c.combo(); c.addToList(); c.changeTime(); c.openRead();
    });
    assertNothingWritten(view);
    expect(useMomentStore.getState().visible).toBe(true);
  });

  it('while leaving: the body is hidden from assistive tech, carries no live region, and its header still speaks the logged sentence', async () => {
    seedAll();
    const view = render(<MealCompletionCard />);
    const c = controls(view);
    await act(async () => { fireEvent.press(view.getByLabelText('Undo — remove this log')); });
    expect(useMomentStore.getState().removed).toBe(true);
    const body = view.getByTestId('meal-card-body', HIDDEN);
    expect(body.props.pointerEvents).toBe('none');
    expect(body.props.accessibilityElementsHidden).toBe(true);
    expect(body.props.importantForAccessibility).toBe('no-hide-descendants');
    const header = view.getByLabelText(/^Logged · PetCo Dental Treats\./, HIDDEN);
    expect(header.props.accessibilityLiveRegion).toBeUndefined();
    // "Removed" has not landed: the leaving body is the only thing drawn.
    expect(view.queryByText('Removed', HIDDEN)).toBeNull();
    await act(async () => {
      c.intake(); c.combo(); c.addToList(); c.changeTime(); c.openRead();
    });
    assertNothingWritten(view);
  });

  it('the pen un-writes over unwriteMs, then "Removed" lands under FOLD_LAYOUT and holds 2.4s from there', async () => {
    const configureNext = jest.spyOn(LayoutAnimation, 'configureNext').mockImplementation(() => {});
    const timing = jest.spyOn(Animated, 'timing');
    try {
      const real = useMomentStore.getState().armRemovedDwell;
      const armed: number[] = [];
      useMomentStore.setState({ armRemovedDwell: (id: string) => { armed.push(Date.now()); real(id); } });
      afterThis.push(() => useMomentStore.setState({ armRemovedDwell: real }));
      seedAll();
      const view = render(<MealCompletionCard />);
      await act(async () => { fireEvent.press(view.getByLabelText('Undo — remove this log')); });
      expect(timing).toHaveBeenCalledWith(
        expect.anything(), expect.objectContaining({ toValue: 1, duration: COMPLETION_MOTION.unwriteMs }),
      );
      advance(COMPLETION_MOTION.unwriteMs + 10);
      expect(configureNext).toHaveBeenCalled();
      const removedNode = view.getByLabelText('Removed. Taken out of Biscuit’s record');
      expect(removedNode.props.accessibilityLiveRegion).toBe('polite');
      expect(view.queryByTestId('meal-card-body', HIDDEN)).toBeNull();
      // "Removed" lands, and from THAT frame holds 2.4s (not the vet-call line's 8s).
      advance(FOLD_MOTION.landDelayMs + FOLD_MOTION.landMs + 20);
      expect(armed).toHaveLength(1);
      const sinceLanding = Date.now() - armed[0];
      advance(REMOVED_DURATION_MS - sinceLanding - 1);
      expect(useMomentStore.getState().visible).toBe(true);
      advance(1);
      expect(useMomentStore.getState().visible).toBe(false);
    } finally {
      configureNext.mockRestore();
      timing.mockRestore();
    }
  });
});
