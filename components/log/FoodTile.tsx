import { Text, View, StyleSheet, TouchableOpacity } from 'react-native';
import { Check } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { FORMAT_LABEL } from '../../lib/food';

interface Props {
  brand: string;
  productName: string;
  format: string;
  onPress: () => void;
  onLongPress?: () => void;
  // When the tile sits under a brand header (picker brand grouping, B-113 / B-109),
  // the brand is already shown once above the group — so drop it from the eyebrow
  // and let the format stand alone ("WET"), or show nothing when the format is
  // unspecified. The brand stays in the accessibilityLabel either way, so a screen
  // reader still announces the full "<brand> <product>". Mirrors FoodRow's hideBrand
  // exactly, so the two surfaces handle a brand-grouped item identically. Defaults
  // to showing the brand (the flat Recent strip + single-variant tiles).
  hideBrand?: boolean;
  // Compact height for the "{Pet}'s rotation" shelf (B-346): a shorter tile (smaller
  // min-height + tighter vertical padding) so a 12-food rotation fits in roughly the
  // space the old 5-item Recent strip took and the library below stays reachable.
  // Same tap target (≥44pt), same one-tap-log behavior — only the vertical footprint
  // shrinks. The product name still wraps to two lines: the rotation shelf is a FLAT
  // recency list (not brand-grouped), so a same-brand cluster is told apart solely by
  // the flavor in the product name — clipping it to one line would make "…Chicken &
  // Liver" and "…Chicken & Tuna" read identically on the exact picky-eater shelf this
  // widening serves. Legible-when-needed beats maximally-short-but-ambiguous.
  compact?: boolean;
  // B-417 PR 3 — SELECTION mode. `undefined` (the default) keeps the tile a
  // one-tap LOG control, which is what every existing caller wants. A boolean puts
  // the tile in a picker that is building a SET (the trial diet, the allowed set):
  // it renders a selected state and, just as importantly, announces itself as a
  // checkbox with its checked state instead of a button whose hint says "Logs this
  // food" — a lie in a surface where a tap adds a food to a list and logs nothing.
  selected?: boolean;
}

// Text-only food tile. Product name is the primary line — for a single-brand
// household ("a wall of Fancy Feast"), the flavor in product_name is what
// disambiguates one tile from the next, so it owns the visual centre. Brand
// and format collapse into a single tertiary metadata line at the top
// ("FANCY FEAST · WET") so the body of the tile is entirely about the food.
// Tap anywhere → meal logs immediately. Tile is the full tap target
// (≥44pt by virtue of minHeight).
//
// Accessibility (B-004 PR 7): the whole tile is ONE button labeled with the
// food's plain name ("Fancy Feast Salmon Pâté") plus a "Logs a meal" hint — at
// parity with the Foods-tab FoodRow, so a screen reader announces the food as a
// single log control instead of spelling out the styled, all-caps "FANCY FEAST ·
// WET" eyebrow and the product name as two separate fragments. The hint names the
// action because here a tap LOGS (the picker is the quick-log surface), whereas a
// FoodRow tap navigates to detail.
export function FoodTile({
  brand, productName, format, onPress, onLongPress,
  hideBrand = false, compact = false, selected,
}: Props) {
  const selecting = selected !== undefined;
  const typeLabel = FORMAT_LABEL[format] ?? '';
  const formatMeta = typeLabel.toUpperCase();
  // Under a brand header the brand is redundant — show the format alone (or
  // nothing when unspecified). Otherwise the brand leads, with the format chip
  // when there is one. Identical shape to FoodRow's meta line.
  const metaLine = hideBrand
    ? formatMeta
    : typeLabel
      ? `${brand.toUpperCase()} · ${formatMeta}`
      : brand.toUpperCase();

  return (
    <TouchableOpacity
      style={[styles.tile, compact && styles.tileCompact, selected && styles.tileSelected]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      activeOpacity={0.7}
      accessibilityRole={selecting ? 'checkbox' : 'button'}
      accessibilityLabel={`${brand} ${productName}`}
      accessibilityState={selecting ? { checked: selected } : undefined}
      accessibilityHint={selecting ? undefined : 'Logs this food'}
    >
      {/* Guarded so a hideBrand tile with an unlabeled format ('other') doesn't
          render an empty eyebrow line above the product name. */}
      {metaLine ? (
        <Text style={styles.meta} numberOfLines={1}>
          {metaLine}
        </Text>
      ) : null}
      {/* Two lines on both variants: the flavor in the product name is what tells a
          same-brand cluster apart, so compact tiles must not clip it (see the prop
          comment). The compactness comes from the shorter min-height + padding, not
          from truncating the disambiguating text. */}
      <Text style={styles.product} numberOfLines={2}>
        {productName}
      </Text>
      {/* A glyph, not just the tint — selection must not be signalled by colour
          alone. The screen-reader path is covered separately by the checkbox role
          + checked state above. */}
      {selected ? (
        <View style={styles.check}>
          <Check size={14} color={theme.colorAccentInk} strokeWidth={3} />
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minHeight: 96,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusMedium,
    backgroundColor: theme.colorSurface,
    padding: theme.space2,
    gap: theme.space1,
  },
  // B-346 rotation shelf — a shorter tile (min-height stays above the 44pt tap
  // floor) with tighter vertical padding. Longhand paddingVertical wins over the
  // base `padding` shorthand in RN's style merge, so horizontal padding is kept.
  // Selection state (B-417 PR 3). Border colour + tint only — the border WIDTH
  // stays 1 so selecting a tile never reflows the 2-up grid around it.
  tileSelected: {
    borderColor: theme.colorAccent,
    backgroundColor: theme.colorAccentLight,
  },
  check: {
    position: 'absolute',
    top: theme.space1,
    right: theme.space1,
  },
  tileCompact: {
    minHeight: 62,
    paddingVertical: theme.space1,
    gap: theme.spaceMicro,
  },
  meta: {
    fontSize: theme.textXS,
    fontWeight: theme.weightMedium,
    color: theme.colorTextTertiary,
    letterSpacing: theme.trackingWidest,
  },
  product: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
    lineHeight: 20,
  },
});
