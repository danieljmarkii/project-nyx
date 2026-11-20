// The record's words for a vet contact (CUL-2749 PR-06, spec §4.6, mock §D).
//
// A `vet_visits` row is not always an exam since migration 122: `channel` says how the owner
// heard from the vet. Every record surface (the list, the contact's own page, a course's
// source, History) says which, from these functions, so the four surfaces cannot drift into
// four spellings of one fact. Pure: no I/O, no flag. A remote channel speaks whatever the
// switch says (`showsChannel`, CUL-2830); the switch decides only a clinic visit's words.
//
// THE RULE THE COPY HOLDS. A remote contact says "no exam" on every surface, never implied
// away (spec §6.1, n=1: a contact asserts nothing about the pet). A clinic visit keeps the
// shipped words ("Vet visit"), so nothing an exam already says changes.
import { formatClockTime, formatVisitDate, type CourseVisitSource, type VisitChannel } from './vetVisits';

export type RemoteChannel = Exclude<VisitChannel, 'in_clinic'>;

export function isRemoteChannel(channel: VisitChannel | null | undefined): channel is RemoteChannel {
  return channel === 'phone' || channel === 'text' || channel === 'email';
}

/**
 * Whether a record surface draws a row's channel (CUL-2830, PM ruling 2026-11-20): the RECORD
 * decides, whatever this phone's Early access switch or a not-yet-resolved flag says. A call,
 * text or email exists only because someone used the feature, so naming it is a fact about the
 * record, never a feature: a second phone, a reinstall or a cold start never calls it "Vet
 * visit". A clinic visit (or a row of unknown channel) keeps the shipped words while the switch
 * is off, so a phone with no remote rows is byte-identical (AC 1). Entry (the logging door, the
 * sheet's channel step, the channel chips) stays behind the switch; this governs words only.
 */
export function showsChannel(featureOn: boolean, channel: VisitChannel | null | undefined): boolean {
  return featureOn || isRemoteChannel(channel);
}

/** The list's tag (mock D1): Visit | Phone | Text | Email. */
export const CHANNEL_TAG: Record<VisitChannel, string> = {
  in_clinic: 'Visit',
  phone: 'Phone',
  text: 'Text',
  email: 'Email',
};

/** "Nyx's call", "Nyx's texts", "Nyx's email" (spec §4.6). */
const CONTACT_NOUN: Record<RemoteChannel, string> = { phone: 'call', text: 'texts', email: 'email' };
/** "this call", "these texts": the footnote's subject. */
const THIS_CONTACT: Record<RemoteChannel, string> = { phone: 'this call', text: 'these texts', email: 'this email' };
/** "a call", "a text", "an email": the course's source row (D5). */
const A_CONTACT: Record<RemoteChannel, string> = { phone: 'a call', text: 'a text', email: 'an email' };
/** History's title (D4). */
const HISTORY_TITLE: Record<RemoteChannel, string> = {
  phone: 'Phone call with the vet',
  text: 'Texts with the vet',
  email: 'Email with the vet',
};

export const NO_EXAM = 'No exam';

/** "this visit", "this call", "these texts", "this email": a record surface's subject (CUL-2830). */
export function thisRecord(channel: VisitChannel | null | undefined): string {
  return isRemoteChannel(channel) ? THIS_CONTACT[channel] : 'this visit';
}

/** What the record IS, in one word: the visit page's header actions and History's door. */
export function recordNoun(channel: VisitChannel | null | undefined): string {
  return isRemoteChannel(channel) ? CONTACT_NOUN[channel] : 'visit';
}

const SHORT_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'Mon, Nov 9', hand-parsed from the calendar date so no zone can move it a day. */
export function formatShortWeekday(dateOnly: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateOnly ?? '');
  if (!m) return '';
  const monthIdx = Number(m[2]) - 1;
  const day = Number(m[3]);
  if (monthIdx < 0 || monthIdx > 11 || day < 1 || day > 31) return '';
  const d = new Date(Number(m[1]), monthIdx, day);
  if (Number.isNaN(d.getTime()) || d.getMonth() !== monthIdx) return '';
  return `${SHORT_WEEKDAYS[d.getDay()]}, ${MONTHS[monthIdx]} ${day}`;
}

/**
 * The optional time, in the owner's zone, only when the stored instant falls on the record's
 * own day there. `contacted_at` is a UTC instant (C-10); a time that lands on another local day
 * (the record's day edited after the time was set) is not printed beside a day it contradicts.
 */
export function contactClock(visitedAt: string, contactedAt: string | null | undefined): string | null {
  if (!contactedAt) return null;
  const d = new Date(contactedAt);
  if (Number.isNaN(d.getTime())) return null;
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return key === visitedAt.slice(0, 10) ? formatClockTime(d) : null;
}

/** The contact's page header (D2, D3). */
export function contactPageHeader(
  petName: string,
  channel: RemoteChannel,
  visitedAt: string,
  contactedAt: string | null | undefined,
): { title: string; subtitle: string } {
  const day = formatShortWeekday(visitedAt);
  const clock = contactClock(visitedAt, contactedAt);
  const when = [day, clock].filter(Boolean).join(', ');
  return {
    title: `${petName}’s ${CONTACT_NOUN[channel]}`,
    subtitle: [CHANNEL_TAG[channel], when, 'no exam'].filter(Boolean).join(' · '),
  };
}

/** What a contact started, as the footnote names it: "the Motazol", "the diet trial". */
export function startedPhrase(started: {
  medications: ReadonlyArray<{ drugName: string }>;
  trials: ReadonlyArray<{ label: string }>;
}): string | null {
  const names = [
    ...started.medications.map((m) => m.drugName.trim()).filter(Boolean).map((n) => `the ${n}`),
    ...started.trials.map((t) => (t.label === 'Diet trial' ? 'the diet trial' : `the ${t.label} trial`)),
  ];
  if (names.length === 0) return null;
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * The page's footnote (spec §4.6, D2, D3). It names what reaches the report and what does not.
 * Nothing started: "and what it started" drops rather than naming nothing (D3). Nothing sent:
 * there are no screenshots to point at, so it closes on the fact the page exists to keep.
 */
export function contactFootnote(channel: RemoteChannel, started: string | null, hasDocuments: boolean): string {
  const shows = `Your vet report shows ${THIS_CONTACT[channel]}${started ? ` and ${started}` : ''}.`;
  return hasDocuments ? `${shows} Screenshots stay in Vet Files; share them from there.` : `${shows} No exam.`;
}

/** The contact page's honest empty line (D3), the visit page's `bare` sentence for a contact. */
export function contactBareLine(channel: RemoteChannel, hasClock: boolean): string {
  const noun = THIS_CONTACT[channel];
  const holds = hasClock ? 'a day and a time' : 'a day';
  const verb = channel === 'text' ? 'have' : 'has';
  return `${noun.charAt(0).toUpperCase()}${noun.slice(1)} ${verb} ${holds} so far. Add what the vet sent or started whenever you have it.`;
}

/** A course's source row (D5): "Started after a call with the vet, Nov 9" or "…a visit, Sep 16". */
// Takes a KNOWN channel only: a course whose source's channel this phone never learned draws no
// row, because "a visit" would claim an exam the record may not hold.
export function courseSourceLine(channel: VisitChannel, visitedAt: string, now: Date = new Date()): string {
  const date = formatVisitDate(visitedAt, now);
  return isRemoteChannel(channel)
    ? `Started after ${A_CONTACT[channel]} with the vet, ${date}`
    : `Started after a visit, ${date}`;
}

/** A course source this phone may name: its channel is known, and it speaks (`showsChannel`). */
export type ShownCourseSource = CourseVisitSource & { channel: VisitChannel };

/**
 * The medication page's source row (D5), or null. A source whose channel this phone never
 * learned draws no row: "Started after a visit" would claim an exam the record may not hold
 * (PR-06's product review). A call, text or email draws its row on every phone (CUL-2830); a
 * clinic source only while the switch is on, so a phone with no remote rows is unchanged.
 */
export function shownCourseSource(source: CourseVisitSource | null | undefined, featureOn: boolean): ShownCourseSource | null {
  if (!source || source.channel === null) return null;
  return showsChannel(featureOn, source.channel) ? { ...source, channel: source.channel } : null;
}

/** History's date-only row (D4): the title follows the channel; the detail ends on "no exam". */
export function historyContactText(
  channel: RemoteChannel,
  reason: string | null,
  where: string,
): { title: string; detail: string } {
  const parts = [reason, where].filter((s): s is string => !!s && s.trim().length > 0).map((s) => s.trim());
  return { title: HISTORY_TITLE[channel], detail: [...parts, 'no exam'].join(' · ') };
}

/** The filter line's phrase for a contact (`itemsOnlyLineText`): "Phone call with the vet, Ear, no exam". */
export function historyContactPhrase(channel: RemoteChannel, reason: string | null): string {
  const r = reason?.trim();
  return r ? `${HISTORY_TITLE[channel]}, ${r}, no exam` : `${HISTORY_TITLE[channel]}, no exam`;
}
