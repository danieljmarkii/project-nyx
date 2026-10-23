// Food capture's wait (CUL-1910, the capture design round F4 / P3; mock
// `docs/culprit-capture-design-pass-mockups.html` §05, §16): the confirm screen's own
// shape while the label photos upload and are read. It replaces two retiring waits, a
// WhorlSpinner for the upload and the NightMoment for the read: from the owner's side the
// upload and the read are one request, so there is one wait and the tick never changes
// its name between them.
//
// The head is the hero, the tick named for its request, and the read card's lines. A host
// that paints its own head (the design pass draws the owner's real photo and the read card
// with the tick at its rail, so the read lands in place) passes `withHead={false}` and gets
// only the blocks below it: the Type chips and the commit.
import { StyleSheet, View } from 'react-native';
import { theme } from '../../../constants/theme';
import { FILTER_CHIP_MIN_HEIGHT } from '../../ui/FilterChip';
import { ThemedText } from '../../ui/ThemedText';
import { Block, Line, SilhouetteFrame, Surface } from './Silhouette';
import { Tick } from './Tick';

export const CAPTURE_SILHOUETTE_TEST_ID = 'design-v2-capture-silhouette';

/** The request the tick waits on, said once, the same through upload and read. */
export const CAPTURE_WAIT_LABEL = 'Reading the label…';

export interface CaptureSilhouetteProps {
  /** The upload-and-read request is in flight: the screen's own flag. */
  working: boolean;
  withHead?: boolean;
}

export function CaptureSilhouette({ working, withHead = true }: CaptureSilhouetteProps) {
  return (
    <View style={styles.fill}>
      {withHead ? (
        <>
          <SilhouetteFrame testID={`${CAPTURE_SILHOUETTE_TEST_ID}-hero`}>
            <Block height={0} radius={theme.radiusMedium} style={styles.hero} />
          </SilhouetteFrame>
          <View style={styles.line} accessible accessibilityRole="progressbar">
            <Tick working={working} />
            <ThemedText variant="caption" style={styles.label}>{CAPTURE_WAIT_LABEL}</ThemedText>
          </View>
        </>
      ) : null}
      <SilhouetteFrame testID={CAPTURE_SILHOUETTE_TEST_ID} style={styles.fill}>
        {withHead ? (
          <Surface>
            <Line width="70%" />
            <Line width="90%" />
            <Line width="55%" />
            <Line width="80%" />
          </Surface>
        ) : null}
        <View style={styles.chips}>
          <Block width="22%" height={FILTER_CHIP_MIN_HEIGHT} radius={theme.radiusFull} />
          <Block width="22%" height={FILTER_CHIP_MIN_HEIGHT} radius={theme.radiusFull} />
          <Block width="22%" height={FILTER_CHIP_MIN_HEIGHT} radius={theme.radiusFull} />
        </View>
        <Block height={theme.space5} radius={theme.radiusMedium} />
      </SilhouetteFrame>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    gap: theme.space2,
  },
  hero: {
    aspectRatio: 4 / 3,
    height: undefined,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
  },
  label: {
    color: theme.colorTextSecondary,
  },
  chips: {
    flexDirection: 'row',
    gap: theme.space1,
  },
});
