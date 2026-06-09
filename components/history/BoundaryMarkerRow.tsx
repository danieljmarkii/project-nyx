import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../constants/theme';
import { BoundaryMarker, formatCalendarDate } from '../../lib/feedingArrangements';

// B-040 R1 §6a — a free-feeding lifecycle boundary on the History timeline
// (Started / Stopped / Switched). Rendered as a QUIET timeline annotation, not an
// EventRow: a leading dot + centered caption, no icon circle, no expand / edit /
// delete. It is a real discrete fact (a window edge), so it belongs in the
// stream — but it is visibly not a loggable event the owner can act on.
export function BoundaryMarkerRow({ marker }: { marker: BoundaryMarker }) {
  return (
    <View style={styles.row}>
      <View style={styles.dot} />
      <Text style={styles.text}>{describe(marker)}</Text>
    </View>
  );
}

function describe(marker: BoundaryMarker): string {
  const when = formatCalendarDate(marker.date);
  const suffix = when ? ` · ${when}` : '';
  switch (marker.kind) {
    case 'started':
      return `Started free-feeding ${marker.foodLabel}${suffix}`;
    case 'stopped':
      return `Stopped free-feeding ${marker.foodLabel}${suffix}`;
    case 'switched':
      // Keep the "from" food — on a clinical timeline the vet needs to see what
      // the switch replaced, not just the new food.
      return `Switched free-feeding from ${marker.foodLabel} to ${marker.toFoodLabel}${suffix}`;
  }
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space1,
    paddingVertical: theme.space2,
    paddingHorizontal: theme.space3,
    backgroundColor: theme.colorNeutralLight,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: theme.radiusFull,
    backgroundColor: theme.colorTextTertiary,
  },
  text: {
    fontSize: theme.textXS,
    color: theme.colorTextSecondary,
    letterSpacing: theme.trackingWide,
  },
});
