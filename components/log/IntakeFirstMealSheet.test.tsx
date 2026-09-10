// The intake-first meal sheet (CUL-870 / N-3b; spec §3.1a, §4.5).
//
// The claims worth pinning are all about WHEN the record changes, because the whole
// reason this component exists is that the shipped meal path writes too early: opening
// writes nothing, picking a food writes nothing, closing writes nothing, and the arm tap
// writes exactly one rated meal. Everything else here is downstream of those four.

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../../hooks/useAppActive', () => ({ useAppActive: jest.fn(() => true) }));

// The completion register's reversal path reaches `lib/signal` → `lib/supabase`, which
// fails fast without env. Mocked for the same reason `LookCard.test.tsx` mocks it: this
// suite is about what gets WRITTEN, and nothing here undoes anything.
jest.mock('../../lib/undoLog', () => ({ reverseLoggedEvent: jest.fn() }));

const mockInsertMeal = jest.fn();
jest.mock('../../lib/meals', () => ({ insertMeal: (...a: unknown[]) => mockInsertMeal(...a) }));

const mockLoadDoor = jest.fn();
const mockPickedSource = jest.fn();
jest.mock('../../lib/intakeFirstMeal', () => ({
  loadIntakeDoor: (...a: unknown[]) => mockLoadDoor(...a),
  pickedFoodSource: (...a: unknown[]) => mockPickedSource(...a),
}));

// The picker is a screen's worth of surface with its own reads; the sheet's contract
// with it is two props wide, so it is stubbed down to those two.
jest.mock('./FoodPicker', () => {
  const { Text, TouchableOpacity, View } = require('react-native');
  return {
    FoodPicker: ({ onPickFood, onAddNew }: any) => (
      <View testID="food-picker">
        <TouchableOpacity
          testID="picker-pick"
          onPress={() =>
            onPickFood({
              id: 'picked',
              brand: 'Hill’s',
              product_name: 'z/d',
              format: 'dry',
              food_type: 'meal',
              photo_path: null,
            })
          }
        >
          <Text>pick</Text>
        </TouchableOpacity>
        <TouchableOpacity testID="picker-add-new" onPress={onAddNew}>
          <Text>add</Text>
        </TouchableOpacity>
      </View>
    ),
  };
});

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { IntakeFirstMealPanel } from './IntakeFirstMealSheet';
import { useEventStore } from '../../store/eventStore';
import { useMomentStore } from '../../store/momentStore';
import { INTAKE_SHEET_CARD_KEPT, INTAKE_SHEET_NOTHING_SAVED } from '../../lib/intakeSheet';
import { flat, owningTouchable } from '../../testUtils/tree';
import { theme } from '../../constants/theme';

const DIET = {
  id: 'f1',
  brand: 'Royal Canin',
  product_name: 'HP',
  format: 'dry',
  food_type: 'meal' as const,
  photo_path: null,
};

/** The sheet only ever hands this back to `pickedFoodSource`, which is mocked here. */
const TRIAL = { status: 'no_trial' } as const;

const BASE = {
  petId: 'p1',
  petName: 'Mochi',
  sex: 'male' as const,
  cardHasSelections: false,
};

function setup(over: Partial<React.ComponentProps<typeof IntakeFirstMealPanel>> = {}) {
  const onClose = jest.fn();
  const utils = render(<IntakeFirstMealPanel {...BASE} onClose={onClose} {...over} />);
  return { ...utils, onClose };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLoadDoor.mockResolvedValue({ prefill: { food: DIET, source: 'recent_meal' }, trial: TRIAL });
  mockPickedSource.mockReturnValue('picked');
  mockInsertMeal.mockResolvedValue({
    eventId: 'e1',
    mealId: 'm1',
    occurredAtIso: '2026-09-10T18:12:00.000Z',
    now: '2026-09-10T18:12:00.000Z',
  });
  act(() => {
    useEventStore.setState({ todayEvents: [] });
    useMomentStore.setState({ visible: false, payload: null });
  });
});

// `showMeal` defers the card past the Modal's dismiss (CARD_DELAY_MS), so a suite that
// ends mid-reveal leaves that timer running. `hide()` is the register's own
// `clearTimers`, which is the right lever rather than fake timers this suite would then
// have to drive `waitFor` around.
afterEach(() => {
  act(() => {
    useMomentStore.getState().hide();
  });
});

describe('opening', () => {
  it('writes NOTHING', async () => {
    const { findByTestId } = setup();
    await findByTestId('intake-sheet-title');
    expect(mockInsertMeal).not.toHaveBeenCalled();
    expect(useEventStore.getState().todayEvents).toEqual([]);
  });

  it('shows the pre-filled food and why it is showing', async () => {
    mockLoadDoor.mockResolvedValue({ prefill: { food: DIET, source: 'trial_diet' }, trial: TRIAL });
    const { findByTestId } = setup();
    expect((await findByTestId('intake-sheet-food')).props.children).toBe(
      'Royal Canin HP · the trial diet',
    );
  });

  it('opens at the FOOD step when there is no pre-fill', async () => {
    // §4.5's "a pet with no meals ever", and every uncertain trial state with it.
    mockLoadDoor.mockResolvedValue({ prefill: null, trial: TRIAL });
    const { findByTestId, queryByTestId } = setup();
    await findByTestId('food-picker');
    expect(queryByTestId('intake-sheet-title')).toBeNull();
  });

  it('does not flash the picker while the pre-fill read is in flight', async () => {
    // C-12 with the states inverted: showing the food step and yanking it away a frame
    // later is the same defect as rendering an empty record before the read answered.
    let resolve: (v: unknown) => void = () => {};
    mockLoadDoor.mockReturnValue(new Promise((r) => (resolve = r)));
    const { queryByTestId, findByTestId } = setup();
    expect(queryByTestId('food-picker')).toBeNull();
    expect(queryByTestId('intake-sheet-title')).toBeNull();
    await act(async () => {
      resolve({ prefill: { food: DIET, source: 'recent_meal' }, trial: TRIAL });
    });
    await findByTestId('intake-sheet-title');
  });
});

describe('picking a food', () => {
  it('writes NOTHING — the single line that separates this sheet from handlePickFood', async () => {
    mockLoadDoor.mockResolvedValue({ prefill: null, trial: TRIAL });
    const { findByTestId } = setup();
    fireEvent.press(await findByTestId('picker-pick'));
    await findByTestId('intake-sheet-title');
    expect(mockInsertMeal).not.toHaveBeenCalled();
  });

  it('NAMES a picked food through the trial predicate, never as "most recent"', async () => {
    // The first cut hardcoded `source: 'recent_meal'` on every pick, which asserted a
    // recency fact nothing had checked AND dropped §4.5's trial naming at the one moment
    // it does any work — the moment she changes away from the trial diet.
    mockLoadDoor.mockResolvedValue({ prefill: null, trial: TRIAL });
    mockPickedSource.mockReturnValue('trial_diet');
    const { findByTestId } = setup();
    fireEvent.press(await findByTestId('picker-pick'));
    expect((await findByTestId('intake-sheet-food')).props.children).toBe(
      'Hill’s z/d · the trial diet',
    );
    expect(mockPickedSource).toHaveBeenCalledWith(TRIAL, expect.objectContaining({ id: 'picked' }));
  });

  it('and claims NOTHING when the picked food is not the trial diet', async () => {
    mockLoadDoor.mockResolvedValue({ prefill: null, trial: TRIAL });
    mockPickedSource.mockReturnValue('picked');
    const { findByTestId } = setup();
    fireEvent.press(await findByTestId('picker-pick'));
    expect((await findByTestId('intake-sheet-food')).props.children).toBe('Hill’s z/d');
  });

  it('*Change food ›* returns to the picker without writing', async () => {
    const { findByTestId } = setup();
    fireEvent.press(await findByTestId('intake-sheet-change-food'));
    await findByTestId('food-picker');
    expect(mockInsertMeal).not.toHaveBeenCalled();
  });
});

describe('the arm — the only thing that writes', () => {
  it('`Refused` writes ONE meal carrying the rating, and raises the meal’s own card', async () => {
    const { findByText, onClose } = setup();
    fireEvent.press(await findByText('Refused'));
    await waitFor(() => expect(mockInsertMeal).toHaveBeenCalledTimes(1));
    expect(mockInsertMeal).toHaveBeenCalledWith(
      expect.objectContaining({
        petId: 'p1',
        foodId: 'f1',
        // The rating rides on the INSERT rather than an UPDATE a moment later, so the
        // record never holds an unrated meal for a bowl the owner came here to refuse.
        intakeRating: 'refused',
        // Clock-seeded, so the app's claim — never the owner's (C-10).
        occurredAtSource: 'now',
      }),
    );
    expect(onClose).toHaveBeenCalledWith('saved');
    await waitFor(() => {
      const payload = useMomentStore.getState().payload;
      expect(payload?.kind).toBe('meal');
      expect(payload?.kind === 'meal' && payload.intakeRating).toBe('refused');
    });
  });

  it('a quarter-eaten cat is `some`, not `refused`', async () => {
    // §4.5, gap 1a: the door names a CONCERN, the owner names the VALUE. Nothing is
    // pre-selected, so the arm she taps is the arm that gets written — there is no
    // default for a wrong tap to fall back to.
    const { findByText } = setup();
    fireEvent.press(await findByText('Some'));
    await waitFor(() =>
      expect(mockInsertMeal).toHaveBeenCalledWith(expect.objectContaining({ intakeRating: 'some' })),
    );
  });

  it('nothing is pre-selected — not visually, and not to a screen reader', async () => {
    // §4.5 / the B-156 G1 shape. A pre-lit `refused` would mis-record the quarter-eaten
    // cat OR lose her, and it is the ONE thing a door labelled *Didn't eat* is tempted
    // to do. Asserted on the RENDERED chip rather than on the prop handed to the row:
    // `FilterChip` announces `selected` for every chip (B-168), so both halves of the
    // claim — what she sees and what VoiceOver says — are checkable here.
    const { findByText, findByTestId } = setup();
    await findByTestId('intake-sheet-title');
    for (const label of ['Refused', 'Picked', 'Some', 'Most', 'All']) {
      const chip = owningTouchable(await findByText(label));
      expect(chip).not.toBeNull();
      expect((chip?.props.accessibilityState as { selected?: boolean }).selected).toBe(false);
      expect(flat(chip).backgroundColor).not.toBe(theme.colorAccentLight);
    }
  });

  it('mirrors the meal into today’s events for the pet the door was tapped on', async () => {
    // C-9 / T-11: the request's pet, never a re-read active one.
    const { findByText } = setup();
    fireEvent.press(await findByText('Refused'));
    await waitFor(() => expect(useEventStore.getState().todayEvents).toHaveLength(1));
    expect(useEventStore.getState().todayEvents[0]).toEqual(
      expect.objectContaining({ id: 'e1', pet_id: 'p1', event_type: 'meal', food_item_id: 'f1' }),
    );
  });

  it('SAYS a failed write, and leaves the sheet up with the arms live', async () => {
    // CUL-575 — and the first cut only CLAIMED this in a comment: it logged, released
    // the guard, and left an unchanged sheet, which reads exactly like "still thinking"
    // on the one surface where the owner has just reported a refusal. Both halves are
    // asserted, because the silent half is what shipped.
    mockInsertMeal.mockRejectedValue(new Error('disk full'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { findByText, onClose, queryByTestId } = setup();
    fireEvent.press(await findByText('Refused'));
    await waitFor(() => expect(alert).toHaveBeenCalled());
    // Never the error itself (the copy guard): calm, no code, one thing to do.
    const [title, body] = alert.mock.calls[0] as [string, string];
    expect(title).toBe('Couldn’t save that');
    expect(body).not.toContain('disk full');
    expect(onClose).not.toHaveBeenCalled();
    expect(queryByTestId('intake-sheet-title')).not.toBeNull();
    // The retry is one tap: the arms are still live under the alert.
    fireEvent.press(await findByText('Refused'));
    await waitFor(() => expect(mockInsertMeal).toHaveBeenCalledTimes(2));
  });

  it('a double tap cannot write two meals for one bowl — SEQUENTIALLY', async () => {
    let release: (v: unknown) => void = () => {};
    mockInsertMeal.mockReturnValue(new Promise((r) => (release = r)));
    const { findByText } = setup();
    const chip = await findByText('Refused');
    fireEvent.press(chip);
    fireEvent.press(chip);
    await act(async () => {
      release({ eventId: 'e1', mealId: 'm1', occurredAtIso: 'x', now: 'x' });
    });
    expect(mockInsertMeal).toHaveBeenCalledTimes(1);
  });

  it('…and IN ONE BATCH, which is the case a state flag does not survive', async () => {
    // The re-run's blocking find, and the reason both directions are here now: the test
    // above passes on a STATE flag, because RTL's `fireEvent.press` flushes `act` per
    // call, so it only ever exercises the sequential case. `IntakeChipRow` renders five
    // independent touchables, so two fingers landing together arrive in ONE React batch
    // with no commit between — both handlers read the flag as false and both write, and
    // the executed result was two meal rows for one bowl with CONTRADICTORY ratings, of
    // which only the second raises a card. A test that names the batched hazard and
    // asserts the serial one reads as coverage it does not have.
    let release: (v: unknown) => void = () => {};
    mockInsertMeal.mockReturnValue(new Promise((r) => (release = r)));
    const { findByText } = setup();
    const refused = await findByText('Refused');
    const all = await findByText('All');
    // Both presses inside ONE act, so React batches them with no render between.
    await act(async () => {
      fireEvent.press(refused);
      fireEvent.press(all);
    });
    await act(async () => {
      release({ eventId: 'e1', mealId: 'm1', occurredAtIso: 'x', now: 'x' });
    });
    expect(mockInsertMeal).toHaveBeenCalledTimes(1);
    // And it is HER first arm that landed, not whichever finger the batch happened to
    // deliver last.
    expect(mockInsertMeal).toHaveBeenCalledWith(expect.objectContaining({ intakeRating: 'refused' }));
  });

  it('a REFUSED write releases the latch, so the retry is one tap', async () => {
    // B-336's explicit contract: the guard stays latched only on a commit. A failed
    // write must leave the arms live — the alert tells her to try again, so they have to
    // work when she does.
    mockInsertMeal.mockRejectedValueOnce(new Error('disk full')).mockResolvedValueOnce({
      eventId: 'e2',
      mealId: 'm2',
      occurredAtIso: '2026-09-10T18:12:00.000Z',
      now: '2026-09-10T18:12:00.000Z',
    });
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { findByText } = setup();
    fireEvent.press(await findByText('Refused'));
    await waitFor(() => expect(mockInsertMeal).toHaveBeenCalledTimes(1));
    fireEvent.press(await findByText('Refused'));
    await waitFor(() => expect(mockInsertMeal).toHaveBeenCalledTimes(2));
  });
});

describe('closing', () => {
  it('writes nothing and reports `dismissed`', async () => {
    const { findByTestId, onClose } = setup();
    fireEvent.press(await findByTestId('intake-sheet-close'));
    expect(onClose).toHaveBeenCalledWith('dismissed');
    expect(mockInsertMeal).not.toHaveBeenCalled();
  });

  it('says so before she picks, so the sheet’s inertness is not a discovery', async () => {
    const { findByText } = setup();
    await findByText(INTAKE_SHEET_NOTHING_SAVED);
  });

  it('carries BOTH promises on the FOOD step too, not just the intake step', async () => {
    // Gating them to the intake step left the two states that most need them with
    // neither: a first-run pet with no meals, and the trial owner who tapped
    // *Change food ›* to override the pre-fill.
    mockLoadDoor.mockResolvedValue({ prefill: null, trial: TRIAL });
    const { findByTestId, findByText } = setup({ cardHasSelections: true });
    await findByTestId('food-picker');
    await findByText(INTAKE_SHEET_NOTHING_SAVED);
    await findByTestId('intake-sheet-card-kept');
  });

  it('promises the card’s words survive — but only when there are words', async () => {
    // A reassurance about an empty card is a claim about nothing.
    const bare = setup();
    await bare.findByTestId('intake-sheet-title');
    expect(bare.queryByTestId('intake-sheet-card-kept')).toBeNull();
    bare.unmount();

    const withWords = setup({ cardHasSelections: true });
    expect((await withWords.findByTestId('intake-sheet-card-kept')).props.children).toBe(
      INTAKE_SHEET_CARD_KEPT,
    );
  });

  it('*Add new* dismisses BEFORE it navigates, and says it saved nothing', async () => {
    // C-14 / CUL-662: an RN Modal renders above the whole app window, so a screen pushed
    // from under one lands invisibly behind it.
    mockLoadDoor.mockResolvedValue({ prefill: null, trial: TRIAL });
    const onNavigateAway = jest.fn();
    const onClose = jest.fn();
    const { findByTestId } = render(
      <IntakeFirstMealPanel {...BASE} onClose={onClose} onNavigateAway={onNavigateAway} />,
    );
    fireEvent.press(await findByTestId('picker-add-new'));
    expect(onNavigateAway).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledWith('dismissed');
    expect(router.push).toHaveBeenCalledWith('/food-capture');
    expect(mockInsertMeal).not.toHaveBeenCalled();
  });
});
