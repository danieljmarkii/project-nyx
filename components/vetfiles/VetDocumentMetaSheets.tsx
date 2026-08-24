import { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Check } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { ChipGroup, type ChipGroupOption } from '../ui/ChipGroup';
import { PrimaryButton } from '../ui/PrimaryButton';
import { TextField } from '../ui/TextField';
import { SheetShell } from './SheetShell';
import { VET_DOCUMENT_KINDS, type VetDocumentKind } from '../../lib/vetDocuments';
import { VET_DOCUMENT_KIND_LABELS } from '../../lib/vetDocumentLibrary';
import { dayKeyToLocalDate, toLocalDayKey } from '../../lib/utils';
import { ThemedText } from '../ui/ThemedText';

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
  /**
   * B-588 — the filename this document arrived with, shown in the sheet so the
   * owner can tell WHICH document they opened. It is the one disambiguator B-546
   * put on the library row, and this sheet was the single Vet Files surface that
   * withheld it: two untitled PDFs from one portal produce a byte-identical sheet
   * (same title, same generic examples, same empty field), so an owner who taps
   * Name on the second has no way to confirm it is the second. A PDF has no
   * thumbnail (D5), so the filename is the only cue that survives the case this
   * exists for. Null on a document that arrived without one (a camera capture) —
   * those rows are already told apart by their thumbnail, so the sheet stays as it
   * was. Purely informational: the owner still types their own name, so `title IS
   * NULL` keeps meaning "nobody named this".
   */
  fileLabel?: string | null;
  onCancel: () => void;
  onSave: (title: string) => void;
  saving?: boolean;
}

export function NameDocumentSheet({
  visible, initialTitle, untitled, fileLabel, onCancel, onSave, saving,
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
      {/* Which document this is (B-588). Middle-truncated for the same reason the
          library row is: head-truncation eats the extension and tail-truncation
          eats the distinguishing stem, and this string exists to separate
          "CBC-Pixel-…" from "Chem-Pixel-…". Sits above the field as context, not as
          the value — the owner types their own name below it.

          The "File name" lead-in is pm-feature-review's catch: a rounded box of
          text directly above an empty input is the exact idiom for a prefilled
          value or a tappable chip, and this is neither. The label turns "what's
          this grey thing?" into a statement. Spoken as one labelled node so
          VoiceOver reaches "File name, CBC-…" rather than an unpronounceable raw
          filename mid-sheet — the same care the library row takes by voicing the
          filename last. */}
      {fileLabel ? (
        <View style={styles.nameFileTag} accessible accessibilityLabel={`File name, ${fileLabel}`}>
          <ThemedText style={styles.nameFileTagLabel}>File name</ThemedText>
          <ThemedText style={styles.nameFileTagValue} numberOfLines={1} ellipsizeMode="middle">
            {fileLabel}
          </ThemedText>
        </View>
      ) : null}
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
  // A previous selection's write is in flight. Dims the chips and blocks a second
  // tap (B-555) — the ChipGroup busy state that replaces the caller's hand-rolled
  // re-entrancy guard.
  busy?: boolean;
}

// §4.5: a closed single-select set → ChipGroup, wrapping, every option on screen
// (B-146). Ordered by continuity-of-care value, never alphabetically — a specialist
// asks for bloodwork first, so `lab_result` is the first thing a thumb reaches.
const KIND_OPTIONS: ChipGroupOption[] = VET_DOCUMENT_KINDS.map((kind) => ({
  value: kind,
  label: VET_DOCUMENT_KIND_LABELS[kind],
}));

export function DocumentKindSheet({ visible, current, onCancel, onSelect, busy }: KindProps) {
  return (
    <SheetShell visible={visible} onClose={onCancel} title="What kind of document is this?">
      <ScrollView bounces={false} style={styles.kindScroll}>
        <ChipGroup
          options={KIND_OPTIONS}
          value={current}
          disabled={busy}
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

interface NotesProps {
  visible: boolean;
  initialNotes: string;
  onCancel: () => void;
  onSave: (notes: string) => void;
  saving?: boolean;
}

// The Notes row's editor (VF-4, mock E-img-r2 "Add a note").
//
// Multiline and deliberately unstructured: this is where an owner writes "the one
// Dr. Chen wanted before the recheck" or "second page is the referral". No prompts,
// no template, no character counter — a note nobody is required to write does not
// get a word budget.
//
// Clearing the field is a supported action, not a mistake: an emptied note goes
// back to NULL and the row returns to its "Add a note" placeholder (see
// setVetDocumentNotes).
export function DocumentNotesSheet({
  visible, initialNotes, onCancel, onSave, saving,
}: NotesProps) {
  const [value, setValue] = useState(initialNotes);

  useEffect(() => {
    if (visible) setValue(initialNotes);
  }, [visible, initialNotes]);

  return (
    <SheetShell
      visible={visible}
      onClose={onCancel}
      // "Add" is an invitation; on a note that already exists it would read as a
      // second note being started.
      title={initialNotes ? 'Note' : 'Add a note'}
      subtitle="Anything you’ll want with this document later — what it’s for, what the vet said."
    >
      {/* A raw TextInput rather than TextField: that primitive is deliberately
          single-line ("the shared single-line text input"), and widening a shared
          component from inside one feature's PR is how primitives drift. If a
          second multiline caller appears, promote it then. */}
      <TextInput
        style={styles.notesInput}
        value={value}
        onChangeText={setValue}
        placeholder="Bloodwork Dr. Chen asked for before the recheck"
        placeholderTextColor={theme.colorTextDisabled}
        accessibilityLabel="Document notes"
        autoFocus
        multiline
        maxLength={600}
        // No returnKeyType/onSubmitEditing: return inserts a newline in a
        // multiline field, so Save is the only commit.
      />
      <PrimaryButton label="Save" onPress={() => onSave(value)} loading={saving} />
    </SheetShell>
  );
}

interface DateProps {
  visible: boolean;
  /** Current document_date as 'YYYY-MM-DD', or null when the row carries none. */
  initialDate: string | null;
  onCancel: () => void;
  onSave: (date: string) => void;
}

// The Doc date row's editor.
//
// `document_date` is the date ON the paper (§5.1) — a calendar day with no time and
// no zone — so this reads and writes 'YYYY-MM-DD' through local Date components at
// both ends. A UTC round-trip (`toISOString().slice(0,10)`) would file a document
// under the wrong day for every owner west of Greenwich, which is the same trap
// formatVetDocumentDate hand-parses to avoid on the read side.
//
// Capped at today. A document dated in the future is almost always a mis-scrolled
// year, and the cost of that slip is asymmetric: the document sorts above
// everything else in the library permanently, and the owner has no reason to
// suspect the date is why. The genuine forward-looking date on a certificate is its
// *expiry*, which is not this column.
export function DocumentDateSheet({ visible, initialDate, onCancel, onSave }: DateProps) {
  const [value, setValue] = useState<Date>(() => dayKeyToLocalDate(initialDate ?? '') ?? new Date());

  useEffect(() => {
    if (visible) setValue(dayKeyToLocalDate(initialDate ?? '') ?? new Date());
  }, [visible, initialDate]);

  return (
    <SheetShell
      visible={visible}
      onClose={onCancel}
      title="Date on this document"
      subtitle="Not when you saved it — the date printed on the paper."
    >
      <DateTimePicker
        value={value}
        mode="date"
        display={Platform.OS === 'ios' ? 'inline' : 'default'}
        maximumDate={new Date()}
        onChange={(_e, date) => {
          if (!date) return;
          setValue(date);
          // Android's dialog IS the commit — it dismisses itself on pick, so a
          // Save button below it would be a second confirmation of a decision the
          // owner has already made and can no longer see.
          if (Platform.OS === 'android') onSave(toLocalDayKey(date));
        }}
      />
      {Platform.OS === 'ios' && (
        <PrimaryButton label="Save" onPress={() => onSave(toLocalDayKey(value))} />
      )}
    </SheetShell>
  );
}

export interface VisitChoice {
  id: string;
  label: string;
}

interface VisitProps {
  visible: boolean;
  visits: VisitChoice[];
  /** Currently linked visit, or null. */
  current: string | null;
  petName: string;
  onCancel: () => void;
  onSelect: (visitId: string | null) => void;
}

// The visit-link picker (D7, mock E-pdf-r2).
//
// This sheet is only ever REACHED when the pet has at least one logged visit — the
// row that opens it doesn't render otherwise (round-2 ruling: visits have no browse
// surface yet, so an empty picker reads as broken software). It therefore has no
// empty state, and that absence is intentional rather than an oversight.
//
// **Nothing here creates a visit.** There is no "log a new visit" affordance on
// this sheet, and there must never be one: D7 forbids the upload direction entirely
// because the vet report's scope cascade keys its first rung off
// `vet_visits.visited_at`. A document may point at a visit that already happened;
// it may never assert that one did.
//
// A ScrollView of plain rows rather than a ChipGroup: visit labels are long
// ("Jul 14 — Lakeview Animal Clinic"), the set grows without bound, and the house
// lens rule sends exactly that shape to a sheet of rows.
export function DocumentVisitSheet({
  visible, visits, current, petName, onCancel, onSelect,
}: VisitProps) {
  return (
    <SheetShell
      visible={visible}
      onClose={onCancel}
      title="Link a vet visit"
      subtitle={`Files this document with one of ${petName}’s logged visits. It doesn’t change the visit.`}
    >
      <ScrollView bounces={false} style={styles.visitScroll}>
        {visits.map((visit) => (
          <TouchableOpacity
            key={visit.id}
            style={styles.visitRow}
            onPress={() => onSelect(visit.id)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityState={{ selected: visit.id === current }}
          >
            <ThemedText
              style={[styles.visitLabel, visit.id === current && styles.visitLabelOn]}
              numberOfLines={2}
            >
              {visit.label}
            </ThemedText>
            {visit.id === current && <Check size={17} color={theme.colorAccentInk} strokeWidth={2.5} />}
          </TouchableOpacity>
        ))}

        {current != null && (
          <TouchableOpacity
            style={styles.visitRow}
            onPress={() => onSelect(null)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Remove the visit link"
          >
            <ThemedText style={styles.visitClear}>Remove the link</ThemedText>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SheetShell>
  );
}

const styles = StyleSheet.create({
  field: {
    marginTop: theme.space2,
    marginBottom: theme.space2,
  },
  // The "which document" identifier (B-588): a quiet full-width tag, so a long
  // filename truncates in the middle rather than growing the sheet. Subordinate to
  // the field it sits above — it is context, not the thing being edited. A row of
  // [label][value] so the label carries the "this is a filename" meaning and the
  // value keeps the room it needs to middle-truncate.
  nameFileTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
    marginTop: theme.space2,
    paddingHorizontal: theme.space2,
    paddingVertical: theme.space1,
    borderRadius: theme.radiusSmall,
    backgroundColor: theme.colorSurfaceSubtle,
  },
  nameFileTagLabel: {
    fontSize: theme.textXS,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextTertiary,
  },
  nameFileTagValue: {
    flex: 1,
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
  },
  kindScroll: {
    flexGrow: 0,
    marginTop: theme.space2,
  },
  notesInput: {
    height: 108,
    marginTop: theme.space2,
    marginBottom: theme.space2,
    paddingHorizontal: theme.space2,
    paddingTop: theme.space1,
    paddingBottom: theme.space1,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusSmall,
    backgroundColor: theme.colorSurface,
    // A TextInput is outside ThemedText's reach (the wrapper wraps Text), so the
    // field names its face directly — otherwise a swept screen keeps SF inputs.
    fontFamily: theme.fontBody,
    fontSize: theme.textMD,
    lineHeight: theme.lineHeightBody,
    color: theme.colorTextPrimary,
    textAlignVertical: 'top',
  },
  visitScroll: {
    flexGrow: 0,
    marginTop: theme.space1,
  },
  visitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
    paddingVertical: 13,
    minHeight: 44,
    borderBottomWidth: 1,
    borderBottomColor: theme.colorBorder,
  },
  visitLabel: {
    flex: 1,
    fontSize: theme.textMD,
    lineHeight: theme.lineHeightBody,
    color: theme.colorTextPrimary,
  },
  visitLabelOn: {
    fontWeight: theme.weightSemibold,
    color: theme.colorAccentInk,
  },
  visitClear: {
    flex: 1,
    fontSize: theme.textMD,
    color: theme.colorTextTertiary,
  },
});
