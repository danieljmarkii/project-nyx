// CUL-2267, CUL-2703 — the transient bottom surfaces' seat off a plain phone: the bottom
// inset where the bar is a rail, held to the column and clear of the rail; the shipped
// berth where the bar is along the bottom; nothing at all on a phone.
import { theme } from '../../constants/theme';
import { columnFor, tabRailFor, NO_SIDES, type Sides } from '../../hooks/useLayoutClass';
import { transientSeatFor } from './transientSeat';

const STRIP = theme.layoutSystemBarMinWidth;
const FOLDED: Sides = { left: 0, right: STRIP, bar: 'right' };
const ON_SIDE_LEFT: Sides = { left: STRIP, right: 0, bar: 'left' };

describe('transientSeatFor', () => {
  const seat = (w: number, sides: Sides, inColumn: boolean, safeBottom = 20) =>
    transientSeatFor({ railed: tabRailFor(sides) !== null, gutters: columnFor(w, sides).gutters, safeBottom, inColumn });

  it.each([320, 375, 390, 430])('a %ipt phone keeps its shipped berth (null)', (w) => {
    expect(seat(w, NO_SIDES, true)).toBeNull();
    expect(seat(w, NO_SIDES, false)).toBeNull();
  });

  it.each([
    ['folded', 466, FOLDED],
    ['on its side', 951, { left: 0, right: STRIP, bar: 'right' } as Sides],
    ['on its side, strip left', 951, ON_SIDE_LEFT],
  ] as const)('%s: the bottom inset, inside the column, clear of the rail', (_label, w, sides) => {
    const rail = tabRailFor(sides)!;
    const { width: columnWidth, gutters } = columnFor(w, sides);
    const card = seat(w, sides, true) as { bottom: number; left: number; right: number };
    expect(card.bottom).toBe(20 + theme.space2);
    // In window coordinates: the column starts at its left gutter.
    const left = gutters.left + card.left;
    const right = gutters.left + columnWidth - card.right;
    const railFrom = rail.edge === 'right' ? w - rail.width : 0;
    const railTo = rail.edge === 'right' ? w : rail.width;
    expect(right <= railFrom || left >= railTo).toBe(true);
  });

  it('the Snackbar, mounted over the window, lands on the same rect as a card', () => {
    const { gutters } = columnFor(951, FOLDED);
    const card = seat(951, FOLDED, true) as { left: number; right: number };
    const bar = seat(951, FOLDED, false) as { left: number; right: number };
    expect(bar.left).toBe(card.left + gutters.left);
    expect(bar.right).toBe(card.right + gutters.right);
  });

  // The unfolded Duo upright: a bottom bar is there, so the berth that clears it stands.
  it('under a bottom bar on a wide window a card keeps its berth, and the Snackbar only steps in', () => {
    expect(seat(669, NO_SIDES, true)).toBeNull();
    const { gutters } = columnFor(669);
    expect(seat(669, NO_SIDES, false)).toEqual({ left: theme.space2 + gutters.left, right: theme.space2 + gutters.right });
  });
});
