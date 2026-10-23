import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { theme } from '../../../constants/theme';
import { ThemedText } from '../../ui/ThemedText';

// SignalZoneFoot — the Signal zone's last line under Design v2 (CUL-1270 · D1 = B; the
// mock's "A read of Nyx's logs, not a diagnosis.        All patterns ›").
//
// "Not a diagnosis" is said ONCE, for the whole zone. As built, every card's sentence
// ended with it, so a sick day read it three times in a row; the sentences now live on each
// finding's screen (where the server's own line still carries it), and Home states it here.
// It renders only when the zone is showing findings: an empty state reads no logs as a
// finding, so there is nothing for the line to qualify. The quiet states take round 7's
// foot instead (CUL-1838): the vet's call signs and the vet report.
//
// "All patterns ›" is the zone's door to Patterns, in the place the pre-redesign footer's
// "See all of {pet}'s patterns →" held (retired with it at Design v2's GA, CUL-1071).

export const PATTERNS_DOOR_LABEL = 'All patterns';

export function notADiagnosisLine(petName: string): string {
  return `A read of ${petName}'s logs, not a diagnosis.`;
}

/**
 * C-5: the last Signal row above is a slop-free door whose own box is its target, so the
 * link reaches 0 upward (the foot's `marginTop` is then free space, never shared) and 8 on
 * every other side. The 44pt floor is the link's own 36pt box plus the 8 it reaches down
 * into the card's padding.
 */
export const FOOT_LINK_HITSLOP = { top: 0, left: 8, right: 8, bottom: 8 } as const;
export const FOOT_MARGIN_TOP = theme.space1;
export const FOOT_LINK_MIN_HEIGHT = 36;

/** The quiet foot's two doors sit at the row's two ends (round 7 of the Signal mock); C-5
 *  needs their facing reach apart: 8 + 8. */
export const QUIET_FOOT_GAP = FOOT_LINK_HITSLOP.right + FOOT_LINK_HITSLOP.left;

/** The vet door, resolved by the zone: its words (`signalDoorLabel`) and what it opens. */
export interface SignalVetDoor {
  label: string;
  onPress: () => void;
}

/**
 * `live` — a finding is drawn: "not a diagnosis" and the door to Patterns (CUL-1270).
 * `quiet` — the quiet line or the gap warning (CUL-1838): "When to call the vet ›" always
 * (absent only for a species the sheet has no signs for), and "Vet report ›" once anything
 * is logged. Patterns' door is not here: a quiet record has no pattern to open, and round 7
 * draws neither it nor the disclaimer (PM, 2026-10-15).
 */
export function SignalZoneFoot(
  props:
    | { mode: 'live'; petName: string }
    | { mode: 'quiet'; petName: string; vetDoor: SignalVetDoor | null; onReport: (() => void) | null },
) {
  if (props.mode === 'quiet') {
    const { vetDoor, onReport, petName } = props;
    if (!vetDoor && !onReport) return null;
    return (
      <View style={[styles.foot, styles.quietFoot]} testID="signal-zone-foot">
        {vetDoor ? (
          <Pressable
            onPress={vetDoor.onPress}
            hitSlop={FOOT_LINK_HITSLOP}
            accessibilityRole="button"
            // The visible words without the chevron glyph, which a screen reader would spell.
            // door-mark-ok: strips the link's own › from its spoken label.
            accessibilityLabel={vetDoor.label.replace(/\s*›$/, '')}
            style={styles.link}
            testID="signal-zone-vet-door"
          >
            <ThemedText style={styles.linkText}>{vetDoor.label}</ThemedText>
          </Pressable>
        ) : null}
        {onReport ? (
          <Pressable
            onPress={onReport}
            hitSlop={FOOT_LINK_HITSLOP}
            accessibilityRole="button"
            accessibilityLabel={`${petName}'s vet report`}
            style={[styles.link, styles.reportLink]}
            testID="signal-zone-report"
          >
            {/* door-mark-ok: a text link's words; the › is the link's copy. */}
            <ThemedText style={styles.linkText}>Vet report ›</ThemedText>
          </Pressable>
        ) : null}
      </View>
    );
  }
  const { petName } = props;
  return (
    <View style={styles.foot} testID="signal-zone-foot">
      <ThemedText style={styles.disclaimer} testID="signal-zone-disclaimer">
        {notADiagnosisLine(petName)}
      </ThemedText>
      <Pressable
        onPress={() => router.push('/insights')}
        hitSlop={FOOT_LINK_HITSLOP}
        accessibilityRole="button"
        accessibilityLabel={`All of ${petName}'s patterns`}
        style={styles.link}
        testID="signal-zone-patterns"
      >
        {/* door-mark-ok: a text link's words; the › is the link's copy. */}
        <ThemedText style={styles.linkText}>{`${PATTERNS_DOOR_LABEL} ›`}</ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: theme.space2,
    marginTop: FOOT_MARGIN_TOP,
  },
  // Round 7's foot: a hairline, then the vet door at the start and the report at the end.
  quietFoot: {
    columnGap: QUIET_FOOT_GAP,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colorBorder,
    paddingTop: theme.space1,
    marginTop: theme.space2,
  },
  reportLink: {
    marginLeft: 'auto',
  },
  disclaimer: {
    flex: 1,
    fontSize: theme.textXS,
    lineHeight: theme.lineHeightXS,
    color: theme.colorTextTertiary,
  },
  link: {
    minHeight: FOOT_LINK_MIN_HEIGHT,
    justifyContent: 'center',
  },
  linkText: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorAccentInk,
  },
});
