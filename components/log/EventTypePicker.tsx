import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { EventIcon } from '../event/EventIcon';
import { EVENT_TYPES, EventTypeKey } from '../../constants/eventTypes';
import { SectionLabel } from '../ui/SectionLabel';
import { theme } from '../../constants/theme';

// The log's event-type picker (B-745 PR 1), extracted out of app/log.tsx so the
// flag switches presentation at ONE seam.
//
//   • grouped=false  → the shipped flat 2-up grid, byte-identical to today (FL-1;
//     snapshot-pinned in EventTypePicker.test.tsx). This is the flag-OFF path.
//   • grouped=true   → the round-4 grouped grid: three category groups with tinted
//     circles behind the glyph. Flag-ON (log_picker_v2, eligible && optedIn).
//
// This is PR 1's scope: presentation only. The *flow* is unchanged — every tile
// still calls onSelectType(key), and log.tsx routes it exactly as before (Stool
// still opens the Normal/Loose sub-step; the split-inline stool tile is PR 2, the
// sheet). No store/hook dependency lives here, so both variants render as pure
// props — which is what lets the flag-off grid be snapshot-pinned directly.

interface Props {
  // false = shipped flat grid (flag-off); true = grouped grid (flag-on).
  grouped: boolean;
  onSelectType: (type: EventTypeKey) => void;
}

// The label a tile shows. `stool_normal` reads "Stool" (its sub-step is where the
// Normal/Loose split lives); every other type uses its EVENT_TYPES label. Shared by
// both variants so a picker tile can never drift from the label its History row uses.
function pickerLabel(key: EventTypeKey): string {
  return key === 'stool_normal' ? 'Stool' : EVENT_TYPES[key].label;
}

// The grouped grid's category structure (round-4 mock, §03 frame 1). PR 1 keeps the
// current flow, so Stool is ONE tile that routes to its sub-step — the split-inline
// stool tile arrives with the sheet (PR 2). `diarrhea` is absent here for the same
// reason it is filtered from the flat grid: it is reached through Stool's sub-step,
// never the top level.
const PICKER_GROUPS: { label: string; keys: EventTypeKey[] }[] = [
  { label: 'Symptoms', keys: ['vomit', 'lethargy', 'stool_normal', 'itch'] },
  { label: 'Food & care', keys: ['meal', 'medication'] },
  { label: 'Body & more', keys: ['weight_check', 'other'] },
];

// The tinted circle behind each glyph — category IDENTITY, never a verdict (§2 of
// the requirements). Symptoms rose, meal teal, medication slate, everything else a
// neutral grey; each pairs the shipped *-Light wash with its event tint so the glyph
// keeps contrast on the circle. Keyed per type (not per group) so a future regroup
// can't silently mis-tint a glyph.
const CATEGORY_TINT: Record<EventTypeKey, { bg: string; fg: string }> = {
  vomit: { bg: theme.colorEventSymptomLight, fg: theme.colorEventSymptom },
  diarrhea: { bg: theme.colorEventSymptomLight, fg: theme.colorEventSymptom },
  stool_normal: { bg: theme.colorEventSymptomLight, fg: theme.colorEventSymptom },
  lethargy: { bg: theme.colorEventSymptomLight, fg: theme.colorEventSymptom },
  itch: { bg: theme.colorEventSymptomLight, fg: theme.colorEventSymptom },
  meal: { bg: theme.colorEventMealLight, fg: theme.colorEventMeal },
  medication: { bg: theme.colorEventMedicationLight, fg: theme.colorEventMedication },
  weight_check: { bg: theme.colorSurfaceSubtle, fg: theme.colorTextSecondary },
  other: { bg: theme.colorSurfaceSubtle, fg: theme.colorTextSecondary },
};

export function EventTypePicker({ grouped, onSelectType }: Props) {
  if (grouped) {
    return (
      <ScrollView contentContainerStyle={styles.groupedContent} showsVerticalScrollIndicator={false}>
        {PICKER_GROUPS.map((group) => (
          <View key={group.label} style={styles.group} testID={`event-group-${group.label}`}>
            <SectionLabel label={group.label} header style={styles.groupLabel} />
            <View style={styles.groupRow}>
              {group.keys.map((key) => {
                const tint = CATEGORY_TINT[key];
                return (
                  <TouchableOpacity
                    key={key}
                    style={styles.groupTile}
                    onPress={() => onSelectType(key)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.tileCircle, { backgroundColor: tint.bg }]}>
                      {/* 20 is the sanctioned icon step nearest the mock's 18 (EventIconSize
                          is 16/20/24); it sits comfortably in the 36px circle. */}
                      <EventIcon type={key} size={20} color={tint.fg} />
                    </View>
                    <Text style={styles.groupTileLabel} numberOfLines={2}>
                      {pickerLabel(key)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
    );
  }

  // Flag-off: the shipped flat grid, verbatim (order = EVENT_TYPES order, diarrhea
  // filtered to its sub-step, no photo tile). Kept byte-identical — snapshot-pinned.
  return (
    <ScrollView contentContainerStyle={styles.typeGrid} showsVerticalScrollIndicator={false}>
      {(Object.entries(EVENT_TYPES) as [EventTypeKey, (typeof EVENT_TYPES)[EventTypeKey]][])
        // diarrhea is accessible via the stool-type sub-step; hide it from the top-level grid
        .filter(([key]) => key !== 'diarrhea')
        .map(([key]) => (
          <TouchableOpacity
            key={key}
            style={styles.typeCard}
            onPress={() => onSelectType(key)}
            activeOpacity={0.7}
          >
            <EventIcon type={key} size={24} />
            <Text style={styles.typeLabel}>{pickerLabel(key)}</Text>
          </TouchableOpacity>
        ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // ── Flat grid (flag-off) — copied verbatim from app/log.tsx so flag-off renders
  //    byte-identical. fontSize 15 is theme.textMD (same value; tokenized, not changed).
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: theme.space2,
    gap: theme.space2,
    justifyContent: 'space-between',
  },
  typeCard: {
    width: '47%',
    aspectRatio: 1.3,
    backgroundColor: theme.colorNeutralLight,
    borderRadius: theme.radiusMedium,
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.space1,
  },
  typeLabel: {
    fontSize: theme.textMD,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorNeutralDark,
  },

  // ── Grouped grid (flag-on) ──
  groupedContent: {
    padding: theme.space2,
    gap: theme.space3,
  },
  group: {
    gap: theme.space1,
  },
  groupLabel: {
    marginBottom: theme.spaceMicro,
  },
  groupRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: theme.space1,
  },
  groupTile: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
    // Roomy vertical inset, tighter horizontal so a long label ("Itch/Scratch",
    // "Medication") keeps its width in a half-width tile.
    paddingVertical: theme.space2,
    paddingHorizontal: theme.space1,
    backgroundColor: theme.colorSurface,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusMedium,
  },
  // 36px tinted circle behind the 18px glyph — a dimension, like the flat grid's
  // icon sizing, not a spacing token.
  tileCircle: {
    width: 36,
    height: 36,
    borderRadius: theme.radiusFull,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupTileLabel: {
    flex: 1,
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
});
