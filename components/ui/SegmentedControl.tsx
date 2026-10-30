import { StyleSheet, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { shadows, theme } from '../../constants/theme';
import { ThemedText } from './ThemedText';

// Two or three fixed, equal options on one track (`.claude/rules/ui.md` § Filters &
// scopes; CUL-1900). Built from `MetricDetailScreen`'s window switch, the shape that
// rule pointed at; both local copies, there and in `TimeConfidenceField`, now draw
// it (CUL-2278). A longer or growable set is a
// `ScopeMenu`; a lone toggle is a `FilterChip`.
//
// NO hitSlop, by design (C-5, CUL-657). Segments are flex siblings a hairline apart,
// each already at the 44pt floor across its share of the width, so slop buys no reach
// and only makes neighbours share a band where a tap resolves by z-order, not intent.
// On a classifier (Saw it / Found it) the wrong segment is a wrong record.
//
// `stacked` puts the segments in a column, each sized by its label, for a caller whose
// options cannot share one row at the accessibility text sizes (Patterns' three ranges
// at 320, CUL-2265). Stacked segments sit a hairline apart at the 44pt floor too, so the
// no-slop rule above holds in both directions.
//
// No `disabled` prop yet: neither copy it replaces locks, and `disabled` is a claim
// that needs a reason beside it (C-7). The first caller that must lock adds both.

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  // Announced in place of `label` when the visible word needs more to stand alone.
  accessibilityLabel?: string;
}

interface Props<T extends string> {
  options: ReadonlyArray<SegmentOption<T>>;
  // `null` selects no segment: a record that never answered shows the absence,
  // rather than the control asserting a default the owner did not pick (B-527).
  value: T | null;
  onChange: (value: T) => void;
  stacked?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  stacked = false,
  style,
  testID,
}: Props<T>) {
  return (
    <View style={[styles.track, stacked && styles.trackStacked, style]} testID={testID}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <TouchableOpacity
            key={option.value}
            style={[styles.segment, stacked && styles.segmentStacked, selected && styles.segmentSelected]}
            onPress={() => onChange(option.value)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={option.accessibilityLabel}
            accessibilityState={{ selected }}
            testID={testID ? `${testID}-${option.value}` : undefined}
          >
            <ThemedText
              style={[styles.label, selected && styles.labelSelected]}
              numberOfLines={1}
            >
              {option.label}
            </ThemedText>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: theme.colorSurfaceSubtle,
    borderRadius: theme.radiusSmall,
    padding: theme.spaceMicro,
    gap: theme.spaceMicro,
  },
  segment: {
    flex: 1,
    minHeight: theme.hitTarget,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.space1,
    borderRadius: theme.radiusXS,
  },
  trackStacked: {
    flexDirection: 'column',
  },
  // Sized by its label in the column, never a zero flex basis, which would hold a
  // segment at 44pt while its label outgrew it.
  segmentStacked: {
    flexGrow: 0,
    flexBasis: 'auto',
  },
  // White on the subtle track is a quiet lift, so the selected label also changes
  // ink and weight: the state never rides on the fill alone.
  segmentSelected: {
    backgroundColor: theme.colorSurface,
    ...shadows.sm,
  },
  label: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
  },
  labelSelected: {
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
  },
});
