import { Pressable, View, StyleSheet } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { theme, shadows } from '../../constants/theme';
import {
  NOTICED_ABSENCE_GROUP,
  NOTICED_CARD_LABEL,
  NOTICED_POSITIVE_GROUP,
  type NoticedCardModel,
  type NoticedRow,
} from '../../lib/lookPatterns';
import { ThemedText } from '../ui/ThemedText';

// *What you noticed* — the daily look's read-back on Patterns (CUL-874 / N-5).
//
// docs/nyx-daily-look-requirements.md §7; the model is `lib/lookPatterns.buildNoticedCard`.
//
// THIS FILE DERIVES NOTHING. Every number, every sentence and the row order arrive in
// `model`; the component picks a weight and a slot for each. That is not tidiness — a
// denominator computed in a renderer is a denominator no test can reach without a
// renderer, and this card's denominators are claims about an animal.
//
// ── THE THREE WEIGHTS (§7, and the round-4 product read) ────────────────────
// The review found six rows at one weight, so "symptoms, then absence, then positives"
// never reached the reader. So: symptom-class rows in the PRIMARY ink at body size; the
// observed absence and the activity positives in the secondary ink, under their own group
// labels. The order is the model's; the weight is the row's own `weight` field, so a
// renderer cannot promote a positive by putting it first.
//
// ── THE GREYSCALE TEST ───────────────────────────────────────────────────────
// Printed in grey this card must still be a list of counts with denominators and nothing
// that reads as a verdict. There is therefore NO tone colour anywhere below — no rose on
// a symptom row, no accent on a positive, no delta arrow, no bar, no sparkline. A row is
// a label, a sub-line and a fraction. §7's Never list is enforced by there being no code
// here that could draw any of it.
//
// ── THE COUNT'S UNIT WORD SITS ON THE FIRST ROW ONLY ────────────────────────
// *3 of 24 days*, then *19 of 24*. The mock's own shape, and C-3's rule: the scope goes
// where the reader first meets the claim, not restated on every line where it becomes
// noise. Under the withheld state the denominator is `null` and the row reads *3 days* —
// a bare numerator, because the answered-day total is the number item 12 refuses and a
// renderer must never invent one (see `lib/lookPatterns.ts`, reading 3).

interface Props {
  model: NoticedCardModel;
  onPress: () => void;
  testID?: string;
}

/** A row's fraction, as it reads on screen AND to a screen reader. `withUnit` puts the
 *  noun on the first row only; a `null` denominator drops the "of M" entirely. */
export function noticedRowValue(row: NoticedRow, withUnit: boolean): string {
  const noun = row.days === 1 ? 'day' : 'days';
  // A bare numerator ALWAYS carries the noun, on every row: without the denominator a
  // naked "3" says nothing at all, and the withheld state is the one place a reader
  // cannot infer the unit from the row above.
  if (row.denominator === null) return `${row.days} ${noun}`;
  return withUnit ? `${row.days} of ${row.denominator} ${noun}` : `${row.days} of ${row.denominator}`;
}

export function WhatYouNoticedCard({ model, onPress, testID }: Props) {
  const symptomRows = model.rows.filter((r) => r.weight === 'symptom');
  const absenceRows = model.rows.filter((r) => r.weight === 'absence');
  const positiveRows = model.rows.filter((r) => r.weight === 'positive');

  // The whole card as one announcement. A screen-reader user must hear the DENOMINATOR
  // before the counts (it is what stops each count being misread) and the withheld
  // sentence in full — a state whose entire content is an explanation is the one that
  // must not be reduced to "What you noticed, button".
  const say = (rows: NoticedRow[], group: string | null) =>
    rows.length === 0
      ? []
      : [
          // The group label is spoken, not just drawn. "Marked — the owner's claim" is
          // half the honesty of the absence row, and without this it reached only a
          // sighted reader (the product read, CUL-874).
          ...(group ? [group] : []),
          ...rows.map(
            (r, i) =>
              `${r.label}, ${noticedRowValue(r, i === 0)}` +
              (r.detail.length > 0 ? `. ${r.detail.join('. ')}` : ''),
          ),
        ];
  const a11yLabel = [
    NOTICED_CARD_LABEL,
    // The withheld sentence and the denominator lead the announcement for the same
    // reason they lead the card: they are what stops every count below being misread.
    model.withheldLine,
    model.withheldSpanLine,
    model.coverageLine,
    ...say(symptomRows, null),
    ...say(absenceRows, NOTICED_ABSENCE_GROUP),
    ...say(positiveRows, NOTICED_POSITIVE_GROUP),
    model.multiSelectNote,
    model.calibrationLine,
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint="Opens every look in the record"
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      testID={testID ?? 'what-you-noticed-card'}
    >
      <View style={styles.headerRow}>
        <ThemedText style={styles.title}>{NOTICED_CARD_LABEL}</ThemedText>
        <ChevronRight size={18} color={theme.colorTextDisabled} />
      </View>

      {/* The denominator, as the act — always first, never a miss (§7, G9). Absent under
          the withheld state (the answered-day total is the refused number) and below the
          coverage floor (the calibration line says the same number once).

          THE WITHHELD SENTENCE TAKES ITS SLOT. It used to render after the rows, which
          put the explanation below the thing it explains: an owner met *Off · 3 days*
          with nothing above it, tried to parse a count in a shape she has never seen on
          this card, and only then found out why. The component's own a11y rule — the
          denominator is announced BEFORE the counts, because it is what stops each count
          being misread — is exactly as true of the sentence that stands in for it. Found
          by the product read (CUL-874). */}
      {model.withheldLine != null && (
        <ThemedText style={styles.withheld} testID="noticed-withheld">
          {model.withheldLine}
        </ThemedText>
      )}
      {/* The withheld card's span. Without it the rows below pair a 28-day count with a
          date from the whole record and no window anywhere — *Off · 1 day · first marked
          Aug 2* read as "one day since August" (C-19). */}
      {model.withheldSpanLine != null && (
        <ThemedText style={styles.coverage} testID="noticed-withheld-span">
          {model.withheldSpanLine}
        </ThemedText>
      )}
      {model.coverageLine != null && (
        <ThemedText style={styles.coverage} testID="noticed-coverage">
          {model.coverageLine}
        </ThemedText>
      )}

      {symptomRows.length > 0 && (
        <View style={styles.rows}>
          {symptomRows.map((row, i) => (
            <Row key={row.key} row={row} withUnit={i === 0} weightStyle={styles.symptomLabel} />
          ))}
        </View>
      )}

      {/* The observed absence, under its own label AS THE OWNER'S CLAIM — never as
          something the app observed. The label is half the honesty of the row. */}
      {absenceRows.length > 0 && (
        <>
          <ThemedText style={styles.groupLabel}>{NOTICED_ABSENCE_GROUP}</ThemedText>
          <View style={styles.rows}>
            {absenceRows.map((row) => (
              <Row
                key={row.key}
                row={row}
                withUnit
                weightStyle={styles.quietLabel}
                quietValue
              />
            ))}
          </View>
        </>
      )}

      {positiveRows.length > 0 && (
        <>
          <ThemedText style={styles.groupLabel}>{NOTICED_POSITIVE_GROUP}</ThemedText>
          <View style={styles.rows}>
            {positiveRows.map((row, i) => (
              <Row
                key={row.key}
                row={row}
                withUnit={i === 0}
                weightStyle={styles.quietLabel}
                quietValue
              />
            ))}
          </View>
        </>
      )}

      {/* The multi-select clause — §8's, owed here too. Without it a reader adds the
          column, gets more than the denominator, and concludes the card is broken. */}
      {model.multiSelectNote != null && (
        <ThemedText style={styles.footnote} testID="noticed-multiselect">
          {model.multiSelectNote}
        </ThemedText>
      )}

      {/* The calibration line — what the record HAS, never what it is missing (P5, G8). */}
      {model.calibrationLine != null && (
        <ThemedText style={styles.calibration} testID="noticed-calibration">
          {model.calibrationLine}
        </ThemedText>
      )}
    </Pressable>
  );
}

/** One row: label · fraction, with its sub-lines beneath.
 *
 *  The sub-lines are their own `<ThemedText>` per entry (T-15 — nothing of one kind
 *  shares a line with another). The PAIRING's own string carries a newline inside it, so
 *  its fraction and its L-17 disclosure render as two lines from ONE value that no
 *  renderer can split — see `lib/lookPairing.ts`. */
function Row({
  row,
  withUnit,
  weightStyle,
  quietValue,
}: {
  row: NoticedRow;
  withUnit: boolean;
  weightStyle: object;
  quietValue?: boolean;
}) {
  return (
    <View testID={`noticed-row-${row.key}`}>
      <View style={styles.row}>
        <ThemedText style={[styles.rowLabel, weightStyle]}>{row.label}</ThemedText>
        <ThemedText style={[styles.rowValue, quietValue && styles.rowValueQuiet]}>
          {noticedRowValue(row, withUnit)}
        </ThemedText>
      </View>
      {row.detail.map((line) => (
        <ThemedText key={line} style={styles.detail}>
          {line}
        </ThemedText>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colorSurface,
    borderRadius: theme.radiusMedium,
    padding: theme.space3,
    gap: theme.space1,
    ...shadows.md,
  },
  pressed: {
    backgroundColor: theme.colorSurfaceSubtle,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: theme.textMD,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    flexShrink: 1,
  },
  // The denominator line carries safety weight — it is why every count below it can't be
  // misread — so it is legible body text, not fine print (the pm-feature-review's
  // hierarchy note on the sibling panel).
  coverage: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightSM,
  },
  groupLabel: {
    fontSize: theme.textXS,
    fontWeight: theme.weightMedium,
    color: theme.colorTextTertiary,
    textTransform: 'uppercase',
    letterSpacing: theme.trackingWide,
    marginTop: theme.space1,
  },
  rows: {
    gap: theme.space0_5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space2,
  },
  rowLabel: {
    fontSize: theme.textSM,
    flexShrink: 1,
  },
  symptomLabel: {
    color: theme.colorTextPrimary,
    fontWeight: theme.weightMedium,
  },
  quietLabel: {
    color: theme.colorTextSecondary,
  },
  rowValue: {
    fontSize: theme.textSM,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    // Tabular figures so a column of fractions does not jitter between 3 and 19 (R14's
    // rule for the coverage footer, and the same reason applies to a stack of them).
    fontVariant: ['tabular-nums'],
    // The fraction is the half stated fewest times on this surface, so it is the half
    // protected from the squeeze — the label wraps or truncates first (C-8).
    flexShrink: 0,
    maxWidth: '100%',
  },
  rowValueQuiet: {
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
  },
  detail: {
    fontSize: theme.textXS,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightXS,
  },
  withheld: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightSM,
    marginTop: theme.space1,
  },
  footnote: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    lineHeight: theme.lineHeightXS,
    marginTop: theme.space1,
  },
  calibration: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightSM,
  },
});
