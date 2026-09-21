// The coverage door — "September · logged 15 of 17 days · Patterns ›" (Design v2 — the
// whole day, D2-4 / CUL-1066; the round-4 page §01).
//
// The last row on Home, and the only door to Patterns on it. It speaks COVERAGE — how
// many of the month's days so far hold anything — never a count of episodes, so it
// cannot rhyme with the Signal's line above it or the day's count line (three populations,
// `lib/monthCoverage.ts`). LEFT-ALIGNED, with nothing tappable at the row's right edge:
// the FAB floats over that corner at scroll end, and an inset clears the disc only at the
// very bottom (C-5; `lib/fabFootprint.ts`).
//
// The whole row is the door (one control, one destination); the chevron is the door's
// own glyph, not a second control.

import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { theme } from '../../../constants/theme';
import { monthCoverage, monthCoverageLine } from '../../../lib/monthCoverage';
import { readMonthOccurredAts } from '../../../lib/spineReads';
import { useEventStore } from '../../../store/eventStore';
import { usePetStore } from '../../../store/petStore';
import { useSyncStore } from '../../../store/syncStore';
import { Card } from '../../ui/Card';
import { ThemedText } from '../../ui/ThemedText';

export const COVERAGE_DOOR_LABEL = 'Patterns ›';

export function CoverageDoor({ onPress }: { onPress?: () => void }) {
  const petId = usePetStore((s) => s.activePet?.id ?? null);
  const hydrationTick = useSyncStore((s) => s.hydrationTick);
  const todayCount = useEventStore((s) => s.todayEvents.length);
  const [line, setLine] = useState<{ petId: string; text: string } | null>(null);

  useEffect(() => {
    if (!petId) return;
    let cancelled = false;
    const now = Date.now();
    // A day of slack before the month's first local midnight, whatever the zone; the
    // model keys every instant in the owner's zone and drops what is outside the month.
    const start = new Date(now);
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    const since = new Date(start.getTime() - 24 * 3_600_000).toISOString();
    readMonthOccurredAts(petId, since)
      .then((ats) => {
        if (cancelled) return;
        setLine({ petId, text: monthCoverageLine(monthCoverage(ats, now)) });
      })
      .catch((e) => console.warn('[CoverageDoor] month read failed:', e));
    return () => {
      cancelled = true;
    };
  }, [petId, hydrationTick, todayCount]);

  // A read that hasn't answered is never a number (C-12): the door still opens, and the
  // line arrives when the record has answered for THIS pet.
  const text = line && line.petId === petId ? line.text : null;
  const open = () => {
    if (onPress) onPress();
    else router.push('/insights');
  };
  return (
    <Card noPadding>
      <Pressable
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={`${text ? `${text}. ` : ''}Open Patterns`}
        style={({ pressed }) => [styles.door, pressed && styles.pressed]}
        testID="coverage-door"
      >
        <View style={styles.row} testID="coverage-door-row">
          {text ? <ThemedText style={styles.text}>{text}</ThemedText> : null}
          <ThemedText style={styles.link}>{COVERAGE_DOOR_LABEL}</ThemedText>
        </View>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  door: {
    paddingHorizontal: theme.space3,
    paddingVertical: theme.space2,
    minHeight: 44,
    justifyContent: 'center',
  },
  pressed: { backgroundColor: theme.colorSurfaceSubtle, borderRadius: theme.radiusMedium },
  // Left-aligned, hugging its content: nothing sits at the row's right edge under the
  // FAB (C-5).
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexWrap: 'wrap',
    columnGap: theme.space1 + theme.spaceMicro,
    rowGap: theme.spaceMicro,
  },
  text: { fontSize: theme.textSM, fontWeight: theme.weightMedium, color: theme.colorTextPrimary },
  link: { fontSize: theme.textSM, fontWeight: theme.weightMedium, color: theme.colorAccentInk },
});
