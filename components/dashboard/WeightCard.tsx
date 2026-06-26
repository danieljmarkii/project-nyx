import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react-native';
import { theme, shadows } from '../../constants/theme';
import { Sparkline } from './Sparkline';
import { describeWeightDelta, formatWeightDate, WeightTrend } from '../../lib/weight';
import { petNameOrYours } from '../../lib/dashboardCards';

// WeightCard — the descriptive weight surface on the Patterns dashboard (B-186
// fast-follow). The dashboard sibling of components/profile/WeightTrendCard: it
// mirrors that card's neutral four-layer presentation (label → big number →
// neutral-grey sparkline → factual delta) but is PROP-DRIVEN — the screen owns the
// single load + stale-guard for every card, so this one takes a pre-computed
// WeightTrend instead of self-loading on focus.
//
// PLACEMENT (product-team decision, PM deferred 2026-06-26): the dashboard groups
// cards by the owner's question (spec §6) — this card answers "Is {pet} okay /
// getting better?" (group A, health trajectory), NOT "what does {pet} eat?" (group
// B). So buildDashboardCards orders it in the health-trajectory cluster, after the
// symptom cards and above food/intake. It carries 'safety' priority for ORDERING
// only (the dashboard is uncapped — priority never drops a card) — never a verdict
// colour. Spec precedent: diet-trial progress, another neutral card, also lives in
// group A.
//
//   CLINICAL GUARDRAIL — a weight trend NEVER reassures. Weight LOSS is the danger
//   signal; a rising or flat line is NOT wellness (rising can be fluid/edema). So the
//   line is neutral grey (never the accent/teal that reads "good", never rose that
//   reads "alarm"), the delta arrow is grey (direction, not valence), and the copy is
//   purely factual (via the shared describeWeightDelta). v1 ships no loss flag — that's
//   a separate spec with a mandatory adversarial pass.

interface Props {
  trend: WeightTrend;
  /** Raw active-pet name; resolves to "your pet" when absent (nyx-voice Pattern 1). */
  petName?: string;
}

export function WeightCard({ trend, petName }: Props) {
  const name = petNameOrYours(petName);
  const hasReadings = trend.readingCount > 0;

  return (
    <View style={styles.card}>
      <Text style={styles.label}>Weight</Text>

      {!hasReadings ? (
        // Designed empty state (Principle 5) — a calm, forward-looking nudge for the
        // weight-logging habit this feature exists to start (the vet-council #1 missing
        // datum). Voice mirrors the Profile sibling ("keep an eye on …"), not the
        // analytics-flavoured "trending" — this surface is "Patterns", not "Analytics".
        // Unlike the Profile card we do NOT show the pets.weight_kg snapshot here: the
        // dashboard is a TREND surface with no "Weight" chip beside it, so a static
        // profile number would read as a tracked reading it isn't. Never reassures — it
        // invites a reading, it doesn't say anything is fine.
        <Text style={styles.emptyText}>
          No weigh-ins logged yet. Weighing {name} now and then is the simplest way to
          keep an eye on changes over time.
        </Text>
      ) : trend.readingCount === 1 ? (
        // One reading is a point, not a trend (n=1 says nothing about movement). The date
        // anchor keeps a lone number from reading as "today's weight" when it may be a
        // back-dated or onboarding figure (it's the only number, with no series for context).
        <View style={styles.body}>
          <BigNumber lbs={trend.latestLbs!} />
          {trend.latestOccurredAt && (
            <Text style={styles.note}>Last weighed {formatWeightDate(trend.latestOccurredAt)}</Text>
          )}
          <Text style={styles.note}>
            One reading so far. Log another after {name}'s next weigh-in to see the trend.
          </Text>
        </View>
      ) : (
        <View style={styles.body}>
          <View style={styles.valueRow}>
            <BigNumber lbs={trend.latestLbs!} />
            {/* Neutral grey — NOT the accent (reads "good") or rose (reads "alarm"). */}
            <Sparkline data={trend.seriesLbs} color={theme.colorTextTertiary} />
          </View>

          <DeltaLine trend={trend} />

          {trend.latestOccurredAt && (
            <Text style={styles.note}>
              Last weighed {formatWeightDate(trend.latestOccurredAt)}
              {trend.readingCount > 1 ? ` · ${trend.readingCount} readings` : ''}
            </Text>
          )}
        </View>
      )}

      {/* Primary action, every state — logging the next reading is always the wanted
          next step. Weight is the one event whose value IS the entry, so this can't be a
          one-tap; it opens the numeric quick-log step (pre-filled with the last reading). */}
      <Pressable
        onPress={() => router.push('/log?type=weight_check')}
        hitSlop={8}
        style={styles.action}
        accessibilityRole="button"
        accessibilityLabel={`Log a weigh-in for ${name}`}
      >
        <Text style={styles.actionText}>Log a weigh-in</Text>
      </Pressable>
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
// direction; nothing here conveys whether it's good or bad (it can't — see the
// guardrail). The phrase is the shared describeWeightDelta, so it can't drift from the
// Profile card: flat reads "No change", never "steady"/"holding".
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
  // Matches the other dashboard cards (MetricCard): elevated surface, no border.
  card: {
    backgroundColor: theme.colorSurface,
    borderRadius: theme.radiusMedium,
    padding: theme.space3,
    gap: theme.space1,
    ...shadows.md,
  },
  label: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
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
  // Primary action — accent text, 44pt floor (the same shape as the Profile weight
  // card's "Log a weigh-in"). minHeight + centered clears the tap target.
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
