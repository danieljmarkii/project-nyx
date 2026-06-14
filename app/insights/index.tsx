import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect } from 'expo-router';
import { theme } from '../../constants/theme';
import { usePetStore } from '../../store/petStore';
import { EVENT_TYPES, EventTypeKey } from '../../constants/eventTypes';
import {
  getSymptomCounts,
  getSymptomFrequencyByDay,
  getIntakeRate,
  getTopFoods,
  getTopProteins,
  getMealTreatComposition,
  isNotEnoughData,
  type AnalyticsWindow,
  type IntakeRate,
} from '../../lib/analytics';
import {
  buildDashboardCards,
  selectDashboardState,
  type DashboardCard,
  type DashboardState,
} from '../../lib/dashboardScreen';
import { describeCountDelta, intakeNotObservedNote, pluralize } from '../../lib/dashboardCards';
import { MetricCard } from '../../components/dashboard/MetricCard';
import { RankingCard } from '../../components/dashboard/RankingCard';
import { FrequencyCalendarCard } from '../../components/dashboard/FrequencyCalendarCard';
import { CompositionCard } from '../../components/dashboard/CompositionCard';
import { ComingSoonSummary } from '../../components/dashboard/ComingSoonSummary';
import { DashboardEmptyState } from '../../components/dashboard/DashboardEmptyState';

// The "Patterns" dashboard (B-023 PR 3) — tier 2 of the intelligence ladder (§2): the
// full story on demand. Summary-led layout (§7): the AI summary's slot (ComingSoonSummary
// until PR 4) leads, then the seeded card set in priority order — safety always first
// (§6 / Principle 3). Per active pet (multi-pet switcher-aware). Range-free glance: the
// dashboard is fixed to the MONTH window (§13 #2); the Week/3-Month control lives on the
// detail screen only, which is a follow-up (see STATUS / backlog).
//
// Every metric is a deterministic local-SQLite aggregate from PR 1 (lib/analytics.ts);
// the screen never computes a number — it formats already-true facts. The cards' verdict
// colour is gated on `established`, derived in buildDashboardCards from the analytics
// result so a single observation (n=1) can never colour (the PR-2 adversarial fix).

const WINDOW: AnalyticsWindow = 'month';

export default function PatternsScreen() {
  const { activePet } = usePetStore();
  const petName = activePet?.name ?? 'your pet';

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [cards, setCards] = useState<DashboardCard[]>([]);
  const [dashState, setDashState] = useState<DashboardState>('empty');
  // Show the loading state only on the first read for a pet; later focuses refresh
  // silently so the surface doesn't flash empty on every return (the useSignal pattern).
  const loadedPetRef = useRef<string | null>(null);

  const load = useCallback(
    async (showLoading: boolean) => {
      const pet = usePetStore.getState().activePet;
      if (!pet) return;
      if (showLoading) setStatus('loading');
      try {
        const [symptomCounts, frequencyBuckets, intakeRate, topFoods, topProteins, composition] =
          await Promise.all([
            getSymptomCounts(pet.id, WINDOW),
            getSymptomFrequencyByDay(pet.id, WINDOW),
            getIntakeRate(pet.id, WINDOW),
            getTopFoods(pet.id, WINDOW),
            getTopProteins(pet.id, WINDOW),
            getMealTreatComposition(pet.id, WINDOW),
          ]);
        setDashState(selectDashboardState({ symptomCounts, composition }));
        setCards(
          buildDashboardCards({
            symptomCounts,
            frequencyBuckets,
            intakeRate,
            topFoods,
            topProteins,
            composition,
          }),
        );
        setStatus('ready');
      } catch (e) {
        // No silent failures (house rule): surface a warm retry, never a wrong number.
        console.error('[patterns] load failed:', e);
        setStatus('error');
      }
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      if (!activePet) return;
      const firstForPet = loadedPetRef.current !== activePet.id;
      loadedPetRef.current = activePet.id;
      load(firstForPet);
    }, [activePet?.id, load]),
  );

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: 'Patterns', headerShown: true }} />

      {!activePet ? (
        <View style={styles.centered}>
          <Text style={styles.stateText}>No pet selected.</Text>
        </View>
      ) : status === 'loading' ? (
        <View style={styles.centered}>
          <ActivityIndicator color={theme.colorTextSecondary} />
        </View>
      ) : status === 'error' ? (
        <View style={styles.centered}>
          <Text style={styles.stateText}>I couldn&apos;t pull {petName}&apos;s patterns just now.</Text>
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
          {dashState === 'empty' ? (
            <DashboardEmptyState petName={petName} />
          ) : (
            <>
              {/* Summary-led (§7): the AI summary's slot leads, safety cards immediately below. */}
              <ComingSoonSummary petName={petName} />
              {cards.map((card) => renderCard(card, petName))}
            </>
          )}
          <View style={styles.bottomPad} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

/** Plain, warm symptom label. Falls back for schema symptom types not in the quick-log
 *  map (e.g. scratch / skin_reaction), so a card never renders a raw event_type token. */
function symptomLabel(type: string): string {
  const known = EVENT_TYPES[type as EventTypeKey];
  if (known) return known.label;
  return type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, ' ');
}

/** Title-case a canonicalized (lowercase) protein for display ("chicken" → "Chicken"). */
function displayProtein(protein: string): string {
  return protein.charAt(0).toUpperCase() + protein.slice(1);
}

// Maps an ordered descriptor to its PR-2 card. Display strings come from the tested
// dashboardCards helpers; the safety-critical fields (established / state) ride on the
// descriptor straight from buildDashboardCards. Cards are display-only in v1 (no
// onPress) — the card→detail "doorway" (wiring MetricDetailScreen as /insights/[metric])
// is the flagged follow-up; the PR-2 cards hide their chevron when not tappable.
function renderCard(card: DashboardCard, petName: string) {
  switch (card.kind) {
    case 'symptomCount':
      return (
        <MetricCard
          key={card.key}
          label={symptomLabel(card.symptomType)}
          value={String(card.current)}
          polarity="adverse"
          established={card.established}
          delta={card.delta}
          deltaLabel={describeCountDelta(card.current, card.prior, WINDOW)}
          sparkData={card.sparkData}
          petName={petName}
        />
      );
    case 'symptomFrequency':
      return (
        <FrequencyCalendarCard
          key={card.key}
          title={symptomLabel(card.symptomType)}
          buckets={card.buckets}
          symptomType={card.symptomType}
        />
      );
    case 'intakeRate': {
      const r = card.result;
      const populated = !isNotEnoughData(r);
      const rate = r as IntakeRate; // narrowed by `populated`
      return (
        <MetricCard
          key={card.key}
          label="Meals finished"
          value={populated ? `${Math.round(rate.rate * 100)}%` : ''}
          polarity="positive"
          established={card.established}
          state={card.state}
          calibrationUnit="meal"
          note={populated && rate.intakeNotDirectlyObserved ? intakeNotObservedNote() : undefined}
          petName={petName}
        />
      );
    }
    case 'topFood': {
      const r = card.result;
      const entries = isNotEnoughData(r)
        ? []
        : r.map((f) => ({
            key: f.foodItemId,
            label: f.label,
            value: `${f.count} ${pluralize(f.count, 'log')}`,
            tag: f.foodType === 'treat' ? 'treat' : undefined,
          }));
      return (
        <RankingCard
          key={card.key}
          title="Top food"
          entries={entries}
          state={card.state}
          calibrationUnit="meal"
          petName={petName}
        />
      );
    }
    case 'topProtein': {
      const r = card.result;
      const entries = isNotEnoughData(r)
        ? []
        : r.map((p) => ({ key: p.protein, label: displayProtein(p.protein), value: `${p.count}×` }));
      return (
        <RankingCard
          key={card.key}
          title="Top protein"
          entries={entries}
          state={card.state}
          calibrationUnit="meal"
          petName={petName}
        />
      );
    }
    case 'composition':
      return <CompositionCard key={card.key} composition={card.composition} />;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colorNeutralLight,
  },
  scroll: {
    padding: theme.space3,
    gap: theme.space3,
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
    lineHeight: 22,
  },
  retryBtn: {
    paddingHorizontal: theme.space3,
    paddingVertical: 10,
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
  bottomPad: {
    height: theme.space5,
  },
});
