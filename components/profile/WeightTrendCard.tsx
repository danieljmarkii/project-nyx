import { useCallback, useEffect, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { Card } from '../ui/Card';
import { Sparkline } from '../dashboard/Sparkline';
import {
  computeWeightTrend,
  describeWeightDelta,
  formatWeightDate,
  getWeightHistory,
  kgToLbsNum,
  WeightTrend,
} from '../../lib/weight';

// WeightTrendCard — the descriptive weight surface on Profile (B-186 PR 3).
//
// Four layers, mirroring the dashboard MetricCard: label → big number (latest
// reading) → sparkline (shape only) → period delta. But UNLIKE MetricCard it carries
// NO verdict colour and NO valenced copy, because a weight trend is the one metric
// where direction must stay neutral:
//
//   CLINICAL GUARDRAIL — a weight trend NEVER reassures. Weight LOSS is the danger
//   signal; a rising or flat line is NOT wellness (rising can be fluid/edema). So the
//   line is a neutral grey (never the accent/teal that reads "good", never rose that
//   reads "alarm"), the delta arrow is grey (direction, not valence), and the copy is
//   purely factual ("Down 0.4 lbs since …", never "improving"). v1 ships no loss flag
//   — that's a separate spec with a mandatory adversarial pass.
//
// Self-contained: it owns its read from the local mirror (offline-friendly) and
// recomputes on focus — covering mount, returning to the tab after logging a weigh-in
// elsewhere, and a focused pet switch. Focus-only matches the medications card on this
// same screen.

interface Props {
  petId: string;
  petName: string;
  // The pets.weight_kg snapshot. It can exist WITHOUT any weight_checks row — it's set
  // at onboarding / Edit profile too, not only by a logged weigh-in. So when there are
  // no readings yet we still show this profile weight (rather than "no weight logged",
  // which would contradict the populated "Weight" chip above) — labelled as a profile
  // value, not a tracked reading. Once readings exist, PR 2 keeps the snapshot pointed
  // at the latest one, so it agrees with the card's big number and isn't shown twice.
  snapshotKg: number | null;
}

const SERIES_LIMIT = 12;

export function WeightTrendCard({ petId, petName, snapshotKg }: Props) {
  const [trend, setTrend] = useState<WeightTrend | null>(null);
  const [loading, setLoading] = useState(true);

  // Clear to the loading state the instant the active pet changes, so a pet switch
  // never flashes the previous pet's trend while the new read is in flight.
  useEffect(() => {
    setTrend(null);
    setLoading(true);
  }, [petId]);

  // One loader, on focus. The `cancelled` flag drops a stale in-flight response so a
  // slow read for pet A can't overwrite pet B after a fast switch — and suppresses a
  // setState after unmount (the same guard useTrend uses). A read failure leaves the
  // card in its prior state rather than blanking it; the weight_checks rows are the
  // source of truth, so the next focus self-heals.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const readings = await getWeightHistory(petId, SERIES_LIMIT);
          if (!cancelled) setTrend(computeWeightTrend(readings));
        } catch (e) {
          if (!cancelled) console.error('[WeightTrendCard] load failed:', e);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => { cancelled = true; };
    }, [petId]),
  );

  const hasReadings = trend != null && trend.readingCount > 0;

  return (
    <Card style={styles.card}>
      <Text style={styles.label}>Weight</Text>

      {loading && trend === null ? (
        <ActivityIndicator style={styles.loader} color={theme.colorTextSecondary} />
      ) : !hasReadings ? (
        <EmptyState petName={petName} snapshotKg={snapshotKg} />
      ) : trend!.readingCount === 1 ? (
        <SingleReading trend={trend!} petName={petName} />
      ) : (
        <TrendBody trend={trend!} />
      )}

      {/* Primary action, every state — logging the next reading is always the wanted
          next step (the empty/single states explicitly invite it). Weight is the one
          event whose value IS the entry, so this can't be a one-tap like "Log a dose";
          it opens the numeric quick-log step (pre-filled with the last reading). */}
      <Pressable
        onPress={() => router.push('/log?type=weight_check')}
        hitSlop={8}
        style={styles.action}
        accessibilityRole="button"
        accessibilityLabel={`Log a weigh-in for ${petName}`}
      >
        <Text style={styles.actionText}>Log a weigh-in</Text>
      </Pressable>
    </Card>
  );
}

// No readings yet. If a profile weight exists we show it (so the card never says
// "none" while the Weight chip above shows a number), labelled as a profile value and
// inviting the first tracked weigh-in. Otherwise a designed empty state (Principle 5)
// that nudges the weight-logging habit B-186 exists to start — forward-looking, never
// reassuring.
function EmptyState({ petName, snapshotKg }: { petName: string; snapshotKg: number | null }) {
  if (snapshotKg != null) {
    return (
      <View style={styles.body}>
        <BigNumber lbs={kgToLbsNum(snapshotKg)} />
        <Text style={styles.note}>
          From {petName}'s profile. Log a weigh-in to start tracking changes over time.
        </Text>
      </View>
    );
  }
  return (
    <Text style={styles.emptyText}>
      No weight on file yet. Logging a weigh-in now and then is the simplest way to keep
      an eye on {petName}'s weight over time.
    </Text>
  );
}

// One reading is a point, not a trend (n=1 says nothing about movement). Show it and
// invite the next, so the line can begin. The date anchor keeps a lone number from
// reading as "today's weight" when it may be a back-dated or onboarding figure.
function SingleReading({ trend, petName }: { trend: WeightTrend; petName: string }) {
  return (
    <View style={styles.body}>
      <BigNumber lbs={trend.latestLbs!} />
      {trend.latestOccurredAt && (
        <Text style={styles.note}>Last weighed {formatWeightDate(trend.latestOccurredAt)}</Text>
      )}
      <Text style={styles.note}>
        One reading so far. Log another after {petName}'s next weigh-in to see the trend.
      </Text>
    </View>
  );
}

function TrendBody({ trend }: { trend: WeightTrend }) {
  return (
    <View style={styles.body}>
      <View style={styles.valueRow}>
        <BigNumber lbs={trend.latestLbs!} />
        <Sparkline
          data={trend.seriesLbs}
          // Neutral grey — NOT the accent (reads "good") or rose (reads "alarm").
          color={theme.colorTextTertiary}
        />
      </View>

      <DeltaLine trend={trend} />

      {trend.latestOccurredAt && (
        <Text style={styles.note}>
          Last weighed {formatWeightDate(trend.latestOccurredAt)}
          {trend.readingCount > 1 ? ` · ${trend.readingCount} readings` : ''}
        </Text>
      )}
    </View>
  );
}

function BigNumber({ lbs }: { lbs: number }) {
  return (
    <Text style={styles.value}>
      {lbs}
      <Text style={styles.unit}> lbs</Text>
    </Text>
  );
}

// The period delta — arrow + factual phrase, both neutral grey. The arrow conveys
// direction; nothing here conveys whether that direction is good or bad (it can't —
// see the guardrail). The phrase comes from the shared describeWeightDelta so it can't
// drift from the dashboard card: flat reads "No change", never "steady"/"holding".
function DeltaLine({ trend }: { trend: WeightTrend }) {
  const text = describeWeightDelta(trend);
  if (text == null || trend.direction == null) return null;

  let icon = <Minus size={14} color={theme.colorTextSecondary} />;
  if (trend.direction === 'up') icon = <ArrowUp size={14} color={theme.colorTextSecondary} />;
  else if (trend.direction === 'down') icon = <ArrowDown size={14} color={theme.colorTextSecondary} />;

  return (
    <View style={styles.deltaRow}>
      {icon}
      <Text style={styles.deltaText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: theme.space1,
  },
  label: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
  },
  loader: {
    alignSelf: 'center',
    paddingVertical: theme.space2,
  },
  body: {
    gap: theme.space1,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: theme.space2,
  },
  value: {
    fontSize: theme.text2XL,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    letterSpacing: theme.trackingTight,
  },
  unit: {
    fontSize: theme.textLG,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
    letterSpacing: theme.trackingNormal,
  },
  deltaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  deltaText: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
  },
  note: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    lineHeight: 16,
  },
  emptyText: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: 20,
  },
  // Primary action — accent text, 44pt floor (the same shape as the "Log a dose"
  // action on the medications card). minHeight + centered clears the tap target even
  // though the text is small.
  action: {
    minHeight: 44,
    justifyContent: 'center',
  },
  actionText: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorAccent,
  },
});
