import { StyleSheet, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { theme } from '../../constants/theme';
import { ThemedText } from './ThemedText';

// One number entered as the screen's whole answer, with its unit beside it (CUL-1908,
// the log form round F2: the weight step's value, and the event editor's after it).
// The value is the hero number of the type scale, centred, with a quiet unit; nothing
// in the kit held this shape, so the weight step hand rolled it.
//
// The value keeps a floor wide enough for "100.0" at text2XL, so an empty or one digit
// value does not collapse the row and jump the unit left as the owner types.
const VALUE_MIN_WIDTH = theme.space6 * 2 - theme.space1;

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  unit: string;
  // Announced as the field's name ("Weight in pounds"); the unit alone is not a name.
  accessibilityLabel: string;
  placeholder?: string;
  autoFocus?: boolean;
  // A line under the value, for where a prefilled number came from (P9). Plain text,
  // read after the field.
  caption?: string | null;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function NumberField({
  value, onChangeText, unit, accessibilityLabel, placeholder, autoFocus = false, caption, style, testID,
}: Props) {
  return (
    <View style={[styles.block, style]}>
      <View style={styles.row}>
        <TextInput
          style={styles.value}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.colorTextTertiary}
          keyboardType="decimal-pad"
          returnKeyType="done"
          autoFocus={autoFocus}
          accessibilityLabel={accessibilityLabel}
          testID={testID}
        />
        <ThemedText style={styles.unit}>{unit}</ThemedText>
      </View>
      {caption ? <ThemedText style={styles.caption}>{caption}</ThemedText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Stretched, never centred as a column: the row then takes the container's width and
  // centres its value inside it, where a centred column sized the row to the input's own
  // intrinsic width, which can be wider than the screen and pushed the unit off it.
  block: {
    gap: theme.space1,
    paddingVertical: theme.space3,
  },
  row: {
    flexDirection: 'row',
    // The value may shrink to fit beside its unit, never push the unit off the row.
    maxWidth: '100%',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: theme.space1,
  },
  value: {
    fontSize: theme.text2XL,
    // A TextInput is outside ThemedText's reach, so the field names its face directly.
    fontFamily: theme.fontBodyMedium,
    color: theme.colorNeutralDark,
    minWidth: VALUE_MIN_WIDTH,
    flexShrink: 1,
    textAlign: 'right',
    padding: 0,
  },
  unit: {
    fontSize: theme.textLG,
    color: theme.colorTextSecondary,
  },
  caption: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextSecondary,
    textAlign: 'center',
  },
});
