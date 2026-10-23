// Owner editor for the stool structured fields (B-247 PR 6, sibling of
// VomitFieldsEditor). The n=1 read is NOT editable here (it's dismissible
// elsewhere) — only the descriptive/clinical facts that feed the vet report.
// Freely editable: tap an active chip to clear, tap another to change, type a
// note. Emits the full draft on Save; the parent decides whether anything
// actually changed and owns the write + provenance.
import { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { theme } from '../../constants/theme';
import { ChipGroup } from '../ui/ChipGroup';
import { MultiChipGroup } from '../ui/MultiChipGroup';
import { StoolEditableFields } from '../../lib/analysis';
import {
  StoolFieldOption,
  CONSISTENCY_OPTIONS,
  COLOUR_OPTIONS,
  CONTENT_OPTIONS,
  BLOOD_PRESENT_OPTIONS,
  BLOOD_TYPE_OPTIONS,
  MUCUS_OPTIONS,
  TRISTATE_OPTIONS,
} from './stoolFields';
import { ThemedText } from '../ui/ThemedText';
import { PrimaryButton } from '../ui/PrimaryButton';
import { TextField } from '../ui/TextField';

interface Props {
  initial: StoolEditableFields;
  saving: boolean;
  onSave: (next: StoolEditableFields) => void;
  onCancel: () => void;
}

export function StoolFieldsEditor({ initial, saving, onSave, onCancel }: Props) {
  const [draft, setDraft] = useState<StoolEditableFields>(initial);

  const set = <K extends keyof StoolEditableFields>(key: K, value: StoolEditableFields[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  // Single-select enum: tap the active chip to clear back to null (freely
  // editable — the owner can remove a value the AI guessed). ChipGroup's default
  // `allowDeselect` hands back that null itself, so this only routes the value.
  const pickOne = <K extends keyof StoolEditableFields>(key: K) =>
    (next: string | null) => set(key, next as StoolEditableFields[K]);

  // Blood presence controls whether the fresh/tarry type is meaningful — clearing
  // or changing it away from "Present" drops the type, mirroring the server rule
  // (a "None visible" correction must never leave an orphan "Dark / tarry").
  const pickBloodPresent = (next: string | null) => {
    setDraft((d) => ({
      ...d,
      stool_blood_present: next,
      stool_blood_type: next === 'yes' ? d.stool_blood_type : null,
    }));
  };

  const toggleContent = (value: string) => {
    const cur = draft.stool_content ?? [];
    const next = cur.includes(value) ? cur.filter((c) => c !== value) : [...cur, value];
    set('stool_content', next.length > 0 ? next : null);
  };

  return (
    <View style={styles.wrap}>
      <ThemedText style={styles.intro}>Correct anything that doesn't look right.</ThemedText>

      <EnumRow
        label="Consistency"
        options={CONSISTENCY_OPTIONS}
        value={draft.stool_consistency}
        onChange={pickOne('stool_consistency')}
      />
      <EnumRow
        label="Colour"
        options={COLOUR_OPTIONS}
        value={draft.stool_colour}
        onChange={pickOne('stool_colour')}
      />

      <View style={styles.field}>
        <ThemedText style={styles.fieldLabel}>Contents</ThemedText>
        <MultiChipGroup
          options={CONTENT_OPTIONS}
          values={draft.stool_content ?? []}
          onToggle={toggleContent}
          accessibilityLabel="Contents"
        />
      </View>

      <EnumRow
        label="Blood"
        options={BLOOD_PRESENT_OPTIONS}
        value={draft.stool_blood_present}
        onChange={pickBloodPresent}
      />
      {/* The blood type is only meaningful when blood is present. */}
      {draft.stool_blood_present === 'yes' ? (
        <EnumRow
          label="Kind of blood"
          options={BLOOD_TYPE_OPTIONS}
          value={draft.stool_blood_type}
          onChange={pickOne('stool_blood_type')}
        />
      ) : null}

      <EnumRow
        label="Mucus"
        options={MUCUS_OPTIONS}
        value={draft.stool_mucus_present}
        onChange={pickOne('stool_mucus_present')}
      />
      <EnumRow
        label="Foreign material"
        options={TRISTATE_OPTIONS}
        value={draft.foreign_material_present}
        onChange={pickOne('foreign_material_present')}
      />

      {/* The note is only meaningful when foreign material is present. */}
      {draft.foreign_material_present === 'yes' ? (
        <TextField
          label="What was it?"
          placeholder="e.g. a piece of string"
          value={draft.foreign_material_note ?? ''}
          onChangeText={(t) => set('foreign_material_note', t)}
          maxLength={140}
        />
      ) : null}

      <TextField
        label="Description"
        placeholder="What it looked like (optional)"
        value={draft.description ?? ''}
        onChangeText={(t) => set('description', t)}
        multiline
        maxLength={300}
      />

      {/* Cancel and Save on the shared button (CUL-1912). Save's wait is the button's own
          loading state; Cancel is unavailable while it runs, as before. */}
      <View style={styles.actions}>
        <PrimaryButton label="Cancel" variant="secondary" onPress={onCancel} disabled={saving} style={styles.action} />
        <PrimaryButton label="Save" onPress={() => onSave(draft)} loading={saving} style={styles.action} />
      </View>
    </View>
  );
}

// A labelled closed-set single-select on the shared ChipGroup — the same shape as
// VomitFieldsEditor's (CUL-154): a radio group named for its field, rows spaced so
// a chip's vertical hitSlop never overlaps the row below.
function EnumRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: StoolFieldOption[];
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
    gap: theme.space0_75,
  },
  fieldLabel: {
    fontSize: theme.textSM,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorTextSecondary,
  },
  actions: {
    flexDirection: 'row',
    gap: theme.space1_5,
    marginTop: theme.space1,
  },
  action: {
    flex: 1,
  },
});
