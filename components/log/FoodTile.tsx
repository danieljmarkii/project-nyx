import { Text, StyleSheet, TouchableOpacity } from 'react-native';
import { theme } from '../../constants/theme';

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
}

// Exported so the standalone Foods-tab row (components/foods/FoodRow) renders
// the format chip from the SAME map — one source, so a future enum addition
// can't drift one surface's labels from the other (the B-103 class of bug).
export const FORMAT_LABEL: Record<string, string> = {
  dry_kibble: 'Dry',
  wet_canned: 'Wet',
  raw: 'Raw',
  freeze_dried: 'Freeze-dried',
  jerky: 'Jerky', // B-103: B-024 added jerky to the enum + pickers but missed this map (renders "… · JERKY")
  fresh_cooked: 'Fresh',
  human_food: 'Human food', // renders as "… · HUMAN FOOD" (B-102)
  topper: 'Topper',
  treat: 'Treat',
  // 'other' intentionally maps to '' — no chip when the format is unspecified.
};

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
export function FoodTile({ brand, productName, format, onPress, onLongPress, hideBrand = false }: Props) {
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
      style={styles.tile}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${brand} ${productName}`}
      accessibilityHint="Logs this food"
    >
      {/* Guarded so a hideBrand tile with an unlabeled format ('other') doesn't
          render an empty eyebrow line above the product name. */}
      {metaLine ? (
        <Text style={styles.meta} numberOfLines={1}>
          {metaLine}
        </Text>
      ) : null}
      <Text style={styles.product} numberOfLines={2}>
        {productName}
      </Text>
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
