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
