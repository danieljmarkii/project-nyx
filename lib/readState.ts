// The per-incident read's state, ONE predicate for every surface that shows it
// (History v2 §5.4, HV-5 / CUL-1162).
//
// Home's spine, the Patterns month, the Signal screen and History each used to decide
// for themselves what a photographed vomit or stool's read said, off a server fetch
// each of them issued. Offline they had nothing, so the month drew every photographed
// day as seen and Home drew no verdict at all; Home also dropped the verdict when the
// owner hid the read, while the month and the Signal screen ignored the hide. Four
// readers, three answers. This module is the one answer, and it reads the PHONE'S
// COPY of the verdict (`lib/readCopy.ts`, §5.3), so it never waits on the network.
// `guards/readState.test.ts` reds on any other file reading the verdict.
//
// ── THE STATES, IN PRECEDENCE ORDER ──────────────────────────────────────────
//   1. worth_a_call: the copy holds `worth_a_call` at ANY status, or a verdict the
//      app does not recognise. Presence escalates, so nothing later in this list can
//      silence it: not a read in flight, not a failed re-read (CUL-812, through the
//      shipped `escalationSurvivesFailure`), not the owner turning photo reading off.
//      An unknown verdict is not calm until someone says it is (CUL-1133 will add
//      verdicts before every build knows them).
//   2. pending: a read is being produced (the analysis chain is outstanding, C-30),
//      or the row itself says `pending`. It outranks a calm verdict ON PURPOSE: a
//      calm verdict beside a read in flight may describe a photo the owner has since
//      replaced, and standing it in front of the new one is reassurance about an image
//      nothing has read (CUL-812's reasoning, applied to the wait as well as the
//      failure).
//   3. calm: a FINISHED read that said `monitor`. It stands whether or not this device
//      holds the photo: a photoless stool's contextual read is still the record's read
//      (B-363 is the record screen's business, not this predicate's).
//   4. none: no read is expected (the type has no per-incident read, or there is no
//      photo) and no read above applies.
//   5. off: a read was expected but the owner turned photo reading off (CUL-552,
//      HV-18). The owner's choice is not a missing read, so it is never marked (H-4b).
//   6. unread: a read was expected and none completed a check: it failed, it was never
//      sent, it hit the day's cap, the phone holds no copy, OR it finished saying
//      `not_enough_to_say` (status `uncertain`, migration 013: "the photo is unclear or
//      does not appear to show vomit"). Never calm, because absence is never wellness
//      (the n=1 rule); the shared day row draws it as a grey *Photo not read*.
//
// ── `not_enough_to_say` IS NOT CALM (PM ruling, 2026-09-25, HV-6 / CUL-1163) ─────
// HV-5 shipped the unclear read as calm, which the day row draws as NOTHING, exactly what
// it draws for a photo that was read and found nothing to flag. So an unreadable photo
// looked like a read one, which is the one thing H-4b forbids. It is now `unread` on a row
// whose photo this phone holds, and nothing on one that has none (a photoless stool's
// contextual read collapses to `not_enough_to_say` too, and "Photo not read" under a row
// with no photo would be false). The finished verdict still RIDES on `verdict`, so a
// surface that speaks the record's words (the Signal gallery) keeps saying *Not enough
// to say yet* rather than *No read yet*: each surface says the most specific true thing.
//
// ── WHAT IS NOT AN INPUT ─────────────────────────────────────────────────────
// Dismissal. Hide hides the read's WORDS on the record (H-4a); it never stands the
// rose down. `ReadCopy` has no field for it, so no caller can pass it in. The one act
// that will stand the rose down is the owner's "No, it's something else" (CUL-1107):
// when it ships, its field joins the copy and this function, and every surface
// follows at once.
//
// Imports nothing that touches a database or the network, so a component test can run
// the REAL predicate (the `lib/incidentReadState.ts` precedent: a predicate that has to
// be mocked away is a predicate two test files end up re-typing).

import { hasPerIncidentRead } from '../constants/eventTypes';
import { escalationSurvivesFailure, type IncidentRecommendation } from './incidentReadState';

/**
 * What the phone's copy holds for one event's read that can decide a state: two of
 * `event_ai_analysis`'s columns. Never `read_text` (the surfaces show no words) and
 * never `dismissed_at` (Hide never touches the rose); neither exists on this type, so
 * neither can be read through it.
 */
export interface ReadCopy {
  /** The pipeline's status: `completed`, `uncertain`, `failed`, `capped`,
   *  `read_disabled` or `pending`. Text, not a union: a status this build does not know
   *  is simply not a finished read. */
  status: string;
  /** The `ai_recommendation` enum, or null when no read produced one. Text for the same
   *  reason: a value this build does not know fails toward the rose, never a throw. */
  recommendation: string | null;
}

/** One row of the copy (`event_ai_verdicts`): the deciding pair, its key, and the
 *  server's change time, which is both the pull's watermark and the last write wins
 *  key. Four columns, and that is the whole of what the phone keeps. */
export interface ReadCopyRow extends ReadCopy {
  event_id: string;
  updated_at: string;
}

export type ReadState = 'worth_a_call' | 'calm' | 'pending' | 'unread' | 'off' | 'none';

export interface ReadStateInput {
  /** The event's type as the record holds it. Decides whether a read is expected. */
  eventType: string | null | undefined;
  /** Whether this device holds a photo for the event. */
  hasPhoto: boolean;
  /** The phone's copy for the event, or nothing when it holds none. */
  copy: ReadCopy | null | undefined;
  /** A read is being produced right now (`analysisChainOutstanding`, C-30). */
  inFlight: boolean;
  /** The owner turned photo reading off. Always false until CUL-552 ships (HV-18). */
  readingOff: boolean;
}

/** The verdicts that are NOT the rose, as an ALLOWLIST: any other non-null value fails
 *  toward the rose. Two of them, and only one is calm (`CalmVerdict`). */
export type QuietVerdict = 'monitor' | 'not_enough_to_say';
const QUIET_VERDICT_LIST: readonly QuietVerdict[] = ['monitor', 'not_enough_to_say'];
const QUIET_VERDICTS: readonly string[] = QUIET_VERDICT_LIST;

/** The one verdict that stands as a calm read: the read looked and said to keep an eye out.
 *  `not_enough_to_say` is quiet (never the rose) but never calm (the PM's 2026-09-25 ruling). */
export type CalmVerdict = 'monitor';

/** The statuses under which a finished verdict STANDS: a read that finished. */
const FINISHED_STATUSES: readonly string[] = ['completed', 'uncertain'];

function isQuietVerdict(value: string): value is QuietVerdict {
  return QUIET_VERDICTS.includes(value);
}

/**
 * The rose, decided on the copy alone. Exported because it is the whole of the month's
 * question (is this photographed day worth a call?), and `readStateOf` is built on it,
 * so the two cannot disagree (`lib/readState.test.ts` holds them equal over every
 * input it can build).
 */
export function isWorthACall(copy: ReadCopy | null | undefined): boolean {
  const verdict = copy?.recommendation;
  if (verdict === null || verdict === undefined) return false;
  // The shipped escalation survives whatever the status says (CUL-812)...
  if (escalationSurvivesFailure(copy)) return true;
  // ...and a verdict this build does not recognise is not calm until someone says it is.
  return !isQuietVerdict(verdict);
}

/** The quiet verdict a FINISHED read stands on, or null (no read, a read in flight, a
 *  read that failed or was capped, or the rose). */
function finishedQuietOf(copy: ReadCopy | null | undefined): QuietVerdict | null {
  const verdict = copy?.recommendation;
  if (verdict === null || verdict === undefined || !isQuietVerdict(verdict)) return null;
  return FINISHED_STATUSES.includes(copy?.status ?? '') ? verdict : null;
}

export interface ReadVerdict {
  state: ReadState;
  /**
   * The verdict a surface that still speaks WORDS may name, or null. `worth_a_call` for
   * the rose whatever the stored value was (an unknown verdict is spoken in the rose's
   * words); `monitor` for `calm`; `not_enough_to_say` when a finished read said so (its
   * state is `unread`, `none` or `off`, never `calm`); null for everything else, a read
   * in flight included.
   */
  verdict: IncidentRecommendation | null;
}

/** The state, with the verdict a word-speaking surface may name (the Signal gallery).
 *  The shared day row speaks no verdict words since HV-6: it draws the state. */
export function readVerdictOf(input: ReadStateInput): ReadVerdict {
  if (isWorthACall(input.copy)) return { state: 'worth_a_call', verdict: 'worth_a_call' };
  if (input.inFlight || input.copy?.status === 'pending') return { state: 'pending', verdict: null };
  const finished = finishedQuietOf(input.copy);
  if (finished === 'monitor') return { state: 'calm', verdict: finished };
  // From here the photo was not checked: no read finished, or it finished unable to say.
  if (!input.hasPhoto || !hasPerIncidentRead(input.eventType)) return { state: 'none', verdict: finished };
  if (input.readingOff) return { state: 'off', verdict: finished };
  return { state: 'unread', verdict: finished };
}

/** The read's state, as §5.4's table defines it. */
export function readStateOf(input: ReadStateInput): ReadState {
  return readVerdictOf(input).state;
}
