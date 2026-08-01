import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import {
  Alert, Image, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { theme } from '../../constants/theme';
import { WhorlSpinner } from '../../components/brand/WhorlSpinner';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { Badge } from '../../components/ui/Badge';
import { Divider } from '../../components/ui/Divider';
import { supabase } from '../../lib/supabase';
import { uploadPhoto, compressForUpload, getPublicUrl, getSignedUrls } from '../../lib/storage';
import { VetFilesCard } from '../../components/vetfiles/VetFilesCard';
import { VET_FILES_ENTRY_ENABLED } from '../../lib/vetFilesEntry';
import { VET_DOCUMENTS_BUCKET } from '../../lib/vetDocuments';
import {
  readVetLibrary, buildVetFilesCardModel, VET_DOCUMENT_SIGNED_URL_TTL_SEC,
  VET_FILES_STRIP_LIMIT, type VetLibraryRow,
} from '../../lib/vetDocumentLibrary';
import { archiveBlockedCopy } from '../../lib/utils';
import { formatAge } from '../../lib/age';
import { usePetStore } from '../../store/petStore';
import { useMomentStore } from '../../store/momentStore';
import { insertMedicationDose } from '../../lib/medicationDose';
import { EditPetModal } from '../../components/profile/EditPetModal';
import { WeightTrendCard } from '../../components/profile/WeightTrendCard';
import { AddConditionModal, Condition } from '../../components/profile/AddConditionModal';
import { AddMedicationModal, Regimen } from '../../components/profile/AddMedicationModal';
import { StartTrialModal } from '../../components/profile/StartTrialModal';
import { ArchivePetSheet } from '../../components/profile/ArchivePetSheet';
import { DietTrialCard } from '../../components/profile/DietTrialCard';
import {
  TrialCompletionSheet, type TrialCompletionEntry,
} from '../../components/profile/TrialCompletionSheet';
import { useDietTrial } from '../../hooks/useDietTrial';
import { useTrialAllowedSet } from '../../hooks/useTrialAllowedSet';
import { resolveTrialCard } from '../../lib/dietTrialCard';
import { extensionDays, nextTargetDays } from '../../lib/dietTrialCompletion';
import { extendTrial } from '../../lib/dietTrialSetup';
import { getDietTrialProgress } from '../../lib/analytics';
import { dayKeyToLocalDate, petPronouns, toLocalDayKey } from '../../lib/utils';
import { Pet } from '../../store/petStore';
import {
  MEDICATION_ROUTE_OPTIONS, computeRegimenCompliance, regimenComplianceLine,
  regimenFlagLine, attributeDosesToRegimens, regimenDaysElapsed,
  type AdherenceTally, type RegimenCompliance, type AttributableDose,
} from '../../lib/medications';

const PET_PHOTO_BUCKET = 'nyx-pet-photos';

interface RegimenDisplay extends Regimen {
  // null = the start date did not parse, so the course's length is unknown (B-441).
  // Every consumer must test `!= null` explicitly: a bare `daysElapsed <= target`
  // coerces null to 0 and renders "Day null of 14".
  daysElapsed: number | null;
  tally: AdherenceTally;
  compliance: RegimenCompliance;
  complianceLine: string;
  flagLine: string | null;
}

const EMPTY_TALLY = (): AdherenceTally => ({ given: 0, partial: 0, missed: 0, refused: 0, unrated: 0 });

// Fold a regimen row + its dose tally into the display shape (compliance numbers +
// the two clinical-guardrails copy lines). Kept pure so onAdded/onUpdated can rebuild
// a single row optimistically without a refetch flash, exactly like the diet-trial
// derivation but reusing the unit-tested compute/copy helpers.
function buildRegimenDisplay(reg: Regimen, tally: AdherenceTally): RegimenDisplay {
  const daysElapsed = regimenDaysElapsed(reg.started_at);
  const compliance = computeRegimenCompliance({
    // With no day count there is no honest denominator, so the regimen reports a
    // dose COUNT instead of a percent — the same shape PRN already uses. Feeding a
    // guessed `1` would shrink the denominator and inflate adherence, which is the
    // reassuring direction and the one this must never drift toward (B-441).
    dosesPerDay: daysElapsed === null ? null : reg.doses_per_day,
    daysElapsed: daysElapsed ?? 1,
    tally,
  });
  return {
    ...reg,
    daysElapsed,
    tally,
    compliance,
    complianceLine: regimenComplianceLine(compliance),
    flagLine: regimenFlagLine(tally),
  };
}

function frequencyLabel(dosesPerDay: number | null): string {
  if (dosesPerDay == null) return 'As needed';
  switch (dosesPerDay) {
    case 1: return 'Once a day';
    case 2: return 'Twice a day';
    case 3: return '3× a day';
    case 4: return '4× a day';
    default: return `${dosesPerDay}× a day`;
  }
}

function routeLabel(route: string | null): string | null {
  if (!route) return null;
  return MEDICATION_ROUTE_OPTIONS.find((o) => o.value === route)?.label ?? null;
}

// The regimen day counter used to live here, carrying the flaw B-421 removed from
// the diet-trial counter. B-441 moved it to `lib/medications.regimenDaysElapsed`,
// routed through `lib/utils.localDayIndexOf` — this screen now holds no day math.

// "Started 12 Jun 2026" for the ongoing/overrun regimen row. `dayKeyToLocalDate`,
// never `new Date(started_at)`: the column is a date-only DATE, so the bare parse
// lands on UTC midnight and formats as the PREVIOUS day for anyone behind UTC —
// the display half of the same B-441 defect that inflated the counter. Falls back
// to the raw stored value if it does not parse, never to a confidently wrong date.
function formatRegimenStart(startedAt: string): string {
  const d = dayKeyToLocalDate(startedAt);
  if (!d) return startedAt;
  return d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}

// Age display lives in lib/age.formatAge now (B-251 PR 9) so the honesty rule has
// one home: an APPROXIMATE date_of_birth (entered as an age at onboarding, never a
// witnessed birthday) reads with a "~" hedge, never as a precise age.

function formatSex(sex: string): string {
  if (sex === 'male') return 'Male';
  if (sex === 'female') return 'Female';
  return '—';
}

function formatWeightLbs(kg: number | null): string {
  if (kg == null) return '—';
  return `${Math.round(kg * 2.20462 * 10) / 10} lbs`;
}

function statusLabel(status: string): string {
  return status === 'monitoring' ? 'Monitoring' : 'Active';
}

export default function ProfileScreen() {
  const { pets, activePet, updatePet } = usePetStore();
  const showMedicationMoment = useMomentStore((s) => s.showMedication);

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [conditionModalVisible, setConditionModalVisible] = useState(false);
  const [editingCondition, setEditingCondition] = useState<Condition | undefined>(undefined);
  // Snapshot of the pet the archive sheet was opened FOR (identity rule, see
  // ArchivePetSheet). Doubles as the sheet's visibility flag.
  const [archivingPet, setArchivingPet] = useState<Pet | null>(null);

  const [conditions, setConditions] = useState<Condition[]>([]);
  const [conditionsLoading, setConditionsLoading] = useState(true);

  const [medications, setMedications] = useState<RegimenDisplay[]>([]);
  const [medicationsLoading, setMedicationsLoading] = useState(true);
  const [medicationModalVisible, setMedicationModalVisible] = useState(false);
  const [editingRegimen, setEditingRegimen] = useState<Regimen | undefined>(undefined);

  // B-417 PR 4 — the trial card reads through one shared loader with the Home
  // strip, so the two surfaces cannot disagree about the same trial. It reads the
  // LOCAL MIRROR, which is what makes PR 3's existence-oracle worry structural
  // rather than a guard: an offline trial, or one started offline and not yet
  // flushed, is still a row the card can see, so "No trial running." cannot be a
  // lie told by a failed network read.
  const { input: trialInput, isLoading: trialLoading, reload: reloadTrial } = useDietTrial();
  // B-616 FR-5 — the card's door into "What {pet} can eat". Read here rather than
  // inside the screen so R2 is enforced at the ENTRY: an allowed set that has not
  // hydrated draws no action at all (`DietTrialCard` renders an action only when a
  // handler exists), instead of a link that opens a screen with nothing to say.
  const trialAllowedSet = useTrialAllowedSet();
  const [startTrialVisible, setStartTrialVisible] = useState(false);
  // B-535 — the start-modal → food-capture round trip. "Snap a new food" closes
  // the modal and routes out; the modal stays mounted so the half-filled form
  // survives, but nothing ever re-opened it — food-capture's save ends in
  // `router.dismissAll()`, so the owner landed back on this tab with no modal
  // and every reason to think the trial saved (or the work was lost). The
  // picker's own docstring calls the capture route the COMMON path here, since
  // the trial food is usually a bag the owner was handed ten minutes ago. This
  // flag re-opens the modal when the tab regains focus, whichever way the
  // capture flow ended — saved (dismissAll) or backed out (pop) — because the
  // half-filled form is theirs to finish or cancel either way.
  const resumeTrialModalOnFocus = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (resumeTrialModalOnFocus.current) {
        resumeTrialModalOnFocus.current = false;
        setStartTrialVisible(true);
      }
    }, []),
  );
  // B-417 PR 6 — which completion screen is open, if any. `null` is closed.
  const [completionEntry, setCompletionEntry] = useState<TrialCompletionEntry | null>(null);
  // The extension is a one-tap write with no confirm (see `handleExtendTrial`),
  // which makes a pending state non-optional rather than polish: without one the
  // owner taps the biggest button on the card, nothing visibly happens until the
  // write and reload land, and a slow write earns a second tap — two extensions
  // from one decision.
  const [extendingTrial, setExtendingTrial] = useState(false);

  /**
   * `Keep going` — B-417 PR 6 (§4.3). One implementation, called by BOTH the
   * milestone card's inline button and the overrun sheet's row, because the two
   * must never disagree about which day the extension counts from.
   *
   * ONE TAP, NO CONFIRM, DELIBERATELY. The named default is the whole point of
   * the affordance — Jordan's review said what stops her tapping "done" on day 56
   * is that keep-going "already has the four weeks filled in" — and putting a
   * dialog in front of the option that keeps a diet going would make the safe path
   * the slower one. The change is legible without a dialog: the card immediately
   * re-reads "Day 56 of 84" with a new end date, and the owner can extend again.
   */
  const handleExtendTrial = useCallback(async () => {
    const trial = trialInput?.trial;
    if (!trial?.id || extendingTrial) return;
    const progress = getDietTrialProgress(
      { startedAt: trial.startedAt, targetDurationDays: trial.targetDurationDays },
      Date.now(),
    );
    if (!progress) return;
    setCompletionEntry(null);
    setExtendingTrial(true);
    try {
      await extendTrial({
        trialId: trial.id,
        targetDurationDays: nextTargetDays({
          currentTargetDays: trial.targetDurationDays,
          dayCounter: progress.dayCounter,
          extraDays: extensionDays(trial.indication),
        }),
      });
      reloadTrial();
    } catch (e) {
      console.error('[DietTrial] extend failed:', e);
      Alert.alert(
        'That didn’t save',
        'The trial is still running on its current window. Have another go in a moment.',
      );
    } finally {
      setExtendingTrial(false);
    }
  }, [trialInput, reloadTrial, extendingTrial]);

  const [photoUploading, setPhotoUploading] = useState(false);

  // Vet Files card (B-478 VF-2, mock A1-r2 / A1z). Local-first like the library
  // itself — the read is SQLite, so the card is correct offline and costs no
  // round-trip. Only the three strip thumbnails touch the network, and only for
  // documents this device has no local copy of.
  const [vetDocuments, setVetDocuments] = useState<VetLibraryRow[]>([]);
  const [vetThumbs, setVetThumbs] = useState<Map<string, string>>(new Map());
  const [vetThumbsLoading, setVetThumbsLoading] = useState(false);

  const loadVetFiles = useCallback(async () => {
    if (!VET_FILES_ENTRY_ENABLED || !activePet) return;
    try {
      const rows = await readVetLibrary(activePet.id);
      setVetDocuments(rows);
      // Sign only the strip's own paths, and only those without a local file.
      const stripPaths = rows
        .slice(0, VET_FILES_STRIP_LIMIT)
        .filter((r) => !r.localUri)
        .map((r) => r.storagePath);
      if (stripPaths.length === 0) { setVetThumbs(new Map()); return; }
      setVetThumbsLoading(true);
      try {
        setVetThumbs(
          await getSignedUrls(VET_DOCUMENTS_BUCKET, stripPaths, VET_DOCUMENT_SIGNED_URL_TTL_SEC),
        );
      } finally {
        setVetThumbsLoading(false);
      }
    } catch (e) {
      // The card degrades to its zero state rather than blanking the tab — a
      // failed read here must never cost the owner the profile.
      console.warn('[Profile] load vet files failed:', e);
      setVetDocuments([]);
    }
  }, [activePet?.id]);

  const loadConditions = useCallback(async () => {
    if (!activePet) return;
    setConditionsLoading(true);
    try {
      const { data, error } = await supabase
        .from('conditions')
        .select('id, pet_id, condition_name, diagnosed_at, status, notes, created_at')
        .eq('pet_id', activePet.id)
        .neq('status', 'resolved')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setConditions((data as Condition[]) ?? []);
    } catch (e) {
      console.error('[Profile] load conditions failed:', e);
    } finally {
      setConditionsLoading(false);
    }
  }, [activePet?.id]);

  const loadMedications = useCallback(async () => {
    if (!activePet) return;
    setMedicationsLoading(true);
    try {
      // Active regimens for THIS pet only (RLS double-scopes; the .eq is the
      // intent). The card is a per-pet surface, so multi-pet households never see
      // another pet's medications here.
      const { data: regimenRows, error: regimenError } = await supabase
        .from('medications')
        .select(
          'id, pet_id, medication_item_id, drug_name, dose_amount, route, doses_per_day, ' +
          'schedule_notes, indication, prescribed_by, started_at, target_duration_days, ' +
          'target_duration_doses, status, ended_at',
        )
        .eq('pet_id', activePet.id)
        .eq('status', 'active')
        .order('started_at', { ascending: false });

      if (regimenError) throw regimenError;
      // Coerce doses_per_day: PostgREST serialises NUMERIC as a string ("1.00"),
      // which would mis-drive frequencyLabel's switch and the compliance math. Fix
      // it once at the data boundary so every downstream consumer sees a number.
      const regimens = ((regimenRows as unknown as Regimen[]) ?? []).map((r) => ({
        ...r,
        doses_per_day: r.doses_per_day == null ? null : Number(r.doses_per_day),
      }));
      if (regimens.length === 0) { setMedications([]); return; }

      // Dose children, attributed to regimens by attributeDosesToRegimens: an
      // EXPLICIT regimen link (medication_id, set by B-153/B-154) wins, else an
      // item+window fallback for legacy/unlinked one-tap doses. So we must fetch BOTH
      // sets: doses linked to one of these regimens (medication_id), AND doses of one
      // of these drugs (medication_item_id) — the latter is how pre-B-153 doses and a
      // free-text regimen's own item-less doses are covered. The pure attribution
      // (unit-tested in lib/medications) decides which regimen each lands on.
      // This .or() filter is built by string interpolation, so the id lists MUST be
      // delimiter-free — a stray ',' or ')' would break the in-list or smuggle in
      // another predicate. The invariant that makes this safe: both lists are Supabase
      // `uuid` PRIMARY-KEY values read straight from the `medications` rows above, so
      // they contain only [0-9a-f-]. The isUuid filter enforces that and fails CLOSED
      // — a malformed id is dropped, never interpolated raw — and if it ever empties
      // both clauses we skip the fetch entirely (→ empty tallies → "No doses logged
      // yet", the safe under-read, never a fabricated all-given).
      const isUuid = (s: string) => /^[0-9a-fA-F-]{36}$/.test(s);
      const regimenIds = regimens.map((r) => r.id).filter(isUuid);
      const itemIds = [...new Set(
        regimens.map((r) => r.medication_item_id).filter((id): id is string => !!id),
      )].filter(isUuid);

      const orParts: string[] = [];
      if (regimenIds.length > 0) orParts.push(`medication_id.in.(${regimenIds.join(',')})`);
      if (itemIds.length > 0) orParts.push(`medication_item_id.in.(${itemIds.join(',')})`);

      let doses: AttributableDose[] = [];
      if (orParts.length > 0) {
        const { data: doseRows, error: doseError } = await supabase
          .from('medication_administrations')
          // Disambiguate the parent-event embed by FK name (B-196). B-156's
          // migration 023 added a SECOND medication_administrations→events FK
          // (paired_event_id, the combo link) beside event_id, so a bare
          // `events(...)` embed is ambiguous and PostgREST rejects it (PGRST201) —
          // which threw the whole load and blanked the Current-medications card.
          // We always want the dose's OWN parent event here, never the paired meal.
          .select('medication_id, medication_item_id, adherence, events!medication_administrations_event_id_fkey(deleted_at, occurred_at)')
          .eq('pet_id', activePet.id)
          .or(orParts.join(','));
        if (doseError) throw doseError;

        type DoseRow = {
          medication_id: string | null;
          medication_item_id: string | null;
          adherence: string | null;
          // to-one embed: supabase-js may surface it as an object or a 1-element array
          events:
            | { deleted_at: string | null; occurred_at: string }
            | { deleted_at: string | null; occurred_at: string }[]
            | null;
        };
        doses = ((doseRows as unknown as DoseRow[]) ?? []).map((d) => {
          const ev = Array.isArray(d.events) ? d.events[0] : d.events;
          return {
            medication_id: d.medication_id,
            medication_item_id: d.medication_item_id,
            adherence: d.adherence,
            deleted_at: ev?.deleted_at ?? null,
            // '' only when the FK'd parent event embed is absent (not reachable with
            // the non-null events FK); harmless — pass 2 orders it out ('' < any date)
            // and pass 1 ignores occurred_at entirely.
            occurred_at: ev?.occurred_at ?? '',
          };
        });
      }

      const tallies = attributeDosesToRegimens(regimens, doses);
      setMedications(regimens.map((reg) => buildRegimenDisplay(reg, tallies.get(reg.id) ?? EMPTY_TALLY())));
    } catch (e) {
      console.error('[Profile] load medications failed:', e);
    } finally {
      setMedicationsLoading(false);
    }
  }, [activePet?.id]);

  useEffect(() => {
    loadConditions();
  }, [loadConditions]);

  // Medications reload on every FOCUS, not just mount — so the card reconciles to
  // ground truth whenever the owner returns to this tab. This is the clinical
  // backstop for handleLogDose's optimistic `given++`: if a dose was downgraded to
  // refused/missed on the completion card after logging, a focus-driven reload
  // replaces the optimistic count with the real adherence (the refusal flag then
  // shows) — closing the §6.1 over-reassurance window. Safe in both directions: the
  // card reads from the server, so an offline/just-logged dose simply under-reads
  // (never a false "all given"), and self-heals once it syncs and the tab refocuses.
  useFocusEffect(
    useCallback(() => {
      loadMedications();
      // The trial card reconciles on focus for the same reason: an owner returns
      // to this tab after logging a meal, and the coverage line is denominated in
      // days that only move forward.
      reloadTrial();
      // And the Vet Files card, so returning from the library reflects a document
      // just added or renamed there.
      loadVetFiles();
    }, [loadMedications, reloadTrial, loadVetFiles]),
  );

  async function handlePickPhoto() {
    Alert.alert('Profile photo', 'Choose a source', [
      {
        text: 'Take photo',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') { Alert.alert('Camera access needed'); return; }
          launchPhotoPicker('camera');
        },
      },
      { text: 'Choose from library', onPress: () => launchPhotoPicker('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function launchPhotoPicker(source: 'camera' | 'library') {
    const opts: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
      exif: false,
    };
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync(opts)
      : await ImagePicker.launchImageLibraryAsync(opts);

    if (result.canceled || !result.assets[0] || !activePet) return;
    const localUri = result.assets[0].uri;
    setPhotoUploading(true);
    try {
      const storagePath = `${activePet.id}/profile.jpg`;
      // Compress + EXIF/GPS-strip before upload. `exif: false` above only drops
      // EXIF from the picker's JS result, NOT from the file on disk — a raw upload
      // of a camera-roll photo would still carry its GPS metadata to storage.
      // compressForUpload re-encodes to a stripped JPEG (privacy-hardening sweep).
      const uploadUri = await compressForUpload(localUri);
      await uploadPhoto(PET_PHOTO_BUCKET, storagePath, uploadUri);

      const { error } = await supabase
        .from('pets')
        .update({ photo_path: storagePath })
        .eq('id', activePet.id);

      if (error) throw error;
      updatePet({ photo_path: storagePath });
    } catch (e) {
      console.error('[Profile] photo upload failed:', e);
      // The cause (missing bucket, RLS, dropped connection) belongs in the log
      // above, never in the alert — naming storage internals to an owner on one
      // of their first actions in the app is unactionable (B-399).
      Alert.alert("Couldn't save the photo", 'Check your connection and try again.');
    } finally {
      setPhotoUploading(false);
    }
  }

  function openAddCondition() {
    setEditingCondition(undefined);
    setConditionModalVisible(true);
  }

  function openEditCondition(condition: Condition) {
    setEditingCondition(condition);
    setConditionModalVisible(true);
  }

  async function handleResolveCondition(id: string) {
    try {
      const { error } = await supabase
        .from('conditions')
        .update({ status: 'resolved' })
        .eq('id', id);

      if (error) throw error;
      setConditions((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      console.error('[Profile] resolve condition failed:', e);
      Alert.alert('Could not resolve', 'Something went wrong. Try again.');
    }
  }

  function confirmResolveCondition(condition: Condition) {
    Alert.alert(
      'Mark as resolved',
      `Mark "${condition.condition_name}" as resolved? It will still appear in vet reports for the relevant date range.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Mark resolved', onPress: () => handleResolveCondition(condition.id) },
      ],
    );
  }

  function openAddMedication() {
    setEditingRegimen(undefined);
    setMedicationModalVisible(true);
  }

  function openEditRegimen(reg: RegimenDisplay) {
    // Pass just the Regimen fields the modal seeds from (drop the derived display).
    setEditingRegimen({
      id: reg.id, pet_id: reg.pet_id, medication_item_id: reg.medication_item_id,
      drug_name: reg.drug_name, dose_amount: reg.dose_amount, route: reg.route,
      doses_per_day: reg.doses_per_day, schedule_notes: reg.schedule_notes,
      indication: reg.indication, prescribed_by: reg.prescribed_by,
      started_at: reg.started_at, target_duration_days: reg.target_duration_days,
      target_duration_doses: reg.target_duration_doses, // B-618 — carried so an edit round-trips the unit (PR 3 renders it)
      status: reg.status, ended_at: reg.ended_at,
    });
    setMedicationModalVisible(true);
  }

  async function handleEndRegimen(id: string) {
    try {
      // RLS (medications_owner) re-validates this regimen belongs to the caller's
      // pet; .select() turns a silent 0-row block into a thrown error, not a false
      // success. A regimen is "ended", never soft-deleted (migration 020).
      const { data, error } = await supabase
        .from('medications')
        // `ended_at` is a DATE and gets the same treatment as `started_at` (B-441):
        // `toISOString()` yields the UTC day, so a behind-UTC owner ending a course in
        // the evening stored TOMORROW — widening the dose-attribution upper bound and
        // the vet report's regimen span.
        .update({ status: 'completed', ended_at: toLocalDayKey(new Date()) })
        .eq('id', id)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('No row updated (not owned?)');
      setMedications((prev) => prev.filter((m) => m.id !== id));
    } catch (e) {
      console.error('[Profile] end regimen failed:', e);
      Alert.alert('Could not update', 'Something went wrong. Try again.');
    }
  }

  // B-154: log a dose straight from the regimen card — the wedge's most-wanted path
  // ("here's Mochi's twice-daily pill, tap to log this morning's"). This is the clean
  // place to carry the regimen link: the dose is written with medication_id = reg.id
  // and inherits the regimen's dose_amount, so it counts toward compliance even for a
  // FREE-TEXT regimen (no library item — the only loggable path for one). The same
  // shared insertMedicationDose path as the picker, so the write is built once.
  async function handleLogDose(reg: RegimenDisplay) {
    if (!activePet) return;
    let result: Awaited<ReturnType<typeof insertMedicationDose>>;
    try {
      result = await insertMedicationDose({
        petId: activePet.id,
        medicationItemId: reg.medication_item_id, // null for a free-text regimen
        medicationId: reg.id,                     // the explicit link (B-154)
        adherence: 'given',                       // the affirmative tap = "I gave this dose"
        doseAmount: reg.dose_amount,              // inherit the regimen's dose
        occurredAt: new Date(),
      });
    } catch (e) {
      console.error('[Profile] log dose failed:', e);
      Alert.alert("Couldn't log that dose", 'Something went wrong. Please try again.');
      return;
    }
    // Optimistically reflect the new given dose on this regimen's compliance line.
    // The card reads doses from Supabase, but a dose is written LOCAL-FIRST (it isn't
    // on the server until the next sync flush, and never while offline), so a refetch
    // can't show it yet — the optimistic tally is the only honest immediate feedback
    // for the current view. If the owner then downgrades this dose to refused/missed
    // on the completion card, the optimistic 'given' is corrected by the focus-driven
    // loadMedications (the useFocusEffect above) the next time this tab is focused —
    // not silently left stale. (A downgrade while the owner never leaves the profile
    // is the one residual window; reconciled on the next focus.)
    setMedications((prev) =>
      prev.map((m) =>
        m.id === reg.id
          ? buildRegimenDisplay(m, { ...m.tally, given: m.tally.given + 1 })
          : m,
      ),
    );
    // The confirm-over-entry adherence follow-up (§5.1) — the same warmed card the
    // picker shows, so a dose logged from the card can still be downgraded to
    // partial/missed/refused (the n=1-never-reassures safety path stays reachable).
    showMedicationMoment({
      eventId: result.eventId,
      occurredAt: result.occurredAtIso,
      drugName: reg.drug_name,
      adherence: 'given',
      howGiven: null,
    });
  }

  function confirmEndRegimen(reg: RegimenDisplay) {
    Alert.alert(
      'End medication',
      `Mark ${reg.drug_name} as finished? Its logged doses stay on the timeline and in vet reports.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'End medication', onPress: () => handleEndRegimen(reg.id) },
      ],
    );
  }

  function handleArchivePress() {
    if (!activePet) return;
    // Archive-last-pet is blocked with honest copy (spec §3.5): the app needs
    // one active pet, and true deletion belongs to the Privacy track (B-039).
    if (pets.length <= 1) {
      const blocked = archiveBlockedCopy(activePet.name);
      Alert.alert(blocked.title, blocked.body);
      return;
    }
    setArchivingPet(activePet);
  }

  if (!activePet) {
    return (
      <SafeAreaView style={styles.container}>
        <EmptyState
          align="fill"
          title="No pet profile yet"
          body="Add a pet and their profile will show up here."
        />
      </SafeAreaView>
    );
  }

  const photoUri = activePet.photo_path
    ? getPublicUrl(PET_PHOTO_BUCKET, activePet.photo_path)
    : null;

  const initials = activePet.name.slice(0, 2).toUpperCase();
  const speciesLabel =
    activePet.species.charAt(0).toUpperCase() + activePet.species.slice(1);
  const subtitle = [speciesLabel, activePet.breed].filter(Boolean).join(' · ');

  // The card's eleven states resolve in `lib/dietTrialCard` — including B-351
  // slice 4's standing protein note and target line, which are RE-SITED into the
  // rebuilt card rather than dropped (§0.2's anticipated collision, landing in
  // the opposite direction from the ruling: slice 4 shipped the note the ruling
  // said it would cut, and it is correct content — C2's standing fact).
  const trialCard = trialInput ? resolveTrialCard(trialInput) : null;

  // What PR 6's sheets write against. The id rides on the card's INPUT (the
  // resolver never reads it) so the completion flow does not re-query a row this
  // screen already loaded — and so the sheet cannot end a different trial than the
  // one the card is showing.
  //
  // `status === 'active'` HERE IS CORRECT AND MUST NOT BECOME `isTrialRunning`
  // (B-422). The effective end withdraws BEHAVIOUR from a trial nobody ended; it
  // does not end the trial, and this sheet is the only way an owner can. Gating
  // it would take the completion action away from precisely the overrun trials
  // the staleness rule exists to get closed — §4.3's milestone "never expires and
  // re-surfaces until acted on". Same rule at `dietTrialSetup.getActiveTrialForPet`.
  const sheetTrial =
    trialInput?.trial?.id && trialInput.trial.status === 'active'
      ? {
          id: trialInput.trial.id,
          petId: activePet.id,
          startedAt: trialInput.trial.startedAt,
          targetDurationDays: trialInput.trial.targetDurationDays,
          indication: trialInput.trial.indication,
        }
      : null;
  const sheetDayCounter = trialInput?.trial
    ? getDietTrialProgress(
        {
          startedAt: trialInput.trial.startedAt,
          targetDurationDays: trialInput.trial.targetDurationDays,
        },
        trialInput.nowMs,
      )?.dayCounter ?? 1
    : 1;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Pet header ── */}
        <Card style={styles.headerCard}>
          <TouchableOpacity
            onPress={handlePickPhoto}
            style={styles.photoWrapper}
            activeOpacity={0.8}
            disabled={photoUploading}
          >
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="cover" />
            ) : (
              <View style={styles.photoPlaceholder}>
                <Text style={styles.photoInitials}>{initials}</Text>
              </View>
            )}
            {photoUploading && (
              <View style={styles.photoOverlay}>
                <WhorlSpinner size="md" tint="#fff" />
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={handlePickPhoto} disabled={photoUploading} hitSlop={8}>
            <Text style={styles.photoLabel}>
              {photoUri ? 'Change photo' : 'Add photo'}
            </Text>
          </TouchableOpacity>

          <Text style={styles.petName}>{activePet.name}</Text>
          {subtitle ? <Text style={styles.petSubtitle}>{subtitle}</Text> : null}

          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => setEditModalVisible(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.editBtnText}>Edit profile</Text>
          </TouchableOpacity>
        </Card>

        {/* ── Info chips ── */}
        <Card noPadding style={styles.infoRow}>
          <View style={styles.infoChip}>
            <Text style={styles.infoChipLabel}>Age</Text>
            <Text style={styles.infoChipValue}>
              {formatAge(activePet.date_of_birth, activePet.date_of_birth_precision)}
            </Text>
          </View>
          <View style={styles.infoChipDivider} />
          <View style={styles.infoChip}>
            <Text style={styles.infoChipLabel}>Sex</Text>
            <Text style={styles.infoChipValue}>{formatSex(activePet.sex)}</Text>
          </View>
          <View style={styles.infoChipDivider} />
          <View style={styles.infoChip}>
            <Text style={styles.infoChipLabel}>Weight</Text>
            <Text style={styles.infoChipValue}>{formatWeightLbs(activePet.weight_kg)}</Text>
          </View>
        </Card>

        {/* ── Weight trend (B-186) — descriptive, neutral; expands on the Weight
            chip above. snapshotKg lets the card show the profile weight before any
            weigh-in is logged, so it never contradicts the Weight chip. ── */}
        <WeightTrendCard
          petId={activePet.id}
          petName={activePet.name}
          snapshotKg={activePet.weight_kg}
        />

        {/* ── Conditions ── */}
        <Card style={styles.sectionGap}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Conditions</Text>
            <TouchableOpacity style={styles.cardActionTouch} onPress={openAddCondition} hitSlop={8}>
              <Text style={styles.sectionAction}>+ Add</Text>
            </TouchableOpacity>
          </View>

          {conditionsLoading ? (
            <WhorlSpinner size="sm" ground="day" style={styles.sectionLoader} />
          ) : conditions.length === 0 ? (
            <Text style={styles.emptyConditionsText}>
              No conditions on file yet. Add anything {activePet.name} has been
              diagnosed with, like allergies or a sensitive stomach.
            </Text>
          ) : (
            conditions.map((condition) => (
              <View key={condition.id} style={styles.conditionRow}>
                <Divider style={styles.conditionDivider} />
                <View style={styles.conditionInner}>
                  <View style={styles.conditionInfo}>
                    <Text style={styles.conditionName}>{condition.condition_name}</Text>
                    {condition.diagnosed_at && (
                      <Text style={styles.conditionDate}>
                        Diagnosed{' '}
                        {new Date(condition.diagnosed_at).toLocaleDateString([], {
                          year: 'numeric', month: 'short',
                        })}
                      </Text>
                    )}
                  </View>
                  <View style={styles.conditionRight}>
                    <Badge
                      label={statusLabel(condition.status)}
                      variant={condition.status === 'monitoring' ? 'accent' : 'symptom'}
                    />
                    <View style={styles.conditionActions}>
                      <TouchableOpacity style={styles.cardActionTouch} onPress={() => openEditCondition(condition)} hitSlop={8}>
                        <Text style={styles.conditionActionText}>Edit</Text>
                      </TouchableOpacity>
                      <Text style={styles.conditionActionDivider}>·</Text>
                      <TouchableOpacity style={styles.cardActionTouch} onPress={() => confirmResolveCondition(condition)} hitSlop={8}>
                        <Text style={styles.conditionActionText}>Resolve</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </View>
            ))
          )}
        </Card>

        {/* ── Current medications ── */}
        <Card style={styles.sectionGap}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Current medications</Text>
            <TouchableOpacity style={styles.cardActionTouch} onPress={openAddMedication} hitSlop={8}>
              <Text style={styles.sectionAction}>+ Add</Text>
            </TouchableOpacity>
          </View>

          {medicationsLoading ? (
            <WhorlSpinner size="sm" ground="day" style={styles.sectionLoader} />
          ) : medications.length === 0 ? (
            <Text style={styles.emptyConditionsText}>
              No medications yet. Add a regimen once and logging each dose
              becomes a single tap.
            </Text>
          ) : (
            medications.map((reg) => {
              const meta = [reg.dose_amount, routeLabel(reg.route), frequencyLabel(reg.doses_per_day)]
                .filter(Boolean)
                .join(' · ');
              return (
                <View key={reg.id} style={styles.medRow}>
                  <Divider style={styles.conditionDivider} />
                  <Text style={styles.medName}>{reg.drug_name}</Text>
                  {meta ? <Text style={styles.medMeta}>{meta}</Text> : null}
                  <Text style={styles.medDays}>
                    {/* "Day X of Y" only while the course is within its planned
                        window; once it's run past target_duration (still active —
                        owner hasn't ended it) the "of Y" is nonsense ("Day 30 of
                        7"), so fall back to the ongoing "Started …" format. */}
                    {/* `daysElapsed != null` is load-bearing, not defensive: a bare
                        `null <= 14` is TRUE in JS, so dropping it renders
                        "Day null of 14" on the one row whose date we could not read. */}
                    {reg.daysElapsed != null && reg.target_duration_days != null
                     && reg.daysElapsed <= reg.target_duration_days
                      ? `Day ${reg.daysElapsed} of ${reg.target_duration_days}`
                      : `Started ${formatRegimenStart(reg.started_at)}`}
                  </Text>
                  {reg.compliance.percent != null && (
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressBar, { width: `${reg.compliance.percent}%` }]} />
                    </View>
                  )}
                  <Text style={styles.medComplianceLine}>{reg.complianceLine}</Text>
                  {reg.flagLine && (
                    <View style={styles.medFlag}>
                      <Text style={styles.medFlagText}>{reg.flagLine}</Text>
                    </View>
                  )}
                  {reg.indication ? <Text style={styles.medContext}>For {reg.indication}</Text> : null}
                  {reg.prescribed_by ? <Text style={styles.medContext}>Prescribed by {reg.prescribed_by}</Text> : null}
                  <View style={styles.conditionActions}>
                    <TouchableOpacity
                      style={styles.cardActionTouch}
                      onPress={() => handleLogDose(reg)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`Log a dose of ${reg.drug_name}`}
                    >
                      <Text style={[styles.conditionActionText, styles.logDoseActionText]}>Log a dose</Text>
                    </TouchableOpacity>
                    <Text style={styles.conditionActionDivider}>·</Text>
                    <TouchableOpacity style={styles.cardActionTouch} onPress={() => openEditRegimen(reg)} hitSlop={8}>
                      <Text style={styles.conditionActionText}>Edit</Text>
                    </TouchableOpacity>
                    <Text style={styles.conditionActionDivider}>·</Text>
                    <TouchableOpacity style={styles.cardActionTouch} onPress={() => confirmEndRegimen(reg)} hitSlop={8}>
                      <Text style={[styles.conditionActionText, styles.medEndActionText]}>End</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </Card>

        {/* ── Diet trial card v2 (B-417 PR 4, §4.2 — PR 3's modal behind it) ──
            Every string comes from `resolveTrialCard`; this screen only decides
            where the card sits and which actions it can service. What used to be
            here rendered a "% compliance" that counted a meal of ANY food (so an
            owner feeding chicken through a novel-protein trial read 100%) and
            bound the progress bar's WIDTH to that same number — day 2 of 56 drew
            a nearly-full bar. Both are gone; the bar now encodes day progress.

            The card ALWAYS renders, mirroring the medications card, because it is
            the ONLY entry point to starting a trial (§4.1 D5: no menu item, no
            second path). PR 3 landed that entry and its own state-0 markup; this
            keeps the entry and folds the markup into the one card, so the eleven
            states stay a switch over one layout rather than three Card blocks
            that can drift. `onManage` is PR 3's header affordance, unchanged. */}
        {!trialLoading && trialCard && (
          <DietTrialCard
            model={trialCard}
            style={styles.sectionGap}
            busyAction={extendingTrial ? 'trial_extend' : null}
            actions={{
              start_trial: () => setStartTrialVisible(true),
              // B-417 PR 6. The milestone's three buttons and the overrun card's
              // single one land on the same decision; `Keep going` is a write
              // rather than a screen, so it has no sheet.
              trial_extend: handleExtendTrial,
              trial_complete: () => setCompletionEntry('complete'),
              trial_stopped_early: () => setCompletionEntry('stopped_early'),
              milestone: () => setCompletionEntry('decision'),
              // State 7a's action, reachable for the first time now that a trial
              // can be completed — and the reason the completed card keeps its
              // slot for a month (`ENDED_TRIAL_GRACE_DAYS`, 30 — R5): the report
              // is most valuable in exactly the weeks between the trial ending
              // and the recheck it was run for.
              open_report: () => router.push('/report'),
              // B-533 / R1 — the refusal state's way out. Same sheet the header's
              // "Change" opens (one active trial per pet is a DB constraint, so
              // this lands on the ordered "end the running one first" flow, never
              // a second concurrent trial). It is a card ACTION rather than only
              // the header link because on the one state whose message is "this
              // diet may need to change", the way out cannot be chrome.
              trial_manage: () => setStartTrialVisible(true),
              // B-616 PR 2 (§2.2). Present only on a hydrated set — see the hook
              // read above; `undefined` here means the card draws no link.
              ...(trialAllowedSet.status === 'ready'
                ? { view_allowed_foods: () => router.push('/trial-foods') }
                : {}),
              // B-616 PR 4 (§2.6) — the destination B-475 was filed for. The
              // resolver has declared this action since PR 4 of B-417 and emits it
              // only when `offDiet > 0`, so it really is handler-only: the card
              // decides whether there is anything to drill into, and this line
              // decides where the drill-in goes.
              //
              // UNCONDITIONAL, unlike the allowed-set link above. That one needs a
              // hydrated allowed set to have anything to show; this one needs the
              // exposure facts, which the card has already read to draw the count
              // it is offering — a link the card only draws over a non-zero count
              // cannot land on a screen with nothing on it for a reason the card
              // could have known.
              view_exposures: () => router.push('/trial-exposures'),
            }}
            onManage={() => setStartTrialVisible(true)}
          />
        )}

        {/* ── Vet report (Step 9) ── */}
        <Card style={styles.sectionGap}>
          <Text style={styles.sectionTitle}>Vet report</Text>
          <Text style={styles.reportBlurb}>
            A clinical summary of {activePet.name}’s symptoms, diet, and trends — view it
            here, then send it to your vet as a PDF.
          </Text>
          <PrimaryButton
            label="Open vet report"
            onPress={() => router.push('/report')}
            style={styles.reportButton}
          />
        </Card>

        {/* ── Vet Files (B-478 VF-2, mock A1-r2 / A1z) ──
            A sibling of the Vet report card, deliberately adjacent: they are the
            two vet-facing surfaces, and the card's own blurb carries the D14 line
            saying a saved document does NOT ride along with the report. Gated
            until VF-3 lands capture — see lib/vetFilesEntry.ts. */}
        {VET_FILES_ENTRY_ENABLED && (
          <VetFilesCard
            model={buildVetFilesCardModel(activePet.name, vetDocuments)}
            thumbUris={vetThumbs}
            thumbsLoading={vetThumbsLoading}
            onPress={() => router.push('/vet-files')}
            style={styles.sectionGap}
          />
        )}

        {/* Account actions (owner name / Sign out / Delete account) moved to the
            "You" screen (B-283, §4.3) — the Pet tab stays entirely pet-scoped. */}

        {/* Quiet archive action (spec §3.5, mock B4) — bottom of the tab,
            styled to recede: removal is a rare lifecycle moment, not a daily
            affordance. Tap on the last active pet explains the block instead
            of hiding (honest over invisible). */}
        <TouchableOpacity
          style={styles.archiveBtn}
          onPress={handleArchivePress}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <Text style={styles.archiveBtnText}>Archive {activePet.name}</Text>
        </TouchableOpacity>

        <View style={styles.bottomPad} />
      </ScrollView>

      {archivingPet && (
        <ArchivePetSheet
          visible
          pet={archivingPet}
          onClose={() => setArchivingPet(null)}
        />
      )}

      <EditPetModal
        visible={editModalVisible}
        onClose={() => setEditModalVisible(false)}
      />

      <AddConditionModal
        visible={conditionModalVisible}
        petId={activePet.id}
        existingCondition={editingCondition}
        onClose={() => { setConditionModalVisible(false); setEditingCondition(undefined); }}
        onAdded={(c) => setConditions((prev) => [c, ...prev])}
        onUpdated={(c) =>
          setConditions((prev) => prev.map((x) => (x.id === c.id ? c : x)))
        }
      />

      <AddMedicationModal
        visible={medicationModalVisible}
        petId={activePet.id}
        existingRegimen={editingRegimen}
        onClose={() => { setMedicationModalVisible(false); setEditingRegimen(undefined); }}
        // A new regimen has no doses yet (empty tally → "No doses logged yet").
        onAdded={(reg) =>
          setMedications((prev) => [buildRegimenDisplay(reg, EMPTY_TALLY()), ...prev])
        }
        // An edit can change doses_per_day (the expected denominator), so recompute
        // with the regimen's EXISTING tally rather than discarding its logged doses.
        onUpdated={(reg) =>
          setMedications((prev) =>
            prev.map((m) => (m.id === reg.id ? buildRegimenDisplay(reg, m.tally) : m)),
          )
        }
      />

      {/* B-417 PR 3. Kept MOUNTED across dismissals on purpose: "Snap a new food"
          routes out to `/food-capture` (the trial food is usually a bag the owner
          was handed ten minutes ago, so it is rarely in the library yet), and the
          half-filled form has to still be there when they come back. The form is
          reset on Cancel and after a successful start — never by a dismissal.
          B-535 closed the other half of that promise: preserving the form is
          worthless if nothing re-opens it, so `onAddFood` arms a focus-resume
          (above) and the modal comes back when the capture flow returns here. */}
      <StartTrialModal
        visible={startTrialVisible}
        petId={activePet.id}
        petName={activePet.name}
        species={activePet.species}
        onClose={() => setStartTrialVisible(false)}
        onStarted={reloadTrial}
        onAddFood={() => {
          resumeTrialModalOnFocus.current = true;
          setStartTrialVisible(false);
          router.push('/food-capture');
        }}
        onLogFirstMeal={() => { setStartTrialVisible(false); router.push('/log?type=meal'); }}
      />

      {/* B-417 PR 6 — the completion milestone's sheets (§4.3). Not mounted while
          closed: unlike StartTrialModal it has no half-filled form to preserve
          across a dismissal, and every answer on it is deliberately discarded on
          Cancel rather than pre-filled from a previous attempt. */}
      <TrialCompletionSheet
        entry={completionEntry}
        trial={sheetTrial}
        petName={activePet.name}
        species={activePet.species}
        pronouns={petPronouns(activePet.sex ?? 'unknown')}
        dayCounter={sheetDayCounter}
        intakeDeclineHeadline={trialInput?.intakeDeclineHeadline ?? null}
        onClose={() => setCompletionEntry(null)}
        onExtend={handleExtendTrial}
        onChanged={reloadTrial}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colorNeutralLight,
  },
  scroll: {
    padding: theme.space3,
    gap: theme.space2,
  },

  // ── Header card ──
  headerCard: {
    alignItems: 'center',
    gap: theme.space1,
    paddingVertical: theme.space4,
  },
  photoWrapper: {
    position: 'relative',
    marginBottom: 4,
  },
  photo: {
    width: 112,
    height: 112,
    borderRadius: 56,
  },
  photoPlaceholder: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: theme.colorNeutralDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoInitials: {
    fontSize: 38,
    fontWeight: theme.weightMedium,
    color: '#fff',
  },
  photoOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 56,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoLabel: {
    fontSize: theme.textSM,
    color: theme.colorAccent,
    fontWeight: theme.weightMedium,
  },
  petName: {
    fontSize: theme.text2XL,
    fontWeight: theme.weightMedium,
    color: theme.colorNeutralDark,
    marginTop: 4,
  },
  petSubtitle: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
  },
  editBtn: {
    marginTop: theme.space1,
    paddingHorizontal: theme.space2,
    paddingVertical: 8,
    borderRadius: theme.radiusSmall,
    borderWidth: 1,
    borderColor: theme.colorBorder,
  },
  editBtnText: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    fontWeight: theme.weightMedium,
  },

  // ── Info row ──
  infoRow: {
    flexDirection: 'row',
    overflow: 'hidden',
  },
  infoChip: {
    flex: 1,
    paddingVertical: theme.space2,
    alignItems: 'center',
    gap: 3,
  },
  infoChipDivider: {
    width: 1,
    backgroundColor: theme.colorBorder,
    marginVertical: theme.space1,
  },
  infoChipLabel: {
    fontSize: theme.textXS,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
    textTransform: 'uppercase',
    letterSpacing: theme.trackingWide,
  },
  infoChipValue: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorNeutralDark,
  },

  // ── Section layout (gap for inner rows) ──
  sectionGap: {
    gap: theme.space2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorNeutralDark,
  },
  reportBlurb: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextSecondary,
  },
  reportButton: {
    marginTop: theme.space1,
  },
  sectionAction: {
    fontSize: theme.textMD,
    color: theme.colorAccent,
    fontWeight: theme.weightMedium,
  },
  sectionLoader: {
    alignSelf: 'center',
    paddingVertical: theme.space2,
  },

  // ── Conditions ──
  emptyConditionsText: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: 20,
  },
  conditionRow: {
    gap: theme.space2,
  },
  conditionDivider: {
    marginBottom: 0,
  },
  conditionInner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.space2,
  },
  conditionInfo: {
    flex: 1,
    gap: 2,
  },
  conditionName: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  conditionDate: {
    fontSize: theme.textXS,
    color: theme.colorTextSecondary,
  },
  conditionRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  conditionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  // B-136 — the inline card actions (Edit/Resolve/End/Log a dose/+Add on the
  // Conditions and Current medications cards) render small (textXS/textMD) text, so
  // a bare hitSlop left the tap target ≈27px tall, under the 44pt floor. minHeight 44
  // + centered lifts each to the floor without touching the text style; the existing
  // hitSlop stays as extra slack. Shared so every card action clears the bar identically.
  cardActionTouch: {
    minHeight: 44,
    justifyContent: 'center',
  },
  conditionActionText: {
    fontSize: theme.textXS,
    color: theme.colorTextSecondary,
    textDecorationLine: 'underline',
  },
  conditionActionDivider: {
    fontSize: theme.textXS,
    color: theme.colorBorder,
  },
  // "End" is destructive (ends a regimen) — the same red as Delete account, not the
  // neutral grey of the adjacent "Edit".
  medEndActionText: {
    color: theme.colorDestructive,
  },
  // "Log a dose" is the card's primary action (the wedge path), so it leads in the
  // accent colour while Edit/End stay quiet secondary text.
  logDoseActionText: {
    color: theme.colorAccent,
    fontWeight: theme.weightMedium,
  },

  // The MEDICATION regimen bar. Its width is bound to dose adherence, which is a
  // real ratio of discrete events; the diet-trial card's bar is bound to
  // `getDietTrialProgress().fraction` and lives in components/profile/DietTrialCard.
  progressTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.colorChartEmpty,
    overflow: 'hidden',
  },
  progressBar: {
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.colorAccent,
  },
  // Medication ADHERENCE line. Distinct from the diet trial in every way that
  // matters: a dose either was or wasn't given, so a ratio is honest here — which
  // is exactly why B-417 D2 splits the DIET metric that isn't.
  medComplianceLine: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },

  // ── Current medications (rows mirror the conditions list + the diet-trial bar) ──
  medRow: {
    gap: 4,
  },
  medName: {
    fontSize: theme.textLG,
    fontWeight: theme.weightMedium,
    color: theme.colorNeutralDark,
  },
  medMeta: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },
  medDays: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    marginTop: 2,
  },
  // Calm-but-clear attention treatment for a missed/refused dose — a soft rose
  // tint (the app's symptom family), never a solid-red alarm. clinical-guardrails:
  // visible enough not to be lost, gentle enough not to alarm an owner whose pet
  // may just have spat out one pill.
  medFlag: {
    backgroundColor: theme.colorEventSymptomLight,
    borderRadius: theme.radiusSmall,
    paddingVertical: theme.space1,
    paddingHorizontal: theme.space2,
    marginTop: 2,
  },
  medFlagText: {
    fontSize: theme.textSM,
    color: theme.colorTextPrimary,
    lineHeight: 19,
  },
  medContext: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },

  // ── Archive ──
  archiveBtn: {
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusMedium,
    paddingVertical: 13,
    paddingHorizontal: theme.space2,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    marginTop: theme.space1,
  },
  archiveBtnText: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextTertiary,
  },

  // ── Empty / bottom ──
  bottomPad: {
    height: theme.space5,
  },
});
