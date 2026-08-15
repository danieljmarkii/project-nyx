// The Home recap band's compact day lane (B-762 / CUL-25, DR-2 §3) — the horizontal
// cousin of the night day spine (`DaySpine.tsx`).
//
// Category-tinted dots at their real times over a fixed 6a→12a track, on Home's LIGHT
// ground. Presentational only: the pure `buildTodayLane` decides each dot's category and
// position; this paints them. It shares the spine's node LANGUAGE through nodeTints.ts —
// `NODE_TINT_DAY` (the light-ground hues) and the `NODE_DOT_*` geometry — so the glance
// and the evening read are the same bead at two sizes and cannot drift.
//
// A11y: the lane is a visual glance with no text of its own worth announcing (the axis
// reads "6a noon 6p 12a" and the dots have no label). Its semantic content is the count
// line beside it, so the whole lane is hidden from the screen reader — the count line and
// the rows carry the meaning.
import { memo } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { theme } from '../../constants/theme';
import type { LaneDot } from '../../lib/todayLane';
import { NODE_TINT_DAY, NODE_DOT_SIZE, NODE_DOT_RING } from './nodeTints';

// Keep the extreme-position dots (6am / midnight) fully on-card: the plot is inset by
// half a dot on each side, and each dot is centred on its point via a negative margin.
const INSET = NODE_DOT_SIZE / 2 + NODE_DOT_RING;
const TRACK_W = 2;
const TIME_LABELS = ['6a', 'noon', '6p', '12a'];

function DayLaneImpl({ dots }: { dots: LaneDot[] }) {
  return (
    <View
      style={styles.lane}
      // The dots + axis are decorative-adjacent; the count line is the accessible summary.
      accessibilityElementsHidden={Platform.OS === 'ios'}
      importantForAccessibility="no-hide-descendants"
    >
      <View style={styles.plot}>
        <View style={styles.track} />
        {dots.map((dot) => (
          <View
            key={dot.key}
            testID="lane-dot"
            style={[
              styles.dot,
              { left: `${dot.position * 100}%`, backgroundColor: NODE_TINT_DAY[dot.category] },
            ]}
          />
        ))}
      </View>
      <View style={styles.times}>
        {TIME_LABELS.map((t) => (
          <Text key={t} style={styles.timeLabel}>
            {t}
          </Text>
        ))}
      </View>
    </View>
  );
}

export const DayLane = memo(DayLaneImpl);

const styles = StyleSheet.create({
  lane: { marginTop: theme.space1 },
  // The plot carries the track + dots; inset so a dot at position 0 or 1 stays on-card.
  plot: {
    position: 'relative',
    height: NODE_DOT_SIZE,
    marginHorizontal: INSET,
  },
  track: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: (NODE_DOT_SIZE - TRACK_W) / 2,
    height: TRACK_W,
    borderRadius: TRACK_W,
    backgroundColor: theme.colorBorder,
  },
  dot: {
    position: 'absolute',
    top: 0,
    width: NODE_DOT_SIZE,
    height: NODE_DOT_SIZE,
    borderRadius: NODE_DOT_SIZE / 2,
    borderWidth: NODE_DOT_RING,
    // The card-coloured ring reads the dot as a bead cutting the track (the spine's
    // ground-ring, on the light card ground).
    borderColor: theme.colorSurface,
    // Centre the dot on its point (its `left` is the point; shift back half its width).
    marginLeft: -(NODE_DOT_SIZE / 2),
  },
  times: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: INSET,
    marginTop: theme.space0_5 + theme.spaceMicro, // 6
  },
  timeLabel: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    fontVariant: ['tabular-nums'],
  },
});
