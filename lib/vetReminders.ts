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
// R2 is judged on the collapsed group's earliest instant (see planVetReminders).
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
// ── THE COPY (final, mock round 2, CUL-2728) ──────────────────────────────────
// What the lock screen may carry (R4): the day, the time and the pet's name. Never the
// reason, the clinic, the vet, a question, a count or anything from the record. Round 2
// D1 (PM, 2026-11-13) dropped the report window's start date from the day-of body for
// that reason: the last visit's date is a record fact, and Get ready shows the window
// live one tap away. So the planner reads nothing from `vet_visits`.

import { appointmentTimeKnown, formatClockTime, formatVisitDate, localDateKey } from './vetVisits';
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
  /** The pet the tap opens on: the single visit's, or a collapsed group's first (the
   *  earliest instant, then the earliest appointment). Round 2 T4: a collapsed tap opens
   *  the Vet visits list on this pet, the list's existing pet door. */
  petId: string;
  title: string;
  body: string;
}

export interface PlanInput {
  now: Date;
  appointments: readonly ReminderAppointment[];
  /** Current pet names by id. An appointment whose pet is absent is not planned. */
  petNames: ReadonlyMap<string, string>;
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
    // EVERY slot, past ones included: R2 is applied to the GROUP below, not here.
    const ahead = aheadInstant(appt.scheduled_at);
    if (ahead) slots.push({ kind: 'ahead', fire: ahead, appt, petName });
    const dayOf = dayOfInstant(appt.scheduled_at);
    if (dayOf) slots.push({ kind: 'day_of', fire: dayOf, appt, petName });
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
    // R2, per group. A day's notification fires at its group's EARLIEST instant, so once
    // that has passed the day's one notification has fired (or was missed): the group is
    // done. Filtering slots before grouping instead let a re-plan after the first fire
    // rebuild the group from its later members under the same identifier, which the OS no
    // longer held, and schedule a SECOND notification that day (code-reviewer, §3.3).
    // The cost, stated: a visit booked for a day whose notification already fired gets
    // none of that kind that day; one per kind per day is the ruling.
    if (first.fire.getTime() <= nowMs) continue;
    const dayKey = localDateKey(first.fire);
    const single = group.length === 1;
    const copy = single ? singleCopy(first, dayKey) : collapsedCopy(group, dayKey);
    out.push({
      kind: first.kind,
      dayKey,
      fireAt: first.fire.toISOString(),
      appointmentId: single ? first.appt.id : null,
      petId: first.appt.pet_id,
      ...copy,
    });
  }
  return out.sort((a, b) => Date.parse(a.fireAt) - Date.parse(b.fireAt) || a.kind.localeCompare(b.kind));
}

// ── The copy (final; see the header) ──────────────────────────────────────────

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

function singleCopy(s: Slot, fireDay: string): { title: string; body: string } {
  const appt = new Date(s.appt.scheduled_at);
  const apptDay = localDateKey(appt);
  const timed = appointmentTimeKnown(s.appt.scheduled_at);
  const clock = timed ? formatClockTime(appt) : null;
  const word = dayWord(apptDay, fireDay, appt);
  if (s.kind === 'ahead') {
    // The title already says the weekday, so the body opens on the date (T2), and the
    // ask names what three days leave room for. Never "weigh in", which reads as giving
    // an opinion. The fire day stands in for "now" so the year is stamped only when the
    // visit falls in another year than the reminder (C-19).
    const fire = dayKeyToLocalDate(fireDay) ?? appt;
    const date = formatVisitDate(apptDay, fire);
    return {
      title: `${s.petName} sees the vet ${word}`,
      body: `${date}${clock ? ` at ${clock}` : ''}. ${AHEAD_ASK}`,
    };
  }
  return {
    title: `${s.petName} sees the vet ${word}${clock ? ` at ${clock}` : ''}`,
    body: DAY_OF_BODY,
  };
}

/** The ahead reminder's ask (mock round 2, T2). */
export const AHEAD_ASK = 'A few minutes in Get ready now leaves time to weigh, log or call ahead.';
/** The day-of body: CUL-2302's line, never naming a finished file, and since round 2 D1
 *  never a date from the record. */
export const DAY_OF_BODY = 'Make a report to take along.';

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

// ── The booking sheet's line (mock round 2, D2) ────────────────────────────────

/**
 * PURE: the reminders a booking at `scheduledAt` would still get, judged at `now`, in
 * fire order. The same two instant functions and the same R2 rule the planner uses, so
 * the sheet can never promise a reminder the schedule would skip. Per booking, without
 * the collapse: a visit that shares a day with another pet's still gets a notification
 * that day, which is what the sheet's line claims.
 */
export function upcomingReminderInstants(scheduledAt: string, now: Date): Date[] {
  const out: Date[] = [];
  for (const at of [aheadInstant(scheduledAt), dayOfInstant(scheduledAt)]) {
    if (at && at.getTime() > now.getTime()) out.push(at);
  }
  return out;
}

/** 'Friday at 6:00 pm', said from `now`: 'today' / 'tomorrow', the weekday inside the
 *  coming week, else the date ('Dec 11 at 6:00 pm'), since a bare weekday a month out
 *  names the wrong Friday. */
export function describeReminderInstant(at: Date, now: Date): string {
  const atDay = localDateKey(at);
  const dayAt = (offset: number) =>
    localDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset));
  let day: string;
  if (atDay === dayAt(0)) day = 'today';
  else if (atDay === dayAt(1)) day = 'tomorrow';
  else if (atDay <= dayAt(6)) day = WEEKDAYS[at.getDay()];
  else day = formatVisitDate(atDay, now);
  return `${day} at ${formatClockTime(at)}`;
}

/** 'Friday at 6:00 pm and Monday at 8:00 am', or null when nothing is left to fire. */
export function upcomingReminderPhrase(scheduledAt: string, now: Date): string | null {
  const parts = upcomingReminderInstants(scheduledAt, now).map((at) => describeReminderInstant(at, now));
  if (parts.length === 0) return null;
  return parts.join(' and ');
}
