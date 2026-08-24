// A Daily Recap strip (B-762 / CUL-23, §2.5/§2.6) — the flat night doorway shared
// by the trial strip (C3) and the med course strips (C4).
//
// Deliberately flatter than the Home `TrialStrip`/`MedStrip`: NO progress bar and NO
// one-tap confirm. The recap is "record facts + doorways only" (R-3) — a strip states
// a course fact and opens the card that owns the reading; it never writes and never
// renders a viability/coverage/compliance figure. A withholding fact (med §6) reads
// in the night symptom rose.
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { ThemedText } from '../ui/ThemedText';

interface Props {
  glyph: LucideIcon;
  /** The glyph colour, and (at low opacity) its circle wash. */
  tint: string;
  title: string;
  fact: string | null;
  /** A withholding/concern fact reads in the night symptom rose (never a cheery
   *  coverage line over a refusal — med N3). */
  isConcern?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}

function RecapStripImpl({ glyph: Glyph, tint, title, fact, isConcern, onPress, accessibilityLabel }: Props) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? [title, fact].filter(Boolean).join('. ')}
      style={({ pressed }) => [styles.strip, pressed && styles.pressed]}
    >
      {/* `tint + '26'` is the glyph colour at ~15% alpha — the night sibling of the
          mock's `color-mix(... 14%, transparent)` circle wash. */}
      <View style={[styles.iconWrap, { backgroundColor: tint + '26' }]}>
        <Glyph size={14} color={tint} strokeWidth={1.9} />
      </View>
      <View style={styles.body}>
        <ThemedText style={styles.title} numberOfLines={1}>
          {title}
        </ThemedText>
        {fact ? (
          <ThemedText style={[styles.fact, isConcern && styles.factConcern]} numberOfLines={2}>
            {fact}
          </ThemedText>
        ) : null}
      </View>
      {/* geist-ok: icon glyph, not copy — stays a raw <Text> and keeps the system face.
          These stand in for vector glyphs (the B-745 GlyphSvg migration owns them), and Geist
          carries no ✓ / ✕ / ＋ in any loaded weight, so sweeping one buys OS fallback for
          nothing. CUL-364 §7. */}
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

export const RecapStrip = memo(RecapStripImpl);

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
    backgroundColor: theme.colorBrandNightElevated,
    borderWidth: 1,
    borderColor: theme.colorBorderOnNight,
    borderRadius: 14,
    paddingVertical: theme.space0_5 + theme.spaceMicro, // 6
    paddingHorizontal: theme.space1 + theme.space0_5, // 12
    minHeight: 52, // clears the 44pt tap target
  },
  pressed: { opacity: 0.75 },
  iconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, minWidth: 0 },
  title: {
    fontSize: theme.textSM,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextOnNight,
  },
  fact: {
    fontSize: theme.textSM,
    color: theme.colorTextOnNightMuted,
    marginTop: 1,
  },
  factConcern: {
    color: theme.colorEventSymptomOnNight,
  },
  chevron: {
    fontSize: theme.textLG,
    color: theme.colorTextOnNightMuted,
  },
});
