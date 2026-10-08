// The FAB menu's pet switcher (CUL-678 · PM ruling D2 = i).
//
// The menu leads with a "Logging for {pet}" chip that opens the same switcher the
// Home header uses (multi-pet spec §3.3) — and unlike the log sheet, this surface
// is shipped and unflagged. It is a capture surface by the same test as the sheet:
// the rows beneath the chip write a meal in one press. So "Add a pet" here lands
// the owner back on a one-tap logging menu that is now about a different pet.
//
// This file pins only that: the chip's switcher is a capture host, and it is still
// the Modal wrapper (the FAB presents from the root — nothing is up when it opens,
// so the CUL-662 layer split does not apply here and must not be "tidied" into it).

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
// momentStore reaches the sync layer, which fails fast without the client env.
jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../lib/storage', () => ({ getPublicUrl: () => null }));
// The commit verbs too: a one-tap food that lands reveals its meal card, and the
// moment store plays the card's haptic at that reveal.
jest.mock('../../lib/haptics', () => ({
  openMenu: jest.fn(),
  commitRoutine: jest.fn(),
  commitSymptom: jest.fn(),
  selectChip: jest.fn(),
  destructiveConfirm: jest.fn(),
}));
jest.mock('../../lib/db', () => ({ getRecentFoods: jest.fn(async () => []) }));
// CUL-1647 — the day key is the FAB's midnight trigger. Its own timer is pinned in
// useTodayKey.test.ts; here it is a value the day-order tests turn, so the animation
// helpers' runAllTimers never jumps the clock past a midnight a test did not ask for.
let mockTodayKey = '2026-10-08';
jest.mock('../../hooks/useTodayKey', () => ({ useTodayKey: () => mockTodayKey }));
jest.mock('../../lib/meals', () => ({ insertMeal: jest.fn() }));
jest.mock('../../lib/trialContaminant', () => ({
  evaluateMealLogTimeFlag: jest.fn(async () => null),
  noteTrialFlagShown: jest.fn(),
}));
// The switcher is stubbed to report the props it was GIVEN. Rendering the real
// panel here would test the panel again; what only the FAB can answer is which
// kind of host it declares itself to be.
const mockSwitcherProps: Record<string, unknown>[] = [];
jest.mock('../pet/PetSwitcherSheet', () => ({
  PetSwitcherSheet: (props: Record<string, unknown>) => {
    mockSwitcherProps.push(props);
    const { Text } = require('react-native');
    return props.visible ? <Text>switcher-open</Text> : null;
  },
}));

import { Alert, Animated, StyleSheet, Text } from 'react-native';
import { act, render, fireEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import { FAB, HiddenUnderFabMenu } from './FAB';
import { theme } from '../../constants/theme';
import { usePetStore } from '../../store/petStore';
import { useUiStore } from '../../store/uiStore';
import { useMomentStore } from '../../store/momentStore';
import { useEventStore } from '../../store/eventStore';
import { useFoodLibraryStore } from '../../store/foodLibraryStore';
import { useSyncStore } from '../../store/syncStore';
import { useRecordChangeStore } from '../../store/recordChangeStore';
import { useReducedMotionStore } from '../../store/reducedMotionStore';

function seedPets(count: number) {
  const pets =
    count > 1
      ? [{ id: 'p1', name: 'Nyx' }, { id: 'p2', name: 'Mochi' }]
      : [{ id: 'p1', name: 'Nyx' }];
  usePetStore.setState({ pets: pets as never, activePet: { id: 'p1', name: 'Nyx' } as never });
}

/** Open the FAB menu, settling the recent-foods load its effect kicks off. */
async function openMenu() {
  const view = render(<FAB />);
  fireEvent.press(view.getByLabelText('Log event'));
  await act(async () => {});
  return view;
}

/** Every text in the rendered tree, top to bottom — the fan's order as drawn. The
 *  fan is a column anchored to the disc, so the LAST label is the pill nearest it. */
function fanLabels(view: ReturnType<typeof render>): string[] {
  return view
    .UNSAFE_queryAllByType(Text)
    .map((t: TreeNode) => [t.props.children].flat().join(''))
    .filter((label) => label.length > 0);
}

/** A node of the rendered tree, as `findAll` hands it over. */
type TreeNode = ReturnType<typeof render>['UNSAFE_root'];
/** A flattened style entry, as the tree carries it. */
type StyleEntry = { transform?: unknown; transformOrigin?: string } | null | undefined;

/** Every host view that takes a touch — TouchableOpacity and Pressable alike render
 *  one carrying the responder's release handler. */
function pressableHosts(view: ReturnType<typeof render>) {
  return view.UNSAFE_root.findAll(
    (n: TreeNode) => typeof n.type === 'string' && typeof n.props.onResponderRelease === 'function',
  );
}

beforeEach(() => {
  mockSwitcherProps.length = 0;
  (router.push as jest.Mock).mockClear();
  seedPets(2);
  useUiStore.setState({ captureOverlay: null, logSheet: null, fabMenuOpen: false });
  useReducedMotionStore.setState({ reduceMotion: null });
});

describe('FAB — the "Logging for" switcher', () => {
  it('opens it as a capture host, so it carries no account management', async () => {
    const view = await openMenu();
    fireEvent.press(view.getByLabelText('Logging for Nyx — switch pet'));

    expect(view.getByText('switcher-open')).toBeTruthy();
    const open = mockSwitcherProps.filter((p) => p.visible);
    expect(open.length).toBeGreaterThan(0);
    expect(open.every((p) => p.captureSurface === true)).toBe(true);
  });

  // Not a stylistic preference — the FAB menu is an in-tree overlay, not a Modal, so
  // nothing is presented when the switcher opens and the wrapper is correct here.
  // The layer split exists for hosts that ARE a Modal (EventTypeSheet); using it
  // here would give the switcher no presentation at all.
  it('still uses the Modal wrapper, not the in-Modal layer', async () => {
    await openMenu();
    expect(mockSwitcherProps.length).toBeGreaterThan(0);
    expect(mockSwitcherProps.every((p) => p.animated === undefined)).toBe(true);
  });

  // §7.8 — single-pet households see no multi-pet chrome, so there is no switcher to
  // classify. A regression guard: it passes before and after, and it is here because
  // the capture rule must not become a reason to render the chip.
  it('renders no chip at all for a one-pet household', async () => {
    seedPets(1);
    const view = await openMenu();
    expect(view.queryByLabelText('Logging for Nyx — switch pet')).toBeNull();
  });
});

// ── Three doors, one sheet, never /log (CUL-962, CUL-503, CUL-504) ─────────────
//
// More events and the two quick taps all open the ONE log sheet, which the root layout
// mounts (components/log/LogSheetHost.tsx); the FAB only publishes the request. What
// only the FAB can answer is which request each row makes, so that is what is pinned —
// the sheet's own behaviour for a request is LogSheetHost's and EventTypeSheet's.
//
// More events: the full-screen push it fell back to while the picker was a beta went
// with the flag (CUL-962), and nothing else in the tree would notice if it came back.
// The quick taps (CUL-504): they pushed /log?type=vomit|diarrhea, the full-screen
// confirm, one tap away in the same menu from the sheet's own confirm for the same
// event. Each case below reds if its row goes back to a push.
describe('FAB — the rows that open the log sheet', () => {
  it.each([
    ['More events', null],
    ['Vomit', 'vomit'],
    ['Loose stool', 'diarrhea'],
  ] as const)('%s opens the sheet (initialType %s) and pushes nothing', async (row, initialType) => {
    const view = await openMenu();
    expect(useUiStore.getState().logSheet).toBeNull();
    fireEvent.press(view.getByText(row));
    expect(useUiStore.getState().logSheet).toEqual({ initialType, veil: 'handed' });
    expect(router.push).not.toHaveBeenCalled();
  });

  // Log food is NOT one of them: a meal has its own picker, and the sheet's grid hands a
  // Meal tap straight back to /log?type=meal anyway. A regression guard, green before and
  // after — it pins that the re-routing stopped at the three rows above.
  it('Log food still goes straight to the meal logger', async () => {
    const view = await openMenu();
    fireEvent.press(view.getByText('Log food'));
    expect(router.push).toHaveBeenCalledWith('/log?type=meal');
    expect(useUiStore.getState().logSheet).toBeNull();
  });
});

// ── CUL-717 — the menu with no pet to log for ────────────────────────────────
//
// Same defect and same ruled shape as CUL-681 one layer down: with no activePet
// the rows either wrote nothing and said nothing (a recent-food tap did not even
// show its spinner) or pushed into /log, which is gated on a pet it does not
// have. The gate is that the rows do not render, so there is nothing to tap.
//
// Four of the five below are GUARDS: run against the pre-fix tree and confirmed
// red before being trusted green (CUL-613). The one marked a regression guard is
// the opposite direction — it must pass before AND after, because its job is to
// pin behaviour the gate must not break. Each test states which it is, and the
// run is what decided: two of these labels were written wrong and corrected by
// it, one in each direction (see the notes on tests 3 and 5).

const { getRecentFoods } = require('../../lib/db') as { getRecentFoods: jest.Mock };

/** A signed-in session whose pets read has not answered yet — the common cause. */
function seedNoPets() {
  usePetStore.setState({ pets: [] as never, activePet: null as never });
}

/** Every row the menu offers when it has a pet. */
const ACTION_ROWS = ['Log food', 'Vomit', 'Loose stool', 'More events'];

describe('FAB — no pet to log for', () => {
  it('offers no row to tap, and says why instead', async () => {
    seedNoPets();
    const view = await openMenu();

    expect(view.getByText('No pet loaded yet')).toBeTruthy();
    for (const row of ACTION_ROWS) expect(view.queryByText(row)).toBeNull();
    // The "Recent foods" header goes too — a section head over nothing is the
    // menu still claiming to be a logging menu.
    expect(view.queryByText('Recent foods')).toBeNull();
  });

  it('takes the recent-food rows with it when the pet goes', async () => {
    // The discriminating case. Opening with NO pet never loads foods (the effect
    // is gated on one), so an empty menu proves nothing on its own — the rows
    // have to exist first. Open with a pet, let the foods land, then lose the
    // store: pre-fix the row stayed on screen and a tap on it was the silent
    // no-op this issue was filed for.
    getRecentFoods.mockResolvedValueOnce([
      { id: 'f1', brand: 'Hills', product_name: 'i/d', format: 'wet', food_type: 'meal' },
    ]);
    const view = await openMenu();
    expect(view.getByText(/Hills/)).toBeTruthy();

    await act(async () => { seedNoPets(); });

    expect(view.queryByText(/Hills/)).toBeNull();
    expect(view.getByText('No pet loaded yet')).toBeTruthy();
  });

  it('leaves no door open — the menu holds no touchable but the FAB', async () => {
    // The structural form of the claim above, and the one that survives a row
    // being ADDED to this menu later without its author reading this file: not
    // "these four labels are absent" but "nothing here is pressable".
    //
    // Its first draft asserted the switcher chip was absent and router.push
    // uncalled — and it PASSED against the pre-fix tree, so it discriminated
    // nothing (CUL-613). Both halves were already true for other reasons: the
    // chip self-suppressed on `pets.length > 1 && activePet` (which is exactly
    // what made the old menu silently pet-less rather than saying so), and
    // router.push cannot fire in a test that presses nothing.
    seedNoPets();
    const view = await openMenu();

    // Pre-fix this was 5 — Log food, Vomit, Loose stool, More events, and the
    // FAB. Only the FAB is a way OUT rather than a way in. Counted at the HOST, by
    // responder, so every kind of touchable is in it: since CUL-322 the disc is a
    // Pressable (it answers touch-DOWN), and a TouchableOpacity-only count would
    // read 0 and pass over a Pressable row. The scrim is excluded by id — it is the
    // other way out.
    const touchables = pressableHosts(view).filter((t: TreeNode) => t.props.testID !== 'fab-scrim');
    expect(touchables).toHaveLength(1);
    expect(touchables[0].props.accessibilityLabel).toBe('Close menu');
    expect(router.push).not.toHaveBeenCalled();
  });

  it('replaces the copy with the rows the moment the pets land — no reopen', async () => {
    // A guard, not a regression guard, despite reading like one: it opens on the
    // copy, which only exists post-fix. The claim is the reactive direction —
    // the branch re-evaluates, so an owner who opened the menu inside the
    // hydration window watches it fill in rather than having to close and reopen
    // it. That is most of why gating the RENDER is the right shape here and a
    // one-shot alert would not be.
    seedNoPets();
    const view = await openMenu();
    expect(view.getByText('No pet loaded yet')).toBeTruthy();

    await act(async () => { seedPets(1); });

    expect(view.queryByText('No pet loaded yet')).toBeNull();
    for (const row of ACTION_ROWS) expect(view.getByText(row)).toBeTruthy();
  });

  it('still opens on the FAB, which is deliberately not gated', async () => {
    // Regression guard — it must pass BEFORE and after, which is why it asserts
    // only the opening and not the copy. Its first draft asserted both and so
    // went red pre-fix: a mixed test cannot tell a preserved behaviour from a
    // changed one, and the copy is test 1's claim anyway.
    //
    // The button stays ungated on purpose: a missing FAB is the app looking
    // broken in a different way, and the menu it opens is the thing that
    // explains itself (Principle 5). The label flipping to 'Close menu' is the
    // menu being open — and the way back out of it.
    seedNoPets();
    const view = await openMenu();

    expect(view.getByLabelText('Close menu')).toBeTruthy();
  });
});

// ── CUL-723 ──────────────────────────────────────────────────────────────────
//
// The pet FLIP, which is a different transition from CUL-717's pet LOSS above and
// is not covered by it: `selectPet` goes A → B with no null in between, so the
// no-pet render gate never fires.
//
// The two are guards in DIFFERENT directions, and the run is what established it —
// the first draft claimed both went red pre-fix, and only one did. Test 1 reds
// against the pre-fix tree (A's rows survive the flip). Test 2 does NOT: pre-fix the
// stale list is non-empty, so the empty copy never renders and the test passes over
// the defect. What test 2 discriminates is the OTHER fix — a `setRecentFoods([])` on
// the flip — and it was proven by mutating this fix into that one and watching it
// red. Neither test is redundant; neither covers the other's mutant.
describe('FAB — a pet flip never leaves the previous pet’s foods on screen', () => {
  it('drops the outgoing pet’s one-tap rows the moment the chip changes name', async () => {
    getRecentFoods.mockResolvedValueOnce([
      { id: 'f1', brand: 'Hills', product_name: 'i/d', format: 'wet', food_type: 'meal' },
    ]);
    const view = await openMenu();
    expect(view.getByText(/Hills/)).toBeTruthy();
    expect(view.getByLabelText('Logging for Nyx — switch pet')).toBeTruthy();

    // Pet B's foods are still in flight — precisely the frame this issue is about.
    // Held open rather than resolved, because the defect lives in the gap and a
    // mock that resolves immediately closes it before the assertion can look.
    let releaseB: (foods: unknown[]) => void = () => {};
    getRecentFoods.mockImplementationOnce(
      () => new Promise((resolve) => { releaseB = resolve as never; }),
    );
    await act(async () => {
      usePetStore.setState({ activePet: { id: 'p2', name: 'Mochi' } as never });
    });

    // The chip has already repainted to B — it reads `activePet` directly...
    expect(view.getByLabelText('Logging for Mochi — switch pet')).toBeTruthy();
    // ...so A's rows must be GONE, not merely stale. Pre-fix they were still here,
    // under B's name, each one a meal written in a single press.
    expect(view.queryByText(/Hills/)).toBeNull();

    await act(async () => {
      releaseB([{ id: 'f2', brand: 'Royal Canin', product_name: 'GI', format: 'dry', food_type: 'meal' }]);
    });
    expect(view.getByText(/Royal Canin/)).toBeTruthy();
  });

  it('does not call the incoming pet foodless while its read is in flight', async () => {
    // The other half. Before CUL-322 this pinned the empty-foods line ("No foods
    // logged yet") against a `setRecentFoods([])` fix, which would have stated B had
    // no foods before anything read B's record (C-12). The fan dropped that line with
    // the panel's section headers, so the claim it guarded now has no sentence to make
    // — what remains is that the in-flight frame says NOTHING about B's foods, and
    // still offers the way forward in the thumb's slot.
    getRecentFoods.mockResolvedValueOnce([
      { id: 'f1', brand: 'Hills', product_name: 'i/d', format: 'wet', food_type: 'meal' },
    ]);
    const view = await openMenu();

    getRecentFoods.mockImplementationOnce(() => new Promise(() => {}));
    await act(async () => {
      usePetStore.setState({ activePet: { id: 'p2', name: 'Mochi' } as never });
    });

    expect(view.queryByText(/No foods/)).toBeNull();
    expect(view.queryByText(/Hills/)).toBeNull();
    expect(fanLabels(view).at(-1)).toBe('Log food');
  });
});


// CUL-871 / N-4a — the FAB steps aside for a Home capture overlay (T-21).
describe('FAB — the Home capture overlay', () => {
  it('stands down entirely while one owns the corner', () => {
    const before = render(<FAB />);
    expect(before.queryByLabelText('Log event')).toBeTruthy();
    before.unmount();

    useUiStore.setState({
      captureOverlay: {
        summary: 'Mochi · off',
        inViewport: true,
        busy: false,
        onBack: jest.fn(),
        onDone: jest.fn(),
        drawsDoneBar: true,
      },
    });
    const during = render(<FAB />);
    // An UN-RENDER, not an opacity change: the Noticed grid's pinned Done bar sits on
    // exactly this area (LookExits.test.tsx pins the overlap), and an invisible button
    // that still takes touches is worse than a visible one.
    expect(during.queryByLabelText('Log event')).toBeNull();
  });

  it('comes back the moment the corner is released', () => {
    useUiStore.setState({
      captureOverlay: { summary: null, inViewport: true, busy: false, onBack: jest.fn(), onDone: null, drawsDoneBar: true },
    });
    const view = render(<FAB />);
    expect(view.queryByLabelText('Log event')).toBeNull();
    act(() => {
      useUiStore.setState({ captureOverlay: null });
    });
    // The store fails OPEN by design: losing the app's primary control is a worse
    // failure than a Done bar sharing a corner for a frame.
    expect(view.queryByLabelText('Log event')).toBeTruthy();
  });

  // CUL-1220 / BRK-18 — the look header publishes an overlay for its pinned way
  // back and never draws a Done bar. The + stays, and the FAB is mounted outside the tabs,
  // so this is also the "after a tab switch" case: nothing about the overlay hides it.
  it('stays for an overlay that draws no Done bar (the look header’s More…)', () => {
    useUiStore.setState({
      captureOverlay: { summary: null, inViewport: true, busy: false, onBack: jest.fn(), onDone: null, drawsDoneBar: false },
    });
    const view = render(<FAB />);
    expect(view.queryByLabelText('Log event')).toBeTruthy();
  });

  it('an overlay with no Done bar does not close an open menu either', async () => {
    const view = render(<FAB />);
    fireEvent.press(view.getByLabelText('Log event'));
    await act(async () => {});
    expect(useUiStore.getState().fabMenuOpen).toBe(true);
    act(() => {
      useUiStore.setState({
        captureOverlay: { summary: null, inViewport: true, busy: false, onBack: jest.fn(), onDone: null, drawsDoneBar: false },
      });
    });
    expect(useUiStore.getState().fabMenuOpen).toBe(true);
  });
});


// ── CUL-322 · the indigo FAB, the fan, and BRK-37 ─────────────────────────────────
//
// D3 = C / D5 = (a), PM-ruled 2026-09-26 (mock round 1 §05–§06). What is pinned here
// is what a test can see: the accessibility contract BRK-37 found missing, the fan's
// order, and that Reduce Motion is a crossfade that never reaches for a spring or a
// turn. The motion's feel is the device pass's; its constants live in FAB.tsx.

/** Let every running animation finish, so a close's completion (the unmount) lands. */
async function settleAnimations() {
  await act(async () => { jest.runOnlyPendingTimers(); });
  await act(async () => { jest.runAllTimers(); });
}

describe('FAB — BRK-37, the accessibility contract', () => {
  it('the disc is a button that says whether its menu is expanded', async () => {
    const view = render(<FAB />);
    const closed = view.getByLabelText('Log event');
    expect(closed.props.accessibilityRole).toBe('button');
    expect(closed.props.accessibilityState).toEqual({ expanded: false });

    fireEvent.press(closed);
    await act(async () => {});
    const opened = view.getByLabelText('Close menu');
    expect(opened.props.accessibilityState).toEqual({ expanded: true });
  });

  it('the open layer is modal, and the host is told to hide what is under it', async () => {
    const view = render(<FAB />);
    const modalLayers = () =>
      view.UNSAFE_root.findAll((n: TreeNode) => typeof n.type === 'string' && n.props.accessibilityViewIsModal === true);
    expect(modalLayers()).toHaveLength(0);
    expect(useUiStore.getState().fabMenuOpen).toBe(false);

    fireEvent.press(view.getByLabelText('Log event'));
    await act(async () => {});
    expect(modalLayers()).toHaveLength(1);
    expect(useUiStore.getState().fabMenuOpen).toBe(true);
    // The disc — the way out — is INSIDE the modal layer, or VoiceOver could not reach it.
    const disc = view.getByLabelText('Close menu');
    expect(modalLayers()[0].findAll((n: TreeNode) => n === disc)).toHaveLength(1);
  });

  it('the host hides its descendants exactly while the menu is open', () => {
    const { Text: RNText } = require('react-native');
    const view = render(<HiddenUnderFabMenu><RNText>home</RNText></HiddenUnderFabMenu>);
    const host = () => view.getByText('home', { includeHiddenElements: true }).parent!.parent!;
    expect(host().props.importantForAccessibility).toBe('auto');
    expect(host().props.accessibilityElementsHidden).toBe(false);
    expect(view.queryByText('home')).toBeTruthy();

    act(() => { useUiStore.setState({ fabMenuOpen: true }); });
    expect(host().props.importantForAccessibility).toBe('no-hide-descendants');
    expect(host().props.accessibilityElementsHidden).toBe(true);
    // What assistive tech would find: nothing under the menu.
    expect(view.queryByText('home')).toBeNull();
  });

  it('closing — by the scrim, or by the escape gesture — hands the host back', async () => {
    jest.useFakeTimers();
    try {
      const view = render(<FAB />);
      fireEvent.press(view.getByLabelText('Log event'));
      await act(async () => {});
      fireEvent.press(view.getByTestId('fab-scrim'));
      await settleAnimations();
      expect(view.getByLabelText('Log event')).toBeTruthy();
      expect(useUiStore.getState().fabMenuOpen).toBe(false);

      fireEvent.press(view.getByLabelText('Log event'));
      await act(async () => {});
      const layer = view.UNSAFE_root.find(
        (n: TreeNode) => typeof n.type === 'string' && n.props.accessibilityViewIsModal === true,
      );
      act(() => { layer.props.onAccessibilityEscape(); });
      await settleAnimations();
      expect(view.getByLabelText('Log event')).toBeTruthy();
      expect(useUiStore.getState().fabMenuOpen).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('a capture overlay opening under the menu closes it, so Home is never left hidden', async () => {
    // Unreachable by today's callers (the scrim eats the Home tap that opens one); the
    // guard is for the first caller that is not a tap. The stand-down keeps this
    // instance mounted, so without the close `fabMenuOpen` stays true with no disc left.
    const view = render(<FAB />);
    fireEvent.press(view.getByLabelText('Log event'));
    await act(async () => {});
    expect(useUiStore.getState().fabMenuOpen).toBe(true);

    act(() => {
      useUiStore.setState({
        captureOverlay: { summary: null, inViewport: true, busy: false, onBack: jest.fn(), onDone: null, drawsDoneBar: true },
      });
    });
    expect(useUiStore.getState().fabMenuOpen).toBe(false);

    act(() => { useUiStore.setState({ captureOverlay: null }); });
    // It comes back closed, not mid-menu.
    expect(view.getByLabelText('Log event')).toBeTruthy();
  });

  it('never outlives the FAB — an unmount with the menu open releases the host', async () => {
    const view = render(<FAB />);
    fireEvent.press(view.getByLabelText('Log event'));
    await act(async () => {});
    expect(useUiStore.getState().fabMenuOpen).toBe(true);
    view.unmount();
    expect(useUiStore.getState().fabMenuOpen).toBe(false);
  });
});

describe('FAB — the fan, nearest the thumb first', () => {
  it('draws the recent foods lowest, the newest nearest the disc', async () => {
    // getRecentFoods answers newest first.
    getRecentFoods.mockResolvedValueOnce([
      { id: 'f-new', brand: 'Royal Canin', product_name: 'wet', format: 'wet', food_type: 'meal' },
      { id: 'f-old', brand: 'Royal Canin', product_name: 'dry', format: 'dry', food_type: 'meal' },
    ]);
    seedPets(1);
    const view = await openMenu();
    expect(fanLabels(view)).toEqual([
      'More events', 'Loose stool', 'Vomit', 'Log food', 'Royal Canin · dry', 'Royal Canin · wet',
    ]);
  });

  it('puts the pet the log is for at the top, above every action', async () => {
    const view = await openMenu();
    // 'N' is the avatar's initial, inside the chip.
    expect(fanLabels(view).slice(0, 4)).toEqual(['N', 'Logging for', 'Nyx', 'More events']);
  });
});

describe('FAB — motion, and the Reduce Motion frame (beat 8)', () => {
  function discGlyphRotations(view: ReturnType<typeof render>): unknown[] {
    // Every rotate on the disc's glyph layers, as the style carries it: a string for
    // the static × of the crossfade, an interpolation for the turn.
    const disc = view.getByLabelText(/Log event|Close menu/);
    return disc
      .findAll((n: TreeNode) => typeof n.type === 'string')
      .flatMap((n: TreeNode) => [n.props.style].flat(3))
      .flatMap((st: StyleEntry) => (st && Array.isArray(st.transform) ? st.transform : []))
      .filter((t: Record<string, unknown>) => 'rotate' in t)
      .map((t: Record<string, unknown>) => t.rotate);
  }

  it('in motion: the press scales, the plus turns on a spring, the fan staggers 38ms', async () => {
    useReducedMotionStore.setState({ reduceMotion: false });
    const spring = jest.spyOn(Animated, 'spring');
    const stagger = jest.spyOn(Animated, 'stagger');
    try {
      const view = render(<FAB />);
      const disc = view.getByLabelText('Log event');
      fireEvent(disc, 'pressIn');
      expect(spring).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ toValue: 0.9 }));
      fireEvent.press(disc);
      await act(async () => {});
      expect(stagger).toHaveBeenCalledWith(38, expect.any(Array));
      // The turn is the underdamped spring (the overshoot), not the old linear rotate,
      // at the PM's slightly bigger bounce (CUL-1641: friction 6, about 19% overshoot).
      expect(spring).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ toValue: 1, tension: 90, friction: 6 }),
      );
      // One glyph layer, turning — the crossfade's second (×) layer is absent.
      const rotations = discGlyphRotations(view);
      expect(rotations).toHaveLength(1);
      expect(rotations[0]).not.toBe('45deg');
    } finally {
      spring.mockRestore();
      stagger.mockRestore();
    }
  });

  it('under Reduce Motion: no scale, no turn, no fan — the plus and the × crossfade', async () => {
    useReducedMotionStore.setState({ reduceMotion: true });
    const spring = jest.spyOn(Animated, 'spring');
    const stagger = jest.spyOn(Animated, 'stagger');
    try {
      const view = render(<FAB />);
      const disc = view.getByLabelText('Log event');
      fireEvent(disc, 'pressIn');
      fireEvent.press(disc);
      await act(async () => {});
      expect(spring).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ toValue: 0.9 }));
      expect(spring).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ toValue: 1 }));
      expect(stagger).not.toHaveBeenCalled();
      // The only rotate left is the × drawn still, which fades in over the plus.
      expect(discGlyphRotations(view)).toEqual(['45deg']);
      // And no fan pill moves: the slots carry an opacity and no transform at all.
      const slots = view.UNSAFE_root.findAll(
        (n: TreeNode) => typeof n.type === 'string'
          && [n.props.style].flat(3).some((st: StyleEntry) => st?.transformOrigin === 'bottom right'),
      );
      expect(slots.length).toBeGreaterThan(0);
      for (const slot of slots) {
        expect([slot.props.style].flat(3).some((st: StyleEntry) => st && 'transform' in st)).toBe(false);
      }
    } finally {
      spring.mockRestore();
      stagger.mockRestore();
    }
  });

  it('an unknown setting reads as still (C-43) — the first open of a cold start does not spin', async () => {
    useReducedMotionStore.setState({ reduceMotion: null });
    const stagger = jest.spyOn(Animated, 'stagger');
    try {
      const view = render(<FAB />);
      fireEvent.press(view.getByLabelText('Log event'));
      await act(async () => {});
      expect(stagger).not.toHaveBeenCalled();
      expect(discGlyphRotations(view)).toEqual(['45deg']);
    } finally {
      stagger.mockRestore();
    }
  });
});

// ── The glyph is white, never the accent (CUL-1626) ──────────────────────────────
//
// The PM took the plus off teal on 2026-10-06, the first piece of CUL-1279's G4 = C
// (2026-10-03: indigo is the action, teal is a good fact). The contrast suite pins the
// PAIR, and teal on the disc would still pass it, so only this file can say which
// colour the bars render: in motion one glyph turns into the ×; under Reduce Motion the
// still × is a second set of bars that fades in over the first.
describe('FAB — the plus is white on the indigo disc (CUL-1626)', () => {
  /** Every fill under the disc's button, top to bottom: the disc, then its bars. */
  function discFills(view: ReturnType<typeof render>): unknown[] {
    const disc = view.getByLabelText(/Log event|Close menu/);
    return disc
      .findAll((n: TreeNode) => typeof n.type === 'string')
      .map((n: TreeNode) => StyleSheet.flatten(n.props.style)?.backgroundColor)
      .filter((fill: unknown) => fill !== undefined);
  }

  function expectWhiteBars(fills: unknown[], bars: number) {
    expect(fills.filter((f) => f === theme.colorBrandNightElevated)).toHaveLength(1);
    const glyph = fills.filter((f) => f !== theme.colorBrandNightElevated);
    expect(glyph).toHaveLength(bars);
    expect(glyph.every((f) => f === theme.colorTextOnDark)).toBe(true);
    expect(fills).not.toContain(theme.colorAccent);
  }

  it('in motion: the plus and the × it turns into are one white glyph', async () => {
    useReducedMotionStore.setState({ reduceMotion: false });
    const view = render(<FAB />);
    expectWhiteBars(discFills(view), 2);
    fireEvent.press(view.getByLabelText('Log event'));
    await act(async () => {});
    expectWhiteBars(discFills(view), 2);
  });

  it('under Reduce Motion: both crossfading layers, the plus and the still ×, are white', async () => {
    useReducedMotionStore.setState({ reduceMotion: true });
    const view = render(<FAB />);
    expectWhiteBars(discFills(view), 4);
    fireEvent.press(view.getByLabelText('Log event'));
    await act(async () => {});
    expectWhiteBars(discFills(view), 4);
  });

  // C-43: an unknown setting reads as still, so a cold start draws the crossfade's two
  // layers, and both must be white before the setting has answered.
  it('with the setting unknown: the still frame is white too', async () => {
    useReducedMotionStore.setState({ reduceMotion: null });
    const view = render(<FAB />);
    expectWhiteBars(discFills(view), 4);
    fireEvent.press(view.getByLabelText('Log event'));
    await act(async () => {});
    expectWhiteBars(discFills(view), 4);
  });
});

// ── A second tap while the menu is closing (QA, 1.2.0) ───────────────────────────
//
// A pill tap closes the menu, and the close keeps every pill mounted, under the finger,
// while it animates. A quick second tap in that window used to act again: a second sheet
// open while the first was still sliding in, a second /log push, the switcher presenting
// over the sheet, a second one-tap meal. The store now refuses a second sheet open by
// itself (LogSheetHost.test.tsx), so here its open is swapped for a counter: that refusal
// must not be what turns this suite green. Fake timers hold the close mid-animation,
// which is the window under test.
const { insertMeal } = require('../../lib/meals') as { insertMeal: jest.Mock };

describe('FAB — a pill does nothing while the menu is closing', () => {
  const realOpenLogSheet = useUiStore.getState().openLogSheet;
  beforeEach(() => {
    insertMeal.mockReset();
    jest.useFakeTimers();
  });
  afterEach(async () => {
    act(() => { useMomentStore.getState().hide(); });
    await settleAnimations();
    jest.useRealTimers();
    useUiStore.setState({ openLogSheet: realOpenLogSheet });
  });

  it('after one pill, a second tap on any pill asks for nothing', async () => {
    const openLogSheet = jest.fn();
    useUiStore.setState({ openLogSheet });
    const view = await openMenu();
    fireEvent.press(view.getByText('More events'));
    expect(openLogSheet).toHaveBeenCalledTimes(1);

    for (const row of ACTION_ROWS) fireEvent.press(view.getByText(row));
    fireEvent.press(view.getByLabelText('Logging for Nyx — switch pet'));

    expect(openLogSheet).toHaveBeenCalledTimes(1);
    expect(router.push).not.toHaveBeenCalled();
    expect(view.queryByText('switcher-open')).toBeNull();
  });

  it('a one-tap food tapped again during the close writes one meal', async () => {
    getRecentFoods.mockResolvedValueOnce([
      { id: 'f1', brand: 'Hills', product_name: 'i/d', format: 'wet', food_type: 'meal' },
    ]);
    insertMeal.mockResolvedValue({
      eventId: 'm1', occurredAtIso: '2026-10-02T12:00:00.000Z', now: '2026-10-02T12:00:00.000Z',
    });
    const view = await openMenu();
    await act(async () => { fireEvent.press(view.getByText(/Hills/)); });
    // The meal landed and the menu is on its way out, with the row's spinner released.
    expect(insertMeal).toHaveBeenCalledTimes(1);

    await act(async () => { fireEvent.press(view.getByText(/Hills/)); });
    expect(insertMeal).toHaveBeenCalledTimes(1);
  });
});

// ── A one-tap food whose write fails (QA, 1.2.0) ─────────────────────────────────
//
// The quick-meal path was a `try … finally` with no `catch`, and the pill calls it
// without awaiting: a failed write wrote nothing, said nothing, and surfaced only as an
// unhandled rejection. A failed write is always said (CUL-575), in the words the
// sheet's confirm and /log already use.
describe('FAB — a one-tap food whose write fails', () => {
  it('says so in the shared words, confirms nothing, and leaves the row to retry', async () => {
    insertMeal.mockReset();
    insertMeal.mockRejectedValueOnce(new Error('disk I/O error'));
    getRecentFoods.mockResolvedValueOnce([
      { id: 'f1', brand: 'Hills', product_name: 'i/d', format: 'wet', food_type: 'meal' },
    ]);
    useMomentStore.setState({ visible: false, payload: null, removed: false });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const logged = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const view = await openMenu();
      await act(async () => { fireEvent.press(view.getByText(/Hills/)); });

      expect(alert).toHaveBeenCalledTimes(1);
      expect(alert).toHaveBeenCalledWith("Couldn't save that", 'Something went wrong. Please try again.');
      // Nothing landed, so no card claims it did, and the menu is still up to retry.
      expect(useMomentStore.getState().payload).toBeNull();
      expect(view.getByText(/Hills/)).toBeTruthy();
    } finally {
      alert.mockRestore();
      logged.mockRestore();
    }
  });
});

// ── The fan never opens under a completion card (CUL-1635) ──────────────────────────
//
// The meal, dose and named cards are root siblings drawn after the Stack, so they paint
// over the fan, and their bottom edge (TAB_HEIGHT + 64, about 145pt) meets the lowest
// pill (the disc's 72 + 56 plus the fan's margin, about 144pt). The owner's own pair:
// log the wet food from the fan, open it again inside the 5s dwell for the dry, and the
// dry pill sits under the card's Undo. What is pinned is the invariant, not a frame: at
// no store change are the fan and a corner card both up.
describe('FAB — the fan never shares the corner with a completion card', () => {
  const MEAL = {
    eventId: 'wet', petId: 'p1', occurredAt: '2026-10-07T12:00:00.000Z', foodType: 'meal' as const,
    foodBrand: 'Royal Canin', foodProductName: 'Wet', foodFormat: 'wet', intakeRating: null,
  };
  const DOSE = {
    eventId: 'dose', petId: 'p1', medicationItemId: null, occurredAt: '2026-10-07T12:00:00.000Z',
    drugName: 'Gabapentin', adherence: null, howGiven: null,
  };
  const NAMED = {
    tone: 'calm' as const, eventId: 'v1', petId: 'p1', occurredAt: '2026-10-07T12:00:00.000Z',
    record: { kind: 'symptom', eventType: 'vomit' },
  };
  /** Run the fan's ~180ms close, and stop well inside the card's 5s dwell. */
  async function closeWithinDwell() {
    await act(async () => { jest.advanceTimersByTime(600); });
  }
  let overlaps: string[];
  let unsubs: Array<() => void>;

  beforeEach(() => {
    jest.useFakeTimers();
    overlaps = [];
    const check = (from: string) => {
      const m = useMomentStore.getState();
      if (useUiStore.getState().fabMenuOpen && m.visible && m.payload?.kind !== 'look') {
        overlaps.push(`${from}: ${m.payload?.kind}`);
      }
    };
    unsubs = [
      useMomentStore.subscribe(() => check('moment')),
      useUiStore.subscribe(() => check('ui')),
    ];
  });
  afterEach(async () => {
    unsubs.forEach((u) => u());
    act(() => { useMomentStore.getState().hide(); });
    await settleAnimations();
    jest.useRealTimers();
  });

  it.each([
    ['meal', () => useMomentStore.getState().showMeal(MEAL)],
    ['medication', () => useMomentStore.getState().showMedication(DOSE as never)],
    ['named', () => useMomentStore.getState().showNamed(NAMED as never)],
  ])('opening the fan over a showing %s card dismisses the card first', async (_kind, show) => {
    act(() => { show(); });
    expect(useMomentStore.getState().visible).toBe(true);

    await openMenu();

    expect(useUiStore.getState().fabMenuOpen).toBe(true);
    expect(useMomentStore.getState().visible).toBe(false);
    expect(overlaps).toEqual([]);
  });

  it('dismisses on the tap, never on a timer: an idle fan leaves the card alone', async () => {
    act(() => { useMomentStore.getState().showMeal(MEAL); });
    render(<FAB />);
    await act(async () => {});
    expect(useMomentStore.getState().visible).toBe(true);
  });

  it('a card that reveals while the fan is open closes the fan, and stays up', async () => {
    const view = await openMenu();
    expect(useUiStore.getState().fabMenuOpen).toBe(true);

    // The picker path's deferred reveal landing under an open fan.
    act(() => { useMomentStore.getState().showMeal(MEAL); });
    await closeWithinDwell();

    expect(useUiStore.getState().fabMenuOpen).toBe(false);
    expect(view.queryByText('Log food')).toBeNull();
    // The new card's Undo is a net the owner has not seen yet: it is not the one to go.
    expect(useMomentStore.getState().visible).toBe(true);
  });

  it('a card holding a safety note keeps the fan shut until its dwell ends', async () => {
    act(() => {
      useMomentStore.getState().showMedication({
        ...DOSE, doubleDose: { conflict: true, otherEventId: 'd0', gapMinutes: 60 },
      } as never);
    });
    const view = await openMenu();
    expect(useUiStore.getState().fabMenuOpen).toBe(false);
    expect(view.queryByText('Log food')).toBeNull();
    expect(useMomentStore.getState().visible).toBe(true);

    // The 7s flagged dwell runs out on its own; the next tap opens the fan.
    await act(async () => { jest.advanceTimersByTime(7000); });
    expect(useMomentStore.getState().visible).toBe(false);
    fireEvent.press(view.getByLabelText('Log event'));
    await act(async () => {});
    expect(useUiStore.getState().fabMenuOpen).toBe(true);
    expect(overlaps).toEqual([]);
  });

  it('the look\'s beat draws no corner card, so the fan leaves it alone', async () => {
    act(() => {
      useMomentStore.getState().showLook({
        eventId: 'look1', petId: 'p1', occurredAt: '2026-10-07T12:00:00.000Z',
        outcome: 'nothing_unusual', words: [],
      } as never);
    });
    await openMenu();
    expect(useMomentStore.getState().payload?.kind).toBe('look');
    expect(useMomentStore.getState().visible).toBe(true);
  });

  it('the quick meal hands over to its own card without the fan reopening under it', async () => {
    insertMeal.mockReset();
    getRecentFoods.mockResolvedValueOnce([
      { id: 'f1', brand: 'Royal Canin', product_name: 'Wet', format: 'wet', food_type: 'meal' },
    ]);
    insertMeal.mockResolvedValue({
      eventId: 'wet', occurredAtIso: MEAL.occurredAt, now: MEAL.occurredAt,
    });
    const view = await openMenu();
    await act(async () => { fireEvent.press(view.getByText(/Royal Canin/)); });
    await closeWithinDwell();

    expect(useMomentStore.getState().visible).toBe(true);
    expect(useUiStore.getState().fabMenuOpen).toBe(false);
    // The one frame the two share by design: the card rises while the fan's ~180ms close
    // runs, and every pill is inert from the close's first frame (`whileOpen`, pinned
    // above), so a tap there can only reach the card. It is the hand-over, not the bug.
    expect(overlaps).toEqual(['moment: meal']);
    overlaps = [];

    // The second food of the meal: the open takes the card down before the fan draws.
    fireEvent.press(view.getByLabelText('Log event'));
    await act(async () => {});
    expect(useUiStore.getState().fabMenuOpen).toBe(true);
    expect(useMomentStore.getState().visible).toBe(false);
    expect(overlaps).toEqual([]);
  });
});

describe('FAB — CUL-1644, the pills read like the record', () => {
  const DOORS = ['More events', 'Loose stool', 'Vomit', 'Log food'];

  /** The pill (its touchable host) that owns a piece of text. */
  function pillOf(view: ReturnType<typeof render>, text: string | RegExp) {
    let n: TreeNode | null = view.getByText(text);
    while (n && !(typeof n.type === 'string' && typeof n.props.onResponderRelease === 'function')) n = n.parent;
    if (!n) throw new Error(`no pill owns ${String(text)}`);
    return n;
  }
  const chevronsIn = (pill: TreeNode) =>
    pill.findAll((n: TreeNode) => typeof n.type === 'string' && n.props.testID === 'fab-door-chevron');

  it('names a food the way History does, with its format as its own tag', async () => {
    getRecentFoods.mockResolvedValueOnce([
      { id: 'f-wet', brand: 'Royal Canin', product_name: 'Selected Protein PR, Wet', format: 'wet_canned', food_type: 'meal' },
      { id: 'f-dry', brand: 'Royal Canin', product_name: 'Selected Protein PR, Dry', format: 'dry_kibble', food_type: 'meal' },
    ]);
    seedPets(1);
    const view = await openMenu();
    // The trailing ", Wet" / ", Dry" leaves the label, because the tag says it: the two
    // labels are now identical, and only the tags tell them apart.
    expect(view.getAllByText('Royal Canin · Selected Protein PR')).toHaveLength(2);
    expect(view.getByText('WET')).toBeTruthy();
    expect(view.getByText('DRY')).toBeTruthy();
    // The tag is never text inside the label that wraps: it is its own node, a sibling.
    const label = view.getAllByText('Royal Canin · Selected Protein PR')[0];
    expect(label.findAll((n: TreeNode) => n.props.testID === 'fab-format-tag')).toHaveLength(0);
    const tags = view.UNSAFE_root.findAll(
      (n: TreeNode) => typeof n.type === 'string' && n.props.testID === 'fab-format-tag',
    );
    expect(tags).toHaveLength(2);
    // ...and it holds its width while the label yields.
    const tagStyle = StyleSheet.flatten(tags[0].props.style);
    expect(tagStyle.flexShrink).toBe(0);
    expect(StyleSheet.flatten(label.props.style).flexShrink).toBe(1);
  });

  it('speaks the food in full, its format included, with a hint that it logs at once', async () => {
    getRecentFoods.mockResolvedValueOnce([
      { id: 'f-dry', brand: 'Royal Canin', product_name: 'Selected Protein PR, Dry', format: 'dry_kibble', food_type: 'meal' },
    ]);
    seedPets(1);
    const view = await openMenu();
    const pill = view.getByLabelText('Royal Canin · Selected Protein PR, dry');
    expect(pill.props.accessibilityHint).toBe('Logs it for Nyx right away');
    // A door has no such hint: it opens something.
    for (const door of DOORS) expect(pillOf(view, door).props.accessibilityHint).toBeUndefined();
  });

  it('a food with no honest format shows no tag, and its label is unchanged', async () => {
    getRecentFoods.mockResolvedValueOnce([
      { id: 'f-other', brand: 'Hills', product_name: 'i/d', format: 'other', food_type: 'meal' },
    ]);
    seedPets(1);
    const view = await openMenu();
    expect(view.getByLabelText('Hills · i/d')).toBeTruthy();
    expect(view.UNSAFE_root.findAll((n: TreeNode) => n.props.testID === 'fab-format-tag')).toHaveLength(0);
  });

  it('every door carries one chevron, hidden from assistive tech; a food pill carries none', async () => {
    getRecentFoods.mockResolvedValueOnce([
      { id: 'f1', brand: 'Hills', product_name: 'i/d', format: 'wet_canned', food_type: 'meal' },
    ]);
    seedPets(1);
    const view = await openMenu();
    for (const door of DOORS) {
      const chevrons = chevronsIn(pillOf(view, door));
      expect(chevrons).toHaveLength(1);
      expect(chevrons[0].props.accessibilityElementsHidden).toBe(true);
      expect(chevrons[0].props.importantForAccessibility).toBe('no-hide-descendants');
    }
    expect(chevronsIn(pillOf(view, 'Hills · i/d'))).toHaveLength(0);
  });
});

// ── CUL-1634 ─────────────────────────────────────────────────────────────────
//
// The fan is a column anchored to the disc, so a food row that lands after the fan
// has run grows it upward and moves every pill above it under the thumb. The foods
// are read before the open now, so a cold open's slot count is final on its first
// render. The first test reds against the read-on-open tree: no read has run when the
// disc is pressed, so the press's own render holds no food row.
describe('FAB — CUL-1634, the recent foods are read before the fan runs', () => {
  const HILLS = { id: 'f1', brand: 'Hills', product_name: 'i/d', format: 'wet', food_type: 'meal' };
  const ROYAL = { id: 'f2', brand: 'Royal Canin', product_name: 'GI', format: 'dry', food_type: 'meal' };

  beforeEach(() => {
    getRecentFoods.mockReset();
    getRecentFoods.mockImplementation(async () => []);
  });

  it('a cold open draws its food rows on the press’s own render, and the open reads nothing', async () => {
    getRecentFoods.mockResolvedValueOnce([HILLS]);
    seedPets(1);
    const view = render(<FAB />);
    // The cold start: the mount read answers while the menu is still closed.
    await act(async () => {});
    expect(getRecentFoods).toHaveBeenCalledTimes(1);

    // No act after the press: this is the open's first render, before any read could
    // answer. Every slot the fan will ever hold is already here.
    fireEvent.press(view.getByLabelText('Log event'));
    expect(fanLabels(view).slice(-2)).toEqual(['Log food', 'Hills · i/d']);

    // And the open asked for nothing, so nothing can arrive to move the column.
    await act(async () => {});
    expect(getRecentFoods).toHaveBeenCalledTimes(1);
    expect(fanLabels(view).slice(-2)).toEqual(['Log food', 'Hills · i/d']);
  });

  it('a new row of today waits for the close, and the next open carries it', async () => {
    jest.useFakeTimers();
    try {
      getRecentFoods.mockResolvedValueOnce([HILLS]);
      seedPets(1);
      const view = render(<FAB />);
      await act(async () => {});
      fireEvent.press(view.getByLabelText('Log event'));
      await act(async () => {});

      // A meal lands in today's record while the menu is open: no read, no new row.
      getRecentFoods.mockResolvedValue([ROYAL, HILLS]);
      await act(async () => {
        useEventStore.setState({ todayEvents: [{ id: 'e-new' } as never] });
      });
      expect(getRecentFoods).toHaveBeenCalledTimes(1);
      expect(view.queryByText(/Royal Canin/)).toBeNull();

      // The close reads, so the next open is current from its first frame.
      fireEvent.press(view.getByTestId('fab-scrim'));
      await settleAnimations();
      expect(getRecentFoods).toHaveBeenCalledTimes(2);
      fireEvent.press(view.getByLabelText('Log event'));
      expect(fanLabels(view).slice(-3)).toEqual(['Log food', 'Hills · i/d', 'Royal Canin · GI']);
    } finally {
      useEventStore.setState({ todayEvents: [] });
      jest.useRealTimers();
    }
  });

  it('a tap that beats the mount read waits on that read rather than starting a second', async () => {
    let release: (foods: unknown[]) => void = () => {};
    getRecentFoods.mockImplementationOnce(
      () => new Promise((resolve) => { release = resolve as never; }),
    );
    seedPets(1);
    const view = render(<FAB />);
    fireEvent.press(view.getByLabelText('Log event'));
    await act(async () => {});
    expect(getRecentFoods).toHaveBeenCalledTimes(1);

    await act(async () => { release([HILLS]); });
    expect(view.getByText(/Hills/)).toBeTruthy();
  });
});

// ── CUL-1636 ─────────────────────────────────────────────────────────────────
//
// The fan has a height budget (lib/fanBudget.ts, where the 320pt / AX1–AX3 matrix is
// asserted over data). These pin that the FAB draws what the plan says: the chip is
// always drawn, the oldest foods are the ones that leave, a pill never runs past a
// 320pt screen, and when even the doors overflow the chip stays outside the scroll.
describe('FAB — CUL-1636, the fan fits at large text sizes and never cuts the pet chip', () => {
  const RN = require('react-native');
  const { FAN_RIGHT_INSET, FAN_LEFT_MARGIN } = require('../../lib/fanBudget');
  /** RN's fontScale per iOS content size. */
  const AX = { default: 1, AX1: 1.786, AX2: 2.143, AX3: 2.643 } as const;
  const THREE = [
    { id: 'rc-wet', brand: 'Royal Canin', product_name: 'Selected Protein PR, Wet', format: 'wet_canned', food_type: 'meal' },
    { id: 'rc-dry', brand: 'Royal Canin', product_name: 'Selected Protein PR, Dry', format: 'dry_kibble', food_type: 'meal' },
    { id: 'hills', brand: 'Hills', product_name: 'i/d Low Fat', format: 'dry_kibble', food_type: 'meal' },
  ];
  let dims: jest.SpyInstance;
  function windowOf(width: number, height: number, fontScale: number) {
    dims = jest.spyOn(RN, 'useWindowDimensions').mockReturnValue({ width, height, fontScale, scale: 2 });
  }
  afterEach(() => dims?.mockRestore());

  const foodLabels = (view: ReturnType<typeof render>) =>
    fanLabels(view).filter((l) => l.startsWith('Royal Canin') || l.startsWith('Hills'));

  it('a roomy phone at default text draws every food, as before', async () => {
    windowOf(430, 932, AX.default);
    getRecentFoods.mockResolvedValueOnce(THREE);
    const view = await openMenu();
    expect(view.getByText('Logging for')).toBeTruthy();
    expect(foodLabels(view)).toHaveLength(3);
    expect(view.queryByTestId('fab-fan-scroll')).toBeNull();
  });

  it('a 320pt SE at default text keeps the chip and the newest foods, and drops the oldest', async () => {
    windowOf(320, 568, AX.default);
    getRecentFoods.mockResolvedValueOnce(THREE);
    const view = await openMenu();
    expect(view.getByText('Logging for')).toBeTruthy();
    // Hills is the oldest of the three, so it is the one that leaves.
    expect(foodLabels(view)).toEqual(['Royal Canin · Selected Protein PR', 'Royal Canin · Selected Protein PR']);
    expect(view.queryByText(/^Hills/)).toBeNull();
  });

  it('on a 320pt screen no pill is wider than the screen less its insets', async () => {
    windowOf(320, 568, AX.default);
    getRecentFoods.mockResolvedValueOnce(THREE);
    const view = await openMenu();
    const pills = pressableHosts(view).filter((n: TreeNode) => n.props.testID !== 'fab-scrim');
    const widths = pills
      .map((n: TreeNode) => StyleSheet.flatten(n.props.style)?.maxWidth)
      .filter((w: unknown) => w !== undefined);
    // Every pill but the disc carries the cap: the chip, four doors, two foods.
    expect(widths).toHaveLength(7);
    for (const w of widths) expect(w).toBe(320 - FAN_RIGHT_INSET - FAN_LEFT_MARGIN);
  });

  // The SE (375×667, no safe area in the test host) at each AX size: what the plan
  // decides, stated per size so no branch can pass for the other.
  it.each([
    ['AX1', AX.AX1, { scroll: false, maxFoods: 2 }],
    ['AX2', AX.AX2, { scroll: false, maxFoods: 0 }],
    ['AX3', AX.AX3, { scroll: true, maxFoods: 0 }],
  ] as const)('an iPhone SE at %s: the chip leads and every door is drawn', async (_name, scale, want) => {
    windowOf(375, 667, scale);
    getRecentFoods.mockResolvedValueOnce(THREE);
    const view = await openMenu();
    expect(view.getByLabelText('Logging for Nyx — switch pet')).toBeTruthy();
    // The chip first, then the four doors in order: nothing is cut and nothing moved.
    expect(fanLabels(view).slice(0, 7)).toEqual(['N', 'Logging for', 'Nyx', 'More events', 'Loose stool', 'Vomit', 'Log food']);
    expect(foodLabels(view).length).toBeLessThanOrEqual(want.maxFoods);
    expect(view.queryByTestId('fab-fan-scroll') !== null).toBe(want.scroll);
  });

  it('the SE at AX3: the chip is pinned outside the scroll, which opens at its bottom once', async () => {
    windowOf(375, 667, AX.AX3);
    getRecentFoods.mockResolvedValueOnce(THREE);
    const view = await openMenu();
    const chip = view.getByLabelText('Logging for Nyx — switch pet');
    const scroll = view.getByTestId('fab-fan-scroll');
    expect(scroll.findAll((n: TreeNode) => n === chip)).toHaveLength(0);
    for (const door of ['More events', 'Loose stool', 'Vomit', 'Log food']) {
      expect(scroll.findAll((n: TreeNode) => n === view.getByText(door))).toHaveLength(1);
    }
    expect(StyleSheet.flatten(scroll.props.style).maxHeight).toBeGreaterThan(0);
    const instance = view.UNSAFE_getByType(RN.ScrollView).instance;
    const toEnd = jest.spyOn(instance, 'scrollToEnd').mockImplementation(() => {});
    fireEvent(scroll, 'contentSizeChange', 300, 900);
    fireEvent(scroll, 'contentSizeChange', 300, 960);
    // A snap, not motion (the programmatic-scroll rule), and only on the open.
    expect(toEnd).toHaveBeenCalledTimes(1);
    expect(toEnd).toHaveBeenCalledWith({ animated: false });
  });

  it('with no pet only the no-pet card is drawn, and never inside a scroll', async () => {
    windowOf(320, 568, AX.AX3);
    usePetStore.setState({ pets: [] as never, activePet: null });
    const view = await openMenu();
    expect(view.queryByTestId('fab-fan-scroll')).toBeNull();
    expect(view.queryByText('More events')).toBeNull();
  });

  it('two foods that would truncate to the same words under one tag wrap in full', async () => {
    windowOf(430, 932, AX.AX1);
    seedPets(1);
    getRecentFoods.mockResolvedValueOnce([
      { id: 'pr', brand: 'Royal Canin', product_name: 'Selected Protein Adult PR Hydrolysed Rabbit', format: 'dry_kibble', food_type: 'meal' },
      { id: 'pd', brand: 'Royal Canin', product_name: 'Selected Protein Adult PD Hydrolysed Duck', format: 'dry_kibble', food_type: 'meal' },
    ]);
    const view = await openMenu();
    const labels = view.getAllByText(/^Royal Canin · Selected Protein Adult/);
    expect(labels).toHaveLength(2);
    for (const l of labels) expect(l.props.numberOfLines).toBeUndefined();
  });

  it('the wet / dry pair keeps its two-line cap: the tag already tells them apart', async () => {
    windowOf(430, 932, AX.AX1);
    getRecentFoods.mockResolvedValueOnce(THREE.slice(0, 2));
    const view = await openMenu();
    const labels = view.getAllByText('Royal Canin · Selected Protein PR');
    expect(labels).toHaveLength(2);
    for (const l of labels) expect(l.props.numberOfLines).toBe(2);
    expect(view.getByText('WET')).toBeTruthy();
    expect(view.getByText('DRY')).toBeTruthy();
  });
});

// ── CUL-1647 ─────────────────────────────────────────────────────────────────
//
// The recent foods keep one order for the day: the read is bounded to the window
// before today's LOCAL midnight, so a log today cannot move a pill, and the day turns
// over while the menu is closed (a timer at midnight; a menu open across it re-reads on
// its close). The clock is pinned to instants built from local components (C-29), so the
// non-UTC CI job runs the same midnight in every zone.
describe('FAB — CUL-1647, the recent foods keep one order for the day', () => {
  const { fabFoodDay } = require('../../lib/fabRecentFoods') as typeof import('../../lib/fabRecentFoods');
  const HILLS = { id: 'f1', brand: 'Hills', product_name: 'i/d', format: 'wet', food_type: 'meal' };
  const ROYAL = { id: 'f2', brand: 'Royal Canin', product_name: 'GI', format: 'dry', food_type: 'meal' };
  const local = (d: number, h: number, min = 0) => new Date(2026, 9, d, h, min);
  /** The span the last read asked for. */
  const lastSpan = () => getRecentFoods.mock.calls.at(-1)?.[3];

  beforeEach(() => {
    jest.useFakeTimers();
    getRecentFoods.mockReset();
    getRecentFoods.mockImplementation(async () => []);
  });
  afterEach(() => {
    useEventStore.setState({ todayEvents: [] });
    mockTodayKey = '2026-10-08';
    jest.useRealTimers();
  });

  it('reads the window before today’s local midnight, and a log today asks for the same span', async () => {
    jest.setSystemTime(local(8, 7, 15));
    seedPets(1);
    render(<FAB />);
    await act(async () => {});
    expect(getRecentFoods).toHaveBeenCalledWith('p1', null, 3, fabFoodDay(local(8, 7, 15).getTime()));
    expect(lastSpan().before).toBe(local(8, 0).toISOString());

    // Breakfast is logged: a new row of today re-reads, over the same span, so the
    // meal just given is outside it and cannot rise to the thumb.
    jest.setSystemTime(local(8, 7, 20));
    await act(async () => {
      useEventStore.setState({ todayEvents: [{ id: 'e-breakfast' } as never] });
    });
    expect(getRecentFoods).toHaveBeenCalledTimes(2);
    expect(getRecentFoods.mock.calls[1][3]).toEqual(getRecentFoods.mock.calls[0][3]);
  });

  it('midnight passes while the menu is closed: the new day is read before the next open', async () => {
    jest.setSystemTime(local(8, 23, 0));
    getRecentFoods.mockResolvedValueOnce([HILLS]);
    seedPets(1);
    const view = render(<FAB />);
    await act(async () => {});
    expect(getRecentFoods).toHaveBeenCalledTimes(1);

    // The order as of the 9th's midnight puts Royal Canin (given last night) nearest.
    getRecentFoods.mockResolvedValue([ROYAL, HILLS]);
    jest.setSystemTime(local(9, 0, 0));
    mockTodayKey = '2026-10-09';
    view.rerender(<FAB />);
    await act(async () => {});
    expect(getRecentFoods).toHaveBeenCalledTimes(2);
    expect(lastSpan()).toEqual(fabFoodDay(local(9, 0, 0).getTime()));
    expect(lastSpan().before).toBe(local(9, 0).toISOString());

    // The first open after midnight draws the new order on the press's own render.
    fireEvent.press(view.getByLabelText('Log event'));
    expect(fanLabels(view).slice(-3)).toEqual(['Log food', 'Hills · i/d', 'Royal Canin · GI']);
  });

  it('midnight passes while the menu is open: no read lands under the thumb, the close reads', async () => {
    jest.setSystemTime(local(8, 23, 59));
    getRecentFoods.mockResolvedValueOnce([HILLS]);
    seedPets(1);
    const view = render(<FAB />);
    await act(async () => {});
    fireEvent.press(view.getByLabelText('Log event'));
    await act(async () => {});

    getRecentFoods.mockResolvedValue([ROYAL, HILLS]);
    jest.setSystemTime(local(9, 0, 1));
    mockTodayKey = '2026-10-09';
    view.rerender(<FAB />);
    await act(async () => {});
    expect(getRecentFoods).toHaveBeenCalledTimes(1);
    expect(fanLabels(view).slice(-2)).toEqual(['Log food', 'Hills · i/d']);

    fireEvent.press(view.getByTestId('fab-scrim'));
    await settleAnimations();
    expect(getRecentFoods).toHaveBeenCalledTimes(2);
    expect(lastSpan().before).toBe(local(9, 0).toISOString());
  });

  it('a food archived while the menu is closed is gone before the next open', async () => {
    // The trial-start case: the owner takes the old food out of rotation in Foods.
    jest.setSystemTime(local(8, 10, 0));
    getRecentFoods.mockResolvedValueOnce([ROYAL, HILLS]);
    seedPets(1);
    const view = render(<FAB />);
    await act(async () => {});

    getRecentFoods.mockResolvedValue([HILLS]);
    await act(async () => {
      useFoodLibraryStore.getState().notifyChanged();
    });
    expect(getRecentFoods).toHaveBeenCalledTimes(2);
    fireEvent.press(view.getByLabelText('Log event'));
    expect(view.queryByText(/Royal Canin/)).toBeNull();
    expect(fanLabels(view).slice(-2)).toEqual(['Log food', 'Hills · i/d']);
  });

  it('a sync cycle re-reads while closed', async () => {
    jest.setSystemTime(local(8, 10, 0));
    seedPets(1);
    render(<FAB />);
    await act(async () => {});
    await act(async () => {
      useSyncStore.getState().bumpHydrationTick();
    });
    expect(getRecentFoods).toHaveBeenCalledTimes(2);
  });

  it('an older read that answers late never overwrites a newer one', async () => {
    jest.setSystemTime(local(8, 23, 59));
    let releaseOld: (foods: unknown[]) => void = () => {};
    getRecentFoods.mockImplementationOnce(
      () => new Promise((resolve) => { releaseOld = resolve as never; }),
    );
    seedPets(1);
    const view = render(<FAB />);
    await act(async () => {});

    // Midnight: the new day's read answers first.
    getRecentFoods.mockResolvedValueOnce([ROYAL, HILLS]);
    jest.setSystemTime(local(9, 0, 1));
    mockTodayKey = '2026-10-09';
    view.rerender(<FAB />);
    await act(async () => {});
    // Yesterday's read lands after it, and is dropped.
    await act(async () => { releaseOld([HILLS]); });

    fireEvent.press(view.getByLabelText('Log event'));
    expect(fanLabels(view).slice(-3)).toEqual(['Log food', 'Hills · i/d', 'Royal Canin · GI']);
  });

  it('a read in flight when the menu opens over held rows is dropped, and the close re-reads', async () => {
    // The sync tick fires on every foreground, so a read can be mid-flight at the open.
    jest.setSystemTime(local(8, 10, 0));
    getRecentFoods.mockResolvedValueOnce([HILLS]);
    seedPets(1);
    const view = render(<FAB />);
    await act(async () => {});

    let release: (foods: unknown[]) => void = () => {};
    getRecentFoods.mockImplementationOnce(
      () => new Promise((resolve) => { release = resolve as never; }),
    );
    await act(async () => {
      useSyncStore.getState().bumpHydrationTick();
    });
    fireEvent.press(view.getByLabelText('Log event'));
    await act(async () => { release([ROYAL, HILLS]); });
    expect(fanLabels(view).slice(-2)).toEqual(['Log food', 'Hills · i/d']);

    getRecentFoods.mockResolvedValue([ROYAL, HILLS]);
    fireEvent.press(view.getByTestId('fab-scrim'));
    await settleAnimations();
    expect(getRecentFoods).toHaveBeenCalledTimes(3);
  });

  it('a pet switch reads that pet’s order over the same day', async () => {
    jest.setSystemTime(local(8, 12, 0));
    seedPets(2);
    render(<FAB />);
    await act(async () => {});
    await act(async () => {
      usePetStore.setState({ activePet: { id: 'p2', name: 'Mochi' } as never });
    });
    expect(getRecentFoods.mock.calls.at(-1)?.[0]).toBe('p2');
    expect(lastSpan()).toEqual(fabFoodDay(local(8, 12, 0).getTime()));
  });
});

// ── CUL-1665 — a removal reaches the recent foods before the next open ────────
//
// A past-day meal is in no list `todayEvents` drives, so the fan hears of its deletion
// through the record's change counter, which the shared reversal raises
// (lib/undoLog.test.ts pins that half). This block pins the FAB's half.
describe('FAB — CUL-1665, a deleted past meal leaves the recent foods', () => {
  const HILLS = { id: 'f1', brand: 'Hills', product_name: 'i/d', format: 'wet', food_type: 'meal' };
  const ROYAL = { id: 'f2', brand: 'Royal Canin', product_name: 'GI', format: 'dry', food_type: 'meal' };

  beforeEach(() => {
    getRecentFoods.mockReset();
    getRecentFoods.mockImplementation(async () => []);
    useRecordChangeStore.setState({ version: 0 });
  });

  it('a past-day meal deleted while the menu is closed is gone before the next open', async () => {
    // Yesterday's dinner was logged as Royal Canin by mistake; the owner removes it from
    // its record. Nothing of today's changed, so only the counter can carry this.
    getRecentFoods.mockResolvedValueOnce([ROYAL, HILLS]);
    seedPets(1);
    const view = render(<FAB />);
    await act(async () => {});
    expect(getRecentFoods).toHaveBeenCalledTimes(1);

    getRecentFoods.mockResolvedValue([HILLS]);
    await act(async () => {
      useRecordChangeStore.getState().notifyChanged();
    });
    expect(getRecentFoods).toHaveBeenCalledTimes(2);
    fireEvent.press(view.getByLabelText('Log event'));
    expect(view.queryByText(/Royal Canin/)).toBeNull();
    expect(fanLabels(view).slice(-2)).toEqual(['Log food', 'Hills · i/d']);
  });

  it('a removal while the menu is open lands nothing under the thumb; the close re-reads', async () => {
    getRecentFoods.mockResolvedValueOnce([ROYAL, HILLS]);
    seedPets(1);
    const view = render(<FAB />);
    await act(async () => {});
    fireEvent.press(view.getByLabelText('Log event'));
    await act(async () => {});

    getRecentFoods.mockResolvedValue([HILLS]);
    await act(async () => {
      useRecordChangeStore.getState().notifyChanged();
    });
    expect(getRecentFoods).toHaveBeenCalledTimes(1);
    expect(fanLabels(view).slice(-3)).toEqual(['Log food', 'Hills · i/d', 'Royal Canin · GI']);

    fireEvent.press(view.getByTestId('fab-scrim'));
    await settleAnimations();
    expect(getRecentFoods).toHaveBeenCalledTimes(2);
  });
});

// ── CUL-1642 — the hand-off to the log sheet: one veil ─────────────────────────
//
// The fan's three sheet doors used to fade the fan's indigo veil out while the sheet's
// Modal slid a grey one up beside it. Now the veil is ONE colour (`colorScrim`, D2) and
// it STAYS: the fan retracts beneath it, and the veil comes down only once the sheet
// has its own up at full (`logSheetVeilTaken`), or the sheet went away first.
describe('FAB — CUL-1642, the veil is handed to the log sheet', () => {
  // The veil's Animated.Value, off the composite that carries it. A native-driven value
  // is not read back into JS under jest, so what is asserted is that nothing was ever
  // started toward 0 on it — the hand-off's whole claim — rather than its last frame.
  const veilValue = (view: ReturnType<typeof render>) =>
    [view.UNSAFE_getByProps({ testID: 'fab-veil' }).props.style].flat(3)
      .find((st: { opacity?: unknown } | null) => st && typeof st === 'object' && 'opacity' in st).opacity;
  const fadedOut = (timing: jest.SpyInstance, value: unknown) =>
    timing.mock.calls.some(([v, cfg]) => v === value && (cfg as { toValue: number }).toValue === 0);

  beforeEach(() => {
    jest.useFakeTimers();
    useUiStore.setState({ logSheetVeilTaken: false });
  });
  afterEach(async () => {
    await settleAnimations();
    jest.useRealTimers();
  });

  it('the fan wears the sheet’s veil: the same colorScrim, never the old indigo', async () => {
    const view = await openMenu();
    expect(StyleSheet.flatten(view.getByTestId('fab-veil').props.style).backgroundColor).toBe(theme.colorScrim);
  });

  it.each([
    ['More events', null],
    ['Vomit', 'vomit'],
    ['Loose stool', 'diarrhea'],
  ] as const)('%s keeps the veil at full past the fan’s close, until the sheet takes it', async (row, initialType) => {
    useReducedMotionStore.setState({ reduceMotion: false });
    const view = await openMenu();
    await settleAnimations();
    const veil = veilValue(view);
    const timing = jest.spyOn(Animated, 'timing');
    fireEvent.press(view.getByText(row));
    expect(useUiStore.getState().logSheet).toEqual({ initialType, veil: 'handed' });
    // The fan retracts; the veil outlives it, never faded, and no longer a way to close.
    await settleAnimations();
    expect(view.queryByText('More events')).toBeNull();
    expect(view.getByTestId('fab-veil')).toBeTruthy();
    expect(fadedOut(timing, veil)).toBe(false);
    expect(view.queryByTestId('fab-scrim')).toBeNull();
    timing.mockRestore();

    act(() => { useUiStore.getState().takeLogSheetVeil(); });
    expect(view.queryByTestId('fab-veil')).toBeNull();
  });

  it('under Reduce Motion the fan crossfades out and the veil still holds', async () => {
    useReducedMotionStore.setState({ reduceMotion: true });
    const view = await openMenu();
    await settleAnimations();
    const veil = veilValue(view);
    const timing = jest.spyOn(Animated, 'timing');
    fireEvent.press(view.getByText('More events'));
    await settleAnimations();
    expect(view.queryByText('Vomit')).toBeNull();
    expect(view.getByTestId('fab-veil')).toBeTruthy();
    expect(fadedOut(timing, veil)).toBe(false);
    timing.mockRestore();
    act(() => { useUiStore.getState().takeLogSheetVeil(); });
    expect(view.queryByTestId('fab-veil')).toBeNull();
  });

  it('a sheet closed before it was shown takes the fan’s veil down with it', async () => {
    const view = await openMenu();
    fireEvent.press(view.getByText('More events'));
    await settleAnimations();
    expect(view.getByTestId('fab-veil')).toBeTruthy();
    act(() => { useUiStore.getState().closeLogSheet(); });
    expect(view.queryByTestId('fab-veil')).toBeNull();
  });

  // The control for the two above: a plain close DOES fade the veil, so the detector
  // is not vacuous.
  it('a plain close (the veil tapped) fades the veil out', async () => {
    useReducedMotionStore.setState({ reduceMotion: false });
    const view = await openMenu();
    await settleAnimations();
    const veil = veilValue(view);
    const timing = jest.spyOn(Animated, 'timing');
    fireEvent.press(view.getByTestId('fab-scrim'));
    expect(fadedOut(timing, veil)).toBe(true);
    timing.mockRestore();
  });

  it('a door whose open the store refuses (a sheet already up) just closes the fan', async () => {
    const view = await openMenu();
    act(() => { useUiStore.setState({ logSheet: { initialType: null, veil: 'own' } }); });
    fireEvent.press(view.getByText('Vomit'));
    await settleAnimations();
    // Nobody will take a veil, so none is held.
    expect(view.queryByTestId('fab-veil')).toBeNull();
    expect(useUiStore.getState().logSheet).toEqual({ initialType: null, veil: 'own' });
  });
});

describe('FAB — CUL-724, VoiceOver focus moves into the fan when it opens', () => {
  // Spied, not mocked at the top of the file, so the wiring is asserted here and the
  // rest of the suite runs against the real helper (which no-ops off-device).
  const a11yFocus = require('../../lib/a11yFocus') as typeof import('../../lib/a11yFocus');
  const { AccessibilityInfo } = require('react-native') as typeof import('react-native');
  const { FAN_OPEN_ANNOUNCEMENT, FAN_FOCUS_DELAY_MS } = require('./FAB') as typeof import('./FAB');
  let focus: jest.SpyInstance;
  let announce: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    focus = jest.spyOn(a11yFocus, 'focusAccessibility').mockReturnValue(true);
    announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    // The jest preset already mocks AccessibilityInfo, so the spy is that mock, carrying
    // every earlier test's opens: start this block's count from zero.
    announce.mockClear();
  });
  afterEach(() => {
    focus.mockRestore();
    announce.mockRestore();
    jest.useRealTimers();
  });

  /** The label on the node a focus call was handed. Read as a primitive: a failing matcher
   *  over the node itself pretty-prints its fiber and runs the heap out. */
  const focusedLabel = (call: number) => {
    const node = focus.mock.calls[call][0] as { props?: { accessibilityLabel?: string } };
    return node?.props?.accessibilityLabel;
  };
  const advance = (ms: number) => act(() => { jest.advanceTimersByTime(ms); });

  it('announces the open, then moves focus onto the pet chip at the top of the fan', async () => {
    const view = await openMenu();
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith(FAN_OPEN_ANNOUNCEMENT);
    // The sentence gets its beat before focus moves: a focus move reads the row at once
    // and would cut the announcement off.
    advance(FAN_FOCUS_DELAY_MS - 1);
    expect(focus.mock.calls.length).toBe(0);
    advance(1);
    expect(focus.mock.calls.length).toBe(1);
    expect(focusedLabel(0)).toBe('Logging for Nyx — switch pet');
    expect(view.getByLabelText('Logging for Nyx — switch pet')).toBeTruthy();
  });

  it('with one pet there is no chip, so focus lands on More events', async () => {
    seedPets(1);
    const view = await openMenu();
    advance(FAN_FOCUS_DELAY_MS);
    expect(focus.mock.calls.length).toBe(1);
    const node = focus.mock.calls[0][0] as { props: { onResponderRelease?: unknown } };
    // The node the ref holds is the touchable that owns the label: the same press handler.
    let owner: TreeNode | null = view.getByText('More events').parent;
    while (owner && typeof owner.props.onResponderRelease !== 'function') owner = owner.parent;
    expect(owner).not.toBeNull();
    expect(node.props.onResponderRelease === owner!.props.onResponderRelease).toBe(true);
  });

  it('the no-pet card is one focus stop, and the pets landing move focus to the chip without a second announcement', async () => {
    seedNoPets();
    const view = await openMenu();
    advance(FAN_FOCUS_DELAY_MS);
    expect(focus.mock.calls.length).toBe(1);
    const card = focus.mock.calls[0][0] as { props: { accessible?: boolean } };
    expect(card.props.accessible).toBe(true);
    expect(view.getByText('No pet loaded yet')).toBeTruthy();

    // The card the owner was on leaves the tree; focus would go with it.
    await act(async () => { seedPets(2); });
    advance(FAN_FOCUS_DELAY_MS);
    expect(focus.mock.calls.length).toBe(2);
    expect(focusedLabel(1)).toBe('Logging for Nyx — switch pet');
    expect(announce).toHaveBeenCalledTimes(1);
  });

  it('a pet flip inside the open fan keeps the owner where they are', async () => {
    await openMenu();
    advance(FAN_FOCUS_DELAY_MS);
    expect(focus.mock.calls.length).toBe(1);
    await act(async () => {
      usePetStore.setState({ activePet: { id: 'p2', name: 'Mochi' } as never });
    });
    advance(FAN_FOCUS_DELAY_MS);
    expect(focus.mock.calls.length).toBe(1);
    expect(announce).toHaveBeenCalledTimes(1);
  });

  it('a close before the beat moves no focus, and every open speaks and focuses again', async () => {
    const view = await openMenu();
    fireEvent.press(view.getByTestId('fab-scrim'));
    // The close finishes (and its render commits) well inside the beat.
    advance(FAN_FOCUS_DELAY_MS - 1);
    advance(FAN_FOCUS_DELAY_MS);
    expect(view.getByLabelText('Log event')).toBeTruthy();
    expect(focus.mock.calls.length).toBe(0);

    fireEvent.press(view.getByLabelText('Log event'));
    await act(async () => {});
    advance(FAN_FOCUS_DELAY_MS);
    expect(announce).toHaveBeenCalledTimes(2);
    expect(focus.mock.calls.length).toBe(1);
  });

  it('a close still retracting when the beat lands puts focus on no pill on its way out', async () => {
    const view = await openMenu();
    advance(FAN_FOCUS_DELAY_MS - 50);
    fireEvent.press(view.getByTestId('fab-scrim'));
    advance(50);
    expect(focus.mock.calls.length).toBe(0);
  });

  it('a re-open caught mid-close speaks and moves focus again', async () => {
    const view = await openMenu();
    advance(FAN_FOCUS_DELAY_MS);
    expect(focus.mock.calls.length).toBe(1);
    // The disc reads "Close menu" until the retract finishes; the second tap re-opens.
    fireEvent.press(view.getByLabelText('Close menu'));
    fireEvent.press(view.getByLabelText('Close menu'));
    await act(async () => {});
    advance(FAN_FOCUS_DELAY_MS);
    expect(view.getByLabelText('Close menu')).toBeTruthy();
    expect(announce).toHaveBeenCalledTimes(2);
    expect(focus.mock.calls.length).toBe(2);
    expect(focusedLabel(1)).toBe('Logging for Nyx — switch pet');
  });

  it('a branch flip inside the beat still focuses a mounted lead', async () => {
    // The scroll branch moves the lead to a new parent under the same key; a large text
    // size on a small window is what flips it (lib/fanBudget.ts). REFACTOR-SAFETY, not a
    // mutation-proven guard (C-18): in this renderer the chip's instance survives the
    // flip (Animated's merged ref re-fires null, then the same node, on every render), so
    // reverting the timer to the node it was armed with stays green here. The timer reads
    // the live ref because a device remount would otherwise hand over a dead node; the
    // VoiceOver pass at a large text size is where that half is verified.
    const rn = require('react-native') as typeof import('react-native');
    const dims = jest.spyOn(rn, 'useWindowDimensions');
    try {
      dims.mockReturnValue({ width: 375, height: 667, scale: 2, fontScale: 1 });
      const view = await openMenu();
      expect(view.queryByTestId('fab-fan-scroll')).toBeNull();
      // The SE at AX3, the size the budget scrolls at (the CUL-1636 block pins it).
      dims.mockReturnValue({ width: 375, height: 667, scale: 2, fontScale: 2.643 });
      await act(async () => { view.rerender(<FAB />); });
      expect(view.getByTestId('fab-fan-scroll')).toBeTruthy();
      advance(FAN_FOCUS_DELAY_MS);
      expect(focus.mock.calls.length).toBe(1);
      const target = focus.mock.calls[0][0] as { props: { accessibilityLabel?: string } } | null;
      expect(target?.props.accessibilityLabel).toBe('Logging for Nyx — switch pet');
      // The row the platform is handed is still in the tree: the node that left on the
      // remount carries the same label and props, so only its membership tells them apart.
      const mounted = view.UNSAFE_root.findAll((n: TreeNode) => n.instance === target);
      expect(mounted.length).toBe(1);
    } finally {
      dims.mockRestore();
    }
  });

  it('never touches focus or speaks while the menu stays closed', async () => {
    render(<FAB />);
    await act(async () => {});
    advance(FAN_FOCUS_DELAY_MS * 2);
    expect(announce).not.toHaveBeenCalled();
    expect(focus.mock.calls.length).toBe(0);
  });
});

// ── CUL-1645 (D3) — the pills press like the disc, and nothing spins ────────────────
//
// A pill answered the finger by fading to 70%, so Home showed through it, and a one-tap
// food spun a Whorl over a write that only touches local SQLite. Now every pill settles
// to 0.97 with the pressed fill on touch DOWN, on the native driver; under Reduce Motion
// the fill alone answers. A food holds the pressed state through its write instead of
// spinning. What this suite cannot see is the feel: that is the device pass's.
describe('FAB — CUL-1645, the pills press like the disc', () => {
  const { PILL_MIN_HEIGHT, FAN_GAP } = require('../../lib/fanBudget');

  /** The host that owns a label's touch: the nearest ancestor taking a release. */
  function owningHost(node: TreeNode): TreeNode | null {
    let n: TreeNode | null = node;
    while (n) {
      if (typeof n.type === 'string' && typeof n.props.onResponderRelease === 'function') return n;
      n = n.parent;
    }
    return null;
  }
  function pillStyle(view: ReturnType<typeof render>, label: string | RegExp) {
    const host = owningHost(view.getByText(label));
    expect(host).not.toBeNull();
    return StyleSheet.flatten(host!.props.style) as Record<string, unknown>;
  }
  const scaleOf = (style: Record<string, unknown>): unknown =>
    (Array.isArray(style.transform) ? style.transform : [])
      .map((t: Record<string, unknown>) => t.scale)
      .find((v: unknown) => v !== undefined);
  const pressedTo = (spring: jest.SpyInstance, toValue: number) =>
    spring.mock.calls.filter(([, cfg]) => cfg.toValue === toValue && cfg.useNativeDriver === true).length;

  function seedFood() {
    getRecentFoods.mockResolvedValueOnce([
      { id: 'f1', brand: 'Hills', product_name: 'i/d', format: 'wet', food_type: 'meal' },
    ]);
  }

  afterEach(() => {
    act(() => { useMomentStore.getState().hide(); });
  });

  // GUARD: red on the TouchableOpacity tree (no spring at 0.97, no pressed fill).
  it.each(['Vomit', /Hills/])('in motion: %s settles to 0.97 with the pressed fill on touch down, and back on release', async (label) => {
    useReducedMotionStore.setState({ reduceMotion: false });
    seedFood();
    const view = await openMenu();
    const spring = jest.spyOn(Animated, 'spring');
    try {
      expect(pillStyle(view, label).backgroundColor).toBe(theme.colorSurface);
      expect(pillStyle(view, label).opacity).toBeUndefined();

      fireEvent(view.getByText(label), 'pressIn');
      await act(async () => {});
      expect(pressedTo(spring, 0.97)).toBe(1);
      expect(pillStyle(view, label).backgroundColor).toBe(theme.colorSurfaceSubtle);
      expect(scaleOf(pillStyle(view, label))).toBeDefined();

      fireEvent(view.getByText(label), 'pressOut');
      await act(async () => {});
      expect(pressedTo(spring, 1)).toBe(1);
      expect(pillStyle(view, label).backgroundColor).toBe(theme.colorSurface);
    } finally {
      spring.mockRestore();
    }
  });

  // GUARD: the Reduce Motion path is the fill only — no spring, no transform on the pill.
  it.each(['Vomit', /Hills/])('under Reduce Motion: %s takes the fill and never scales', async (label) => {
    useReducedMotionStore.setState({ reduceMotion: true });
    seedFood();
    const view = await openMenu();
    const spring = jest.spyOn(Animated, 'spring');
    try {
      fireEvent(view.getByText(label), 'pressIn');
      await act(async () => {});
      expect(pillStyle(view, label).backgroundColor).toBe(theme.colorSurfaceSubtle);
      expect(scaleOf(pillStyle(view, label))).toBeUndefined();
      expect(pillStyle(view, label).transform).toBeUndefined();
      fireEvent(view.getByText(label), 'pressOut');
      await act(async () => {});
      expect(pillStyle(view, label).backgroundColor).toBe(theme.colorSurface);
      expect(spring).not.toHaveBeenCalled();
    } finally {
      spring.mockRestore();
    }
  });

  it('the pressed fill is the neutral pressed ground, never a colour that reads as success', () => {
    const neverSuccess = [
      theme.colorAccent, theme.colorAccentLight, theme.colorEventMeal, theme.colorEventMealLight,
    ];
    expect(neverSuccess).not.toContain(theme.colorSurfaceSubtle);
  });

  // GUARD: red on the old tree, where the pill drew a WhorlSpinner while writing.
  it('a one-tap food holds the pressed state through its write, spins nothing, and writes once', async () => {
    useReducedMotionStore.setState({ reduceMotion: false });
    insertMeal.mockReset();
    let land: (v: unknown) => void = () => {};
    insertMeal.mockImplementationOnce(() => new Promise((resolve) => { land = resolve; }));
    seedFood();
    const view = await openMenu();

    // Release before press, the order Pressability fires them in on a lift. (RNTL also
    // refuses events on the disabled pill once the write starts, so a release sent
    // after the press would never arrive and the test would pass over nothing.)
    fireEvent(view.getByText(/Hills/), 'pressIn');
    fireEvent(view.getByText(/Hills/), 'pressOut');
    fireEvent.press(view.getByText(/Hills/));
    await act(async () => {});
    expect(insertMeal).toHaveBeenCalledTimes(1);
    // The finger is up and the write is in flight: the pill is still pressed.
    expect(pillStyle(view, /Hills/).backgroundColor).toBe(theme.colorSurfaceSubtle);
    expect(view.UNSAFE_root.findAll((n: TreeNode) => /Whorl/.test(String(n.type?.name ?? n.type?.displayName ?? ''))))
      .toHaveLength(0);
    // The `logging` guard still holds: a second tap mid-write writes nothing more.
    fireEvent.press(view.getByText(/Hills/));
    expect(insertMeal).toHaveBeenCalledTimes(1);

    await act(async () => {
      land({ eventId: 'm1', occurredAtIso: '2026-10-08T12:00:00.000Z', now: '2026-10-08T12:00:00.000Z' });
    });
    expect(insertMeal).toHaveBeenCalledTimes(1);
  });

  it('a food write that fails releases the press, so the row reads as ready to retry', async () => {
    useReducedMotionStore.setState({ reduceMotion: false });
    insertMeal.mockReset();
    insertMeal.mockRejectedValueOnce(new Error('disk I/O error'));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const logged = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      seedFood();
      const view = await openMenu();
      fireEvent(view.getByText(/Hills/), 'pressIn');
      await act(async () => { fireEvent.press(view.getByText(/Hills/)); });
      fireEvent(view.getByText(/Hills/), 'pressOut');
      await act(async () => {});
      expect(alert).toHaveBeenCalledTimes(1);
      expect(pillStyle(view, /Hills/).backgroundColor).toBe(theme.colorSurface);
    } finally {
      alert.mockRestore();
      logged.mockRestore();
    }
  });

  // C-5: every pill owns its own touch, carries the 44pt floor in its own box with no
  // slop, and the stack's gap is the separation. The 0.97 is a transform, so it moves
  // no geometry and cannot bring two hit areas together.
  it('C-5: each pill is its own responder, no slop, the floor in its own box, a gap between', async () => {
    useReducedMotionStore.setState({ reduceMotion: false });
    seedFood();
    const view = await openMenu();
    const labels = [...ACTION_ROWS, /Hills/];
    const hosts = labels.map((l) => owningHost(view.getByText(l)));
    expect(hosts.every(Boolean)).toBe(true);
    expect(new Set(hosts).size).toBe(labels.length);
    for (const host of hosts) {
      expect(host!.props.hitSlop).toBeUndefined();
      const style = StyleSheet.flatten(host!.props.style) as Record<string, unknown>;
      expect(style.minHeight).toBe(PILL_MIN_HEIGHT);
      expect(style.margin ?? 0).toBe(0);
    }
    expect(FAN_GAP).toBeGreaterThan(0);

    // Held down, a pill keeps its own box: the pressed style adds no padding, margin or
    // slop, only the fill and the transform.
    fireEvent(view.getByText('Vomit'), 'pressIn');
    await act(async () => {});
    const pressed = owningHost(view.getByText('Vomit'))!;
    expect(pressed.props.hitSlop).toBeUndefined();
    expect((StyleSheet.flatten(pressed.props.style) as Record<string, unknown>).minHeight).toBe(PILL_MIN_HEIGHT);
  });
});
