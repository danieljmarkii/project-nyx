import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { EventIcon } from '../event/EventIcon';
import {
  EVENT_TYPES, EventTypeKey, expandedPickerGroups, type PickerGroup,
} from '../../constants/eventTypes';
import { SectionLabel } from '../ui/SectionLabel';
import { theme } from '../../constants/theme';
import { ThemedText } from '../ui/ThemedText';

// The log's event-type picker (B-745), extracted out of app/log.tsx so the
// flag switches presentation at ONE seam.
//
//   • grouped=false  → the shipped flat 2-up grid, byte-identical to today (FL-1;
//     snapshot-pinned in EventTypePicker.test.tsx). This is the flag-OFF path.
//   • grouped=true   → the round-4 grouped grid: three category groups with tinted
//     circles behind the glyph. Flag-ON (log_picker_v2, eligible && optedIn).
//   • grouped + expanded → the taxonomy grid (event_types_v2, W1 — CUL-675): the
//     seven family groups derived from constants (expandedPickerGroups), which is
//     where the v2Only tiles (Cough, Sneeze) live. expanded=false keeps the
//     three-group grid byte-identical — the regroup itself rides the flag (§12
//     FL-1: flag-off capture surfaces are byte-identical; the flag gates the
//     grid's TILE LIST, never EVENT_TYPES).
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
  // event_types_v2 (eligible && optedIn) — the taxonomy expansion. Only read when
  // grouped: the flat grid never carries a v2 tile at any flag state (the
  // pre-expansion picker survives until GA, FL-3).
  expanded?: boolean;
  // The active pet's `pets.species` — §3 species conditionality renders at the
  // grid. Only the expanded grid filters (every pre-W1 leaf is 'all').
  species?: string | null;
  onSelectType: (type: EventTypeKey) => void;
}

// The label a tile shows. `stool_normal` reads "Stool" (its Normal/Loose split lives
// in the split tile / the flat grid's sub-step); every other type uses its
// EVENT_TYPES label. Shared by both variants so a picker tile can never drift from
// the label its History row uses.
function pickerLabel(key: EventTypeKey): string {
  return key === 'stool_normal' ? 'Stool' : EVENT_TYPES[key].label;
}

// The PRE-EXPANSION grouped grid's category structure (round-4 mock, §03 frame 1)
// — the expanded=false arrangement, kept verbatim so the log_picker_v2-only state
// stays byte-identical (the taxonomy regroup rides event_types_v2; FL-3 keeps this
// alive until GA retires it). `stool_normal` is present as the SPLIT tile (rendered
// full-width with Normal/Loose segments); `diarrhea` has no tile of its own — it is
// the split tile's "Loose" segment, never a top-level tile (mirroring the flat
// grid, which filters it to the sub-step). The EXPANDED grid's family structure
// lives in constants (EVENT_FAMILIES + expandedPickerGroups — §3/HR-4: the family
// grouping moved out of this component when the entries gained family metadata).
const PICKER_GROUPS: { label: string; keys: EventTypeKey[] }[] = [
  { label: 'Symptoms', keys: ['vomit', 'lethargy', 'stool_normal', 'itch'] },
  { label: 'Food & care', keys: ['meal', 'medication'] },
  { label: 'Body & more', keys: ['weight_check', 'other'] },
];

// The tinted circle behind each glyph — category IDENTITY, never a verdict (§2 of
// the requirements). Symptoms rose, meal teal, medication slate, everything else a
// neutral grey; each pairs the shipped *-Light wash with its event tint so the glyph
// keeps contrast on the circle. Keyed per type (not per group) so a future regroup
// can't silently mis-tint a glyph. §6 pairing rule (taxonomy spec): a new symptom
// leaf joins this AND SYMPTOM_TYPES in the same PR — the membership test holds the
// two to set-equality (± stool_normal, the one documented divergence). Exported for
// exactly that test.
export const CATEGORY_TINT: Record<EventTypeKey, { bg: string; fg: string }> = {
  vomit: { bg: theme.colorEventSymptomLight, fg: theme.colorEventSymptom },
  diarrhea: { bg: theme.colorEventSymptomLight, fg: theme.colorEventSymptom },
  stool_normal: { bg: theme.colorEventSymptomLight, fg: theme.colorEventSymptom },
  cough: { bg: theme.colorEventSymptomLight, fg: theme.colorEventSymptom },
  sneeze: { bg: theme.colorEventSymptomLight, fg: theme.colorEventSymptom },
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
// (§1). VERTICAL hitSlop only: content height (paddingVertical + ~13px text) + 16pt
// vertical slop clears the 44pt floor, and each pill already exceeds 44pt wide — so
// no horizontal slop, which would otherwise overlap the two segments' hit regions
// across the small gap between them (Normal vs Loose is a clinical distinction, so
// the hit boundary must be unambiguous).
const SEG_HIT = { top: 8, bottom: 8 };

function StoolSplitTile({ onSelectType }: { onSelectType: (type: EventTypeKey) => void }) {
  return (
    <View style={[styles.groupTile, styles.groupTileFull]}>
      <TileGlyph type="stool_normal" />
      <ThemedText style={styles.groupTileLabel} numberOfLines={1}>
        {pickerLabel('stool_normal')}
      </ThemedText>
      <View style={styles.splitSeg}>
        <TouchableOpacity
          style={styles.splitBtn}
          onPress={() => onSelectType('stool_normal')}
          activeOpacity={0.7}
          hitSlop={SEG_HIT}
          accessibilityRole="button"
          accessibilityLabel="Log normal stool"
        >
          <ThemedText style={styles.splitBtnText}>Normal</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.splitBtn}
          onPress={() => onSelectType('diarrhea')}
          activeOpacity={0.7}
          hitSlop={SEG_HIT}
          accessibilityRole="button"
          accessibilityLabel="Log loose stool"
        >
          <ThemedText style={styles.splitBtnText}>Loose</ThemedText>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// Which regular (non-split) tiles must span the full row. Half-width tiles pair
// 2-up, but the full-width split tile breaks the row — so tiles are balanced PER
// CONTIGUOUS RUN on either side of the split, not group-wide: a run with an odd
// count promotes its LAST tile to full width so it never strands a half-tile with
// dead space beside it. (A single group-wide odd/even count would mis-balance a
// group whose split tile doesn't fall after an even prefix — e.g. a future
// ['vomit', 'stool_normal', 'lethargy', 'itch'] regroup.)
function fullWidthRegularKeys(keys: EventTypeKey[]): Set<EventTypeKey> {
  const full = new Set<EventTypeKey>();
  let run: EventTypeKey[] = [];
  const flush = () => {
    if (run.length % 2 === 1) full.add(run[run.length - 1]);
    run = [];
  };
  for (const key of keys) {
    if (key === 'stool_normal') { flush(); continue; } // the split tile is its own full row
    run.push(key);
  }
  flush();
  return full;
}

// The EXPANDED grid's balancing — the confirmed round-3 W1 frame, drawn slightly
// differently from the promotion rule above: in a group that contains the split
// Stool tile, a regular tile is NEVER promoted (the frame draws Vomit half-width —
// the full-width split row anchors the group, so promoting Vomit too would stack
// Digestion as two heavy full rows). Single-tile groups without a split (Itch,
// Lethargy, Weight, Other) still promote to full width, exactly as drawn. The
// legacy grid keeps the plain promotion — its Symptoms group ships with Itch
// promoted, and expanded=false is byte-identical by contract.
function expandedFullWidthKeys(keys: EventTypeKey[]): Set<EventTypeKey> {
  return keys.includes('stool_normal') ? new Set() : fullWidthRegularKeys(keys);
}

// The grouped grid body — no ScrollView of its own so a host can bound its own
// scroll (the full-screen picker in log.tsx and the bottom sheet each wrap this in
// a ScrollView). Exported for EventTypeSheet. expanded=false renders the
// pre-expansion three-group arrangement verbatim; expanded=true derives the family
// groups from constants (the only place a v2Only tile — Cough, Sneeze — can render).
export function GroupedEventGrid({
  onSelectType,
  expanded = false,
  species,
}: {
  onSelectType: (type: EventTypeKey) => void;
  expanded?: boolean;
  species?: string | null;
}) {
  const groups: PickerGroup[] = expanded
    ? expandedPickerGroups(species, EVENT_TYPES)
    : PICKER_GROUPS;
  return (
    <View style={styles.groupedContent}>
      {groups.map((group) => {
        const fullWidthKeys = expanded
          ? expandedFullWidthKeys(group.keys)
          : fullWidthRegularKeys(group.keys);
        return (
          <View key={group.label} style={styles.group} testID={`event-group-${group.label}`}>
            <SectionLabel label={group.label} header style={styles.groupLabel} />
            <View style={styles.groupRow}>
              {group.keys.map((key) => {
                if (key === 'stool_normal') {
                  return <StoolSplitTile key={key} onSelectType={onSelectType} />;
                }
                const fullWidth = fullWidthKeys.has(key);
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
                    <ThemedText style={styles.groupTileLabel} numberOfLines={2}>
                      {pickerLabel(key)}
                    </ThemedText>
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

export function EventTypePicker({ grouped, expanded = false, species, onSelectType }: Props) {
  if (grouped) {
    return (
      <ScrollView showsVerticalScrollIndicator={false}>
        <GroupedEventGrid onSelectType={onSelectType} expanded={expanded} species={species} />
      </ScrollView>
    );
  }

  // Flag-off: the shipped flat grid, verbatim (order = EVENT_TYPES order, diarrhea
  // filtered to its sub-step, no photo tile). Kept byte-identical — snapshot-pinned.
  // v2Only entries are filtered STRUCTURALLY, not by flag: the taxonomy tiles live
  // only on the expanded grouped grid (their host surface, D12), so the flat grid
  // never grows past its eight tiles at any flag state — which is what keeps
  // EVENT_TYPES safely ungated (§12 FL-1) while the pin below stays honest.
  return (
    <ScrollView contentContainerStyle={styles.typeGrid} showsVerticalScrollIndicator={false}>
      {(Object.entries(EVENT_TYPES) as [EventTypeKey, (typeof EVENT_TYPES)[EventTypeKey]][])
        // diarrhea is accessible via the stool-type sub-step; hide it from the top-level grid
        .filter(([key, cfg]) => key !== 'diarrhea' && !cfg.v2Only)
        .map(([key]) => (
          <TouchableOpacity
            key={key}
            style={styles.typeCard}
            onPress={() => onSelectType(key)}
            activeOpacity={0.7}
          >
            <EventIcon type={key} size={24} />
            <ThemedText style={styles.typeLabel}>{pickerLabel(key)}</ThemedText>
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
  // A tile that fills the whole row: the split Stool row (its Normal/Loose segments
  // are pushed right by the flex-1 label between glyph and segments), and the odd
  // last regular tile that would otherwise strand a gap beside it.
  groupTileFull: {
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
