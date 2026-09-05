// The incident screen's "What's visible" block (CUL-803 · incident spec §5.3; design
// authority round 2, frames S-A / S-A2 and the live fold demo).
//
// Shared by the vomit and stool sections for the same reason as `IncidentReadCard`: they
// rendered the same block twice and drifted apart on every touch.
//
// TWO COLUMNS, LABEL OVER VALUE. The shipped label-left/value-right row wasted the middle
// of the screen and pushed a four-finding read past the fold on a small phone. Cells stack
// their label above their value so a long value ("Possible — not identified") wraps inside
// its own column instead of squeezing the label.
//
// THE FOLD IS SEEN, NEVER RESOLVED (the Signal fold's rule, inherited). Folding hides
// FACTS the owner has already read; it never hides the READ — `IncidentReadCard` sits
// above this block and has no fold, so an escalation and its sentence are on screen at
// every fold state. The strip names some of the values and counts all of the rows
// (`observationStrip.ts`, where the honesty of that pairing is tested), and the strip
// itself is the way back: there is no timer and no rule that re-opens it, because the only
// thing that moves these facts is the owner editing them, and an owner editing is already
// looking at the open grid.
import { ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { theme } from '../../constants/theme';
import { ThemedText } from '../ui/ThemedText';
import { observationStripLine } from './observationStrip';
import { RAIL_WIDTH } from './IncidentReadCard';

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
}

export function ObservationGrid({
  rows,
  description,
  descriptionEdited,
  editedAtLabel,
  onEdit,
  editLabel,
  editor,
  folded,
  onToggleFold,
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
  folded: boolean;
  onToggleFold: (next: boolean) => void;
}) {
  const stripLine = observationStripLine(rows.map((r) => r.value));

  // The fold is offered only when there is a grid to fold AND a line to fold it to. An
  // editor open, or a block carrying only a description, keeps everything visible.
  const foldable = !editor && stripLine !== null;

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
        <ThemedText style={styles.stripHeading}>{OBSERVATIONS_HEADING}</ThemedText>
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
        <ThemedText style={styles.heading}>{OBSERVATIONS_HEADING}</ThemedText>
        {onEdit ? (
          <TouchableOpacity onPress={onEdit} hitSlop={16} accessibilityRole="button">
            <ThemedText style={styles.editLink}>{editLabel ?? 'Edit'}</ThemedText>
          </TouchableOpacity>
        ) : null}
      </View>

      {editor ?? (
        <>
          {rows.length > 0 ? (
            <View style={styles.grid}>
              {rows.map((r) => (
                <View key={r.key} style={styles.cell}>
                  {/* Uppercased by STYLE, not by `.toUpperCase()`: the label's own string
                      is what a test queries and what the clinical vocabulary is written in,
                      and mangling it in JS for a visual effect turns every assertion
                      about a finding’s name into an assertion about its casing. */}
                  <ThemedText style={styles.cellLabel}>{r.label}</ThemedText>
                  <View style={styles.cellValueRow}>
                    <ThemedText style={styles.cellValue}>{r.value}</ThemedText>
                    {r.secondary ? (
                      <ThemedText style={styles.cellSecondary}>{r.secondary}</ThemedText>
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    // Only `rowGap`. A `columnGap` here would push two 50% cells past 100% and wrap the
    // grid into a single column — the gutter is the cell's own `paddingRight` instead, so
    // the two-column arithmetic cannot be broken by a spacing token change (C-5's
    // re-derive-after-wrapping rule, applied before it can bite). These cells are inert
    // text, not controls, so no hit area depends on the separation.
    rowGap: theme.space1,
  },
  cell: {
    flexBasis: '50%',
    maxWidth: '50%',
    flexGrow: 0,
    flexShrink: 1,
    paddingRight: theme.space2,
    gap: 2,
  },
  cellLabel: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    letterSpacing: theme.trackingWidest,
    textTransform: 'uppercase',
  },
  cellValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  cellValue: {
    fontSize: theme.textSM,
    color: theme.colorTextPrimary,
    fontWeight: theme.fontWeightMedium,
    flexShrink: 1,
  },
  cellSecondary: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    flexShrink: 1,
  },
  // Per-field provenance marker — deliberately tertiary + small so it reads as a quiet
  // annotation, never an alarm (Designer / nyx-voice).
  editedTag: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    fontWeight: theme.fontWeightMedium,
  },
  descWrap: {
    marginTop: 6,
    gap: theme.spaceMicro,
  },
  description: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: 19,
  },
  editedLine: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    marginTop: 6,
  },
  foldControlRow: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
    marginTop: theme.space1,
    // The tap target, in the box rather than in a slop that would reach into the control
    // below it. Pinned explicitly because the floor depends on it (C-5).
    minHeight: 44,
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
    minHeight: 44,
  },
  stripRail: {
    width: RAIL_WIDTH,
    alignSelf: 'stretch',
    marginRight: theme.space1,
    marginVertical: theme.space1,
    borderRadius: 2,
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
