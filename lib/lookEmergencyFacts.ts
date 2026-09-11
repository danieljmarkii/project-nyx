// What the record can settle for the emergency door, read from the leaf rows
// (CUL-871 / N-4a; docs/nyx-daily-look-requirements.md §4.6, T-4).
//
// SEPARATE FROM `lib/lookEmergency.ts` ON PURPOSE. That module is the copy and the
// collapse rule and is pure — the test that feeds it each condition should not have to
// stand up a database to do it. This one is the read, and nothing else.
//
// ── WHY 24 HOURS AND NOT "TODAY" ─────────────────────────────────────────────
// Every threshold in §4.6 is written in hours ("not eating a full meal in 24 hours",
// "vomiting again within 24 hours"). Home's `todayEvents` is bounded at LOCAL MIDNIGHT,
// so at 9 AM it holds nine hours — and a dog that vomited at 10 PM and again at 8 AM
// would meet the threshold with only one of the two rows in view. Under-firing is the
// direction §4.6 exists to prevent, so the door gets its own bounded read rather than
// borrowing a window that means something else.
//
// ── WHAT IT MAY READ ─────────────────────────────────────────────────────────
// Leaf rows only: `vomit` and `lethargy` events. NOT look words (T-5 — a look enters no
// engine, count, floor or coverage line, and this door is a read of the record).
//
// ── AND WHY IT DOES NOT READ MEALS AT ALL ────────────────────────────────────
// The first cut derived the intake fact here, from `meals.intake_rating === 'refused'`
// in the last 24 hours, under a header claiming it was "one predicate for intake …
// the same column they read". Reading the same COLUMN is not the same PREDICATE, and
// the adversarial pass broke it four ways in one probe run:
//
//   • a cat who PICKED at every bowl for 24 hours, with a lethargy row, read the
//     conditional — `picked` and `some` were invisible, and T-20's own fact is
//     "refused OR picked" (the delay direction, which §4.6 exists to prevent);
//   • ONE refused breakfast followed by a full dinner printed "Call your vet today."
//     under a threshold that reads *Not eating for a day*;
//   • a refused pill-pocket TREAT printed it too — the query had no `food_type` and no
//     free-fed filter, where the shipped detectors use `qualifyingIntakeMeals`
//     (`lib/analytics.ts`), so Sam's daily pill pocket would have cried wolf daily;
//   • a refusal 30 hours old made the threshold UNMET — the longer the record's last
//     positive fact said she had not eaten, the more the door reassured.
//
// A safety page that cries wolf daily is one an owner stops believing, and that is the
// same failure as the delay. So the intake fact is NOT derived here. Both of the door's
// intake registers come from elsewhere and are folded in by `withTrialRefusal`: the trial
// card's own (`isAnimalNotEating`, the predicate CUL-871 named) and the RECORD-LOCAL arm
// that speaks for a pet with no trial — two of the last three QUALIFYING meals (rated,
// non-treat, non-free-fed) refused or picked inside its own recency bound, which lives in
// `lib/lookWithheld.ts` (N-4b / CUL-873) and is shared with the Noticed card so the two
// can never disagree about whether this animal is eating.

import { getDb } from './db';
import type { EmergencyFacts } from './lookEmergency';

/** The window every threshold in §4.6 is written against. */
export const EMERGENCY_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * The three facts, for one pet, over the last 24 hours.
 *
 * Throws nothing: a failed read returns `null`, which the door reads as "not answered"
 * and fails CLOSED on (`resolveEmergencyDoor`) — a database error must never quietly
 * become a reassuring conditional.
 */
export async function loadEmergencyFacts(
  petId: string,
  nowMs: number = Date.now(),
): Promise<EmergencyFacts | null> {
  const since = new Date(nowMs - EMERGENCY_WINDOW_MS).toISOString();
  try {
    const rows = await getDb().getAllAsync<{ event_type: string }>(
      `SELECT e.event_type
         FROM events e
        WHERE e.pet_id = ?
          AND e.deleted_at IS NULL
          AND e.occurred_at >= ?`,
      [petId, since],
    );
    return {
      // The caller supplies this one (see the header) — `withTrialRefusal` folds in the
      // trial register, and the record-local arm is N-4b's.
      refusedRecently: false,
      vomitCount24h: rows.filter((r) => r.event_type === 'vomit').length,
      lethargyRecently: rows.some((r) => r.event_type === 'lethargy'),
    };
  } catch (e) {
    // Said out loud rather than swallowed (the house rule), and null rather than a
    // zeroed record: all-false is a real quiet record, and this is not one.
    console.warn('[lookEmergency] facts read failed:', e);
    return null;
  }
}

/**
 * Fold in the intake facts this read deliberately does not derive.
 *
 * TWO REGISTERS, ONE OR: the diet trial's own (`isAnimalNotEating`, resolved by the
 * caller) and the record-local arm (`intakeArm` over the qualifying meals, CUL-873). A
 * refusal either register can see is a refusal, and neither may cancel the other.
 *
 * ── WHY THE SECOND ONE IS HERE NOW ───────────────────────────────────────────
 * N-4a shipped the trial register alone with a comment promising the record-local arm
 * "when N-4b exports it", and N-4b's own module header then claimed the door had it —
 * "one predicate, four consumers". The adversarial pass checked rather than believed, and
 * found nothing outside `lib/lookWithheld.ts` importing `intakeArm`. The measured cost of
 * the gap: a non-trial cat with two refused bowls today had her Noticed card WITHHOLD its
 * words, while the emergency door one tap away still printed *Not eating for a day* and
 * *Subdued and not eating a full meal in 24 hours* as UNMET conditionals — the card and
 * the door disagreeing about whether the same animal was eating, which is the exact split
 * "one predicate" exists to prevent.
 *
 * ── WHY IT TAKES A BOOLEAN AND NOT THE MEAL ROWS ─────────────────────────────
 * The first wiring imported `intakeArm` here, which dragged `lib/analytics` — and through
 * it `feedingArrangements` → `sync` → `supabase` — into a module whose whole point is that
 * it is a small read with no chain behind it (C-26: a module's boundary is what imports
 * it). The caller already holds both registers and already imports `intakeArm` for the
 * card's own withholding, so it evaluates the arm and hands over the answer. ONE predicate
 * is still one predicate: the card cannot compute the door's refusal differently from its
 * own, because it calls the same function once for both.
 *
 * Every arm is a POSITIVE fact or nothing — never ignorance (T-20). A caller that cannot
 * tell passes `false`, because a door that escalated on unloaded facts would read *Call
 * your vet today.* forever for a healthy animal whose facts failed to load once. The
 * caller resolving an unanswered meal read to "no evidence" is deliberate and happens at
 * the call site, rather than this function guessing which way ignorance should fall.
 */
export function withIntakeRefusal(
  facts: EmergencyFacts | null,
  trialNotEating: boolean,
  recordLocalRefusal: boolean = false,
): EmergencyFacts | null {
  if (facts === null) return null;
  const refused = trialNotEating || recordLocalRefusal;
  return refused ? { ...facts, refusedRecently: true } : facts;
}
