import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Camera } from 'lucide-react-native';
import { colorRoles, theme } from '../../constants/theme';
import { ThemedText } from '../ui/ThemedText';

// The log pickers' "add one" door: "Snap a new food" and "Add a medication" (CUL-1908
// F5). It sat on the teal wash, and the teal is a good fact (a meal eaten, a dose given),
// never a control (#1294), so it moved to the kit's card door row: the card's surface and
// hairline, the action colour on the glyph, a › saying a tap goes somewhere. Shared by
// both pickers so they read as one family (it moved here on its second use).
interface Props {
  title: string;
  hint: string;
  onPress: () => void;
}

export function PickerAddDoor({ title, hint, onPress }: Props) {
  return (
    <TouchableOpacity
      style={styles.door}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={hint}
    >
      <View style={styles.glyph}>
        <Camera size={20} color={colorRoles.action.onLight} strokeWidth={2} />
      </View>
      <View style={styles.text}>
        <ThemedText style={styles.title}>{title}</ThemedText>
        <ThemedText style={styles.hint}>{hint}</ThemedText>
      </View>
      <ThemedText style={styles.chevron} importantForAccessibility="no" accessibilityElementsHidden>
        ›
      </ThemedText>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  door: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
    minHeight: theme.space5,
    padding: theme.space2,
    backgroundColor: theme.colorSurface,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusMedium,
  },
  glyph: {
    width: theme.space3,
    alignItems: 'center',
  },
  text: {
    flex: 1,
    gap: theme.spaceMicro,
  },
  title: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  hint: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },
  chevron: {
    fontSize: theme.textLG,
    color: theme.colorTextTertiary,
  },
});
