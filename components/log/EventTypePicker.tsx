import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { EventIcon } from '../event/EventIcon';
import { EVENT_TYPES, EventTypeKey } from '../../constants/eventTypes';
import { SectionLabel } from '../ui/SectionLabel';
import { theme } from '../../constants/theme';

// The log's event-type picker (B-745), extracted out of app/log.tsx so the
// flag switches presentation at ONE seam.
//
//   • grouped=false  → the shipped flat 2-up grid, byte-identical to today (FL-1;
//     snapshot-pinned in EventTypePicker.test.tsx). This is the flag-OFF path.
//   • grouped=true   → the round-4 grouped grid: three category groups with tinted
//     circles behind the glyph. Flag-ON (log_picker_v2, eligible && optedIn).
//
// PR 1 kept the flow: Stool was one tile that opened a Normal/Loose sub-step. PR 2
// (the sheet) SPLITS that tile inline — a full-width Stool row with Normal / Loose
// segments — and deletes the sub-step on the flag-on paths (the flat grid still
// routes Stool → the sub-step, so flag-off stays byte-identical). The grouped grid
// body is exported as `GroupedEventGrid` so the bottom sheet (EventTypeSheet) can
// render it in its OWN bounded ScrollView; both callers share one presentation.
//
// Presentation only: every tile calls onSelectType(key) with an EVENT_TYPES key,
// and each host routes it (log.tsx by step, the sheet by /log?type=). No store/hook
// dependency lives here, so both variants render as pure props — which is what lets
// the flag-off grid be snapshot-pinned directly.

interface Props {
  // false = shipped flat grid (flag-off); true = grouped grid (flag-on).
  grouped: boolean;
  onSelectType: (type: EventTypeKey) => void;
}

// The label a tile shows. `stool_normal` reads "Stool" (its Normal/Loose split lives
// in the split tile / the flat grid's sub-step); every other type uses its
// EVENT_TYPES label. Shared by both variants so a picker tile can never drift from
// the label its History row uses.
function pickerLabel(key: EventTypeKey): string {
  return key === 'stool_normal' ? 'Stool' : EVENT_TYPES[key].label;
}

// The grouped grid's category structure (round-4 mock, §03 frame 1). `stool_normal`
// is present as the SPLIT tile (rendered full-width with Normal/Loose segments);
// `diarrhea` has no tile of its own — it is the split tile's "Loose" segment, never
// a top-level tile (mirroring the flat grid, which filters it to the sub-step).
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

// The tinted circle + glyph shared by every grouped tile (regular and split).
function TileGlyph({ type }: { type: EventTypeKey }) {
  const tint = CATEGORY_TINT[type];
  return (
    <View style={[styles.tileCircle, { backgroundColor: tint.bg }]}>
      {/* 20 is the sanctioned icon step nearest the mock's 18 (EventIconSize is
          16/20/24); it sits comfortably in the 36px circle. */}
      <EventIcon type={type} size={20} color={tint.fg} />
    </View>
  );
}

// The split Stool tile (PR 2): a full-width row that IS the deleted sub-step,
// inlined. The glyph + label name the subject (not tappable — identity, not a
// verdict); the two segments are the tap targets. "Normal" → stool_normal, "Loose"
// → diarrhea, the exact two routes the sub-step used, so no data semantics change
// (§1). Each segment carries hitSlop so its compact pill still clears the 44pt
// 3am-stumbling floor.
const SEG_HIT = { top: 8, bottom: 8, left: 6, right: 6 };

function StoolSplitTile({ onSelectType }: { onSelectType: (type: EventTypeKey) => void }) {
  return (
    <View style={[styles.groupTile, styles.splitTile]}>
      <TileGlyph type="stool_normal" />
      <Text style={styles.groupTileLabel} numberOfLines={1}>
        {pickerLabel('stool_normal')}
      </Text>
      <View style={styles.splitSeg}>
        <TouchableOpacity
          style={styles.splitBtn}
          onPress={() => onSelectType('stool_normal')}
          activeOpacity={0.7}
          hitSlop={SEG_HIT}
          accessibilityRole="button"
          accessibilityLabel="Log normal stool"
        >
          <Text style={styles.splitBtnText}>Normal</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.splitBtn}
          onPress={() => onSelectType('diarrhea')}
          activeOpacity={0.7}
          hitSlop={SEG_HIT}
          accessibilityRole="button"
          accessibilityLabel="Log loose stool"
        >
          <Text style={styles.splitBtnText}>Loose</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// The grouped grid body — the three category groups, no ScrollView of its own so a
// host can bound its own scroll (the full-screen picker in log.tsx and the bottom
// sheet each wrap this in a ScrollView). Exported for EventTypeSheet.
export function GroupedEventGrid({ onSelectType }: { onSelectType: (type: EventTypeKey) => void }) {
  return (
    <View style={styles.groupedContent}>
      {PICKER_GROUPS.map((group) => {
        // Regular (non-split) tiles pair 2-up. A group with an ODD number of them
        // would leave the last tile alone at half-width beside the full-width split
        // row (the mock's Symptoms case: Vomit + Lethargy pair, Stool spans, Itch is
        // left over) — so the last regular tile spans full-width to fill the row
        // instead of stranding a gap. Derived from the group, not hardcoded per key,
        // so a regroup keeps balancing itself.
        const regularKeys = group.keys.filter((key) => key !== 'stool_normal');
        const lastRegular = regularKeys[regularKeys.length - 1];
        const oddRegular = regularKeys.length % 2 === 1;
        return (
          <View key={group.label} style={styles.group} testID={`event-group-${group.label}`}>
            <SectionLabel label={group.label} header style={styles.groupLabel} />
            <View style={styles.groupRow}>
              {group.keys.map((key) => {
                if (key === 'stool_normal') {
                  return <StoolSplitTile key={key} onSelectType={onSelectType} />;
                }
                const fullWidth = oddRegular && key === lastRegular;
                return (
                  <TouchableOpacity
                    key={key}
                    style={[styles.groupTile, fullWidth && styles.groupTileFull]}
                    onPress={() => onSelectType(key)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`Log ${pickerLabel(key).toLowerCase()}`}
                  >
                    <TileGlyph type={key} />
                    <Text style={styles.groupTileLabel} numberOfLines={2}>
                      {pickerLabel(key)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

export function EventTypePicker({ grouped, onSelectType }: Props) {
  if (grouped) {
    return (
      <ScrollView showsVerticalScrollIndicator={false}>
        <GroupedEventGrid onSelectType={onSelectType} />
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
  // A tile that fills the whole row (the split Stool row, and the odd last regular
  // tile that would otherwise strand a gap beside it).
  groupTileFull: {
    width: '100%',
  },
  // The split Stool tile: full width, with the Normal/Loose segments pushed to the
  // right by the flex-1 label between glyph and segments.
  splitTile: {
    width: '100%',
  },
  splitSeg: {
    flexDirection: 'row',
    gap: theme.space1,
  },
  splitBtn: {
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusFull,
    paddingVertical: theme.space1,
    paddingHorizontal: theme.space2,
    backgroundColor: theme.colorSurface,
  },
  splitBtnText: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  // 36px tinted circle behind the 20px glyph — a dimension, like the flat grid's
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
