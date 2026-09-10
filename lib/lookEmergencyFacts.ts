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
// Leaf rows only: `vomit` and `lethargy` events, and meals the owner rated `refused`.
// NOT look words (T-5 — a look enters no engine, count, floor or coverage line, and
// this door is a read of the record), and NOT the absence of meals: "no meal logged in
// 24 hours" is a fact about logging, not about eating (the intake anti-pattern), and a
// door that escalated on it would fire on every owner who had a busy Tuesday.
//
// One predicate for intake (§4.5): the meal row's own rating, which is what
// `intake_decline`, `feline_reduced_intake` and the trial card's refusal register all
// read. This adds no second intake predicate — it reads the same column they do.

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
    const rows = await getDb().getAllAsync<{ event_type: string; intake_rating: string | null }>(
      `SELECT e.event_type, m.intake_rating
         FROM events e
         LEFT JOIN meals m ON m.event_id = e.id
        WHERE e.pet_id = ?
          AND e.deleted_at IS NULL
          AND e.occurred_at >= ?`,
      [petId, since],
    );
    return {
      refusedRecently: rows.some((r) => r.intake_rating === 'refused'),
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

/** Fold in a fact the caller holds that this read cannot see — the diet trial's own
 *  refusal register (`isAnimalNotEating`), which is a windowed read of the SAME meal
 *  rows plus the trial's span. OR, never AND: a refusal either register can see is a
 *  refusal, and neither may cancel the other (the R1 stand-down asymmetry). */
export function withTrialRefusal(
  facts: EmergencyFacts | null,
  trialNotEating: boolean,
): EmergencyFacts | null {
  if (facts === null) return null;
  return trialNotEating ? { ...facts, refusedRecently: true } : facts;
}
