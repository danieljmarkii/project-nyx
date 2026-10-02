import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
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
import { resolveRecordPetName, usePetStore, type Pet } from '../store/petStore';
import { buildRundown, rundownToPlainText, type Rundown, type RundownTap } from '../lib/rundown';
import { rundownHistoryHref } from '../lib/historyDoors';
import { useHistoryV2 } from '../hooks/useHistoryV2';
import { buildWorthRaising, localIntakeDeclines, type WorthRaising } from '../lib/getReady';
import { buildTrialScreenModel } from '../lib/trialScreenModel';
import { UNKNOWN_ALLOWED_SET } from '../lib/trialAllowedSet';
import { NO_LEDGER_FACTS, recheckFactsState } from '../lib/trialRecheck';
import { useTrialScreen } from '../hooks/useTrialScreen';
import { RecheckQuestions } from '../components/trialScreen/RecheckQuestions';
import {
  loadDietTrialFacts,
  loadTrialPredicateFacts,
  type TrialPredicateFacts,
} from '../lib/dietTrialFacts';
import { isAnimalNotEating, resolveTrialStrip } from '../lib/dietTrialCard';
import { readSignalCache } from '../lib/signal';
import { signalTrialWindowOf } from '../lib/signalScreen';
import { syncPendingVetAppointments } from '../lib/sync';
import {
  buildAppointmentView,
  parseAppointmentQuestions,
  readEditableAppointment,
  saveAppointmentQuestions,
  type AppointmentQuestion,
  type AppointmentDetail,
} from '../lib/vetVisits';
import { uuid } from '../lib/utils';
import { profileFocusHref } from '../lib/profileFocus';
import { reportHref } from '../lib/reportRoute';

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
// an empty list — and the section says so rather than falling silent (C-12). A read
// that neither answers nor fails is given `SIGNAL_CACHE_WAIT_MS` and then counts as
// the same unreadable state, so a stalled connection costs the page its Signal rows,
// never the page.
//
// ── THE PET IS THE APPOINTMENT'S ────────────────────────────────────────────────
// In Get-ready mode every read is scoped to `appointment.pet_id`, never to
// `activePet` (CUL-574 / AC 11), including the trial facts — which is why this
// screen calls `loadDietTrialFacts` itself. (Written when `useDietTrial` read only the
// active pet; since CUL-1297 it takes a pet. TS-8 kept the direct read: the load below is
// one awaited pass with a staleness id, and a hook would split it across renders.)
//
// ── THE RECHECK (TS-8 · CUL-1304) ────────────────────────────────────────────────
// Behind `trial_screen`, the trial row grows into the vet's recheck questions, answered
// from the trial screen's own model (`buildTrialScreenModel`, fed the same loader output
// the screen reads) and drawn by `components/trialScreen/RecheckQuestions`. Flag-off the
// model is never built and the row is today's, and no read is added.
//
// Flag-on, CUL-1342 adds ONE read: `loadTrialPredicateFacts`, for the oral-route lane (the
// chewable and food-paired doses the feeding counts never hold). It runs beside the trial
// read inside this same awaited pass, so it can never be "still loading" when the rows are
// built, and a failure is its own state (`unreadable`), never an empty lane (C-12).

type Status = 'loading' | 'ready' | 'error';

// Map a tile's semantic tap target to an expo-router destination. Kept here (not
// in lib/rundown) so the pure layer stays route-agnostic and testable; the
// mapping itself is pinned by `rundown.test.tsx`.
//
// The History tiles are registered doors (`lib/historyDoors.ts`, HV-11 / CUL-1168): under
// `history_v2` each lands on the scope its claim is about, but only when this rundown is
// about the pet on screen, because History shows the active pet and a scoped door onto
// another pet's record would be confidently wrong (C-9; the pet itself is CUL-1252). Flag
// off, or for another pet, the bare route as before. This screen reads the gate for that
// one decision and draws nothing of History v2.
//
// The weight and meds tiles are DOORS onto the Pet tab and go through
// `profileFocusHref` — the CUL-170 vocabulary — never the bare tab route, which
// lands at the top of the profile and leaves the owner scrolling for the card in
// the consult room (CUL-753). The meds tile names no single med (lib/rundown), so
// it takes the section fallback the medications door already has.
function navigateTo(tap: RundownTap, historyScoped: boolean): void {
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
      router.push(rundownHistoryHref(tap.door, historyScoped));
      return;
    case 'log-visit':
      // The booking sheet's *Already happened* arm — the same door as the Pet tab's
      // *Log a past visit*, so there is one way to log a visit (CUL-942). This
      // pushed `/vet-visit`, the old write-only form, until GA (CUL-905).
      router.push('/vet-visits?add=happened');
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
  // Whose record `rundown` is: the appointment's pet in Get ready, else the active pet.
  const [rundownPetId, setRundownPetId] = useState<string | null>(null);
  const historyV2 = useHistoryV2();
  const trialScreen = useTrialScreen();
  // Read by `load` through a ref, never as a dependency: the gate hydrates asynchronously
  // (app config on foreground and sign-in, the opt-in from storage), and a dependency would
  // reload the whole page, spinner and all, the moment it flipped under an owner already
  // reading it. A flip lands on the next focus; until then the row is today's (fail closed).
  const trialScreenRef = useRef(trialScreen);
  trialScreenRef.current = trialScreen;
  const [getReady, setGetReady] = useState<GetReadyState | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { appointmentId, ask } = useLocalSearchParams<{ appointmentId?: string; ask?: string }>();
  // An appointment on the route makes this Get ready; without one it is the plain
  // rundown Ask opens.
  const wantsGetReady = typeof appointmentId === 'string' && appointmentId.length > 0;

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
      //
      // Through the LIVE read (F4): a booking whose visit has been logged is no longer
      // upcoming, so it resolves to null like a cancelled one and the page falls back
      // to the plain rundown. The laxer `readAppointmentById` handed it back, and Back
      // from the saved visit landed on a Get ready that still offered *Take notes* —
      // whose Done → Save logged the same visit a second time.
      const appointment = wantsGetReady ? await readEditableAppointment(appointmentId) : null;
      const subjectId = appointment?.pet_id ?? usePetStore.getState().activePet?.id ?? null;
      if (!subjectId) {
        if (loadIdRef.current === myId) setStatus('error');
        return;
      }
      const subjectName = resolveRecordPetName(usePetStore.getState().pets, subjectId);

      const built = await buildRundown(subjectId, subjectName);
      if (loadIdRef.current !== myId) return;
      setRundown(built);
      setRundownPetId(subjectId);

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
      const worthRaising = await buildForAppointment(
        built,
        subjectId,
        myId,
        loadIdRef,
        trialScreenRef.current,
      );
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

  // ON FOCUS, not on mount (CUL-952). `load`'s deps are `[petId, wantsGetReady,
  // appointmentId]`, and none of them change when a screen pushed FROM here pops —
  // this one stays mounted underneath. That was harmless while every door from here
  // was read-only, and stopped being harmless the moment ⋯ *Change the appointment*
  // got a real destination: the owner moved Tuesday to next Tuesday, tapped Save,
  // and landed back on a page whose eyebrow still read "TUESDAY · 3:00 PM" — which
  // reads as "it didn't save", so the obvious next move is to do it again.
  //
  // It fixes the removal case in the same hook, and that one is a G5 violation
  // rather than a cosmetic staleness: `load` already resolves a cancelled row to
  // `setGetReady(null)` and falls back to the plain rundown, so re-reading is what
  // stops this screen rendering a title, a questions block and a ⋯ menu for an
  // appointment that is no longer on the record. The visits list and the Home strip
  // have always used this hook; the door named in CUL-952's title was the one that
  // did not.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Consume the one-shot once there is something to open the sheet over, then strip
  // the param so a re-focus reads a clean URL rather than relying on the ref alone.
  useEffect(() => {
    if (!getReady || !pendingAsk.current) return;
    pendingAsk.current = false;
    setSheetOpen(true);
    router.setParams({ ask: undefined });
  }, [getReady]);

  // The report of the pet whose rundown is on screen (CUL-1334): in Get-ready mode that is
  // the appointment's pet, which need not be the active one, so the door names it rather
  // than letting `/report` fall back to the active pet (C-9). `rundownPetId` is set in the
  // same commit as the rundown it describes.
  const openReport = useCallback(() => {
    router.push(rundownPetId ? reportHref(rundownPetId) : '/report');
  }, [rundownPetId]);

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

  // The SUBJECT's name, never `activePet`'s (CUL-574 / AC 11, and this screen's own
  // header). Before any read has answered the screen genuinely does not know whose
  // record it is, so it names nobody rather than naming the active pet — which in
  // Get-ready mode can be a different animal from the one the page is about. There is
  // no `?? activePet?.name` rung, for the reason `resolveRecordPetName` has none:
  // correct-but-anonymous beats confidently wrong (C-9).
  //
  // Not reachable from today's only entry point (the strip always opens its own pet's
  // appointment) and reachable from the next one — the CUL-253 reminder deep link is a
  // planned, open item.
  const subjectName = getReady?.petName ?? rundown?.petName ?? null;

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
          <Text style={styles.loadingText}>
            {subjectName ? `Pulling ${subjectName}’s record together…` : 'Pulling the record together…'}
          </Text>
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
                  // Keyed on the ROW, which carries a recheck only when it was built with
                  // the gate live (`buildForAppointment`). Keyed on the live gate instead, a
                  // revocation while the page is open drew a refusal row as a bare title
                  // in the safety band (adversarial pass, TS-8).
                  renderRecheck={(recheck) => (
                    <RecheckQuestions
                      recheck={recheck}
                      // CUL-1342: the capped dose rows' door, to the APPOINTMENT's pet's list
                      // (C-9), the same route and param the trial screen's door uses.
                      onOpenDoses={() =>
                        router.push({
                          pathname: '/trial-exposures',
                          params: { pet: getReady.appointment.pet_id },
                        })
                      }
                    />
                  )}
                  onRemove={(id) =>
                    writeQuestions(getReady.questions.filter((q) => q.id !== id)).catch(() => {})
                  }
                />
                <Text style={styles.sectionLabel}>The rundown · last 30 days</Text>
              </>
            ) : null}

            <RundownBlock
              rundown={rundown}
              petName={rundown.petName}
              onTap={(tap) => navigateTo(tap, historyV2 && rundownPetId !== null && rundownPetId === petId)}
            />
          </ScrollView>

          <View style={[styles.bar, { paddingBottom: insets.bottom + theme.space2 }]}>
            {getReady ? (
              // ONE primary (R-share). The rundown is not for the vet — all nine
              // lenses said so independently — so the only hand-off here is the
              // report, and the text share sits under ⋯ as *Copy as text*.
              <>
                <PrimaryButton label="Send the vet report" onPress={openReport} />
                {/* The door Get ready was always specified to have (spec §4.1 C1:
                    the notes are "opened from Get ready") and never got, which is
                    half of CUL-966 — the questions typed on THIS page become ticks
                    on a screen this page could not reach. Secondary, because the
                    single primary here is the report (R-share, nine lenses). */}
                <PrimaryButton
                  label="Take notes"
                  onPress={() =>
                    router.push(`/vet-visits/at-the-vet?appointment=${getReady.appointment.id}`)
                  }
                  variant="secondary"
                  style={styles.saveBtn}
                />
                <Text style={styles.barHint}>
                  The report is the clinical record. This page is your quick answer.
                </Text>
              </>
            ) : (
              <>
                <PrimaryButton label="Share the full vet report" onPress={openReport} />
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
              // The appointment ITSELF, not the list (CUL-952). This pushed
              // `/vet-visits`, where the only control is *Add* — so a menu item
              // named *Change the appointment* booked a SECOND appointment beside
              // the one the owner meant to move, and Home then led with whichever
              // was earlier. The id rides the route, so the screen never asks the
              // store which appointment this is (AC 11).
              router.push(
                `/vet-visits/edit-appointment?appointment=${getReady.appointment.id}`,
              );
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
 * How long Get ready waits on the Signal cache before drawing the page without it (F7).
 *
 * The cache is the page's one NETWORK read, and `lib/supabase.ts` sets no fetch
 * timeout: on a connection that is up but stalled (clinic Wi-Fi) the request neither
 * answers nor fails until the OS gives up, about a minute later. Everything else on
 * the page is local and already built, and the owner sat on "Pulling … together" in
 * the waiting room for all of it. Past the bound the read counts as unreadable, the
 * case the gap line already names, so the page says the Signal is missing instead of
 * waiting for it. Four seconds is well past a healthy read and well short of an owner
 * giving up on the screen.
 */
const SIGNAL_CACHE_WAIT_MS = 4_000;

/**
 * `read`'s answer, or null if it has not given one within `ms`. A rejection is null too.
 *
 * The read is not cancelled (a promise cannot be) and is left to finish on its own.
 * That is safe only because it is a SELECT, so the abandoned read writes nothing.
 * Racing a call that WRITES is the defect `lib/trialContaminant.ts`'s
 * `noteTrialFlagShown` header records: the loser went on to spend a budget for a
 * heads-up nobody was shown.
 */
function answeredWithin<T>(read: Promise<T | null>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const bound = setTimeout(() => resolve(null), ms);
    read.then(
      (value) => {
        clearTimeout(bound);
        resolve(value);
      },
      () => {
        clearTimeout(bound);
        resolve(null);
      },
    );
  });
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
  trialScreenLive: boolean,
): Promise<WorthRaising> {
  // ONE snapshot, read once. Two `getState()` calls here were not a race — both are
  // synchronous with no await between them — but a reader has to prove that each time.
  const { pets } = usePetStore.getState();
  const pet = pets.find((p) => p.id === subjectId) ?? null;

  // One clock for every read and the build, so the two trial reads bound the same window.
  const nowMs = Date.now();
  const [signalRow, trialInput, recheckRead] = await Promise.all([
    answeredWithin(
      readSignalCache(subjectId)
        // `row ? row.findings : null` — NOT `row?.findings ?? []`, and the difference is
        // the whole point of the two states.
        //
        // `readSignalCache` returns null when there is NO CACHE ROW, and it gets there
        // without throwing: PostgREST's `maybeSingle()` answers zero rows with
        // `{data: null, error: null}`. So the `?? []` form turned "the engine has never
        // run for this pet" into "the engine found nothing" — `signalUnavailable` false,
        // no gap line, and the quiet-record treatment on a record nobody has looked at.
        // Reachable on a new pet booking a first appointment, and on any pet whose regens
        // have never succeeded. Absence of a computed finding is not absence of a finding.
        //
        // `row.findings` is already `[]` when the engine ran and found nothing, so the
        // genuinely-quiet record still renders mock B1b. The row's `generated_at` rides with
        // them: it is half the trial anchor (CUL-1364).
        .then((row) => (row ? { findings: row.findings, generatedAt: row.generatedAt } : null))
        // A throw is the other unreadable case (offline, or a failed request).
        .catch(() => null),
      // And a read that has done neither by the bound is the third (F7).
      SIGNAL_CACHE_WAIT_MS,
    ),
    pet
      ? loadDietTrialFacts({
          pet: { id: pet.id, name: pet.name, species: pet.species, sex: pet.sex },
          otherPetNames: pets.filter((p) => p.id !== pet.id).map((p) => p.name),
          signalsV2: true,
          nowMs,
        }).catch(() => null)
      : Promise.resolve(null),
    // Flag-on only, and for the appointment's pet (C-9).
    trialScreenLive && pet ? readRecheckFacts(pet, nowMs) : Promise.resolve('unreadable' as const),
  ]);

  if (loadIdRef.current !== myId) {
    return { rows: [], signalUnavailable: false };
  }

  // TS-8: the screen's model over the SAME input this page already read, for the same pet.
  // An unloadable trial is the screen's own `unreadable` state, which the recheck renders
  // nothing for, and the row falls back to the strip's, which is null too: no row.
  const trialScreen =
    trialScreenLive && pet
      ? buildTrialScreenModel({
          petId: pet.id,
          pet: { id: pet.id, name: pet.name },
          petsLoaded: true,
          petName: resolveRecordPetName(pets, pet.id),
          trial: trialInput
            ? { status: 'loaded', input: trialInput, inputIsForPet: true }
            : { status: 'unreadable', input: null, inputIsForPet: false },
          facts: NO_LEDGER_FACTS,
          allowedSet: UNKNOWN_ALLOWED_SET,
          appointment: null,
        })
      : null;

  return buildWorthRaising({
    findings: signalRow ? signalRow.findings : null,
    // CUL-1364: Home's trial anchor, for THIS pet's running trial (C-9), on the build's clock.
    signalAnchor: {
      generatedAt: signalRow ? signalRow.generatedAt : null,
      trial: trialInput?.trial ? signalTrialWindowOf(trialInput.trial, nowMs) : null,
    },
    // The same fail-closed rule Home applies (B-789): absence of a refusal fact
    // during a failed load is not evidence of eating, so an unloadable trial
    // suppresses the reassuring trial_response row rather than letting it through.
    withholdFallingVomit: trialInput ? isAnimalNotEating(trialInput) : true,
    trialStrip: trialInput ? resolveTrialStrip(trialInput) : null,
    trialScreen,
    // Accepted only when it answered for the trial the input above is about.
    trialFacts: recheckFactsState(recheckRead, trialInput?.trial?.id ?? null),
    trialResponseCounts: trialInput?.trialResponse ?? null,
    // REQUIRED on the input type, never defaulted. `resolveTrialStrip` discards the
    // device's declines because on Home the Signal card above the strip owns the
    // statement — and Get ready has no Signal card above it, so passing only the strip
    // dropped a device-local SAFETY fact on the page read aloud in the exam room. A
    // default here would have handed that over silently (C-37: a default on a
    // safety-relevant parameter is the decision). EVERY flag, structured, so
    // `buildWorthRaising` can drop only the ones the Signal already states (CUL-950).
    intakeDecline: localIntakeDeclines(trialInput),
    rundown: built,
    nowMs,
  });
}

/**
 * The recheck's facts read. A throw (sync or async) is `'unreadable'`, never a null:
 * null is "this pet has no trial", which a failed read is not.
 */
async function readRecheckFacts(
  pet: Pet,
  nowMs: number,
): Promise<TrialPredicateFacts | null | 'unreadable'> {
  try {
    return await loadTrialPredicateFacts(
      { id: pet.id, name: pet.name, species: pet.species, sex: pet.sex },
      nowMs,
    );
  } catch (e) {
    console.error('[Get ready] trial facts read failed:', e);
    return 'unreadable';
  }
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
