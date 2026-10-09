// Call today's action line on the record: "first thing tomorrow" only on the server's stored
// fact (Engines v3 PR-27f, CUL-1629; CUL-1611 ruled A; docs/nyx-incident-tiers-requirements.md
// §2 rule 1).
//
// THE PHONE MAKES NO SAFETY JUDGMENT OF ITS OWN. The leave to wait is `event_ai_analysis.may_wait`,
// decided server-side (`supabase/functions/_shared/incidentMayWait.ts`, PR-27e) over every read's
// flags and payload, which the phone does not hold. This module only ever TAKES that leave away:
// every gate below can refuse a TRUE, none can grant one, and anything it cannot read refuses. The
// louder line, `TIER_WORDS.call_today.action` ("If they're closed, call an emergency clinic."), is
// what stands whenever this returns a refusal, and it is still what Home and History say.
//
// ── THE GATES (each a named refusal, each driven red on its own in the test) ─────────────────
//   row        the new-rule call today, `tier = 'call_today'` itself, `may_wait` exactly TRUE
//              (087: FALSE, NULL, absent and every old row keep the louder line), a finished
//              read (`completed`), no owner edit, no error.
//   photos     the photo set the read READ must be the event's set NOW (PR-27j, CUL-1682): the
//              server's attachment ids, the phone's, and the payload's `read_photo_set_key`, all
//              equal in the server's list form. Migration 092 lowers a TRUE when a photo lands,
//              but a read that started over the old set can write TRUE after the trigger fired;
//              only this check closes that. A payload is required whenever there is a photo; a
//              row with NO payload stands only when there is no photo anywhere and the row's own
//              stamp names none (a photoless record-alone call: PM ruling D3 = a, 2026-10-09).
//   unsynced   a vomit, stool, lethargy or meal of this pet near the read, or a photo of this
//              event, that the phone has not pushed: the server's fact has not seen it. Its
//              triggers (088–092) lower the TRUE once it lands; until then this does.
//   floor      EN-4's floor, re-run over the phone's own vomits (unsynced included), anchored on
//              every vomit within the server's reach; a call now refuses (PR-27h's finding 2).
//   lethargy   any lethargy from a day before the run up to now, back-dated or not.
//   intake     a cat: no rated meal in the week before now, or the intake flag firing at any
//              vomit in the run or AT NOW. Time alone fires it, with no write to trigger anything
//              (PR-27h's finding 1), so only the render can re-check it.
//   expired    the leave covers ONE night, and ends at the first local 6 AM after the EARLIER of
//              the decision and the incident. A morning that has come is the "first thing" the
//              line promised; past it the line would offer a second night nobody decided. The
//              decision is read off `updated_at`, which every write moves (075), a Hide or a Show
//              included, and 088 does not take the leave back on one: so the incident's own time
//              bounds the night too, and a hide tapped open the next morning cannot re-open it
//              (adversarial pass on this PR, finding 1; a server-stamped decision time is filed).
//   dst        an offset change in the DEVICE's zone around the read (the server checked the
//              profile's zone, which may lag the phone; PR-27e's precondition 3), read off the
//              runtime's own clock (`getTimezoneOffset`), so it needs no Intl zone support.
//   fresh      the caller hands the row it re-read from the server this minute, and the line
//              stands only while that copy is the one on screen (same `updated_at`): a take-back
//              written for a neighbour's finding (088–092, revalidateMayWait) reaches an open
//              record within a minute, never "until the next open" (finding 2).
//   stale      every answer above is as old as the read that STARTED it: older than two minutes,
//              or started before the newest log this phone committed, it refuses. A read that
//              hangs past the cadence is never waited on, so a slow network leaves the louder
//              line, never the last clean answer (second adversarial pass, F1).
//
// ── THE WORDS (device local hour; PM ruling D1 = a: 6 AM / 6 PM / midnight) ──────────────────
//   day          Call your vet today. If they're closed, first thing tomorrow, or an emergency
//                clinic tonight if {signs}.
//   evening      Call your vet first thing tomorrow, or an emergency clinic tonight if {signs}.
//   small hours  Call your vet first thing this morning, or an emergency clinic now if {signs}.
// {signs} is count-free and has no deadline: a vomit says "{pet} vomits again or is low on
// energy"; a stool says "{pet} is low on energy or vomits" (PM ruling D2 = a). The floor's own
// clauses were tried first and failed the adversarial pass (finding 3): T2's "twice more by 1 AM"
// counts from this vomit's onset and misses an earlier onset inside the span, so the night's
// exception named one vomit too many and a deadline 40 minutes late. "Again" is never later than
// the floor, which is the direction a night's exception must err.
//
// MIRRORED, SAME QUESTION (C-34): `intakeFlagAt` and `tracksIntakeAt` mirror `supabase/functions/_shared/incidentMayWait.ts`, whose constants they
// import from nowhere: the phone may not import the Edge Function tree. `lib/mayWaitLine.test.ts`
// drives both copies over the same fixtures, so a drift is a red build.
//
// STATED BLIND SPOTS. Another phone's unsynced rows are invisible here (the server's triggers lower
// the TRUE once they sync). A server row the phone could not re-read leaves the last copy on screen
// until the section's next read; the gates above re-run on every minute tick regardless.

import { FLOOR_LETHARGY_HOURS, FLOOR_READ_HOURS, incidentFloor, type FloorVomit } from './incidentFloor';
import { named } from './incidentFloorWords';
import { isTieredRow, TIER_WORDS } from './incidentTierWords';

const HOUR = 3_600_000;

/** The server's reach either side of the read (`MAY_WAIT_NEIGHBOUR_HOURS = FLOOR_READ_HOURS`). */
export const MAY_WAIT_REACH_HOURS = FLOOR_READ_HOURS;
/** Mirrors `MAY_WAIT_LETHARGY_HOURS` (= the floor's T3 window). */
export const MAY_WAIT_LETHARGY_HOURS = FLOOR_LETHARGY_HOURS;
/** Mirrors `MAY_WAIT_INTAKE_HOURS` / `MAY_WAIT_INTAKE_BASELINE_HOURS` (analyze-vomit/context.ts). */
export const MAY_WAIT_INTAKE_HOURS = 24;
export const MAY_WAIT_INTAKE_BASELINE_HOURS = 7 * 24;
/** Mirrors `MAY_WAIT_DST_AFTER_HOURS`: how far past the read the offset is checked. */
export const MAY_WAIT_DST_AFTER_HOURS = 48;

/** How old an answer may be before it no longer speaks for the record: twice the re-read cadence.
 *  A read slower than this is not waited on; the line goes louder until a fresh one lands. */
export const MAY_WAIT_FRESH_MS = 2 * 60_000;

/** The local hour the leave ends at, and the day band begins at (D1). */
export const MORNING_HOUR = 6;
/** The local hour the evening band begins at (D1). */
export const EVENING_HOUR = 18;

/** The server's payload key naming the photo set a model read read (incidentMayWait.ts). */
export const READ_PHOTO_SET_KEY = 'read_photo_set_key';

export type MayWaitRefusal =
  | 'row'
  | 'photos'
  | 'unsynced'
  | 'floor'
  | 'lethargy'
  | 'intake'
  | 'expired'
  | 'dst'
  | 'fresh'
  | 'stale'
  | 'facts';

/** The analysis row's columns this reads. Unknown-typed: a server value this build does not
 *  expect must refuse, never throw. */
export interface MayWaitRow {
  status?: string | null;
  tier?: string | null;
  engine_flags?: unknown;
  may_wait?: unknown;
  edited_at?: string | null;
  error?: string | null;
  updated_at?: string | null;
  photo_set_key?: string | null;
  ai_raw_payload?: unknown;
}

export interface MayWaitMeal {
  at: string;
  rating: string | null;
}

/** What the phone read around the incident (`lib/mayWaitFacts.ts`). */
export interface MayWaitFacts {
  /** When the read that produced these facts STARTED (ms). An answer older than
   *  `MAY_WAIT_FRESH_MS`, or older than the newest log, refuses (the `stale` gate). */
  readAt: number;
  /** The incident's own time, from the phone's copy of the event. */
  anchorAt: string;
  /** Attachment ids the server holds for this event NOW (a fresh read). */
  serverAttachmentIds: readonly string[];
  /** Attachment ids the phone holds for this event. */
  localAttachmentIds: readonly string[];
  /** A row near the read the phone has not pushed (an event, a rating, a photo). */
  unsynced: boolean;
  /** The phone's live vomits around the read, unsynced included. */
  vomits: readonly FloorVomit[];
  /** The phone's live stool logs around the read: they widen the run, as on the server. */
  stoolAt: readonly string[];
  /** The phone's live lethargy logs, up to now. */
  lethargyAt: readonly string[];
  /** The phone's live meals with their ratings (a cat's intake). */
  meals: readonly MayWaitMeal[];
}

export interface MayWaitInput {
  row: MayWaitRow | null | undefined;
  /** Null until the phone's read answers, and on a failed read: refuses. */
  facts: MayWaitFacts | null;
  kind: 'vomit' | 'stool';
  petName: string | null | undefined;
  /** The RECORD's pet's species (C-9), or null when the phone has no copy: refuses. */
  species: string | null;
  birthDate: string | null;
  nowMs: number;
  /** The row re-read from the server for this gate (null until it answers). The line stands
   *  only while it is the copy on screen: same `updated_at`, still TRUE. */
  freshRow: MayWaitRow | null | undefined;
  /** When the read that returned `freshRow` STARTED (ms). */
  freshReadAt: number | null;
  /** When this phone last committed a log (ms), or null. An answer read before it refuses. */
  lastLoggedAt: number | null;
  /** The device's UTC offset at an instant, in `getTimezoneOffset`'s sign. A test injects
   *  one; the runtime's own clock otherwise. */
  offsetAt?: (atMs: number) => number;
}

// ── Mirrors of the server's rules (C-34: same question; parity-tested) ───────────────────────

/** A rated meal in the week before `atMs`: the owner tracks intake. */
export function tracksIntakeAt(meals: readonly MayWaitMeal[], atMs: number): boolean {
  return meals.some((m) => {
    const t = Date.parse(m.at);
    return m.rating !== null && Number.isFinite(t) && t <= atMs && t >= atMs - MAY_WAIT_INTAKE_BASELINE_HOURS * HOUR;
  });
}

/** The cat intake flag as shipped, evaluated at `atMs`. */
export function intakeFlagAt(meals: readonly MayWaitMeal[], atMs: number): boolean {
  const within = (iso: string, hours: number) => {
    const t = Date.parse(iso);
    return Number.isFinite(t) && t <= atMs && t >= atMs - hours * HOUR;
  };
  const tracks = meals.some((m) => m.rating !== null && within(m.at, MAY_WAIT_INTAKE_BASELINE_HOURS));
  const ate = meals.some((m) => (m.rating === 'most' || m.rating === 'all') && within(m.at, MAY_WAIT_INTAKE_HOURS));
  return tracks && !ate;
}

/** Whether the offset moves anywhere in [fromMs, toMs]. Every DST change holds for hours, so
 *  an hourly sample finds each one (the server's `dstChangeBetween`, over the device's clock). */
export function offsetChangeBetween(offsetAt: (atMs: number) => number, fromMs: number, toMs: number): boolean {
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return true;
  const first = offsetAt(fromMs);
  if (!Number.isFinite(first)) return true;
  for (let t = fromMs; t < toMs; t += HOUR) {
    if (offsetAt(t) !== first) return true;
  }
  return offsetAt(toMs) !== first;
}

const deviceOffsetAt = (atMs: number) => new Date(atMs).getTimezoneOffset();

// ── The photo set ────────────────────────────────────────────────────────────────────────────

const ATTACHMENT_ID_SHAPE = /^[0-9a-f-]+$/;
const PHOTO_SET_KEY_MAX_CHARS = 4000;

/**
 * The server's list form of a photo set (`photoSetKey`, `_shared/engineStamps.ts`): ids
 * lowercased, sorted, comma-joined; null for none. `undefined` when the server would hash it
 * (an id not id-shaped, or past 4,000 characters): the phone cannot compare a hash, so it refuses.
 */
export function photoSetListKey(ids: readonly string[]): string | null | undefined {
  if (ids.length === 0) return null;
  const sorted = ids.map((id) => id.toLowerCase()).sort();
  if (!sorted.every((id) => id.length > 0 && ATTACHMENT_ID_SHAPE.test(id))) return undefined;
  const joined = sorted.join(',');
  return joined.length <= PHOTO_SET_KEY_MAX_CHARS ? joined : undefined;
}

/** Whether the read stands for the photos on the event now (the `photos` gate). */
export function readCoversPhotosNow(row: MayWaitRow, facts: MayWaitFacts): boolean {
  const server = photoSetListKey(facts.serverAttachmentIds);
  const local = photoSetListKey(facts.localAttachmentIds);
  if (server === undefined || local === undefined || server !== local) return false;
  const payload = row.ai_raw_payload;
  if (payload === null || payload === undefined) {
    // A photoless record-alone read writes no payload (D3 = a): it stands only over no photo,
    // on the server, on the phone, and in the row's own stamp.
    return server === null && (row.photo_set_key ?? null) === null;
  }
  if (typeof payload !== 'object' || Array.isArray(payload)) return false;
  const p = payload as Record<string, unknown>;
  // A payload with no key is a read from before PR-27e: it says nothing about its photos.
  if (!Object.prototype.hasOwnProperty.call(p, READ_PHOTO_SET_KEY)) return false;
  const readKey = p[READ_PHOTO_SET_KEY];
  if (readKey !== null && typeof readKey !== 'string') return false;
  return readKey === server;
}

// ── The record the phone holds ───────────────────────────────────────────────────────────────

function parsed(iso: string): number {
  return Date.parse(iso);
}

/** The run the server measures from: the read and every incident within its reach. */
function runBounds(anchorMs: number, facts: MayWaitFacts): { first: number; last: number } {
  const reach = MAY_WAIT_REACH_HOURS * HOUR;
  const times = [anchorMs, ...facts.vomits.map((v) => parsed(v.at)), ...facts.stoolAt.map(parsed)].filter(
    (t) => Number.isFinite(t) && Math.abs(t - anchorMs) <= reach,
  );
  return { first: Math.min(...times), last: Math.max(...times) };
}

export function floorCallsNowAround(anchorMs: number, facts: MayWaitFacts, species: string): boolean {
  const reach = MAY_WAIT_REACH_HOURS * HOUR;
  for (const v of facts.vomits) {
    const t = parsed(v.at);
    if (!Number.isFinite(t) || Math.abs(t - anchorMs) > reach) continue;
    // The server's re-run reads no birthday (`birthDate: null`), so neither does this one.
    const floor = incidentFloor({ anchor: v, vomits: facts.vomits, lethargyAt: facts.lethargyAt, species, birthDate: null });
    if (floor.tier === 'call_now') return true;
  }
  return false;
}

export function lethargyAround(anchorMs: number, facts: MayWaitFacts, nowMs: number): boolean {
  const { first, last } = runBounds(anchorMs, facts);
  const from = first - MAY_WAIT_LETHARGY_HOURS * HOUR;
  const to = Math.max(last + MAY_WAIT_LETHARGY_HOURS * HOUR, nowMs);
  return facts.lethargyAt.some((iso) => {
    const t = parsed(iso);
    return Number.isFinite(t) && t >= from && t <= to;
  });
}

export function catIntakeRefuses(anchorMs: number, facts: MayWaitFacts, nowMs: number): boolean {
  if (!tracksIntakeAt(facts.meals, nowMs)) return true;
  const reach = MAY_WAIT_REACH_HOURS * HOUR;
  const vomitTimes = facts.vomits.map((v) => parsed(v.at)).filter((t) => Number.isFinite(t) && Math.abs(t - anchorMs) <= reach);
  return [...vomitTimes, nowMs].some((t) => intakeFlagAt(facts.meals, t));
}

// ── The clock ────────────────────────────────────────────────────────────────────────────────

/** The first local 6 AM strictly after `decidedMs`: the end of the night the leave covers. */
export function leaveEndsAt(decidedMs: number): number {
  const d = new Date(decidedMs);
  const sameDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), MORNING_HOUR).getTime();
  return sameDay > decidedMs ? sameDay : new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, MORNING_HOUR).getTime();
}

export type ClockBand = 'day' | 'evening' | 'small_hours';

export function clockBandOf(nowMs: number): ClockBand {
  const h = new Date(nowMs).getHours();
  if (h < MORNING_HOUR) return 'small_hours';
  return h < EVENING_HOUR ? 'day' : 'evening';
}

// ── The signs ────────────────────────────────────────────────────────────────────────────────

/** The pet's call-now signs as the exception: count-free, deadline-free (see the header). */
export function callNowSignsOf(kind: 'vomit' | 'stool', petName: string | null | undefined): string {
  const p = named(petName);
  return kind === 'vomit' ? `${p} vomits again or is low on energy` : `${p} is low on energy or vomits`;
}

export function waitLine(band: ClockBand, signs: string): string {
  if (band === 'day') return `Call your vet today. If they're closed, first thing tomorrow, or an emergency clinic tonight if ${signs}.`;
  if (band === 'evening') return `Call your vet first thing tomorrow, or an emergency clinic tonight if ${signs}.`;
  return `Call your vet first thing this morning, or an emergency clinic now if ${signs}.`;
}

// ── The resolver ─────────────────────────────────────────────────────────────────────────────

/** The first gate that refuses the wait, or null when every gate holds. */
export function mayWaitRefusalOf(input: MayWaitInput): MayWaitRefusal | null {
  const row = input.row;
  if (
    !row ||
    !isTieredRow(row) ||
    row.tier !== 'call_today' ||
    row.may_wait !== true ||
    row.status !== 'completed' ||
    (row.edited_at !== null && row.edited_at !== undefined) ||
    (typeof row.error === 'string' && row.error.length > 0)
  ) {
    return 'row';
  }
  const facts = input.facts;
  if (!facts || input.species === null || !Number.isFinite(input.nowMs)) return 'facts';
  const anchorMs = parsed(facts.anchorAt);
  const decidedMs = parsed(row.updated_at ?? '');
  if (!Number.isFinite(anchorMs) || !Number.isFinite(decidedMs)) return 'facts';

  if (!readCoversPhotosNow(row, facts)) return 'photos';
  if (facts.unsynced) return 'unsynced';
  if (floorCallsNowAround(anchorMs, facts, input.species)) return 'floor';
  if (lethargyAround(anchorMs, facts, input.nowMs)) return 'lethargy';
  if (input.species === 'cat' && catIntakeRefuses(anchorMs, facts, input.nowMs)) return 'intake';
  if (input.nowMs >= leaveEndsAt(Math.min(decidedMs, anchorMs))) return 'expired';

  const from = Math.min(anchorMs, input.nowMs) - MAY_WAIT_REACH_HOURS * HOUR;
  const to = Math.max(anchorMs, input.nowMs) + MAY_WAIT_DST_AFTER_HOURS * HOUR;
  if (offsetChangeBetween(input.offsetAt ?? deviceOffsetAt, from, to)) return 'dst';

  const fresh = input.freshRow;
  if (!fresh || fresh.may_wait !== true || fresh.updated_at !== row.updated_at) return 'fresh';

  // An answer is as old as the read that started it. A read that never lands (a network that
  // hangs past the re-read cadence) must not leave the last clean answer standing, and an
  // answer read before the newest log cannot have seen it (second adversarial pass, F1).
  const answeredAfter = Math.max(input.nowMs - MAY_WAIT_FRESH_MS, input.lastLoggedAt ?? Number.NEGATIVE_INFINITY);
  const fresher = (at: number | null) => at !== null && Number.isFinite(at) && at >= answeredAfter && at <= input.nowMs;
  if (!fresher(facts.readAt) || !fresher(input.freshReadAt)) return 'stale';
  return null;
}

/** Call today's action line on the record: the wait line on a TRUE every gate keeps, else the
 *  louder line. Never null, never calmer than "Worth a call". */
export function callTodayActionOf(input: MayWaitInput): string {
  if (mayWaitRefusalOf(input) !== null) return TIER_WORDS.call_today.action ?? '';
  return waitLine(clockBandOf(input.nowMs), callNowSignsOf(input.kind, input.petName));
}
