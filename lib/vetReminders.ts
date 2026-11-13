// The vet visit reminder PLANNER (CUL-2727, PR-03 of *Vet visit reminders*;
// docs/nyx-vet-reminder-requirements.md §3, rulings R1 to R6).
//
// PURE: (now, live appointments, pet names, visit days) → the notifications that should
// be on the phone's schedule. No expo-notifications, no database, no store: the I/O shell
// is `lib/vetReminderNotifications.ts`, which diffs this plan against what the OS holds.
//
// ── THE TWO INSTANTS (§3.2, R1) ────────────────────────────────────────────────
//   • ahead:  18:00 local on (the appointment's local date − 3 days). Lands at 6pm, when
//             there is time to weigh, log or call ahead (§1, the deep dive's lesson).
//   • day_of: time known → the earlier of 08:00 on the day and (appointment − 2h); when
//             that is before 06:00, 19:00 the evening before. No time → 08:00 on the day.
// A reminder whose instant is not in the future at plan time is SKIPPED, never fired late
// (R2): booked two days out → day-of only; booked the morning of, after 08:00 → none.
//
// ── ALL MATH IN DEVICE LOCAL WALL CLOCK ───────────────────────────────────────
// `new Date(y, m, d, h)` is the device zone's wall clock, so DST and travel cost nothing:
// every foreground re-plans. `scheduled_at` is PARSED, never compared as text (C-40), and
// the no-time sentinel is read through `appointmentTimeKnown`, never re-derived (its
// header holds the DST-midnight case this would otherwise get wrong).
//
// ── ONE PER KIND PER DAY PER ACCOUNT (§3.3) ───────────────────────────────────
// Reminders of the same kind whose instants fall on the same LOCAL DAY collapse into
// one. It fires at the earliest instant of the group, names every pet in it, and carries
// no appointment id, so its tap opens the Vet visits list instead of one Get ready.
// The fire day is also the identifier's day (`nyx.vetreminder.<kind>.<day>`), so the
// collapse rule and the identifier can never disagree about what "the same day" means.
//
// ── THE COPY IS PROVISIONAL ───────────────────────────────────────────────────
// §4's direction, not its final strings: PR-04's mock round (CUL-2728) owns the words
// under `nyx-voice` and `clinical-guardrails`. What is final already is what the copy
// may carry (R4): the day, the time and the pet's name, never the reason, the clinic,
// the vet, a question, a count or anything from the record. The one record-derived
// value, the report window's first day, comes from the shared visit bound
// (`latestVisitBefore`, the report's own rung 1), read on the day the reminder fires;
// it is a date, never a duration (C-19).

import { appointmentTimeKnown, formatClockTime, formatVisitDate, formatVisitWeekday, localDateKey } from './vetVisits';
import { latestVisitBefore } from './visitWindow';
import { dayKeyToLocalDate } from './utils';

export type VetReminderKind = 'ahead' | 'day_of';

/** Days before the appointment's date the ahead reminder fires (R1). */
export const AHEAD_DAYS = 3;
/** The ahead reminder's local wall-clock hour (R1: 6pm). */
export const AHEAD_HOUR = 18;
/** The day-of reminder's latest local hour (R1: 8am). */
export const DAY_OF_HOUR = 8;
/** How long before a timed appointment the day-of reminder may fire (team call). */
export const DAY_OF_LEAD_MS = 2 * 60 * 60 * 1000;
/** The earliest local hour a day-of reminder fires before it moves to the evening before. */
export const DAY_OF_EARLIEST_HOUR = 6;
/** The evening-before slot's local hour (team call: 7pm). */
export const EVENING_BEFORE_HOUR = 19;

/** One appointment as the planner needs it. The live-row filter (not deleted, not
 *  cancelled, not logged as a visit) is the READ's, `readReminderInputs` in
 *  `lib/vetVisits.ts` (the one file that may read the link column, guards/visitReaders),
 *  so this module only ever sees live bookings and adds the today-or-later rule. */
export interface ReminderAppointment {
  id: string;
  pet_id: string;
  scheduled_at: string;
}

/** What one notification should be. `appointmentId` is null for a collapsed reminder. */
export interface PlannedVetReminder {
  kind: VetReminderKind;
  /** The fire instant's local day, 'YYYY-MM-DD': the identifier's day. */
  dayKey: string;
  /** The fire instant, ISO. */
  fireAt: string;
  appointmentId: string | null;
  title: string;
  body: string;
}

export interface PlanInput {
  now: Date;
  appointments: readonly ReminderAppointment[];
  /** Current pet names by id. An appointment whose pet is absent is not planned. */
  petNames: ReadonlyMap<string, string>;
  /** Each pet's live `visited_at` days, any order. Absent → no visit. */
  visitDaysByPet: ReadonlyMap<string, readonly string[]>;
}

/** Is this live appointment's local day today or later (§3.1)? */
export function appointmentCounts(appt: ReminderAppointment, now: Date): boolean {
  const d = new Date(appt.scheduled_at);
  if (Number.isNaN(d.getTime())) return false;
  return localDateKey(d) >= localDateKey(now);
}

/** The ahead reminder's instant: 18:00 local, three calendar days before the appointment's
 *  local date. Built from local components, so a DST change in between is free. */
export function aheadInstant(scheduledAt: string): Date | null {
  const d = new Date(scheduledAt);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - AHEAD_DAYS, AHEAD_HOUR, 0, 0, 0);
}

/** The day-of reminder's instant (§3.2's table and its worked examples). */
export function dayOfInstant(scheduledAt: string): Date | null {
  const d = new Date(scheduledAt);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = d.getMonth();
  const day = d.getDate();
  const eight = new Date(y, m, day, DAY_OF_HOUR, 0, 0, 0);
  if (!appointmentTimeKnown(scheduledAt)) return eight;
  const lead = new Date(d.getTime() - DAY_OF_LEAD_MS);
  const candidate = lead.getTime() < eight.getTime() ? lead : eight;
  const earliest = new Date(y, m, day, DAY_OF_EARLIEST_HOUR, 0, 0, 0);
  if (candidate.getTime() < earliest.getTime()) {
    return new Date(y, m, day - 1, EVENING_BEFORE_HOUR, 0, 0, 0);
  }
  return candidate;
}

interface Slot {
  kind: VetReminderKind;
  fire: Date;
  appt: ReminderAppointment;
  petName: string;
}

/** PURE: the whole plan, sorted by fire instant then kind. */
export function planVetReminders(input: PlanInput): PlannedVetReminder[] {
  const nowMs = input.now.getTime();
  const slots: Slot[] = [];
  for (const appt of input.appointments) {
    if (!appointmentCounts(appt, input.now)) continue;
    const petName = input.petNames.get(appt.pet_id);
    if (!petName) continue;
    const ahead = aheadInstant(appt.scheduled_at);
    if (ahead && ahead.getTime() > nowMs) slots.push({ kind: 'ahead', fire: ahead, appt, petName });
    const dayOf = dayOfInstant(appt.scheduled_at);
    if (dayOf && dayOf.getTime() > nowMs) slots.push({ kind: 'day_of', fire: dayOf, appt, petName });
  }

  const groups = new Map<string, Slot[]>();
  for (const s of slots) {
    const key = `${s.kind}|${localDateKey(s.fire)}`;
    const g = groups.get(key);
    if (g) g.push(s);
    else groups.set(key, [s]);
  }

  const out: PlannedVetReminder[] = [];
  for (const group of groups.values()) {
    group.sort(
      (a, b) =>
        a.fire.getTime() - b.fire.getTime() ||
        new Date(a.appt.scheduled_at).getTime() - new Date(b.appt.scheduled_at).getTime() ||
        a.appt.id.localeCompare(b.appt.id),
    );
    const first = group[0];
    const dayKey = localDateKey(first.fire);
    const single = group.length === 1;
    const copy = single
      ? singleCopy(first, dayKey, input.visitDaysByPet.get(first.appt.pet_id) ?? [])
      : collapsedCopy(group, dayKey);
    out.push({
      kind: first.kind,
      dayKey,
      fireAt: first.fire.toISOString(),
      appointmentId: single ? first.appt.id : null,
      ...copy,
    });
  }
  return out.sort((a, b) => Date.parse(a.fireAt) - Date.parse(b.fireAt) || a.kind.localeCompare(b.kind));
}

// ── The copy (provisional; see the header) ─────────────────────────────────────

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** 'today', 'tomorrow' or the weekday, said from the fire day. */
function dayWord(apptDay: string, fireDay: string, appt: Date): string {
  if (apptDay === fireDay) return 'today';
  const f = dayKeyToLocalDate(fireDay);
  if (!f) return WEEKDAYS[appt.getDay()];
  const next = localDateKey(new Date(f.getFullYear(), f.getMonth(), f.getDate() + 1));
  if (apptDay === next) return 'tomorrow';
  return WEEKDAYS[appt.getDay()];
}

function singleCopy(s: Slot, fireDay: string, visitDays: readonly string[]): { title: string; body: string } {
  const appt = new Date(s.appt.scheduled_at);
  const apptDay = localDateKey(appt);
  const timed = appointmentTimeKnown(s.appt.scheduled_at);
  const clock = timed ? formatClockTime(appt) : null;
  const word = dayWord(apptDay, fireDay, appt);
  if (s.kind === 'ahead') {
    const when = formatVisitWeekday(apptDay);
    return {
      title: `${s.petName} sees the vet ${word}`,
      body: `${when}${clock ? ` at ${clock}` : ''}. A few minutes in Get ready now, while there's time to weigh in or call ahead.`,
    };
  }
  // The report window's first day, as the composer would start it on the fire day: the
  // shared rung-1 bound, never re-derived.
  const start = latestVisitBefore(visitDays, fireDay);
  const fire = dayKeyToLocalDate(fireDay);
  return {
    title: `${s.petName} sees the vet ${word}${clock ? ` at ${clock}` : ''}`,
    body: start
      ? `Make a report of ${formatVisitDate(start, fire ?? appt)} to today to take along.`
      : 'Make a report to take along.',
  };
}

function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function collapsedCopy(group: readonly Slot[], fireDay: string): { title: string; body: string } {
  const names: string[] = [];
  for (const s of group) if (!names.includes(s.petName)) names.push(s.petName);
  const apptDays = new Set(group.map((s) => localDateKey(new Date(s.appt.scheduled_at))));
  const first = new Date(group[0].appt.scheduled_at);
  const verb = names.length === 1 ? 'sees' : 'see';
  // One appointment day across the group names it; mixed days (an evening-before slot
  // sharing a day with a same-day one) cannot honestly name one, so the title stays general.
  const title =
    apptDays.size === 1
      ? `${joinNames(names)} ${verb} the vet ${dayWord(localDateKey(first), fireDay, first)}`
      : `${joinNames(names)} ${names.length === 1 ? 'has vet visits' : 'have vet visits'} coming up`;
  const body = names.length === 1 ? 'Tap to get ready.' : names.length === 2 ? 'Tap to get ready for both.' : 'Tap to get ready for each.';
  return { title, body };
}
