import { useWindowDimensions, type ViewStyle } from 'react-native';
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

export function columnFor(windowWidth: number): ColumnGeometry {
  // Compact is the window, by construction, so no phone moves a point.
  if (windowWidth < theme.layoutRegularMinWidth) return { width: windowWidth, gutter: 0 };
  const width = Math.min(windowWidth, theme.layoutColumnMaxWidth);
  return { width, gutter: (windowWidth - width) / 2 };
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
  return columnFor(useWindowDimensions().width);
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
