import { Pressable, View, Text, StyleSheet } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { theme, shadows } from '../../constants/theme';
import { pluralize } from '../../lib/dashboardCards';
import type { MealTreatComposition } from '../../lib/analytics';

// CompositionCard — the month's split of logged meals vs treats (§5 #6 / §6), as a
// single proportion bar + counts. DESCRIPTIVE ONLY: what was logged, never a verdict
// on the owner's feeding choices (§11 #1). (A genuine treats-only stretch is surfaced as
// the meal-type-collapse COVERAGE signal on Home, framed as coverage and never as blame
// — that is the Signal's job, not this card's.)
//
// Palette (B-098): the old black→grey→pale-grey ramp read clinical/judgy. The fill is
// now ONE calm brand hue at two intensities — the app's food/meal teal for meals, a soft
// teal for treats — so the two read as "both food, just different kinds," never as a
// cross-hue good/bad signal (no warning red/amber). Encoding category by intensity within
// one hue carries NO verdict (meals are not "the healthy colour"; treats are not a
// warning); it simply mirrors that meals are the dietary staple and treats supplement it.
// "Other" stays a quiet neutral — it is a literal catch-all, not a judgment.
const SEGMENT_COLOR = {
  meal: theme.colorEventMeal,
  treat: theme.colorAccentSoft,
  other: theme.colorBorderStrong,
} as const;

interface Props {
  composition: MealTreatComposition;
  title?: string;
  emptyMessage?: string;
  onPress?: () => void;
  accessibilityHint?: string;
}

interface Segment {
  key: 'meal' | 'treat' | 'other';
  label: string;
  count: number;
}

function pct(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}

export function CompositionCard({
  composition,
  title = 'Meals & treats',
  emptyMessage,
  onPress,
  accessibilityHint,
}: Props) {
  const { meal, treat, total } = composition;
  // Fold the rarely-populated 'other' + legacy-unclassified rows into one quiet
  // "other" segment so the card stays a clean two-to-three part split.
  const other = composition.other + composition.unclassified;
  const isEmpty = total === 0;

  const segments: Segment[] = [
    { key: 'meal', label: 'Meals', count: meal },
    { key: 'treat', label: 'Treats', count: treat },
    { key: 'other', label: 'Other', count: other },
  ].filter((s) => s.count > 0) as Segment[];

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole={onPress != null ? 'button' : undefined}
      accessibilityLabel={title}
      accessibilityHint={onPress != null ? accessibilityHint ?? 'Opens the full breakdown' : undefined}
      style={({ pressed }) => [styles.card, pressed && onPress != null && styles.pressed]}
    >
      <View style={styles.headerRow}>
        <Text style={styles.title}>{title}</Text>
        {onPress != null && <ChevronRight size={18} color={theme.colorTextDisabled} />}
      </View>

      {isEmpty ? (
        <Text style={styles.stateText}>
          {emptyMessage ?? "No meals or treats logged yet — they'll show up here as you log."}
        </Text>
      ) : (
        <View style={styles.body}>
          {/* Soft, separated capsules on a faint track (B-098) — reads as a calm
              proportion, not a hard-sliced clinical bar. */}
          <View style={styles.bar}>
            {segments.map((s) => (
              <View
                key={s.key}
                testID={`composition-seg-${s.key}`}
                style={[styles.segment, { flex: s.count, backgroundColor: SEGMENT_COLOR[s.key] }]}
              />
            ))}
          </View>
          {/* Coverage framing: anchor the bar as "here's what was logged", never a verdict. */}
          <Text style={styles.caption}>
            {total} {pluralize(total, 'feeding')} logged
          </Text>
          <View style={styles.legend}>
            {segments.map((s) => (
              <View key={s.key} style={styles.legendRow}>
                <View style={[styles.swatch, { backgroundColor: SEGMENT_COLOR[s.key] }]} />
                <Text style={styles.legendLabel}>{s.label}</Text>
                <Text style={styles.legendValue}>
                  {s.count} {pluralize(s.count, 'log')} · {pct(s.count, total)}%
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colorSurface,
    borderRadius: theme.radiusMedium,
    padding: theme.space3,
    minHeight: 44,
    gap: theme.space2,
    ...shadows.md,
  },
  pressed: {
    backgroundColor: theme.colorSurfaceSubtle,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
    flexShrink: 1,
  },
  body: {
    gap: theme.space2,
  },
  bar: {
    flexDirection: 'row',
    height: 14,
    // Capsule ends + a small gap between segments so they read as soft separated pills
    // on a faint track, not a hard-divided clinical bar.
    gap: 3,
    borderRadius: theme.radiusFull,
    backgroundColor: theme.colorChartEmpty,
  },
  segment: {
    height: '100%',
    borderRadius: theme.radiusFull,
    // A tiny share (one treat in a hundred) still reads as a visible pill — don't hide
    // that treats happened (coverage honesty), at a negligible cost to the proportion.
    minWidth: 6,
  },
  caption: {
    fontSize: theme.textSM,
    color: theme.colorTextTertiary,
  },
  legend: {
    gap: theme.space1,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: theme.radiusFull,
  },
  legendLabel: {
    flex: 1,
    fontSize: theme.textSM,
    color: theme.colorTextPrimary,
  },
  legendValue: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },
  stateText: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    lineHeight: 22,
  },
});
