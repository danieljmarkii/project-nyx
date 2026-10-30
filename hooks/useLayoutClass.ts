import { createContext, useContext } from 'react';
import { useWindowDimensions, type ViewStyle } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { theme } from '../constants/theme';

// The one place a screen learns how much room it has (CUL-2237). From the iOS 27 SDK the
// app resizes live on fold and unfold, so every answer here comes from the live window
// and is re-read on each render, never cached at mount or module load.
//
// A component sizes itself from `useColumnWidth()`, not the window: at compact the two
// are the same number, at regular the column is what its content actually sits in (the
// root layout centres it). `guards/windowWidth.test.ts` keeps width reads in this file.

export type WidthClass = 'compact' | 'regular';

export interface LayoutClass {
  width: WidthClass;
  /** Below `layoutShortMaxHeight`: the SE, the folded Duo, the unfolded Duo on its side. */
  short: boolean;
}

export interface ColumnGeometry {
  /** The width screen content sits in. */
  width: number;
  /** Each side's gap between the column and the window edge: 0 at compact. */
  gutter: number;
}

export function layoutClassFor(windowWidth: number, windowHeight: number): LayoutClass {
  return {
    width: windowWidth >= theme.layoutRegularMinWidth ? 'regular' : 'compact',
    short: windowHeight < theme.layoutShortMaxHeight,
  };
}

/**
 * The tab bar's rail at regular (CUL-2242): on the unfolded Duo the bar stands down the
 * right edge under the status bar, as Apple's own bars do from the iOS 27.1 SDK, with the
 * + at its foot. Wide enough for the widest fixed label and the pet's name at the ladder's
 * top rung; the safe area's right inset is added on top, so the tabs clear the status bar.
 */
export const TAB_RAIL_WIDTH = theme.space6 + theme.space2;

export function columnFor(windowWidth: number, safeRight = 0): ColumnGeometry {
  // Compact is the window, by construction, so no phone moves a point.
  if (windowWidth < theme.layoutRegularMinWidth) return { width: windowWidth, gutter: 0 };
  // At regular the column fits beside the tab rail, so a tab's content is never wider
  // than the scene it sits in. Every route shares the one width, so a push from a tab
  // keeps its content's width and only re-centres it in the window.
  const width = Math.min(windowWidth - TAB_RAIL_WIDTH - safeRight, theme.layoutColumnMaxWidth);
  return { width, gutter: (windowWidth - width) / 2 };
}

export interface TabRailGeometry {
  /** The rail's width, the right safe-area inset included. */
  width: number;
  /** The right safe-area inset the rail pads itself by. */
  safeRight: number;
  /** Each side's padding that centres the column in the scene beside the rail. */
  sceneInset: number;
}

/** Null at compact, where the bar is the phone's bottom row. */
export function tabRailFor(windowWidth: number, safeRight = 0): TabRailGeometry | null {
  if (windowWidth < theme.layoutRegularMinWidth) return null;
  const width = TAB_RAIL_WIDTH + safeRight;
  return { width, safeRight, sceneInset: (windowWidth - width - columnFor(windowWidth, safeRight).width) / 2 };
}

// The insets context, not the hook: the hook throws without a provider, and a component
// test renders most of these without one (on device expo-router's root always provides it).
// A suite that mocks the library away leaves no context at all, so a stand-in keeps the
// read unconditional.
const NO_INSETS = createContext<{ right: number; bottom: number } | null>(null);

function useSafeRight(): number {
  return useContext(SafeAreaInsetsContext ?? NO_INSETS)?.right ?? 0;
}

/** The safe area's bottom inset, provider-safe for the same reason as the right one. */
export function useSafeBottom(): number {
  return useContext(SafeAreaInsetsContext ?? NO_INSETS)?.bottom ?? 0;
}

export function useTabRail(): TabRailGeometry | null {
  return tabRailFor(useWindowDimensions().width, useSafeRight());
}

export interface CanvasGeometry {
  /** The width a screen with its own regular layout lays its columns across. */
  width: number;
  /** How far, each side, that screen steps out of the root column to reach it. */
  bleed: number;
}

/**
 * The canvas for a screen that lays two columns across the regular window rather than
 * sitting in the column (CUL-2239: Home). It is the scene beside the tab rail, capped, and
 * it exists only where two phone-width columns fit in it: the unfolded Duo on its side,
 * not upright, where the scene beside the rail is the column itself. Null otherwise, so
 * the screen keeps the one column. The bleed is measured from the column it sits in.
 */
export function canvasFor(windowWidth: number, safeRight = 0): CanvasGeometry | null {
  const rail = tabRailFor(windowWidth, safeRight);
  if (!rail) return null;
  const width = Math.min(windowWidth - rail.width, theme.layoutCanvasMaxWidth);
  if (width < theme.layoutSplitMinWidth) return null;
  return { width, bleed: (width - columnFor(windowWidth, safeRight).width) / 2 };
}

export function useCanvas(): CanvasGeometry | null {
  return canvasFor(useWindowDimensions().width, useSafeRight());
}

/**
 * Chrome whose background reaches the window edge while its content stays in the column:
 * out by the gutter, back in by the gutter plus the chrome's own side padding. Null at
 * compact, so a phone's style is exactly what it was.
 */
export function bleedFor(gutter: number, paddingX = 0): ViewStyle | null {
  return gutter > 0 ? { marginHorizontal: -gutter, paddingHorizontal: paddingX + gutter } : null;
}

/**
 * A sheet's panel, held to the column (CUL-2243). A `<Modal>` presents in its own window,
 * outside the root column, so at regular a bottom sheet would span the whole canvas. Its
 * panel steps in from each side by the gutter, so it sits centred over the column's width
 * whatever its shape: a stretched flex child narrows to the column, and an absolute panel
 * (`left`/`right` insets) moves in by the same amount, since a margin adds to its offsets.
 * `marginX` is the panel's own side margin, kept inside the column. Null at compact, so a
 * phone's sheet is exactly what it was; width only, the panel's height is its own.
 */
export function sheetCapFor(gutter: number, marginX = 0): ViewStyle | null {
  return gutter > 0 ? { marginHorizontal: marginX + gutter } : null;
}

export function useSheetCap(marginX = 0): ViewStyle | null {
  return sheetCapFor(useColumn().gutter, marginX);
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
  return columnFor(useWindowDimensions().width, useSafeRight());
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
