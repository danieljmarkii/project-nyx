// The Reports library (Vet report v2 PR-21, CUL-2301; spec §11.3, §14; critique GAP-26, WBC-4,
// WBC-5, WBC-9).
//
// EVERY REPORT AN OWNER SENT, EACH OPENING EXACTLY AS IT WAS SENT. A kept `vet_reports` row is one
// snapshot: PR-20's keep restamps the same row on every later departure, so the library is one row
// per copy by construction. A list row shows its LATEST departure; the detail screen lists every
// one, read from `vet_report_departures` (migration 119, CUL-2445): one row per send, written by
// the database in the same transaction that moved the copy's stamp.
//
// TWO READS, TWO DOORS.
//   · The list reads `vet_reports` with the owner's own JWT. Migration 110's
//     `vet_reports_select_owner` policy returns only rows of pets the caller owns; the query names
//     its columns (never `snapshot`, `params` or the AI lead) and kept rows only (a draft is not a
//     sent report).
//   · Opening a copy asks `generate-report` (`mode: 'open'`): the stored HTML lives in a bucket
//     only the service role reaches, and the server returns it inline only to the pet's owner and
//     only while its bytes still match the hash frozen at keep.
//
// NO ENTITLEMENT IS READ HERE (spec §11.2, §13: an entitlement lapse never hides a saved copy;
// guards/reportNoEntitlement.test.ts scans this file).
//
// TITLES COME FROM THE ROW'S PET (C-9): the caller resolves the name from the row's `pet_id`,
// never from the active pet, so a two-pet owner never reads one pet's copies under the other's
// name.

import { supabase } from './supabase';
import { functionsErrorStatus } from './syncQueue';

/** One kept copy, as the list shows it. */
export interface SavedReport {
  id: string;
  petId: string;
  shortId: string;
  /** The report's window, as stored: calendar dates, `YYYY-MM-DD`. */
  startDate: string;
  endDate: string;
  /** The latest departure. Free text in 113; the writer's set is email | print | share. */
  sharedVia: string;
  /** UTC instant of the latest departure. */
  sharedAt: string;
}

/** Rows per page of the list read. Paged to the end: a count decides completeness, never a short
 *  page (C-42's shape, on the client). */
export const LIBRARY_PAGE = 100;

/** The columns the list may read. Never the snapshot, params or AI lead: the list needs none. */
export const LIBRARY_COLUMNS = 'id, pet_id, short_id, date_range_start, date_range_end, shared_via, shared_at';

type Raw = {
  id: string;
  pet_id: string;
  short_id: string | null;
  date_range_start: string;
  date_range_end: string;
  shared_via: string | null;
  shared_at: string | null;
};

export type LibraryRead = { kind: 'ok'; reports: SavedReport[] } | { kind: 'failed' };

type Client = typeof supabase;

/** Every kept copy of one pet, newest departure first. Never throws. */
export async function readSavedReports(petId: string, client: Client = supabase): Promise<LibraryRead> {
  const out: SavedReport[] = [];
  try {
    let total: number | null = null;
    for (let from = 0; total === null || from < total; ) {
      const { data, error, count } = await client
        .from('vet_reports')
        .select(LIBRARY_COLUMNS, { count: 'exact' })
        .eq('pet_id', petId)
        .eq('status', 'kept')
        .order('shared_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, from + LIBRARY_PAGE - 1);
      if (error) {
        // A PostgREST refusal arrives here, never as a throw (CUL-2477): said, not swallowed.
        console.warn('[reportLibrary] the saved reports could not be read:', error);
        return { kind: 'failed' };
      }
      if (!Array.isArray(data) || typeof count !== 'number') return { kind: 'failed' };
      total = count;
      if (data.length === 0) break;
      for (const r of data as unknown as Raw[]) {
        // 113's kept CHECK makes these present; a row without them is skipped, never guessed.
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
    return { kind: 'ok', reports: out };
  } catch (e) {
    console.warn('[reportLibrary] the saved reports could not be read:', e);
    return { kind: 'failed' };
  }
}

/** One kept copy's listing row, by id paired with its pet (the detail screen's header). */
export async function readSavedReport(petId: string, reportId: string, client: Client = supabase): Promise<SavedReport | null | 'failed'> {
  try {
    const { data, error } = await client
      .from('vet_reports')
      .select(LIBRARY_COLUMNS)
      .eq('id', reportId)
      .eq('pet_id', petId)
      .eq('status', 'kept')
      .maybeSingle();
    if (error) {
      console.warn('[reportLibrary] the saved report could not be read:', error);
      return 'failed';
    }
    const r = data as unknown as Raw | null;
    if (!r || !r.short_id || !r.shared_via || !r.shared_at) return null;
    return {
      id: r.id,
      petId: r.pet_id,
      shortId: r.short_id,
      startDate: r.date_range_start,
      endDate: r.date_range_end,
      sharedVia: r.shared_via,
      sharedAt: r.shared_at,
    };
  } catch (e) {
    console.warn('[reportLibrary] the saved report could not be read:', e);
    return 'failed';
  }
}

/** Whether this pet has any kept copy: the Pet tab's "All reports" link shows only then (spec
 *  §12: flag off is today's app for an account with no saved copies). Null when the read failed:
 *  the link stays hidden, nothing else changes. */
export async function hasSavedReports(petId: string, client: Client = supabase): Promise<boolean | null> {
  try {
    const { count, error } = await client
      .from('vet_reports')
      .select('id', { count: 'exact', head: true })
      .eq('pet_id', petId)
      .eq('status', 'kept');
    if (error || typeof count !== 'number') return null;
    return count > 0;
  } catch {
    return null;
  }
}

// ── Every time a copy was sent (CUL-2445, migration 119) ──────────────────────

/** One send of a kept copy. */
export interface Departure {
  id: string;
  /** Free text in 119 (≤ 32), the writer's set: email | print | share. */
  sharedVia: string;
  /** UTC instant of the send. */
  sharedAt: string;
}

export type DeparturesRead = { kind: 'ok'; departures: Departure[] } | { kind: 'failed' };

/** Rows per page of the departures read. Paged to the count, as the list is (C-42). */
export const DEPARTURES_PAGE = 100;

/** The columns the departures read may ask for. */
export const DEPARTURE_COLUMNS = 'id, shared_via, shared_at';

type RawDeparture = { id: string; shared_via: string | null; shared_at: string | null };

/**
 * Every send of one kept copy, newest first. Read with the owner's JWT: 119's policy returns only
 * departures of pets the caller owns, and the query names the report PAIRED WITH its pet (C-9).
 * A failed page fails the whole read, so the screen never shows a short history as the whole one.
 * Never throws.
 */
export async function readDepartures(petId: string, reportId: string, client: Client = supabase): Promise<DeparturesRead> {
  const out: Departure[] = [];
  // A send committed between two pages shifts the offsets, so a row can arrive twice: one row per
  // id, never a duplicate counted into the heading.
  const seen = new Set<string>();
  try {
    let total: number | null = null;
    for (let from = 0; total === null || from < total; ) {
      const { data, error, count } = await client
        .from('vet_report_departures')
        .select(DEPARTURE_COLUMNS, { count: 'exact' })
        .eq('report_id', reportId)
        .eq('pet_id', petId)
        .order('shared_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, from + DEPARTURES_PAGE - 1);
      if (error) {
        console.warn('[reportLibrary] the send history could not be read:', error);
        return { kind: 'failed' };
      }
      if (!Array.isArray(data) || typeof count !== 'number') return { kind: 'failed' };
      total = count;
      if (data.length === 0) break;
      for (const r of data as unknown as RawDeparture[]) {
        // 119's columns are NOT NULL; a row without them is skipped, never guessed.
        if (!r.shared_via || !r.shared_at) continue;
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        out.push({ id: r.id, sharedVia: r.shared_via, sharedAt: r.shared_at });
      }
      from += data.length;
    }
    // Fewer rows than the count promised: incomplete, said as a failure.
    if (total !== null && out.length < total) return { kind: 'failed' };
    return { kind: 'ok', departures: out };
  } catch (e) {
    console.warn('[reportLibrary] the send history could not be read:', e);
    return { kind: 'failed' };
  }
}

export type OpenedCopy =
  | { kind: 'ok'; html: string }
  /** The server answered that this copy cannot be shown (missing, or no longer the file it was). */
  | { kind: 'unavailable' }
  /** No answer at all: offline, or a dropped connection. */
  | { kind: 'offline' }
  | { kind: 'failed' };

type Invoke = (body: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;

const invokeOpen: Invoke = (body) => supabase.functions.invoke('generate-report', { body });

/** One kept copy's stored HTML, exactly as sent. Never throws. */
export async function openSavedReport(petId: string, reportId: string, invoke: Invoke = invokeOpen): Promise<OpenedCopy> {
  try {
    const { data, error } = await invoke({ mode: 'open', petId, reportId });
    if (error) {
      const status = functionsErrorStatus(error);
      if (status === null) return { kind: 'offline' };
      return status === 404 || status === 409 ? { kind: 'unavailable' } : { kind: 'failed' };
    }
    const html = (data as { html?: unknown } | null)?.html;
    return typeof html === 'string' && html.length > 0 ? { kind: 'ok', html } : { kind: 'failed' };
  } catch (e) {
    // Network loss arrives as `error` with no status (above); a throw is something else.
    console.warn('[reportLibrary] the saved copy could not be opened:', e);
    return { kind: 'failed' };
  }
}

// ── Words and shapes ─────────────────────────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The local calendar date of a UTC instant (timestamps convert at the app layer, C-10). */
function localParts(iso: string): { y: number; m: number; d: number } {
  const t = new Date(iso);
  return { y: t.getFullYear(), m: t.getMonth(), d: t.getDate() };
}

/** A stored calendar date, read as written: no timezone shift. */
function dateParts(ymd: string): { y: number; m: number; d: number } {
  const [y, m, d] = ymd.split('-').map(Number);
  return { y, m: m - 1, d };
}

function short(p: { m: number; d: number }): string {
  return `${MONTHS[p.m]} ${p.d}`;
}

/** "Oct 30", or "Oct 30, 2025" outside `yearInView`. */
export function sentDateLabel(sharedAt: string, yearInView: number): string {
  const p = localParts(sharedAt);
  return p.y === yearInView ? short(p) : `${short(p)}, ${p.y}`;
}

/** The report's window. Each end carries its year only when it is not the year in view, so a
 *  year-less date never stands outside the band that names its year (C-19). */
export function windowLabel(startDate: string, endDate: string, yearInView: number): string {
  const s = dateParts(startDate);
  const e = dateParts(endDate);
  const end = e.y === yearInView ? short(e) : `${short(e)}, ${e.y}`;
  const start = s.y === yearInView && e.y === yearInView ? short(s) : `${short(s)}, ${s.y}`;
  return `${start} – ${end}`;
}

/**
 * How the copy left, worded as what the app knows (WBC-5, spec §10.3). The row cannot tell iOS
 * Mail's "sent" from Android's unknowable answer, so no route claims delivery.
 */
export function departureWords(sharedVia: string): string {
  switch (sharedVia) {
    case 'email':
      return 'Shared by email';
    case 'print':
      return 'Printed';
    default:
      return 'Shared';
  }
}

function possessive(petName: string, anonymous: string): string {
  return petName === anonymous ? 'Your pet’s' : `${petName}’s`;
}

/** "Cooper’s vet reports" (WBC-9). */
export function libraryTitle(petName: string, anonymous: string): string {
  return `${possessive(petName, anonymous)} vet reports`;
}

/** "Cooper · Oct 30 report" (WBC-9); "Oct 30 report" when the pet cannot be named. */
export function copyTitle(petName: string, anonymous: string, sharedAt: string, currentYear: number): string {
  const date = sentDateLabel(sharedAt, currentYear);
  return petName === anonymous ? `${date} report` : `${petName} · ${date} report`;
}

/** The detail screen's header strip: what this copy is, and what it is not. */
export function asSentLine(sharedAt: string, currentYear: number): string {
  return `The report as you sent it on ${sentDateLabel(sharedAt, currentYear)}. Anything logged or changed since isn’t in it.`;
}

/** The detail's one action (WBC-4: a saved copy never changes, so nothing reads as updating it). */
export const NEW_REPORT_LABEL = 'New report through today';

export function newReportSubline(sharedAt: string, currentYear: number): string {
  return `The ${sentDateLabel(sharedAt, currentYear)} copy stays exactly as sent`;
}

/** "Sent once", "Sent 3 times": the whole history's size, from the read's count (C-3). */
export function departuresHeading(n: number): string {
  return n === 1 ? 'Sent once' : `Sent ${n} times`;
}

/** The detail lists this many sends before "Show all": the paper keeps the screen (Principle 9). */
export const SENDS_SHOWN = 3;

/** "Show all 5 sends". */
export function showAllSendsLabel(n: number): string {
  return `Show all ${n} sends`;
}

/** The local clock time of a UTC instant, "4:10 PM" (C-10: converted at the app layer). */
function clockLabel(iso: string): string {
  const t = new Date(iso);
  const h = t.getHours();
  const m = String(t.getMinutes()).padStart(2, '0');
  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
}

/** One send: "Printed · Nov 3, 4:10 PM". The time tells two sends on one day apart. */
export function departureLine(d: Departure, currentYear: number): string {
  return `${departureWords(d.sharedVia)} · ${sentDateLabel(d.sharedAt, currentYear)}, ${clockLabel(d.sharedAt)}`;
}

export interface LibraryGroup {
  year: number;
  reports: SavedReport[];
  /** Folded groups show one line until the owner opens them; only the newest year starts open. */
  folded: boolean;
}

/**
 * Groups by the local year of each copy's latest departure, newest first. The newest year starts
 * open; every older year folds to one line (GAP-26). Order inside a group is the read's order.
 */
export function groupByYear(reports: SavedReport[]): LibraryGroup[] {
  const byYear = new Map<number, SavedReport[]>();
  for (const r of reports) {
    const y = localParts(r.sharedAt).y;
    const list = byYear.get(y);
    if (list) list.push(r);
    else byYear.set(y, [r]);
  }
  const years = [...byYear.keys()].sort((a, b) => b - a);
  return years.map((year, i) => ({ year, reports: byYear.get(year)!, folded: i > 0 }));
}

/** "2025 · 6 reports", "2024 · 1 report". */
export function foldedGroupLabel(group: LibraryGroup): string {
  const n = group.reports.length;
  return `${group.year} · ${n} ${n === 1 ? 'report' : 'reports'}`;
}

/** The empty state (spec §11.3; the discovery brief's C1 zero state, Principle 5). */
export const LIBRARY_EMPTY_TITLE = 'No reports sent yet';
export function libraryEmptyBody(petName: string, anonymous: string): string {
  const who = petName === anonymous ? 'your pet' : petName;
  return `When you send a report about ${who}, a copy stays here, so you can always see exactly what your vet has.`;
}

export const LIBRARY_FAILED = 'Couldn’t load your saved reports. Check your connection and try again.';
export const COPY_OFFLINE = 'You’re offline. Saved reports open when you’re back online.';
export const COPY_UNAVAILABLE = 'This copy can’t be shown right now. Your vet’s copy isn’t affected.';
export const COPY_FAILED = 'Couldn’t open this report. Try again in a moment.';
/** The detail's title until its row answers. */
export const COPY_TITLE_PENDING = 'Saved report';
