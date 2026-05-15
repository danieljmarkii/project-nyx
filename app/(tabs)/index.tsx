import { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePetStore } from '../../store/petStore';
import { useEvents } from '../../hooks/useEvents';
import { theme } from '../../constants/theme';

export default function HomeScreen() {
  const { activePet } = usePetStore();
  const { todayEvents, loadTodayEvents } = useEvents();

  useEffect(() => {
    loadTodayEvents();
  }, [loadTodayEvents]);

  const petName = activePet?.name ?? 'your pet';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Zone 1 — The Signal */}
        <View style={styles.zone}>
          <Text style={styles.signalText}>
            We're getting to know {petName}. Keep logging and patterns start appearing in about a week.
          </Text>
        </View>

        {/* Zone 2 — Today */}
        <View style={styles.zone}>
          <Text style={styles.zoneLabel}>Today</Text>
          {todayEvents.length === 0 ? (
            <Text style={styles.nudge}>
              Nothing logged yet — how's {petName} doing?
            </Text>
          ) : (
            <Text style={styles.eventCount}>
              {todayEvents.length} event{todayEvents.length !== 1 ? 's' : ''} logged
            </Text>
          )}
        </View>

        {/* Zone 3 — The Trend */}
        <View style={styles.zone}>
          <Text style={styles.zoneLabel}>Trend</Text>
          <Text style={styles.nudge}>
            A few more days of logs and we'll be able to show {petName}'s pattern.
          </Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colorNeutralLight },
  scroll: { padding: theme.space3, gap: theme.space3 },
  zone: {
    backgroundColor: theme.colorSurface,
    borderRadius: theme.radiusMedium,
    padding: theme.space3,
  },
  signalText: {
    fontSize: 18,
    color: theme.colorTextPrimary,
    lineHeight: 26,
  },
  zoneLabel: {
    fontSize: 12,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorTextSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: theme.space1,
  },
  nudge: {
    fontSize: 15,
    color: theme.colorTextSecondary,
    lineHeight: 22,
  },
  eventCount: {
    fontSize: 15,
    color: theme.colorTextPrimary,
  },
});
