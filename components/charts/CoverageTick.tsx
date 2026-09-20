import { StyleSheet, View } from 'react-native';
import { theme } from '../../constants/theme';

// CoverageTick — one day's coverage under a bar (CUL-1064, §05 "the denominator in
// view"). Filled = logged, hollow = unlogged, ahead = the slot is held but nothing is
// drawn (a day that has not happened is not a day nobody logged). Shared by the weekly
// bars (seven per week) and the compare (one per window day), so the two strips can
// never disagree about what a filled tick means.
//
// Colour is never the only carrier here: the strip's sibling text says "logged N of M"
// and the chart's accessibility label speaks the same numbers. The tick is the shape of
// that sentence, not a second source of it.

export type CoverageTickState = 'logged' | 'unlogged' | 'ahead';

interface Props {
  state: CoverageTickState;
  testID?: string;
}

export function CoverageTick({ state, testID }: Props) {
  return (
    <View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.tick, state === 'logged' && styles.logged, state === 'unlogged' && styles.unlogged, state === 'ahead' && styles.ahead]}
    />
  );
}

export const TICK_HEIGHT = 3;

const styles = StyleSheet.create({
  tick: {
    flex: 1,
    height: TICK_HEIGHT,
    borderRadius: 1,
    minWidth: 1,
  },
  logged: {
    backgroundColor: theme.colorAccentSoft,
  },
  unlogged: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: theme.colorTickIdle,
    backgroundColor: 'transparent',
  },
  ahead: {
    backgroundColor: 'transparent',
  },
});
