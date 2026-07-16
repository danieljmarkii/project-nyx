import { useState } from 'react';
import { Pressable, View, Text, StyleSheet } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { theme, shadows } from '../../constants/theme';
import { MetricInfoButton, MetricDefinition } from './MetricInfo';
import { calibrationLine, type CardDisplayState } from '../../lib/dashboardCards';

// RankingCard — "Top food", "Top protein" (§5 #3 / §6). A ranked BAR LIST: each row pairs
// the (wrapping) label with an inline bar = its SHARE OF THE DIET (normalized so #1 fills
// the track, so the ranking reads at a glance), and a right-side INTAKE read = "% finished"
// (the B-098 design lift — the old plain numbered list read "bleh"). Still a ranked list
// with counts, never a pie chart (§4.1).
//
// SAFETY (§11 #1 — intake is NOT preference): the right-side rate is "% finished"
// (descriptive intake), NEVER "preference"/"favorite". A low rate stays NEUTRAL (no red) —
// the floored decline detector owns a real "started refusing", not this card. Treats finish
// at a ceiling, so a treat shows its share + a "treat" tag, NOT a rate (else "treats 100%
// finished" reads as "loved"). A food below the §11 #5 floor shows a "few more meals" hint,
// never a confident rate off 1–2 meals. (The whole-card §11 #5 floor still shows the
// calibration state instead of a fabricated top-N.)

export interface RankingEntry {
  /** Stable key (food id / protein key). */
  key: string;
  /** Display label ("Tiki Cat Tuna", "Chicken"). */
  label: string;
  /** Share of diet/meals, [0,1] — drives the bar (normalized to the list max). */
  share: number;
  /** Absolute share label ("28% of diet", "31% of meals"). */
  shareLabel: string;
  /** Finished-rate [0,1], or null (below floor / not observed) → the "few more" hint. */
  finishedRate?: number | null;
  /** Treat → show the "treat" tag instead of a finish-rate (ceiling, §11 #1). */
  isTreat?: boolean;
}

interface Props {
  title: string;
  entries: RankingEntry[];
  /** calibrating / empty / populated (§10). Default populated. */
  state?: CardDisplayState;
  calibrationUnit?: string;
  emptyMessage?: string;
  /** One-line "what does this measure?" definition (B-100) — explains the share bar +
   *  the "% finished" intake read. When set, a tap-to-reveal (i) shows in the header. */
  definition?: string;
  petName?: string;
  onPress?: () => void;
  accessibilityHint?: string;
}

function RightMeta({ entry }: { entry: RankingEntry }) {
  if (entry.isTreat) {
    return <Text style={styles.treat}>treat</Text>;
  }
  if (entry.finishedRate != null) {
    return (
      <Text style={styles.finished}>
        {Math.round(entry.finishedRate * 100)}% <Text style={styles.finishedSub}>finished</Text>
      </Text>
    );
  }
  // Below the floor — honest "not enough rated meals yet", never a rate off 1–2 meals.
  return <Text style={styles.hint}>a few more meals</Text>;
}

export function RankingCard({
  title,
  entries,
  state = { kind: 'populated' },
  calibrationUnit = 'food',
  emptyMessage,
  definition,
  petName,
  onPress,
  accessibilityHint,
}: Props) {
  const [defOpen, setDefOpen] = useState(false);
  // Normalize bars against the busiest entry so #1 fills the track and the rest read as a
  // share of it (the standard bar-list ranking; the LABEL stays the absolute share %).
  const maxShare = entries.reduce((m, e) => (e.share > m ? e.share : m), 0);

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole={onPress != null ? 'button' : undefined}
      accessibilityLabel={title}
      accessibilityHint={onPress != null ? accessibilityHint ?? 'Opens the full list' : undefined}
      style={({ pressed }) => [styles.card, pressed && onPress != null && styles.pressed]}
    >
      <View style={styles.headerRow}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.headerActions}>
          {definition != null && (
            <MetricInfoButton
              open={defOpen}
              onToggle={() => setDefOpen((v) => !v)}
              metricLabel={title}
            />
          )}
          {onPress != null && <ChevronRight size={18} color={theme.colorTextDisabled} />}
        </View>
      </View>

      {state.kind === 'calibrating' ? (
        <Text style={styles.stateText}>
          {calibrationLine(state.remaining, calibrationUnit, petName)}
        </Text>
      ) : state.kind === 'empty' || entries.length === 0 ? (
        <Text style={styles.stateText}>{emptyMessage ?? 'Nothing logged yet.'}</Text>
      ) : (
        <View style={styles.list}>
          {entries.map((entry) => {
            const fraction = maxShare > 0 ? entry.share / maxShare : 0;
            return (
              <View key={entry.key} style={styles.entry}>
                <View style={styles.entryHead}>
                  {/* Let a long food name BREATHE — wrap to a second line, never truncate. */}
                  <Text style={styles.entryLabel} numberOfLines={2}>
                    {entry.label}
                  </Text>
                  <RightMeta entry={entry} />
                </View>
                <View style={styles.barRow}>
                  <View style={styles.barTrack} testID="rank-bar">
                    <View style={[styles.barFill, { flex: fraction }]} />
                    <View style={{ flex: 1 - fraction }} />
                  </View>
                  <Text style={styles.share}>{entry.shareLabel}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* B-100 definition reveal — explains the share bar + "% finished" (intake, §11 #1). */}
      {definition != null && defOpen && <MetricDefinition text={definition} />}
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
  // Right-side actions group — the info (i) + the future card→detail chevron sit together.
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
  },
  title: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
    flexShrink: 1,
  },
  list: {
    gap: theme.space2,
  },
  // Each entry is a two-row block: the head (label · intake read) then its share bar.
  entry: {
    gap: 7,
  },
  entryHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.space2,
  },
  entryLabel: {
    flex: 1,
    fontSize: theme.textMD,
    lineHeight: 20,
    color: theme.colorTextPrimary,
  },
  finished: {
    fontSize: theme.textMD,
    lineHeight: 20,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    flexShrink: 0,
  },
  finishedSub: {
    fontSize: theme.textXS,
    fontWeight: theme.weightRegular,
    color: theme.colorTextTertiary,
  },
  treat: {
    fontSize: theme.textXS,
    lineHeight: 20,
    fontWeight: theme.weightMedium,
    color: theme.colorTextTertiary,
    textTransform: 'uppercase',
    letterSpacing: theme.trackingWide,
    flexShrink: 0,
  },
  hint: {
    fontSize: theme.textSM,
    lineHeight: 20,
    color: theme.colorTextTertiary,
    flexShrink: 0,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
  },
  barTrack: {
    flex: 1,
    flexDirection: 'row',
    height: 8,
    borderRadius: theme.radiusFull,
    backgroundColor: theme.colorChartEmpty,
    overflow: 'hidden',
  },
  barFill: {
    backgroundColor: theme.colorAccentSoft,
  },
  share: {
    fontSize: theme.textSM,
    color: theme.colorTextTertiary,
    flexShrink: 0,
  },
  stateText: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightBody,
  },
});
