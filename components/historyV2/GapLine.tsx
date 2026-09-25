// The lines between day cards (History v2, HV-7 / CUL-1164; spec §3.5, §3.12, R-1; round 5
// of the mock).
//
// Three kinds, each saying only what the record holds:
//   • a GAP: a day or a run of days with nothing logged (*Sun, Sep 20 · nothing logged*), or,
//     under a filter, closed logged days with none of its kind (*no vomit logged · Sep 18 – 19*).
//     The words and which days a run may span are HV-4's (`listSectionsOf`, `gapLineText`):
//     never today, never before the record or the filter's first row, split at an unlogged day.
//     A run of more than one day sits in a dashed box; a single day is a plain line (the mock).
//   • an ITEMS line: under a filter, a day whose only content is a date-only item keeps it
//     (AC 11): *Wed, Sep 16 · Vet visit, Recheck · no vomit logged*. A line that holds a visit
//     opens it, because every row is a door (§3.10).
//   • the RECORD'S START, where the list ends because the record does (§3.12).
//
// A landed day (§3.1) can be a gap: a strip tap on a day with nothing logged lands on the
// line that holds it, and the line keeps the outline until the owner scrolls. The outline
// and the box are two nested borders that are always drawn (transparent when off), so
// landing changes a colour and never moves the words.
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { theme } from '../../constants/theme';
import type { DateOnlyItem } from '../../lib/historyDays';
import { ThemedText } from '../ui/ThemedText';

/** The landed outline (§3.1: 2pt teal ink), the same weight as a day card's. */
export const LANDED_OUTLINE_WIDTH = 2;
/** A gap run's dashed box. */
const BOX_WIDTH = 1;
const DOT = 6;
const MARK = 10;
const MARK_BAR_HEIGHT = 3;
const SQUARE_RADIUS = 3;
const SQUARE_RING = 1.5;
const RECORD_RULE_WIDTH = 14;

export function GapLine({
  text,
  boxed,
  landed,
  testID,
}: {
  text: string;
  /** A run of more than one day: the dashed box. */
  boxed: boolean;
  landed: boolean;
  testID?: string;
}) {
  return (
    <View style={styles.cell}>
      <View style={[styles.outline, landed && styles.outlineLanded]} testID={testID} accessible accessibilityLabel={text}>
        <View style={[styles.line, boxed && !landed && styles.box]}>
          <View style={styles.dot} />
          <ThemedText style={styles.text}>{text}</ThemedText>
        </View>
      </View>
    </View>
  );
}

/** The mark an items line leads with: the first item's (a visit's square, a course's bar, a
 *  bowl's bar), the shapes the day card's thread draws. */
function ItemMark({ item }: { item: DateOnlyItem | undefined }) {
  if (item?.kind === 'visit') return <View style={styles.square} />;
  return <View style={[styles.bar, item?.kind === 'bowl' ? styles.barBowl : styles.barCourse]} />;
}

export function ItemsLine({
  text,
  items,
  landed,
  onOpenVisit,
  testID,
}: {
  text: string;
  items: readonly DateOnlyItem[];
  landed: boolean;
  onOpenVisit: (visitId: string) => void;
  testID?: string;
}) {
  const visit = items.find((i): i is Extract<DateOnlyItem, { kind: 'visit' }> => i.kind === 'visit');
  const line = (
    <View style={styles.line}>
      <ItemMark item={items[0]} />
      <ThemedText style={styles.text}>{text}</ThemedText>
    </View>
  );
  return (
    <View style={styles.cell}>
      {visit ? (
        <TouchableOpacity
          onPress={() => onOpenVisit(visit.id)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`${text}. Opens the visit`}
          style={[styles.outline, styles.door, landed && styles.outlineLanded]}
          testID={testID}
        >
          {line}
        </TouchableOpacity>
      ) : (
        <View style={[styles.outline, landed && styles.outlineLanded]} testID={testID} accessible accessibilityLabel={text}>
          {line}
        </View>
      )}
    </View>
  );
}

export function RecordStartLine({ text }: { text: string }) {
  return (
    <View style={styles.recordStart} testID="history-record-start" accessible accessibilityLabel={text}>
      <View style={styles.recordRule} />
      <ThemedText style={styles.recordText}>{text}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  cell: {
    paddingHorizontal: theme.space2,
    paddingTop: theme.space1,
  },
  outline: {
    borderRadius: theme.radiusMedium,
    borderWidth: LANDED_OUTLINE_WIDTH,
    borderColor: 'transparent',
  },
  outlineLanded: { borderColor: theme.colorAccentInk },
  // A line that holds a visit is a door: the 44pt floor (C-5).
  door: { minHeight: 44, justifyContent: 'center' },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
    // Round 5's gap line: quieter than a card, its dot a little in from the card's edge.
    paddingVertical: theme.space0_5 + theme.spaceMicro,
    paddingHorizontal: theme.space1 + theme.space0_5,
    borderRadius: theme.radiusMedium - LANDED_OUTLINE_WIDTH,
    borderWidth: BOX_WIDTH,
    borderColor: 'transparent',
  },
  box: {
    borderStyle: 'dashed',
    borderColor: theme.colorBorderStrong,
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    backgroundColor: theme.colorTickIdle,
  },
  square: {
    width: MARK,
    height: MARK,
    borderRadius: SQUARE_RADIUS,
    borderWidth: SQUARE_RING,
    borderColor: theme.colorTextTertiary,
    backgroundColor: theme.colorSurface,
  },
  bar: {
    width: MARK,
    height: MARK_BAR_HEIGHT,
    borderRadius: MARK_BAR_HEIGHT,
  },
  barCourse: { backgroundColor: theme.colorEventMedication },
  barBowl: { backgroundColor: theme.colorEventMeal },
  text: {
    flex: 1,
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    fontWeight: theme.weightRegular,
    color: theme.colorTextTertiary,
  },
  recordStart: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space1,
    paddingTop: theme.space2,
    paddingHorizontal: theme.space2,
  },
  recordRule: {
    width: RECORD_RULE_WIDTH,
    height: 1,
    backgroundColor: theme.colorTickIdle,
  },
  recordText: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    fontWeight: theme.weightRegular,
    color: theme.colorTextTertiary,
    flexShrink: 1,
  },
});
