import type { SignalFinding } from './signal';
import { symptomWord } from './signalCopy';

// EN-9's care state, as the client reads it (Engines v3 PR-23, CUL-1417;
// docs/nyx-care-state-requirements.md §3.3).
//
// The server (`generate-signal/careState.ts`) decides the state and writes its sentence; the
// client never derives one (the device never computes a care state, §3.3). This is the ONE
// reader, so Home's ask and the EN-1 harness (which renders asks through `signalHomeLine`) apply
// the same rule: a concern the owner said the vet knows about carries no ask on Home.
//
// FAILS LOUD. `ai_signals.findings` is a cache the owner can write, and an unknown or malformed
// value reads as no state, which keeps the lane's own ask. Only the two exact watched values
// take the ask away. The row's rendering (the tag, the sentence) is PR-35's.

export type CareStateValue = 'raised' | 'with_vet' | 'recheck_booked' | 'visit_booked' | 'raised_again';

const VALUES: ReadonlySet<string> = new Set<CareStateValue>(['raised', 'with_vet', 'recheck_booked', 'visit_booked', 'raised_again']);

/** The finding's care state as the server set it, or null (flag off, an old cache, malformed). */
export function careStateValueOf(finding: SignalFinding): CareStateValue | null {
  const raw = (finding as { careState?: unknown }).careState;
  if (typeof raw !== 'object' || raw === null) return null;
  const state = (raw as { state?: unknown }).state;
  return typeof state === 'string' && VALUES.has(state) ? (state as CareStateValue) : null;
}

/** "With your vet", "Recheck booked" or (CUL-2652) a booked visit: the concern stays on Home and
 *  asks nothing. Only a CONCERN can be quieted: a care state found on an escalation (an intake
 *  decline, a red flag, the burden card) is a malformed or tampered cache and is ignored, so the
 *  escalation keeps its ask (AC 3). `visit_booked` quiets only a chronicity card. The server
 *  writes it on the weight card too, which this build draws no Home row for; on a worsening card it
 *  is a tampered cache, and the ask stays (ruling A, 2026-11-07: a booking never quiets "coming
 *  more often"). */
export function careStateQuietsAsk(finding: SignalFinding): boolean {
  if (finding.type !== 'symptom_chronicity' && finding.type !== 'symptom_worsening') return false;
  const s = careStateValueOf(finding);
  if (s === 'visit_booked') return finding.type === 'symptom_chronicity';
  return s === 'with_vet' || s === 'recheck_booked';
}

// ── CUL-2652: the booked visit the server wrote beside a finding ──────────────────

/** A booked visit, as the server wrote it: its LOCAL day, the appointment, and whether the day
 *  has passed (the week "How did it go?" is open). */
export interface BookedVisitView {
  on: string;
  appointmentId: string;
  passed: boolean;
}

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar day: "2026-02-30" is refused, never rolled into March. */
function isDayKey(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const m = DAY_KEY.exec(v);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

function bookedVisitFrom(raw: unknown): BookedVisitView | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const v = raw as { on?: unknown; appointmentId?: unknown; passed?: unknown };
  if (!isDayKey(v.on) || typeof v.appointmentId !== 'string' || v.appointmentId.length === 0 || typeof v.passed !== 'boolean') return null;
  return { on: v.on, appointmentId: v.appointmentId, passed: v.passed };
}

/**
 * The booked visit on a finding, or null. A concern and the weight card carry it inside their care
 * state; an escalation carries it beside its finding (never a care state, AC 3). Malformed reads as
 * none, which only ever drops a line: the ask is decided elsewhere and never reads this.
 */
export function bookedVisitOf(finding: SignalFinding): BookedVisitView | null {
  if (finding.priorityClass !== 'safety') return null;
  const care = (finding as { careState?: { bookedVisit?: unknown } }).careState;
  if (typeof care === 'object' && care !== null && 'bookedVisit' in care) return bookedVisitFrom(care.bookedVisit);
  return bookedVisitFrom((finding as { bookedVisit?: unknown }).bookedVisit);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Nov 14": a local day key, printed without a year (the horizon is 30 days, so the year is
 *  never in doubt; the server's sentence adds one only across a new year). */
export function bookedVisitDay(v: BookedVisitView): string {
  const [, , m, d] = DAY_KEY.exec(v.on) as RegExpExecArray;
  return `${MONTHS[Number(m) - 1]} ${Number(d)}`;
}

/** Ruling 3 (2026-11-07, softened B): the call card keeps its ask word for word and gains this. */
export function bookedVisitCallLine(v: BookedVisitView): string {
  return `Visit booked for ${bookedVisitDay(v)}. A call today may still be worth it.`;
}

/** Frame 3 B: on a card that still asks while a visit is booked, the booking ask becomes a call. */
export function bookedVisitCallBeforeAsk(v: BookedVisitView): string {
  return `worth calling before ${bookedVisitDay(v)}`;
}

// ── PR-35: what the client draws from the server's state ─────────────────────────

/** The signs a care answer may name: 082's CHECK on `care_acknowledgements.symptom_type`
 *  (the chronicity ∪ worsening lanes). `sneeze` is a lane sign the table refuses, so a
 *  finding on it never offers an answer (a write would be a terminal 23514). */
export const CARE_SIGNS = ['vomit', 'diarrhea', 'itch', 'scratch', 'skin_reaction', 'cough'] as const;
export type CareSign = (typeof CARE_SIGNS)[number];

/** The server's care fact on a concern, as far as the client draws it. */
export interface CareStateView {
  state: CareStateValue;
  sign: CareSign;
  /** The server's template sentence (AC 8); null on `raised`. */
  text: string | null;
  /** `raised_again` only: the server's "Back because …" sentence, or null. */
  backLine: string | null;
}

/** The concern's care state, or null: the flag is off, the cache is old, the finding is not
 *  a concern (an escalation never carries one, AC 3), or the sign is not one 082 accepts.
 *  THE GATE for every PR-35 surface: an answer is offered only where the server wrote a
 *  state, so flag-off nothing new renders and nothing new is read (§9). */
export function careStateViewOf(finding: SignalFinding): CareStateView | null {
  if (finding.type !== 'symptom_chronicity' && finding.type !== 'symptom_worsening') return null;
  const state = careStateValueOf(finding);
  if (state === null) return null;
  const sign = (CARE_SIGNS as readonly string[]).includes(finding.symptomType) ? (finding.symptomType as CareSign) : null;
  if (sign === null) return null;
  const fact = (finding as { careState?: { text?: unknown; backLine?: unknown } }).careState;
  const text = typeof fact?.text === 'string' && fact.text.trim().length > 0 ? fact.text : null;
  const back = typeof fact?.backLine === 'string' && /^Back because /.test(fact.backLine) ? fact.backLine : null;
  return { state, sign, text: state === 'raised' ? null : text, backLine: state === 'raised_again' ? back : null };
}

/** A raised or raised-again concern: the ask stands, and the owner may answer it. A booked visit
 *  (CUL-2652) is not an answer, so the owner may still say the vet knows. */
export function careStateTakesAnswers(view: CareStateView | null): boolean {
  return view !== null && (view.state === 'raised' || view.state === 'raised_again' || view.state === 'visit_booked');
}

/** "Your vet knows" (D6, CUL-1440, ruled 2026-10-01): the tag on a watched concern, in the
 *  owner's own words (the button is "My vet knows"). */
export const CARE_WATCHED_TAG = 'Your vet knows';

/** D6's quiet line under a `with_vet` row: what the state does, and what brings it back.
 *  Not on `recheck_booked`, whose row names its date and asks nothing. */
export const CARE_WATCHED_LINE = 'Not asking you to book. Back here if it comes more often.';

// The server's head sentence ("{Pet's} vomiting, your vet knows." — or the pre-D6
// "…, with your vet." an older cache holds). It opens the cached text so the sentence
// stands alone where Get ready and Ask relay it (GAP-17); a Home row already shows the
// tag and the sign, so it drops the head and keeps the rest.
const HEAD_RE = /^[^.]*, (?:your vet knows|with your vet)\.\s*/;

/** The watched row's body: the server's sentence without its head, or the whole sentence
 *  when the head is not where it is expected (never a guess at a split). */
export function careStateBody(view: CareStateView): string | null {
  if (view.text === null) return null;
  const body = view.text.replace(HEAD_RE, '');
  return body.length > 0 ? body : view.text;
}

/** A raised-again row's "Back because …" sentence (DF-8), as the server wrote it on its own
 *  (`careState.backLine`), or null. Never split out of the full sentence: a pet's name can
 *  carry a full stop ("Mr. Biggles"). An older cache without the field draws no back line,
 *  and the row keeps the lane's own headline and ask, so nothing goes quieter. */
export function careBackLine(view: CareStateView): string | null {
  if (view.state !== 'raised_again') return null;
  return view.backLine;
}

/** The booked-visit line a Home row draws, and what kind it is. */
export interface BookedVisitRowLine {
  /** `quiet`: the row's ask is gone and this line stands in its place (frame 2, frame 3 C/D).
   *  `call`: ruling 3's line under a call-today ask. `fact`: the date under a concern that still
   *  asks (frame 3 B). */
  kind: 'quiet' | 'call' | 'fact';
  text: string;
  /** Set while the visit's week is open: the row opens "How did it go?" for this appointment. */
  howDidItGoFor: string | null;
}

// A call TODAY, never a call NOW: "A call today may still be worth it" under "Call your vet now"
// would read as a softer ask than the one above it (Dr. Chen lens, CUL-2652 build).
const CALL_TODAY_RE = /\bcall\b.*\btoday\b/i;

/**
 * CUL-2652: what a Home row says about a booked visit, from the server's facts and the row's own
 * ask (already decided upstream; this never changes it). Null when the row says nothing about one.
 */
export function bookedVisitRowLine(finding: SignalFinding, ask: string | null): BookedVisitRowLine | null {
  const v = bookedVisitOf(finding);
  if (v === null) return null;
  // The quiet row's words are the mock's (frame 2, frame 3 D), composed here from the date and the
  // sign: the server's cached sentence is the standalone one Get ready and Ask relay.
  if (finding.type === 'symptom_chronicity' && careStateQuietsAsk(finding) && careStateValueOf(finding) === 'visit_booked') {
    return {
      kind: 'quiet',
      text: v.passed
        ? `${bookedVisitDay(v)}'s visit. How did it go?`
        : `Visit booked for ${bookedVisitDay(v)}. Worth mentioning the ${symptomWord(finding.symptomType)}.`,
      howDidItGoFor: v.passed ? v.appointmentId : null,
    };
  }
  if (v.passed || ask === null) return null;
  if (finding.type === 'symptom_chronicity' || finding.type === 'symptom_worsening') {
    return { kind: 'fact', text: `Visit booked for ${bookedVisitDay(v)}.`, howDidItGoFor: null };
  }
  return CALL_TODAY_RE.test(ask) ? { kind: 'call', text: bookedVisitCallLine(v), howDidItGoFor: null } : null;
}
