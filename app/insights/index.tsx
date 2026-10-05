import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect, router } from 'expo-router';
import { theme } from '../../constants/theme';
import { usePetStore } from '../../store/petStore';
import {
  getSymptomCounts,
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
import { computeWeightTrend, getWeightHistory, getWeightReadingCount } from '../../lib/weight';
import {
  topFoodDefinition,
  topProteinDefinition,
  compositionDefinition,
} from '../../lib/dashboardCards';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { RankingCard } from '../../components/dashboard/RankingCard';
import { CompositionCard } from '../../components/dashboard/CompositionCard';
import { DashboardEmptyState } from '../../components/dashboard/DashboardEmptyState';
import { getTimingPanel, type TimingPanelModel } from '../../lib/patternsTiming';
import { getTrialPanel, type TrialSoFarModel } from '../../lib/patternsTrial';
import { TimingPanelCard } from '../../components/dashboard/TimingPanelCard';
import { TrialSoFarCard } from '../../components/dashboard/TrialSoFarCard';
import { ThemedText } from '../../components/ui/ThemedText';
import { WhatYouNoticedCard } from '../../components/dashboard/WhatYouNoticedCard';
import { useDietTrial } from '../../hooks/useDietTrial';
import { isAnimalNotEating } from '../../lib/dietTrialCard';
import { lookCardLive } from '../../lib/lookCard';
import { loadLookDays, loadVomitLocalDays } from '../../lib/looks';
import { LOOK_PAIRING_ON_PATTERNS } from '../../lib/lookPairing';
import { loadLookWithheldFacts, lookWithheld } from '../../lib/lookWithheld';
import { buildNoticedCard, noticedCardHref, type NoticedCardModel } from '../../lib/lookPatterns';
import { localDayIndex, dayKeyFromIndex, toLocalDayKey } from '../../lib/utils';
import { MonthInstrument } from '../../components/designV2/patterns/MonthInstrument';
import { WeightCard } from '../../components/designV2/patterns/WeightCard';
import { trialStartDayKey } from '../../lib/trialWindowDates';
import { dateWord } from '../../lib/chartCopy';
import type { WeightReading } from '../../lib/weight';

// The "Patterns" dashboard (B-023 PR 3/4) — tier 2 of the intelligence ladder (§2): the
// full story on demand. Design v2's page (D2-5 / CUL-1067; `docs/culprit-design-v4-
// mockups.html` §04; GA by CUL-1071): the month first, then the weight as dots by date,
// then the "what Nyx ate" cards, the Timing / Trial panels and *What you noticed*. The AI
// summary, the KPI column, the old calendar and the old weight card retired with the flag.
// Per active pet (multi-pet switcher-aware). The descriptive cards are fixed to the MONTH
// window (§13 #2).
//
// Every metric is a deterministic local-SQLite aggregate (lib/analytics.ts); the screen
// never computes a number — it formats already-true facts.

const WINDOW: AnalyticsWindow = 'month';

// Weight readings are sparse (you weigh occasionally, not daily), so the weight card
// shows the last N READINGS rather than the dashboard's month window — a month-scoped
// weight trend would usually be 0–1 points (no trend). Mirrors the Profile card's
// SERIES_LIMIT; every number is anchored to an explicit date, so it never reads as
// "this month" next to the month-scoped cards.
const WEIGHT_SERIES_LIMIT = 12;

// Noticed's VOMIT read is eight weeks: the card speaks for the last 28 days, but a read
// that stops there would be bounded differently from the looks it is intersected with.
// The card's own module bounds every number it prints to the 28 it speaks for — the vomit
// days included (a window may INDEX, only the total may be SPOKEN — C-3).
const NOTICED_VOMIT_READ_DAYS = 56;

export default function PatternsScreen() {
  const { activePet } = usePetStore();
  const petName = activePet?.name ?? 'your pet';

  // Signals v2 (B-755 PR 9, CUL-11) — the two additive Patterns panels (Timing + The
  // trial so far). GA'd (CUL-548): the client no longer gates them, so they load
  // whenever there's an active pet and render whenever their model has data (a pet with
  // no vomiting / no trial simply shows neither).
  const [timingModel, setTimingModel] = useState<TimingPanelModel | null>(null);
  const [trialModel, setTrialModel] = useState<TrialSoFarModel | null>(null);
  const panelLoadIdRef = useRef(0);
  // Tracks which pet the panel models belong to, so a pet switch drops the prior pet's
  // panels IMMEDIATELY rather than rendering them under the new pet's name until the
  // (unwindowed, full-record) reads land — the multi-pet stale-render trap the calendar
  // guards with a keyed remount (code-reviewer #2).
  const panelPetRef = useRef<string | null>(null);

  // Noticed (CUL-874 / N-5) — the SAME gate Home's card takes (`lookCardLive`: a species
  // with a vocabulary; Noticed is GA since CUL-876), read through the same helper so the
  // two surfaces cannot drift. Off it, `noticed` stays null and `buildDashboardCards`
  // emits nothing.
  const noticedLive = lookCardLive({ species: activePet?.species });
  // The trial loader has two readers: Noticed's withheld predicate (below) and the trial
  // mark on the month (`trialMark`).
  const { input: trialInput, inputIsForPet: trialFactsFresh } = useDietTrial(activePet?.id ?? null);
  // Arm 2 of the withheld predicate. The SAME loader Home uses (`useDietTrial`), and the
  // same fail-closed read: `input` is retained across a pet switch, so a non-null input is
  // not proof it belongs to this pet, and an unconfirmed record is `null` — ignorance, which
  // `lookWithheldState` resolves to 'unknown' and `lookWithheld` then fails CLOSED on. A
  // quiet run drawn during the switch window is the one direction that cannot be taken back.
  //
  // Null whenever Noticed is not live, where nothing reads it: it is one of `load`'s
  // deps, so a trial read answering for the month's mark alone would otherwise re-key
  // `load` and re-run the whole dashboard read through the focus effect.
  const trialNotEating = noticedLive && trialFactsFresh && trialInput ? isAnimalNotEating(trialInput) : null;

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [cards, setCards] = useState<DashboardCard[]>([]);
  const [dashState, setDashState] = useState<DashboardState>('empty');

  const [weightSeries, setWeightSeries] = useState<{ readings: WeightReading[]; count: number }>({ readings: [], count: 0 });
  // Bumped on every focus load: the month re-reads the current month, and "today" is
  // re-derived — a screen left open across midnight moves on.
  const [monthTick, setMonthTick] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const todayKey = useMemo(() => toLocalDayKey(new Date()), [monthTick]);
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
    const nowMs = Date.now();
    if (showLoading) setStatus('loading');
    try {
      const [
        symptomCounts,
        topFoods,
        topProteins,
        composition,
        weightReadings,
        weightReadingTotal,
      ] = await Promise.all([
        // The cold-start gate's symptom half (`selectDashboardState`, §10).
        getSymptomCounts(pet.id, WINDOW),
        getTopFoods(pet.id, WINDOW),
        getTopProteins(pet.id, WINDOW),
        getMealTreatComposition(pet.id, WINDOW),
        getWeightHistory(pet.id, WEIGHT_SERIES_LIMIT),
        // The COUNT is the whole record, not the 12-reading window it sits beside: the
        // card speaks it as a fact and it labels the tap-through to every reading, so a
        // window-derived count read "12 readings" to a 20-weigh-in pet (CUL-223).
        getWeightReadingCount(pet.id),
      ]);
      if (loadIdRef.current !== myId) return; // superseded by a newer load — drop these results
      const weightTrend = computeWeightTrend(weightReadings, weightReadingTotal);
      setWeightSeries({ readings: weightReadings, count: weightTrend.readingCount });
      const noticed = await loadNoticed(pet, trialNotEating, noticedLive, nowMs);
      if (loadIdRef.current !== myId) return; // the look read is a second await — re-check
      setDashState(
        selectDashboardState({ symptomCounts, composition, weightReadingCount: weightTrend.readingCount }),
      );
      setCards(
        buildDashboardCards({
          topFoods,
          topProteins,
          composition,
          noticed,
        }),
      );
      setStatus('ready');
    } catch (e) {
      if (loadIdRef.current !== myId) return; // a newer load owns the screen now
      // No silent failures (house rule): surface a warm retry, never a wrong number.
      console.error('[patterns] load failed:', e);
      setStatus('error');
    }
  }, [noticedLive, trialNotEating]);

  useFocusEffect(
    useCallback(() => {
      if (!activePet) return;
      const firstForPet = loadedPetRef.current !== activePet.id;
      loadedPetRef.current = activePet.id;
      load(firstForPet);
      setMonthTick((t) => t + 1);
    }, [activePet?.id, load]),
  );

  // The v2 panels load on their own (independent of the seeded-card read above), so a
  // slow local aggregate never blocks them and vice versa. They are ADDITIVE context:
  // on a read failure they simply don't render — never a whole-screen error — and the
  // monotonic id drops a superseded pet's result after a switch (the same race guard).
  const loadPanels = useCallback(async (petId: string) => {
    const myId = ++panelLoadIdRef.current;
    // `allSettled`, not `all`: the two panels are independently additive, so a trial-read
    // fault must not blank an already-good timing read (and vice versa). (The two loaders
    // each re-run the three local reads — 6 full-record scans, not 3 — so that the
    // standalone detail routes stay self-sufficient; acceptable for a dark beta surface.)
    const [timingRes, trialRes] = await Promise.allSettled([
      getTimingPanel(petId),
      getTrialPanel(petId),
    ]);
    if (panelLoadIdRef.current !== myId) return; // superseded by a newer pet/focus
    if (timingRes.status === 'fulfilled') setTimingModel(timingRes.value);
    else {
      console.error('[patterns] timing panel load failed:', timingRes.reason);
      setTimingModel(null);
    }
    if (trialRes.status === 'fulfilled') setTrialModel(trialRes.value);
    else {
      console.error('[patterns] trial panel load failed:', trialRes.reason);
      setTrialModel(null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      // No pet: clear any prior models and load nothing.
      if (!activePet) {
        setTimingModel(null);
        setTrialModel(null);
        panelPetRef.current = null;
        return;
      }
      // Pet changed since the models were loaded → drop the prior pet's panels now, so
      // they can never render under the new pet's name while the new read is in flight.
      if (panelPetRef.current !== activePet.id) {
        setTimingModel(null);
        setTrialModel(null);
        panelPetRef.current = activePet.id;
      }
      loadPanels(activePet.id);
    }, [activePet?.id, loadPanels]),
  );

  // The trial's start, marked on the month's bars at its day. Read through the same
  // loader Home uses and gated on the same freshness flag — a stale pet's trial is never
  // drawn on the active pet's month.
  const trialMark = useMemo(() => {
    if (!trialFactsFresh || !trialInput?.trial) return null;
    const day = trialStartDayKey(trialInput.trial.startedAt);
    return { day, label: `trial · ${dateWord(day)}` };
  }, [trialFactsFresh, trialInput]);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      {/* Arrow-only back button — the default label inherits the tab group's route
          name ("(tabs)"), which reads as a bug; 'minimal' shows just the chevron. */}
      <Stack.Screen
        options={{ title: 'Patterns', headerShown: true, headerBackButtonDisplayMode: 'minimal' }}
      />

      {!activePet ? (
        <View style={styles.centered}>
          <ThemedText style={styles.stateText}>No pet selected.</ThemedText>
        </View>
      ) : status === 'loading' ? (
        // Tier-1 (§5): content-shaped skeletons for the local-SQLite read (<~1s) —
        // the dashboard's card silhouette, not a spinner, so the surface doesn't flash
        // empty then reflow.
        <View style={styles.scroll}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : status === 'error' ? (
        <View style={styles.centered}>
          <ThemedText style={styles.stateText}>I couldn't pull {petName}'s patterns just now.</ThemedText>
          <Pressable
            onPress={() => load(true)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Try again"
            style={styles.retryBtn}
          >
            <ThemedText style={styles.retryText}>Try again</ThemedText>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {/* The cold-start moment stays reachable (Principle 5): on a record with nothing
              to chart the warm invitation leads, and the month follows it — an empty month
              is itself a designed state ("nothing logged yet"), never weeks of "unlogged" on
              an account that is minutes old. */}
          {dashState === 'empty' && <DashboardEmptyState petName={petName} />}
          <MonthInstrument
            key={`month:${activePet.id}`}
            petId={activePet.id}
            today={todayKey}
            trialMark={trialMark}
            refreshTick={monthTick}
          />
          <WeightCard
            readings={weightSeries.readings}
            readingCount={weightSeries.count}
            petName={activePet.name}
            petId={activePet.id}
            drawIn
          />
          {cards
            .filter((c) => c.kind !== 'whatYouNoticed')
            .map((card) => renderCard(card, activePet.name))}
          {timingModel != null && (
            <TimingPanelCard
              model={timingModel}
              petName={activePet.name}
              onPress={() => router.push('/insights/timing')}
            />
          )}
          {trialModel != null && (
            <TrialSoFarCard model={trialModel} onPress={() => router.push('/insights/trial')} />
          )}
          {cards.filter((c) => c.kind === 'whatYouNoticed').map((card) => renderCard(card, activePet.name))}
          <View style={styles.bottomPad} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

/**
 * Noticed's three reads, or `null` when the surface is not live for this pet.
 *
 * `null` — never an empty model — is what keeps a pet with no vocabulary free of the card:
 * an empty model would still emit it (§7 draws the empty state on purpose), and this is
 * the one place that distinction is made.
 *
 * A FAILED READ IS ALSO `null`, and that is the fail-closed direction: this card's whole
 * content is counts about an animal, so the honest response to "the record did not
 * answer" is to draw no card, never a card with zeroes in it. It is caught here rather
 * than by the caller's try/catch so a look-read fault cannot blank the whole dashboard —
 * the Signals-v2 panels' own rule (`allSettled`), applied to a third additive surface.
 */
async function loadNoticed(
  pet: { id: string; name: string; species: string | null; sex: 'male' | 'female' | 'unknown' },
  trialNotEating: boolean | null,
  live: boolean,
  nowMs: number,
): Promise<NoticedCardModel | null> {
  if (!live) return null;
  try {
    const sinceDay = dayKeyFromIndex(localDayIndex(nowMs) - (NOTICED_VOMIT_READ_DAYS - 1));
    const [record, vomitLocalDays, withheldFacts] = await Promise.all([
      // THE WHOLE RECORD, UNBOUNDED. A symptom row prints *first {date}*, and that is a
      // claim about the record and not about a window: bounded to eight weeks it would
      // name the horizon's first day, and the report — which anchors to the record
      // server-side — would disagree with this card in front of a vet.
      // Under-stating an onset is also the wrong direction to be wrong in. Every COUNT is
      // bounded inside `buildNoticedCard` regardless, so the wider read widens no
      // denominator (C-3). Found by the product read (CUL-874).
      loadLookDays(pet.id),
      // Only the pairing consumes vomit days, and it is held out of v1 (CUL-914 (c)). Read
      // while held, this was a scan nothing used whose failure still blanked the card through
      // the catch below, so it is not made until the hold is lifted.
      LOOK_PAIRING_ON_PATTERNS ? loadVomitLocalDays(pet.id, sinceDay) : Promise.resolve<string[]>([]),
      loadLookWithheldFacts({ id: pet.id, species: pet.species }, trialNotEating, nowMs),
    ]);
    return buildNoticedCard(record, {
      petName: pet.name,
      pet: { species: pet.species, sex: pet.sex },
      nowMs,
      // The SHARED predicate, not a second opinion: Home and Patterns must never disagree
      // one tap apart (T-20). `lookWithheld` is the fail-closed reading — unloaded facts
      // withhold — which is the right one for a surface that answers today.
      withheld: lookWithheld({ id: pet.id }, withheldFacts),
      vomitLocalDays,
    });
  } catch (e) {
    console.error('[patterns] Noticed load failed:', e);
    return null;
  }
}

/** Title-case a canonicalized (lowercase) protein for display ("chicken" → "Chicken"). */
function displayProtein(protein: string): string {
  return protein.charAt(0).toUpperCase() + protein.slice(1);
}

// Maps an ordered descriptor to its card. Display strings come from the tested
// dashboardCards helpers; the state rides on the descriptor straight from
// buildDashboardCards.
function renderCard(card: DashboardCard, petName?: string) {
  switch (card.kind) {
    case 'whatYouNoticed': {
      return (
        <WhatYouNoticedCard
          key={card.key}
          model={card.model}
          // The metric detail for looks is v1.x (§7), so the `›` lands on the History day
          // spine filtered to looks — a real room behind a real door, rather than a
          // chevron that opens a stub.
          onPress={() => router.push(noticedCardHref())}
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
          calibrationUnit="food"
          definition={topFoodDefinition(petName)}
          petName={petName}
        />
      );
    }
    case 'topProtein': {
      const r = card.result;
      // Protein EXPOSURE (treats included, flagged — B-111): share of servings + "% finished"
      // per protein. A treat-sourced protein shows a "treat" tag instead of a rate (RightMeta),
      // so a diet-trial confounder (e.g. chicken via treats) is visible, not silently dropped.
      const entries = isNotEnoughData(r)
        ? []
        : r.map((p) => ({
            key: p.protein,
            label: displayProtein(p.protein),
            share: p.shareOfDiet,
            shareLabel: `${Math.round(p.shareOfDiet * 100)}% of servings`,
            finishedRate: p.finishedRate,
            isTreat: p.isTreat,
          }));
      return (
        <RankingCard
          key={card.key}
          title="Top protein"
          entries={entries}
          state={card.state}
          calibrationUnit="food"
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
    default: {
      // Exhaustiveness: a new card kind must add a case above, not silently render
      // nothing. This fails to compile if DashboardCard gains a member unhandled here.
      const _exhaustive: never = card;
      return _exhaustive;
    }
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
    color: theme.colorAccentInk,
    fontWeight: theme.weightMedium,
  },
  bottomPad: {
    height: theme.space5,
  },
});
