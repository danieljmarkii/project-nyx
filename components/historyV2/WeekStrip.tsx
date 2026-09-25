// The week strip (History v2, HV-8 / CUL-1165; docs/nyx-history-v2-requirements.md §3.4,
// §4 "Page the strip", §5.7). One week of the Patterns month's day marks, without counts,
// Sunday first, in a pager that snaps to the week. HV-7 mounts it in the list's header.
//
// ── WHAT IT DRAWS, AND FROM WHAT ─────────────────────────────────────────────────
//
// Every cell's state, line and spoken label come from `stripMarkOf` (`lib/stripMarks.ts`,
// table-tested there), and every cell is drawn by `DayMarkFace`, the one drawing the month
// uses too (`components/charts/DayMark.tsx`), so the strip and the month cannot mark one
// day two ways. The props are what the count line already needs, handed over whole
// (HV-4's `HistoryFacts`, HV-3's `ResolvedWindow`, the course, today, the pet's name); the
// filter, the strip's week and the landed day are scope state in
// `store/historyScopeStore.ts`, which the pinned row writes and a link into History sets.
//
// ── A READ THAT HAS NOT ANSWERED IS NEVER A GREY SQUARE (C-12) ───────────────────
//
// The facts on hand may answer another window (a read in flight after a window change),
// another pet (a switch the list has not caught up with: the window's pet AND the facts'
// pet are checked, since two pets can share a window's dates), or a course filter whose
// course has not loaded. Drawn anyway, they would call days "nothing logged" that nobody
// has read,
// so the strip draws its silhouette instead, hidden from VoiceOver, at its own height so
// nothing shifts when the facts land (GAP-10: "a cell whose count has not answered is never
// drawn as a mark").
//
// ── THE PAGER (GAP-10) ───────────────────────────────────────────────────────────
//
// Native paging: a horizontal `FlatList` with `pagingEnabled`, one week per page, placed by
// `initialScrollIndex` + `getItemLayout`. The page lives in the store (`stripWeek`), above
// the list, so a remount of the list header never loses it. A swipe writes the store when
// the scroll ENDS (`onMomentumScrollEnd`, or a drag released exactly on a page), never on
// a timer. An arrow is one programmatic page: it writes the store and scrolls, animated
// unless Reduce Motion is on (the arrows jump, §4). Anything else that moves the page (a
// landing, the tab re-press, a window change) snaps; a changed width or page set remounts
// the list at the right page. The last page is written as `null`, the default, so the
// strip keeps following today's week.
//
// ── THE ACCESSIBLE PATH IS THE ARROWS (§3.4, WBC-3) ──────────────────────────────
//
// Only the page that shows is visible to assistive tech (a screen reader must not walk
// into, and scroll to, a week the eye cannot see). The arrows say they move the strip and
// that a day is reached by tapping it; at an edge an arrow is disabled and says why (C-7:
// `disabled` is a claim, paired with its reason). Paging keeps focus on the arrow and
// announces the week it moved to. A day ahead, before the record or outside the bounds is
// a plain view, never a disabled button; an absent day is not focusable at all.
//
// No haptic here, and no motion of its own beyond the native page: the strip's draw-in and
// the landing are HV-10's (`components/motion/`).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  FlatList,
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { claimsFromOf, dayFactsOn, shiftDay, type DayFacts, type HistoryCourse, type HistoryFacts } from '../../lib/historyDays';
import type { ResolvedWindow } from '../../lib/historyWindows';
import {
  factsAnswerWindow,
  stripArrowsOf,
  stripBoundsOf,
  stripMarkOf,
  stripPageOf,
  stripWeekLabel,
  stripWeekSpoken,
  stripWeeksOf,
  type StripMark,
  type StripState,
  type StripWindow,
} from '../../lib/stripMarks';
import { useHistoryScopeStore, type HistoryFilter } from '../../store/historyScopeStore';
import { reducedMotionNow } from '../../store/reducedMotionStore';
import { DayMarkFace, type DayMarkBox } from '../charts/DayMark';
import { ThemedText } from '../ui/ThemedText';
import { Skeleton } from '../ui/Skeleton';

export interface WeekStripProps {
  /** `readHistoryFacts`' answer for the window on screen, or null while the first read is
   *  in flight. A day it holds nothing for is a day with nothing logged. */
  facts: HistoryFacts | null;
  /** `resolveWindow(store.window, windowFacts)`: the window the facts were read for. */
  window: ResolvedWindow;
  /** The course a course filter shows (`readHistoryCourses`), else null. Null while the
   *  courses load: the strip waits rather than bound a course it cannot place. */
  course: HistoryCourse | null;
  /** The owner's local day (`toLocalDayKey(new Date())`), the count line's own. */
  today: string;
  /** The pet's name, for the spoken labels ("before Nyx's record"). */
  petName: string;
}

/** The cells' gap: DayMark's `hitSlop` is 2 on every side, so two adjacent marks need 4
 *  (C-5), the month grid's own floor. */
const CELL_GAP = theme.space0_5;

/** An arrow is a 44pt box (the touch floor from its own size, so it takes no hitSlop,
 *  C-5), drawing a smaller disc. */
const ARROW_BOX = 44;
const ARROW_DISC = 30;

const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

/** A strip state's box on the shared face. `outside` has none: it is absent. */
const BOX: Record<Exclude<StripState, 'outside'>, DayMarkBox> = {
  ahead: 'outlined',
  before_record: 'none',
  noticed: 'white',
  unlogged: 'grey',
  open: 'white',
  rose: 'rose',
  logged: 'white',
  quiet: 'white',
};

/** What a tap on a day does, said once per cell (the arrows say it for the strip). */
const CELL_HINT = 'Shows this day in the list';

export function WeekStrip({ facts, window, course, today, petName }: WeekStripProps) {
  const petId = useHistoryScopeStore((s) => s.petId);
  const filter = useHistoryScopeStore((s) => s.filter);
  const stripWeek = useHistoryScopeStore((s) => s.stripWeek);
  const landedDay = useHistoryScopeStore((s) => s.landedDay);
  const landOn = useHistoryScopeStore((s) => s.landOn);
  const setStripWeek = useHistoryScopeStore((s) => s.setStripWeek);

  const [width, setWidth] = useState(0);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const next = e.nativeEvent.layout.width;
    setWidth((prev) => (Math.abs(prev - next) < 0.5 ? prev : next));
  }, []);

  // A course filter reads its course's days; until they are here the strip waits.
  const courseKey = filter.kind === 'course' ? filter.courseKey : null;
  const filterCourse = courseKey !== null && course !== null && course.key === courseKey ? course : null;
  const courseLoading = courseKey !== null && filterCourse === null;

  const bounds = useMemo(
    () => (courseLoading ? null : stripBoundsOf(window.bounds, filterCourse?.days ?? null)),
    [courseLoading, window.bounds, filterCourse],
  );
  const weeks = useMemo(() => (bounds ? stripWeeksOf(bounds) : []), [bounds]);
  const page = stripPageOf(weeks, stripWeek);

  // Every input must describe the same pet and the same days: the window and the facts
  // both for the pet on screen (two pets can share a window's dates, so a range match
  // alone is not enough), the facts read for exactly this window, and a window that does
  // not reach past the `today` the cells are judged against.
  const answered =
    facts !== null &&
    petId !== null &&
    window.petId === petId &&
    facts.petId === petId &&
    factsAnswerWindow(facts.range, window.bounds) &&
    window.bounds.toDay <= today &&
    !courseLoading;

  if (petId === null) return null;
  // A course with no day in the window leaves nothing to page over; the list says so.
  if (!courseLoading && weeks.length === 0) return null;

  return (
    <View onLayout={onLayout} style={styles.strip} testID="week-strip">
      {answered && bounds !== null ? (
        <StripPager
          petId={petId}
          facts={facts}
          window={window}
          bounds={bounds}
          weeks={weeks}
          page={page}
          width={width}
          filter={filter}
          course={filterCourse}
          landedDay={landedDay}
          today={today}
          petName={petName}
          landOn={landOn}
          setStripWeek={setStripWeek}
        />
      ) : (
        <StripSilhouette width={width} />
      )}
    </View>
  );
}

interface StripPagerProps {
  petId: string;
  facts: HistoryFacts;
  window: ResolvedWindow;
  bounds: { fromDay: string; toDay: string };
  weeks: string[];
  page: number;
  width: number;
  filter: HistoryFilter;
  course: HistoryCourse | null;
  landedDay: string | null;
  today: string;
  petName: string;
  landOn: (petId: string, day: string) => boolean;
  setStripWeek: (petId: string, week: string | null) => boolean;
}

function StripPager({
  petId,
  facts,
  window,
  bounds,
  weeks,
  page,
  width,
  filter,
  course,
  landedDay,
  today,
  petName,
  landOn,
  setStripWeek,
}: StripPagerProps) {
  const listRef = useRef<FlatList<string>>(null);
  // The page the pager is at, or animating to. A store change that already matches it is
  // an echo of the pager's own move, never a reason to scroll again (the mock's syncRail
  // cancelled its own arrow animation that way).
  const shownRef = useRef(page);

  const stripWindow: StripWindow = useMemo(
    () => ({
      fromDay: bounds.fromDay,
      toDay: bounds.toDay,
      recordStart: facts.firsts.record,
      petName,
      courseName: course?.name ?? null,
      claimsFrom: claimsFromOf(facts.firsts, filter, course?.days ?? null),
    }),
    [bounds.fromDay, bounds.toDay, facts.firsts, petName, course, filter],
  );

  const arrows = stripArrowsOf(weeks, page, {
    bounds,
    window: { key: window.key, bounds: window.bounds, longName: window.label.long },
    course: course ? { name: course.name, days: course.days } : null,
    recordStart: facts.firsts.record,
    petName,
    today,
  });

  // A landing, the tab re-press, a reset: the store moved the page, so the pager snaps
  // there. An arrow or a swipe has already set `shownRef`, so its own echo does nothing.
  useEffect(() => {
    if (width === 0 || page < 0 || shownRef.current === page) return;
    shownRef.current = page;
    listRef.current?.scrollToOffset({ offset: page * width, animated: false });
  }, [page, width]);

  const writeWeek = useCallback(
    (index: number) => setStripWeek(petId, index === weeks.length - 1 ? null : weeks[index]),
    [petId, setStripWeek, weeks],
  );

  const go = (delta: -1 | 1) => {
    const target = page + delta;
    if (width === 0 || target < 0 || target >= weeks.length) return;
    shownRef.current = target;
    listRef.current?.scrollToOffset({ offset: target * width, animated: !reducedMotionNow() });
    writeWeek(target);
    AccessibilityInfo.announceForAccessibility(stripWeekSpoken(weeks[target], today));
  };

  // The page is decided where the scroll ends, never on a timer (GAP-10).
  const settle = (x: number) => {
    if (width === 0 || weeks.length === 0) return;
    const index = Math.max(0, Math.min(weeks.length - 1, Math.round(x / width)));
    shownRef.current = index;
    if (index !== page) writeWeek(index);
  };
  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => settle(e.nativeEvent.contentOffset.x);
  // A drag released exactly on a page has no momentum to end, so it settles here.
  const onScrollEndDrag = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    if (width > 0 && Math.abs(x - Math.round(x / width) * width) < 1) settle(x);
  };

  // Everything a page draws from, so the list re-renders its pages when any of it moves
  // (a write, a filter, the landed ring, the page that shows).
  const cells = useMemo(
    () => ({ days: facts.days, filter, stripWindow, today, landedDay, page }),
    [facts.days, filter, stripWindow, today, landedDay, page],
  );
  const onLand = useCallback((day: string) => landOn(petId, day), [landOn, petId]);

  const renderWeek = ({ item: week, index }: ListRenderItemInfo<string>) => (
    <WeekPage
      week={week}
      width={width}
      shown={index === cells.page}
      days={cells.days}
      filter={cells.filter}
      stripWindow={cells.stripWindow}
      today={cells.today}
      landedDay={cells.landedDay}
      onLand={onLand}
    />
  );

  return (
    <>
      <View style={styles.nav}>
        <StripArrow side="back" enabled={arrows.back.enabled} label={arrows.back.label} onPress={() => go(-1)} />
        <ThemedText
          style={styles.label}
          numberOfLines={1}
          accessibilityLabel={stripWeekSpoken(weeks[page], today)}
          testID="week-strip-label"
        >
          {stripWeekLabel(weeks[page], today)}
        </ThemedText>
        <StripArrow side="forward" enabled={arrows.forward.enabled} label={arrows.forward.label} onPress={() => go(1)} />
      </View>
      <WeekdayLetters />
      {width > 0 && (
        <FlatList
          // A new width or a new page set places the list afresh, at the right page (GAP-10:
          // a reset snaps via initialScrollIndex plus getItemLayout).
          key={`${width}|${weeks[0]}|${weeks[weeks.length - 1]}`}
          ref={listRef}
          data={weeks}
          keyExtractor={(week) => week}
          renderItem={renderWeek}
          extraData={cells}
          horizontal
          pagingEnabled
          scrollEnabled={weeks.length > 1}
          showsHorizontalScrollIndicator={false}
          getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
          initialScrollIndex={page}
          initialNumToRender={1}
          maxToRenderPerBatch={2}
          windowSize={3}
          onMomentumScrollEnd={onMomentumScrollEnd}
          onScrollEndDrag={onScrollEndDrag}
          testID="week-strip-pager"
        />
      )}
    </>
  );
}

function WeekPage({
  week,
  width,
  shown,
  days,
  filter,
  stripWindow,
  today,
  landedDay,
  onLand,
}: {
  week: string;
  width: number;
  shown: boolean;
  days: HistoryFacts['days'];
  filter: HistoryFilter;
  stripWindow: StripWindow;
  today: string;
  landedDay: string | null;
  onLand: (day: string) => void;
}) {
  const marks: StripMark[] = [];
  for (let i = 0; i < 7; i += 1) {
    const facts: DayFacts = dayFactsOn(days, shiftDay(week, i));
    marks.push(stripMarkOf(facts, filter, stripWindow, today));
  }
  return (
    <View
      // The page is laid out at the measured width: a layout value, not a design one.
      style={[styles.page, { width }]}
      accessibilityElementsHidden={!shown}
      importantForAccessibility={shown ? 'auto' : 'no-hide-descendants'}
      testID={`week-strip-page-${week}`}
    >
      {marks.map((m) => (
        <StripCell key={m.day} mark={m} landed={landedDay === m.day} onLand={onLand} />
      ))}
    </View>
  );
}

function StripCell({ mark, landed, onLand }: { mark: StripMark; landed: boolean; onLand: (day: string) => void }) {
  if (mark.state === 'outside' || mark.label === null) {
    return <View style={styles.absent} importantForAccessibility="no" accessibilityElementsHidden testID="week-strip-absent" />;
  }
  return (
    <DayMarkFace
      dayOfMonth={Number(mark.day.slice(8, 10))}
      box={BOX[mark.state]}
      line={mark.line}
      today={mark.today}
      selected={landed}
      label={landed ? `${mark.label}, selected` : mark.label}
      accessibilityHint={mark.tappable ? CELL_HINT : undefined}
      onPress={mark.tappable ? () => onLand(mark.day) : undefined}
    />
  );
}

function StripArrow({
  side,
  enabled,
  label,
  onPress,
}: {
  side: 'back' | 'forward';
  enabled: boolean;
  label: string;
  onPress: () => void;
}) {
  const Icon = side === 'back' ? ChevronLeft : ChevronRight;
  return (
    <Pressable
      onPress={onPress}
      disabled={!enabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !enabled }}
      style={styles.arrow}
      testID={`week-strip-${side}`}
    >
      <View style={styles.arrowDisc}>
        <Icon size={16} color={enabled ? theme.colorAccentInk : theme.colorTickIdle} strokeWidth={2.25} />
      </View>
    </Pressable>
  );
}

function WeekdayLetters() {
  return (
    <View style={styles.weekdays} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {WEEKDAY_LETTERS.map((d, i) => (
        <ThemedText key={i} style={styles.weekday}>
          {d}
        </ThemedText>
      ))}
    </View>
  );
}

/** The strip's shape while its facts are not in: the arrows' row, the letters, one block
 *  the height of a week of cells. Hidden from VoiceOver (§3.12's loading state). */
function StripSilhouette({ width }: { width: number }) {
  const cell = width > 0 ? (width - CELL_GAP * 6) / 7 : 0;
  return (
    <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden testID="week-strip-silhouette">
      <View style={styles.nav} />
      <WeekdayLetters />
      {cell > 0 && <Skeleton height={cell} radius={theme.radiusSmall} />}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    gap: theme.spaceMicro,
  },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: ARROW_BOX,
  },
  label: {
    flex: 1,
    textAlign: 'center',
    fontSize: theme.textXS,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
  },
  arrow: {
    width: ARROW_BOX,
    height: ARROW_BOX,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowDisc: {
    width: ARROW_DISC,
    height: ARROW_DISC,
    borderRadius: theme.radiusFull,
    backgroundColor: theme.colorChartEmpty,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekdays: {
    flexDirection: 'row',
    gap: CELL_GAP,
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
  },
  page: {
    flexDirection: 'row',
    gap: CELL_GAP,
  },
  // Outside the window or a course: absent, holding its column so the week stays a week.
  absent: {
    flex: 1,
    aspectRatio: 1,
  },
});
