import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { colorRoles, theme } from '../../constants/theme';
import { Tick } from '../surfaces/waits/Tick';
import { ThemedText } from './ThemedText';

/** The largest text scale a header action follows (the iOS nav bar's own ceiling, roughly). */
export const HEADER_ACTION_MAX_SCALE = 1.3;

interface Props {
  label: string;
  onPress: () => void;
  /** `commit` is the sheet's one write (Save, Add) in the action colour; `quiet` its way out. */
  tone?: 'commit' | 'quiet';
  disabled?: boolean;
  /**
   * Why it is disabled, said with the label (C-7: `disabled` is a claim, so it carries
   * its reason). "add a name first" announces as "Save, add a name first".
   */
  disabledReason?: string;
  /** The write is in flight: the tick stands in for the label (the house wait, CUL-1593). */
  working?: boolean;
  testID?: string;
}

/**
 * A text action for `Header`'s `left` / `right` slots (CUL-1911): a form sheet's Cancel
 * and Save. Two profile forms hand rolled the same bar with typed 16 and 17pt type and
 * a teal Save; this is that pair once, on the 44pt floor by its own box.
 */
export function HeaderAction({
  label, onPress, tone = 'commit', disabled = false, disabledReason, working = false, testID,
}: Props) {
  const blocked = disabled || working;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={blocked}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={disabled && disabledReason ? `${label}, ${disabledReason}` : label}
      accessibilityState={{ disabled: blocked, busy: working }}
      style={styles.box}
      testID={testID}
    >
      {working ? (
        <View style={styles.tickSlot}>
          <Tick working testID={testID ? `${testID}-tick` : undefined} />
        </View>
      ) : (
        <ThemedText
          variant={tone === 'commit' ? 'bodyStrong' : 'body'}
          // Bar chrome holds its size as the system's own bars do: a header side is a
          // fixed width, and at AX5 an unscaled-cap label collides with the title.
          maxFontSizeMultiplier={HEADER_ACTION_MAX_SCALE}
          style={disabled ? styles.disabled : tone === 'commit' ? styles.commit : styles.quiet}
        >
          {label}
        </ThemedText>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  box: {
    minHeight: theme.hitTarget,
    justifyContent: 'center',
  },
  tickSlot: {
    minWidth: theme.space4,
    alignItems: 'flex-end',
  },
  commit: { color: colorRoles.action.onLight },
  quiet: { color: colorRoles.text.secondaryOnLight },
  disabled: { color: theme.colorTextTertiary },
});
