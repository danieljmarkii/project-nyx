// Vet contacts PR-05 (CUL-2767; docs/nyx-vet-contacts-requirements.md §4.3, §4.4; mock §C).
//
// The words of "What did the vet say?" and of the saved moment after a call, text or email.
// Pure: no I/O, no flag. The route decides whether the feature is on and hands a channel only
// then, so the flag-off screen never reaches this module.
//
// THE SAVED MOMENT IS THE CLINICAL HALF (C4). A green check after "she's barely eaten" read as
// handled (Sam, blocking). So the check is earned by the ABSENCE of anything open: no live
// warning for the pet and no watched sign from this contact. Either one, and the mark is
// neutral, the copy says Home is unchanged, and the safety line stands under it. An unread
// Signal cache is not an absence (C-12): it takes the neutral moment, the louder of the two.
import { CHANNEL_TAG, formatShortWeekday, type RemoteChannel } from './vetContacts';
import type { SignalCacheRow } from './signal';
import type { LinkedLine, VisitSaveSummary } from './vetVisitPlan';
import { VISIT_OFFLINE_LINE } from './vetVisitPlan';
import { FLOOR_ASK } from './incidentAskWords';

/** The screen's title on a remote contact (§4.3). A visit keeps *How did it go?*. */
export const CONTACT_AFTER_TITLE = 'What did the vet say?';

/** The plan's door for a course, renamed on this screen only (§4.3, Jordan's supplement). */
export const START_COURSE_TITLE = 'Start a medicine or supplement';

/** The section that leads the screen: the shipped *Paperwork*, renamed and moved first. */
export const WHAT_THE_VET_SENT = 'What the vet sent';

/** The eyebrow over the title (C1): "Phone · Mon, Nov 9 · Ear". */
export function contactAfterEyebrow(channel: RemoteChannel, visitedAt: string, reason: string | null): string {
  return [CHANNEL_TAG[channel], formatShortWeekday(visitedAt), reason?.trim()]
    .filter((s): s is string => !!s && s.length > 0)
    .join(' · ');
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function monthDay(dayKey: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!m) return '';
  const idx = Number(m[2]) - 1;
  return idx >= 0 && idx < 12 ? `${MONTHS[idx]} ${Number(m[3])}` : '';
}

/**
 * The trial's *Keep going until* line (C2). Before a change it names the current end alone;
 * after one it names the old end too ("was Nov 23"), because that is the day the owner had been
 * counting toward. Null when the end day is unreadable: no date is printed that the record
 * does not hold.
 */
export function keepGoingLine(endDayKey: string | null, wasDayKey: string | null = null): string | null {
  const end = endDayKey ? formatShortWeekday(endDayKey) : '';
  if (!end) return null;
  const was = wasDayKey && wasDayKey !== endDayKey ? monthDay(wasDayKey) : '';
  return was ? `Keep going until ${end} · was ${was}` : `Keep going until ${end}`;
}

/** The line for a trial whose end is already behind today: it ran its window, and "keep going
 *  until" a past day would read wrong. */
export function trialEndPassedLine(endDayKey: string): string | null {
  const end = formatShortWeekday(endDayKey);
  return end ? `The trial’s window ended ${end}` : null;
}

/**
 * Is a warning live for this pet in its cached Signal (§4.4)? Read only, no engine read.
 *
 * "Live warning" is any SAFETY-class card in the cache: a concern, an intake decline, an
 * incident red flag, burden or chronicity. The spec's "a call or visit rung, or an intake card"
 * is every safety card the Signal draws, and taking the whole class rather than re-deriving
 * rungs here means a new safety lane is covered the day it ships (C-34: one predicate, not a
 * mirror). The stand-down marker is insight-class and never counts.
 *
 * `'unread'` (the read threw and nothing answered before) counts as live: an unanswered read
 * is not an empty record (C-12), and the neutral moment is the louder answer.
 */
export function hasLiveWarning(cache: SignalCacheRow | null | 'unread'): boolean {
  if (cache === 'unread') return true;
  if (!cache) return false;
  return cache.findings.some((f) => f.finding.priorityClass === 'safety');
}

const THIS_CONTACT: Record<RemoteChannel, string> = { phone: 'this call', text: 'these texts', email: 'this email' };

/** "this call", "these texts", "this email": where a plan row says what it is linked to. */
export function thisContact(channel: RemoteChannel): string {
  return THIS_CONTACT[channel];
}

const SAVED_NOUN: Record<RemoteChannel, string> = { phone: 'call is', text: 'texts are', email: 'email is' };
const VERB: Record<RemoteChannel, string> = { phone: 'called', text: 'texted', email: 'emailed' };
const REPORT_AS: Record<RemoteChannel, string> = {
  phone: 'as a phone call',
  text: 'as texts with the vet',
  email: 'as an email',
};

/**
 * The safety line under a neutral moment. The Vet instructions spec's species lines are not
 * in this build yet; until they land this is its ratified species-neutral line (mock round 3,
 * frame 17), so every pet gets a line that is true for every species. Split in two so the
 * first sentence can carry the title weight the mock gives it.
 */
export function contactSafetyLine(petName: string, alsoNames: readonly string[] = []): { lead: string; rest: string } {
  // Every pet the contact was about, so *Also about Juniper* never leaves Juniper out (B3).
  const names = [petName, ...alsoNames];
  const who = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;
  // The floor's own words (`lib/incidentAskWords.ts`): no surface mints its own floor.
  return { lead: `If ${who} is worse, don’t wait.`, rest: `${FLOOR_ASK.label}.` };
}

export interface ContactSaveSummary extends VisitSaveSummary {
  /** 'check' only when nothing is open (C5); 'neutral' otherwise (C4). */
  mark: 'check' | 'neutral';
  safety: { lead: string; rest: string } | null;
}

/**
 * The saved moment for a call, text or email (C4, C5).
 *
 * NEVER "handled", "done" or "all set" (AC 12): those are claims about the pet, and a contact
 * asserts nothing about the pet (§6.1). *Done* is the button's word for leaving the screen.
 */
export function describeContactSave(args: {
  petName: string;
  channel: RemoteChannel;
  liveWarning: boolean;
  /** A sign this contact asked the owner to watch (Vet instructions R4). Always false until
   *  that project's row is wired here (whichever of the two merges second). */
  watchedSign: boolean;
  linked: LinkedLine[];
  /** The other pets the contact was about (*Also about*). */
  alsoNames?: readonly string[];
}): ContactSaveSummary {
  const { petName, channel } = args;
  // The plan's lines were written as a visit's ("linked to this visit"); a contact's say what
  // the record is.
  const linked = args.linked.map((l) =>
    l.note === 'linked to this visit' ? { ...l, note: `linked to ${THIS_CONTACT[channel]}` } : l,
  );
  const open = args.liveWarning || args.watchedSign;
  const heading = `${petName}’s ${SAVED_NOUN[channel]} saved`;
  if (open) {
    return {
      heading,
      mark: 'neutral',
      reportLine: `Nothing on Home changes because you ${VERB[channel]}.`,
      homeLine: null,
      safety: contactSafetyLine(petName, args.alsoNames ?? []),
      linked,
      offlineLine: VISIT_OFFLINE_LINE,
    };
  }
  return {
    heading,
    mark: 'check',
    reportLine: `It goes on ${petName}’s vet report ${REPORT_AS[channel]}. No exam.`,
    homeLine: null,
    safety: null,
    linked,
    offlineLine: VISIT_OFFLINE_LINE,
  };
}

/** The line under *Done* on a contact: it already exists, so everything typed is kept. */
export function contactLeaveNote(channel: RemoteChannel): string {
  return `Leave any time. What you typed stays on ${THIS_CONTACT[channel]}.`;
}
