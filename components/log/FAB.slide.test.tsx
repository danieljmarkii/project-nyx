// Hold and slide on the FAB (CUL-1278, PM ruling D5 = a; the convening's five amendments,
// CUL-1625). The write RULE is pinned as data in `lib/fanSlide.test.ts`; this file pins
// the WIRING: that the disc's hold opens the fan, that the finger is followed and each
// release runs exactly the tap's action or nothing, and that a release can never write
// against a fan that is not measured.
//
// The platform's measurement is the one edge stubbed: the test renderer's host nodes never
// answer `measure` (`lib/measureNode.ts`), so the stub answers each slide target with its
// page frame from `mockFrames`, keyed by the node's testID (the disc's wrapper included),
// and answers nothing at all while `mockMeasureOn` is off, which is a fan whose frames
// have not come back. Every touch carries its own event timestamp, as the platform's do,
// so the dwell is driven on that clock and a test can stall JS behind it.

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../lib/storage', () => ({ getPublicUrl: () => null }));
jest.mock('../../lib/haptics', () => ({
  openMenu: jest.fn(),
  slideCross: jest.fn(),
  commitRoutine: jest.fn(),
  commitSymptom: jest.fn(),
  selectChip: jest.fn(),
  destructiveConfirm: jest.fn(),
}));
jest.mock('../../lib/db', () => ({ getRecentFoods: jest.fn(async () => []) }));
jest.mock('../../hooks/useTodayKey', () => ({ useTodayKey: () => '2026-10-08' }));
jest.mock('../../lib/meals', () => ({ insertMeal: jest.fn() }));
jest.mock('../../lib/captureChanges', () => ({ recordCaptureChange: jest.fn(async () => 0) }));
jest.mock('../../lib/trialContaminant', () => ({
  evaluateMealLogTimeFlag: jest.fn(async () => null),
  noteTrialFlagShown: jest.fn(),
}));
jest.mock('../pet/PetSwitcherSheet', () => ({ PetSwitcherSheet: () => null }));

// The fan at rest on a 390pt phone, in window points: 44pt pills 8pt apart, the split
// stool pill's two segments side by side, the disc below the lowest food.
const mockFrames: Record<string, { x: number; y: number; width: number; height: number }> = {
  'fab-pill-more': { x: 100, y: 300, width: 260, height: 44 },
  'fab-stool-normal': { x: 250, y: 352, width: 52, height: 44 },
  'fab-stool-loose': { x: 306, y: 352, width: 52, height: 44 },
  'fab-pill-vomit': { x: 100, y: 404, width: 260, height: 44 },
  'fab-pill-log-food': { x: 100, y: 456, width: 260, height: 44 },
  'fab-pill-food-f-old': { x: 100, y: 508, width: 260, height: 44 },
  'fab-pill-food-f-new': { x: 100, y: 560, width: 260, height: 44 },
  'fab-disc-touch': { x: 302, y: 622, width: 56, height: 56 },
};
let mockMeasureOn = true;
jest.mock('../../lib/measureNode', () => ({
  measureNodeInWindow: (_node: unknown, cb: (r: unknown) => void) => cb(null),
  measureNodeOnPage: (node: { props?: { testID?: string } } | null, cb: (r: unknown) => void) => {
    if (!mockMeasureOn) return;
    cb(mockFrames[node?.props?.testID ?? ''] ?? null);
  },
}));

import { AccessibilityInfo, StyleSheet } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { router } from 'expo-router';
import { FAB } from './FAB';
import { theme } from '../../constants/theme';
import { FOOD_DWELL_MS, HOLD_TO_OPEN_MS, STILL_SLOP_PT } from '../../lib/fanSlide';
import { usePetStore } from '../../store/petStore';
import { useUiStore } from '../../store/uiStore';
import { useMomentStore } from '../../store/momentStore';
import { useReducedMotionStore } from '../../store/reducedMotionStore';
import { getRecentFoods } from '../../lib/db';
import { insertMeal } from '../../lib/meals';
import { openMenu as openMenuHaptic, slideCross } from '../../lib/haptics';

const FOODS = [
  { id: 'f-new', brand: 'Royal Canin', product_name: 'Hydrolyzed', format: 'dry_kibble', food_type: 'meal' },
  { id: 'f-old', brand: 'Hill’s', product_name: 'z/d', format: 'wet_canned', food_type: 'meal' },
];
const DISC = { x: 330, y: 650 };

type View = ReturnType<typeof render>;

const centreOf = (testID: string) => {
  const r = mockFrames[testID];
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
};

/** A touch event, stamped on the touch's own clock: the fake clock unless a test says
 *  otherwise (a JS stall is a handler running late behind an early timestamp). */
function touch(view: View, kind: 'touchMove' | 'touchEnd', p: { x: number; y: number }, at = Date.now()) {
  act(() => {
    fireEvent(view.getByTestId('fab-disc-touch'), kind, { nativeEvent: { pageX: p.x, pageY: p.y, timestamp: at } });
  });
}
const move = (view: View, p: { x: number; y: number }, at?: number) => touch(view, 'touchMove', p, at);
const lift = (view: View, p: { x: number; y: number }, at?: number) => touch(view, 'touchEnd', p, at);

/** Press the disc and hold it past the threshold: the fan opens in slide mode. With
 *  `land`, the open's springs run to rest and the fan is measured. */
async function hold(view: View, { land = true } = {}) {
  const disc = view.getByLabelText('Log event');
  fireEvent(disc, 'pressIn', { nativeEvent: { pageX: DISC.x, pageY: DISC.y } });
  fireEvent(disc, 'longPress');
  await act(async () => {});
  if (land) await act(async () => { jest.advanceTimersByTime(1000); });
}

/** Rest the finger on a pill for `ms`. */
function rest(view: View, testID: string, ms: number) {
  move(view, centreOf(testID));
  act(() => { jest.advanceTimersByTime(ms); });
}

async function mount() {
  const view = render(<FAB />);
  await act(async () => {});
  return view;
}

let srSpy: jest.SpyInstance;
const menuOpen = () => useUiStore.getState().fabMenuOpen;

beforeEach(() => {
  jest.useFakeTimers();
  mockMeasureOn = true;
  usePetStore.setState({ pets: [{ id: 'p1', name: 'Nyx' }] as never, activePet: { id: 'p1', name: 'Nyx' } as never });
  useUiStore.setState({ captureOverlay: null, logSheet: null, fabMenuOpen: false });
  useMomentStore.setState({ visible: false, payload: null } as never);
  useReducedMotionStore.setState({ reduceMotion: false });
  (getRecentFoods as jest.Mock).mockReset().mockResolvedValue(FOODS);
  (insertMeal as jest.Mock).mockReset().mockResolvedValue({
    eventId: 'ev-1', occurredAtIso: '2026-10-09T12:00:00.000Z', now: '2026-10-09T12:00:00.000Z',
  });
  (router.push as jest.Mock).mockClear();
  (openMenuHaptic as jest.Mock).mockClear();
  (slideCross as jest.Mock).mockClear();
  srSpy = jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
});

afterEach(() => {
  srSpy.mockRestore();
  jest.useRealTimers();
});

describe('the hold', () => {
  it('opens the fan on the threshold the rule names, with the tap’s own open', async () => {
    const view = await mount();
    expect(view.UNSAFE_getByProps({ delayLongPress: HOLD_TO_OPEN_MS }).props.onLongPress).toEqual(expect.any(Function));
    await hold(view);
    expect(menuOpen()).toBe(true);
    expect(openMenuHaptic).toHaveBeenCalledTimes(1);
    expect(insertMeal).not.toHaveBeenCalled();
  });

  it('a hold that never moves is a slow tap: the fan stays open, nothing written', async () => {
    const view = await mount();
    await hold(view);
    lift(view, DISC);
    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(menuOpen()).toBe(true);
  });

  // F2 of the adversarial review: a slow tap that rolls 10pt on the disc is still a tap.
  it('a slow tap that rolls on the disc stays open too', async () => {
    const view = await mount();
    await hold(view);
    move(view, { x: DISC.x + 10, y: DISC.y - 10 });
    lift(view, { x: DISC.x + 10, y: DISC.y - 10 });
    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(menuOpen()).toBe(true);
    expect(insertMeal).not.toHaveBeenCalled();
    expect(useUiStore.getState().logSheet).toBeNull();
  });

  it('the tap path is untouched: a press opens and a second press closes', async () => {
    const view = await mount();
    fireEvent.press(view.getByLabelText('Log event'));
    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(menuOpen()).toBe(true);
    fireEvent.press(view.getByLabelText('Close menu'));
    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(menuOpen()).toBe(false);
  });

  // Amendment 4. VoiceOver's double-tap-and-hold is a long press; with a screen reader
  // on the disc takes none, so every press is the tap.
  it('takes no long press while a screen reader runs', async () => {
    srSpy.mockResolvedValue(true);
    const view = await mount();
    // The Pressable itself, found by the prop it always carries: its host View never
    // holds onLongPress, so asking the labelled host would be green over nothing.
    expect(view.UNSAFE_getByProps({ delayLongPress: HOLD_TO_OPEN_MS }).props.onLongPress).toBeUndefined();
  });
});

describe('amendment 2 — a symptom opens its confirm and never writes', () => {
  it.each([
    ['fab-pill-vomit', 'vomit'],
    ['fab-stool-normal', 'stool_normal'],
    ['fab-stool-loose', 'diarrhea'],
  ] as const)('a release on %s opens the sheet at %s', async (testID, initialType) => {
    const view = await mount();
    await hold(view);
    move(view, centreOf(testID));
    lift(view, centreOf(testID));
    expect(useUiStore.getState().logSheet).toEqual({ initialType, veil: 'handed' });
    expect(insertMeal).not.toHaveBeenCalled();
  });

  it('More events and Log food do what their tap does', async () => {
    let view = await mount();
    await hold(view);
    move(view, centreOf('fab-pill-more'));
    lift(view, centreOf('fab-pill-more'));
    expect(useUiStore.getState().logSheet).toEqual({ initialType: null, veil: 'handed' });
    view.unmount();

    useUiStore.setState({ logSheet: null, fabMenuOpen: false });
    view = await mount();
    await hold(view);
    move(view, centreOf('fab-pill-log-food'));
    lift(view, centreOf('fab-pill-log-food'));
    expect(router.push).toHaveBeenCalledWith('/log?type=meal');
  });
});

describe('amendment 3 — a food writes only from a pill held still on a landed fan', () => {
  it('writes the food rested on, through the tap’s writer and its card', async () => {
    const view = await mount();
    await hold(view);
    rest(view, 'fab-pill-food-f-new', FOOD_DWELL_MS);
    await act(async () => { lift(view, centreOf('fab-pill-food-f-new')); });
    expect(insertMeal).toHaveBeenCalledTimes(1);
    expect((insertMeal as jest.Mock).mock.calls[0][0]).toMatchObject({ petId: 'p1', foodId: 'f-new', occurredAtSource: 'now' });
    expect(useMomentStore.getState().payload).toMatchObject({ kind: 'meal', eventId: 'ev-1' });
  });

  it('never writes a food lifted short of the dwell: the fan stays open', async () => {
    const view = await mount();
    await hold(view);
    rest(view, 'fab-pill-food-f-new', FOOD_DWELL_MS - 1);
    await act(async () => { lift(view, centreOf('fab-pill-food-f-new')); });
    expect(insertMeal).not.toHaveBeenCalled();
    expect(menuOpen()).toBe(true);
  });

  it('a slide across one food to rest on another writes only the second', async () => {
    const view = await mount();
    await hold(view);
    move(view, centreOf('fab-pill-food-f-new'));
    rest(view, 'fab-pill-food-f-old', FOOD_DWELL_MS);
    await act(async () => { lift(view, centreOf('fab-pill-food-f-old')); });
    expect(insertMeal).toHaveBeenCalledTimes(1);
    expect((insertMeal as jest.Mock).mock.calls[0][0]).toMatchObject({ foodId: 'f-old' });
  });

  it('a finger still travelling down a food never banks its dwell', async () => {
    const view = await mount();
    await hold(view);
    const c = centreOf('fab-pill-food-f-new');
    // Ten moves, each past the slop, each a little under the dwell apart: the clock
    // restarts on every one, so the lift is never "held still".
    for (let i = 0; i < 10; i += 1) {
      move(view, { x: c.x - 60 + i * (STILL_SLOP_PT + 2), y: c.y });
      act(() => { jest.advanceTimersByTime(FOOD_DWELL_MS - 10); });
    }
    await act(async () => { lift(view, { x: c.x - 60 + 9 * (STILL_SLOP_PT + 2), y: c.y }); });
    expect(insertMeal).not.toHaveBeenCalled();
  });

  it('nothing acts on a fan that has not landed: the release closes, unwritten', async () => {
    const view = await mount();
    await hold(view, { land: false });
    move(view, centreOf('fab-pill-vomit'));
    act(() => { jest.advanceTimersByTime(FOOD_DWELL_MS); });
    lift(view, centreOf('fab-pill-vomit'));
    expect(useUiStore.getState().logSheet).toBeNull();
    expect(insertMeal).not.toHaveBeenCalled();
  });

  // B1 of the adversarial review: a 30ms brush on a food whose touchEnd JS reaches 500ms
  // late. The handler-side clock reads a rest; the touch's own clock does not.
  it('a JS stall never turns a brush past a food into a rest', async () => {
    const view = await mount();
    await hold(view);
    const t0 = Date.now();
    move(view, centreOf('fab-pill-food-f-new'), t0);
    act(() => { jest.advanceTimersByTime(500); });
    await act(async () => { lift(view, centreOf('fab-pill-food-f-new'), t0 + 30); });
    expect(insertMeal).not.toHaveBeenCalled();
  });

  it('a finger already still on a food as the fan lands cannot write until it is timed', async () => {
    const view = await mount();
    await hold(view, { land: false });
    // Over the food before any frame is known: no rest can start.
    move(view, centreOf('fab-pill-food-f-new'));
    await act(async () => { jest.advanceTimersByTime(1000); });
    // The fan has landed and is measured; the finger never moved again.
    await act(async () => { lift(view, centreOf('fab-pill-food-f-new')); });
    expect(insertMeal).not.toHaveBeenCalled();
    expect(menuOpen()).toBe(true);
  });

  it('rows that change under the finger drop the measure until they are measured again', async () => {
    // A tap that beat the mount read: the foods land after the fan has. Before they do,
    // the column is shorter and Vomit stands where the older food will.
    let answer: (v: unknown) => void = () => {};
    (getRecentFoods as jest.Mock).mockReset().mockImplementation(() => new Promise((r) => { answer = r; }));
    const vomitAtRest = mockFrames['fab-pill-vomit'];
    mockFrames['fab-pill-vomit'] = mockFrames['fab-pill-food-f-old'];
    try {
      const view = render(<FAB />);
      await hold(view);
      // The foods land and push the column up, and their frames have not come back.
      mockMeasureOn = false;
      await act(async () => { answer(FOODS); });
      // The finger rests where Vomit WAS, which is the older food now. A stale measure
      // would open Vomit's confirm over a food; the dropped one hits nothing.
      rest(view, 'fab-pill-food-f-old', FOOD_DWELL_MS * 4);
      await act(async () => { lift(view, centreOf('fab-pill-food-f-old')); });
      expect(useUiStore.getState().logSheet).toBeNull();
      expect(insertMeal).not.toHaveBeenCalled();
    } finally {
      mockFrames['fab-pill-vomit'] = vomitAtRest;
    }
  });

  it('and once the new rows are measured, the food under the finger is the food', async () => {
    let answer: (v: unknown) => void = () => {};
    (getRecentFoods as jest.Mock).mockReset().mockImplementation(() => new Promise((r) => { answer = r; }));
    const view = render(<FAB />);
    await hold(view);
    await act(async () => { answer(FOODS); });
    rest(view, 'fab-pill-food-f-old', FOOD_DWELL_MS);
    await act(async () => { lift(view, centreOf('fab-pill-food-f-old')); });
    expect((insertMeal as jest.Mock).mock.calls.map((c) => c[0].foodId)).toEqual(['f-old']);
  });
});

describe('a release off every pill closes with no write', () => {
  it.each([
    ['back on the disc', DISC],
    ['over the veil', { x: 20, y: 120 }],
  ])('%s', async (_, at) => {
    const view = await mount();
    await hold(view);
    rest(view, 'fab-pill-food-f-new', FOOD_DWELL_MS * 2);
    move(view, at);
    await act(async () => { lift(view, at); });
    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(insertMeal).not.toHaveBeenCalled();
    expect(useUiStore.getState().logSheet).toBeNull();
    expect(menuOpen()).toBe(false);
  });

  it('a cancelled touch closes with no write', async () => {
    const view = await mount();
    await hold(view);
    rest(view, 'fab-pill-food-f-new', FOOD_DWELL_MS * 2);
    act(() => { fireEvent(view.getByTestId('fab-disc-touch'), 'touchCancel', {}); });
    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(insertMeal).not.toHaveBeenCalled();
    expect(menuOpen()).toBe(false);
  });
});

// D1 of the adversarial review: a measure in a space the touch is not reported in (an
// Android root under the status bar) would land every hit a pill off. The disc's own
// frame must contain the point that pressed it, or nothing is hit at all.
describe('the measure is trusted only in the touch’s own space', () => {
  it('a disc frame a status bar away leaves the fan tap only: no hit, no write', async () => {
    const atRest = mockFrames['fab-disc-touch'];
    mockFrames['fab-disc-touch'] = { ...atRest, y: atRest.y - 80 };
    try {
      const view = await mount();
      await hold(view);
      rest(view, 'fab-pill-food-f-new', FOOD_DWELL_MS * 2);
      await act(async () => { lift(view, centreOf('fab-pill-food-f-new')); });
      expect(insertMeal).not.toHaveBeenCalled();
      expect(slideCross).not.toHaveBeenCalled();
    } finally {
      mockFrames['fab-disc-touch'] = atRest;
    }
  });

  it('one frame that does not come back drops the whole measure', async () => {
    const vomit = mockFrames['fab-pill-vomit'];
    delete mockFrames['fab-pill-vomit'];
    try {
      const view = await mount();
      await hold(view);
      move(view, centreOf('fab-pill-log-food'));
      lift(view, centreOf('fab-pill-log-food'));
      expect(router.push).not.toHaveBeenCalled();
    } finally {
      mockFrames['fab-pill-vomit'] = vomit;
    }
  });
});

// C2 of the adversarial review: in the large-text scroll branch a door scrolled under the
// pinned chip still measures where it hides, so the hold opens the fan and takes no slide.
describe('the scroll branch is tap only', () => {
  it('a hold on an SE at AX3 opens the fan and a release over a door does nothing', async () => {
    const dims = jest.spyOn(require('react-native'), 'useWindowDimensions')
      .mockReturnValue({ width: 320, height: 568, fontScale: 2.643, scale: 2 });
    try {
      const view = await mount();
      await hold(view);
      expect(view.getByTestId('fab-fan-scroll')).toBeTruthy();
      move(view, centreOf('fab-pill-vomit'));
      lift(view, centreOf('fab-pill-vomit'));
      expect(useUiStore.getState().logSheet).toBeNull();
      expect(slideCross).not.toHaveBeenCalled();
      expect(menuOpen()).toBe(true);
    } finally {
      dims.mockRestore();
    }
  });
});

// E1 / E2 of the adversarial review: a fan closed under the finger ends the slide.
describe('a close under the finger ends the slide', () => {
  it('after the capture overlay stands the FAB down, a move ticks and fills nothing', async () => {
    const view = await mount();
    await hold(view);
    act(() => { useUiStore.setState({ captureOverlay: { drawsDoneBar: true } as never }); });
    act(() => { useUiStore.setState({ captureOverlay: null }); });
    move(view, centreOf('fab-pill-vomit'));
    lift(view, centreOf('fab-pill-vomit'));
    expect(slideCross).not.toHaveBeenCalled();
    expect(useUiStore.getState().logSheet).toBeNull();
  });

  it('a corner card that closes the fan ends the slide with it', async () => {
    const view = await mount();
    await hold(view);
    move(view, centreOf('fab-pill-vomit'));
    expect(slideCross).toHaveBeenCalledTimes(1);
    act(() => {
      useMomentStore.setState({
        visible: true,
        payload: { kind: 'meal', eventId: 'ev-x', petId: 'p1', occurredAt: '2026-10-09T12:00:00.000Z' },
      } as never);
    });
    move(view, centreOf('fab-pill-log-food'));
    lift(view, centreOf('fab-pill-log-food'));
    expect(slideCross).toHaveBeenCalledTimes(1);
    expect(router.push).not.toHaveBeenCalled();
  });
});

describe('what the finger feels and sees', () => {
  it('ticks once on arriving at each pill and never on leaving for empty space', async () => {
    const view = await mount();
    await hold(view);
    move(view, centreOf('fab-pill-food-f-new'));
    move(view, { x: centreOf('fab-pill-food-f-new').x + 2, y: centreOf('fab-pill-food-f-new').y });
    move(view, centreOf('fab-pill-food-f-old'));
    move(view, { x: 20, y: 120 });
    expect(slideCross).toHaveBeenCalledTimes(2);
  });

  it('the pill under the finger takes its pressed fill, and lets it go after', async () => {
    const view = await mount();
    await hold(view);
    const fill = () => StyleSheet.flatten(view.getByTestId('fab-pill-vomit').props.style).backgroundColor;
    expect(fill()).toBe(theme.colorSurface);
    move(view, centreOf('fab-pill-vomit'));
    expect(fill()).toBe(theme.colorSurfaceSubtle);
    move(view, { x: 20, y: 120 });
    expect(fill()).toBe(theme.colorSurface);
  });
});
