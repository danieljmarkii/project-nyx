import { useCallback, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { theme } from '../../constants/theme';
import { Header } from '../../components/ui';
import { ThemedText } from '../../components/ui/ThemedText';
import { WhorlSpinner } from '../../components/brand/WhorlSpinner';
import { AfterVisitBody, type AfterVisitFields, type TrialRow } from '../../components/vetvisits/AfterVisitBody';
import { VisitSavedMoment } from '../../components/vetvisits/VisitSavedMoment';
import { AddMedicationModal, type Regimen } from '../../components/profile/AddMedicationModal';
import { StartTrialModal } from '../../components/profile/StartTrialModal';
import { useAllowlistFlag } from '../../hooks/useAppConfig';
import { useBetaOptIn } from '../../lib/betaFeatures';
import { resolveRecordPetName, usePetStore } from '../../store/petStore';
import { commitVisit } from '../../lib/haptics';
import { syncPendingMedications, syncPendingVetAppointments, syncPendingVetVisits } from '../../lib/sync';
import { linkVetDocumentVisit } from '../../lib/vetDocumentLibrary';
import { endRegimen } from '../../lib/medicationSetup';
import {
  describeActiveTrial,
  endActiveTrial,
  getActiveTrialForPet,
  type ActiveTrialSummary,
} from '../../lib/dietTrialSetup';
import { captureVisitPaperwork, forgetPaperwork, readPaperworkFor } from '../../lib/visitPaperwork';
import {
  courseVerdictLabel,
  describeVisitSave,
  trialVerdictLabel,
  type CourseVerdict,
  type LinkedLine,
  type TrialVerdict,
  type VisitSaveSummary,
} from '../../lib/vetVisitPlan';
import {
  bookVetAppointment,
  clampVisitDate,
  formatVisitDate,
  linkCourseToVisit,
  linkTrialToVisit,
  localDateKey,
  logVetVisit,
  logVisitFromAppointment,
  readActiveCourses,
  readAppointment,
  readVisitConsequence,
  readVisitPrefill,
  readTrialVisitLink,
  repairRefusedVisitLinks,
  updateVisitDetails,
  VetVisitLinkRefused,
  type ActiveCourse,
  type LocalVetAppointment,
} from '../../lib/vetVisits';

/** Which sheet is up. At most ONE is ever mounted — see the CUL-662 note below. */
type Sheet = { kind: 'med'; editing: Regimen | null } | { kind: 'trial' } | null;

// "How did it go?" (CUL-902 VV-4; mocks D1 + D2) — the plan becomes records.
//
// A PUSHED ROUTE, NOT A MODAL (§8's ruled default). The medication setup and the
// trial setup are both RN `Modal`s, and a component already inside a Modal cannot
// reliably present another one on iOS (CUL-662 wedged the log sheet for every
// multi-pet account). A pushed route can present one, so this screen is pushed and
// hosts AT MOST ONE Modal at a time — `sheet` is a discriminated union rather than
// two booleans precisely so "both at once" is unrepresentable, and the two sheets
// are mounted conditionally so the closed tree holds none.
//
// THE VISIT ROW IS CREATED ON THE FIRST PLAN ACTION, not at Save. §5.1 is explicit
// that a NEW course or trial carries its visit link in its OWN insert, "never a
// follow-up UPDATE a crash can lose" — so *Add* needs a real visit id at the moment
// `startRegimen` writes. This is not the phantom row §5.1 forbids: that one is a
// visit minted to hold TYPING, with nobody having said the visit happened. Here the
// owner has answered a question about what the vet decided, which is an explicit
// statement that it did — and if the app dies next, the visit is on the record with
// what they had entered rather than lost.
//
// `pet_id` COMES FROM THE APPOINTMENT (AC 11). The shipped `app/vet-visit.tsx` reads
// `activePet` at save time (`:117`); a hydration pull can move the active pet under
// a half-filled screen, and the row would be written under a pet nobody chose.
export default function AfterVisitScreen() {
  const eligible = useAllowlistFlag('vet_visits');
  const optedIn = useBetaOptIn('vet_visits');
  const enabled = eligible && optedIn;

  const { appointment: appointmentId } = useLocalSearchParams<{ appointment?: string }>();
  const activePet = usePetStore((s) => s.activePet);
  const pets = usePetStore((s) => s.pets);

  const [appointment, setAppointment] = useState<LocalVetAppointment | null>(null);
  // The pet this SCREEN is about. With an appointment it is the appointment's, full
  // stop. Without one (the cold "log a visit" door this screen replaces) it is the
  // active pet captured ONCE on the first non-null value and frozen after — never
  // re-read at save.
  const [screenPetId, setScreenPetId] = useState<string | null>(null);
  if (screenPetId === null && !appointmentId && activePet) setScreenPetId(activePet.id);
  const petId = appointment?.pet_id ?? screenPetId;

  const [fields, setFields] = useState<AfterVisitFields>({
    visitedAt: new Date(),
    clinicName: '',
    vetName: '',
    reason: '',
    notes: '',
  });
  const [courses, setCourses] = useState<ActiveCourse[]>([]);
  const [trial, setTrial] = useState<ActiveTrialSummary | null>(null);
  const [courseVerdicts, setCourseVerdicts] = useState<Record<string, CourseVerdict>>({});
  const [trialVerdict, setTrialVerdict] = useState<TrialVerdict | null>(null);
  const [nextVisitAt, setNextVisitAt] = useState<string | null>(null);
  const [paperwork, setPaperwork] = useState<string[]>([]);
  const [linked, setLinked] = useState<LinkedLine[]>([]);

  const [sheet, setSheet] = useState<Sheet>(null);
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [summary, setSummary] = useState<VisitSaveSummary | null>(null);

  // The visit, once it exists. A REF as well as state: `ensureVisit` is awaited from
  // several handlers and each needs the id the instant it is written, not a render
  // later (C-22's reasoning — consumption has to be visible to every closure).
  const visitIdRef = useRef<string | null>(null);
  const [visitId, setVisitId] = useState<string | null>(null);
  // The create, while it is in flight. `visitIdRef` alone makes `ensureVisit`
  // idempotent only AFTER the write resolves, and `busyRow` cannot close the window
  // either — it is STATE, so two presses landing in one tick both read `null` and both
  // proceed. Two `vet_visits` rows for one visit is the worst outcome on this screen:
  // the appointment points at one of them, the plan links split across both, and the
  // report window anchors on whichever sorts first. A promise in a ref is what makes
  // the second caller wait for the first rather than race it.
  const creatingVisit = useRef<Promise<string> | null>(null);
  // Seeded once from the record; a re-focus (returning from /food-capture) must not
  // overwrite what the owner has typed since.
  const seeded = useRef(false);
  // The one-shot request to re-open the trial sheet after /food-capture, held in a
  // ref and consumed on focus — never in state, where an already-scheduled passive
  // effect re-enters with the pre-clear closure and fires twice (C-22, CUL-170).
  const resumeTrialSheet = useRef(false);

  const loadPlan = useCallback(async (forPetId: string) => {
    const [nextCourses, activeTrial] = await Promise.all([
      readActiveCourses(forPetId),
      getActiveTrialForPet(forPetId),
    ]);
    setCourses(nextCourses);
    setTrial(activeTrial);
  }, []);

  const load = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      setLoaded(true);
      return;
    }
    try {
      const appt = appointmentId ? await readAppointment(appointmentId) : null;
      setAppointment(appt);
      const forPetId = appt?.pet_id ?? screenPetId;
      if (!forPetId) {
        setLoaded(true);
        return;
      }
      // CUL-945's recovery, run where the owner already is: a course or trial the
      // server refused on a bad visit link is un-parked here rather than staying
      // quarantined forever. A no-op in every ordinary session.
      repairRefusedVisitLinks(forPetId).catch((e) =>
        console.warn('[after-visit] link repair failed:', e),
      );

      await loadPlan(forPetId);
      if (appt) setPaperwork(await readPaperworkFor(appt.id));

      if (!seeded.current) {
        seeded.current = true;
        const prefill = appt ? null : await readVisitPrefill(forPetId);
        setFields({
          // The appointment's own day, read as a LOCAL calendar day — the instant is
          // stored UTC and `toISOString().slice(0, 10)` would log an evening visit in
          // the Americas as tomorrow (CUL-946, live on the screen this replaces).
          //
          // CLAMPED, because this screen is reachable from *Next* — an appointment
          // that has NOT happened yet — and the picker's `maximumDate` constrains a
          // pick, never a seed. See `clampVisitDate`.
          visitedAt: appt ? clampVisitDate(new Date(appt.scheduled_at)) : new Date(),
          clinicName: appt?.clinic_name ?? prefill?.clinicName ?? '',
          vetName: appt?.vet_name ?? prefill?.vetName ?? '',
          reason: appt?.reason ?? '',
          notes: appt?.notes_draft ?? '',
        });
      }
      setFailed(false);
      setLoaded(true);
    } catch (err) {
      console.warn('[after-visit] read failed:', err);
      setFailed(true);
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  }, [enabled, appointmentId, screenPetId, loadPlan]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      load().then(() => {
        if (cancelled) return;
        const resume = resumeTrialSheet.current;
        resumeTrialSheet.current = false;
        if (resume) setSheet({ kind: 'trial' });
      });
      return () => {
        cancelled = true;
      };
    }, [load]),
  );

  /**
   * The visit row, created the first time something needs it.
   *
   * Idempotent by the ref, which is what makes it safe to call from every handler.
   * With an appointment it goes through `logVisitFromAppointment`, whose transaction
   * also marks the appointment attended — so the appointment leaves Home and *Next*
   * the moment the visit exists, rather than at Save.
   */
  const ensureVisit = useCallback(async (): Promise<string> => {
    if (visitIdRef.current) return visitIdRef.current;
    if (creatingVisit.current) return creatingVisit.current;
    if (!petId) throw new Error('ensureVisit: no pet for this screen');

    const visitedAt = localDateKey(fields.visitedAt);
    const create = appointment
      ? logVisitFromAppointment({
          appointment,
          visitedAt,
          clinicName: fields.clinicName,
          vetName: fields.vetName,
          reason: fields.reason,
          notes: fields.notes,
        })
      : logVetVisit({
          petId,
          visitedAt,
          clinicName: fields.clinicName,
          vetName: fields.vetName,
          reason: fields.reason,
          notes: fields.notes,
        });
    // Parked in the ref SYNCHRONOUSLY, before the first `await` — a second caller
    // arriving one tick later must find it there, not after it resolves.
    creatingVisit.current = create;

    let id: string;
    try {
      id = await create;
    } finally {
      // Cleared on failure too, so a retry is a retry rather than a re-await of a
      // promise that already rejected.
      creatingVisit.current = null;
    }

    visitIdRef.current = id;
    setVisitId(id);

    // The paperwork photographed in the room now has a visit to belong to. Through
    // Vet Files' own `linkVetDocumentVisit` — the ONE function that implements D7 —
    // and best-effort per document: a link that fails must not take the visit with
    // it, and the document is already filed either way.
    if (appointment && paperwork.length > 0) {
      for (const groupId of paperwork) {
        try {
          await linkVetDocumentVisit(groupId, id);
        } catch (e) {
          console.warn('[after-visit] paperwork link failed:', e);
        }
      }
      forgetPaperwork(appointment.id).catch(console.error);
    }

    syncPendingVetVisits().catch(console.error);
    syncPendingVetAppointments().catch(console.error);
    return id;
  }, [appointment, fields, petId, paperwork]);

  function note(line: LinkedLine) {
    setLinked((prev) => [...prev.filter((l) => l.key !== line.key), line]);
  }

  /** One place where a write's failure becomes a sentence — never the error's text
   *  (`guards/ownerFacingCopy.test.ts`). */
  function sayFailed(err: unknown, what: string) {
    console.warn(`[after-visit] ${what} failed:`, err);
    if (err instanceof VetVisitLinkRefused) {
      // CUL-945: the record was NOT written, and the reason is the link rather than
      // anything the owner typed. Saying "try again" would be false — the same
      // attempt fails the same way.
      Alert.alert(
        'That didn’t save',
        'This visit belongs to a different pet, so it can’t be linked here. Open the visit from that pet’s profile.',
      );
      return;
    }
    Alert.alert('That didn’t save', 'Try that again in a moment.');
  }

  async function handleCourseVerdict(course: ActiveCourse, verdict: CourseVerdict) {
    if (busyRow) return;
    setBusyRow(course.id);
    let linkedNow = false;
    try {
      const id = await ensureVisit();
      if (verdict === 'stopped') {
        // ENDED BY AN OWNER ACTION, which is what the H1 register requires before a
        // course may read as ended — silence never ends one. The day key comes from
        // the owner's LOCAL calendar (B-441): `endRegimen` writes no date it did not
        // receive. No link: `vet_visit_id` is where a course CAME FROM, and a course
        // stopped here started somewhere else.
        await endRegimen(course.id, localDateKey(new Date()));
        syncPendingMedications().catch(console.error);
      } else {
        // The RETURN says whether the link landed: it is first-wins, so a course
        // prescribed at an earlier visit keeps saying so, and the line below must not
        // claim otherwise (CUL-825 — ask, never assert).
        linkedNow = await linkCourseToVisit(course.id, id);
        syncPendingMedications().catch(console.error);
        if (verdict === 'changed') setSheet({ kind: 'med', editing: toRegimen(course) });
      }
      setCourseVerdicts((prev) => ({ ...prev, [course.id]: verdict }));
      note({
        key: `course:${course.id}`,
        title: `${course.drugName} ${courseVerdictLabel(verdict)}`,
        note: verdict === 'stopped' ? 'ended today' : linkedNow ? 'linked to this visit' : 'still on it',
      });
      if (petId) await loadPlan(petId);
    } catch (err) {
      sayFailed(err, 'course verdict');
    } finally {
      setBusyRow(null);
    }
  }

  async function handleTrialVerdict(verdict: TrialVerdict) {
    if (busyRow || !trial) return;
    setBusyRow('trial');
    try {
      const id = await ensureVisit();
      if (verdict === 'switched') {
        // End AND start in one flow (§8's ruled default), and the trial sheet already
        // owns that flow: its `blocked` step ends the running trial as part of the
        // same action that creates the next one. Opening it is the whole of *Switched*
        // — a second implementation here would be a second ordering to get wrong.
        setSheet({ kind: 'trial' });
        setTrialVerdict(verdict);
        return;
      }
      // The link first, then the ending. A trial that ALREADY EXISTS takes the link
      // as an UPDATE (§5.1 — the same-insert rule is about new rows), and doing it
      // before the end means a crash between the two leaves a running trial with its
      // provenance recorded rather than an ended one with none.
      const linkedNow = await linkTrialToVisit(trial.id, id);
      if (verdict === 'ended') {
        const { complete } = describeActiveTrial(trial);
        await endActiveTrial({
          trialId: trial.id,
          // 'The vet said to stop' is literally what happened on this screen. On a
          // trial that has reached its target the honest token is `completed`, which
          // is also the only one `endActiveTrial` will attach an outcome to.
          reason: complete ? 'completed' : 'vet_advised',
        });
      }
      setTrialVerdict(verdict);
      note({
        key: 'trial',
        title: `${trial.foodLabel?.trim() || 'Diet trial'} ${trialVerdictLabel(verdict)}`,
        note: verdict === 'ended' ? 'ended today' : linkedNow ? 'linked to this visit' : 'still running',
      });
      if (petId) await loadPlan(petId);
    } catch (err) {
      sayFailed(err, 'trial verdict');
    } finally {
      setBusyRow(null);
    }
  }

  async function openMedicationSheet() {
    if (busyRow) return;
    setBusyRow('add-course');
    try {
      await ensureVisit();
      setSheet({ kind: 'med', editing: null });
    } catch (err) {
      sayFailed(err, 'open medication setup');
    } finally {
      setBusyRow(null);
    }
  }

  async function openTrialSheet() {
    if (busyRow) return;
    setBusyRow('trial');
    try {
      await ensureVisit();
      setSheet({ kind: 'trial' });
    } catch (err) {
      sayFailed(err, 'open trial setup');
    } finally {
      setBusyRow(null);
    }
  }

  async function handlePickNextVisit(day: Date) {
    if (busyRow || !petId) return;
    setBusyRow('next-visit');
    try {
      const id = await ensureVisit();
      const dayKey = localDateKey(day);
      // BOTH: the visit says what the vet asked for, and the appointment is the thing
      // Home and the reminder will read. The visit's own `next_visit_at` is what
      // `derivePlanTags` renders as "Recheck set" and what seeds the next booking
      // sheet, so writing only the appointment would leave the visit silent about
      // its own plan.
      await updateVisitDetails(id, { nextVisitAt: dayKey });
      await bookVetAppointment({
        petId,
        // Local midnight — the no-time sentinel the booking sheet uses, because a
        // vet who says "in six weeks" has not named an hour.
        scheduledAt: new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0).toISOString(),
        clinicName: fields.clinicName,
        vetName: fields.vetName,
        reason: 'recheck',
      });
      syncPendingVetAppointments().catch(console.error);
      setNextVisitAt(dayKey);
      note({ key: 'next-visit', title: `${formatVisitDate(dayKey)} · recheck`, note: 'booked' });
    } catch (err) {
      sayFailed(err, 'next visit');
    } finally {
      setBusyRow(null);
    }
  }

  async function handleAddPaperwork() {
    if (busyRow || !petId) return;
    setBusyRow('paperwork');
    try {
      const id = await ensureVisit();
      const { groupId, skipped } = await captureVisitPaperwork(petId);
      if (groupId) {
        await linkVetDocumentVisit(groupId, id);
        setPaperwork((prev) => (prev.includes(groupId) ? prev : [...prev, groupId]));
        note({ key: 'paperwork', title: 'Paperwork', note: 'in Vet Files' });
      }
      if (skipped) Alert.alert('Some files were skipped', skipped);
    } catch (err) {
      sayFailed(err, 'paperwork');
    } finally {
      setBusyRow(null);
    }
  }

  async function handleSave() {
    if (saving || !petId) return;
    setSaving(true);
    try {
      // `ensureVisit` writes these same fields when it CREATES the row, so the update
      // is only for a row that already existed when this call started. Writing them
      // twice would move `updated_at` on a row nothing changed, which under LWW lets
      // a no-op win over another device's real edit.
      //
      // The in-flight slot counts as "existed", and that is not belt-and-braces: a
      // create started by a plan action and still resolving did NOT see the fields as
      // they stand now, so skipping the update there would silently drop whatever the
      // owner typed between the two.
      const existed = visitIdRef.current !== null || creatingVisit.current !== null;
      const id = await ensureVisit();
      if (existed) {
        await updateVisitDetails(id, {
          visitedAt: localDateKey(fields.visitedAt),
          clinicName: fields.clinicName,
          vetName: fields.vetName,
          reason: fields.reason,
          notes: fields.notes,
        });
      }
      syncPendingVetVisits().catch(console.error);

      // The moment's consequence lines are DERIVED from what the record now says,
      // not asserted: a visit logged behind one already on file changes neither the
      // report window nor Home, and the moment says so by saying nothing.
      const consequence = await readVisitConsequence({
        id,
        pet_id: petId,
        visited_at: localDateKey(fields.visitedAt),
      });
      setSummary(
        describeVisitSave({
          petName: resolveRecordPetName(pets, petId),
          consequence,
          linked,
        }),
      );
      // A soft impact, never a success chime (the issue's ruling). `commitRoutine`
      // — the verb a meal or a dose uses — plays the system SUCCESS notification,
      // which is exactly the beat a vet visit must not have; `commitVisit` is its own
      // verb rather than a second caller of `commitSymptom`, because the vocabulary is
      // one verb per MOMENT. Fire-and-forget, like every verb in lib/haptics.
      commitVisit();
    } catch (err) {
      sayFailed(err, 'save');
    } finally {
      setSaving(false);
    }
  }

  async function handleRegimenAdded(regimen: Regimen) {
    setSheet(null);
    // ASKED OF THE RECORD, not asserted (CUL-825). `startRegimen` throws when the
    // link is refused, so reaching here should mean the link landed — but "should"
    // is the word this rule exists to delete, and a line claiming provenance the row
    // does not hold would be the moment lying about where a prescription came from.
    //
    // `readActiveCourses` rather than `loadPlan`, because adding a medication cannot
    // have changed the trial — and the list it returns is the one this row is about,
    // so it is used for both the line and the re-render. Guarded on `petId`: an
    // unguarded `: []` would empty a list the owner is looking at.
    if (!petId) return;
    const courses = await readActiveCourses(petId);
    const written = courses.find((c) => c.id === regimen.id);
    note({
      key: `course:${regimen.id}`,
      title: `${regimen.drug_name} started`,
      note: written?.vetVisitId ? 'linked to this visit' : 'started',
    });
    setCourses(courses);
  }

  async function handleTrialStarted(trialId: string) {
    setSheet(null);
    setTrialVerdict((prev) => prev ?? 'keep');
    // Named from the record rather than from the sheet's form state, so the line says
    // what was written.
    const active = petId ? await getActiveTrialForPet(petId) : null;
    note({
      key: 'trial',
      title: `${active?.foodLabel?.trim() || 'Diet trial'} started`,
      // Asked of the RECORD at the moment the line is written (CUL-825): the trial
      // carries the link only if `startDietTrial` accepted it, and a line claiming a
      // link the row does not hold would be the moment lying about provenance.
      note: (await readTrialVisitLink(trialId)) ? 'linked to this visit' : 'started',
    });
    if (petId) await loadPlan(petId);
  }

  if (!enabled) return <Redirect href="/(tabs)/profile" />;

  const petName = resolveRecordPetName(pets, petId);
  const trialRow: TrialRow | null = trial
    ? {
        id: trial.id,
        label: trial.foodLabel?.trim() || 'Diet trial',
        // Day math through the ONE shared helper (B-421) — never re-derived here.
        dayLine: describeActiveTrial(trial).dayLine,
      }
    : null;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {summary ? (
        <>
          <Header />
          <VisitSavedMoment
            summary={summary}
            onDone={() => {
              // Onto the visit as written, so the owner lands on the record they just
              // made rather than back on the form that made it.
              if (visitId) router.replace(`/vet-visits/${visitId}`);
              else router.replace('/vet-visits');
            }}
          />
        </>
      ) : (
        <>
          <Header
            leading="back"
            onLeadingPress={() => (router.canGoBack() ? router.back() : router.replace('/vet-visits'))}
          />
          {loading ? (
            <View style={styles.centre}>
              <WhorlSpinner size="md" ground="day" />
            </View>
          ) : failed ? (
            <View style={styles.centre}>
              <ThemedText style={styles.missing}>This visit could not be opened just now.</ThemedText>
              <TouchableOpacity
                onPress={() => {
                  setLoading(true);
                  load();
                }}
                style={styles.retry}
                accessibilityRole="button"
                accessibilityLabel="Try again"
              >
                <ThemedText style={styles.retryText}>Try again</ThemedText>
              </TouchableOpacity>
            </View>
          ) : petId ? (
            <KeyboardAvoidingView
              style={styles.fill}
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
              <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
                <AfterVisitBody
                  petName={petName}
                  fields={fields}
                  onChangeField={(key, value) => setFields((prev) => ({ ...prev, [key]: value }))}
                  courses={courses}
                  courseVerdicts={courseVerdicts}
                  onCourseVerdict={handleCourseVerdict}
                  onAddCourse={openMedicationSheet}
                  trial={trialRow}
                  trialVerdict={trialVerdict}
                  onTrialVerdict={handleTrialVerdict}
                  onStartTrial={openTrialSheet}
                  onAddFood={() => router.push('/food-capture')}
                  nextVisitAt={nextVisitAt}
                  onPickNextVisit={handlePickNextVisit}
                  paperworkCount={paperwork.length}
                  onAddPaperwork={handleAddPaperwork}
                  busyRow={busyRow}
                  saving={saving}
                  onSave={handleSave}
                />
              </ScrollView>
            </KeyboardAvoidingView>
          ) : loaded ? (
            <View style={styles.centre}>
              <ThemedText style={styles.missing}>
                This appointment is no longer on the record.
              </ThemedText>
            </View>
          ) : null}

          {/* AT MOST ONE MODAL IS EVER MOUNTED (AC 7, the CUL-662 pin). Mounted
              conditionally rather than kept resident behind `visible={false}`: a
              resident Modal is still a Modal in the tree, so two of them would be two
              even while both are closed. */}
          {sheet?.kind === 'med' && petId ? (
            <AddMedicationModal
              visible
              petId={petId}
              existingRegimen={sheet.editing ?? undefined}
              vetVisitId={visitId}
              onClose={() => setSheet(null)}
              onAdded={handleRegimenAdded}
              onUpdated={(regimen) => {
                setSheet(null);
                note({
                  key: `course:${regimen.id}`,
                  title: `${regimen.drug_name} changed`,
                  note: 'linked to this visit',
                });
                if (petId) void loadPlan(petId);
              }}
            />
          ) : null}
          {sheet?.kind === 'trial' && petId ? (
            <StartTrialModal
              visible
              petId={petId}
              petName={petName}
              species={pets.find((p) => p.id === petId)?.species ?? null}
              vetVisitId={visitId}
              onClose={() => setSheet(null)}
              onStarted={handleTrialStarted}
              onAddFood={() => {
                // The pending re-open lives in a REF consumed once on focus, never in
                // state (C-22 / CUL-170): food-capture ends in `router.dismissAll()`,
                // so without this the owner lands back here with no sheet and every
                // reason to think the trial saved.
                resumeTrialSheet.current = true;
                setSheet(null);
                router.push('/food-capture');
              }}
              onLogFirstMeal={() => {
                setSheet(null);
                router.push('/log');
              }}
            />
          ) : null}
        </>
      )}
    </SafeAreaView>
  );
}

/** The course as the medication editor seeds from. A structural build rather than a
 *  second read: every field came from the same local row. */
function toRegimen(course: ActiveCourse): Regimen {
  return {
    id: course.id,
    pet_id: course.petId,
    medication_item_id: course.medicationItemId,
    drug_name: course.drugName,
    dose_amount: course.doseAmount,
    route: course.route,
    doses_per_day: course.dosesPerDay,
    schedule_notes: course.scheduleNotes,
    indication: course.indication,
    prescribed_by: course.prescribedBy,
    started_at: course.startedAt,
    target_duration_days: course.targetDurationDays,
    target_duration_doses: course.targetDurationDoses,
    status: 'active',
    ended_at: null,
  };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colorNeutralLight,
  },
  fill: {
    flex: 1,
  },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.space3,
    gap: theme.space2,
  },
  scroll: {
    paddingHorizontal: theme.space3,
    paddingBottom: theme.space5,
  },
  retry: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: theme.space2,
  },
  retryText: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorAccentInk,
  },
  missing: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextSecondary,
    textAlign: 'center',
  },
});
