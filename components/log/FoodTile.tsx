import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { theme } from '../../constants/theme';

interface Props {
  brand: string;
  productName: string;
  format: string;
  onPress: () => void;
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

// Text-only food tile. Hierarchy (top→bottom): brand, product name (2 lines),
// type label. Tap anywhere → meal logs immediately. Tile is the full tap
// target (≥44pt by virtue of minHeight: 88).
export function FoodTile({ brand, productName, format, onPress }: Props) {
  const typeLabel = FORMAT_LABEL[format] ?? '';

  return (
    <TouchableOpacity
      style={styles.tile}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.content}>
        <Text style={styles.brand} numberOfLines={1}>
          {brand}
        </Text>
        <Text style={styles.product} numberOfLines={2}>
          {productName}
        </Text>
      </View>
      {typeLabel ? <Text style={styles.type}>{typeLabel.toUpperCase()}</Text> : null}
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
    justifyContent: 'space-between',
  },
  content: {
    gap: 2,
  },
  brand: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  product: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: 18,
  },
  type: {
    fontSize: theme.textXS,
    fontWeight: theme.weightMedium,
    color: theme.colorTextTertiary,
    letterSpacing: theme.trackingWidest,
    marginTop: theme.space1,
  },
});
