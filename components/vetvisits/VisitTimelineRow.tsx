import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { ChevronRight, Stethoscope } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { ThemedText } from '../ui/ThemedText';
import { formatVisitDate, type HistoryVisitRow } from '../../lib/vetVisits';

interface Props {
  row: HistoryVisitRow;
  onPress: () => void;
}

// A vet visit on the History timeline (CUL-904 VV-6; spec §4.1 History, AC 10).
//
// ── WHAT IT IS NOT ───────────────────────────────────────────────────────────────
// Not an `EventRow`, and the distinction is the acceptance criterion rather than a
// styling choice. An event is an observation of an animal; a visit is an entry in
// the appointment record. It never enters the correlation engine, a count, a
// coverage line or a Patterns panel — `guards/visitReaders.test.ts` is what makes
// that structural. So this row carries none of `EventRow`'s affordances: no expand,
// no inline Edit, no Remove. It states a fact and opens the visit, where those
// controls live and where they mean something.
//
// It sits in `EventRow`'s CONTAINER rhythm all the same — the same padding, rule and
// surface — because a row that is foreign to the stream reads as a rendering bug
// rather than a different kind of record. The glyph is the track's own
// (`app/settings/beta.tsx` uses the same one on the beta shelf), and it takes the
// neutral circle: a vet visit is not a symptom, and tinting it would put it in the
// concern family on a surface where colour is category, not severity (C-1).
//
// ── THE DATE CARRIES ITS YEAR WHEN IT NEEDS ONE ──────────────────────────────────
// `formatVisitDate` stamps the year outside the current one (C-19: a year-less date
// is safe only inside a bounded range, and History is unbounded — the owner can
// scroll to a visit from three years ago). This is deliberately NOT `EventRow`'s
// `formatDatePart`, which is year-less; matching it would have been the consistent
// choice and the wrong one.
export function VisitTimelineRow({ row, onPress }: Props) {
  const when = formatVisitDate(row.visitedAt);
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      // One sentence, not four fragments: the row is a single destination, so a
      // screen reader should hear it the way a sighted owner scans it. The visible
      // text is restated rather than replaced — every part below is on screen —
      // which is the case C-8 allows, because the row splits across four `Text`
      // nodes and the label is what rejoins them.
      accessibilityLabel={[`Vet visit`, when, row.reason, row.where]
        .filter((part) => !!part)
        .join(', ')}
    >
      <View style={styles.glyph}>
        <Stethoscope size={20} color={theme.colorTextSecondary} strokeWidth={2} />
      </View>

      <View style={styles.content}>
        <View style={styles.topLine}>
          <ThemedText style={styles.label}>Vet visit</ThemedText>
          {when ? <ThemedText style={styles.when}>{when}</ThemedText> : null}
        </View>
        {/* Both lines are conditional and neither has a stand-in. A visit logged
            with only a date is an ordinary record — the owner was at the vet and
            typed nothing — and inventing "No reason given" would make that ordinary
            thing read as a gap in the record (Principle 5's rule applied to a row:
            an absence is not a deficiency). The row is still complete without them:
            it says a visit happened, on a day, and opens it. */}
        {row.reason ? (
          <ThemedText style={styles.reason} numberOfLines={2}>
            {row.reason}
          </ThemedText>
        ) : null}
        {row.where ? (
          <ThemedText style={styles.where} numberOfLines={1}>
            {row.where}
          </ThemedText>
        ) : null}
      </View>

      <ChevronRight size={18} color={theme.colorTextTertiary} strokeWidth={2} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: theme.space2,
    paddingHorizontal: theme.space3,
    borderBottomWidth: 1,
    borderBottomColor: theme.colorBorder,
    backgroundColor: theme.colorSurface,
    // The whole row is the only control in its band, so the target is the row and
    // there is no adjacent-control separation to keep (C-5). Pinned explicitly
    // rather than left to the content, so a visit with neither a reason nor a
    // clinic — the shortest this row gets — still clears the 44 pt floor.
    minHeight: 56,
    gap: theme.space2,
  },
  glyph: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colorNeutralLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  content: {
    flex: 1,
    minWidth: 0,
    gap: 4,
    justifyContent: 'center',
  },
  topLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space2,
  },
  label: {
    fontSize: 15,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorTextPrimary,
  },
  when: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    // The date is the half that is stated fewest times on this row — the reason and
    // the clinic both repeat on the visit screen — so it holds its width and the
    // reason truncates around it (C-8).
    flexShrink: 0,
  },
  reason: {
    fontSize: 14,
    color: theme.colorTextSecondary,
  },
  where: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
  },
});
