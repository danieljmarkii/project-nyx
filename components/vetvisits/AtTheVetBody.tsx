import { StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { Camera, Check } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { SectionLabel } from '../ui/SectionLabel';
import { ThemedText } from '../ui/ThemedText';
import type { AppointmentQuestion } from '../../lib/vetVisits';

interface Props {
  /** The RECORD's pet, via `resolveRecordPetName(pets, appointment.pet_id)` — CUL-574. */
  petName: string;
  /** 'Tuesday · Riverside · with Dr. Chen' — the appointment, as the owner sees it. */
  when: string;
  where: string;
  draft: string;
  onChangeDraft: (next: string) => void;
  questions: ReadonlyArray<AppointmentQuestion>;
  onToggleQuestion: (question: AppointmentQuestion) => void;
  /** Documents already photographed against this appointment, for the row's count. */
  paperworkCount: number;
  onPhotographPaperwork: () => void;
  capturing: boolean;
}

// The visit's notes (mock C1) — open from the moment the visit is booked.
//
// THE DESIGN CONSTRAINT IS THE ROOM, not the screen. Jordan is holding a dog and Sam
// has two carriers, so v1 is one plain-text field, a list of ticks, and one door for
// the paperwork. No toolbar, no rich text (G4: "bolding is probably not happening if
// we're jotting notes in the room"), no mic (G5 — the microphone is not in the
// submission binary at all).
//
// EVERY STRING HERE IS DATED, AND THAT USED TO BE FINE. This shipped as "At the vet",
// reachable only on the appointment's own day, so it could say *What the vet said*
// and *finish the visit when you're out* and be true. CUL-966 opened it at booking
// (PM: "I have wanted to start jotting down notes days in advance"), which makes an
// owner six weeks out the first reader of every one of those lines. So the copy is
// now anchored to the VISIT, which exists the whole time, rather than to the room,
// which is one afternoon of it — the field is still the same field, and the
// placeholder is what tells the owner it serves both moments.
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
      {/* The pet is NAMED in the title, so the sub-line carries only the appointment
          (the `GetReadyTitle` shape). A record screen says whose record it is
          (CUL-660) and says it once. */}
      <ThemedText style={styles.pageTitle}>Notes for {petName}’s visit</ThemedText>
      <ThemedText style={styles.pageSub}>
        {[when, where].filter(Boolean).join(' · ')}
      </ThemedText>

      <View style={styles.block}>
        <SectionLabel label="Notes" header style={styles.sectionLabel} />
        <TextInput
          style={styles.notes}
          value={draft}
          onChangeText={onChangeDraft}
          multiline
          textAlignVertical="top"
          // The placeholder does the work the section label used to: it names BOTH
          // moments this field serves, which is the whole of what changed when the
          // screen stopped being the day's.
          placeholder="Start now, add to it at the vet."
          placeholderTextColor={theme.colorTextTertiary}
          accessibilityLabel={`Notes for ${petName}’s visit`}
        />
        {/* Says what happens to the words, not when the owner is done with them:
            "finish the visit when you're out" was a true instruction on the day and
            a confusing one six weeks before it. */}
        <ThemedText style={styles.savingLine}>
          Saved as you type · kept with this visit
        </ThemedText>
      </View>

      {/* No questions section when none were prepared, and no empty state for it
          either. An empty state may be forward-looking; it may not ask for an action
          there is no door for (the rule VV-2's visit detail already carries) — and
          *Add a question* is VV-5's. In a room where the owner is holding an animal,
          a line saying they prepared nothing is chrome that only shames. */}
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
          // `disabled` here is a TRUE claim — the control exists and is busy — so it
          // is paired with a label that says why (C-7). An unexplained "dimmed" is
          // what makes a screen reader report a dead end.
          accessibilityLabel={
            capturing ? 'Saving the photo' : `Photograph the paperwork for ${petName}`
          }
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
