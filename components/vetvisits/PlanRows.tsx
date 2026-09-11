import type { ReactNode } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { theme } from '../../constants/theme';
import { ChipGroup, type ChipGroupOption } from '../ui/ChipGroup';
import { ThemedText } from '../ui/ThemedText';

// The after-visit screen's plan rows (mock D1).
//
// TWO SHAPES, and the split is the answer to the PM's question — "if we have a
// medication logged, how do we start that med?" — which R-D1 answers by not asking:
//
//   • `PlanChipRow`   — the record HOLDS this thing, so the row is a CONFIRMATION.
//                       Its chips are what the vet just decided about a course or a
//                       trial that already exists.
//   • `PlanActionRow` — the record does NOT hold it, so the row is a DOOR. One
//                       action, and it opens the real setup rather than a shadow of
//                       it, with this visit as its origin.
//
// Neither shape has a *Later* control, and that is the design rather than an
// omission (Designer, Principle 1): *Later* is a row's RESTING STATE — no chip
// selected, no action taken, the visit saves with the row exactly as it is. A button
// for "do nothing" would add a decision to a screen whose whole argument is that it
// does not ask for any.

interface ChipRowProps {
  glyph: ReactNode;
  title: string;
  /** What the record holds — never a number the row computed (CUL-746). */
  subtitle?: string;
  options: ChipGroupOption[];
  /** The verdict already given, or null — the resting state. */
  value: string | null;
  onChange: (next: string) => void;
  /** Inert while the write this row started is in flight (ChipGroup's busy state). */
  busy?: boolean;
}

export function PlanChipRow({ glyph, title, subtitle, options, value, onChange, busy }: ChipRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.head}>
        <View style={styles.glyph}>{glyph}</View>
        <View style={styles.headMain}>
          <ThemedText style={styles.title}>{title}</ThemedText>
          {subtitle ? <ThemedText style={styles.subtitle}>{subtitle}</ThemedText> : null}
        </View>
      </View>
      <ChipGroup
        options={options}
        value={value}
        // A verdict cannot be un-given: *Stopped* ends a course and *Ended* ends a
        // trial, and neither has an inverse in this app. Deselect would offer one.
        allowDeselect={false}
        onChange={(next) => {
          if (next) onChange(next);
        }}
        disabled={busy}
        accessibilityLabel={`What happened with ${title}`}
        style={styles.chips}
      />
    </View>
  );
}

interface ActionRowProps {
  glyph: ReactNode;
  title: string;
  subtitle?: string;
  actionLabel: string;
  onPress: () => void;
  busy?: boolean;
  /** A second, quieter door beside the first (Sam's "add the food to the library"). */
  secondaryLabel?: string;
  onSecondaryPress?: () => void;
}

export function PlanActionRow({
  glyph, title, subtitle, actionLabel, onPress, busy, secondaryLabel, onSecondaryPress,
}: ActionRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.head}>
        <View style={styles.glyph}>{glyph}</View>
        <View style={styles.headMain}>
          <ThemedText style={styles.title}>{title}</ThemedText>
          {subtitle ? <ThemedText style={styles.subtitle}>{subtitle}</ThemedText> : null}
        </View>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.action}
          onPress={onPress}
          activeOpacity={0.7}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`${actionLabel} — ${title}`}
          accessibilityState={{ disabled: !!busy }}
        >
          <ThemedText style={styles.actionLabel}>{actionLabel}</ThemedText>
        </TouchableOpacity>
        {secondaryLabel && onSecondaryPress ? (
          <TouchableOpacity
            style={styles.action}
            onPress={onSecondaryPress}
            activeOpacity={0.7}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={`${secondaryLabel} — ${title}`}
            accessibilityState={{ disabled: !!busy }}
          >
            <ThemedText style={styles.secondaryLabel}>{secondaryLabel}</ThemedText>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

/** A row whose action is DONE — what the record now says, with no control. */
export function PlanSettledRow({ glyph, title, subtitle }: { glyph: ReactNode; title: string; subtitle?: string }) {
  // A plain View with `accessible`, NOT a `disabled` touchable: no control exists in
  // this state, and `disabled` is an accessibility CLAIM that one does (C-7).
  return (
    <View style={styles.row} accessible accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}>
      <View style={styles.head}>
        <View style={styles.glyph}>{glyph}</View>
        <View style={styles.headMain}>
          <ThemedText style={styles.title}>{title}</ThemedText>
          {subtitle ? <ThemedText style={styles.subtitle}>{subtitle}</ThemedText> : null}
        </View>
      </View>
    </View>
  );
}

// Two touchable siblings in `actions` need `gap >= facing hitSlop(a) + facing
// hitSlop(b)` (C-5). Neither carries any hitSlop — each is a real box at the 44pt
// floor — so the gap only has to separate two boxes that already meet the target.
const ACTION_GAP = theme.space2;

const styles = StyleSheet.create({
  row: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colorBorder,
    gap: theme.space2,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.space2,
  },
  glyph: {
    width: 22,
    alignItems: 'center',
    // Nudged onto the title's cap height rather than its line box.
    paddingTop: 2,
  },
  headMain: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  subtitle: {
    fontSize: theme.textXS,
    color: theme.colorTextSecondary,
    marginTop: 2,
  },
  chips: {
    // Clears the glyph column so the chips line up under the title, not the icon.
    marginLeft: 22 + theme.space2,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 22 + theme.space2,
    columnGap: ACTION_GAP,
    rowGap: theme.space1,
    flexWrap: 'wrap',
  },
  action: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: theme.space2,
    borderRadius: theme.radiusSmall,
    borderWidth: 1,
    borderColor: theme.colorBorder,
  },
  actionLabel: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorAccentInk,
  },
  secondaryLabel: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },
});
