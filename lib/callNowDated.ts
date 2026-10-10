// A "Call your vet now" read after its first day (Engines v3 PR-30c, CUL-1739; PM ruling A,
// 2026-10-10; docs/nyx-incident-tiers-requirements.md §2 rule 1, "every call resolves against
// the clock", GAP-13).
//
// For its first 24 hours a new-rule call now says "now" on every surface. After that, Home's
// safety band, the cross-pet banner and the record's own card step to a DATED form that quotes
// the call with its day ("On Oct 3, the read said: call your vet now"). The card keeps the
// full 14-day window, its rose and its place on Home: only the claim that it is "now" goes.
//
// THE BOUNDARY IS 24 HOURS FROM THE READ'S INSTANT, never the local day. A local-day rule would
// date an 11:40 pm call twenty minutes later, which reads calmer than "call now" inside its
// first day. A 24-hour rule cannot. An instant the phone cannot parse, or one in the future
// (a skewed clock), keeps "now": the loud form is the failure mode, never the quiet one.
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
export function datedCallNowAsk(day: string): string {
  return `on ${day}, the read said: ${CALL_NOW_ASK}`;
}

/** The record card's action line under a dated call now. It still sends the owner to a vet,
 *  now, unless they have spoken to one since; it never says the call has passed. */
export const DATED_CALL_NOW_ACTION =
  "If you haven't spoken to your vet since, call them now. If they're closed, call an emergency clinic.";

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * The record card's words for a new-rule call now, or null while it is in its first day (and
 * whenever the instant cannot be read): then the card keeps the map's "Call your vet now" and
 * its action line. The record dates the read by the phone's LOCAL day, the day its own header
 * shows for the event; Home's Signal surfaces date in UTC, as their eyebrow already does.
 */
export function recordDatedCallNow(readIso: string | null | undefined, nowMs: number): { label: string; action: string } | null {
  if (!callNowIsDated(readIso, nowMs)) return null;
  const d = new Date(readIso as string);
  return { label: datedCallNowLabel(`${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`), action: DATED_CALL_NOW_ACTION };
}
