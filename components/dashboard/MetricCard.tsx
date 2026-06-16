import { useState } from 'react';
import { Pressable, View, Text, StyleSheet } from 'react-native';
import { ChevronRight, ArrowUp, ArrowDown } from 'lucide-react-native';
import { theme, shadows } from '../../constants/theme';
import { Sparkline } from './Sparkline';
import { MetricInfoButton, MetricDefinition } from './MetricInfo';
import { deltaToneColor } from './cardTokens';
import {
  resolveDeltaTone,
  deltaDirection,
  calibrationLine,
  type Polarity,
  type CardDisplayState,
} from '../../lib/dashboardCards';

// MetricCard — the four-layer KPI card (§4.1 / §5 #1), the dashboard's workhorse:
//   1. label        — what it is, plain, muted, subordinate.
//   2. big number   — the current value, dominant.
//   3. sparkline    — the shape of the trend (no axes/labels).
//   4. period delta — change vs the prior period, arrow + colour.
//
// Colour is the §13 #6 ruling, applied through resolveDeltaTone: a verdict colour
// shows ONLY on an established multi-sample metric; adverse inverts (rising = concern,
// falling = calm/muted, never a green win); a single observation stays neutral. Below
// the sample floor the card renders the "still learning the baseline" calibration
// state (§10), never a fabricated number/chart.
//
// Convention (B-098): a POPULATED KPI card must carry a shape — a sparkline (`sparkData`,
// ≥2 points, for a count trend) OR a proportion bar (`progress`, for a rate like "Meals
// finished"). A bare big number is not shipped (the 29% bug). Empty/calibrating states
// legitimately have no shape, so this is enforced by review + the design principle, not
// the prop type.
//
// The whole card is the tap target (a "doorway" → detail screen, §4.2) with a visible
// chevron + 44pt floor + hitSlop — Oura's "tappable-but-unsignposted" weakness, fixed.

/** Clamp a proportion into [0, 1]; a non-finite value reads as 0 (never a NaN width). */
function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

interface Props {
  /** Layer 1 — plain, muted label ("Vomiting", "Meals finished"). */
  label: string;
  /** Layer 2 — the pre-formatted big number ("3", "85%"). */
  value: string;
  /** Drives the §13 #6 colour direction. Default 'neutral' (no verdict). */
  polarity?: Polarity;
  /** Multi-sample & at/above floor? Gates the verdict colour. Default false. */
  established?: boolean;
  /** current − prior, for the delta tone + arrow. Omit → no delta layer. */
  delta?: number;
  /** Layer 4 — the warm delta phrase ("2 fewer than last month"). */
  deltaLabel?: string;
  /** Layer 3 (count trend) — sparkline series. <2 points → no sparkline. */
  sparkData?: number[];
  /** Layer 3 (rate) — a 0..1 proportion → a full-width fill bar under the number, the
   *  rate card's shape (B-098). Mutually exclusive with sparkData in practice. */
  progress?: number;
  /** calibrating / empty / populated (§10). Default populated. */
  state?: CardDisplayState;
  /** Singular noun for the calibration copy ("meal" → "3 more meals to log"). */
  calibrationUnit?: string;
  /** Warm copy for the empty state ("No vomiting logged this month."). */
  emptyMessage?: string;
  /** Honest marker beneath the card (e.g. the §11 #6 free-feeding note). */
  note?: string;
  /** One-line "what does this measure?" definition (B-100). When set, a tap-to-reveal
   *  (i) shows in the header — for the computed metrics whose rule isn't obvious from
   *  the number ("Meals finished" = most/all eaten, treats & free-fed excluded). */
  definition?: string;
  petName?: string;
  onPress?: () => void;
  accessibilityHint?: string;
}

export function MetricCard({
  label,
  value,
  polarity = 'neutral',
  established = false,
  delta,
  deltaLabel,
  sparkData,
  progress,
  state = { kind: 'populated' },
  calibrationUnit = 'sample',
  emptyMessage,
  note,
  definition,
  petName,
  onPress,
  accessibilityHint,
}: Props) {
  const [defOpen, setDefOpen] = useState(false);
  const tone = resolveDeltaTone({ polarity, delta: delta ?? 0, established });
  const toneColor = deltaToneColor(tone);
  const dir = deltaDirection(delta ?? 0);
  const progressFraction = progress != null ? clamp01(progress) : null;

  const accessibilityLabel =
    state.kind === 'populated'
      ? `${label}: ${value}${deltaLabel ? `, ${deltaLabel}` : ''}`
      : `${label}`;

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole={onPress != null ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={onPress != null ? accessibilityHint ?? 'Opens the full trend' : undefined}
      style={({ pressed }) => [styles.card, pressed && onPress != null && styles.pressed]}
    >
      <View style={styles.headerRow}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.headerActions}>
          {definition != null && (
            <MetricInfoButton
              open={defOpen}
              onToggle={() => setDefOpen((v) => !v)}
              metricLabel={label}
            />
          )}
          {onPress != null && <ChevronRight size={18} color={theme.colorTextDisabled} />}
        </View>
      </View>

      {state.kind === 'calibrating' ? (
        <Text style={styles.stateText}>
          {calibrationLine(state.remaining, calibrationUnit, petName)}
        </Text>
      ) : state.kind === 'empty' ? (
        <Text style={styles.stateText}>{emptyMessage ?? 'Nothing logged yet.'}</Text>
      ) : (
        <>
          <View style={styles.valueRow}>
            <Text style={styles.value}>{value}</Text>
            {sparkData != null && sparkData.length >= 2 && (
              <Sparkline data={sparkData} tone={tone} />
            )}
          </View>

          {/* Proportion bar — the rate card's shape (B-098): the % as a calm filled bar,
              so "Meals finished" is never a bare number. Neutral fill (magnitude, not a
              verdict); the verdict, if any, lives in the delta line below. */}
          {progressFraction != null && (
            <View style={styles.progressTrack} testID="metric-progress">
              <View style={[styles.progressFill, { flex: progressFraction }]} />
              <View style={{ flex: 1 - progressFraction }} />
            </View>
          )}

          {delta !== undefined && deltaLabel != null && (
            <View style={styles.deltaRow}>
              {dir === 'up' && <ArrowUp size={14} color={toneColor} />}
              {dir === 'down' && <ArrowDown size={14} color={toneColor} />}
              <Text style={[styles.deltaText, { color: toneColor }]}>{deltaLabel}</Text>
            </View>
          )}
        </>
      )}

      {note != null && <Text style={styles.note}>{note}</Text>}

      {/* The B-100 definition reveal — calm footer callout, shown only on tap, in any
          data state (it explains the metric whether or not there's a number yet). */}
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
    gap: theme.space1,
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
  // Right-side actions group — the info (i) and the future card→detail chevron sit
  // together so the label keeps the left edge (space-between) with either or both present.
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
  },
  label: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
    flexShrink: 1,
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
  progressTrack: {
    flexDirection: 'row',
    height: 10,
    borderRadius: theme.radiusFull,
    backgroundColor: theme.colorChartEmpty,
    overflow: 'hidden',
  },
  progressFill: {
    // Calm, on-brand fill (not the full interactive accent, not a verdict colour).
    // Height comes from the row's cross-axis stretch.
    backgroundColor: theme.colorAccentSoft,
  },
  deltaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  deltaText: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
  },
  stateText: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightBody,
  },
  note: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    lineHeight: 16,
  },
});
