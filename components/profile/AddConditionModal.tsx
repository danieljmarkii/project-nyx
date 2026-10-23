import { useEffect, useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Modal, Platform,
  ScrollView, StyleSheet, View,
} from 'react-native';
import { ChipGroup } from '../ui/ChipGroup';
import { FieldLabel } from '../ui/FieldLabel';
import { Header } from '../ui/Header';
import { HeaderAction } from '../ui/HeaderAction';
import { PickerRow } from '../ui/PickerRow';
import { TextField } from '../ui/TextField';
import { TextLink } from '../ui/TextLink';
import { ThemedText } from '../ui/ThemedText';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { theme } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import { dayKeyToLocalDate, toLocalDayKey } from '../../lib/utils';

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

/** "Sep 2026" for a condition's DATE, or null when there is none to show. Local components:
 *  `new Date('2026-09-01')` is UTC midnight, the previous month anywhere west of UTC. */
export function diagnosedMonthLabel(diagnosedAt: string | null): string | null {
  const day = diagnosedAt ? dayKeyToLocalDate(diagnosedAt) : null;
  return day ? day.toLocaleDateString([], { year: 'numeric', month: 'short' }) : null;
}

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
        // `diagnosed_at` is a DATE: a calendar day, read and written in LOCAL components.
        // `new Date('2026-09-01')` is UTC midnight (Aug 31 anywhere west of UTC), and
        // `toISOString()` hands back the UTC day (tomorrow, for an evening pick in the US),
        // which is the day the vet report then printed.
        setDiagnosedAt(
          existingCondition.diagnosed_at ? dayKeyToLocalDate(existingCondition.diagnosed_at) : null,
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
        diagnosed_at: diagnosedAt ? toLocalDayKey(diagnosedAt) : null,
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
  const statusDescription = STATUS_OPTIONS.find((o) => o.value === status)?.description ?? '';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <SafeAreaView style={styles.container}>
        <Header
          title={isEditing ? 'Edit condition' : 'Add condition'}
          left={<HeaderAction label="Cancel" tone="quiet" onPress={handleClose} />}
          right={
            <HeaderAction
              label={isEditing ? 'Save' : 'Add'}
              onPress={handleSave}
              disabled={!canSave}
              disabledReason="name the condition first"
              working={saving}
              testID="condition-save"
            />
          }
        />

        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">

            <TextField
              label="Condition name"
              value={conditionName}
              onChangeText={setConditionName}
              placeholder="e.g. Food sensitivity, IBD, atopy"
              autoCapitalize="sentences"
              returnKeyType="done"
              autoFocus={!isEditing}
            />

            <View>
              <FieldLabel label="Status" />
              <ChipGroup
                options={STATUS_OPTIONS}
                value={status}
                onChange={(next) => { if (next) setStatus(next as ConditionStatus); }}
                allowDeselect={false}
                accessibilityLabel="Status"
              />
              {/* The kit chip carries one line, so the chosen status's meaning is one
                  caption under the group (round F7). */}
              <ThemedText variant="caption" style={styles.caption}>{statusDescription}</ThemedText>
            </View>

            <View>
              <PickerRow
                label="Diagnosed (optional)"
                value={diagnosedAt
                  ? diagnosedAt.toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' })
                  : null}
                placeholder="Not known"
                actionLabel={showDatePicker ? 'Done' : 'Set date'}
                onPress={() => setShowDatePicker(!showDatePicker)}
              />
              {diagnosedAt && !showDatePicker && (
                <TextLink label="Clear date" tone="quiet" variant="caption" onPress={() => setDiagnosedAt(null)} />
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
  flex: {
    flex: 1,
  },
  form: {
    padding: theme.space3,
    paddingBottom: theme.space6,
    gap: theme.space2,
  },
  caption: {
    color: theme.colorTextSecondary,
    marginTop: theme.space1,
  },
});
