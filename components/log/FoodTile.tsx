import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { theme } from '../../constants/theme';

interface Props {
  brand: string;
  productName: string;
  format: string;
  onPress: () => void;
  onLongPress?: () => void;
}

const FORMAT_LABEL: Record<string, string> = {
  dry_kibble: 'Dry',
  wet_canned: 'Wet',
  raw: 'Raw',
  freeze_dried: 'Freeze-dried',
  fresh_cooked: 'Fresh',
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
export function FoodTile({ brand, productName, format, onPress, onLongPress }: Props) {
  const typeLabel = FORMAT_LABEL[format] ?? '';
  const metaLine = typeLabel
    ? `${brand.toUpperCase()} · ${typeLabel.toUpperCase()}`
    : brand.toUpperCase();

  return (
    <TouchableOpacity
      style={styles.tile}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      activeOpacity={0.7}
    >
      <Text style={styles.meta} numberOfLines={1}>
        {metaLine}
      </Text>
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
