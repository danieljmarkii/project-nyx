// Home's one card surface (CUL-1525 · G1 A, ruled 2026-10-03 on the CUL-1519 mock; the
// round 2 page's §01 is the target frame, `docs/culprit-home-one-language-mockups.html`).
//
// Every card on Home sits on this: the Signal zone, the trial door, Today, the coverage
// door and the appointment strip. One soft shadow and no border, one inset, one corner.
// Before it, the Signal floated on `Card elevated` while every other card wore
// `Card`'s outline, so Home spoke two surfaces. `components/ui/Card`'s default is never
// changed for this: other screens keep their outline, and Home stops reaching for it
// (`guards/homeCardSurface.test.ts` reds on Home's closure importing it).
//
// THE GUTTER. A rail is not a column of the row any more: it hangs in the card's left
// inset (`GUTTER_RAIL`), so every card's text starts at the one edge the inset sets, with
// or without a rail. A row positions its rail with `GUTTER_RAIL` plus its own top and
// bottom (the row's vertical padding, so the rail spans the text, not the hairline).

import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { shadows, theme } from '../../../constants/theme';
import { RAIL_WIDTH } from '../../home/InsightCard';

/** The card's inset on every side: the one text edge on Home. */
export const HOME_CARD_INSET = theme.space2;

/** How far left of the text edge a rail's left side sits. The rail's right side is a
 *  `space1` clear of the text, and its left side is `HOME_CARD_INSET - RAIL_GUTTER` clear
 *  of the card's edge, so it reads as the row's mark and not as the card's border. */
export const RAIL_GUTTER = theme.space1 + RAIL_WIDTH;

/** A rail hung in the gutter. The row supplies `top` / `bottom` (and its colour). */
export const GUTTER_RAIL = {
  position: 'absolute',
  left: -RAIL_GUTTER,
  width: RAIL_WIDTH,
  borderRadius: 2,
} as const satisfies ViewStyle;

/** The zone label's one spacing ("Signal", "Today"): the mock's 4pt under the label on
 *  every card. Its tone is the zone's own register (SR-3 §5.2 recedes the Signal's). */
export const ZONE_LABEL_SPACING = { marginBottom: theme.space0_5 } as const satisfies ViewStyle;

interface Props {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** For a card that is itself one door: the Pressable inside takes the inset. */
  noPadding?: boolean;
  /** CUL-170 / C-22: measure the card itself, never a wrapper View. */
  onLayout?: (event: LayoutChangeEvent) => void;
  testID?: string;
}

export function HomeCard({ children, style, noPadding = false, onLayout, testID }: Props) {
  return (
    <View onLayout={onLayout} testID={testID} style={[styles.card, noPadding && styles.noPadding, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colorSurface,
    borderRadius: theme.radiusMedium,
    padding: HOME_CARD_INSET,
    ...shadows.card,
  },
  noPadding: {
    padding: 0,
  },
});
