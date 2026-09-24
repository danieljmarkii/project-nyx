import { useState } from 'react';
import { Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { theme } from '../../constants/theme';
import { PrimaryButton } from '../ui/PrimaryButton';
import { SectionLabel } from '../ui/SectionLabel';
import { TextField } from '../ui/TextField';
import { ThemedText } from '../ui/ThemedText';
import { formatClockTime, formatVisitWeekday, localDateKey } from '../../lib/vetVisits';

export interface AppointmentEditFields {
  /** The local calendar day, at local midnight. */
  day: Date;
  /** The clock time, or null when the owner gave none. */
  time: Date | null;
  clinicName: string;
  vetName: string;
  reason: string;
}

interface Props {
  /** The RECORD's pet, via `resolveRecordPetName(pets, appt.pet_id)` — CUL-574. */
  petName: string;
  fields: AppointmentEditFields;
  onChangeField: <K extends keyof AppointmentEditFields>(
    key: K,
    value: AppointmentEditFields[K],
  ) => void;
  /**
   * The earliest day the picker offers — the SCREEN computes it, because the honest
   * bound depends on the row (see the note on the picker below).
   */
  minimumDay: Date;
  /**
   * What survives the change — `appointmentPrepNote`'s output, or null when the row
   * holds no questions and no draft, in which case the screen says nothing rather
   * than naming artifacts this owner has never seen.
   */
  prepNote: string | null;
  /**
   * "This changes Pip's appointment only." — `appointmentEditScopeNote`'s output,
   * null outside a multi-pet account (CUL-987 D3).
   */
  scopeNote: string | null;
  saving: boolean;
  onSave: () => void;
  onRemove: () => void;
}

// Changing a booked appointment (CUL-952; mock E4).
//
// THE SHAPE IS `VisitEditBody`'S, NOT `BookVisitSheet`'S, and the choice is the
// design rather than convenience. Two things the booking sheet does are wrong here:
//
//   • the *happened or booked?* chips — an appointment IS a booking, and offering
//     "already happened" on an edit would mean a chip silently moving the row
//     between two tables;
//   • "Also for {pet}" — that toggle MINTS a second row under another pet (the Vet
//     Files duplicate-on-add shape, and `BookVisitSheet`'s own comment says each
//     pet's booking is independent so cancelling one leaves the other standing).
//     On an edit it would turn "change this" into "and book another", which is the
//     exact confusion this whole issue exists to remove.
//
// THE PLAN IS NOT HERE EITHER, for `VisitEditBody`'s reason: the owner's prepared
// questions and the in-room draft live on this same row and are edited on their own
// surfaces (Get ready, "At the vet"). A second editor for them would be a second
// source of truth — which is also why the footnote below says they survive the edit
// rather than leaving the owner to guess.
export function AppointmentEditBody({
  petName,
  fields,
  onChangeField,
  minimumDay,
  prepNote,
  scopeNote,
  saving,
  onSave,
  onRemove,
}: Props) {
  const [showDayPicker, setShowDayPicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const dayLabel = formatVisitWeekday(localDateKey(fields.day));

  // CUL-984 — on iOS the time picker is an inline spinner, and a spinner fires
  // `onChange` only when its wheel MOVES. It opened on 9:00 with nothing committed,
  // so an owner who wanted 9:00 opened it, saved, and saved no time. Opening it with
  // no time now commits the seed it shows: the field reads what the wheel reads.
  // "No time" stays representable through Clear, which appears the moment a time
  // exists and closes the wheel, so the two can never disagree the other way either.
  // Android's picker is a dialog that commits on OK, so nothing changes there.
  function toggleTimePicker() {
    const opening = !showTimePicker;
    setShowTimePicker(opening);
    if (opening && Platform.OS === 'ios' && !fields.time) {
      onChangeField('time', defaultTimeOfDay(fields.day));
    }
  }

  function clearTime() {
    onChangeField('time', null);
    setShowTimePicker(false);
  }

  return (
    <View>
      <ThemedText style={styles.pageTitle}>Change this appointment</ThemedText>
      <ThemedText style={styles.pageSub}>{petName}</ThemedText>

      <SectionLabel label="When" style={styles.label} />
      <TouchableOpacity
        style={styles.value}
        onPress={() => setShowDayPicker((s) => !s)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Date, ${dayLabel}`}
        accessibilityHint="Opens a date picker"
      >
        <ThemedText style={styles.valueText}>{dayLabel}</ThemedText>
      </TouchableOpacity>
      {showDayPicker && (
        <DateTimePicker
          value={fields.day}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          // NOT `startOfDay(new Date())`, which is what the booking sheet uses and
          // what the first draft of this screen copied. A booking whose day has
          // already passed is exactly the row most likely to be edited — it sits in
          // *Waiting on you* precisely because the visit moved and nobody told the
          // app — and a floor of "today" would have refused to render its OWN
          // current value, forcing the owner to either re-date it to today or
          // abandon the edit. The screen passes the earlier of today and the row's
          // own day, so a live booking still cannot move into the past and a passed
          // one keeps what it has.
          //
          // There is no clamp-on-seed hole here (the `clampVisitDate` lesson, where
          // `maximumDate` bounds a PICK and never re-validates a seed already in
          // state): the seed IS one end of this bound, so it is legal by
          // construction rather than by a second check that could drift from it.
          minimumDate={minimumDay}
          onChange={(_, picked) => {
            if (Platform.OS !== 'ios') setShowDayPicker(false);
            if (picked) onChangeField('day', picked);
          }}
        />
      )}

      <SectionLabel label="Time" style={styles.label} />
      <View style={styles.timeRow}>
        <TouchableOpacity
          style={[styles.value, styles.timeValue]}
          onPress={toggleTimePicker}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={fields.time ? `Time, ${formatClockTime(fields.time)}` : 'Time, not set'}
          accessibilityHint="Opens a time picker"
        >
          <ThemedText style={fields.time ? styles.valueText : styles.valuePlaceholder}>
            {fields.time ? formatClockTime(fields.time) : 'Optional'}
          </ThemedText>
        </TouchableOpacity>
        {/* Only once there IS a time to clear: a control that undoes nothing is
            chrome, and `disabled` would claim something is there to remove (C-7).
            The booking sheet's own rule, restated because this screen can reach the
            state from the other direction — an owner REMOVING a time a booking
            already had. */}
        {fields.time ? (
          <TouchableOpacity
            onPress={clearTime}
            style={styles.clearTime}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Clear the time"
          >
            <ThemedText style={styles.clearTimeText}>Clear</ThemedText>
          </TouchableOpacity>
        ) : null}
      </View>
      {showTimePicker && (
        <DateTimePicker
          value={fields.time ?? defaultTimeOfDay(fields.day)}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(_, picked) => {
            if (Platform.OS !== 'ios') setShowTimePicker(false);
            if (picked) onChangeField('time', picked);
          }}
        />
      )}

      <SectionLabel label="Where" style={styles.label} />
      <TextField
        value={fields.clinicName}
        onChangeText={(t) => onChangeField('clinicName', t)}
        placeholder="Clinic"
        accessibilityLabel="Clinic"
        containerStyle={styles.field}
      />
      <TextField
        value={fields.vetName}
        onChangeText={(t) => onChangeField('vetName', t)}
        placeholder="Vet"
        accessibilityLabel="Vet"
        containerStyle={styles.field}
      />

      <SectionLabel label="Reason" style={styles.label} />
      <TextField
        value={fields.reason}
        onChangeText={(t) => onChangeField('reason', t)}
        placeholder="Recheck, vaccines, something new…"
        accessibilityLabel="What the visit is for"
        containerStyle={styles.field}
      />

      {/* ABOVE Save, not between Save and Remove. Below, it sat one divider from
          *Remove this appointment*, and scanning the foot of the screen gave
          "Remove this appointment · your questions and notes stay with it" — a
          promise that removal is safe, which is the opposite of true: a cancel
          stamps `cancelled_at`, `readAppointmentById` filters cancelled rows, and
          the prep becomes unreachable. Here it captions the form and the Save
          beneath it, which is what it is actually about.

          True by construction: `updateAppointmentDetails` writes four columns and
          never touches `questions` or `notes_draft` — asserted in
          `lib/vetVisitWrites.test.ts`. */}
      {prepNote ? <ThemedText style={styles.footnote}>{prepNote}</ThemedText> : null}
      {/* Beside the prep line and above Save, for the same reason: it captions what
          Save does. In a two-pet household the booking sheet's "Also for" made TWO
          rows; this edit moves one of them (CUL-987 D3). */}
      {scopeNote ? <ThemedText style={styles.footnote}>{scopeNote}</ThemedText> : null}

      <PrimaryButton label="Save changes" onPress={onSave} loading={saving} style={styles.save} />

      {/* The destructive control, separated by a rule and set apart from Save — not
          a peer of it. It carries a confirm rather than a way back (C-21: confirm
          XOR reversal, and there is no un-cancel), and the confirm lives on the
          SCREEN so it can name the record's pet and say the right thing about a day
          that has already passed. */}
      <View style={styles.divider} />
      <TouchableOpacity
        onPress={onRemove}
        style={styles.remove}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${petName}’s appointment`}
      >
        <ThemedText style={styles.removeText}>Remove this appointment</ThemedText>
      </TouchableOpacity>
    </View>
  );
}

/** Where the time spinner opens when none has been chosen: a clinic morning. */
function defaultTimeOfDay(day: Date): Date {
  const out = new Date(day.getTime());
  out.setHours(9, 0, 0, 0);
  return out;
}

const styles = StyleSheet.create({
  pageTitle: {
    fontSize: theme.textXL,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    letterSpacing: theme.trackingTight,
  },
  pageSub: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    marginTop: 2,
  },
  label: {
    marginTop: theme.space3,
    marginBottom: theme.space1,
  },
  field: {
    marginBottom: theme.space1,
  },
  value: {
    minHeight: 48,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusSmall,
    paddingHorizontal: theme.space2,
  },
  valueText: {
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
  },
  valuePlaceholder: {
    fontSize: theme.textMD,
    color: theme.colorTextTertiary,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    // The value box and Clear are adjacent controls: Clear carries 10pt of
    // horizontal slop and the box carries none, which puts the floor at 10 (C-5).
    gap: 12,
  },
  timeValue: {
    flex: 1,
  },
  clearTime: {
    minHeight: 44,
    justifyContent: 'center',
  },
  clearTimeText: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
  },
  save: {
    marginTop: theme.space4,
  },
  footnote: {
    fontSize: theme.textXS,
    lineHeight: theme.lineHeightXS,
    color: theme.colorTextTertiary,
    textAlign: 'center',
    marginTop: theme.space1,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colorBorder,
    marginTop: theme.space4,
  },
  remove: {
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: theme.space2,
  },
  removeText: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorDestructive,
  },
});
