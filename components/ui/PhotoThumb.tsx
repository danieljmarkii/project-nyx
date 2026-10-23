import { Image, StyleSheet, TouchableOpacity } from 'react-native';
import { theme } from '../../constants/theme';
import { ThemedText } from './ThemedText';

export const PHOTO_THUMB_SIZE = theme.space6;

/**
 * A photo the owner already took, kept in view as a square thumbnail (CUL-1910, capture
 * design round P7): tap to see it full size. With `caption` it is a row (thumbnail and a
 * line beside it, the whole row the button); without, the thumbnail alone, sized for the
 * trailing slot of a row.
 */
export function PhotoThumb({
  uri,
  onPress,
  caption,
  accessibilityLabel,
  size = PHOTO_THUMB_SIZE,
  testID,
}: {
  uri: string;
  onPress: () => void;
  caption?: string;
  accessibilityLabel: string;
  size?: number;
  testID?: string;
}) {
  return (
    <TouchableOpacity
      style={[styles.row, { minHeight: Math.max(size, theme.hitTarget) }]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="imagebutton"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint="Opens the photo full screen"
      testID={testID}
    >
      <Image source={{ uri }} style={[styles.thumb, { width: size, height: size }]} resizeMode="cover" />
      {caption ? <ThemedText variant="caption" style={styles.caption}>{caption}</ThemedText> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1_5,
  },
  thumb: {
    borderRadius: theme.radiusSmall,
    backgroundColor: theme.colorNeutralLight,
    flexShrink: 0,
  },
  caption: {
    flex: 1,
    color: theme.colorTextSecondary,
  },
});
