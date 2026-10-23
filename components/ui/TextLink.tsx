import { StyleProp, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import { colorRoles, theme, type TextStyleName } from '../../constants/theme';
import { ThemedText } from './ThemedText';

// The tone says what the link does, never what it is near (the ruled colour roles,
// #1294): `action` is anything the owner taps to act (indigo, never teal, which is a
// good fact); `quiet` a secondary aside (Clear date); `destructive` a removal (End).
type Tone = 'action' | 'quiet' | 'destructive';

interface Props {
  label: string;
  onPress: () => void;
  tone?: Tone;
  /** The type of the words; the box is the 44pt floor whatever the size. */
  variant?: TextStyleName;
  disabled?: boolean;
  /** Only when the words alone do not say what the link acts on ("Edit" → "Edit Food sensitivity"). */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * A text link (CUL-1911): words that act, at the 44pt floor by their own box, so no
 * hitSlop reaches into a neighbour (C-5). The profile tab hand rolled eleven of these,
 * each a TouchableOpacity with its own slop, colour and no button role.
 */
export function TextLink({
  label, onPress, tone = 'action', variant = 'bodyStrong', disabled = false,
  accessibilityLabel, style, testID,
}: Props) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      style={[styles.box, style]}
      testID={testID}
    >
      <ThemedText variant={variant} style={disabled ? styles.disabled : styles[tone]}>
        {label}
      </ThemedText>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  box: {
    minHeight: theme.hitTarget,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  action: { color: colorRoles.action.onLight },
  quiet: { color: colorRoles.text.secondaryOnLight },
  destructive: { color: colorRoles.destructive.onLight },
  disabled: { color: theme.colorTextTertiary },
});
