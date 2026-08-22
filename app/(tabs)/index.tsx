import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEvents } from '../../hooks/useEvents';
import { useSyncStore } from '../../store/syncStore';
import { usePetStore } from '../../store/petStore';
import { theme } from '../../constants/theme';
import { syncNow } from '../../lib/sync';
import { regenerateSignal } from '../../lib/signal';
import { HomeHeader } from '../../components/home/HomeHeader';
import { PullToRefreshSky } from '../../components/home/PullToRefreshSky';
import { CrossPetSafetyBanner } from '../../components/home/CrossPetSafetyBanner';
import { SignalZone } from '../../components/home/SignalZone';
import { TrialStrip } from '../../components/home/TrialStrip';
import { MedStrip } from '../../components/home/MedStrip';
import { TodayZone } from '../../components/home/TodayZone';
import { TrendZone } from '../../components/home/TrendZone';
import { pullThreshold } from '../../lib/haptics';
import { useDietTrial } from '../../hooks/useDietTrial';
import { resolveTrialStrip, isAnimalNotEating } from '../../lib/dietTrialCard';
import { isTrialRunning } from '../../lib/dietTrial';
import { useMedStrips } from '../../hooks/useMedStrips';
import { resolveMedStrips } from '../../lib/medStrip';

// Keep the "Checking for anything new…" band up long enough to read, even if the
// sync + regen return almost instantly (the band would otherwise flash).
const MIN_REFRESH_MS = 700;

export default function HomeScreen() {
  const { loadTodayEvents } = useEvents();
  // B-054 §6 — reactive refresh-after-hydrate: re-read Today whenever a sync
  // cycle finishes, so rows another device pushed appear without a reload.
  const hydrationTick = useSyncStore((s) => s.hydrationTick);
  // CulpritMark tap-to-view (B-284 §3): the Signal zone is the FIRST thing in the
  // scroll body (right under the banner), so "scroll to the Signal zone" is just
  // scrolling to top — no measured y-offset/onLayout tracking needed.
  const scrollRef = useRef<ScrollView>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Same loader as the Pet-tab card, so the two surfaces cannot disagree about
  // the same trial (B-417 PR 4). `inputIsForActivePet` fails closed for B-789 below.
  const { input: trialInput, inputIsForActivePet: trialFactsFresh } = useDietTrial();
  // B-721 SR-5 (§3.4) — is a trial running for the active pet? Computed here from the
  // trial input Home already loads (no second read) and passed to SignalZone, where a
  // falling reflection's expanded state appends the mid-trial adjacency line. `isTrialRunning`
  // is the one trial predicate (lib/dietTrial), read on the trial's own clock (`nowMs`).
  const trialRunning = trialInput?.trial ? isTrialRunning(trialInput.trial, trialInput.nowMs) : false;
  // B-789 (§5.2) — suppress the event-driven Signal trial_response card whenever the active pet's
  // record carries a NOT-EATING concern (a live intake decline or a diet refusal). The card fires
  // from the server `trial_response` finding, which is blind to the refusal: a diet-trial cat
  // refusing the prescribed diet from day 1 has uniform-low intake, so the relative-decline detector
  // never fires and no safety card leads — yet a reassuring "0 vomiting · was 20" would render over a
  // starving cat. Computed from the SAME `trialInput` the strip below withholds its vomit line on
  // (`isAnimalNotEating`), so the card and the strip can never disagree about the same refusal.
  //
  // FAIL CLOSED on stale/unloaded facts (adversarial-reviewer): `useDietTrial` loads async and is
  // heavier than the Signal-cache read, and it RETAINS the previous pet's `trialInput` across a
  // switch — so a non-null `trialInput` is not proof it belongs to the pet the Signal is for, and a
  // plain `trialInput ? … : false` let the reassuring card render before the facts landed (cold
  // start) or over the wrong pet (a switch). Absence of a refusal fact during a load is NOT evidence
  // of eating (n=1 never reassures), so suppress until the facts are confirmed for the active pet
  // (`inputIsForActivePet`). That flag stays true across a same-pet sync, so this never flickers the
  // card on a routine refresh.
  const suppressTrialResponse =
    trialFactsFresh && trialInput ? isAnimalNotEating(trialInput) : !trialFactsFresh;
  // B-789 — the trial strip's standing vomit line (CUL-13) is the SAME reassuring summary the card
  // carries, and `resolveTrialStrip` reads the retained `trialInput` directly, so across a pet switch it
  // can lag onto the previous (eating) pet's count over a now-active refuser. Withhold that ONE line
  // until the active pet's facts are confirmed (the same fail-closed rule as the card), so the strip and
  // the card can never disagree about the same refusal — not even during the switch window. The rest of
  // the strip is untouched, and a fresh input passes through unchanged, so the steady state is
  // byte-identical (`resolveTrialStrip` already withholds this line on a not-eating record).
  const rawTrialStrip = trialInput ? resolveTrialStrip(trialInput) : null;
  const trialStripModel =
    rawTrialStrip && !trialFactsFresh ? { ...rawTrialStrip, trialResponseLine: null } : rawTrialStrip;
  // The medication strip's input (B-614 PR M2) — resolved inline below, exactly
  // like the trial strip, so the resolver call and the placement stay on-screen.
  const { input: medInput } = useMedStrips();

  useEffect(() => {
    loadTodayEvents();
  }, [loadTodayEvents, hydrationTick]);

  // Manual pull-to-refresh (B-284 §5): sync down any other-device writes AND
  // regenerate the Signal, so a pull genuinely "checks for anything new". The night
  // band (PullToRefreshSky) is the only indicator — the RefreshControl's native
  // spinner is hidden (transparent). Failures stay quiet (no wrong state), matching
  // the House "no silent-but-wrong" rule: a failed refresh just leaves prior data.
  const onRefresh = useCallback(async () => {
    // The threshold itself: RN only calls onRefresh once the pull is committed, so an
    // abandoned half-pull never buzzes.
    pullThreshold();
    const started = Date.now();
    setRefreshing(true);
    const pet = usePetStore.getState().activePet;
    try {
      await Promise.all([
        syncNow().catch((e) => console.warn('[home] refresh sync failed:', e)),
        pet
          ? regenerateSignal(pet.id).catch((e) => console.warn('[home] refresh signal failed:', e))
          : Promise.resolve(),
      ]);
      // syncNow() is called directly here (not via the useSync wrapper), so it never
      // bumps the hydration tick that TodayZone + TrendZone re-read on. Bump it so a pull
      // refreshes Today/Trend too — not just the Signal, which regenerateSignal ticks itself.
      useSyncStore.getState().bumpHydrationTick();
    } finally {
      const elapsed = Date.now() - started;
      if (elapsed < MIN_REFRESH_MS) {
        await new Promise((r) => setTimeout(r, MIN_REFRESH_MS - elapsed));
      }
      setRefreshing(false);
    }
  }, []);

  return (
    // 'top' is intentionally NOT a SafeAreaView edge here — the HomeHeader owns
    // the top inset so its white surface bleeds behind the status bar. Letting
    // SafeAreaView pad the top would paint the inset with the grey screen bg,
    // leaving a grey strip above the white header.
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      {/* Pinned identity strip (B-076) — stays put while the zones scroll, so
          the AI Signal still leads the scrollable intelligence surface. */}
      <HomeHeader onPressMark={() => scrollRef.current?.scrollTo({ y: 0, animated: true })} />
      {/* Relative wrapper so the pull-to-refresh night band overlays the top of the
          feed (below the pinned header, so it's already clear of the safe-area inset). */}
      <View style={styles.body}>
        <PullToRefreshSky active={refreshing} />
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              // Hide the native indicator — the night band is the only feedback.
              tintColor="transparent"
              colors={['transparent']}
            />
          }
        >
          {/* Cross-pet safety banner (multi-pet §4) — ABOVE the Signal because it
              belongs to a DIFFERENT pet; renders nothing for single-pet households
              or when no other pet has a cached safety finding. */}
          <CrossPetSafetyBanner />
          <SignalZone trialRunning={trialRunning} suppressTrialResponse={suppressTrialResponse} />
          {/* B-417 §4.2 — a running trial gets a compact strip here, BELOW Signal
              and ABOVE Today. Deliberate: Principle 3 says safety insights always
              lead, and a trial is context, not an insight. `resolveTrialStrip`
              returns null unless a trial is ACTIVE, so Home gains nothing when
              there isn't one. */}
          <TrialStrip model={trialStripModel} />
          {/* B-614 §8/D9 — one compact strip PER active/recent medication, BELOW
              the trial strip and ABOVE Today. The trial is the wedge's primary
              object (8–12 weeks); a 14-day course is the shorter-lived guest. A
              fixed order, not a ranking. `resolveMedStrips` returns an empty array
              when there is nothing to show, so Home draws no hole for a pet with
              no meds (§8, AC #3). The card self-contains its one-tap confirm (M3),
              which writes local-first and bumps the hydration tick above to settle. */}
          {(medInput ? resolveMedStrips(medInput) : []).map((m) => (
            <MedStrip key={m.key} model={m} />
          ))}
          <TodayZone />
          <TrendZone />
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colorNeutralLight },
  body: { flex: 1 },
  scroll: { padding: theme.space3, gap: theme.space3, paddingBottom: 100 },
  // paddingBottom gives the FAB clearance over the last card
});
