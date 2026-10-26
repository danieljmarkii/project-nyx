import { ComponentType } from 'react';
import { TouchableOpacity, ViewStyle, StyleSheet, ActivityIndicator } from 'react-native';
import { theme, colorRoles } from '../../constants/theme';
import { ThemedText } from './ThemedText';

// 'primary' is the action colour (CUL-2200, C1 of CUL-1279's round): indigo with a white
// label, because a save is something the owner can do and indigo is the action. 'night' is
// the same job on a night ground (C3): indigo cannot show on the indigo night, so the fill
// is moonlight with a night label. The variant names the ground, so a light screen never
// reaches for the night fill. The old teal 'accent' folded into these two.
//
// Two destructive weights (CUL-1900): 'destructive' is the quiet red label for a
// secondary "remove" beside a primary action; 'destructiveFilled' is the filled red
// button for the one irreversible commit a sheet exists to make (delete account), so
// the screen stops hand rolling it. White on colorDestructive clears AA (pinned in
// constants/theme.contrast.test.ts).
//
// 'plain' (CUL-1911, the profile round's P10; the capture round drew it too) is a quiet
// text row on the 44pt floor, no fill and no edge: a rare lifecycle action that should
// recede (Add a pet, Archive at the foot of the Pet tab) or a sheet's way out.
type Variant = 'primary' | 'secondary' | 'destructive' | 'destructiveFilled' | 'night' | 'plain';

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
  primary: colorRoles.action.labelOnFill,
  secondary: theme.colorTextSecondary,
  destructive: theme.colorDestructive,
  destructiveFilled: theme.colorTextOnDark,
  night: colorRoles.action.labelOnNightFill,
  plain: theme.colorTextSecondary,
};

const SPINNER_COLOR: Record<Variant, string> = {
  primary: colorRoles.action.labelOnFill,
  secondary: theme.colorTextSecondary,
  destructive: theme.colorDestructive,
  destructiveFilled: theme.colorTextOnDark,
  night: colorRoles.action.labelOnNightFill,
  plain: theme.colorTextSecondary,
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
        variant === 'night' && styles.btnNight,
        variant === 'plain' && styles.btnPlain,
        disabled && (variant === 'plain' ? styles.btnPlainDisabled : styles.btnDisabled),
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
              variant === 'night' && styles.labelNight,
              variant === 'plain' && styles.labelPlain,
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
    backgroundColor: colorRoles.action.fill,
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
  btnNight: {
    backgroundColor: colorRoles.action.onNight,
  },
  btnDisabled: {
    backgroundColor: theme.colorBorder,
  },
  btnPlain: {
    backgroundColor: 'transparent',
    paddingVertical: 0,
    minHeight: theme.hitTarget,
  },
  // A plain row has no fill to grey out; the label alone says it is unavailable.
  btnPlainDisabled: {
    backgroundColor: 'transparent',
  },
  label: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: colorRoles.action.labelOnFill,
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
  labelNight: {
    color: colorRoles.action.labelOnNightFill,
  },
  labelPlain: {
    color: theme.colorTextSecondary,
  },
  labelDisabled: {
    color: theme.colorTextTertiary,
  },
});
