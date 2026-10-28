import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { theme } from '../../constants/theme';
import { useColumn } from '../../hooks/useLayoutClass';

/**
 * The app's content column (CUL-2237). It wraps the whole stack at the root, so every
 * route sits in it without a per-screen change. At compact the column IS the window
 * (gutter 0, no max width): the tree is the same at every size, so a fold never remounts
 * the navigator, and no phone moves a pixel.
 *
 * At compact both Views are transparent and unstyled beyond `flex: 1`, so whatever showed
 * behind the stack on main (a modal's presentation, a push's gap) still does. At regular
 * the column is centred, and the gutters show the app's ground. Chrome that
 * must still reach the window edge (the tab bar, Home's header, the Landing's night)
 * bleeds out by `useColumn().gutter` on its own, keeping its content in the column.
 */
export function LayoutColumn({ children }: { children: ReactNode }) {
  const { width, gutter } = useColumn();
  return (
    <View style={[styles.fill, gutter > 0 && styles.ground]}>
      <View style={[styles.fill, gutter > 0 && styles.column, gutter > 0 && { width }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  ground: { backgroundColor: theme.colorNeutralLight },
  column: { alignSelf: 'center' },
});
