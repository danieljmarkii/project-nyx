import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { theme } from '../../constants/theme';
import { useLiveRegionAnnouncement } from '../../hooks/useLiveRegionAnnouncement';
import { OPEN_THE_READ, phoneWorkedOutLine, raisedReadLine } from '../../lib/incidentFloorWords';
import type { FloorAnnouncement } from '../../lib/incidentFloorPreview';
import { ThemedText } from './ThemedText';

// A read this log raised to a call, said on the log's completion card (Engines v3 PR-28b,
// CUL-1436; docs/nyx-incident-tiers-requirements.md §6 item 3, §8.5). One block for the
// named card, the meal card and the sheet's beat, so the three cannot say it three ways.
//
// The whole block is the door to the read ("Open the read"): one control, no hitSlop, a
// 44pt floor, and its own row above the card's action row, whose Undo reaches 12pt up. The
// card's gap plus the action row's top padding (16pt) clears that reach (C-5).
//
// Said once when it appears, on both platforms (C-44): the card's own summary was spoken
// when the card arrived, and a line patched in a second later would otherwise land in
// silence for a screen-reader owner.
export function FloorRaiseLine({
  line,
  petName,
  onOpen,
  ground = 'dark',
}: {
  line: FloorAnnouncement;
  petName: string | null | undefined;
  onOpen: () => void;
  /** The named and meal cards are dark; the sheet's beat sits on the sheet's light ground. */
  ground?: 'dark' | 'light';
}) {
  const light = ground === 'light';
  const text = raisedReadLine({ petName, tier: line.tier, vomitAt: line.vomitAt, self: line.self, nowMs: Date.now() });
  const phone = line.device ? phoneWorkedOutLine(petName) : null;
  const spoken = phone ? `${text} ${phone}` : text;
  useLiveRegionAnnouncement(spoken, `${line.eventId}:${line.tier}:${line.device ? 'device' : 'server'}`);
  return (
    <View accessibilityLiveRegion="polite">
      <TouchableOpacity
        onPress={onOpen}
        style={styles.block}
        accessibilityRole="link"
        accessibilityLabel={`${spoken} ${OPEN_THE_READ}`}
        activeOpacity={0.8}
      >
        <ThemedText style={[styles.line, light && styles.lineLight]}>{text}</ThemedText>
        {phone ? <ThemedText style={[styles.phone, light && styles.phoneLight]}>{phone}</ThemedText> : null}
        <ThemedText style={[styles.open, light && styles.lineLight]}>{OPEN_THE_READ}</ThemedText>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    minHeight: 44,
    justifyContent: 'center',
    gap: 2,
  },
  line: {
    fontSize: theme.textMD,
    color: theme.colorTextOnDark,
    fontWeight: theme.weightSemibold,
  },
  phone: {
    fontSize: theme.textSM,
    color: theme.colorTextOnDarkSubtle,
    fontWeight: theme.weightRegular,
  },
  lineLight: {
    color: theme.colorNeutralDark,
  },
  phoneLight: {
    color: theme.colorTextSecondary,
  },
  open: {
    fontSize: theme.textSM,
    color: theme.colorTextOnDark,
    fontWeight: theme.weightMedium,
    textDecorationLine: 'underline',
  },
});
