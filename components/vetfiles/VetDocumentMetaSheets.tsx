import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { theme } from '../../constants/theme';
import { ChipGroup, type ChipGroupOption } from '../ui/ChipGroup';
import { PrimaryButton } from '../ui/PrimaryButton';
import { TextField } from '../ui/TextField';
import { SheetShell } from './SheetShell';
import { VET_DOCUMENT_KINDS, type VetDocumentKind } from '../../lib/vetDocuments';
import { VET_DOCUMENT_KIND_LABELS } from '../../lib/vetDocumentLibrary';

// The two D11 recovery surfaces, reached from a library row rather than from
// capture. Both are sheets rather than screens on purpose: the mock calls the Name
// affordance "one-tap", and pushing a screen to set one field would make naming
// cost more than the capture it is recovering from.
//
// The shared chrome moved to ./SheetShell in VF-3, when the add sheet became its
// third caller.

interface NameProps {
  visible: boolean;
  /** The row's current title — the rendered default when never named. */
  initialTitle: string;
  /** True when `initialTitle` is the rendered default, not the owner's words. */
  untitled: boolean;
  onCancel: () => void;
  onSave: (title: string) => void;
  saving?: boolean;
}

export function NameDocumentSheet({
  visible, initialTitle, untitled, onCancel, onSave, saving,
}: NameProps) {
  // An untitled row opens EMPTY rather than pre-filled with "Document — Jul 26".
  // Pre-filling a placeholder makes the owner delete it before they can type, which
  // is the opposite of one-tap; the default still shows as the placeholder so the
  // fallback stays visible.
  const [value, setValue] = useState(untitled ? '' : initialTitle);

  // Re-seed when the sheet is re-opened on a different row (the component stays
  // mounted across rows).
  useEffect(() => {
    if (visible) setValue(untitled ? '' : initialTitle);
  }, [visible, initialTitle, untitled]);

  return (
    <SheetShell
      visible={visible}
      onClose={onCancel}
      title="Name this document"
      subtitle="Whatever helps you find it later — “Rabies certificate”, “Bloodwork from May”."
    >
      <TextField
        value={value}
        onChangeText={setValue}
        placeholder={initialTitle}
        accessibilityLabel="Document name"
        autoFocus
        returnKeyType="done"
        onSubmitEditing={() => onSave(value)}
        containerStyle={styles.field}
      />
      <PrimaryButton label="Save" onPress={() => onSave(value)} loading={saving} />
    </SheetShell>
  );
}

interface KindProps {
  visible: boolean;
  current: VetDocumentKind;
  onCancel: () => void;
  onSelect: (kind: VetDocumentKind) => void;
}

// §4.5: a closed single-select set → ChipGroup, wrapping, every option on screen
// (B-146). Ordered by continuity-of-care value, never alphabetically — a specialist
// asks for bloodwork first, so `lab_result` is the first thing a thumb reaches.
const KIND_OPTIONS: ChipGroupOption[] = VET_DOCUMENT_KINDS.map((kind) => ({
  value: kind,
  label: VET_DOCUMENT_KIND_LABELS[kind],
}));

export function DocumentKindSheet({ visible, current, onCancel, onSelect }: KindProps) {
  return (
    <SheetShell visible={visible} onClose={onCancel} title="What kind of document is this?">
      <ScrollView bounces={false} style={styles.kindScroll}>
        <ChipGroup
          options={KIND_OPTIONS}
          value={current}
          onChange={(next) => {
            // allowDeselect is off, so `next` is always a value — the guard is for
            // the type, not for a reachable state.
            if (next) onSelect(next as VetDocumentKind);
          }}
          accessibilityLabel="Document type"
        />
      </ScrollView>
    </SheetShell>
  );
}

const styles = StyleSheet.create({
  field: {
    marginTop: theme.space2,
    marginBottom: theme.space2,
  },
  kindScroll: {
    flexGrow: 0,
    marginTop: theme.space2,
  },
});
