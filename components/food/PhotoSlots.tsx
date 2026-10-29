import { Image, StyleSheet, View } from 'react-native';
import { Plus } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { useLayoutClass } from '../../hooks/useLayoutClass';
import { squareRowCap } from '../../lib/layoutCaps';
import { ThemedText } from '../ui/ThemedText';

export interface PhotoSlot {
  /** The slot and its need, e.g. "Front · needed", "Barcode · optional". */
  label: string;
  uri: string | null;
}

/**
 * The whole job before the camera opens (CUL-1910, capture design round P1): three photo
 * slots, the front marked needed and the other two optional, so the owner sees it is one
 * photo and not three. A picture of the plan, not three doors: the buttons under it start
 * the capture, because the label photo's consent sheet (CUL-1834) sits before the first
 * picker and a slot tapped out of order would walk around it. So the row is one
 * accessible summary, never three buttons.
 */
export function PhotoSlots({ slots, testID }: { slots: readonly PhotoSlot[]; testID?: string }) {
  // At regular each slot stops at a tile's width and the row centres (CUL-2238): the
  // capture modal presents outside the column, where three slots would split the window.
  const rowCap = squareRowCap(useLayoutClass().width, slots.length, theme.space2, theme.layoutTileMax);
  const summary = slots.map((s) => `${s.label.replace(' · ', ', ')}${s.uri ? ', added' : ''}`).join('; ');
  return (
    <View style={[styles.row, rowCap]} accessible accessibilityLabel={`Photos: ${summary}`} testID={testID}>
      {slots.map((s) => (
        <View key={s.label} style={styles.slot}>
          {s.uri ? (
            <Image source={{ uri: s.uri }} style={styles.thumb} resizeMode="cover" />
          ) : (
            <View style={[styles.thumb, styles.empty]}>
              <Plus size={theme.space3} color={theme.colorTextTertiary} strokeWidth={2} />
            </View>
          )}
          <ThemedText variant="note" style={styles.label}>{s.label}</ThemedText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: theme.space2,
  },
  slot: {
    flex: 1,
    alignItems: 'center',
    gap: theme.space0_75,
  },
  thumb: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: theme.radiusSmall,
    backgroundColor: theme.colorNeutralLight,
  },
  empty: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colorBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: theme.colorTextSecondary,
    textAlign: 'center',
  },
});
