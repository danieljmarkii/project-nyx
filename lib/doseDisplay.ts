// What a dose row says about its dose (CUL-1124): the drug's name, and the adherence
// chip's value. History's row reads both from here, and History v2's shared row (HV-6)
// imports them rather than restating them (spec §3.6).
//
// Client-only on purpose. `lib/medications.ts`, where the drug-naming rule these build
// on lives, is inside `generate-report`'s shipping closure, so a row helper added there
// would redeploy the vet report on merge (C-26, CUL-1147).

import { formatDrugLabel } from './medications';
import type { DoseAdherence } from '../components/log/AdherenceChipRow';

/**
 * THE name a dose row gives its drug: the item's (`formatDrugLabel`, the B-161 rule,
 * unchanged), else the name of the course the dose was logged against, else null, and
 * the row says only what it is ("Medication"). The item comes first because it is what
 * was picked for this dose; the course names the doses of a course typed in by hand
 * (B-154), which carry no item.
 *
 * Null is NOT a claim that the record names no medicine. An item or a course that has
 * not reached this device reads exactly like none, so a caller never prints "no
 * medicine named" over a null from here (the PM's ruling on CUL-1124, 2026-09-24).
 */
export function doseDrugLabel(dose: {
  genericName: string | null | undefined;
  brandName: string | null | undefined;
  regimenDrugName: string | null | undefined;
}): string | null {
  return formatDrugLabel(dose.genericName, dose.brandName)
    ?? (dose.regimenDrugName?.trim() || null);
}

/**
 * A stored adherence as the chip's value, or null. The column is TEXT on this device
 * and the chip looks its label up by value, so a value this build does not know (a
 * newer enum member, hydrated from the server) would throw inside a list row. It reads
 * as unrated instead: the record screen's narrowing (`app/event/[id].tsx`).
 */
export function asDoseAdherence(value: string | null | undefined): DoseAdherence | null {
  return value === 'given' || value === 'partial' || value === 'missed' || value === 'refused'
    ? value
    : null;
}
