import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text, View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { theme } from '../../constants/theme';
import { Card } from '../ui/Card';
import { Divider } from '../ui/Divider';
import { SectionLabel } from '../ui/SectionLabel';
import { FoldedStrip, InsightCard } from './InsightCard';
import { useSignal } from '../../hooks/useSignal';
import { useSignalFold, type SignalFoldApi } from '../../hooks/useSignalFold';
import { useWatchingRows } from '../../hooks/useWatchingRows';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useAppActive } from '../../hooks/useAppActive';
import { hasPlayedArrival, markArrivalPlayed } from '../../lib/signalArrival';
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
import { Skeleton } from '../ui/Skeleton';
import { ThemedText } from '../ui/ThemedText';
import {
  BUILDING_FLOOR,
  BUILDING_WATCHING_FOR,
  NO_PATTERN_HEADLINE,
  NO_PATTERN_SUB,
  WATCHING_SUB,
  ackUpdatingCopy,
  arrivalAnnouncementCopy,
  buildingDayCount,
  buildingHeadline,
  buildingHeadlineLead,
  buildingSub,
  coverageCopy,
  isTrialResponse,
  staleIntro,
  stripNameLine,
} from '../../lib/signalCopy';
import type { CachedFinding, CoverageDiagnostic } from '../../lib/signal';
import type { DisplayState } from '../../lib/signalCopy';
import type { WatchingRow } from '../../lib/signalWatching';

// B-734 (adversarial ④) — the skeleton's time-box. The window it covers is a normally-
// fast network read, but nothing bounds that read, so the skeleton bounds itself: past
// this, the zone falls through to the honestly-derived state and re-enables the watching
// read. Sized to cover a slow-but-alive fetch without ever reading as a hung screen.
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
//   900ms   one soft success tap
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
  hasSafetyFinding,
}: {
  petId: string | null;
  petName: string;
  settledState: DisplayState | null;
  findingCount: number;
  hasSafetyFinding: boolean;
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
  const safety = useRef(hasSafetyFinding);
  safety.current = hasSafetyFinding;
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

      // Spend it — INCLUDING on the safety path below, which draws nothing (§4). A pet
      // whose first-ever finding is a concern has spent its moment. The alternative
      // saves the celebration for the one owner whose record opened badly.
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
        // owner, one unexplained congratulatory buzz: everything that says "something
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
}: {
  moment: ArrivalMoment | null;
  outgoingFrame: ReactNode;
  stack: ReactNode;
}) {
  return (
    <View
      style={styles.arrivalStage}
      // The lead sits at opacity 0 for the crossfade's first 400ms, beneath a still-
      // opaque outgoing frame — so without this, a tap on what LOOKS like a ghost
      // watching row lands on the invisible InsightCard underneath and expands it. The
      // card is inert for the moment; a tap that does nothing beats a tap that does
      // something the owner cannot see they asked for.
      pointerEvents="none"
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
  // B-721 SR-5 (§3.4) — whether a diet trial is running for the active pet (`isTrialRunning`,
  // computed by Home from the useDietTrial load it already does, so this zone adds no second
  // read). Threaded to the falling reflection's expanded state for the mid-trial adjacency
  // line; default false, so every non-Home caller is unaffected.
  trialRunning?: boolean;
  // B-789 (§5.2) — drop the event-driven trial_response card when the active pet's record
  // carries a NOT-EATING concern (a live intake decline or a diet refusal). The card fires
  // from the server `trial_response` finding, which is blind to the refusal — the day-1
  // diet-refusal cat has uniform-low intake, so the relative-decline detector never fires
  // and no safety card leads, yet a reassuring "0 vomiting · was 20" would render over a
  // starving cat (the B-494 anorexic-cat case). Home computes this from the SAME `trialInput`
  // the strip withholds its vomit line on (`isAnimalNotEating`), so the card and the strip
  // can never disagree. Default false: every non-Home caller is unaffected.
  suppressTrialResponse?: boolean;
}

export function SignalZone({
  trialRunning = false,
  suppressTrialResponse = false,
}: SignalZoneProps = {}) {
  const {
    petId,
    findings,
    coverage,
    displayState,
    petName,
    isLoading,
    dayNumber,
    eventCount,
    acknowledging,
    answered,
  } = useSignal();

  // CUL-784 — the Signal fold (fold spec §5/§6): this reader's per-pet memory of which
  // cards they have compacted. Read once per pet, reconciled against the SETTLED set only
  // (`answered` — never against the pre-read empty array or a read that threw, C-12), and
  // handed to the stack, which renders a strip, a re-opened face, or the face per entry.
  const fold = useSignalFold({ petId, findings, answered });

  // Signal/Home design uplift (B-721, SR-1..SR-6) — GA'd 2026-08-20 (CUL-546 Phase 1 /
  // CUL-547): the uplift IS the Signal surface now. SR-1 the live receipts (via LiveStack →
  // InsightCard), SR-2 the empty states (E1 building / E2 no_pattern), SR-3 the register
  // (receded chrome + secondary compression) and the acknowledgment line all render
  // unconditionally. The Signals-v2 lanes (B-755 / CUL-12/13/14 — the timing-story cards,
  // the trial card, the watching rows) GA'd in the same PR (CUL-548): the client no longer
  // gates them, so a v2 finding renders whenever the payload carries it (the server's B-777
  // eligibility gate still governs whether an account's payload carries one, until GA-3).
  // `dayNumber` / `eventCount` feed the E1 headline.

  // While the first cache read is in flight, hold the warm building state rather
  // than letting the empty findings flash 'stale' for a frame. B-734 (CUL-72, GA
  // Phase 0): this window does NOT render the heavy E1 — a mature pet's live findings
  // resolve a beat after mount/pet-switch, and the loud "getting to know {pet} / Day N"
  // headline flashing over a pet with a live safety finding is self-contradicting. The
  // loading frame is a content-shaped skeleton — and it is TIME-BOXED (adversarial ④):
  // the wait it covers is the `readSignalCache` network read (Supabase/PostgREST — no
  // timeout of its own), so an offline/hung read would otherwise hold the skeleton for
  // the platform socket timeout. Past SIGNAL_LOAD_SKELETON_MS the zone falls through to
  // the derived state (honest, and it un-suppresses the escalate-only gap row below).
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
  const state = loading ? 'building' : displayState;

  // Signals v2 (B-755 / CUL-14) — the watching system (§4.4 / D5). Per-lane rows with
  // REAL partial counts, rendered inside whichever empty-state frame is live. Gated on
  // an empty state (building / no_pattern): in `live` there is a real finding to show and
  // in `stale` too little to say, so the rows never apply there. The hook reads local
  // data ONLY when enabled, so live / stale do zero extra work. `dayNumber` is shared
  // with the E1 headline so the Change row's week count and the "Day N" headline always
  // agree (one day definition). Not while the skeleton shows (B-734): the pet-switch
  // reset just cleared localCtx, so a read keyed on the sentinel dayNumber would only be
  // thrown away — but the gate is the SKELETON, not `loading`, so a hung read can never
  // suppress the escalate-only gap row past the time-box (adversarial ④).
  const watchingEnabled = !showSkeleton && (state === 'building' || state === 'no_pattern');
  const watching = useWatchingRows(watchingEnabled, dayNumber);

  // B-769 (CUL-29, PM-ruled D3a — GA Phase 0): the escalate-only gap row leaves the
  // "still needs" umbrella. It is a concerning FACT about the record, not an unmet need,
  // so it renders in its own register ABOVE the frame's other content (Principle 3 —
  // concern leads), while the timing/change rows keep the WATCHING_SUB "still needs"
  // framing. Split once here; the frames place the two pieces.
  const gapRow = watching.find((r) => r.key === 'gap') ?? null;
  const needRows = watching.filter((r) => r.key !== 'gap');

  // SR-3 receded chrome (§5.2) — the section label drops a tier in the LIVE register
  // only, where the lead's canvas should dominate. The empty states keep the label
  // prominent (it orients the owner while the engine is still learning — the round-2.1
  // mock keeps E1/E2's label at full weight). The footer doorway recedes across every
  // state (below).
  const labelReceded = state === 'live';

  // The acknowledgment line shows above the live findings while a fresh log's regen is in
  // flight (§5.3). Computed once — the render and the iOS announce below read the same value.
  const showAck = acknowledging && state === 'live';

  // `accessibilityLiveRegion` (on AckLine) is Android-only; announce imperatively on iOS
  // (Nyx ships iOS-first) so VoiceOver reads the "updating…" line when it appears — the
  // same gap + fix TextField.tsx documents for its error text. Fires on the transition to
  // showing, not every render; no "cleared" announcement (there is no "done" copy — the
  // findings just refresh, and re-announcing on clear would be noise).
  useEffect(() => {
    if (showAck && Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibility(ackUpdatingCopy(petName));
    }
  }, [showAck, petName]);

  // No "mark the Signal seen" write happens here any more. It existed for exactly one
  // reader — the CulpritMark's `live` pulse in the Home header — and D4 deleted that
  // cue outright ("no looping animation in app chrome, ever"). "Something new" is now
  // announced by this card's own content: the live rail, and the once-ever arrival
  // moment. Nothing else read the seen-signature store, so it went with the pulse
  // rather than being left writing to a reader that no longer exists.

  // ── CUL-601 (§4) — the arrival ────────────────────────────────────────────────
  // The SETTLED state: null while the cache read is in flight, so latency can never be
  // mistaken for an arrival (see `useArrivalMoment`). Read off `isLoading` rather than
  // the derived `loading` above, because that one goes false as soon as there are
  // findings to show, which is the very frame the transition would be judged on.
  const settledState = isLoading ? null : displayState;

  // NEVER FOR A SAFETY FINDING (§4 / S1 — plainness is the severity signal). The spec
  // writes this as "if the first-ever finding LEADS the safety band"; the gate here is
  // ANY safety finding in the set, not just rank 0. Ranking is decided server-side, and
  // if a safety card ever sits below the lead, sweeping the card still decorates a
  // concern — this reading can only ever withhold the moment, never grant it, which is
  // the direction a severity rule is allowed to be wrong in.
  const hasSafetyFinding = findings.some((f) => f.finding.priorityClass === 'safety');

  // COUNT WHAT RENDERS, not what the cache holds. `displayState` is derived upstream over
  // the full set, so a pet whose only finding is dropped by the B-789 suppression still
  // reads 'live' with an EMPTY stack (the CUL-527 residual). Counting `findings.length`
  // there would sweep a blank card and spend the marker — on the not-eating cat, the one
  // record where a celebration is least defensible. The safety gate above deliberately
  // keeps reading the FULL set: suppression must never be able to unhide the moment.
  const renderableCount = visibleFindings(findings, suppressTrialResponse).length;

  const { playing: arriving, moment } = useArrivalMoment({
    petId,
    petName,
    settledState,
    findingCount: renderableCount,
    hasSafetyFinding,
  });

  // The outgoing frame for the crossfade. Captured DURING render because by the time an
  // effect could run, the state has already flipped to live and the building frame it
  // would have snapshotted is gone. Idempotent and derived only from this render's own
  // values, which is what makes the render-time write safe (the same "adjust state while
  // rendering" reasoning useSignal's pet reset documents). Cleared on a pet switch so
  // one pet's building frame can never ghost over another's card.
  const lastBuilding = useRef<{ petId: string | null; el: ReactNode }>({ petId: null, el: null });
  const buildingFrame =
    state === 'building' && !showSkeleton ? (
      <BuildingStateV2
        petName={petName}
        dayNumber={dayNumber}
        eventCount={eventCount}
        gapRow={gapRow}
        needRows={needRows}
      />
    ) : null;
  if (lastBuilding.current.petId !== petId) {
    lastBuilding.current = { petId, el: buildingFrame };
  } else if (buildingFrame) {
    lastBuilding.current = { petId, el: buildingFrame };
  }
  const outgoingFrame = arriving ? lastBuilding.current.el : null;

  return (
    // Signal is the dominant zone — one elevated container holding the ordered
    // stack of insight rows (PM-decided: rows + dividers, not separate cards, so
    // it reads as one calm intelligence surface, never a dashboard dump — §3.1).
    // `cardClip` is applied ONLY while the moment plays: it clips the travelling wash
    // to the card's rounded corners and keeps the outgoing frame's overlay from spilling
    // past a shorter live card. Left on permanently it would clip legitimate overflow
    // (an expanded insight's shadow), so it comes and goes with the 1.2s.
    <Card elevated style={arriving ? styles.cardClip : undefined}>
      {/* The wash goes FIRST — behind every sibling (§4: light moving across paper,
          never a tint over the words). Reduced motion renders no band at all; that
          absence is the static frame. */}
      {moment?.sweep ? <ArrivalWash sweep={moment.sweep} /> : null}
      {/* The style prop stays a SINGLE reference when the chrome isn't receded, so the
          shipped snapshot is byte-identical (an inline [style, false] array would drift it). */}
      <SectionLabel
        label="Signal"
        header
        style={labelReceded ? [styles.label, styles.labelReceded] : styles.label}
      />

      {/* SR-3 acknowledgment line (§5.3) — one quiet line ABOVE the still-readable FINDINGS
          while a fresh log's regen is in flight (never a spinner, never blanks the findings).
          Scoped to the live register: the empty states carry their own "getting to know you"
          reassurance (E1), so an "updating…" line there would just double it. Clears when the
          regen settles (useSignal reads the lifecycle flag) or the safety ceiling fires —
          fail-quiet, never an error surface. */}
      {showAck ? <AckLine petName={petName} /> : null}

      {state === 'live' ? (
        // The stage exists ONLY while the moment plays. On every ordinary render the
        // stack is returned bare, exactly as it shipped — no wrapper node, no clip, no
        // opacity node (the same byte-identical-when-inert rule the section label's
        // single style reference follows above).
        arriving ? (
          <ArrivalStage
            moment={moment}
            outgoingFrame={outgoingFrame}
            stack={
              <LiveStack
                findings={findings}
                petName={petName}
                trialRunning={trialRunning}
                suppressTrialResponse={suppressTrialResponse}
                arrival={moment}
                fold={fold}
              />
            }
          />
        ) : (
          <LiveStack
            findings={findings}
            petName={petName}
            trialRunning={trialRunning}
            suppressTrialResponse={suppressTrialResponse}
            fold={fold}
          />
        )
      ) : state === 'stale' ? (
        <ThemedText style={styles.intro}>{staleIntro(petName)}</ThemedText>
      ) : state === 'no_pattern' ? (
        // Substantial history, nothing cleared a floor (B-051) — honest, no ghosted
        // previews (the owner has logged enough to know the surface). B-053: when
        // the engine knows WHY there's no signal yet, surface the top coverage
        // diagnostic's one-line why + ≤1 safe action instead of the generic line.
        // CUL-14: the watching rows compose in additively (the gap row can still
        // escalate on a mature record).
        <NoPatternStateV2 petName={petName} coverage={coverage} gapRow={gapRow} needRows={needRows} />
      ) : // B-734: the loading frame is a time-boxed skeleton, never the heavy E1.
      showSkeleton ? (
        <SignalLoadingSkeleton />
      ) : (
        <BuildingStateV2
          petName={petName}
          dayNumber={dayNumber}
          eventCount={eventCount}
          gapRow={gapRow}
          needRows={needRows}
        />
      )}

      {/* §8 doorway into the Patterns dashboard — a quiet footer affordance, present in
          every Signal state so the deeper surface is discoverable from Home. Navigates
          AWAY to a destination (Principle 3 — not a 4th Home zone, not a tab). */}
      <Pressable
        onPress={() => router.push('/insights')}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`See all of ${petName}'s patterns`}
        style={styles.patternsLink}
      >
        {/* SR-3 (§5.2) — the footer doorway recedes (to the label's tertiary tier) across
            every state so it never competes with the content. */}
        <ThemedText style={[styles.patternsLinkText, styles.patternsLinkTextReceded]}>
          See all of {petName}'s patterns →
        </ThemedText>
      </Pressable>
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
 * The findings that will actually RENDER, in render order — the B-789 safety suppression
 * plus the server's rank.
 *
 * Extracted (CUL-601) because the arrival needs the same answer the stack does. It used
 * to live inside `LiveStack`, and the arrival's first cut counted `findings.length`
 * instead: on a not-eating cat whose ONLY finding is a suppressed `fewer_during_trial`
 * (the known CUL-527 residual), `displayState` still reads 'live' and the stack renders
 * EMPTY — so the moment played a gold wash and a success tap over a blank card, and
 * spent that pet's once-ever marker doing it. The one owner it fired for would have been
 * the one whose cat is refusing food.
 *
 * One predicate, two callers — never a second copy of this rule (the diet-trial §5.3
 * lesson). The suppression's own reasoning stays at the call site below.
 */
function visibleFindings(
  findings: CachedFinding[],
  suppressTrialResponse: boolean,
): CachedFinding[] {
  return [...findings]
    .filter(
      (f) =>
        !(
          suppressTrialResponse &&
          isTrialResponse(f.finding) &&
          f.finding.comparisonDirection === 'fewer_during_trial'
        ),
    )
    .sort((a, b) => a.rank - b.rank);
}

// The card stack — findings are already ranked server-side (safety leads, then
// the pet's context-lead type, then tier — §5/§8); we render in that order and
// only add the visual rhythm. Hairline dividers between rows keep one container
// reading as a quiet list, not a wall of boxes.
function LiveStack({
  findings,
  petName,
  trialRunning,
  suppressTrialResponse,
  arrival = null,
  fold,
}: {
  findings: CachedFinding[];
  petName: string;
  trialRunning: boolean;
  suppressTrialResponse: boolean;
  /** CUL-601 (§4) — non-null only while the arrival plays. The lead crossfades in
   *  across 400–900ms; everything below it settles across 900–1200ms. Null on every
   *  other render, so the shipped stack is untouched (no wrapper, no opacity node). */
  arrival?: ArrivalMoment | null;
  /** CUL-784 — this reader's fold state + actions (fold spec §6). */
  fold: SignalFoldApi;
}) {
  // B-789 (§5.2) — drop the trial_response card when the record shows the animal isn't eating
  // (`suppressTrialResponse`, computed by Home from the same `trialInput` the strip withholds its
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
  const ordered = visibleFindings(findings, suppressTrialResponse);
  return (
    <View>
      {ordered.map((f, i) => {
        // CUL-784 (fold spec §6 / DF-7): ORDER IS RANK — a fold changes height, never
        // position — and `isLead` stays bound to rank 0 whether or not that row is folded.
        // A benign card is never promoted to the Newsreader canvas because the safety card
        // above it was compacted (reassurance by layout). The strip is chosen only when the
        // type has strip copy on this build — the same predicate `canFold` gates upstream —
        // so a finding is never dropped for want of a strip (FS-7).
        const folded = fold.stateOf(f.finding) === 'folded' && stripNameLine(f.finding) !== null;
        const row = (
          <>
            {i > 0 && <Divider style={styles.rowDivider} />}
            {/* SR-3 register (§5.1) — the lead (rank 0) keeps the enlarged canvas; secondary
                rows compress into a tighter rhythm. SR-5 (§3.4) threads trialRunning for the
                falling reflection's mid-trial adjacency line. */}
            {folded ? (
              <FoldedStrip cached={f} onPress={fold.unfold} />
            ) : (
              <InsightCard
                cached={f}
                petName={petName}
                isLead={i === 0}
                compact={i > 0}
                trialRunning={trialRunning}
                onFold={fold.fold}
                backBecause={fold.backBecauseOf(f.finding)}
                onTouch={fold.touch}
              />
            )}
          </>
        );
        const key = `${f.finding.type}-${f.rank}`;
        if (!arrival) return <View key={key}>{row}</View>;
        return (
          <Animated.View key={key} style={{ opacity: i === 0 ? arrival.crossfade : arrival.tail }}>
            {row}
          </Animated.View>
        );
      })}
    </View>
  );
}

// ── SR-2 empty states (B-721 §6) — E1 (building) + E2 (no_pattern) ─────────────
// E1 shows the SHAPE of what's coming: ghosted receipts (a dot lane + a stacked
// compare), hollow dots, and DASHES where a real receipt would print a count — never a
// fabricated number (§6). E2 is the mature
// "nothing established" record: the verbatim B-284 §9 copy + the top B-053 coverage
// diagnostic, restyled into the card rhythm. Neither reads absence as wellness.

// The E1-vs-E1-c intensity pick (§6) — the ONE open design decision of this PR,
// resolved on the PM's device at QA. Ships as E1-c, the COLOR pass: accent + slate
// washes at ghost opacity, the day counter in accent ink. (Dialing a drawn color
// pass down on-device is easier than imagining it on a neutral build, so E1-c is the
// QA starting point.) Every tunable lives in this ONE object so the decision is a
// single edit, never a hunt through the stylesheet:
//   • plain E1 (neutral ghost): rails → colorTickIdle at 0.85; band 0.05; dots →
//     colorTickIdle; compare 0.25; dayCount → colorTextPrimary / weightRegular.
//   • "somewhere between": nudge the opacities.
// Rose is deliberately absent — no alarm tone on a state with nothing to report. The
// row-2 slate is colorEventMedication (a slate-blue WORLD hue); at ghost opacity on a
// building-state rail it reads as a neutral slate, never a medication cue.
const GHOST = {
  rails: [theme.colorAccent, theme.colorEventMedication, theme.colorAccent] as const,
  railOpacity: 0.35,
  band: theme.colorAccent,
  bandOpacity: 0.12,
  dotInWindow: theme.colorAccent,
  dotOutWindow: theme.colorTickIdle, // the honest exception: present but pale
  compareFill: theme.colorAccent,
  compareFillOpacity: 0.4,
  dayCountColor: theme.colorAccentInk,
  dayCountWeight: theme.weightSemibold,
} as const;

function BuildingStateV2({
  petName,
  dayNumber,
  eventCount,
  gapRow,
  needRows,
}: {
  petName: string;
  dayNumber: number;
  eventCount: number;
  gapRow: WatchingRow | null;
  needRows: WatchingRow[];
}) {
  // CUL-14 — when a lane qualifies, the real-count watching rows replace the abstract
  // "what we're watching for" ghost list (their concrete form) while the headline stays.
  // The watching area carries its own safety floor, so the else-branch (the B-721 E1
  // ghost list) still owns the sub / BUILDING_FLOOR — no doubling. No qualifying row
  // renders the ghost list. B-769 (D3a): gap in its own register above the needs block.
  const showGap = gapRow !== null;
  const showNeeds = needRows.length > 0;
  const showWatching = showGap || showNeeds;
  return (
    <View>
      {/* eventCount 0 ⇒ the pre-read sentinel (a real building pet always has ≥1 recent
          event — deriveDisplayState requires hasRecentActivity), so hold the day-count
          clause back for that one load frame rather than flash a fabricated
          "Day 1 — 0 events so far". Once the local read lands it renders in full. */}
      <ThemedText
        style={styles.v2Headline}
        accessibilityLabel={
          eventCount > 0 ? buildingHeadline(petName, dayNumber, eventCount) : buildingHeadlineLead(petName)
        }
      >
        {buildingHeadlineLead(petName)}
        {eventCount > 0 ? (
          <ThemedText style={[styles.v2DayCount, { color: GHOST.dayCountColor, fontWeight: GHOST.dayCountWeight }]}>
            {' '}
            {buildingDayCount(dayNumber, eventCount)}
          </ThemedText>
        ) : null}
      </ThemedText>

      {showWatching ? (
        <View>
          {showGap && gapRow ? <GapEscalationRow row={gapRow} /> : null}
          {showNeeds ? <WatchingNeedsBlock rows={needRows} /> : null}
          <ThemedText style={styles.watchingFloor}>{BUILDING_FLOOR}</ThemedText>
        </View>
      ) : (
        <>
          {/* B-735 (D5a): once the day count outruns the sub's own first-week promise,
              the sub swaps to the events-not-days framing — "Day 24" must never sit
              above "within the first week" (the sparse-logger dissonance). */}
          <ThemedText style={styles.v2Sub}>{buildingSub(dayNumber)}</ThemedText>

          {/* The three things the engine is building toward, in the mock's order
              (timing → food → change), each with a ghost preview of its future receipt.
              Every row carries a top hairline — the first one separates the list from the
              sub-line above (matching the mock's three-divider rhythm). */}
          <WatchingForRow text={BUILDING_WATCHING_FOR[0]} railColor={GHOST.rails[0]}>
            <GhostLane />
          </WatchingForRow>
          <WatchingForRow text={BUILDING_WATCHING_FOR[1]} railColor={GHOST.rails[1]} />
          <WatchingForRow text={BUILDING_WATCHING_FOR[2]} railColor={GHOST.rails[2]}>
            <GhostCompare />
          </WatchingForRow>

          {/* The safety floor — the weekly-pattern framing must never read as "nothing
              urgent surfaces before then". Absence is never wellness (§6). */}
          <ThemedText style={styles.v2Floor}>{BUILDING_FLOOR}</ThemedText>
        </>
      )}
    </View>
  );
}

function WatchingForRow({
  text,
  railColor,
  children,
}: {
  text: string;
  railColor: string;
  children?: ReactNode;
}) {
  return (
    <View style={styles.watchRow}>
      <View style={[styles.ghostRail, { backgroundColor: railColor, opacity: GHOST.railOpacity }]} />
      <View style={styles.watchBody}>
        <ThemedText style={styles.watchText}>{text}</ThemedText>
        {children}
      </View>
    </View>
  );
}

// Ghosted dot lane — the SHAPE of a timing receipt (Shape A) before any real episode
// exists: hollow dots, a tinted "window" band, and one pale out-of-window dot (the
// honest exception — §4 "the exceptions are the honesty"). No axis numbers, no counts.
const GHOST_LANE_DOTS = [
  { left: '8%', inWindow: true },
  { left: '15%', inWindow: true },
  { left: '21%', inWindow: true },
  { left: '62%', inWindow: false },
] as const;

function GhostLane() {
  return (
    <View style={styles.estrip}>
      <View style={styles.ghostLane}>
        <View style={[styles.ghostBand, { backgroundColor: GHOST.band, opacity: GHOST.bandOpacity }]} />
        {GHOST_LANE_DOTS.map((d) => (
          <View
            key={d.left}
            style={[
              styles.ghostDot,
              { left: d.left, borderColor: d.inWindow ? GHOST.dotInWindow : GHOST.dotOutWindow },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

// Ghosted stacked-compare — the SHAPE of a change receipt (Shape C): two labeled
// rows, proportional bars at ghost opacity, and DASHES for the counts. A real
// week-over-week compare prints numbers here; the building state must not invent them
// (§6 — "dashes for counts, never fake numbers").
const GHOST_COMPARE_ROWS = [
  { label: 'Last week', fill: '40%' },
  { label: 'This week', fill: '65%' },
] as const;

function GhostCompare() {
  return (
    <View style={styles.estrip}>
      {GHOST_COMPARE_ROWS.map((r) => (
        <View key={r.label} style={styles.cmpRow}>
          <ThemedText style={styles.cmpLabel}>{r.label}</ThemedText>
          <View style={styles.cmpTrack}>
            <View
              style={[
                styles.cmpFill,
                { width: r.fill, backgroundColor: GHOST.compareFill, opacity: GHOST.compareFillOpacity },
              ]}
            />
          </View>
          {/* geist-ok: typographic separator, not copy and not an icon — the em-dash placeholder
              a comparison row shows in place of a bar. It stays raw so it inherits nothing and
              asserts nothing; the B-745 GlyphSvg migration does NOT own it. CUL-364 §7. */}
          <Text style={styles.cmpDash}>—</Text>
        </View>
      ))}
    </View>
  );
}

// E2 — mature record, nothing established. The verbatim B-284 §9 copy (headline +
// dimmed sub), then the top B-053 coverage diagnostic as the one calm corrective
// (shipped behavior, restyled). No coverage diagnostic → the §9 copy stands alone.
// The sub line is load-bearing: "isn't an all-clear" — absence is never wellness.
function NoPatternStateV2({
  petName,
  coverage,
  gapRow,
  needRows,
}: {
  petName: string;
  coverage: CoverageDiagnostic[];
  gapRow: WatchingRow | null;
  needRows: WatchingRow[];
}) {
  // CUL-14 — additive watching rows. No qualifying row renders the slots as null, so the
  // E2 tree is unchanged. B-769 (D3a): the gap escalation renders directly under the
  // "isn't an all-clear" sub — ABOVE the coverage nag, which is exactly the ordering
  // Principle 3 requires (an escalation never sits below a data-quality corrective).
  const showGap = gapRow !== null;
  const showNeeds = needRows.length > 0;
  const top = coverage[0];
  const cov = top ? coverageCopy(top, petName) : null;
  return (
    <View>
      <ThemedText style={styles.v2Headline}>{NO_PATTERN_HEADLINE}</ThemedText>
      <ThemedText style={styles.v2Sub}>{NO_PATTERN_SUB}</ThemedText>
      {showGap && gapRow ? <GapEscalationRow row={gapRow} /> : null}
      {cov ? (
        <View style={styles.v2Quiet}>
          <ThemedText style={styles.v2QuietText}>{cov.why}</ThemedText>
          {cov.action ? <ThemedText style={styles.v2QuietAction}>{cov.action}</ThemedText> : null}
        </View>
      ) : null}
      {showNeeds ? <WatchingNeedsBlock rows={needRows} /> : null}
      {showGap || showNeeds ? <ThemedText style={styles.watchingFloor}>{BUILDING_FLOOR}</ThemedText> : null}
    </View>
  );
}

// ── CUL-14 the watching system (§4.4 / D5 / G8), split by register (B-769 D3a) ──
// The per-lane real-count rows. The NEEDS rows (timing / change) keep the WATCHING_SUB
// "still needs" framing — they are statements about what a lane's math requires. The GAP
// row is different in kind: an escalate-only FACT about the record, so it renders
// through GapEscalationRow in its own register, above the frame's other content, never
// under the "still needs" umbrella (a lone gap row under that sub mislabeled an
// escalation as an unmet need). PLAIN count-in-words rows — deliberately NO progress
// bar / dot-fill visual: R-5 ratified the count form precisely because it carries the
// "N of 6" progress WITHOUT a fill-the-dots visual's implied "a card is coming" (G8 —
// the count is the progress; it carries no promise). The rows are already ordered +
// gated (buildWatchingRows); the frames render the BUILDING_FLOOR line whenever any
// watching content shows (absence ≠ wellness — the weekly cadence must never read as
// "nothing urgent surfaces before then").
function WatchingNeedsBlock({ rows }: { rows: WatchingRow[] }) {
  return (
    <View>
      <ThemedText style={styles.watchingSub}>{WATCHING_SUB}</ThemedText>
      <View style={styles.watchingRows}>
        {rows.map((r) => (
          <ThemedText key={r.key} style={styles.watchingRow}>
            {r.text}
          </ThemedText>
        ))}
      </View>
    </View>
  );
}

// The escalate-only gap row, in its own register (B-769 D3a). Plain primary ink — no
// alarm color, no icon: plainness is the severity signal (S1), and the sentence now
// leads with its own direction cue ("are getting shorter" — D4), so placement + phrasing
// carry the register, not decoration.
function GapEscalationRow({ row }: { row: WatchingRow }) {
  return <ThemedText style={styles.gapEscalation}>{row.text}</ThemedText>;
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
  intro: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightBody,
    marginBottom: theme.space2,
  },
  rowDivider: {
    marginHorizontal: -theme.space1,
  },

  // ── CUL-601 (§4) — the arrival moment's two structural styles ────────────────
  // Both are applied only while the 1.2s plays; see the call sites for why.
  cardClip: {
    overflow: 'hidden',
  },
  arrivalStage: {
    overflow: 'hidden',
  },

  // ── SR-2 empty states (E1/E2) — the empty-state rhythm ──────────────────────
  v2Headline: {
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
    lineHeight: theme.lineHeightBody,
    marginBottom: theme.spaceMicro,
  },
  // The day-count clause — its color + weight come from GHOST (the E1-vs-E1-c pick),
  // applied inline; the size matches the surrounding headline so it reads as one line.
  v2DayCount: {
    fontSize: theme.textMD,
  },
  v2Sub: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightSM,
    marginBottom: theme.space1,
  },
  // A "watching for" row — a ghost rail + the named thing + an optional ghost receipt.
  // Every row carries a top hairline; the first row's separates the list from the
  // sub-line above (the mock's three-divider rhythm).
  watchRow: {
    flexDirection: 'row',
    gap: theme.space1,
    paddingVertical: theme.space1,
    borderTopWidth: 1,
    borderTopColor: theme.colorBorder,
  },
  ghostRail: {
    width: 3,
    borderRadius: 2,
    // backgroundColor + opacity applied inline from GHOST.
  },
  watchBody: {
    flex: 1,
    minWidth: 0,
  },
  watchText: {
    fontSize: theme.textSM,
    color: theme.colorTextTertiary,
    lineHeight: theme.lineHeightSM,
  },
  // Ghost receipts — the previews of a real Shape-A lane / Shape-C compare.
  estrip: {
    marginTop: theme.space1,
  },
  ghostLane: {
    height: 22,
    borderRadius: theme.radiusSmall,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderStyle: 'dashed',
    position: 'relative',
  },
  ghostBand: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: '26%',
    borderRadius: theme.radiusSmall,
    // backgroundColor + opacity applied inline from GHOST.
  },
  ghostDot: {
    position: 'absolute',
    top: '50%',
    // Center the 7pt dot on its left% / vertical midpoint (RN has no translate-by-%).
    marginTop: -3.5,
    marginLeft: -3.5,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    borderWidth: 1.5,
    backgroundColor: 'transparent', // hollow — nothing here is logged yet
    // left + borderColor applied inline.
  },
  cmpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
    marginTop: theme.spaceMicro,
  },
  cmpLabel: {
    width: 72,
    fontSize: theme.textXS,
    color: theme.colorTextDisabled,
  },
  cmpTrack: {
    flex: 1,
    height: 8,
    borderRadius: theme.radiusXS,
    backgroundColor: theme.colorChartEmpty,
    overflow: 'hidden',
  },
  cmpFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: theme.radiusXS,
    // width + backgroundColor + opacity applied inline.
  },
  cmpDash: {
    width: 28,
    textAlign: 'right',
    fontSize: theme.textXS,
    color: theme.colorTextDisabled,
  },
  // The quiet block under E2 — the coverage diagnostic, hairline-set-off like the
  // shipped states' bottom rhythm.
  v2Quiet: {
    borderTopWidth: 1,
    borderTopColor: theme.colorBorder,
    marginTop: theme.space2,
    paddingTop: theme.space1,
  },
  v2QuietText: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightSM,
  },
  v2QuietAction: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
    lineHeight: theme.lineHeightSM,
    marginTop: theme.spaceMicro,
  },
  // The E1 safety-floor line — same hairline-set-off treatment as E2's quiet block.
  v2Floor: {
    borderTopWidth: 1,
    borderTopColor: theme.colorBorder,
    marginTop: theme.space2,
    paddingTop: theme.space1,
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightSM,
  },

  // ── CUL-14 watching block (§4.4) — the sub, the real-count rows, the floor line ──
  // The intro above the rows: what we're watching, secondary weight (it orients; the
  // rows carry the facts). Matches the v2Sub tier so the block reads as one register
  // within the empty-state frame.
  watchingSub: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightSM,
    marginBottom: theme.space1,
  },
  // The rows sit as a quiet list — small gaps, no rails/dots/bars (R-5: count-in-words,
  // never a fill-the-dots visual that reads as a game / a promise a card is coming).
  watchingRows: {
    gap: theme.spaceMicro,
  },
  // B-769 (D3a) — the gap escalation's own register: primary ink like the needs rows
  // (S1: plainness is the severity signal — no rose, no icon), set apart by position
  // (above the frame's other content) and its own breathing room, never by decoration.
  gapEscalation: {
    fontSize: theme.textSM,
    color: theme.colorTextPrimary,
    lineHeight: theme.lineHeightBody,
    marginBottom: theme.space2,
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
  // One row: the primary-ink fact ("Timing — 4 of the 6 …"), body line-height so a
  // wrapped row stays legible. No color/severity coding — every row is the same calm ink.
  watchingRow: {
    fontSize: theme.textSM,
    color: theme.colorTextPrimary,
    lineHeight: theme.lineHeightBody,
  },
  // The block's own safety-floor line — the same hairline-set-off treatment as v2Floor,
  // owned here so the block carries the floor into the shipped frame too (which has none).
  watchingFloor: {
    borderTopWidth: 1,
    borderTopColor: theme.colorBorder,
    marginTop: theme.space2,
    paddingTop: theme.space1,
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightSM,
  },
});
