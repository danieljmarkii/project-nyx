import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect } from 'expo-router';
import { theme, shadows } from '../../constants/theme';
import { WhorlSpinner } from '../../components/brand/WhorlSpinner';
import { usePetStore } from '../../store/petStore';
import { TimingDistribution } from '../../components/dashboard/TimingDistribution';
import {
  getTimingPanel,
  timingBandLabel,
  timingBandMedianLabel,
  timingPanelLead,
  timingSampleLine,
  timingUntimedBreakdown,
  timingNoneTimeableLine,
  type TimingPanelModel,
} from '../../lib/patternsTiming';
import { ThemedText } from '../../components/ui/ThemedText';

// The Timing metric-detail view (Signals v2 / B-755 PR 9, CUL-11; spec §4.5). The
// Patterns "Timing" card's doorway: the full-record vomit-timing distribution with
// more room — the dot lane, per-band counts + median timing, and the honest untimed
// breakdown. A same-stack child of app/insights, so the back button returns to
// Patterns. Reads only local SQLite through lib/patternsTiming (→ lib/mealTiming, G9);
// it never computes a timing number itself. GA'd (CUL-548): no flag decision lives here —
// the route renders on data presence.

export default function TimingDetailRoute() {
  const { activePet } = usePetStore();
  const petName = activePet?.name ?? 'your pet';

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [model, setModel] = useState<TimingPanelModel | null>(null);
  const loadedRef = useRef<string | null>(null);
  const loadIdRef = useRef(0);

  const load = useCallback(async (showLoading: boolean) => {
    const pet = usePetStore.getState().activePet;
    if (!pet) return;
    const myId = ++loadIdRef.current;
    if (showLoading) setStatus('loading');
    try {
      const m = await getTimingPanel(pet.id);
      if (loadIdRef.current !== myId) return;
      setModel(m);
      setStatus('ready');
    } catch (e) {
      if (loadIdRef.current !== myId) return;
      console.error('[timing-detail] load failed:', e);
      setStatus('error');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!activePet) return;
      const first = loadedRef.current !== activePet.id;
      loadedRef.current = activePet.id;
      load(first);
    }, [activePet?.id, load]),
  );

  const untimedBreakdown = model ? timingUntimedBreakdown(model) : null;

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ headerShown: true, headerTitle: '', headerBackTitle: 'Patterns' }} />

      {!activePet ? (
        <View style={styles.centered}>
          <ThemedText style={styles.stateText}>No pet selected.</ThemedText>
        </View>
      ) : status === 'loading' ? (
        <View style={styles.centered}>
          <WhorlSpinner size="md" ground="day" />
        </View>
      ) : status === 'error' ? (
        <View style={styles.centered}>
          <ThemedText style={styles.stateText}>I couldn't pull {petName}'s timing just now.</ThemedText>
          <Pressable onPress={() => load(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Try again" style={styles.retryBtn}>
            <ThemedText style={styles.retryText}>Try again</ThemedText>
          </Pressable>
        </View>
      ) : model == null ? (
        <View style={styles.centered}>
          <ThemedText style={styles.stateText}>
            No vomiting has been logged for {petName} yet — this fills in as episodes are logged.
          </ThemedText>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            <ThemedText style={styles.title}>Vomiting, timed from meals</ThemedText>

            {model.eligibleCount > 0 ? (
              <>
                {/* The lead explains the dots — only shown when there are dots. */}
                <ThemedText style={styles.lead}>{timingPanelLead(petName)}</ThemedText>
                <TimingDistribution model={model} />
                <View style={styles.bandRows}>
                  {model.bandRows.map((row) => {
                    const median = timingBandMedianLabel(row.medianMinutes);
                    return (
                      <View key={row.band} style={styles.bandRow}>
                        <View style={styles.bandLabelCol}>
                          <ThemedText style={styles.bandLabel}>{timingBandLabel(row.band, model.config)}</ThemedText>
                          {row.count > 0 && median != null && <ThemedText style={styles.bandMedian}>{median}</ThemedText>}
                        </View>
                        <ThemedText style={styles.bandCount}>{row.count}</ThemedText>
                      </View>
                    );
                  })}
                </View>
                <ThemedText style={styles.sample}>{timingSampleLine(model)}</ThemedText>
                {untimedBreakdown != null && <ThemedText style={styles.note}>{untimedBreakdown}</ThemedText>}
              </>
            ) : (
              <ThemedText style={styles.stateText}>{timingNoneTimeableLine(petName, model.totalCount)}</ThemedText>
            )}

            <ThemedText style={styles.footer}>
              This shows when vomiting happened relative to eating — a timing pattern in the log, not a
              cause or a diagnosis. Your vet reads what it means.
            </ThemedText>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colorNeutralLight },
  scroll: { padding: theme.space3 },
  card: {
    backgroundColor: theme.colorSurface,
    borderRadius: theme.radiusMedium,
    padding: theme.space3,
    gap: theme.space2,
    ...shadows.md,
  },
  title: { fontSize: theme.textLG, fontWeight: theme.weightSemibold, color: theme.colorTextPrimary },
  lead: { fontSize: theme.textSM, color: theme.colorTextSecondary, lineHeight: theme.lineHeightSM },
  bandRows: { gap: theme.space2 },
  bandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bandLabelCol: { flexShrink: 1, gap: 1 },
  bandLabel: { fontSize: theme.textMD, color: theme.colorTextPrimary },
  bandMedian: { fontSize: theme.textXS, color: theme.colorTextTertiary },
  bandCount: {
    fontSize: theme.textLG,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    fontVariant: ['tabular-nums'],
  },
  sample: { fontSize: theme.textSM, color: theme.colorTextTertiary },
  note: { fontSize: theme.textXS, color: theme.colorTextTertiary, lineHeight: theme.lineHeightXS },
  footer: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    lineHeight: theme.lineHeightXS,
    marginTop: theme.space1,
  },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.space3, gap: theme.space2 },
  stateText: { fontSize: theme.textMD, color: theme.colorTextSecondary, textAlign: 'center', lineHeight: theme.lineHeightBody },
  retryBtn: {
    paddingHorizontal: theme.space3,
    paddingVertical: theme.space1,
    borderRadius: theme.radiusSmall,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    minHeight: 44,
    justifyContent: 'center',
  },
  retryText: { fontSize: theme.textMD, color: theme.colorAccentInk, fontWeight: theme.weightMedium },
});
