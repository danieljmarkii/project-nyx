import { useCallback, useState, type ReactElement, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { theme } from '../../constants/theme';
import { useColumn, useWindowFrame } from '../../hooks/useLayoutClass';

/**
 * The app's content column (CUL-2237), held INSIDE each screen (CUL-2703).
 *
 * It was one column around the whole stack, and that is the defect the first Duo device
 * check found: a native stack screen clips to its own bounds, so a screen sized to the
 * column could never draw past it. The tabs stepped back out with a negative margin and
 * were cut to a 560pt band, the + with them. So the navigators fill the window, and each
 * screen wraps its own content here (`screenInColumn`, the stacks' `screenLayout`): the
 * screen is the window, the column sits in it, and chrome that must reach the window edge
 * (Home's header, the Landing's night) bleeds out by `useColumn().gutters` and is no
 * longer clipped.
 *
 * On a phone held upright both gutters are 0 and both Views are transparent and unstyled
 * beyond `flex: 1`, so whatever showed behind a screen still does and no phone moves a
 * pixel. Where a side is held (a wide window, or the strip iOS keeps for its bars), the
 * column steps in from each side by that side's gutter and the gutters show the ground.
 *
 * A HOST NARROWER THAN THE WINDOW is a card the platform centred (a modal route on the
 * unfolded Duo). It is clear of the window's sides, so the window's gutters are not its
 * own: the column is capped and centred in the card instead. The host's width arrives by
 * `onLayout`, which is the card's own measure, never a window read.
 *
 * `overlay`: the same column, drawn over the stack and transparent to touch, for the
 * root's sheet hosts and completion cards, which sit in the column over every screen.
 */
export function LayoutColumn({ children, overlay = false }: { children: ReactNode; overlay?: boolean }) {
  const { gutters } = useColumn();
  const windowWidth = useWindowFrame().width;
  const [hostWidth, setHostWidth] = useState<number | null>(null);
  const onHostLayout = useCallback((e: LayoutChangeEvent) => setHostWidth(e.nativeEvent.layout.width), []);

  const held = gutters.left > 0 || gutters.right > 0;
  // Unmeasured reads as the window: the first frame of a full-screen route is right, and
  // a centred card corrects itself on its first layout.
  const spansWindow = hostWidth === null || hostWidth >= windowWidth - 1;
  const column = !held
    ? null
    : spansWindow
      ? { marginLeft: gutters.left, marginRight: gutters.right }
      : styles.inCard;

  if (overlay) {
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <View style={[styles.fill, held && { marginLeft: gutters.left, marginRight: gutters.right }]} pointerEvents="box-none">
          {children}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.fill, held && styles.ground]} onLayout={held ? onHostLayout : undefined}>
      <View style={[styles.fill, column]}>{children}</View>
    </View>
  );
}

/**
 * A stack's `screenLayout`: every screen of that navigator sits in the column. A layout
 * that owns a navigator passes this, so its screens are held inside themselves and none is
 * clipped by a column around the navigator.
 */
export function screenInColumn({ children }: { children: ReactElement }): ReactElement {
  return <LayoutColumn>{children}</LayoutColumn>;
}

/**
 * The root stack's routes that own a navigator of their own, as `app/` names them. Each
 * holds its screens itself: the two stacks pass `screenInColumn`, and the tabs pad each
 * scene and stand their bar at the window's edge. Wrapping one here would put a column
 * around a navigator again, which is the clip this file exists to end.
 * `LayoutColumn.test.tsx` reads `app/` for every folder with a `_layout`, so a new group
 * cannot be missed.
 */
export const SELF_HELD_ROUTES: ReadonlySet<string> = new Set(['(auth)', '(tabs)', 'onboarding']);

/** The root stack's `screenLayout`: every leaf route in the column, a group left to itself. */
export function heldScreenLayout({ children, route }: { children: ReactElement; route: { name: string } }): ReactElement {
  return SELF_HELD_ROUTES.has(route.name) ? children : <LayoutColumn>{children}</LayoutColumn>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  ground: { backgroundColor: theme.colorNeutralLight },
  inCard: { width: '100%', maxWidth: theme.layoutColumnMaxWidth, alignSelf: 'center' },
});
