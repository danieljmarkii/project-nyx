import { useEffect, useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Modal, Platform,
  ScrollView, StyleSheet, TextInput, TouchableOpacity, View,
} from 'react-native';
import { ThemedText } from '../ui/ThemedText';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { theme } from '../../constants/theme';
import { WhorlSpinner } from '../brand/WhorlSpinner';
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
  existingCondition?: Condition;
  onClose: () => void;
  onAdded: (condition: Condition) => void;
  onUpdated?: (condition: Condition) => void;
}

export function AddConditionModal({
  visible, petId, existingCondition, onClose, onAdded, onUpdated,
}: Props) {
  const isEditing = existingCondition != null;

  const [conditionName, setConditionName] = useState('');
  const [status, setStatus] = useState<ConditionStatus>('active');
  const [diagnosedAt, setDiagnosedAt] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      if (existingCondition) {
        setConditionName(existingCondition.condition_name);
        setStatus(
          existingCondition.status === 'resolved' ? 'active' : existingCondition.status,
        );
        setDiagnosedAt(
          existingCondition.diagnosed_at ? new Date(existingCondition.diagnosed_at) : null,
        );
      } else {
        setConditionName('');
        setStatus('active');
        setDiagnosedAt(null);
      }
      setShowDatePicker(false);
    }
  }, [visible, existingCondition]);

  function handleClose() {
    onClose();
  }

  async function handleSave() {
    const trimmed = conditionName.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const payload = {
        condition_name: trimmed,
        status,
        diagnosed_at: diagnosedAt ? diagnosedAt.toISOString().split('T')[0] : null,
      };

      if (isEditing && existingCondition) {
        const { data, error } = await supabase
          .from('conditions')
          .update(payload)
          .eq('id', existingCondition.id)
          .select()
          .single();

        if (error || !data) throw error ?? new Error('No data returned');
        onUpdated?.(data as Condition);
      } else {
        const { data, error } = await supabase
          .from('conditions')
          .insert({ pet_id: petId, ...payload })
          .select()
          .single();

        if (error || !data) throw error ?? new Error('No data returned');
        onAdded(data as Condition);
      }

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
            <ThemedText style={styles.cancelText}>Cancel</ThemedText>
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>{isEditing ? 'Edit condition' : 'Add condition'}</ThemedText>
          <TouchableOpacity onPress={handleSave} disabled={saving || !canSave} hitSlop={8}>
            {saving
              ? <WhorlSpinner size="sm" ground="day" />
              : <ThemedText style={[styles.saveText, !canSave && styles.saveTextDisabled]}>
                  {isEditing ? 'Save' : 'Add'}
                </ThemedText>
            }
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">

            <ThemedText style={styles.label}>Condition name</ThemedText>
            <TextInput
              style={styles.input}
              value={conditionName}
              onChangeText={setConditionName}
              placeholder="e.g. Food sensitivity, IBD, atopy"
              placeholderTextColor={theme.colorTextSecondary}
              autoCapitalize="sentences"
              returnKeyType="done"
              autoFocus={!isEditing}
            />

            <ThemedText style={styles.label}>Status</ThemedText>
            <View style={styles.chipRow}>
              {STATUS_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.chip, status === opt.value && styles.chipActive]}
                  onPress={() => setStatus(opt.value)}
                >
                  <ThemedText style={[styles.chipText, status === opt.value && styles.chipTextActive]}>
                    {opt.label}
                  </ThemedText>
                  <ThemedText style={[styles.chipDesc, status === opt.value && styles.chipDescActive]}>
                    {opt.description}
                  </ThemedText>
                </TouchableOpacity>
              ))}
            </View>

            <ThemedText style={styles.label}>Diagnosed (optional)</ThemedText>
            <TouchableOpacity
              style={styles.fieldBtn}
              onPress={() => setShowDatePicker(!showDatePicker)}
              activeOpacity={0.7}
            >
              <ThemedText style={diagnosedAt ? styles.fieldBtnText : styles.fieldBtnPlaceholder}>
                {diagnosedAt
                  ? diagnosedAt.toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' })
                  : 'Not known'}
              </ThemedText>
              <ThemedText style={styles.changeLabel}>{showDatePicker ? 'Done' : 'Set date'}</ThemedText>
            </TouchableOpacity>
            {diagnosedAt && !showDatePicker && (
              <TouchableOpacity onPress={() => setDiagnosedAt(null)} style={styles.clearBtn} hitSlop={8}>
                <ThemedText style={styles.clearBtnText}>Clear date</ThemedText>
              </TouchableOpacity>
            )}
            {showDatePicker && (
              <DateTimePicker
                value={diagnosedAt ?? new Date()}
                mode="date"
                display="spinner"
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
    color: theme.colorAccentInk,
  },
  saveTextDisabled: {
    opacity: theme.opacityDisabled,
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
    fontFamily: theme.fontBody,
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
    color: theme.colorTextOnDark,
  },
  chipDesc: {
    fontSize: 11,
    color: theme.colorTextSecondary,
    textAlign: 'center',
  },
  chipDescActive: {
    color: theme.colorTextOnDarkSubtle,
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
    color: theme.colorAccentInk,
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
