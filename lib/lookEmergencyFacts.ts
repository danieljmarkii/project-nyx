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
// same failure as the delay. So the intake fact is NOT derived here. It comes from the
// caller, as the trial card's own refusal register (`isAnimalNotEating`), which is the
// predicate CUL-871 named — and T-20 puts the RECORD-LOCAL arm, the one that speaks for
// a pet with no trial, in `lib/lookWithheld.ts` (N-4b / CUL-873): two of the last three
// QUALIFYING meals (rated, non-treat, non-free-fed) refused or picked, within the
// intake detector's own recency bound, on the exported qualifying-set helper with the
// parity test and the feeder-frequency fixtures E-5 requires before that threshold is
// trusted. Until then a pet with no trial simply does not collapse the intake rows —
// the honest permanent-threshold state `subdued_hiding` and `wont_drink` already carry
// — rather than collapsing them on a predicate this module invented.

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
 * Fold in the intake fact this read deliberately does not derive: the diet trial's own
 * refusal register (`isAnimalNotEating`), resolved by the caller.
 *
 * It is the ONLY intake fact the door has in v1, and it is a POSITIVE fact or nothing —
 * never ignorance (T-20: "the withheld state is triggered by a positive intake fact,
 * never by ignorance"). A caller that cannot tell passes `false`, because a door that
 * escalated on an unloaded trial card would read *Call your vet today.* forever for a
 * healthy animal whose facts failed to load once.
 */
export function withTrialRefusal(
  facts: EmergencyFacts | null,
  trialNotEating: boolean,
): EmergencyFacts | null {
  if (facts === null) return null;
  return trialNotEating ? { ...facts, refusedRecently: true } : facts;
}
