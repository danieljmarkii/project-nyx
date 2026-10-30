// CUL-2267 — the transient bottom surfaces' seat at regular width: the bottom inset, centred
// on the scene beside the rail over a tab, never over the rail; nothing at all on a phone.
import { readdirSync } from 'fs';
import { join } from 'path';
import { theme } from '../../constants/theme';
import { columnFor, tabRailFor } from '../../hooks/useLayoutClass';
import { TAB_PATHS, transientSeatFor } from './transientSeat';

describe('TAB_PATHS is every screen in app/(tabs)', () => {
  it('one path per tab file, index as /', () => {
    const files = readdirSync(join(__dirname, '../../app/(tabs)'))
      .filter((f) => f.endsWith('.tsx') && !f.includes('.test.') && !f.startsWith('_'))
      .map((f) => f.replace(/\.tsx$/, ''));
    expect(new Set(files.map((f) => (f === 'index' ? '/' : `/${f}`)))).toEqual(TAB_PATHS);
  });
});

describe('transientSeatFor', () => {
  const seat = (w: number, overTab: boolean, inColumn: boolean, safeBottom = 20) => {
    const rail = tabRailFor(w);
    return transientSeatFor({
      railWidth: rail?.width ?? null, gutter: columnFor(w).gutter, safeBottom, overTab, inColumn,
    });
  };

  it.each([320, 375, 390, 430])('a %ipt phone keeps its shipped berth (null)', (w) => {
    expect(seat(w, true, true)).toBeNull();
    expect(seat(w, true, false)).toBeNull();
  });

  it.each([626, 890])('at %ipt over a tab: the bottom inset, inside the scene, clear of the rail', (w) => {
    const rail = tabRailFor(w)!;
    const { width: columnWidth, gutter } = columnFor(w);
    const card = seat(w, true, true) as { bottom: number; left: number; right: number };
    expect(card.bottom).toBe(20 + theme.space2);
    // In window coordinates: the column starts at the gutter, the rail at the window less its width.
    const left = gutter + card.left;
    const right = gutter + columnWidth - card.right;
    expect(left).toBeGreaterThanOrEqual(0);
    expect(right).toBeLessThanOrEqual(w - rail.width);
    // Centred on the scene beside the rail.
    expect(left + right).toBeCloseTo(w - rail.width);
  });

  it('the Snackbar, mounted over the column, lands on the same rect as a card', () => {
    const w = 890;
    const { gutter } = columnFor(w);
    const card = seat(w, true, true) as { left: number; right: number };
    const bar = seat(w, true, false) as { left: number; right: number };
    expect(bar.left).toBe(card.left + gutter);
    expect(bar.right).toBe(card.right + gutter);
  });

  it('over a pushed screen there is no rail: centred on the column', () => {
    const card = seat(890, false, true) as { left: number; right: number };
    expect(card.left).toBe(theme.space2);
    expect(card.right).toBe(theme.space2);
  });
});
