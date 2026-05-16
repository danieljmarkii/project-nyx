import { View, ViewStyle, StyleSheet } from 'react-native';
import { theme } from '../../constants/theme';

interface Props {
  style?: ViewStyle;
}

export function Divider({ style }: Props) {
  return <View style={[styles.divider, style]} />;
}

const styles = StyleSheet.create({
  divider: {
    height: 1,
    backgroundColor: theme.colorBorder,
  },
});
