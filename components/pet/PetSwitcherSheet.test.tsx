// CUL-662 split the pet switcher in two: PetSwitcherPanel is the content (scrim +
// sheet, no presentation of its own), and PetSwitcherSheet is the thin <Modal>
// wrapper the home header and the FAB have always used.
//
// What this file pins is the SPLIT, because both halves have a property the other
// must not acquire. The panel must render NO Modal — that is the entire reason it
// exists, and EventTypeSheet (itself a Modal) depends on it. The wrapper must still
// render ONE — HomeHeader and the FAB present from the root, where a Modal is
// correct and where nothing about their behaviour changed. A future tidy-up that
// collapsed either half back into the other would reintroduce the iOS wedge on the
// log sheet, and nothing else in the suite would notice.

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('../../lib/storage', () => ({ getPublicUrl: () => null }));
jest.mock('../../lib/haptics', () => ({ openMenu: jest.fn() }));
jest.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: jest.fn(() => false) }));

// The archived-pets link needs a real (head-only) count to render, so the two rows
// that navigate away can both be exercised. Chainable, resolving to one archived pet.
// `from` is spied rather than bare so a capture host can assert the query is never
// made at all — not merely that its result went unrendered.
const mockFrom = jest.fn();
jest.mock('../../lib/supabase', () => {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.then = (resolve: (v: unknown) => unknown) => resolve({ count: 1, error: null });
  return { supabase: { from: (...args: unknown[]) => { mockFrom(...args); return chain; } } };
});

import { Modal } from 'react-native';
import { act, render, fireEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Animated } from 'react-native';
import { theme } from '../../constants/theme';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { PetSwitcherPanel, PetSwitcherSheet } from './PetSwitcherSheet';
import { usePetStore } from '../../store/petStore';
import { useAuthStore } from '../../store/authStore';

function seed() {
  usePetStore.setState({
    pets: [{ id: 'p1', name: 'Nyx' }, { id: 'p2', name: 'Mochi' }] as never,
    activePet: { id: 'p1', name: 'Nyx' } as never,
  });
  useAuthStore.setState({ user: { id: 'u1' } as never });
}

// The archived-pets count lands asynchronously; settle it so its setState is inside
// act() rather than trailing a finished test as a warning.
const settled = (view: ReturnType<typeof render>) =>
  waitFor(() => expect(view.getByText('Archived pets')).toBeTruthy());

beforeEach(() => {
  (router.push as jest.Mock).mockClear();
  mockFrom.mockClear();
  (useReducedMotion as jest.Mock).mockReturnValue(false);
  seed();
});

/** Let a pending archived-count fetch settle, so "no row" means it never came. */
const flush = () => act(async () => {});

describe('PetSwitcherPanel', () => {
  it('renders NO Modal of its own — it is a layer, for hosts already presenting one', async () => {
    const view = render(<PetSwitcherPanel visible onClose={jest.fn()} />);
    expect(view.getByText('Your pets')).toBeTruthy();
    expect(view.UNSAFE_queryAllByType(Modal)).toHaveLength(0);
    await settled(view);
  });

  it('renders nothing when not visible', () => {
    const view = render(<PetSwitcherPanel visible={false} onClose={jest.fn()} />);
    expect(view.queryByText('Your pets')).toBeNull();
  });

  it('a pet row switches the active pet and closes', async () => {
    const onClose = jest.fn();
    const view = render(<PetSwitcherPanel visible onClose={onClose} />);
    await settled(view);
    fireEvent.press(view.getByLabelText('Switch to Mochi'));
    expect(usePetStore.getState().activePet?.id).toBe('p2');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(router.push).not.toHaveBeenCalled(); // a switch is not a navigation
  });

  // The rows that LEAVE. onNavigateAway is what a Modal host uses to dismiss itself
  // as well, because a pushed screen renders behind an RN Modal — without it the
  // owner taps "Add a pet" and lands on a screen they cannot see. Asserted as
  // "fired before the push", since dismissing after navigating is the same bug.
  it.each([
    ['Add a pet', '/add-pet'],
    ['Archived pets', '/archived-pets'],
  ])('%s reports the navigation away before pushing', async (label, route) => {
    const order: string[] = [];
    (router.push as jest.Mock).mockImplementation(() => order.push('push'));
    const view = render(
      <PetSwitcherPanel
        visible
        onClose={() => order.push('close')}
        onNavigateAway={() => order.push('navigateAway')}
      />,
    );
    await settled(view);
    fireEvent.press(view.getByText(label));

    expect(order).toEqual(['close', 'navigateAway', 'push']);
    expect(router.push).toHaveBeenCalledWith(route);
  });
});

// ── captureSurface (CUL-678 · PM ruling D1 = A, D2 = i) ──────────────────────
//
// The same panel is hosted by surfaces that exist to CAPTURE — the log sheet's
// title and the FAB menu's "Logging for" chip. There the two management rows are
// account admin standing where the owner came to record something, and BOTH leave:
// the host closes, and "Add a pet" additionally makes the new pet active
// device-wide (`addPet(data, { select: true })`). So a mis-tap two taps from a
// vomit log costs the log — and, if the form is completed, silently re-points the
// whole app at a different pet.
//
// What is asserted here is the shape of the answer, not just the absence: the pet
// rows are untouched. This hides admin, never a pet — a switcher that dropped a pet
// on a capture surface would be the wrong-pet class (CUL-574) wearing this fix.
describe('PetSwitcherPanel — captureSurface', () => {
  it('keeps every pet and drops both management rows', async () => {
    const view = render(<PetSwitcherPanel visible captureSurface onClose={jest.fn()} />);

    expect(view.getByText('Your pets')).toBeTruthy();
    expect(view.getByLabelText('Switch to Nyx')).toBeTruthy();
    expect(view.getByLabelText('Switch to Mochi')).toBeTruthy();

    await flush();
    expect(view.queryByText('Add a pet')).toBeNull();
    expect(view.queryByText('Archived pets')).toBeNull();
  });

  // The archived link is the only reason the panel reaches the network. With the
  // row gone the query has no consumer, so not making it is the honest state — and
  // asserting the CALL rather than the row is what tells "never asked" apart from
  // "asked, and hid the answer".
  it('never asks whether an archived pet exists', async () => {
    render(<PetSwitcherPanel visible captureSurface onClose={jest.fn()} />);
    await flush();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  // The management hosts are the point of the default: the Home header and the Pet
  // tab are where these rows read as the household's roster rather than as admin in
  // the way, and nothing about them changed.
  it('is off by default, so the header and Pet tab are untouched', async () => {
    const view = render(<PetSwitcherPanel visible onClose={jest.fn()} />);
    await settled(view);
    expect(view.getByText('Add a pet')).toBeTruthy();
    expect(mockFrom).toHaveBeenCalledWith('pets');
  });

  // ── The scope disclosure (CUL-680 · PM ruling A1) ──────────────────────────
  //
  // A capture host frames the switcher in scoped language ("Log for {pet}",
  // "Logging for {pet}") over an action that is not scoped: the tap persists the
  // selection and re-points the whole app. The ruling kept the switch global and
  // required the panel to SAY so, so this asserts the sentence is on the surface
  // that makes the false promise — and only there.
  it('names the app-wide effect on a capture host', async () => {
    const view = render(<PetSwitcherPanel visible captureSurface onClose={jest.fn()} />);
    await flush();
    expect(
      view.getByText('Switching changes the whole app to that pet, not just this log.'),
    ).toBeTruthy();
  });

  // Not a blanket disclaimer. On the Home header and the Pet tab the scope is
  // self-evident — the screen being read changes under the tap — and neither ever
  // framed the switch as being about one log, so the line would be noise on a
  // surface that never mis-stated anything.
  //
  // Settled with `flush` rather than `settled`: this asserts an ABSENCE, so waiting
  // on the archived link would bind it to a 1s waitFor it has no stake in — a cold
  // run then reds it for a reason unrelated to the thing under test.
  it('stays off the management hosts, which never implied a scope', async () => {
    const view = render(<PetSwitcherPanel visible onClose={jest.fn()} />);
    await flush();
    expect(view.queryByText(/not just this log/)).toBeNull();
  });
});

// B-284 §1.5's motion budget: every animated component defines a static frame and
// respects the OS setting. The panel's entry is the only motion it has, so honouring
// the setting means arriving at zero duration — the static frame IS the end state,
// never a skipped render.
describe('PetSwitcherPanel — motion budget', () => {
  // No signed-in user here, so the archived-count fetch never runs: these tests are
  // about the entry animation, and an async row landing mid-assert is only noise.
  beforeEach(() => useAuthStore.setState({ user: null as never }));

  const durations = () => {
    const spy = jest.spyOn(Animated, 'timing');
    return () => spy.mock.calls.map(([, config]) => (config as { duration?: number }).duration);
  };

  it('animates in when used as a layer, and not at all under the Modal wrapper', () => {
    const read = durations();
    render(<PetSwitcherPanel visible animated onClose={jest.fn()} />);
    expect(read()).toEqual([theme.durationFast]);
    jest.restoreAllMocks();

    const read2 = durations();
    render(<PetSwitcherPanel visible onClose={jest.fn()} />); // wrapper case: Modal slides
    expect(read2()).toEqual([]);
    jest.restoreAllMocks();
  });

  // The panel stays MOUNTED between opens (the host gates on `visible`, it does not
  // unmount), so the animated value survives a close still holding its END state. A
  // passive effect runs after paint, so without a reset on the way out the second
  // open paints one frame fully-open before snapping back to replay — a jump on
  // every open after the first, and none on the first, which is what hid it. This
  // asserts the mechanism (the value is returned to the entrance's start frame when
  // the panel goes away), because the offending frame is one React commit wide and
  // RTL flushes effects before a test can observe it.
  it('returns to the entrance start frame on close, so a re-open does not flash', () => {
    const setValue = jest.spyOn(Animated.Value.prototype, 'setValue');
    const props = { animated: true as const, onClose: jest.fn() };
    const view = render(<PetSwitcherPanel visible {...props} />);

    setValue.mockClear();
    view.rerender(<PetSwitcherPanel visible={false} {...props} />);
    expect(setValue).toHaveBeenCalledWith(0);

    // ...and the re-open still animates, rather than the reset being mistaken for
    // "the entry was skipped".
    const read = durations();
    view.rerender(<PetSwitcherPanel visible {...props} />);
    expect(read()).toEqual([theme.durationFast]);
    jest.restoreAllMocks();
  });

  it('collapses the entry to the static frame when reduce-motion is on', () => {
    (useReducedMotion as jest.Mock).mockReturnValue(true);
    const read = durations();
    const view = render(<PetSwitcherPanel visible animated onClose={jest.fn()} />);
    expect(read()).toEqual([0]);
    expect(view.getByText('Your pets')).toBeTruthy(); // still rendered, just not moved
    jest.restoreAllMocks();
  });
});

describe('PetSwitcherSheet', () => {
  it('still presents the panel in its own Modal — the header/FAB path is unchanged', async () => {
    const view = render(<PetSwitcherSheet visible onClose={jest.fn()} />);
    expect(view.UNSAFE_getAllByType(Modal).filter((m) => m.props.visible)).toHaveLength(1);
    expect(view.getByText('Your pets')).toBeTruthy();
    await settled(view);
  });

  // The FAB menu is a capture surface that presents from the root, so it needs the
  // wrapper AND the capture rule — the two are independent, and the wrapper is the
  // only path to the panel it has.
  it('carries captureSurface through to the panel, for the FAB menu', async () => {
    const view = render(<PetSwitcherSheet visible captureSurface onClose={jest.fn()} />);
    expect(view.getByText('Your pets')).toBeTruthy();
    await flush();
    expect(view.queryByText('Add a pet')).toBeNull();
    // Both halves of what the prop means reach the panel through the wrapper — the
    // FAB menu is a capture host too, and its chip makes the same scoped promise the
    // log sheet's title does (CUL-680).
    expect(view.queryByText(/not just this log/)).toBeTruthy();
  });
});
