// CUL-1643 (PM ruling D3 of CUL-1625) — the meal lands in its card.
//
// A one-tap food never plays the cancel: its pill stays while the others retract, its
// meal mark flies into the meal card's check on the Signal flight's lifted store
// (`components/motion/flightMotion.ts`), and the card crossfades in place around it. The
// dwell restarts when the mark lands and the trial heads-up waits for the landing, so
// the flight never eats the card's Undo window (C-21). Under Reduce Motion nothing flies.
//
// The FAB and the card are rendered together, because the hand-off between them is the
// thing under test. The platform's measurement is the one edge stubbed: the test
// renderer's host nodes never answer `measureInWindow` (`lib/measureNode.ts`), so the
// stub hands back the pill's glyph on the first ask and the card's check on the rest.
// The spring itself is the host's and is pinned in `FlightHost.test.tsx`; here the
// landing is driven through the store's own `settleOutbound`, the call the host makes.

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../lib/storage', () => ({ getPublicUrl: () => null }));
jest.mock('../../lib/haptics', () => ({
  openMenu: jest.fn(),
  commitRoutine: jest.fn(),
  commitSymptom: jest.fn(),
  selectChip: jest.fn(),
  destructiveConfirm: jest.fn(),
}));
jest.mock('../../lib/db', () => ({
  getRecentFoods: jest.fn(async () => []),
  updateEvent: jest.fn(),
  getEventSource: jest.fn(),
}));
jest.mock('../../hooks/useTodayKey', () => ({ useTodayKey: () => '2026-10-08' }));
jest.mock('../../lib/meals', () => ({ insertMeal: jest.fn(), rateMealIntake: jest.fn() }));
jest.mock('../../lib/undoLog', () => ({ reverseLoggedEvent: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../lib/sync', () => ({ syncPendingEvents: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../lib/trialContaminant', () => ({
  ...jest.requireActual('../../lib/trialContaminant'),
  evaluateMealLogTimeFlag: jest.fn(async () => null),
  noteTrialFlagShown: jest.fn(async () => undefined),
}));
jest.mock('../pet/PetSwitcherSheet', () => ({ PetSwitcherSheet: () => null }));
const mockMeasured: unknown[] = [];
jest.mock('../../lib/measureNode', () => ({
  measureNodeInWindow: (node: unknown, cb: (r: unknown) => void) => {
    mockMeasured.push(node);
    cb(mockMeasured.length === 1 ? mockSource : mockTarget);
  },
}));
const mockSource = { x: 300, y: 690, width: 28, height: 28 };
const mockTarget = { x: 28, y: 640, width: 32, height: 32 };

import { Animated, StyleSheet } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { FAB, MEAL_CARD_DWELL_MS } from './FAB';
import { MealCompletionCard } from '../ui/MealCompletionCard';
import { FlightHost } from '../motion/FlightHost';
import { abortFlight, getFlightState, settleOutbound } from '../motion/flightMotion';
import { usePetStore } from '../../store/petStore';
import { useUiStore } from '../../store/uiStore';
import { useMomentStore } from '../../store/momentStore';
import { useReducedMotionStore } from '../../store/reducedMotionStore';
import { getRecentFoods } from '../../lib/db';
import { insertMeal } from '../../lib/meals';
import { evaluateMealLogTimeFlag } from '../../lib/trialContaminant';
import type { LogTimeTrialFlag } from '../../lib/trialContaminant';

const OCCURRED = '2026-10-08T12:00:00.000Z';
const FOODS = [
  { id: 'f-new', brand: 'Royal Canin', product_name: 'Hydrolyzed', format: 'dry_kibble', food_type: 'meal' },
  { id: 'f-old', brand: 'Hill’s', product_name: 'z/d', format: 'wet_canned', food_type: 'meal' },
];

type Node = ReturnType<typeof render>['UNSAFE_root'];
const flat = (n: Node) => (StyleSheet.flatten(n.props.style) ?? {}) as Record<string, unknown>;

/** The FanSlot that carries a pill: the nearest ancestor scaling about the disc's corner. */
function slotOf(view: ReturnType<typeof render>, text: RegExp): Node {
  // The card's headline names the food too, so walk every match and keep the pill's.
  for (const hit of view.getAllByText(text)) {
    let n: Node | null = hit;
    while (n && flat(n).transformOrigin !== 'bottom right') n = n.parent;
    if (n) return n;
  }
  throw new Error(`no slot for ${String(text)}`);
}

async function openAndTap(view: ReturnType<typeof render>, text: RegExp) {
  fireEvent.press(view.getByLabelText('Log event'));
  await act(async () => {});
  // The fan at rest, as a thumb finds it.
  act(() => { jest.advanceTimersByTime(600); });
  await act(async () => { fireEvent.press(view.getByText(text)); });
}

/** The card lays its check out: the stub answers with the target. */
function layOutCheck(view: ReturnType<typeof render>) {
  act(() => {
    fireEvent(view.getByTestId('meal-card-check-slot', { includeHiddenElements: true }), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 32, height: 32 } },
    });
  });
}

function mount() {
  return render(
    <>
      <FAB />
      <MealCompletionCard />
    </>,
  );
}

beforeEach(() => {
  jest.useFakeTimers();
  mockMeasured.length = 0;
  abortFlight();
  usePetStore.setState({ pets: [{ id: 'p1', name: 'Nyx' }] as never, activePet: { id: 'p1', name: 'Nyx' } as never });
  useUiStore.setState({ captureOverlay: null, logSheet: null, fabMenuOpen: false });
  useMomentStore.setState({ visible: false, payload: null, removed: false });
  useReducedMotionStore.setState({ reduceMotion: false });
  (getRecentFoods as jest.Mock).mockResolvedValue(FOODS);
  (insertMeal as jest.Mock).mockReset().mockResolvedValue({ eventId: 'e1', occurredAtIso: OCCURRED, now: OCCURRED });
  (evaluateMealLogTimeFlag as jest.Mock).mockReset().mockResolvedValue(null);
});

afterEach(() => {
  abortFlight();
  act(() => { jest.runOnlyPendingTimers(); });
  jest.useRealTimers();
  useReducedMotionStore.setState({ reduceMotion: null });
});

describe('FAB — CUL-1643, the meal lands in its card', () => {
  it('stages the pill’s meal mark for the meal it wrote, then the card lands it on its check', async () => {
    const view = mount();
    await openAndTap(view, /Hydrolyzed/);

    const staged = getFlightState();
    expect(staged.phase).toBe('staged');
    expect(staged.flight?.identity).toBe('e1');
    expect(staged.flight?.source).toEqual(mockSource);
    expect(useMomentStore.getState().visible).toBe(true);

    layOutCheck(view);
    expect(getFlightState().phase).toBe('outbound');
    expect(getFlightState().flight?.target).toEqual(mockTarget);
  });

  it('a choice never plays the cancel: the chosen pill sits out the retract and fades on its own', async () => {
    const view = mount();
    fireEvent.press(view.getByLabelText('Log event'));
    await act(async () => {});
    act(() => { jest.advanceTimersByTime(600); });
    const drawn = 6; // four doors and two foods
    // The native driver never paints back here, so the retract is read off the
    // animations it starts: one per pill on the cancel's item timing, but for the chosen.
    const timing = jest.spyOn(Animated, 'timing');
    try {
      await act(async () => { fireEvent.press(view.getByText(/Hydrolyzed/)); });
      const retracts = timing.mock.calls.filter(([, c]) => c.toValue === 0 && c.duration === 110);
      expect(retracts).toHaveLength(drawn - 1);
      // The chosen pill's own fade, after its hold.
      expect(timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ toValue: 0, duration: 200 }));
      // Its opacity is that fade's value, whole during the hold.
      expect(flat(slotOf(view, /Hydrolyzed/)).opacity).toBe(1);
    } finally {
      timing.mockRestore();
    }
    // The cancel, for contrast: every pill retracts.
    const cancel = jest.spyOn(Animated, 'timing');
    try {
      act(() => { jest.advanceTimersByTime(600); });
      fireEvent.press(view.getByLabelText('Log event'));
      await act(async () => {});
      act(() => { jest.advanceTimersByTime(600); });
      cancel.mockClear();
      fireEvent.press(view.getByLabelText('Close menu'));
      expect(cancel.mock.calls.filter(([, c]) => c.toValue === 0 && c.duration === 110)).toHaveLength(drawn);
    } finally {
      cancel.mockRestore();
    }
    act(() => { jest.advanceTimersByTime(600); });
    expect(useUiStore.getState().fabMenuOpen).toBe(false);
  });

  it('the card crossfades in place with its check and words held, and shows them as the mark lands', async () => {
    const view = mount();
    await openAndTap(view, /Hydrolyzed/);
    act(() => { jest.advanceTimersByTime(16); });
    const check = view.getByTestId('meal-card-check');
    const label = view.getByLabelText(/Logged · Royal Canin/);
    expect(flat(check).opacity).toBe(0);
    expect(flat(label).opacity).toBe(0);
    let wrapper: Node | null = view.getByTestId('meal-card-surface').parent;
    while (wrapper && !Array.isArray(flat(wrapper).transform)) wrapper = wrapper.parent;
    // In place: never the 80pt rise.
    expect(flat(wrapper!).transform).toEqual([{ translateY: 0 }]);

    layOutCheck(view);
    // The values run on the native driver, which the test renderer never paints back, so
    // the landing is read off the animations it starts: the check fades up and the words
    // follow on their own beat.
    const timing = jest.spyOn(Animated, 'timing');
    const delay = jest.spyOn(Animated, 'delay');
    try {
      act(() => settleOutbound());
      expect(getFlightState().phase).toBe('idle');
      expect(timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ toValue: 1, duration: 140 }));
      expect(timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ toValue: 1, duration: 180 }));
      expect(delay).toHaveBeenCalledWith(120);
    } finally {
      timing.mockRestore();
      delay.mockRestore();
    }
  });

  it('the dwell restarts at the landing, so the flight never eats it', async () => {
    const view = mount();
    await openAndTap(view, /Hydrolyzed/);
    act(() => { jest.advanceTimersByTime(1000); });
    layOutCheck(view);
    act(() => settleOutbound());
    await act(async () => {});
    // 5.5s after the card showed: past the old window, inside the restarted one.
    act(() => { jest.advanceTimersByTime(4500); });
    expect(useMomentStore.getState().visible).toBe(true);
    act(() => { jest.advanceTimersByTime(600); });
    expect(useMomentStore.getState().visible).toBe(false);
  });

  it('the trial heads-up waits for the mark to land', async () => {
    const flag = {
      kind: 'off_trial_list', trialId: 't1', trialStartedAt: OCCURRED, trialTargetDurationDays: 56, foodId: 'f-new',
    } as unknown as LogTimeTrialFlag;
    (evaluateMealLogTimeFlag as jest.Mock).mockResolvedValue(flag);
    const view = mount();
    await openAndTap(view, /Hydrolyzed/);
    await act(async () => {});
    expect(useMomentStore.getState().payload).not.toHaveProperty('trialFlag', flag);

    layOutCheck(view);
    act(() => settleOutbound());
    await act(async () => {});
    await act(async () => {});
    expect(useMomentStore.getState().payload).toHaveProperty('trialFlag', flag);
  });

  it('Undo mid-flight takes the flight down with the card’s confirmation', async () => {
    const view = mount();
    await openAndTap(view, /Hydrolyzed/);
    layOutCheck(view);
    expect(getFlightState().phase).toBe('outbound');
    await act(async () => { fireEvent.press(view.getByLabelText('Undo — remove this log')); });
    expect(useMomentStore.getState().removed).toBe(true);
    expect(getFlightState().phase).toBe('idle');
  });

  it('under Reduce Motion nothing is measured and nothing flies; the pill still stays', async () => {
    useReducedMotionStore.setState({ reduceMotion: true });
    const view = mount();
    await openAndTap(view, /Hydrolyzed/);
    expect(mockMeasured).toHaveLength(0);
    expect(getFlightState().phase).toBe('idle');
    expect(useMomentStore.getState().visible).toBe(true);
    act(() => { jest.advanceTimersByTime(110); });
    expect(flat(slotOf(view, /Hydrolyzed/)).opacity).toBe(1);
  });

  it('a door never flies: Vomit hands off to the sheet with no flight staged', async () => {
    const view = mount();
    fireEvent.press(view.getByLabelText('Log event'));
    await act(async () => {});
    await act(async () => { fireEvent.press(view.getByText('Vomit')); });
    expect(getFlightState().phase).toBe('idle');
    expect(mockMeasured).toHaveLength(0);
  });

  it('the mirrored dwell is the store’s own (C-34)', () => {
    useMomentStore.getState().showMeal({
      eventId: 'e9', petId: 'p1', occurredAt: OCCURRED, foodType: 'meal',
      foodBrand: null, foodProductName: null, foodFormat: null, intakeRating: null,
    } as never);
    act(() => { jest.advanceTimersByTime(MEAL_CARD_DWELL_MS - 1); });
    expect(useMomentStore.getState().visible).toBe(true);
    act(() => { jest.advanceTimersByTime(1); });
    expect(useMomentStore.getState().visible).toBe(false);
  });

  it('the flight host paints above the meal card', async () => {
    const view = render(
      <>
        <MealCompletionCard />
        <FlightHost />
      </>,
    );
    act(() => {
      useMomentStore.getState().showMeal({
        eventId: 'e2', petId: 'p1', occurredAt: OCCURRED, foodType: 'meal',
        foodBrand: null, foodProductName: null, foodFormat: null, intakeRating: null,
      } as never);
    });
    const { stageFlight } = jest.requireActual('../motion/flightMotion');
    act(() => stageFlight({ identity: 'e2', title: 't', source: mockSource, element: <></> }));
    let wrapper: Node | null = view.getByTestId('meal-card-surface').parent;
    while (wrapper && flat(wrapper).zIndex === undefined) wrapper = wrapper.parent;
    const host = view.getByTestId('flight-host', { includeHiddenElements: true });
    expect(Number(flat(host).zIndex)).toBeGreaterThan(Number(flat(wrapper!).zIndex));
    expect(Number(flat(host).elevation)).toBeGreaterThan(Number(flat(wrapper!).elevation));
  });
});
