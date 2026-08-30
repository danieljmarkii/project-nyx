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
  const label = `${tile.label}: ${tile.value}${tile.detail ? `, ${tile.detail}` : ''}`;
  // The text is the same in both hosts; only the chevron and the host differ, so
  // it lives here rather than being written twice and drifting.
  const text = (
    <View style={styles.textCol}>
      <Text style={styles.label}>{tile.label}</Text>
      <Text style={[styles.value, tile.empty && styles.valueEmpty]}>{tile.value}</Text>
      {tile.detail ? <Text style={styles.detail}>{tile.detail}</Text> : null}
    </View>
  );

  // ── ONE ROW, TWO HOSTS (CUL-728) ───────────────────────────────────────────
  //
  // It used to be one TouchableOpacity carrying `disabled={!tappable}` next to
  // `accessibilityRole={tappable ? 'button' : 'text'}`. The role switch says the
  // intent outright — when it does not tap, it is text — and `disabled`
  // contradicted it on the same element: RN copies `disabled` into
  // `accessibilityState.disabled` (TouchableOpacity.js) and iOS maps that to
  // UIAccessibilityTraitNotEnabled, which VoiceOver speaks as "dimmed". So a
  // plain data row announced "…, text, dimmed" — a control that is unavailable —
  // on the surface whose whole job is being read aloud in a consult room.
  //
  // `disabled` is a claim (this control exists, and is off right now), not a way
  // to make a row inert. Where the control does not exist for that state, the
  // inert branch is a plain View — no responder, no trait, nothing to dim.
  //
  // `accessible` is load-bearing on that View. The row is two or three separate
  // Text nodes that only ever merged into one announcement because a touchable
  // is `accessible` by default; without it here the label goes inert and the
  // eyebrow, the value and the detail become three unrelated stops.
  if (!tappable) {
    return (
      <View
        style={[styles.row, isLast && styles.rowLast]}
        accessible
        accessibilityRole="text"
        accessibilityLabel={label}
      >
        {text}
      </View>
    );
  }

  // ~50pt min tap target (44pt floor + padding) for the 3am-in-a-consult-room owner.
  return (
    <TouchableOpacity
      style={[styles.row, isLast && styles.rowLast]}
      onPress={onPress}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {text}
      <ChevronRight size={18} color={theme.colorTextTertiary} style={styles.chev} />
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
