// A look's record — the words, and the note (CUL-869 / N-3).
//
// docs/nyx-daily-look-requirements.md §5.4, §5.5, §5.6, T-22. The record screen's
// `check_in` branch, extracted rather than inlined because `app/event/[id].tsx` is
// already 1,300 lines and because this is the one surface T-22 puts the note editor
// on — which makes it worth testing on its own.
//
// ── WHAT THIS SCREEN MAY SAY, AND WHAT IT MAY NOT ────────────────────────────
//
// It names the owner's ACT and the words she chose, and it stops there. There is no
// verdict, no count, no "since", no comparison with her usual — a look enters no
// engine and no count (T-5), and a record screen that started summarising would be
// the first surface to break that.
//
// The observed-absence row is the sharp edge. It renders as *You marked nothing
// unusual* — the owner's claim, in her voice, about what she looked for — and never
// as a good day, a quiet day, or anything else that describes the PET (§5.6: a run
// of quiet days is the one thing no surface may count aloud). A look with no child
// row on this device renders no outcome line at all rather than falling through to
// that phrase; `describeLook` returns `kind: 'unknown'` for exactly that reason.
//
// ── THE NOTE ─────────────────────────────────────────────────────────────────
//
// The note is `looks.notes` and nothing else. The parent's `notes` is NULL by CHECK
// for a `check_in` (migration 064), because Ask's recall fetch selects
// `events.notes` with no type filter — so a note on the parent would reach a model
// before D10 is ruled. That is also why the cue under the field says where it goes:
// it is the owner's free text about her own animal, and she should not have to guess.
//
// The field is offered only when the child row is actually here. Offering an editor
// that writes to a row this device does not have would be a control that silently
// does nothing — the C-7 defect, in its worst direction.

import { useState } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { theme } from '../../constants/theme';
import { ThemedText } from '../ui/ThemedText';
import { SectionLabel } from '../ui/SectionLabel';
import { updateLookNote } from '../../lib/looks';
import { syncPendingLooks } from '../../lib/sync';
import { unnamedWordsLine, type DescribedLook } from '../../lib/lookDisplay';

/** The shipped notes cap, the same 300 the log screen, the confirm sheet and the
 *  event editor all use. Named here rather than repeated as a literal so the look's
 *  two note surfaces (this one and the editor) cannot drift apart. */
export const LOOK_NOTE_MAX = 300;

export const LOOK_NOTE_PLACEHOLDER = 'Say more — what did you see?';

/** Where the note goes, said where the owner writes it (T&S). Both halves are
 *  facts about the note specifically: it is the free text that reaches the report
 *  she builds, and a shared link never carries it unless she says so. */
export const LOOK_NOTE_CUE =
  'Printed on the vet report you make · never on a shared link unless you choose it';

export const LOOK_ABSENCE_LINE = 'You marked nothing unusual.';

interface Props {
  eventId: string;
  look: DescribedLook;
  /** Fired after a successful write with the note as it now stands, so the screen
   *  that owns the row can keep its copy in step without a re-read. */
  onNoteChange: (note: string | null) => void;
}

export function LookRecordSection({ eventId, look, onNoteChange }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(look.note ?? '');
  const [saving, setSaving] = useState(false);

  const unnamed = unnamedWordsLine(look.unnamed);
  // No child row on this device — there is nothing to name and nothing to write to.
  const hasChild = look.kind !== 'unknown';

  async function persist(next: string | null) {
    setSaving(true);
    try {
      await updateLookNote(eventId, next);
      onNoteChange(next);
      setEditing(false);
      // The child only; the parent event is untouched by a note edit. The drain
      // gates on the parent being synced, so a note written before its look has
      // ever reached the server simply waits for that push rather than racing it.
      syncPendingLooks().catch((e) => console.error('[look-record] note push failed:', e));
    } catch (e) {
      console.error('[look-record] note save failed:', e);
      Alert.alert('Could not save', 'Try again in a moment.');
    } finally {
      setSaving(false);
    }
  }

  function handleRemoveNote() {
    // C-21 — a destructive action carries exactly one safety net, and a note has no
    // way back: nothing in the app surfaces a removed note, and the owner's own
    // words are not recreatable from the record the way a re-logged event is. So it
    // confirms, and the body says what SURVIVES as well as what goes — the fear
    // this dialog has to answer is "am I about to delete what I noticed?".
    Alert.alert(
      'Remove this note?',
      'The note you wrote will be gone. What you noticed stays.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => { void persist(null); } },
      ],
    );
  }

  return (
    <View style={styles.section}>
      {look.kind === 'observed' && look.words.length > 0 ? (
        <View style={styles.words}>
          {look.words.map((word) => (
            <View key={word.key} style={styles.wordRow}>
              {/* The head word in the display face — the same Newsreader the Signal
                  headline uses, and it earns it for the same reason: this is the one
                  line on the screen that has to be read rather than scanned. Never a
                  fontWeight beside it; only the 400 face is loaded. */}
              <ThemedText style={styles.wordHead}>{word.head}</ThemedText>
              {/* The gloss is never dropped (§4.1 rule 12) — "Lip-licking" alone lost
                  the findable half, which on a record an owner shows a vet is exactly
                  the half that matters. */}
              {word.gloss ? (
                <ThemedText style={styles.wordGloss}>{word.gloss}</ThemedText>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      {look.kind === 'absence' ? (
        <ThemedText style={styles.absence}>{LOOK_ABSENCE_LINE}</ThemedText>
      ) : null}

      {unnamed ? <ThemedText style={styles.unnamed}>{unnamed}</ThemedText> : null}

      {hasChild ? (
        <>
          <SectionLabel label="Note" style={styles.noteLabel} />
          {editing ? (
            <>
              <TextInput
                style={styles.noteInput}
                value={draft}
                onChangeText={setDraft}
                placeholder={LOOK_NOTE_PLACEHOLDER}
                placeholderTextColor={theme.colorTextTertiary}
                multiline
                maxLength={LOOK_NOTE_MAX}
                autoFocus
                editable={!saving}
                accessibilityLabel="Note"
              />
              <View style={styles.noteActions}>
                <TouchableOpacity
                  onPress={() => { setDraft(look.note ?? ''); setEditing(false); }}
                  hitSlop={HITSLOP_LEFT}
                  disabled={saving}
                  accessibilityRole="button"
                >
                  <ThemedText style={styles.noteActionText}>Cancel</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { void persist(draft.trim() || null); }}
                  hitSlop={HITSLOP_RIGHT}
                  disabled={saving}
                  accessibilityRole="button"
                >
                  <ThemedText style={styles.noteActionText}>Save</ThemedText>
                </TouchableOpacity>
              </View>
            </>
          ) : look.note ? (
            <>
              <ThemedText style={styles.noteBody}>{look.note}</ThemedText>
              <View style={styles.noteActions}>
                <TouchableOpacity
                  onPress={() => { setDraft(look.note ?? ''); setEditing(true); }}
                  hitSlop={HITSLOP_LEFT}
                  accessibilityRole="button"
                >
                  <ThemedText style={styles.noteActionText}>Edit</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleRemoveNote}
                  hitSlop={HITSLOP_RIGHT}
                  accessibilityRole="button"
                >
                  <ThemedText style={styles.noteRemoveText}>Remove</ThemedText>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <TouchableOpacity
              style={styles.addNoteRow}
              onPress={() => { setDraft(''); setEditing(true); }}
              accessibilityRole="button"
            >
              <ThemedText style={styles.noteActionText}>Add a note</ThemedText>
            </TouchableOpacity>
          )}
          <ThemedText style={styles.noteCue}>{LOOK_NOTE_CUE}</ThemedText>
        </>
      ) : null}
    </View>
  );
}

// C-5 — the two note controls sit in one row, so their facing hitSlops must not
// meet in the gap between them. Asymmetric rather than a wider row: the pair reads
// as one action group and pushing them apart to clear the slop would break that.
const HITSLOP_LEFT = { top: 8, bottom: 8, left: 8, right: 2 };
const HITSLOP_RIGHT = { top: 8, bottom: 8, left: 2, right: 8 };

const styles = StyleSheet.create({
  section: {
    marginTop: theme.space3,
  },
  words: {
    gap: theme.space2,
  },
  wordRow: {
    gap: 2,
  },
  wordHead: {
    fontFamily: theme.fontDisplay,
    fontSize: theme.textLG,
    lineHeight: theme.textLG * 1.3,
    letterSpacing: -0.2,
    color: theme.colorTextPrimary,
  },
  wordGloss: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightBody,
  },
  absence: {
    fontFamily: theme.fontDisplay,
    fontSize: theme.textLG,
    lineHeight: theme.textLG * 1.3,
    letterSpacing: -0.2,
    color: theme.colorTextPrimary,
  },
  unnamed: {
    marginTop: theme.space2,
    fontSize: theme.textSM,
    color: theme.colorTextTertiary,
  },
  noteLabel: {
    marginTop: theme.space3,
    marginBottom: 4,
  },
  noteBody: {
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
    lineHeight: theme.lineHeightBody,
  },
  noteInput: {
    fontFamily: theme.fontBody,
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
    lineHeight: theme.lineHeightBody,
    backgroundColor: theme.colorSurface,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusSmall,
    padding: theme.space2,
    minHeight: 76,
    textAlignVertical: 'top',
  },
  noteActions: {
    flexDirection: 'row',
    gap: theme.space3,
    marginTop: theme.space1,
    // The row's own floor: the labels are ~18px, so the box carries the 44pt target
    // rather than leaving it to hitSlop alone (C-5 — pin the geometry the floor
    // depends on).
    minHeight: 44,
    alignItems: 'center',
  },
  addNoteRow: {
    minHeight: 44,
    justifyContent: 'center',
  },
  noteActionText: {
    fontSize: theme.textSM,
    color: theme.colorAccentInk,
    fontWeight: theme.fontWeightMedium,
  },
  noteRemoveText: {
    fontSize: theme.textSM,
    color: theme.colorEventSymptomInk,
  },
  noteCue: {
    marginTop: theme.space1,
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    lineHeight: theme.textXS * 1.4,
  },
});
