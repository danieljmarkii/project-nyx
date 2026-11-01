import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../../constants/theme';
import { PrimaryButton, ThemedText } from '../ui';
import { useAppActive } from '../../hooks/useAppActive';
import { useMonthEntryDays } from '../../hooks/useReportComposer';
import { useSheetMotion } from '../motion/sheetMotion';
import { useSheetCap } from '../../hooks/useLayoutClass';
import { fetchComposerWindow } from '../../lib/reportComposerApi';
import {
  createRequestLatch,
  dayCellA11yLabel,
  monthGrid,
  monthTitle,
  nextRange,
  rangeFooter,
  symptomEntriesWords,
  type ComposerWindow,
  type DayRange,
} from '../../lib/reportComposer';

// b3: choose dates (Vet report v2 PR-16, CUL-2296; spec §10.1, §14). One range calendar, a bottom
// sheet that rises by `sheetMotion` (C-30, the app's one sheet physics), the range painting on the
// second tap. Day cells hold the 44pt floor (BRK-8): the grid runs edge to edge so seven cells fit
// a 320pt phone at 45pt each. A dot marks a day with an entry, read a month at a time from the
// server; a month whose read has not answered shows no dots and says it is still reading (C-12),
// never a month that looks empty.

const DAY_HEADS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface Props {
  visible: boolean;
  petId: string;
  today: string;
  /** The window on screen when the sheet opens: the calendar opens on its end month, unselected. */
  initial: ComposerWindow;
  onClose: () => void;
  onUse: (startDate: string, endDate: string, days: number) => void;
}

function monthKeyOf(y: number, m: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}`;
}

export function RangeCalendarSheet({ visible, petId, today, initial, onClose, onUse }: Props) {
  const { height: windowHeight } = useWindowDimensions(); // window-width-ok: the sheet's travel is the window HEIGHT, never a width
  const insets = useSafeAreaInsets();
  const appActive = useAppActive();
  const motion = useSheetMotion({ visible, veil: 'own', travelPt: windowHeight, appActive });
  // Held to the column on a wide screen (CUL-2243), like every sheet.
  const sheetCap = useSheetCap();

  const [year, setYear] = useState(() => Number(initial.endDate.slice(0, 4)));
  const [month, setMonth] = useState(() => Number(initial.endDate.slice(5, 7)) - 1);
  const [range, setRange] = useState<DayRange>({ start: null, end: null });
  const [rangeCount, setRangeCount] = useState<number | null>(null);
  const latch = useRef(createRequestLatch()).current;
  const months = useMonthEntryDays(petId);

  // Each open starts from the window on screen's month, with nothing chosen.
  useEffect(() => {
    if (!visible) return;
    setYear(Number(initial.endDate.slice(0, 4)));
    setMonth(Number(initial.endDate.slice(5, 7)) - 1);
    setRange({ start: null, end: null });
    setRangeCount(null);
  }, [visible, initial.endDate]);

  const key = monthKeyOf(year, month);
  const monthStart = `${key}-01`;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10);
  const monthEnd = lastDay > today ? today : lastDay;
  const { request } = months;
  useEffect(() => {
    if (visible && monthStart <= today) request(key, monthStart, monthEnd);
  }, [visible, key, monthStart, monthEnd, today, request]);
  const dots = months.daysFor(key);

  // The range's symptom count, read when both ends are chosen; newest ask wins.
  useEffect(() => {
    setRangeCount(null);
    if (!range.start || !range.end) return;
    const stamp = latch.next();
    fetchComposerWindow(petId, range.start, range.end)
      .then((r) => {
        if (latch.isCurrent(stamp)) setRangeCount(r.counts.symptomEntries);
      })
      .catch((e) => console.warn('[RangeCalendarSheet] range count failed:', e));
  }, [petId, range.start, range.end, latch]);

  const weeks = useMemo(() => monthGrid(year, month), [year, month]);
  const canGoNext = monthKeyOf(year, month) < today.slice(0, 7);
  const go = (delta: number) => {
    const m = month + delta;
    setYear(year + Math.floor(m / 12));
    setMonth(((m % 12) + 12) % 12);
  };

  const complete = range.start !== null && range.end !== null;
  const footer = complete ? rangeFooter(range.start as string, range.end as string, today) : null;
  const days =
    complete
      ? Math.round((Date.parse(`${range.end}T00:00:00Z`) - Date.parse(`${range.start}T00:00:00Z`)) / 86_400_000) + 1
      : 0;

  return (
    <Modal visible={motion.modalVisible} transparent animationType="none" onShow={motion.onShow} onRequestClose={onClose}>
      <View style={styles.backdrop} pointerEvents={motion.phase === 'exiting' ? 'none' : 'auto'}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, motion.scrimStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
        </Animated.View>
        <Animated.View
          style={[styles.sheet, sheetCap, { paddingBottom: insets.bottom + theme.space2 }, motion.sheetStyle]}
          accessibilityViewIsModal
          testID="composer-date-sheet"
        >
          <View style={styles.grabber} />
          <View style={styles.pad}>
            <ThemedText style={styles.title} accessibilityRole="header">
              Choose dates
            </ThemedText>
            <View style={styles.monthRow}>
              <Pressable onPress={() => go(-1)} style={styles.navBtn} accessibilityRole="button" accessibilityLabel="Previous month" testID="calendar-prev">
                <ThemedText style={styles.navText}>‹</ThemedText>
              </Pressable>
              <ThemedText style={styles.monthTitle} accessibilityRole="header">
                {monthTitle(year, month)}
              </ThemedText>
              <Pressable
                onPress={() => canGoNext && go(1)}
                style={[styles.navBtn, !canGoNext && styles.navOff]}
                accessibilityRole="button"
                accessibilityLabel="Next month"
                accessibilityState={{ disabled: !canGoNext }}
                accessibilityHint={canGoNext ? undefined : 'This month is the latest a report can cover.'}
                testID="calendar-next"
              >
                <ThemedText style={styles.navText}>›</ThemedText>
              </Pressable>
            </View>
            <ThemedText style={styles.caption}>
              {dots === 'loading' || dots === undefined
                ? 'Finding the days with entries…'
                : dots === 'failed'
                  ? 'Couldn’t mark the days with entries this month.'
                  : 'A dot marks a day with an entry.'}
            </ThemedText>
          </View>

          <View style={styles.weekRow} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            {DAY_HEADS.map((h, i) => (
              <ThemedText key={WEEKDAY_NAMES[i]} style={styles.dayHead}>
                {h}
              </ThemedText>
            ))}
          </View>
          {weeks.map((week, wi) => (
            <View key={`${key}-w${wi}`} style={styles.weekRow}>
              {week.map((day, di) => {
                if (day === null) return <View key={`${key}-e${wi}-${di}`} style={styles.cell} />;
                const future = day > today;
                const has = dots instanceof Set ? dots.has(day) : null;
                const lo = range.start;
                const hi = range.end ?? range.start;
                const inRange = lo !== null && hi !== null && day >= lo && day <= hi;
                const edge = day === range.start || day === range.end;
                return (
                  <Pressable
                    key={day}
                    testID={`calendar-day-${day}`}
                    onPress={() => setRange((r) => nextRange(r, day, today))}
                    disabled={future}
                    style={[styles.cell, inRange && styles.cellInRange, edge && styles.cellEdge]}
                    accessibilityRole="button"
                    accessibilityLabel={dayCellA11yLabel(day, has)}
                    accessibilityState={{ selected: inRange, disabled: future }}
                    accessibilityHint={future ? 'A report can’t cover a day that hasn’t happened.' : undefined}
                  >
                    <ThemedText style={[styles.dayNum, future && styles.dayFuture, edge && styles.dayEdge]}>
                      {Number(day.slice(8, 10))}
                    </ThemedText>
                    <View style={[styles.dot, has === true ? (edge ? styles.dotOnEdge : styles.dotOn) : styles.dotOff]} />
                  </Pressable>
                );
              })}
            </View>
          ))}

          <View style={[styles.pad, styles.footer]}>
            <ThemedText style={styles.footerText} testID="calendar-footer">
              {footer === null
                ? range.start === null
                  ? 'Tap the first day, then the last.'
                  : 'Now tap the last day.'
                : rangeCount === null
                  ? footer
                  : `${footer} · ${symptomEntriesWords(rangeCount)}`}
            </ThemedText>
            <PrimaryButton
              label="Use these dates"
              disabled={!complete}
              onPress={() => complete && onUse(range.start as string, range.end as string, days)}
              testID="calendar-use"
            />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  scrim: { backgroundColor: theme.colorScrimBackdrop },
  sheet: {
    backgroundColor: theme.colorSurface,
    borderTopLeftRadius: theme.radiusLarge,
    borderTopRightRadius: theme.radiusLarge,
    paddingTop: theme.space1,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: theme.radiusFull,
    backgroundColor: theme.colorBorderStrong,
    marginBottom: theme.space1,
  },
  pad: { paddingHorizontal: theme.space2, gap: theme.space1 },
  title: { fontSize: theme.textLG, fontWeight: theme.weightSemibold, color: theme.colorTextPrimary },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navBtn: { minWidth: theme.hitTarget, minHeight: theme.hitTarget, alignItems: 'center', justifyContent: 'center' },
  navOff: { opacity: 0.3 },
  navText: { fontSize: theme.textXL, color: theme.colorTextPrimary },
  monthTitle: { fontSize: theme.textMD, fontWeight: theme.weightSemibold, color: theme.colorTextPrimary },
  caption: { fontSize: theme.textSM, color: theme.colorTextSecondary },
  weekRow: { flexDirection: 'row' },
  dayHead: { flex: 1, textAlign: 'center', fontSize: theme.textXS, color: theme.colorTextTertiary, paddingVertical: theme.space1 },
  cell: { flex: 1, minHeight: theme.hitTarget, alignItems: 'center', justifyContent: 'center' },
  cellInRange: { backgroundColor: theme.colorSurfaceSubtle },
  cellEdge: { backgroundColor: theme.colorTextPrimary, borderRadius: theme.radiusSmall },
  dayNum: { fontSize: theme.textMD, color: theme.colorTextPrimary },
  dayFuture: { color: theme.colorTextDisabled },
  dayEdge: { color: theme.colorTextOnDark, fontWeight: theme.weightSemibold },
  dot: { width: 4, height: 4, borderRadius: theme.radiusFull, marginTop: theme.spaceMicro },
  dotOn: { backgroundColor: theme.colorTextSecondary },
  dotOnEdge: { backgroundColor: theme.colorTextOnDark },
  dotOff: { backgroundColor: 'transparent' },
  footer: { paddingTop: theme.space2, gap: theme.space2 },
  footerText: { fontSize: theme.textSM, color: theme.colorTextPrimary },
});
