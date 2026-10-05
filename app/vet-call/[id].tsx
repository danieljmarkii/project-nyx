import { useCallback, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { theme } from '../../constants/theme';
import { Header, PrimaryButton, SectionLabel } from '../../components/ui';
import { ThemedText } from '../../components/ui/ThemedText';
import { ChipGroup } from '../../components/ui/ChipGroup';
import { SkeletonRows } from '../../components/ui/Skeleton';
import { AddMedicationModal } from '../../components/profile/AddMedicationModal';
import { resolveRecordPetName, usePetStore } from '../../store/petStore';
import { useLiveRegionAnnouncement } from '../../hooks/useLiveRegionAnnouncement';
import { refreshFollowUpNotifications, useEn14 } from '../../hooks/useFollowUps';
import { answerFollowUp, pushVetCalls, readCall, saveCallNote, undoCall, type CallView } from '../../lib/vetCalls';
import { cancelFollowUpNotification } from '../../lib/followUpNotifications';
import {
  CALL_NOTE_HINT,
  CALL_NOTE_MAX,
  FOLLOW_UP_ANSWERS,
  FOLLOW_UP_ANSWER_LABEL,
  FOLLOW_UP_TITLE,
  FOLLOW_UP_WORTH_IT_QUESTION,
  WORTH_IT_ANSWERS,
  WORTH_IT_LABEL,
  answeredLine,
  callAboutOf,
  calledOnLine,
  type FollowUpAnswer,
  type WorthIt,
} from '../../lib/vetCallState';
import { petPronouns, toLocalDayKey } from '../../lib/utils';

// The call record and its follow-up: "What did the vet say?" (Engines v3 PR-36, CUL-1419;
// docs/nyx-care-state-requirements.md §6.3, §6.4; mock round 3 §04, frames 4c–4e).
//
//   You called on Oct 3 about Mo's vomiting.
//
//   WHAT DID THE VET SAY?
//   [ Wants to see him ] [ Started a treatment ] [ Keep an eye on him ]
//   [ It was something else ] [ Couldn't reach them ]
//   Did your vet think it was worth the call?      [ Yes ] [ No ] [ Didn't say ]
//   [ Save ]
//
//   YOUR NOTE                                      Only you see this. Nothing in the app reads it.
//
// ANSWERED ONCE (§6.3). With an answer recorded on any phone the question is gone and the
// answer is stated as the owner's ("You said: …"). No answer reads as "he's fine", and
// "Nothing needed" is not an option (round 2): every answer is a fact about the call.
//
// EACH ANSWER OPENS THE DOOR IT IMPLIES (round 2, the PM's Signal-to-vet-visits directive).
// "Wants to see him" opens the booking form with the reason carried in (the PR-35 door's
// route); "Started a treatment" opens the medication form here (the after-visit screen's
// precedent, one Modal at a time, CUL-662). The answer is saved first, so closing either
// form loses nothing.
//
// THE NOTE is the owner's own words: written after the save, never required, read by no
// model (§6.6), shown back here and nowhere else.
//
// NOT GATED by engines_v3_en14: a call that exists was made under it, and its owner may
// always read it back and answer it. The doors into this screen are gated.


export default function VetCallScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const pets = usePetStore((s) => s.pets);
  const flagOn = useEn14();
  const [view, setView] = useState<CallView | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [answer, setAnswer] = useState<FollowUpAnswer | null>(null);
  const [worthIt, setWorthIt] = useState<WorthIt | null>(null);
  const [note, setNote] = useState('');
  const [said, setSaid] = useState<string | null>(null);
  const [medOpen, setMedOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  useLiveRegionAnnouncement(said, said);

  // The note as last saved, so a re-read (a save, a return from the booking form) seeds the
  // field only while the owner has not typed over it: a draft is never wiped (code review).
  const savedNote = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const v = await readCall(id);
      setView(v);
      const next = v?.call.note ?? '';
      setNote((draft) => (savedNote.current === null || draft === savedNote.current ? next : draft));
      savedNote.current = next;
      setFailed(false);
    } catch (e) {
      console.warn('[vet-call] read failed:', e);
      setFailed(true);
    } finally {
      setLoaded(true);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const back = () => (router.canGoBack() ? router.back() : router.replace('/vet-visits'));
  const today = toLocalDayKey(new Date());

  const petId = view?.call.petId ?? null;
  const petName = resolveRecordPetName(pets, petId);
  const pet = pets.find((p) => p.id === petId);
  const pronoun = petPronouns(pet?.sex ?? 'unknown').object;
  const about = callAboutOf(view?.eventType ?? null);

  const run = async (what: () => Promise<void>, failMessage = 'Try that again in a moment.') => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    try {
      await what();
    } catch (e) {
      console.warn('[vet-call] write failed:', e);
      Alert.alert('That didn’t save', failMessage);
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  const saveAnswer = () =>
    run(async () => {
      if (!view || !answer) return;
      const result = await answerFollowUp(view.call.id, answer, worthIt);
      await cancelFollowUpNotification(view.call.id);
      void pushVetCalls();
      await refreshFollowUpNotifications(flagOn);
      await load();
      setSaid(result === 'saved' ? `Saved. ${answeredLine(answer, pronoun)}` : 'An answer was already saved for this call.');
      if (result !== 'saved' || !petId) return;
      if (answer === 'wants_to_see') {
        router.push({
          pathname: '/vet-visits',
          params: {
            add: 'booked',
            pet: petId,
            reason: about ? `After the call about ${petName ? `${petName}’s ` : 'the '}${about}` : 'After the call to the vet',
          },
        });
      } else if (answer === 'started_treatment') {
        setMedOpen(true);
      }
    });

  const saveNote = () =>
    run(async () => {
      if (!view) return;
      await saveCallNote(view.call.id, note);
      void pushVetCalls();
      await load();
      setSaid(note.trim() ? 'Note saved.' : 'Note cleared.');
    });

  const takeBackNow = () =>
    run(async () => {
      if (!view) return;
      await undoCall(view.call.id);
      await cancelFollowUpNotification(view.call.id);
      void pushVetCalls();
      await refreshFollowUpNotifications(flagOn);
      back();
    });

  // ONE safety net (C-21): a call is recreatable, so taking it back needs no confirm; a note
  // is the owner's own words and is not, so with one the confirm comes first and names it.
  const takeBack = () => {
    if (!view?.call.note) {
      void takeBackNow();
      return;
    }
    Alert.alert('Take back this call?', 'Your note about it goes too.', [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Take it back', style: 'destructive', onPress: () => void takeBackNow() },
    ]);
  };

  if (!loaded) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <Header leading="back" onLeadingPress={back} />
        <View style={styles.scroll}>
          <SkeletonRows count={3} />
        </View>
      </SafeAreaView>
    );
  }

  // A re-read that fails over a call already on screen keeps the call (code review).
  if (!view) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <Header leading="back" onLeadingPress={back} />
        <View style={styles.scroll}>
          <ThemedText style={styles.body}>
            {failed ? 'This call couldn’t be read just now.' : 'This call is no longer on the record.'}
          </ThemedText>
          {failed ? (
            <TouchableOpacity onPress={() => void load()} style={styles.retry} accessibilityRole="button">
              <ThemedText style={styles.link}>Try again</ThemedText>
            </TouchableOpacity>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  const { call, followUp } = view;
  const answered = followUp.kind === 'answered';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <Header leading="back" onLeadingPress={back} />
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <ThemedText style={styles.title} accessibilityRole="header">
            {calledOnLine(call.calledOn, today).replace(/\.$/, '')}
            {about ? ` about ${petName ? `${petName}’s` : 'the'} ${about}.` : '.'}
          </ThemedText>

          {answered ? (
            <View style={styles.section} testID="vet-call-answered">
              <SectionLabel label="What the vet said" header />
              <ThemedText style={styles.body}>{answeredLine(followUp.answer, pronoun)}</ThemedText>
              {followUp.worthIt ? (
                <ThemedText style={styles.quiet}>
                  {`Worth the call, you said: ${WORTH_IT_LABEL[followUp.worthIt]}.`}
                </ThemedText>
              ) : null}
            </View>
          ) : (
            <View style={styles.section} testID="vet-call-question">
              <SectionLabel label={FOLLOW_UP_TITLE} header />
              <ChipGroup
                options={FOLLOW_UP_ANSWERS.map((a) => ({ value: a, label: FOLLOW_UP_ANSWER_LABEL[a](pronoun) }))}
                value={answer}
                onChange={(v) => setAnswer((v as FollowUpAnswer | null) ?? null)}
                accessibilityLabel={FOLLOW_UP_TITLE}
              />
              <ThemedText style={styles.question}>{FOLLOW_UP_WORTH_IT_QUESTION}</ThemedText>
              <ChipGroup
                options={WORTH_IT_ANSWERS.map((w) => ({ value: w, label: WORTH_IT_LABEL[w] }))}
                value={worthIt}
                onChange={(v) => setWorthIt((v as WorthIt | null) ?? null)}
                accessibilityLabel={FOLLOW_UP_WORTH_IT_QUESTION}
              />
              <PrimaryButton
                label="Save"
                onPress={() => void saveAnswer()}
                disabled={answer === null}
                loading={saving}
                testID="vet-call-save"
              />
              {answer === null ? <ThemedText style={styles.quiet}>Pick what the vet said to save.</ThemedText> : null}
            </View>
          )}

          {said ? (
            <ThemedText style={styles.quiet} accessibilityLiveRegion="polite" testID="vet-call-said">
              {said}
            </ThemedText>
          ) : null}

          <View style={styles.section}>
            <SectionLabel label="Your note" header />
            <ThemedText style={styles.quiet}>{CALL_NOTE_HINT}</ThemedText>
            <TextInput
              style={styles.noteInput}
              value={note}
              onChangeText={setNote}
              placeholder="What the vet said, in your words"
              placeholderTextColor={theme.colorTextTertiary}
              multiline
              maxLength={CALL_NOTE_MAX}
              accessibilityLabel="Your note"
              testID="vet-call-note"
            />
            <PrimaryButton
              label="Save note"
              variant="secondary"
              onPress={() => void saveNote()}
              disabled={(call.note ?? '') === note.trim()}
              loading={saving}
              testID="vet-call-save-note"
            />
          </View>

          {/* Only this phone's own lone call can be taken back here: never another caregiver's
              (adversarial pass 4, D). */}
          {!answered && view.calls === 1 && view.ownCall ? (
            <TouchableOpacity
              onPress={() => void takeBack()}
              style={styles.retry}
              accessibilityRole="button"
              accessibilityLabel="Take back this call"
              testID="vet-call-take-back"
            >
              <ThemedText style={styles.link}>Take back this call</ThemedText>
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* One Modal at a time (CUL-662): mounted only while open. */}
      {medOpen && petId ? (
        <AddMedicationModal
          visible
          petId={petId}
          vetVisitId={null}
          onClose={() => setMedOpen(false)}
          onAdded={() => {
            setMedOpen(false);
            setSaid('Saved. The treatment is on the Pet tab.');
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colorNeutralLight,
  },
  fill: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: theme.space3,
    paddingBottom: theme.space5,
    gap: theme.space3,
  },
  title: {
    fontSize: theme.textLG,
    lineHeight: theme.lineHeightBody,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  section: {
    gap: theme.space2,
  },
  question: {
    fontSize: theme.textMD,
    lineHeight: theme.lineHeightBody,
    color: theme.colorTextPrimary,
  },
  body: {
    fontSize: theme.textMD,
    lineHeight: theme.lineHeightBody,
    color: theme.colorTextPrimary,
  },
  quiet: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextTertiary,
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
    minHeight: 96,
    textAlignVertical: 'top',
  },
  retry: {
    minHeight: 44,
    justifyContent: 'center',
  },
  link: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
  },
});
