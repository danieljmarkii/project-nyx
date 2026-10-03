import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { theme } from '../../../constants/theme';
import { useLiveRegionAnnouncement } from '../../../hooks/useLiveRegionAnnouncement';
import {
  careAnswerLanded,
  pushCareAnswers,
  readCareQuestionRecord,
  recordCareAnswer,
  retractCareAnswer,
} from '../../../lib/careAnswers';
import {
  CARE_SAVED_OFFLINE,
  careQuestionsFor,
  myVetKnowsConfirmation,
  type CareQuestion,
} from '../../../lib/careQuestions';
import {
  careQuestionShownToday,
  markCareQuestionShown,
  mayAskCareQuestion,
  settleCareQuestion,
} from '../../../lib/careQuestionAsked';
import { careStateTakesAnswers, type CareStateView } from '../../../lib/careState';
import { toLocalDayKey } from '../../../lib/utils';
import { ThemedText } from '../../ui/ThemedText';

// CareAnswers — the owner's answers to a raised concern, on the finding's own screen
// (Engines v3 PR-35, CUL-1418; docs/nyx-care-state-requirements.md §3.2, §3.4, §7;
// mock round 3 §01 1b, §02 2a–2b, §03 3e, and round 2's loop, §08 frames 1 and 5).
//
//   Otis has been on the hydrolyzed trial since Sep 1.        ← at most ONE question,
//   Did Otis's vet start it for the vomiting?                    asked once, one a day
//   [ Yes, for this ]  [ No ]  [ Not sure ]
//
//   [ Book a visit ]  [ My vet knows ]  [ Not yet ]            ← the three answers
//
// TD-4 = D: answers live here, never on Home (Home keeps its three write classes, C-33).
//
// THE GATE IS THE SERVER'S FIELD. This renders only for a concern the server wrote a care
// state on (`careStateViewOf`), and only while that state takes answers (raised, or raised
// again). Flag-off there is no state, so this component is not mounted and its reads never
// run (§9). An escalation (a red flag, a call-tier read, an intake decline, the burden card)
// never carries a state, so nothing here can sit beside one (AC 3).
//
// AN ANSWER NEVER QUIETS THE SCREEN BY ITSELF. It is written on this phone and pushed; the
// care state is the server's (§3.3), so the screen says what was recorded and, until the row
// lands, that Home updates once the phone is back online (mock 3e).
//
// "Not yet" writes nothing and is never removed (fold §3.3): it is what keeps the other two
// honest. "Book a visit" is a door (the shipped booking form, the reason carried in).

interface Props {
  petId: string;
  petName: string;
  view: CareStateView;
  /** The owner's word for the sign ("vomiting"). */
  noun: string;
  /** The finding's title, carried into the booking form as its reason. */
  title: string;
  /** The concern's first onset (`firstOnsetIso`), or null on a worsening card alone. */
  onsetIso: string | null;
}

type Phase =
  | { kind: 'answering' }
  | { kind: 'saving' }
  | { kind: 'told'; answerId: string; said: string; does: string | null; offline: boolean }
  | { kind: 'not_yet' }
  | { kind: 'taken_back' };

export function CareAnswers({ petId, petName, view, noun, title, onsetIso }: Props) {
  const [question, setQuestion] = useState<CareQuestion | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'answering' });
  const open = careStateTakesAnswers(view);

  // The one question: the first the ask-once memory allows today.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const today = toLocalDayKey(new Date());
        const record = await readCareQuestionRecord(petId);
        const candidates = careQuestionsFor({ petName, sign: view.sign, noun, onsetIso, today, ...record });
        const shown = await careQuestionShownToday(today);
        for (const q of candidates) {
          if (await mayAskCareQuestion(q.key, today, shown)) {
            if (cancelled) return;
            setQuestion(q);
            await markCareQuestionShown(q.key, today);
            return;
          }
        }
      } catch (e) {
        // The answers below stay: a question that could not be read is simply not asked.
        console.warn('[care-answers] question read failed:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, petId, petName, view.sign, noun, onsetIso]);

  const announcement =
    phase.kind === 'told' ? `${phase.said}${phase.does ? ` ${phase.does}` : ''}` : phase.kind === 'taken_back' ? TAKEN_BACK : null;
  useLiveRegionAnnouncement(announcement, phase.kind === 'told' ? phase.answerId : phase.kind);

  const save = useCallback(
    async (write: () => Promise<string>, said: string, does: string | null) => {
      setPhase({ kind: 'saving' });
      try {
        const answerId = await write();
        await pushCareAnswers();
        const landed = await careAnswerLanded(answerId).catch(() => false);
        setPhase({ kind: 'told', answerId, said, does, offline: !landed });
      } catch (e) {
        console.warn('[care-answers] save failed:', e);
        setPhase({ kind: 'answering' });
        Alert.alert('That didn’t save', 'Try that again in a moment.');
      }
    },
    [],
  );

  if (!open) return null;

  if (phase.kind === 'told') {
    return (
      <View style={styles.block} testID="care-answers-told" accessibilityLiveRegion="polite">
        <ThemedText style={styles.said}>{phase.said}</ThemedText>
        {phase.does ? <ThemedText style={styles.does}>{phase.does}</ThemedText> : null}
        {phase.offline ? <ThemedText style={styles.quiet} testID="care-answers-offline">{CARE_SAVED_OFFLINE}</ThemedText> : null}
        <View style={styles.row}>
          <Answer
            label="Undo"
            onPress={async () => {
              try {
                await retractCareAnswer(phase.answerId);
                await pushCareAnswers();
                setPhase({ kind: 'taken_back' });
              } catch (e) {
                console.warn('[care-answers] undo failed:', e);
                Alert.alert('That didn’t save', 'Try that again in a moment.');
              }
            }}
          />
        </View>
      </View>
    );
  }

  const today = toLocalDayKey(new Date());
  const busy = phase.kind === 'saving';
  const askYes = async (q: CareQuestion) => {
    const said = q.kind === 'visit'
      ? `You said you talked about the ${noun} at the visit.`
      : q.kind === 'trial'
        ? `You said ${petName}’s vet started the trial for the ${noun}.`
        : `You said ${petName}’s vet started it for the ${noun}.`;
    await save(
      () => recordCareAnswer({ petId, sign: view.sign, ...q.write }),
      said,
      'Home will stop asking you to book.',
    );
  };

  return (
    <View style={styles.block} testID="care-answers">
      {question ? (
        <View style={styles.question} testID="care-question">
          <ThemedText style={styles.questionText}>{question.text}</ThemedText>
          {question.hint ? <ThemedText style={styles.quiet}>{question.hint}</ThemedText> : null}
          <View style={styles.row}>
            <Answer label={question.yes} disabled={busy} onPress={() => void askYes(question)} />
            {question.others.map((label) => (
              <Answer
                key={label}
                label={label}
                disabled={busy}
                onPress={() => {
                  // "Later" leaves the question askable on a later day; the others settle it.
                  if (label !== 'Later') void settleCareQuestion(question.key, today);
                  setQuestion(null);
                }}
              />
            ))}
          </View>
        </View>
      ) : null}

      {phase.kind === 'taken_back' ? <ThemedText style={styles.quiet}>{TAKEN_BACK}</ThemedText> : null}
      {phase.kind === 'not_yet' ? <ThemedText style={styles.quiet}>{NOT_YET_LINE}</ThemedText> : null}

      <View style={styles.row} testID="care-answers-row">
        <Answer
          label="Book a visit"
          disabled={busy}
          onPress={() =>
            router.push({ pathname: '/vet-visits', params: { add: 'booked', pet: petId, reason: title } })
          }
        />
        <Answer
          label="My vet knows"
          disabled={busy}
          onPress={() => {
            const c = myVetKnowsConfirmation(petName, noun, today);
            void save(() => recordCareAnswer({ petId, sign: view.sign, source: 'my_vet_knows', anchorOn: today }), c.said, c.does);
          }}
        />
        <Answer label="Not yet" disabled={busy} onPress={() => setPhase({ kind: 'not_yet' })} />
      </View>
    </View>
  );
}

/** After an Undo: the concern is raised again on the server's next run. */
export const TAKEN_BACK = 'Taken back. Home will ask about it again.';
/** After "Not yet": nothing written, and nothing changes. */
export const NOT_YET_LINE = 'Nothing changes. Home will keep asking.';

// No `disabled` while a save is in flight: it would announce "dimmed" over a control that
// still exists (C-7). A tap during the save is simply ignored, and the save is a local
// write measured in milliseconds.
function Answer({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={() => {
        if (!disabled) onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.answer, pressed && styles.answerPressed]}
      testID={`care-answer-${label}`}
    >
      <ThemedText style={styles.answerText}>{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  block: {
    marginTop: theme.space3,
    gap: theme.space1,
  },
  question: {
    gap: theme.space1,
    paddingBottom: theme.space2,
  },
  questionText: {
    fontSize: theme.textMD,
    lineHeight: theme.lineHeightBody,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  said: {
    fontSize: theme.textMD,
    lineHeight: theme.lineHeightBody,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  does: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextSecondary,
  },
  quiet: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextTertiary,
  },
  // Wrapping row, no slop: each answer's own 44pt box is its whole target, so adjacent
  // answers abut and never overlap (C-5). A wrap stacks them with the same gap.
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: theme.space1,
    rowGap: theme.space1,
  },
  answer: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: theme.space2,
    borderRadius: theme.radiusFull,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    backgroundColor: theme.colorSurface,
  },
  answerPressed: {
    backgroundColor: theme.colorSurfaceSubtle,
  },
  answerText: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
});
