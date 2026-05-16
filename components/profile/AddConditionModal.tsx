import { useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { theme } from '../../constants/theme';
import { supabase } from '../../lib/supabase';

export interface Condition {
  id: string;
  pet_id: string;
  condition_name: string;
  diagnosed_at: string | null;
  status: 'active' | 'monitoring' | 'resolved';
  notes: string | null;
  created_at: string;
}

type ConditionStatus = 'active' | 'monitoring';

const STATUS_OPTIONS: { value: ConditionStatus; label: string; description: string }[] = [
  { value: 'active', label: 'Active', description: 'Currently affecting the pet' },
  { value: 'monitoring', label: 'Monitoring', description: 'Under observation' },
];

interface Props {
  visible: boolean;
  petId: string;
  onClose: () => void;
  onAdded: (condition: Condition) => void;
}

export function AddConditionModal({ visible, petId, onClose, onAdded }: Props) {
  const [conditionName, setConditionName] = useState('');
  const [status, setStatus] = useState<ConditionStatus>('active');
  const [diagnosedAt, setDiagnosedAt] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  function reset() {
    setConditionName('');
    setStatus('active');
    setDiagnosedAt(null);
    setShowDatePicker(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSave() {
    const trimmed = conditionName.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const payload = {
        pet_id: petId,
        condition_name: trimmed,
        status,
        diagnosed_at: diagnosedAt ? diagnosedAt.toISOString().split('T')[0] : null,
      };

      const { data, error } = await supabase
        .from('conditions')
        .insert(payload)
        .select()
        .single();

      if (error || !data) throw error ?? new Error('No data returned');

      onAdded(data as Condition);
      reset();
      onClose();
    } catch (e) {
      console.error('[AddConditionModal] save failed:', e);
      Alert.alert('Could not save', 'Something went wrong. Try again.');
    } finally {
      setSaving(false);
    }
  }

  const canSave = conditionName.trim().length > 0;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} hitSlop={8}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Add condition</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving || !canSave} hitSlop={8}>
            {saving
              ? <ActivityIndicator size="small" color={theme.colorAccent} />
              : <Text style={[styles.saveText, !canSave && styles.saveTextDisabled]}>Add</Text>
            }
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">

            <Text style={styles.label}>Condition name</Text>
            <TextInput
              style={styles.input}
              value={conditionName}
              onChangeText={setConditionName}
              placeholder="e.g. Food sensitivity, IBD, atopy"
              placeholderTextColor={theme.colorTextSecondary}
              autoCapitalize="sentences"
              returnKeyType="done"
              autoFocus
            />

            <Text style={styles.label}>Status</Text>
            <View style={styles.chipRow}>
              {STATUS_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.chip, status === opt.value && styles.chipActive]}
                  onPress={() => setStatus(opt.value)}
                >
                  <Text style={[styles.chipText, status === opt.value && styles.chipTextActive]}>
                    {opt.label}
                  </Text>
                  <Text style={[styles.chipDesc, status === opt.value && styles.chipDescActive]}>
                    {opt.description}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Diagnosed (optional)</Text>
            <TouchableOpacity
              style={styles.fieldBtn}
              onPress={() => setShowDatePicker(!showDatePicker)}
              activeOpacity={0.7}
            >
              <Text style={diagnosedAt ? styles.fieldBtnText : styles.fieldBtnPlaceholder}>
                {diagnosedAt
                  ? diagnosedAt.toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' })
                  : 'Not known'}
              </Text>
              <Text style={styles.changeLabel}>{showDatePicker ? 'Done' : 'Set date'}</Text>
            </TouchableOpacity>
            {diagnosedAt && !showDatePicker && (
              <TouchableOpacity onPress={() => setDiagnosedAt(null)} style={styles.clearBtn} hitSlop={8}>
                <Text style={styles.clearBtnText}>Clear date</Text>
              </TouchableOpacity>
            )}
            {showDatePicker && (
              <DateTimePicker
                value={diagnosedAt ?? new Date()}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                maximumDate={new Date()}
                onChange={(_e: unknown, date?: Date) => {
                  if (Platform.OS === 'android') setShowDatePicker(false);
                  if (date) setDiagnosedAt(date);
                }}
              />
            )}

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
    gap: theme.space1,
  },
  chip: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: theme.space1,
    borderRadius: theme.radiusSmall,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    backgroundColor: theme.colorNeutralLight,
    alignItems: 'center',
    gap: 2,
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
  chipDesc: {
    fontSize: 11,
    color: theme.colorTextSecondary,
    textAlign: 'center',
  },
  chipDescActive: {
    color: 'rgba(255,255,255,0.65)',
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
  fieldBtnPlaceholder: {
    fontSize: 16,
    color: theme.colorTextSecondary,
  },
  changeLabel: {
    fontSize: 14,
    color: theme.colorAccent,
    fontWeight: theme.fontWeightMedium,
  },
  clearBtn: {
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  clearBtnText: {
    fontSize: 13,
    color: theme.colorTextSecondary,
    textDecorationLine: 'underline',
  },
});
