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
//   • a row with a catalog item TAPS THROUGH to app/medication/[id] (CUL-318). PR 2
//     shipped the rows inert because that screen was then only the editable
//     drug-catalog form — a tap would have invited editing the wrong data; PR 3 gave
//     it the past-course facts, which is the destination the tap now lands on. A
//     dose-derived course with no item on file (`item:unspecified`) has nowhere to
//     go, so that row stays a plain row — a View, never a dimmed control (CUL-682).

import { useState } from 'react';
import { StyleSheet, TouchableOpacity, View, ViewStyle } from 'react-native';
import { router } from 'expo-router';
import { ChevronDown, ChevronRight, ChevronUp } from 'lucide-react-native';
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

// One accessibility label reads the whole fact so a screen reader gets name + register
// + detail as a unit, rather than three unlabelled fragments.
//
// ONE ROW, TWO HOSTS (CUL-318, in the CUL-682 shape). A row whose course has a catalog
// item opens that medication's screen; a dose-derived course with no item on file has
// no destination. The inert branch is a plain View — not a TouchableOpacity carrying
// `disabled`, which RN copies into accessibilityState and VoiceOver speaks as "dimmed",
// announcing an unavailable control where no control exists. `accessible` on that
// View is load-bearing: a touchable groups its children into one announcement by
// default and a View does not, so without it the name, the meta and the pill become
// three unrelated stops. The chevron is drawn only where there is somewhere to go.
function PastRow({ row }: { row: PastCourseRow }) {
  const label = `${row.name}. ${row.pill.label}. ${row.meta}`;
  const body = (
    <>
      <View style={styles.rowLeft}>
        <ThemedText style={styles.name} numberOfLines={1}>{row.name}</ThemedText>
        <ThemedText style={styles.meta}>{row.meta}</ThemedText>
      </View>
      <PastCoursePill label={row.pill.label} tone={row.pill.tone} />
    </>
  );
  const itemId = row.medicationItemId;
  if (itemId === null) {
    return (
      <View style={styles.row} accessible accessibilityLabel={label}>
        {body}
      </View>
    );
  }
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => router.push(`/medication/${itemId}`)}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {body}
      <ChevronRight
        size={16}
        color={theme.colorTextTertiary}
        strokeWidth={2}
        style={styles.chev}
      />
    </TouchableOpacity>
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
  // Sits on the name's baseline row beside the pill, which carries the same nudge.
  chev: {
    alignSelf: 'flex-start',
    marginTop: theme.spaceMicro,
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
