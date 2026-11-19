import { useState } from 'react';
import { Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { colorRoles, theme } from '../../constants/theme';
import { ThemedText } from '../ui/ThemedText';
import { PLAN_GLYPH_INSET } from './PlanRows';
import { keepGoingLine, trialEndPassedLine } from '../../lib/vetContactAfter';
import { dayKeyToLocalDate, toLocalDayKey } from '../../lib/utils';

// *Keep going until* (CUL-2767, spec §4.3 item 2, mock C2): the trial's end, under its chips, on
// a call, text or email. "Two more weeks" said on the phone had nowhere to go (Jordan).
//
// SEEDED FROM THE TRIAL'S CURRENT END and it WRITES NOTHING until the owner presses *Extend the
// trial*. A picked day is STAGED: the line names the new end and the old one, and the press is
// the write, exactly as *Extended*'s panel does it (§4.4 R6). The extend path is forward only, so
// a mis-tapped cell on an inline calendar would otherwise be a permanent end the report prints as
// the vet's call (pm-feature-review, Jordan). Forward only, inside the shipped extend bounds.
//
// Each action is the shipped 44pt bordered box with no hitSlop (PlanRows' rule), so neither
// shares a target with the chips above it or with its neighbour.

export interface KeepGoingRowProps {
  /** The trial's current last day, 'YYYY-MM-DD'. */
  endDayKey: string;
  /** The first and last day the extend path accepts. */
  minEndDayKey: string;
  maxEndDayKey: string;
  /** Today, 'YYYY-MM-DD': an end already passed reads as one. */
  todayKey: string;
  /** A day different from `endDayKey`, chosen and then confirmed by the owner. */
  onExtend: (endDayKey: string) => void;
  busy: boolean;
}

export function KeepGoingRow({ endDayKey, minEndDayKey, maxEndDayKey, todayKey, onExtend, busy }: KeepGoingRowProps) {
  const [open, setOpen] = useState(false);
  const [staged, setStaged] = useState<string | null>(null);
  const seeded = keepGoingLine(endDayKey);
  const line = staged ? keepGoingLine(staged, endDayKey) : seeded;
  const value = dayKeyToLocalDate(staged ?? endDayKey);
  const min = dayKeyToLocalDate(minEndDayKey);
  const max = dayKeyToLocalDate(maxEndDayKey);
  if (!seeded || !line || !value || !min || !max) return null;
  // An end already behind today: the window has run out, and the line says so rather than
  // offering to "keep going until" a day that has passed.
  const shown = (!staged && endDayKey < todayKey ? trialEndPassedLine(endDayKey) : null) ?? line;
  return (
    <View style={styles.wrap} testID="keep-going-row">
      <ThemedText style={styles.line}>{shown}</ThemedText>
      {staged ? <ThemedText style={styles.note}>Recorded as the vet’s call</ThemedText> : null}
      <View style={styles.actions}>
        {staged ? (
          <TouchableOpacity
            style={styles.action}
            onPress={() => onExtend(staged)}
            activeOpacity={0.7}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={busy ? `Saving — ${line}` : `Extend the trial — ${line}`}
            accessibilityState={{ disabled: busy }}
          >
            <ThemedText style={styles.actionLabel}>Extend the trial</ThemedText>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={styles.action}
          onPress={() => setOpen((o) => !o)}
          activeOpacity={0.7}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={busy ? `Saving — ${shown}` : `Change — ${shown}`}
          accessibilityState={{ disabled: busy }}
        >
          <ThemedText style={staged ? styles.secondaryLabel : styles.actionLabel}>Change</ThemedText>
        </TouchableOpacity>
      </View>
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
            if (key < minEndDayKey || key > maxEndDayKey) return;
            // Back to the current end is no change: nothing staged, nothing to write.
            setStaged(key === endDayKey ? null : key);
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
  note: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: theme.space2,
    rowGap: theme.space1,
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
  secondaryLabel: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },
});
