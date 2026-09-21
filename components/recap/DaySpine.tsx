// The day spine (B-762 / CUL-23, DR-1 §2.4) — the Daily Recap's timeline-as-list.
//
// The screen's centrepiece: the day rendered as a vertical thread of category-tinted
// nodes, earliest-first, each node a doorway into its own event (`/event/[id]`). It
// is presentational only — every row it draws is a `DaySummaryRow` the pure builder
// already shaped (title/detail + the B-568 wet/dry format tag via the shared
// `describeDayEvent` mapper, the optional fact-only sub-line, the category that picks
// the node tint). It computes nothing and judges nothing.
//
// TWO GROUNDS (D2-4 / CUL-1066). The recap is always-night (R-1) and that stays its
// default; Home's Design v2 spine draws the same thread on the day ground, so the
// GROUND is a prop and the two tint maps come from `nodeTints.ts` — the day tints are
// the ones DR-2's lane already reads, so a meal is the same teal and a symptom the same
// rose whether it is a bead on the night spine, a dot on the lane or a node on Home.
// The row CHROME — the time column, the rail, the thread, the ground-ringed dot — is
// `SpineRowFrame`, exported so Home's node renderer draws the same bead and thread and
// only its BODY differs (the compact line, the read, the photo glyph). One node
// language, two bodies; never two threads.
//
// The connecting thread is drawn per-row as two absolute line segments in the rail
// column (RN has no `::before`): a top segment (omitted on the first row) and a
// bottom segment (omitted on the last row), each meeting the node centre, with the
// ground-ringed dot painted on top. Adjacent rows' segments meet at the row boundary,
// so the thread reads continuous while the first dot has nothing above it and the last
// nothing below.
import { memo, useCallback, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { router } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import type { DaySummaryRow } from '../../lib/daySummary';
import type { EventTintCategory } from '../../lib/dayEvents';
import {
  NODE_TINT_DAY,
  NODE_TINT_NIGHT,
  NODE_DOT_SIZE,
  NODE_DOT_RING,
  nodeDotColors,
} from './nodeTints';
import { ThemedText } from '../ui/ThemedText';

export type SpineGround = 'night' | 'day';

// Geometry — the rail column that carries the dot + thread, and where the dot's
// centre sits from the row top (so the thread segments and the title line up). The dot
// SIZE + ring come from the shared node constants so the spine and DR-2's Home lane
// draw the same bead (nodeTints.ts).
const TIME_W = 56;
const RAIL_W = 18;
const DOT = NODE_DOT_SIZE;
const LINE_W = 2;
const DOT_TOP = 3; // marginTop lifting the dot to the title's first line
const DOT_CENTER_Y = DOT_TOP + DOT / 2;
const LINE_LEFT = (RAIL_W - LINE_W) / 2;

/** The per-ground colours the frame and the default body read. The night set is the
 *  shipped one, verbatim; the day set is Home's light ground (D2-4), where small
 *  informational text takes the secondary / tertiary INKS (C-1: the bright category
 *  tints are glyph tints, never text on a light ground). */
const GROUND = {
  night: {
    tints: NODE_TINT_NIGHT,
    ring: theme.colorBrandNight,
    thread: theme.colorBorderOnNight,
    // Muted (7.6:1), not faint (3.8:1) — the time is small INFORMATIONAL text, so it
    // must clear AA on the night ground, unlike a decorative glyph (night AA pass).
    time: theme.colorTextOnNightMuted,
    title: theme.colorTextOnNight,
    detail: theme.colorTextOnNightMuted,
    chevron: theme.colorTextOnNightMuted,
    pressed: theme.colorBrandNightElevated,
  },
  day: {
    tints: NODE_TINT_DAY,
    ring: theme.colorSurface,
    thread: theme.colorBorder,
    time: theme.colorTextTertiary,
    title: theme.colorTextPrimary,
    detail: theme.colorTextSecondary,
    chevron: theme.colorAccentInk,
    pressed: theme.colorSurfaceSubtle,
  },
} as const;

interface Props {
  rows: DaySummaryRow[];
  /** Overridable so the test drives navigation without a router mock. */
  onPressRow?: (id: string) => void;
  /** Night by default — the recap's own register (R-1). */
  ground?: SpineGround;
}

function DaySpineImpl({ rows, onPressRow, ground = 'night' }: Props) {
  return (
    <View style={styles.spine}>
      {rows.map((row, i) => (
        <SpineRow
          key={row.id}
          row={row}
          isFirst={i === 0}
          isLast={i === rows.length - 1}
          onPressRow={onPressRow}
          ground={ground}
        />
      ))}
    </View>
  );
}

export const DaySpine = memo(DaySpineImpl);

// ── The frame — the chrome every spine row shares ─────────────────────────────

export interface SpineRowFrameProps {
  ground: SpineGround;
  category: EventTintCategory;
  isFirst: boolean;
  isLast: boolean;
  /** The time column's text ("9:15 AM", "12:41 – 5:07 PM"). */
  time: string;
  /** The row's body — the caller's, laid to the right of the rail. */
  children: ReactNode;
  /** The trailing control's slot (a chevron, or nothing). */
  trailing?: ReactNode;
  /** Pressed-state styling, passed through from the enclosing Pressable. */
  pressed?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * The time, the rail with its thread and dot, and a body slot. Layout only — no
 * press handling, no navigation, no copy — so a caller decides what the row IS (a
 * doorway, a disclosure, a fact) and this decides only what a spine row LOOKS like.
 */
export function SpineRowFrame({
  ground,
  category,
  isFirst,
  isLast,
  time,
  children,
  trailing,
  pressed = false,
  style,
}: SpineRowFrameProps) {
  const g = GROUND[ground];
  // CUL-869 — fill and ring come from the shared rule rather than from this
  // component, so a look is the hollow bead on the spine that the lane already
  // draws (nodeTints.ts). `styles.dot` still supplies the geometry and every other
  // category's ground-coloured ring; this inverts exactly the two colours for a
  // look and touches no geometry, so nothing moves.
  const { fill, ring } = nodeDotColors(category, g.tints, g.ring);
  return (
    <View
      style={[
        styles.row,
        isLast ? styles.rowLast : styles.rowGap,
        pressed && { backgroundColor: g.pressed, borderRadius: theme.radiusSmall },
        style,
      ]}
    >
      <ThemedText style={[styles.time, { color: g.time }]} numberOfLines={1}>
        {time}
      </ThemedText>

      <View style={styles.rail}>
        {!isFirst && <View style={[styles.line, styles.lineTop, { backgroundColor: g.thread }]} />}
        {!isLast && <View style={[styles.line, styles.lineBottom, { backgroundColor: g.thread }]} />}
        <View style={[styles.dot, { backgroundColor: fill, borderColor: ring }]} />
      </View>

      <View style={styles.body}>{children}</View>

      {trailing}
    </View>
  );
}

// ── The recap's own row — a doorway into the event ────────────────────────────

function SpineRow({
  row,
  isFirst,
  isLast,
  onPressRow,
  ground,
}: {
  row: DaySummaryRow;
  isFirst: boolean;
  isLast: boolean;
  onPressRow?: (id: string) => void;
  ground: SpineGround;
}) {
  const g = GROUND[ground];
  const open = useCallback(() => {
    if (onPressRow) onPressRow(row.id);
    else router.push({ pathname: '/event/[id]', params: { id: row.id } });
  }, [onPressRow, row.id]);

  // Screen-reader order matches the visual order (title · detail · format-tag …
  // sub-line … time), so the row reads the way it looks. The tag is lowercased so it
  // is spoken as a word ("dry") rather than spelled out.
  const a11yLabel =
    `${row.title}` +
    `${row.detail ? `, ${row.detail}` : ''}` +
    `${row.formatTag ? `, ${row.formatTag.toLowerCase()}` : ''}` +
    `${row.subline ? `, ${row.subline}` : ''}` +
    `, ${row.time}. Opens details`;

  return (
    <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={a11yLabel}>
      {({ pressed }) => (
        <SpineRowFrame
          ground={ground}
          category={row.category}
          isFirst={isFirst}
          isLast={isLast}
          time={row.time}
          pressed={pressed}
          trailing={<ChevronRight size={15} color={g.chevron} strokeWidth={2} />}
        >
          <View style={styles.titleLine}>
            <ThemedText style={[styles.title, { color: g.title }]} numberOfLines={1}>
              {row.title}
              {/* geist-ok: nested span — differs from its parent only in colour, so it must stay a
                  raw <Text> and inherit the parent's resolved Geist face. A ThemedText here injects its
                  own family and breaks RN's native text cascade, shipping a face change mid-sentence
                  (CUL-607). */}
              {row.detail ? <Text style={{ color: g.detail }}> · {row.detail}</Text> : null}
            </ThemedText>
            {/* B-568 — the wet/dry variant, a sibling of the truncating title (never
                appended to it) so it survives a long prescription product name. Matches
                the drill-in (DayEventsSheet) / History (EventRow) register: one mapper,
                all surfaces name a food identically. */}
            {row.formatTag ? (
              <ThemedText style={[styles.formatTag, { color: g.detail }]} numberOfLines={1}>
                {row.formatTag}
              </ThemedText>
            ) : null}
          </View>
          {row.subline ? (
            <ThemedText style={[styles.sub, { color: g.detail }]}>{row.subline}</ThemedText>
          ) : null}
        </SpineRowFrame>
      )}
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

  time: {
    width: TIME_W,
    paddingTop: theme.spaceMicro,
    textAlign: 'right',
    fontSize: theme.textXS,
    fontVariant: ['tabular-nums'],
  },

  rail: { width: RAIL_W, alignItems: 'center' },
  line: {
    position: 'absolute',
    left: LINE_LEFT,
    width: LINE_W,
  },
  lineTop: { top: 0, height: DOT_CENTER_Y },
  lineBottom: { top: DOT_CENTER_Y, bottom: 0 },
  dot: {
    marginTop: DOT_TOP,
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    borderWidth: NODE_DOT_RING,
    // The ground-coloured ring makes the node read as a bead cutting the thread.
    zIndex: 1,
  },

  body: { flex: 1, minWidth: 0 },
  // Line 1 — the title (truncating) and the format tag (holding its width) as one
  // row, so the NAME absorbs the clip and the disambiguating tag always survives.
  titleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
  },
  title: {
    fontSize: theme.textSM,
    // flexShrink:1 (RN's default is 0) so the title yields to the format tag beside it.
    flexShrink: 1,
  },
  // B-568 — the wet/dry variant tag. Same tracked-uppercase register as the drill-in
  // (DayEventsSheet) / History (EventRow), so a food is named identically across the
  // three timeline surfaces. Muted (7.6:1), NOT faint — it is small INFORMATIONAL text
  // (it tells two identical-looking rows apart), so it must clear night AA like the
  // time and sub-line. flexShrink:0 holds its width so the title is what truncates.
  formatTag: {
    fontSize: theme.textXS,
    letterSpacing: theme.trackingWide,
    fontWeight: theme.weightMedium,
    flexShrink: 0,
  },
  sub: {
    fontSize: theme.textXS,
    // Muted (7.6:1) — "Trial diet" is informational small text, so it clears AA.
    marginTop: theme.spaceMicro,
  },
});
