import { useEffect } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEvents } from '../../hooks/useEvents';
import { useSyncStore } from '../../store/syncStore';
import { theme } from '../../constants/theme';
import { HomeHeader } from '../../components/home/HomeHeader';
import { SignalZone } from '../../components/home/SignalZone';
import { TodayZone } from '../../components/home/TodayZone';
import { TrendZone } from '../../components/home/TrendZone';

export default function HomeScreen() {
  const { loadTodayEvents } = useEvents();
  // B-054 §6 — reactive refresh-after-hydrate: re-read Today whenever a sync
  // cycle finishes, so rows another device pushed appear without a reload.
  const hydrationTick = useSyncStore((s) => s.hydrationTick);

  useEffect(() => {
    loadTodayEvents();
  }, [loadTodayEvents, hydrationTick]);

  return (
    // 'top' is intentionally NOT a SafeAreaView edge here — the HomeHeader owns
    // the top inset so its white surface bleeds behind the status bar. Letting
    // SafeAreaView pad the top would paint the inset with the grey screen bg,
    // leaving a grey strip above the white header.
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      {/* Pinned identity strip (B-076) — stays put while the zones scroll, so
          the AI Signal still leads the scrollable intelligence surface. */}
      <HomeHeader />
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
