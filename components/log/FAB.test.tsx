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
jest.mock('../../lib/haptics', () => ({ openMenu: jest.fn() }));
jest.mock('../../lib/db', () => ({ getRecentFoods: jest.fn(async () => []) }));
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

import { Animated, Text } from 'react-native';
import { act, render, fireEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import { FAB, HiddenUnderFabMenu } from './FAB';
import { usePetStore } from '../../store/petStore';
import { useUiStore } from '../../store/uiStore';
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
    expect(useUiStore.getState().logSheet).toEqual({ initialType });
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
      captureOverlay: { summary: null, inViewport: true, busy: false, onBack: jest.fn(), onDone: null },
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
        captureOverlay: { summary: null, inViewport: true, busy: false, onBack: jest.fn(), onDone: null },
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
      'More events', 'Loose stool', 'Vomit', 'Log food', 'Royal Canin dry', 'Royal Canin wet',
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
      // The turn is the underdamped spring (the overshoot), not the old linear rotate.
      expect(spring).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ toValue: 1, tension: 90, friction: 7 }),
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
