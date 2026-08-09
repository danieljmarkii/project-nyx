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
import { useDietTrial } from '../../hooks/useDietTrial';
import { resolveTrialStrip } from '../../lib/dietTrialCard';
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
  // the same trial (B-417 PR 4).
  const { input: trialInput } = useDietTrial();
  // B-721 SR-5 (§3.4) — is a trial running for the active pet? Computed here from the
  // trial input Home already loads (no second read) and passed to SignalZone, where a
  // falling reflection's expanded state appends the mid-trial adjacency line. `isTrialRunning`
  // is the one trial predicate (lib/dietTrial), read on the trial's own clock (`nowMs`).
  const trialRunning = trialInput?.trial ? isTrialRunning(trialInput.trial, trialInput.nowMs) : false;
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
          <SignalZone trialRunning={trialRunning} />
          {/* B-417 §4.2 — a running trial gets a compact strip here, BELOW Signal
              and ABOVE Today. Deliberate: Principle 3 says safety insights always
              lead, and a trial is context, not an insight. `resolveTrialStrip`
              returns null unless a trial is ACTIVE, so Home gains nothing when
              there isn't one. */}
          <TrialStrip model={trialInput ? resolveTrialStrip(trialInput) : null} />
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
