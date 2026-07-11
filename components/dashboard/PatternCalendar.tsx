import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import { FrequencyCalendarCard } from './FrequencyCalendarCard';
import { DayEventsSheet } from './DayEventsSheet';
import { ChipGroup } from '../ui/ChipGroup';
import {
  getSymptomFrequencyByMonth,
  getIntakeDeclineByMonth,
  addCalendarMonths,
  compareCalendarMonth,
  type CalendarMonth,
  type DayFrequencyBucket,
} from '../../lib/analytics';
import { getTimeline, type TimelineRow } from '../../lib/db';
import { utcDayBounds } from '../../lib/utils';

// PatternCalendar — the stateful container behind the Patterns "Calendar" card (B-284 N5b /
// B-226 / B-310). It owns the three things the pure FrequencyCalendarCard can't: the shown
// month + fetch-on-page (B-309), the day drill-in's per-day event fetch + sheet (B-308), and
// — new in B-310 — the LENS selector: an owner with two active symptoms (a diet-trial dog
// vomiting AND with loose stool) can now see EACH symptom's calendar, and an intake-decline
// ("Meals") lens brings the same v3 grid + drill-in to Sam's intake-is-not-preference signal,
// which previously had only a "Meals finished 82%" stat and no calendar at all.
//
// The grid stays SYMPTOM-scoped per the PM's A/A/A call (2026-07-10) — we do NOT pip
// meals/meds into a symptom grid (that buries the signal). Instead each lens is its own
// day-count series: a symptom's occurrences, or the day-count of unfinished meals. Switching
// lens needs NO refetch — every month's fetch loads BOTH the all-symptom buckets (byType
// carries every symptom) and the intake-decline buckets, so a chip tap is an instant re-read.
//
// Rendered per active pet — the insights screen keys it on petId so a pet switch remounts it
// fresh (seeded from the new pet's props), never carrying one pet's month/cache/lens into
// another (the multi-pet stale-state trap).
//
// Bounds: paging is disabled forward past the current month and backward past the pet's
// earliest logged event (bounded oldest-data → current month, §8.1). The initial (current)
// month is seeded from props so the first paint is flash-free — only paging to an un-cached
// month shows the brief loading dim.

const DAY_EVENT_LIMIT = 200; // a single day's events never approach this; a safe ceiling.

/** One selectable lens in the Calendar card. A symptom lens charts one symptom type's daily
 *  occurrences (from the shared all-symptom month buckets); the intake lens charts the daily
 *  count of unfinished meals (its own month buckets). Copy (noun/unit/definition/drillLabel)
 *  is resolved by the screen so this container stays free of nyx-voice strings. */
export interface CalendarView {
  /** Stable identity across re-renders + reorders ("symptom:vomit" | "intake"). */
  key: string;
  kind: 'symptom' | 'intake';
  /** Which symptom's byType count to chart (kind === 'symptom' only). */
  symptomType?: string;
  /** The selector chip's label ("Vomiting" / "Meals"). */
  chipLabel: string;
  /** What the summary / empty / a11y copy calls the counted thing ("Vomiting" /
   *  "Unfinished meals"). */
  noun: string;
  /** The summary tail count word ("time" / "meal"). */
  unit: string;
  /** The (i) "what does this measure?" text for this lens. */
  definition: string;
  /** The drill-in sheet subtitle label for this lens ("Vomiting" / "Unfinished meals"). */
  drillLabel: string;
}

interface Props {
  petId: string;
  /** The card header — "Calendar" (the B-310 rebrand of the old per-symptom title). */
  title: string;
  /** ≥1 lens, ordered; views[0] is the default (the dominant active symptom, else intake). */
  views: CalendarView[];
  /** The month shown first (today's UTC month) — also the forward paging bound. */
  currentMonth: CalendarMonth;
  /** The pet's earliest-event month — the backward paging bound. null → no prev. */
  earliestMonth: CalendarMonth | null;
  /** Current month's all-symptom buckets, pre-loaded so the first paint doesn't flash. */
  initialSymptomBuckets: DayFrequencyBucket[];
  /** Current month's intake-decline buckets, pre-loaded. [] when there's no intake lens. */
  initialIntakeBuckets: DayFrequencyBucket[];
}

/** A month's two bucket series — cached together so a lens switch never refetches. */
interface MonthData {
  symptom: DayFrequencyBucket[];
  intake: DayFrequencyBucket[];
}

function monthKey(m: CalendarMonth): string {
  return `${m.year}-${m.month}`;
}

function monthLabelOf(m: CalendarMonth): string {
  return new Date(Date.UTC(m.year, m.month, 1)).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function PatternCalendar({
  petId,
  title,
  views,
  currentMonth,
  earliestMonth,
  initialSymptomBuckets,
  initialIntakeBuckets,
}: Props) {
  const hasSymptomView = views.some((v) => v.kind === 'symptom');
  const hasIntakeView = views.some((v) => v.kind === 'intake');

  const [month, setMonth] = useState<CalendarMonth>(currentMonth);
  const [cache, setCache] = useState<Map<string, MonthData>>(
    () =>
      new Map([[monthKey(currentMonth), { symptom: initialSymptomBuckets, intake: initialIntakeBuckets }]]),
  );
  const [loading, setLoading] = useState(false);
  const monthLoadRef = useRef(0);

  // The active lens. Persisted across paging (a lens switch keeps the shown month) and
  // resilient to a views reorder/removal — if the selected lens resolves away (its symptom
  // is no longer active), fall back to the current lead (views[0]) rather than a blank grid.
  const [selectedKey, setSelectedKey] = useState<string>(() => views[0].key);
  const selected = useMemo(
    () => views.find((v) => v.key === selectedKey) ?? views[0],
    [views, selectedKey],
  );

  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [dayRows, setDayRows] = useState<TimelineRow[] | null>(null);
  const [dayError, setDayError] = useState(false);
  const dayLoadRef = useRef(0);

  // Keep the current month's grids in step with a fresh parent load. The insights screen
  // re-runs load() on focus / after a background sync and passes NEW initial buckets; this
  // card persists across those re-renders (same petId key), so without this its once-seeded
  // cache entry would go stale against the count card above it (both reviewers). Only the
  // current month is reconciled — it's always the freshest "today" read; paged months are
  // point-in-time snapshots.
  useEffect(() => {
    setCache((prev) =>
      new Map(prev).set(monthKey(currentMonth), {
        symptom: initialSymptomBuckets,
        intake: initialIntakeBuckets,
      }),
    );
  }, [initialSymptomBuckets, initialIntakeBuckets, currentMonth]);

  const shownKey = monthKey(month);
  const entry = cache.get(shownKey);
  const buckets = entry ? (selected.kind === 'intake' ? entry.intake : entry.symptom) : [];
  const symptomTypeForCard = selected.kind === 'symptom' ? selected.symptomType : undefined;
  // A shown month that is neither loaded (cached) nor loading FAILED to fetch — surface an
  // error + retry, NEVER a computed "No {lens} logged" (a fetch failure is not an observed
  // all-clear; §11 #2). The seeded current month is always cached, so this only reaches an
  // actually-failed page fetch.
  const monthErrored = !loading && !cache.has(shownKey);
  const canGoPrev = earliestMonth ? compareCalendarMonth(month, earliestMonth) > 0 : false;
  const canGoNext = compareCalendarMonth(month, currentMonth) < 0;

  const goToMonth = useCallback(
    async (target: CalendarMonth) => {
      setMonth(target);
      // The selection doesn't carry across months — close any open drill-in.
      setSheetVisible(false);
      setSelectedDay(null);
      const key = monthKey(target);
      if (cache.has(key)) return; // already loaded (incl. the seeded current month) — no flash
      const myId = ++monthLoadRef.current;
      setLoading(true);
      try {
        // Fetch only the series the card actually offers a lens for (an intake-only card
        // never queries symptoms, and vice versa). Both land in one cache entry so switching
        // lens on this month is instant thereafter.
        const [symptom, intake] = await Promise.all([
          hasSymptomView ? getSymptomFrequencyByMonth(petId, target) : Promise.resolve([]),
          hasIntakeView ? getIntakeDeclineByMonth(petId, target) : Promise.resolve([]),
        ]);
        // Keyed write: a slow fetch can only land on ITS month, never overwrite another.
        setCache((prev) => (prev.has(key) ? prev : new Map(prev).set(key, { symptom, intake })));
      } catch (e) {
        console.warn('[calendar] month load failed:', e);
      } finally {
        if (monthLoadRef.current === myId) setLoading(false);
      }
    },
    [cache, petId, hasSymptomView, hasIntakeView],
  );

  const handlePrev = useCallback(() => {
    if (canGoPrev) goToMonth(addCalendarMonths(month, -1));
  }, [canGoPrev, goToMonth, month]);

  const handleNext = useCallback(() => {
    if (canGoNext) goToMonth(addCalendarMonths(month, 1));
  }, [canGoNext, goToMonth, month]);

  // Switching lens keeps the shown month + its cached buckets (no refetch) but closes any
  // open drill-in — the sheet's subtitle names the OLD lens's count, so it must not linger
  // against the new lens.
  const handleSelectLens = useCallback((next: string | null) => {
    if (!next) return; // a lens is always selected (ChipGroup allowDeselect=false)
    setSelectedKey(next);
    setSheetVisible(false);
    setSelectedDay(null);
  }, []);

  const openDay = useCallback(
    async (dayKey: string) => {
      const myId = ++dayLoadRef.current;
      setSelectedDay(dayKey);
      setSheetVisible(true);
      setDayError(false);
      setDayRows(null); // loading
      const bounds = utcDayBounds(dayKey);
      if (!bounds) {
        if (dayLoadRef.current === myId) setDayRows([]);
        return;
      }
      try {
        // Bounded single UTC day [after, before) — the same bounds History's single-day
        // filter uses (B-308), so the drill-in list and the deep-linked History agree.
        const rows = await getTimeline(petId, DAY_EVENT_LIMIT, 0, null, bounds.after, bounds.before);
        if (dayLoadRef.current === myId) setDayRows(rows);
      } catch (e) {
        console.warn('[calendar] day load failed:', e);
        // Distinct error flag — a failed fetch must NOT collapse to an empty [] that reads
        // as "Nothing logged this day." (a silent failure / false all-clear; §11 #2).
        if (dayLoadRef.current === myId) setDayError(true);
      }
    },
    [petId],
  );

  const closeSheet = useCallback(() => {
    setSheetVisible(false);
    setSelectedDay(null);
  }, []);

  const openInHistory = useCallback((dayKey: string) => {
    setSheetVisible(false);
    setSelectedDay(null);
    // Deep-link History filtered to this UTC day. `ts` is a nonce so the filter re-applies
    // even when the History tab is already mounted (a doorway tap is not a remount) —
    // mirrors the Home "Today" doorway (TodayZone).
    router.push({ pathname: '/(tabs)/history', params: { date: dayKey, ts: String(Date.now()) } });
  }, []);

  // The selected lens's count on the drilled-in day — drives the sheet subtitle. Read from
  // the already-loaded month buckets (no extra fetch): a symptom's byType count, or the
  // intake lens's day total (unfinished-meal count).
  const dayBucket = selectedDay ? buckets.find((b) => b.date === selectedDay) : undefined;
  const drillCount = !dayBucket
    ? 0
    : selected.kind === 'intake'
      ? dayBucket.total
      : dayBucket.byType[selected.symptomType as string] ?? 0;

  // Only offer the selector when there's more than one lens — a lone chip is noise.
  const selector =
    views.length > 1 ? (
      <ChipGroup
        options={views.map((v) => ({ value: v.key, label: v.chipLabel }))}
        value={selected.key}
        onChange={handleSelectLens}
        allowDeselect={false}
        variant="filled"
        accessibilityLabel="Calendar view"
      />
    ) : undefined;

  return (
    <>
      <FrequencyCalendarCard
        title={title}
        noun={selected.noun}
        unit={selected.unit}
        selector={selector}
        buckets={buckets}
        symptomType={symptomTypeForCard}
        definition={selected.definition}
        monthLabel={monthLabelOf(month)}
        onPrevMonth={handlePrev}
        onNextMonth={handleNext}
        canGoPrev={canGoPrev}
        canGoNext={canGoNext}
        loading={loading}
        error={monthErrored}
        onRetry={() => goToMonth(month)}
        onDayPress={openDay}
        selectedDay={selectedDay}
      />
      <DayEventsSheet
        visible={sheetVisible}
        dayKey={selectedDay}
        symptomLabel={selected.drillLabel}
        symptomCount={drillCount}
        rows={dayRows}
        error={dayError}
        onClose={closeSheet}
        onRetry={() => selectedDay && openDay(selectedDay)}
        onOpenInHistory={openInHistory}
      />
    </>
  );
}
