import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { theme } from '../constants/theme';
import { Header, PrimaryButton, Card } from '../components/ui';
import { WhorlSpinner } from '../components/brand/WhorlSpinner';
import { RundownTileRow } from '../components/ask/RundownTileRow';
import { usePetStore } from '../store/petStore';
import {
  buildRundown,
  rundownToPlainText,
  rundownDateLine,
  type Rundown,
  type RundownTap,
} from '../lib/rundown';

// The vet-visit rundown (Ask / B-228 PR A6, spec §3.3 + mock §7).
//
// A deterministic, one-tap preset that assembles the answers a clinician asks
// for at the start of a visit — NO model call, so it works CAPPED and OFFLINE
// (every tile reads the local mirror via lib/rundown). The two exam-room actions:
// "Share the full vet report" hands off to the Step-9 flow (the clinical
// artifact); "Save for the visit" shares the rundown itself as portable text so
// the anxious owner in the consult room has it in hand — no persistence needed
// (§10), the rundown is the pinnable artifact.
//
// Entry is Ask-internal (S5): A5's Ask surface pushes here via its rundown chip.
// The route stands alone so A6 is parallel-safe with the Ask client build.

type Status = 'loading' | 'ready' | 'error';

// Map a tile's semantic tap target to an expo-router destination. Kept here (not
// in lib/rundown) so the pure layer stays route-agnostic and testable.
function navigateTo(tap: RundownTap): void {
  switch (tap.kind) {
    case 'symptom':
      router.push({ pathname: '/insights/[metric]', params: { metric: tap.symptomType } });
      return;
    case 'patterns':
      router.push('/insights');
      return;
    case 'weight':
    case 'meds':
      router.push('/(tabs)/profile');
      return;
    case 'medication':
      router.push({ pathname: '/medication/[id]', params: { id: tap.medicationId } });
      return;
    case 'foods':
      router.push('/(tabs)/foods');
      return;
    case 'history':
      router.push('/(tabs)/history');
      return;
    case 'log-visit':
      router.push('/vet-visit');
      return;
  }
}

export default function RundownScreen() {
  const activePet = usePetStore((s) => s.activePet);
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<Status>('loading');
  const [rundown, setRundown] = useState<Rundown | null>(null);

  // Monotonic load id so a slow load can never commit over a newer one (pet
  // switch / retry) — the insights / report pattern.
  const loadIdRef = useRef(0);
  const petId = activePet?.id;

  // Depends on petId so a pet switch while this screen stays mounted re-runs the
  // build (the report.tsx pattern) — the loadIdRef guard alone only prevents a
  // stale response winning; the reactive dep is what triggers the fresh load.
  const load = useCallback(async () => {
    const pet = usePetStore.getState().activePet;
    if (!pet) {
      setStatus('error');
      return;
    }
    const myId = ++loadIdRef.current;
    setStatus('loading');
    try {
      const built = await buildRundown(pet.id, pet.name);
      if (loadIdRef.current !== myId) return;
      setRundown(built);
      setStatus('ready');
    } catch {
      // No silent failure (house rule) — a warm retry, never a fabricated empty
      // rundown that could read as "nothing wrong".
      if (loadIdRef.current !== myId) return;
      setStatus('error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- petId is the intended trigger; pet is read fresh inside
  }, [petId]);

  useEffect(() => {
    load();
  }, [load]);

  const onSave = useCallback(async () => {
    if (!rundown) return;
    try {
      await Share.share({ message: rundownToPlainText(rundown) });
    } catch {
      // Share sheet dismissed / unavailable — nothing to recover, no error state.
    }
  }, [rundown]);

  const petName = activePet?.name ?? 'your pet';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header
        title={activePet ? `${activePet.name} — visit rundown` : 'Visit rundown'}
        leading="back"
        onLeadingPress={() => router.back()}
      />

      {status === 'loading' && (
        <View style={styles.center}>
          <WhorlSpinner size="md" ground="day" />
          <Text style={styles.loadingText}>Pulling {petName}’s record together…</Text>
        </View>
      )}

      {status === 'error' && (
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Couldn’t build the rundown</Text>
          <Text style={styles.muted}>
            {activePet ? "Your pet's record is still here — try again." : 'Add a pet first.'}
          </Text>
          {activePet ? (
            <PrimaryButton label="Try again" onPress={load} variant="secondary" style={styles.retry} />
          ) : null}
        </View>
      )}

      {status === 'ready' && rundown && (
        <>
          <ScrollView contentContainerStyle={styles.scroll}>
            <Text style={styles.intro}>
              The clinician’s opening questions, straight from {petName}’s record. Tap any line to
              open its source in the app.
            </Text>
            <Text style={styles.dateLine}>{rundownDateLine(rundown.generatedAtMs)}</Text>
            <Card noPadding style={styles.tileCard}>
              {rundown.tiles.map((tile, i) => (
                <RundownTileRow
                  // key: index-scoped by section — a pet can have multiple symptom
                  // and med rows sharing a `key`, so the position disambiguates.
                  key={`${tile.key}-${i}`}
                  tile={tile}
                  isLast={i === rundown.tiles.length - 1}
                  onPress={tile.tap ? () => navigateTo(tile.tap as RundownTap) : undefined}
                />
              ))}
            </Card>
          </ScrollView>

          <View style={[styles.bar, { paddingBottom: insets.bottom + theme.space2 }]}>
            <PrimaryButton label="Share the full vet report" onPress={() => router.push('/report')} />
            <PrimaryButton
              // "Share", not "Save" — it opens the OS share sheet (no in-app
              // persistence, §10); the label matches what actually happens.
              label="Share the rundown"
              onPress={onSave}
              variant="secondary"
              style={styles.saveBtn}
            />
            <Text style={styles.barHint}>The report is the clinical record; the rundown is the quick answer.</Text>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colorSurface },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.space3,
    gap: theme.space2,
  },
  loadingText: {
    fontFamily: theme.fontBody,
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    textAlign: 'center',
  },
  errorTitle: {
    fontFamily: theme.fontBodySemibold,
    fontSize: theme.textLG,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    textAlign: 'center',
  },
  muted: {
    fontFamily: theme.fontBody,
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    textAlign: 'center',
  },
  retry: { marginTop: theme.space2, paddingHorizontal: theme.space3 },
  scroll: {
    padding: theme.space2,
    gap: theme.space2,
  },
  intro: {
    fontFamily: theme.fontBody,
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextSecondary,
    paddingHorizontal: theme.space1,
  },
  dateLine: {
    fontFamily: theme.fontBody,
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    paddingHorizontal: theme.space1,
    marginTop: -theme.space1,
  },
  tileCard: {
    overflow: 'hidden',
  },
  bar: {
    paddingHorizontal: theme.space2,
    paddingTop: theme.space2,
    backgroundColor: theme.colorSurface,
    borderTopWidth: 1,
    borderTopColor: theme.colorBorder,
    gap: theme.space1,
  },
  saveBtn: {
    marginTop: theme.space1,
  },
  barHint: {
    fontFamily: theme.fontBody,
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    textAlign: 'center',
  },
});
