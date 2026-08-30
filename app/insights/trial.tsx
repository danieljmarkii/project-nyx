import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect } from 'expo-router';
import { theme, shadows } from '../../constants/theme';
import { WhorlSpinner } from '../../components/brand/WhorlSpinner';
import { usePetStore } from '../../store/petStore';
import { timingBandMedianLabel } from '../../lib/patternsTiming';
import {
  getTrialPanel,
  timingBandLabel,
  trialContextLine,
  trialHonestyLine,
  trialMealsPerDayValue,
  trialNoneTimeableLine,
  trialPhenotypeSampleLine,
  trialPhenotypeState,
  trialPhenotypeUntimedLine,
  trialTreatShareValue,
  type TrialSoFarModel,
} from '../../lib/patternsTrial';
import { ThemedText } from '../../components/ui/ThemedText';

// The "trial so far" metric-detail view (Signals v2 / B-755 PR 9, CUL-11; spec §4.5).
// The Patterns "The trial so far" card's doorway: the per-phenotype vomit-timing rows
// and the diet-structure rows with more room, and the "shows what, not why" line. A
// same-stack child of app/insights (back → Patterns). Reads local state through
// lib/patternsTrial — timing via lib/mealTiming (G9), length via getDietTrialProgress,
// windowed on the trial's evidence bound. GA'd (CUL-548): the route renders on data presence.

export default function TrialDetailRoute() {
  const { activePet } = usePetStore();
  const petName = activePet?.name ?? 'your pet';

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [model, setModel] = useState<TrialSoFarModel | null>(null);
  const loadedRef = useRef<string | null>(null);
  const loadIdRef = useRef(0);

  const load = useCallback(async (showLoading: boolean) => {
    const pet = usePetStore.getState().activePet;
    if (!pet) return;
    const myId = ++loadIdRef.current;
    if (showLoading) setStatus('loading');
    try {
      const m = await getTrialPanel(pet.id);
      if (loadIdRef.current !== myId) return;
      setModel(m);
      setStatus('ready');
    } catch (e) {
      if (loadIdRef.current !== myId) return;
      console.error('[trial-detail] load failed:', e);
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

  const phenotypeState = model ? trialPhenotypeState(model.phenotype) : null;
  const untimed = model ? trialPhenotypeUntimedLine(model.phenotype) : null;

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
          <ThemedText style={styles.stateText}>I couldn't pull {petName}'s trial just now.</ThemedText>
          <Pressable onPress={() => load(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Try again" style={styles.retryBtn}>
            <ThemedText style={styles.retryText}>Try again</ThemedText>
          </Pressable>
        </View>
      ) : model == null ? (
        <View style={styles.centered}>
          <ThemedText style={styles.stateText}>{petName} isn't on a diet trial right now.</ThemedText>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            <ThemedText style={styles.title}>The trial so far</ThemedText>
            <ThemedText style={styles.context}>{trialContextLine(model)}</ThemedText>

            {/* Dropped when no vomiting was logged in-window (never a zero-wall all-clear);
                an episodes-but-untimeable record discloses the episodes instead. */}
            {phenotypeState !== 'empty' && (
              <>
                <ThemedText style={styles.sectionLabel}>Vomiting timing</ThemedText>
                {phenotypeState === 'rows' ? (
                  <>
                    <View style={styles.rows}>
                      {model.phenotype.bandRows.map((row) => {
                        const median = timingBandMedianLabel(row.medianMinutes);
                        return (
                          <View key={row.band} style={styles.row}>
                            <View style={styles.rowLabelCol}>
                              <ThemedText style={styles.rowLabel}>{timingBandLabel(row.band, model.config)}</ThemedText>
                              {row.count > 0 && median != null && <ThemedText style={styles.rowSub}>{median}</ThemedText>}
                            </View>
                            <ThemedText style={styles.rowValue}>{row.count}</ThemedText>
                          </View>
                        );
                      })}
                    </View>
                    <ThemedText style={styles.sample}>{trialPhenotypeSampleLine(model.phenotype)}</ThemedText>
                    {untimed != null && <ThemedText style={styles.sample}>{untimed}</ThemedText>}
                  </>
                ) : (
                  <ThemedText style={styles.sample}>{trialNoneTimeableLine(model.phenotype)}</ThemedText>
                )}
              </>
            )}

            <ThemedText style={styles.sectionLabel}>Diet during the trial</ThemedText>
            <View style={styles.rows}>
              <View style={styles.row}>
                <ThemedText style={styles.rowLabel}>Treats</ThemedText>
                <ThemedText style={styles.rowValueText}>{trialTreatShareValue(model.structure)}</ThemedText>
              </View>
              <View style={styles.row}>
                <ThemedText style={styles.rowLabel}>Meals</ThemedText>
                <ThemedText style={styles.rowValueText}>{trialMealsPerDayValue(model.structure)}</ThemedText>
              </View>
            </View>

            <ThemedText style={styles.honesty}>{trialHonestyLine()}</ThemedText>
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
    gap: theme.space1,
    ...shadows.md,
  },
  title: { fontSize: theme.textLG, fontWeight: theme.weightSemibold, color: theme.colorTextPrimary },
  context: { fontSize: theme.textSM, color: theme.colorTextSecondary },
  sectionLabel: {
    fontSize: theme.textXS,
    fontWeight: theme.weightMedium,
    color: theme.colorTextTertiary,
    textTransform: 'uppercase',
    letterSpacing: theme.trackingWide,
    marginTop: theme.space2,
  },
  rows: { gap: theme.space1 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLabelCol: { flexShrink: 1, gap: 1 },
  rowLabel: { fontSize: theme.textMD, color: theme.colorTextPrimary },
  rowSub: { fontSize: theme.textXS, color: theme.colorTextTertiary },
  rowValue: {
    fontSize: theme.textLG,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    fontVariant: ['tabular-nums'],
  },
  rowValueText: { fontSize: theme.textMD, fontWeight: theme.weightMedium, color: theme.colorTextPrimary },
  sample: { fontSize: theme.textSM, color: theme.colorTextTertiary, lineHeight: theme.lineHeightSM },
  honesty: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightSM,
    marginTop: theme.space2,
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
