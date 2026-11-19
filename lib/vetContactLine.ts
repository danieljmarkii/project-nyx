import { getDb } from './db';
import type { SignalFinding } from './signal';
import { dayKeyToLocalDate, toLocalDayKey } from './utils';
import { formatClockTime } from './vetVisits';

// Vet contacts PR-07 (CUL-2769; docs/nyx-vet-contacts-requirements.md §4.5, R5, R11; mock §E).
//
// AWARENESS ONLY. A call, text or email the owner logged may add ONE context line under a live
// safety card: "You emailed the vet today, 4:10 pm." It never removes, softens, delays, reorders
// or rewords the card (R5). That is structural here: this module returns a string or null and
// takes nothing the card's sentence, count, ask or rank is computed from back out. The row draws
// the line after everything it already draws, and the stack's order is decided before a contact
// is ever read.
//
// It writes nothing. A contact is never a care-state answer, an acknowledgement, a `vet_calls`
// row or a follow-up (§4.5), and Home's write classes stay two (guards/homeWrites.test.ts).

export type RemoteChannel = 'phone' | 'text' | 'email';

/** A remote contact as Home reads it: the day it happened (a local day key) and, when the owner
 *  gave one, the time (a UTC instant, C-10). */
export interface RemoteContact {
  id: string;
  day: string;
  channel: RemoteChannel;
  contactedAt: string | null;
}

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})/;
const REMOTE: ReadonlySet<string> = new Set<RemoteChannel>(['phone', 'text', 'email']);

const VERB: Record<RemoteChannel, string> = { phone: 'called', text: 'texted', email: 'emailed' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** A real calendar day key, or null. "2026-02-30" is refused, never rolled into March. */
function dayKeyOf(value: string | null | undefined): string | null {
  const m = DAY_KEY.exec(value ?? '');
  if (!m) return null;
  const key = `${m[1]}-${m[2]}-${m[3]}`;
  const d = dayKeyToLocalDate(key);
  return d && toLocalDayKey(d) === key ? key : null;
}

/** The local day of an instant, or null when it is not one. */
function dayOfInstant(iso: string | null | undefined): string | null {
  if (typeof iso !== 'string' || iso.length === 0) return null;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : toLocalDayKey(new Date(ms));
}

/** `key` moved by `delta` local days. */
function shiftDay(key: string, delta: number): string {
  const d = dayKeyToLocalDate(key) as Date;
  d.setDate(d.getDate() + delta);
  return toLocalDayKey(d);
}

function wholeAtLeast(n: unknown, floor: number): number {
  return typeof n === 'number' && Number.isFinite(n) ? Math.max(floor, Math.floor(n)) : floor;
}

/**
 * The first local day the card speaks about, or null when this build cannot say (the card then
 * gains no line: silence, never a guess). `anchorDay` is the day the engine counted (the cache
 * row's `generated_at`), since the card's day counts run back from there.
 *
 * Each type takes the LATEST start its own words defend, so a contact from before the problem
 * the card states is never set under it as if it were about this.
 */
export function cardFirstDay(finding: SignalFinding, anchorDay: string): string | null {
  if (finding.priorityClass !== 'safety') return null;
  switch (finding.type) {
    case 'intake_decline':
      // "for 2 days": today and the day before. A trigger with no day count starts on the anchor.
      return shiftDay(anchorDay, -(wholeAtLeast(finding.daysBelowBaseline, 1) - 1));
    case 'symptom_burden':
      return shiftDay(
        anchorDay,
        -(wholeAtLeast(finding.daysSinceRunEnd, 0) + wholeAtLeast(finding.runDays, 1) - 1),
      );
    case 'symptom_chronicity':
      return dayOfInstant(finding.firstOnsetIso);
    case 'symptom_worsening':
      return shiftDay(anchorDay, -(wholeAtLeast(finding.windowDays, 1) - 1));
    case 'incident_red_flag': {
      const days = [finding.callOnly ? null : finding.mostRecentFlaggedIso, finding.tierIso]
        .map(dayOfInstant)
        .filter((d): d is string => d !== null)
        .sort();
      return days[0] ?? null;
    }
    default:
      return null;
  }
}

/** "Fri, Nov 13", with the year when it is not this year's. */
function contactDay(day: string, today: string): string {
  const d = dayKeyToLocalDate(day) as Date;
  const stem = `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return day.slice(0, 4) === today.slice(0, 4) ? stem : `${stem}, ${day.slice(0, 4)}`;
}

/** Newest first: the later day, then the later time (a timed contact after an untimed one on the
 *  same day, since the owner said when), then the id so the pick never depends on read order. */
function newerFirst(a: RemoteContact, b: RemoteContact): number {
  if (a.day !== b.day) return a.day < b.day ? 1 : -1;
  const at = a.contactedAt ? new Date(a.contactedAt).getTime() : -Infinity;
  const bt = b.contactedAt ? new Date(b.contactedAt).getTime() : -Infinity;
  if (at !== bt) return at < bt ? 1 : -1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/** The sentence for one contact, said from `today`. */
export function contactSentence(contact: RemoteContact, today: string): string {
  const verb = VERB[contact.channel];
  if (contact.day !== today) return `You ${verb} the vet on ${contactDay(contact.day, today)}.`;
  // The time is the owner's only when it falls on the contact's own day: an edited day with a
  // stale time would print a time from another day.
  const at = contact.contactedAt ? new Date(contact.contactedAt) : null;
  const timed = at !== null && !Number.isNaN(at.getTime()) && toLocalDayKey(at) === contact.day;
  return timed ? `You ${verb} the vet today, ${formatClockTime(at as Date)}.` : `You ${verb} the vet today.`;
}

/**
 * The card's context line, or null.
 *
 * - From the newest remote contact dated on or after the card's first day and not after today.
 * - R11: `calledOn` is the day of a shipped "You called on {day}." line the card already draws.
 *   A phone contact on that same day is the same fact, said once: null. Another day or another
 *   channel says something new and gets its line. No Home card draws that line today (PM ruling
 *   2026-11-19, option A on CUL-2769), so Home passes null.
 */
export function contactLineFor(
  finding: SignalFinding,
  contacts: readonly RemoteContact[],
  today: string,
  anchorDay: string,
  calledOn: string | null = null,
): string | null {
  const first = cardFirstDay(finding, anchorDay);
  if (first === null) return null;
  const newest = contacts.filter((c) => c.day >= first && c.day <= today).sort(newerFirst)[0];
  if (!newest) return null;
  if (calledOn !== null && newest.channel === 'phone' && newest.day === calledOn) return null;
  return contactSentence(newest, today);
}

/** Rows as SQLite hands them back, before they are trusted. */
interface ContactRow {
  id: string;
  visited_at: string | null;
  channel: string | null;
  contacted_at: string | null;
}

/** Parse rows into contacts, dropping anything malformed (a bad row only ever drops a line). */
export function contactsFromRows(rows: readonly ContactRow[]): RemoteContact[] {
  const out: RemoteContact[] = [];
  for (const r of rows) {
    const day = dayKeyOf(r.visited_at);
    if (day === null || r.channel === null || !REMOTE.has(r.channel)) continue;
    out.push({ id: r.id, day, channel: r.channel as RemoteChannel, contactedAt: r.contacted_at ?? null });
  }
  return out;
}

/** The pet's remote contacts, newest first. Rejects on a failed read: the caller draws no line. */
export async function readRemoteContacts(petId: string): Promise<RemoteContact[]> {
  const rows = await getDb().getAllAsync<ContactRow>(
    // visit-read: anyContact — Home's awareness line names the owner's calls, texts and emails, never an exam
    `SELECT id, visited_at, channel, contacted_at FROM vet_visits
      WHERE pet_id = ? AND deleted_at IS NULL AND channel IN ('phone', 'text', 'email')
      ORDER BY visited_at DESC LIMIT 50`,
    [petId],
  );
  return contactsFromRows(rows).sort(newerFirst);
}
