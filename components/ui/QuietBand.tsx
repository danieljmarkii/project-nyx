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
  grouped = true,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  /**
   * One stop for the whole band (the default). False when the band holds a control
   * (CUL-1911, the failed read's Try again): an accessible View on iOS hides its
   * children from VoiceOver, so a button inside a grouped band could not be reached.
   */
  grouped?: boolean;
}) {
  return (
    <View style={[styles.band, style]} testID={testID} accessible={grouped}>
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
