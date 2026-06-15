import { Pressable, View, Text, StyleSheet } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { theme, shadows } from '../../constants/theme';
import { HEAT_COLOR, HEAT_EMPTY_COLOR, HEAT_OPACITY_STEPS, heatOpacity } from './cardTokens';
import { pluralize } from '../../lib/dashboardCards';
import type { DayFrequencyBucket } from '../../lib/analytics';

// FrequencyCalendarCard — a month heat-grid for an episodic symptom (§5 #4 / §6).
// "How OFTEN — which days?" reads faster as a coloured calendar than a bar chart (the
// Apple Health pattern). Each cell is one calendar day; a day with symptoms is shown
// in the concern hue at an intensity step, an empty day is a neutral square. This is
// descriptive OCCURRENCE (the same events the History timeline shows), so it is not
// gated by the §13 #6 establishment rule — but it is NEVER framed as an all-clear: a
// month of empty squares is "none logged", not "Nyx is well" (§11 #2).

const DAYS_PER_WEEK = 7;
// Column headers, Sun-first to match weekdayOf (getUTCDay 0=Sun) + the lead padding.
const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

/** Day-of-month numeral colour for a heat cell — readable on BOTH a light empty square
 *  and a saturated symptom square (white on the dark steps, ink on the light ones). */
function dayNumberColor(count: number, max: number): string {
  if (count <= 0) return theme.colorTextTertiary; // empty day — muted, keeps the grid calm
  return heatOpacity(count, max) >= 0.7 ? theme.colorSurface : theme.colorTextPrimary;
}

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
  /** The window's busiest day count — the heat-scale denominator. */
  max: number;
  /** How many days had ≥1 event — the honest summary + the empty check. */
  daysWithEvents: number;
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

/** Pure: turn day buckets into a weekday-aligned month grid. Leading blanks pad the
 *  first row so each column lands on its real UTC weekday (Apple-style); trailing
 *  blanks fill the last row to 7. Extracted + tested so a weekday-modulo off-by-one
 *  can't slip into the "how often" read. */
export function buildHeatRows(buckets: DayFrequencyBucket[], symptomType?: string): HeatGrid {
  const counts = buckets.map((b) => countOf(b, symptomType));
  const max = counts.reduce((m, c) => Math.max(m, c), 0);
  const daysWithEvents = counts.filter((c) => c > 0).length;

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

  return { rows, max, daysWithEvents };
}

export function FrequencyCalendarCard({
  title,
  buckets,
  symptomType,
  emptyMessage,
  onPress,
  accessibilityHint,
}: Props) {
  const { rows, max, daysWithEvents } = buildHeatRows(buckets, symptomType);
  const isEmpty = daysWithEvents === 0;

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
        {onPress != null && <ChevronRight size={18} color={theme.colorTextDisabled} />}
      </View>

      {isEmpty ? (
        <Text style={styles.stateText}>{emptyMessage ?? `No ${title.toLowerCase()} logged ${range}.`}</Text>
      ) : (
        <>
          {/* Weekday header orients the columns; the date numeral on each SYMPTOM day
              answers the vet's "which day?" without numbering all 30 (keeps it calm). */}
          <View style={styles.weekdayHeader}>
            {WEEKDAY_LABELS.map((d, i) => (
              <Text key={i} style={styles.weekdayLabel}>
                {d}
              </Text>
            ))}
          </View>
          <View style={styles.grid}>
            {rows.map((row) => (
              <View key={row[0].key} style={styles.weekRow}>
                {row.map((cell) => {
                  const dom = dayOfMonth(cell);
                  return (
                    <View key={cell.key} style={styles.cell}>
                      {!cell.blank && (
                        <View
                          style={[
                            StyleSheet.absoluteFill,
                            styles.cellFill,
                            {
                              backgroundColor: cell.count > 0 ? HEAT_COLOR : HEAT_EMPTY_COLOR,
                              opacity: cell.count > 0 ? heatOpacity(cell.count, max) : 1,
                            },
                          ]}
                        />
                      )}
                      {cell.count > 0 && dom != null && (
                        <Text style={[styles.dayNum, { color: dayNumberColor(cell.count, max) }]}>
                          {dom}
                        </Text>
                      )}
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
          {/* Shade legend — decodes darker = more episodes that day (the GitHub pattern). */}
          <View style={styles.legendRow}>
            <Text style={styles.legendLabel}>Fewer</Text>
            {HEAT_OPACITY_STEPS.map((op, i) => (
              <View key={i} style={[styles.legendSwatch, { backgroundColor: HEAT_COLOR, opacity: op }]} />
            ))}
            <Text style={styles.legendLabel}>More</Text>
          </View>
          <Text style={styles.caption}>
            Logged on {daysWithEvents} {pluralize(daysWithEvents, 'day')} · {range}
          </Text>
        </>
      )}
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
  title: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
    flexShrink: 1,
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
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellFill: {
    borderRadius: theme.radiusXS,
  },
  dayNum: {
    fontSize: theme.textXS,
    fontWeight: theme.weightMedium,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 5,
  },
  legendSwatch: {
    width: 12,
    height: 12,
    borderRadius: theme.radiusXS,
  },
  legendLabel: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
  },
  caption: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
  },
  stateText: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    lineHeight: 22,
  },
});
