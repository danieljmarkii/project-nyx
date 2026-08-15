import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
  trialPhenotypeSampleLine,
  trialPhenotypeUntimedLine,
  trialTreatShareValue,
  type TrialSoFarModel,
} from '../../lib/patternsTrial';

// The "trial so far" metric-detail view (Signals v2 / B-755 PR 9, CUL-11; spec §4.5).
// The Patterns "The trial so far" card's doorway: the per-phenotype vomit-timing rows
// and the diet-structure rows with more room, and the "shows what, not why" line. A
// same-stack child of app/insights (back → Patterns). Reads local state through
// lib/patternsTrial — timing via lib/mealTiming (G9), length via getDietTrialProgress,
// windowed on the trial's evidence bound. Reached only when `signals_v2` is on.

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

  const untimed = model ? trialPhenotypeUntimedLine(model.phenotype) : null;

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ headerShown: true, headerTitle: '', headerBackTitle: 'Patterns' }} />

      {!activePet ? (
        <View style={styles.centered}>
          <Text style={styles.stateText}>No pet selected.</Text>
        </View>
      ) : status === 'loading' ? (
        <View style={styles.centered}>
          <WhorlSpinner size="md" ground="day" />
        </View>
      ) : status === 'error' ? (
        <View style={styles.centered}>
          <Text style={styles.stateText}>I couldn't pull {petName}'s trial just now.</Text>
          <Pressable onPress={() => load(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Try again" style={styles.retryBtn}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : model == null ? (
        <View style={styles.centered}>
          <Text style={styles.stateText}>{petName} isn't on a diet trial right now.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            <Text style={styles.title}>The trial so far</Text>
            <Text style={styles.context}>{trialContextLine(model)}</Text>

            <Text style={styles.sectionLabel}>Vomiting timing</Text>
            <View style={styles.rows}>
              {model.phenotype.bandRows.map((row) => {
                const median = timingBandMedianLabel(row.medianMinutes);
                return (
                  <View key={row.band} style={styles.row}>
                    <View style={styles.rowLabelCol}>
                      <Text style={styles.rowLabel}>{timingBandLabel(row.band, model.config)}</Text>
                      {row.count > 0 && median != null && <Text style={styles.rowSub}>{median}</Text>}
                    </View>
                    <Text style={styles.rowValue}>{row.count}</Text>
                  </View>
                );
              })}
            </View>
            <Text style={styles.sample}>{trialPhenotypeSampleLine(model.phenotype)}</Text>
            {untimed != null && <Text style={styles.sample}>{untimed}</Text>}

            <Text style={styles.sectionLabel}>Diet during the trial</Text>
            <View style={styles.rows}>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Treats</Text>
                <Text style={styles.rowValueText}>{trialTreatShareValue(model.structure)}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Meals</Text>
                <Text style={styles.rowValueText}>{trialMealsPerDayValue(model.structure)}</Text>
              </View>
            </View>

            <Text style={styles.honesty}>{trialHonestyLine()}</Text>
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
  retryText: { fontSize: theme.textMD, color: theme.colorAccent, fontWeight: theme.weightMedium },
});
