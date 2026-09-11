import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../../constants/theme';
import { PrimaryButton } from '../ui/PrimaryButton';
import { TextField } from '../ui/TextField';
import { ThemedText } from '../ui/ThemedText';
import { QUESTION_LIST_MAX, QUESTION_MAX_LENGTH } from '../../lib/vetVisits';

// The one-line question sheet (CUL-903 VV-5; mock B1's "+ Add a question").
//
// ── IT LIVES ON GET READY, NOT ON HOME ───────────────────────────────────────────
// The Home strip's *Add a question* is a DOOR that opens this screen with the sheet
// up. That is the PM's 2026-09-11 ruling in mechanical form: Home may carry a
// confirmation and may not carry a form (`docs/nyx-med-strip-requirements.md` §0.1,
// D1's second-door clause). The typing happens here, beside the questions already
// asked, which is also where mock B1 puts it.
//
// ── THE BOUND IS ENFORCED WHERE THE OWNER CAN SEE IT ─────────────────────────────
// `lib/sync.ts`'s `parseQuestionsForPush` refuses a list too large for migration
// 066's CHECK, because a `23514` is terminal and would quarantine the whole
// appointment — the scheduled time and the in-room draft with it. Its header says
// what was missing: *"a silent drop there is a backstop, never the UX."* So the list
// cap is stated on this sheet when it is reached, and the per-question cap is a
// `maxLength` the keyboard simply stops at.

interface Props {
  visible: boolean;
  petName: string;
  /** How many questions are already on the appointment — the cap is stated, not hidden. */
  existingCount: number;
  onClose: () => void;
  onSubmit: (text: string) => Promise<void>;
}

export function AddQuestionSheet({ visible, petName, existingCount, onClose, onSubmit }: Props) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  // A re-open starts blank. Left alone, a dismissed half-typed question would
  // reappear under the next tap as if it had been saved.
  useEffect(() => {
    if (visible) {
      setText('');
      setSaving(false);
    }
  }, [visible]);

  const full = existingCount >= QUESTION_LIST_MAX;
  const trimmed = text.trim();

  const submit = async () => {
    if (saving || trimmed.length === 0 || full) return;
    setSaving(true);
    try {
      await onSubmit(trimmed);
      onClose();
    } catch {
      // Caught here, not swallowed upstream: the parent surfaces the error (it is the
      // one that knows the save failed) and this sheet's job is to STAY OPEN over the
      // owner's typing, which is the only place the question can be recovered from.
      // Without the catch the rejection escapes an `onPress` handler as an unhandled
      // promise — same behaviour, plus a red box in dev and a warning in production.
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
        <View
          style={[styles.sheet, { paddingBottom: insets.bottom + theme.space2 }]}
          accessibilityViewIsModal
        >
          <View style={styles.grabber} />
          <ThemedText style={styles.title}>Ask the vet</ThemedText>
          <ThemedText style={styles.subtitle}>
            You’ll see it at the visit, as something to tick off.
          </ThemedText>

          {full ? (
            <ThemedText style={styles.full}>
              You’ve got {QUESTION_LIST_MAX} questions saved — remove one to add another.
            </ThemedText>
          ) : (
            <TextField
              value={text}
              onChangeText={setText}
              label="Your question"
              placeholder="Should I be worried about the weight?"
              maxLength={QUESTION_MAX_LENGTH}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={submit}
              containerStyle={styles.field}
              testID="add-question-field"
            />
          )}

          <PrimaryButton
            label="Save the question"
            onPress={submit}
            loading={saving}
            disabled={full || trimmed.length === 0}
            style={styles.save}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: theme.colorScrim },
  sheet: {
    backgroundColor: theme.colorSurface,
    borderTopLeftRadius: theme.radiusLarge,
    borderTopRightRadius: theme.radiusLarge,
    paddingTop: 10,
    paddingHorizontal: theme.space3,
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: theme.radiusFull,
    backgroundColor: theme.colorBorderStrong,
    alignSelf: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: theme.textLG,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    letterSpacing: theme.trackingTight,
  },
  subtitle: {
    fontSize: theme.textSM,
    color: theme.colorTextTertiary,
    marginTop: 2,
  },
  field: { marginTop: theme.space2 },
  full: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextSecondary,
    marginTop: theme.space2,
  },
  save: { marginTop: theme.space2 },
});
