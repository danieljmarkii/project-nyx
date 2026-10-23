import { StyleSheet, View } from 'react-native';
import { theme } from '../../constants/theme';
import { ThemedText } from './ThemedText';

export interface Fact {
  label: string;
  value: string;
}

/**
 * Label and value rows under a hairline (CUL-1910, capture design round P4): what a read
 * produced, one fact per row, each checkable against the photo above it. Each row is one
 * accessible element whose label is the pair ("Brand, Hillside Kitchen"), so a screen
 * reader hears the fact once rather than two fragments it has to rejoin (C-8).
 *
 * The row wraps: at the largest text sizes the value drops under its label instead of
 * squeezing either into a clipped column.
 */
export function FactRows({ facts, testID }: { facts: readonly Fact[]; testID?: string }) {
  return (
    <View testID={testID}>
      {facts.map((f, i) => (
        <View
          key={f.label}
          style={[styles.row, i > 0 && styles.divided]}
          accessible
          accessibilityLabel={`${f.label}, ${f.value}`}
        >
          <ThemedText variant="caption" style={styles.label}>{f.label}</ThemedText>
          <ThemedText variant="body" style={styles.value}>{f.value}</ThemedText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    columnGap: theme.space2,
    rowGap: theme.space0_5,
    paddingVertical: theme.space1,
  },
  divided: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colorBorder,
  },
  label: {
    color: theme.colorTextSecondary,
  },
  value: {
    color: theme.colorTextPrimary,
    flexShrink: 1,
    textAlign: 'right',
  },
});
