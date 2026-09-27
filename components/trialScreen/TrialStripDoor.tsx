// Home's trial strip, as the door (TS-5 · CUL-1301; `docs/nyx-trial-screen-requirements.md`
// §5.1, R-2; design authority round 2's "The strip, as a door" frame).
//
// The strip keeps its placement and its lines and takes the Signal row's grammar: the
// header as a headline, a chevron in its own well, the strip's own lines beneath, the
// whole box one ≥ 44pt target. NO RAIL COLOUR: a trial is context, not an insight. The
// tap opens `/trial/{petId}` for the pet the strip's facts were loaded for (the host
// passes it), never a pet read afresh at tap time.
//
// THIS WEEK'S LANE draws last, and only when `trialStripLane` says every gate is open:
// nothing withheld, facts fresh for this pet, and no safety-class Signal card live on
// Home. The ledger's facts are read HERE, so the read exists only when this namespace
// mounts, which is only with the flag on (C-41: the flag-off strip issues no ledger read).
//
// Every string is the resolver's (S2); this file adds layout and one door.
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { theme } from '../../constants/theme';
import { useTrialFacts } from '../../hooks/useTrialFacts';
import type { TrialCardInput, TrialStripModel } from '../../lib/dietTrialCard';
import { trialScreenHref } from '../../lib/trialRoute';
import { trialStripLane, type TrialStripSafety } from '../../lib/trialStripDoor';
import { Card } from '../ui/Card';
import { ThemedText } from '../ui/ThemedText';
import { ThisWeekLane } from './ThisWeekLane';

/** The action, spoken after the visible text (§6: the label is the visible text). */
export const TRIAL_STRIP_DOOR_HINT = 'Opens the diet trial';

export interface TrialStripDoorProps {
  model: TrialStripModel;
  /** The pet the strip's card input was loaded for. */
  petId: string;
  input: TrialCardInput | null;
  inputFresh: boolean;
  safety: TrialStripSafety | null;
  /** Overridable so a test drives the press without a router mock. */
  onPress?: () => void;
}

/** One sentence per visible line, each ending once. */
function spoken(lines: ReadonlyArray<string | null | undefined>): string {
  return lines
    .filter((l): l is string => typeof l === 'string' && l.length > 0)
    .map((l) => (/[.?!]$/.test(l) ? l : `${l}.`))
    .join(' ');
}

export function TrialStripDoor({ model, petId, input, inputFresh, safety, onPress }: TrialStripDoorProps) {
  const facts = useTrialFacts(petId);
  const lane = trialStripLane({ stripPetId: petId, input, inputFresh, facts, safety });

  return (
    <Pressable
      onPress={onPress ?? (() => router.push(trialScreenHref(petId)))}
      accessibilityRole="button"
      // An explicit label replaces the children for VoiceOver, so every visible line is in
      // it, the lane's sentence included when the lane draws.
      accessibilityLabel={spoken([model.header, model.line, model.trialResponseLine, lane?.accessibilityLabel])}
      accessibilityHint={TRIAL_STRIP_DOOR_HINT}
      style={styles.target}
      testID="trial-strip-door"
    >
      <Card>
        {/* The chevron sits in the HEADLINE row (round 2's frame), so on a five-line card it
            still marks the headline rather than floating beside the middle line. */}
        <View style={styles.headRow}>
          <ThemedText style={styles.headline}>{model.header}</ThemedText>
          <View style={styles.chevronWell}>
            {/* geist-ok: Icon glyph, not copy — stays a raw <Text> (the strips' chevron). */}
            <Text style={styles.chevron}>›</Text>
          </View>
        </View>
        <View style={styles.progressTrack} testID="trial-strip-door-track">
          <View
            testID="trial-strip-door-fill"
            // Day progress, and nothing else (R2 of the parent spec).
            style={[styles.progressFill, { width: `${model.progressFraction * 100}%` }]}
          />
        </View>
        {model.line !== null && <ThemedText style={styles.line}>{model.line}</ThemedText>}
        {model.trialResponseLine !== null && (
          <ThemedText style={styles.trialResponseLine}>{model.trialResponseLine}</ThemedText>
        )}
        {lane ? (
          <View style={styles.lane}>
            {/* The door's label already speaks the lane's sentence, so the lane is not a
                second focus stop inside it (TalkBack would read it twice). */}
            <ThisWeekLane lane={lane} insideLabelledControl />
          </View>
        ) : null}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // The whole box is the one target, pinned at the floor rather than trusted to the
  // card's content (C-5: pin the geometry the floor depends on).
  target: {
    minHeight: 44,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
  },
  headline: {
    flex: 1,
    minWidth: 0,
    fontSize: theme.textMD,
    lineHeight: theme.lineHeightBody,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colorChartEmpty,
    overflow: 'hidden',
    marginTop: theme.space1,
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colorAccent,
  },
  line: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    marginTop: theme.space1,
  },
  trialResponseLine: {
    fontSize: theme.textSM,
    color: theme.colorTextTertiary,
    marginTop: theme.spaceMicro,
  },
  lane: {
    marginTop: theme.space1,
  },
  // The Signal lead row's well, lifted (SignalRow `chevronLead`).
  chevronWell: {
    width: 28,
    height: 28,
    borderRadius: theme.radiusFull,
    backgroundColor: theme.colorSurfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevron: {
    fontSize: theme.textLG,
    lineHeight: theme.textLG + 2,
    color: theme.colorTextTertiary,
  },
});
