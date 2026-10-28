import { theme } from '../constants/theme';
import { bleedFor, columnFor, layoutClassFor } from './useLayoutClass';

// The sizes the captures photograph (CUL-2237): every iPhone width, the SE's height, the
// folded Duo and the unfolded Duo both ways. Duo points are pixels ÷ 3 (unpublished).
describe('layoutClassFor', () => {
  it.each([
    [320, 568, 'compact', true],
    [375, 667, 'compact', true],
    [390, 844, 'compact', false],
    [440, 956, 'compact', false],
    [466, 678, 'compact', true],
    [626, 890, 'regular', false],
    [890, 626, 'regular', true],
  ])('%ix%i is %s, short %s', (w, h, width, short) => {
    expect(layoutClassFor(w, h)).toEqual({ width, short });
  });

  it('switches on the band edges, not near them', () => {
    expect(layoutClassFor(theme.layoutRegularMinWidth - 1, 900).width).toBe('compact');
    expect(layoutClassFor(theme.layoutRegularMinWidth, 900).width).toBe('regular');
    expect(layoutClassFor(400, theme.layoutShortMaxHeight - 1).short).toBe(true);
    expect(layoutClassFor(400, theme.layoutShortMaxHeight).short).toBe(false);
  });
});

describe('columnFor', () => {
  it.each([320, 375, 390, 440, 466, theme.layoutRegularMinWidth - 1])('is the window at compact (%i)', (w) => {
    expect(columnFor(w)).toEqual({ width: w, gutter: 0 });
  });

  it.each([626, 890, 1376])('caps and centres at regular (%i)', (w) => {
    const { width, gutter } = columnFor(w);
    expect(width).toBe(theme.layoutColumnMaxWidth);
    expect(width + 2 * gutter).toBe(w);
  });

  it('never exceeds the window', () => {
    for (let w = 1; w < 1500; w += 7) expect(columnFor(w).width).toBeLessThanOrEqual(w);
  });
});

describe('bleedFor', () => {
  it('is nothing at compact, so a phone keeps its style', () => {
    expect(bleedFor(0)).toBeNull();
    expect(bleedFor(0, 16)).toBeNull();
  });

  it('reaches the window edge and keeps the content in the column', () => {
    expect(bleedFor(33, 16)).toEqual({ marginHorizontal: -33, paddingHorizontal: 49 });
  });
});
