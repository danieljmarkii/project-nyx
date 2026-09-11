import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { theme } from '../../constants/theme';
import { Card } from '../ui/Card';
import { ThemedText } from '../ui/ThemedText';
import type { WorthRaising } from '../../lib/getReady';
import type { AppointmentQuestion } from '../../lib/vetVisits';

// "Worth raising" / "Your questions" — ONE list (CUL-903 VV-5; mock B1 / B1b).
//
// ── ONE LIST, TWO HEADINGS, AND THAT IS THE MOCK ─────────────────────────────────
// B1 draws a single numbered card holding the record's rows AND the owner's, each
// with its source named underneath ("from the Signal" … "added by you"), headed
// *Worth raising*. B1b — a quiet record — draws the same card with only the add row
// in it, headed *Your questions*. So the heading follows the CONTENT: it names the
// record's voice when the record has one, and the owner's when it does not.
//
// The alternative (two separate cards, always both) was rejected because B1b would
// then render an empty *Worth raising* card, and the one thing this section may
// never do is announce an absence. Silence about the record is a coverage fact, not
// wellness — the rundown's "None logged in 30 days" is the only sentence about it,
// and it carries its own denominator.
//
// ── THE CAP BINDS THE RECORD'S ROWS, NOT THE OWNER'S ─────────────────────────────
// Jordan's four is a cap on what the APP puts in front of her. Applying it to the
// merged list would mean typing a fifth question deletes a Signal finding — the app
// quietly discarding a safety sentence because the owner had a lot to ask. The
// owner's list has its own, much larger bound (`QUESTION_LIST_MAX`), enforced where
// she can see it.

interface Props {
  worthRaising: WorthRaising;
  questions: AppointmentQuestion[];
  onAdd: () => void;
  onRemove: (questionId: string) => void;
  petName: string;
}

export function WorthRaisingList({ worthRaising, questions, onAdd, onRemove, petName }: Props) {
  const { rows, signalUnavailable } = worthRaising;
  const heading = rows.length > 0 ? 'Worth raising' : 'Your questions';

  return (
    <View style={styles.section}>
      <ThemedText style={styles.label}>{heading}</ThemedText>
      <Card noPadding>
        {rows.map((row, i) => (
          <Row
            key={row.id}
            n={i + 1}
            text={row.text}
            detail={row.detail}
            source={row.sourceLabel}
          />
        ))}
        {questions.map((q, i) => (
          <Row
            key={q.id}
            n={rows.length + i + 1}
            text={q.text}
            detail={null}
            source="added by you"
            onRemove={() => confirmRemove(q, onRemove)}
          />
        ))}

        {/* The gap named, never swallowed (C-12). The Signal's findings live in a cache
            this device reads over the network — the same read Home makes — so they can
            be missing for two reasons: the read failed (offline), or the engine has
            never run for this pet. Both mean the list may be incomplete, and the copy
            says only that, without claiming which. An owner who cannot tell "nothing
            standing" from "we could not look" reads the first and walks into the room
            reassured, which is the one direction this page may not fail in.
            Everything else here came from local SQLite and IS complete. */}
        {signalUnavailable ? (
          <View style={styles.gap}>
            <ThemedText style={styles.gapText}>
              {petName}’s Signal couldn’t be read on this device, so anything it has flagged
              isn’t in this list. The rundown below is from this device and is complete.
            </ThemedText>
          </View>
        ) : null}

        <Pressable
          onPress={onAdd}
          accessibilityRole="button"
          accessibilityLabel="Add a question for the vet"
          style={styles.addRow}
        >
          {/* geist-ok: a glyph standing in for a plus icon, not copy. */}
          <ThemedText style={styles.addGlyph}>+</ThemedText>
          <ThemedText style={styles.addText}>Add a question</ThemedText>
        </Pressable>
      </Card>
    </View>
  );
}

/**
 * A question is the owner's own words, typed once and carried into the exam room as
 * a tick (VV-4) — so a typo with no way back would ride into the visit and stay on
 * the visit afterwards. It is also not recreatable by an undo, which under C-21
 * means the safety net is a CONFIRM: exactly one, before.
 */
function confirmRemove(q: AppointmentQuestion, onRemove: (id: string) => void) {
  Alert.alert('Remove this question?', q.text, [
    { text: 'Keep it', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: () => onRemove(q.id) },
  ]);
}

const REMOVE_HIT = { top: 10, bottom: 10, left: 10, right: 10 };

function Row({
  n,
  text,
  detail,
  source,
  onRemove,
}: {
  n: number;
  text: string;
  detail: string | null;
  source: string;
  onRemove?: () => void;
}) {
  const body = (
    <>
      <ThemedText style={styles.rowText}>{text}</ThemedText>
      {detail ? <ThemedText style={styles.rowDetail}>{detail}</ThemedText> : null}
      <ThemedText style={styles.rowSource}>{source}</ThemedText>
    </>
  );

  // SPLIT BY HOST (C-7): a record-derived row has no control at all, so it is an
  // inert `View` marked `accessible` — one sentence to a screen reader — rather than
  // a touchable claiming a control that does not exist. Only an owner's row gets the
  // remove affordance, and it is its own responder so a press on the text cannot
  // reach it.
  return (
    <View style={styles.row} accessible={!onRemove} accessibilityLabel={!onRemove ? `${text}. ${source}` : undefined}>
      <ThemedText style={styles.rowNumber}>{n}</ThemedText>
      <View style={styles.rowBody}>{body}</View>
      {onRemove ? (
        <Pressable
          onPress={onRemove}
          hitSlop={REMOVE_HIT}
          accessibilityRole="button"
          accessibilityLabel={`Remove the question: ${text}`}
          style={styles.remove}
        >
          {/* geist-ok: glyph-only. */}
          <ThemedText style={styles.removeGlyph}>×</ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: theme.space1 },
  label: {
    fontSize: theme.textSM,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextSecondary,
    paddingHorizontal: theme.space1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    // The remove control is the only touchable in the row and its nearest touchable
    // neighbour is the NEXT row's, which the vertical padding already separates by
    // more than the facing slop (C-5). The horizontal gap is layout, not reach.
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: theme.colorBorder,
  },
  rowNumber: {
    fontSize: theme.textSM,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextTertiary,
    minWidth: 14,
    // Optical alignment with the first line of the row text, which is a notch larger.
    marginTop: 1,
  },
  rowBody: { flex: 1, minWidth: 0, gap: 2 },
  rowText: {
    fontSize: theme.textMD,
    lineHeight: theme.lineHeightBody,
    color: theme.colorTextPrimary,
  },
  rowDetail: {
    fontSize: theme.textXS,
    lineHeight: theme.lineHeightXS,
    color: theme.colorTextSecondary,
  },
  rowSource: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
  },
  remove: {
    minHeight: 24,
    minWidth: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeGlyph: {
    fontSize: theme.textMD,
    color: theme.colorTextTertiary,
  },
  gap: {
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: theme.colorBorder,
  },
  gapText: {
    fontSize: theme.textXS,
    lineHeight: theme.lineHeightXS,
    color: theme.colorTextSecondary,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 15,
    minHeight: 44,
  },
  addGlyph: {
    fontSize: theme.textMD,
    fontWeight: theme.weightSemibold,
    color: theme.colorAccentInk,
    minWidth: 14,
  },
  addText: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorAccentInk,
  },
});
