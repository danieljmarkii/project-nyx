import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AppState, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from 'expo-router';
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
import { FollowUpLine } from '../../components/home/FollowUpLine';
import { TrialStrip } from '../../components/home/TrialStrip';
import { AppointmentStrip } from '../../components/vetvisits/AppointmentStrip';
import { LookExits, exitVisibility, lookRectInPage, type LayoutBox } from '../../components/home/LookExits';
import { pullThreshold } from '../../lib/haptics';
import { useDietTrial } from '../../hooks/useDietTrial';
import { resolveTrialStrip, isAnimalNotEating } from '../../lib/dietTrialCard';
import { TodayCard } from '../../components/designV2/home/TodayCard';
import { CoverageDoor } from '../../components/designV2/home/CoverageDoor';
import { HOME_V2_SCROLL_INSET } from '../../lib/fabFootprint';
import { reducedMotionNow } from '../../store/reducedMotionStore';
import { useUiStore } from '../../store/uiStore';
import { RowSpeechContext, type RowSpeech } from '../../components/dayRow/rowSpeech';

/**
 * The slice of the tab navigator this screen needs to hear a Home-tab re-tap.
 * `addListener` returns its own unsubscribe, which is what the effect below cleans
 * up with.
 */
type TabPressNavigation = {
  isFocused: () => boolean;
  addListener: (event: 'tabPress', callback: () => void) => () => void;
};

// Keep the "Checking for anything new…" band up long enough to read, even if the
// sync + regen return almost instantly (the band would otherwise flash).
const MIN_REFRESH_MS = 700;

export default function HomeScreen() {
  const { loadTodayEvents } = useEvents();
  // B-054 §6 — reactive refresh-after-hydrate: re-read Today whenever a sync
  // cycle finishes, so rows another device pushed appear without a reload.
  const hydrationTick = useSyncStore((s) => s.hydrationTick);
  // Scroll-to-top on a Home-tab re-tap (CUL-600, spec §2 SHOULD). The header's
  // CulpritMark used to own this jump; D4 retired the mark, so the standard platform
  // affordance replaces it rather than the behaviour being lost. The Signal zone is
  // the FIRST thing in the scroll body (right under the banner), so "scroll to the
  // Signal" is just scrolling to top — no measured y-offset/onLayout tracking needed.
  const scrollRef = useRef<ScrollView>(null);
  const [refreshing, setRefreshing] = useState(false);
  // The Noticed grid's pinned exits (CUL-871, T-21) need three numbers Home is the only
  // one that has: where the look header sits in the scroll content, how far the feed is
  // scrolled, and how tall the viewport is. They are held here rather than in the card
  // because the card cannot see two of them — and drawn by `LookExits`, which decides
  // from them (`exitVisibility`) rather than being told. The header measures inside the
  // Today card, so its rect is the card's box in the scroll content composed with the
  // header's box inside the card (CUL-1220, BRK-16).
  const [todayCardBox, setTodayCardBox] = useState<LayoutBox | null>(null);
  const [lookHeaderBox, setLookHeaderBox] = useState<LayoutBox | null>(null);
  // The scroll offset lives in a ref, and reaches state (re-rendering the whole feed)
  // only while the Noticed grid is open: `LookExits` draws nothing unless the grid has
  // published its overlay, so a scroll with the grid closed has nothing to repaint.
  // Setting state on every event re-rendered Home ten times a second for every account.
  const scrollYRef = useRef(0);
  const [scrollY, setScrollY] = useState(0);
  const gridOpen = useUiStore((s) => s.captureOverlay !== null);
  // The grid opens at the offset the ref kept while it was closed. A LAYOUT effect, so
  // the frame that first draws the exits is never painted against a stale offset.
  useLayoutEffect(() => {
    if (gridOpen) setScrollY(scrollYRef.current);
  }, [gridOpen]);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);

  // Re-tapping the Home tab scrolls the feed back to the Signal (spec §2 SHOULD).
  // NyxTabBar already emits `tabPress` on every press, addressed to the tapped
  // route's key, so this listener only ever hears Home's own taps. The focus check is
  // what makes it a RE-tap: arriving at Home from another tab leaves the scroll
  // position where the owner left it, which is what every platform does.
  //
  // `useNavigation()` is typed as the generic navigator prop, whose `addListener`
  // union has no `tabPress` — that event belongs to the tab navigator specifically,
  // and react-navigation is a transitive dependency of expo-router rather than one we
  // declare. So the two members this screen actually uses are named structurally and
  // the cast happens once, at the boundary, instead of an `as never` per argument
  // (the same call NyxTabBar's local `TabBarProps` makes for the same reason).
  //
  // Under Reduce Motion the feed jumps (CUL-1123), read at the tap.
  const navigation = useNavigation() as unknown as TabPressNavigation;
  useEffect(
    () =>
      navigation.addListener('tabPress', () => {
        if (navigation.isFocused()) {
          scrollRef.current?.scrollTo({ y: 0, animated: !reducedMotionNow() });
        }
      }),
    [navigation],
  );
  // Same loader as the Pet-tab card, so the two surfaces cannot disagree about
  // the same trial (B-417 PR 4). `inputIsForPet` fails closed for B-789 below.
  const activePetId = usePetStore((s) => s.activePet?.id ?? null);
  // The spine's rows may speak a read that lands only while Home is the screen in front
  // (CUL-1224, BRK-28; `components/dayRow/rowSpeech.ts`). Today's rows are the active
  // pet's record (TodayCard reads that pet's day), so its name is the record's.
  const todayPetName = usePetStore((s) => s.activePet?.name ?? null);
  const rowSpeech = useMemo<RowSpeech>(
    () => ({ petName: todayPetName, mayAnnounce: () => navigation.isFocused() && AppState.currentState === 'active' }),
    [todayPetName, navigation],
  );
  const {
    input: trialInput,
    inputIsForPet: trialFactsFresh,
    loadedPetId: trialPetId,
  } = useDietTrial(activePetId);
  // B-789 (§5.2) — withhold every falling vomit pair on the Signal (the event-driven trial_response
  // `fewer` card, and since CUL-1216 a falling vomit reflection, the lead card's week line
  // and a vomit chronicity card's compare) whenever the active pet's
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
  // (`inputIsForPet`). That flag stays true across a same-pet sync, so this never flickers the
  // card on a routine refresh.
  const withholdFallingVomit =
    trialFactsFresh && trialInput ? isAnimalNotEating(trialInput) : !trialFactsFresh;
  // CUL-1360 — the trial row, for the Signal's anchor: which trial a cached trial finding
  // counted. From the same `trialInput`, only once it is confirmed for the active pet (the
  // pet it names is checked again inside the zone), so a switch never anchors one pet's
  // findings on another pet's trial.
  const signalTrial =
    trialFactsFresh && trialInput && trialPetId
      ? { petId: trialPetId, trial: trialInput.trial, nowMs: trialInput.nowMs }
      : null;
  // B-789 — the trial strip's standing vomit line (CUL-13) is the SAME reassuring summary the card
  // carries, and `resolveTrialStrip` reads the retained `trialInput` directly, so across a pet switch it
  // can lag onto the previous (eating) pet's count over a now-active refuser. Withhold that ONE line
  // until the active pet's facts are confirmed (the same fail-closed rule as the card), so the strip and
  // the card can never disagree about the same refusal — not even during the switch window. The rest of
  // the strip is untouched, and a fresh input passes through unchanged, so the steady state is
  // byte-identical (`resolveTrialStrip` already withholds this line on a not-eating record).
  // CUL-871 / CUL-873 — the SAME register, read for a different question, handed down as
  // THREE states because the Noticed card has two readers of it that must take ignorance
  // opposite ways (C-12: ask what its `null` costs THIS caller).
  //
  //   • the EMERGENCY DOOR reads `=== true` — a positive fact or nothing, never ignorance
  //     (T-20). A door that escalated on unloaded facts would read *Call your vet today.*
  //     forever for a healthy pet whose trial card failed to load once: cry wolf.
  //   • the WITHHELD PREDICATE reads `null` as unanswered and fails CLOSED. Drawing a
  //     quiet run before the facts land is the direction that cannot be taken back.
  //
  // `withholdFallingVomit` above is a third reading of the same register — "may this card
  // reassure?" — and it collapses ignorance to suppression for its own reason. Three
  // questions, one fact, each answer named where it is read.
  const trialNotEating: boolean | null =
    trialFactsFresh && trialInput ? isAnimalNotEating(trialInput) : null;
  const rawTrialStrip = trialInput ? resolveTrialStrip(trialInput) : null;
  const trialStripModel =
    rawTrialStrip && !trialFactsFresh ? { ...rawTrialStrip, trialResponseLine: null } : rawTrialStrip;
  // Design v2 — the whole day (D2-4 / CUL-1066; GA by CUL-1071). Today is the spine with
  // the look as its header, the medication strip's one-tap write is retired (a dose is a
  // fact on the spine once logged; Q1 ruled "that's the FAB's job"), the Trend card is
  // retired, and the coverage door closes the feed.
  const pinnedRect = lookRectInPage(todayCardBox, lookHeaderBox);

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
      // bumps the hydration tick the Today card re-reads on. Bump it so a pull refreshes
      // Today too — not just the Signal, which regenerateSignal ticks itself.
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
      <HomeHeader />
      {/* Relative wrapper so the pull-to-refresh night band overlays the top of the
          feed (below the pinned header, so it's already clear of the safe-area inset). */}
      <View
        style={styles.body}
        onLayout={(e) => setViewportHeight(e.nativeEvent.layout.height)}
      >
        <PullToRefreshSky active={refreshing} />
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          onScroll={(e) => {
            scrollYRef.current = e.nativeEvent.contentOffset.y;
            if (gridOpen) setScrollY(scrollYRef.current);
          }}
          // 16ms would repaint the exits every frame for a decision that only changes
          // at two thresholds; 100ms is under the eye's tolerance for a control
          // appearing and costs a fraction of the bridge traffic.
          scrollEventThrottle={100}
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
          {/* GAP-13 (CUL-1566): the zone speaks a safety finding that arrives while Home is
              in front, through the same focus check the spine's rows ask. The zone names
              its own pet; it reads only `mayAnnounce` from this. */}
          <RowSpeechContext.Provider value={rowSpeech}>
            <SignalZone
              withholdFallingVomit={withholdFallingVomit}
              signalTrial={signalTrial}
            />
          </RowSpeechContext.Provider>
          {/* Engines v3 PR-36 (CUL-1419) — "What did the vet say?" once a call's question
              is due: one navigation line under the Signal, never a card or a control (C-33).
              Dark behind engines_v3_en14. */}
          <FollowUpLine />
          {/* B-417 §4.2 — a running trial gets a compact strip here, BELOW Signal
              and ABOVE Today. Deliberate: Principle 3 says safety insights always
              lead, and a trial is context, not an insight. `resolveTrialStrip`
              returns null unless a trial is ACTIVE, so Home gains nothing when
              there isn't one. */}
          {/* CUL-903 VV-5 (§4.1 A2) — the appointment strip, BETWEEN the Signal and the
              trial strip, in the trial strip's register for the same reason the strip
              below it gives: a visit that is coming is CONTEXT, not an insight, so a
              live safety or intake card keeps its place above it with its own ask
              intact. Nothing here changes, dates or re-phrases a Signal string because
              an appointment exists, and the strip never gains urgency styling.

              It draws nothing unless this pet has a booking inside the five-day window
              (or one whose day just passed, asked once).

              It carries ONE write: *It didn't* → `cancelled_at`. That is Home's third
              write class and a Tier-2 amendment to `docs/nyx-med-strip-requirements.md`
              §0.1, PM-approved 2026-09-11 as one CONFIRMATION and no form — see the
              component header and `guards/homeWrites.test.ts`. */}
          <AppointmentStrip />
          <TrialStrip model={trialStripModel} petId={trialPetId} />
          {/* D2-4 — Today as a spine with the look as its header (the slot CUL-864 ruled
              for the look, after the standing strips and before Today: the look is the
              owner's own observation, not an insight), then the coverage door (the one
              door to Patterns on Home; left-aligned, C-5). The header's rect feeds the
              pinned exits (T-21). `trialNotEating` is the trial's own refusal register,
              THREE-STATE (CUL-873); see its declaration above. */}
          <RowSpeechContext.Provider value={rowSpeech}>
            <TodayCard
              trialNotEating={trialNotEating}
              onLayout={(e) => setTodayCardBox({ y: e.nativeEvent.layout.y, height: e.nativeEvent.layout.height })}
              onLookLayout={(e) =>
                setLookHeaderBox({ y: e.nativeEvent.layout.y, height: e.nativeEvent.layout.height })
              }
            />
          </RowSpeechContext.Provider>
          <CoverageDoor />
        </ScrollView>
        {/* The second absolute layer (the first is the night band above). It draws
            nothing at all unless the Noticed grid is open — `LookExits` reads the card's
            published handles and returns null otherwise. */}
        <LookExits
          {...exitVisibility({
            cardTop: pinnedRect?.top ?? null,
            cardHeight: pinnedRect?.height ?? null,
            scrollY,
            viewportHeight,
          })}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colorNeutralLight },
  body: { flex: 1 },
  // D2-4 — paddingBottom is the page's inset, written once in lib/fabFootprint.ts and
  // asserted ≥ the FAB's floor there (C-5). The last row's control is left-aligned for
  // the other half.
  scroll: { padding: theme.space3, gap: theme.space3, paddingBottom: HOME_V2_SCROLL_INSET },
});
