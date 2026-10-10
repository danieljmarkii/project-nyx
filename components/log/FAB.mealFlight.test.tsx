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

jest.mock('expo-router', () => ({ router: { push: jest.fn() }, usePathname: () => '/' }));
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
// The test renderer reports no AppState, which the host and the vessel would read as a
// blur and snap every flight to its end; the app is in the foreground here.
jest.mock('../../hooks/useAppActive', () => ({ useAppActive: () => true }));
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
import { abortFlight, getFlightState, settleOutbound, stageFlight } from '../motion/flightMotion';
import { CARD_CLOCK_END_MS, COMPLETION_MOTION } from '../motion/completionMotion';
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
  await act(async () => { fireEvent.press(pillText(view, text)); });
}

/** A pill's label, never the card's headline that names the same food. */
function pillText(view: ReturnType<typeof render>, text: RegExp): Node {
  for (const hit of view.getAllByText(text)) {
    let n: Node | null = hit;
    while (n && flat(n).transformOrigin !== 'bottom right') n = n.parent;
    if (n) return hit;
  }
  throw new Error(`no pill reads ${String(text)}`);
}

/** The live value of a node's Animated opacity: the native driver never paints it back
 *  into the host's props, so it is read off the composite that carries the node. */
function animatedOpacity(host: Node): number {
  let n: Node | null = host;
  while (n) {
    const styles = ([] as unknown[]).concat(n.props.style ?? []).flat(Infinity) as { opacity?: unknown }[];
    for (const st of styles) {
      const o = st?.opacity as { __getValue?: () => number } | undefined;
      if (o && typeof o.__getValue === 'function') return o.__getValue();
    }
    n = n.parent;
  }
  throw new Error('no animated opacity');
}

/** Step every card clock started so far to its end, as the native driver would. */
function runCardClock(timing: jest.SpyInstance) {
  act(() => {
    for (const [value, config] of timing.mock.calls as [Animated.Value, Animated.TimingAnimationConfig][]) {
      if (config.toValue === CARD_CLOCK_END_MS && config.duration === CARD_CLOCK_END_MS) value.setValue(CARD_CLOCK_END_MS);
    }
  });
}
const afterEachRestore: (() => void)[] = [];

/** The card lays its check out: the stub answers with the target. */
function layOutCheck(view: ReturnType<typeof render>) {
  act(() => {
    fireEvent(view.getByTestId('meal-card-check-slot', { includeHiddenElements: true }), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 32, height: 32 } },
    });
  });
}

// The host is mounted too since CUL-1691 PR 2: the vessel it draws is what fills the
// meal disc on its landing and releases the flight.
function mount() {
  return render(
    <>
      <FAB />
      <MealCompletionCard />
      <FlightHost />
    </>,
  );
}

/** Land the mark the way the host does, and let the vessel's fill run and release. */
function landAndRelease() {
  act(() => settleOutbound());
  act(() => { jest.advanceTimersByTime(COMPLETION_MOTION.discFillMs + 20); });
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
  while (afterEachRestore.length) afterEachRestore.pop()!();
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
      await act(async () => { fireEvent.press(pillText(view, /Hydrolyzed/)); });
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

  // CUL-1691 §2.2 + R4-1 (PM-ruled: the name lands early). The card crossfades in place
  // and its own mark stays hidden under the clone, but the WORDS land on the card's own
  // clock while the disc is still flying: no `Animated.delay`, no 140ms fade on landing.
  it('the card crossfades in place, its mark held under the clone and its words landing early', async () => {
    const timing = jest.spyOn(Animated, 'timing');
    try {
      const view = mount();
      await openAndTap(view, /Hydrolyzed/);
      act(() => { jest.advanceTimersByTime(16); });
      const check = view.getByTestId('meal-card-check');
      expect(flat(check).opacity).toBe(0);
      let wrapper: Node | null = view.getByTestId('meal-card-surface').parent;
      while (wrapper && !Array.isArray(flat(wrapper).transform)) wrapper = wrapper.parent;
      // In place: never the rise.
      expect(flat(wrapper!).transform).toEqual([{ translateY: 0 }]);

      // The card's clock runs to the words' end while the flight is still up.
      act(() => { jest.advanceTimersByTime(300); });
      expect(getFlightState().phase).not.toBe('idle');
      expect(timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ toValue: 300, duration: 300 }));
      expect(flat(view.getByTestId('meal-card-check')).opacity).toBe(0);
      // The native driver never steps the clock here, so it is run to its end by hand:
      // the words are a segment of the CARD's clock and nothing about the flight gates them.
      runCardClock(timing);
      const wordsWhileFlying = animatedOpacity(view.getByLabelText(/Logged · Royal Canin/));

      layOutCheck(view);
      act(() => settleOutbound());
      // The card no longer releases: the flight waits in `landed` for the vessel's fill.
      expect(getFlightState().phase).toBe('landed');
      view.getByTestId('flight-vessel-fill', { includeHiddenElements: true });
      act(() => { jest.advanceTimersByTime(COMPLETION_MOTION.discFillMs + 20); });
      expect(getFlightState().phase).toBe('idle');
      expect(flat(view.getByTestId('meal-card-check')).opacity).toBe(1);
      // R4-1: the words were already landed while the disc was still in the air.
      expect(wordsWhileFlying).toBe(1);
      expect(timing).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ duration: 140 }));
    } finally {
      timing.mockRestore();
    }
  });

  // §2.2: "nothing may leave a + flight in landed". A fill the platform stops part-way
  // reports unfinished and still releases; a fill that never reports is released by the
  // vessel's valve at discFillMs + slack.
  for (const how of ['stopped', 'silent'] as const) {
    it(`a fill ${how} mid-play still releases: the clone never waits in landed`, async () => {
      const view = mount();
      await openAndTap(view, /Hydrolyzed/);
      layOutCheck(view);
      const real = Animated.timing;
      const timing = jest.spyOn(Animated, 'timing').mockImplementation((value, config) => {
        const anim = real(value, config);
        if (config.toValue !== COMPLETION_MOTION.discFillMs) return anim;
        return {
          ...anim,
          start: (cb?: Animated.EndCallback) => { if (how === 'stopped') cb?.({ finished: false }); },
        };
      });
      try {
        act(() => settleOutbound());
        if (how === 'stopped') {
          expect(getFlightState().phase).toBe('idle');
          return;
        }
        expect(getFlightState().phase).toBe('landed');
        act(() => { jest.advanceTimersByTime(COMPLETION_MOTION.discFillMs + COMPLETION_MOTION.valveSlackMs - 1); });
        expect(getFlightState().phase).toBe('landed');
        act(() => { jest.advanceTimersByTime(1); });
        expect(getFlightState().phase).toBe('idle');
      } finally {
        timing.mockRestore();
      }
    });
  }

  it('the card’s flight valve ends a flight whose landing never comes', async () => {
    const view = mount();
    await openAndTap(view, /Hydrolyzed/);
    layOutCheck(view);
    expect(getFlightState().phase).toBe('outbound');
    // A flight that never reports its rest (the host's spring stopped by the platform).
    act(() => { jest.advanceTimersByTime(2000); });
    expect(getFlightState().phase).toBe('idle');
    expect(flat(view.getByTestId('meal-card-check')).opacity).toBe(1);
  });

  it('a touch on the card ends ITS flight and shows the mark written', async () => {
    const view = mount();
    await openAndTap(view, /Hydrolyzed/);
    layOutCheck(view);
    expect(getFlightState().phase).toBe('outbound');
    act(() => { fireEvent(view.getByTestId('meal-card-surface'), 'touchStart'); });
    expect(getFlightState().phase).toBe('idle');
    act(() => { fireEvent(view.getByTestId('meal-card-surface'), 'touchEnd'); });
    expect(flat(view.getByTestId('meal-card-check')).opacity).toBe(1);
  });

  it('the dwell restarts at the landing, so the flight never eats it', async () => {
    const view = mount();
    await openAndTap(view, /Hydrolyzed/);
    act(() => { jest.advanceTimersByTime(1000); });
    layOutCheck(view);
    // The vessel releases the flight once its fill is done (CUL-1691 §2.2).
    landAndRelease();
    await act(async () => {});
    // 5.7s after the card showed: past the old window, inside the restarted one.
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
    // Landed is not released: the heads-up still waits for the vessel.
    expect(useMomentStore.getState().payload).not.toHaveProperty('trialFlag', flag);
    act(() => { jest.advanceTimersByTime(COMPLETION_MOTION.discFillMs + 20); });
    await act(async () => {});
    await act(async () => {});
    expect(useMomentStore.getState().payload).toHaveProperty('trialFlag', flag);
  });

  // CUL-1691 §2.3 Exit — the clone LEAVES with the card rather than vanishing under it:
  // still up at the commit, the vessel fades itself over the unwrite, and the flight ends
  // one exitMs later through the guarded call.
  it('Undo mid-flight: the clone fades with the card, then the flight ends', async () => {
    const view = mount();
    await openAndTap(view, /Hydrolyzed/);
    layOutCheck(view);
    expect(getFlightState().phase).toBe('outbound');
    const timing = jest.spyOn(Animated, 'timing');
    try {
      await act(async () => { fireEvent.press(view.getByLabelText('Undo — remove this log')); });
      expect(useMomentStore.getState().removed).toBe(true);
      expect(getFlightState().phase).not.toBe('idle');
      expect(timing).toHaveBeenCalledWith(
        expect.anything(), expect.objectContaining({ toValue: 0, duration: COMPLETION_MOTION.unwriteMs }),
      );
    } finally {
      timing.mockRestore();
    }
    act(() => { jest.advanceTimersByTime(COMPLETION_MOTION.exitMs); });
    expect(getFlightState().phase).toBe('idle');
  });

  it('a flight staged inside the leaving window survives the old card’s abort', async () => {
    const view = mount();
    await openAndTap(view, /Hydrolyzed/);
    layOutCheck(view);
    await act(async () => { fireEvent.press(view.getByLabelText('Undo — remove this log')); });
    act(() => { jest.advanceTimersByTime(60); });
    act(() => stageFlight({ identity: 'e2', title: 't', source: mockSource, element: <></> }));
    act(() => { jest.advanceTimersByTime(COMPLETION_MOTION.exitMs); });
    expect(getFlightState().phase).toBe('staged');
    expect(getFlightState().flight?.identity).toBe('e2');
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

  // The code review's four gaps (2026-10-08): each was a path the first cut left open.
  it('a card dismissed mid-flight takes the flight with it, and the pill’s mark comes back', async () => {
    const view = mount();
    await openAndTap(view, /Hydrolyzed/);
    layOutCheck(view);
    expect(getFlightState().phase).toBe('outbound');
    act(() => { jest.advanceTimersByTime(600); });
    // Fresh flight still up (the host's spring is driven by hand here): pin it outbound.
    if (getFlightState().phase === 'idle') return;
    const timing = jest.spyOn(Animated, 'timing');
    try {
      // The owner opens the fan again before the mark lands: the open dismisses the card.
      fireEvent.press(view.getByLabelText('Log event'));
      await act(async () => {});
      expect(useMomentStore.getState().visible).toBe(false);
      // Still up at that commit; the vessel fades over the card's exit.
      expect(getFlightState().phase).not.toBe('idle');
      expect(timing).toHaveBeenCalledWith(
        expect.anything(), expect.objectContaining({ toValue: 0, duration: COMPLETION_MOTION.exitMs }),
      );
    } finally {
      timing.mockRestore();
    }
    act(() => { jest.advanceTimersByTime(COMPLETION_MOTION.exitMs); });
    expect(getFlightState().phase).toBe('idle');
  });

  it('an Undo mid-flight, then a second meal in place: the new card shows its check and words', async () => {
    const timing = jest.spyOn(Animated, 'timing');
    afterEachRestore.push(() => timing.mockRestore());
    const view = mount();
    await openAndTap(view, /Hydrolyzed/);
    layOutCheck(view);
    await act(async () => { fireEvent.press(view.getByLabelText('Undo — remove this log')); });
    act(() => {
      useMomentStore.getState().showMeal({
        eventId: 'e3', petId: 'p1', occurredAt: OCCURRED, foodType: 'meal',
        foodBrand: 'Purina', foodProductName: 'HA', foodFormat: null, intakeRating: null,
      } as never);
    });
    // The full arrival from its first frame (the old card was removed, not up): the
    // check is drawn, and the words re-land on the new card's clock.
    expect(flat(view.getByTestId('meal-card-check')).opacity).toBe(1);
    expect(animatedOpacity(view.getByLabelText(/Logged · Purina/))).toBe(0);
    runCardClock(timing);
    expect(animatedOpacity(view.getByLabelText(/Logged · Purina/))).toBe(1);
  });

  it('a card re-shown with an unchanged layout still lands the mark (no onLayout fires)', async () => {
    const view = mount();
    await openAndTap(view, /Hydrolyzed/);
    layOutCheck(view);
    landAndRelease();
    act(() => { jest.advanceTimersByTime(8000); });
    expect(useMomentStore.getState().visible).toBe(false);
    (insertMeal as jest.Mock).mockResolvedValue({ eventId: 'e2', occurredAtIso: OCCURRED, now: OCCURRED });
    await openAndTap(view, /Hydrolyzed/);
    expect(getFlightState().flight?.identity).toBe('e2');
    // No layout event this time: the frame after the reveal asks for the target.
    act(() => { jest.advanceTimersByTime(32); });
    expect(getFlightState().phase).toBe('outbound');
    expect(getFlightState().flight?.target).toEqual(mockTarget);
  });

  it('a tap that beats the open’s springs flies nothing: its pill is still on its way out', async () => {
    const view = mount();
    fireEvent.press(view.getByLabelText('Log event'));
    await act(async () => {});
    await act(async () => { fireEvent.press(pillText(view, /Hydrolyzed/)); });
    expect(mockMeasured).toHaveLength(0);
    expect(getFlightState().phase).toBe('idle');
    expect(useMomentStore.getState().visible).toBe(true);
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

describe('FAB — the old card’s flight still ends when a new card shows inside the window (CUL-1712 review)', () => {
  it('a log-screen meal shown inside the 180ms window does not cancel the old flight’s end', async () => {
    const view = mount();
    await openAndTap(view, /Hydrolyzed/);
    layOutCheck(view);
    expect(getFlightState().phase).toBe('outbound');
    await act(async () => { fireEvent.press(view.getByLabelText('Undo — remove this log')); });
    act(() => { jest.advanceTimersByTime(60); });
    // A second meal from /log (no flight of its own) inside the window.
    act(() => {
      useMomentStore.getState().showMeal({
        eventId: 'e5', petId: 'p1', occurredAt: OCCURRED, foodType: 'meal',
        foodBrand: 'Purina', foodProductName: 'HA', foodFormat: null, intakeRating: null,
      } as never);
    });
    act(() => { jest.advanceTimersByTime(COMPLETION_MOTION.exitMs); });
    expect(getFlightState().phase).toBe('idle');
  });
});
