import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { theme } from '../../constants/theme';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Divider } from '../../components/ui/Divider';
import { supabase } from '../../lib/supabase';
import { uploadPhoto, getPublicUrl } from '../../lib/storage';
import { archiveBlockedCopy } from '../../lib/utils';
import { usePetStore } from '../../store/petStore';
import { useAuthStore } from '../../store/authStore';
import { EditPetModal } from '../../components/profile/EditPetModal';
import { AddConditionModal, Condition } from '../../components/profile/AddConditionModal';
import { AddMedicationModal, Regimen } from '../../components/profile/AddMedicationModal';
import { ArchivePetSheet } from '../../components/profile/ArchivePetSheet';
import { DeleteAccountSheet } from '../../components/profile/DeleteAccountSheet';
import { Pet } from '../../store/petStore';
import {
  MEDICATION_ROUTE_OPTIONS, computeRegimenCompliance, regimenComplianceLine,
  regimenFlagLine, attributeDosesToRegimens,
  type AdherenceTally, type RegimenCompliance, type AttributableDose,
} from '../../lib/medications';

const PET_PHOTO_BUCKET = 'nyx-pet-photos';

interface DietTrialRow {
  id: string;
  started_at: string;
  target_duration_days: number;
  vet_name: string | null;
  food_items: { brand: string; product_name: string } | null;
}

interface DietTrialDisplay extends DietTrialRow {
  daysElapsed: number;
  daysLogged: number;
  compliance: number;
}

interface RegimenDisplay extends Regimen {
  daysElapsed: number;
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
    dosesPerDay: reg.doses_per_day, daysElapsed, tally,
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

// Whole days the regimen has run, ≥1 — the same local-midnight span the diet-trial
// card uses, so the two compliance reads agree on "what counts as a day".
function regimenDaysElapsed(startedAt: string): number {
  const start = new Date(startedAt);
  start.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(1, Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
}

function calculateAge(dob: string | null): string {
  if (!dob) return '—';
  const birth = new Date(dob);
  const now = new Date();
  const totalMonths =
    (now.getFullYear() - birth.getFullYear()) * 12 +
    (now.getMonth() - birth.getMonth());
  if (totalMonths < 1) return 'Under 1mo';
  if (totalMonths < 12) return `${totalMonths}mo`;
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  return months > 0 ? `${years}yr ${months}mo` : `${years}yr`;
}

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
  const { user } = useAuthStore();

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [conditionModalVisible, setConditionModalVisible] = useState(false);
  const [editingCondition, setEditingCondition] = useState<Condition | undefined>(undefined);
  // Snapshot of the pet the archive sheet was opened FOR (identity rule, see
  // ArchivePetSheet). Doubles as the sheet's visibility flag.
  const [archivingPet, setArchivingPet] = useState<Pet | null>(null);
  const [deleteSheetVisible, setDeleteSheetVisible] = useState(false);

  const [conditions, setConditions] = useState<Condition[]>([]);
  const [conditionsLoading, setConditionsLoading] = useState(true);

  const [medications, setMedications] = useState<RegimenDisplay[]>([]);
  const [medicationsLoading, setMedicationsLoading] = useState(true);
  const [medicationModalVisible, setMedicationModalVisible] = useState(false);
  const [editingRegimen, setEditingRegimen] = useState<Regimen | undefined>(undefined);

  const [dietTrial, setDietTrial] = useState<DietTrialDisplay | null>(null);
  const [trialLoading, setTrialLoading] = useState(true);

  const [photoUploading, setPhotoUploading] = useState(false);

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

  const loadDietTrial = useCallback(async () => {
    if (!activePet) return;
    setTrialLoading(true);
    try {
      const { data: trial, error: trialError } = await supabase
        .from('diet_trials')
        .select('id, started_at, target_duration_days, vet_name, food_items(brand, product_name)')
        .eq('pet_id', activePet.id)
        .eq('status', 'active')
        .maybeSingle();

      if (trialError) throw trialError;
      if (!trial) { setDietTrial(null); return; }

      const row = trial as unknown as DietTrialRow;

      const startedAt = new Date(row.started_at);
      startedAt.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const daysElapsed = Math.max(
        1,
        Math.floor((today.getTime() - startedAt.getTime()) / (1000 * 60 * 60 * 24)) + 1,
      );

      const { data: mealEvents } = await supabase
        .from('events')
        .select('occurred_at')
        .eq('pet_id', activePet.id)
        .eq('event_type', 'meal')
        .is('deleted_at', null)
        .gte('occurred_at', row.started_at);

      const distinctDays = new Set(
        (mealEvents ?? []).map((e) => new Date(e.occurred_at).toDateString()),
      ).size;

      const compliance = Math.round((distinctDays / daysElapsed) * 100);

      setDietTrial({ ...row, daysElapsed, daysLogged: distinctDays, compliance });
    } catch (e) {
      console.error('[Profile] load diet trial failed:', e);
    } finally {
      setTrialLoading(false);
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
          'schedule_notes, indication, prescribed_by, started_at, target_duration_days, status, ended_at',
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

      // Dose children, matched to regimens by medication_item_id within each
      // regimen's window (attributeDosesToRegimens) — NOT by medication_id. The
      // one-tap log path writes medication_id = NULL (doses are regimen-unlinked,
      // B-135), so the old .in('medication_id', …) join counted ZERO and every
      // regimen read "no doses logged yet" despite real doses. The attribution +
      // window logic is pure and unit-tested in lib/medications.
      const itemIds = [...new Set(
        regimens.map((r) => r.medication_item_id).filter(Boolean),
      )] as string[];

      let doses: AttributableDose[] = [];
      if (itemIds.length > 0) {
        const { data: doseRows, error: doseError } = await supabase
          .from('medication_administrations')
          .select('medication_item_id, adherence, events(deleted_at, occurred_at)')
          .eq('pet_id', activePet.id)
          .in('medication_item_id', itemIds);
        if (doseError) throw doseError;

        type DoseRow = {
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
            medication_item_id: d.medication_item_id,
            adherence: d.adherence,
            deleted_at: ev?.deleted_at ?? null,
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
    loadMedications();
    loadDietTrial();
  }, [loadConditions, loadMedications, loadDietTrial]);

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
      await uploadPhoto(PET_PHOTO_BUCKET, storagePath, localUri);

      const { error } = await supabase
        .from('pets')
        .update({ photo_path: storagePath })
        .eq('id', activePet.id);

      if (error) throw error;
      updatePet({ photo_path: storagePath });
    } catch (e) {
      console.error('[Profile] photo upload failed:', e);
      Alert.alert('Upload failed', 'Could not save photo. Make sure the nyx-pet-photos storage bucket exists and has upload policies.');
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
        .update({ status: 'completed', ended_at: new Date().toISOString().split('T')[0] })
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

  async function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ]);
  }

  if (!activePet) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>No pet profile found.</Text>
        </View>
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
                <ActivityIndicator color="#fff" size="large" />
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
            <Text style={styles.infoChipValue}>{calculateAge(activePet.date_of_birth)}</Text>
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

        {/* ── Conditions ── */}
        <Card style={styles.sectionGap}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Conditions</Text>
            <TouchableOpacity onPress={openAddCondition} hitSlop={8}>
              <Text style={styles.sectionAction}>+ Add</Text>
            </TouchableOpacity>
          </View>

          {conditionsLoading ? (
            <ActivityIndicator style={styles.sectionLoader} color={theme.colorTextSecondary} />
          ) : conditions.length === 0 ? (
            <Text style={styles.emptyConditionsText}>
              No known conditions. Tap + Add to record one.
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
                      <TouchableOpacity onPress={() => openEditCondition(condition)} hitSlop={8}>
                        <Text style={styles.conditionActionText}>Edit</Text>
                      </TouchableOpacity>
                      <Text style={styles.conditionActionDivider}>·</Text>
                      <TouchableOpacity onPress={() => confirmResolveCondition(condition)} hitSlop={8}>
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
            <TouchableOpacity onPress={openAddMedication} hitSlop={8}>
              <Text style={styles.sectionAction}>+ Add</Text>
            </TouchableOpacity>
          </View>

          {medicationsLoading ? (
            <ActivityIndicator style={styles.sectionLoader} color={theme.colorTextSecondary} />
          ) : medications.length === 0 ? (
            <Text style={styles.emptyConditionsText}>
              No active medications. Tap + Add to set up a regimen — then logging a dose is one tap.
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
                    {reg.target_duration_days != null && reg.daysElapsed <= reg.target_duration_days
                      ? `Day ${reg.daysElapsed} of ${reg.target_duration_days}`
                      : `Started ${new Date(reg.started_at).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })}`}
                  </Text>
                  {reg.compliance.percent != null && (
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressBar, { width: `${reg.compliance.percent}%` }]} />
                    </View>
                  )}
                  <Text style={styles.trialCompliance}>{reg.complianceLine}</Text>
                  {reg.flagLine && (
                    <View style={styles.medFlag}>
                      <Text style={styles.medFlagText}>{reg.flagLine}</Text>
                    </View>
                  )}
                  {reg.indication ? <Text style={styles.medContext}>For {reg.indication}</Text> : null}
                  {reg.prescribed_by ? <Text style={styles.medContext}>Prescribed by {reg.prescribed_by}</Text> : null}
                  <View style={styles.conditionActions}>
                    <TouchableOpacity onPress={() => openEditRegimen(reg)} hitSlop={8}>
                      <Text style={styles.conditionActionText}>Edit</Text>
                    </TouchableOpacity>
                    <Text style={styles.conditionActionDivider}>·</Text>
                    <TouchableOpacity onPress={() => confirmEndRegimen(reg)} hitSlop={8}>
                      <Text style={[styles.conditionActionText, styles.medEndActionText]}>End</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </Card>

        {/* ── Diet trial card ── */}
        {!trialLoading && dietTrial && (
          <Card style={styles.sectionGap}>
            <Text style={styles.trialLabel}>Diet trial</Text>
            {dietTrial.food_items && (
              <Text style={styles.trialFood}>
                {dietTrial.food_items.brand} {dietTrial.food_items.product_name}
              </Text>
            )}
            <Text style={styles.trialDays}>
              Day {dietTrial.daysElapsed} of {dietTrial.target_duration_days}
            </Text>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressBar,
                  { width: `${Math.min(100, dietTrial.compliance)}%` },
                ]}
              />
            </View>
            <Text style={styles.trialCompliance}>
              {dietTrial.compliance}% compliance · {dietTrial.daysLogged} days with a meal logged
            </Text>
            {dietTrial.vet_name && (
              <Text style={styles.trialVet}>Vet: {dietTrial.vet_name}</Text>
            )}
          </Card>
        )}

        {/* ── Account ── */}
        <Card style={styles.sectionGap}>
          <Text style={styles.sectionTitle}>Account</Text>
          <Divider style={styles.accountDivider} />
          <TouchableOpacity style={styles.accountRow} onPress={handleSignOut} hitSlop={8}>
            <Text style={styles.accountRowText}>Sign out</Text>
          </TouchableOpacity>
          <Divider style={styles.accountDivider} />
          {/* Delete account (B-039 FR-8): destructive-styled, routed to the
              heavier type-to-confirm flow — NOT Sign out's lightweight Alert,
              because the consequence is irreversible. */}
          <TouchableOpacity
            style={styles.deleteAccountRow}
            onPress={() => setDeleteSheetVisible(true)}
            hitSlop={8}
            accessibilityRole="button"
          >
            <Text style={styles.deleteAccountRowText}>Delete account</Text>
          </TouchableOpacity>
        </Card>

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

      <DeleteAccountSheet
        visible={deleteSheetVisible}
        petNames={pets.map((p) => p.name)}
        onClose={() => setDeleteSheetVisible(false)}
      />

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

  // ── Diet trial ──
  trialLabel: {
    fontSize: theme.textXS,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
    textTransform: 'uppercase',
    letterSpacing: theme.trackingWidest,
  },
  trialFood: {
    fontSize: theme.textLG,
    fontWeight: theme.weightMedium,
    color: theme.colorNeutralDark,
  },
  trialDays: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },
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
  trialCompliance: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },
  trialVet: {
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

  // ── Account ──
  accountDivider: {
    marginVertical: 0,
  },
  accountRow: {
    paddingVertical: 6,
    minHeight: 44,
    justifyContent: 'center',
  },
  accountRowText: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
  },
  deleteAccountRow: {
    minHeight: 44,
    justifyContent: 'center',
  },
  deleteAccountRowText: {
    fontSize: theme.textMD,
    color: theme.colorDestructive,
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
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateText: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
  },
  bottomPad: {
    height: theme.space5,
  },
});
