import { ReactNode } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { theme } from '../../constants/theme';

/**
 * The quiet band (CUL-1910, capture design round F6): a calm note about the screen's
 * own state, on the neutral ground the capped label read first used. A failed read, a
 * reached cap and an offline phone all sit here, because none of them is about the pet:
 * the concern wash (`colorRoles.concern.wash`) is for symptoms and safety, and a band
 * borrowing it says "worry" where nothing is wrong with the animal. Neither louder nor
 * quieter than the sentence inside it; the copy carries the meaning.
 */
export function QuietBand({
  children,
  style,
  testID,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <View style={[styles.band, style]} testID={testID} accessible>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    backgroundColor: theme.colorSurfaceSubtle,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusSmall,
    padding: theme.space2,
    gap: theme.space1,
  },
});
