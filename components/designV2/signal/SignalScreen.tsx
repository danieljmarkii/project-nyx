import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { router } from 'expo-router';
import { theme } from '../../../constants/theme';
import { useAppActive } from '../../../hooks/useAppActive';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { readLastEpisodeIso } from '../../../hooks/useLastEpisodeDates';
import { focusAccessibility } from '../../../lib/a11yFocus';
import { measureNodeInWindow, type WindowRect } from '../../../lib/measureNode';
import { foldedEntry, readFoldEntries, writeFoldEntries, type RecordFacts } from '../../../lib/signalFold';
import { loadSignalScreen, type SignalScreenLoad, type SignalScreenModel } from '../../../lib/signalScreen';
import { WhorlSpinner } from '../../brand/WhorlSpinner';
import { CompareBars } from '../../charts/CompareBars';
import { TimingLanes } from '../../charts/TimingLanes';
import { WeeklyBars } from '../../charts/WeeklyBars';
import { ExpandedReceipts } from '../../home/InsightCard';
import {
  FLIGHT_ENABLED,
  abortFlight,
  flightActiveFor,
  getFlightState,
  landFlight,
  reverseFlight,
  setHeroReady,
  useFlightState,
  type FlightRecord,
} from '../../motion/flightMotion';
import { SIGNAL_OPEN_MOTION, useSignalOpen } from '../../motion/signalOpenMotion';
import { Header } from '../../ui/Header';
import { ThemedText } from '../../ui/ThemedText';
import { EpisodeGallery } from './EpisodeGallery';
import { leadChartWidth } from './SignalLeadCard';

// SignalScreen — the Signal's own screen (D2-3 · CUL-1065; design authority
// `docs/culprit-design-v4-mockups.html` §03, the sections in this order):
//
//   1. the title                       `signalTitle` — names the thing and the window
//   2. the weekly bars                 every week's count and its logged days
//   3. the count-anchored sentence     the server's phrased sentence, the Change Contract's
//   4. the compare                     two windows, logged days shown, nothing adjudicated
//   5. the lanes                       timed from meals, before / in the trial, the untimed line
//   6. the episodes                    a gallery, each tile its OWN read
//   7. why this is a Signal            counts, not a verdict; the medication inside the window
//   8. keep it compact on Home         folds the Home card for the owner's return
//
// A safety finding gets the screen too (S1 lives on Home's card, not here): the same
// sections over its record, plus the shipped phone script (`ExpandedReceipts`) after the
// why — the safety tap's script is one screen away, as it was one tap away.
//
// THE OPENING (Motion Designer, §06): the route rises with the fold's physics (the native
// transition, set in `app/signal/[id].tsx`); the charts draw in on arrival (`drawIn`, the
// FACT — C-30); the sentence and the compare land together at 200ms on one value
// (`useSignalOpen`); the lanes' dots pop behind on their own stagger. Reduced motion is
// the static frame. VoiceOver focus lands on the title when the model arrives.
//
// THE FLIGHT (D2-6 · CUL-1069, `components/motion/flightMotion.ts`): when the card staged
// one, this screen is the landing. Before its read answers it draws the Header, the title
// the card handed over and an empty HERO SLOT of the clone's size, and lands the flight on
// the slot's window rect; the real chart then mounts under the clone at opacity 0 and the
// two swap in one store update. The hero is the card's chart LAYOUT, uniformly scaled to
// the content column (`Hero` — one aspect for both charts, so neither end of the flight
// can snap), and it does not draw in: it arrived by flying. Back reverses the flight
// before the pop; unmounting mid-flight aborts it. A deep link stages nothing — the rise.
//
// C-9: the pet is the route's pet, named by `loadSignalScreen` through
// `resolveRecordPetName`; `activePet` is never read here.
//
// No haptic anywhere on this screen: it paints `worth_a_call` (the gallery, the phone
// script), and it is named in `guards/haptics.test.ts`'s ALWAYS_SCANNED.

/** *Keep it compact on Home* — the fold control's words on the screen. */
export const KEEP_COMPACT_LABEL = 'Keep it compact on Home';
export const KEEP_COMPACT_HINT = 'Folds this signal to one line on Home. It reopens on its own when the picture changes.';
/** The Why block's title. */
export const WHY_TITLE = 'Why this is a Signal';
/** The phone script's title on a safety screen. */
export const SCRIPT_TITLE = 'If you call your clinic';

interface Props {
  petId: string;
  identity: string;
}

export function SignalScreen({ petId, identity }: Props) {
  const reducedMotion = useReducedMotion();
  const appActive = useAppActive();
  const { width: windowWidth } = useWindowDimensions();
  const [load, setLoad] = useState<{ status: 'loading' } | { status: 'failed' } | SignalScreenLoad>({ status: 'loading' });
  const loadId = useRef(0);

  // The flight, if the card staged one for this finding. `flew` is latched at mount: the
  // chart that flew in never draws in, and only a screen that flew in reverses on Back.
  const flightState = useFlightState();
  const flight = flightActiveFor(flightState, identity) ? flightState.flight : null;
  const [flew] = useState(() => flightActiveFor(flightState, identity));
  useEffect(
    () => () => {
      // Leaving any way but the reverse (the gesture, the fold control's pop, a re-key)
      // abandons the clone — and the lingering record, so a later visit cannot reverse
      // onto a Home that no longer shows this card.
      const s = getFlightState();
      if (s.flight?.identity === identity && s.phase !== 'inbound') abortFlight();
    },
    [identity],
  );

  const run = useCallback(async () => {
    const my = ++loadId.current;
    setLoad({ status: 'loading' });
    try {
      const next = await loadSignalScreen(petId, identity);
      if (loadId.current === my) setLoad(next);
    } catch (e) {
      console.warn('[signal-screen] load failed:', e);
      if (loadId.current === my) setLoad({ status: 'failed' });
    }
  }, [petId, identity]);

  useEffect(() => {
    void run();
  }, [run]);

  const model = load.status === 'ready' ? load.model : null;
  const arrived = model != null;
  const landStyle = useSignalOpen({ arrived, identity, reducedMotion, appActive });

  // VoiceOver focus lands on the title once it exists (§06: a route gives focus for free —
  // this is the one line that says where).
  const titleRef = useRef<View>(null);
  useEffect(() => {
    if (!arrived) return;
    focusAccessibility(titleRef.current);
  }, [arrived, identity]);

  const back = () => {
    // The reverse flight, then the pop: the clone flies home over the fading screen.
    if (flew) reverseFlight(identity);
    router.back();
  };

  return (
    <View style={styles.container} testID="signal-screen">
      <Header title="Signal" leading="back" onLeadingPress={back} />
      {load.status === 'loading' ? (
        flight ? (
          <FlightSkeleton flight={flight} windowWidth={windowWidth} />
        ) : (
          <View style={styles.centered}>
            <WhorlSpinner size="md" ground="day" />
          </View>
        )
      ) : load.status === 'failed' ? (
        <View style={styles.centered}>
          <ThemedText style={styles.stateText}>I couldn't open this signal just now.</ThemedText>
          <Pressable onPress={() => void run()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Try again" style={styles.retry}>
            <ThemedText style={styles.retryText}>Try again</ThemedText>
          </Pressable>
        </View>
      ) : load.status === 'missing' ? (
        <View style={styles.centered} testID="signal-screen-missing">
          <ThemedText style={styles.stateText}>This signal isn't in {load.petName}'s picture any more.</ThemedText>
        </View>
      ) : (
        <Body
          model={load.model}
          petId={petId}
          petName={load.petName}
          landStyle={landStyle}
          titleRef={titleRef}
          onFolded={() => router.back()}
          flight={flight}
          flew={flew}
          windowWidth={windowWidth}
        />
      )}
    </View>
  );
}

/** The landing before the read answers: the Header is above, the title the card handed
 *  over, the slot the clone lands on, the whorl below — never a blank ground under a
 *  chart that has already arrived. */
function FlightSkeleton({ flight, windowWidth }: { flight: FlightRecord; windowWidth: number }) {
  const inner = leadChartWidth(windowWidth);
  const outer = windowWidth - 2 * theme.space2;
  const scale = inner > 0 ? outer / inner : 1;
  const slotRef = useRef<View>(null);
  // A measurement that answers after the skeleton has gone (a fast read) must not land a
  // stale slot over the hero's own rect — the same guard the card's retarget carries.
  const gone = useRef(false);
  useEffect(
    () => () => {
      gone.current = true;
    },
    [],
  );
  const onLayout = () =>
    measureNodeInWindow(slotRef.current, (rect) => {
      if (!gone.current && rect && rect.width > 0 && rect.height > 0) landFlight(flight.identity, rect);
    });
  return (
    <View style={styles.scroll} testID="signal-flight-skeleton">
      <View accessible accessibilityRole="header">
        <ThemedText style={styles.title}>{flight.title}</ThemedText>
      </View>
      <View style={styles.section}>
        <View
          ref={slotRef}
          collapsable={false}
          onLayout={onLayout}
          style={{ width: outer, height: flight.source.height * scale }}
          testID="signal-hero-slot"
        />
      </View>
      <View style={styles.centeredBelow}>
        <WhorlSpinner size="md" ground="day" />
      </View>
    </View>
  );
}

/**
 * The screen's weekly chart: the card's chart LAYOUT (`leadChartWidth`), scaled uniformly
 * to the content column with its origin at the top-left, inside a wrapper that reserves
 * the scaled height — so the flight's clone (laid out at the card's width, scaled by the
 * same ratio) lands on it pixel for pixel, and the two sizes are one aspect by
 * construction. Hidden while a clone is up for this finding; reports its window rect and
 * its existence to the store once laid out. With the flight off, D2-3's native chart.
 */
function Hero({
  model,
  drawIn,
  windowWidth,
  hidden,
  onWindowRect,
}: {
  model: SignalScreenModel;
  drawIn: boolean;
  windowWidth: number;
  hidden: boolean;
  onWindowRect: (rect: WindowRect) => void;
}) {
  const inner = leadChartWidth(windowWidth);
  const outer = windowWidth - 2 * theme.space2;
  const scale = inner > 0 ? outer / inner : 1;
  const [innerHeight, setInnerHeight] = useState<number | null>(null);
  const wrapRef = useRef<View>(null);
  const onInnerLayout = (e: LayoutChangeEvent) => setInnerHeight(e.nativeEvent.layout.height);
  useEffect(() => {
    if (innerHeight == null) return;
    measureNodeInWindow(wrapRef.current, (rect) => {
      if (rect && rect.width > 0 && rect.height > 0) onWindowRect(rect);
    });
    // The rect is reported once per SIZE, never per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [innerHeight]);
  if (!model.weekly || !model.noun) return null;
  if (!FLIGHT_ENABLED) {
    return (
      <View style={styles.section} testID="signal-section-weekly">
        <WeeklyBars model={model.weekly} noun={model.noun} drawIn={drawIn} identity={model.identity} />
      </View>
    );
  }
  return (
    <View
      ref={wrapRef}
      collapsable={false}
      style={[styles.section, { width: outer, height: innerHeight != null ? innerHeight * scale : undefined }, hidden && styles.heroHidden]}
      testID="signal-section-weekly"
    >
      <View onLayout={onInnerLayout} style={{ width: inner, transform: [{ scale }], transformOrigin: 'top left' }} testID="signal-hero">
        <WeeklyBars model={model.weekly} noun={model.noun} drawIn={drawIn} identity={model.identity} />
      </View>
    </View>
  );
}

function Body({
  model,
  petId,
  petName,
  landStyle,
  titleRef,
  onFolded,
  flight,
  flew,
  windowWidth,
}: {
  model: SignalScreenModel;
  petId: string;
  petName: string;
  landStyle: ReturnType<typeof useSignalOpen>;
  titleRef: React.RefObject<View | null>;
  onFolded: () => void;
  flight: FlightRecord | null;
  flew: boolean;
  windowWidth: number;
}) {
  const [folding, setFolding] = useState(false);
  // The hero tells the flight where it is (a retarget if the slot guessed wrong) and that
  // it exists — the release, when the spring has already rested.
  const onHeroRect = useCallback(
    (rect: WindowRect) => {
      landFlight(model.identity, rect);
      setHeroReady(model.identity, true);
    },
    [model.identity],
  );

  // *Keep it compact on Home*: the same entry Home's control writes (`foldedEntry`, with
  // the record's witness for a standing safety type), through the same store, then back
  // to Home — where `useSignalFold` has heard the write (`subscribeFoldStore`) and draws
  // the strip. The strip keeps its own re-open.
  const keepCompact = async () => {
    if (folding) return;
    setFolding(true);
    try {
      const stored = (await readFoldEntries(petId)) ?? {};
      const facts: RecordFacts =
        model.finding.type === 'symptom_chronicity' || model.finding.type === 'symptom_worsening'
          ? { lastEpisodeIso: readLastEpisodeIso(petId, model.finding.symptomType) }
          : {};
      await writeFoldEntries(petId, { ...stored, [model.identity]: foldedEntry(model.finding, new Date().toISOString(), facts) });
    } finally {
      setFolding(false);
      onFolded();
    }
  };

  const drawIn = true;
  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} testID="signal-screen-body">
      {/* 1 · the title */}
      <View ref={titleRef} accessible accessibilityRole="header" testID="signal-screen-title">
        <ThemedText style={styles.title}>{model.title}</ThemedText>
      </View>

      {/* 2 · the weekly bars — the hero. A chart that flew in does not draw in again. */}
      <Hero model={model} drawIn={drawIn && !flew} windowWidth={windowWidth} hidden={flight != null} onWindowRect={onHeroRect} />

      {/* 3 + 4 · the sentence and the compare land together */}
      <Animated.View style={[styles.section, landStyle]} testID="signal-section-sentence">
        <ThemedText style={styles.sentence}>{model.sentence}</ThemedText>
        {model.compare && model.noun ? (
          <View style={styles.compare} testID="signal-section-compare">
            <CompareBars model={model.compare} noun={model.noun} drawIn={drawIn} identity={model.identity} />
          </View>
        ) : null}
      </Animated.View>

      {/* 5 · timed from meals */}
      {model.lanes ? (
        <View style={styles.section} testID="signal-section-lanes">
          <ThemedText style={styles.sectionTitle} accessibilityRole="header">
            Timed from meals
          </ThemedText>
          <TimingLanes lanes={model.lanes.lanes} axis={model.lanes.axis} drawIn={drawIn} identity={model.identity} />
        </View>
      ) : null}

      {/* 6 · the episodes */}
      {model.episodes ? (
        <View style={styles.section} testID="signal-section-episodes">
          <EpisodeGallery episodes={model.episodes} />
        </View>
      ) : null}

      {/* 7 · why this is a Signal */}
      <View style={styles.section} testID="signal-section-why">
        <ThemedText style={styles.sectionTitle} accessibilityRole="header">
          {WHY_TITLE}
        </ThemedText>
        {model.why.map((line, i) => (
          <ThemedText key={i} style={styles.why}>
            {line}
          </ThemedText>
        ))}
      </View>

      {/* The safety phone script — the shipped receipts, the same words, one screen away. */}
      {model.safety ? (
        <View style={styles.section} testID="signal-section-script">
          <ThemedText style={styles.sectionTitle} accessibilityRole="header">
            {SCRIPT_TITLE}
          </ThemedText>
          <ExpandedReceipts finding={model.finding} petName={petName} trialRunning={false} />
        </View>
      ) : null}

      {/* 8 · keep it compact on Home */}
      {model.foldable ? (
        <View style={styles.section} testID="signal-section-fold">
          <Pressable
            onPress={() => void keepCompact()}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={KEEP_COMPACT_LABEL}
            accessibilityHint={KEEP_COMPACT_HINT}
            style={styles.foldControl}
            testID="signal-keep-compact"
          >
            <ThemedText style={styles.foldLabel}>{KEEP_COMPACT_LABEL}</ThemedText>
            <ThemedText style={styles.foldVerb}>Fold</ThemedText>
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}

// The beats, re-exported beside the screen so a reader of this file sees them without
// opening the motion module.
export { SIGNAL_OPEN_MOTION };

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colorNeutralLight,
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
    lineHeight: theme.lineHeightBody,
    color: theme.colorTextSecondary,
    textAlign: 'center',
  },
  retry: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: theme.space2,
  },
  retryText: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorAccentInk,
  },
  scroll: {
    padding: theme.space2,
    paddingBottom: theme.space6,
    gap: theme.space3,
  },
  centeredBelow: {
    alignItems: 'center',
    paddingVertical: theme.space6,
  },
  heroHidden: {
    opacity: 0,
  },
  // The shipped lead sentence's display face, on the title.
  title: {
    fontFamily: theme.fontDisplay,
    fontSize: theme.textSignal,
    lineHeight: theme.lineHeightSignal,
    letterSpacing: theme.trackingTight,
    color: theme.colorTextPrimary,
  },
  section: {
    gap: theme.space1,
  },
  sectionTitle: {
    fontSize: theme.textMD,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    marginBottom: theme.space0_5,
  },
  sentence: {
    fontSize: theme.textMD,
    lineHeight: theme.lineHeightBody,
    color: theme.colorTextPrimary,
  },
  compare: {
    marginTop: theme.space1,
  },
  why: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextSecondary,
  },
  foldControl: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingVertical: theme.space1,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colorBorder,
  },
  foldLabel: {
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
  },
  foldVerb: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorAccentInk,
  },
});
