import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { theme } from '../../constants/theme';
import { Card } from '../ui/Card';
import { Divider } from '../ui/Divider';
import { SectionLabel } from '../ui/SectionLabel';
import { RAIL_WIDTH } from './InsightCard';
import { useSignal } from '../../hooks/useSignal';
import { signalSaysNotEating, visibleFindings } from '../../lib/signalVisible';
import type { SignalTrialAnchor } from '../../lib/signalTrialAnchor';
import { signalTrialWindowOf } from '../../lib/signalScreen';
import type { TrialCardTrial } from '../../lib/dietTrialCard';
import { hasSignalTitleRule } from '../../lib/signalTitle';
import { useGapWarning } from '../../hooks/useGapWarning';
import { usePetStore } from '../../store/petStore';
import { useSyncStore } from '../../store/syncStore';
import { useFloorOn } from '../../hooks/useFloorOn';
import { lookSpeciesOf } from '../../constants/lookWords';
import { signalDoorLabel, type EmergencyRead } from '../../lib/lookEmergency';
import { loadEmergencyRead } from '../../lib/emergencyDoorRead';
import { reportHref } from '../../lib/reportRoute';
import { LookEmergencySheet } from './LookEmergencySheet';
import { useWarningArrival } from '../motion/warningArrivalMotion';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useAppActive } from '../../hooks/useAppActive';
import { hasPlayedArrival, markArrivalPlayed } from '../../lib/signalArrival';
import { safetyArrivalSpoken, safetySpeechIdentity, speakableSafety } from '../../lib/signalSafetySpeech';
import { announceQueued, useRowSpeech } from '../dayRow/rowSpeech';
// CUL-601 §4's arrival tap, and the codebase's only exemption from the D7 scan. This
// file IS a safety surface, and the silence-on-safety rule is intact here BY GATE
// rather than by intention: the arrival is unreachable whenever the finding set
// contains a safety finding — that card appears plainly and instantly instead — so the
// verb below cannot fire on the severity path. Held by a test, not by this comment
// ("a safety-led first arrival plays no haptic"). Placing the beat in an unscanned
// helper file would have avoided the exemption and defeated its purpose; §4 asks for
// the moment to be SignalZone-local, and an argued exemption is what that costs.
// haptics-guard-ok: arrival tap, gated off whenever any finding is safety-class
import { insightArrival } from '../../lib/haptics';
// D2-3 (CUL-1065, Design v2; GA by CUL-1071): the namespace the drawing lives in.
import { SignalLeadCard } from '../../components/designV2/signal/SignalLeadCard';
import { SignalRow } from '../../components/designV2/signal/SignalRow';
import { leadTakesChartCard } from '../../lib/signalWindows';
import { SignalZoneFoot, type SignalVetDoor } from '../../components/designV2/signal/SignalZoneFoot';
import { signalScreenHref } from '../../lib/signalRoute';
import { foldIdentity, sharedFoldIdentities } from '../../lib/signalFold';
import { Skeleton } from '../ui/Skeleton';
import { ThemedText } from '../ui/ThemedText';
import {
  NO_PATTERN_HEADLINE,
  NO_PATTERN_SUB,
  QUIET_GONE_QUIET_SUB,
  QUIET_TOO_EARLY_HEADER,
  ackUpdatingCopy,
  arrivalAnnouncementCopy,
  deriveDisplayState,
  isStoodDown,
  quietDayLabel,
  quietGoneQuietHeader,
  quietTooEarlySub,
} from '../../lib/signalCopy';
import type { CachedFinding, SignalFinding } from '../../lib/signal';
import type { DisplayState } from '../../lib/signalCopy';

// B-734 (adversarial ④) — the skeleton's time-box. The window it covers is a normally-
// fast network read, but nothing bounds that read, so the skeleton bounds itself: past
// this, the zone falls through to the honestly-derived state and re-enables the gap
// warning's read. Sized to cover a slow-but-alive fetch without ever reading as a hung screen.
const SIGNAL_LOAD_SKELETON_MS = 1500;

// ── CUL-601 (§4, DP-3) — the first-insight arrival moment ────────────────────────
//
// THE ONE ANIMATION THE DESIGN PRINCIPLES ASK FOR. §3's rule is that app chrome never
// loops; §4 is its single sanctioned exception, and the exception is bounded by being
// once per pet, ever. Everything below exists to keep that bound honest.
//
// The sequence, from §4 verbatim (~1.2s):
//   0ms     the card is live (React has already swapped the frame)
//   250ms   the wash begins — teal into a breath of moment-gold, left-to-right,
//           900ms, ease-out
//   400ms   the building rows dissolve as the first headline crossfades in (→900ms)
//   900ms   one soft tap (never the success pattern, CUL-647)
//   1200ms  the rest of the stack settles
//
// TWO PLACES THIS READS THE SHIPPED ANATOMY RATHER THAN THE MOCK'S, both deliberate:
//   • §4's "the rail turns live" describes the mock's card-edge rail. The shipped card
//     has none (the rails here are on the BUILDING state's watching rows), and §4 also
//     says "no new anatomy" — so 0ms is simply the frame swap, and nothing is added.
//   • §4's 1200ms beat is the lead card's sub-line, which lives INSIDE InsightCard.
//     Staggering it would mean threading an arrival-only opacity prop through a shared
//     safety renderer for a once-ever 1.2s beat; the beat lands on the stack's
//     secondary rows instead, which is the same staged settle one layer out.
const ARRIVAL = {
  washDelayMs: 250,
  washDurationMs: 900,
  crossfadeDelayMs: 400,
  crossfadeDurationMs: 500,
  hapticAtMs: 900,
  tailDelayMs: 900,
  tailDurationMs: 300,
} as const;

// The gradient's stops, echoing the round-1 mock's `linear-gradient(112deg, …)`: the
// card's own paper at both edges so the band's arrival and departure are seamless
// (the `Skeleton` sweep's rule), teal then a narrower breath of gold between them.
const ARRIVAL_WASH_COLORS = [
  theme.colorSurface,
  theme.colorAccentLight,
  theme.colorMomentGlowLight,
  theme.colorSurface,
] as const;
const ARRIVAL_WASH_LOCATIONS = [0, 0.42, 0.68, 1] as const;

/** What the zone needs to drive one arrival, or null when none is playing. */
interface ArrivalMoment {
  /** Drives the wash band's translateX, 0 → 1. Absent under reduced motion. */
  sweep: Animated.Value | null;
  /** 0 → 1 across 400–900ms: the live lead's opacity, and 1-x the outgoing frame's. */
  crossfade: Animated.Value;
  /** 0 → 1 across 900–1200ms: the stack's secondary rows. */
  tail: Animated.Value;
}

/**
 * The arrival's whole state machine, kept local to this file per §4's build shape
 * ("SignalZone-local Animated values… no new component"). A hook rather than inline
 * code only so the zone's own render stays readable — it has no other caller and is
 * not exported.
 *
 * THE TRIGGER IS AN OBSERVED TRANSITION, NOT A STATE. `settledState` going
 * building → live for ONE pet, while this zone is mounted, is the arrival. A cold
 * mount that is already live is not: nothing arrived, the owner just opened the app.
 * That reading is why `settledState` is null while the cache read is in flight —
 * otherwise a slow or offline first read (the B-734 skeleton timing out into a real
 * building frame) would fire the moment on network latency rather than on an insight,
 * and the one animation the app is allowed would be the least deterministic thing in it.
 *
 * ONE EFFECT, LATCHED ON A REF — and the shape is load-bearing, not stylistic. The
 * obvious build (raise an `arrivalDue` state, decide in a second effect) fails in a way
 * only a test catches: that second effect must clear its own trigger, which is in its
 * own dependency list, so React tears it down one tick after it starts — cancelling the
 * animation and clearing the 900ms haptic timer it just set. So the decision runs inside
 * the transition effect, the "already spent" latch is a ref rather than state, and
 * nothing this effect writes can re-enter it.
 */
function useArrivalMoment({
  petId,
  petName,
  settledState,
  findingCount,
  withheld,
}: {
  petId: string | null;
  petName: string;
  settledState: DisplayState | null;
  findingCount: number;
  /** Any safety finding, or any gap warning (CUL-1937): the moment is spent, never drawn. */
  withheld: boolean;
}): { playing: boolean; moment: ArrivalMoment | null } {
  const reducedMotion = useReducedMotion();
  const appActive = useAppActive();
  const [playing, setPlaying] = useState(false);

  const sweep = useRef(new Animated.Value(0)).current;
  const crossfade = useRef(new Animated.Value(0)).current;
  const tail = useRef(new Animated.Value(0)).current;

  // The in-flight moment, so blur / unmount / a pet switch can end it without the
  // transition effect owning a cleanup that would also fire on every unrelated re-run
  // (a findings refresh mid-arrival would otherwise stop the sweep halfway).
  const run = useRef<{
    seq: Animated.CompositeAnimation | null;
    timer: ReturnType<typeof setTimeout> | null;
  }>({ seq: null, timer: null });

  // The pets whose moment has already been handled in this mount. A ref, not state: it
  // must be readable and writable in the same tick the decision is made, and it must not
  // re-enter the effect that sets it. A SET rather than one slot (code-reviewer): with a
  // single slot, two pets' in-flight marker reads claim the same latch, so a fast
  // A → B → A switch could let a second check start for a pet already being handled.
  // The `activePet` guard below stops that from ever writing the wrong pet's marker, so
  // the single slot was never a correctness hole — a set just makes the dedupe say what
  // it means, for the cost of one allocation.
  const spentFor = useRef<Set<string>>(new Set());

  // Read at the instant an arrival starts rather than closed over per render, so these
  // stay out of the transition effect's dependency list.
  const safety = useRef(withheld);
  safety.current = withheld;
  const reduced = useRef(reducedMotion);
  reduced.current = reducedMotion;
  const activePet = useRef(petId);
  activePet.current = petId;
  // CUL-636's announcement names a pet, so the name joins the read-at-start refs rather
  // than the dependency list: a rename must not re-run the transition effect, and the
  // name spoken belongs to the pet whose moment this is.
  const name = useRef(petName);
  name.current = petName;

  // The last SETTLED state, with the pet it belonged to. Pairing the two is what stops
  // a pet switch reading as a transition: leaving pet A mid-build and landing on pet B
  // whose insight is already cached is two different pets' states, not an arrival.
  const prevSettled = useRef<{ petId: string | null; state: DisplayState | null }>({
    petId: null,
    state: null,
  });

  /** Stop the moment. `settle` jumps every value to its end state. */
  const halt = useCallback(
    (settle: boolean) => {
      run.current.seq?.stop();
      run.current.seq = null;
      if (run.current.timer) {
        clearTimeout(run.current.timer);
        run.current.timer = null;
      }
      sweep.stopAnimation();
      crossfade.stopAnimation();
      tail.stopAnimation();
      if (settle) {
        sweep.setValue(1);
        crossfade.setValue(1);
        tail.setValue(1);
      }
    },
    [sweep, crossfade, tail],
  );

  useEffect(() => {
    const prev = prevSettled.current;
    if (settledState !== null) prevSettled.current = { petId, state: settledState };
    if (!petId || prev.petId !== petId) return;
    if (prev.state !== 'building' || settledState !== 'live' || findingCount === 0) return;
    if (spentFor.current.has(petId)) return;
    spentFor.current.add(petId);

    (async () => {
      // A read FAILURE resolves to "played". lib/signalArrival answers the storage
      // question honestly (absent ⇒ false), but the product question is different: a
      // device whose AsyncStorage is broken would answer "never played" on every
      // transition and replay the sweep forever — which is precisely the looping chrome
      // §3 bans. One missed moment is the cheaper failure.
      let alreadyPlayed = true;
      try {
        alreadyPlayed = await hasPlayedArrival(petId);
      } catch {
        alreadyPlayed = true;
      }
      // The owner switched pets while the marker was being read: this arrival belongs
      // to a card that is no longer on screen. Release the latch so the pet can still
      // have its moment later.
      if (activePet.current !== petId) {
        spentFor.current.delete(petId);
        return;
      }
      if (alreadyPlayed) return;

      // Spend it — INCLUDING on the withheld path below, which draws nothing (§4). A pet
      // whose first-ever finding is a concern has spent its moment — a safety finding, or
      // the gap warning (CUL-1937: "gaps between vomits are getting shorter" is a concern
      // in everything but its class). The alternative saves the celebration for the one
      // owner whose record opened badly.
      void markArrivalPlayed(petId);
      if (safety.current) return;

      setPlaying(true);
      sweep.setValue(0);
      crossfade.setValue(0);
      tail.setValue(0);

      const steps: Animated.CompositeAnimation[] = [
        Animated.timing(crossfade, {
          toValue: 1,
          delay: ARRIVAL.crossfadeDelayMs,
          duration: ARRIVAL.crossfadeDurationMs,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(tail, {
          toValue: 1,
          delay: ARRIVAL.tailDelayMs,
          duration: ARRIVAL.tailDurationMs,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ];
      // Reduced motion keeps the crossfade and drops the sweep — §4's static frame. A
      // cross-dissolve is the platform's own substitute for movement; a band travelling
      // across the card is the movement itself.
      if (!reduced.current) {
        steps.push(
          Animated.timing(sweep, {
            toValue: 1,
            delay: ARRIVAL.washDelayMs,
            duration: ARRIVAL.washDurationMs,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        );
      }

      // The tap runs on its own timer rather than off an animation callback, so it lands
      // at 900ms whether or not the sweep is drawn — §4: under reduced motion the haptic
      // still fires, because touch is not motion. The same is true of speech, so the
      // announcement below rides this beat too.
      // Pinned HERE on purpose — three lines below the `activePet.current !== petId`
      // guard, which is the only point in this function where the active pet has just
      // been verified against the pet whose marker is being spent. Reading `name.current`
      // fresh inside the timer instead would re-open the window that guard closes: the
      // refs are written during render while the pet-switch halt runs in an effect, so a
      // fire landing between the two would speak the NEW pet's name over the OLD pet's
      // moment (the CUL-574 wrong-pet class). A stale name after a mid-moment rename is
      // the opposite trade — cosmetic, and the card corrects it on the next frame.
      const arrivedFor = name.current;
      run.current.timer = setTimeout(() => {
        run.current.timer = null;
        insightArrival();
        // CUL-636 — THE TAP GETS ITS SENTENCE. Without this the moment is, for a blind
        // owner, one unexplained buzz: everything that says "something
        // arrived" is in pixels. Three reasons it lives on this timer rather than in an
        // effect keyed on `playing`:
        //   • It inherits every gate the moment already has — safety-class, marker-once,
        //     empty-set, latency, pet-switch — instead of minting a second predicate that
        //     could drift from the first (the one-predicate rule).
        //   • `halt()` clears this timer, so an arrival cut short by a pet switch, an
        //     unmount, or a blur goes quiet on BOTH channels, with no separate guard. A
        //     0ms announcement would need its own `appActive` check to match.
        //   • It is the same instant as the tap, so the moment reads as one beat rather
        //     than two — which is the defect this closes, stated positively.
        // An earlier draft of this comment gave a third reason: that 900ms avoids
        // competing with "the screen-change notification the frame swap posts". THERE IS
        // NO SUCH NOTIFICATION — checked, because leaning on a surface without verifying
        // it does the thing is how a premise nobody owns ends up load-bearing. RN posts
        // an a11y notification from exactly four places on iOS, and none is a content
        // re-render: `RCTModalHostViewComponentView.mm` (ScreenChanged, on modal
        // presentation), `RCTMountingManager.mm` + `RCTAccessibilityManager.mm`
        // (LayoutChanged, both from an explicit `setAccessibilityFocus`), and
        // `RCTViewManager.m` (LayoutChanged, on an `accessibilityState` prop write).
        // Whether the utterance actually lands is a DEVICE question, not a timing one:
        // an announcement posted while VoiceOver is mid-sentence can be queued or
        // dropped, and this line is the moment's only carrier. That reliability limit is
        // the strongest argument for CUL-638's rendered line, and it is recorded there.
        // BOTH PLATFORMS, deliberately — and this is where it parts from the two announce
        // sites above it. `AckLine` and `TextField` gate to `Platform.OS === 'ios'`
        // because each pairs with an `accessibilityLiveRegion` node that already covers
        // Android; announcing there too would double-speak. The arrival has no such node,
        // so an iOS gate copied from them would ship this exact defect on Android. The
        // call is a no-op when no screen reader is running, so the cost of being right on
        // both is nil. Do not "restore" the platform check.
        AccessibilityInfo.announceForAccessibility(arrivalAnnouncementCopy(arrivedFor));
      }, ARRIVAL.hapticAtMs);

      const seq = Animated.parallel(steps);
      run.current.seq = seq;
      seq.start(() => {
        if (run.current.seq === seq) run.current.seq = null;
        setPlaying(false);
      });
    })();
  }, [petId, settledState, findingCount, sweep, crossfade, tail]);

  // Pause-on-blur, resolved as FINISH-on-blur (the loading-system convention adapted to
  // a one-shot). An ambient loop pauses because it will still be wanted when the owner
  // returns; a moment will not — resuming a 1.2s celebration minutes later, attached to
  // nothing, is worse than having missed it. So a backgrounded arrival completes.
  useEffect(() => {
    if (playing && !appActive) {
      halt(true);
      setPlaying(false);
    }
  }, [playing, appActive, halt]);

  // A pet switch ends the moment: it belonged to the card that just went away. Halting
  // alone is NOT enough — leaving `playing` true would keep the wash mounted at whatever
  // value the sweep had reached, so the owner arrives on the new pet's card to find a
  // frozen band of light parked across it with nothing to finish it. Clear the flag too.
  const lastPet = useRef(petId);
  useEffect(() => {
    if (lastPet.current === petId) return;
    lastPet.current = petId;
    halt(false);
    setPlaying(false);
  }, [petId, halt]);

  // Unmount only — `halt` is stable, so this cleanup does not re-run on a pet change
  // (which the effect above owns). No `setPlaying` here: there is nothing left to render.
  useEffect(() => {
    return () => halt(false);
  }, [halt]);

  return {
    playing,
    moment: playing ? { sweep: reducedMotion ? null : sweep, crossfade, tail } : null,
  };
}

/**
 * GAP-13 (CUL-1566; PMD-21 ruled (a)) — a safety finding that ARRIVES while Home is in front
 * is spoken once, queued behind whatever VoiceOver is reading. It is the safety path's
 * counterpart to the arrival's sentence: `useArrivalMoment` returns before its tap and its
 * `arrivalAnnouncementCopy` on a safety finding (CUL-601 §4, rightly: no celebration over a
 * concern), and this says the concern itself instead, with no haptic (C-16: the one haptic
 * exemption in this file stays gated off the safety path, and this adds no verb).
 *
 * WHAT COUNTS AS AN ARRIVAL. Per pet, `held` is the set of safety identities the owner has
 * either already been told about or found standing when Home first read the record. The
 * first set the cache read answers for a pet seeds it and says nothing: a concern already in
 * the record when Home opened is simply there, on the card and in its label. After that, a
 * safety identity in an answered set and not in `held` is an arrival.
 *  • An arrival is spoken only when Home may speak (`useRowSpeech().mayAnnounce`: focused,
 *    app in front). One that lands while it may not is NOT consumed: it waits, and is said
 *    once when Home is next in front with the finding still standing. In production the read
 *    itself only lands on a focused Home (`useSignal` re-reads on focus and cancels on blur),
 *    so the usual path is: log on another screen, come back, the regen lands, it is spoken.
 *    `appActive` is a dependency so a set that landed while the app was in the background is
 *    said on return to the foreground.
 *  • An identity that leaves an answered set leaves `held` (adversarial pass: an only-growing
 *    set made a cat's intake decline that cleared and fired again silent for the life of the
 *    process). A concern that comes back is a new arrival, and so is a quieted concern raised
 *    again, since `speakableSafety` drops a quieted one from the set.
 *  • It reads the set the stack RENDERS (`visibleFindings`, the caller's), so it never speaks
 *    a finding the owner cannot find on the card (G5 parity).
 *
 * SCOPE, stated so it is not read as coverage: an escalation INSIDE one identity is not an
 * arrival. A concern whose ask firms up (chronicity "a word with your vet" → "booking a
 * visit"), an intake decline whose day count grows, a second red-flag photo of the same
 * incident type while the first still stands: each keeps its identity and is not re-spoken.
 * The spoken sentence is the server's (`cached.text`); under Design v2 a counted row may show
 * a count re-composed from a fresher local record, so the spoken number can trail the row's
 * (never above it, never softer). Both are filed as follow-up, not built here.
 *
 * No live region: `announceQueued` is the one carrier on both platforms, so nothing else
 * speaks it and C-44 has no pair to make. With no RowSpeech provider the zone says nothing.
 */
function useSafetyArrivalSpeech({
  petId,
  petName,
  answered,
  rendered,
}: {
  petId: string | null;
  petName: string;
  answered: boolean;
  /** The findings the stack renders, in the caller's `visibleFindings` order. */
  rendered: CachedFinding[];
}): void {
  const speech = useRowSpeech();
  const appActive = useAppActive();
  const held = useRef<{ petId: string | null; ids: Set<string> | null }>({ petId: null, ids: null });
  useEffect(() => {
    if (held.current.petId !== petId) held.current = { petId, ids: null };
    // C-12: only a set the read actually answered is a baseline or an arrival.
    if (!petId || !answered) return;
    const safety = speakableSafety(rendered);
    const present = new Set(safety.map(safetySpeechIdentity));
    const prior = held.current.ids;
    if (prior === null) {
      held.current.ids = present;
      return;
    }
    // Forget what has left the set, so a concern that comes back arrives again.
    const ids = new Set([...prior].filter((id) => present.has(id)));
    held.current.ids = ids;
    const arriving = safety.filter((f) => !ids.has(safetySpeechIdentity(f)));
    if (arriving.length === 0) return;
    // Not in front: leave the arrival unconsumed, to be said when Home is.
    if (!appActive || !speech.mayAnnounce()) return;
    for (const f of arriving) ids.add(safetySpeechIdentity(f));
    const spoken = safetyArrivalSpoken(petName, arriving, Date.now());
    if (spoken) announceQueued(spoken);
  }, [petId, petName, answered, rendered, speech, appActive]);
}

/**
 * The wash — one gradient band the width of the card, travelling left to right BEHIND
 * the content (it is the Card's first child, so every sibling paints over it). Painting
 * it behind rather than over is what keeps a celebration from dimming a word of the
 * insight it is celebrating.
 *
 * Measures itself: the band's travel is expressed in the card's own width, which is not
 * known until layout. Until then the band is not rendered — the sweep's 250ms delay
 * covers the one frame this costs.
 */
function ArrivalWash({ sweep }: { sweep: Animated.Value }) {
  const [width, setWidth] = useState(0);
  const translateX = sweep.interpolate({
    inputRange: [0, 1],
    outputRange: [-width, width],
  });
  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      testID="signal-arrival-wash"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {width > 0 ? (
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX }] }]}>
          <LinearGradient
            colors={[...ARRIVAL_WASH_COLORS]}
            locations={[...ARRIVAL_WASH_LOCATIONS]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0.35 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

/**
 * The crossfade stage — mounted only for the moment's 1.2s.
 *
 * The outgoing building frame is held over the live stack and dissolved out of it (§4:
 * "the building rows dissolve as the first headline crossfades in"). The two share ONE
 * `crossfade` value read from opposite ends, so they cannot drift apart into a gap or an
 * overlap the way two timings that must agree eventually do.
 *
 * `overflow: hidden` sizes the stage to the LIVE content and clips the outgoing frame,
 * which is usually the taller of the two (E1 carries a headline, a sub, three watching
 * rows and a floor line). Clipping is the lesser evil: unclipped, that frame would fade
 * out across the Trial strip and the Today zone below the card.
 */
function ArrivalStage({
  moment,
  outgoingFrame,
  stack,
  active,
}: {
  moment: ArrivalMoment | null;
  outgoingFrame: ReactNode;
  stack: ReactNode;
  /**
   * The stage stays mounted on every render and switches (CUL-1223, BRK-49): swapping
   * `<ArrivalStage>` for a bare `<LiveStack>` at the moment's edges changed the component
   * in that slot, so every card remounted — the lead three times, each at its skeleton —
   * and VoiceOver's focus was reset under "first pattern is ready". Inactive, the stage
   * clips nothing and blocks no tap.
   */
  active: boolean;
}) {
  return (
    <View
      style={active ? styles.arrivalStage : undefined}
      // The lead sits at opacity 0 for the crossfade's first 400ms, beneath a still-
      // opaque outgoing frame — so without this, a tap on what LOOKS like a ghost
      // watching row lands on the invisible card underneath and opens it. The
      // card is inert for the moment; a tap that does nothing beats a tap that does
      // something the owner cannot see they asked for.
      pointerEvents={active ? 'none' : 'auto'}
    >
      {stack}
      {outgoingFrame ? (
        <Animated.View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            StyleSheet.absoluteFill,
            {
              opacity: moment
                ? moment.crossfade.interpolate({ inputRange: [0, 1], outputRange: [1, 0] })
                : 0,
            },
          ]}
        >
          {outgoingFrame}
        </Animated.View>
      ) : null}
    </View>
  );
}

interface SignalZoneProps {
  // B-789 (§5.2) — drop every FALLING VOMIT PAIR (`isFallingVomitPair`: the trial_response
  // `fewer` card and, since CUL-1216, a falling vomit reflection) when the active pet's record
  // carries a NOT-EATING concern (a live intake decline or a diet refusal), or its facts have not
  // answered yet (Home fails closed). The lead card's week line and a vomit chronicity
  // card's compare read it too. The card fires
  // from the server `trial_response` finding, which is blind to the refusal — the day-1
  // diet-refusal cat has uniform-low intake, so the relative-decline detector never fires
  // and no safety card leads, yet a reassuring "0 vomiting · was 20" would render over a
  // starving cat (the B-494 anorexic-cat case). Home computes this from the SAME `trialInput`
  // the strip withholds its vomit line on (`isAnimalNotEating`), so the card and the strip
  // can never disagree. Default false: every non-Home caller is unaffected.
  withholdFallingVomit?: boolean;
  // CUL-1360 — the pet's trial row and the clock it was read on, with the pet it was read
  // for. Home hands over the SAME `trialInput` as the two props above, and only once those
  // facts are confirmed for the active pet; the zone windows it (`signalTrialWindowOf`, the
  // one builder every Signal surface titles with). With the cache's `generated_at` it is the
  // anchor that tells a trial finding counted over THIS trial from one counted over a trial
  // since replaced (`lib/signalTrialAnchor.ts`): the stack drops the older trial's falling
  // pair (it would be titled with the new trial), and the rows title a rising one by its own
  // day. A report for another pet, or none, anchors nothing.
  signalTrial?: { petId: string; trial: TrialCardTrial | null; nowMs: number } | null;
  // CUL-1838 — the trial's own refusal register, for the vet door's read: the same value
  // Home hands the daily look's door (`TodayCard` → `LookHeader`), so the two doors over one
  // sheet read one record. Only `=== true` counts (T-20).
  trialNotEating?: boolean | null;
}

export function SignalZone({
  withholdFallingVomit = false,
  signalTrial = null,
  trialNotEating = null,
}: SignalZoneProps = {}) {
  const {
    petId,
    findings,
    petName,
    isLoading,
    eventCount,
    hasRecentActivity,
    hasSubstantialHistory,
    lastLoggedAt,
    lookSinceLastLogged,
    acknowledging,
    generatedAt,
    answered,
  } = useSignal();
  const { activePet } = usePetStore();
  const species = activePet?.id === petId ? lookSpeciesOf(activePet?.species) : null;

  // D2-3 (CUL-1065) — Design v2: the lead insight card becomes a title + chart + line, and
  // every other card a ROW — headline, ask, chevron (CUL-1270 · D1 = B) — each a DOOR to its
  // own finding's screen. The door is keyed on the finding's identity and THIS zone's pet
  // (C-9) — `useSignal` pairs the two by construction.
  const openSignal = useCallback(
    (finding: SignalFinding) => {
      if (!petId) return;
      router.push(signalScreenHref(petId, foldIdentity(finding)));
    },
    [petId],
  );

  // ── What the zone can DRAW, and the state it derives from that (CUL-1838) ──────────
  // The state is derived over the findings this zone will actually draw, never the cache's
  // raw set: a finding Home has no title for (`gap_shortening`, CUL-1218) or one a safety
  // gate suppresses (B-789's falling pair over a not-eating cat) used to make the set read
  // `live` over an EMPTY stack — and `live` switched the gap warning off, so a lone server
  // gap finding blanked the very card that should have carried it (CUL-1941). Now an
  // undrawable set falls through to the quiet line, and the gap warning takes the card.
  const trialAnchor: SignalTrialAnchor | null =
    signalTrial && petId && signalTrial.petId === petId
      ? { generatedAt, trial: signalTrial.trial ? signalTrialWindowOf(signalTrial.trial, signalTrial.nowMs) : null }
      : null;
  // A fresh array each render, so the speech effect below re-checks on every render; its work
  // is a set difference over a handful of findings.
  const rendered = visibleFindings(findings, withholdFallingVomit, Date.now(), trialAnchor);
  const drawn = rendered.filter((f) => hasSignalTitleRule(f.finding));
  // A SAFETY finding is never routed to the quiet line, titled or not (adversarial pass, PR-21):
  // the server can carry a safety type this build has no row for (`weight_loss`, dark behind
  // engines_v3_en8), and "No pattern right now" over it would assert the opposite of what the
  // record holds. It keeps `live` — the shipped behaviour for an untitled set — never the quiet line.
  const holdsLive = drawn.length + rendered.filter((f) => f.finding.priorityClass === 'safety' && !hasSignalTitleRule(f.finding)).length;
  const displayState = deriveDisplayState(holdsLive, eventCount, hasRecentActivity, hasSubstantialHistory);

  // While the first cache read is in flight, hold a content-shaped skeleton rather than
  // flash a quiet line over a pet whose findings are about to land. B-734 (CUL-72): TIME-
  // BOXED (adversarial ④) — the read it covers has no timeout of its own, so past
  // SIGNAL_LOAD_SKELETON_MS the zone falls through to the derived state (honest, and it
  // un-suppresses the escalate-only gap warning).
  const loading = isLoading && findings.length === 0;
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  useEffect(() => {
    if (!loading) {
      setLoadTimedOut(false);
      return;
    }
    const t = setTimeout(() => setLoadTimedOut(true), SIGNAL_LOAD_SKELETON_MS);
    return () => clearTimeout(t);
  }, [loading]);
  const showSkeleton = loading && !loadTimedOut;
  const state: DisplayState = loading ? 'building' : displayState;

  // ── The gap warning (CUL-1468, CUL-1838) ───────────────────────────────────────
  // Read in EVERY state but the skeleton: the quiet states draw it as the whole card, and
  // `live` draws it under the stack, because Home has no row for the server's own gap
  // finding (CUL-1218) and the stack would otherwise drop it (CUL-1941's second shape). When
  // the server holds a gap finding the client read does not reproduce (its clock is the
  // wall, ours is logged time, so this should not happen), its own template sentence is
  // drawn: an escalate-only fact is never dropped for a disagreement about recency.
  const {
    text: gapText,
    answered: gapAnswered,
    failed: gapReadFailed,
    retry: retryGapRead,
  } = useGapWarning(!showSkeleton);
  const serverGap = findings.find((f) => (f.finding as { type: string }).type === 'gap_shortening') ?? null;
  const gapSentence = showSkeleton ? null : (gapText ?? serverGap?.text ?? null);
  // A gap read that has not answered, or that threw, is never "no warning" (CUL-1943, C-12):
  // the quiet line would assert a check that did not run. Unanswered holds the skeleton,
  // TIME-BOXED like B-734 (a hung local read must not hold a skeleton forever, and must not
  // resolve to calm either: past the box it says the check did not run). Failed says so,
  // with Try again. Any sentence in hand (ours, or the server's) wins over both.
  const gapPending = !showSkeleton && gapSentence === null && !gapAnswered;
  const [gapTimedOut, setGapTimedOut] = useState(false);
  useEffect(() => {
    if (!gapPending) {
      setGapTimedOut(false);
      return;
    }
    const t = setTimeout(() => setGapTimedOut(true), SIGNAL_LOAD_SKELETON_MS);
    return () => clearTimeout(t);
  }, [gapPending, petId]);
  const gapUnread = !showSkeleton && gapSentence === null && (gapReadFailed || (gapPending && gapTimedOut));
  const gapHeld = gapPending && !gapUnread;
  const gapTakesCard = state !== 'live' && gapSentence !== null;
  // The vet door shows whenever the card draws no finding — the quiet states, and a `live`
  // set this build cannot title (an untitled safety finding, which holds `live` above). Keyed
  // on what is DRAWN, not on the state: adversarial pass 2 found the state-keyed door dropped
  // "Call your vet today ›" for exactly that set, the most worrying one.
  const quiet = state !== 'live' || drawn.length === 0;

  // The once-ever arrival is not for a warning (CUL-1937): a pet whose first warning is the
  // gap row has spent its moment, as a safety-led pet has (§4: no celebration over a
  // concern). Spent once per pet per mount; `markArrivalPlayed` is idempotent anyway.
  const gapSpentFor = useRef<string | null>(null);
  useEffect(() => {
    if (!petId || gapSentence === null || gapSpentFor.current === petId) return;
    gapSpentFor.current = petId;
    void markArrivalPlayed(petId);
  }, [petId, gapSentence]);

  // SR-3 receded chrome (§5.2) — the section label drops a tier in the LIVE register only.
  const labelReceded = state === 'live';

  // The acknowledgment line shows above the live findings while a fresh log's regen is in
  // flight (§5.3). On the quiet line the Signal holds still on a log (round 7).
  const showAck = acknowledging && state === 'live';

  // `accessibilityLiveRegion` (on AckLine) is Android-only; announce imperatively on iOS.
  useEffect(() => {
    if (showAck && Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibility(ackUpdatingCopy(petName));
    }
  }, [showAck, petName]);

  // ── CUL-601 (§4) — the arrival ────────────────────────────────────────────────
  // The SETTLED state: null while the cache read is in flight, so latency can never be
  // mistaken for an arrival.
  const settledState = isLoading ? null : displayState;

  // NEVER FOR A SAFETY FINDING (§4 / S1), AND NEVER FOR A GAP WARNING (CUL-1937). Read over
  // the FULL set: suppression must never be able to unhide the moment. This reading can only
  // ever withhold the moment, never grant it, which is the direction a severity rule may err.
  const withholdArrival =
    findings.some((f) => f.finding.priorityClass === 'safety') || serverGap !== null || gapSentence !== null;

  // COUNT WHAT RENDERS (CUL-601), titled findings only: a stood-down line is not a finding
  // for this count (CUL-786), and a type the stack cannot title is not on screen (CUL-1941).
  const renderableCount = drawn.filter((f) => !isStoodDown(f.finding)).length;

  // GAP-13 (CUL-1566) — a safety finding that arrives on a focused Home is spoken.
  useSafetyArrivalSpeech({ petId, petName, answered, rendered });

  const { playing: arriving, moment } = useArrivalMoment({
    petId,
    petName,
    settledState,
    findingCount: renderableCount,
    withheld: withholdArrival,
  });

  // ── The vet door (round 7's foot) ────────────────────────────────────────────────
  // Read on focus, through the composition the daily look's door uses
  // (`lib/emergencyDoorRead.ts`), so the label can say the imperative once the record meets
  // a call sign (Dr. Chen, ruled 2026-10-15). Kept per pet (C-9); a switch drops it.
  const floorOn = useFloorOn();
  const [doorRead, setDoorRead] = useState<{ petId: string; read: EmergencyRead } | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const signalTick = useSyncStore((s) => s.signalTick);
  const hydrationTick = useSyncStore((s) => s.hydrationTick);
  const petSpecies = activePet?.species ?? null;
  const activePetIdRef = useRef<string | null>(petId);
  activePetIdRef.current = petId;
  useFocusEffect(
    useCallback(() => {
      if (!petId || !quiet) return;
      let cancelled = false;
      loadEmergencyRead({ id: petId, species: petSpecies }, trialNotEating)
        .then((read) => {
          if (!cancelled && activePetIdRef.current === petId) setDoorRead({ petId, read });
        })
        .catch((e) => {
          console.warn('[SignalZone] vet door read failed:', e);
          if (!cancelled && activePetIdRef.current === petId) setDoorRead({ petId, read: { status: 'failed' } });
        });
      return () => {
        cancelled = true;
      };
    }, [petId, petSpecies, trialNotEating, quiet, signalTick, hydrationTick]),
  );
  const read: EmergencyRead = doorRead && doorRead.petId === petId ? doorRead.read : { status: 'loading' };
  const vetDoor: SignalVetDoor | null = species
    ? { label: signalDoorLabel(species, read, floorOn), onPress: () => setSheetOpen(true) }
    : null;
  const onReport = petId && eventCount > 0 ? () => router.push(reportHref(petId)) : null;

  // ── The warning's arrival (round 7: the rail leads, the box opens, the sentence lands) ─
  // An OBSERVED transition, like the arrival: the same pet, a gap read that had answered
  // with NO warning on screen (in any state — a warning already drawn under a live stack
  // that then takes the card has not arrived, code review F2), then a warning taking the
  // card. A cold mount that already has one draws it still. A LAYOUT effect, and the motion
  // hook's phase is set in one too, so both updates flush before paint: the finished
  // sentence never shows for a frame before its own arrival (code review F1).
  const gapShown = gapSentence !== null;
  const prevGap = useRef<{ petId: string | null; shown: boolean | null }>({ petId: null, shown: null });
  const [warningEnter, setWarningEnter] = useState(0);
  const rowSpeech = useRowSpeech();
  useLayoutEffect(() => {
    // A failed read observes nothing: it must not stand as "answered with no warning", or a
    // warning a retry then finds would play its arrival over a quiet line never shown.
    if (!gapAnswered || gapReadFailed || showSkeleton) return;
    const prev = prevGap.current;
    prevGap.current = { petId, shown: gapShown };
    if (prev.petId !== petId || prev.shown !== false || !gapShown) return;
    if (gapTakesCard) setWarningEnter((n) => n + 1);
    // Said, not only drawn: a warning that arrives while Home is in front is spoken once,
    // queued behind what VoiceOver is reading — the safety arrival's own channel (GAP-13).
    if (gapSentence !== null && rowSpeech.mayAnnounce()) announceQueued(gapSentence);
  }, [petId, gapAnswered, gapReadFailed, gapShown, gapTakesCard, gapSentence, showSkeleton, rowSpeech]);

  // The outgoing frame for the arrival's crossfade, captured DURING render (by the time an
  // effect could run, the state has already flipped to live). Cleared on a pet switch.
  const lastBuilding = useRef<{ petId: string | null; el: ReactNode }>({ petId: null, el: null });
  const buildingFrame =
    state === 'building' && !showSkeleton && !gapTakesCard && !gapHeld && !gapUnread ? <QuietLine petName={petName} state="building" /> : null;
  if (lastBuilding.current.petId !== petId) {
    lastBuilding.current = { petId, el: buildingFrame };
  } else if (buildingFrame) {
    lastBuilding.current = { petId, el: buildingFrame };
  }
  const outgoingFrame = arriving ? lastBuilding.current.el : null;

  const goneQuietDay = lastLoggedAt ? quietDayLabel(lastLoggedAt, Date.now()) : null;

  return (
    // Signal is the dominant zone — one elevated container. `cardClip` is applied ONLY
    // while the arrival plays (it clips the travelling wash to the card's corners).
    <Card elevated style={arriving ? styles.cardClip : undefined}>
      {moment?.sweep ? <ArrivalWash sweep={moment.sweep} /> : null}
      <SectionLabel
        label="Signal"
        header
        style={labelReceded ? [styles.label, styles.labelReceded] : styles.label}
      />

      {showAck ? <AckLine petName={petName} /> : null}

      {state === 'live' ? (
        <>
          <ArrivalStage
            active={arriving}
            moment={moment}
            outgoingFrame={outgoingFrame}
            stack={
              <LiveStack
                findings={findings}
                withholdFallingVomit={withholdFallingVomit}
                arrival={moment}
                generatedAt={generatedAt}
                trialAnchor={trialAnchor}
                petId={petId}
                onOpen={openSignal}
              />
            }
          />
          {gapSentence !== null ? (
            <>
              <Divider style={styles.rowDivider} />
              <GapWarning text={gapSentence} enterKey={0} />
            </>
          ) : gapUnread ? (
            <>
              <Divider style={styles.rowDivider} />
              <GapReadFailed petName={petName} onRetry={retryGapRead} />
            </>
          ) : null}
        </>
      ) : showSkeleton ? (
        // B-734: the loading frame is a time-boxed skeleton, never a quiet line.
        <SignalLoadingSkeleton />
      ) : gapHeld ? (
        <SignalLoadingSkeleton />
      ) : gapUnread ? (
        <GapReadFailed petName={petName} onRetry={retryGapRead} />
      ) : gapTakesCard && gapSentence !== null ? (
        <GapWarning
          text={gapSentence}
          enterKey={warningEnter}
          outgoing={<QuietLineText petName={petName} state={state} day={goneQuietDay} lookSince={lookSinceLastLogged} />}
        />
      ) : (
        <QuietLine petName={petName} state={state} day={goneQuietDay} lookSince={lookSinceLastLogged} />
      )}

      {/* The zone's foot. Live: "not a diagnosis", said once, beside the door to Patterns
          (CUL-1270). Quiet: the vet's call signs and the vet report (round 7, CUL-1838). */}
      {state === 'live' && drawn.length > 0 ? (
        <SignalZoneFoot mode="live" petName={petName} />
      ) : showSkeleton ? null : (
        <SignalZoneFoot mode="quiet" petName={petName} vetDoor={vetDoor} onReport={onReport} />
      )}
      {species ? (
        <LookEmergencySheet
          visible={sheetOpen}
          species={species}
          petName={petName}
          read={read}
          onClose={() => setSheetOpen(false)}
        />
      ) : null}
    </Card>
  );
}

// SR-3 acknowledgment line (§5.3 / §9) — a small teal dot + the nyx-voice-locked
// "Noted — updating {pet}'s picture…". A polite live region so VoiceOver announces it
// when it appears and clears; the dot is decorative (a View, no label). Renders only
// while a regen is in flight (gated at the call site).
function AckLine({ petName }: { petName: string }) {
  return (
    <View style={styles.ackLine} accessibilityLiveRegion="polite">
      <View style={styles.ackDot} />
      <ThemedText style={styles.ackText}>{ackUpdatingCopy(petName)}</ThemedText>
    </View>
  );
}

/**
 * The findings that will actually RENDER — LIFTED to `lib/signalVisible.ts` (CUL-903).
 *
 * It was extracted here (CUL-601) because the arrival needs the same answer the stack
 * does: the arrival's first cut counted `findings.length` instead, so on a not-eating cat
 * whose ONLY finding is a suppressed `fewer_during_trial` the moment played a gold wash
 * over a blank card and spent that pet's once-ever marker doing it. The one owner it fired
 * for would have been the one whose cat is refusing food.
 *
 * VV-5's "Worth raising" is the third caller and it is not on Home, so the module moved
 * rather than the rule being restated (the diet-trial §5.3 lesson; C-30's shape). The
 * suppression's own reasoning stays at the call site below.
 */

// CUL-786 — the labeled stand-down (spec §0 DF-9(a), §8 v1.1-a). One calm line in the slot the
// chronicity card held: NO rail (the colour mark is the concern's; this is its absence stated),
// the secondary `textSM` register, indented to the card text column so the empty gutter IS the
// missing rail. The sentence is the server's (Dr. Chen's line, template-only, never the model):
// "logged", never "happened"; "That isn't an all-clear."; the ask surviving as a conditional.
// Not a control — nothing to expand, nothing to fold, nothing to tap. Announced as one sentence.
function StoodDownLine({ text }: { text: string }) {
  return (
    <View style={styles.stoodDownRow} accessible accessibilityRole="text" accessibilityLabel={text}>
      <ThemedText style={styles.stoodDownText}>{text}</ThemedText>
    </View>
  );
}

// The card stack — findings are already ranked server-side (safety leads, then
// the pet's context-lead type, then tier — §5/§8); we render in that order and
// only add the visual rhythm. Hairline dividers between rows keep one container
// reading as a quiet list, not a wall of boxes.
function LiveStack({
  findings,
  withholdFallingVomit,
  arrival = null,
  generatedAt = null,
  trialAnchor = null,
  petId,
  onOpen,
}: {
  findings: CachedFinding[];
  withholdFallingVomit: boolean;
  /** The pet the findings belong to (C-9), for the lead card's own read. Null draws no
   *  stack: a door that cannot say whose finding it opens is no door. */
  petId: string | null;
  /** The door — the Signal's own screen. */
  onOpen: (finding: SignalFinding) => void;
  /** CUL-601 (§4) — non-null only while the arrival plays. The lead crossfades in
   *  across 400–900ms; everything below it settles across 900–1200ms. */
  arrival?: ArrivalMoment | null;
  /** When the engine counted (the cache row's `generated_at`), for the rows' dating. */
  generatedAt?: string | null;
  /** CUL-1360 — the cache's `generated_at` with this pet's running trial; null anchors nothing. */
  trialAnchor?: SignalTrialAnchor | null;
}) {
  // B-789 (§5.2) — drop the trial_response card when the record shows the animal isn't eating
  // (`withholdFallingVomit`, computed by Home from the same `trialInput` the strip withholds its
  // vomit line on). SUPPRESSION, NOT REORDER: §5.2 forbids a reassuring summary next to a refusal
  // even BELOW the safety card, so ranking it down is insufficient — the card must not render at all.
  // The server emits `trial_response` blind to the refusal (the day-1-refusal cat the relative-decline
  // lane can't see), so the client is this card's visibility gate. This is a SAFETY gate, not a beta
  // gate — it survives the CUL-548 flag retirement untouched.
  //
  // DIRECTION-AWARE (adversarial-reviewer): only the REASSURING `fewer_during_trial` card is the
  // §5.2 hazard. `detectTrialResponse` also emits `more_during_trial` — a vomiting ESCALATION during
  // the trial — and on a not-eating cat that is a concern to KEEP, not a reassurance to hide (dropping
  // it would lose the only card carrying the rise in the ④/⑦ dead zone — the never-reassure direction).
  // So gate on the direction, not on `isTrialResponse` alone.
  //
  // Residual (finding 4 → CUL-527): when a suppressed `fewer` card is the SOLE finding, `displayState`
  // (derived upstream over the full set) still reads 'live' and this stack renders empty. Safe
  // direction (no reassurance), and the escalation case is closed by the direction gate; the
  // displayState fix rides CUL-527. The finding stays in the cache; nothing consumes it but this stack.
  // CUL-601: the arrival moment reads `visibleFindings` too, so that empty frame no longer
  // gets a celebration drawn over it — but the empty frame itself is still CUL-527's.
  // CUL-1360: and a falling trial pair counted over a trial since replaced (`trialAnchor`).
  // CUL-1218 (G10 extended): a type this build cannot title is not in the stack at all —
  // dropped BEFORE the lead is chosen, so the next card takes the lead canvas and no
  // divider is left above an empty slot (adversarial pass).
  const visible = visibleFindings(findings, withholdFallingVomit, Date.now(), trialAnchor);
  const ordered = visible.filter((f) => hasSignalTitleRule(f.finding));
  // CUL-1216 (BRK-6): the SAME register for the pairs a card carries inside it — the lead
  // card's week line and a vomit chronicity card's compare — with the Signal's own
  // `intake_decline` OR'd in, exactly as `visibleFindings` reads it, so the card a stack drops
  // and the pair a card withholds can never disagree.
  const withholdPairs = withholdFallingVomit || signalSaysNotEating(findings);
  // CUL-786: the lead canvas belongs to the first CARD. A stood-down line is not a card — the
  // engine has stopped asserting that concern and left a seven-day epitaph — and it is spliced
  // below every live safety finding server-side, so the only card it can precede is a benign
  // one that would have led the moment the concern went (the pre-marker behaviour). Binding
  // the canvas to the array index instead demoted whatever sat under the line for a week
  // (adversarial pass, 2026-09-03).
  const leadIndex = ordered.findIndex((f) => !isStoodDown(f.finding));
  // CUL-1213 (BRK-47): a row is keyed by its finding's identity, never its rank, so a re-rank
  // moves a row rather than remounting another finding into it. A key two findings share
  // (never on a set the phone holds today) takes its rank so React still sees two rows.
  const sharedKeys = sharedFoldIdentities(ordered.map((f) => f.finding));
  if (!petId) return null;
  return (
    <View>
      {ordered.map((f, i) => {
        const row = (
          <>
            {i > 0 && <Divider style={styles.rowDivider} />}
            {/* CUL-786: a stood-down marker is one plain line in its former slot — never a
                card, never the lead canvas: a sentence about absence at the lead's size would
                be the reassurance the line exists to refuse. The canvas goes to the first
                card (`leadIndex`, above). */}
            {isStoodDown(f.finding) ? (
              <StoodDownLine text={f.text} />
            ) : i === leadIndex && f.finding.priorityClass === 'insight' && leadTakesChartCard(f.finding) ? (
              // D2-3: the lead insight card is the title + chart + line, and a door — for a
              // finding whose evidence IS the weekly bars. A timing or correlation lead takes
              // the row's face below (CUL-1218, GC-5 (a)): its own receipt, never the bars.
              <SignalLeadCard
                cached={f}
                petId={petId}
                onOpen={onOpen}
                withholdFallingVomit={withholdPairs}
                generatedAt={generatedAt}
              />
            ) : (
              // CUL-1270 (D1 = B): every other card — a safety lead and every lower card — is
              // a row: headline, the ask, a chevron, a door to its own screen. A safety row
              // stays words (S1) and always carries its ask. There is no fold (CUL-1285): every
              // card is already a row.
              <SignalRow cached={f} petId={petId} onOpen={onOpen} isLead={i === leadIndex} generatedAt={generatedAt} />
            )}
          </>
        );
        const identity = foldIdentity(f.finding);
        const key = sharedKeys.has(identity) ? `${identity}#${f.rank}` : identity;
        // ONE host type per row across the moment's edges (CUL-1223): a `View` →
        // `Animated.View` swap is a remount of the row, and of its card's read.
        return (
          <Animated.View key={key} style={arrival ? { opacity: i === 0 ? arrival.crossfade : arrival.tail } : undefined}>
            {row}
          </Animated.View>
        );
      })}
    </View>
  );
}

// ── The quiet line (CUL-1838; round 7 of the Signal mock is the design authority) ─────
// Until there is a finding to draw, the Signal is a header and a subtitle above the foot:
// "Too early to tell", "Nothing logged since {day}", or "No pattern right now". The header
// takes the lead row's display face (`SignalRow`'s `headlineLead`) and the subtitle the
// row's sub style; the mark is the row's own rail, neutral and full height — the still
// tick it replaced read as a cursor, the app about to speak (round 7). Nothing here reads
// absence as wellness: every state says what the record can and cannot show.

type QuietState = Exclude<DisplayState, 'live'>;

/** The quiet line's two strings for a state. `day` null (an unreadable last-log time) falls
 *  back to "Too early to tell"'s honest frame rather than print a guessed date. */
function quietLineCopy(
  petName: string,
  state: QuietState,
  day: string | null,
  lookSince: boolean,
): { header: string; sub: string } {
  if (state === 'stale' && day !== null) {
    return { header: quietGoneQuietHeader(day, lookSince), sub: QUIET_GONE_QUIET_SUB };
  }
  if (state === 'no_pattern') return { header: NO_PATTERN_HEADLINE, sub: NO_PATTERN_SUB };
  return { header: QUIET_TOO_EARLY_HEADER, sub: quietTooEarlySub(petName) };
}

/** The header and subtitle alone — what fades out when a warning arrives. */
function QuietLineText({
  petName,
  state,
  day = null,
  lookSince = false,
}: {
  petName: string;
  state: QuietState;
  day?: string | null;
  lookSince?: boolean;
}) {
  const { header, sub } = quietLineCopy(petName, state, day, lookSince);
  return (
    <View style={styles.quietBody} accessible accessibilityLabel={`${header}. ${sub}`} testID="signal-quiet-line">
      <ThemedText style={styles.quietHeader}>{header}</ThemedText>
      <ThemedText style={styles.quietSub}>{sub}</ThemedText>
    </View>
  );
}

function QuietLine(props: { petName: string; state: QuietState; day?: string | null; lookSince?: boolean }) {
  return (
    <View style={styles.quietRow}>
      <View style={[styles.quietRail, styles.quietRailNeutral]} />
      <QuietLineText {...props} />
    </View>
  );
}

// The gap warning: the escalate-only sentence, in the display face, beside the insight
// rail. It takes the whole card in every quiet state (CUL-1468) and sits under the stack in
// `live`. Plain words, no alarm colour, no icon: plainness is the severity signal (S1). Its
// evidence lane (the vomits and the unlogged days on one axis) is CUL-1938, after the cut.
function GapWarning({ text, enterKey, outgoing = null }: { text: string; enterKey: number; outgoing?: ReactNode }) {
  const reducedMotion = useReducedMotion();
  const appActive = useAppActive();
  const { phase, outgoingOpacity, railInk, sentenceOpacity, sentenceShift } = useWarningArrival({
    enterKey,
    reducedMotion,
    appActive,
  });
  const sentence = (
    <ThemedText style={styles.gapSentence} accessibilityRole="text" testID="signal-gap-warning">
      {text}
    </ThemedText>
  );
  return (
    <View style={styles.quietRow}>
      {phase === 'idle' ? (
        <View style={[styles.quietRail, styles.gapRail]} />
      ) : (
        <View style={[styles.quietRail, styles.quietRailNeutral]}>
          <Animated.View style={[StyleSheet.absoluteFill, styles.gapRail, { opacity: railInk }]} />
        </View>
      )}
      <View style={styles.quietBody}>
        {phase === 'idle' ? (
          sentence
        ) : phase === 'leading' ? (
          <Animated.View style={{ opacity: outgoingOpacity }} importantForAccessibility="no-hide-descendants">
            {outgoing}
          </Animated.View>
        ) : (
          <>
            <Animated.View style={{ opacity: sentenceOpacity, transform: [{ translateY: sentenceShift }] }}>
              {sentence}
            </Animated.View>
            <Animated.View
              pointerEvents="none"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={[StyleSheet.absoluteFill, { opacity: outgoingOpacity }]}
            >
              {outgoing}
            </Animated.View>
          </>
        )}
      </View>
    </View>
  );
}

// CUL-1943: the gap read did not answer. Said plainly, in the quiet row's anatomy on the
// neutral rail, with a way to run it again (C-12). Never the quiet line: "No pattern right
// now" over a check that did not run would claim a calm the record has not shown.
function GapReadFailed({ petName, onRetry }: { petName: string; onRetry: () => void }) {
  const header = gapReadFailedCopy(petName);
  return (
    <View style={styles.quietRow} testID="signal-gap-read-failed">
      <View style={[styles.quietRail, styles.quietRailNeutral]} />
      <View style={styles.quietBody}>
        <ThemedText style={styles.quietSub} accessibilityRole="text">
          {header}
        </ThemedText>
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
          style={styles.gapRetry}
          testID="signal-gap-retry"
        >
          <ThemedText style={styles.gapRetryText}>{GAP_READ_RETRY}</ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const GAP_READ_RETRY = 'Try again';
function gapReadFailedCopy(petName: string): string {
  return `Couldn't check the gaps between ${petName}'s vomiting episodes just now. This doesn't mean nothing's changed.`;
}

// B-734 (CUL-72): the flag-on loading frame — content-shaped Tier-1 skeleton for the
// beat while the local cache read resolves. Never the heavy E1 (whose "getting to know
// {pet} / Day N" headline is wrong over a mature pet whose findings are about to land),
// never a spinner (sub-1s local wait). Skeleton hides itself from accessibility.
function SignalLoadingSkeleton() {
  return (
    <View style={styles.skeleton} testID="signal-loading-skeleton">
      <Skeleton width="88%" height={14} />
      <Skeleton width="64%" height={14} style={styles.skeletonLine} />
      <Skeleton width="42%" height={11} style={styles.skeletonMeta} />
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    marginBottom: theme.space2,
  },
  // SR-3 receded chrome (§5.2) — the section label drops one tier (secondary → tertiary)
  // in the live register. Tertiary, not disabled: a disabled-tier heading fails AA
  // contrast; tertiary keeps it (≥4.5:1) while still reading as receded.
  labelReceded: {
    color: theme.colorTextTertiary,
  },
  // §8 quiet doorway into the dashboard — a hairline-separated footer link.
  patternsLink: {
    borderTopWidth: 1,
    borderTopColor: theme.colorBorder,
    paddingTop: theme.space2,
    marginTop: theme.space1,
  },
  patternsLinkText: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorAccentInk,
  },
  // SR-3 receded chrome (§5.2) — the doorway drops to the SAME tertiary tier as the
  // label. The mock dims it to a lighter teal, but a lighter teal on white fails AA
  // (≈1.6:1), and there is no teal that both recedes AND clears AA on white. So the
  // doorway recedes as the label does (grey, ≥4.5:1), extending the team's
  // label-contrast override of the mock to the footer. pm-feature-review flagged the
  // teal path as the sole-doorway AA failure; teal is the interactive FILL colour, not
  // a link requirement, and the whole row is a button.
  //
  // CUL-744 note: this comment used to rank the dimmed teal as "worse than the shipped
  // accent footer", which was true and conceded too much — the footer it was measured
  // against was BRIGHT teal at 2.26:1, i.e. also failing, just less. The base state is
  // now colorAccentInk (5.17:1), so the comparison is gone and only the reason the
  // RECEDED state is grey survives. Both states clear AA now; they always should have.
  patternsLinkTextReceded: {
    color: theme.colorTextTertiary,
  },
  // SR-3 acknowledgment line (§5.3) — the teal dot + the "Noted — updating …" line, sat
  // above the findings with a little breathing room below.
  ackLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
    paddingBottom: theme.space1,
  },
  ackDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: theme.colorAccent,
  },
  ackText: {
    fontSize: theme.textXS,
    color: theme.colorAccentInk,
    lineHeight: theme.lineHeightXS,
  },
  rowDivider: {
    marginHorizontal: -theme.space1,
  },
  // CUL-786 — the stand-down line. The compact-row rhythm, indented past where a rail would
  // sit so the sentence aligns with the card text above and below it (no rail of its own).
  stoodDownRow: {
    paddingVertical: theme.space1,
    paddingLeft: RAIL_WIDTH + theme.space2,
  },
  stoodDownText: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightSM,
  },

  // ── CUL-601 (§4) — the arrival moment's two structural styles ────────────────
  // Both are applied only while the 1.2s plays; see the call sites for why.
  cardClip: {
    overflow: 'hidden',
  },
  arrivalStage: {
    overflow: 'hidden',
  },

  // ── The quiet line (CUL-1838) — the lead row's anatomy: rail, display face, sub ──
  quietRow: {
    flexDirection: 'row',
    gap: theme.space1,
  },
  quietRail: {
    width: RAIL_WIDTH,
    alignSelf: 'stretch',
    borderRadius: 2,
    overflow: 'hidden',
  },
  // Neutral: nothing to report is not a colour.
  quietRailNeutral: {
    backgroundColor: theme.colorBorder,
  },
  // The insight rail's ink (`SignalRow`'s RAIL_COLOR.insight, at its 0.85): the warning is a
  // finding on the record, not a safety finding — plainness carries its weight (S1).
  gapRail: {
    backgroundColor: theme.colorAccent,
    opacity: 0.85,
  },
  quietBody: {
    flex: 1,
    minWidth: 0,
  },
  // `SignalRow.headlineLead`'s display face.
  quietHeader: {
    fontFamily: theme.fontDisplay,
    fontSize: theme.textLG + 2,
    lineHeight: theme.lineHeightBody + 2,
    letterSpacing: theme.trackingTight,
    color: theme.colorTextPrimary,
  },
  // `SignalRow`'s sub.
  quietSub: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextSecondary,
    marginTop: theme.spaceMicro,
  },
  gapSentence: {
    fontFamily: theme.fontDisplay,
    fontSize: theme.textLG + 2,
    lineHeight: theme.lineHeightBody + 2,
    letterSpacing: theme.trackingTight,
    color: theme.colorTextPrimary,
  },
  // CUL-1943 — the unanswered gap read's retry, the quiet sub's size in the accent ink.
  gapRetry: {
    alignSelf: 'flex-start',
    marginTop: theme.space1,
  },
  gapRetryText: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorAccentInk,
  },
  // B-734 — the flag-on loading frame's content-shaped placeholder rhythm.
  skeleton: {
    paddingVertical: theme.space1,
    marginBottom: theme.space2,
  },
  skeletonLine: {
    marginTop: theme.space1,
  },
  skeletonMeta: {
    marginTop: theme.space2,
  },
});
