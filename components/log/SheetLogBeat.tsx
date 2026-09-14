import { useEffect, useRef } from 'react';
import { StyleSheet, Animated, Easing, View, TouchableOpacity, Alert } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { Check } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { ThemedText, fontFamilyForWeight } from '../ui/ThemedText';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useMomentStore } from '../../store/momentStore';
import { removedNoticeCopy, undoGateCopy, HITSLOP_ACTION_SOLO } from '../../lib/completionCard';
import type { MomentTone } from '../../store/momentStore';

// The completion beat that lands IN the sheet (B-745 PR 3). The root <CompletionMoment/>
// can't be reused here: it's absoluteFill at the app root, so it renders UNDER the
// sheet's Modal (which is why the full-screen /log flow dismisses first, then plays it).
// The one-surface confirm keeps Home in place, so the beat has to render inside the
// sheet — this is the compact, self-contained sibling, deliberately NOT a refactor of
// the shipped root component so the flag-off path is untouched.
//
// Same visual language as the named card: a mint check ring, a warm-gold glow only
// on the 'celebrate' tone (routine/Other logs), and a plain check for 'calm' (symptom
// logs — we never celebrate a worrying event; Principle 4 / clinical-guardrails). It
// defines a reduced-motion static frame (no spring, no bloom).
//
// ── WHAT CHANGED IN CUL-964, AND WHY THE STORE OWNS IT NOW ──────────────────
// This component used to own its own clock and its own haptic and carried no way
// back: `BEAT_MS` fired `onDone`, the sheet closed, and a mis-tap — Normal instead of
// Loose, the wrong pet, the wrong hour — was recoverable only through History →
// detail → Remove, because `app/edit-event.tsx` cannot change a row's `event_type`.
// The R1 named card states the house rule in its own header: "Undo renders
// UNCONDITIONALLY … an affordance that disappears on the records that need it most is
// not a safety net." At GA this sheet is the DEFAULT symptom path, so R2 not carrying
// one meant the rule stopped holding on the path most owners use.
//
// It is NOT fixed by giving this component a soft-delete. `momentStore.undo()` is the
// single route to `reverseLoggedEvent` (C-20, `guards/reversePath.test.ts`), and it
// refuses on `!payload` — so reaching it means BEING a presentation of that store
// rather than a component that reimplements it. The beat therefore paints off
// `payload` + `removed` exactly as `LookCard` does (C-33: what varies is who paints
// the beat, never who owns the reversal), and inherits four rules it was previously
// re-deriving or missing: the dwell clock, the touch pause, the staleness guard on
// the undo target, and the §5.6 commit haptic.
//
// THE DWELL IS THE STORE'S (`SHEET_BEAT_DWELL_MS`), and this component's only job
// around it is to tell the host when the register has dismissed — see `onDone`.

const GLOW_SIZE = 220;
const CHECK_RING_SIZE = 84;
// SVG gradient def id — internal, namespaced so it can't be hijacked by another
// SVG's gradient. Deliberately NOT `nyx-…`-prefixed: that prefix is reserved for
// Storage bucket names (storagePolicies.test scans for it), and this is neither.
const GLOW_GRADIENT_ID = 'culprit-sheet-beat-glow';

interface Props {
  tone: MomentTone;
  /**
   * The sentence this beat speaks — REQUIRED, and deliberately so (CUL-614 · §5's
   * sentence rule). It previously defaulted to 'Logged', which meant the R2 register
   * confirmed a "Found it" vomit with a word that named neither the event nor the
   * window the app had just written. Removing the default is the enforcement: a caller
   * has to compose the sentence through `lib/completionCard`, the same path History and
   * the vet report use, so this beat cannot claim more than the row holds — and cannot
   * quietly fall back to saying nothing.
   */
  title: string;
  /**
   * The pet whose record this landed on — rendered as R1's exact subline, "Saved to
   * {pet}'s record" (CUL-614's copy pass, nyx-voice Pattern 1).
   *
   * WHY THE BEAT HAS TO SAY IT. This beat REPLACES the confirm stage inside the sheet,
   * and the confirm's header ("Vomit — Nyx") is the only thing that named the pet. So
   * at the one moment the owner is told the write happened, the screen had stopped
   * saying whose record it happened to — on a surface whose pet was fixed several taps
   * earlier at grid→confirm and cannot be seen behind the sheet. In Sam's multi-pet
   * household that is the wrong-pet class, confirmed rather than caught.
   *
   * It is the same string the named card renders, deliberately: R1 and R2 are one
   * register in two shapes, so they should not describe the same act differently. It
   * comes as a VALUE rather than being resolved from a payload `petId` (C-9's usual
   * shape) because the sheet captured this pet at grid→confirm and nothing downstream
   * can re-read it — that capture IS the write-time identity here, and the removal
   * line below is deliberately built from the same one string.
   */
  petName: string;
  /**
   * The row this beat is speaking for. Passed rather than read off the store's payload
   * so the component and the register have to AGREE about which log is on screen: it
   * is what `undo()` is handed, and `undo()` refuses an id that is no longer the one
   * the card rendered (the staleness guard). A beat that read the id out of the store
   * and handed it straight back would be checking the payload against itself.
   */
  eventId: string;
  /**
   * Fired once, when the REGISTER dismisses this beat — never on a clock of this
   * component's own (there is no longer one to disagree with).
   *
   * `removed` is the outcome, and the host needs it: the sheet pushes a photographed
   * vomit/stool onto its record after the beat (CUL-802), and a record the owner has
   * just removed is exactly the screen G5 forbids showing. So the flag travels with
   * the dismissal rather than being re-read from a store that has already moved on.
   */
  onDone: (removed: boolean) => void;
}

export function SheetLogBeat({ tone, title, petName, eventId, onDone }: Props) {
  const reduced = useReducedMotion();
  const celebrate = tone === 'celebrate';

  const visible = useMomentStore((s) => s.visible);
  const payload = useMomentStore((s) => s.payload);
  const storeRemoved = useMomentStore((s) => s.removed);
  const undo = useMomentStore((s) => s.undo);
  const pauseDwell = useMomentStore((s) => s.pauseDwell);
  const resumeDwell = useMomentStore((s) => s.resumeDwell);

  // Is the register still speaking for THIS log? Both halves matter: the kind, so a
  // card of another kind can never be painted by this component, and the id, so a
  // second commit arriving mid-dwell (`present()` swaps the payload in place) cannot
  // leave this beat describing the row that replaced it.
  const minePayload =
    payload?.kind === 'sheetBeat' && payload.eventId === eventId ? payload : null;
  const mine = minePayload !== null;
  const removed = mine && storeRemoved;

  const checkScale = useRef(new Animated.Value(reduced ? 1 : 0.6)).current;
  const surfaceOpacity = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const glowOpacity = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const glowScale = useRef(new Animated.Value(reduced ? 1 : 0.5)).current;

  // Fire onDone once — a ref so a re-render can't schedule two.
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  // ARMED ONLY ONCE THE REGISTER HAS ACTUALLY TAKEN THIS BEAT. Without the latch the
  // dismissal watcher below is indistinguishable from "the payload never arrived", and
  // the failure modes are opposite: a beat that fires `onDone` on its first frame
  // closes the sheet before anything is read. The host calls `showSheetBeat` in the
  // same handler that moves it to the 'done' stage, so in practice the first render is
  // already `mine` — this is what keeps a future host's ordering mistake visible as a
  // beat that lingers rather than one that flashes past.
  const armed = useRef(false);
  if (visible && mine) armed.current = true;

  useEffect(() => {
    let anim: Animated.CompositeAnimation | null = null;
    if (!reduced) {
      anim = Animated.parallel([
        Animated.timing(surfaceOpacity, { toValue: 1, duration: theme.durationFast, useNativeDriver: true }),
        Animated.spring(checkScale, { toValue: 1, useNativeDriver: true, tension: 60, friction: 7 }),
        ...(celebrate
          ? [
              Animated.timing(glowOpacity, { toValue: 1, duration: theme.durationFast, useNativeDriver: true }),
              Animated.timing(glowScale, { toValue: 1, duration: theme.durationSlow, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            ]
          : []),
      ]);
      anim.start();
    }
    return () => { anim?.stop(); };
  }, [reduced, celebrate, surfaceOpacity, checkScale, glowOpacity, glowScale]);

  // The dismissal. The register's clock decides when — after the dwell, after the
  // removal line's shorter one, or the instant a pause's ceiling gives up — so this
  // watcher is the whole of the beat's relationship with time.
  //
  // `removedAtDismissRef` rather than reading `removed` in the effect body: the store
  // keeps `removed` set through the fade, but the payload may already have been
  // superseded, and the host's decision (push to the record, or not) must describe the
  // log this beat spoke for.
  const removedAtDismissRef = useRef(false);
  if (removed) removedAtDismissRef.current = true;
  useEffect(() => {
    if (!armed.current) return;
    if (visible && mine) return;
    doneRef.current(removedAtDismissRef.current);
  }, [visible, mine]);

  async function runUndo(confirmed: boolean) {
    const result = await undo(eventId);
    if (result === 'failed') {
      Alert.alert('Could not remove that log', 'Try again, or remove it from History.');
    } else if (result === 'ignored' && confirmed) {
      // 'ignored' is SILENT on the bare tap — a second tap or an already-gone beat did
      // nothing wrong, and an error there teaches the owner Undo is unreliable
      // (momentStore's own reasoning). After an explicit confirm it is the opposite:
      // the owner asked for a removal and none happened, and saying nothing is the one
      // thing UndoResult's contract calls out as reading like "removed".
      Alert.alert(
        'That log is still saved',
        'Too much time passed to remove it here. You can still remove it from History.',
      );
    }
    // Only the 'removed' path arms its own hide (the removal dwell). Everything else
    // leaves a beat on screen with a pause to release.
    if (result !== 'removed') resumeDwell();
  }

  // Is the confirm dialog up? A ref, not state: nothing renders off it, and the value
  // has to be readable from a touch handler in the same gesture that opened the dialog
  // (see handleTouchEnd).
  const gateOpen = useRef(false);

  function handleUndo() {
    const gate = minePayload ? undoGateCopy(minePayload) : null;
    if (!gate) { void runUndo(false); return; }
    // Hold the beat open across the dialog. Without this the gate is worse than no
    // gate: the dwell runs from the reveal and is not reset by the Undo tap, so an
    // owner who taps late and reads the dialog for a second would be confirming
    // against a beat that has already dismissed — `undo()` then refuses on `!visible`,
    // returns 'ignored', and the log silently survives a removal they authorised.
    // (`pauseDwell` has a ~20s ceiling by design; runUndo says so if it happens anyway.)
    pauseDwell();
    gateOpen.current = true;
    Alert.alert(
      gate.title,
      gate.body,
      [
        { text: 'Keep it', style: 'cancel', onPress: releaseGate },
        {
          // No destructiveConfirm() here: undo() fires the rigid tap internally, which
          // puts it on THIS press — the confirm — exactly where History and the detail
          // screen put theirs. A haptic beside a live Cancel would say something was
          // destroyed while the owner can still back out.
          text: 'Remove',
          style: 'destructive',
          onPress: () => { gateOpen.current = false; void runUndo(true); },
        },
      ],
      // Android's back-button / scrim dismissal never reaches the cancel button's
      // onPress, and a pause left hanging would strand the beat for the ceiling's full
      // 20s. `releaseGate` is idempotent, so double-firing with Cancel is safe.
      { cancelable: true, onDismiss: releaseGate },
    );
  }

  function releaseGate() {
    gateOpen.current = false;
    resumeDwell();
  }

  // ── WHY THE RELEASE IS CONDITIONAL (the seam this component introduced) ──────
  // The root pause is wired to TOUCH, which covers the reading pause the three cards
  // needed. This beat is the first surface to combine that wiring with a confirm
  // dialog, and the two fight: the owner's finger lifts the instant the dialog appears,
  // so a bare `onTouchEnd={resumeDwell}` would hand back a full 5s window and the beat
  // would dismiss out from under the dialog — `undo()` then refuses on `!visible`,
  // returns 'ignored', and the log survives a removal the owner explicitly authorised.
  // That is the exact failure `pauseDwell` was added to the gate to prevent, walked
  // back in through the door the pause opened.
  //
  // So while the dialog is up the gesture is NOT over: the buttons own the release,
  // through the one path that also clears this flag. The named card never had to say
  // this because it never wired the touch pause at all.
  function handleTouchEnd() {
    if (gateOpen.current) return;
    resumeDwell();
  }

  const notice = removed ? removedNoticeCopy(petName) : null;
  // One announcement for a screen reader, not two: the label carries the sentence and
  // the pet together, in the order they are read on screen.
  const a11yLabel = notice ? notice.a11yLabel : `${title}. Saved to ${petName}’s record`;

  return (
    <Animated.View
      style={[styles.wrap, { opacity: surfaceOpacity }]}
      // §5's dwell rule, wired at the ROOT rather than on the control: touch events
      // fire for the whole gesture and bubble from every child, so the clock stops
      // while the owner is reading with a finger resting on the beat — which is when
      // the window was actually being lost — and no per-control wiring can forget it.
      onTouchStart={pauseDwell}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {celebrate && !removed && (
        <Animated.View style={[styles.glow, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]} pointerEvents="none">
          <Svg width={GLOW_SIZE} height={GLOW_SIZE}>
            <Defs>
              <RadialGradient id={GLOW_GRADIENT_ID} cx="50%" cy="50%" r="50%">
                <Stop offset="0%" stopColor={theme.colorMomentGlow} stopOpacity={0.22} />
                <Stop offset="45%" stopColor={theme.colorMomentGlow} stopOpacity={0.06} />
                <Stop offset="70%" stopColor={theme.colorMomentGlow} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={GLOW_SIZE / 2} cy={GLOW_SIZE / 2} r={GLOW_SIZE / 2} fill={`url(#${GLOW_GRADIENT_ID})`} />
          </Svg>
        </Animated.View>
      )}
      {/* The mark, and NOT over the removal line: a check above the word "Removed"
          would be two contradictory signals, and the quiet is the point. */}
      {!removed && (
        <Animated.View style={[styles.ring, celebrate && styles.ringCelebrate, { transform: [{ scale: checkScale }] }]}>
          <Check size={38} color={theme.colorMomentConfirm} strokeWidth={3} />
        </Animated.View>
      )}
      {/* A sentence, not a word: it wraps to two lines and centres, rather than
          overflowing the sheet's width. No numberOfLines cap — truncating would put
          the beat back in the business of saying less than the record holds. */}
      <View
        style={styles.labelCol}
        // `accessible` is load-bearing, not decoration: without it the label never
        // applies and the sentence and the subline stay two separate stops (CUL-682's
        // finding on the sheet's own title row).
        accessible
        accessibilityRole="summary"
        accessibilityLiveRegion="polite"
        accessibilityLabel={a11yLabel}
      >
        <ThemedText style={styles.title}>{notice ? notice.title : title}</ThemedText>
        <ThemedText style={styles.subLabel}>
          {notice ? notice.detail : `Saved to ${petName}’s record`}
        </ThemedText>
      </View>
      {/* Undo renders UNCONDITIONALLY while the row is still there — the R1 rule,
          inherited rather than restated: the records with no other in-place way back
          are exactly the ones a conditional affordance would drop. Once removed it is
          ABSENT, not disabled: a live "Undo" beside the word "Removed" offers to
          reverse a row that is no longer in the record (C-7). */}
      {!removed && (
        <TouchableOpacity
          onPress={handleUndo}
          hitSlop={HITSLOP_ACTION_SOLO}
          style={styles.undoBtn}
          accessibilityRole="button"
          accessibilityLabel="Undo — remove this log"
        >
          <ThemedText style={styles.undoText}>Undo</ThemedText>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space2,
    // A generous dwell area so the beat reads as a moment, not a toast; the sheet
    // caps its own height so this never over-grows.
    paddingVertical: theme.space5,
    overflow: 'hidden',
  },
  glow: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    width: CHECK_RING_SIZE,
    height: CHECK_RING_SIZE,
    borderRadius: CHECK_RING_SIZE / 2,
    backgroundColor: theme.colorSurface,
    borderWidth: 2,
    borderColor: theme.colorMomentConfirm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCelebrate: {
    shadowColor: theme.colorMomentGlow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 22,
    elevation: 6,
  },
  // One node, one announcement — the sentence and where it landed are read together,
  // in the order they appear, rather than as two orphan lines a screen reader
  // interrupts between.
  // One node, one announcement, and the same tight pairing the shipped beat had: the
  // wrap's `gap` is sized for the ring-to-title step, so the subline is pulled back up
  // against its own title and the two read as one block.
  labelCol: {
    alignItems: 'center',
  },
  title: {
    fontSize: theme.textXL,
    fontFamily: fontFamilyForWeight(theme.weightMedium),
    color: theme.colorNeutralDark,
    textAlign: 'center',
    // The sentence can reach two lines on a narrow device ("Loose stool · between
    // 2:00 PM and 5:33 PM"); keep it off the sheet's edges when it does.
    paddingHorizontal: theme.space3,
  },
  // Visually subordinate to the sentence, exactly as on the named card: the record is
  // the headline, where it landed is the reassurance underneath it.
  subLabel: {
    fontSize: theme.textSM,
    fontFamily: fontFamilyForWeight(theme.weightRegular),
    color: theme.colorTextSecondary,
    textAlign: 'center',
    paddingHorizontal: theme.space3,
    marginTop: theme.space1 * 0.25,
  },
  // A quiet pill on the sheet's light ground — subordinate to the mark and the
  // sentence, which is the right weight for a correction nobody usually needs. The
  // explicit 44pt floor is what carries the tap target: the visual height of a 13pt
  // label in a compact pill does not reach it on its own (CUL-579's class), and
  // pinning it here means the hitSlop above is reach, not rescue.
  undoBtn: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: theme.space2,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colorBorderStrong,
  },
  undoText: {
    fontSize: theme.textSM,
    fontFamily: fontFamilyForWeight(theme.weightMedium),
    color: theme.colorNeutralDark,
  },
});
