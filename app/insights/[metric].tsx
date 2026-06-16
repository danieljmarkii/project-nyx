import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { theme } from '../../constants/theme';
import { usePetStore } from '../../store/petStore';
import {
  getSymptomCounts,
  getSymptomFrequencyByDay,
  type AnalyticsWindow,
} from '../../lib/analytics';
import { sparkFromBuckets } from '../../lib/dashboardScreen';
import {
  buildSymptomDetailWindows,
  symptomLabel,
  type SymptomWindowInput,
  type MetricDetailWindowData,
} from '../../lib/metricDetail';
import { MetricDetailScreen } from '../../components/dashboard/MetricDetailScreen';

// The metric DETAIL screen — a Patterns card's "doorway" destination (§4.2 / §5 #2 / §8;
// B-093). Reached by tapping a symptom COUNT card on the dashboard; `metric` is the symptom
// event_type. Shows that one symptom across a Week / Month / 3-Month segmented control with
// the clinical "vs your baseline" read — the canonical §5 "Trend card → single-series line".
//
// A same-stack child route of app/insights/index.tsx, so the back button returns to Patterns
// (the right drill-down UX, not a cross-navigator jump). It reads only the deterministic
// per-window local-SQLite aggregates (lib/analytics.ts) and never computes a number; the
// load-bearing copy + n=1/never-reassure logic live in the pure lib/metricDetail assembler.

const WINDOWS: AnalyticsWindow[] = ['week', 'month', '3month'];

export default function MetricDetailRoute() {
  const params = useLocalSearchParams<{ metric: string }>();
  const symptomType = typeof params.metric === 'string' ? params.metric : '';
  const title = symptomLabel(symptomType);

  const { activePet } = usePetStore();
  const petName = activePet?.name ?? 'your pet';

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [windows, setWindows] = useState<Record<AnalyticsWindow, MetricDetailWindowData> | null>(
    null,
  );
  // First-load-for-this-(pet, metric) gate: later focuses refresh silently so the screen
  // doesn't flash a spinner on every return (the useSignal / dashboard pattern).
  const loadedRef = useRef<string | null>(null);
  // Monotonic load id so a slow load can never commit over a newer one (pet switch / retry).
  const loadIdRef = useRef(0);

  const load = useCallback(
    async (showLoading: boolean) => {
      const pet = usePetStore.getState().activePet;
      if (!pet || !symptomType) return;
      const myId = ++loadIdRef.current;
      if (showLoading) setStatus('loading');
      try {
        // Counts (current + prior) and the daily series for each of the three windows.
        const [counts, freqs] = await Promise.all([
          Promise.all(WINDOWS.map((w) => getSymptomCounts(pet.id, w))),
          Promise.all(WINDOWS.map((w) => getSymptomFrequencyByDay(pet.id, w))),
        ]);
        if (loadIdRef.current !== myId) return; // superseded by a newer load
        const windowInputs = {} as Record<AnalyticsWindow, SymptomWindowInput>;
        WINDOWS.forEach((w, i) => {
          const sc = counts[i].find((c) => c.symptomType === symptomType);
          windowInputs[w] = {
            current: sc?.current ?? 0,
            prior: sc?.prior ?? 0,
            series: sparkFromBuckets(freqs[i], symptomType),
          };
        });
        setWindows(
          buildSymptomDetailWindows({ symptomType, petName: pet.name, windows: windowInputs }),
        );
        setStatus('ready');
      } catch (e) {
        if (loadIdRef.current !== myId) return;
        // No silent failures (house rule): a warm retry, never a wrong number.
        console.error('[metric-detail] load failed:', e);
        setStatus('error');
      }
    },
    [symptomType],
  );

  useFocusEffect(
    useCallback(() => {
      if (!activePet || !symptomType) return;
      const key = `${activePet.id}:${symptomType}`;
      const first = loadedRef.current !== key;
      loadedRef.current = key;
      load(first);
    }, [activePet?.id, symptomType, load]),
  );

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      {/* Native header with an empty title so the symptom name isn't doubled (the body's
          MetricDetailScreen carries it). headerBackTitle labels the back button "Patterns"
          on iOS (the surface it returns to, rather than the tab group's route name); Android
          shows the chevron alone — both correctly return up the same stack to Patterns. */}
      <Stack.Screen options={{ headerShown: true, headerTitle: '', headerBackTitle: 'Patterns' }} />

      {!activePet ? (
        <View style={styles.centered}>
          <Text style={styles.stateText}>No pet selected.</Text>
        </View>
      ) : status === 'loading' ? (
        <View style={styles.centered}>
          <ActivityIndicator color={theme.colorTextSecondary} />
        </View>
      ) : status === 'error' || !windows ? (
        <View style={styles.centered}>
          <Text style={styles.stateText}>
            I couldn't pull {petName}'s {title.toLowerCase()} trend just now.
          </Text>
          <Pressable
            onPress={() => load(true)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Try again"
            style={styles.retryBtn}
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* initialWindow="month" is a SAFETY default, not cosmetic: a symptom that's
              quiet in both 7-day week spans but active at the month scale must lead with its
              burden, never a window-scoped "none logged" that reads as an all-clear. Pinned
              by a regression test in [metric].test.tsx. */}
          <MetricDetailScreen
            title={title}
            polarity="adverse"
            windows={windows}
            petName={activePet.name}
            initialWindow="month"
          />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colorNeutralLight,
  },
  scroll: {
    padding: theme.space3,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.space3,
    gap: theme.space2,
  },
  stateText: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    textAlign: 'center',
    lineHeight: theme.lineHeightBody,
  },
  retryBtn: {
    paddingHorizontal: theme.space3,
    paddingVertical: theme.space1,
    borderRadius: theme.radiusSmall,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    minHeight: 44,
    justifyContent: 'center',
  },
  retryText: {
    fontSize: theme.textMD,
    color: theme.colorAccent,
    fontWeight: theme.weightMedium,
  },
});
