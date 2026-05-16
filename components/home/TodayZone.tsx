import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { theme } from '../../constants/theme';
import { Card } from '../ui/Card';
import { SectionLabel } from '../ui/SectionLabel';
import { EVENT_TYPES, EventTypeKey } from '../../constants/eventTypes';
import { useEvents } from '../../hooks/useEvents';
import { usePetStore } from '../../store/petStore';

const SYMPTOM_TYPES: ReadonlySet<EventTypeKey> = new Set([
  'vomit', 'diarrhea', 'lethargy', 'itch',
]);

const DISPLAYED_TYPES: EventTypeKey[] = [
  'meal', 'vomit', 'diarrhea', 'stool_normal', 'lethargy', 'itch',
];

export function TodayZone() {
  const { activePet } = usePetStore();
  const { todayEvents } = useEvents();
  const petName = activePet?.name ?? 'your pet';

  // Filter to events that actually occurred today in local time.
  // prependEvent adds to the store without date-checking, so backdated
  // events can appear in todayEvents — we guard against that here.
  const localTodayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const eventsToday = useMemo(
    () => todayEvents.filter(e => new Date(e.occurred_at) >= localTodayStart),
    [todayEvents, localTodayStart],
  );

  const counts: Partial<Record<EventTypeKey | 'other', number>> = {};
  for (const event of eventsToday) {
    const key = event.event_type as EventTypeKey | 'other';
    counts[key] = (counts[key] ?? 0) + 1;
  }

  const chips = DISPLAYED_TYPES.filter(type => (counts[type] ?? 0) > 0);
  const otherCount = counts['other'] ?? 0;
  const isEmpty = eventsToday.length === 0;

  return (
    <Card>
      <SectionLabel label="Today" style={styles.label} />

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
          onPress={() => router.push('/(tabs)/history')}
          activeOpacity={0.85}
          style={styles.chipsRow}
        >
          {chips.map(type => {
            const def = EVENT_TYPES[type];
            const count = counts[type] ?? 0;
            const isSymptom = SYMPTOM_TYPES.has(type);
            const isMeal = type === 'meal';

            return (
              <View
                key={type}
                style={[
                  styles.chip,
                  isMeal && styles.chipMeal,
                  isSymptom && styles.chipSymptom,
                  type === 'stool_normal' && styles.chipNormal,
                ]}
              >
                {isMeal && <Text style={styles.chipEmoji}>{def.emoji}</Text>}
                <Text
                  style={[
                    styles.chipLabel,
                    isMeal && styles.chipLabelMeal,
                    isSymptom && styles.chipLabelSymptom,
                    type === 'stool_normal' && styles.chipLabelNormal,
                  ]}
                >
                  {def.label}{count > 1 ? ` ×${count}` : ''}
                </Text>
              </View>
            );
          })}

          {otherCount > 0 && (
            <View style={styles.chip}>
              <Text style={styles.chipLabel}>
                Other{otherCount > 1 ? ` ×${otherCount}` : ''}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  label: {
    marginBottom: theme.space1,
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
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space1,
    paddingTop: theme.space1,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colorNeutralLight,
    borderRadius: theme.radiusSmall,
    paddingHorizontal: theme.space1,
    paddingVertical: 6,
    gap: 4,
  },
  chipMeal: {
    backgroundColor: theme.colorEventMealLight,
  },
  chipSymptom: {
    backgroundColor: theme.colorEventSymptomLight,
  },
  chipNormal: {
    backgroundColor: theme.colorAccentLight,
  },
  chipEmoji: {
    fontSize: 15,
    lineHeight: 20,
  },
  chipLabel: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  chipLabelMeal: {
    color: theme.colorEventMeal,
  },
  chipLabelSymptom: {
    color: theme.colorEventSymptom,
  },
  chipLabelNormal: {
    color: theme.colorAccent,
  },
});
