import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { theme, shadows } from '../../constants/theme';
import { VetDocumentThumb } from './VetDocumentThumb';
import type { VetLibraryRow } from '../../lib/vetDocumentLibrary';

interface Props {
  row: VetLibraryRow;
  /** Resolved thumbnail source (local file or signed URL). */
  thumbUri?: string | null;
  thumbLoading?: boolean;
  onPress: () => void;
  onName: () => void;
  onAddType: () => void;
}

// One library row (mock L-real).
//
// This row is designed around the state the app actually produces, not the one a
// mock is tempted to draw. Capture asks nothing (D11), so week one is a column of
// untitled, kind-less documents — and round 1's curated library "nobody typed" was
// replaced for exactly that reason. Two affordances carry the recovery:
//
//   • an untitled row swaps its chevron for a one-tap **Name** pill, so the fix is
//     where the problem is visible rather than two screens away;
//   • a kind-less row carries a dashed **Add type** chip, which is an invitation in
//     the shape of the thing it produces (a solid kind chip).
//
// Both are the sanctioned alternative to asking at capture, so neither is optional
// decoration — remove them and the zero-decision save has no counterpart.
//
// B-546 adds a THIRD, and it is the one that carries the PDF case. The two above
// are recoveries the owner has to perform; a filename is one the app already has.
// A PDF gets no thumbnail by design (D5), so two lab results pulled from one clinic
// portal on one day were previously identical rows down to the pixel — same glyph,
// same "Document — Jul 14", same dashed chip, same date. The `fileLabel` line is
// what tells them apart before anything is tapped, and it renders BESIDE the
// default title rather than as it, so the Name pill survives (the PM's ruling on
// B-546: option (b), not (a)).
export function VetDocumentRow({
  row, thumbUri, thumbLoading, onPress, onName, onAddType,
}: Props) {
  // Spoken as one sentence: an untitled row's title already carries its date, so
  // the meta line would repeat it. Pages and type are what a screen reader adds.
  //
  // The filename comes LAST and only when present. It is the longest and least
  // pronounceable part of the row, and it is a tiebreaker rather than a headline —
  // a screen-reader user scanning a list wants the type and the page count first
  // and reaches the filename only if the rest didn't settle it.
  const spoken = [
    row.title,
    row.kindLabel,
    row.pageLabel,
    row.untitled ? null : row.dateLabel,
    row.fileLabel,
  ].filter(Boolean).join(', ');

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={spoken}
    >
      <VetDocumentThumb uri={thumbUri} isPdf={row.isPdf} loading={thumbLoading} />

      <View style={styles.main}>
        <Text
          style={[styles.title, row.untitled && styles.titleUntitled]}
          numberOfLines={1}
        >
          {row.title}
        </Text>
        <View style={styles.meta}>
          {row.kindLabel ? (
            <View style={styles.kindChip}>
              <Text style={styles.kindText}>{row.kindLabel}</Text>
            </View>
          ) : (
            <TouchableOpacity
              // The dashed border lives on this View, not on the Text: RN only
              // renders borderStyle reliably on a View.
              style={[styles.kindChip, styles.kindChipEmpty]}
              onPress={onAddType}
              activeOpacity={0.7}
              // The chip is ~20pt tall inside a row that is already tappable, so
              // the slop is what carries it to the 44pt floor without inflating
              // the visual weight of an invitation.
              hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={`Add a type to ${row.title}`}
            >
              <Text style={[styles.kindText, styles.kindTextEmpty]}>Add type</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.date}>{row.dateLabel}</Text>
          {row.pageLabel ? <Text style={styles.pages}>{row.pageLabel}</Text> : null}
        </View>
        {/* B-546 — its own line rather than another item in the meta row above.
            The meta row wraps (flexWrap), so a 40-character filename in it would
            push the date and the page count onto a second line and change the
            row's height per-document; on its own line the row's anatomy is the
            same whether a filename exists or not.

            Truncated in the MIDDLE, which is the whole point for this string:
            head-truncation would eat the extension and tail-truncation would eat
            the part that differs — "CBC-Pixel-2026-07…" and
            "Chem-Pixel-2026-07…" are two rows this line exists to separate. */}
        {row.fileLabel ? (
          <Text style={styles.file} numberOfLines={1} ellipsizeMode="middle">
            {row.fileLabel}
          </Text>
        ) : null}
      </View>

      {row.untitled ? (
        <TouchableOpacity
          style={styles.namePill}
          onPress={onName}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={`Name this document from ${row.dateLabel}`}
        >
          <Text style={styles.namePillText}>Name</Text>
        </TouchableOpacity>
      ) : (
        <ChevronRight size={18} color={theme.colorTextDisabled} strokeWidth={2} />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: theme.colorSurface,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusMedium,
    paddingVertical: 10,
    paddingHorizontal: 12,
    ...shadows.sm,
  },
  main: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
    letterSpacing: theme.trackingTight,
  },
  // Quieter, not greyed-out-disabled: the document is perfectly real, it just
  // hasn't been named. Weight carries that better than colour alone.
  titleUntitled: {
    fontWeight: theme.weightRegular,
    color: theme.colorTextSecondary,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  kindChip: {
    backgroundColor: theme.colorSurfaceSubtle,
    borderRadius: theme.radiusXS,
    paddingHorizontal: 5,
    paddingVertical: 2,
    // Transparent hairline so the solid and dashed chips share a box size and the
    // meta line doesn't shift by a pixel when a type is finally set.
    borderWidth: 1,
    borderColor: 'transparent',
  },
  kindChipEmpty: {
    backgroundColor: 'transparent',
    borderStyle: 'dashed',
    borderColor: theme.colorBorderStrong,
  },
  kindText: {
    fontSize: theme.textMicro,
    fontWeight: theme.weightSemibold,
    letterSpacing: theme.trackingWide,
    textTransform: 'uppercase',
    color: theme.colorTextSecondary,
  },
  kindTextEmpty: {
    color: theme.colorTextTertiary,
  },
  date: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
  },
  pages: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
  },
  // Subordinate to the title, but READABLE — tertiary (#737373, ~4.7:1 on this
  // surface), not disabled (#A3A3A3, ~2.5:1).
  //
  // This shipped as `colorTextDisabled` for half an hour and `pm-feature-review`
  // was right to call it the one thing to fix before a device pass: the disabled
  // token is the palette's "you cannot use this" colour, and this is the one string
  // on the row whose entire job is letting an owner tell two lab results apart,
  // one-handed, in clinic light. Quiet is a hierarchy instruction; 2.5:1 is a
  // legibility failure, and they are not the same thing. Tertiary matches the meta
  // line directly above and still sits plainly below the accent Name pill, so
  // nothing about the intended hierarchy changes. Same token the detail screen
  // already used for the identical string — the two surfaces now agree.
  file: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    marginTop: 3,
  },
  namePill: {
    backgroundColor: theme.colorAccentLight,
    borderRadius: theme.radiusFull,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  namePillText: {
    fontSize: theme.textSM,
    fontWeight: theme.weightSemibold,
    color: theme.colorAccentInk,
  },
});
