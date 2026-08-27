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
jest.mock('../../lib/supabase', () => {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.then = (resolve: (v: unknown) => unknown) => resolve({ count: 1, error: null });
  return { supabase: { from: () => chain } };
});

import { Modal } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
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
  (useReducedMotion as jest.Mock).mockReturnValue(false);
  seed();
});

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
});
