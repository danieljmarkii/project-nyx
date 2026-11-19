import { useState } from 'react';
import { Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { colorRoles, theme } from '../../constants/theme';
import { ThemedText } from '../ui/ThemedText';
import { PLAN_GLYPH_INSET } from './PlanRows';
import { keepGoingLine } from '../../lib/vetContactAfter';
import { dayKeyToLocalDate, toLocalDayKey } from '../../lib/utils';

// *Keep going until* (CUL-2767, spec §4.3 item 2, mock C2): the trial's end, under its chips, on
// a call, text or email. "Two more weeks" said on the phone had nowhere to go (Jordan).
//
// SEEDED FROM THE TRIAL'S CURRENT END and it WRITES NOTHING until the owner picks another day:
// the line names the end the record holds, and only a changed date reaches the route, which
// writes it through the shipped extend path as the vet's call (`target_duration_vet_directed`).
// Forward only, inside the shipped extend bounds (`extendDateBounds`): a contact can move a
// trial's end later; ending or shortening it is *Ended* or the trial screen.
//
// The action is the shipped 44pt bordered box under the line, with no hitSlop (PlanRows' rule),
// so it never shares a target with the chips above it.

export interface KeepGoingRowProps {
  /** The trial's current last day, 'YYYY-MM-DD'. */
  endDayKey: string;
  /** The first and last day the extend path accepts. */
  minEndDayKey: string;
  maxEndDayKey: string;
  /** A day different from `endDayKey`, chosen by the owner. */
  onPick: (endDayKey: string) => void;
  busy: boolean;
}

export function KeepGoingRow({ endDayKey, minEndDayKey, maxEndDayKey, onPick, busy }: KeepGoingRowProps) {
  const [open, setOpen] = useState(false);
  const line = keepGoingLine(endDayKey);
  const value = dayKeyToLocalDate(endDayKey);
  const min = dayKeyToLocalDate(minEndDayKey);
  const max = dayKeyToLocalDate(maxEndDayKey);
  if (!line || !value || !min || !max) return null;
  return (
    <View style={styles.wrap} testID="keep-going-row">
      <ThemedText style={styles.line}>{line}</ThemedText>
      <TouchableOpacity
        style={styles.action}
        onPress={() => setOpen((o) => !o)}
        activeOpacity={0.7}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={busy ? `Saving — ${line}` : `Change — ${line}`}
        accessibilityState={{ disabled: busy }}
      >
        <ThemedText style={styles.actionLabel}>Change</ThemedText>
      </TouchableOpacity>
      {open ? (
        <DateTimePicker
          value={value < min ? min : value}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          themeVariant="light"
          accentColor={colorRoles.action.onLight}
          minimumDate={min}
          maximumDate={max}
          onChange={(event, picked) => {
            if (Platform.OS !== 'ios') setOpen(false);
            if (!picked || (event as { type?: string } | undefined)?.type === 'dismissed') return;
            const key = toLocalDayKey(picked);
            if (key === endDayKey || key < minEndDayKey || key > maxEndDayKey) return;
            setOpen(false);
            onPick(key);
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginLeft: PLAN_GLYPH_INSET,
    gap: theme.space1,
    alignItems: 'flex-start',
  },
  line: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },
  action: {
    minHeight: theme.hitTarget,
    justifyContent: 'center',
    paddingHorizontal: theme.space2,
    borderRadius: theme.radiusSmall,
    borderWidth: 1,
    borderColor: theme.colorBorder,
  },
  actionLabel: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: colorRoles.action.onLight,
  },
});
