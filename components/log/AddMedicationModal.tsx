import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../../constants/theme';
import { addMedicationItem, PickerMedication } from '../../lib/db';

// Text-first "add a medication" (B-117 PR 3) — the manual-entry path the spec
// (§5.2) keeps always-present (offline, blurry label, compounded drug), and the
// ONLY add path until the PR 5 photo-capture flow lands. Mirrors AddConditionModal's
// form pattern, but writes LOCALLY (addMedicationItem → medication_items_cache,
// offline-first) instead of straight to Supabase: medications are part of the
// PR 2 sync mirror, so the new item rides to the cloud on the first dose's push.
//
// Deliberately light (the 10-second test): only the drug NAME is required. Strength
// is clinically valuable and cheap; brand + form are optional. Route and the full
// medication_form set are left to the PR 6 detail screen. is_critical is NOT here —
// critical classification is clinical, never owner-judged (§10).

// The common oral forms; the detail screen (PR 6) exposes the full enum. Values
// are the migration-020 `medication_form` enum members.
const FORM_OPTIONS: { value: string; label: string }[] = [
  { value: 'tablet',   label: 'Tablet' },
  { value: 'capsule',  label: 'Capsule' },
  { value: 'liquid',   label: 'Liquid' },
  { value: 'chewable', label: 'Chewable' },
  { value: 'other',    label: 'Other' },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  // Fires with the newly-created library row so the caller can log the first dose
  // against it immediately (add-then-log), exactly like picking an existing drug.
  // The PARENT owns teardown: onAdded is responsible for dismissing this sheet
  // (the picker closes it before the dose write), so a dose-write failure surfaces
  // its own alert on the live picker rather than on a sheet this modal already
  // tore down. This modal only auto-closes via onClose on Cancel; on an add-item
  // failure it stays open with its retry alert.
  onAdded: (item: PickerMedication) => void;
}

export function AddMedicationModal({ visible, onClose, onAdded }: Props) {
  const [genericName, setGenericName] = useState('');
  const [brandName, setBrandName] = useState('');
  const [strength, setStrength] = useState('');
  const [form, setForm] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Reset to a clean form each time the sheet opens.
  useEffect(() => {
    if (visible) {
      setGenericName('');
      setBrandName('');
      setStrength('');
      setForm(null);
      setSaving(false);
    }
  }, [visible]);

  const canSave = genericName.trim().length > 0;

  async function handleSave() {
    const trimmed = genericName.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      const item = await addMedicationItem({
        genericName: trimmed,
        brandName,
        strength,
        form,
      });
      // Hand the item to the parent, which closes this sheet AND logs the first
      // dose. We do NOT call onClose() here — the parent owns teardown (see the
      // onAdded prop note); calling it would race the parent's own dismissal.
      onAdded(item);
    } catch (e) {
      console.error('[AddMedicationModal] save failed:', e);
      Alert.alert('Could not save', 'Something went wrong. Try again.');
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={8}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Add medication</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving || !canSave} hitSlop={8}>
            {saving
              ? <ActivityIndicator size="small" color={theme.colorAccent} />
              : <Text style={[styles.saveText, !canSave && styles.saveTextDisabled]}>Add</Text>
            }
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">

            <Text style={styles.label}>Medication name</Text>
            <TextInput
              style={styles.input}
              value={genericName}
              onChangeText={setGenericName}
              placeholder="e.g. Prednisolone, Apoquel"
              placeholderTextColor={theme.colorTextSecondary}
              autoCapitalize="sentences"
              returnKeyType="next"
              autoFocus
            />

            <Text style={styles.label}>Brand (optional)</Text>
            <TextInput
              style={styles.input}
              value={brandName}
              onChangeText={setBrandName}
              placeholder="e.g. the brand on the label"
              placeholderTextColor={theme.colorTextSecondary}
              autoCapitalize="words"
              returnKeyType="next"
            />

            <Text style={styles.label}>Strength (optional)</Text>
            <TextInput
              style={styles.input}
              value={strength}
              onChangeText={setStrength}
              placeholder="e.g. 5 mg, 16 mg/mL"
              placeholderTextColor={theme.colorTextSecondary}
              autoCapitalize="none"
              returnKeyType="done"
            />

            <Text style={styles.label}>Form (optional)</Text>
            <View style={styles.chipRow}>
              {FORM_OPTIONS.map((opt) => {
                const active = form === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.chip, active && styles.chipActive]}
                    // Toggle: tapping the active chip clears it back to unset, so
                    // form stays genuinely optional.
                    onPress={() => setForm(active ? null : opt.value)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

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
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space1,
  },
  chip: {
    paddingVertical: 10,
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
});
