import { TouchableOpacity, Text, ViewStyle, StyleSheet, ActivityIndicator } from 'react-native';
import { theme } from '../../constants/theme';

// 'accent' is the teal marketing/acquisition-hero fill (B-251 PR 5 Landing CTA,
// PM-ratified over near-black). Distinct from 'primary' (near-black, every in-app
// submit) so the hero action on an acquisition surface can carry the interactive
// accent the rest of that screen speaks. Label rides near-black for contrast on
// the bright teal (white would fail on #00C2A8).
type Variant = 'primary' | 'secondary' | 'destructive' | 'accent';

interface Props {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  // Shows a spinner in place of the label and blocks presses (async submit).
  // Kept visually "working" — the button holds its variant colour rather than
  // greying out — while `disabled` is the inert/greyed state.
  loading?: boolean;
  variant?: Variant;
  style?: ViewStyle;
  testID?: string;
}

// Spinner tint tracks the label colour per variant so the working state reads
// on the same surface the resting label did.
const SPINNER_COLOR: Record<Variant, string> = {
  primary: theme.colorTextOnDark,
  secondary: theme.colorTextSecondary,
  destructive: theme.colorDestructive,
  // Matches the accent variant's near-black label on the teal fill.
  accent: theme.colorNeutralDark,
};

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  variant = 'primary',
  style,
  testID,
}: Props) {
  // Loading blocks presses too, but only `disabled` paints the greyed style —
  // a loading primary button stays primary-coloured with a spinner.
  const isInteractionBlocked = disabled || loading;

  return (
    <TouchableOpacity
      style={[
        styles.btn,
        variant === 'secondary' && styles.btnSecondary,
        variant === 'destructive' && styles.btnDestructive,
        variant === 'accent' && styles.btnAccent,
        disabled && styles.btnDisabled,
        style,
      ]}
      onPress={onPress}
      disabled={isInteractionBlocked}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isInteractionBlocked, busy: loading }}
      testID={testID}
    >
      {loading ? (
        <ActivityIndicator
          // Mirror the label's disabled branch — a white spinner on the greyed
          // (disabled) fill would be near-invisible when disabled + loading.
          color={disabled ? theme.colorTextTertiary : SPINNER_COLOR[variant]}
          testID={testID ? `${testID}-spinner` : undefined}
        />
      ) : (
        <Text
          style={[
            styles.label,
            variant === 'secondary' && styles.labelSecondary,
            variant === 'destructive' && styles.labelDestructive,
            variant === 'accent' && styles.labelAccent,
            disabled && styles.labelDisabled,
          ]}
        >
          {label}
        </Text>
      )}
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
  btnAccent: {
    backgroundColor: theme.colorAccent,
  },
  btnDisabled: {
    backgroundColor: theme.colorBorder,
  },
  label: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorTextOnDark,
    letterSpacing: theme.trackingNormal,
  },
  labelSecondary: {
    color: theme.colorTextSecondary,
  },
  labelDestructive: {
    color: theme.colorDestructive,
  },
  labelAccent: {
    color: theme.colorNeutralDark,
  },
  labelDisabled: {
    color: theme.colorTextTertiary,
  },
});
