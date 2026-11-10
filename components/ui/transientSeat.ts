import type { ViewStyle } from 'react-native';
import { theme } from '../../constants/theme';
import { useColumn, useSafeBottom, useTabRail, type Gutters } from '../../hooks/useLayoutClass';

/**
 * Where the transient bottom surfaces sit off a plain phone (CUL-2267, CUL-2703): the
 * three completion cards and the Snackbar. On a phone each keeps its own shipped berth,
 * clear of the bottom bar and the +, so this returns null and no phone moves a point.
 *
 * Where the bar is a rail there is no bottom bar and the + stands in the rail, so the
 * berth's clearance is for chrome that is not there: the card takes the shape every other
 * bottom-anchored surface uses (`insets.bottom + theme.space2`). The column is centred
 * between the window's sides for a tab and a pushed screen alike, and the rail stands in
 * a side, so a card held to the column is clear of the rail with no shift.
 *
 * Where the bar is the bottom row on a wide window (the unfolded Duo upright), the berth
 * stands: it clears a bar that is there.
 *
 * `inColumn`: whether the surface is mounted inside the root's overlay `LayoutColumn` (the
 * cards) or over it, in the window (the Snackbar), which steps in by the gutters itself.
 */
export function transientSeatFor(args: {
  railed: boolean;
  gutters: Gutters;
  safeBottom: number;
  inColumn: boolean;
}): ViewStyle | null {
  const { railed, gutters, safeBottom, inColumn } = args;
  const held = gutters.left > 0 || gutters.right > 0;
  if (!railed && (inColumn || !held)) return null;
  const sides = {
    left: theme.space2 + (inColumn ? 0 : gutters.left),
    right: theme.space2 + (inColumn ? 0 : gutters.right),
  };
  return railed ? { bottom: safeBottom + theme.space2, ...sides } : sides;
}

export function useTransientSeat(inColumn: boolean): ViewStyle | null {
  const rail = useTabRail();
  const { gutters } = useColumn();
  const safeBottom = useSafeBottom();
  return transientSeatFor({ railed: rail !== null, gutters, safeBottom, inColumn });
}
