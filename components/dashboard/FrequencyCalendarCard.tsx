import { useState } from 'react';
import { Pressable, View, Text, StyleSheet } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { theme, shadows } from '../../constants/theme';
import { MetricInfoButton, MetricDefinition } from './MetricInfo';
import { pluralize } from '../../lib/dashboardCards';
import { formatUtcDayShort } from '../../lib/utils';
import type { DayFrequencyBucket } from '../../lib/analytics';

// FrequencyCalendarCard — a month calendar of an episodic symptom's daily counts
// (§5 #4 / §6; redesigned for B-284 N5 / B-226, extended for N5b). Each cell is one
// calendar day showing its date; a day with symptoms darkens + semibolds the numeral and
// carries count-PIPS (1–3 rose dots, ×N beyond) — a countable read that replaced the old
// opacity heat-ramp, which never read as legible even with a legend (B-226 #3). A computed
// summary line sits above the grid. This is descriptive OCCURRENCE (the same events History
// shows), so it is not gated by the §13 #6 establishment rule — but it is NEVER framed as an
// all-clear: a month of empty cells is "none logged", not wellness (§11 #2 / clinical-guardrails).
//
// N5b adds paging + drill-in as OPTIONAL props (SymptomCalendar owns the state/fetch; this
// stays a pure, DB-free presentational component so buildHeatRows + rendering stay unit-
// testable without a store):
//   • month paging — a ‹ Month YYYY › nav row (shown when monthLabel is set), bounded by
//     canGoPrev/canGoNext (B-226 #2 / B-309).
//   • day drill-in — onDayPress makes each real cell a ≥44pt button; the selected cell reads
//     teal (B-226 #1 / B-311: selection is the sole interactive-accent use here — pips stay
//     rose, per §1.3 "teal is the only interactive accent").
//
// Still deferred to a later N5b follow-up: the "Show all logging" coverage-gap layer (needs
// a separate any-event-per-day source — filed B-312). The pure buildHeatRows grid math is
// unchanged and stays the tested surface (AC-N5).

const DAYS_PER_WEEK = 7;
// Column headers, Sun-first to match weekdayOf (getUTCDay 0=Sun) + the lead padding.
const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;
// 1–3 episodes render as that many rose pips; 4+ collapses to a single "×N" numeral so a
// busy day stays legible instead of overflowing the cell with dots.
const MAX_PIPS = 3;

/** Day-of-month from a 'YYYY-MM-DD' bucket key (blank pad cells have no date). */
function dayOfMonth(cell: Cell): number | null {
  return cell.blank ? null : Number(cell.key.slice(8, 10));
}

interface Props {
  /** "Vomiting", "Loose stool" — the symptom this grid is about. */
  title: string;
  /** One bucket per calendar day in the shown month/window (oldest first) — from analytics. */
  buckets: DayFrequencyBucket[];
  /** Show one symptom type's count (bucket.byType[type]); omit → the day total. */
  symptomType?: string;
  /** Warm copy when nothing was logged ("No vomiting logged this month."). Legacy
   *  (non-paging) mode only; paging mode uses the computed summary line instead. */
  emptyMessage?: string;
  /** One-line "what does this measure?" definition (B-100). When set, a tap-to-reveal
   *  (i) shows in the header. */
  definition?: string;

  // ── Paging (N5b) — all optional; when monthLabel is set the ‹ › nav row shows. ──
  /** "June 2026" — the shown month. Presence switches the card into paging mode. */
  monthLabel?: string;
  onPrevMonth?: () => void;
  onNextMonth?: () => void;
  canGoPrev?: boolean;
  canGoNext?: boolean;
  /** A month fetch is in flight (paging) — dims the grid so a stale month can't be
   *  mistaken for the one being loaded. */
  loading?: boolean;

  // ── Day drill-in (N5b) ──
  /** Tapping a real day cell calls this with its 'YYYY-MM-DD' key. */
  onDayPress?: (dayKey: string) => void;
  /** The currently-open day (teal selection ring), or null. */
  selectedDay?: string | null;
}

export interface Cell {
  key: string;
  count: number;
  blank: boolean;
}

export interface HeatGrid {
  rows: Cell[][];
  /** The window's busiest day count — drives the "most on {day} (×N)" summary. */
  max: number;
  /** How many days had ≥1 event — the honest summary + the empty check. */
  daysWithEvents: number;
  /** Total events across the window — the "N times" in the summary. */
  total: number;
  /** Date key ('YYYY-MM-DD') of the busiest day (earliest on a tie), or null when empty. */
  worstDate: string | null;
}

function countOf(bucket: DayFrequencyBucket, symptomType?: string): number {
  return symptomType ? bucket.byType[symptomType] ?? 0 : bucket.total;
}

/** UTC weekday (0=Sun..6=Sat) of a 'YYYY-MM-DD' day key. */
function weekdayOf(dateKey: string): number {
  return new Date(`${dateKey}T00:00:00Z`).getUTCDay();
}

/** Pure: turn day buckets into a weekday-aligned month grid + the summary aggregates.
 *  Leading blanks pad the first row so each column lands on its real UTC weekday
 *  (Apple-style); trailing blanks fill the last row to 7. Extracted + tested so a
 *  weekday-modulo off-by-one can't slip into the "how often" read (AC-N5). */
export function buildHeatRows(buckets: DayFrequencyBucket[], symptomType?: string): HeatGrid {
  const counts = buckets.map((b) => countOf(b, symptomType));
  let max = 0;
  let total = 0;
  let daysWithEvents = 0;
  let worstDate: string | null = null;
  counts.forEach((c, i) => {
    total += c;
    if (c > 0) daysWithEvents += 1;
    if (c > max) {
      max = c;
      worstDate = buckets[i].date; // first day achieving the max → earliest wins on a tie
    }
  });

  const cells: Cell[] = [];
  if (buckets.length > 0) {
    const lead = weekdayOf(buckets[0].date);
    for (let i = 0; i < lead; i++) cells.push({ key: `lead-${i}`, count: 0, blank: true });
  }
  buckets.forEach((b, i) => cells.push({ key: b.date, count: counts[i], blank: false }));
  while (cells.length % DAYS_PER_WEEK !== 0) {
    cells.push({ key: `trail-${cells.length}`, count: 0, blank: true });
  }
  const rows: Cell[][] = [];
  for (let i = 0; i < cells.length; i += DAYS_PER_WEEK) rows.push(cells.slice(i, i + DAYS_PER_WEEK));

  return { rows, max, daysWithEvents, total, worstDate };
}

/** The bare month name ("June") from a "June 2026" label — the empty-month summary reads
 *  "No vomiting logged in June" (no year, matching the mock). Strips a trailing " YYYY". */
function monthNameOf(monthLabel?: string): string | null {
  if (!monthLabel) return null;
  return monthLabel.replace(/\s+\d{4}$/, '');
}

/** The summary sentence above the grid — specific (Pattern 2) and in-voice ("times",
 *  never the clinical "episodes"): "Vomiting on 5 days · most on Jun 24 (×4) · 11 times".
 *  The "most on" clause only shows when a single day carried more than one (a flat
 *  1-per-day spread has no meaningful peak to call out). An empty month is honest, never
 *  an all-clear: "No vomiting logged in June." (§11 #2). */
function summaryLine(title: string, grid: HeatGrid, monthLabel?: string): string {
  if (grid.daysWithEvents === 0) {
    const monthName = monthNameOf(monthLabel);
    return monthName
      ? `No ${title.toLowerCase()} logged in ${monthName}.`
      : `No ${title.toLowerCase()} logged.`;
  }
  const days = `${title} on ${grid.daysWithEvents} ${pluralize(grid.daysWithEvents, 'day')}`;
  const peak =
    grid.max > 1 && grid.worstDate ? ` · most on ${formatUtcDayShort(grid.worstDate)} (×${grid.max})` : '';
  const times = ` · ${grid.total} ${pluralize(grid.total, 'time')}`;
  return days + peak + times;
}

/** Per-cell VoiceOver label — the count is spoken, not just shown (AC-N5). Non-reassuring:
 *  a clean day reads "no {symptom} logged", never an all-clear (§11 #2). A selectable cell
 *  appends "opens the day" so the drill-in affordance is discoverable to VoiceOver. */
function dayLabel(cell: Cell, title: string, selectable: boolean, selected: boolean): string {
  const date = formatUtcDayShort(cell.key);
  const symptom = title.toLowerCase();
  const base =
    cell.count > 0
      ? `${date}, ${symptom} logged ${cell.count} ${pluralize(cell.count, 'time')}`
      : `${date}, no ${symptom} logged`;
  if (selected) return `${base}, selected`;
  return selectable ? `${base}, opens the day` : base;
}

export function FrequencyCalendarCard({
  title,
  buckets,
  symptomType,
  emptyMessage,
  definition,
  monthLabel,
  onPrevMonth,
  onNextMonth,
  canGoPrev = false,
  canGoNext = false,
  loading = false,
  onDayPress,
  selectedDay,
}: Props) {
  const [defOpen, setDefOpen] = useState(false);
  const grid = buildHeatRows(buckets, symptomType);
  const paging = monthLabel != null;
  // Legacy (non-paging) mode keeps the swap-body empty state; paging always shows the
  // grid so the owner can page/drill into a month with no charted symptom.
  const showEmptyBody = !paging && grid.daysWithEvents === 0;

  const range =
    buckets.length > 0
      ? `${formatUtcDayShort(buckets[0].date)} – ${formatUtcDayShort(buckets[buckets.length - 1].date)}`
      : '';

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{title}</Text>
        {definition != null && (
          <MetricInfoButton
            open={defOpen}
            onToggle={() => setDefOpen((v) => !v)}
            metricLabel={title}
          />
        )}
      </View>

      {/* Month nav (paging mode) — ‹ Month YYYY › */}
      {paging && (
        <View style={styles.navRow}>
          <Pressable
            onPress={onPrevMonth}
            disabled={!canGoPrev}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            accessibilityState={{ disabled: !canGoPrev }}
            style={styles.navBtn}
          >
            <ChevronLeft
              size={20}
              color={canGoPrev ? theme.colorTextSecondary : theme.colorTextDisabled}
            />
          </Pressable>
          <Text style={styles.monthLabel}>{monthLabel}</Text>
          <Pressable
            onPress={onNextMonth}
            disabled={!canGoNext}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Next month"
            accessibilityState={{ disabled: !canGoNext }}
            style={styles.navBtn}
          >
            <ChevronRight
              size={20}
              color={canGoNext ? theme.colorTextSecondary : theme.colorTextDisabled}
            />
          </Pressable>
        </View>
      )}

      {showEmptyBody ? (
        <Text style={styles.stateText}>{emptyMessage ?? `No ${title.toLowerCase()} logged ${range}.`}</Text>
      ) : (
        <>
          {/* Computed, specific summary (Pattern 2) — answers "how often / worst day / how
              many times" before the grid is even scanned. */}
          <Text style={styles.summary}>{summaryLine(title, grid, monthLabel)}</Text>
          {/* Weekday header orients the columns; every day carries its numeral (a real
              calendar), symptom days darken + carry pips. `loading` dims a stale month. */}
          <View style={styles.weekdayHeader}>
            {WEEKDAY_LABELS.map((d, i) => (
              <Text key={i} style={styles.weekdayLabel}>
                {d}
              </Text>
            ))}
          </View>
          <View style={[styles.grid, loading && styles.gridLoading]}>
            {grid.rows.map((row) => (
              <View key={row[0].key} style={styles.weekRow}>
                {row.map((cell) => {
                  const dom = dayOfMonth(cell);
                  const hasSymptom = cell.count > 0;
                  const selectable = !cell.blank && onDayPress != null;
                  const selected = !cell.blank && selectedDay === cell.key;
                  const inner = (
                    <>
                      {!cell.blank && (
                        <>
                          <Text style={[styles.dayNum, hasSymptom && styles.dayNumSymptom]}>{dom}</Text>
                          <View style={styles.pips}>
                            {hasSymptom &&
                              cell.count <= MAX_PIPS &&
                              Array.from({ length: cell.count }).map((_, i) => (
                                <View key={i} testID="symptom-pip" style={styles.pip} />
                              ))}
                            {cell.count > MAX_PIPS && <Text style={styles.pipMore}>×{cell.count}</Text>}
                          </View>
                        </>
                      )}
                    </>
                  );
                  const cellStyle = [
                    styles.cell,
                    cell.blank && styles.cellBlank,
                    selected && styles.cellSelected,
                  ];
                  // A selectable cell is a ≥44pt button (hitSlop clears the touch floor
                  // without overlapping neighbours, which sit 4px apart). VoiceOver reads
                  // the count + affordance; a clean day never reads as an all-clear.
                  return selectable ? (
                    <Pressable
                      key={cell.key}
                      onPress={() => onDayPress?.(cell.key)}
                      hitSlop={2}
                      accessibilityRole="button"
                      accessibilityLabel={dayLabel(cell, title, true, selected)}
                      style={cellStyle}
                    >
                      {inner}
                    </Pressable>
                  ) : (
                    <View
                      key={cell.key}
                      style={cellStyle}
                      accessible={!cell.blank}
                      accessibilityLabel={cell.blank ? undefined : dayLabel(cell, title, false, false)}
                    >
                      {inner}
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        </>
      )}

      {/* B-100 definition reveal — decodes "which days" + the pip count. */}
      {definition != null && defOpen && <MetricDefinition text={definition} />}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colorSurface,
    borderRadius: theme.radiusMedium,
    padding: theme.space3,
    minHeight: 44,
    gap: theme.space2,
    ...shadows.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
    flexShrink: 1,
  },
  // Month paging row — ‹ centered-label › .
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
    fontSize: theme.textSM,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
  },
  summary: {
    fontSize: theme.textXS,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    lineHeight: 16,
  },
  weekdayHeader: {
    flexDirection: 'row',
    gap: 4,
  },
  weekdayLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: theme.textXS,
    color: theme.colorTextDisabled,
  },
  grid: {
    gap: 4,
  },
  // Dim a stale month while the next one's buckets load (paging).
  gridLoading: {
    opacity: 0.4,
  },
  weekRow: {
    flexDirection: 'row',
    gap: 4,
  },
  cell: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: theme.radiusXS,
    backgroundColor: theme.colorSurfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 3,
    gap: 2,
    // Transparent by default so a selected cell can swap the border COLOUR without
    // shifting the grid's layout (every cell reserves the same 1.5px ring).
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  // A padding cell (before the 1st / after the last of the month) is invisible.
  cellBlank: {
    backgroundColor: 'transparent',
  },
  // The drill-in selection — teal, the sole interactive-accent use on this light records
  // surface (§1.3 / B-311). A ring (not a fill) so the rose pips stay readable inside it.
  cellSelected: {
    borderColor: theme.colorAccent,
  },
  dayNum: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    lineHeight: theme.textXS,
  },
  // A symptom day's numeral is the high-contrast anchor (the pips/×N are supplementary).
  dayNumSymptom: {
    color: theme.colorTextPrimary,
    fontWeight: theme.weightSemibold,
  },
  pips: {
    flexDirection: 'row',
    gap: 2,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 5,
  },
  pip: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: theme.colorEventSymptom,
  },
  pipMore: {
    fontSize: 10,
    lineHeight: 11,
    fontWeight: theme.weightSemibold,
    color: theme.colorEventSymptom,
  },
  stateText: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightBody,
  },
});
