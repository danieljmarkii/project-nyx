// The outcome loop's pure model (Engines v3 PR-36, CUL-1419; docs/nyx-care-state-requirements.md
// §6). No storage, no clock: every function takes the rows and `now` it decides over, so the
// rules below are tested by driving them, not by re-deriving them (C-34).
//
// ── THE ESCALATION IS THE UNIT (§6.1) ────────────────────────────────────────────
// Until EN-4 builds the escalation record, a call attaches to the first call-tier read of a
// BOUT: the same pet and incident family (vomit, stool) within 24 hours of the bout's first
// read, never chained from the previous read. A read at a higher rung opens a new bout. So a
// later read is covered by a call when it falls inside the 24 hours that follow the called
// read and is no louder than it; three reads of one bout owe one follow-up (AC 10).
//
// STATED LIMIT (C-38): §6.1's second opener, a NEW REASON CLASS (blood, foreign material) at
// the same rung, is not seen here. The phone's copy of a read holds its tier and verdict and
// never its findings (event_ai_verdicts' four columns, by design), so a bloody read inside a
// called bout at the same rung shows "You called on …" rather than offering the call again.
// Its ask is untouched either way: a call never lowers or rewords an escalation (§6.1), so
// what this costs is a second follow-up, never a quieter screen. Filed on CUL-1419.
//
// ── THE FOLLOW-UP (§6.3) ─────────────────────────────────────────────────────────
// One per call, due 48 hours after "I've called", expiring 7 days after it, silently. The
// ledger is append-only and two phones can each write to it, so its state is decided by
// PRECEDENCE, never by which row is newest: an answer is final (the first one recorded
// stands, "answered once, across phones"), an Undo withdraws, and only then does the clock
// decide between waiting, due and expired. Expiry is DERIVED from `expires_at` and never
// written: two phones writing `expired` would race an answer given on a third, and a derived
// expiry cannot outrank one.

import { isStoolEvent } from '../constants/eventTypes';
import { type TierRank } from './incidentTier';
import { formatCalendarDate } from './utils';

/** How long after "I've called" the question is asked, and how long it stays asked (§6.3). */
export const FOLLOW_UP_DUE_MS = 48 * 60 * 60 * 1000;
export const FOLLOW_UP_EXPIRES_MS = 7 * 24 * 60 * 60 * 1000;
/** A bout's bound, measured from its first read (§6.1). */
export const BOUT_MS = 24 * 60 * 60 * 1000;
/** A note's bound on the phone. 082 holds 4,000 at rest; a CHECK failure is a terminal
 *  23514 that quarantines the row, so the field stops well short of it. */
export const CALL_NOTE_MAX = 2000;

export type IncidentFamily = 'vomit' | 'stool';

export function incidentFamilyOf(eventType: string | null | undefined): IncidentFamily | null {
  if (eventType === 'vomit') return 'vomit';
  if (isStoolEvent(eventType)) return 'stool';
  return null;
}

/** One call-tier read, as the phone holds it. `rank` comes from the one verdict reader
 *  (`callTierRankOf`, lib/vetCalls.ts, over `isWorthACall` and the tier-word map), so this
 *  module never reads a verdict itself (guards/readState.test.ts). */
export interface CallTierRead {
  eventId: string;
  family: IncidentFamily;
  /** The event's `occurred_at`, ISO. */
  occurredAt: string;
  /** TIER_RANK: call_today or call_now. A read below call_today is never a CallTierRead. */
  rank: TierRank;
}

function ms(iso: string): number {
  return new Date(iso).getTime();
}

/** Does a call made about `called` cover `read`? The same family, inside the 24 hours that
 *  follow the called read, and no louder than it (a louder read is a new bout, §6.1). */
export function callCovers(called: CallTierRead, read: CallTierRead): boolean {
  if (called.family !== read.family) return false;
  const gap = ms(read.occurredAt) - ms(called.occurredAt);
  if (!(gap >= 0 && gap <= BOUT_MS)) return false;
  return read.rank <= called.rank;
}

/**
 * The read "I've called" attaches to when the owner taps it on `tapped`: the earliest
 * call-tier read of the same family in the 24 hours before it that is at least as loud
 * (so the call covers `tapped` by `callCovers`), or `tapped` itself. Measured from the
 * tapped read only, so nothing chains.
 */
export function boutAnchorFor(tapped: CallTierRead, reads: readonly CallTierRead[]): CallTierRead {
  let anchor = tapped;
  for (const r of reads) {
    if (r.eventId === tapped.eventId) continue;
    if (!callCovers(r, tapped)) continue;
    if (ms(r.occurredAt) < ms(anchor.occurredAt)) anchor = r;
  }
  return anchor;
}

// ── The call record ─────────────────────────────────────────────────────────────

/** A `vet_calls` row as the phone holds it. */
export interface VetCallRow {
  id: string;
  pet_id: string;
  called_on: string;
  event_id: string;
  note: string | null;
  supersedes: string | null;
  withdrawn: number | boolean;
  created_at: string;
}

/** A `vet_call_follow_ups` row as the phone holds it. */
export interface FollowUpRow {
  id: string;
  pet_id: string;
  vet_call_id: string | null;
  event_id: string;
  reason: string;
  status: string;
  answer: string | null;
  worth_it: string | null;
  due_at: string;
  expires_at: string;
  created_at: string;
}

/** One call as an owner sees it: the root row, its latest note, and whether it was undone.
 *  Every later row (an edited note, an Undo) names the ROOT in `supersedes`, never the row
 *  before it, so a call's history is one level deep and two phones cannot fork a chain. */
export interface CallRecord {
  id: string;
  petId: string;
  calledOn: string;
  eventId: string;
  note: string | null;
  withdrawn: boolean;
}

function truthy(v: number | boolean): boolean {
  return v === true || v === 1;
}

export function callRecordsOf(rows: readonly VetCallRow[]): CallRecord[] {
  const roots = rows.filter((r) => r.supersedes === null);
  return roots.map((root) => {
    const later = rows.filter((r) => r.supersedes === root.id);
    const withdrawn = later.some((r) => truthy(r.withdrawn));
    const edits = [root, ...later.filter((r) => !truthy(r.withdrawn))].sort(
      (a, b) => ms(a.created_at) - ms(b.created_at),
    );
    const latest = edits[edits.length - 1];
    return {
      id: root.id,
      petId: root.pet_id,
      calledOn: root.called_on,
      eventId: root.event_id,
      note: latest.note,
      withdrawn,
    };
  });
}

export const FOLLOW_UP_ANSWERS = [
  'wants_to_see',
  'started_treatment',
  'keep_watching',
  'something_else',
  'could_not_reach',
] as const;
export type FollowUpAnswer = (typeof FOLLOW_UP_ANSWERS)[number];

export const WORTH_IT_ANSWERS = ['yes', 'no', 'did_not_say'] as const;
export type WorthIt = (typeof WORTH_IT_ANSWERS)[number];

export type FollowUpState =
  | { kind: 'none' }
  | { kind: 'withdrawn' }
  | { kind: 'answered'; answer: FollowUpAnswer; worthIt: WorthIt | null }
  | { kind: 'waiting'; dueAt: string; expiresAt: string }
  | { kind: 'due'; dueAt: string; expiresAt: string }
  | { kind: 'expired'; expiresAt: string };

function isAnswer(v: string | null): v is FollowUpAnswer {
  return v !== null && (FOLLOW_UP_ANSWERS as readonly string[]).includes(v);
}
function isWorthIt(v: string | null): v is WorthIt {
  return v !== null && (WORTH_IT_ANSWERS as readonly string[]).includes(v);
}

/** The follow-up for one call, by precedence (header). `rows` may hold other calls' rows. */
export function followUpStateOf(
  call: CallRecord,
  rows: readonly FollowUpRow[],
  now: number,
): FollowUpState {
  const mine = rows.filter((r) => r.vet_call_id === call.id);
  const answered = mine
    .filter((r) => r.status === 'answered' && isAnswer(r.answer))
    .sort((a, b) => ms(a.created_at) - ms(b.created_at));
  if (answered.length > 0) {
    const first = answered[0];
    return { kind: 'answered', answer: first.answer as FollowUpAnswer, worthIt: isWorthIt(first.worth_it) ? first.worth_it : null };
  }
  if (call.withdrawn || mine.some((r) => r.status === 'withdrawn')) return { kind: 'withdrawn' };
  const owed = mine.find((r) => r.status === 'owed');
  if (!owed) return { kind: 'none' };
  if (now >= ms(owed.expires_at)) return { kind: 'expired', expiresAt: owed.expires_at };
  if (now >= ms(owed.due_at)) return { kind: 'due', dueAt: owed.due_at, expiresAt: owed.expires_at };
  return { kind: 'waiting', dueAt: owed.due_at, expiresAt: owed.expires_at };
}

/** The owed row's two instants for a call answered at `calledAtMs`. */
export function followUpWindow(calledAtMs: number): { dueAt: string; expiresAt: string } {
  return {
    dueAt: new Date(calledAtMs + FOLLOW_UP_DUE_MS).toISOString(),
    expiresAt: new Date(calledAtMs + FOLLOW_UP_EXPIRES_MS).toISOString(),
  };
}

// ── Owner words (nyx-voice; spec §6.2–§6.4, mock round 3 §04) ───────────────────
// Never "acknowledged", "seen", "resolved", "watching" or "stood down" (§0.2 call 1, AC 19),
// never a weekday the app cannot promise (AC 11), and no answer reads as "he's fine" (§6.3).

export const CALL_ANSWER_CALLED = "I've called";
export const CALL_ANSWER_NOT_YET = 'Not yet';
export const FOLLOW_UP_TITLE = 'What did the vet say?';
export const FOLLOW_UP_WORTH_IT_QUESTION = 'Did your vet think it was worth the call?';
export const CALL_ADD_NOTE = 'Add a note';
export const CALL_EDIT_NOTE = 'Edit the note';
export const CALL_NOTE_HINT = 'Only you see this. Nothing in the app reads it.';
export const FOLLOW_UP_NOT_RECORDED = 'Not recorded.';
export const FOLLOW_UP_ADD_IT = 'Add it';
/** The notification's body names no record fact (G1/D3, AC 11). */
export function followUpNotificationBody(petName: string | null): string {
  return petName ? `A question about ${petName}` : 'A question about your pet';
}
/** The notification's title. Neutral: the body carries the pet, never the sign or the call. */
export const FOLLOW_UP_NOTIFICATION_TITLE = 'Culprit';

/** "{Mon d}" for a local day, with the year when it is not this year's. */
export function callDay(day: string, today: string): string {
  const base = formatCalendarDate(day) ?? day;
  return day.slice(0, 4) === today.slice(0, 4) ? base : `${base}, ${day.slice(0, 4)}`;
}

export function calledOnLine(day: string, today: string): string {
  return `You called on ${callDay(day, today)}.`;
}

/** The confirmation after "I've called" (mock 4a). It never names a day the question will
 *  come (AC 11): with the notification on, a reminder; without it, where the question waits. */
export function callConfirmation(input: { notificationsOn: boolean }): string {
  return input.notificationsOn
    ? "Saved. We'll send a reminder in a couple of days to ask what the vet said."
    : "Saved. In a couple of days, this screen and Vet visits will ask what the vet said.";
}

/** The Home / screen navigation line once the follow-up is due (§6.3, mock 4b). */
export function followUpDueLine(day: string, today: string): string {
  return `${calledOnLine(day, today)} ${FOLLOW_UP_TITLE}`;
}

export const FOLLOW_UP_ANSWER_LABEL: Record<FollowUpAnswer, (pronoun: string) => string> = {
  wants_to_see: (p) => `Wants to see ${p}`,
  started_treatment: () => 'Started a treatment',
  // The stored key is 082's; the words avoid "watching", which the Signal already uses for
  // "still needs data" (§0.2 call 1, AC 19). The vet's instruction, in the owner's words.
  keep_watching: (p) => `Keep an eye on ${p}`,
  something_else: () => 'It was something else',
  could_not_reach: () => "Couldn't reach them",
};

export const WORTH_IT_LABEL: Record<WorthIt, string> = {
  yes: 'Yes',
  no: 'No',
  did_not_say: "Didn't say",
};

/** The recorded answer, as the call record states it. A fact the owner gave, in her words. */
export function answeredLine(answer: FollowUpAnswer, pronoun: string): string {
  return `You said: ${FOLLOW_UP_ANSWER_LABEL[answer](pronoun)}.`;
}
