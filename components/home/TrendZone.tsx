import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { theme } from '../../constants/theme';
import { Card } from '../ui/Card';
import { SectionLabel } from '../ui/SectionLabel';
import { ThemedText } from '../ui/ThemedText';
import { useTrend, TrendData } from '../../hooks/useTrend';
import { usePetStore } from '../../store/petStore';
import { EVENT_TYPES, EventTypeKey } from '../../constants/eventTypes';

const MAX_BAR_HEIGHT = 72;

export function TrendZone() {
  const { activePet } = usePetStore();
  const { data, isLoading } = useTrend();
  const petName = activePet?.name ?? 'your pet';

  return (
    <Card>
      {/* §8 doorway — the Trend zone opens the full Patterns dashboard. */}
      <View style={styles.headerRow}>
        <SectionLabel label="Trend" header />
        <Pressable
          onPress={() => router.push('/insights')}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="See all patterns"
        >
          <ThemedText style={styles.allPatternsText}>All patterns ›</ThemedText>
        </Pressable>
      </View>
      {isLoading || data === null ? (
        <LoadingState />
      ) : !data.hasEnoughData ? (
        <EmptyState petName={petName} />
      ) : data.mode === 'symptom' ? (
        <SymptomChart data={data} />
      ) : (
        <FeedingChart data={data} petName={petName} />
      )}
    </Card>
  );
}

function LoadingState() {
  return (
    <View style={styles.chartPlaceholder}>
      <View style={[styles.skeletonBar, { height: 40, width: '100%' }]} />
    </View>
  );
}

function EmptyState({ petName }: { petName: string }) {
  return (
    <ThemedText style={styles.emptyText}>
      A few more days of logs and we'll be able to show {petName}'s pattern.
    </ThemedText>
  );
}

// 14-day symptom frequency bar chart (View-based, no native chart library)
function SymptomChart({ data }: { data: TrendData }) {
  const maxCount = Math.max(...data.buckets.map(b => b.symptomCount), 1);
  const today = data.buckets[data.buckets.length - 1];
  const fourteenDaysAgo = data.buckets[0];

  const { dominantSymptomType, thisWeekSymptomCount } = data;
  const symptomLabel = dominantSymptomType && dominantSymptomType in EVENT_TYPES
    ? EVENT_TYPES[dominantSymptomType as EventTypeKey].label
    : 'Symptom';
  const episodeNoun = thisWeekSymptomCount === 1 ? 'episode' : 'episodes';

  // B-067/CUL-372 — the week-over-week VERDICT is deliberately gone from this card.
  //
  // It used to render "↓ from 4 last week — improving" in the accent teal. That
  // sentence is a comparative claim about a symptom, and the Signal's reflection
  // layer (③) is the only surface that carries the gates such a claim needs: the
  // global worsening gate (④), the global chronicity gate (⑦), and the SR-4
  // density-comparability gate. This card had none of them, so it kept saying
  // "improving" on precisely the pets ③ had gone silent over — a cat vomiting for
  // six weeks, or a week that only LOOKS quieter because it was logged less. An
  // ungated duplicate of a gated claim is not a duplicate; it is a bypass.
  //
  // What is left is the half the Signal genuinely cannot draw: the 14-day SHAPE,
  // and a bare current count in the same unit ③ uses. A bare count asserts nothing
  // about direction, which is exactly what `templateReflection` falls back to when
  // its own density gate fires — the same rule, now applied on both surfaces.
  //
  // The comparison is NOT re-homed here in a softer form. Anything that reads as a
  // direction re-opens the bypass; the sentence belongs to the gated card above.
  return (
    <View>
      <View style={styles.chartHeadRow}>
        <ThemedText style={styles.chartHeadType}>{symptomLabel}</ThemedText>
        {/* No count line at zero. "0 episodes this week" is reassurance-by-absence —
            the same claim the Signal's ③ refuses to make, with the word "improving"
            removed — so when nothing was logged this week the empty right-hand half of
            the chart is left to be the only statement. */}
        {thisWeekSymptomCount > 0 && (
          <ThemedText style={styles.chartHeadCount}>
            {thisWeekSymptomCount} {episodeNoun} this week
          </ThemedText>
        )}
      </View>
      <View style={[styles.barsContainer, styles.barsContainerTopGap]}>
        {data.buckets.map((bucket, i) => {
          const barH = bucket.symptomCount > 0
            ? Math.max(4, Math.round((bucket.symptomCount / maxCount) * MAX_BAR_HEIGHT))
            : 0;
          const isTrialStart = data.trialStartDayKey === bucket.date;
          return (
            <View key={i} style={styles.barColumn}>
              {/* B-417 §8 — the trial-start marker. A trial no longer REPLACES
                  this chart; it annotates it, so the owner can see the symptom
                  line against the day the diet changed. A rule, not a second
                  series: the chart still plots one thing. */}
              {isTrialStart && <View style={styles.trialMarker} testID="trial-start-marker" />}
              <View
                style={[
                  styles.bar,
                  {
                    height: barH > 0 ? barH : MAX_BAR_HEIGHT,
                    backgroundColor: barH > 0 ? theme.colorEventSymptom : theme.colorChartEmpty,
                    opacity: barH > 0 ? 1 : 0.35,
                  },
                ]}
              />
            </View>
          );
        })}
      </View>
      <View style={styles.axisRow}>
        <ThemedText style={styles.axisLabel}>{formatShortDate(fourteenDaysAgo.date)}</ThemedText>
        <ThemedText style={styles.axisLabel}>Today</ThemedText>
      </View>
      {data.trialStartDayKey !== null && (
        // Named in words as well as drawn — the marker is a thin rule, so on its
        // own it carries meaning by position and colour only.
        <ThemedText style={styles.trialMarkerLabel}>
          Trial diet started {formatShortDate(data.trialStartDayKey)}
        </ThemedText>
      )}
    </View>
  );
}

// 7-day food-logging consistency dot chart (filled = food logged, empty = none).
// Counts all food events (event_type='meal' fires for meals AND treats), so the
// owner-facing label is "Food", not "Meals" (B-242).
function FeedingChart({ data, petName }: { data: TrendData; petName: string }) {
  const last7 = data.buckets.slice(-7);
  const { thisWeekMealDays, lastWeekMealDays } = data;

  const directionLine = (() => {
    if (thisWeekMealDays === 7) return `Every day this week`;
    const delta = thisWeekMealDays - lastWeekMealDays;
    if (lastWeekMealDays === 0) return `${thisWeekMealDays} of 7 days logged`;
    if (delta > 0) return `↑ from ${lastWeekMealDays} days last week`;
    if (delta < 0) return `↓ from ${lastWeekMealDays} days last week`;
    return `Same as last week`;
  })();

  return (
    <View>
      <View style={styles.chartHeadRow}>
        <ThemedText style={styles.chartHeadType}>Food</ThemedText>
        <ThemedText style={styles.chartHeadCount}>
          {thisWeekMealDays} of 7 days
        </ThemedText>
      </View>
      <ThemedText style={[styles.chartSubLabel, thisWeekMealDays === 7 && styles.chartSubLabelImproving]}>
        {directionLine}
      </ThemedText>
      <View style={styles.dotsRow}>
        {last7.map((bucket, i) => (
          <View
            key={i}
            style={[
              styles.mealDot,
              bucket.mealCount > 0
                ? styles.mealDotFilled
                : styles.mealDotEmpty,
            ]}
          />
        ))}
      </View>
      <View style={styles.axisRow}>
        <ThemedText style={styles.axisLabel}>{formatShortDate(last7[0].date)}</ThemedText>
        <ThemedText style={styles.axisLabel}>Today</ThemedText>
      </View>
    </View>
  );
}

// B-417 PR 4 — `ComplianceChart` is DELETED, not moved. It rendered a second,
// unlisted "% compliance" (§1.1) computed with the same unfiltered defect as the
// profile card's, and `TrendZone` tested for it BEFORE symptom mode — so starting
// a diet trial replaced this pet's symptom chart with a compliance bar. §8's
// ruling is additive: the symptom chart stays and gains a trial-start marker
// (below), because the symptom is why the trial exists and Principle 3 says
// concern leads. The trial's own numbers live on the Home strip and the Pet-tab
// card, where they render as two separate facts instead of one blended score.

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.space2,
  },
  allPatternsText: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorAccent,
    // Padding + the hitSlop={8} on the Pressable clear the 44pt tap-target floor.
    paddingVertical: theme.space1,
  },
  chartHeadRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  chartHeadType: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  chartHeadCount: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  chartSubLabel: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    marginBottom: theme.space2,
  },
  chartSubLabelImproving: {
    color: theme.colorAccent,
  },
  emptyText: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightBody,
  },
  chartPlaceholder: {
    height: MAX_BAR_HEIGHT + 24,
    justifyContent: 'flex-end',
  },

  // Symptom bar chart
  barsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: MAX_BAR_HEIGHT,
    gap: 2,
  },
  // Replaces the space the removed direction line used to occupy (B-067/CUL-372),
  // so dropping the verdict doesn't collapse the head onto the bars.
  barsContainerTopGap: {
    marginTop: theme.space2,
  },
  barColumn: {
    flex: 1,
    height: MAX_BAR_HEIGHT,
    justifyContent: 'flex-end',
  },
  bar: {
    borderRadius: 2,
    width: '100%',
  },
  axisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  axisLabel: {
    fontSize: theme.textXS,
    color: theme.colorTextSecondary,
  },

  // Feeding consistency dots
  dotsRow: {
    flexDirection: 'row',
    gap: theme.space1,
    marginBottom: 6,
  },
  mealDot: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 100,
    maxWidth: 32,
    maxHeight: 32,
  },
  mealDotFilled: {
    backgroundColor: theme.colorAccent,
  },
  mealDotEmpty: {
    backgroundColor: theme.colorChartEmpty,
  },

  // Diet-trial start marker (B-417 §8). A thin accent rule behind the column,
  // never a second bar — the chart plots symptoms, and the trial is context.
  trialMarker: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '50%',
    width: 1,
    backgroundColor: theme.colorAccent,
    opacity: 0.6,
  },
  trialMarkerLabel: {
    fontSize: theme.textXS,
    color: theme.colorAccent,
    marginTop: 2,
  },

  // Loading skeleton
  skeletonBar: {
    borderRadius: theme.radiusSmall,
    backgroundColor: theme.colorChartEmpty,
  },
});
