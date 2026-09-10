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
//     Saved · 7:12 ›
//     While Pixel's eating needs attention, Home keeps quiet days off the card — an
//     ordinary day isn't a sign she's well. Your answer is in her record ›
//
// The ACT and the HOUR stay, because a wordless entry with neither reads as a failed save
// (Sam). The REASON stays, because a destination is not a reason (the round-3 product
// read) and a completion surface that says only *Saved* is the state the completion system
// exists to prevent. The record is one tap away, because the words ARE saved and she is
// entitled to check. What Home refuses to do is draw *nothing unusual* — or count the days
// it was said — one card below a live concern.
//
// The copy is verbatim from §3.3 and is not this component's to reword. `nyx-voice`: it
// names the pet, states the app's own act in plain words, makes no claim about how she is,
// and carries no exclamation.

import { StyleSheet, Pressable, View } from 'react-native';
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

export function LookWithheldEntry({
  occurredAt,
  petName,
  sex,
  onOpenRecord,
  testID,
}: {
  occurredAt: string;
  petName: string;
  sex: 'male' | 'female' | 'unknown';
  onOpenRecord: () => void;
  testID?: string;
}) {
  const { fill, ring } = nodeDotColors('look', NODE_TINT_DAY, theme.colorSurface);
  const time = formatTime(new Date(occurredAt));
  const reason = lookWithheldReason(petName, sex);
  return (
    // ONE responder over the whole entry, and `accessible` so the act, the hour and the
    // reason announce as one sentence rather than three fragments — the reason is the half
    // that makes the other two make sense, and a screen reader must not be able to reach
    // the wordless act without it (C-7's split-by-host rule, in its interactive arm: this
    // branch DOES have a destination, so it keeps the touchable).
    <Pressable
      onPress={onOpenRecord}
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${LOOK_WITHHELD_ACT} ${time}. ${reason}`}
      accessibilityHint="Opens this look in the record"
      hitSlop={8}
      style={styles.entry}
      testID={testID ?? 'look-withheld-entry'}
    >
      <View style={styles.head}>
        <View style={[styles.ring, { backgroundColor: fill, borderColor: ring }]} />
        {/* The act, in the quiet register the observed-absence row takes (L-16) — this
            entry is never the headline on its own card. */}
        <ThemedText style={styles.act}>{LOOK_WITHHELD_ACT}</ThemedText>
        <ThemedText style={styles.time}>{time}</ThemedText>
        <ThemedText style={styles.chevron}>›</ThemedText>
      </View>
      {/* Its own line, under the head — an entry and its reason are two kinds of thing and
          never share a line (T-15), and the chevron above must not be pushed off the row
          by a sentence this long. */}
      <ThemedText style={styles.reason}>{reason}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  entry: { paddingVertical: theme.space1 },
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
  reason: {
    fontSize: theme.textXS,
    lineHeight: theme.lineHeightXS,
    color: theme.colorTextSecondary,
    // Aligned under the words rather than under the ring, so the reason reads as the
    // entry's own second line and not as a new item in the list.
    marginLeft: NODE_DOT_SIZE + theme.space1,
    marginTop: theme.space0_5,
  },
});
