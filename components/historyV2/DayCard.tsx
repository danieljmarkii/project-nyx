// The day card (History v2, HV-7 / CUL-1164; spec §3.1, §3.5, rule C, rule L; round 5 of
// the mock).
//
// A card is TWO list cells, because its header is the section's sticky header (H-3 b): the
// header cell (the date, *Today*, the counts) sticks under the pinned row while any of its day
// is on screen and is pushed off by the next day's; the body cell holds the day's date-only
// items and rows. Each cell draws its half of one white card, and a landed day outlines both.
// The header cell's ground-coloured top gap is opaque, so rows scrolling under a stuck header
// never show above it.
//
// ── WHAT A CARD SAYS, AND WHERE IT COMES FROM ────────────────────────────────────
//   • The header's counts are `dayHeaderOf` (HV-4) over the day's facts, the population every
//     other count uses (R-1): the total, each symptom kind in rose ink, *other* entries, and
//     *meals not finished* in neutral grey (H-2), never rose. Under a filter the filtered
//     count leads and the day's total follows in the quieter ink; under a search, the date
//     alone (R-2). The date never wraps.
//   • Date-only items sit at the top of their day on the same thread, under every filter
//     (rule L, AC 11), never counted: a visit (a square, and a door to the visit), a course's
//     start (a short bar), a bowl's change. Never under a search: they are not rows it found.
//   • The rows are the shared row (`DayNodeRow`, HV-1/HV-6) over the day's nodes, which the
//     list builds for every loaded day at once (`historyNodesByDay`: the WHOLE day through the
//     pipeline Home calls, with the meals a line on another card measures from), then hidden
//     by the filter (R-2). A card never builds a row another way (`guards/dayRowOneWay`).
//   • Under Noticed the rows are the day's looks: the pipeline leaves looks out on purpose (a
//     look is Home's header, not a node), so a look is History's own line, like a date-only
//     item: the row's time column and rail (their widths are the row's), the hollow bead a
//     look wears on every spine (`nodeDotColors`), and the shared describer's words
//     (`describeDayEvent`). It is not a row frame, which only the row may draw.
import { Fragment } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { theme } from '../../constants/theme';
import { describeDayEvent } from '../../lib/dayEvents';
import {
  dayHeaderOf,
  type DateOnlyItem,
  type DayFacts,
  type DayHeaderPart,
  type HistoryFilter,
} from '../../lib/historyDays';
import type { HistoryRow } from '../../lib/historyQueries';
import type { DayNode } from '../../lib/dayNodes';
import { dateOnlyItemText, visibleNodesOf } from '../../lib/historyScreen';
import { recordWeekday } from '../../lib/recordDates';
import { DayNodeRow } from '../dayRow/DayNodeRow';
import { NODE_DOT_RING, NODE_DOT_SIZE, NODE_TINT_DAY, nodeDotColors } from '../recap/nodeTints';
import { RAIL_W, TIME_W, timeColumnText } from '../recap/DaySpine';
import { ThemedText } from '../ui/ThemedText';
import { LANDED_OUTLINE_WIDTH } from './GapLine';

/** The words today's open card says (§3.12): the day keeps its header and its own card. */
export const TODAY_NOTHING_YET = 'Nothing logged yet today.';

/** The card's hairline, and the landed outline (§3.1: 2pt teal ink). One border width in
 *  both states so landing changes a colour, never the geometry. */
const CARD_BORDER = LANDED_OUTLINE_WIDTH;

// ── The header ──────────────────────────────────────────────────────────────────

/** A header part's ink. Under a filter the day's total (the part after the filtered count,
 *  `dayHeaderOf`'s documented order) is the quieter one; a symptom is always the rose ink
 *  (C-1: the ink, never the bright rose, as text on white); an unfinished meal is neutral
 *  grey (H-2); a day with nothing logged says so in the quietest ink. */
function partColor(part: DayHeaderPart, index: number, filtered: boolean, empty: boolean): string {
  if (part.tone === 'symptom') return theme.colorEventSymptomInk;
  if (empty) return theme.colorTextTertiary;
  if (filtered && index === 1) return theme.colorTextTertiary;
  return theme.colorTextSecondary;
}

/** *8 logged*: the number carries the weight (the mock's `<b>8</b> logged`). */
function TotalPart({ text, color }: { text: string; color: string }) {
  const m = /^([\d,]+)(\s.*)$/.exec(text);
  if (!m) return <ThemedText style={[styles.countPart, { color }]}>{text}</ThemedText>;
  return (
    <ThemedText style={[styles.countPart, { color }]}>
      <ThemedText style={styles.countNumber}>{m[1]}</ThemedText>
      {m[2]}
    </ThemedText>
  );
}

export function DayCardHeader({
  day,
  today,
  facts,
  filter,
  search,
  landed,
  withCounts = true,
}: {
  day: string;
  today: string;
  facts: DayFacts;
  filter: HistoryFilter;
  search: boolean;
  landed: boolean;
  /** Off for today's open card, whose body says *Nothing logged yet today.* already. */
  withCounts?: boolean;
}) {
  const isToday = day === today;
  const parts = withCounts ? dayHeaderOf(facts, filter, { search, isToday }) : [];
  const filtered = filter.kind !== 'all';
  const empty = facts.total === 0;
  const date = recordWeekday(day, today) ?? day;
  return (
    <View style={styles.headerCell}>
      <View
        style={[styles.cardTop, landed && styles.cardLanded]}
        // One heading: the date and its counts read together, as the eye reads them.
        accessible
        accessibilityRole="header"
        testID={`history-day-header-${day}`}
      >
        <View style={styles.headerRow}>
          <ThemedText style={[styles.date, landed && styles.dateLanded]} numberOfLines={1}>
            {date}
            {isToday ? <ThemedText style={styles.todayTag}>{'  Today'}</ThemedText> : null}
          </ThemedText>
          {parts.length > 0 ? (
            <ThemedText style={styles.counts} testID={`history-day-counts-${day}`}>
              {parts.map((part, i) => {
                const color = partColor(part, i, filtered, empty);
                return (
                  <Fragment key={`${i}:${part.text}`}>
                    {i > 0 ? <ThemedText style={[styles.countPart, styles.countSep]}>{' · '}</ThemedText> : null}
                    {part.tone === 'total' ? (
                      <TotalPart text={part.text} color={color} />
                    ) : (
                      <ThemedText style={[styles.countPart, { color }]}>{part.text}</ThemedText>
                    )}
                  </Fragment>
                );
              })}
            </ThemedText>
          ) : null}
        </View>
      </View>
    </View>
  );
}

// ── The date-only items (rule L) ─────────────────────────────────────────────────

/** Where the spine's dot is centred from the row's top: `DaySpine`'s `DOT_TOP` (3) plus half
 *  the dot. Mirrored rather than imported (the frame keeps it private): the same question,
 *  "where does this row's mark sit on the thread", so the two cannot mean different things
 *  (C-34); change it with the frame. */
const MARK_CENTER_Y = 3 + NODE_DOT_SIZE / 2;
const THREAD_W = 2;
const MARK = 10;
const MARK_BAR_HEIGHT = 3;
const SQUARE_RADIUS = 3;
const SQUARE_RING = 1.5;

function ItemMark({ item }: { item: DateOnlyItem }) {
  if (item.kind === 'visit') return <View style={[styles.mark, styles.markSquare]} />;
  return (
    <View
      style={[
        styles.mark,
        styles.markBar,
        { backgroundColor: item.kind === 'bowl' ? theme.colorEventMeal : theme.colorEventMedication },
      ]}
    />
  );
}

function DateOnlyItemRow({
  item,
  isFirst,
  isLast,
  onOpenVisit,
}: {
  item: DateOnlyItem;
  isFirst: boolean;
  isLast: boolean;
  onOpenVisit: (visitId: string) => void;
}) {
  const { title, detail } = dateOnlyItemText(item);
  const label = detail ? `${title}, ${detail}` : title;
  const row = (
    <View style={[styles.itemRow, isLast ? styles.itemRowLast : styles.itemRowGap, item.kind === 'visit' && styles.itemRowFill]}>
      <View style={styles.itemTime} />
      <View style={styles.rail}>
        {!isFirst ? <View style={[styles.thread, styles.threadTop]} /> : null}
        {!isLast ? <View style={[styles.thread, styles.threadBottom]} /> : null}
        <ItemMark item={item} />
      </View>
      <View style={styles.itemBody}>
        {item.kind === 'visit' ? (
          <ThemedText style={styles.visitTitle}>
            {title}
            {detail ? <ThemedText style={styles.visitDetail}>{` · ${detail}`}</ThemedText> : null}
          </ThemedText>
        ) : (
          <ThemedText style={styles.markerText}>{title}</ThemedText>
        )}
      </View>
    </View>
  );
  if (item.kind !== 'visit') {
    return (
      <View accessible accessibilityLabel={label} testID={`history-item-${item.kind}-${item.day}`}>
        {row}
      </View>
    );
  }
  // A visit is a door to the visit (§3.10), with the 44pt floor every row keeps (GAP-9).
  return (
    <Pressable
      onPress={() => onOpenVisit(item.id)}
      accessibilityRole="button"
      accessibilityLabel={`${label}. Opens the visit`}
      style={({ pressed }) => [styles.visitDoor, pressed && styles.pressed]}
      testID={`history-item-visit-${item.id}`}
    >
      {row}
    </Pressable>
  );
}

// ── A look, under Noticed ────────────────────────────────────────────────────────

/** The look's bead: hollow, as on every spine (`nodeDotColors`, CUL-869). */
const LOOK_BEAD = nodeDotColors('look', NODE_TINT_DAY, theme.colorSurface);

function LookLine({ row, isFirst, isLast }: { row: HistoryRow; isFirst: boolean; isLast: boolean }) {
  // The shared describer: a HistoryRow is a TimelineRow, column for column (HV-4).
  const d = describeDayEvent(row);
  const label = `${d.title}${d.detail ? `, ${d.detail}` : ''}, ${d.time}. Opens details`;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/event/[id]', params: { id: row.id } })}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.lookDoor, pressed && styles.pressed]}
      testID={`history-look-${row.id}`}
    >
      <View style={[styles.itemRow, isLast ? styles.itemRowLast : styles.itemRowGap]}>
        <ThemedText style={styles.lookTime}>{timeColumnText(d.time)}</ThemedText>
        <View style={styles.rail}>
          {!isFirst ? <View style={[styles.thread, styles.threadTop]} /> : null}
          {!isLast ? <View style={[styles.thread, styles.threadBottom]} /> : null}
          <View style={[styles.mark, styles.lookBead, { backgroundColor: LOOK_BEAD.fill, borderColor: LOOK_BEAD.ring }]} />
        </View>
        <View style={styles.itemBody}>
          <ThemedText style={styles.lookTitle}>
            {d.title}
            {d.detail ? <ThemedText style={styles.lookDetail}>{` · ${d.detail}`}</ThemedText> : null}
          </ThemedText>
        </View>
      </View>
    </Pressable>
  );
}

// ── The body ────────────────────────────────────────────────────────────────────

export interface DayCardBodyProps {
  day: string;
  /** Date-only items, top of the day; empty under a search. */
  items: readonly DateOnlyItem[];
  /** The WHOLE day's nodes (`historyNodesByDay`); ignored under Noticed. */
  nodes: readonly DayNode[];
  /** The page's rows for the day: what the filter shows (under Noticed, the looks). */
  shownRows: readonly HistoryRow[];
  noticed: boolean;
  /** Runs open in place, by node id (per mount, never the record's). */
  openRuns: ReadonlySet<string>;
  onToggleRun: (id: string) => void;
  onOpenVisit: (visitId: string) => void;
  landed: boolean;
  /** Today's open card: the one line, and no rows. */
  emptyLine?: string | null;
}

export function DayCardBody({
  day,
  items,
  nodes: dayNodes,
  shownRows,
  noticed,
  openRuns,
  onToggleRun,
  onOpenVisit,
  landed,
  emptyLine = null,
}: DayCardBodyProps) {
  // A filter only hides (R-2): the day's nodes were built over the whole day.
  const nodes = noticed ? [] : visibleNodesOf(dayNodes, new Set(shownRows.map((r) => r.id)));
  const looks = noticed ? shownRows : [];
  const threadLength = items.length + nodes.length + looks.length;
  return (
    <View style={styles.bodyCell}>
      <View style={[styles.cardBottom, landed && styles.cardLanded]} testID={`history-day-body-${day}`}>
        {emptyLine ? <ThemedText style={styles.emptyLine}>{emptyLine}</ThemedText> : null}
        {items.map((item, i) => (
          <DateOnlyItemRow
            key={`${item.kind}:${item.kind === 'course-start' ? item.courseKey : item.id}`}
            item={item}
            isFirst={i === 0}
            isLast={i === threadLength - 1}
            onOpenVisit={onOpenVisit}
          />
        ))}
        {nodes.map((node, i) => (
          <DayNodeRow
            key={node.id}
            node={node}
            isFirst={items.length + i === 0}
            isLast={items.length + i === threadLength - 1}
            expanded={openRuns.has(node.id)}
            onToggle={onToggleRun}
          />
        ))}
        {looks.map((row, i) => (
          <LookLine key={row.id} row={row} isFirst={items.length + i === 0} isLast={items.length + i === threadLength - 1} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // ── The card's two halves ──
  headerCell: {
    // Opaque and the screen's ground: a stuck header covers the rows scrolling under it,
    // gap included.
    backgroundColor: theme.colorNeutralLight,
    paddingHorizontal: theme.space2,
    paddingTop: theme.space1,
  },
  cardTop: {
    backgroundColor: theme.colorSurface,
    borderTopLeftRadius: theme.radiusMedium,
    borderTopRightRadius: theme.radiusMedium,
    borderWidth: CARD_BORDER,
    borderBottomWidth: 0,
    borderColor: theme.colorBorder,
    // Round 5's header: the date a little in from the card's edge, close under its top.
    paddingHorizontal: theme.space1 + theme.space0_5,
    paddingTop: theme.space1 + theme.spaceMicro,
    paddingBottom: theme.space0_5,
  },
  bodyCell: {
    paddingHorizontal: theme.space2,
  },
  cardBottom: {
    backgroundColor: theme.colorSurface,
    borderBottomLeftRadius: theme.radiusMedium,
    borderBottomRightRadius: theme.radiusMedium,
    borderWidth: CARD_BORDER,
    borderTopWidth: 0,
    borderColor: theme.colorBorder,
    paddingHorizontal: theme.space1,
    paddingTop: theme.space1,
    paddingBottom: theme.space2,
  },
  cardLanded: { borderColor: theme.colorAccentInk },

  // ── The header ──
  headerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    columnGap: theme.space1,
    rowGap: theme.spaceMicro,
  },
  date: {
    fontSize: theme.textMD,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    flexShrink: 0,
  },
  dateLanded: { color: theme.colorAccentInk },
  todayTag: {
    fontSize: theme.textSM,
    fontWeight: theme.weightRegular,
    color: theme.colorTextTertiary,
  },
  counts: {
    fontSize: theme.textXS,
    lineHeight: theme.lineHeightXS,
    fontWeight: theme.weightRegular,
    color: theme.colorTextSecondary,
  },
  countPart: {
    fontSize: theme.textXS,
    fontWeight: theme.weightRegular,
  },
  countSep: { color: theme.colorTextTertiary },
  countNumber: {
    fontSize: theme.textXS,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
  },

  // ── Today, nothing yet ──
  emptyLine: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    fontWeight: theme.weightRegular,
    color: theme.colorTextSecondary,
    paddingHorizontal: theme.space1,
  },

  // ── The date-only items, on the row frame's geometry ──
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.space1,
  },
  itemRowGap: { paddingBottom: theme.space2 },
  itemRowLast: { paddingBottom: theme.spaceMicro },
  // Inside the visit's 44pt door the row grows with it, so the thread reaches the next row.
  itemRowFill: { flexGrow: 1 },
  itemTime: { width: TIME_W },
  rail: { width: RAIL_W, alignItems: 'center', alignSelf: 'stretch' },
  thread: {
    position: 'absolute',
    left: (RAIL_W - THREAD_W) / 2,
    width: THREAD_W,
    backgroundColor: theme.colorBorder,
  },
  threadTop: { top: 0, height: MARK_CENTER_Y },
  threadBottom: { top: MARK_CENTER_Y, bottom: 0 },
  mark: { zIndex: 1 },
  markSquare: {
    marginTop: MARK_CENTER_Y - MARK / 2,
    width: MARK,
    height: MARK,
    borderRadius: SQUARE_RADIUS,
    borderWidth: SQUARE_RING,
    borderColor: theme.colorTextTertiary,
    backgroundColor: theme.colorSurface,
  },
  markBar: {
    marginTop: MARK_CENTER_Y - MARK_BAR_HEIGHT / 2,
    width: MARK,
    height: MARK_BAR_HEIGHT,
    borderRadius: MARK_BAR_HEIGHT,
  },
  itemBody: { flex: 1, minWidth: 0 },
  visitDoor: { minHeight: 44, borderRadius: theme.radiusSmall },
  pressed: { backgroundColor: theme.colorSurfaceSubtle },
  visitTitle: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  visitDetail: {
    fontWeight: theme.weightRegular,
    color: theme.colorTextSecondary,
  },
  markerText: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    fontWeight: theme.weightRegular,
    color: theme.colorTextSecondary,
  },

  // ── A look ──
  // The whole line is the tap target, at the row's 44pt floor.
  lookDoor: { minHeight: 44, borderRadius: theme.radiusSmall },
  lookTime: {
    width: TIME_W,
    paddingTop: theme.spaceMicro,
    textAlign: 'right',
    fontSize: theme.textXS,
    fontVariant: ['tabular-nums'],
    color: theme.colorTextTertiary,
  },
  lookBead: {
    marginTop: MARK_CENTER_Y - NODE_DOT_SIZE / 2,
    width: NODE_DOT_SIZE,
    height: NODE_DOT_SIZE,
    borderRadius: NODE_DOT_SIZE / 2,
    borderWidth: NODE_DOT_RING,
  },
  lookTitle: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  lookDetail: {
    fontWeight: theme.weightRegular,
    color: theme.colorTextSecondary,
  },
});
