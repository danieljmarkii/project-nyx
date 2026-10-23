import { ReactNode } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { colorRoles, theme } from '../../constants/theme';
import { ThemedText } from './ThemedText';

/**
 * One optional step as a row (CUL-1910, capture design round P2): a title, an optional
 * line saying why it matters, and a trailing mark — the action chevron while the step is
 * open, or what the caller passes once it is done (a photo thumbnail). The whole row is
 * the button, at least the 44pt floor tall. An optional leading glyph names the kind of
 * step (the log form's photo row, CUL-2189: the camera, as the log form round's P10 drew it).
 */
export function SlotRow({
  title,
  detail,
  leading,
  trailing,
  onPress,
  divided = false,
  accessibilityLabel,
  testID,
}: {
  title: string;
  detail?: string | null;
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress: () => void;
  /** A hairline above, for every row after the first. */
  divided?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}) {
  return (
    <TouchableOpacity
      style={[styles.row, divided && styles.divided]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (detail ? `${title}. ${detail}` : title)}
      testID={testID}
    >
      {leading}
      <View style={styles.copy}>
        <ThemedText variant="bodyStrong" style={styles.title}>{title}</ThemedText>
        {detail ? <ThemedText variant="caption" style={styles.detail}>{detail}</ThemedText> : null}
      </View>
      {trailing ?? <ChevronRight size={theme.space2 + theme.space0_5} color={colorRoles.action.onLight} strokeWidth={2} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
    minHeight: theme.hitTarget,
    paddingVertical: theme.space1,
  },
  divided: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colorBorder,
  },
  copy: {
    flex: 1,
    gap: theme.spaceMicro,
  },
  title: {
    color: theme.colorTextPrimary,
  },
  detail: {
    color: theme.colorTextSecondary,
  },
});
