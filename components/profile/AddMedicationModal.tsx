// Regimen setup — B-117 PR 7. The medication twin of AddConditionModal: a
// pageSheet modal that captures a prescription/regimen ONCE (drug, dose, route,
// frequency, schedule, indication, prescriber, start, duration) so that logging a
// dose thereafter is a single confirm-don't-enter tap (spec §3/§5.4 — the wall of
// decisions lives on the regimen, not the dose).
//
// Writes a `medications` row through the CLIENT supabase, RLS-gated by
// medications_owner (migration 020). B-123 (re-validate caller ownership before any
// pet-scoped medications write) is satisfied here by RLS itself: the policy reuses
// `pet_id IN (SELECT id FROM pets WHERE user_id = auth.uid())` as the INSERT/UPDATE
// WITH CHECK, so the DB re-checks ownership on every write. There is NO service-role
// write path in PR 7 to confuse (the confused-deputy shape B-123 guards against);
// the modal only ever receives the ACTIVE pet's id, never free input, and every
// write uses `.select()` so a silently RLS-blocked write surfaces as an error rather
// than a false success (the food_items 009 cautionary tale).
import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { theme } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import { getLibraryMedications, PickerMedication } from '../../lib/db';
import {
  MEDICATION_ROUTE_OPTIONS, buildRegimenPayload, canSaveRegimen,
  type RegimenFormValues,
} from '../../lib/medications';
import { MedicationNameChips } from '../medication/MedicationNameChips';
import { usePetStore } from '../../store/petStore';

// The regimen row the card lists and this modal edits. A subset of `medications` —
// the columns the "Current medications" card and this form touch.
export interface Regimen {
  id: string;
  pet_id: string;
  medication_item_id: string | null;
  drug_name: string;
  dose_amount: string | null;
  route: string | null;
  doses_per_day: number | null;
  schedule_notes: string | null;
  indication: string | null;
  prescribed_by: string | null;
  started_at: string;
  target_duration_days: number | null;
  status: 'active' | 'completed' | 'stopped';
  ended_at: string | null;
}

// PostgREST serialises NUMERIC as a string ("1.00"); coerce doses_per_day back to a
// number so the returned regimen drives the card's frequency/compliance render
// correctly on the optimistic onAdded/onUpdated path (mirrors loadMedications).
function coerceRegimen(row: Regimen): Regimen {
  return {
    ...row,
    doses_per_day: row.doses_per_day == null ? null : Number(row.doses_per_day),
  };
}

// Frequency presets → doses_per_day. "As needed" (PRN) is null: no compliance
// target (§5.4). doses_per_day is NUMERIC so finer schedules exist, but these
// presets cover the common cases and keep setup a few taps; null is a distinct,
// selectable option (only this one has value=null, so equality renders selection
// unambiguously).
const FREQUENCY_OPTIONS: { label: string; value: number | null }[] = [
  { label: 'Once a day', value: 1 },
  { label: 'Twice a day', value: 2 },
  { label: '3× a day', value: 3 },
  { label: '4× a day', value: 4 },
  { label: 'As needed', value: null },
];

interface Props {
  visible: boolean;
  petId: string;
  existingRegimen?: Regimen;
  onClose: () => void;
  onAdded: (regimen: Regimen) => void;
  onUpdated?: (regimen: Regimen) => void;
}

function todayDateOnly(): string {
  return new Date().toISOString().split('T')[0];
}

export function AddMedicationModal({
  visible, petId, existingRegimen, onClose, onAdded, onUpdated,
}: Props) {
  const isEditing = existingRegimen != null;

  // Species for the name-chip ordering (B-160). The modal only gets petId, so resolve
  // the pet from the store; petId is always the active pet (profile.tsx), so activePet
  // is the fallback if the list hasn't hydrated this id yet.
  const species = usePetStore((s) => (s.pets.find((p) => p.id === petId) ?? s.activePet)?.species);

  const [library, setLibrary] = useState<PickerMedication[]>([]);

  const [drugName, setDrugName] = useState('');
  const [medicationItemId, setMedicationItemId] = useState<string | null>(null);
  const [doseAmount, setDoseAmount] = useState('');
  const [route, setRoute] = useState<string | null>(null);
  const [dosesPerDay, setDosesPerDay] = useState<number | null>(1);
  const [scheduleNotes, setScheduleNotes] = useState('');
  const [indication, setIndication] = useState('');
  const [prescribedBy, setPrescribedBy] = useState('');
  const [startedAt, setStartedAt] = useState<Date>(new Date());
  const [targetDuration, setTargetDuration] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  // Seed the form on open; reset to defaults for a new regimen.
  useEffect(() => {
    if (!visible) return;
    if (existingRegimen) {
      setDrugName(existingRegimen.drug_name);
      setMedicationItemId(existingRegimen.medication_item_id);
      setDoseAmount(existingRegimen.dose_amount ?? '');
      setRoute(existingRegimen.route);
      setDosesPerDay(existingRegimen.doses_per_day);
      setScheduleNotes(existingRegimen.schedule_notes ?? '');
      setIndication(existingRegimen.indication ?? '');
      setPrescribedBy(existingRegimen.prescribed_by ?? '');
      setStartedAt(existingRegimen.started_at ? new Date(existingRegimen.started_at) : new Date());
      setTargetDuration(
        existingRegimen.target_duration_days != null
          ? String(existingRegimen.target_duration_days)
          : '',
      );
    } else {
      setDrugName('');
      setMedicationItemId(null);
      setDoseAmount('');
      setRoute(null);
      setDosesPerDay(1);
      setScheduleNotes('');
      setIndication('');
      setPrescribedBy('');
      setStartedAt(new Date());
      setTargetDuration('');
    }
    setShowDatePicker(false);
  }, [visible, existingRegimen]);

  // Load "your medications" (the local library cache) so the owner can link a drug
  // they've already captured — that medication_item_id is what keeps PR 9's Signal
  // confounder pass keyed on a stable id. Degrades silently to text-only.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    getLibraryMedications()
      .then((meds) => { if (!cancelled) setLibrary(meds); })
      .catch((err) => console.warn('[AddMedicationModal] library load failed:', err));
    return () => { cancelled = true; };
  }, [visible]);

  // Tap a library drug → fill the name + LINK the item + default the route (NOT the
  // dose: a drug's per-unit strength is not its dose, and fabricating one is a
  // dosing-safety footgun — the owner enters the real dose, spec §6.5 / medicationDose).
  function pickLibraryDrug(med: PickerMedication) {
    setMedicationItemId(med.id);
    setDrugName(med.generic_name);
    if (!route && med.default_route) setRoute(med.default_route);
  }

  // Editing the name unlinks the library item, so a free-text name never ships a
  // stale medication_item_id (buildRegimenPayload trusts this invariant).
  function onChangeDrugName(text: string) {
    setDrugName(text);
    if (medicationItemId) {
      const linked = library.find((m) => m.id === medicationItemId);
      if (!linked || linked.generic_name !== text) setMedicationItemId(null);
    }
  }

  function formValues(): RegimenFormValues {
    const parsedDuration = parseInt(targetDuration, 10);
    return {
      drugName,
      medicationItemId,
      doseAmount,
      route,
      dosesPerDay,
      scheduleNotes,
      indication,
      prescribedBy,
      startedAt: startedAt.toISOString().split('T')[0],
      targetDurationDays: Number.isFinite(parsedDuration) && parsedDuration > 0 ? parsedDuration : null,
    };
  }

  async function handleSave() {
    if (!canSaveRegimen({ drugName })) return;
    setSaving(true);
    try {
      const payload = buildRegimenPayload(formValues());

      if (isEditing && existingRegimen) {
        // RLS (medications_owner) re-validates ownership of this regimen's pet on
        // the UPDATE; .select() turns a silent 0-row RLS block into a real error.
        // maybeSingle (not single) so a 0-row read-back resolves to null instead of
        // throwing — the write still committed; the card refreshes on next focus.
        const { data, error } = await supabase
          .from('medications')
          .update(payload)
          .eq('id', existingRegimen.id)
          .select()
          .maybeSingle();
        if (error) throw error;
        // Dismiss BEFORE the parent callback, so a hiccup in the optimistic rebuild
        // can never strand the modal with the Save spinner still spinning (the hang
        // the PM hit). The finally clears `saving` either way.
        onClose();
        if (data) onUpdated?.(coerceRegimen(data as Regimen));
      } else {
        // pet_id comes from the ACTIVE pet (never free input); the RLS WITH CHECK
        // re-validates `pet_id IN (pets owned by auth.uid())` on INSERT (B-123).
        const { data, error } = await supabase
          .from('medications')
          .insert({ pet_id: petId, status: 'active', ...payload })
          .select()
          .maybeSingle();
        if (error) throw error;
        onClose();
        if (data) onAdded(coerceRegimen(data as Regimen));
      }
    } catch (e) {
      console.error('[AddMedicationModal] save failed:', e);
      Alert.alert('Could not save', 'Something went wrong. Try again.');
    } finally {
      setSaving(false);
    }
  }

  const canSave = canSaveRegimen({ drugName });

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={8}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{isEditing ? 'Edit medication' : 'Add medication'}</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving || !canSave} hitSlop={8}>
            {saving
              ? <ActivityIndicator size="small" color={theme.colorAccent} />
              : <Text style={[styles.saveText, !canSave && styles.saveTextDisabled]}>
                  {isEditing ? 'Save' : 'Add'}
                </Text>}
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">

            {/* Drug — link a library drug (keeps the medication_item_id) or type one. */}
            {!isEditing && library.length > 0 && (
              <>
                <Text style={styles.label}>Your medications</Text>
                <View style={styles.chipWrap}>
                  {library.map((m) => (
                    <TouchableOpacity
                      key={m.id}
                      style={[styles.chip, medicationItemId === m.id && styles.chipActive]}
                      onPress={() => pickLibraryDrug(m)}
                    >
                      <Text style={[styles.chipText, medicationItemId === m.id && styles.chipTextActive]}>
                        {m.generic_name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            <Text style={styles.label}>Medication</Text>
            <TextInput
              style={styles.input}
              value={drugName}
              onChangeText={onChangeDrugName}
              placeholder="e.g. Prednisolone"
              placeholderTextColor={theme.colorTextSecondary}
              autoCapitalize="sentences"
              returnKeyType="done"
              autoFocus={!isEditing && library.length === 0}
            />
            {/* Name shortcuts — empty-state only. Routes through onChangeDrugName (NOT
                a bare setter) so a free-text chip name clears any stale
                medication_item_id, exactly as typing does (§4.3 / buildRegimenPayload). */}
            {drugName.trim().length === 0 && (
              <MedicationNameChips species={species} onPick={onChangeDrugName} />
            )}

            <Text style={styles.label}>Dose</Text>
            <TextInput
              style={styles.input}
              value={doseAmount}
              onChangeText={setDoseAmount}
              placeholder="e.g. 1 tablet, 5 mg, 0.5 mL"
              placeholderTextColor={theme.colorTextSecondary}
              autoCapitalize="none"
              returnKeyType="done"
            />

            <Text style={styles.label}>Frequency</Text>
            <View style={styles.chipWrap}>
              {FREQUENCY_OPTIONS.map((opt) => {
                const active = opt.value === dosesPerDay;
                return (
                  <TouchableOpacity
                    key={opt.label}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setDosesPerDay(opt.value)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.label}>Route (optional)</Text>
            <View style={styles.chipWrap}>
              {MEDICATION_ROUTE_OPTIONS.map((opt) => {
                const active = route === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setRoute(active ? null : opt.value)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.label}>Started</Text>
            <TouchableOpacity
              style={styles.fieldBtn}
              onPress={() => setShowDatePicker(!showDatePicker)}
              activeOpacity={0.7}
            >
              <Text style={styles.fieldBtnText}>
                {startedAt.toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' })}
              </Text>
              <Text style={styles.changeLabel}>{showDatePicker ? 'Done' : 'Change'}</Text>
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={startedAt}
                mode="date"
                display="spinner"
                maximumDate={new Date()}
                onChange={(_e: unknown, date?: Date) => {
                  if (Platform.OS === 'android') setShowDatePicker(false);
                  if (date) setStartedAt(date);
                }}
              />
            )}

            <Text style={styles.label}>Course length (optional)</Text>
            <View style={styles.durationRow}>
              <TextInput
                style={[styles.input, styles.durationInput]}
                value={targetDuration}
                onChangeText={(t) => setTargetDuration(t.replace(/[^0-9]/g, ''))}
                placeholder="Ongoing"
                placeholderTextColor={theme.colorTextSecondary}
                keyboardType="number-pad"
                returnKeyType="done"
              />
              <Text style={styles.durationUnit}>days</Text>
            </View>

            <Text style={styles.label}>Schedule notes (optional)</Text>
            <TextInput
              style={styles.input}
              value={scheduleNotes}
              onChangeText={setScheduleNotes}
              placeholder="e.g. 8am & 8pm, with food"
              placeholderTextColor={theme.colorTextSecondary}
              autoCapitalize="sentences"
              returnKeyType="done"
            />

            <Text style={styles.label}>What it's for (optional)</Text>
            <TextInput
              style={styles.input}
              value={indication}
              onChangeText={setIndication}
              placeholder="e.g. Allergies, infection"
              placeholderTextColor={theme.colorTextSecondary}
              autoCapitalize="sentences"
              returnKeyType="done"
            />

            <Text style={styles.label}>Prescribed by (optional)</Text>
            <TextInput
              style={styles.input}
              value={prescribedBy}
              onChangeText={setPrescribedBy}
              placeholder="e.g. Dr. Chen"
              placeholderTextColor={theme.colorTextSecondary}
              autoCapitalize="words"
              returnKeyType="done"
            />

          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colorSurface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.space3,
    paddingVertical: theme.space2,
    borderBottomWidth: 1,
    borderBottomColor: theme.colorBorder,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorNeutralDark,
  },
  cancelText: {
    fontSize: 16,
    color: theme.colorTextSecondary,
  },
  saveText: {
    fontSize: 16,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorAccent,
  },
  saveTextDisabled: {
    opacity: 0.4,
  },
  form: {
    padding: theme.space3,
    paddingBottom: theme.space6,
    gap: theme.space1,
  },
  label: {
    fontSize: 12,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorTextSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
    marginTop: theme.space2,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusSmall,
    paddingHorizontal: theme.space2,
    paddingVertical: 12,
    fontSize: 16,
    color: theme.colorTextPrimary,
    backgroundColor: theme.colorNeutralLight,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space1,
  },
  chip: {
    paddingVertical: 9,
    paddingHorizontal: theme.space2,
    borderRadius: theme.radiusSmall,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    backgroundColor: theme.colorNeutralLight,
  },
  chipActive: {
    backgroundColor: theme.colorNeutralDark,
    borderColor: theme.colorNeutralDark,
  },
  chipText: {
    fontSize: 14,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorTextSecondary,
  },
  chipTextActive: {
    color: '#fff',
  },
  fieldBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusSmall,
    paddingHorizontal: theme.space2,
    paddingVertical: 12,
    backgroundColor: theme.colorNeutralLight,
  },
  fieldBtnText: {
    fontSize: 16,
    color: theme.colorTextPrimary,
  },
  changeLabel: {
    fontSize: 14,
    color: theme.colorAccent,
    fontWeight: theme.fontWeightMedium,
  },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
  },
  durationInput: {
    flex: 1,
  },
  durationUnit: {
    fontSize: 16,
    color: theme.colorTextSecondary,
  },
});
