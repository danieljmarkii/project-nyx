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
//
// A DISCLOSED EXCEPTION to the Data Visualization Designer's floor ("no strip under ~20pt
// per mark on a phone", docs/personas.md § Specialist lenses). Seven ticks under a 26pt
// bar are ~3pt each and a 55-day strip is ~4pt a day. The floor is written for a mark
// that CARRIES a fact the reader must pick out (a dot per episode); a coverage tick
// carries none on its own — the fact is the count in words: "logged 8 of 10 days" beside
// the compare's strip, "N days so far" over the weekly chart's partial week, and every
// week's "N of 7" in the spoken label — and the strip is the texture that lets a thin
// week LOOK thin at a glance. Round 4 §04 / §05 draws exactly this density and the PM ruled that table the
// standard; the code-reviewer on CUL-1064 asked that the exception be recorded rather
// than left implicit, which is this paragraph. If a surface ever needs a tick to be read
// on its own, it needs a wider strip or a coarser one, not a smaller floor.

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
