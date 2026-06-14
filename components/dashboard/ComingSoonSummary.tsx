import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../../constants/theme';
import { Card } from '../ui/Card';

// ComingSoonSummary — the AI summary's slot, shipped BEFORE the AI lands (§7.1).
//
// This is NOT a banned "coming soon" placeholder chip (Principle 5). It is a warm,
// honest, forward-looking card — the same move as the first-run Signal empty state —
// that reserves the real summary's slot (PR 4 swaps in AiSummaryCard here, zero layout
// change) and hands the owner to the value already on screen. It must NOT promise a
// clinical capability, read as an upsell (the summary is care-relevant → free, never
// premium, Principle 7), nag, or use an exclamation mark (§7.1 / nyx-voice).
//
// Pinned at the top of the dashboard (summary-led layout, §7) — so the surface keeps
// its editorial-AI identity even while the slot is still being built.

interface Props {
  petName: string;
}

export function ComingSoonSummary({ petName }: Props) {
  const who = petName.trim().length > 0 ? petName : 'your pet';
  return (
    <Card>
      {/* The slot's quiet identity — not a "coming soon" badge, just a section label
          like the Home zones, so the card reads as the summary's reserved place. */}
      <View style={styles.headerRow}>
        <Text style={styles.eyebrow}>Summary</Text>
      </View>
      {/* First-person-pet, specific about what's coming, hands off to the cards below.
          No clinical promise ("I'll tell you if Nyx is healthy" would cross the line),
          no upsell, no exclamation mark. */}
      <Text style={styles.body}>
        Soon, I'll gather what I'm noticing across {who}'s patterns into a few plain sentences,
        right here. For now, the cards below have the details.
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    marginBottom: theme.space1,
  },
  eyebrow: {
    fontSize: theme.textXS,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
    textTransform: 'uppercase',
    letterSpacing: theme.trackingWidest,
  },
  body: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    lineHeight: 22,
  },
});
