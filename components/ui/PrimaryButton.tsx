import { TouchableOpacity, Text, ViewStyle, StyleSheet } from 'react-native';
import { theme } from '../../constants/theme';

type Variant = 'primary' | 'secondary' | 'destructive';

interface Props {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: Variant;
  style?: ViewStyle;
}

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  variant = 'primary',
  style,
}: Props) {
  return (
    <TouchableOpacity
      style={[
        styles.btn,
        variant === 'secondary' && styles.btnSecondary,
        variant === 'destructive' && styles.btnDestructive,
        disabled && styles.btnDisabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
    >
      <Text
        style={[
          styles.label,
          variant === 'secondary' && styles.labelSecondary,
          variant === 'destructive' && styles.labelDestructive,
          disabled && styles.labelDisabled,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    backgroundColor: theme.colorNeutralDark,
    borderRadius: theme.radiusMedium,
    paddingVertical: theme.space2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.colorBorder,
  },
  btnDestructive: {
    backgroundColor: 'transparent',
  },
  btnDisabled: {
    backgroundColor: theme.colorBorder,
  },
  label: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: '#fff',
    letterSpacing: theme.trackingNormal,
  },
  labelSecondary: {
    color: theme.colorTextSecondary,
  },
  labelDestructive: {
    color: '#C0392B',
  },
  labelDisabled: {
    color: theme.colorTextTertiary,
  },
});
