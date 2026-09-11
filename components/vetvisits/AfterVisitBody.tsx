import { useState } from 'react';
import { Platform, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { CalendarPlus, FileText, Pill, Utensils } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { PrimaryButton } from '../ui/PrimaryButton';
import { SectionLabel } from '../ui/SectionLabel';
import { TextField } from '../ui/TextField';
import { ThemedText } from '../ui/ThemedText';
import { PlanActionRow, PlanChipRow, PlanSettledRow } from './PlanRows';
import {
  courseRowSubtitle,
  defaultRecheckDate,
  type CourseVerdict,
  type TrialVerdict,
} from '../../lib/vetVisitPlan';
import { formatVisitDate, localDateKey, type ActiveCourse } from '../../lib/vetVisits';

/** The running trial, as this screen needs it — the trial's own numbers stay its own. */
export interface TrialRow {
  id: string;
  label: string;
  /** 'Day 23 of 56', from the ONE shared day helper — never re-derived here (B-421). */
  dayLine: string | null;
}

export interface AfterVisitFields {
  visitedAt: Date;
  clinicName: string;
  vetName: string;
  reason: string;
  notes: string;
}

export interface AfterVisitBodyProps {
  /** The RECORD's pet — from the appointment, never `activePet` (AC 11). */
  petName: string;
  fields: AfterVisitFields;
  onChangeField: <K extends keyof AfterVisitFields>(key: K, value: AfterVisitFields[K]) => void;

  courses: ActiveCourse[];
  courseVerdicts: Readonly<Record<string, CourseVerdict>>;
  onCourseVerdict: (course: ActiveCourse, verdict: CourseVerdict) => void;
  onAddCourse: () => void;

  trial: TrialRow | null;
  trialVerdict: TrialVerdict | null;
  onTrialVerdict: (verdict: TrialVerdict) => void;
  onStartTrial: () => void;
  onAddFood: () => void;

  /** 'YYYY-MM-DD' once set — the date the vet said to come back on. */
  nextVisitAt: string | null;
  onPickNextVisit: (day: Date) => void;

  paperworkCount: number;
  onAddPaperwork: () => void;

  /** The row whose write is in flight, so only that row goes inert. */
  busyRow: string | null;
  saving: boolean;
  onSave: () => void;
}

const COURSE_OPTIONS = [
  { value: 'keep', label: 'Keep' },
  { value: 'changed', label: 'Changed' },
  { value: 'stopped', label: 'Stopped' },
];

const TRIAL_OPTIONS = [
  { value: 'keep', label: 'Keep' },
  { value: 'ended', label: 'Ended' },
  { value: 'switched', label: 'Switched' },
];

// "How did it go?" (mock D1) — the plan becomes records.
//
// Every field arrives PREFILLED from the appointment and saving with nothing typed
// is allowed: the visit happened whether or not the owner has anything to write
// about it, and a required field would make the record conditional on the owner's
// energy in a car park.
//
// The plan rows READ THE RECORD BEFORE THEY ASK (CUL-825). A course that exists is a
// confirmation; a course that does not is a door. That is why `courses` and `trial`
// are inputs rather than something this component fetches — the route re-reads them
// after every write, so a row can never be answering about a record that has moved.
export function AfterVisitBody(props: AfterVisitBodyProps) {
  const {
    petName, fields, onChangeField,
    courses, courseVerdicts, onCourseVerdict, onAddCourse,
    trial, trialVerdict, onTrialVerdict, onStartTrial, onAddFood,
    nextVisitAt, onPickNextVisit, paperworkCount, onAddPaperwork,
    busyRow, saving, onSave,
  } = props;
  const [showDayPicker, setShowDayPicker] = useState(false);
  const [showNextPicker, setShowNextPicker] = useState(false);

  return (
    <View>
      <ThemedText style={styles.pageTitle}>How did it go?</ThemedText>
      <ThemedText style={styles.pageSub}>{petName}</ThemedText>

      <SectionLabel label="When" style={styles.label} />
      <TouchableOpacity
        style={styles.valueRow}
        onPress={() => setShowDayPicker((s) => !s)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Visit date, ${formatVisitDate(localDateKey(fields.visitedAt))}`}
      >
        <ThemedText style={styles.valueText}>
          {formatVisitDate(localDateKey(fields.visitedAt))}
        </ThemedText>
      </TouchableOpacity>
      {showDayPicker && (
        <DateTimePicker
          value={fields.visitedAt}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          // A visit that happened cannot be in the future. Without this bound a
          // mis-spun picker writes a future `visited_at`, which the report skips
          // entirely while the rundown's unbounded MAX(visited_at) adopts it — so
          // "nothing has changed since your last visit" would be measured from a
          // day that has not happened (CUL-946's sibling).
          maximumDate={new Date()}
          onChange={(_, picked) => {
            if (Platform.OS !== 'ios') setShowDayPicker(false);
            if (picked) onChangeField('visitedAt', picked);
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
      <TextField
        value={fields.reason}
        onChangeText={(t) => onChangeField('reason', t)}
        placeholder="What it was for"
        accessibilityLabel="What the visit was for"
        containerStyle={styles.field}
      />

      <SectionLabel label="What the vet said" style={styles.label} />
      <TextInput
        style={styles.notes}
        value={fields.notes}
        onChangeText={(t) => onChangeField('notes', t)}
        multiline
        textAlignVertical="top"
        placeholder="Anything worth remembering."
        placeholderTextColor={theme.colorTextTertiary}
        accessibilityLabel={`Notes from ${petName}’s visit`}
      />

      <SectionLabel label="The plan" header style={styles.planLabel} />
      <View style={styles.plan}>
        {courses.map((course) => (
          <PlanChipRow
            key={course.id}
            glyph={<Pill size={16} color={theme.colorEventMedication} strokeWidth={2} />}
            title={course.drugName}
            subtitle={courseRowSubtitle({
              doseAmount: course.doseAmount,
              sinceLabel: course.startedAt ? formatVisitDate(course.startedAt) : null,
            })}
            options={COURSE_OPTIONS}
            value={courseVerdicts[course.id] ?? null}
            onChange={(next) => onCourseVerdict(course, next as CourseVerdict)}
            busy={busyRow === course.id}
          />
        ))}

        <PlanActionRow
          glyph={<Pill size={16} color={theme.colorTextTertiary} strokeWidth={2} />}
          title="Started something new?"
          subtitle="Opens the medication setup, linked to this visit"
          actionLabel="Add"
          onPress={onAddCourse}
          busy={busyRow === 'add-course'}
        />

        {trial ? (
          <PlanChipRow
            glyph={<Utensils size={16} color={theme.colorAccentInk} strokeWidth={2} />}
            title={trial.label}
            subtitle={trial.dayLine ?? undefined}
            options={TRIAL_OPTIONS}
            value={trialVerdict}
            onChange={(next) => onTrialVerdict(next as TrialVerdict)}
            busy={busyRow === 'trial'}
          />
        ) : (
          <PlanActionRow
            glyph={<Utensils size={16} color={theme.colorTextTertiary} strokeWidth={2} />}
            title="A new food to try?"
            subtitle={`Starts a trial, or just adds the food to ${petName}’s library`}
            actionLabel="Start a trial"
            onPress={onStartTrial}
            secondaryLabel="Add the food"
            onSecondaryPress={onAddFood}
            busy={busyRow === 'trial'}
          />
        )}

        {nextVisitAt ? (
          <PlanSettledRow
            glyph={<CalendarPlus size={16} color={theme.colorTextTertiary} strokeWidth={2} />}
            title="Next visit"
            subtitle={`${formatVisitDate(nextVisitAt)} · booked`}
          />
        ) : (
          <PlanActionRow
            glyph={<CalendarPlus size={16} color={theme.colorTextTertiary} strokeWidth={2} />}
            title="Next visit"
            subtitle="A recheck, if the vet named one"
            actionLabel="Set a date"
            onPress={() => setShowNextPicker((s) => !s)}
            busy={busyRow === 'next-visit'}
          />
        )}
        {showNextPicker && !nextVisitAt && (
          <DateTimePicker
            // Seeded at +6 weeks (§8's default), which is a SEED and not a claim —
            // "in six weeks" is the sentence a vet says, and the owner moves the
            // picker rather than the app parsing free text.
            value={defaultRecheckDate()}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            minimumDate={new Date()}
            onChange={(_, picked) => {
              if (Platform.OS !== 'ios') setShowNextPicker(false);
              if (picked) {
                setShowNextPicker(false);
                onPickNextVisit(picked);
              }
            }}
          />
        )}

        <PlanActionRow
          glyph={<FileText size={16} color={theme.colorTextTertiary} strokeWidth={2} />}
          title="Paperwork"
          subtitle={
            paperworkCount === 0
              ? 'A discharge sheet, or the clinic’s own summary'
              : paperworkCount === 1
                ? '1 document · in Vet Files'
                : `${paperworkCount} documents · in Vet Files`
          }
          actionLabel={paperworkCount === 0 ? 'Add' : 'Add more'}
          onPress={onAddPaperwork}
          busy={busyRow === 'paperwork'}
        />
      </View>

      <PrimaryButton
        label={`Save ${petName}’s visit`}
        onPress={onSave}
        loading={saving}
        // Inert while a plan row's write is in flight. A control that refuses behind
        // the scenes and looks live is a control that reads as broken — and here the
        // refusal is real: `handleSave` takes the same mutex the rows do.
        disabled={!!busyRow}
        style={styles.save}
      />
      <ThemedText style={styles.saveNote}>
        Anything left open stays on the visit — finish it later.
      </ThemedText>
    </View>
  );
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
  planLabel: {
    marginTop: theme.space4,
    marginBottom: theme.space1,
  },
  field: {
    marginBottom: theme.space1,
  },
  valueRow: {
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
  notes: {
    // The C-2 carve-out: a TextInput is outside ThemedText's reach, so it names its
    // face on its own style.
    fontFamily: theme.fontBody,
    fontSize: theme.textMD,
    lineHeight: 22,
    color: theme.colorTextPrimary,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusMedium,
    backgroundColor: theme.colorSurface,
    paddingHorizontal: theme.space2,
    paddingVertical: theme.space2,
    minHeight: 120,
  },
  plan: {
    borderRadius: theme.radiusMedium,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    overflow: 'hidden',
  },
  save: {
    marginTop: theme.space4,
  },
  saveNote: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    marginTop: theme.space1,
    textAlign: 'center',
  },
});
