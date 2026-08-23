// Past medications — the profile section (B-140 extended, PR 2).
//
// A collapsed-by-default section under the "Current medications" card that answers the
// vet-chair question the app has been unable to answer anywhere: "what has she been
// on?" (spec §1). It renders one row per PAST course — a completed/stopped regimen, or
// an ad-hoc drug the owner logged doses of without ever setting up a regimen — derived
// by `lib/medicationHistory` and turned into copy by `lib/pastMedications`.
//
// The two invariants live in that copy layer (H1/H2, pinned by pastMedications.test.ts);
// this component is pure presentation:
//   • collapsed by default — past courses are reference material, not daily state, so
//     the active cards keep the screen (spec §4.1). The count on the header says there
//     IS history without spending the space.
//   • the pill tells the two end registers apart — a neutral grey "Ended" (an owner
//     asserted it) vs the medication-blue "No end recorded" (the record went quiet).
//   • rows are NON-tappable in PR 2. The eventual detail (PR 3) enriches
//     app/medication/[id] with the past-course facts; until it exists, a tap would open
//     today's editable drug-catalog form — inviting an owner to edit the wrong data — so
//     the rows stay calm reference rows and PR 3 lights up the tap with a real destination.

import { useState } from 'react';
import { StyleSheet, TouchableOpacity, View, ViewStyle } from 'react-native';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { Card } from '../ui/Card';
import { Divider } from '../ui/Divider';
import { ThemedText } from '../ui/ThemedText';
import type { PastCourseRow, PastCoursePillTone } from '../../lib/pastMedications';

interface Props {
  rows: PastCourseRow[];
  style?: ViewStyle;
}

// The pill tells the two end registers apart by COLOUR FAMILY: a neutral grey for the
// firm, owner-asserted "Ended", the medication-blue for the open "No end recorded".
// Both text colours clear WCAG AA on their wash (colorTextSecondary is 6.8:1 on the
// grey pill — colorTextTertiary would be ~4.2:1, under AA for 11px text; the ink token
// is 6.3:1 on the blue), so the distinction never costs legibility.
const PILL_STYLE: Record<PastCoursePillTone, { pill: ViewStyle; text: { color: string } }> = {
  ended: { pill: { backgroundColor: theme.colorChartEmpty }, text: { color: theme.colorTextSecondary } },
  open: { pill: { backgroundColor: theme.colorEventMedicationLight }, text: { color: theme.colorEventMedicationInk } },
};

function PastCoursePill({ label, tone }: { label: string; tone: PastCoursePillTone }) {
  const s = PILL_STYLE[tone];
  return (
    <View style={[styles.pill, s.pill]}>
      <ThemedText style={[styles.pillText, s.text]} numberOfLines={1}>{label}</ThemedText>
    </View>
  );
}

// A calm, non-tappable reference row (see the header note on why taps wait for PR 3).
// One accessibility label reads the whole fact so a screen reader gets name + register
// + detail as a unit, rather than three unlabelled fragments.
function PastRow({ row }: { row: PastCourseRow }) {
  return (
    <View style={styles.row} accessible accessibilityLabel={`${row.name}. ${row.pill.label}. ${row.meta}`}>
      <View style={styles.rowLeft}>
        <ThemedText style={styles.name} numberOfLines={1}>{row.name}</ThemedText>
        <ThemedText style={styles.meta}>{row.meta}</ThemedText>
      </View>
      <PastCoursePill label={row.pill.label} tone={row.pill.tone} />
    </View>
  );
}

export function PastMedicationsSection({ rows, style }: Props) {
  // Collapsed by default (spec §4.1) — component-only state (CLAUDE.md).
  const [expanded, setExpanded] = useState(false);

  // No past history → no section. The Current medications card owns the "no
  // medications" empty state; a "Past medications 0" card here would be pure clutter
  // (Principle 3 — the screen is not a firehose).
  if (rows.length === 0) return null;

  return (
    <Card style={style}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`Past medications, ${rows.length} ${rows.length === 1 ? 'course' : 'courses'}`}
      >
        <ThemedText style={styles.title}>Past medications</ThemedText>
        <View style={styles.headerRight}>
          <ThemedText style={styles.count}>{rows.length}</ThemedText>
          {expanded
            ? <ChevronUp size={18} color={theme.colorTextTertiary} strokeWidth={2} />
            : <ChevronDown size={18} color={theme.colorTextTertiary} strokeWidth={2} />}
        </View>
      </TouchableOpacity>

      {expanded &&
        rows.map((row) => (
          <View key={row.key}>
            <Divider style={styles.rowDivider} />
            <PastRow row={row} />
          </View>
        ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  title: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorNeutralDark,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
  },
  count: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },
  rowDivider: {
    marginBottom: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.space2,
    paddingVertical: theme.space1,
    minHeight: 44,
  },
  rowLeft: {
    flex: 1,
    gap: theme.spaceMicro,
  },
  name: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  meta: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextSecondary,
  },
  pill: {
    borderRadius: theme.radiusFull,
    paddingHorizontal: theme.space1,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    // nudge the pill down to sit on the name's baseline row, not above it
    marginTop: theme.spaceMicro,
  },
  pillText: {
    fontSize: theme.textXS,
    fontWeight: theme.weightMedium,
  },
});
