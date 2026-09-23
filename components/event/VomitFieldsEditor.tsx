// Owner editor for the vomit structured fields (B-028). The n=1 read is NOT
// editable here (it's dismissible elsewhere) — only the descriptive/clinical
// facts that feed the vet report. Freely editable: tap an active chip to clear,
// tap another to change, type a note. Emits the full draft on Save; the parent
// decides whether anything actually changed and owns the write + provenance.
import { useState } from 'react';
import { View, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { theme } from '../../constants/theme';
import { WhorlSpinner } from '../brand/WhorlSpinner';
import { ChipGroup } from '../ui/ChipGroup';
import { MultiChipGroup } from '../ui/MultiChipGroup';
import { VomitEditableFields } from '../../lib/analysis';
import {
  VomitFieldOption,
  COLOUR_OPTIONS,
  CONTENT_OPTIONS,
  CONSISTENCY_OPTIONS,
  BLOOD_OPTIONS,
  TRISTATE_OPTIONS,
} from './vomitFields';
import { ThemedText } from '../ui/ThemedText';

interface Props {
  initial: VomitEditableFields;
  saving: boolean;
  onSave: (next: VomitEditableFields) => void;
  onCancel: () => void;
}

export function VomitFieldsEditor({ initial, saving, onSave, onCancel }: Props) {
  const [draft, setDraft] = useState<VomitEditableFields>(initial);

  const set = <K extends keyof VomitEditableFields>(key: K, value: VomitEditableFields[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  // Single-select enum: tap the active chip to clear back to null (freely
  // editable — the owner can remove a value the AI guessed). ChipGroup's default
  // `allowDeselect` hands back that null itself, so this only routes the value.
  const pickOne = <K extends keyof VomitEditableFields>(key: K) =>
    (next: string | null) => set(key, next as VomitEditableFields[K]);

  const toggleContent = (value: string) => {
    const cur = draft.contents ?? [];
    const next = cur.includes(value) ? cur.filter((c) => c !== value) : [...cur, value];
    set('contents', next.length > 0 ? next : null);
  };

  return (
    <View style={styles.wrap}>
      <ThemedText style={styles.intro}>Correct anything that doesn't look right.</ThemedText>

      <EnumRow
        label="Colour"
        options={COLOUR_OPTIONS}
        value={draft.colour}
        onChange={pickOne('colour')}
      />
      <EnumRow
        label="Consistency"
        options={CONSISTENCY_OPTIONS}
        value={draft.consistency}
        onChange={pickOne('consistency')}
      />

      <View style={styles.field}>
        <ThemedText style={styles.fieldLabel}>Contents</ThemedText>
        <MultiChipGroup
          options={CONTENT_OPTIONS}
          values={draft.contents ?? []}
          onToggle={toggleContent}
          accessibilityLabel="Contents"
        />
      </View>

      <EnumRow
        label="Blood"
        options={BLOOD_OPTIONS}
        value={draft.blood_present}
        onChange={pickOne('blood_present')}
      />
      <EnumRow
        label="Foreign material"
        options={TRISTATE_OPTIONS}
        value={draft.foreign_material_present}
        onChange={pickOne('foreign_material_present')}
      />

      {/* The note is only meaningful when foreign material is present. */}
      {draft.foreign_material_present === 'yes' ? (
        <View style={styles.field}>
          <ThemedText style={styles.fieldLabel}>What was it?</ThemedText>
          <TextInput
            style={styles.textInput}
            placeholder="e.g. a strand of thread"
            placeholderTextColor={theme.colorTextTertiary}
            value={draft.foreign_material_note ?? ''}
            onChangeText={(t) => set('foreign_material_note', t)}
            maxLength={140}
          />
        </View>
      ) : null}

      <View style={styles.field}>
        <ThemedText style={styles.fieldLabel}>Description</ThemedText>
        <TextInput
          style={[styles.textInput, styles.textArea]}
          placeholder="What it looked like (optional)"
          placeholderTextColor={theme.colorTextTertiary}
          value={draft.description ?? ''}
          onChangeText={(t) => set('description', t)}
          multiline
          maxLength={300}
          textAlignVertical="top"
        />
      </View>

      <View style={styles.actions}>
        <TouchableOpacity onPress={onCancel} hitSlop={12} disabled={saving} style={styles.cancelBtn}>
          <ThemedText style={styles.cancelText}>Cancel</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onSave(draft)}
          disabled={saving}
          activeOpacity={0.85}
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
        >
          {saving ? (
            <WhorlSpinner size="sm" tint={theme.colorTextOnDark} />
          ) : (
            <ThemedText style={styles.saveText}>Save</ThemedText>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// A labelled closed-set single-select, on the shared ChipGroup (CUL-154): it wraps,
// announces as a radio group named for its field, and spaces its rows so a chip's
// vertical hitSlop never overlaps the row below. The hand-rolled row it replaced
// did none of the last two.
function EnumRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: VomitFieldOption[];
  value: string | null;
  onChange: (next: string | null) => void;
}) {
  return (
    <View style={styles.field}>
      <ThemedText style={styles.fieldLabel}>{label}</ThemedText>
      <ChipGroup options={options} value={value} onChange={onChange} accessibilityLabel={label} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: theme.space2,
    gap: theme.space2,
  },
  intro: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightSM,
  },
  field: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: theme.textSM,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorTextSecondary,
  },
  textInput: {
    // A TextInput is outside ThemedText's reach (the wrapper wraps Text), so the
    // field names its face directly — otherwise a swept screen keeps SF inputs.
    fontFamily: theme.fontBody,
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusSmall,
    paddingHorizontal: theme.space2,
    paddingVertical: theme.space1,
    minHeight: 44,
  },
  textArea: {
    minHeight: 72,
    maxHeight: 140,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: theme.space2,
    marginTop: theme.space1,
  },
  cancelBtn: {
    paddingVertical: theme.space1,
    paddingHorizontal: theme.space1,
  },
  cancelText: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    fontWeight: theme.fontWeightMedium,
  },
  saveBtn: {
    backgroundColor: theme.colorNeutralDark,
    borderRadius: theme.radiusSmall,
    paddingVertical: theme.space1,
    paddingHorizontal: theme.space3,
    minHeight: 44,
    minWidth: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.5,
  },
  saveText: {
    fontSize: theme.textMD,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorTextOnDark,
  },
});
