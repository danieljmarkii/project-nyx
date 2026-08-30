import { View, ViewStyle, StyleSheet, type LayoutChangeEvent } from 'react-native';
import { theme, shadows } from '../../constants/theme';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
  /** Drops the border and adds a shadow — use for the dominant surface on a screen */
  elevated?: boolean;
  noPadding?: boolean;
  /** Measure the card's position within its parent (CUL-170's scroll anchors).
   *  A passthrough rather than a wrapper View at the call site, so anchoring a
   *  card cannot change the layout it is measuring. */
  onLayout?: (event: LayoutChangeEvent) => void;
  testID?: string;
}

export function Card({
  children, style, elevated = false, noPadding = false, onLayout, testID,
}: Props) {
  return (
    <View
      onLayout={onLayout}
      testID={testID}
      style={[
        styles.card,
        elevated ? styles.elevated : styles.bordered,
        noPadding && styles.noPadding,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colorSurface,
    borderRadius: theme.radiusMedium,
    padding: theme.space3,
  },
  bordered: {
    borderWidth: 1,
    borderColor: theme.colorBorder,
  },
  elevated: {
    ...shadows.md,
  },
  noPadding: {
    padding: 0,
  },
});
