import { useState } from 'react';
import { Pressable, View, Text, StyleSheet } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { theme, shadows } from '../../constants/theme';
import { MetricInfoButton, MetricDefinition } from './MetricInfo';
import { pluralize } from '../../lib/dashboardCards';
import type { DayFrequencyBucket } from '../../lib/analytics';

// FrequencyCalendarCard — a month calendar of an episodic symptom's daily counts
// (§5 #4 / §6; redesigned for B-284 N5 / B-226). Each cell is one calendar day showing
// its date; a day with symptoms darkens + semibolds the numeral and carries count-PIPS
// (1–3 rose dots, ×N beyond) — a countable read that replaced the old opacity heat-ramp,
// which never read as legible even with a legend (B-226 #3). A computed summary line sits
// above the grid. This is descriptive OCCURRENCE (the same events History shows), so it is
// not gated by the §13 #6 establishment rule — but it is NEVER framed as an all-clear: a
// month of empty cells is "none logged", not wellness (§11 #2 / clinical-guardrails).
//
// Deferred to the N5b follow-ups (each needs data/nav the screen doesn't load today):
// month paging (B-301), the per-day drill-in + History deep-link (B-300), and the
// "days I logged nothing" coverage layer (needs an any-event-per-day source). The pure
// buildHeatRows grid math is unchanged and stays the tested surface (AC-N5).

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
  /** One bucket per calendar day in the window (oldest first) — from analytics. */
  buckets: DayFrequencyBucket[];
  /** Show one symptom type's count (bucket.byType[type]); omit → the day total. */
  symptomType?: string;
  /** Warm copy when nothing was logged ("No vomiting logged this month."). */
  emptyMessage?: string;
  /** One-line "what does this measure?" definition (B-100). When set, a tap-to-reveal
   *  (i) shows in the header. */
  definition?: string;
  onPress?: () => void;
  accessibilityHint?: string;
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

function formatDay(dateKey: string): string {
  return new Date(`${dateKey}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
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

/** The summary sentence above the grid — specific (Pattern 2) and in-voice ("times",
 *  never the clinical "episodes"): "Vomiting on 5 days · most on Jun 24 (×4) · 11 times".
 *  The "most on" clause only shows when a single day carried more than one (a flat
 *  1-per-day spread has no meaningful peak to call out). */
function summaryLine(title: string, grid: HeatGrid): string {
  const days = `${title} on ${grid.daysWithEvents} ${pluralize(grid.daysWithEvents, 'day')}`;
  const peak =
    grid.max > 1 && grid.worstDate ? ` · most on ${formatDay(grid.worstDate)} (×${grid.max})` : '';
  const times = ` · ${grid.total} ${pluralize(grid.total, 'time')}`;
  return days + peak + times;
}

/** Per-cell VoiceOver label — the count is spoken, not just shown (AC-N5). Non-reassuring:
 *  a clean day reads "no {symptom} logged", never an all-clear (§11 #2). */
function dayLabel(cell: Cell, title: string): string {
  const date = formatDay(cell.key);
  const symptom = title.toLowerCase();
  return cell.count > 0
    ? `${date}, ${symptom} logged ${cell.count} ${pluralize(cell.count, 'time')}`
    : `${date}, no ${symptom} logged`;
}

export function FrequencyCalendarCard({
  title,
  buckets,
  symptomType,
  emptyMessage,
  definition,
  onPress,
  accessibilityHint,
}: Props) {
  const [defOpen, setDefOpen] = useState(false);
  const grid = buildHeatRows(buckets, symptomType);
  const isEmpty = grid.daysWithEvents === 0;

  const range =
    buckets.length > 0
      ? `${formatDay(buckets[0].date)} – ${formatDay(buckets[buckets.length - 1].date)}`
      : '';

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole={onPress != null ? 'button' : undefined}
      accessibilityLabel={`${title} calendar`}
      accessibilityHint={onPress != null ? accessibilityHint ?? 'Opens the full history' : undefined}
      style={({ pressed }) => [styles.card, pressed && onPress != null && styles.pressed]}
    >
      <View style={styles.headerRow}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.headerActions}>
          {definition != null && (
            <MetricInfoButton
              open={defOpen}
              onToggle={() => setDefOpen((v) => !v)}
              metricLabel={title}
            />
          )}
          {onPress != null && <ChevronRight size={18} color={theme.colorTextDisabled} />}
        </View>
      </View>

      {isEmpty ? (
        <Text style={styles.stateText}>{emptyMessage ?? `No ${title.toLowerCase()} logged ${range}.`}</Text>
      ) : (
        <>
          {/* Computed, specific summary (Pattern 2) — answers "how often / worst day / how
              many times" before the grid is even scanned. */}
          <Text style={styles.summary}>{summaryLine(title, grid)}</Text>
          {/* Weekday header orients the columns; every day carries its numeral (a real
              calendar), symptom days darken + carry pips. */}
          <View style={styles.weekdayHeader}>
            {WEEKDAY_LABELS.map((d, i) => (
              <Text key={i} style={styles.weekdayLabel}>
                {d}
              </Text>
            ))}
          </View>
          <View style={styles.grid}>
            {grid.rows.map((row) => (
              <View key={row[0].key} style={styles.weekRow}>
                {row.map((cell) => {
                  const dom = dayOfMonth(cell);
                  const hasSymptom = cell.count > 0;
                  return (
                    <View
                      key={cell.key}
                      style={[styles.cell, cell.blank && styles.cellBlank]}
                      accessible={!cell.blank}
                      accessibilityLabel={cell.blank ? undefined : dayLabel(cell, title)}
                    >
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
    </Pressable>
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
  pressed: {
    backgroundColor: theme.colorSurfaceSubtle,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // Right-side actions group — the info (i) + the future card→detail chevron sit together.
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
  },
  title: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
    flexShrink: 1,
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
  },
  // A padding cell (before the 1st / after the last of the month) is invisible.
  cellBlank: {
    backgroundColor: 'transparent',
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
