// The day ledger (TS-2, CUL-1298; spec §3.5, §6). Draws `lib/trialLedger`'s model
// and decides nothing: every fill, count and label arrives computed. The host
// (TS-4) owns the caption and the blind-spot qualifier, which sit on the card this
// grid shares with the facts, at its foot, once (§3.5, §5.2 LOCKED).
//
// S5 in pixels: no percentage, streak, tick or score; a gap is hollow and
// unshamed; the off-diet mark is INK, never rose (a slip is a record, not an
// alarm); every row carries its count.
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, type ViewStyle } from 'react-native';
import { theme } from '../../constants/theme';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import {
  TRIAL_LEDGER_LEGEND_TEXT,
  type TrialLedger as TrialLedgerModel,
  type TrialLedgerDay,
  type TrialLedgerFill,
} from '../../lib/trialLedger';
import { ThemedText } from '../ui/ThemedText';

/** Round 2's cell (19px) and the lane's (16px). Geometry of a drawing, not layout rhythm. */
export const LEDGER_CELL_SIZE = 19;
export const LANE_CELL_SIZE = 16;
const LEGEND_CELL_SIZE = 11;
/** The week label column, so every row's cells start on one vertical. */
const WEEK_COLUMN_WIDTH = 36;
/** The fade-and-settle's travel. One settle for the whole grid, never per cell:
 *  "56 marks popping in would read as a celebration" (§0.3, Motion). */
const SETTLE_DISTANCE = 4;

interface LedgerCellProps {
  fill: TrialLedgerFill;
  offDiet: boolean;
  size: number;
  testID?: string;
}

/** One day. Shared with `ThisWeekLane`, so the lane speaks the ledger's own vocabulary (§5.1). */
export function LedgerCell({ fill, offDiet, size, testID }: LedgerCellProps) {
  const dot = Math.round(size * 0.37);
  return (
    <View
      testID={testID}
      style={[styles.cell, { width: size, height: size }, FILL_STYLES[fill]]}
    >
      {offDiet ? (
        <View
          testID={testID ? `${testID}-offdiet` : undefined}
          style={[styles.dot, { width: dot, height: dot, borderRadius: dot / 2 }]}
        />
      ) : null}
    </View>
  );
}

export interface TrialLedgerProps {
  ledger: TrialLedgerModel;
}

export function TrialLedger({ ledger }: TrialLedgerProps) {
  const reduced = useReducedMotion();
  const opacity = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const settle = useRef(new Animated.Value(reduced ? 0 : SETTLE_DISTANCE)).current;

  useEffect(() => {
    if (reduced) return undefined;
    const anim = Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: theme.durationMedium, useNativeDriver: true }),
      Animated.timing(settle, { toValue: 0, duration: theme.durationMedium, useNativeDriver: true }),
    ]);
    anim.start();
    return () => anim.stop();
    // Draws in ONCE, on arrival (§6). A redraw of the model is not an arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View
      testID="trial-ledger"
      accessible
      accessibilityRole="image"
      accessibilityLabel={ledger.accessibilityLabel}
      style={[styles.ledger, { opacity, transform: [{ translateY: settle }] }]}
    >
      <ThemedText style={styles.edge}>{ledger.startLabel}</ThemedText>
      {ledger.rows.map((row, i) => (
        <React.Fragment key={row.week}>
          <View style={styles.row} testID={`trial-ledger-row-${row.week}`}>
            <View style={styles.weekColumn}>
              <ThemedText style={styles.weekLabel}>{row.label}</ThemedText>
              <ThemedText style={styles.weekDate}>{row.firstDate}</ThemedText>
            </View>
            <View style={styles.cells}>
              {row.days.map((d: TrialLedgerDay) => (
                <LedgerCell
                  key={d.dayIndex}
                  fill={d.fill}
                  offDiet={d.offDiet}
                  size={LEDGER_CELL_SIZE}
                  testID={`trial-ledger-day-${d.trialDay}`}
                />
              ))}
            </View>
            <ThemedText style={styles.count}>{row.countLabel ?? ''}</ThemedText>
          </View>
          {i === ledger.endAfterRowIndex ? (
            <ThemedText style={[styles.edge, styles.endEdge]} testID="trial-ledger-end">
              {ledger.endLabel}
            </ThemedText>
          ) : null}
        </React.Fragment>
      ))}
      <View style={styles.legend}>
        {ledger.legend.map((key) => (
          <View key={key} style={styles.legendItem}>
            <LedgerCell
              fill={key === 'off_diet' ? 'meals_logged' : key}
              offDiet={key === 'off_diet'}
              size={LEGEND_CELL_SIZE}
            />
            <ThemedText style={styles.legendText}>{TRIAL_LEDGER_LEGEND_TEXT[key]}</ThemedText>
          </View>
        ))}
      </View>
    </Animated.View>
  );
}

const FILL_STYLES: Record<TrialLedgerFill, ViewStyle> = StyleSheet.create({
  // Teal as a FILL on a light ground: a glyph, held to the 3:1 non-text target (C-1).
  meals_logged: { backgroundColor: theme.colorAccent },
  // Hollow and unshamed. The border is the nearest token to round 2's grey edge;
  // a mark's edge, not text.
  none_logged: {
    backgroundColor: theme.colorSurface,
    borderWidth: 1.5,
    borderColor: theme.colorTextDisabled,
  },
  today_open: {
    backgroundColor: theme.colorSurface,
    borderWidth: 1.5,
    borderStyle: 'dashed' as const,
    borderColor: theme.colorAccent,
  },
  // A neutral fill, distinct from the hollow gap: these days were not the owner's
  // to log (§10 S3), so they must not read as missed ones.
  not_tracked: { backgroundColor: theme.colorBorderStrong },
  not_reached: { backgroundColor: theme.colorSurfaceSubtle },
});

const styles = StyleSheet.create({
  ledger: { gap: theme.space0_5 },
  edge: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    paddingLeft: WEEK_COLUMN_WIDTH + theme.space0_5,
  },
  endEdge: {
    borderTopWidth: 1,
    borderTopColor: theme.colorTextTertiary,
    paddingTop: theme.spaceMicro,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.space0_5 },
  weekColumn: { width: WEEK_COLUMN_WIDTH },
  weekLabel: { fontSize: theme.textXS, color: theme.colorTextSecondary },
  weekDate: { fontSize: theme.textXS, color: theme.colorTextTertiary },
  cells: { flexDirection: 'row', gap: theme.space0_5 },
  count: {
    flex: 1,
    textAlign: 'right',
    fontSize: theme.textXS,
    color: theme.colorTextSecondary,
  },
  cell: {
    borderRadius: theme.radiusXS,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // INK, never rose (S5). The ring keeps the dot legible on the teal fill.
  dot: {
    backgroundColor: theme.colorTextPrimary,
    borderWidth: 1.5,
    borderColor: theme.colorSurface,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: theme.space1,
    rowGap: theme.space0_5,
    paddingTop: theme.space0_5,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: theme.space0_5 },
  legendText: { fontSize: theme.textXS, color: theme.colorTextTertiary },
});
