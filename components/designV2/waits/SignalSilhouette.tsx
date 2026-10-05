// The Signal screen's silhouette (CUL-1075, after D2-7 / CUL-1068): the shape of the
// screen that is coming while its model loads — the title line, the weekly bars block,
// the sentence, and the compare block, in the order `SignalScreen`'s body draws them.
// It replaces the `WhorlSpinner` the route first shipped with (lane 1), because a
// sub-second local read is a silhouette's wait, never a spinner's, and the whorl was a
// second loop on the Design v2 surfaces (`guards/designV2OneLoop.test.ts`).
//
// Two shapes, one module: the full screen for a cold open, and the lower half alone
// (`withHead={false}`) when the card's flight has already handed over the real title and
// the chart's slot, so the silhouette never draws a placeholder over a chart that has
// arrived. Nothing here animates, and the frame is one hidden accessibility unit.
import { StyleSheet, View } from 'react-native';
import { theme } from '../../../constants/theme';
import { Block, Line, SilhouetteFrame, Surface } from './Silhouette';

export const SIGNAL_SILHOUETTE_TEST_ID = 'design-v2-signal-silhouette';

/** The weekly bars, in the card's proportions (the heights carry no meaning). */
const BAR_HEIGHTS = [40, 64, 28, 52, 72, 36, 58] as const;
const BAR_WIDTH = 14;
const BARS_HEIGHT = 96;

export interface SignalSilhouetteProps {
  /** Draw the title line and the bars block. Off when the flight already put them up. */
  withHead?: boolean;
}

export function SignalSilhouette({ withHead = true }: SignalSilhouetteProps) {
  return (
    <SilhouetteFrame testID={SIGNAL_SILHOUETTE_TEST_ID} style={withHead ? styles.screen : styles.below}>
      {withHead ? (
        <>
          <Line width="72%" height={theme.lineHeightSignal - 8} />
          <View style={styles.bars}>
            {BAR_HEIGHTS.map((h, i) => (
              <Block key={i} width={BAR_WIDTH} height={h} radius={theme.radiusXS} />
            ))}
          </View>
        </>
      ) : null}
      {/* The sentence: two lines of prose, the second shorter. */}
      <View style={styles.sentence}>
        <Line width="92%" height={14} />
        <Line width="64%" height={14} />
      </View>
      {/* The compare block: a label and two bars, this window against the last. */}
      <Surface>
        <Line width="40%" height={10} />
        <Block width="78%" height={12} radius={theme.radiusXS} />
        <Block width="46%" height={12} radius={theme.radiusXS} />
      </Surface>
    </SilhouetteFrame>
  );
}

const styles = StyleSheet.create({
  screen: {
    padding: theme.space2,
    gap: theme.space3,
  },
  below: {
    gap: theme.space3,
  },
  bars: {
    height: BARS_HEIGHT,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  sentence: {
    gap: theme.space1,
  },
});
