import { getDb } from './db';
import type { SignalFinding } from './signal';
import { NO_GOOD_MEAL_HOURS } from './signalCopy';
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
// CUL-2834 (ruling A): a card whose ask got louder after a contact drops that contact's line. The
// engine stamps `askSinceIso` (when the current ask began) and `cardStart` takes the later start.
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
/** `key` moved by `delta` local days. */
function shiftDay(key: string, delta: number): string {
  const d = dayKeyToLocalDate(key) as Date;
  d.setDate(d.getDate() + delta);
  return toLocalDayKey(d);
}

function wholeAtLeast(n: unknown, floor: number): number {
  return typeof n === 'number' && Number.isFinite(n) ? Math.max(floor, Math.floor(n)) : floor;
}

/** Where the card's problem begins: its first local day, and the instant on that day it began
 *  when the record can say (else null). */
export interface CardStart {
  day: string;
  instant: number | null;
}

/** The engine's count, anchored: its local day and `generated_at`. */
export interface CardAnchor {
  day: string;
  iso: string | null;
}

function msOf(iso: string | null | undefined): number | null {
  if (typeof iso !== 'string' || iso.length === 0) return null;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Where the card's problem begins, or null when this build cannot say (the card then gains no
 * line: silence, never a guess). The card's day counts run back from `anchor`, the engine's count.
 *
 * Each type takes the LATEST start its own words defend, so a contact from before the problem
 * the card states is never set under it as if it were about this. The instant matters on the
 * first day itself (the adversarial pass on CUL-2769): a 9:00 am call is not about a 3:00 pm red
 * flag. A type whose words name no instant takes the engine's count as its instant when the card
 * began on the count's own day, and none otherwise.
 */
export function cardStart(finding: SignalFinding, anchor: CardAnchor, nowMs: number = Date.now()): CardStart | null {
  return cardWindow(finding, anchor, nowMs)?.start ?? null;
}

/** The card's window: its start, and the latest INSTANT any part of it is known to begin at.
 *  `notBefore` outlives a day-key tie and a zone change (adversarial pass 1 on CUL-2834, B2): a
 *  call logged at 10:00 in Tokyo is before an ask raised at noon there, whatever day the phone's
 *  zone now puts the ask on. */
interface CardWindow {
  start: CardStart;
  notBefore: number | null;
}

function cardWindow(finding: SignalFinding, anchor: CardAnchor, nowMs: number): CardWindow | null {
  if (finding.priorityClass !== 'safety') return null;
  const problem = problemStart(finding, anchor);
  if (problem === null) return null;
  const instants: number[] = problem.instant === null ? [] : [problem.instant];
  if (!ASK_STAMPED.has(finding.type)) return { start: problem, notBefore: problem.instant };
  // CUL-2834 (ruling A): a card whose ask rose since the problem began starts where the louder
  // ask began. No stamp (a row cached before the field, or a malformed one): no line.
  const askMs = msOf(askSinceIsoOf(finding));
  if (askMs === null) return null;
  let start = laterStart(problem, { day: toLocalDayKey(new Date(askMs)), instant: askMs });
  instants.push(askMs);
  // The phone's own rise: an intake card firms up to the floor 24 hours after its last good meal
  // (`intakeMeetsCatFloor`), with no engine run to stamp it. Once that has happened, it is a start.
  const floorMs = clockFloorMs(finding);
  if (floorMs !== null && floorMs <= nowMs) {
    start = laterStart(start, { day: toLocalDayKey(new Date(floorMs)), instant: floorMs });
    instants.push(floorMs);
  }
  return { start, notBefore: Math.max(...instants) };
}

/** CUL-2834: the lanes whose ask can rise while they stay one card; the engine stamps each with
 *  `askSinceIso` (supabase/functions/generate-signal/askSince.ts ASK_STAMPED, the same four). */
const ASK_STAMPED: ReadonlySet<string> = new Set(['intake_decline', 'symptom_chronicity', 'symptom_worsening', 'symptom_burden']);

/** The engine's stamp, read narrowly: lib/signal.ts's mirror types do not carry it yet. */
function askSinceIsoOf(finding: SignalFinding): string | null {
  const v = (finding as { askSinceIso?: unknown }).askSinceIso;
  return typeof v === 'string' ? v : null;
}

/** The instant an intake card (not a dog's) meets the floor by the clock alone, or null. */
function clockFloorMs(finding: SignalFinding): number | null {
  if (finding.type !== 'intake_decline' || finding.species === 'dog') return null;
  const t = msOf(finding.lastGoodMealIso);
  return t === null ? null : t + NO_GOOD_MEAL_HOURS * 3_600_000;
}

/** The later of two starts. On one day an unknown instant wins: it already refuses every contact
 *  that day, so it is the stricter of the two. */
function laterStart(a: CardStart, b: CardStart): CardStart {
  if (a.day !== b.day) return a.day > b.day ? a : b;
  if (a.instant === null || b.instant === null) return { day: a.day, instant: null };
  return { day: a.day, instant: Math.max(a.instant, b.instant) };
}

/** Where the card's PROBLEM begins (PR-07), before the ask's own start is applied. */
function problemStart(finding: SignalFinding, anchor: CardAnchor): CardStart | null {
  const counted = (day: string): CardStart => ({ day, instant: day === anchor.day ? msOf(anchor.iso) : null });
  switch (finding.type) {
    case 'intake_decline':
      // "for 2 days": today and the day before. A trigger with no day count starts on the anchor.
      return counted(shiftDay(anchor.day, -(wholeAtLeast(finding.daysBelowBaseline, 1) - 1)));
    case 'symptom_burden':
      return counted(
        shiftDay(anchor.day, -(wholeAtLeast(finding.daysSinceRunEnd, 0) + wholeAtLeast(finding.runDays, 1) - 1)),
      );
    case 'symptom_worsening':
      return counted(shiftDay(anchor.day, -(wholeAtLeast(finding.windowDays, 1) - 1)));
    case 'symptom_chronicity': {
      const ms = msOf(finding.firstOnsetIso);
      return ms === null ? null : { day: toLocalDayKey(new Date(ms)), instant: ms };
    }
    case 'incident_red_flag': {
      // The NEWEST event the card asks about (adversarial pass 2): an older photo flag beside a
      // call-now read from this afternoon must not let this morning's call stand under the call.
      const ms = [finding.callOnly ? null : finding.mostRecentFlaggedIso, finding.tierIso, finding.laterCallTodayIso]
        .map(msOf)
        .filter((m): m is number => m !== null);
      if (ms.length === 0) return null;
      const latest = Math.max(...ms);
      return { day: toLocalDayKey(new Date(latest)), instant: latest };
    }
    default:
      return null;
  }
}

/** The card's first day alone (see `cardStart`). */
export function cardFirstDay(finding: SignalFinding, anchor: CardAnchor, nowMs: number = Date.now()): string | null {
  return cardStart(finding, anchor, nowMs)?.day ?? null;
}

/** A contact after the card's problem began. On the first day itself only a contact the owner
 *  timed at or after the problem's instant counts: an untimed one, or one before, may be about
 *  something else, and the line is never a guess. */
function isAfterStart(c: RemoteContact, w: CardWindow): boolean {
  const at = msOf(c.contactedAt);
  // A contact whose instant is before an instant the card is known to begin at is never about it,
  // whatever the day keys say: across a zone change the instant can fall on another local day than
  // the contact's day key, and it is still a real instant. An UNTIMED contact on a later day has
  // no instant to test: the day keys are all the record holds (a known limit, stated in the PR).
  if (at !== null && w.notBefore !== null && at < w.notBefore) return false;
  const timed = at !== null && toLocalDayKey(new Date(at)) === c.day;
  const start = w.start;
  if (c.day > start.day) return true;
  if (c.day < start.day || start.instant === null) return false;
  return timed && (at as number) >= start.instant;
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
 * - From the newest remote contact made after the card's problem began (`cardStart`) and not
 *   after today.
 * - R11: `calledOn` is the day of a shipped "You called on {day}." line the card already draws.
 *   A phone contact on that same day is the same fact, said once: null. Another day or another
 *   channel says something new and gets its line. No Home card draws that line today (PM ruling
 *   2026-11-19, option A on CUL-2769), so Home passes null.
 * - CUL-2834: `nowMs` decides only whether the phone's own clock floor has begun (`cardStart`).
 */
export function contactLineFor(
  finding: SignalFinding,
  contacts: readonly RemoteContact[],
  today: string,
  anchor: CardAnchor,
  calledOn: string | null = null,
  nowMs: number = Date.now(),
): string | null {
  const w = cardWindow(finding, anchor, nowMs);
  if (w === null) return null;
  const newest = contacts.filter((c) => c.day <= today && isAfterStart(c, w)).sort(newerFirst)[0];
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
