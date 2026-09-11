import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { theme } from '../constants/theme';
import { Header, PrimaryButton } from '../components/ui';
import { WhorlSpinner } from '../components/brand/WhorlSpinner';
import { RundownBlock } from '../components/ask/RundownBlock';
import { AddQuestionSheet } from '../components/vetvisits/AddQuestionSheet';
import {
  GetReadyMoreMenu,
  GetReadyMoreTrigger,
  GetReadyTitle,
} from '../components/vetvisits/GetReadyHeader';
import { WorthRaisingList } from '../components/vetvisits/WorthRaisingList';
import { useAllowlistFlag } from '../hooks/useAppConfig';
import { useBetaOptIn } from '../lib/betaFeatures';
import { resolveRecordPetName, usePetStore } from '../store/petStore';
import { buildRundown, rundownToPlainText, type Rundown, type RundownTap } from '../lib/rundown';
import { buildWorthRaising, type WorthRaising } from '../lib/getReady';
import { loadDietTrialFacts } from '../lib/dietTrialFacts';
import { isAnimalNotEating, resolveTrialStrip } from '../lib/dietTrialCard';
import { readSignalCache } from '../lib/signal';
import { syncPendingVetAppointments } from '../lib/sync';
import {
  buildAppointmentView,
  parseAppointmentQuestions,
  readAppointmentById,
  saveAppointmentQuestions,
  type AppointmentQuestion,
  type AppointmentDetail,
} from '../lib/vetVisits';
import { uuid } from '../lib/utils';
import { profileFocusHref } from '../lib/profileFocus';

// The vet-visit rundown (Ask / B-228 PR A6, spec §3.3 + mock §7), and — with an
// `appointmentId` — GET READY (CUL-903 VV-5; vet-visits spec §4.1 B1, mock B1 / B1b).
//
// ── ONE ROUTE, TWO JOBS, AND THAT IS AN ACCEPTANCE CRITERION ─────────────────────
// "Promote, don't rebuild" (the PM on the rundown). Get ready IS this screen with an
// appointment attached: the same deterministic, offline, capped-safe rundown, under
// a job title, with the record's own things-to-raise and the owner's questions above
// it and ONE primary below it. AC 4 requires the rundown block to be byte-identical
// between the two modes, which is why both render `RundownBlock` rather than two
// copies of the same JSX.
//
// ── ZERO MODEL CALLS, AND ONE NEAR-MISS WORTH NAMING ─────────────────────────────
// AC 4 also requires zero model calls through mount and every tap. The obvious way
// to read the Signal's findings here is `useSignal()` — and it would have broken
// that: the hook refreshes a stale cache (`readSignalsAndRefresh` →
// `regenerateSignal` → `functions.invoke('generate-signal')`), and that function
// makes the Haiku phrasing call. Opening Get ready on a day-old cache would have
// spent a model call and, worse, made this screen's content depend on one.
//
// So it reads `readSignalCache` DIRECTLY — a select of findings the engine already
// computed, never the refreshing wrapper. Get ready reports the record; it never
// asks for it to be re-judged because a visit is coming.
//
// The cache is a network read (it is on Home too), so offline it simply does not
// answer. That is handed to `buildWorthRaising` as `findings: null` — distinct from
// an empty list — and the section says so rather than falling silent (C-12).
//
// ── THE PET IS THE APPOINTMENT'S ────────────────────────────────────────────────
// In Get-ready mode every read is scoped to `appointment.pet_id`, never to
// `activePet` (CUL-574 / AC 11), including the trial facts — which is why this
// screen calls `loadDietTrialFacts` itself instead of `useDietTrial()`, whose whole
// contract is "the active pet".

type Status = 'loading' | 'ready' | 'error';

// Map a tile's semantic tap target to an expo-router destination. Kept here (not
// in lib/rundown) so the pure layer stays route-agnostic and testable; the
// mapping itself is pinned by `rundown.test.tsx`.
//
// The weight and meds tiles are DOORS onto the Pet tab and go through
// `profileFocusHref` — the CUL-170 vocabulary — never the bare tab route, which
// lands at the top of the profile and leaves the owner scrolling for the card in
// the consult room (CUL-753). The meds tile names no single med (lib/rundown), so
// it takes the section fallback the medications door already has.
function navigateTo(tap: RundownTap): void {
  switch (tap.kind) {
    case 'symptom':
      router.push({ pathname: '/insights/[metric]', params: { metric: tap.symptomType } });
      return;
    case 'patterns':
      router.push('/insights');
      return;
    case 'weight':
      router.push(profileFocusHref({ focus: 'weight', nowMs: Date.now() }));
      return;
    case 'meds':
      router.push(profileFocusHref({ focus: 'medications', nowMs: Date.now() }));
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

/** Everything the Get-ready chrome needs. Absent in plain-rundown mode. */
interface GetReadyState {
  appointment: AppointmentDetail;
  petName: string;
  questions: AppointmentQuestion[];
  worthRaising: WorthRaising;
}

export default function RundownScreen() {
  const activePet = usePetStore((s) => s.activePet);
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<Status>('loading');
  const [rundown, setRundown] = useState<Rundown | null>(null);
  const [getReady, setGetReady] = useState<GetReadyState | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const eligible = useAllowlistFlag('vet_visits');
  const optedIn = useBetaOptIn('vet_visits');
  const companionOn = eligible && optedIn;
  const { appointmentId, ask } = useLocalSearchParams<{ appointmentId?: string; ask?: string }>();
  // Off the flag the param is inert and this is the shipped rundown, unchanged —
  // which is what AC 0 asserts about `/rundown`.
  const wantsGetReady = companionOn && typeof appointmentId === 'string' && appointmentId.length > 0;

  // The strip's *Add a question* opens this screen with the sheet up. A ONE-SHOT held
  // in a ref and armed from the ref's initialiser, never in the render body: the
  // param stays in the URL for the life of the screen, so a render-body assignment
  // re-arms it on every render and the sheet re-opens each time the owner dismisses
  // it (C-22, and the exact defect VV-2's list screen shipped and fixed).
  const pendingAsk = useRef(ask === '1');

  // Monotonic load id so a slow load can never commit over a newer one (pet
  // switch / retry) — the insights / report pattern.
  const loadIdRef = useRef(0);
  const petId = activePet?.id;

  // Depends on petId so a pet switch while this screen stays mounted re-runs the
  // build (the report.tsx pattern) — the loadIdRef guard alone only prevents a
  // stale response winning; the reactive dep is what triggers the fresh load.
  const load = useCallback(async () => {
    const myId = ++loadIdRef.current;
    setStatus('loading');
    try {
      // The appointment decides the subject in Get-ready mode. Resolved FIRST,
      // because everything below is scoped to its pet.
      const appointment = wantsGetReady ? await readAppointmentById(appointmentId) : null;
      const subjectId = appointment?.pet_id ?? usePetStore.getState().activePet?.id ?? null;
      if (!subjectId) {
        if (loadIdRef.current === myId) setStatus('error');
        return;
      }
      const subjectName = resolveRecordPetName(usePetStore.getState().pets, subjectId);

      const built = await buildRundown(subjectId, subjectName);
      if (loadIdRef.current !== myId) return;
      setRundown(built);

      if (!appointment) {
        setGetReady(null);
        setStatus('ready');
        return;
      }

      // AWAIT FIRST, THEN CHECK, THEN COMMIT. The first cut put the `await` inside the
      // object literal, which means `setGetReady` runs AFTER it resolves — so the
      // staleness check sat one line BELOW the write it was supposed to guard, and a
      // slow load for pet A could commit A's appointment and A's name over a render
      // already showing B. `buildForAppointment` bails out on a stale id, so the rows
      // were safe; the appointment and the pet NAME were not.
      const worthRaising = await buildForAppointment(built, subjectId, myId, loadIdRef);
      if (loadIdRef.current !== myId) return;
      setGetReady({
        appointment,
        petName: subjectName,
        questions: parseAppointmentQuestions(appointment.questions),
        worthRaising,
      });
      setStatus('ready');
    } catch {
      // No silent failure (house rule) — a warm retry, never a fabricated empty
      // rundown that could read as "nothing wrong".
      if (loadIdRef.current !== myId) return;
      setStatus('error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- petId is the intended trigger; the subject is read fresh inside
  }, [petId, wantsGetReady, appointmentId]);

  useEffect(() => {
    load();
  }, [load]);

  // Consume the one-shot once there is something to open the sheet over, then strip
  // the param so a re-focus reads a clean URL rather than relying on the ref alone.
  useEffect(() => {
    if (!getReady || !pendingAsk.current) return;
    pendingAsk.current = false;
    setSheetOpen(true);
    router.setParams({ ask: undefined });
  }, [getReady]);

  const onCopyAsText = useCallback(async () => {
    setMenuOpen(false);
    if (!rundown) return;
    try {
      await Share.share({ message: rundownToPlainText(rundown) });
    } catch {
      // Share sheet dismissed / unavailable — nothing to recover, no error state.
    }
  }, [rundown]);

  const writeQuestions = useCallback(
    async (next: AppointmentQuestion[]) => {
      if (!getReady) return;
      try {
        await saveAppointmentQuestions(getReady.appointment.id, next);
        setGetReady({ ...getReady, questions: next });
        syncPendingVetAppointments().catch(() => {});
      } catch (err) {
        console.warn('[get-ready] question save failed:', err);
        // Never a silent failure, and never an optimistic list: the row on screen is
        // still what the record holds.
        Alert.alert('Couldn’t save that', 'Your questions are unchanged — try again.');
        throw err;
      }
    },
    [getReady],
  );

  const petName = activePet?.name ?? 'your pet';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header
        title={
          getReady
            ? ''
            : activePet
              ? `${activePet.name} — visit rundown`
              : 'Visit rundown'
        }
        leading="back"
        onLeadingPress={() => router.back()}
        right={getReady ? <GetReadyMoreTrigger onPress={() => setMenuOpen(true)} /> : undefined}
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
            {getReady ? (
              <>
                {/* The strip's own `when` / `where`, through the SAME builder — so the
                    page and the strip that opened it can never disagree about when
                    the visit is or where it is. */}
                <GetReadyTitle
                  when={buildAppointmentView(getReady.appointment).when}
                  where={buildAppointmentView(getReady.appointment).where}
                  petName={getReady.petName}
                />
                <WorthRaisingList
                  worthRaising={getReady.worthRaising}
                  questions={getReady.questions}
                  petName={getReady.petName}
                  onAdd={() => setSheetOpen(true)}
                  onRemove={(id) =>
                    writeQuestions(getReady.questions.filter((q) => q.id !== id)).catch(() => {})
                  }
                />
                <Text style={styles.sectionLabel}>The rundown · last 30 days</Text>
              </>
            ) : null}

            <RundownBlock rundown={rundown} petName={rundown.petName} onTap={navigateTo} />
          </ScrollView>

          <View style={[styles.bar, { paddingBottom: insets.bottom + theme.space2 }]}>
            {getReady ? (
              // ONE primary (R-share). The rundown is not for the vet — all nine
              // lenses said so independently — so the only hand-off here is the
              // report, and the text share sits under ⋯ as *Copy as text*.
              <>
                <PrimaryButton label="Send the vet report" onPress={() => router.push('/report')} />
                <Text style={styles.barHint}>
                  The report is the clinical record. This page is your quick answer.
                </Text>
              </>
            ) : (
              <>
                <PrimaryButton label="Share the full vet report" onPress={() => router.push('/report')} />
                <PrimaryButton
                  // "Share", not "Save" — it opens the OS share sheet (no in-app
                  // persistence, §10); the label matches what actually happens.
                  label="Share the rundown"
                  onPress={onCopyAsText}
                  variant="secondary"
                  style={styles.saveBtn}
                />
                <Text style={styles.barHint}>The report is the clinical record; the rundown is the quick answer.</Text>
              </>
            )}
          </View>
        </>
      )}

      {getReady ? (
        <>
          <GetReadyMoreMenu
            petName={getReady.petName}
            visible={menuOpen}
            onClose={() => setMenuOpen(false)}
            onCopyAsText={onCopyAsText}
            onChangeAppointment={() => {
              setMenuOpen(false);
              router.push('/vet-visits');
            }}
          />
          <AddQuestionSheet
            visible={sheetOpen}
            petName={getReady.petName}
            existingCount={getReady.questions.length}
            onClose={() => setSheetOpen(false)}
            onSubmit={async (text) => {
              await writeQuestions([
                ...getReady.questions,
                { id: uuid(), text, source: 'owner', source_ref: null, asked_at: null },
              ]);
            }}
          />
        </>
      ) : null}
    </SafeAreaView>
  );
}

/**
 * Worth raising, for this appointment's pet.
 *
 * The Signal cache is read here and its FAILURE is kept distinct from its emptiness
 * (`findings: null` vs `[]`) — the whole point of the gap line the section renders.
 * The trial facts fail closed the way Home's do: an input that is not confirmed for
 * this pet suppresses the reassuring trial row rather than risking the previous pet's.
 */
async function buildForAppointment(
  built: Rundown,
  subjectId: string,
  myId: number,
  loadIdRef: { current: number },
): Promise<WorthRaising> {
  const pet = usePetStore.getState().pets.find((p) => p.id === subjectId) ?? null;

  const [findings, trialInput] = await Promise.all([
    readSignalCache(subjectId)
      .then((row) => row?.findings ?? [])
      // Unreadable cache (offline / never generated). NULL, not [] — an empty list
      // says "nothing standing" and this says "we could not look".
      .catch(() => null),
    pet
      ? loadDietTrialFacts({
          pet: { id: pet.id, name: pet.name, species: pet.species, sex: pet.sex },
          otherPetNames: usePetStore
            .getState()
            .pets.filter((p) => p.id !== pet.id)
            .map((p) => p.name),
          signalsV2: true,
        }).catch(() => null)
      : Promise.resolve(null),
  ]);

  if (loadIdRef.current !== myId) {
    return { rows: [], signalUnavailable: false };
  }

  return buildWorthRaising({
    findings,
    // The same fail-closed rule Home applies (B-789): absence of a refusal fact
    // during a failed load is not evidence of eating, so an unloadable trial
    // suppresses the reassuring trial_response row rather than letting it through.
    suppressTrialResponse: trialInput ? isAnimalNotEating(trialInput) : true,
    trialStrip: trialInput ? resolveTrialStrip(trialInput) : null,
    rundown: built,
    nowMs: Date.now(),
  });
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
  sectionLabel: {
    fontFamily: theme.fontBodySemibold,
    fontSize: theme.textSM,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextSecondary,
    paddingHorizontal: theme.space1,
    marginTop: theme.space1,
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
