import { ReactNode } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { theme } from '../../constants/theme';
import { DoorMark } from '../surfaces/home/DoorMark';
import { ThemedText } from './ThemedText';

interface Props {
  title: string;
  detail?: string | null;
  /** A badge or a count, ahead of the mark. */
  trailing?: ReactNode;
  onPress: () => void;
  /** One stop for the whole row (C-8): what it is, and what the tap does. */
  accessibilityLabel: string;
  testID?: string;
}

/**
 * A list row that is one door (CUL-1911, the profile round's P3): the whole row opens
 * the thing it names, marked by the one ›. One 44pt target per row, where the condition
 * rows carried two small links sharing reach.
 */
export function DoorRow({ title, detail, trailing, onPress, accessibilityLabel, testID }: Props) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      <View style={styles.text}>
        <ThemedText variant="bodyStrong" style={styles.title}>{title}</ThemedText>
        {detail ? <ThemedText variant="note" style={styles.detail}>{detail}</ThemedText> : null}
      </View>
      {trailing}
      <DoorMark />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1_5,
    minHeight: theme.hitTarget,
    paddingVertical: theme.space1_5,
    borderTopWidth: 1,
    borderTopColor: theme.colorBorder,
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: theme.spaceMicro,
  },
  title: {
    color: theme.colorTextPrimary,
  },
  detail: {
    color: theme.colorTextSecondary,
  },
});
