import {
  Modal, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { WhorlSpinner } from '../brand/WhorlSpinner';
import { EventIcon } from '../event/EventIcon';
import { formatUtcDayShort } from '../../lib/utils';
import { describeDayEvents, daySheetSubtitle } from '../../lib/dayEvents';
import type { TimelineRow } from '../../lib/db';

// The Calendar v3 day drill-in (B-284 N5b / B-226 #1). Tapping a day cell opens this
// bottom sheet — the answer to "what actually happened that day?" — listing EVERY event
// logged (symptom, meal, med, weight), not just the symptom the calendar is scoped to,
// each with its time. An "Open in History" link deep-links the History tab filtered to
// that single UTC day (B-308). Sheet chrome mirrors DateScopeControl so every bottom sheet
// dims + reads identically.

interface Props {
  visible: boolean;
  /** UTC 'YYYY-MM-DD' of the tapped day, or null when closed. */
  dayKey: string | null;
  /** The calendar's charted symptom ("Vomiting") — names the day's symptom count. */
  symptomLabel: string;
  /** Count of that symptom on this day (from the month bucket). */
  symptomCount: number;
  /** The day's events (any type), or null while the fetch is in flight. */
  rows: TimelineRow[] | null;
  /** The day's events failed to load — show an error + retry, never "Nothing logged". */
  error?: boolean;
  onClose: () => void;
  /** Retry the failed day-events fetch. */
  onRetry?: () => void;
  /** Deep-link History to this day. */
  onOpenInHistory: (dayKey: string) => void;
}

export function DayEventsSheet({
  visible,
  dayKey,
  symptomLabel,
  symptomCount,
  rows,
  error = false,
  onClose,
  onRetry,
  onOpenInHistory,
}: Props) {
  const insets = useSafeAreaInsets();
  if (!dayKey) return null;

  const dayShort = formatUtcDayShort(dayKey);
  const loading = rows == null;
  const items = rows ? describeDayEvents(rows) : [];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + theme.space2 }]}>
          <View style={styles.grabber} />
          <Text style={styles.title}>{dayShort}</Text>

          {error ? (
            // A failed day fetch — NEVER "Nothing logged this day." (a silent failure that
            // reads as a false all-clear; §11 #2). Offer a retry.
            <View style={styles.stateBox}>
              <Text style={styles.subtitle}>Couldn't load this day's log.</Text>
              {onRetry != null && (
                <Pressable
                  style={styles.retryBtn}
                  onPress={onRetry}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Try again"
                >
                  <Text style={styles.retryText}>Try again</Text>
                </Pressable>
              )}
            </View>
          ) : loading ? (
            <View style={styles.loadingBox}>
              <WhorlSpinner size="md" ground="day" />
            </View>
          ) : (
            <>
              <Text style={styles.subtitle}>
                {daySheetSubtitle(symptomLabel, symptomCount, items.length)}
              </Text>

              {items.length > 0 && (
                <ScrollView style={styles.rows} showsVerticalScrollIndicator={false}>
                  {items.map((it, i) => (
                    <View key={i} style={styles.row} accessible accessibilityLabel={
                      `${it.title}${it.detail ? `, ${it.detail}` : ''}, ${it.time}`
                    }>
                      <View style={styles.rowIcon}>
                        <EventIcon
                          type={it.eventType}
                          size={16}
                          color={it.isSymptom ? theme.colorEventSymptom : theme.colorTextSecondary}
                        />
                      </View>
                      <View style={styles.rowText}>
                        <Text style={styles.rowTitle} numberOfLines={1}>
                          {it.title}
                          {it.detail ? <Text style={styles.rowDetail}> · {it.detail}</Text> : null}
                        </Text>
                      </View>
                      <Text style={styles.rowTime}>{it.time}</Text>
                    </View>
                  ))}
                </ScrollView>
              )}

              {/* The History deep-link is suppressed on a day with nothing logged — it would
                  land on History's empty-filter state, a dead end (pm-feature-review). */}
              {items.length > 0 && (
                <Pressable
                  style={styles.link}
                  onPress={() => onOpenInHistory(dayKey)}
                  hitSlop={8}
                  accessibilityRole="link"
                  accessibilityLabel={`Open ${dayShort} in History`}
                >
                  <Text style={styles.linkText}>Open in History · {dayShort}</Text>
                  <ChevronRight size={16} color={theme.colorAccent} strokeWidth={2} />
                </Pressable>
              )}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colorScrim,
  },
  sheet: {
    backgroundColor: theme.colorSurface,
    borderTopLeftRadius: theme.radiusLarge,
    borderTopRightRadius: theme.radiusLarge,
    paddingTop: 10,
    paddingHorizontal: theme.space3,
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: theme.radiusFull,
    backgroundColor: theme.colorBorderStrong,
    alignSelf: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: theme.textLG,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightBody,
    marginBottom: theme.space2,
  },
  loadingBox: {
    paddingVertical: theme.space4,
    alignItems: 'center',
  },
  // The failed-day error block — a message + a retry, never a false "Nothing logged".
  stateBox: {
    gap: theme.space2,
    alignItems: 'flex-start',
    paddingBottom: theme.space2,
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
    color: theme.colorAccent,
    fontWeight: theme.weightMedium,
  },
  // Cap the list height so a heavy day scrolls inside the sheet instead of pushing the
  // link off-screen.
  rows: {
    maxHeight: 280,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
    paddingVertical: theme.space2,
    borderBottomWidth: 1,
    borderBottomColor: theme.colorBorder,
  },
  rowIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colorSurfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: theme.textSM,
    color: theme.colorTextPrimary,
  },
  rowDetail: {
    color: theme.colorTextSecondary,
  },
  rowTime: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
  },
  // The day → History deep-link. Accent text + chevron so it reads as navigation; ≥44pt.
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spaceMicro,
    minHeight: 44,
    marginTop: theme.space1,
  },
  linkText: {
    fontSize: theme.textMD,
    color: theme.colorAccent,
    fontWeight: theme.weightMedium,
  },
});
