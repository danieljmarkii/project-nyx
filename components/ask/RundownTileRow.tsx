import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import type { RundownTile } from '../../lib/rundown';

// One row of the vet-visit rundown (Ask / B-228 PR A6). Label eyebrow → the
// value (the datum the clinician reads) → an optional denominator/window detail
// line → a chevron when the tile taps through to its source. An `empty` tile
// (designed empty state, Principle 5) reads quieter and drops the chevron
// emphasis, but stays tappable toward its forward action. No verdict styling —
// the copy is neutral, so the row is too (no wellness colour).

interface Props {
  tile: RundownTile;
  onPress?: () => void;
  /** Drops the divider on the last row in a card (the mock's :last-child rule). */
  isLast?: boolean;
}

export function RundownTileRow({ tile, onPress, isLast = false }: Props) {
  const tappable = onPress != null && tile.tap != null;
  // ~50pt min tap target (44pt floor + padding) for the 3am-in-a-consult-room owner.
  return (
    <TouchableOpacity
      style={[styles.row, isLast && styles.rowLast]}
      onPress={onPress}
      disabled={!tappable}
      activeOpacity={0.6}
      accessibilityRole={tappable ? 'button' : 'text'}
      accessibilityLabel={`${tile.label}: ${tile.value}${tile.detail ? `, ${tile.detail}` : ''}`}
    >
      <View style={styles.textCol}>
        <Text style={styles.label}>{tile.label}</Text>
        <Text style={[styles.value, tile.empty && styles.valueEmpty]}>{tile.value}</Text>
        {tile.detail ? <Text style={styles.detail}>{tile.detail}</Text> : null}
      </View>
      {tappable ? (
        <ChevronRight size={18} color={theme.colorTextTertiary} style={styles.chev} />
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 50,
    paddingVertical: theme.space2,
    paddingHorizontal: theme.space3,
    borderBottomWidth: 1,
    borderBottomColor: theme.colorBorder,
    gap: theme.space2,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  textCol: {
    flex: 1,
    gap: theme.spaceMicro,
  },
  label: {
    fontFamily: theme.fontBody,
    fontSize: theme.textXS,
    letterSpacing: theme.trackingWidest,
    textTransform: 'uppercase',
    color: theme.colorTextTertiary,
  },
  value: {
    fontFamily: theme.fontBodyMedium,
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  valueEmpty: {
    fontFamily: theme.fontBody,
    fontWeight: theme.weightRegular,
    color: theme.colorTextSecondary,
  },
  detail: {
    fontFamily: theme.fontBody,
    fontSize: theme.textSM,
    color: theme.colorTextTertiary,
  },
  chev: {
    marginLeft: theme.space1,
  },
});
