import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../constants/theme';
import { Sparkline } from '../dashboard/Sparkline';
import type { AskComponentDescriptor } from '../../lib/ask';

// The typed component-descriptor renderer (§5.4). The `ask` Edge Function returns a
// typed descriptor whose `data` it built from a deterministic tool result — never
// markup, never a model-authored number — and the client renders it with EXISTING
// chart components so an Ask answer looks like a card the app drew itself (because the
// data pipeline is the same one Patterns/Trend use). This component owns ONLY layout:
// it never computes or reshapes a number, so it can't introduce a stat the server
// didn't already vouch for.
//
// The server today emits `spark` (weight series → the Trend sparkline) and `ranked`
// (top foods / proteins / time-of-day bands → a normalized bar list). `tiles` and
// `pips` are in the contract for future tools and rendered defensively; an unknown or
// malformed descriptor renders nothing (the headline + provenance still stand).
export function AskAnswerComponent({ descriptor }: { descriptor: AskComponentDescriptor }) {
  switch (descriptor.kind) {
    case 'spark':
      // The weight/trend line — accent, shape-only (no axes), same as the Trend card.
      return descriptor.data.length >= 2 ? (
        <View style={styles.sparkWrap}>
          <Sparkline data={descriptor.data} color={theme.colorAccent} width={260} height={72} />
        </View>
      ) : null;

    case 'ranked':
      return <RankedBars data={descriptor.data} />;

    case 'tiles':
      return (
        <View style={styles.tiles}>
          {descriptor.data.map((t, i) => (
            <View key={`${t.label}-${i}`} style={styles.tileRow}>
              <Text style={styles.tileLabel}>{t.label}</Text>
              <Text style={styles.tileValue}>{t.value}</Text>
            </View>
          ))}
        </View>
      );

    case 'pips':
      // No shipped tool emits `pips` yet; render nothing rather than guess a shape.
      return null;

    default:
      return null;
  }
}

// A ranked bar list (mock §3): each row pairs the (wrapping) label with a bar whose
// fill = its share of the busiest row's count, and the absolute count on the right.
// A descriptive ranking, never a verdict — the label carries no "preference"/"favorite"
// framing (intake ≠ preference lives on the server; this only lays out counts).
function RankedBars({ data }: { data: { label: string; count: number }[] }) {
  const max = data.reduce((m, d) => (d.count > m ? d.count : m), 0);
  return (
    <View style={styles.ranked}>
      {data.map((row, i) => {
        const fraction = max > 0 ? row.count / max : 0;
        return (
          <View key={`${row.label}-${i}`} style={styles.rankRow}>
            <View style={styles.rankHead}>
              <Text style={styles.rankLabel} numberOfLines={2}>
                {row.label}
              </Text>
              <Text style={styles.rankCount}>{row.count}</Text>
            </View>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { flex: fraction }]} />
              <View style={{ flex: 1 - fraction }} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  sparkWrap: {
    marginTop: theme.space2,
    alignItems: 'stretch',
  },
  ranked: {
    marginTop: theme.space2,
    gap: theme.space2,
  },
  rankRow: {
    gap: 6,
  },
  rankHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.space2,
  },
  rankLabel: {
    flex: 1,
    fontFamily: theme.fontBody,
    fontSize: theme.textMD,
    lineHeight: 20,
    color: theme.colorTextPrimary,
  },
  rankCount: {
    fontFamily: theme.fontBodySemibold,
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
    flexShrink: 0,
  },
  barTrack: {
    flexDirection: 'row',
    height: 8,
    borderRadius: theme.radiusFull,
    backgroundColor: theme.colorChartEmpty,
    overflow: 'hidden',
  },
  barFill: {
    backgroundColor: theme.colorAccentSoft,
  },
  tiles: {
    marginTop: theme.space2,
  },
  tileRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: theme.space2,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colorBorder,
  },
  tileLabel: {
    fontFamily: theme.fontBody,
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },
  tileValue: {
    fontFamily: theme.fontBodySemibold,
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
    textAlign: 'right',
  },
});
