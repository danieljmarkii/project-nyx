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
  getIntakeRateWithPrior,
  getTopFoods,
  getTopProteins,
  getMealTreatComposition,
  isNotEnoughData,
  type AnalyticsWindow,
} from '../../lib/analytics';
import {
  buildDashboardCards,
  selectDashboardState,
  type DashboardCard,
  type DashboardState,
} from '../../lib/dashboardScreen';
import {
  describeCountDelta,
  describeRateDelta,
  intakeNotObservedNote,
  intakeRateDefinition,
  symptomCountDefinition,
  symptomFrequencyDefinition,
  topFoodDefinition,
  topProteinDefinition,
  compositionDefinition,
} from '../../lib/dashboardCards';
import { MetricCard } from '../../components/dashboard/MetricCard';
import { RankingCard } from '../../components/dashboard/RankingCard';
import { FrequencyCalendarCard } from '../../components/dashboard/FrequencyCalendarCard';
import { CompositionCard } from '../../components/dashboard/CompositionCard';
import { AiSummaryCard } from '../../components/dashboard/AiSummaryCard';
import { DashboardEmptyState } from '../../components/dashboard/DashboardEmptyState';
import { useSummary } from '../../hooks/useSummary';

// The "Patterns" dashboard (B-023 PR 3/4) — tier 2 of the intelligence ladder (§2): the
// full story on demand. Summary-led layout (§7): the AI summary (AiSummaryCard, cache-only,
// PR 4) leads, then the seeded card set in priority order — safety always first
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

  // The AI summary (§7) is cache-only, on the Signal's regen cadence — its own hook so the
  // cards' local-SQLite load and the summary's network read stay independent.
  const { summary } = useSummary();

  // Scroll-to for the summary's grounding affordance ("Based on the cards below ↓"): a real,
  // honest "take me to the evidence" action without faking card→detail navigation (B-093).
  const scrollRef = useRef<ScrollView>(null);
  const cardsY = useRef(0);
  const jumpToCards = useCallback(() => {
    scrollRef.current?.scrollTo({ y: cardsY.current, animated: true });
  }, []);

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [cards, setCards] = useState<DashboardCard[]>([]);
  const [dashState, setDashState] = useState<DashboardState>('empty');
  // Show the loading state only on the first read for a pet; later focuses refresh
  // silently so the surface doesn't flash empty on every return (the useSignal pattern).
  const loadedPetRef = useRef<string | null>(null);
  // Monotonic load id: a newer load (pet switch, retry, re-focus) supersedes an
  // in-flight one, so a slow pet-A read can never commit over pet-B's data after a
  // switch (the multi-pet stale-overwrite race; cf. the cancelled-flag in useSignal,
  // generalized here because there are two callers — the focus effect and retry).
  const loadIdRef = useRef(0);

  const load = useCallback(async (showLoading: boolean) => {
    const pet = usePetStore.getState().activePet;
    if (!pet) return;
    const myId = ++loadIdRef.current;
    if (showLoading) setStatus('loading');
    try {
      const [symptomCounts, frequencyBuckets, intakeComparison, topFoods, topProteins, composition] =
        await Promise.all([
          getSymptomCounts(pet.id, WINDOW),
          getSymptomFrequencyByDay(pet.id, WINDOW),
          getIntakeRateWithPrior(pet.id, WINDOW),
          getTopFoods(pet.id, WINDOW),
          getTopProteins(pet.id, WINDOW),
          getMealTreatComposition(pet.id, WINDOW),
        ]);
      if (loadIdRef.current !== myId) return; // superseded by a newer load — drop these results
      setDashState(selectDashboardState({ symptomCounts, composition }));
      setCards(
        buildDashboardCards({
          symptomCounts,
          frequencyBuckets,
          intakeRate: intakeComparison.current,
          intakeRatePrior: intakeComparison.prior,
          topFoods,
          topProteins,
          composition,
        }),
      );
      setStatus('ready');
    } catch (e) {
      if (loadIdRef.current !== myId) return; // a newer load owns the screen now
      // No silent failures (house rule): surface a warm retry, never a wrong number.
      console.error('[patterns] load failed:', e);
      setStatus('error');
    }
  }, []);

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
      {/* Arrow-only back button — the default label inherits the tab group's route
          name ("(tabs)"), which reads as a bug; 'minimal' shows just the chevron. */}
      <Stack.Screen
        options={{ title: 'Patterns', headerShown: true, headerBackButtonDisplayMode: 'minimal' }}
      />

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
          <Text style={styles.stateText}>I couldn't pull {petName}'s patterns just now.</Text>
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
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {dashState === 'empty' ? (
            <DashboardEmptyState petName={petName} />
          ) : (
            <>
              {/* Summary-led (§7): the AI summary leads, the safety cards immediately below. */}
              <AiSummaryCard summary={summary} petName={petName} onJumpToCards={jumpToCards} />
              <View
                style={styles.cards}
                onLayout={(e) => {
                  cardsY.current = e.nativeEvent.layout.y;
                }}
              >
                {/* Pass the RAW name (not the 'your pet'-resolved petName) so each card's
                    definition/calibration copy owns its OWN nyx-voice fallback. */}
                {cards.map((card) => renderCard(card, activePet?.name))}
              </View>
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
function renderCard(card: DashboardCard, petName?: string) {
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
          definition={symptomCountDefinition(symptomLabel(card.symptomType).toLowerCase(), petName)}
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
          definition={symptomFrequencyDefinition(symptomLabel(card.symptomType).toLowerCase(), petName)}
        />
      );
    case 'intakeRate': {
      const r = card.result;
      // Narrow via the sentinel guard (no `as`): read the rate only when it's real.
      let value = '';
      let progress: number | undefined;
      let note: string | undefined;
      let delta: number | undefined;
      let deltaLabel: string | undefined;
      if (!isNotEnoughData(r)) {
        value = `${Math.round(r.rate * 100)}%`;
        progress = r.rate; // the proportion bar — the card's shape (B-098), never a bare number
        note = r.intakeNotDirectlyObserved ? intakeNotObservedNote() : undefined;
        // "vs last month" only when the PRIOR window is itself established (never a
        // fabricated baseline). delta is whole percentage points so its sign matches the
        // phrase exactly; MetricCard resolves the tone — a positive-metric DROP stays
        // neutral (§13 #6), the floored decline detector owns escalation, not this card.
        const p = card.prior;
        if (!isNotEnoughData(p)) {
          delta = Math.round(r.rate * 100) - Math.round(p.rate * 100);
          deltaLabel = describeRateDelta(r.rate, p.rate, WINDOW);
        }
      }
      return (
        <MetricCard
          key={card.key}
          label="Meals finished"
          value={value}
          polarity="positive"
          established={card.established}
          state={card.state}
          progress={progress}
          delta={delta}
          deltaLabel={deltaLabel}
          calibrationUnit="meal"
          note={note}
          definition={intakeRateDefinition(petName)}
          petName={petName}
        />
      );
    }
    case 'topFood': {
      const r = card.result;
      // Bar = share of diet; right = "% finished" (intake), treats flagged, thin → hint (§11 #1).
      const entries = isNotEnoughData(r)
        ? []
        : r.map((f) => ({
            key: f.foodItemId,
            label: f.label,
            share: f.shareOfDiet,
            shareLabel: `${Math.round(f.shareOfDiet * 100)}% of diet`,
            finishedRate: f.finishedRate,
            isTreat: f.isTreat,
          }));
      return (
        <RankingCard
          key={card.key}
          title="Top food"
          entries={entries}
          state={card.state}
          calibrationUnit="meal"
          definition={topFoodDefinition(petName)}
          petName={petName}
        />
      );
    }
    case 'topProtein': {
      const r = card.result;
      // Meal-based (treats excluded): share of meals + "% finished" per protein.
      const entries = isNotEnoughData(r)
        ? []
        : r.map((p) => ({
            key: p.protein,
            label: displayProtein(p.protein),
            share: p.shareOfDiet,
            shareLabel: `${Math.round(p.shareOfDiet * 100)}% of meals`,
            finishedRate: p.finishedRate,
          }));
      return (
        <RankingCard
          key={card.key}
          title="Top protein"
          entries={entries}
          state={card.state}
          calibrationUnit="meal"
          definition={topProteinDefinition(petName)}
          petName={petName}
        />
      );
    }
    case 'composition':
      return (
        <CompositionCard
          key={card.key}
          composition={card.composition}
          definition={compositionDefinition(petName)}
        />
      );
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
  // Wraps the card list so its top y can be measured for the summary's "jump to cards"
  // affordance; carries the inter-card gap the scroll container gave the cards before.
  cards: {
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
  bottomPad: {
    height: theme.space5,
  },
});
