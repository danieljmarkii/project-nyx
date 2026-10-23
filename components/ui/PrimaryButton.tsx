import { ComponentType } from 'react';
import { TouchableOpacity, ViewStyle, StyleSheet, ActivityIndicator } from 'react-native';
import { theme } from '../../constants/theme';
import { ThemedText } from './ThemedText';

// 'accent' is the teal marketing/acquisition-hero fill (B-251 PR 5 Landing CTA,
// PM-ratified over near-black). Distinct from 'primary' (near-black, every in-app
// submit) so the hero action on an acquisition surface can carry the interactive
// accent the rest of that screen speaks. Label rides near-black for contrast on
// the bright teal (white would fail on #00C2A8).
//
// Two destructive weights (CUL-1900): 'destructive' is the quiet red label for a
// secondary "remove" beside a primary action; 'destructiveFilled' is the filled red
// button for the one irreversible commit a sheet exists to make (delete account), so
// the screen stops hand rolling it. White on colorDestructive clears AA (pinned in
// constants/theme.contrast.test.ts).
type Variant = 'primary' | 'secondary' | 'destructive' | 'destructiveFilled' | 'accent';

// The icon slot (CUL-1910): a glyph ahead of the label, tinted by the button so it can
// never drift from the label's colour on any variant or in the disabled state. Takes a
// lucide component, not an element, for that reason.
export type ButtonIcon = ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
export const BUTTON_ICON_SIZE = 20;

interface Props {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  // Shows a spinner in place of the label and blocks presses (async submit).
  // Kept visually "working" — the button holds its variant colour rather than
  // greying out — while `disabled` is the inert/greyed state.
  loading?: boolean;
  variant?: Variant;
  icon?: ButtonIcon;
  style?: ViewStyle;
  testID?: string;
}

// Spinner tint tracks the label colour per variant so the working state reads
// on the same surface the resting label did.
// The resting label colour per variant; the icon slot reads it too.
const LABEL_COLOR: Record<Variant, string> = {
  primary: theme.colorTextOnDark,
  secondary: theme.colorTextSecondary,
  destructive: theme.colorDestructive,
  destructiveFilled: theme.colorTextOnDark,
  accent: theme.colorNeutralDark,
};

const SPINNER_COLOR: Record<Variant, string> = {
  primary: theme.colorTextOnDark,
  secondary: theme.colorTextSecondary,
  destructive: theme.colorDestructive,
  destructiveFilled: theme.colorTextOnDark,
  // Matches the accent variant's near-black label on the teal fill.
  accent: theme.colorNeutralDark,
};

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  variant = 'primary',
  icon: Icon,
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
        Icon ? styles.btnWithIcon : null,
        variant === 'secondary' && styles.btnSecondary,
        variant === 'destructive' && styles.btnDestructive,
        variant === 'destructiveFilled' && styles.btnDestructiveFilled,
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
        <>
          {Icon ? (
            <Icon
              size={BUTTON_ICON_SIZE}
              color={disabled ? theme.colorTextTertiary : LABEL_COLOR[variant]}
              strokeWidth={2}
            />
          ) : null}
          <ThemedText
            style={[
              styles.label,
              variant === 'secondary' && styles.labelSecondary,
              variant === 'destructive' && styles.labelDestructive,
              variant === 'accent' && styles.labelAccent,
              disabled && styles.labelDisabled,
            ]}
          >
            {label}
          </ThemedText>
        </>
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
  btnWithIcon: {
    flexDirection: 'row',
    gap: theme.space1,
  },
  btnSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.colorBorder,
  },
  btnDestructive: {
    backgroundColor: 'transparent',
  },
  btnDestructiveFilled: {
    backgroundColor: theme.colorDestructive,
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
    // A long label wraps (e.g. the onboarding acknowledgment); the block is
    // centred by the button, but the lines inside it need centring too.
    textAlign: 'center',
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
