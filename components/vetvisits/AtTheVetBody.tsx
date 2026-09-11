import { StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { Camera, Check } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { SectionLabel } from '../ui/SectionLabel';
import { ThemedText } from '../ui/ThemedText';
import type { VisitQuestion } from '../../lib/vetVisits';

interface Props {
  /** The RECORD's pet, via `resolveRecordPetName(pets, appointment.pet_id)` — CUL-574. */
  petName: string;
  /** 'Tuesday · Riverside · with Dr. Chen' — the appointment, as the owner sees it. */
  when: string;
  where: string;
  draft: string;
  onChangeDraft: (next: string) => void;
  questions: ReadonlyArray<VisitQuestion>;
  onToggleQuestion: (question: VisitQuestion) => void;
  /** Documents already photographed against this appointment, for the row's count. */
  paperworkCount: number;
  onPhotographPaperwork: () => void;
  capturing: boolean;
}

// "At the vet" (mock C1) — the in-room surface.
//
// THE DESIGN CONSTRAINT IS THE ROOM, not the screen. Jordan is holding a dog and Sam
// has two carriers, so v1 is one plain-text field, a list of ticks, and one door for
// the paperwork. No toolbar, no rich text (G4: "bolding is probably not happening if
// we're jotting notes in the room"), no mic (G5 — the microphone is not in the
// submission binary at all).
//
// Nothing here confirms a save, and that is deliberate: the standing line under the
// field says the field is saving, so a per-keystroke "Saved" would be chrome flashing
// at someone who is listening to a vet.
export function AtTheVetBody({
  petName, when, where, draft, onChangeDraft,
  questions, onToggleQuestion, paperworkCount, onPhotographPaperwork, capturing,
}: Props) {
  return (
    <View>
      <ThemedText style={styles.pageTitle}>At the vet</ThemedText>
      <ThemedText style={styles.pageSub}>
        {[petName, when, where].filter(Boolean).join(' · ')}
      </ThemedText>

      <View style={styles.block}>
        <SectionLabel label="What the vet said" header style={styles.sectionLabel} />
        <TextInput
          style={styles.notes}
          value={draft}
          onChangeText={onChangeDraft}
          multiline
          textAlignVertical="top"
          placeholder="Type as you go — or after, in the car."
          placeholderTextColor={theme.colorTextTertiary}
          accessibilityLabel={`Notes from ${petName}’s visit`}
        />
        <ThemedText style={styles.savingLine}>
          Saved as you type · finish the visit when you’re out
        </ThemedText>
      </View>

      {questions.length > 0 ? (
        <View style={styles.block}>
          <SectionLabel label="Your questions" header style={styles.sectionLabel} />
          <View style={styles.rows}>
            {questions.map((q) => {
              const asked = !!q.asked_at;
              return (
                <TouchableOpacity
                  key={q.id}
                  style={styles.questionRow}
                  onPress={() => onToggleQuestion(q)}
                  activeOpacity={0.7}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: asked }}
                  accessibilityLabel={q.text}
                >
                  <View style={[styles.tick, asked && styles.tickOn]}>
                    {asked ? <Check size={14} color={theme.colorSurface} strokeWidth={3} /> : null}
                  </View>
                  {/* The struck-through state is carried by colour AND by the
                      checkbox role's own checked state, never by the line alone —
                      a strike is invisible to a screen reader and to anyone who
                      cannot see it. */}
                  <ThemedText style={[styles.questionText, asked && styles.questionAsked]}>
                    {q.text}
                  </ThemedText>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ) : null}

      <View style={styles.block}>
        <TouchableOpacity
          style={styles.paperwork}
          onPress={onPhotographPaperwork}
          activeOpacity={0.7}
          disabled={capturing}
          accessibilityRole="button"
          accessibilityLabel={`Photograph the paperwork for ${petName}`}
          accessibilityState={{ disabled: capturing }}
        >
          <Camera size={18} color={theme.colorAccentInk} strokeWidth={2} />
          <View style={styles.paperworkMain}>
            <ThemedText style={styles.paperworkTitle}>Photograph the paperwork</ThemedText>
            <ThemedText style={styles.paperworkSub}>
              {paperworkCount === 0
                ? `Goes to ${petName}’s Vet Files`
                : paperworkCount === 1
                  ? `1 photo in ${petName}’s Vet Files`
                  : `${paperworkCount} photos in ${petName}’s Vet Files`}
            </ThemedText>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pageTitle: {
    fontSize: theme.textXL,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    letterSpacing: theme.trackingTight,
  },
  pageSub: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    marginTop: 2,
  },
  block: {
    marginTop: theme.space3,
  },
  sectionLabel: {
    marginBottom: theme.space1,
  },
  notes: {
    // A TextInput is outside ThemedText's reach (the wrapper wraps Text), so the
    // field names its face directly — the C-2 carve-out.
    fontFamily: theme.fontBody,
    fontSize: theme.textMD,
    lineHeight: 22,
    color: theme.colorTextPrimary,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusMedium,
    backgroundColor: theme.colorSurface,
    paddingHorizontal: theme.space2,
    paddingTop: theme.space2,
    paddingBottom: theme.space2,
    minHeight: 160,
  },
  savingLine: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    marginTop: theme.space1,
  },
  rows: {
    borderRadius: theme.radiusMedium,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    overflow: 'hidden',
  },
  questionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
    paddingVertical: 11,
    paddingHorizontal: 12,
    // The row IS the target, so the floor is pinned on the box rather than left to
    // hitSlop arithmetic on the tick (C-5).
    minHeight: 48,
  },
  tick: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: theme.colorBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickOn: {
    backgroundColor: theme.colorAccentInk,
    borderColor: theme.colorAccentInk,
  },
  questionText: {
    flex: 1,
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
  },
  questionAsked: {
    color: theme.colorTextTertiary,
    textDecorationLine: 'line-through',
  },
  paperwork: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
    borderRadius: theme.radiusMedium,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    paddingHorizontal: 12,
    paddingVertical: 11,
    minHeight: 56,
  },
  paperworkMain: {
    flex: 1,
    minWidth: 0,
  },
  paperworkTitle: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  paperworkSub: {
    fontSize: theme.textXS,
    color: theme.colorTextSecondary,
    marginTop: 2,
  },
});
