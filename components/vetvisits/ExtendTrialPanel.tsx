import { useState } from 'react';
import { Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { colorRoles, theme } from '../../constants/theme';
import { useLiveRegionAnnouncement } from '../../hooks/useLiveRegionAnnouncement';
import { ChipGroup } from '../ui/ChipGroup';
import { PrimaryButton } from '../ui/PrimaryButton';
import { SectionLabel } from '../ui/SectionLabel';
import { ThemedText } from '../ui/ThemedText';
import { WINDOW_MAX_DAYS } from '../../lib/trialWindowSheet';
import {
  extendDateBounds,
  extendEndLine,
  extendPresets,
  extendRefusal,
  type ExtendWindow,
} from '../../lib/vetVisitPlan';
import { trialTotalForEndDay } from '../../lib/trialWindowDates';
import { dayKeyToLocalDate, toLocalDayKey } from '../../lib/utils';

// *Extended*'s inline panel (CUL-2758, spec §4.4 R6, mock §C C1).
//
// INLINE, NOT A MODAL. This renders inside the after-visit screen, which already hosts
// the medication and trial setups as RN `Modal`s, and a second presenter is the CUL-662
// wedge. It also keeps the answer where the chips are, which is where the owner gave it.
//
// IT WRITES NOTHING. The chips and the picker choose a TOTAL; only *Extend the trial*
// hands it to the route, which owns the link and the write. No chip is preselected:
// a default on a clinical window would let a hurried tap record 10 weeks when the vet
// said 12, so the button waits for a choice and says why it is waiting.

const PICK = 'pick';

export interface ExtendTrialPanelProps {
  window: ExtendWindow;
  /** The RECORD's pet, for the refusal sentences (C-9). */
  petName: string;
  /** The total the owner chose, in days. */
  onExtend: (totalDays: number) => void;
  busy: boolean;
  /** ANOTHER plan row's write is in flight. The route takes one mutex for every row,
   *  so the press would do nothing; the panel says so rather than look live (C-7). */
  blocked?: boolean;
  /** A refusal the write path returned, phrased by `windowRefusedLine`. */
  refusal?: string | null;
  /** The choice moved, so a refusal about the last one no longer applies. */
  onChoiceChange?: () => void;
}

export function ExtendTrialPanel({ window: w, petName, onExtend, busy, blocked = false, refusal = null, onChoiceChange }: ExtendTrialPanelProps) {
  const presets = extendPresets(w);
  const bounds = extendDateBounds(w);
  const [chosen, setChoice] = useState<string | null>(null);
  const [picked, setPickedKey] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  const options = [
    ...presets.map((o) => ({ value: String(o.days), label: o.label })),
    ...(bounds ? [{ value: PICK, label: 'Pick a date' }] : []),
  ];
  // A re-read can move the floor under a choice (a refusal, a sync from another phone):
  // a chip that is no longer offered is no longer chosen, and a picked day the new floor
  // passed is no longer picked. Derived, not effected, so no frame shows the stale one.
  const choice = chosen && options.some((o) => o.value === chosen) ? chosen : null;
  const pickedKey =
    picked && bounds && picked >= bounds.minEndDayKey && picked <= bounds.maxEndDayKey ? picked : null;

  const total =
    choice === PICK
      ? pickedKey ? trialTotalForEndDay(w.startDayKey, pickedKey) : null
      : choice ? Number(choice) : null;
  const refused = total != null ? extendRefusal(w, total, petName) : null;
  const endLine = total != null && !refused ? extendEndLine({ w, totalDays: total }) : null;
  const ready = total != null && !refused && !!endLine;

  // What the button is waiting on, said where the owner is looking (C-7: `disabled`
  // is a claim, so the reason rides beside it).
  const status = blocked
    ? 'Waiting for the other change to save.'
    : refusal ?? refused ?? endLine ?? 'Choose the length the vet gave.';
  // Spoken once a choice exists; the waiting line is read with the panel itself.
  useLiveRegionAnnouncement(choice ? status : null);

  // Nothing forward fits under the ceiling. The body does not offer *Extended* then
  // (`canExtendTrial`); this branch is for a re-read that took the room away mid-panel.
  if (options.length === 0) {
    const line = extendRefusal(w, WINDOW_MAX_DAYS + 1, petName);
    return (
      <View style={styles.panel} testID="extend-trial-panel">
        <ThemedText style={styles.line}>{refusal ?? line}</ThemedText>
      </View>
    );
  }

  const seed = pickedKey ?? bounds?.minEndDayKey ?? null;

  return (
    <View style={styles.panel} testID="extend-trial-panel">
      <SectionLabel label="Extend to" style={styles.label} />
      <ChipGroup
        options={options}
        value={choice}
        allowDeselect={false}
        accessibilityLabel="Extend to"
        disabled={busy || blocked}
        onChange={(next) => {
          if (!next) return;
          setChoice(next);
          setShowPicker(next === PICK);
          // The spinner opens ON a day, so that day is the pick until the owner moves it:
          // otherwise the earliest allowed date reads as chosen and the button stays dark.
          if (next === PICK && !pickedKey && bounds) setPickedKey(bounds.minEndDayKey);
          onChoiceChange?.();
        }}
      />
      {choice === PICK && showPicker && bounds && seed ? (
        <DateTimePicker
          value={dayKeyToLocalDate(seed) ?? new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          themeVariant="light"
          accentColor={colorRoles.action.onLight}
          minimumDate={dayKeyToLocalDate(bounds.minEndDayKey) ?? undefined}
          maximumDate={dayKeyToLocalDate(bounds.maxEndDayKey) ?? undefined}
          onChange={(_, picked) => {
            if (Platform.OS !== 'ios') setShowPicker(false);
            if (picked) {
              setPickedKey(toLocalDayKey(picked));
              onChoiceChange?.();
            }
          }}
        />
      ) : null}
      {choice === PICK && !showPicker ? (
        // Android's picker is a dialog that closes on answer; this is the way back to it.
        // The selected chip cannot reopen it (a re-tap on the chosen chip fires nothing).
        <TouchableOpacity
          onPress={() => setShowPicker(true)}
          disabled={busy || blocked}
          accessibilityRole="button"
          style={styles.change}
        >
          <ThemedText style={styles.changeLabel}>Change the date</ThemedText>
        </TouchableOpacity>
      ) : null}
      <ThemedText
        style={[styles.line, !blocked && (refusal ?? refused) ? styles.refused : null]}
        accessibilityLiveRegion="polite"
        testID="extend-trial-line"
      >
        {status}
      </ThemedText>
      <PrimaryButton
        label="Extend the trial"
        onPress={() => { if (ready && total != null) onExtend(total); }}
        disabled={!ready || busy || blocked}
        loading={busy}
        style={styles.button}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    paddingHorizontal: theme.space2,
    paddingBottom: theme.space2,
  },
  label: {
    marginBottom: theme.space1,
  },
  line: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    marginTop: theme.space1,
  },
  refused: {
    color: theme.colorTextPrimary,
  },
  button: {
    marginTop: theme.space2,
  },
  change: {
    minHeight: theme.hitTarget,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  changeLabel: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: colorRoles.action.onLight,
  },
});
