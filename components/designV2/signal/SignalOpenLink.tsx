import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../../../constants/theme';
import { SectionLabel } from '../../ui/SectionLabel';
import { ThemedText } from '../../ui/ThemedText';

// SignalOpenLink — the Signal zone's header row under Design v2 (D2-3 · CUL-1065; the
// mock's "Signal            Open ›"): the section label with the door beside it. The
// same door as the lead card's face, drawn where the eye lands first; a second way in,
// never a second destination.

export const OPEN_LABEL = 'Open';

/**
 * C-5: the link and the lead face below it are adjacent touchables. The face reaches 8pt
 * UP (`FACE_HITSLOP.top`) across the header row's 8pt `marginBottom`, so the link reaches
 * 0 DOWN — the two slops facing across the gap sum to the gap, never past it. The 44pt
 * floor is reached upward and sideways (the row's own 28pt box + 8 + 8). Pinned off the
 * flattened style in `SignalZone.designV2.test.tsx`.
 */
export const LINK_HITSLOP = { top: 8, left: 8, right: 8, bottom: 0 } as const;
/** The header row's gap to the first face, the other half of the arithmetic above. */
export const HEADER_ROW_GAP = theme.space1;

interface Props {
  petName: string;
  onOpen: () => void;
  /** The shipped label's receded style, threaded from the zone. */
  labelStyle?: Parameters<typeof SectionLabel>[0]['style'];
}

export function SignalOpenLink({ petName, onOpen, labelStyle }: Props) {
  return (
    <View style={styles.row} testID="signal-open-row">
      <SectionLabel label="Signal" header style={labelStyle} />
      <Pressable
        onPress={onOpen}
        hitSlop={LINK_HITSLOP}
        accessibilityRole="button"
        accessibilityLabel={`Open ${petName}'s signal`}
        style={styles.link}
        testID="signal-open-link"
      >
        <ThemedText style={styles.linkText}>{OPEN_LABEL}</ThemedText>
        {/* geist-ok: Icon glyph, not copy — stays a raw <Text> (the strips' chevron). */}
        <Text style={styles.chevron}>›</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: HEADER_ROW_GAP,
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space0_5,
    minHeight: 28,
  },
  linkText: {
    fontSize: theme.textXS,
    fontWeight: theme.weightMedium,
    color: theme.colorAccentInk,
  },
  chevron: {
    fontSize: theme.textLG,
    color: theme.colorTextSecondary,
    lineHeight: theme.textLG + 2,
  },
});
