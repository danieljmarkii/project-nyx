// The incident screen's "What's visible" block (CUL-803 · incident spec §5.3; design
// authority round 2, frames S-A / S-A2 and the live fold demo).
//
// Shared by the vomit and stool sections for the same reason as `IncidentReadCard`: they
// rendered the same block twice and drifted apart on every touch.
//
// ONE ROW PER FINDING, UNDER HAIRLINES (CUL-1912, the event detail round's P7). The label
// sits left at caption size and the value right at body size, so the values a vet reads are
// the larger type; a long value wraps inside its own half rather than the two-column grid's
// ragged wrap at 320pt and the largest text. The row order stays the builders' order.
//
// THE FOLD IS SEEN, NEVER RESOLVED (the Signal fold's rule, inherited). Folding hides
// FACTS the owner has already read; it never hides the READ — `IncidentReadCard` sits
// above this block and has no fold, so an escalation and its sentence are on screen at
// every fold state. The strip names some of the values and counts all of the rows
// (`observationStrip.ts`, where the honesty of that pairing is tested), and the strip
// itself is the way back.
//
// TWO RULES THE FIRST CUT DID NOT HAVE, both from the adversarial pass:
//
//  1. AN ESCALATION'S FACTS DO NOT FOLD (`foldable` gates on `escalating`). The named
//     slots are spent in row order, and every builder pushes the descriptive rows first —
//     so on a fully-populated read, Blood, Mucus and Foreign material are ALWAYS the rows
//     compressed to a count. On a `worth_a_call` that puts the verdict on screen and every
//     fact justifying it behind a tap, on the one surface D3 exists so an owner can turn
//     the phone around to a vet. Rather than rank the rows clinically — a second symptom
//     predicate, which the house forbids — the acute case simply does not fold. That is
//     the Signal fold's own DF-2 shape: standing findings fold, acute ones never.
//     "Escalating" is the caller's fact, not only the stored verdict: an owner edit writes
//     the fields and leaves the verdict alone, so a quiet read can carry an owner-set red
//     flag, and the sections pass that too (`vomitRedFlagPresent` / `stoolRedFlagPresent`,
//     CUL-2142).
//  2. THE RECORD RE-OPENS A FOLD. The first cut argued no re-open rule was needed because
//     "the only thing that moves these facts is the owner editing them, and an owner
//     editing is already looking at the open grid." That is false, and the counterexample
//     sits directly under the strip: `Re-run analysis` is rendered in the folded state,
//     and a re-analysis (or a late realtime resolution, or the add-photo re-read) lands
//     new observations into a folded grid — a new blood finding arriving unseen. So the
//     host releases the fold when the observation set changes (`useObservationFold`),
//     which is the fold spec's rule verbatim: the record re-opens a fold, the calendar
//     never.
import { ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { textStyles, theme } from '../../constants/theme';
import { ThemedText } from '../ui/ThemedText';
import { observationStripLine } from './observationStrip';
import { RAIL_WIDTH } from './IncidentReadCard';
import { TICK_MOTION } from '../surfaces/waits/Tick';

export const OBSERVATIONS_HEADING = "What's visible";
/** The same control word the Signal fold uses — one vocabulary for one gesture. */
export const OBSERVATION_FOLD_LABEL = 'Keep it compact';
// Deliberately NOT the Signal fold's hint: that one promises the card comes back on its
// own when the picture changes, and this fold has no such rule (see the header). A hint
// that over-promises a return is worse than none.
export const OBSERVATION_FOLD_HINT = 'Folds these findings to one line. Tap the line to open them again.';
export const OBSERVATION_UNFOLD_HINT = 'Opens these findings.';

export interface ObservationRow {
  /** Stable across renders — the editable field key, not the label. */
  key: string;
  label: string;
  value: string;
  /** A quieter detail beside the value — the stool section's Bristol type, which leads
   *  with the plain-language texture and keeps the clinical scale secondary (§3.4). Never
   *  part of the folded strip's named values: the strip names what the row IS. */
  secondary?: string | null;
  edited: boolean;
  /** The row's stored value is its field's absence enum, decided by the caller from the
   *  enum (CUL-828): the folded strip keeps the label beside it. */
  absence?: boolean;
}

export function ObservationGrid({
  rows,
  description,
  descriptionEdited,
  editedAtLabel,
  onEdit,
  editLabel,
  editor,
  escalating,
  folded,
  onToggleFold,
  heading = OBSERVATIONS_HEADING,
}: {
  rows: readonly ObservationRow[];
  description?: string | null;
  descriptionEdited?: boolean;
  /** The single calm provenance line, already formatted ("Edited Jun 22"). */
  editedAtLabel?: string | null;
  /** Null when the row is not editable (dismissed, still pending, failed). */
  onEdit?: (() => void) | null;
  editLabel?: string;
  /** When given, the editor replaces the grid and the fold is not offered. */
  editor?: ReactNode;
  /** The read is a call, or a red-flag field reads present under any verdict. Its facts
   *  never fold — see rule 1 in the header. */
  escalating?: boolean;
  folded: boolean;
  onToggleFold: (next: boolean) => void;
  /** The block's heading. "What's visible" unless the facts describe a read the one on
   *  screen replaced (CUL-819 (a): "From the earlier read" under a held call). */
  heading?: string;
}) {
  const stripLine = observationStripLine(rows);

  // The fold is offered only when there is a grid to fold AND a line to fold it to. An
  // editor open, a block carrying only a description, or an ESCALATING read (header rule
  // 1) keeps everything visible.
  const foldable = !editor && !escalating && stripLine !== null;

  if (foldable && folded) {
    return (
      <TouchableOpacity
        style={styles.strip}
        onPress={() => onToggleFold(false)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityHint={OBSERVATION_UNFOLD_HINT}
      >
        <View style={styles.stripRail} />
        {/* THREE nodes, not one string, and the split is load-bearing twice over.
            (1) The heading carries a weight the others do not, and under an explicit family
            a nested weight is inert (C-2). (2) Only separate nodes can be pinned
            separately: the heading and the COUNT are `flexShrink: 0` + `maxWidth: '100%'`
            (the AC-CHIP composition C-8 names) and the named values are the one node that
            ellipses. The count is what makes naming three of four rows honest instead of
            silently partial (C-3) — clipping it would delete the strip's own admission
            that it is a summary, while the values it clips are restored by the tap this
            row already is.
            Each node after the first carries its own leading separator, so the grouped
            announcement reads as the one sentence it looks like and needs no invented
            label (C-7). */}
        <ThemedText style={styles.stripHeading}>{heading}</ThemedText>
        <ThemedText style={styles.stripNamed} numberOfLines={1}>
          {` · ${stripLine.named}`}
        </ThemedText>
        <ThemedText style={styles.stripCount}>{` · ${stripLine.count}`}</ThemedText>
        {/* geist-ok: icon glyph, not copy — stays a raw <Text> and keeps the system face.
            Geist carries no › in any loaded weight, so sweeping one buys OS fallback for
            nothing. Matches `InsightCard`'s own strip chevron and CUL-364 §7. */}
        <Text style={styles.stripChevron}>›</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.block}>
      <View style={styles.headerRow}>
        <ThemedText style={styles.heading}>{heading}</ThemedText>
        {onEdit ? (
          <TouchableOpacity onPress={onEdit} hitSlop={16} accessibilityRole="button">
            <ThemedText style={styles.editLink}>{editLabel ?? 'Edit'}</ThemedText>
          </TouchableOpacity>
        ) : null}
      </View>

      {editor ?? (
        <>
          {rows.length > 0 ? (
            <View style={styles.rows}>
              {rows.map((r, i) => (
                <View key={r.key} testID={`observation-row-${r.key}`} style={[styles.row, i > 0 ? styles.rowRule : null]}>
                  <ThemedText style={styles.rowLabel}>{r.label}</ThemedText>
                  <View style={styles.rowValue}>
                    <ThemedText style={styles.value}>{r.value}</ThemedText>
                    {r.secondary ? (
                      <ThemedText style={styles.valueSecondary}>{r.secondary}</ThemedText>
                    ) : null}
                    {r.edited ? <ThemedText style={styles.editedTag}>Edited</ThemedText> : null}
                  </View>
                </View>
              ))}
            </View>
          ) : null}
          {description ? (
            <View style={styles.descWrap}>
              <ThemedText style={styles.description}>{description}</ThemedText>
              {descriptionEdited ? <ThemedText style={styles.editedTag}>Edited</ThemedText> : null}
            </View>
          ) : null}
          {/* One calm provenance line — never alarming (nyx-voice). The per-field markers
              say WHAT changed; this says WHEN. */}
          {editedAtLabel ? (
            <ThemedText style={styles.editedLine}>{editedAtLabel}</ThemedText>
          ) : null}
          {/* No `hitSlop` (C-5). This control's next sibling is the section's own
              `Re-run analysis`, flush beneath it with no separation — two slopped
              touchables facing each other at a zero gap is the overlap C-5 exists to
              stop, and the fix for controls that are already flush is to grow the BOX
              rather than the slop. `minHeight` carries the 44pt floor instead. */}
          {foldable ? (
            <TouchableOpacity
              onPress={() => onToggleFold(true)}
              style={styles.foldControlRow}
              accessibilityRole="button"
              accessibilityHint={OBSERVATION_FOLD_HINT}
            >
              <ThemedText style={styles.foldControl}>{OBSERVATION_FOLD_LABEL}</ThemedText>
            </TouchableOpacity>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    marginTop: theme.space2,
    gap: theme.spaceMicro,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spaceMicro,
  },
  heading: {
    fontSize: theme.textSM,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorTextSecondary,
  },
  editLink: {
    fontSize: theme.textSM,
    color: theme.colorAccentInk,
    fontWeight: theme.fontWeightMedium,
  },
  rows: {
    marginTop: theme.space0_5,
  },
  // Label and value share the row's baseline; each takes the room it needs and wraps in
  // its own half, so neither squeezes the other off the line.
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    columnGap: theme.space1_5,
    paddingVertical: theme.space1,
  },
  rowRule: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colorBorder,
  },
  rowLabel: {
    ...textStyles.caption,
    color: theme.colorTextSecondary,
    flexShrink: 0,
    maxWidth: '45%',
  },
  rowValue: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    alignItems: 'baseline',
    columnGap: theme.space0_75,
  },
  value: {
    ...textStyles.body,
    color: theme.colorTextPrimary,
    textAlign: 'right',
    flexShrink: 1,
  },
  valueSecondary: {
    ...textStyles.caption,
    color: theme.colorTextTertiary,
  },
  // Per-field provenance marker — deliberately tertiary + small so it reads as a quiet
  // annotation, never an alarm (Designer / nyx-voice).
  editedTag: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    fontWeight: theme.fontWeightMedium,
  },
  descWrap: {
    marginTop: theme.space0_75,
    gap: theme.spaceMicro,
  },
  description: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightSMLoose,
  },
  editedLine: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    marginTop: theme.space0_75,
  },
  foldControlRow: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
    marginTop: theme.space1,
    // The tap target, in the box rather than in a slop that would reach into the control
    // below it. Pinned explicitly because the floor depends on it (C-5).
    minHeight: theme.hitTarget,
  },
  foldControl: {
    fontSize: theme.textXS,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorTextSecondary,
  },
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    // No `gap`: each text node carries its own leading separator, so a row gap would
    // render a second one beside every "·". The rail and the chevron space themselves.
    marginTop: theme.space2,
    paddingVertical: theme.space1,
    // The floor an adjacent-control geometry depends on is pinned explicitly (C-5); the
    // strip is the only control in its row, so nothing faces it, but the tap target must
    // still clear 44pt for a thumb at 2am.
    minHeight: theme.hitTarget,
  },
  stripRail: {
    width: RAIL_WIDTH,
    alignSelf: 'stretch',
    marginRight: theme.space1,
    marginVertical: theme.space1,
    borderRadius: TICK_MOTION.radius,
    backgroundColor: theme.colorBorderStrong,
  },
  // Pinned halves: `flexShrink: 0` PLUS `maxWidth: '100%'` — without the max-width a
  // protected node overflows instead of ellipsing when it alone overruns the line (C-8).
  stripHeading: {
    fontSize: theme.textSM,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorTextSecondary,
    flexShrink: 0,
    maxWidth: '100%',
  },
  stripCount: {
    fontSize: theme.textSM,
    color: theme.colorTextTertiary,
    flexShrink: 0,
    maxWidth: '100%',
  },
  // The one node that yields.
  stripNamed: {
    fontSize: theme.textSM,
    color: theme.colorTextTertiary,
    flexShrink: 1,
  },
  stripChevron: {
    fontSize: theme.textMD,
    color: theme.colorTextTertiary,
    marginLeft: 'auto',
    paddingLeft: theme.space1,
  },
});
