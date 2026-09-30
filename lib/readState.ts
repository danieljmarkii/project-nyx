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
//   3. calm: a FINISHED read that said `monitor`, over the photos this phone holds. It
//      stands whether or not this device holds the photo: a photoless stool's contextual
//      read is still the record's read (B-363 is the record screen's business, not this
//      predicate's). A read whose stamped photo set does not include the photo this
//      phone shows (`photoSetStale`, Engines v3 PR-12) is not calm: see below.
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
// ── A READ OF PHOTOS THAT ARE GONE (Engines v3 PR-12, CUL-1267 / CUL-1201 part 1) ─
// Since migration 075 the server stamps each read with the photos present when its words
// were written (`photo_set_key`). `lib/readCopy.ts` says `photoSetStale` when the photo
// this phone shows is not among them: the owner replaced or added the photo and no read of
// it has landed (it failed, hit the cap, or has not run yet). The
// stored words describe an image that is gone, so a QUIET verdict on them stops standing:
// a calm read becomes `unread` (the grey *Photo not read*), and a stale verdict never rides
// on `verdict` either, so the Signal gallery stops saying *keep an eye on* about a photo
// nothing read. It is a demotion only. The rose is decided first and never reads the flag,
// because an escalation stands across photo swaps (CUL-1201 part 2): presence carries
// across, and absence on a later photo is not wellness. A read in flight still outranks it.
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
import {
  escalationSurvivesFailure,
  FINISHED_READ_STATUSES,
  type IncidentRecommendation,
} from './incidentReadState';
import { isQuietVerdict, type QuietVerdict } from './incidentVerdict';
import { tierDisplayOf, type TierDisplay } from './incidentTierWords';

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
  /** The photo this phone shows is not in the copy's stamped photo set, so a quiet
   *  verdict does not speak for it (Engines v3 PR-12). Computed by `readCopies`,
   *  never stored. Absent reads as false: a row written before the stamps, or a copy
   *  built by a caller that did not compare, keeps today's behaviour. */
  photoSetStale?: boolean;
  /** EN-3's tier (migration 079), mirrored by the copy; NULL / absent on an earlier-rule
   *  read. Decides the words through the tier-word map, and the rose on the same max as
   *  the record (`effectiveTierRank`): a call in either column is the rose. */
  tier?: string | null;
  /** The Engines keys the read was written under, the copy's JSON text. Decides whether a
   *  row speaks its tier's words or the shipped ones (`isTieredRow`). */
  engine_flags?: string | null;
}

/** One row of the copy (`event_ai_verdicts`): the deciding pair, its key, the server's
 *  change time (both the pull's watermark and the last write wins key), and the three
 *  read stamps (migration 075). Seven columns, and that is the whole of what the phone
 *  keeps. The stamps are NULL on a read written before they existed. */
export interface ReadCopyRow extends ReadCopy {
  event_id: string;
  updated_at: string;
  /** The event's attachment ids when the words were written, sorted and comma-joined, or
   *  their SHA-256 past 4,000 characters; NULL when the event had no photo. */
  photo_set_key: string | null;
  /** Which floor rules produced the verdict (`f1.vomit1`). */
  rule_version: string | null;
  /** The Engines keys on for this write, as a JSON array; NULL before the stamps. */
  engine_flags: string | null;
  /** The read's tier (EN-3), NULL on an earlier-rule read. */
  tier: string | null;
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

// The verdicts that are NOT the rose are an ALLOWLIST, `QUIET_VERDICTS` in
// `lib/incidentVerdict.ts`: any other non-null value fails toward the rose. It is the same
// list the record screen and the server's escalation guards read (CUL-1277), so no surface
// can call a verdict quiet that another calls an escalation. Two of them, and only one is
// calm (`CalmVerdict`).

/** The one verdict that stands as a calm read: the read looked and said to keep an eye out.
 *  `not_enough_to_say` is quiet (never the rose) but never calm (the PM's 2026-09-25 ruling). */
export type CalmVerdict = 'monitor';

// The statuses under which a finished verdict STANDS are `FINISHED_READ_STATUSES`
// (lib/incidentReadState.ts), the list the record sections read too (CUL-1277), so the
// record and this predicate cannot disagree about a status nobody has defined yet.

/**
 * The rose, decided on the copy alone. Exported because it is the whole of the month's
 * question (is this photographed day worth a call?), and `readStateOf` is built on it,
 * so the two cannot disagree (`lib/readState.test.ts` holds them equal over every
 * input it can build).
 */
export function isWorthACall(copy: ReadCopy | null | undefined): boolean {
  // An escalation survives whatever the status says (CUL-812), and a verdict this build
  // does not recognise is one: not calm until someone puts it on the quiet list. Since
  // CUL-1277 that is the SAME rule the record screen's rescue runs, so the record and
  // every surface built on this predicate cannot disagree about a failed re-read.
  return escalationSurvivesFailure(copy);
}

/** The quiet verdict a FINISHED read stands on, or null (no read, a read in flight, a
 *  read that failed or was capped, or the rose). */
function finishedQuietOf(copy: ReadCopy | null | undefined): QuietVerdict | null {
  // A quiet verdict over photos that are gone describes nothing on screen (the header's
  // PR-12 section). Only the quiet half reads this; the rose is decided before it.
  if (copy?.photoSetStale === true) return null;
  const verdict = copy?.recommendation;
  if (verdict === null || verdict === undefined || !isQuietVerdict(verdict)) return null;
  return FINISHED_READ_STATUSES.includes(copy?.status ?? '') ? verdict : null;
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
  /**
   * The words that stand, through the tier-word map (EN-3, `lib/incidentTierWords.ts`):
   * `call_now` / `call_today` / `logged` / `not_enough_to_say` on a new-rule read, the
   * shipped `worth_a_call` / `monitor` / `not_enough_to_say` on an earlier-rule one (and
   * `worth_a_call` for any value this build does not know). Null exactly where `verdict`
   * is null, so a surface that switches to it inherits every demotion above.
   */
  display: TierDisplay | null;
}

/** The state, with the verdict a word-speaking surface may name (the Signal gallery).
 *  The shared day row speaks no verdict words since HV-6: it draws the state. */
export function readVerdictOf(input: ReadStateInput): ReadVerdict {
  if (isWorthACall(input.copy)) {
    return { state: 'worth_a_call', verdict: 'worth_a_call', display: tierDisplayOf(input.copy) ?? 'worth_a_call' };
  }
  if (input.inFlight || input.copy?.status === 'pending') return { state: 'pending', verdict: null, display: null };
  const finished = finishedQuietOf(input.copy);
  // The words for a finished quiet read, through the map; null wherever `finished` is.
  const display = finished === null ? null : tierDisplayOf(input.copy);
  if (finished === 'monitor' && display !== 'not_enough_to_say') return { state: 'calm', verdict: finished, display };
  // A tier that says it could not read, beside a `monitor`, is not calm (the map's rule: the
  // less calm quiet column wins), and is spoken as the not-enough verdict.
  const quiet = finished === null ? null : display === 'not_enough_to_say' ? 'not_enough_to_say' : finished;
  // From here the photo was not checked: no read finished, or it finished unable to say.
  if (!input.hasPhoto || !hasPerIncidentRead(input.eventType)) return { state: 'none', verdict: quiet, display };
  if (input.readingOff) return { state: 'off', verdict: quiet, display };
  return { state: 'unread', verdict: quiet, display };
}

/** The read's state, as §5.4's table defines it. */
export function readStateOf(input: ReadStateInput): ReadState {
  return readVerdictOf(input).state;
}
