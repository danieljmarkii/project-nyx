import { theme } from '../constants/theme';
import { bleedFor, columnFor, layoutClassFor, sheetCapFor, sheetMaxHeightFor } from './useLayoutClass';

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

describe('sheetCapFor', () => {
  it('is nothing at compact, so a phone sheet keeps its style', () => {
    expect(sheetCapFor(0)).toBeNull();
    expect(sheetCapFor(0, 14)).toBeNull();
  });

  it('steps the panel in by the gutter, keeping its own margin inside the column', () => {
    // 890pt unfolded: a 560pt column with a 165pt gutter each side.
    const { width, gutter } = columnFor(890);
    expect(sheetCapFor(gutter)).toEqual({ marginHorizontal: 165 });
    expect(890 - 2 * (sheetCapFor(gutter)!.marginHorizontal as number)).toBe(width);
    expect(sheetCapFor(gutter, 14)).toEqual({ marginHorizontal: 179 });
  });
});

describe('sheetMaxHeightFor', () => {
  it('leaves a tall window to the sheet, so a phone above the short line keeps its sheet', () => {
    expect(sheetMaxHeightFor(844, 47)).toBeNull();
    expect(sheetMaxHeightFor(theme.layoutShortMaxHeight, 20)).toBeNull();
  });

  it('stands a short sheet to under the status bar, less one strip of scrim', () => {
    // The SE, the folded Duo, the unfolded Duo on its side.
    for (const [h, top] of [[667, 20], [678, 47], [626, 24]]) {
      const cap = sheetMaxHeightFor(h, top)!;
      expect(cap).toBe(h - top - theme.space5);
      // Taller than the 80% a tall phone's log sheet keeps, so a short screen is not
      // a fifth scrim while the sheet scrolls.
      expect(cap).toBeGreaterThan(h * 0.8);
    }
  });
});
