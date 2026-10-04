import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, View, useWindowDimensions, type LayoutChangeEvent, type Text } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { theme } from '../../../constants/theme';
import { useAppActive } from '../../../hooks/useAppActive';
import { useLiveRegionAnnouncement } from '../../../hooks/useLiveRegionAnnouncement';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { focusAccessibility } from '../../../lib/a11yFocus';
import { measureNodeInWindow, type WindowRect } from '../../../lib/measureNode';
import { CARE_CONTEXT_TITLE } from '../../../lib/careContext';
import { CARE_WATCHED_LINE, CARE_WATCHED_TAG, careStateViewOf } from '../../../lib/careState';
import { ackUpdatingCopy, symptomWord } from '../../../lib/signalCopy';
import { loadSignalScreen, screenLeadsWithLanes, UNSUPPORTED_LINE, withheldLines, type SignalScreenLoad, type SignalScreenModel } from '../../../lib/signalScreen';
import { usePetStore } from '../../../store/petStore';
import { useSyncStore } from '../../../store/syncStore';
import { SignalSilhouette } from '../waits/SignalSilhouette';
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
import { CareAnswers } from './CareAnswers';
import { EpisodeGallery } from './EpisodeGallery';
import { leadChartWidth } from './SignalLeadCard';

// SignalScreen — the Signal's own screen (D2-3 · CUL-1065; design authority
// `docs/culprit-design-v4-mockups.html` §03, the sections in this order):
//
//   1. the title                       `signalTitle` — names the finding's claim (CUL-1270)
//   2. the weekly bars                 every week's count and its logged days
//   3. the count-anchored sentence     the server's phrased sentence, the Change Contract's
//   4. the compare                     two windows, logged days shown, nothing adjudicated
//   5. the lanes                       timed from meals, before / in the trial, the untimed line
//   6. the episodes                    a gallery, each tile its OWN read
//   7. why this is a Signal            counts, not a verdict; the medication inside the window
//
// *Around this* (EN-10, CUL-1421; mock `docs/culprit-engines-v3-mockups.html` §05) sits
// under the sentence it stands beside: the visit, trial and course lines, each a window,
// a count and its logging, relayed verbatim from the server (`careContextLinesOf`). On a
// safety screen it follows the phone script instead, so the ask and the script that says
// how to act on it stay one block (BRK-39). Absent when the finding carries no line —
// `engines_v3_en10` off, or an old cache — and then the screen is exactly what it was.
//
// There is no section 8 any more: *Keep it compact on Home* retired with the Signal fold
// under Design v2 (CUL-1285, PM-ruled 2026-09-26 — every Home card is already a row, and
// a fold had nothing left to compact and no mark on Home to say it had).
//
// A TIMING finding leads with its own evidence (CUL-1270 · D2 = a): the lanes move to
// section 2 and the weekly bars follow the sentence, because minutes-from-a-meal is what
// that finding claims and weeks are what the recurrence claims. Two vomiting findings
// counted the same rows and drew the same first chart, so the PM read their screens as
// one screen twice; the first chart is now the one only that finding has
// (`screenLeadsWithLanes`).
//
// A safety finding gets the screen too (S1 lives on Home's card, not here): the same
// sections over its record, plus the shipped phone script (`ExpandedReceipts`). THE ASK
// COMES FIRST (CUL-1216, BRK-39): the sentence that carries it and the script that says
// how to act on it sit directly under the title, above every chart — they used to trail
// the gallery and the why, under "Compared as counts, not a verdict", which read calm on
// the one screen that must not. A safety screen draws no local compare (the model's rule):
// its one compare is the engine's, in the script.
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
// THE RE-READ (CUL-1219, GC-10): the screen reads again on every focus, `signalTick` (a
// regen landed) and `hydrationTick` (the local record moved), so a removed vomit leaves it
// and an edit reaches it. Only the FIRST read blanks the screen; a re-read swaps the model
// in place, and only when it changed, so the body stays mounted — its scroll, its draw
// (identity-keyed, `useDrawIn`) and its landing (`arrived` never falls back) are never
// re-armed. A failed re-read keeps what is on screen. When an episode leaves, VoiceOver
// focus moves to the gallery header (or the title, if the gallery went with it). While
// the pet's regen runs, Home's "updating" line sits over the sentence.
//
// OFFLINE (GAP-7): the finding comes from the last row this process read when the network
// read fails (`readSignalCacheOrLast`), labelled with when the engine wrote it; everything
// else on the screen is already the phone's own.
//
// C-9: the pet is the route's pet, named by `loadSignalScreen` through
// `resolveRecordPetName`; `activePet` is never read here.
//
// No haptic anywhere on this screen: it paints `worth_a_call` (the gallery, the phone
// script), and it is named in `guards/haptics.test.ts`'s ALWAYS_SCANNED.

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

  // A cold start from a link reads before the pet list has loaded, when the not-eating
  // register cannot answer; the load re-runs once the pets arrive (TS-9 · CUL-1305).
  const petsLoaded = usePetStore((s) => s.pets.length > 0);

  // Ticks that say the record or the Signal moved; each re-reads while the screen is focused.
  const signalTick = useSyncStore((st) => st.signalTick);
  const hydrationTick = useSyncStore((st) => st.hydrationTick);
  const updating = useSyncStore((st) => st.signalAcknowledging[petId] ?? false);

  const loadRef = useRef(load);
  loadRef.current = load;
  const run = useCallback(async () => {
    const my = ++loadId.current;
    // Blank only before an answer: a re-read over a settled screen keeps it up.
    const cur = loadRef.current.status;
    if (cur === 'failed') setLoad({ status: 'loading' });
    try {
      const next = await loadSignalScreen(petId, identity);
      if (loadId.current !== my) return;
      setLoad((prev) => (sameLoad(prev, next) ? prev : next));
    } catch (e) {
      console.warn('[signal-screen] load failed:', e);
      if (loadId.current !== my) return;
      // A failed RE-read keeps what the screen already answered.
      setLoad((prev) => (prev.status === 'loading' || prev.status === 'failed' ? { status: 'failed' } : prev));
    }
  }, [petId, identity, petsLoaded]);

  useFocusEffect(
    useCallback(() => {
      void run();
    }, [run, signalTick, hydrationTick]),
  );

  // A load that settles to anything but a drawn hero abandons a flown-in chart, so a card's
  // clone never stays painted over a withheld, missing or failed answer (TS-9 · CUL-1305),
  // nor over a finding whose screen has no weekly chart to land on (BRK-15, CUL-1219).
  const heroless = load.status === 'ready' && !(load.model.weekly && load.model.noun);
  useEffect(() => {
    if (load.status === 'loading' || (load.status === 'ready' && !heroless)) return;
    const s = getFlightState();
    if (s.flight?.identity === identity) abortFlight();
  }, [load.status, heroless, identity]);

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

  // An episode left (a removal from its record): focus the gallery header, or the title if
  // the gallery went with it — never left on a tile that no longer exists.
  const galleryHeaderRef = useRef<Text>(null);
  const episodeTotal = model?.episodes?.total ?? null;
  const lastTotal = useRef<number | null>(null);
  useEffect(() => {
    const prev = lastTotal.current;
    lastTotal.current = episodeTotal;
    if (prev == null || !arrived) return;
    if (episodeTotal == null) focusAccessibility(titleRef.current);
    else if (episodeTotal < prev) focusAccessibility(galleryHeaderRef.current);
  }, [episodeTotal, arrived]);

  const updatingLine = updating && arrived ? ackUpdatingCopy(load.status === 'ready' ? load.petName : '') : null;
  useLiveRegionAnnouncement(updatingLine);

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
          <SignalSilhouette />
        )
      ) : load.status === 'failed' ? (
        <View style={styles.centered}>
          <ThemedText style={styles.stateText}>I couldn't open this signal just now.</ThemedText>
          <Pressable onPress={() => void run()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Try again" style={styles.retry}>
            <ThemedText style={styles.retryText}>Try again</ThemedText>
          </Pressable>
        </View>
      ) : load.status === 'withheld' ? (
        <View style={styles.centered} testID="signal-screen-withheld">
          {withheldLines(load.petName).map((line, i) => (
            <ThemedText key={i} style={styles.stateText}>{line}</ThemedText>
          ))}
        </View>
      ) : load.status === 'set_aside' ? (
        <View style={styles.centered} testID="signal-screen-set-aside">
          {load.lines.map((line, i) => (
            <ThemedText key={i} style={styles.stateText}>{line}</ThemedText>
          ))}
        </View>
      ) : load.status === 'unsupported' ? (
        <View style={styles.centered} testID="signal-screen-unsupported">
          <ThemedText style={styles.stateText}>{UNSUPPORTED_LINE}</ThemedText>
        </View>
      ) : load.status === 'missing' ? (
        <View style={styles.centered} testID="signal-screen-missing">
          <ThemedText style={styles.stateText}>This signal isn't in {load.petName}'s picture any more.</ThemedText>
        </View>
      ) : (
        <Body
          petId={petId}
          model={load.model}
          petName={load.petName}
          asOfLine={load.asOfLine}
          updatingLine={updatingLine}
          galleryHeaderRef={galleryHeaderRef}
          landStyle={landStyle}
          titleRef={titleRef}
          flight={flight}
          flew={flew}
          windowWidth={windowWidth}
        />
      )}
    </View>
  );
}

/** The landing before the read answers: the Header is above, the title the card handed
 *  over, the slot the clone lands on, the screen's lower silhouette below — never a blank ground under a
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
      <SignalSilhouette withHead={false} />
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
        <WeeklyBars
          model={model.weekly}
          noun={model.noun}
          drawIn={drawIn}
          identity={model.identity}
          masked={model.weeklyMask?.masked}
          maskCaption={model.weeklyMask?.caption ?? null}
        />
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
        <WeeklyBars
          model={model.weekly}
          noun={model.noun}
          drawIn={drawIn}
          identity={model.identity}
          masked={model.weeklyMask?.masked}
          maskCaption={model.weeklyMask?.caption ?? null}
        />
      </View>
    </View>
  );
}

function Body({
  petId,
  model,
  petName,
  asOfLine,
  updatingLine,
  galleryHeaderRef,
  landStyle,
  titleRef,
  flight,
  flew,
  windowWidth,
}: {
  /** The route's pet (C-9): the record's, never the active one. */
  petId: string;
  model: SignalScreenModel;
  petName: string;
  /** The offline line: how old the sentence is, when the network read failed. */
  asOfLine: string | null;
  /** Home's "updating" line, while the pet's regen runs. */
  updatingLine: string | null;
  galleryHeaderRef: React.RefObject<Text | null>;
  landStyle: ReturnType<typeof useSignalOpen>;
  titleRef: React.RefObject<View | null>;
  flight: FlightRecord | null;
  flew: boolean;
  windowWidth: number;
}) {
  // The hero tells the flight where it is (a retarget if the slot guessed wrong) and that
  // it exists — the release, when the spring has already rested.
  const onHeroRect = useCallback(
    (rect: WindowRect) => {
      landFlight(model.identity, rect);
      setHeroReady(model.identity, true);
    },
    [model.identity],
  );

  const drawIn = true;
  const lanesLead = screenLeadsWithLanes(model);
  // EN-9 (PR-35): the concern's care state, as the server wrote it, or null (flag off, an old
  // cache, an escalation). Null draws exactly today's screen.
  const care = careStateViewOf(model.finding);
  const watched = care?.state === 'with_vet' || care?.state === 'recheck_booked';
  const lanesSection = model.lanes ? (
    <View style={styles.section} testID="signal-section-lanes">
      <ThemedText style={styles.sectionTitle} accessibilityRole="header">
        Timed from meals
      </ThemedText>
      <TimingLanes
        lanes={model.lanes.lanes}
        axis={model.lanes.axis}
        drawIn={drawIn}
        identity={model.identity}
        maskCaption={model.lanesMaskCaption}
      />
    </View>
  ) : null;
  const aroundThis =
    model.context.length > 0 ? (
      <View style={styles.section} testID="signal-section-context">
        <ThemedText style={styles.sectionTitle} accessibilityRole="header">
          {CARE_CONTEXT_TITLE}
        </ThemedText>
        {model.context.map((line, i) => (
          <View key={i} style={styles.contextRow} testID="signal-context-line">
            <View style={styles.contextDot} accessibilityElementsHidden importantForAccessibility="no" />
            <ThemedText style={styles.contextText}>{line}</ThemedText>
          </View>
        ))}
      </View>
    ) : null;
  const hero = <Hero model={model} drawIn={drawIn && !flew} windowWidth={windowWidth} hidden={flight != null} onWindowRect={onHeroRect} />;
  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} testID="signal-screen-body">
      {/* 1 · the title */}
      <View ref={titleRef} accessible accessibilityRole="header" testID="signal-screen-title">
        <ThemedText style={styles.title}>{model.title}</ThemedText>
      </View>

      {/* 2 · the finding's own evidence first: the lanes for a timing finding, else the
          weekly bars — the hero. A chart that flew in does not draw in again. On a safety
          finding the ask leads instead (below), and the charts follow it. */}
      {model.safety ? null : lanesLead ? lanesSection : hero}

      {/* 3 + 4 · the sentence and the compare land together */}
      <Animated.View style={[styles.section, landStyle]} testID="signal-section-sentence">
        {updatingLine ? (
          <View style={styles.ackLine} accessibilityLiveRegion="polite" testID="signal-updating-line">
            <View style={styles.ackDot} />
            <ThemedText style={styles.ackText}>{updatingLine}</ThemedText>
          </View>
        ) : null}
        {watched ? (
          <ThemedText style={styles.careTag} testID="signal-care-tag">
            {CARE_WATCHED_TAG}
          </ThemedText>
        ) : null}
        <ThemedText style={styles.sentence}>{model.sentence}</ThemedText>
        {asOfLine ? (
          <ThemedText style={styles.careLine} testID="signal-as-of-line">
            {asOfLine}
          </ThemedText>
        ) : null}
        {care?.state === 'with_vet' ? (
          <ThemedText style={styles.careLine} testID="signal-care-line">
            {CARE_WATCHED_LINE}
          </ThemedText>
        ) : null}
        {/* EN-9's answers (PR-35): only where the server wrote a care state that takes one. */}
        {care ? (
          <CareAnswers
            // Keyed on the state: a state change starts the answers afresh, so a confirmation
            // (and its Undo) given on a raised concern can never stand over one that came back.
            key={care.state}
            petId={petId}
            petName={petName}
            view={care}
            noun={symptomWord(care.sign)}
            title={model.title}
            onsetIso={model.finding.type === 'symptom_chronicity' ? model.finding.firstOnsetIso : null}
          />
        ) : null}
        {model.compare && model.noun ? (
          <View style={styles.compare} testID="signal-section-compare">
            {/* The compare draws on its own landing (CUL-1223): it sits inside the view
                `useSignalOpen` holds at opacity 0 until 200ms. */}
            <CompareBars
              model={model.compare}
              noun={model.noun}
              drawIn={drawIn}
              identity={model.identity}
              drawDelayMs={SIGNAL_OPEN_MOTION.landDelayMs}
              masked={model.compareMask?.masked}
              maskCaption={model.compareMask?.caption ?? null}
            />
          </View>
        ) : null}
      </Animated.View>

      {/* EN-10 · around this — directly under the sentence on an insight screen */}
      {model.safety ? null : aroundThis}

      {/* The safety phone script — the shipped receipts, the same words, one screen away —
          straight under the sentence that carries the ask (BRK-39). */}
      {model.safety ? (
        <View style={styles.section} testID="signal-section-script">
          <ThemedText style={styles.sectionTitle} accessibilityRole="header">
            {SCRIPT_TITLE}
          </ThemedText>
          <ExpandedReceipts
            finding={model.finding}
            petName={petName}
            trialRunning={false}
            withholdFallingVomit={model.withholdFallingVomit}
            masking={model.scriptMasking}
          />
        </View>
      ) : null}

      {/* EN-10 · around this — on a safety screen, after the ask and its script */}
      {model.safety ? aroundThis : null}

      {/* On a safety finding the charts come after the ask, in their usual order. */}
      {model.safety ? (lanesLead ? lanesSection : hero) : null}

      {/* 5 · timed from meals — or, on a timing finding, the weekly bars below the sentence */}
      {lanesLead ? hero : lanesSection}

      {/* 6 · the episodes */}
      {model.episodes ? (
        <View style={styles.section} testID="signal-section-episodes">
          <EpisodeGallery episodes={model.episodes} headerRef={galleryHeaderRef} />
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
    </ScrollView>
  );
}

/** Two loads that would draw the same screen (CUL-1219): a re-read swaps only on change. */
function sameLoad(a: { status: string }, b: { status: string }): boolean {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
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
  // "Your vet knows" (D6): a word tag, never colour alone (§7).
  careTag: {
    alignSelf: 'flex-start',
    marginBottom: theme.space1,
    fontSize: theme.textXS,
    lineHeight: theme.lineHeightXS,
    fontWeight: theme.weightMedium,
    letterSpacing: theme.trackingWide,
    textTransform: 'uppercase',
    color: theme.colorEventSymptomInk,
  },
  careLine: {
    marginTop: theme.space1,
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextSecondary,
  },
  compare: {
    marginTop: theme.space1,
  },
  // Home's acknowledgment line (SignalZone's AckLine), the same dot and register.
  ackLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
    marginBottom: theme.space1,
  },
  ackDot: {
    width: theme.space1,
    height: theme.space1,
    borderRadius: theme.space1,
    backgroundColor: theme.colorAccent,
  },
  ackText: {
    fontSize: theme.textXS,
    lineHeight: theme.lineHeightXS,
    color: theme.colorAccentInk,
  },
  contextRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.space1,
  },
  // The mock's bullet: a small neutral dot, never a category colour (a line is not a sign).
  contextDot: {
    width: theme.space0_5,
    height: theme.space0_5,
    borderRadius: theme.space0_5,
    backgroundColor: theme.colorTextSecondary,
    marginTop: theme.space1,
  },
  contextText: {
    flex: 1,
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextSecondary,
  },
  why: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextSecondary,
  },
});
