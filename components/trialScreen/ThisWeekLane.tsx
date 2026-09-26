// This week's lane (TS-2, CUL-1298; spec §5.1): the ledger's current row, drawn
// under Home's strip. It takes the lane `thisWeekLane` returns — the SAME row object
// the ledger holds — so the two cannot disagree.
//
// It draws whatever it is handed. WHETHER to hand it one is the host's (TS-5): only
// with no withholding reason, facts fresh for the strip's pet, and no live
// safety-class card above the strip. A refusing cat must never get seven tidy marks
// (§12 finding 1).
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { theme } from '../../constants/theme';
import type { TrialLane } from '../../lib/trialLedger';
import { ThemedText } from '../ui/ThemedText';
import { LANE_CELL_SIZE, LedgerCell } from './TrialLedger';

export interface ThisWeekLaneProps {
  lane: TrialLane;
}

export function ThisWeekLane({ lane }: ThisWeekLaneProps) {
  return (
    <View
      testID="trial-lane"
      accessible
      accessibilityRole="image"
      accessibilityLabel={lane.accessibilityLabel}
      style={styles.lane}
    >
      {lane.row.days.map((d) => (
        <LedgerCell
          key={d.dayIndex}
          fill={d.fill}
          offDiet={d.offDiet}
          size={LANE_CELL_SIZE}
          testID={`trial-lane-day-${d.trialDay}`}
        />
      ))}
      <ThemedText style={styles.label}>{lane.label}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  lane: { flexDirection: 'row', alignItems: 'center', gap: theme.space0_5 },
  label: {
    fontSize: theme.textXS,
    color: theme.colorTextSecondary,
    marginLeft: theme.space0_5,
  },
});
