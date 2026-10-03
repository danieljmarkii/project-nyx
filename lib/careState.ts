import type { SignalFinding } from './signal';

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

export type CareStateValue = 'raised' | 'with_vet' | 'recheck_booked' | 'raised_again';

const VALUES: ReadonlySet<string> = new Set<CareStateValue>(['raised', 'with_vet', 'recheck_booked', 'raised_again']);

/** The finding's care state as the server set it, or null (flag off, an old cache, malformed). */
export function careStateValueOf(finding: SignalFinding): CareStateValue | null {
  const raw = (finding as { careState?: unknown }).careState;
  if (typeof raw !== 'object' || raw === null) return null;
  const state = (raw as { state?: unknown }).state;
  return typeof state === 'string' && VALUES.has(state) ? (state as CareStateValue) : null;
}

/** "With your vet" or "Recheck booked": the concern stays on Home and asks nothing. Only a
 *  CONCERN (chronicity or worsening) can be quieted: a care state found on an escalation (an
 *  intake decline, a red flag, the burden card) is a malformed or tampered cache and is ignored,
 *  so the escalation keeps its ask (AC 3). */
export function careStateQuietsAsk(finding: SignalFinding): boolean {
  if (finding.type !== 'symptom_chronicity' && finding.type !== 'symptom_worsening') return false;
  const s = careStateValueOf(finding);
  return s === 'with_vet' || s === 'recheck_booked';
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
  const raw = (finding as { careState?: { text?: unknown } }).careState?.text;
  const text = typeof raw === 'string' && raw.trim().length > 0 ? raw : null;
  return { state, sign, text: state === 'raised' ? null : text };
}

/** A raised or raised-again concern: the ask stands, and the owner may answer it. */
export function careStateTakesAnswers(view: CareStateView | null): boolean {
  return view !== null && (view.state === 'raised' || view.state === 'raised_again');
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

/** A raised-again row's "Back because …" sentence (DF-8), the first of the server's text,
 *  or null. The row prints it above the lane's own headline and ask. */
export function careBackLine(view: CareStateView): string | null {
  if (view.state !== 'raised_again' || view.text === null) return null;
  const m = /^Back because[^.]*\./.exec(view.text);
  return m ? m[0] : null;
}
