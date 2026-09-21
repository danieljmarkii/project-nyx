import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { theme, shadows } from '../../../constants/theme';
import { useAppActive } from '../../../hooks/useAppActive';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { dayMarkDateWord } from '../../../lib/chartCopy';
import {
  buildMonthModel,
  compareMonths,
  monthA11yLabel,
  monthOfKey,
  monthReadRange,
  shiftMonth,
  type MonthDay,
  type MonthModel,
} from '../../../lib/monthModel';
import { readDayRows, readMonthFacts, type MonthFacts } from '../../../lib/monthReads';
import { describeDayEvents, daySheetSubtitle } from '../../../lib/dayEvents';
import type { EventTintCategory } from '../../../lib/dayEvents';
import type { TimelineRow } from '../../../lib/db';
import { WeeklyBars } from '../../charts/WeeklyBars';
import { DayMark } from '../../charts/DayMark';
import { EventIcon } from '../../event/EventIcon';
import { FilterChip } from '../../ui/FilterChip';
import { SkeletonCard } from '../../ui/Skeleton';
import { ThemedText } from '../../ui/ThemedText';
import { useOpenInPlace } from '../../motion/openInPlaceMotion';

// MonthInstrument — the Patterns page's month (Design v2 — the whole day, D2-5 ·
// CUL-1067; design authority `docs/culprit-design-v4-mockups.html` §04, the frame the
// PM ruled "LOVE"). Behind `design_v2`; the flag-off page never imports this file.
//
//   the nav ............ ‹ September 2026 › — the next month disabled at the current one,
//                        the previous at the record's first month, each with its reason
//                        in its label (C-7)
//   the bars ........... `WeeklyBars` (D2-1) over the nine Sunday-start weeks ending with
//                        the row holding today, so every bar is a grid row you can point at
//   the layers ......... four independent toggles — Vomiting · Meals · Medication · Photos.
//                        `FilterChip`s in `ChipGroup`'s wrap geometry with CHECKBOX
//                        semantics, because `ChipGroup` is a single-select radiogroup and
//                        a layer is not a choice among four; the mock's per-chip
//                        `aria-pressed` is this. A layer off is not "clear": the coverage
//                        hairline stays (DayMark's own rule)
//   the line ........... "Vomiting 6 times on 4 days · through Sep 17 · 2 days unlogged"
//   the grid ........... `DayMark`s (D2-1): the date stays, the count in the corner
//   the legend ......... vomit day with the count · logged · left some · nothing logged
//   the day ............ opens IN PLACE under its row with the fold's physics (C-14: this
//                        card may sit under a screen that presents a Modal, and a second
//                        Modal from the same presenter is unreliable on iOS), one at a time
//
// Everything counted is counted in `lib/monthModel.ts`; this file draws, pages and
// fetches. One read per shown month (`readMonthFacts`), cached per month, keyed writes
// so a slow page can only land on ITS month; the current month is re-read on every
// focus the parent asks for (`refreshTick`). A read that has not answered is a skeleton,
// never an empty month (C-12); a failed one is an error with a retry, never a computed
// "nothing logged". No haptic anywhere here — this file draws `worth_a_call` through
// `DayMark`, and it is named in `guards/haptics.test.ts`'s ALWAYS_SCANNED.

/** The four layers. Vomiting and Meals on by default (the mock's chips); the two
 *  quieter layers off until asked for. */
export interface MonthLayers {
  vomit: boolean;
  meals: boolean;
  meds: boolean;
  photos: boolean;
}

export const DEFAULT_LAYERS: MonthLayers = { vomit: true, meals: true, meds: false, photos: false };

const LAYER_CHIPS: { key: keyof MonthLayers; label: string }[] = [
  { key: 'vomit', label: 'Vomiting' },
  { key: 'meals', label: 'Meals' },
  { key: 'meds', label: 'Medication' },
  { key: 'photos', label: 'Photos' },
];

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

/** DayMark's `hitSlop` is 2 on every side, so two adjacent marks need a gap ≥ 4 (C-5).
 *  `space0_5` is exactly that floor; the test pins the rendered gap off the style. */
const GRID_GAP = theme.space0_5;

const NOUN = 'vomiting';
const DRILL_LABEL = 'Vomit';

// The drill-in's category tint (the shipped DayEventsSheet's, verbatim: symptom rose, meal
// teal, medication slate; weight and a look neutral — a look's identity is "the owner
// answered", never a category hue of its own).
const CATEGORY_TINT: Record<EventTintCategory, string> = {
  symptom: theme.colorEventSymptom,
  meal: theme.colorEventMeal,
  medication: theme.colorEventMedication,
  other: theme.colorTextSecondary,
  look: theme.colorTextSecondary,
};

interface Props {
  petId: string;
  /** Today's local day key — the caller's clock, once. */
  today: string;
  /** The trial's start, marked on the bars at its day. */
  trialMark?: { day: string; label: string } | null;
  /** Bumped by the parent on focus / after a sync: the current month re-reads. */
  refreshTick?: number;
  /** Injectable reads (tests). Default: the real ones. */
  readFacts?: (petId: string, range: { fromKey: string; toKey: string }) => Promise<MonthFacts>;
  readDay?: (petId: string, dayKey: string) => Promise<TimelineRow[]>;
}

type Month = { year: number; month: number };
const monthKey = (m: Month) => `${m.year}-${String(m.month + 1).padStart(2, '0')}`;

type DayLoad = { rows: TimelineRow[] } | { error: true } | null;

export function MonthInstrument({
  petId,
  today,
  trialMark = null,
  refreshTick = 0,
  readFacts = readMonthFacts,
  readDay = readDayRows,
}: Props) {
  const currentMonth = useMemo(() => monthOfKey(today), [today]);
  const [shown, setShown] = useState<Month>(currentMonth);
  const [cache, setCache] = useState<Map<string, MonthFacts>>(new Map());
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [layers, setLayers] = useState<MonthLayers>(DEFAULT_LAYERS);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [dayLoads, setDayLoads] = useState<Map<string, DayLoad>>(new Map());
  const [drawTick, setDrawTick] = useState(0);
  const loadIdRef = useRef(0);
  const dayLoadRef = useRef(0);

  const shownKey = monthKey(shown);

  const load = useCallback(
    async (m: Month, force: boolean) => {
      const key = monthKey(m);
      if (!force && cache.has(key)) return;
      const myId = ++loadIdRef.current;
      setLoadingKey(key);
      setFailedKey((f) => (f === key ? null : f));
      try {
        const facts = await readFacts(petId, monthReadRange(m, today));
        if (loadIdRef.current !== myId) return;
        // Keyed write: a slow fetch lands on ITS month, never over another.
        setCache((prev) => new Map(prev).set(key, facts));
      } catch (e) {
        if (loadIdRef.current !== myId) return;
        console.error('[month] load failed:', e);
        setFailedKey(key);
      } finally {
        if (loadIdRef.current === myId) setLoadingKey(null);
      }
    },
    [cache, petId, readFacts, today],
  );

  // The shown month loads when it is not cached; the current month re-reads on every
  // refresh the parent asks for (a fresh log, a sync) so the grid never lags the record.
  useEffect(() => {
    void load(shown, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownKey]);
  useEffect(() => {
    if (refreshTick === 0) return;
    void load(currentMonth, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTick]);

  const facts = cache.get(shownKey) ?? null;
  const model: MonthModel | null = useMemo(
    () =>
      facts
        ? buildMonthModel({
            ...shown,
            today,
            recordStart: facts.recordStart,
            episodeDays: facts.episodeDays,
            loggedDays: facts.loggedDays,
            leftSomeDays: facts.leftSomeDays,
            dosedDays: facts.dosedDays,
            photoDays: facts.photoDays,
            trialMark,
            noun: NOUN,
          })
        : null,
    [facts, shown, today, trialMark],
  );

  // The record's first month bounds paging backward; without a record there is nowhere
  // to page to.
  const recordStart = facts?.recordStart ?? null;
  const earliestMonth = recordStart ? monthOfKey(recordStart) : null;
  const canGoPrev = earliestMonth != null && compareMonths(shown, earliestMonth) > 0;
  const canGoNext = compareMonths(shown, currentMonth) < 0;

  const goTo = useCallback((m: Month) => {
    setShown(m);
    setOpenDay(null);
    // The chart draws in on a page turn — the FACT (C-30); a re-render never replays it.
    setDrawTick((t) => t + 1);
  }, []);

  const openDayInPlace = useCallback(
    async (dayKey: string) => {
      if (openDay === dayKey) {
        setOpenDay(null);
        return;
      }
      setOpenDay(dayKey);
      if (dayLoads.get(dayKey) != null && !('error' in (dayLoads.get(dayKey) as object))) return;
      const myId = ++dayLoadRef.current;
      setDayLoads((prev) => new Map(prev).set(dayKey, null));
      try {
        const rows = await readDay(petId, dayKey);
        if (dayLoadRef.current !== myId) return;
        setDayLoads((prev) => new Map(prev).set(dayKey, { rows }));
      } catch (e) {
        if (dayLoadRef.current !== myId) return;
        console.error('[month] day load failed:', e);
        setDayLoads((prev) => new Map(prev).set(dayKey, { error: true }));
      }
    },
    [openDay, dayLoads, petId, readDay],
  );

  const toggleLayer = useCallback((key: keyof MonthLayers) => {
    setLayers((l) => ({ ...l, [key]: !l[key] }));
  }, []);

  const loading = loadingKey === shownKey && !facts;
  const failed = failedKey === shownKey && !facts;

  return (
    <View style={styles.card} testID="month-instrument">
      <View style={styles.navRow}>
        <Pressable
          onPress={() => canGoPrev && goTo(shiftMonth(shown.year, shown.month, -1))}
          disabled={!canGoPrev}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={canGoPrev ? 'Previous month' : 'Previous month — already at the first month with a record'}
          accessibilityState={{ disabled: !canGoPrev }}
          style={styles.navBtn}
          testID="month-prev"
        >
          <ChevronLeft size={20} color={canGoPrev ? theme.colorTextSecondary : theme.colorTextDisabled} />
        </Pressable>
        <ThemedText style={styles.monthLabel} testID="month-label">
          {model?.label ?? ''}
        </ThemedText>
        <Pressable
          onPress={() => canGoNext && goTo(shiftMonth(shown.year, shown.month, 1))}
          disabled={!canGoNext}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={canGoNext ? 'Next month' : 'Next month — already at the current month'}
          accessibilityState={{ disabled: !canGoNext }}
          style={styles.navBtn}
          testID="month-next"
        >
          <ChevronRight size={20} color={canGoNext ? theme.colorTextSecondary : theme.colorTextDisabled} />
        </Pressable>
      </View>

      {loading || (!model && !failed) ? (
        // A read that has not answered is never an empty month (C-12).
        <View testID="month-skeleton">
          <SkeletonCard />
        </View>
      ) : failed || !model ? (
        <View style={styles.stateBox} testID="month-error">
          <ThemedText style={styles.line}>Couldn't load this month.</ThemedText>
          <Pressable
            onPress={() => void load(shown, true)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Try again"
            style={styles.retryBtn}
          >
            <ThemedText style={styles.retryText}>Try again</ThemedText>
          </Pressable>
        </View>
      ) : (
        <>
          <WeeklyBars model={model.weekly} noun={NOUN} drawIn={drawTick > 0} identity={`${shownKey}:${drawTick}`} />

          {/* The layers: four independent toggles, wrapping, each announcing its checked state. */}
          <View style={styles.chips} accessibilityLabel="Layers" testID="month-layers">
            {LAYER_CHIPS.map((c) => (
              <FilterChip
                key={c.key}
                label={c.label}
                active={layers[c.key]}
                variant="filled"
                accessibilityRole="checkbox"
                onPress={() => toggleLayer(c.key)}
              />
            ))}
          </View>

          <ThemedText style={styles.line} accessibilityLabel={monthA11yLabel(model)} testID="month-line">
            {model.line}
          </ThemedText>

          <View style={styles.weekdayHeader} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            {WEEKDAY_LABELS.map((d, i) => (
              <ThemedText key={i} style={styles.weekdayLabel}>
                {d}
              </ThemedText>
            ))}
          </View>

          <View style={styles.grid} testID="month-grid">
            {model.rows.map((row, r) => {
              const openInRow = openDay != null && row.some((d) => d?.key === openDay);
              return (
                <View key={`row-${r}`} testID={`month-row-${r}`}>
                  <View style={styles.weekRow}>
                    {row.map((day, c) =>
                      day == null ? (
                        <View key={`pad-${r}-${c}`} style={styles.pad} testID="month-pad" />
                      ) : (
                        <GridDay
                          key={day.key}
                          day={day}
                          layers={layers}
                          selected={openDay === day.key}
                          onPress={() => void openDayInPlace(day.key)}
                        />
                      ),
                    )}
                  </View>
                  <DaySlot
                    shown={openInRow}
                    dayKey={openInRow ? (openDay as string) : null}
                    day={openInRow ? (model.days.find((d) => d.key === openDay) ?? null) : null}
                    load={openInRow ? (dayLoads.get(openDay as string) ?? null) : null}
                    onRetry={() => openDay && void openDayInPlace(openDay)}
                  />
                </View>
              );
            })}
          </View>

          <Legend />
        </>
      )}
    </View>
  );
}

/** One grid day: a `DayMark` for a day of the record, a plain dim square for a day
 *  before it (DayMark's coverage vocabulary has no "before the record", and that day
 *  is neither unlogged nor ahead — it is a day nobody could have logged). */
function GridDay({ day, layers, selected, onPress }: { day: MonthDay; layers: MonthLayers; selected: boolean; onPress: () => void }) {
  if (day.coverage === 'before_record') {
    return (
      <View
        accessible
        accessibilityLabel={`${dayMarkDateWord(day.key)}, before the record began`}
        style={styles.beforeRecord}
        testID="month-before-record"
      >
        <ThemedText style={styles.beforeRecordDate}>{day.dayOfMonth}</ThemedText>
      </View>
    );
  }
  // The Meals layer is the LEFT-SOME distinction: off, an unfinished-meal day draws the
  // plain "logged" hairline — coverage never changes with a layer, only the second fact
  // painted over it.
  const coverage = day.coverage === 'left_some' && !layers.meals ? 'logged' : day.coverage;
  return (
    <DayMark
      dayKey={day.key}
      dayOfMonth={day.dayOfMonth}
      count={day.count}
      coverage={coverage}
      symptomLayer={layers.vomit}
      medication={layers.meds && day.medication}
      photo={layers.photos ? day.photo : 'none'}
      today={day.today}
      selected={selected}
      noun={NOUN}
      onPress={day.coverage === 'ahead' ? undefined : onPress}
    />
  );
}

/** The day opening in place under its row — the slot, the rail, the rows. */
function DaySlot({
  shown,
  dayKey,
  day,
  load,
  onRetry,
}: {
  shown: boolean;
  dayKey: string | null;
  day: MonthDay | null;
  load: DayLoad;
  onRetry: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const appActive = useAppActive();
  // The slot's identity is the day it is ABOUT — the last day opened under this row —
  // so a close keeps its choreography (a null key is "closing", not "another day").
  const lastKey = useRef<string | null>(dayKey);
  if (dayKey != null) lastKey.current = dayKey;
  const aboutKey = lastKey.current;
  const motion = useOpenInPlace({ shown, identity: aboutKey ?? '', reducedMotion, appActive });
  if (!motion.slotMounted || aboutKey == null) return null;
  const onLayout = (e: LayoutChangeEvent) => motion.onSlotLayout(e.nativeEvent.layout.height);
  const railOut = motion.inFlight && motion.railHeight != null;
  const items = load && 'rows' in load ? describeDayEvents(load.rows) : [];
  // The fold's anatomy: idle, the shipped tree to the byte — a plain rail, plain rows, no
  // wrapper. In flight, the rail is an `Animated.View` out of the flow with an explicit
  // height, and the rows sit in an `Animated.View` that mounts only while they are
  // arriving or leaving (an animated wrapper left mounted across an idle state keeps a
  // stale node attached to its value, and the next beat starts against it).
  const rowsWrapped = motion.phase !== 'open';
  const rowsStyle = { opacity: motion.values.rowsOpacity, transform: [{ translateY: motion.values.rowsShift }] };
  return (
    <View style={[styles.slot, { minHeight: motion.slotMinHeight }]} onLayout={onLayout} testID="day-slot">
      {railOut ? (
        <Animated.View
          testID="day-rail"
          style={[styles.rail, styles.railOut, { height: motion.railHeight as number, transform: [{ scaleY: motion.values.railScale }] }]}
        />
      ) : (
        <View style={styles.rail} testID="day-rail" />
      )}
      {motion.rowsMounted && (
        <RowsStage wrapped={rowsWrapped} style={rowsStyle}>
          <ThemedText style={styles.dayTitle}>{dayMarkDateWord(aboutKey)}</ThemedText>
          {load == null ? (
            <ThemedText style={styles.daySubtitle}>Loading…</ThemedText>
          ) : 'error' in load ? (
            // A failed day read is never "Nothing logged this day" (a false all-clear).
            <View style={styles.stateBox}>
              <ThemedText style={styles.daySubtitle}>Couldn't load this day's log.</ThemedText>
              <Pressable onPress={onRetry} hitSlop={8} accessibilityRole="button" accessibilityLabel="Try again" style={styles.retryBtn}>
                <ThemedText style={styles.retryText}>Try again</ThemedText>
              </Pressable>
            </View>
          ) : (
            <>
              <ThemedText style={styles.daySubtitle}>{daySheetSubtitle(DRILL_LABEL, day?.count ?? 0, items.length)}</ThemedText>
              {items.map((it, i) => (
                <View
                  key={i}
                  style={styles.row}
                  accessible
                  accessibilityLabel={`${it.title}${it.detail ? `, ${it.detail}` : ''}${it.formatTag ? `, ${it.formatTag.toLowerCase()}` : ''}, ${it.time}`}
                >
                  <View style={styles.rowIcon}>
                    <EventIcon type={it.eventType} size={16} color={CATEGORY_TINT[it.category]} />
                  </View>
                  <View style={styles.rowText}>
                    <ThemedText style={styles.rowTitle} numberOfLines={1}>
                      {it.title}
                    </ThemedText>
                    {it.detail ? (
                      <ThemedText style={styles.rowDetail} numberOfLines={1}>
                        {it.detail}
                      </ThemedText>
                    ) : null}
                    {it.formatTag ? <ThemedText style={styles.rowFormatTag}>{it.formatTag}</ThemedText> : null}
                  </View>
                  <ThemedText style={styles.rowTime}>{it.time}</ThemedText>
                </View>
              ))}
            </>
          )}
        </RowsStage>
      )}
    </View>
  );
}

/** The rows' stage: an animated wrapper while they arrive or leave, a plain View at rest. */
function RowsStage({
  wrapped,
  style,
  children,
}: {
  wrapped: boolean;
  style: { opacity: Animated.Value; transform: { translateY: Animated.Value }[] };
  children: ReactNode;
}) {
  return wrapped ? (
    <Animated.View style={[styles.slotContent, style]} testID="day-detail">
      {children}
    </Animated.View>
  ) : (
    <View style={styles.slotContent} testID="day-detail">
      {children}
    </View>
  );
}

/** The legend, cold-readable: four swatches, each the mark it names, and the count's
 *  place said in words. Colour is never the only carrier — every swatch has its label. */
function Legend() {
  return (
    <View style={styles.legend} testID="month-legend">
      <View style={styles.legendItem}>
        <View style={[styles.swatch, styles.swatchVomit]} />
        <ThemedText style={styles.legendText}>vomit day, count in the corner</ThemedText>
      </View>
      <View style={styles.legendItem}>
        <View style={[styles.swatch, styles.swatchLogged]}>
          <View style={[styles.swatchHairline, styles.swatchHairlineLogged]} />
        </View>
        <ThemedText style={styles.legendText}>logged</ThemedText>
      </View>
      <View style={styles.legendItem}>
        <View style={[styles.swatch, styles.swatchLogged]}>
          <View style={[styles.swatchHairline, styles.swatchHairlineLeftSome]} />
        </View>
        <ThemedText style={styles.legendText}>left some</ThemedText>
      </View>
      <View style={styles.legendItem}>
        <View style={[styles.swatch, styles.swatchUnlogged]} />
        <ThemedText style={styles.legendText}>nothing logged</ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colorSurface,
    borderRadius: theme.radiusMedium,
    padding: theme.space3,
    gap: theme.space2,
    ...shadows.md,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: {
    fontSize: theme.textMD,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    // ChipGroup's own geometry: the rowGap clears FilterChip's 6pt vertical hitSlop.
    columnGap: theme.space1,
    rowGap: theme.space2,
  },
  line: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightBody,
  },
  weekdayHeader: {
    flexDirection: 'row',
    gap: GRID_GAP,
  },
  weekdayLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
  },
  grid: {
    gap: GRID_GAP,
  },
  weekRow: {
    flexDirection: 'row',
    gap: GRID_GAP,
  },
  pad: {
    flex: 1,
    aspectRatio: 1,
  },
  beforeRecord: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: theme.radiusSmall,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colorBorder,
    borderStyle: 'dashed',
  },
  beforeRecordDate: {
    fontSize: theme.textXS,
    color: theme.colorTickIdle,
    fontVariant: ['tabular-nums'],
  },
  slot: {
    flexDirection: 'row',
    overflow: 'hidden',
    marginTop: GRID_GAP,
    borderRadius: theme.radiusSmall,
    backgroundColor: theme.colorSurfaceSubtle,
  },
  rail: {
    width: 3,
    borderRadius: 1.5,
    backgroundColor: theme.colorAccentInk,
    marginVertical: theme.space1,
    marginLeft: theme.space1,
  },
  // Out of the flow while a layout commit is in flight (the fold's rule).
  railOut: {
    position: 'absolute',
    top: theme.space1,
    left: theme.space1,
    marginVertical: 0,
    marginLeft: 0,
    transformOrigin: 'top',
  },
  slotContent: {
    flex: 1,
    paddingVertical: theme.space1,
    paddingHorizontal: theme.space2,
    gap: theme.space0_5,
  },
  dayTitle: {
    fontSize: theme.textSM,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
  },
  daySubtitle: {
    fontSize: theme.textXS,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightXS,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
    paddingVertical: theme.space0_5,
  },
  rowIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colorSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space0_5,
  },
  rowTitle: {
    fontSize: theme.textSM,
    color: theme.colorTextPrimary,
    flexShrink: 1,
  },
  rowDetail: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    flexShrink: 1,
  },
  rowFormatTag: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    letterSpacing: theme.trackingWide,
    fontWeight: theme.weightMedium,
    flexShrink: 0,
  },
  rowTime: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: theme.space2,
    rowGap: theme.space0_5,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space0_5,
  },
  legendText: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
  },
  swatch: {
    width: 12,
    height: 12,
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  swatchVomit: {
    backgroundColor: theme.colorEventSymptom,
  },
  swatchLogged: {
    backgroundColor: theme.colorSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colorBorder,
  },
  swatchUnlogged: {
    backgroundColor: theme.colorSurfaceSubtle,
  },
  swatchHairline: {
    width: 7,
    height: 2,
    borderRadius: 1,
    marginBottom: 2,
  },
  swatchHairlineLogged: {
    backgroundColor: theme.colorAccentSoft,
  },
  swatchHairlineLeftSome: {
    backgroundColor: theme.colorAccentWashDeep,
  },
  stateBox: {
    gap: theme.space1,
    alignItems: 'flex-start',
  },
  retryBtn: {
    paddingHorizontal: theme.space2,
    paddingVertical: theme.space1,
    borderRadius: theme.radiusSmall,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    minHeight: 44,
    justifyContent: 'center',
  },
  retryText: {
    fontSize: theme.textSM,
    color: theme.colorAccentInk,
    fontWeight: theme.weightMedium,
  },
});
