// Home's trial card under Design v2 (CUL-1526 · G2 B + G3 B, ruled 2026-10-03 on the
// CUL-1519 mock, round 2 §04; `docs/culprit-home-one-language-mockups.html`).
//
// Three things: the title ("Rabbit trial · day 69 of 84"), a NEUTRAL bar, and ONE line
// that always opens with the end date, then the off-diet floor when there is one
// ("Ends Oct 17 · 3 off-diet feedings logged"). The PM's reason: "I find myself
// constantly thinking, when is this over" — the card answers it in its first words.
//
// What is NOT here, deliberately:
//   • the coverage ratio and the vomiting pair — they read as "the diet is working",
//     and they live on `/trial` with their caveats (CUL-1443, CUL-1498);
//   • a safety branch — G3 B: the card is identical under a live safety-class Signal
//     card, because nothing on it has a reassuring direction;
//   • this week's lane (TS-5) — the ruling is three things, and the lane is the screen's;
//   • a colour on the bar — a trial is context, not an insight (all three G4 options
//     agree on grey). The chevron is bare (G1 A).
//
// Every string is the resolver's (`resolveTrialStrip`'s `header` and `cardLine`); this file
// adds layout and one door. The host (`components/home/TrialStrip`) holds both gates.
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { theme } from '../../../constants/theme';
import type { TrialStripModel } from '../../../lib/dietTrialCard';
import { trialScreenHref } from '../../../lib/trialRoute';
import { Card } from '../../ui/Card';
import { ThemedText } from '../../ui/ThemedText';

/** The action, spoken after the visible text (the label is the visible text, C-8). */
export const TRIAL_CARD_HINT = 'Opens the diet trial';

export interface TrialCardProps {
  model: TrialStripModel;
  /** The pet the strip's card input was loaded for — the screen this door opens. */
  petId: string;
  /** Overridable so a test drives the press without a router mock. */
  onPress?: () => void;
}

/** The visible lines, one sentence each, nothing added and nothing dropped. */
export function trialCardLabel(model: TrialStripModel): string {
  return [model.header, model.cardLine]
    .filter((l): l is string => typeof l === 'string' && l.length > 0)
    .map((l) => (/[.?!]$/.test(l) ? l : `${l}.`))
    .join(' ');
}

export function TrialCard({ model, petId, onPress }: TrialCardProps) {
  return (
    <Pressable
      onPress={onPress ?? (() => router.push(trialScreenHref(petId)))}
      accessibilityRole="button"
      accessibilityLabel={trialCardLabel(model)}
      accessibilityHint={TRIAL_CARD_HINT}
      style={styles.target}
      testID="trial-card-v2"
    >
      <Card>
        <View style={styles.headRow}>
          <ThemedText style={styles.title}>{model.header}</ThemedText>
          {/* geist-ok: Icon glyph, not copy — stays a raw <Text> (the strips' chevron). */}
          <Text style={styles.chevron}>›</Text>
        </View>
        <View style={styles.track} testID="trial-card-v2-track">
          <View
            testID="trial-card-v2-fill"
            // Day progress, and nothing else (R2 of the parent spec).
            style={[styles.fill, { width: `${model.progressFraction * 100}%` }]}
          />
        </View>
        {model.cardLine !== null && <ThemedText style={styles.line}>{model.cardLine}</ThemedText>}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // The whole box is the one target, pinned at the floor (C-5).
  target: {
    minHeight: 44,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
  },
  title: {
    flex: 1,
    minWidth: 0,
    fontSize: theme.textMD,
    lineHeight: theme.lineHeightBody,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
  },
  chevron: {
    fontSize: theme.textLG,
    lineHeight: theme.textLG + 2,
    color: theme.colorTextTertiary,
  },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colorChartEmpty,
    overflow: 'hidden',
    marginTop: theme.space1,
  },
  // Neutral: the mock's #737373 is the tertiary text token.
  fill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colorTextTertiary,
  },
  line: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    marginTop: theme.space1,
  },
});
