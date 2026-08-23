// The R1 "named card" register (CUL-606, docs/nyx-app-polish-requirements.md §5).
//
// What a completion surface needs to know about the record it just wrote, and the
// two things it derives from that: the SENTENCE it speaks, and what a "Change time"
// edit is allowed to write.
//
// ── THE SENTENCE RULE, AND WHY IT LIVES HERE ────────────────────────────────
// §5: "a beat never says a bare 'Logged' where logCopy can compose the sentence
// (History-parity derivation — the same describeOccurredAt path, so a beat can
// never over-claim)."
//
// The enforcement is the SHAPE, not the discipline: `LoggedRecord` carries the
// record's structured fields, never a pre-composed display string, so no log path
// can hand the card a literal "Logged" — there is no parameter to put it in. The
// composition happens once, here, through lib/logCopy, which itself derives the
// window wording from describeOccurredAt: the same function the History row and
// the vet report use. So the card's sentence and the row the owner will find in
// History tomorrow cannot drift, and the card cannot claim more certainty than
// the stored confidence carries.
//
// Same reasoning as the commit haptic living inside momentStore's present()
// (CUL-604) rather than at its call sites: a future log path should inherit the
// rule by virtue of showing a card at all.

import { kgToLbs } from './weight';
import { summarizeSimpleEvent } from './logCopy';
import type { OccurredConfidence } from './utils';

// What the just-written record IS. Structured on purpose (see the header).
//
// 'event'  — a symptom or simple event: the type's label plus its stored B-010
//            confidence + window bounds, so the sentence renders the window the
//            row actually holds ("Vomit · found by 5:33 PM").
// 'weight' — a weight check: the sentence names the VALUE, not the time. The
//            number is the thing the owner just typed and the thing the old
//            white takeover never echoed back at them.
export type LoggedRecord =
  | {
      kind: 'event';
      /** EVENT_TYPES[type].label — "Vomit", "Loose stool", "Lethargy", … */
      typeLabel: string;
      /** The stored B-010 confidence. null = unclassified (migration 012: NOT a
       *  claim either way) and renders as a plain point, never as "seen". */
      confidence: OccurredConfidence | null;
      /** ISO window bounds as stored; both null for a witnessed point. */
      earliest: string | null;
      latest: string | null;
    }
  | { kind: 'weight'; weightKg: number };

// The card's sentence. `occurredAtIso` is the row's canonical point (the same
// value written to events.occurred_at).
//
// The unit string is "lbs", matching WeightTrendCard and WeightCard — the two
// places an owner already reads a weight in this app. The round-2 mock drew
// "12.4 lb"; a mock abbreviation does not outrank the app's own shipped unit,
// and a completion beat that spelled the unit differently from the trend card it
// feeds would read as a different app talking.
export function summarizeLoggedRecord(
  record: LoggedRecord,
  occurredAtIso: string,
  now?: Date,
): string {
  if (record.kind === 'weight') return `Weight · ${kgToLbs(record.weightKg)} lbs`;
  const occurredAt = new Date(occurredAtIso);
  return summarizeSimpleEvent({
    typeLabel: record.typeLabel,
    // An unclassified row (null) has no window to render, so it takes the plain
    // point path — 'witnessed' here is the RENDERING default, and nothing about
    // this call writes it back to the row. resolveNamedTimeEdit below is where
    // that distinction has teeth.
    confidence: record.confidence ?? 'witnessed',
    occurredAt,
    earliest: record.earliest ? new Date(record.earliest) : null,
    latest: record.latest ? new Date(record.latest) : null,
    now,
  });
}

// ── "Change time" ───────────────────────────────────────────────────────────
// What the card's time picker is allowed to write for a given record, or null
// when it may not offer one at all.
//
// THE TRAP THIS EXISTS TO CLOSE. The meal card's picker re-asserts
// `confidence: witnessed` on save, which is right for a meal — you see yourself
// put the bowl down, and the B-010 "found it" path never applies. Copying that
// onto this card would be a silent over-claim: a "Vomit · found by 5:33 PM" row
// is confidence='window' with latest=discovery, and stamping 'witnessed' over it
// asserts the owner SAW it happen. That is the same falsely-precise direction
// B-448 caught an edit form moving rows in, and the vet report reads the
// difference (`seen` vs `approximate`).
//
// So the write splits by what the record actually holds:
//
//   witnessed / estimated / unclassified
//     → move the point; OMIT the confidence key so the three B-010 columns keep
//       exactly what is stored (B-448's optional-by-omission contract). The
//       confidence CLASS is not what the owner is editing here.
//
//   window, open-ended (earliest === null — the "found by X" case)
//     → the point IS the discovery bound (deriveOccurredAt reduces a latest-only
//       window to latest), so moving one without the other would leave the row
//       self-contradictory and the card's own sentence false. Move BOTH: write
//       the window back with the new latest.
//
//   window, bounded ("between 2:00 PM and 5:33 PM")
//     → NO picker. One datetime control cannot express two bounds, and every
//       single-value interpretation silently discards or invents an edge. The
//       card renders without the affordance; the full Saw-it/Found-it control on
//       the event's edit screen is where a two-sided window gets changed.
//       Withholding an affordance is cheap; a lying one is not.
export interface NamedTimeEdit {
  occurredAtIso: string;
  /** Present only when the edit legitimately restates the B-010 columns. */
  confidence?: { value: OccurredConfidence; earliest: string | null; latest: string | null };
}

export function canChangeTime(record: LoggedRecord): boolean {
  if (record.kind === 'weight') return true;
  if (record.confidence !== 'window') return true;
  return record.earliest === null;
}

export function resolveNamedTimeEdit(record: LoggedRecord, next: Date): NamedTimeEdit | null {
  if (!canChangeTime(record)) return null;
  const iso = next.toISOString();
  if (record.kind === 'event' && record.confidence === 'window') {
    // Open-ended window only (canChangeTime already rejected the bounded case).
    // earliest stays null — the record never held a lower bound and this edit is
    // not the place to invent one.
    //
    // `value: record.confidence`, NOT a 'window' literal, and that is not a
    // stylistic preference: B-448's guard (lib/occurredAtConfidence.guard.test.ts)
    // holds that a found-it classification is a claim only the owner can make, so
    // it reaches the DB through a variable and never through a literal. This
    // branch does not DECIDE the row was discovered — it reads back a
    // classification the owner already asserted through the Saw-it/Found-it
    // control and moves its bound. Sourcing the value from the record is what
    // makes that provable rather than merely intended. TypeScript has narrowed it
    // to 'window' here, so the write is identical and the provenance is not.
    return { occurredAtIso: iso, confidence: { value: record.confidence, earliest: null, latest: iso } };
  }
  return { occurredAtIso: iso };
}

// The record's confidence + bounds AFTER an edit, for re-deriving the card's
// sentence without a round-trip to the DB. Returns the record unchanged when the
// edit did not restate the columns (the omit path), so the two can never disagree
// about what was written.
export function applyNamedTimeEdit(record: LoggedRecord, edit: NamedTimeEdit): LoggedRecord {
  if (record.kind === 'weight' || !edit.confidence) return record;
  return {
    ...record,
    confidence: edit.confidence.value,
    earliest: edit.confidence.earliest,
    latest: edit.confidence.latest,
  };
}
