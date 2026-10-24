import { StyleSheet, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { Search } from 'lucide-react-native';
import { theme } from '../../constants/theme';

// The search box a list carries (CUL-1908, the log form round F2: both pickers drew one,
// so it moved to the kit on its second use). A lens glyph, then the query, on the quiet
// neutral well rather than a bordered field, so it reads as a filter over the list and
// not as a form asking to be filled.
//
// The box has a floor, never a height: at the largest text size the query grows and the
// box grows with it (the round's §14), where a fixed 44pt clipped it.
//
// No autofocus prop, deliberately: on a log surface the keyboard would cover the tiles
// that answer most visits (FoodPicker's B-347 note). A caller that wants it adds it here.

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  // Announced as the field's name; falls back to the placeholder, which says what it finds.
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function SearchField({ value, onChangeText, placeholder, accessibilityLabel, style, testID }: Props) {
  return (
    <View style={[styles.box, style]}>
      <Search size={16} color={theme.colorTextTertiary} strokeWidth={1.75} />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colorTextTertiary}
        accessibilityLabel={accessibilityLabel ?? placeholder}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="while-editing"
        testID={testID}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
    minHeight: theme.hitTarget,
    paddingHorizontal: theme.space2,
    backgroundColor: theme.colorNeutralLight,
    borderRadius: theme.radiusSmall,
  },
  input: {
    flex: 1,
    // A TextInput is outside ThemedText's reach, so the field names its face directly.
    fontFamily: theme.fontBody,
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
    paddingVertical: theme.space1,
  },
});
