import { theme } from '../constants/theme';
import {
  bleedFor, canvasFor, columnFor, formatLayoutReadout, layoutClassFor, sceneGuttersFor, sheetCapFor,
  sheetMaxHeightFor, showsLayoutReadout, sidesFor, tabRailFor, NO_SIDES, TAB_RAIL_WIDTH, type Sides,
} from './useLayoutClass';

const STRIP = theme.layoutSystemBarMinWidth;

// The poses the captures photograph (CUL-2237, CUL-2703): every iPhone width, the SE's
// height, and the Duo folded (466x678, the system's strip on the right), unfolded and
// upright (669x951, no strip) and on its side (951x669, the strip on either edge). The
// unfolded size is the one the first device check's screenshot fits; Apple publishes none.
const FOLDED: Sides = { left: 0, right: STRIP, bar: 'right' };
const ON_SIDE: Sides = { left: 0, right: STRIP, bar: 'right' };
const ON_SIDE_LEFT: Sides = { left: STRIP, right: 0, bar: 'left' };

describe('layoutClassFor', () => {
  it.each([
    [320, 568, 'compact', true],
    [375, 667, 'compact', true],
    [390, 844, 'compact', false],
    [440, 956, 'compact', false],
    [466, 678, 'compact', true],
    [669, 951, 'regular', false],
    [951, 669, 'regular', true],
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

describe('sidesFor', () => {
  it('a phone held upright has no sides', () => {
    expect(sidesFor({ left: 0, right: 0 }, null)).toEqual(NO_SIDES);
    expect(sidesFor(null, null)).toEqual(NO_SIDES);
    expect(sidesFor(undefined, undefined)).toEqual(NO_SIDES);
  });

  it('the system bar on the trailing edge is the right side, on the leading edge the left', () => {
    expect(sidesFor({ left: 0, right: STRIP }, 'trailing')).toEqual({ left: 0, right: STRIP, bar: 'right' });
    expect(sidesFor({ left: STRIP, right: 0 }, 'leading')).toEqual({ left: STRIP, right: 0, bar: 'left' });
  });

  // The strip is there whether or not the inset has caught up with it: content under the
  // clock is the defect, so a reported edge is never trusted to a zero inset.
  it('a reported edge is inset by the strip even where the safe area says nothing', () => {
    expect(sidesFor({ left: 0, right: 0 }, 'trailing')).toEqual({ left: 0, right: STRIP, bar: 'right' });
    expect(sidesFor(null, 'leading')).toEqual({ left: STRIP, right: 0, bar: 'left' });
  });

  it('a wider reported inset wins over the floor, and the far side keeps its own', () => {
    expect(sidesFor({ left: 12, right: STRIP + 10 }, 'trailing')).toEqual({ left: 12, right: STRIP + 10, bar: 'right' });
  });

  it('insets with no bar are kept as insets: content clears them, the bar stays along the bottom', () => {
    expect(sidesFor({ left: 59, right: 59 }, null)).toEqual({ left: 59, right: 59, bar: null });
  });
});

describe('columnFor', () => {
  it.each([320, 375, 390, 440, 466, theme.layoutRegularMinWidth - 1])('is the window on a phone (%i)', (w) => {
    expect(columnFor(w)).toEqual({ width: w, gutters: { left: 0, right: 0 } });
  });

  it.each([669, 951, 1376])('caps and centres on a wide window (%i)', (w) => {
    const { width, gutters } = columnFor(w);
    expect(width).toBe(theme.layoutColumnMaxWidth);
    expect(gutters.left).toBe(gutters.right);
    expect(width + gutters.left + gutters.right).toBe(w);
  });

  // The first device check's defect, folded: screens ran under the system's strip.
  it('ends where the strip begins on a folded Duo, and keeps the left edge', () => {
    expect(columnFor(466, FOLDED)).toEqual({ width: 466 - STRIP, gutters: { left: 0, right: STRIP } });
  });

  it('centres between the sides, not in the window, so the two gutters differ by the strip', () => {
    const { width, gutters } = columnFor(951, ON_SIDE);
    expect(width).toBe(theme.layoutColumnMaxWidth);
    expect(gutters.right - gutters.left).toBe(STRIP);
    expect(width + gutters.left + gutters.right).toBe(951);
    // The mirror image with the strip on the left.
    const mirrored = columnFor(951, ON_SIDE_LEFT);
    expect(mirrored.gutters).toEqual({ left: gutters.right, right: gutters.left });
  });

  it('never exceeds what is left between the sides', () => {
    for (let w = 1; w < 1500; w += 7) {
      expect(columnFor(w).width).toBeLessThanOrEqual(w);
      const sides: Sides = { left: 0, right: Math.min(STRIP, w), bar: 'right' };
      const { width, gutters } = columnFor(w, sides);
      expect(width).toBeGreaterThanOrEqual(0);
      expect(width + gutters.left + gutters.right).toBe(Math.max(w, sides.right));
    }
  });
});

describe('tabRailFor: our bar goes where the system bars go (CUL-2703, D1 = A, D2 = A)', () => {
  it('is nothing where iOS lays its bars flat, at any width: the bottom bar', () => {
    expect(tabRailFor()).toBeNull();
    expect(tabRailFor(NO_SIDES)).toBeNull();
    // The unfolded Duo upright is wide and still has no rail. Width never decides.
    expect(tabRailFor(sidesFor({ left: 0, right: 0 }, null))).toBeNull();
    // Insets alone are not a bar (a notch in landscape).
    expect(tabRailFor({ left: 59, right: 59, bar: null })).toBeNull();
  });

  it('is the system strip, on its edge, wherever iOS stands its bars', () => {
    expect(tabRailFor(FOLDED)).toEqual({ edge: 'right', width: STRIP });
    expect(tabRailFor(ON_SIDE_LEFT)).toEqual({ edge: 'left', width: STRIP });
    expect(tabRailFor({ left: 0, right: 96, bar: 'right' })).toEqual({ edge: 'right', width: 96 });
  });

  it('one rail tab fits in the strip', () => {
    expect(TAB_RAIL_WIDTH).toBeLessThanOrEqual(STRIP);
  });
});

describe('sceneGuttersFor', () => {
  it('is nothing on a phone', () => {
    expect(sceneGuttersFor(390)).toEqual({ left: 0, right: 0 });
  });

  it('is the column gutters under a bottom bar: the scene is the window', () => {
    expect(sceneGuttersFor(669)).toEqual(columnFor(669).gutters);
  });

  it.each([
    ['folded', 466, FOLDED],
    ['on its side', 951, ON_SIDE],
    ['on its side, strip left', 951, ON_SIDE_LEFT],
  ] as const)('%s: the scene beside the rail holds the column exactly, centred', (_label, w, sides) => {
    const rail = tabRailFor(sides)!;
    const scene = sceneGuttersFor(w, sides);
    expect(scene.left).toBeGreaterThanOrEqual(0);
    expect(scene.right).toBeGreaterThanOrEqual(0);
    expect(scene.left).toBe(scene.right);
    expect(w - rail.width - scene.left - scene.right).toBe(columnFor(w, sides).width);
  });
});

describe('bleedFor', () => {
  it('is nothing on a phone, so a phone keeps its style', () => {
    expect(bleedFor({ left: 0, right: 0 })).toBeNull();
    expect(bleedFor({ left: 0, right: 0 }, 16)).toBeNull();
  });

  it('reaches each edge by its own gutter and keeps the content in the column', () => {
    expect(bleedFor({ left: 33, right: 33 }, 16)).toEqual({ marginLeft: -33, marginRight: -33, paddingLeft: 49, paddingRight: 49 });
    expect(bleedFor({ left: 0, right: STRIP }, 16)).toEqual({ marginLeft: -0, marginRight: -STRIP, paddingLeft: 16, paddingRight: 16 + STRIP });
  });
});

describe('sheetCapFor', () => {
  it('is nothing on a phone, so a phone sheet keeps its style', () => {
    expect(sheetCapFor({ left: 0, right: 0 })).toBeNull();
    expect(sheetCapFor({ left: 0, right: 0 }, 14)).toBeNull();
  });

  it('steps the panel in by each gutter, keeping its own margin inside the column', () => {
    // 951pt on its side: a 560pt column between the left edge and the strip.
    const { width, gutters } = columnFor(951, ON_SIDE);
    const cap = sheetCapFor(gutters) as { marginLeft: number; marginRight: number };
    expect(951 - cap.marginLeft - cap.marginRight).toBe(width);
    expect(sheetCapFor(gutters, 14)).toEqual({ marginLeft: cap.marginLeft + 14, marginRight: cap.marginRight + 14 });
  });

  it('a folded sheet ends where the strip begins', () => {
    expect(sheetCapFor(columnFor(466, FOLDED).gutters)).toEqual({ marginLeft: 0, marginRight: STRIP });
  });
});

describe('sheetMaxHeightFor', () => {
  it('leaves a tall window to the sheet, so a phone above the short line keeps its sheet', () => {
    expect(sheetMaxHeightFor(844, 47)).toBeNull();
    expect(sheetMaxHeightFor(theme.layoutShortMaxHeight, 20)).toBeNull();
  });

  it('stands a short sheet to under the status bar, less one strip of scrim', () => {
    // The SE, the folded Duo (no top inset: the status bar is in the strip), on its side.
    for (const [h, top] of [[667, 20], [678, 0], [669, 0]]) {
      const cap = sheetMaxHeightFor(h, top)!;
      expect(cap).toBe(h - top - theme.space5);
      // Taller than the 80% a tall phone's log sheet keeps, so a short screen is not
      // a fifth scrim while the sheet scrolls.
      expect(cap).toBeGreaterThan(h * 0.8);
    }
  });
});

describe('canvasFor', () => {
  it.each([320, 375, 390, 440, 466, theme.layoutRegularMinWidth - 1])('is nothing on a phone (%i), so a phone keeps the column', (w) => {
    expect(canvasFor(w)).toBeNull();
    expect(canvasFor(w, FOLDED)).toBeNull();
  });

  it('is nothing on the unfolded Duo upright: two columns there would each be narrower than a phone', () => {
    expect(669).toBeLessThan(theme.layoutSplitMinWidth);
    expect(canvasFor(669)).toBeNull();
  });

  it('is what is left beside the strip on the unfolded Duo on its side, centred on the column', () => {
    const canvas = canvasFor(951, ON_SIDE)!;
    expect(canvas.width).toBe(951 - STRIP);
    expect(columnFor(951, ON_SIDE).width + 2 * canvas.bleed).toBe(951 - STRIP);
    // It reaches exactly the scene's edges: the bleed is the scene's gutter.
    expect(sceneGuttersFor(951, ON_SIDE)).toEqual({ left: canvas.bleed, right: canvas.bleed });
    expect(canvasFor(951, ON_SIDE_LEFT)).toEqual(canvas);
  });

  it('switches on the split line, not near it', () => {
    expect(canvasFor(theme.layoutSplitMinWidth - 1)).toBeNull();
    expect(canvasFor(theme.layoutSplitMinWidth)).not.toBeNull();
    // The line is what is left between the sides, not the window.
    expect(canvasFor(theme.layoutSplitMinWidth + STRIP - 1, ON_SIDE)).toBeNull();
    expect(canvasFor(theme.layoutSplitMinWidth + STRIP, ON_SIDE)).not.toBeNull();
  });

  it('never grows past its cap, and stays centred on the column', () => {
    const { width, bleed } = canvasFor(1376)!;
    expect(width).toBe(theme.layoutCanvasMaxWidth);
    expect(columnFor(1376).width + 2 * bleed).toBe(width);
  });
});

// The layout line at the foot of Settings: what a device check reads off the phone.
describe('formatLayoutReadout', () => {
  it('a folded Duo: the window, the insets clockwise from the top as reported, the bars on the right', () => {
    expect(
      formatLayoutReadout({ width: 466, height: 678, insets: { top: 0, right: 84, bottom: 34, left: 0 }, barEdge: 'trailing' }),
    ).toBe('466\u00d7678 \u00b7 insets 0 84 34 0 \u00b7 bars right');
  });

  it('reports the insets raw, so a strip the safe area does not report still shows as 0', () => {
    expect(
      formatLayoutReadout({ width: 466, height: 678, insets: { top: 0, right: 0, bottom: 34, left: 0 }, barEdge: 'trailing' }),
    ).toBe('466\u00d7678 \u00b7 insets 0 0 34 0 \u00b7 bars right');
  });

  it('flat bars, a leading edge, fractional points and a missing provider', () => {
    expect(formatLayoutReadout({ width: 669, height: 951, insets: { top: 74, right: 0, bottom: 21, left: 0 }, barEdge: null }))
      .toBe('669\u00d7951 \u00b7 insets 74 0 21 0 \u00b7 bars flat');
    expect(formatLayoutReadout({ width: 469.333, height: 951, insets: { top: 0, right: 0, bottom: 21, left: 84 }, barEdge: 'leading' }))
      .toBe('469.3\u00d7951 \u00b7 insets 0 0 21 84 \u00b7 bars left');
    expect(formatLayoutReadout({ width: 390, height: 844, insets: null, barEdge: null }))
      .toBe('390\u00d7844 \u00b7 insets unknown \u00b7 bars flat');
  });
});

// A diagnostic for a device check, so an owner on a plain phone never sees it.
describe('showsLayoutReadout', () => {
  const at = (width: number, barEdge: 'leading' | 'trailing' | null = null) =>
    showsLayoutReadout({ width, height: 844, insets: null, barEdge });

  it.each([320, 375, 390, 440])('is hidden on a %ipt phone', (w) => {
    expect(at(w)).toBe(false);
  });

  it('shows in every Duo pose: folded and Split View by the bar, unfolded by the width', () => {
    expect(at(466, 'trailing')).toBe(true);
    expect(at(469, 'leading')).toBe(true);
    expect(at(669)).toBe(true);
    expect(at(951, 'trailing')).toBe(true);
  });
});
