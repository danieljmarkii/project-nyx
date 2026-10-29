import type { StyleProp, ViewStyle } from 'react-native';
import { theme } from '../constants/theme';
import type { WidthClass } from '../hooks/useLayoutClass';

// What a piece inside the column may grow to at regular width (CUL-2238). The column (PR-02)
// keeps a screen at 560pt, but a square cell, a percentage tile or a 4:3 frame still grows
// with whatever it sits in, and a native modal sits outside the column altogether. So each
// piece caps itself here and the row around it centres or rearranges.
//
// Every helper answers null (or the phone's own number) at compact: a phone keeps main's
// style tree exactly, so its captures stay pixel identical.

/** `base` with a cap laid over it, or `base` itself, untouched, when there is no cap: a
 *  phone's style stays the very object main passed, never an array holding a null. */
export function withCap<T extends StyleProp<ViewStyle>>(base: T, cap: ViewStyle | null): T | [T, ViewStyle] {
  return cap ? [base, cap] : base;
}

/** A day square's cap: its box never grows past `layoutDayCellMax`. */
export function dayCellCap(width: WidthClass): ViewStyle | null {
  return width === 'regular' ? { maxWidth: theme.layoutDayCellMax } : null;
}

/**
 * A row of `count` capped squares `gap` apart, and anything that must line up with it (the
 * weekday letters): as wide as its parent up to `count` full squares, centred. Capping the
 * row rather than each cell keeps the cells `flex: 1`, so the gaps stay the gaps. `cell` is
 * a day square unless the row says otherwise (a photo slot is a tile).
 */
export function squareRowCap(width: WidthClass, count: number, gap: number, cell: number = theme.layoutDayCellMax): ViewStyle | null {
  if (width === 'compact' || count < 1) return null;
  return { width: '100%', maxWidth: count * cell + (count - 1) * gap, alignSelf: 'center' };
}

/** Anything capped at the column's width and centred: a grid that a native modal, which
 *  presents outside the column, would otherwise stretch to the window. */
export function columnCap(width: WidthClass, columnWidth: number): ViewStyle | null {
  return width === 'regular' ? { maxWidth: columnWidth, width: '100%', alignSelf: 'center' } : null;
}

/** A label column given as a share of its chart: never wider than `layoutCompareLabelMax`. */
export function compareLabelCap(width: WidthClass): ViewStyle | null {
  return width === 'regular' ? { maxWidth: theme.layoutCompareLabelMax } : null;
}

/**
 * Tiles that wrap: how many go across `available` points with each at most `max` wide, and
 * the width each takes so the row stays full. More tiles across, never wider ones.
 */
export function tilesAcross(available: number, max: number, gap: number): { count: number; size: number } {
  if (available <= 0) return { count: 1, size: 0 };
  const count = Math.max(1, Math.ceil((available + gap) / (max + gap)));
  return { count, size: (available - gap * (count - 1)) / count };
}

/**
 * A photo frame of `aspect` (width over height) that fills its parent's width: at regular it
 * is never wider than the column nor taller than `layoutFrameMaxHeightRatio` of the window,
 * and it centres. The frame keeps its `aspectRatio`, so the cap on width caps the height.
 */
export function frameCap(width: WidthClass, columnWidth: number, windowHeight: number, aspect: number): ViewStyle | null {
  if (width === 'compact') return null;
  const byHeight = windowHeight * theme.layoutFrameMaxHeightRatio * aspect;
  return { width: '100%', maxWidth: Math.min(columnWidth, byHeight), alignSelf: 'center' };
}

/**
 * The incident screen's photo hero. A phone keeps `compactHeight` (its crop was drawn for a
 * phone's width); at regular the height follows the column so the crop keeps the phone's
 * shape, up to `layoutFrameMaxHeightRatio` of the window.
 */
export function heroHeight(width: WidthClass, compactHeight: number, columnWidth: number, windowHeight: number): number {
  if (width === 'compact') return compactHeight;
  const byColumn = (columnWidth * compactHeight) / HERO_DRAWN_FOR_WIDTH;
  return Math.round(Math.min(byColumn, windowHeight * theme.layoutFrameMaxHeightRatio));
}

/** The phone width the 320pt hero was drawn at (the 390pt iPhone). */
const HERO_DRAWN_FOR_WIDTH = 390;
