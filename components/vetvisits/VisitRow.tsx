import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { ThemedText } from '../ui/ThemedText';
import type { PlanTag, VisitListRow } from '../../lib/vetVisits';

interface Props {
  row: VisitListRow;
  onPress: () => void;
}

// One past visit in the list (mock E1).
//
// The tags under it are DERIVED from the linked records and never typed (§4.1) —
// each one is a course, a trial, a document or a recheck date that names this
// visit. They say what came OUT of the visit; every number about those things
// stays the thing's own (CUL-746: a visit is a provenance anchor, never a source
// of numbers).
export function VisitRow({ row, onPress }: Props) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      // The tags are part of the sentence, not a trailing list of chips: an owner
      // scanning by voice hears "Jul 30, GI follow-up, Riverside · Dr. Chen, trial
      // started, Cerenia" as one row.
      accessibilityLabel={[
        row.stamp ? `${row.stamp.month} ${row.stamp.day}` : null,
        row.title,
        row.where || null,
        ...row.tags.map((t) => t.label),
      ]
        .filter(Boolean)
        .join(', ')}
    >
      {row.stamp ? (
        <View style={styles.stamp}>
          <ThemedText style={styles.stampDay}>{row.stamp.day}</ThemedText>
          <ThemedText style={styles.stampMonth}>{row.stamp.month}</ThemedText>
        </View>
      ) : null}

      <View style={styles.main}>
        <ThemedText style={styles.title} numberOfLines={1}>
          {row.title}
        </ThemedText>
        {row.where ? (
          <ThemedText style={styles.where} numberOfLines={1}>
            {row.where}
          </ThemedText>
        ) : null}
        {row.tags.length > 0 ? (
          <View style={styles.tags}>
            {row.tags.map((tag) => (
              <PlanTagPill key={`${tag.kind}-${tag.label}`} tag={tag} />
            ))}
          </View>
        ) : null}
      </View>

      <ChevronRight size={18} color={theme.colorTextTertiary} strokeWidth={2} />
    </TouchableOpacity>
  );
}

// Category tint as a GLYPH tint would be too weak here — these are TEXT on a light
// ground, so each pill takes its family's *Ink* sibling (C-1).
function PlanTagPill({ tag }: { tag: PlanTag }) {
  return (
    <View
      style={[
        styles.tag,
        tag.kind === 'med' && styles.tagMed,
        tag.kind === 'diet' && styles.tagDiet,
      ]}
    >
      <ThemedText
        style={[
          styles.tagText,
          tag.kind === 'med' && styles.tagTextMed,
          tag.kind === 'diet' && styles.tagTextDiet,
        ]}
        numberOfLines={1}
      >
        {tag.label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 11,
    // The row is the only control in its band, so the whole thing is the target
    // and there is no adjacent-control gap to keep (C-5).
    minHeight: 60,
  },
  stamp: {
    width: 38,
    alignItems: 'center',
  },
  stampDay: {
    fontSize: theme.textLG,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    letterSpacing: theme.trackingTight,
  },
  stampMonth: {
    fontSize: theme.textMicro,
    fontWeight: theme.weightSemibold,
    letterSpacing: theme.trackingWide,
    textTransform: 'uppercase',
    color: theme.colorTextTertiary,
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
  where: {
    fontSize: theme.textXS,
    color: theme.colorTextSecondary,
    marginTop: 2,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 5,
    rowGap: 4,
    marginTop: 6,
  },
  tag: {
    backgroundColor: theme.colorSurfaceSubtle,
    borderRadius: theme.radiusXS,
    paddingHorizontal: 6,
    paddingVertical: 2,
    maxWidth: '100%',
  },
  tagMed: {
    backgroundColor: theme.colorEventMedicationLight,
  },
  tagDiet: {
    backgroundColor: theme.colorAccentLight,
  },
  tagText: {
    fontSize: theme.textMicro,
    fontWeight: theme.weightSemibold,
    letterSpacing: theme.trackingWide,
    textTransform: 'uppercase',
    color: theme.colorTextSecondary,
  },
  tagTextMed: {
    color: theme.colorEventMedicationInk,
  },
  tagTextDiet: {
    color: theme.colorAccentInk,
  },
});
