import { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { theme } from '../../constants/theme';
import { CompletionMark, PrimaryButton, ThemedText } from '../ui';
import { COMPLETION_MOTION, CARD_CLOCK_END_MS, EASE, easedSegment, type CompletionMarkMotion } from '../motion/completionMotion';
import { reducedMotionNow } from '../../store/reducedMotionStore';
import { SendCallCard } from './SendCallCard';
import type { ConfirmationCopy, SendCallCard as SendCallCardModel } from '../../lib/reportSend';

// The confirmation after a send (Vet report v2 PR-18, CUL-2298; spec §10.5, §14; mock e1, e2).
// A C-17 card: it names the pet, the window and how the report left, in the status words
// `sendStatusWords` chose for what the platform actually reported.
//
// THE CALM TONE FOR EVERY REPORT, NEVER BRANCHED ON CONTENT. The arrival is `completionMotion`'s
// beats on the calm tone (no halo, ever): the card fades and rises, and on a quiet send the check
// writes itself. Nothing here celebrates a first report.
//
// A FLAGGED SEND: NO CHECK, NO HAPTIC, AND THE CALL ROW REPEATS ABOVE DONE (§0.2, GAP-12, AC-11).
// "Flagged" is anything but a live read that answered "none": a read that failed is treated as
// flagged, the louder side. No send fires a haptic at all, flagged or not, so silence never has
// to be branched on; this file is named in `guards/haptics.test.ts`'s ALWAYS_SCANNED so a buzz
// added here reds the build.
//
// "SAVED" IS NOT SAID. Saved copies are VR2-20; until a copy is kept, the card claims only how
// the report left, and "Open in Reports" waits for the library (VR2-21).

interface Props {
  copy: ConfirmationCopy;
  /**
   * True only when the live read answered "none" (`sendIsQuiet`): the one case the check shows.
   * Passed, never inferred from a null card, so a flagged read that somehow yields no card
   * still gets no check (code review on CUL-2298).
   */
  quiet: boolean;
  /** The call card to repeat above Done, or null when there is none to repeat. */
  card: SendCallCardModel | null;
  onDone: () => void;
}

const M = COMPLETION_MOTION;

export function SendConfirmation({ copy, quiet, card, onDone }: Props) {
  // One linear native clock, each beat a clamped segment of it (completionMotion's engine rule).
  // Reduce Motion starts the clock at its end: everything at rest in the first frame.
  const reduced = useRef(reducedMotionNow()).current;
  const clock = useRef(new Animated.Value(reduced ? CARD_CLOCK_END_MS : 0)).current;
  const nodes = useMemo(() => {
    const zero = new Animated.Value(0);
    const one = new Animated.Value(1);
    const mark: CompletionMarkMotion = {
      disc: easedSegment(clock, 0, M.groundInMs, M.discFromScale, 1, EASE.disc),
      write: easedSegment(clock, M.checkDelayMs, M.checkWriteMs, 0, 1, EASE.pen),
      halo: zero,
      layers: one,
    };
    return {
      fade: easedSegment(clock, 0, M.groundInMs, 0, 1, EASE.fade),
      rise: easedSegment(clock, 0, M.groundInMs, M.riseFromPt, 0, EASE.fade),
      words: easedSegment(clock, M.labelBeatMs, M.labelFadeMs, 0, 1, EASE.words),
      mark,
    };
  }, [clock]);

  useEffect(() => {
    if (reduced) return undefined;
    const run = Animated.timing(clock, {
      toValue: CARD_CLOCK_END_MS,
      duration: CARD_CLOCK_END_MS,
      easing: EASE.linear,
      useNativeDriver: true,
    });
    run.start();
    return () => run.stop();
  }, [clock, reduced]);

  return (
    <Animated.View
      style={[styles.ground, { opacity: nodes.fade, transform: [{ translateY: nodes.rise }] }]}
      testID="send-confirmation"
    >
      <View style={styles.middle}>
        {quiet && (
          <View testID="send-confirmation-check">
            <CompletionMark halo={false} motion={nodes.mark} />
          </View>
        )}
        <Animated.View style={[styles.words, { opacity: nodes.words }]}>
          <ThemedText style={styles.title} accessibilityRole="header">
            {copy.title}
          </ThemedText>
          <ThemedText style={styles.line} testID="send-confirmation-line">
            {copy.line}
          </ThemedText>
        </Animated.View>
      </View>
      <View style={styles.foot}>
        {!quiet && card && <SendCallCard card={card} testID="send-confirmation-call-card" />}
        <PrimaryButton label="Done" onPress={onDone} testID="send-confirmation-done" />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  ground: {
    ...StyleSheet.absoluteFill,
    backgroundColor: theme.colorSurface,
    padding: theme.space2,
    justifyContent: 'space-between',
  },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.space2 },
  words: { alignItems: 'center', gap: theme.space1 },
  title: { fontSize: theme.textLG, fontWeight: theme.weightSemibold, color: theme.colorTextPrimary, textAlign: 'center' },
  line: { fontSize: theme.textSM, color: theme.colorTextSecondary, textAlign: 'center' },
  foot: { gap: theme.space2 },
});
