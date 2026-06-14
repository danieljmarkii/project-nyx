import { Pressable, View, Text, StyleSheet } from 'react-native';
import { ChevronRight, ArrowUp, ArrowDown } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { Sparkline } from './Sparkline';
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
// The whole card is the tap target (a "doorway" → detail screen, §4.2) with a visible
// chevron + 44pt floor + hitSlop — Oura's "tappable-but-unsignposted" weakness, fixed.

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
  /** Layer 3 — sparkline series. <2 points → no sparkline (the state owns thin data). */
  sparkData?: number[];
  /** calibrating / empty / populated (§10). Default populated. */
  state?: CardDisplayState;
  /** Singular noun for the calibration copy ("meal" → "3 more meals to log"). */
  calibrationUnit?: string;
  /** Warm copy for the empty state ("No vomiting logged this month."). */
  emptyMessage?: string;
  /** Honest marker beneath the card (e.g. the §11 #6 free-feeding note). */
  note?: string;
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
  state = { kind: 'populated' },
  calibrationUnit = 'sample',
  emptyMessage,
  note,
  petName,
  onPress,
  accessibilityHint,
}: Props) {
  const tone = resolveDeltaTone({ polarity, delta: delta ?? 0, established });
  const toneColor = deltaToneColor(tone);
  const dir = deltaDirection(delta ?? 0);

  const accessibilityLabel =
    state.kind === 'populated'
      ? `${label}: ${value}${deltaLabel ? `, ${deltaLabel}` : ''}`
      : `${label}`;

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint ?? 'Opens the full trend'}
      style={({ pressed }) => [styles.card, pressed && onPress != null && styles.pressed]}
    >
      <View style={styles.headerRow}>
        <Text style={styles.label}>{label}</Text>
        <ChevronRight size={18} color={theme.colorTextDisabled} />
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
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colorSurface,
    borderRadius: theme.radiusMedium,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    padding: theme.space3,
    minHeight: 44,
    gap: theme.space1,
  },
  pressed: {
    backgroundColor: theme.colorSurfaceSubtle,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    lineHeight: 22,
  },
  note: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    lineHeight: 16,
  },
});
