import { theme } from '../constants/theme';
import { columnCap, compareLabelCap, dayCellCap, frameCap, heroHeight, squareRowCap, tilesAcross } from './layoutCaps';
import { EVENT_HERO_HEIGHT, eventHeroHeightFor } from './eventPhoto';

// The caps (CUL-2238). Every compact answer is null or the phone's own number, so a phone
// keeps main's style tree; every regular answer is derived from the shipped tokens.

describe('compact keeps the phone exactly as it was', () => {
  it('answers null for every style cap', () => {
    expect(dayCellCap('compact')).toBeNull();
    expect(squareRowCap('compact', 7, theme.space0_5)).toBeNull();
    expect(columnCap('compact', 390)).toBeNull();
    expect(compareLabelCap('compact')).toBeNull();
    expect(frameCap('compact', 390, 844, 4 / 3)).toBeNull();
  });

  it('keeps the hero at its drawn height, whatever the window', () => {
    expect(heroHeight('compact', 320, 320, 568)).toBe(320);
    expect(eventHeroHeightFor('compact', 440, 956)).toBe(EVENT_HERO_HEIGHT);
  });
});

describe('regular caps what would stretch', () => {
  it('caps a day square and a row of seven of them, centred', () => {
    expect(dayCellCap('regular')).toEqual({ maxWidth: theme.layoutDayCellMax });
    const gap = theme.space0_5;
    expect(squareRowCap('regular', 7, gap)).toEqual({
      width: '100%',
      maxWidth: 7 * theme.layoutDayCellMax + 6 * gap,
      alignSelf: 'center',
    });
    expect(squareRowCap('regular', 3, theme.space2, theme.layoutTileMax)?.maxWidth).toBe(3 * theme.layoutTileMax + 2 * theme.space2);
  });

  it('caps a grid at the column and a label column at its token', () => {
    expect(columnCap('regular', theme.layoutColumnMaxWidth)).toEqual({ maxWidth: theme.layoutColumnMaxWidth, width: '100%', alignSelf: 'center' });
    expect(compareLabelCap('regular')).toEqual({ maxWidth: theme.layoutCompareLabelMax });
  });

  it('never lets a frame be taller than its share of the window', () => {
    // The Duo on its side: the window's height binds, not the column.
    const side = frameCap('regular', 560, 626, 4 / 3);
    const sideWidth = side?.maxWidth as number;
    expect(sideWidth).toBeLessThan(560);
    expect(sideWidth / (4 / 3)).toBeCloseTo(626 * theme.layoutFrameMaxHeightRatio);
    // Upright the column binds, and the frame's height still fits.
    const upright = frameCap('regular', 560, 890, 16 / 9);
    expect(upright?.maxWidth).toBe(560);
    expect(560 / (16 / 9)).toBeLessThanOrEqual(890 * theme.layoutFrameMaxHeightRatio);
  });

  it('grows the hero with the column at the phone crop, up to its share of the window', () => {
    // Upright: the phone's 320 over 390 at the column's width, under half of 890.
    expect(heroHeight('regular', 320, 560, 2000)).toBe(Math.round((560 * 320) / 390));
    expect(heroHeight('regular', 320, 560, 890)).toBe(Math.round(890 * theme.layoutFrameMaxHeightRatio));
    expect(heroHeight('regular', 320, 560, 626)).toBe(Math.round(626 * theme.layoutFrameMaxHeightRatio));
  });
});

describe('tilesAcross', () => {
  it('fits more tiles across rather than wider ones, and fills the row', () => {
    const gap = theme.space1;
    for (const available of [300, 358, 528, 560, 594]) {
      const { count, size } = tilesAcross(available, theme.layoutTileMax, gap);
      expect(size).toBeLessThanOrEqual(theme.layoutTileMax);
      expect(count * size + (count - 1) * gap).toBeCloseTo(available);
      // One fewer would overflow the cap: the count is the least that respects it.
      if (count > 1) expect((available - gap * (count - 2)) / (count - 1)).toBeGreaterThan(theme.layoutTileMax);
    }
  });

  it('answers one empty tile before the row is measured', () => {
    expect(tilesAcross(0, theme.layoutTileMax, theme.space1)).toEqual({ count: 1, size: 0 });
  });
});
