import { View, ViewStyle, StyleSheet } from 'react-native';
import { theme, shadows } from '../../constants/theme';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
  /** Drops the border and adds a shadow — use for the dominant surface on a screen */
  elevated?: boolean;
  noPadding?: boolean;
}

export function Card({ children, style, elevated = false, noPadding = false }: Props) {
  return (
    <View
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
