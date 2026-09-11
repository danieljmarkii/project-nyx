import { useState } from 'react';
import { Platform, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { theme } from '../../constants/theme';
import { PrimaryButton } from '../ui/PrimaryButton';
import { SectionLabel } from '../ui/SectionLabel';
import { TextField } from '../ui/TextField';
import { ThemedText } from '../ui/ThemedText';
import { formatVisitDate, localDateKey } from '../../lib/vetVisits';

export interface VisitEditFields {
  visitedAt: Date;
  clinicName: string;
  vetName: string;
  reason: string;
  notes: string;
}

interface Props {
  /** The RECORD's pet, via `resolveRecordPetName(pets, visit.pet_id)` — CUL-574. */
  petName: string;
  fields: VisitEditFields;
  onChangeField: <K extends keyof VisitEditFields>(key: K, value: VisitEditFields[K]) => void;
  saving: boolean;
  onSave: () => void;
}

// Editing a visit as written (mock D3's ⋯ *Edit*).
//
// THE PLAN IS NOT EDITABLE HERE, and that is the design rather than a gap: the plan
// rows on D3 are LIVE LINKS whose numbers come from the linked records (§4.1 D3), so
// a course is corrected on the course and a trial on the trial. A second editor for
// the same facts would be a second source of truth for them, which is the whole
// argument `derivePlanTags` exists for.
//
// THE DATE IS EDITABLE, and it is the one field here with a consequence beyond this
// screen — the vet report's window rung 1 and Home's "since last visit" both key off
// `visited_at` — so the note under it says so rather than leaving the owner to find
// out from a report.
export function VisitEditBody({ petName, fields, onChangeField, saving, onSave }: Props) {
  const [showDayPicker, setShowDayPicker] = useState(false);

  return (
    <View>
      <ThemedText style={styles.pageTitle}>Edit this visit</ThemedText>
      <ThemedText style={styles.pageSub}>{petName}</ThemedText>

      <SectionLabel label="When" style={styles.label} />
      <TouchableOpacity
        style={styles.valueRow}
        onPress={() => setShowDayPicker((s) => !s)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Visit date, ${formatVisitDate(localDateKey(fields.visitedAt))}`}
      >
        <ThemedText style={styles.valueText}>
          {formatVisitDate(localDateKey(fields.visitedAt))}
        </ThemedText>
      </TouchableOpacity>
      {showDayPicker && (
        <DateTimePicker
          value={fields.visitedAt}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          // A visit that happened cannot be in the future — the same bound the
          // after-visit screen carries, for the same reason.
          maximumDate={new Date()}
          onChange={(_, picked) => {
            if (Platform.OS !== 'ios') setShowDayPicker(false);
            if (picked) onChangeField('visitedAt', picked);
          }}
        />
      )}
      <ThemedText style={styles.dateNote}>
        Moving this date moves where {petName}’s vet report starts.
      </ThemedText>

      <SectionLabel label="Where" style={styles.label} />
      <TextField
        value={fields.clinicName}
        onChangeText={(t) => onChangeField('clinicName', t)}
        placeholder="Clinic"
        accessibilityLabel="Clinic"
        containerStyle={styles.field}
      />
      <TextField
        value={fields.vetName}
        onChangeText={(t) => onChangeField('vetName', t)}
        placeholder="Vet"
        accessibilityLabel="Vet"
        containerStyle={styles.field}
      />
      <TextField
        value={fields.reason}
        onChangeText={(t) => onChangeField('reason', t)}
        placeholder="What it was for"
        accessibilityLabel="What the visit was for"
        containerStyle={styles.field}
      />

      <SectionLabel label="What the vet said" style={styles.label} />
      <TextInput
        style={styles.notes}
        value={fields.notes}
        onChangeText={(t) => onChangeField('notes', t)}
        multiline
        textAlignVertical="top"
        placeholder="Anything worth remembering."
        placeholderTextColor={theme.colorTextTertiary}
        accessibilityLabel={`Notes from ${petName}’s visit`}
      />

      <PrimaryButton label="Save changes" onPress={onSave} loading={saving} style={styles.save} />
    </View>
  );
}

const styles = StyleSheet.create({
  pageTitle: {
    fontSize: theme.textXL,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    letterSpacing: theme.trackingTight,
  },
  pageSub: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    marginTop: 2,
  },
  label: {
    marginTop: theme.space3,
    marginBottom: theme.space1,
  },
  field: {
    marginBottom: theme.space1,
  },
  valueRow: {
    minHeight: 48,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusSmall,
    paddingHorizontal: theme.space2,
  },
  valueText: {
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
  },
  dateNote: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    marginTop: theme.space1,
  },
  notes: {
    // The C-2 carve-out: a TextInput is outside ThemedText's reach.
    fontFamily: theme.fontBody,
    fontSize: theme.textMD,
    lineHeight: 22,
    color: theme.colorTextPrimary,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusMedium,
    backgroundColor: theme.colorSurface,
    paddingHorizontal: theme.space2,
    paddingVertical: theme.space2,
    minHeight: 140,
  },
  save: {
    marginTop: theme.space4,
  },
});
