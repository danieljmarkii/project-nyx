import { useEffect } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEvents } from '../../hooks/useEvents';
import { theme } from '../../constants/theme';
import { SignalZone } from '../../components/home/SignalZone';
import { TodayZone } from '../../components/home/TodayZone';
import { TrendZone } from '../../components/home/TrendZone';

export default function HomeScreen() {
  const { loadTodayEvents } = useEvents();

  useEffect(() => {
    loadTodayEvents();
  }, [loadTodayEvents]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <SignalZone />
        <TodayZone />
        <TrendZone />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colorNeutralLight },
  scroll: { padding: theme.space3, gap: theme.space3, paddingBottom: 100 },
  // paddingBottom gives the FAB clearance over the last card
});
