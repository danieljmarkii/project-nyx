// The day spine (B-762 / CUL-23, DR-1 §2.4) — the Daily Recap's timeline-as-list.
//
// The screen's centrepiece: the day rendered as a vertical thread of category-tinted
// nodes, earliest-first, each node a doorway into its own event (`/event/[id]`). It
// is presentational only — every row it draws is a `DaySummaryRow` the pure builder
// already shaped (title/detail via the shared `describeDayEvent` mapper, the optional
// fact-only sub-line, the category that picks the node tint). It computes nothing and
// judges nothing.
//
// NIGHT-ONLY. The recap is always-night (R-1), so the spine reads the night tokens
// directly; DR-2's horizontal lane is its own component and shares only the tint
// CONSTANTS (`NODE_TINT_NIGHT`/`NODE_TINT_DAY`, `nodeTints.ts`) so the two node
// languages cannot drift.
//
// The connecting thread is drawn per-row as two absolute line segments in the rail
// column (RN has no `::before`): a top segment (omitted on the first row) and a
// bottom segment (omitted on the last row), each meeting the node centre, with the
// ground-ringed dot painted on top. Adjacent rows' segments meet at the row boundary,
// so the thread reads continuous while the first dot has nothing above it and the last
// nothing below.
import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import type { DaySummaryRow } from '../../lib/daySummary';
import { NODE_TINT_NIGHT } from './nodeTints';

// Geometry — the rail column that carries the dot + thread, and where the dot's
// centre sits from the row top (so the thread segments and the title line up).
const TIME_W = 56;
const RAIL_W = 18;
const DOT = 11;
const LINE_W = 2;
const DOT_TOP = 3; // marginTop lifting the dot to the title's first line
const DOT_CENTER_Y = DOT_TOP + DOT / 2;
const LINE_LEFT = (RAIL_W - LINE_W) / 2;

interface Props {
  rows: DaySummaryRow[];
  /** Overridable so the test drives navigation without a router mock. */
  onPressRow?: (id: string) => void;
}

function DaySpineImpl({ rows, onPressRow }: Props) {
  return (
    <View style={styles.spine}>
      {rows.map((row, i) => (
        <SpineRow
          key={row.id}
          row={row}
          isFirst={i === 0}
          isLast={i === rows.length - 1}
          onPressRow={onPressRow}
        />
      ))}
    </View>
  );
}

export const DaySpine = memo(DaySpineImpl);

function SpineRow({
  row,
  isFirst,
  isLast,
  onPressRow,
}: {
  row: DaySummaryRow;
  isFirst: boolean;
  isLast: boolean;
  onPressRow?: (id: string) => void;
}) {
  const open = useCallback(() => {
    if (onPressRow) onPressRow(row.id);
    else router.push({ pathname: '/event/[id]', params: { id: row.id } });
  }, [onPressRow, row.id]);

  // Screen-reader order matches the visual order (title · detail … sub-line … time),
  // so the row reads the way it looks.
  const a11yLabel =
    `${row.title}` +
    `${row.detail ? `, ${row.detail}` : ''}` +
    `${row.subline ? `, ${row.subline}` : ''}` +
    `, ${row.time}. Opens details`;

  return (
    <Pressable
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      style={({ pressed }) => [
        styles.row,
        isLast ? styles.rowLast : styles.rowGap,
        pressed && styles.rowPressed,
      ]}
    >
      <Text style={styles.time} numberOfLines={1}>
        {row.time}
      </Text>

      <View style={styles.rail}>
        {!isFirst && <View style={[styles.line, styles.lineTop]} />}
        {!isLast && <View style={[styles.line, styles.lineBottom]} />}
        <View style={[styles.dot, { backgroundColor: NODE_TINT_NIGHT[row.category] }]} />
      </View>

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>
          {row.title}
          {row.detail ? <Text style={styles.detail}> · {row.detail}</Text> : null}
        </Text>
        {row.subline ? <Text style={styles.sub}>{row.subline}</Text> : null}
      </View>

      <ChevronRight size={15} color={theme.colorTextOnNightMuted} strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  spine: {},
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.space1,
    // The whole row is the tap target. `minHeight` bounds the border-box (padding
    // sits INSIDE it in Yoga), so a plain single-line row would otherwise fall to
    // ~40pt regardless of the gap below — under the 44pt floor, and worst on the LAST
    // row (the most recent event, the likeliest tap). 44 clears it unconditionally on
    // every row without a hitSlop that would overlap the adjacent row's target.
    minHeight: 44,
  },
  rowGap: { paddingBottom: theme.space2 },
  rowLast: { paddingBottom: theme.spaceMicro },
  rowPressed: { backgroundColor: theme.colorBrandNightElevated, borderRadius: theme.radiusSmall },

  time: {
    width: TIME_W,
    paddingTop: theme.spaceMicro,
    textAlign: 'right',
    fontSize: theme.textXS,
    // Muted (7.6:1), not faint (3.8:1) — the time is small INFORMATIONAL text, so it
    // must clear AA on the night ground, unlike a decorative glyph (night AA pass).
    color: theme.colorTextOnNightMuted,
    fontVariant: ['tabular-nums'],
  },

  rail: { width: RAIL_W, alignItems: 'center' },
  line: {
    position: 'absolute',
    left: LINE_LEFT,
    width: LINE_W,
    backgroundColor: theme.colorBorderOnNight,
  },
  lineTop: { top: 0, height: DOT_CENTER_Y },
  lineBottom: { top: DOT_CENTER_Y, bottom: 0 },
  dot: {
    marginTop: DOT_TOP,
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    borderWidth: 2,
    // The ground-coloured ring makes the node read as a bead cutting the thread.
    borderColor: theme.colorBrandNight,
    zIndex: 1,
  },

  body: { flex: 1, minWidth: 0 },
  title: {
    fontSize: theme.textSM,
    color: theme.colorTextOnNight,
  },
  detail: { color: theme.colorTextOnNightMuted },
  sub: {
    fontSize: theme.textXS,
    // Muted (7.6:1) — "Trial diet" is informational small text, so it clears AA.
    color: theme.colorTextOnNightMuted,
    marginTop: theme.spaceMicro,
  },
});
