import { ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { theme } from '../../constants/theme';

interface SettingsRowProps {
  label: string;
  /** Quiet second line under the label (e.g. "We usually reply within a day"). */
  sublabel?: string;
  /** Makes the row a button. Omit for a display-only / disabled row. */
  onPress?: () => void;
  /** Trailing content (a "Coming soon" note, a value) rendered before the chevron. */
  trailing?: ReactNode;
  /** Append a right chevron — the affordance for a row that pushes a screen. */
  chevron?: boolean;
  /** Red label for the destructive action (Delete account). */
  destructive?: boolean;
  /** Non-interactive + greyed (a legal row while its URL isn't live, §D5). */
  disabled?: boolean;
  /** First row in its card omits the top hairline so the card edge stays clean. */
  first?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

// One list-row primitive for the You screen and its sub-screens (§4.2). A row is
// a 44pt-min tap target with a label, an optional sub-line, and an optional
// trailing slot (chevron / "Coming soon" / value). Shared so PR 3 (Notifications)
// and PR 4 (Share feedback) drop a row in without re-inventing the layout, and
// so every row on the surface clears the tap floor identically.
export function SettingsRow({
  label,
  sublabel,
  onPress,
  trailing,
  chevron = false,
  destructive = false,
  disabled = false,
  first = false,
  accessibilityLabel,
  accessibilityHint,
}: SettingsRowProps) {
  const inner = (
    <View style={[styles.row, !first && styles.rowDivider]}>
      <View style={styles.lead}>
        <Text
          style={[
            styles.label,
            destructive && styles.labelDestructive,
            disabled && styles.labelDisabled,
          ]}
        >
          {label}
        </Text>
        {sublabel ? <Text style={styles.sub}>{sublabel}</Text> : null}
      </View>
      {trailing}
      {chevron && (
        <ChevronRight
          size={18}
          color={disabled ? theme.colorTextDisabled : theme.colorTextTertiary}
          strokeWidth={2}
        />
      )}
    </View>
  );

  // Display-only or disabled: a plain View, but a disabled row still announces
  // its state to screen readers (§4.5).
  if (!onPress || disabled) {
    return (
      <View
        accessibilityRole={disabled ? 'button' : undefined}
        accessibilityState={disabled ? { disabled: true } : undefined}
        accessibilityLabel={disabled ? accessibilityLabel ?? label : undefined}
      >
        {inner}
      </View>
    );
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
    >
      {inner}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
    minHeight: 52,
    paddingVertical: theme.space1,
    paddingHorizontal: theme.space2,
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: theme.colorBorder,
  },
  lead: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  label: {
    fontFamily: theme.fontBody,
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
  },
  labelDestructive: {
    color: theme.colorDestructive,
  },
  labelDisabled: {
    color: theme.colorTextDisabled,
  },
  sub: {
    fontFamily: theme.fontBody,
    fontSize: theme.textSM,
    color: theme.colorTextTertiary,
    lineHeight: theme.lineHeightSM,
  },
});
