// Owner editor for the vomit structured fields (B-028). The n=1 read is NOT
// editable here (it's dismissible elsewhere) — only the descriptive/clinical
// facts that feed the vet report. Freely editable: tap an active chip to clear,
// tap another to change, type a note. Emits the full draft on Save; the parent
// decides whether anything actually changed and owns the write + provenance.
import { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { theme } from '../../constants/theme';
import { WhorlSpinner } from '../brand/WhorlSpinner';
import { FilterChip } from '../ui/FilterChip';
import { VomitEditableFields } from '../../lib/analysis';
import {
  VomitFieldOption,
  COLOUR_OPTIONS,
  CONTENT_OPTIONS,
  CONSISTENCY_OPTIONS,
  BLOOD_OPTIONS,
  TRISTATE_OPTIONS,
} from './vomitFields';

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
  // editable — the owner can remove a value the AI guessed).
  const pickOne = (key: keyof VomitEditableFields, value: string) =>
    set(key, (draft[key] === value ? null : value) as VomitEditableFields[typeof key]);

  const toggleContent = (value: string) => {
    const cur = draft.contents ?? [];
    const next = cur.includes(value) ? cur.filter((c) => c !== value) : [...cur, value];
    set('contents', next.length > 0 ? next : null);
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.intro}>Correct anything that doesn't look right.</Text>

      <EnumRow
        label="Colour"
        options={COLOUR_OPTIONS}
        value={draft.colour}
        onPick={(v) => pickOne('colour', v)}
      />
      <EnumRow
        label="Consistency"
        options={CONSISTENCY_OPTIONS}
        value={draft.consistency}
        onPick={(v) => pickOne('consistency', v)}
      />

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Contents</Text>
        <View style={styles.chipRow}>
          {CONTENT_OPTIONS.map((o) => (
            <FilterChip
              key={o.value}
              label={o.label}
              active={(draft.contents ?? []).includes(o.value)}
              onPress={() => toggleContent(o.value)}
              variant="filled"
            />
          ))}
        </View>
      </View>

      <EnumRow
        label="Blood"
        options={BLOOD_OPTIONS}
        value={draft.blood_present}
        onPick={(v) => pickOne('blood_present', v)}
      />
      <EnumRow
        label="Foreign material"
        options={TRISTATE_OPTIONS}
        value={draft.foreign_material_present}
        onPick={(v) => pickOne('foreign_material_present', v)}
      />

      {/* The note is only meaningful when foreign material is present. */}
      {draft.foreign_material_present === 'yes' ? (
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>What was it?</Text>
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
        <Text style={styles.fieldLabel}>Description</Text>
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
          <Text style={styles.cancelText}>Cancel</Text>
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
            <Text style={styles.saveText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function EnumRow({
  label,
  options,
  value,
  onPick,
}: {
  label: string;
  options: VomitFieldOption[];
  value: string | null;
  onPick: (value: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.chipRow}>
        {options.map((o) => (
          <FilterChip
            key={o.value}
            label={o.label}
            active={value === o.value}
            onPress={() => onPick(o.value)}
            variant="filled"
          />
        ))}
      </View>
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
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  textInput: {
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
