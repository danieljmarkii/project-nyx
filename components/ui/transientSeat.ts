import type { ViewStyle } from 'react-native';
import { usePathname } from 'expo-router';
import { theme } from '../../constants/theme';
import { useColumn, useSafeBottom, useTabRail } from '../../hooks/useLayoutClass';

/**
 * The tab routes, as `usePathname` spells them: one per screen in `app/(tabs)/`, which
 * `transientSeat.test.ts` reads off the folder, so a new tab cannot be missed here.
 */
export const TAB_PATHS: ReadonlySet<string> = new Set(['/', '/history', '/foods', '/profile']);

/**
 * Where the transient bottom surfaces sit at regular width (CUL-2267): the three completion
 * cards and the Snackbar. On a phone each keeps its own shipped berth, clear of the bottom
 * bar and the +, so this returns null and no phone moves a point.
 *
 * At regular there is no bottom bar and the + stands in the rail, so the berth's clearance
 * is for chrome that is not there. The card takes the shape every other bottom-anchored
 * surface uses (`insets.bottom + theme.space2`). Over a tab the scene is the window less the
 * rail, and the root column is centred in the window, so the card moves left by half the
 * rail to centre on the scene and never run over the rail. Over a pushed screen there is no
 * rail, and the card keeps the column's centre.
 *
 * `inColumn`: whether the surface is mounted inside the root `LayoutColumn` (the cards) or
 * over it, in the window (the Snackbar), which must also step in by the gutter.
 */
export function transientSeatFor(args: {
  railWidth: number | null;
  gutter: number;
  safeBottom: number;
  overTab: boolean;
  inColumn: boolean;
}): ViewStyle | null {
  const { railWidth, gutter, safeBottom, overTab, inColumn } = args;
  if (railWidth === null) return null;
  const inset = theme.space2 + (inColumn ? 0 : gutter);
  const shift = overTab ? railWidth / 2 : 0;
  return { bottom: safeBottom + theme.space2, left: inset - shift, right: inset + shift };
}

export function useTransientSeat(inColumn: boolean): ViewStyle | null {
  const rail = useTabRail();
  const { gutter } = useColumn();
  const safeBottom = useSafeBottom();
  const pathname = usePathname();
  return transientSeatFor({
    railWidth: rail?.width ?? null,
    gutter,
    safeBottom,
    overTab: TAB_PATHS.has(pathname),
    inColumn,
  });
}
