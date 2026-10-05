import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { theme } from '../../constants/theme';
import { ThemedText } from '../ui/ThemedText';
import { useEn14 } from '../../hooks/useEn14';
import { usePetStore } from '../../store/petStore';
import { useSyncStore } from '../../store/syncStore';
import { readDueFollowUp, type CallView } from '../../lib/vetCallReads';
import { followUpDueLine } from '../../lib/vetCallState';
import { toLocalDayKey } from '../../lib/utils';

// The follow-up's line on Home (Engines v3 PR-36, CUL-1419; care-state spec §6.3, mock 4b).
//
//   You called on Oct 3. What did the vet say?                       ›
//
// A NAVIGATION LINE, never a card, a sheet or a control: it opens the call's own screen,
// where the answer is written, so Home gains no write class (C-33, guards/homeWrites.test.ts:
// this file and the reads it imports run SELECTs only). At most one line, the oldest question
// due, so it is the day's one nudge (Principle 4), never a list.
//
// WHERE IT SITS, a stated departure (decision brief on CUL-1419): the spec puts it on "the
// escalation's own Home row", and most escalations have no row on Home two days later (a plain
// call-tier read is on Today only on its day). So it sits directly under the Signal, beside
// the row when one is drawn, and below every safety and intake card: it never leads one.
//
// Silent at expiry (G5): `readDueFollowUp` returns only a question that is due and not past
// its expiry, not answered, not undone. Dark behind engines_v3_en14: flag-off it reads nothing.

export function FollowUpLine() {
  const flagOn = useEn14();
  const petId = usePetStore((s) => s.activePet?.id ?? null);
  const hydrationTick = useSyncStore((s) => s.hydrationTick);
  const [due, setDue] = useState<{ petId: string; view: CallView } | null>(null);

  useEffect(() => {
    if (!flagOn || !petId) {
      setDue(null);
      return;
    }
    let cancelled = false;
    readDueFollowUp(petId)
      .then((view) => {
        if (!cancelled) setDue(view ? { petId, view } : null);
      })
      .catch((e) => {
        // Nothing drawn: the question waits on the incident screen and in Vet visits too.
        console.warn('[follow-up-line] read failed:', e);
        if (!cancelled) setDue(null);
      });
    return () => {
      cancelled = true;
    };
  }, [flagOn, petId, hydrationTick]);

  // A line from another pet's read never shows under this pet's Signal for a frame.
  if (!flagOn || !due || due.petId !== petId) return null;
  const line = followUpDueLine(due.view.call.calledOn, toLocalDayKey(new Date()));
  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => router.push({ pathname: '/vet-call/[id]', params: { id: due.view.call.id } })}
        accessibilityRole="button"
        accessibilityLabel={line}
        style={({ pressed }) => [styles.line, pressed && styles.pressed]}
        testID="home-follow-up-line"
      >
        <ThemedText style={styles.text}>{line}</ThemedText>
        <ThemedText style={styles.chevron} accessibilityElementsHidden importantForAccessibility="no">
          ›
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: theme.space3,
  },
  line: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: theme.space2,
  },
  pressed: {
    opacity: 0.7,
  },
  text: {
    flexShrink: 1,
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
  },
  chevron: {
    fontSize: theme.textMD,
    color: theme.colorTextTertiary,
  },
});
