import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { theme } from '../../constants/theme';
import { FORMAT_LABEL } from '../log/FoodTile';

interface Props {
  brand: string;
  productName: string;
  format: string;
  onPress: () => void;
}

// Full-width library row for the standalone Foods tab (B-004). Distinct from the
// 2-up FoodTile of the quick-log picker: the Foods tab is a browse/manage
// destination, so each food gets its own full-width row with room for the brand
// + format meta line and the product name, and a chevron signalling that a tap
// opens the food's detail screen (where you edit/classify it). There is no
// one-tap-log here — logging stays on the FAB picker path. The metadata line
// (BRAND · FORMAT) mirrors FoodTile's, sourced from the shared FORMAT_LABEL.
export function FoodRow({ brand, productName, format, onPress }: Props) {
  const typeLabel = FORMAT_LABEL[format] ?? '';
  const metaLine = typeLabel
    ? `${brand.toUpperCase()} · ${typeLabel.toUpperCase()}`
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
        <Text style={styles.meta} numberOfLines={1}>
          {metaLine}
        </Text>
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
