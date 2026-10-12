import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { theme } from '../../constants/theme';
import { ThemedText } from '../ui/ThemedText';
import { useEn5 } from '../../hooks/useEn5';
import { usePetStore } from '../../store/petStore';
import { useSyncStore } from '../../store/syncStore';
import { isTrialRunning } from '../../lib/dietTrial';
import {
  pushIntakeChecks,
  readIntakeChecks,
  readIntakeQuestionFacts,
  saveIntakeAnswer,
  type IntakeCheckRow,
  type IntakeQuestionFacts,
} from '../../lib/intakeChecks';
import {
  answerLabel,
  intakeFormsFor,
  intakeOptions,
  intakeQuestionHint,
  intakeQuestionText,
  intakeSinceFor,
  safetyNetLine,
  type IntakeAnswer,
  type IntakeForm,
  type PetSex,
} from '../../lib/intakeQuestion';

// EN-5's question on the record (Engines v3 PR-30q, CUL-1724; docs/nyx-incident-tiers-
// requirements.md §9; mock docs/culprit-incident-tiers-mockups.html §07).
//
//   Has Nyx eaten a meal since 6 PM yesterday?           ← a heading
//   [Yes, ate well] [A little] [No] [Not sure]           ← a radio group, "1 of 4"
//
//   Has Nyx eaten a meal since 6 PM yesterday?
//   You said: Not sure · Change                          ← answered, folded
//   If Nyx hasn't eaten by 8 AM tomorrow, call your vet. ← Not sure / Haven't seen only
//
// UNDER THE READ, NEVER IN IT. The read's own words, rail and tier are drawn above and this
// block never touches them. An answer only adds evidence: it reaches the read through the
// server's re-check, which never lowers a call (lib/intakeChecks.ts).
//
// NO TIME LIMIT, NEVER ANNOUNCED. It waits on the record until answered, with no dwell, no
// timer and no live region (spec §9): a VoiceOver user meets it by moving to it, like any
// other heading on the record.
//
// SKIPPING IS AN ANSWER OF NOTHING. No row is written until a tap, and no row is unknown,
// never normal (GAP-22).
//
// DARK behind `engines_v3_en5`: flag-off this renders nothing and reads nothing.

interface Props {
  eventId: string;
  petId: string;
  /** The vomit's own time: the question asks from 24 h before it. */
  occurredAt: string;
  /** The record's pet's name (C-9). */
  petName: string | null;
}

export function IntakeQuestion({ eventId, petId, occurredAt, petName }: Props) {
  const flagOn = useEn5();
  // The record's pet, never the active one (C-9): species and sex decide the question.
  const pet = usePetStore((s) => s.pets.find((p) => p.id === petId) ?? null);
  const hydrationTick = useSyncStore((s) => s.hydrationTick);
  const [facts, setFacts] = useState<IntakeQuestionFacts | null>(null);
  const [answers, setAnswers] = useState<Partial<Record<IntakeForm, IntakeCheckRow>>>({});
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<Partial<Record<IntakeForm, boolean>>>({});
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    try {
      const [f, a] = await Promise.all([readIntakeQuestionFacts(petId), readIntakeChecks(eventId)]);
      setFacts(f);
      setAnswers(a);
      setLoaded(true);
    } catch (e) {
      // The read above stands whatever happens here. A first read that fails draws nothing
      // (an unanswered question waits for the next open); a re-read that fails keeps what the
      // last read drew, so a saved answer never vanishes behind a failed refresh (C-12).
      console.warn('[intake-question] read failed:', e);
    }
  }, [eventId, petId]);

  useEffect(() => {
    if (!flagOn) return;
    void load();
  }, [flagOn, load, hydrationTick]);

  if (!flagOn || !loaded || !facts || !pet) return null;

  const vomitMs = Date.parse(occurredAt);
  const onTrial =
    facts.trial !== null &&
    isTrialRunning(
      {
        startedAt: facts.trial.startedAt,
        targetDurationDays: facts.trial.targetDurationDays,
        status: facts.trial.status,
        endedAt: facts.trial.endedAt,
      },
      vomitMs,
    );
  const forms = intakeFormsFor(pet.species, facts.freeFed, onTrial);
  const computedSince = intakeSinceFor(occurredAt);
  if (forms.length === 0 || computedSince === null) return null;
  const sex: PetSex = pet.sex;
  const nowMs = Date.now();

  const answer = async (form: IntakeForm, value: IntakeAnswer, existing: IntakeCheckRow | undefined) => {
    // Change, then the same answer: the fold closes and nothing is written (no new
    // answered_at, no re-check owed for an answer that did not move).
    // A refused answer re-sends on the same tap: the UPDATE clears its refusal.
    if (existing && existing.answer === value && !existing.sync_error) {
      setEditing((e) => ({ ...e, [form]: false }));
      return;
    }
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const saved = await saveIntakeAnswer({
        eventId,
        petId,
        form,
        answer: value,
        since: existing?.since ?? computedSince,
        existingId: existing?.id ?? null,
      });
      // Local-first: the push never holds the fold.
      pushIntakeChecks();
      setEditing((e) => ({ ...e, [form]: false }));
      setAnswers((a) => ({ ...a, [form]: saved }));
      await load();
    } catch (e) {
      console.warn('[intake-question] save failed:', e);
      Alert.alert('That didn’t save', 'Try that again in a moment.');
    } finally {
      inFlight.current = false;
    }
  };

  return (
    <View style={styles.block} testID="intake-question">
      {forms.map((form) => {
        const row = answers[form];
        const ctx = {
          petName,
          sex,
          since: row?.since ?? computedSince,
          onTrial: form === 'other_food' && onTrial,
          trialProtein: facts.trial?.protein ?? null,
          nowMs,
        };
        const question = intakeQuestionText(form, ctx);
        if (row && !editing[form]) {
          const net = safetyNetLine(form, row.answer, row.answered_at, row.since, petName, nowMs);
          return (
            <View key={form} style={styles.form} testID={`intake-question-${form}`}>
              <ThemedText style={styles.question} accessibilityRole="header">
                {question}
              </ThemedText>
              <View style={styles.saidRow}>
                <ThemedText style={styles.said}>{`You said: ${answerLabel(form, row.answer, sex)}`}</ThemedText>
                <ThemedText style={styles.said} accessibilityElementsHidden importantForAccessibility="no">
                  {' · '}
                </ThemedText>
                <Pressable
                  onPress={() => setEditing((e) => ({ ...e, [form]: true }))}
                  accessibilityRole="button"
                  accessibilityLabel="Change"
                  accessibilityHint={question}
                  style={styles.change}
                  testID={`intake-question-change-${form}`}
                >
                  <ThemedText style={styles.changeText}>Change</ThemedText>
                </Pressable>
              </View>
              {row.sync_error ? (
                <ThemedText style={styles.net}>This answer didn’t reach your record. Tap Change to send it again.</ThemedText>
              ) : null}
              {net ? <ThemedText style={styles.net}>{net}</ThemedText> : null}
              {form === 'other_food' && row.answer === 'yes' ? (
                <Pressable
                  onPress={() => router.push({ pathname: '/log', params: { type: 'meal', pet: petId } })}
                  accessibilityRole="button"
                  accessibilityLabel="Log what it was"
                  style={styles.door}
                  testID="intake-question-door"
                >
                  <ThemedText style={styles.doorText}>Log what it was</ThemedText>
                  <ThemedText style={styles.chevron} accessibilityElementsHidden importantForAccessibility="no">
                    ›
                  </ThemedText>
                </Pressable>
              ) : null}
            </View>
          );
        }
        const options = intakeOptions(form, sex);
        const hint = intakeQuestionHint(form, ctx);
        return (
          <View key={form} style={styles.form} testID={`intake-question-${form}`}>
            <ThemedText style={styles.question} accessibilityRole="header">
              {question}
            </ThemedText>
            {hint ? <ThemedText style={styles.hint}>{hint}</ThemedText> : null}
            <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={question}>
              {options.map((o, i) => {
                const checked = row?.answer === o.answer;
                return (
                  <Pressable
                    key={o.answer}
                    onPress={() => void answer(form, o.answer, row)}
                    accessibilityRole="radio"
                    accessibilityLabel={o.label}
                    accessibilityState={{ checked }}
                    accessibilityHint={`${i + 1} of ${options.length}`}
                    style={({ pressed }) => [styles.answer, checked && styles.answerChecked, pressed && styles.answerPressed]}
                    testID={`intake-answer-${form}-${o.answer}`}
                  >
                    <ThemedText style={[styles.answerText, checked && styles.answerTextChecked]}>{o.label}</ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    marginTop: theme.space3,
    gap: theme.space3,
  },
  form: {
    gap: theme.space1,
  },
  question: {
    fontSize: theme.textMD,
    lineHeight: theme.lineHeightBody,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  hint: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextTertiary,
  },
  // Wrapping row, no slop: each answer's own 44pt box is its whole target (C-5).
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
  answerChecked: {
    borderColor: theme.colorAccentInk,
    backgroundColor: theme.colorAccentLight,
  },
  answerPressed: {
    backgroundColor: theme.colorSurfaceSubtle,
  },
  answerText: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  answerTextChecked: {
    color: theme.colorAccentInkSelected,
  },
  saidRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  said: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextSecondary,
  },
  // The one control on the folded line: its own 44pt box, no slop (C-5).
  change: {
    minHeight: 44,
    justifyContent: 'center',
  },
  changeText: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorAccentInk,
  },
  net: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextPrimary,
  },
  door: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  doorText: {
    flexShrink: 1,
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  chevron: {
    fontSize: theme.textMD,
    color: theme.colorTextTertiary,
  },
});
