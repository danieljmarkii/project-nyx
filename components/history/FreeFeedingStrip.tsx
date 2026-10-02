import { View, Text, StyleSheet } from 'react-native';
import { ThemedText } from '../ui/ThemedText';
import { theme } from '../../constants/theme';
import { ActiveArrangementView } from '../../lib/feedingArrangements';
import { recordDay } from '../../lib/recordDates';
import { toLocalDayKey } from '../../lib/utils';

// B-040 R1 §6a — the persistent ambient strip pinned to the top of History.
// A free-fed bowl has no events, so it would otherwise go out of sight / out of
// mind; this strip keeps it visible every time the tab opens. It is rendered as
// standing CONTEXT, visibly not an event: quiet treatment, no timestamp, no tap /
// edit affordance (managing it lives in the food domain — library + food detail).
export function FreeFeedingStrip({ arrangements }: { arrangements: ActiveArrangementView[] }) {
  if (arrangements.length === 0) return null;
  // A bowl put down last year reads "since Nov 3, 2025", never a bare date that looks
  // like this autumn (H-10, CUL-1126).
  const today = toLocalDayKey(new Date());
  return (
    <View style={styles.strip}>
      <ThemedText style={styles.label}>Always available</ThemedText>
      <View style={styles.items}>
        {arrangements.map((a) => {
          const since = a.active_from ? recordDay(a.active_from, today) : null;
          return (
            <View key={a.id} style={styles.itemRow}>
              <View style={styles.dot} />
              <ThemedText style={styles.itemText} numberOfLines={1}>
                {a.brand} {a.product_name}
                {/* geist-ok: Deliberately a raw <Text>, not a nested ThemedText (CUL-607). Every
                    ThemedText injects an explicit fontFamily, which breaks RN's native
                    text-style cascade — so a nested one would need its own family
                    spelled out. This span differs from its parent only in COLOUR, so
                    inheriting the parent's resolved Geist face is exactly right. */}
                {since ? <Text style={styles.since}>{`  ·  since ${since}`}</Text> : null}
              </ThemedText>
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
    gap: theme.space1,
  },
  label: {
    fontSize: theme.textXS,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorTextTertiary,
    letterSpacing: theme.trackingWidest,
    textTransform: 'uppercase',
  },
  items: {
    gap: theme.space1,
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
