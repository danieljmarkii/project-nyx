// Copy for the one-surface log confirm (B-745 PR 3) — the time-row label and the
// summary-pill sentence ("what gets written").
//
// PARITY RULE (the load-bearing one). The window wording is DERIVED from
// describeOccurredAt — the same function the History row and the vet report use —
// so the confirm pill can never drift from what the event will read as once saved
// (the diet-trial "one predicate" doctrine applied to copy). This deliberately
// overrides the round-4 mock's draft phrasing for the open-ended case: the mock
// drew "found — sometime since this morning", but the stored open-ended window is
// upper-bound-only (earliest = null, latest = discovery), so "since this morning"
// would assert a LOWER bound the record does not hold. clinical-guardrails forbids
// a surface asserting more certainty than the data carries, so the confirm says
// "found by {time}" — exactly what History will show. (The mock's own callout
// flagged the phrasing as a draft for this copy pass to reconcile with History.)

import { describeOccurredAt, formatTime, localDayIndex, type OccurredConfidence } from './utils';

export interface ConfirmTimeInput {
  confidence: OccurredConfidence;
  occurredAt: Date;
  earliest: Date | null;
  latest: Date | null;
  // Injectable for tests / determinism; defaults to now.
  now?: Date;
}

// "today" / "yesterday" / "Aug 20" for a witnessed point, relative to `now`, on
// LOCAL calendar days (B-514: the day boundary is local midnight, so this compares
// local day indices, never a UTC round-trip).
function dayPhrase(d: Date, now: Date): string {
  const diff = localDayIndex(now.getTime()) - localDayIndex(d.getTime());
  if (diff === 0) return 'today';
  if (diff === 1) return 'yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

// The lowercase time phrase used inside the summary-pill sentence.
//   witnessed -> "today at 5:33 PM" / "yesterday at 5:33 PM" / "Aug 20 at 5:33 PM"
//   window    -> describeOccurredAt.primary ("found by 5:33 PM" / "between 2:00 PM
//                and 5:33 PM") — History parity, never invented.
//   estimated -> "around 5:33 PM" (the sheet never emits this; defensive for the
//                full-screen path's "around a time" sub-mode).
export function confirmTimePhrase(input: ConfirmTimeInput): string {
  const now = input.now ?? new Date();
  if (input.confidence === 'witnessed') {
    return `${dayPhrase(input.occurredAt, now)} at ${formatTime(input.occurredAt)}`;
  }
  if (input.confidence === 'estimated') {
    return `around ${formatTime(input.occurredAt)}`;
  }
  return describeOccurredAt({
    confidence: input.confidence,
    occurredAt: input.occurredAt.toISOString(),
    earliest: input.earliest ? input.earliest.toISOString() : null,
    latest: input.latest ? input.latest.toISOString() : null,
  }).primary;
}

// The time ROW's standalone main label (the pill row above the summary), sentence-
// cased.  witnessed -> "Today · 5:33 PM"; window/estimated -> the capitalized phrase
// ("Found by 5:33 PM" / "Between 2:00 PM and 5:33 PM").
export function confirmTimeRowLabel(input: ConfirmTimeInput): string {
  const now = input.now ?? new Date();
  if (input.confidence === 'witnessed') {
    return `${capitalize(dayPhrase(input.occurredAt, now))} · ${formatTime(input.occurredAt)}`;
  }
  return capitalize(confirmTimePhrase(input));
}

// The summary-pill sentence — "{Type} · {when}". This IS the save: what it reads is
// exactly what gets written.
export function summarizeSimpleEvent(input: ConfirmTimeInput & { typeLabel: string }): string {
  return `${input.typeLabel} · ${confirmTimePhrase(input)}`;
}


// It lives HERE and not in lib/utils, which was the first instinct (that is where
// archiveBlockedCopy sits, and this is the same shape). The deploy-ledger guard
// rejected it: `ask`, `generate-report` and `generate-signal` all import lib/utils
// for its date helpers, so the whole FILE is in their shipping closure, and one
// appended string constant drifted three Edge Function fingerprints — two of them
// under standing deploy holds. Owner-facing copy no Edge Function reads should not
// be able to make a held function look un-deployed. lib/logCopy is client-only and
// is already this surface's copy module.

// ── "There is no pet to log for" ─────────────────────────────────────────────
//
// One source for every capture surface
// that can be reached before the pets have landed (CUL-681 the log sheet,
// CUL-717 the FAB menu). Shared for the same reason archiveBlockedCopy is: two
// surfaces expressing ONE state, whose wording is load-bearing and would
// otherwise drift as two comments in two files.
//
// The clause ORDER is the part worth protecting, and it is ordered by
// likelihood rather than by drama. The dominant cause is a pets read that has
// not answered yet — the FAB mounts unconditionally in the tabs layout
// (app/(tabs)/_layout.tsx) while pets hydrate from a NETWORK read
// (hooks/usePet.ts) that only runs once the session restores, and on a failed
// double-read that hook deliberately leaves the store as-is. So the hydration
// read comes first, a failed one second ("check your connection" is the app's
// shipped idiom — lib/authErrors, ArchivePetSheet, DeleteAccountSheet), and the
// genuinely petless account last, because it is near-unreachable (archiving a
// last pet is blocked — lib/utils archiveBlockedCopy).
//
// A first draft led with "add a pet" and the pet-owner lens (Sam) falsified it:
// the owner reading this most often ALREADY HAS a pet, and the app's one
// instruction to them was to add another. The least likely cause makes a bad
// headline even when it is the only actionable one.
export function noPetToLogForCopy(): { title: string; body: string } {
  return {
    title: 'No pet to log for yet',
    body: "Your pets load a moment after the app opens. If they don't, check your connection — or add a pet from the Pet tab.",
  };
}
