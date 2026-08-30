import { useCallback, useEffect, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { ArrowDown, ArrowUp, ChevronRight, Minus } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { Card } from '../ui/Card';
import { ThemedText } from '../ui/ThemedText';
import { WhorlSpinner } from '../brand/WhorlSpinner';
import { Sparkline } from '../dashboard/Sparkline';
import {
  computeWeightTrend,
  describeWeightDelta,
  formatWeightDate,
  getWeightHistory,
  getWeightReadingCount,
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
          // Two reads, one trend. The SERIES is the latest 12 (the sparkline's window);
          // the COUNT is the whole record, because the card speaks it as a fact and it
          // now labels a tap-through to every reading — a window-derived count read
          // "12 readings" to a pet with 20 (CUL-223).
          const [readings, total] = await Promise.all([
            getWeightHistory(petId, SERIES_LIMIT),
            getWeightReadingCount(petId),
          ]);
          if (!cancelled) setTrend(computeWeightTrend(readings, total));
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
      <ThemedText style={styles.label}>Weight</ThemedText>

      {loading && trend === null ? (
        <WhorlSpinner size="sm" ground="day" style={styles.loader} />
      ) : !hasReadings ? (
        <EmptyState petName={petName} snapshotKg={snapshotKg} />
      ) : trend!.readingCount === 1 ? (
        <SingleReading trend={trend!} petName={petName} petId={petId} />
      ) : (
        <TrendBody trend={trend!} petId={petId} />
      )}

      {/* Primary action, every state — logging the next reading is always the wanted
          next step (the empty/single states explicitly invite it). Weight is the one
          event whose value IS the entry, so this can't be a one-tap like "Log a dose";
          it opens the numeric quick-log step (pre-filled with the last reading). */}
      {/* No hitSlop: this is already a 44pt box, so slop buys it no reach and only
          reaches UP into the readings row above it — the CUL-612 overlap, where a tap
          meant for "see the readings" would resolve to "open the log screen" by
          z-order (CUL-579: grow the box, or delete the slop; never both). */}
      <Pressable
        onPress={() => router.push('/log?type=weight_check')}
        style={styles.action}
        accessibilityRole="button"
        accessibilityLabel={`Log a weigh-in for ${petName}`}
      >
        <ThemedText style={styles.actionText}>Log a weigh-in</ThemedText>
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
        <ThemedText style={styles.note}>
          From {petName}'s profile. Log a weigh-in to start tracking changes over time.
        </ThemedText>
      </View>
    );
  }
  return (
    <ThemedText style={styles.emptyText}>
      No weight on file yet. Logging a weigh-in now and then is the simplest way to keep
      an eye on {petName}'s weight over time.
    </ThemedText>
  );
}

// One reading is a point, not a trend (n=1 says nothing about movement). Show it and
// invite the next, so the line can begin. The date anchor keeps a lone number from
// reading as "today's weight" when it may be a back-dated or onboarding figure.
function SingleReading(
  { trend, petName, petId }: { trend: WeightTrend; petName: string; petId: string },
) {
  return (
    <View style={styles.body}>
      <BigNumber lbs={trend.latestLbs!} />
      <ReadingsLink trend={trend} petId={petId} />
      <ThemedText style={styles.note}>
        One reading so far. Log another after {petName}'s next weigh-in to see the trend.
      </ThemedText>
    </View>
  );
}

function TrendBody({ trend, petId }: { trend: WeightTrend; petId: string }) {
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

      <ReadingsLink trend={trend} petId={petId} />
    </View>
  );
}

// "Last weighed {date} · N readings" — the line that names the record, now the way
// into it (CUL-223). The count was already making a promise the card couldn't keep;
// this is the list it was implying.
//
// It renders as a button ONLY when there is a reading to open. At zero readings the
// card shows a profile snapshot or an empty state and this component is never reached
// — which is the point: a state with nothing to show renders no touchable at all,
// rather than a `disabled` one that VoiceOver would announce as a dimmed, unavailable
// control that does not exist here (CUL-682).
function ReadingsLink({ trend, petId }: { trend: WeightTrend; petId: string }) {
  if (!trend.latestOccurredAt) return null;
  const line = `Last weighed ${formatWeightDate(trend.latestOccurredAt)}${
    trend.readingCount > 1 ? ` · ${trend.readingCount} readings` : ''
  }`;

  return (
    <Pressable
      style={styles.readingsLink}
      onPress={() => router.push({ pathname: '/weight-history', params: { petId } })}
      accessibilityRole="button"
      accessibilityLabel={`${line}. See all readings.`}
    >
      <ThemedText style={[styles.note, styles.readingsLinkText]} numberOfLines={1}>
        {line}
      </ThemedText>
      <ChevronRight size={14} color={theme.colorTextTertiary} strokeWidth={2} />
    </Pressable>
  );
}

function BigNumber({ lbs }: { lbs: number }) {
  return (
    <ThemedText style={styles.value}>
      {lbs}
      <ThemedText style={styles.unit}> lbs</ThemedText>
    </ThemedText>
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
      <ThemedText style={styles.deltaText}>{text}</ThemedText>
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
    gap: theme.space0_5,
  },
  deltaText: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
  },
  note: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    lineHeight: theme.lineHeightXS,
  },
  // The tap-through row. minHeight rather than hitSlop: it sits directly above the
  // "Log a weigh-in" action, and slop on either of two adjacent controls is what puts
  // one's hit area inside the other (CUL-612). A real 44pt box takes no space from its
  // neighbour, and the floor is true by construction instead of resting on a rendered
  // line box no test can measure.
  readingsLink: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
  },
  // The line yields, the chevron does not. Without the shrink the row sizes to the
  // text and pushes the chevron out of the card at the longest phrasing a real record
  // reaches — "Last weighed Nov 23, 2025 · 20 readings" at a large type setting, where
  // the year stamp and a three-digit count arrive together. Truncating costs nothing
  // here: a screen reader still announces the whole string (CUL-726), and the count is
  // restated as the destination's own subtitle.
  readingsLinkText: {
    flexShrink: 1,
  },
  emptyText: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightBody,
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
    color: theme.colorAccentInk,
  },
});
