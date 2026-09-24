// Home's silhouette (D2-7 / CUL-1068): the shape of the Home that is coming, drawn from
// round 4 §01 — the header row, the Signal card with its rail and its chart, the look
// question with its chips as Today's header, the day's count line, the first nodes of
// the spine, and the tab bar at the app's size and place. The cold start ends on this
// and crossfades into Home (`ColdStartSilhouette.tsx`); nothing here animates.
//
// Silhouette-accurate, not pixel-exact: it borrows the real surfaces' paddings and the
// geometry they export (the header's avatar and padding from `lib/headerName`) so the
// crossfade lands on a screen that sits where the shape sat, and invents nothing else.
// The tab bar's height is HANDED IN by the host rather than imported: `NyxTabBar` pulls
// the pet avatar and, through it, the Supabase client into any module that imports it,
// and a wait's shape must not carry the app's data layer. The host (`ColdStartOverlay`)
// already lives where that layer is loaded, and passes the bar's one definition down.
import { StyleSheet, View } from 'react-native';
import { theme } from '../../../constants/theme';
import { HEADER_AVATAR_GAP, HEADER_AVATAR_SIZE, HEADER_PADDING_X } from '../../../lib/headerName';
import { Block, Line, SilhouetteFrame, Surface } from './Silhouette';

/** `HomeHeader`'s row: a 44pt row inside 6pt of vertical padding (its own constants). */
const HEADER_ROW_HEIGHT = 44 + 6 * 2;
/** The Signal card's rail: the rail's width (`RAIL_WIDTH`), a length of the card. */
const RAIL_WIDTH = 3;
/** The look's chips, in the round-4 frame's proportions (the widths carry no meaning). */
const CHIP_WIDTHS = [44, 84, 56, 92, 66] as const;
const CHIP_HEIGHT = 30;
/** Three nodes of the spine — enough to say "a day", never a firehose. */
const NODE_ROWS = ['46%', '58%', '40%'] as const;
const NODE_DOT = 8;
/** The tab bar's five slots. */
const TAB_SLOTS = 4;

export const HOME_SILHOUETTE_TEST_ID = 'design-v2-home-silhouette';

export interface HomeSilhouetteProps {
  /** The safe-area top, so the header row sits where `HomeHeader` puts it. */
  topInset?: number;
  /** `TAB_HEIGHT` from the host; omit to draw no bar (a body-only silhouette). */
  tabBarHeight?: number;
}

export function HomeSilhouette({ topInset = 0, tabBarHeight }: HomeSilhouetteProps) {
  return (
    <SilhouetteFrame testID={HOME_SILHOUETTE_TEST_ID} style={styles.fill}>
      {/* The header row: avatar, the pet's name, the date at the right. */}
      <View style={[styles.header, { paddingTop: topInset }]}>
        <View style={styles.headerRow}>
          <Block width={HEADER_AVATAR_SIZE} height={HEADER_AVATAR_SIZE} radius={theme.radiusFull} />
          <Line width={96} height={14} />
          <View style={styles.headerSpacer} />
          <Line width={64} height={10} />
        </View>
      </View>

      <View style={styles.body}>
        {/* The Signal card: the rail, a title, the chart, the week line. */}
        <Surface style={styles.signal}>
          <Block width={RAIL_WIDTH} height={96} radius={theme.radiusXS} style={styles.rail} />
          <View style={styles.signalBody}>
            <Line width="72%" height={16} />
            <Block height={64} />
            <Line width="52%" height={10} />
          </View>
        </Surface>

        {/* Today: the look question as its header, then the chips, then the count line. */}
        <Surface>
          <Line width="60%" height={14} />
          <View style={styles.chips}>
            {CHIP_WIDTHS.map((w, i) => (
              <Block key={i} width={w} height={CHIP_HEIGHT} radius={theme.radiusFull} />
            ))}
          </View>
          <Line width="54%" height={10} style={styles.countLine} />
          {/* The first nodes of the spine. */}
          {NODE_ROWS.map((w, i) => (
            <View key={i} style={styles.node}>
              <Block width={NODE_DOT} height={NODE_DOT} radius={theme.radiusFull} />
              <Line width={w} height={12} />
              <View style={styles.headerSpacer} />
              <Line width={48} height={10} />
            </View>
          ))}
        </Surface>
      </View>

      {/* The tab bar, at the app's place. */}
      {tabBarHeight != null && (
        <View style={[styles.tabBar, { height: tabBarHeight }]}>
          {Array.from({ length: TAB_SLOTS }, (_, i) => (
            <Block key={i} width={24} height={24} radius={theme.radiusSmall} />
          ))}
        </View>
      )}
    </SilhouetteFrame>
  );
}

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFill,
    backgroundColor: theme.colorNeutralLight,
  },
  header: {
    backgroundColor: theme.colorSurface,
    paddingHorizontal: HEADER_PADDING_X,
  },
  headerRow: {
    height: HEADER_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: HEADER_AVATAR_GAP,
  },
  headerSpacer: {
    flex: 1,
  },
  // Home's own scroll padding (`app/(tabs)/index.tsx` → `styles.scroll`).
  body: {
    flex: 1,
    padding: theme.space3,
    gap: theme.space3,
  },
  signal: {
    flexDirection: 'row',
    gap: theme.space2,
  },
  rail: {
    alignSelf: 'stretch',
  },
  signalBody: {
    flex: 1,
    gap: theme.space1,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space1,
    marginTop: theme.space1,
  },
  countLine: {
    marginTop: theme.space1,
  },
  node: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
    minHeight: 28,
  },
  tabBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-start',
    paddingTop: theme.space1,
    backgroundColor: theme.colorSurface,
    borderTopWidth: 1,
    borderTopColor: theme.colorBorder,
  },
});
