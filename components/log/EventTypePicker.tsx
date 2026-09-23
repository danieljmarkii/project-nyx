import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { EventIcon } from '../event/EventIcon';
import {
  EVENT_TYPES, EventTypeKey, expandedPickerGroups, type PickerGroup,
} from '../../constants/eventTypes';
import { SectionLabel } from '../ui/SectionLabel';
import { theme } from '../../constants/theme';
import { ThemedText } from '../ui/ThemedText';

// The log's event-type picker (B-745), extracted out of app/log.tsx so both hosts
// render ONE grid: the family grid of the confirmed round-3 W1 frame (taxonomy
// W1 — CUL-675), derived from constants (`expandedPickerGroups`), with Cough and
// Sneeze under Breathing. It shipped behind two beta flags — the grouped redesign
// and the taxonomy expansion — and left beta with both in one PR (CUL-962), which
// deleted the flat grid, the pre-expansion three-group arrangement and the
// Normal/Loose sub-step the flat grid routed Stool through.
//
// Stool is one full-width SPLIT tile with Normal / Loose segments (B-745 PR 2) — the
// sub-step, inlined. The grid body is exported as `GroupedEventGrid` so the bottom
// sheet (EventTypeSheet) can render it in its OWN bounded ScrollView; the full-screen
// picker (`EventTypePicker`, used by app/log.tsx) wraps the same body in a
// ScrollView, so both hosts share one presentation.
//
// Presentation only: every tile calls onSelectType(key) with an EVENT_TYPES key,
// and each host routes it (log.tsx by step, the sheet by stage). No store/hook
// dependency lives here, so the grid renders as pure props.

interface Props {
  // The active pet's `pets.species` — §3 species conditionality renders at the
  // grid (`expandedPickerGroups` filters to 'all' + the pet's species).
  species?: string | null;
  onSelectType: (type: EventTypeKey) => void;
}

// The label a tile shows. `stool_normal` reads "Stool" (its Normal/Loose split lives
// on the split tile); every other type uses its EVENT_TYPES label, so a picker tile
// can never drift from the label its History row uses.
function pickerLabel(key: EventTypeKey): string {
  return key === 'stool_normal' ? 'Stool' : EVENT_TYPES[key].label;
}

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
  // `check_in` (Noticed) has NO TILE (E-6 — `expandedPickerGroups` excludes it), so
  // this entry is never rendered. It is here because the Record is exhaustive over
  // EventTypeKey — which is the point: a leaf added to EVENT_TYPES cannot reach the
  // grid without someone deciding its tint, and a look's decision is "neutral, and
  // no tile at all". Never rose: a
  // look is not a symptom (T-5), and the §6 pairing rule's set-equality test
  // reads exactly this map.
  check_in: { bg: theme.colorSurfaceSubtle, fg: theme.colorTextSecondary },
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

// The grid's balancing — the confirmed round-3 W1 frame, drawn slightly differently
// from the plain promotion rule above: in a group that contains the split Stool
// tile, a regular tile is NEVER promoted (the frame draws Vomit half-width — the
// full-width split row anchors the group, so promoting Vomit too would stack
// Digestion as two heavy full rows). Groups without a split (Itch, Lethargy, Weight,
// Other) take the plain rule, so a lone tile promotes to full width, exactly as drawn.
function expandedFullWidthKeys(keys: EventTypeKey[]): Set<EventTypeKey> {
  return keys.includes('stool_normal') ? new Set() : fullWidthRegularKeys(keys);
}

// The grid body — no ScrollView of its own so a host can bound its own scroll (the
// full-screen picker below and the bottom sheet each wrap this in a ScrollView).
// Exported for EventTypeSheet. The groups are derived from constants, never
// hand-listed here (§3/HR-4: the family grouping lives with the entries' family
// metadata).
export function GroupedEventGrid({
  onSelectType,
  species,
}: {
  onSelectType: (type: EventTypeKey) => void;
  species?: string | null;
}) {
  const groups: PickerGroup[] = expandedPickerGroups(species, EVENT_TYPES);
  return (
    <View style={styles.groupedContent}>
      {groups.map((group) => {
        const fullWidthKeys = expandedFullWidthKeys(group.keys);
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

// The full-screen picker (app/log.tsx's type step): the same grid in a ScrollView.
export function EventTypePicker({ species, onSelectType }: Props) {
  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <GroupedEventGrid onSelectType={onSelectType} species={species} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // ── The grid ──
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
  // 36px tinted circle behind the 20px glyph — a dimension, like EventIcon's sizes,
  // not a spacing token.
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
