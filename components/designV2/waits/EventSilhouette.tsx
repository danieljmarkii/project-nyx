// The event screen's silhouette (D2-7 / CUL-1068): the shape of a record that is being
// read off local storage — the header with its back chevron and the title and time
// lines, the photo hero at its own height, the read card with a still tick beside a
// line, and the observation grid's card waiting below. Round-2 archive §06 ("Current ·
// the event screen, reading"), minus the breathing: the local-row read is a FETCH, not a
// request (the arrival's own distinction), so the tick here is a still block and the
// breathing one appears only once the read section is waiting on the server.
import { StyleSheet, View } from 'react-native';
import { theme } from '../../../constants/theme';
import { EVENT_HERO_HEIGHT } from '../../../lib/eventPhoto';
import { Block, Line, SilhouetteFrame, Surface } from './Silhouette';
import { TICK_MOTION } from './Tick';

export const EVENT_SILHOUETTE_TEST_ID = 'design-v2-event-silhouette';

const CHEVRON = 24;

export function EventSilhouette() {
  return (
    <SilhouetteFrame testID={EVENT_SILHOUETTE_TEST_ID} style={styles.fill}>
      <View style={styles.header}>
        <Block width={CHEVRON} height={CHEVRON} radius={theme.radiusSmall} />
        <View style={styles.headerCopy}>
          <Line width="40%" height={16} />
          <Line width="30%" height={10} />
        </View>
      </View>

      <View style={styles.body}>
        <Block height={EVENT_HERO_HEIGHT} radius={theme.radiusMedium} />

        {/* The read card: a still tick beside the pending line. */}
        <Surface style={styles.readCard}>
          <Block width={TICK_MOTION.width} height={TICK_MOTION.height} radius={TICK_MOTION.radius} />
          <Line width="46%" height={10} />
        </Surface>

        {/* The observation grid waits below, quieter. */}
        <Surface style={styles.muted}>
          <Line width="40%" height={9} />
          <Line width="80%" height={8} />
        </Surface>
      </View>
    </SilhouetteFrame>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: theme.colorSurface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
    paddingHorizontal: theme.space2,
    minHeight: 44,
  },
  headerCopy: {
    flex: 1,
    gap: theme.spaceMicro + 2,
  },
  body: {
    padding: theme.space2,
    gap: theme.space2,
  },
  readCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderStyle: 'dashed',
    backgroundColor: theme.colorSurfaceSubtle,
  },
  muted: {
    opacity: 0.6,
  },
});
