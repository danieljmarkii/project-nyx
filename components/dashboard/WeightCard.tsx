import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowDown, ArrowUp, ChevronRight, Minus } from 'lucide-react-native';
import { theme, shadows } from '../../constants/theme';
import { Sparkline } from './Sparkline';
import { describeWeightDelta, formatWeightDate, WeightTrend } from '../../lib/weight';
import { petNameOrYours } from '../../lib/dashboardCards';
import { ThemedText } from '../ui/ThemedText';

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
  /** Whose readings the tap-through opens. Passed explicitly rather than read from
   *  activePet inside the screen it lands on, so the list is scoped to the pet whose
   *  card was tapped (CUL-574). */
  petId: string;
}

export function WeightCard({ trend, petName, petId }: Props) {
  const name = petNameOrYours(petName);
  const hasReadings = trend.readingCount > 0;

  return (
    <View style={styles.card}>
      <ThemedText style={styles.label}>Weight</ThemedText>

      {!hasReadings ? (
        // Designed empty state (Principle 5) — a calm, forward-looking nudge for the
        // weight-logging habit this feature exists to start (the vet-council #1 missing
        // datum). Voice mirrors the Profile sibling ("keep an eye on …"), not the
        // analytics-flavoured "trending" — this surface is "Patterns", not "Analytics".
        // Unlike the Profile card we do NOT show the pets.weight_kg snapshot here: the
        // dashboard is a TREND surface with no "Weight" chip beside it, so a static
        // profile number would read as a tracked reading it isn't. Never reassures — it
        // invites a reading, it doesn't say anything is fine.
        <ThemedText style={styles.emptyText}>
          No weigh-ins logged yet. Weighing {name} now and then is the simplest way to
          keep an eye on changes over time.
        </ThemedText>
      ) : trend.readingCount === 1 ? (
        // One reading is a point, not a trend (n=1 says nothing about movement). The date
        // anchor keeps a lone number from reading as "today's weight" when it may be a
        // back-dated or onboarding figure (it's the only number, with no series for context).
        <View style={styles.body}>
          <BigNumber lbs={trend.latestLbs!} />
          <ReadingsLink trend={trend} petId={petId} />
          <ThemedText style={styles.note}>
            One reading so far. Log another after {name}'s next weigh-in to see the trend.
          </ThemedText>
        </View>
      ) : (
        <View style={styles.body}>
          <View style={styles.valueRow}>
            <BigNumber lbs={trend.latestLbs!} />
            {/* Neutral grey — NOT the accent (reads "good") or rose (reads "alarm"). */}
            <Sparkline data={trend.seriesLbs} color={theme.colorTextTertiary} />
          </View>

          <DeltaLine trend={trend} />

          <ReadingsLink trend={trend} petId={petId} />
        </View>
      )}

      {/* Primary action, every state — logging the next reading is always the wanted
          next step. Weight is the one event whose value IS the entry, so this can't be a
          one-tap; it opens the numeric quick-log step (pre-filled with the last reading). */}
      {/* No hitSlop: already a 44pt box, so slop buys no reach and only reaches UP into
          the readings row above — the CUL-612 overlap (CUL-579: grow the box, or delete
          the slop; never both). */}
      <Pressable
        onPress={() => router.push('/log?type=weight_check')}
        style={styles.action}
        accessibilityRole="button"
        accessibilityLabel={`Log a weigh-in for ${name}`}
      >
        <ThemedText style={styles.actionText}>Log a weigh-in</ThemedText>
      </Pressable>
    </View>
  );
}

// "Last weighed {date} · N readings" — the line that names the record, now the way into
// it (CUL-223). Identical to the Profile card's, deliberately: the two weight surfaces
// phrase a trend the same way, and one of them growing a door the other lacks would be
// the drift describeWeightDelta exists to prevent.
//
// A button only where there is a reading to open — at zero readings the empty state
// renders instead and this is never reached, so no `disabled` touchable claims an
// unavailable control that does not exist in that state (CUL-682).
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
      <ThemedText style={styles.deltaText}>{text}</ThemedText>
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
  // minHeight, not hitSlop — it sits directly above the "Log a weigh-in" action, and
  // slop on either of two adjacent controls is what puts one's hit area inside the
  // other (CUL-612). A real 44pt box takes nothing from its neighbour.
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
