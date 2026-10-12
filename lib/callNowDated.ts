// A "Call your vet now" read after its first day (Engines v3 PR-30c, CUL-1739; PM ruling A,
// 2026-10-10; docs/nyx-incident-tiers-requirements.md §2 rule 1, "every call resolves against
// the clock", GAP-13).
//
// For its first 24 hours a new-rule call now says "now" on every surface. After that, Home's
// safety band, the cross-pet banner and the record's own card step to a DATED form that quotes
// the call with its day ("On Oct 3, the read said: call your vet now"). The card keeps the
// full 14-day window, its rose and its place on Home: only the claim that it is "now" goes.
//
// THE BOUNDARY IS 24 HOURS FROM WHEN THE CALL WAS SAID, never the local day. "Said" is the later
// of the event's occurred_at and the read row's last write (PM ruling 1a, 2026-10-10): a call
// raised a day after its event (a re-floor when lethargy is logged, a late sync, a backdated log)
// gets its own full day of "now" from when it first appears, and is dated by that day, so the
// dated form never excuses an owner who called before the sign that raised it. A rewrite for any
// other reason (an owner's edit, a failed re-read) restarts the day: the loud direction. Home
// reads the instant from generate-signal (`tierReadIso`); the record from its own row. A local-day
// rule would date an 11:40 pm call twenty minutes later, which reads calmer than "call now" inside
// its first day. A 24-hour rule cannot. An instant the phone cannot parse, a missing one, or one
// in the future (a skewed clock) keeps "now": the loud form is the failure mode, never the quiet one.
//
// The words are built from the tier-word map's own label (`TIER_WORDS.call_now`), never
// restated, so the dated form can never drift from what the read said.

import { TIER_WORDS } from './incidentTierWords';

/** How long a call now says "now": the read's first day. */
export const CALL_NOW_FIRST_DAY_MS = 24 * 60 * 60 * 1000;

/** True once a call-now read is a full day old, measured from its own instant. False on an
 *  instant or clock the phone cannot read, and on a read in the future. */
export function callNowIsDated(readIso: string | null | undefined, nowMs: number): boolean {
  if (typeof readIso !== 'string' || !Number.isFinite(nowMs)) return false;
  const readMs = Date.parse(readIso);
  if (!Number.isFinite(readMs)) return false;
  return nowMs - readMs >= CALL_NOW_FIRST_DAY_MS;
}

/** The call's own words lower-cased mid-sentence: "call your vet now". */
export const CALL_NOW_ASK = TIER_WORDS.call_now.label.charAt(0).toLowerCase() + TIER_WORDS.call_now.label.slice(1);

/** "On Oct 3, the read said: call your vet now" (no full stop; the caller places it). */
export function datedCallNowLabel(day: string): string {
  return `On ${day}, the read said: ${CALL_NOW_ASK}`;
}

/** The dated form lower-cased at its head, for a sentence that already began
 *  ("…. on Oct 3, the read said: call your vet now"). */
export function datedCallNowAsk(day: string, read: 'the read' | 'a read'): string {
  return `on ${day}, ${read} said: ${CALL_NOW_ASK}`;
}

/** The record card's action line under a dated call now. It still sends the owner to a vet,
 *  now, unless they have spoken to one since; it never says the call has passed. */
export const DATED_CALL_NOW_ACTION =
  "If you haven't spoken to your vet since, call them now. If they're closed, call an emergency clinic.";

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** The phone's LOCAL day of an instant, short ("Oct 9") and long ("October 9"), or null. Every
 *  dated form uses the local day (the second adversarial pass): a UTC day east of Greenwich can
 *  print the day BEFORE the owner was told, and "if you haven't spoken to your vet since" would
 *  then excuse a call made before the read. Home's eyebrow keeps its UTC photo day. */
export function localCallDay(iso: string): { short: string; long: string } | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return { short: `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`, long: `${MONTH_LONG[d.getMonth()]} ${d.getDate()}` };
}

/** The later of two instants, as the ISO string that holds it; null when either cannot be read
 *  (then nothing is dated: the loud form). Parsed, never compared as text (C-40). */
export function callNowSaidAt(eventIso: string | null | undefined, writtenIso: string | null | undefined): string | null {
  if (typeof eventIso !== 'string' || typeof writtenIso !== 'string') return null;
  const e = Date.parse(eventIso);
  const w = Date.parse(writtenIso);
  if (!Number.isFinite(e) || !Number.isFinite(w)) return null;
  return w > e ? writtenIso : eventIso;
}

/**
 * The record card's words for a new-rule call now, or null while it is in its first day (and
 * whenever either instant cannot be read): then the card keeps the map's "Call your vet now" and
 * its action line. The day is when the call was said (`callNowSaidAt`), by the phone's LOCAL day,
 * as the record's own header dates the event; as every dated form does (`localCallDay`).
 */
export function recordDatedCallNow(
  eventIso: string | null | undefined,
  writtenIso: string | null | undefined,
  nowMs: number,
): { label: string; action: string } | null {
  const said = callNowSaidAt(eventIso, writtenIso);
  if (said === null || !callNowIsDated(said, nowMs)) return null;
  const day = localCallDay(said);
  return day ? { label: datedCallNowLabel(day.short), action: DATED_CALL_NOW_ACTION } : null;
}
