import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { theme } from '../../constants/theme';
import { EVENT_TYPES, EventTypeKey } from '../../constants/eventTypes';
import { useEvents } from '../../hooks/useEvents';
import { usePetStore } from '../../store/petStore';

// Event types we surface in the Today summary chips (excludes 'other')
const DISPLAYED_TYPES: EventTypeKey[] = ['meal', 'vomit', 'diarrhea', 'stool_normal', 'lethargy', 'itch'];

export function TodayZone() {
  const { activePet } = usePetStore();
  const { todayEvents } = useEvents();
  const petName = activePet?.name ?? 'your pet';

  // Group events by type and count them
  const counts: Partial<Record<EventTypeKey | 'other', number>> = {};
  for (const event of todayEvents) {
    const key = event.event_type as EventTypeKey | 'other';
    counts[key] = (counts[key] ?? 0) + 1;
  }

  const chips = DISPLAYED_TYPES.filter(type => (counts[type] ?? 0) > 0);
  const otherCount = counts['other'] ?? 0;

  const isEmpty = todayEvents.length === 0;

  return (
    <View style={styles.zone}>
      <Text style={styles.label}>Today</Text>

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
        <View style={styles.chipsRow}>
          {chips.map(type => {
            const def = EVENT_TYPES[type];
            const count = counts[type] ?? 0;
            return (
              <View key={type} style={styles.chip}>
                <Text style={styles.chipEmoji}>{def.emoji}</Text>
                {count > 1 && <Text style={styles.chipCount}>×{count}</Text>}
              </View>
            );
          })}
          {otherCount > 0 && (
            <View style={styles.chip}>
              <Text style={styles.chipEmoji}>{EVENT_TYPES.other.emoji}</Text>
              {otherCount > 1 && <Text style={styles.chipCount}>×{otherCount}</Text>}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  zone: {
    backgroundColor: theme.colorSurface,
    borderRadius: theme.radiusMedium,
    padding: theme.space3,
  },
  label: {
    fontSize: 11,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorTextSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: theme.space1,
  },
  nudgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.space1,
  },
  nudge: {
    fontSize: 15,
    color: theme.colorTextSecondary,
    lineHeight: 22,
    flex: 1,
  },
  nudgeArrow: {
    fontSize: 15,
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
  chipEmoji: {
    fontSize: 18,
    lineHeight: 22,
  },
  chipCount: {
    fontSize: 13,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorTextSecondary,
  },
});
