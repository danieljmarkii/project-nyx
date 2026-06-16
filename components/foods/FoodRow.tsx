import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { theme } from '../../constants/theme';
import { FORMAT_LABEL } from '../log/FoodTile';

interface Props {
  brand: string;
  productName: string;
  format: string;
  onPress: () => void;
  // When the row sits under a brand header (Foods-tab brand grouping, B-004
  // PR 3), the brand is already shown once above the group — so drop it from the
  // meta line and let the format stand alone ("WET"), or show nothing when the
  // format is unspecified. The brand stays in the accessibilityLabel either way,
  // so a screen reader still announces the full "<brand> <product>". Defaults to
  // showing the brand, keeping the row's standalone contract (and tests) intact.
  hideBrand?: boolean;
}

// Full-width library row for the standalone Foods tab (B-004). Distinct from the
// 2-up FoodTile of the quick-log picker: the Foods tab is a browse/manage
// destination, so each food gets its own full-width row with room for the brand
// + format meta line and the product name, and a chevron signalling that a tap
// opens the food's detail screen (where you edit/classify it). There is no
// one-tap-log here — logging stays on the FAB picker path. The metadata line
// (BRAND · FORMAT) mirrors FoodTile's, sourced from the shared FORMAT_LABEL.
export function FoodRow({ brand, productName, format, onPress, hideBrand = false }: Props) {
  const typeLabel = FORMAT_LABEL[format] ?? '';
  const formatMeta = typeLabel.toUpperCase();
  const metaLine = hideBrand
    ? formatMeta
    : typeLabel
      ? `${brand.toUpperCase()} · ${formatMeta}`
      : brand.toUpperCase();

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${brand} ${productName}`}
    >
      <View style={styles.text}>
        {metaLine ? (
          <Text style={styles.meta} numberOfLines={1}>
            {metaLine}
          </Text>
        ) : null}
        <Text style={styles.product} numberOfLines={2}>
          {productName}
        </Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
    paddingHorizontal: theme.space2,
    paddingVertical: theme.space2,
    // ≥44pt tap target; the whole row navigates (the chevron is decorative).
    minHeight: 64,
    backgroundColor: theme.colorSurface,
  },
  text: {
    flex: 1,
    gap: 2,
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
  chevron: {
    fontSize: theme.textLG,
    color: theme.colorTextTertiary,
  },
});
