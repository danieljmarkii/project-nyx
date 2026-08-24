import { useEffect, useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  StyleProp,
  ViewStyle,
  TextInputProps,
  AccessibilityInfo,
  Platform,
} from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { useAppActive } from '../../hooks/useAppActive';
import { ThemedText } from './ThemedText';

// The reveal toggle's own hit box. A 20pt glyph propped up by hitSlop met 44pt
// only by spilling over the input, so keep the number here and let the test
// assert the resolved box rather than trusting the slop arithmetic.
const REVEAL_TARGET = 44;

// The pass-through subset of native TextInput props onboarding + auth screens
// actually reach for (email/password autofill, keyboard type, submit handling).
// Curated rather than `...TextInputProps` so the primitive's surface stays
// intentional and typed — the "no magic" convention.
type ForwardedInputProps = Pick<
  TextInputProps,
  | 'autoCapitalize'
  | 'autoCorrect'
  | 'autoComplete'
  | 'keyboardType'
  | 'textContentType'
  | 'returnKeyType'
  | 'onSubmitEditing'
  | 'autoFocus'
  | 'editable'
  | 'maxLength'
  | 'onBlur'
  | 'onFocus'
>;

interface Props extends ForwardedInputProps {
  value: string;
  onChangeText: (text: string) => void;
  label?: string;
  placeholder?: string;
  // When true, renders the masked-input toggle (show/hide eye). Reveal state is
  // owned locally so the parent never has to thread it through.
  secureTextEntry?: boolean;
  // Presence of an error string puts the field in the error state (destructive
  // border + inline message). Kept as a message, not a boolean, so the copy
  // stays calm and specific (Principle 4 / nyx-voice) — the consumer owns wording.
  error?: string | null;
  // Announced to a screen reader as the input's name; falls back to `label`.
  accessibilityLabel?: string;
  testID?: string;
  // Outer-container style hook (margins / width). The field itself stays
  // spacing-agnostic so forms control the rhythm between fields.
  containerStyle?: StyleProp<ViewStyle>;
}

/**
 * The shared single-line text input the app lacked — ~6 screens hand-rolled the
 * same bordered-input block (auth, PetForm, the profile modals). One primitive
 * so they stop drifting: a calm label, a focus ring that reuses the single
 * interactive accent, an inline (never red-alarm) error state, a built-in
 * password reveal, and a ≥44pt target with an accessible label/role.
 */
export function TextField({
  value,
  onChangeText,
  label,
  placeholder,
  secureTextEntry = false,
  error,
  accessibilityLabel,
  testID,
  containerStyle,
  onFocus,
  onBlur,
  ...inputProps
}: Props) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const appActive = useAppActive();

  const hasError = !!error;

  // Reveal is a glance, not a mode: drop back to masked whenever the app leaves
  // the foreground. The guaranteed win is the return trip — an owner who reveals
  // their password and then gets interrupted comes back to a masked field instead
  // of plaintext sitting on screen for whoever is holding the phone. It also
  // narrows the iOS app-switcher snapshot, though only best-effort there: the
  // snapshot is taken around the same resign-active transition this fires on, so
  // treat that as a narrowing, not a guarantee.
  useEffect(() => {
    if (!appActive) setRevealed(false);
  }, [appActive]);

  // `accessibilityLiveRegion` on the error text is Android-only; announce
  // imperatively on iOS (Nyx ships iOS-first) so VoiceOver reads a newly
  // surfaced validation error too. Fires only when the error changes.
  useEffect(() => {
    if (error && Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibility(error);
    }
  }, [error]);
  // Error is the loudest state and wins the border; focus is the calm accent
  // ring; resting is the neutral hairline.
  const borderColor = hasError
    ? theme.colorDestructive
    : focused
      ? theme.colorAccent
      : theme.colorBorder;

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? <ThemedText style={styles.label}>{label}</ThemedText> : null}

      <View
        style={[styles.field, { borderColor }]}
        testID={testID ? `${testID}-field` : undefined}
      >
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.colorTextTertiary}
          // When `secureTextEntry`, the eye toggle flips the mask; otherwise the
          // input is never secured.
          secureTextEntry={secureTextEntry && !revealed}
          accessibilityLabel={accessibilityLabel ?? label}
          accessibilityHint={hasError ? error ?? undefined : undefined}
          testID={testID}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...inputProps}
        />

        {secureTextEntry ? (
          <TouchableOpacity
            onPress={() => setRevealed((r) => !r)}
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
            style={styles.eyeButton}
            testID={testID ? `${testID}-reveal` : undefined}
          >
            {revealed ? (
              <EyeOff size={20} color={theme.colorTextSecondary} strokeWidth={1.75} />
            ) : (
              <Eye size={20} color={theme.colorTextSecondary} strokeWidth={1.75} />
            )}
          </TouchableOpacity>
        ) : null}
      </View>

      {hasError ? (
        <ThemedText
          style={styles.error}
          accessibilityLiveRegion="polite"
          testID={testID ? `${testID}-error` : undefined}
        >
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    // Spacing-agnostic by design — the parent form owns vertical rhythm.
    width: '100%',
  },
  label: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
    marginBottom: theme.space1,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    // ≥44pt target floor (space5 = 48).
    minHeight: theme.space5,
    borderWidth: 1,
    borderRadius: theme.radiusSmall,
    paddingHorizontal: theme.space2,
    backgroundColor: theme.colorSurface,
  },
  input: {
    flex: 1,
    // A TextInput is outside ThemedText's reach (the wrapper wraps Text), so the
    // field names its face directly — otherwise a swept screen keeps SF inputs.
    fontFamily: theme.fontBody,
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
    // Vertical padding for comfortable touch on Android; the container's
    // minHeight still enforces the 44pt floor when the text is short.
    paddingVertical: theme.space1,
  },
  eyeButton: {
    // A real 44pt box instead of a 20pt glyph plus hitSlop. As a flex sibling it
    // claims its own 44pt of the row, so the target stops overlapping the input —
    // the old left slop swallowed the last few points of the text field, toggling
    // the mask when the owner meant to place the cursor. Glyph stays flush right,
    // so it lands optically where the old padding put it.
    width: REVEAL_TARGET,
    height: REVEAL_TARGET,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  error: {
    fontSize: theme.textSM,
    color: theme.colorDestructive,
    marginTop: theme.spaceMicro,
  },
});
