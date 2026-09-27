import { StyleSheet, View } from 'react-native';
import { theme } from '../../constants/theme';
import { ThemedText } from '../ui/ThemedText';
import { RECHECK_EYEBROW, type RecheckAnswer, type TrialRecheck } from '../../lib/trialRecheck';

// Get ready's trial row, as the vet's recheck questions (TS-8 · CUL-1304). Drawn inside the
// trial's Worth raising row, under its title and sub-line. It lives in the trial screen's
// namespace because it is behind the same gate: the flag-off guard stubs this directory, so
// Get ready's flag-off tree is compared against the feature's absence (C-36).
//
// Each question is one accessibility element ("question. answer. answer."), because the row
// around it no longer collapses into a single sentence once it carries these.
//
// The answers keep the trial screen's registers, never a louder one: a safety line in the
// safety face's ink, the record lines at the screen's fact size, and the qualifiers and
// Home's vomiting sentence quiet. The vomiting line keeps the strip's size under its
// heading (spec §3.7: the density guard under it has not earned more prominence), so the
// question is what is prominent, never the count.

export function RecheckQuestions({ recheck }: { recheck: TrialRecheck }) {
  if (recheck.questions.length === 0) return null;
  return (
    <View style={styles.block} testID="recheck-questions">
      <ThemedText style={styles.eyebrow}>{RECHECK_EYEBROW}</ThemedText>
      {recheck.questions.map((q) => (
        <View
          key={q.key}
          style={styles.question}
          accessible
          accessibilityLabel={[q.question, ...q.answers.map(spoken)].join(' ')}
          testID={`recheck-${q.key}`}
        >
          <ThemedText style={styles.heading}>{q.question}</ThemedText>
          {q.answers.map((a, i) => (
            <ThemedText key={i} style={answerStyle(q.key, a)}>
              {a.label ? `${a.label} · ${a.text}` : a.text}
            </ThemedText>
          ))}
        </View>
      ))}
    </View>
  );
}

function spoken(a: RecheckAnswer): string {
  return a.label ? `${a.label}, ${a.text}` : a.text;
}

function answerStyle(key: string, a: RecheckAnswer) {
  if (a.role === 'flag') return styles.flag;
  if (a.role === 'quiet' || key === 'symptoms') return styles.quiet;
  return styles.fact;
}

const styles = StyleSheet.create({
  block: {
    marginTop: theme.space1,
    gap: theme.space2,
  },
  eyebrow: {
    fontSize: theme.textXS,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextTertiary,
  },
  question: {
    gap: theme.spaceMicro,
  },
  heading: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  fact: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextSecondary,
  },
  flag: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    fontWeight: theme.weightMedium,
    color: theme.colorEventSymptomInk,
  },
  quiet: {
    fontSize: theme.textXS,
    lineHeight: theme.lineHeightXS,
    color: theme.colorTextTertiary,
  },
});
