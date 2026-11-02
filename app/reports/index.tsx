import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { theme } from '../../constants/theme';
import { DoorRow } from '../../components/ui/DoorRow';
import { EmptyState, Header, PrimaryButton, SectionLabel, SkeletonRows, ThemedText } from '../../components/ui';
import { ANONYMOUS_PET_NAME, resolveRecordPetName, usePetStore } from '../../store/petStore';
import {
  departureWords,
  foldedGroupLabel,
  groupByYear,
  LIBRARY_EMPTY_TITLE,
  LIBRARY_FAILED,
  libraryEmptyBody,
  libraryTitle,
  readSavedReports,
  sentDateLabel,
  windowLabel,
  type SavedReport,
} from '../../lib/reportLibrary';

// The Reports library (Vet report v2 PR-21, CUL-2301; spec §11.3, §14; critique GAP-26, WBC-9).
//
// Every report sent about one pet, newest first, one row per copy. The newest year is open and
// every older year folds to one line. THE LIST IS STILL (spec §14): no arrival animation, a new
// row is simply there. Each row opens the copy exactly as it was sent (`app/reports/[id].tsx`).
//
// WHOSE RECORD (C-9, WBC-9): the pet is captured once, from the door's `pet` param when this
// account holds it, else the active pet, and never re-read; the title names THAT pet, resolved
// from the record, so a two-pet owner never reads one pet's copies under the other's name.
//
// NO ENTITLEMENT IS READ (spec §11.2): a lapsed Premium never hides a copy.

type State = { kind: 'loading' } | { kind: 'failed' } | { kind: 'ok'; reports: SavedReport[] };

export default function ReportsLibraryScreen() {
  const activePet = usePetStore((s) => s.activePet);
  const pets = usePetStore((s) => s.pets);
  const { pet: petParam } = useLocalSearchParams<{ pet?: string }>();
  const [petId, setPetId] = useState<string | null>(null);
  if (petId === null && petParam && pets.some((p) => p.id === petParam)) setPetId(petParam);
  else if (petId === null && activePet) setPetId(activePet.id);
  const petName = resolveRecordPetName(pets, petId);

  const [state, setState] = useState<State>({ kind: 'loading' });
  const [openYears, setOpenYears] = useState<ReadonlySet<number>>(new Set());

  const load = useCallback(async () => {
    if (!petId) return;
    setState({ kind: 'loading' });
    const out = await readSavedReports(petId);
    setState(out.kind === 'ok' ? { kind: 'ok', reports: out.reports } : { kind: 'failed' });
  }, [petId]);

  // Re-read on focus: a copy kept since the last visit is simply there.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const currentYear = new Date().getFullYear();
  const openCopy = (r: SavedReport) => router.push({ pathname: '/reports/[id]', params: { id: r.id, pet: r.petId } });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header title={libraryTitle(petName, ANONYMOUS_PET_NAME)} leading="back" onLeadingPress={() => router.back()} titleBelowAtLargeText />
      {state.kind === 'loading' && (
        <View style={styles.body}>
          <SkeletonRows count={4} testID="reports-loading" />
        </View>
      )}
      {state.kind === 'failed' && (
        <View style={styles.body} testID="reports-failed">
          <ThemedText variant="caption" style={styles.failed}>{LIBRARY_FAILED}</ThemedText>
          <PrimaryButton label="Try again" variant="secondary" onPress={() => void load()} />
        </View>
      )}
      {state.kind === 'ok' && state.reports.length === 0 && (
        <EmptyState
          testID="reports-empty"
          title={LIBRARY_EMPTY_TITLE}
          body={libraryEmptyBody(petName, ANONYMOUS_PET_NAME)}
          action={{ label: 'Make a report', onPress: () => router.push('/report') }}
          align="fill"
        />
      )}
      {state.kind === 'ok' && state.reports.length > 0 && (
        <ScrollView contentContainerStyle={styles.body} testID="reports-list">
          {groupByYear(state.reports).map((group) => {
            const open = !group.folded || openYears.has(group.year);
            if (!open) {
              return (
                <DoorRow
                  key={group.year}
                  testID={`reports-year-${group.year}`}
                  title={foldedGroupLabel(group)}
                  onPress={() => setOpenYears((s) => new Set(s).add(group.year))}
                  accessibilityLabel={`${foldedGroupLabel(group)}. Show them.`}
                />
              );
            }
            return (
              <View key={group.year} style={styles.group}>
                <SectionLabel label={String(group.year)} header />
                {group.reports.map((r) => {
                  const date = sentDateLabel(r.sharedAt, currentYear);
                  const detail = `${windowLabel(r.startDate, r.endDate, group.year)} · ${departureWords(r.sharedVia)}`;
                  return (
                    <DoorRow
                      key={r.id}
                      testID={`reports-row-${r.id}`}
                      title={date}
                      detail={detail}
                      onPress={() => openCopy(r)}
                      accessibilityLabel={`Report sent ${date}. Covers ${detail}. Opens the copy as sent.`}
                    />
                  );
                })}
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colorNeutralLight },
  body: { padding: theme.space3, gap: theme.space2 },
  group: { gap: theme.space1 },
  failed: { color: theme.colorTextSecondary },
});
