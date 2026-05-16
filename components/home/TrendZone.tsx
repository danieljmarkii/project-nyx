import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../../constants/theme';
import { Card } from '../ui/Card';
import { SectionLabel } from '../ui/SectionLabel';
import { useTrend, TrendData } from '../../hooks/useTrend';
import { usePetStore } from '../../store/petStore';

const MAX_BAR_HEIGHT = 72;

export function TrendZone() {
  const { activePet } = usePetStore();
  const { data, isLoading } = useTrend();
  const petName = activePet?.name ?? 'your pet';

  return (
    <Card>
      <SectionLabel label="Trend" style={styles.label} />
      {isLoading || data === null ? (
        <LoadingState />
      ) : !data.hasEnoughData ? (
        <EmptyState petName={petName} />
      ) : data.mode === 'compliance' ? (
        <ComplianceChart data={data} />
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
    <Text style={styles.emptyText}>
      A few more days of logs and we'll be able to show {petName}'s pattern.
    </Text>
  );
}

// 14-day symptom frequency bar chart (View-based, no native chart library)
function SymptomChart({ data }: { data: TrendData }) {
  const maxCount = Math.max(...data.buckets.map(b => b.symptomCount), 1);
  const today = data.buckets[data.buckets.length - 1];
  const fourteenDaysAgo = data.buckets[0];

  const totalSymptoms = data.buckets.reduce((sum, b) => sum + b.symptomCount, 0);
  const chartLabel = `${totalSymptoms} symptom event${totalSymptoms !== 1 ? 's' : ''} over 14 days`;

  return (
    <View>
      <Text style={styles.chartSubLabel}>{chartLabel}</Text>
      <View style={styles.barsContainer}>
        {data.buckets.map((bucket, i) => {
          const barH = bucket.symptomCount > 0
            ? Math.max(4, Math.round((bucket.symptomCount / maxCount) * MAX_BAR_HEIGHT))
            : 0;
          return (
            <View key={i} style={styles.barColumn}>
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
        <Text style={styles.axisLabel}>{formatShortDate(fourteenDaysAgo.date)}</Text>
        <Text style={styles.axisLabel}>{formatShortDate(today.date)}</Text>
      </View>
    </View>
  );
}

// 14-day meal consistency dot chart (filled = meal logged, empty = no meal)
function FeedingChart({ data, petName }: { data: TrendData; petName: string }) {
  const last7 = data.buckets.slice(-7);
  const consistentDays = last7.filter(b => b.mealCount > 0).length;

  return (
    <View>
      <Text style={styles.chartSubLabel}>
        {consistentDays} of 7 days with meals logged
      </Text>
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
        <Text style={styles.axisLabel}>{formatShortDate(last7[0].date)}</Text>
        <Text style={styles.axisLabel}>Today</Text>
      </View>
    </View>
  );
}

// Diet trial compliance: progress bar + summary line
function ComplianceChart({ data }: { data: TrendData }) {
  const { trialDaysElapsed, trialTargetDays, trialCompliantDays } = data;
  const progressPct = trialTargetDays > 0
    ? Math.min(1, trialDaysElapsed / trialTargetDays)
    : 0;
  const compliancePct = trialDaysElapsed > 0
    ? Math.round((trialCompliantDays / trialDaysElapsed) * 100)
    : 0;

  return (
    <View>
      <Text style={styles.chartSubLabel}>
        Day {trialDaysElapsed} of {trialTargetDays} — {trialCompliantDays} of {trialDaysElapsed} days logged
      </Text>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { flex: progressPct }]} />
        <View style={{ flex: 1 - progressPct }} />
      </View>
      <Text style={styles.complianceNote}>{compliancePct}% meal compliance</Text>
    </View>
  );
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  label: {
    marginBottom: theme.space2,
  },
  chartSubLabel: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    marginBottom: theme.space2,
  },
  emptyText: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    lineHeight: 22,
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

  // Diet trial compliance
  progressTrack: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colorChartEmpty,
    overflow: 'hidden',
    marginBottom: theme.space1,
  },
  progressFill: {
    backgroundColor: theme.colorAccent,
    borderRadius: 3,
  },
  complianceNote: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },

  // Loading skeleton
  skeletonBar: {
    borderRadius: theme.radiusSmall,
    backgroundColor: theme.colorChartEmpty,
  },
});
