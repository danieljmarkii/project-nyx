// The pinned exits (CUL-871 / N-4a; spec §3.1a, T-21; the review's E-9).
//
// Two things are asserted here and nowhere else: WHEN each exit pins (a pure decision
// over one rect and the viewport, which no screenshot can show), and that the Done bar
// and the FAB want the SAME corner — which is what makes "the FAB steps aside"
// load-bearing rather than a nicety.

import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { DONE_BAR_BOTTOM, DONE_BAR_MIN_HEIGHT, LookExits, exitVisibility } from './LookExits';
import { useUiStore } from '../../store/uiStore';
import { theme } from '../../constants/theme';

const VIEWPORT = 700;

beforeEach(() => {
  useUiStore.setState({ captureOverlay: null });
});

describe('exitVisibility — an exit appears only once its own row is out of reach', () => {
  it('pins NEITHER while the whole card is on screen', () => {
    expect(
      exitVisibility({ cardTop: 100, cardHeight: 300, scrollY: 0, viewportHeight: VIEWPORT }),
    ).toEqual({ backPinned: false, donePinned: false });
  });

  it('pins the way back once the card’s TOP has passed the top of the viewport', () => {
    // Which is also what keeps the promise "never over a safety card": the top of the
    // screen is the card's own grid whenever this is true.
    expect(
      exitVisibility({ cardTop: 100, cardHeight: 2000, scrollY: 400, viewportHeight: VIEWPORT }),
    ).toMatchObject({ backPinned: true });
  });

  it('pins the Done bar while the card’s BOTTOM is below the fold', () => {
    expect(
      exitVisibility({ cardTop: 0, cardHeight: 2000, scrollY: 0, viewportHeight: VIEWPORT }),
    ).toMatchObject({ donePinned: true });
  });

  it('pins NOTHING once the owner has scrolled past the card entirely', () => {
    expect(
      exitVisibility({ cardTop: 0, cardHeight: 300, scrollY: 900, viewportHeight: VIEWPORT }),
    ).toEqual({ backPinned: false, donePinned: false });
  });

  it('pins NOTHING before the card has been measured — nothing is out of reach yet', () => {
    expect(
      exitVisibility({ cardTop: null, cardHeight: null, scrollY: 0, viewportHeight: null }),
    ).toEqual({ backPinned: false, donePinned: false });
  });
});

describe('the layer', () => {
  const overlay = (summary: string | null) => ({
    summary,
    inViewport: true,
    busy: false,
    onBack: jest.fn(),
    onDone: summary ? jest.fn() : null,
  });

  it('draws nothing at all when no card owns the corner', () => {
    const t = render(<LookExits backPinned donePinned />);
    expect(t.queryByTestId('look-exits')).toBeNull();
  });

  it('draws the Done bar only when there is something to commit', () => {
    useUiStore.setState({ captureOverlay: overlay(null) });
    const empty = render(<LookExits backPinned={false} donePinned />);
    expect(empty.queryByTestId('look-exit-done-bar')).toBeNull();

    useUiStore.setState({ captureOverlay: overlay('Mochi · off') });
    const chosen = render(<LookExits backPinned={false} donePinned />);
    expect(chosen.getByTestId('look-exit-done-bar')).toBeTruthy();
    expect(chosen.getByText('Mochi · off')).toBeTruthy();
  });

  it('is a box-none layer — the grid underneath stays tappable between the controls', () => {
    useUiStore.setState({ captureOverlay: overlay('Mochi · off') });
    const t = render(<LookExits backPinned donePinned />);
    expect(t.getByTestId('look-exits').props.pointerEvents).toBe('box-none');
  });
});

describe('the geometry the FAB has to step aside for (C-5)', () => {
  it('the Done bar’s box overlaps the FAB’s, which is WHY the FAB stands down', () => {
    // The FAB mounts in the tabs layout at bottom: 72 with a 56pt button, i.e. it spans
    // 72–128pt off the screen bottom. Home's body ends at the tab bar (~80pt on iOS), so
    // in this layer's coordinates the FAB occupies roughly -8 to +48.
    //
    // The bar sits at DONE_BAR_BOTTOM with DONE_BAR_MIN_HEIGHT, i.e. 16–72. The two
    // ranges intersect — deliberately: T-21 gives the corner to the exit, and the FAB
    // yields. Pinned here so that a future change which stops hiding the FAB (or moves
    // this bar up "to be safe") has to argue with a number.
    const fabTopInBody = 128 - 80;
    const barTop = DONE_BAR_BOTTOM + DONE_BAR_MIN_HEIGHT;
    expect(DONE_BAR_BOTTOM).toBeLessThan(fabTopInBody);
    expect(barTop).toBeGreaterThan(fabTopInBody);
  });

  it('the way back clears the card’s own left gutter rather than sitting over it', () => {
    useUiStore.setState({
      captureOverlay: { summary: null, inViewport: true, busy: false, onBack: jest.fn(), onDone: null },
    });
    const t = render(<LookExits backPinned donePinned={false} />);
    const style = StyleSheet.flatten(t.getByTestId('look-exit-back').props.style) as Record<string, unknown>;
    expect(style.left).toBe(theme.space3);
    // 44pt floor on a control the owner reaches for mid-scroll.
    expect(style.minHeight).toBe(44);
  });
});
