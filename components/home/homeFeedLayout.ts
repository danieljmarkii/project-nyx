import { StyleSheet, type ViewStyle } from 'react-native';
import { theme } from '../../constants/theme';
import { HOME_V2_SCROLL_INSET } from '../../lib/fabFootprint';
import type { CanvasGeometry } from '../../hooks/useLayoutClass';

// Home's feed geometry (`app/(tabs)/index.tsx`): the scroll's padding, and how far the body
// steps out of the column where Home lays out across the canvas (CUL-2239). It lives here,
// not in the route file, so the header's alignment test measures the feed's edge from the
// numbers Home lays out with rather than re-deriving them (CUL-2279).

export const homeFeedStyles = StyleSheet.create({
  // D2-4 — paddingBottom is the page's inset, written once in lib/fabFootprint.ts and
  // asserted ≥ the FAB's floor there (C-5). The last row's control is left-aligned for
  // the other half.
  scroll: { padding: theme.space3, gap: theme.space3, paddingBottom: HOME_V2_SCROLL_INSET },
});

/** The body's step out of the root column to the canvas; null where Home keeps the column. */
export function homeFeedBleed(canvas: CanvasGeometry | null): ViewStyle | null {
  return canvas ? { marginHorizontal: -canvas.bleed } : null;
}
