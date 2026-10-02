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
// finding, so there is nothing for the line to qualify.
//
// "All patterns ›" is the zone's door to Patterns, in the place the shipped footer's
// "See all of {pet}'s patterns →" held (the flag-off footer is untouched).

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

export function SignalZoneFoot({ petName, showDisclaimer }: { petName: string; showDisclaimer: boolean }) {
  return (
    <View style={showDisclaimer ? styles.foot : [styles.foot, styles.footLinkOnly]} testID="signal-zone-foot">
      {showDisclaimer ? (
        <ThemedText style={styles.disclaimer} testID="signal-zone-disclaimer">
          {notADiagnosisLine(petName)}
        </ThemedText>
      ) : null}
      <Pressable
        onPress={() => router.push('/insights')}
        hitSlop={FOOT_LINK_HITSLOP}
        accessibilityRole="button"
        accessibilityLabel={`All of ${petName}'s patterns`}
        style={styles.link}
        testID="signal-zone-patterns"
      >
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
  footLinkOnly: {
    justifyContent: 'flex-end',
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
