import { useState } from 'react';
import { type LayoutChangeEvent, Platform, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { FileText, Pill, Stethoscope, Utensils } from 'lucide-react-native';
import { colorRoles, theme } from '../../constants/theme';
import { ChipGroup } from '../ui/ChipGroup';
import { PrimaryButton } from '../ui/PrimaryButton';
import { SectionLabel } from '../ui/SectionLabel';
import { TextField } from '../ui/TextField';
import { ThemedText } from '../ui/ThemedText';
import { PlanActionRow, PlanChipRow, PlanDoorRow, PlanSettledRow } from './PlanRows';
import { KeepGoingRow } from './KeepGoingRow';
import { RecheckRow } from './RecheckRow';
import { ExtendTrialPanel } from './ExtendTrialPanel';
import {
  canExtendTrial,
  courseRowSubtitle,
  extendedTrialLine,
  settledVerdictLine,
  type CourseVerdict,
  type ExtendWindow,
  type TrialVerdict,
} from '../../lib/vetVisitPlan';
import { formatVisitDate, localDateKey, type ActiveCourse, type RecheckBooking, type VisitChannel } from '../../lib/vetVisits';
import { extendDateBounds } from '../../lib/vetVisitPlan';
import { trialEndDayKey, trialTotalForEndDay } from '../../lib/trialWindowDates';
import { CHANNEL_OPTIONS, CHANNEL_QUESTION } from '../../lib/vetContactSheet';
import {
  CONTACT_AFTER_TITLE,
  keepGoingLine,
  START_COURSE_TITLE,
  WHAT_THE_VET_SENT,
} from '../../lib/vetContactAfter';
import type { HomeConcernRow } from '../../lib/careVisitConcerns';

/** The owner's answer about one concern Home was raising (EN-9, care-state spec §3.2). Only
 *  *Talked about it* writes anything; the other two write nothing (§3.2). */
export type HomeConcernAnswer = 'talked' | 'not_this_time' | 'later';

const CONCERN_OPTIONS = [
  { value: 'talked', label: 'Talked about it' },
  { value: 'not_this_time', label: 'Not this time' },
  { value: 'later', label: 'Later' },
];

/** The running trial, as this screen needs it — the trial's own numbers stay its own. */
export interface TrialRow {
  id: string;
  label: string;
  /** 'Day 23 of 56', from the ONE shared day helper — never re-derived here (B-421). */
  dayLine: string | null;
  /** A reopened visit only: this trial names this visit (§4.4 R3). */
  linkedHere?: boolean;
  /** The record's window, for *Extended*'s panel (CUL-2758). Null when `started_at` is
   *  unreadable: no day counter, no floor, so the chip is not offered. */
  window?: ExtendWindow | null;
}

/** A trial this screen EXTENDED (CUL-2758): the row settles to the new end. */
export interface ExtendedTrialRow {
  /** The trial that was extended: the settled row stands only over THIS trial, so a
   *  re-read that finds a different one (ended and replaced on another phone) shows it. */
  trialId: string;
  label: string;
  /** The new last day, 'YYYY-MM-DD', as `trialEndDayKey` gives it for the total written. */
  endDayKey: string | null;
  /** The record names this visit (first-wins: an earlier visit's link is kept). */
  linkedHere: boolean;
  /** The last day before the change, for a contact's "Keep going until … · was Nov 23". */
  wasEndDayKey?: string | null;
}

/**
 * A call, text or email (CUL-2767, spec §4.3, mock §C): the screen becomes *What did the vet
 * say?*, *What the vet sent* leads, a running trial leads The plan, and the identity fields
 * stay with the contact's own *Edit* (R12). Null on a visit, and always null flag-off.
 */
export interface ContactLayout {
  /** "Phone · Mon, Nov 9 · Ear" (`contactAfterEyebrow`). */
  eyebrow: string;
  /** Every document filed under the contact, newest first, each with its own date. */
  documents: ReadonlyArray<{ groupId: string; title: string | null; kind: string; documentDate: string | null }>;
  onOpenDocument: (groupId: string) => void;
  onAddDocument: () => void;
  /** 'call', 'texts', 'email' (`recordNoun`). */
  noun: string;
  /** 'this call', 'these texts', 'this email' (`thisContact`). */
  thisNoun: string;
  /** The line under *Done*: "Leave any time. What you typed stays on this call." */
  leaveNote: string;
  /** Courses started on THIS screen: settled rows, inert (C-7), never asked about again. */
  startedHereCourseIds: ReadonlySet<string>;
}

/** CUL-2835: on a saved visit, flag on, how the owner heard. Null flag-off and on a contact. */
export interface ChannelChips {
  value: VisitChannel;
  onChange: (next: VisitChannel) => void;
  busy: boolean;
}

/**
 * A trial this screen ENDED (CUL-951) — a snapshot, because the trial read returns
 * null once it has ended and the row still has to say what happened.
 */
export interface EndedTrialRow {
  label: string;
  /** 'YYYY-MM-DD' — the day the end was written; null when the record holds no readable day. */
  endedOn: string | null;
}

/** How a settled course row speaks: *Stopped* when this screen stopped it, *Ended* when a
 *  reopened visit rebuilds an ended course from the record, which cannot say who ended it. */
export interface SettledCourse {
  verdict: 'stopped' | 'ended';
  endedOn: string | null;
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
  /**
   * Courses *Stopped* on this screen, or ended courses a reopened visit rebuilt from the
   * record (CUL-951, CUL-2754). Such a course is still in `courses` (the route keeps it in
   * place) and renders as a settled row with no control: it has been answered, and there is
   * no un-stopping.
   */
  settledCourses: Readonly<Record<string, SettledCourse>>;
  /** A reopened visit only: the active courses that name this visit (§4.4 R3). */
  linkedCourseIds?: ReadonlySet<string>;
  onCourseVerdict: (course: ActiveCourse, verdict: CourseVerdict) => void;
  onAddCourse: () => void;

  trial: TrialRow | null;
  trialVerdict: TrialVerdict | null;
  /** The trial *Ended* on this screen, or null. Wins over the *Start a trial* door. */
  endedTrial: EndedTrialRow | null;
  onTrialVerdict: (verdict: TrialVerdict) => void;
  /** The trial *Extended* on this screen, or null. Wins over the chips. */
  extendedTrial?: ExtendedTrialRow | null;
  /** *Extend the trial*: the total the owner chose, in days. */
  onExtendTrial?: (totalDays: number) => void;
  /** A refusal the write returned, already phrased (`windowRefusedLine`). */
  extendRefusal?: string | null;
  onExtendChoiceChange?: () => void;
  onStartTrial: () => void;
  onAddFood: () => void;
  /**
   * A reopened visit, with a trial running that this visit did not start or link (§4.4 R3).
   * No chips (*Ended* or *Switched* there would end a trial from a visit it never came
   * from) and no *Start a trial* (a second trial cannot run beside it); the food door stays.
   */
  trialHeldElsewhere?: boolean;
  /** That trial's name, so the screen says it is running rather than hiding it. */
  heldTrialLabel?: string | null;

  /** 'YYYY-MM-DD' once *Set*: the date the vet said to come back around (§4.4 R2). */
  nextVisitAt: string | null;
  /** The booking that answers the recheck (`readRecheckBooking`), or null. */
  recheckBooking?: RecheckBooking | null;
  /** *Set* on the recheck row: writes `next_visit_at` only, never a booking. */
  onSetNextVisit: (day: Date) => void;
  /** *Book it*: the booking sheet, seeded with the date. */
  onBookRecheck: () => void;

  paperworkCount: number;
  onAddPaperwork: () => void;

  /** EN-9 (Engines v3 PR-35): the concerns Home was raising, each with the owner's answer.
   *  Empty with the Engines v3 flag off, and then no section renders. */
  homeConcerns?: ReadonlyArray<HomeConcernRow>;
  concernAnswers?: Readonly<Record<string, HomeConcernAnswer>>;
  onConcernAnswer?: (row: HomeConcernRow, answer: HomeConcernAnswer) => void;
  /** A reopened visit: the signs its record already answers *Talked about it* for. They
   *  render settled, because a chip moved off it would write nothing and the record would
   *  still say it (an answer is taken back by a retraction, not here). */
  answeredOnRecord?: ReadonlySet<string>;

  /** The row whose write is in flight, so only that row goes inert. */
  busyRow: string | null;
  saving: boolean;
  onSave: () => void;

  /** A saved visit, reopened (§4.4 R1): nothing celebrates on *Done*. */
  reopened?: boolean;
  /** The visit exists, so every field saves as it is typed (R5). Before that nothing is
   *  written, and the screen says nothing it cannot keep. */
  savesAsTyped?: boolean;
  /** A reopen's 'Tue, Sep 16 · Completely Cat Clinic', so the owner knows which visit. */
  visitLabel?: string | null;
  /** The report-window line under the date, when moving it would move the window. */
  dateNote?: string | null;
  /** Where The plan starts, for *Add to the plan*'s scroll (y within this body). */
  onPlanLayout?: (y: number) => void;

  /** CUL-2767: the record is a call, text or email. */
  contact?: ContactLayout | null;
  /** CUL-2835: the channel chips on a saved visit. */
  channelChips?: ChannelChips | null;
}

const COURSE_OPTIONS = [
  { value: 'keep', label: 'Keep' },
  { value: 'changed', label: 'Changed' },
  { value: 'stopped', label: 'Stopped' },
];

const TRIAL_OPTIONS = [
  { value: 'keep', label: 'Keep' },
  { value: 'extended', label: 'Extended' },
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
    courses, courseVerdicts, settledCourses, onCourseVerdict, onAddCourse,
    trial, trialVerdict, endedTrial, onTrialVerdict, onStartTrial, onAddFood,
    extendedTrial = null, onExtendTrial, extendRefusal = null, onExtendChoiceChange,
    nextVisitAt, recheckBooking = null, onSetNextVisit, onBookRecheck, paperworkCount, onAddPaperwork,
    busyRow, saving, onSave,
    homeConcerns = [], concernAnswers = {}, onConcernAnswer,
    linkedCourseIds, answeredOnRecord, trialHeldElsewhere = false, heldTrialLabel = null, reopened = false, savesAsTyped = false, visitLabel = null, dateNote = null, onPlanLayout,
    contact = null, channelChips = null,
  } = props;
  const [showDayPicker, setShowDayPicker] = useState(false);
  const today = localDateKey(new Date());
  // No readable day says the verb alone: a date the record does not hold is not printed.
  const settledLine = (verdict: 'stopped' | 'ended', endedOn: string | null) =>
    endedOn
      ? settledVerdictLine({ verdict, endedOn, today, endLabel: formatVisitDate(endedOn) })
      : verdict === 'stopped' ? 'Stopped' : 'Ended';
  const linkedHere = (line: string | undefined, yes: boolean | undefined) =>
    yes ? [line, `linked to ${contact?.thisNoun ?? 'this visit'}`].filter(Boolean).join(' · ') : line;


  // The identity fields belong to a visit. On a contact the sheet's own *Edit* owns the day, the
  // time and the channel (R12), so two editors cannot disagree about one record.
  const identityFields = (
    <>
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
          themeVariant="light"
          accentColor={colorRoles.action.onLight}
          // A visit that happened cannot be in the future. Without this bound a
          // mis-spun picker writes a future `visited_at`, which the report skips
          // entirely and every other reader of the table trusts. The rundown's old
          // unbounded MAX(visited_at) adopted it, measuring "nothing has changed since
          // your last visit" from a day that had not happened (CUL-946's sibling); it
          // reads the shared bound now (CUL-1127), and the Vet Files picker still lists it.
          maximumDate={new Date()}
          onChange={(_, picked) => {
            if (Platform.OS !== 'ios') setShowDayPicker(false);
            if (picked) onChangeField('visitedAt', picked);
          }}
        />
      )}
      {dateNote ? <ThemedText style={styles.dateNote}>{dateNote}</ThemedText> : null}

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
    </>
  );
  // The owner's notes print on the report as visit notes do (§4.7), and the contact sheet has
  // no notes field, so a contact keeps the box, below its plan.
  const notesBlock = (
    <>
      {/* On a contact the title already asks "What did the vet say?"; the box is the owner's own. */}
      <SectionLabel label={contact ? 'Your notes' : 'What the vet said'} style={styles.label} />
      <TextInput
        style={styles.notes}
        value={fields.notes}
        onChangeText={(t) => onChangeField('notes', t)}
        multiline
        textAlignVertical="top"
        placeholder="Anything worth remembering."
        placeholderTextColor={theme.colorTextTertiary}
        accessibilityLabel={`Notes from ${petName}’s ${contact?.noun ?? 'visit'}`}
      />
      {savesAsTyped ? <ThemedText style={styles.savedNote}>Saved as you type</ThemedText> : null}
    </>
  );

  // *Keep going until* (C2): seeded from the trial's current end, writing nothing until the owner
  // picks a day AND presses *Extend the trial*, then through *Extended*'s own write (a TOTAL
  // from the start, the vet's call).
  // Absent with no readable window or nothing forward under the ceiling: a date here would
  // invent a target (C3).
  const keepWindow = contact && trial?.window ? trial.window : null;
  const keepBounds = keepWindow ? extendDateBounds(keepWindow) : null;
  const keepEnd = keepWindow ? trialEndDayKey(keepWindow.startDayKey, keepWindow.currentTargetDays) : null;
  const keepGoingFooter =
    keepWindow && keepBounds && keepEnd && onExtendTrial ? (
      <KeepGoingRow
        endDayKey={keepEnd}
        minEndDayKey={keepBounds.minEndDayKey}
        maxEndDayKey={keepBounds.maxEndDayKey}
        todayKey={today}
        busy={busyRow === 'trial'}
        onExtend={(day) => {
          const total = trialTotalForEndDay(keepWindow.startDayKey, day);
          if (total) onExtendTrial(total);
        }}
      />
    ) : null;

  // The plan's rows as values, so a contact can order them its own way (§4.3) while a visit
  // keeps the shipped order exactly.
  const courseRows = (
    <>
      {courses.map((course) =>
        contact?.startedHereCourseIds.has(course.id) && !settledCourses[course.id] ? (
          // Started on this screen (C1, C7): what the record now says, inert, no chips. It was
          // just started; asking whether it was kept, changed or stopped makes no sense yet.
          <PlanSettledRow
            key={course.id}
            glyph={<Pill size={16} color={theme.colorEventMedication} strokeWidth={2} />}
            title={course.drugName}
            subtitle={[course.startedAt ? `Started ${formatVisitDate(course.startedAt)}` : 'Started', `linked to ${contact.thisNoun}`].join(' · ')}
          />
        ) : settledCourses[course.id] ? (
          // Where the chips were, so the owner's eye finds the answer in the place
          // they gave it. The glyph goes quiet: the course is no longer running.
          <PlanSettledRow
            key={course.id}
            glyph={<Pill size={16} color={theme.colorTextTertiary} strokeWidth={2} />}
            title={course.drugName}
            subtitle={settledLine(settledCourses[course.id].verdict, settledCourses[course.id].endedOn)}
          />
        ) : (
          <PlanChipRow
            key={course.id}
            glyph={<Pill size={16} color={theme.colorEventMedication} strokeWidth={2} />}
            title={course.drugName}
            subtitle={linkedHere(
              courseRowSubtitle({
                doseAmount: course.doseAmount,
                sinceLabel: course.startedAt ? formatVisitDate(course.startedAt) : null,
              }),
              linkedCourseIds?.has(course.id),
            )}
            options={COURSE_OPTIONS}
            value={courseVerdicts[course.id] ?? null}
            onChange={(next) => onCourseVerdict(course, next as CourseVerdict)}
            busy={busyRow === course.id}
          />
        ),
      )}
    </>
  );
  const addCourseRow = contact ? (
    <PlanActionRow
      glyph={<Pill size={16} color={theme.colorTextTertiary} strokeWidth={2} />}
      title={START_COURSE_TITLE}
      subtitle={courses.length > 0 || trial ? 'Anything else the vet started' : 'Anything the vet started'}
      actionLabel="Add"
      onPress={onAddCourse}
      busy={busyRow === 'add-course'}
    />
  ) : (
          <PlanActionRow
      glyph={<Pill size={16} color={theme.colorTextTertiary} strokeWidth={2} />}
      title="Started something new?"
      subtitle="Opens the medication setup, linked to this visit"
      actionLabel="Add"
      onPress={onAddCourse}
      busy={busyRow === 'add-course'}
    />
  );
  const trialBlock = (
    <>
          {trial && extendedTrial && extendedTrial.trialId === trial.id ? (
        // Where the chips were (CUL-2758, mock §C C2). The trial is still running, so
        // the glyph keeps its colour; the row names the NEW end only.
        <PlanSettledRow
          glyph={<Utensils size={16} color={colorRoles.positive.textOnLight} strokeWidth={2} />}
          title={extendedTrial.label}
          subtitle={linkedHere(
            (contact ? keepGoingLine(extendedTrial.endDayKey, extendedTrial.wasEndDayKey ?? null) : null) ??
              extendedTrialLine(extendedTrial.endDayKey),
            extendedTrial.linkedHere,
          )}
        />
      ) : trial ? (
        <>
          <PlanChipRow
            glyph={<Utensils size={16} color={colorRoles.positive.textOnLight} strokeWidth={2} />}
            title={trial.label}
            subtitle={linkedHere(trial.dayLine ?? undefined, trial.linkedHere)}
            // *Extended* needs the record's window to compute a forward total; with no
            // readable start there is nothing honest to offer, so the chip is absent.
            // Nor when nothing forward fits under the ceiling: forward-only is an absence,
            // never a chip that opens onto a dead end (TE-3).
            // On a contact *Keep going until* is the extend door (C2), so *Extended* would be
            // a second way to the same write.
            options={!contact && trial.window && onExtendTrial && canExtendTrial(trial.window) ? TRIAL_OPTIONS : TRIAL_OPTIONS.filter((o) => o.value !== 'extended')}
            value={trialVerdict}
            onChange={(next) => onTrialVerdict(next as TrialVerdict)}
            busy={busyRow === 'trial'}
            footer={contact ? keepGoingFooter : undefined}
          />
          {trialVerdict === 'extended' && trial.window && onExtendTrial ? (
            <ExtendTrialPanel
              window={trial.window}
              petName={petName}
              onExtend={onExtendTrial}
              busy={busyRow === 'trial'}
              blocked={!!busyRow && busyRow !== 'trial'}
              refusal={extendRefusal}
              onChoiceChange={onExtendChoiceChange}
            />
          ) : null}
        </>
      ) : (
        <>
          {endedTrial ? (
            <PlanSettledRow
              glyph={<Utensils size={16} color={theme.colorTextTertiary} strokeWidth={2} />}
              title={endedTrial.label}
              subtitle={settledLine('ended', endedTrial.endedOn)}
            />
          ) : null}
          {trialHeldElsewhere ? (
            <>
              {heldTrialLabel ? (
                // Named, so the owner is not left wondering where the trial went. No chips:
                // *Ended* or *Switched* from a visit it did not come from would rewrite its
                // provenance (R3). It is changed on the trial screen.
                <PlanSettledRow
                  glyph={<Utensils size={16} color={theme.colorTextTertiary} strokeWidth={2} />}
                  title={heldTrialLabel}
                  subtitle="Trial running · not linked to this visit"
                />
              ) : null}
              <PlanActionRow
                glyph={<Utensils size={16} color={theme.colorTextTertiary} strokeWidth={2} />}
                title="A new food to try?"
                subtitle={`Adds the food to ${petName}’s library`}
                actionLabel="Add the food"
                onPress={onAddFood}
                busy={busyRow === 'trial'}
              />
            </>
          ) : !endedTrial ? (
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
          ) : null}
        </>
      )}
    </>
  );
  const recheckRow = (
          <RecheckRow
      petName={petName}
      nextVisitAt={nextVisitAt}
      booking={recheckBooking}
      busy={busyRow === 'next-visit'}
      onSet={onSetNextVisit}
      onBook={onBookRecheck}
    />
  );
  const paperworkRow = (
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
  );

  return (
    <View>
      {contact ? (
        <ThemedText style={styles.eyebrow}>{contact.eyebrow}</ThemedText>
      ) : visitLabel ? (
        <ThemedText style={styles.eyebrow}>{visitLabel}</ThemedText>
      ) : null}
      <ThemedText style={styles.pageTitle} accessibilityRole={contact ? 'header' : undefined}>
        {contact ? CONTACT_AFTER_TITLE : 'How did it go?'}
      </ThemedText>
      <ThemedText style={styles.pageSub}>{petName}</ThemedText>

      {contact ? null : (
        <>
          {channelChips ? (
            <>
              {/* CUL-2835 (spec AC 19): a call saved as a visit has a way back. Phone, Text or
                  Email writes the record's channel and the screen becomes the contact's. */}
              <SectionLabel label={CHANNEL_QUESTION} style={styles.label} />
              <ChipGroup
                options={CHANNEL_OPTIONS.map((o) => ({ value: o.value, label: o.label, accessibilityLabel: o.spoken }))}
                value={channelChips.value}
                onChange={(next) => {
                  if (next && next !== channelChips.value) channelChips.onChange(next as VisitChannel);
                }}
                allowDeselect={false}
                disabled={channelChips.busy}
                accessibilityLabel={CHANNEL_QUESTION}
              />
            </>
          ) : null}
          {identityFields}
          {notesBlock}
        </>
      )}

      {contact ? (
        <>
          {/* What the vet sent (C1): the shipped *Paperwork*, renamed and moved first. One row
              per document with its own date, because one contact spans days. */}
          <SectionLabel label={WHAT_THE_VET_SENT} header style={styles.planLabel} />
          <View style={styles.plan} testID="after-contact-sent">
            {contact.documents.map((doc) => (
              <PlanDoorRow
                key={doc.groupId}
                glyph={<FileText size={16} color={theme.colorTextSecondary} strokeWidth={2} />}
                title={doc.title?.trim() || (doc.kind === 'lab_result' ? 'Results' : 'Document')}
                subtitle={doc.documentDate ? formatVisitDate(doc.documentDate) : undefined}
                onPress={() => contact.onOpenDocument(doc.groupId)}
              />
            ))}
            <PlanActionRow
              glyph={<FileText size={16} color={theme.colorTextTertiary} strokeWidth={2} />}
              title={contact.documents.length > 0 ? 'Add more' : 'Add what the vet sent'}
              subtitle="Screenshots, a PDF, a photo"
              actionLabel="Add"
              onPress={contact.onAddDocument}
              busy={busyRow === 'paperwork'}
            />
          </View>
        </>
      ) : null}

      {/* What Home was raising (EN-9; mock round 2 §08 frame 4): one row per concern, the
          ones ticked in the room arriving as *Talked about it*. Saving writes that answer
          against this visit; *Not this time* and *Later* write nothing (§3.2). */}
      {!contact && homeConcerns.length > 0 && onConcernAnswer ? (
        <>
          <SectionLabel label="What Home was raising" header style={styles.planLabel} />
          <View style={styles.plan} testID="after-visit-home-concerns">
            {homeConcerns.map((c) => answeredOnRecord?.has(c.sign) ? (
              <PlanSettledRow
                key={c.sign}
                glyph={<Stethoscope size={16} color={theme.colorTextTertiary} strokeWidth={2} />}
                title={c.title}
                subtitle="Talked about it at this visit"
              />
            ) : (
              <PlanChipRow
                key={c.sign}
                glyph={<Stethoscope size={16} color={theme.colorEventSymptomInk} strokeWidth={2} />}
                title={c.title}
                options={CONCERN_OPTIONS}
                value={concernAnswers[c.sign] ?? 'later'}
                onChange={(next) => onConcernAnswer(c, next as HomeConcernAnswer)}
                busy={saving}
              />
            ))}
          </View>
        </>
      ) : null}

      <View
        onLayout={onPlanLayout ? (e: LayoutChangeEvent) => onPlanLayout(e.nativeEvent.layout.y) : undefined}
      >
        <SectionLabel label="The plan" header style={styles.planLabel} />
        <View style={styles.plan}>
          {contact ? (
            <>
              {/* A running trial LEADS on a contact (§4.3 item 2, Jordan): "two more weeks" is
                  usually the whole call. No trial, and the food door keeps its shipped place. */}
              {trial ? trialBlock : null}
              {courseRows}
              {addCourseRow}
              {trial ? null : trialBlock}
              {recheckRow}
            </>
          ) : (
            <>
              {courseRows}
              {addCourseRow}
              {trialBlock}
              {recheckRow}
              {paperworkRow}
            </>
          )}
        </View>
      </View>

      {contact ? notesBlock : null}

      <PrimaryButton
        // *Done* on both screens (R5): once the visit exists there is nothing left to save,
        // and before it does this is still the one press that makes it.
        label="Done"
        onPress={onSave}
        loading={saving}
        // Inert while a plan row's write is in flight. A control that refuses behind
        // the scenes and looks live is a control that reads as broken — and here the
        // refusal is real: `handleSave` takes the same mutex the rows do.
        disabled={!!busyRow}
        style={styles.save}
      />
      <ThemedText style={styles.saveNote}>
        {contact
          ? contact.leaveNote
          : savesAsTyped
          ? 'Leave any time. What you typed stays on the visit.'
          : 'Anything left open stays on the visit — finish it later.'}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    fontSize: theme.textXS,
    fontWeight: theme.weightMedium,
    textTransform: 'uppercase',
    letterSpacing: theme.trackingWidest,
    color: theme.colorTextTertiary,
    marginBottom: theme.space0_5,
  },
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
  dateNote: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    marginTop: theme.space1,
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
  savedNote: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    marginTop: theme.space1,
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
