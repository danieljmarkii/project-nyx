// The WITHHELD entry — what Home draws instead of a quiet look's words when the record
// carries a live intake concern (CUL-873 / N-4b).
//
// docs/nyx-daily-look-requirements.md §2 item 12, §3.3, T-20; Dr. Chen's reassurance-
// ledger row 15.
//
// ── WHY IT IS ITS OWN FILE ───────────────────────────────────────────────────
// Two reasons, and both are structural rather than tidiness.
//
//  1. THE HAPTIC GUARD (C-16, T-10). `guards/haptics.test.ts` derives its scan set from
//     source markers — a `priorityClass`, an analysis row — and this component carries
//     none of them: it is copy over a deterministic predicate. It nonetheless renders
//     beside *Call your vet today*, and a buzz here would be the phone acknowledging bad
//     news. So it is named in `ALWAYS_SCANNED` by hand, exactly as N-4a named
//     `LookEmergencySheet.tsx`. Its sibling `LookCard.tsx` is deliberately NOT scanned:
//     the chip grid ticks on every tap (`selectChip`) and is not a safety surface. The
//     split by file IS the enforcement — C-16's own lesson that a scan set tracks where
//     the words are, and the words moved here.
//
//  2. THE SPLIT IS THE FEATURE. An entry that withholds and an entry that speaks are two
//     different claims about an animal, and keeping them one component with a flag is how
//     a later edit makes the withheld branch inherit a word.
//
// ── WHAT IT SAYS, AND WHY EACH HALF IS THERE ─────────────────────────────────
//     Saved · 7:12   Undo        ← the entry, one per look
//     While Pixel's eating needs attention, Home keeps quiet days off the card — an
//     ordinary day isn't a sign she's well. Your answer is in her record ›
//                                 ← the reason, ONCE per card
//
// The ACT and the HOUR stay, because a wordless entry with neither reads as a failed save
// (Sam). The REASON stays, because a destination is not a reason (the round-3 product
// read) and a completion surface that says only *Saved* is the state the completion system
// exists to prevent. The record is one tap away, because the words ARE saved and she is
// entitled to check. What Home refuses to do is draw *nothing unusual* — or count the days
// it was said — one card below a live concern.
//
// ── TWO THINGS THE PRODUCT REVIEW CHANGED ────────────────────────────────────
//
//  1. THE ENTRY KEEPS ITS UNDO. The first cut rendered a chevron only, so an owner in the
//     withheld state tapped *Nothing unusual* → Done → read a WORDLESS *Saved* → and had
//     no way back. That is the state most likely to be answered by mistake and the one
//     where a mis-tap looks most like a bug, and it was the only completion beat in the
//     app with neither a confirm nor a reversal (C-21: exactly one safety net, always).
//     What this state withholds is the WORDS. It was never the way back.
//
//  2. THE REASON RENDERS ONCE PER CARD, not once per entry. Two quiet looks under a live
//     concern stacked the same 26-word paragraph verbatim, and a repeated system message
//     is the most reliable way to make a designed state read as a defect. So the entry is
//     the act and the reason is `LookWithheldReasonLine`, drawn beneath the group — still
//     its own line, never shared with an entry (T-15), and still in this file so the
//     haptics scan covers both halves.
//
// The copy is verbatim from §3.3 and is not this component's to reword. `nyx-voice`: it
// names the pet, states the app's own act in plain words, makes no claim about how she is,
// and carries no exclamation.

import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Pressable, View } from 'react-native';
import { theme } from '../../constants/theme';
import { ThemedText } from '../ui/ThemedText';
import { NODE_DOT_RING, NODE_DOT_SIZE, NODE_TINT_DAY, nodeDotColors } from '../recap/nodeTints';
import { formatTime } from '../../lib/utils';
import { petPronouns } from '../../lib/utils';

/** The act — never *Logged* (C-17: a completion surface speaks the record). */
export const LOOK_WITHHELD_ACT = 'Saved';

/**
 * The reason, in the owner's register. A FUNCTION of the pet because it names her twice
 * and inflects: `pets.sex` is NOT NULL with an `unknown` member (E-15), and a line that
 * called a male dog "she" on the one card whose job is naming the right animal would be
 * the app losing the thread.
 */
export function lookWithheldReason(petName: string, sex: 'male' | 'female' | 'unknown'): string {
  const p = petPronouns(sex);
  return (
    `While ${petName}’s eating needs attention, Home keeps quiet days off the card — ` +
    `an ordinary day isn’t a sign ${p.subject} is well. Your answer is in ${p.possessive} record ›`
  );
}

/** The last half-second of the register's dwell, in which *Undo* fades before the chevron
 *  takes its slot (T-15). Imported rather than restated so the two components that render
 *  an entry cannot drift on the one number the owner feels. */
export const WITHHELD_UNDO_FADE_MS = 500;

export function LookWithheldEntry({
  occurredAt,
  petName,
  sex,
  undoLive,
  dwellMs,
  onUndo,
  onOpenRecord,
  testID,
}: {
  occurredAt: string;
  petName: string;
  sex: 'male' | 'female' | 'unknown';
  /** Is the register still offering the reversal for this row? Its AUTHORITY is the
   *  register's; this decides only which of the two controls sits in the slot. */
  undoLive: boolean;
  /** The register's own dwell, passed rather than imported so the fade is timed off the
   *  one clock that owns it. */
  dwellMs: number;
  onUndo: () => void;
  onOpenRecord: () => void;
  testID?: string;
}) {
  const { fill, ring } = nodeDotColors('look', NODE_TINT_DAY, theme.colorSurface);
  const time = formatTime(new Date(occurredAt));
  const undoOpacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!undoLive) return;
    const at = Math.max(0, dwellMs - WITHHELD_UNDO_FADE_MS);
    const timer = setTimeout(() => {
      Animated.timing(undoOpacity, {
        toValue: 0.35,
        duration: WITHHELD_UNDO_FADE_MS,
        useNativeDriver: true,
      }).start();
    }, at);
    return () => {
      clearTimeout(timer);
      undoOpacity.setValue(1);
    };
  }, [undoLive, dwellMs, undoOpacity]);

  // SPLIT BY HOST (C-7), and the split is what the two controls need: while Undo is live
  // the row holds a second, different destination, so a single responder over the whole
  // row would put "take that back" and "open the record" at one point. The chevron branch
  // takes the touchable; the Undo branch makes the row inert and gives Undo its own.
  const head = (
    <View style={styles.head}>
      <View style={[styles.ring, { backgroundColor: fill, borderColor: ring }]} />
      {/* The act, in the quiet register the observed-absence row takes (L-16) — this entry
          is never the headline on its own card. */}
      <ThemedText style={styles.act}>{LOOK_WITHHELD_ACT}</ThemedText>
      <ThemedText style={styles.time}>{time}</ThemedText>
    </View>
  );

  if (undoLive) {
    return (
      // `accessible` on an inert View so the act and the hour still announce as one
      // sentence beside their control, rather than as two fragments (C-7's inert arm).
      <View style={styles.entry} testID={testID ?? 'look-withheld-entry'}>
        <View style={styles.row}>
          <View style={styles.headWrap} accessible accessibilityLabel={`${LOOK_WITHHELD_ACT} ${time}`}>
            {head}
          </View>
          <Animated.View style={{ opacity: undoOpacity }}>
            <Pressable
              onPress={onUndo}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Undo. The look you just saved"
              testID={`${testID ?? 'look-withheld-entry'}-undo`}
            >
              <ThemedText style={styles.undo}>Undo</ThemedText>
            </Pressable>
          </Animated.View>
        </View>
      </View>
    );
  }

  return (
    <Pressable
      onPress={onOpenRecord}
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${LOOK_WITHHELD_ACT} ${time}`}
      accessibilityHint="Opens this look in the record"
      hitSlop={8}
      style={styles.entry}
      testID={testID ?? 'look-withheld-entry'}
    >
      <View style={styles.row}>
        <View style={styles.headWrap}>{head}</View>
        <ThemedText style={styles.chevron}>›</ThemedText>
      </View>
    </Pressable>
  );
}

/**
 * The reason — ONCE per card, beneath the withheld entries.
 *
 * Its own line (T-15) and its own component, because "once per card" is a fact about the
 * CARD and an entry cannot know it. It is a tappable line rather than prose: it ends by
 * pointing at the record, and a destination named in a sentence that cannot be tapped is
 * the round-3 product read's complaint in reverse.
 */
export function LookWithheldReasonLine({
  petName,
  sex,
  onOpenRecord,
  testID,
}: {
  petName: string;
  sex: 'male' | 'female' | 'unknown';
  onOpenRecord: () => void;
  testID?: string;
}) {
  const reason = lookWithheldReason(petName, sex);
  return (
    <Pressable
      onPress={onOpenRecord}
      accessible
      accessibilityRole="button"
      accessibilityLabel={reason}
      accessibilityHint="Opens the record"
      style={styles.reasonRow}
      testID={testID ?? 'look-withheld-reason'}
    >
      <ThemedText style={styles.reason}>{reason}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  entry: { paddingVertical: theme.space1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
  },
  headWrap: { flex: 1 },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
  },
  ring: {
    width: NODE_DOT_SIZE,
    height: NODE_DOT_SIZE,
    borderRadius: NODE_DOT_SIZE / 2,
    borderWidth: NODE_DOT_RING,
  },
  act: {
    flex: 1,
    fontSize: theme.textXS,
    lineHeight: theme.lineHeightXS,
    color: theme.colorTextSecondary,
  },
  time: {
    fontSize: theme.textXS,
    color: theme.colorTextSecondary,
  },
  chevron: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
  },
  reasonRow: {
    // Aligned under the words rather than under the ring, so the reason reads as the
    // group's own line and not as a new item in the list. 44pt by its box, so it needs no
    // slop of its own and the entry's control above it clears with its own 8 (C-5).
    marginLeft: NODE_DOT_SIZE + theme.space1,
    marginTop: theme.space1,
    minHeight: 44,
    justifyContent: 'center',
  },
  reason: {
    fontSize: theme.textXS,
    lineHeight: theme.lineHeightXS,
    color: theme.colorTextSecondary,
  },
  undo: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorAccentInk,
  },
});
