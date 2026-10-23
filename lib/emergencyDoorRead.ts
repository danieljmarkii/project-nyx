// The emergency door's read, composed ONCE for both doors that open the sheet: the daily
// look's (`LookHeader`) and the Signal's foot (CUL-1838).
//
// Two doors over one page must read the same record. The look's door folded in two intake
// registers by hand — the trial's own refusal and the record-local arm (`doorRecordRefusal`,
// CUL-873 / CUL-1372) — and a second door composing its own would be the C-34 drift waiting
// to happen: one door saying "Call your vet today" while the other, one scroll away, still
// listed the condition as unmet. So the composition lives here and both call it.

import { loadEmergencyFacts, withIntakeRefusal } from './lookEmergencyFacts';
import { doorRecordRefusal, loadLookWithheldFacts, type LookWithheldFacts } from './lookWithheld';
import type { EmergencyFacts, EmergencyRead } from './lookEmergency';

/**
 * PURE: the record's facts plus both intake registers → the sheet's read. `trialNotEating`
 * counts only as a positive fact (`=== true`, T-20); facts for another pet count as nothing
 * (`doorRecordRefusal`'s own C-9 check). Facts that did not load are a FAILED read, which
 * the sheet fails closed on.
 */
export function composeEmergencyRead(
  pet: { id: string },
  facts: EmergencyFacts | null,
  trialNotEating: boolean | null,
  withheld: LookWithheldFacts | null,
): EmergencyRead {
  const merged = withIntakeRefusal(facts, trialNotEating === true, doorRecordRefusal(pet, withheld));
  return merged ? { status: 'ready', facts: merged } : { status: 'failed' };
}

/** The read for a door that holds no withheld facts of its own (the Signal's foot). */
export async function loadEmergencyRead(
  pet: { id: string; species: string | null | undefined },
  trialNotEating: boolean | null,
): Promise<EmergencyRead> {
  const [facts, withheld] = await Promise.all([
    loadEmergencyFacts(pet.id),
    loadLookWithheldFacts(pet, trialNotEating).catch((e) => {
      // The record-local arm unanswered is "no evidence" on a door (T-20), said aloud.
      console.warn('[emergencyDoorRead] withheld read failed:', e);
      return null;
    }),
  ]);
  return composeEmergencyRead(pet, facts, trialNotEating, withheld);
}
