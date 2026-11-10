import { createContext, useContext } from 'react';
import { useWindowDimensions, type ViewStyle } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { useVerticalBarEdgeIOS } from 'expo-status-bar';
import { theme } from '../constants/theme';

// The one place a screen learns how much room it has (CUL-2237). From the iOS 27 SDK the
// app resizes live on fold and unfold, so every answer here comes from the live window
// and is re-read on each render, never cached at mount or module load.
//
// A component sizes itself from `useColumnWidth()`, not the window: on a phone the two are
// the same number, elsewhere the column is what its content actually sits in (each screen
// centres it, `components/ui/LayoutColumn.tsx`). `guards/windowWidth.test.ts` keeps width
// reads in this file.
//
// THE SIDES (CUL-2703). The window's two side edges are not the same. Folded, on its side
// and in Split View, iOS stands its bars in a strip down one edge (the status bar and the
// camera with them) and reports it as that edge's safe-area inset; unfolded and upright,
// its bars lie flat and there is no strip. So every answer here takes the window's `Sides`:
// each edge's inset, and which edge, if any, holds the system's bar. The column is centred
// in what is left between them, and its two gutters are returned separately: Apple's own
// guidance is never to assume the two sides are equal.
//
// OUR BAR GOES WHERE THE SYSTEM'S BARS GO (PM ruling on CUL-2703, D1 = A, D2 = A). Where
// iOS stands its bars in the strip, ours is a rail in that same strip, the + at its foot;
// where iOS lays them flat, ours is the bottom bar. The bar's side is the system's edge,
// never a width: `tabRailFor` reads `sides.bar` and nothing else.

export type WidthClass = 'compact' | 'regular';

export interface LayoutClass {
  width: WidthClass;
  /** Below `layoutShortMaxHeight`: the SE, the folded Duo, the unfolded Duo on its side. */
  short: boolean;
}

export type BarEdge = 'left' | 'right';

/** The window's side edges: each one's safe-area inset, and where the system's bar stands. */
export interface Sides {
  left: number;
  right: number;
  /** The edge holding iOS's vertical bar, or null where its bars lie flat. */
  bar: BarEdge | null;
}

/** A distance from each of the window's side edges. */
export interface Gutters {
  left: number;
  right: number;
}

export interface ColumnGeometry {
  /** The width screen content sits in. */
  width: number;
  /** Each side's gap between the column and the window edge: both 0 on a phone. */
  gutters: Gutters;
}

/** An ordinary phone held upright: no inset on either side, the system's bars flat. */
export const NO_SIDES: Sides = { left: 0, right: 0, bar: null };

export function layoutClassFor(windowWidth: number, windowHeight: number): LayoutClass {
  return {
    width: windowWidth >= theme.layoutRegularMinWidth ? 'regular' : 'compact',
    short: windowHeight < theme.layoutShortMaxHeight,
  };
}

/**
 * The window's sides, from the safe-area insets and the edge iOS reports for its vertical
 * bar (`useVerticalBarEdgeIOS`: 'trailing' on a folded Duo, null wherever the status bar
 * is along the top). Where an edge is reported, that side is at least the strip's width:
 * the strip is there whether or not the inset has caught up with it, and content under
 * the clock is the defect this exists to prevent. Leading is read as left: the app is
 * left-to-right only, and the strip follows the hardware, not the language.
 */
export function sidesFor(
  insets: { left: number; right: number } | null | undefined,
  barEdge: 'leading' | 'trailing' | null | undefined,
): Sides {
  const left = insets?.left ?? 0;
  const right = insets?.right ?? 0;
  if (barEdge === 'trailing') return { left, right: Math.max(right, theme.layoutSystemBarMinWidth), bar: 'right' };
  if (barEdge === 'leading') return { left: Math.max(left, theme.layoutSystemBarMinWidth), right, bar: 'left' };
  return { left, right, bar: null };
}

/**
 * The width of one tab in the rail: wide enough for the widest fixed label and the pet's
 * name at the ladder's top rung. The rail itself is the system strip's width, never less.
 */
export const TAB_RAIL_WIDTH = theme.space6 + theme.space2;

export function columnFor(windowWidth: number, sides: Sides = NO_SIDES): ColumnGeometry {
  // What is left between the two sides. On a phone held upright that is the window, by
  // construction, so no phone moves a point.
  const safe = Math.max(0, windowWidth - sides.left - sides.right);
  const width = windowWidth < theme.layoutRegularMinWidth ? safe : Math.min(safe, theme.layoutColumnMaxWidth);
  const slack = (safe - width) / 2;
  return { width, gutters: { left: sides.left + slack, right: sides.right + slack } };
}

export interface TabRailGeometry {
  /** The window edge the rail stands on: the system bar's. */
  edge: BarEdge;
  /** The rail's width: the system strip's, so the two are one strip. */
  width: number;
}

/** Null where iOS lays its bars flat, and ours is the bottom row. */
export function tabRailFor(sides: Sides = NO_SIDES): TabRailGeometry | null {
  if (sides.bar === null) return null;
  return { edge: sides.bar, width: sides[sides.bar] };
}

/**
 * A tab scene's own gutters: the column's, less the rail on the side it stands, since the
 * navigator has already taken the rail's width off the scene. The header's ground bleeds
 * by these to reach the scene's edges.
 */
export function sceneGuttersFor(windowWidth: number, sides: Sides = NO_SIDES): Gutters {
  const { gutters } = columnFor(windowWidth, sides);
  const rail = tabRailFor(sides);
  return {
    left: gutters.left - (rail?.edge === 'left' ? rail.width : 0),
    right: gutters.right - (rail?.edge === 'right' ? rail.width : 0),
  };
}

// The insets context, not the hook: the hook throws without a provider, and a component
// test renders most of these without one (on device expo-router's root always provides it).
// A suite that mocks the library away leaves no context at all, so a stand-in keeps the
// read unconditional.
const NO_INSETS = createContext<{ top: number; left: number; right: number; bottom: number } | null>(null);

/** The window's sides, live: a fold, a turn or a Split View re-reads them. */
export function useSides(): Sides {
  const insets = useContext(SafeAreaInsetsContext ?? NO_INSETS);
  return sidesFor(insets, useVerticalBarEdgeIOS());
}

/**
 * What the phone itself reports, unprocessed, for the layout line at the foot of Settings
 * (CUL-2703): the window, the four safe-area insets as the system gives them (no strip
 * floor), and the edge it names for its vertical bar. Apple publishes none of these for
 * the Duo, so a device check reads them here instead of off a screenshot's pixels.
 */
export interface LayoutReadout {
  width: number;
  height: number;
  insets: { top: number; right: number; bottom: number; left: number } | null;
  barEdge: 'leading' | 'trailing' | null;
}

export function useLayoutReadout(): LayoutReadout {
  const { width, height } = useWindowDimensions();
  const insets = useContext(SafeAreaInsetsContext ?? NO_INSETS);
  const barEdge = useVerticalBarEdgeIOS();
  return {
    width,
    height,
    insets: insets ? { top: insets.top, right: insets.right, bottom: insets.bottom, left: insets.left } : null,
    barEdge,
  };
}

/**
 * The line is a device-check diagnostic, so it is drawn only where there is something to
 * check: a window wide enough for the column to cap, or a system bar on a side. A plain
 * phone has neither, and its owner never sees the line.
 */
export function showsLayoutReadout(r: LayoutReadout): boolean {
  return r.barEdge !== null || r.width >= theme.layoutRegularMinWidth;
}

const readoutNumber = (n: number): string => String(Math.round(n * 10) / 10);

/** One line: `466×678 · insets 0 84 34 0 · bars right` (insets clockwise from the top). */
export function formatLayoutReadout(r: LayoutReadout): string {
  const size = `${readoutNumber(r.width)}\u00d7${readoutNumber(r.height)}`;
  const insets = r.insets
    ? `insets ${[r.insets.top, r.insets.right, r.insets.bottom, r.insets.left].map(readoutNumber).join(' ')}`
    : 'insets unknown';
  const bars = r.barEdge === 'trailing' ? 'bars right' : r.barEdge === 'leading' ? 'bars left' : 'bars flat';
  return `${size} \u00b7 ${insets} \u00b7 ${bars}`;
}

/** The safe area's bottom inset, provider-safe for the same reason as the sides. */
export function useSafeBottom(): number {
  return useContext(SafeAreaInsetsContext ?? NO_INSETS)?.bottom ?? 0;
}

export function useTabRail(): TabRailGeometry | null {
  return tabRailFor(useSides());
}

export function useSceneGutters(): Gutters {
  return sceneGuttersFor(useWindowDimensions().width, useSides());
}

export interface CanvasGeometry {
  /** The width a screen with its own wide layout lays its columns across. */
  width: number;
  /** How far, each side, that screen steps out of the column to reach it. */
  bleed: number;
}

/**
 * The canvas for a screen that lays two columns across a wide window rather than sitting
 * in the column (CUL-2239: Home). It is what is left between the window's sides, capped,
 * and it exists only where two phone-width columns fit in it: the unfolded Duo on its
 * side, not upright. Null otherwise, so the screen keeps the one column. It is centred on
 * the column, so the bleed is the same on both sides.
 */
export function canvasFor(windowWidth: number, sides: Sides = NO_SIDES): CanvasGeometry | null {
  if (windowWidth < theme.layoutRegularMinWidth) return null;
  const safe = windowWidth - sides.left - sides.right;
  if (safe < theme.layoutSplitMinWidth) return null;
  const width = Math.min(safe, theme.layoutCanvasMaxWidth);
  return { width, bleed: (width - columnFor(windowWidth, sides).width) / 2 };
}

export function useCanvas(): CanvasGeometry | null {
  return canvasFor(useWindowDimensions().width, useSides());
}

/**
 * Chrome whose background reaches its container's edges while its content stays in the
 * column: out by each gutter, back in by that gutter plus the chrome's own side padding.
 * Null where both gutters are 0, so a phone's style is exactly what it was.
 */
export function bleedFor(gutters: Gutters, paddingX = 0): ViewStyle | null {
  if (gutters.left <= 0 && gutters.right <= 0) return null;
  return {
    marginLeft: -gutters.left,
    marginRight: -gutters.right,
    paddingLeft: paddingX + gutters.left,
    paddingRight: paddingX + gutters.right,
  };
}

/**
 * A sheet's panel, held to the column (CUL-2243). A `<Modal>` presents in its own window,
 * outside any screen's column, so a bottom sheet would span the whole window, the system's
 * strip included. Its panel steps in from each side by that side's gutter, so it sits over
 * the column whatever its shape: a stretched flex child narrows to the column, and an
 * absolute panel (`left`/`right` insets) moves in by the same amounts, since a margin adds
 * to its offsets. `marginX` is the panel's own side margin, kept inside the column. Null
 * where both gutters are 0, so a phone's sheet is exactly what it was; width only, the
 * panel's height is its own.
 */
export function sheetCapFor(gutters: Gutters, marginX = 0): ViewStyle | null {
  if (gutters.left <= 0 && gutters.right <= 0) return null;
  return { marginLeft: marginX + gutters.left, marginRight: marginX + gutters.right };
}

export function useSheetCap(marginX = 0): ViewStyle | null {
  return sheetCapFor(useColumn().gutters, marginX);
}

/**
 * A sheet's height, on a short window (CUL-2246). The width rule above leaves the height
 * to each sheet, and each sheet had written one for a tall phone: a 320pt list, or 80% of
 * the window. On the SE and the folded Duo that leaves a fifth of a short screen as scrim
 * while the sheet's own rows scroll, and a list that cannot shrink pushes the rows under
 * it (Add a pet, Close) toward the edge at large text. So below the short line a sheet may
 * stand to just under the status bar, less one strip of scrim the owner can still tap to
 * close; its scrolling part gives up the difference. Null on a tall window, so a phone
 * above the line keeps exactly the sheet it had. Read live, so a fold re-sizes an open
 * sheet.
 */
export function sheetMaxHeightFor(windowHeight: number, safeTop: number): number | null {
  if (!layoutClassFor(0, windowHeight).short) return null;
  return windowHeight - safeTop - theme.space5;
}

/** `safeTop` is the caller's safe-area top inset: every sheet already reads its insets. */
export function useSheetMaxHeight(safeTop: number): number | null {
  return sheetMaxHeightFor(useWindowDimensions().height, safeTop);
}

export function useLayoutClass(): LayoutClass {
  const { width, height } = useWindowDimensions();
  return layoutClassFor(width, height);
}

export function useColumn(): ColumnGeometry {
  return columnFor(useWindowDimensions().width, useSides());
}

export function useColumnWidth(): number {
  return useColumn().width;
}

/**
 * The full window, for the few things that must span it whatever the column: a ground
 * drawn behind the column, and geometry measured in window coordinates (the flight).
 * Sizing CONTENT from this is the bug the column exists to prevent.
 */
export function useWindowFrame(): { width: number; height: number } {
  const { width, height } = useWindowDimensions();
  return { width, height };
}
