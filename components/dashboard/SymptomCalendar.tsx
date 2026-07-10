import { useCallback, useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { FrequencyCalendarCard } from './FrequencyCalendarCard';
import { DayEventsSheet } from './DayEventsSheet';
import {
  getSymptomFrequencyByMonth,
  addCalendarMonths,
  compareCalendarMonth,
  type CalendarMonth,
  type DayFrequencyBucket,
} from '../../lib/analytics';
import { getTimeline, type TimelineRow } from '../../lib/db';
import { utcDayBounds } from '../../lib/utils';

// SymptomCalendar — the stateful container behind the Patterns frequency calendar (B-284
// N5b / B-226). It owns the three things the pure FrequencyCalendarCard can't: the shown
// month + fetch-on-page (B-309), and the day drill-in's per-day event fetch + sheet
// (B-308). The card stays presentational + DB-free; this is the seam where local SQLite
// reads happen. Rendered per active pet — the insights screen keys it on petId so a pet
// switch remounts it fresh (seeded from the new pet's props), never carrying one pet's
// month/cache into another (the multi-pet stale-state trap).
//
// Bounds: paging is disabled forward past the current month and backward past the pet's
// earliest logged event (bounded oldest-data → current month, §8.1). The initial (current)
// month is seeded from a prop so the first paint is flash-free — only paging to an
// un-cached month shows the brief loading dim.

const DAY_EVENT_LIMIT = 200; // a single day's events never approach this; a safe ceiling.

interface Props {
  petId: string;
  /** The charted symptom's display label ("Vomiting"). */
  title: string;
  symptomType: string;
  definition?: string;
  /** The month shown first (today's UTC month) — also the forward paging bound. */
  currentMonth: CalendarMonth;
  /** The pet's earliest-event month — the backward paging bound. null → no prev. */
  earliestMonth: CalendarMonth | null;
  /** Current month's buckets (all types), pre-loaded so the first paint doesn't flash. */
  initialBuckets: DayFrequencyBucket[];
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

export function SymptomCalendar({
  petId,
  title,
  symptomType,
  definition,
  currentMonth,
  earliestMonth,
  initialBuckets,
}: Props) {
  const [month, setMonth] = useState<CalendarMonth>(currentMonth);
  const [cache, setCache] = useState<Map<string, DayFrequencyBucket[]>>(
    () => new Map([[monthKey(currentMonth), initialBuckets]]),
  );
  const [loading, setLoading] = useState(false);
  const monthLoadRef = useRef(0);

  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [dayRows, setDayRows] = useState<TimelineRow[] | null>(null);
  const [dayError, setDayError] = useState(false);
  const dayLoadRef = useRef(0);

  // Keep the current month's grid in step with a fresh parent load. The insights screen
  // re-runs load() on focus / after a background sync and passes a NEW initialBuckets; this
  // card persists across those re-renders (same petId+symptomType key), so without this its
  // once-seeded cache entry would go stale against the count card above it (both reviewers).
  // Only the current month is reconciled — it's always the freshest "today" read; paged
  // months are point-in-time snapshots.
  useEffect(() => {
    setCache((prev) => new Map(prev).set(monthKey(currentMonth), initialBuckets));
  }, [initialBuckets, currentMonth]);

  const shownKey = monthKey(month);
  const buckets = cache.get(shownKey) ?? [];
  // A shown month that is neither loaded (cached) nor loading FAILED to fetch — surface an
  // error + retry, NEVER a computed "No {symptom} logged" (a fetch failure is not an
  // observed all-clear; §11 #2 / no-silent-failures). The seeded current month is always
  // cached, so this only reaches an actually-failed page fetch.
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
        const b = await getSymptomFrequencyByMonth(petId, target);
        // Keyed write: a slow fetch can only land on ITS month, never overwrite another.
        setCache((prev) => (prev.has(key) ? prev : new Map(prev).set(key, b)));
      } catch (e) {
        console.warn('[calendar] month load failed:', e);
      } finally {
        if (monthLoadRef.current === myId) setLoading(false);
      }
    },
    [cache, petId],
  );

  const handlePrev = useCallback(() => {
    if (canGoPrev) goToMonth(addCalendarMonths(month, -1));
  }, [canGoPrev, goToMonth, month]);

  const handleNext = useCallback(() => {
    if (canGoNext) goToMonth(addCalendarMonths(month, 1));
  }, [canGoNext, goToMonth, month]);

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

  // The charted symptom's count on the selected day — drives the sheet subtitle. Read from
  // the already-loaded month bucket (no extra fetch).
  const symptomCount = selectedDay
    ? buckets.find((b) => b.date === selectedDay)?.byType[symptomType] ?? 0
    : 0;

  return (
    <>
      <FrequencyCalendarCard
        title={title}
        buckets={buckets}
        symptomType={symptomType}
        definition={definition}
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
        symptomLabel={title}
        symptomCount={symptomCount}
        rows={dayRows}
        error={dayError}
        onClose={closeSheet}
        onRetry={() => selectedDay && openDay(selectedDay)}
        onOpenInHistory={openInHistory}
      />
    </>
  );
}
