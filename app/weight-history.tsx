// "Weight readings" — the per-reading history behind both weight cards (CUL-223).
//
// The cards ended in "Last weighed {date} · N readings" and went nowhere: the copy
// named a list nobody could open, so a reading fat-fingered as `124` was visible as a
// bent sparkline and unreachable as a row. This is where that count now leads. Each
// row is the `weight_check` event it already is, so a tap lands on the ordinary event
// detail — the same motion History has, and the same place the edit and the delete
// already live. This screen adds a way IN; it owns no editing of its own.
//
// ── SCOPED TO A PET BY ID, NOT TO THE SELECTION ─────────────────────────────
//
// petId arrives as a route param and the name is resolved from it
// (resolveRecordPetName), never from activePet. Both entry points have the id in hand,
// and a screen showing one pet's record must not silently re-point itself if the
// active pet changes underneath it (CUL-574).
//
// ── THREE READ STATES, NOT TWO ──────────────────────────────────────────────
//
// A read that hasn't answered is never an empty record (CUL-575). Skeleton while the
// query is in flight, a said error with a retry when it failed, and the designed empty
// state ONLY once a read has actually come back with nothing. "No weigh-ins logged"
// printed over a query that never returned is a false fact about a health record.
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { theme } from '../constants/theme';
import { Header } from '../components/ui/Header';
import { EmptyState } from '../components/ui/EmptyState';
import { SkeletonRows } from '../components/ui/Skeleton';
import { ThemedText } from '../components/ui/ThemedText';
import { usePetStore, resolveRecordPetName } from '../store/petStore';
import { getWeightReadings } from '../lib/weight';
import {
  buildWeightHistoryRows,
  noWeightReadingsLine,
  weightReadingsSubtitle,
  weightRowAccessibilityLabel,
  WEIGHT_HISTORY_TITLE,
  WEIGHT_HISTORY_UNREADABLE,
  type WeightHistoryRow,
} from '../lib/weightHistory';

export default function WeightHistoryScreen() {
  const { petId } = useLocalSearchParams<{ petId?: string }>();
  const pets = usePetStore((s) => s.pets);
  const petName = resolveRecordPetName(pets, petId);
  // Whose record this is, said out loud only where it could be ambiguous. A one-pet
  // household already knows; a multi-pet one should never have to infer it from the
  // card it happened to tap (the CUL-660 companion rule to CUL-574).
  const showPetName = pets.length > 1;

  const [rows, setRows] = useState<WeightHistoryRow[]>([]);
  // `loaded` is the flag that separates "nothing here" from "nothing yet". Without it
  // the very first frame is rows=[] && !loading — the empty state, rendered before the
  // focus effect has even started the read.
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (!petId) return;
    setFailed(false);
    try {
      const readings = await getWeightReadings(petId);
      setRows(buildWeightHistoryRows(readings));
      setLoaded(true);
    } catch (e) {
      console.error('[WeightHistoryScreen] load failed:', e);
      setFailed(true);
    }
  }, [petId]);

  // On focus, so a correction made on the detail screen (or a delete) is reflected on
  // the way back — the list is a view of the record, not a snapshot of one visit.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const showSkeleton = !loaded && !failed;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Header title={WEIGHT_HISTORY_TITLE} leading="back" onLeadingPress={() => router.back()} />

      {failed ? (
        <EmptyState
          testID="weight-history-error"
          align="fill"
          title={WEIGHT_HISTORY_UNREADABLE}
          body="The readings are stored on this device, so this is usually a hiccup rather than lost data."
          action={{ label: 'Try again', onPress: load }}
        />
      ) : showSkeleton ? (
        <View style={styles.skeleton}>
          <SkeletonRows count={6} testID="weight-history-skeleton" />
        </View>
      ) : rows.length === 0 ? (
        <EmptyState
          testID="weight-history-empty"
          align="fill"
          title="No readings yet"
          body={noWeightReadingsLine(petName)}
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(row) => row.eventId}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <ThemedText testID="weight-history-subtitle" style={styles.subtitle}>
              {showPetName
                ? `${petName} · ${weightReadingsSubtitle(rows.length)}`
                : weightReadingsSubtitle(rows.length)}
            </ThemedText>
          }
          renderItem={({ item }) => <ReadingRow row={item} />}
        />
      )}
    </SafeAreaView>
  );
}

// One reading: the value, when it was taken, and a chevron. Nothing else, by rule —
// see the guardrail in lib/weightHistory.ts. No per-row delta against the row above,
// because a list is where a comparison would read as a verdict on a single weigh-in.
function ReadingRow({ row }: { row: WeightHistoryRow }) {
  return (
    <Pressable
      style={styles.row}
      onPress={() => router.push({ pathname: '/event/[id]', params: { id: row.eventId } })}
      accessibilityRole="button"
      accessibilityLabel={weightRowAccessibilityLabel(row)}
    >
      <View style={styles.rowText}>
        <ThemedText style={styles.rowValue}>{row.value}</ThemedText>
        <ThemedText style={styles.rowWhen}>{row.when}</ThemedText>
      </View>
      <ChevronRight size={18} color={theme.colorTextTertiary} strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colorNeutralLight,
  },
  skeleton: {
    padding: theme.space2,
    gap: theme.space1,
  },
  list: {
    padding: theme.space2,
    gap: theme.space1,
  },
  subtitle: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    marginBottom: theme.space1,
  },
  // 56pt clears the 44pt floor by construction rather than by trusting a rendered
  // line box (CUL-579): two stacked lines of type would satisfy it today, and a type
  // change would silently drop the row under the floor with no test able to see it.
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space2,
    paddingHorizontal: theme.space2,
    paddingVertical: theme.space1,
    backgroundColor: theme.colorSurface,
    borderRadius: theme.radiusMedium,
  },
  rowText: {
    flex: 1,
    gap: theme.space0_5,
  },
  rowValue: {
    fontSize: theme.textLG,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
  },
  rowWhen: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
  },
});
