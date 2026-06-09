import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../constants/theme';
import { ActiveArrangementView, formatCalendarDate } from '../../lib/feedingArrangements';

// B-040 R1 §6a — the persistent ambient strip pinned to the top of History.
// A free-fed bowl has no events, so it would otherwise go out of sight / out of
// mind; this strip keeps it visible every time the tab opens. It is rendered as
// standing CONTEXT, visibly not an event: quiet treatment, no timestamp, no tap /
// edit affordance (managing it lives in the food domain — library + food detail).
export function FreeFeedingStrip({ arrangements }: { arrangements: ActiveArrangementView[] }) {
  if (arrangements.length === 0) return null;
  return (
    <View style={styles.strip}>
      <Text style={styles.label}>Always available</Text>
      <View style={styles.items}>
        {arrangements.map((a) => {
          const since = formatCalendarDate(a.active_from);
          return (
            <View key={a.id} style={styles.itemRow}>
              <View style={styles.dot} />
              <Text style={styles.itemText} numberOfLines={1}>
                {a.brand} {a.product_name}
                {since ? <Text style={styles.since}>{`  ·  since ${since}`}</Text> : null}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    backgroundColor: theme.colorNeutralLight,
    paddingHorizontal: theme.space3,
    paddingTop: theme.space2,
    paddingBottom: theme.space2,
    borderBottomWidth: 1,
    borderBottomColor: theme.colorBorder,
    gap: 6,
  },
  label: {
    fontSize: theme.textXS,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorTextTertiary,
    letterSpacing: theme.trackingWidest,
    textTransform: 'uppercase',
  },
  items: {
    gap: 4,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: theme.radiusFull,
    backgroundColor: theme.colorAccent,
  },
  itemText: {
    flex: 1,
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },
  since: {
    color: theme.colorTextTertiary,
  },
});
