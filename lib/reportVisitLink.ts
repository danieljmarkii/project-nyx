// A saved report's visit (Vet report v2 PR-22, CUL-2302; spec §11.3; critique GAP-28).
//
// PROVENANCE ONLY. A kept copy can be filed under the visit, or the booked appointment, it was
// for: now, later, moved, or taken off ("Not for a visit"), including a copy made for no visit.
// The link changes nothing in the copy (113's freeze), and it is never an input to any count,
// window or engine: the visit names its reports, nothing more (guards/visitReaders.test.ts).
//
// TWO DOORS, AS THE LIBRARY HAS (lib/reportLibrary.ts).
//   · Reading a link, or a visit's reports, uses the owner's own JWT: 110's
//     `vet_reports_select_owner` returns only rows of the caller's pets, and every query also
//     names the pet and kept rows only.
//   · Writing one asks the `report-visit-link` Edge Function. The client holds no column grant on
//     either link (113, option a), so the server checks the pet, the copy and the target are all
//     the caller's and the same pet's before it writes.
//
// The picker's choices come from the visit companion's own read (`readVetVisitsHome`, local
// SQLite): this file shapes them, it never queries a visit table.

import { supabase } from './supabase';
import { functionsErrorStatus } from './syncQueue';
import { formatVisitDate, type VetVisitsHome } from './vetVisits';
import type { SavedReport } from './reportLibrary';

export type VisitLinkTarget = { kind: 'visit' | 'appointment'; id: string };

/** One row of the picker. */
export interface VisitLinkOption {
  target: VisitLinkTarget;
  /** "Oct 30 visit", "Appointment · Tomorrow · 3:00 pm". */
  primary: string;
  /** Clinic · vet · reason, whatever exists. Empty when none was recorded. */
  secondary: string;
  /** The words after "For", on the report: "the Oct 30 visit", "tomorrow’s appointment". */
  phrase: string;
}

type Client = typeof supabase;
type Invoke = (body: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;

const invokeLink: Invoke = (body) => supabase.functions.invoke('report-visit-link', { body });

// ── Reads ────────────────────────────────────────────────────────────────────

type LinkRaw = { vet_visit_id: string | null; vet_appointment_id: string | null };

/** The copy's current link, or null when it is for no visit. 'failed': the read did not answer. */
export async function readReportLink(
  petId: string,
  reportId: string,
  client: Client = supabase,
): Promise<VisitLinkTarget | null | 'failed'> {
  try {
    const { data, error } = await client
      .from('vet_reports')
      .select('vet_visit_id, vet_appointment_id')
      .eq('id', reportId)
      .eq('pet_id', petId)
      .eq('status', 'kept')
      .maybeSingle();
    if (error) return 'failed';
    const r = data as unknown as LinkRaw | null;
    if (!r) return null;
    if (r.vet_visit_id) return { kind: 'visit', id: r.vet_visit_id };
    if (r.vet_appointment_id) return { kind: 'appointment', id: r.vet_appointment_id };
    return null;
  } catch {
    return 'failed';
  }
}

/** Rows per page of a visit's reports. Paged to the end by count (C-42's shape, on the client). */
export const VISIT_REPORTS_PAGE = 50;

const VISIT_REPORT_COLUMNS = 'id, pet_id, short_id, date_range_start, date_range_end, shared_via, shared_at';

type ReportRaw = {
  id: string;
  pet_id: string;
  short_id: string | null;
  date_range_start: string;
  date_range_end: string;
  shared_via: string | null;
  shared_at: string | null;
};

/**
 * The kept copies filed under this visit, newest departure first: those linked to the visit, and
 * those linked to the appointment the visit was logged from (a report sent ahead of the day is
 * filed under the booking, and the booking became this visit). Never throws.
 */
export async function readReportsForVisit(
  petId: string,
  visitId: string,
  appointmentId: string | null,
  client: Client = supabase,
): Promise<SavedReport[] | 'failed'> {
  const match = appointmentId
    ? `vet_visit_id.eq.${visitId},vet_appointment_id.eq.${appointmentId}`
    : `vet_visit_id.eq.${visitId}`;
  const out: SavedReport[] = [];
  try {
    let total: number | null = null;
    for (let from = 0; total === null || from < total; ) {
      const { data, error, count } = await client
        .from('vet_reports')
        .select(VISIT_REPORT_COLUMNS, { count: 'exact' })
        .eq('pet_id', petId)
        .eq('status', 'kept')
        .or(match)
        .order('shared_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, from + VISIT_REPORTS_PAGE - 1);
      if (error || !Array.isArray(data) || typeof count !== 'number') return 'failed';
      total = count;
      if (data.length === 0) break;
      for (const r of data as unknown as ReportRaw[]) {
        if (!r.short_id || !r.shared_via || !r.shared_at) continue;
        out.push({
          id: r.id,
          petId: r.pet_id,
          shortId: r.short_id,
          startDate: r.date_range_start,
          endDate: r.date_range_end,
          sharedVia: r.shared_via,
          sharedAt: r.shared_at,
        });
      }
      from += data.length;
    }
    return out;
  } catch (e) {
    console.warn('[reportVisitLink] the visit’s reports could not be read:', e);
    return 'failed';
  }
}

// ── The write ────────────────────────────────────────────────────────────────

export type LinkResult =
  | { kind: 'ok' }
  /** No answer at all: offline, or a dropped connection. */
  | { kind: 'offline' }
  /** The server would not file it there (a visit not on the server yet, or no longer live). */
  | { kind: 'refused' }
  | { kind: 'failed' };

/** Files the copy under `target`, or under no visit when null. Never throws. */
export async function linkSavedReport(
  petId: string,
  reportId: string,
  target: VisitLinkTarget | null,
  invoke: Invoke = invokeLink,
): Promise<LinkResult> {
  try {
    const { data, error } = await invoke({ petId, reportId, target });
    if (error) {
      const status = functionsErrorStatus(error);
      if (status === null) return { kind: 'offline' };
      return status === 404 ? { kind: 'refused' } : { kind: 'failed' };
    }
    return (data as { linked?: unknown } | null)?.linked !== undefined ? { kind: 'ok' } : { kind: 'failed' };
  } catch (e) {
    console.warn('[reportVisitLink] the link could not be saved:', e);
    return { kind: 'failed' };
  }
}

// ── The picker's choices and words ───────────────────────────────────────────

function appointmentPhrase(day: string): string {
  if (day === 'Today') return 'today’s appointment';
  if (day === 'Tomorrow') return 'tomorrow’s appointment';
  return `the appointment on ${day}`;
}

/**
 * Every visit and live booking a copy can be filed under, for ONE pet: the bookings to come
 * (soonest first), then the bookings whose day has passed, then the visits (newest first).
 */
export function linkOptions(home: VetVisitsHome, now: Date = new Date()): VisitLinkOption[] {
  const appointments = [...(home.next ? [home.next] : []), ...home.later, ...home.awaiting];
  return [
    ...appointments.map((a) => ({
      target: { kind: 'appointment' as const, id: a.id },
      primary: `Appointment · ${a.when}`,
      secondary: a.where,
      phrase: appointmentPhrase(a.day),
    })),
    ...home.visits.map((v) => {
      const date = formatVisitDate(v.visitedAt, now);
      return {
        target: { kind: 'visit' as const, id: v.id },
        primary: `${date} visit`,
        // The reason, when typed, is the title; the stand-in title only repeats the date.
        secondary: [v.title.startsWith('Visit on ') ? '' : v.title, v.where].filter((p) => p.length > 0).join(' · '),
        phrase: `the ${date} visit`,
      };
    }),
  ];
}

export function sameTarget(a: VisitLinkTarget | null, b: VisitLinkTarget | null): boolean {
  if (a === null || b === null) return a === b;
  return a.kind === b.kind && a.id === b.id;
}

/** The report's line for its link: "For the Oct 30 visit". A link the list no longer holds (a
 *  booking since logged as a visit, a visit removed) still says it is filed, never that it is not. */
export function linkedLine(link: VisitLinkTarget, options: readonly VisitLinkOption[]): string {
  const hit = options.find((o) => sameTarget(o.target, link));
  return hit ? `For ${hit.phrase}` : LINKED_ELSEWHERE;
}

export const LINKED_ELSEWHERE = 'Filed under a visit';
export const ATTACH_LABEL = 'Attach to a visit';
export const CHANGE_LABEL = 'Change';
export const PICKER_TITLE = 'Which visit was this report for?';
export const PICKER_NOTE = 'This only files the report. The copy stays exactly as sent.';
export const NOT_FOR_A_VISIT = 'Not for a visit';

export function pickerEmpty(petName: string, anonymous: string): string {
  const who = petName === anonymous ? 'your pet' : petName;
  return `No visits on ${who}’s record yet. Add one from the Pet tab, then file this report under it.`;
}

export const LINK_OFFLINE = 'You’re offline. Try again when you’re back online.';
export const LINK_REFUSED = 'Couldn’t file the report under that visit. If you just added it, try again in a minute.';
export const LINK_FAILED = 'Couldn’t save that. Try again in a moment.';

/** The visit screen's section. */
export const VISIT_REPORTS_TITLE = 'Reports for this visit';
export const VISIT_REPORTS_FAILED = 'Couldn’t load the reports for this visit.';
