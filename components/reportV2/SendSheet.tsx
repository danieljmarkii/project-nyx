import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type ViewInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colorRoles, theme } from '../../constants/theme';
import { FilterChip, PrimaryButton, SectionLabel, TextField, ThemedText } from '../ui';
import { useAppActive } from '../../hooks/useAppActive';
import { useSheetCap } from '../../hooks/useLayoutClass';
import { useSheetMotion } from '../motion/sheetMotion';
import { reducedMotionNow } from '../../store/reducedMotionStore';
import { focusAccessibility } from '../../lib/a11yFocus';
import { SendCallCard } from './SendCallCard';
import {
  EMAIL_QUESTION_MAX,
  SEND_TARGETS,
  TARGET_LABEL,
  emailBody,
  emailBodyText,
  emailSubject,
  type SendCallCard as SendCallCardModel,
  type SendDocumentChoice,
  type SendTarget,
} from '../../lib/reportSend';
import { composerDate, type ComposerLive } from '../../lib/reportComposer';

// The send sheet (Vet report v2 PR-18, CUL-2298; spec §10.3, §10.4; mock d1, d2, d5).
//
// ONE SHEET HOST WHOSE PANEL SWAPS (C-14). The targets and the email draft are two panels of one
// Modal, crossfaded in place; nothing here ever presents a second Modal. Choosing a target does
// not run it: the sheet records the choice, asks the screen to close it, and hands the choice
// over from `onExited`, after the Modal has gone. Mail, Print and the share sheet therefore never
// present over a sheet that is still up.
//
// THE CALL CARD IS IN THE FIRST FRAME. The screen reads the live flags BEFORE it sets `visible`
// (Send shows its loading state meanwhile), so the card is laid out with the sheet's first frame,
// never patched in. Focus lands on it once the sheet is up; it has no pulse and no haptic. A
// failed read hands this sheet the "couldn't check" card, never no card.
//
// R-12: the draft panel shows the email exactly as Mail will receive it. Its sentences come from
// `emailBody`; the owner's note and questions are typed here and travel verbatim. Vet documents
// are listed one by one, every one off by default.


export type SendAction =
  | { target: 'email'; subject: string; body: string; documentUris: string[] }
  | { target: 'print' }
  | { target: 'phone' }
  | { target: 'share' }
  | { target: 'copy'; subject: string; body: string };

interface Props {
  visible: boolean;
  petName: string;
  ownerSurname: string | null;
  live: ComposerLive;
  card: SendCallCardModel | null;
  startDate: string;
  endDate: string;
  today: string;
  /** The next visit's day (YYYY-MM-DD), when one is booked. */
  visitDay: string | null;
  documents: SendDocumentChoice[];
  /** False when this phone cannot open a Mail draft (no account, or a build without the module). */
  mailReady: boolean;
  /**
   * True once the screen can open exam-room mode (PR-19's `openExamRoom`). Until then "Show on
   * this phone" is not listed: a row that opened nothing would be a door to nowhere.
   */
  canShowOnPhone?: boolean;
  onClose: () => void;
  /** Called once the sheet has fully gone, with what the owner chose. */
  onAction: (action: SendAction) => void;
}

type Panel = 'targets' | 'email';

export function SendSheet({
  visible, petName, ownerSurname, live, card, startDate, endDate, today, visitDay, documents, mailReady, canShowOnPhone = false,
  onClose, onAction,
}: Props) {
  const { height: windowHeight } = useWindowDimensions(); // window-width-ok: the sheet's travel is the window HEIGHT, never a width
  const insets = useSafeAreaInsets();
  const appActive = useAppActive();
  const sheetCap = useSheetCap();
  const pending = useRef<SendAction | null>(null);
  const motion = useSheetMotion({
    visible,
    veil: 'own',
    travelPt: windowHeight,
    appActive,
    onExited: () => {
      const chosen = pending.current;
      pending.current = null;
      if (chosen) onAction(chosen);
    },
  });

  const [panel, setPanel] = useState<Panel>('targets');
  const [note, setNote] = useState('');
  const [questions, setQuestions] = useState<string[]>([]);
  const [keepVisit, setKeepVisit] = useState(true);
  const [attached, setAttached] = useState<Set<string>>(() => new Set());
  const panelOpacity = useRef(new Animated.Value(1)).current;

  // Each open starts on the targets; the draft the owner typed is kept for the session.
  useEffect(() => {
    if (visible) {
      setPanel('targets');
      panelOpacity.setValue(1);
    }
  }, [visible, panelOpacity]);

  // Focus on the call card once the sheet is up (§14: "Focus on the call card when present").
  const cardRef = useRef<ViewInstance>(null);
  // And on the draft's heading when the panel swaps to it, so VoiceOver follows the swap.
  const emailHeadingRef = useRef<ViewInstance>(null);
  useEffect(() => {
    if (motion.phase !== 'open') return;
    focusAccessibility(panel === 'targets' ? cardRef.current : emailHeadingRef.current);
  }, [motion.phase, panel]);

  const swap = (next: Panel) => {
    if (reducedMotionNow()) {
      setPanel(next);
      return;
    }
    Animated.timing(panelOpacity, { toValue: 0, duration: theme.durationFast, useNativeDriver: true }).start(() => {
      setPanel(next);
      Animated.timing(panelOpacity, { toValue: 1, duration: theme.durationFast, useNativeDriver: true }).start();
    });
  };

  const visit = keepVisit ? visitDay : null;
  const subject = useMemo(
    () => emailSubject({ petName, ownerSurname, live, startDate, endDate, today, visitDay: visit }),
    [petName, ownerSurname, live, startDate, endDate, today, visit],
  );
  const sentences = useMemo(
    () => emailBody({ petName, live, startDate, endDate, today, visitDay: visit, note, questions }),
    [petName, live, startDate, endDate, today, visit, note, questions],
  );
  const body = emailBodyText(sentences);
  // Copy travels without the PDF, so its text says what the log covers, never "Attached is".
  const copyBody = useMemo(
    () => emailBodyText(emailBody({ petName, live, startDate, endDate, today, visitDay: visit, note, questions, attached: false })),
    [petName, live, startDate, endDate, today, visit, note, questions],
  );
  const documentUris = documents.filter((d) => d.uri !== null && attached.has(d.id)).map((d) => d.uri as string);

  const choose = (action: SendAction) => {
    pending.current = action;
    onClose();
  };
  const onTarget = (t: SendTarget) => {
    if (t === 'email') swap('email');
    else if (t === 'copy') choose({ target: 'copy', subject, body: copyBody });
    else choose({ target: t });
  };

  return (
    <Modal visible={motion.modalVisible} transparent animationType="none" onShow={motion.onShow} onRequestClose={onClose}>
      {/* The draft's note and question fields sit low in a bottom sheet: the keyboard pushes the
          sheet up rather than covering the field and "Open in Mail" (the SheetShell pattern). */}
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        pointerEvents={motion.phase === 'exiting' ? 'none' : 'auto'}
      >
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, motion.scrimStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
        </Animated.View>
        <Animated.View
          style={[styles.sheet, sheetCap, { paddingBottom: insets.bottom + theme.space2 }, motion.sheetStyle]}
          accessibilityViewIsModal
          testID="send-sheet"
        >
          <View style={styles.grabber} />
          <Animated.View style={[styles.panel, { opacity: panelOpacity }]}>
            {panel === 'targets' ? (
              <ScrollView contentContainerStyle={styles.pad} testID="send-panel-targets">
                {card && <SendCallCard focusRef={cardRef} card={card} testID="send-call-card" />}
                <ThemedText style={styles.title} accessibilityRole="header">
                  {petName.trim() ? `Send ${petName.trim()}’s report` : 'Send the report'}
                </ThemedText>
                {SEND_TARGETS.filter((t) => t !== 'phone' || canShowOnPhone).map((t) =>
                  t === 'email' && !mailReady ? (
                    // No control exists for this state, so no `disabled` claim (C-7): the row is
                    // a sentence saying why, and the other targets carry the send.
                    <View key={t} style={styles.target} accessible testID="send-target-email-unavailable">
                      <ThemedText style={styles.targetOff}>{TARGET_LABEL.email}</ThemedText>
                      <ThemedText style={styles.hint}>
                        Mail isn’t set up on this phone. Share the PDF, or copy the email text.
                      </ThemedText>
                    </View>
                  ) : (
                    <Pressable
                      key={t}
                      style={styles.target}
                      onPress={() => onTarget(t)}
                      accessibilityRole="button"
                      testID={`send-target-${t}`}
                    >
                      <ThemedText style={styles.targetLabel}>{TARGET_LABEL[t]}</ThemedText>
                    </Pressable>
                  ),
                )}
              </ScrollView>
            ) : (
              <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled" testID="send-panel-email">
                <View style={styles.draftHead}>
                  <Pressable
                    onPress={() => swap('targets')}
                    style={styles.back}
                    accessibilityRole="button"
                    accessibilityLabel="Back to the ways to send"
                    testID="send-email-back"
                  >
                    <ThemedText style={styles.backText}>‹ Back</ThemedText>
                  </Pressable>
                  <View ref={emailHeadingRef} accessible accessibilityRole="header">
                    <ThemedText style={styles.title}>Email</ThemedText>
                  </View>
                </View>
                <ThemedText style={styles.meta}>From your own address. You choose who it goes to in Mail.</ThemedText>
                <SectionLabel label="Subject" />
                <ThemedText style={styles.subject} testID="send-email-subject">
                  {subject}
                </ThemedText>
                <SectionLabel label="The email" />
                <View style={styles.bodyBox} testID="send-email-body">
                  {sentences.map((s) => (
                    <ThemedText key={s.id} style={s.source === 'owner' ? styles.bodyOwner : styles.bodyText}>
                      {s.text}
                    </ThemedText>
                  ))}
                </View>
                <TextField
                  multiline
                  label="My note"
                  placeholder="Anything you want the vet to read first"
                  value={note}
                  onChangeText={setNote}
                  maxLength={600}
                  testID="send-email-note"
                />
                {questions.map((q, n) => (
                  <TextField
                    // Questions are only ever appended, so the index is stable for the session.
                    key={`q-${n}`}
                    label={`Question ${n + 1}`}
                    value={q}
                    onChangeText={(text) => setQuestions((all) => all.map((x, i) => (i === n ? text : x)))}
                    maxLength={300}
                    testID={`send-email-question-${n + 1}`}
                  />
                ))}
                {questions.length < EMAIL_QUESTION_MAX && (
                  <Pressable
                    onPress={() => setQuestions((all) => [...all, ''])}
                    style={styles.addQuestion}
                    accessibilityRole="button"
                    testID="send-email-add-question"
                  >
                    <ThemedText style={styles.addQuestionText}>
                      {questions.length === 0 ? 'Add a question for the vet' : 'Add another question'}
                    </ThemedText>
                  </Pressable>
                )}
                {visitDay && (
                  <View style={styles.chipRow}>
                    <FilterChip
                      label={`The visit on ${composerDate(visitDay, today)}`}
                      active={keepVisit}
                      onPress={() => setKeepVisit((k) => !k)}
                    />
                  </View>
                )}
                {documents.length > 0 && (
                  <View style={styles.docs} testID="send-documents">
                    <SectionLabel label="Vet documents" />
                    <ThemedText style={styles.hint}>Attach any you want beside the report. None are attached unless you choose.</ThemedText>
                    {documents.map((d) =>
                      d.uri === null ? (
                        <View key={d.id} style={styles.docRow} accessible testID={`send-document-${d.id}`}>
                          <ThemedText style={styles.docTitle}>{d.title}</ThemedText>
                          <ThemedText style={styles.hint}>{[d.detail, d.why].filter((x) => !!x).join(' · ')}</ThemedText>
                        </View>
                      ) : (
                        <View key={d.id} style={styles.docRow}>
                          <FilterChip
                            label={d.title}
                            active={attached.has(d.id)}
                            onPress={() =>
                              setAttached((s) => {
                                const next = new Set(s);
                                if (next.has(d.id)) next.delete(d.id);
                                else next.add(d.id);
                                return next;
                              })
                            }
                          />
                          <ThemedText style={styles.hint}>{d.detail}</ThemedText>
                        </View>
                      ),
                    )}
                  </View>
                )}
                <PrimaryButton
                  label="Open in Mail"
                  onPress={() => choose({ target: 'email', subject, body, documentUris })}
                  testID="send-email-open"
                />
              </ScrollView>
            )}
          </Animated.View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  scrim: { backgroundColor: theme.colorScrimBackdrop },
  sheet: {
    backgroundColor: theme.colorSurface,
    borderTopLeftRadius: theme.radiusLarge,
    borderTopRightRadius: theme.radiusLarge,
    paddingTop: theme.space1,
    maxHeight: '92%',
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: theme.radiusFull,
    backgroundColor: theme.colorBorderStrong,
    marginBottom: theme.space1,
  },
  panel: { flexShrink: 1 },
  pad: { paddingHorizontal: theme.space2, paddingBottom: theme.space2, gap: theme.space2 },
  title: { fontSize: theme.textLG, fontWeight: theme.weightSemibold, color: theme.colorTextPrimary },
  target: {
    minHeight: theme.hitTarget,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: theme.colorBorder,
    paddingVertical: theme.space1,
    gap: theme.space1,
  },
  targetLabel: { fontSize: theme.textMD, fontWeight: theme.weightMedium, color: colorRoles.action.onLight },
  targetOff: { fontSize: theme.textMD, fontWeight: theme.weightMedium, color: theme.colorTextSecondary },
  hint: { fontSize: theme.textSM, color: theme.colorTextSecondary },
  draftHead: { flexDirection: 'row', alignItems: 'center', gap: theme.space2 },
  back: { minHeight: theme.hitTarget, justifyContent: 'center' },
  backText: { fontSize: theme.textMD, fontWeight: theme.weightMedium, color: colorRoles.action.onLight },
  meta: { fontSize: theme.textSM, color: theme.colorTextSecondary },
  subject: { fontSize: theme.textSM, fontWeight: theme.weightMedium, color: theme.colorTextPrimary },
  bodyBox: {
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusMedium,
    padding: theme.space2,
    gap: theme.space1,
  },
  bodyText: { fontSize: theme.textSM, color: theme.colorTextPrimary },
  bodyOwner: { fontSize: theme.textSM, fontWeight: theme.weightMedium, color: theme.colorTextPrimary },
  addQuestion: { minHeight: theme.hitTarget, justifyContent: 'center' },
  addQuestionText: { fontSize: theme.textMD, fontWeight: theme.weightMedium, color: colorRoles.action.onLight },
  chipRow: { flexDirection: 'row' },
  docs: { gap: theme.space1 },
  docRow: { gap: theme.space1, alignItems: 'flex-start' },
  docTitle: { fontSize: theme.textMD, color: theme.colorTextPrimary },
});
