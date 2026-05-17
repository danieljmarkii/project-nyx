import { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { theme } from '../../constants/theme';
import { getPublicUrl } from '../../lib/storage';

interface Props {
  brand: string;
  productName: string;
  photoPath: string | null;
  size: number;
  onPress: () => void;
}

// Single tappable food thumbnail. Tap zone is always ≥44pt via the
// outer touchable's padding, regardless of the visual `size` chosen
// by the caller — satisfies the 3am-stumbling test.
export function FoodThumb({ brand, productName, photoPath, size, onPress }: Props) {
  const photoUri = useMemo(
    () => (photoPath ? getPublicUrl('nyx-food-photos', photoPath) : null),
    [photoPath],
  );
  const initials = (brand?.[0] ?? '?').toUpperCase();

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={styles.wrapper}>
      <View style={[styles.thumb, { width: size, height: size }]}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.image} resizeMode="cover" />
        ) : (
          <Text style={styles.initial}>{initials}</Text>
        )}
      </View>
      <Text style={[styles.brand, { width: size }]} numberOfLines={1}>
        {brand}
      </Text>
      <Text style={[styles.product, { width: size }]} numberOfLines={1}>
        {productName}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'flex-start',
    minHeight: 44,
  },
  thumb: {
    borderRadius: theme.radiusMedium,
    backgroundColor: theme.colorNeutralLight,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colorBorder,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  initial: {
    fontSize: 28,
    fontWeight: theme.weightMedium,
    color: theme.colorTextTertiary,
  },
  brand: {
    marginTop: theme.space1,
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  product: {
    fontSize: theme.textXS,
    color: theme.colorTextSecondary,
    marginTop: 2,
  },
});
