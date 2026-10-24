import type { ReactNode } from 'react';
import { StyleSheet, TouchableOpacity, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { colorRoles, shadows, theme } from '../../constants/theme';
import { DoorMark } from '../surfaces/home/DoorMark';
import { ThemedText } from './ThemedText';
import { HEADER_ACTION_MAX_SCALE } from './HeaderAction';

// The record in edit mode (CUL-1909, the event editor round's S1 B and P1): one card per
// group of the record's facts, each fact a label and its value on one row, the record
// screen's card language on its ground. Nothing in the kit held a label/value row that
// opens what it names, so the editor drew it; the record screen's rows can share it.
//
// A row draws its own top hairline unless it leads its card (`first`), rather than the
// card walking its children: a row group may arrive inside a fragment from a shared part
// (TimeConfidenceField's rows), which a child walk cannot see into.

export function EditCard({ children, testID }: { children: ReactNode; testID?: string }) {
  return <View style={styles.card} testID={testID}>{children}</View>;
}

interface RowProps {
  label: string;
  /** The value, or what the tap does when there is no value yet ("Add a photo"). */
  value: string;
  /** A second line under the value (a food's brand and form, a drug's strength). */
  detail?: string | null;
  /** The value reads as the action itself (the action colour), not as a stored fact. */
  valueIsAction?: boolean;
  /** Leads the row, before the label: the photo's thumbnail. */
  leading?: ReactNode;
  onPress?: () => void;
  /** The whole sentence a screen reader hears, when the visible parts do not make one. */
  accessibilityLabel?: string;
  first?: boolean;
  testID?: string;
}

/**
 * A label and its value, and a › when the row opens something (C-6: the whole row is the
 * button). It wraps rather than truncates, so at the largest text the value drops under
 * its label and nothing clips (the round's §17).
 */
export function EditRow({
  label, value, detail, valueIsAction = false, leading, onPress, accessibilityLabel, first = false, testID,
}: RowProps) {
  // Past the size the header's own actions stop at, the row stacks label over value: a
  // value squeezed beside its label wraps a word to a line (the round's §17).
  const stacked = useWindowDimensions().fontScale > HEADER_ACTION_MAX_SCALE;
  const body = (
    <>
      <View style={styles.lead}>
        {leading}
        <ThemedText variant="body" style={styles.label}>{label}</ThemedText>
      </View>
      <View style={[styles.trail, stacked && styles.trailStacked]}>
        <View style={[styles.valueBlock, stacked && styles.valueBlockStacked]}>
          <ThemedText
            variant={valueIsAction ? 'caption' : 'body'}
            style={[valueIsAction ? styles.action : styles.value, stacked && styles.alignStart]}
          >
            {value}
          </ThemedText>
          {detail ? <ThemedText variant="caption" style={[styles.detail, stacked && styles.alignStart]}>{detail}</ThemedText> : null}
        </View>
        {onPress ? <DoorMark /> : null}
      </View>
    </>
  );
  const rowStyle: StyleProp<ViewStyle> = [styles.row, stacked && styles.rowStacked, !first && styles.divided];
  if (!onPress) {
    return (
      <View style={rowStyle} accessible accessibilityLabel={accessibilityLabel} testID={testID}>
        {body}
      </View>
    );
  }
  return (
    <TouchableOpacity
      style={rowStyle}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? [label, value, detail].filter(Boolean).join(', ')}
      testID={testID}
    >
      {body}
    </TouchableOpacity>
  );
}

/** A label over a control (a segmented switch, chips, a text field) inside an EditCard. */
export function EditBlock({ label, children, first = false, testID }: {
  label?: string;
  children: ReactNode;
  first?: boolean;
  testID?: string;
}) {
  return (
    <View style={[styles.block, !first && styles.divided]} testID={testID}>
      {label ? <ThemedText variant="caption" style={styles.blockLabel}>{label}</ThemedText> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colorSurface,
    borderRadius: theme.radiusMedium,
    paddingHorizontal: theme.space2,
    ...shadows.card,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: theme.space2,
    rowGap: theme.space0_5,
    minHeight: theme.hitTarget,
    paddingVertical: theme.space1_5,
  },
  rowStacked: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  trailStacked: {
    marginLeft: 0,
    justifyContent: 'space-between',
  },
  valueBlockStacked: {
    flex: 1,
    alignItems: 'flex-start',
  },
  alignStart: {
    textAlign: 'left',
  },
  divided: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colorBorder,
  },
  lead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1_5,
    flexShrink: 1,
  },
  label: {
    color: theme.colorTextPrimary,
    flexShrink: 1,
  },
  // `marginLeft: 'auto'` keeps the value at the right edge on one line, and at the left
  // under its label once the row wraps.
  trail: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 'auto',
    flexShrink: 1,
  },
  valueBlock: {
    alignItems: 'flex-end',
    flexShrink: 1,
  },
  value: {
    color: theme.colorTextPrimary,
    textAlign: 'right',
  },
  action: {
    fontWeight: theme.weightMedium,
    color: colorRoles.action.onLight,
    textAlign: 'right',
  },
  detail: {
    color: theme.colorTextSecondary,
    textAlign: 'right',
  },
  block: {
    gap: theme.space1,
    paddingVertical: theme.space1_5,
  },
  blockLabel: {
    color: theme.colorTextSecondary,
  },
});
