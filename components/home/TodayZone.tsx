import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { theme } from '../../constants/theme';
import { Card } from '../ui/Card';
import { SectionLabel } from '../ui/SectionLabel';
import { EVENT_TYPES, EventTypeKey, SYMPTOM_TYPES } from '../../constants/eventTypes';
import { EventIcon } from '../event/EventIcon';
import { NyxEvent } from '../../store/eventStore';
import { useEvents } from '../../hooks/useEvents';
import { usePetStore } from '../../store/petStore';

const FALLBACK = { label: 'Event' };
const MAX_SHOWN = 3;

function formatEventTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// §8 doorway — open History filtered to today (clearable). The `ts` nonce makes the
// filter re-apply even when the History tab is already mounted; History reads `date`.
function openHistoryToday() {
  router.push({ pathname: '/(tabs)/history', params: { date: 'today', ts: String(Date.now()) } });
}

export function TodayZone() {
  const { activePet } = usePetStore();
  const { todayEvents } = useEvents();
  const petName = activePet?.name ?? 'your pet';

  // Guard against backdated events that prependEvent may have added
  const localTodayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const eventsToday = useMemo(
    () => todayEvents.filter(e => new Date(e.occurred_at) >= localTodayStart),
    [todayEvents, localTodayStart],
  );

  const shown = eventsToday.slice(0, MAX_SHOWN);
  const remaining = eventsToday.length - MAX_SHOWN;
  const isEmpty = eventsToday.length === 0;

  return (
    <Card>
      <View style={styles.headerRow}>
        <SectionLabel label="Today" />
        <TouchableOpacity
          onPress={openHistoryToday}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="See today in history"
        >
          <Text style={styles.historyLink}>History ›</Text>
        </TouchableOpacity>
      </View>

      {isEmpty ? (
        <TouchableOpacity
          onPress={() => router.push('/log')}
          activeOpacity={0.7}
          style={styles.nudgeRow}
        >
          <Text style={styles.nudge}>
            Nothing logged yet — how's {petName} doing?
          </Text>
          <Text style={styles.nudgeArrow}>→</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          onPress={openHistoryToday}
          activeOpacity={0.92}
        >
          <View style={styles.strip}>
            {shown.map((event, i) => (
              <EventStripRow
                key={event.id}
                event={event}
                showBorder={i > 0}
              />
            ))}
          </View>

          {remaining > 0 && (
            <Text style={styles.moreLink}>
              {remaining} more event{remaining !== 1 ? 's' : ''} today →
            </Text>
          )}
        </TouchableOpacity>
      )}
    </Card>
  );
}

function EventStripRow({ event, showBorder }: { event: NyxEvent; showBorder: boolean }) {
  const config = EVENT_TYPES[event.event_type as EventTypeKey] ?? FALLBACK;
  const isSymptom = SYMPTOM_TYPES.has(event.event_type as EventTypeKey);
  const isMeal = event.event_type === 'meal';
  // Meal events backed by a treat-typed food render as "Treat". Legacy NULL
  // and 'meal'/'other' food_type keep the "Meal" label.
  const rowLabel = isMeal && event.food_type === 'treat' ? 'Treat' : config.label;

  // Tint the glyph to its category so meal vs. symptom reads at a glance — the
  // mid-tone sits cleanly on the light category-tinted circle (mint/rose) and
  // is more legible there than a flat gray. Neutral (fg-2) otherwise.
  const iconColor = isSymptom
    ? theme.colorEventSymptom
    : isMeal
      ? theme.colorEventMeal
      : theme.colorTextSecondary;

  return (
    <View style={[styles.eventRow, showBorder && styles.eventRowBorder]}>
      <View style={[
        styles.iconCircle,
        isMeal && styles.iconMeal,
        isSymptom && styles.iconSymptom,
      ]}>
        <EventIcon type={event.event_type} size={16} color={iconColor} />
      </View>

      <View style={styles.eventMeta}>
        <Text style={styles.eventLabel}>{rowLabel}</Text>
        {isMeal && event.food_product_name ? (
          <Text style={styles.eventSub} numberOfLines={1}>
            {event.food_product_name}
          </Text>
        ) : null}
      </View>

      <Text style={styles.eventTime}>{formatEventTime(event.occurred_at)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.space1,
  },
  historyLink: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorAccent,
  },
  nudgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.space1,
  },
  nudge: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    lineHeight: 22,
    flex: 1,
  },
  nudgeArrow: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    marginLeft: theme.space2,
  },

  // Event strip
  strip: {
    marginTop: 4,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 10,
  },
  eventRowBorder: {
    borderTopWidth: 1,
    borderTopColor: theme.colorBorder,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colorNeutralLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconMeal: {
    backgroundColor: theme.colorEventMealLight,
  },
  iconSymptom: {
    backgroundColor: theme.colorEventSymptomLight,
  },
  eventMeta: {
    flex: 1,
    gap: 1,
  },
  eventLabel: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  eventSub: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },
  eventTime: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },
  moreLink: {
    fontSize: theme.textSM,
    color: theme.colorAccent,
    fontWeight: theme.weightMedium,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colorBorder,
    marginTop: 2,
  },
});
