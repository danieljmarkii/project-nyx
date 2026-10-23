// The door mark (CUL-1525 · G1 A): the one ›, drawn by one component.
//
// Home drew "tap to open" three ways: a bare › on the strips, a › in a round well on
// every Signal row and the trial door, and a › at two sizes in two greys. The ruling is
// one mark: a plain › on every card and row door, and the round well on the Signal
// zone's LEAD row only, where it says "this is the one to open first".
//
// A raw › glyph anywhere else in Home's closure reds `guards/homeCardSurface.test.ts`
// (exemption `// door-mark-ok: <reason>` per site). A › inside a text link's words
// ("Patterns ›") is the link's copy, not this mark, and carries its marker where it is
// written.
//
// The glyph is decoration: the door's own label says where it goes, so the mark is
// hidden from assistive tech (a screen reader would spell it).

import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { theme } from '../../../constants/theme';

/** The well's diameter. The Signal's lead title centres it on its first line. */
export const DOOR_WELL_SIZE = 28;

interface Props {
  /** The round well: the Signal zone's lead row, and nowhere else. */
  well?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function DoorMark({ well = false, style, testID }: Props) {
  return (
    <View
      style={[well ? styles.well : styles.bare, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID ?? (well ? 'door-mark-well' : 'door-mark')}
    >
      {/* geist-ok: Icon glyph, not copy — stays a raw <Text> (the door's chevron). */}
      <Text style={styles.glyph}>›</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bare: {
    width: 22,
    alignItems: 'center',
  },
  well: {
    width: DOOR_WELL_SIZE,
    height: DOOR_WELL_SIZE,
    borderRadius: theme.radiusFull,
    backgroundColor: theme.colorSurfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: {
    fontSize: theme.textLG,
    lineHeight: theme.textLG + 2,
    color: theme.colorTextTertiary,
  },
});
