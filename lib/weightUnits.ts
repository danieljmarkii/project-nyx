// Weight unit conversion: the one rounding rule for pounds and kilograms. No imports, so
// a pure module (the shared day row's pipeline, `lib/spineNode.ts`) can name a weight
// without pulling `lib/weight.ts`'s database, sync and Supabase imports along. Moved here
// from `lib/weight.ts` (History v2 HV-6, CUL-1163), which re-exports all three.
//
// Owners enter and read pounds; kilograms is the canonical storage unit
// (pets.weight_kg + weight_checks.weight_kg). Extracted from EditPetModal (its original
// home) so the log step and the profile edit share one rounding rule and can't drift.
// kgToLbs returns a display STRING rounded to 0.1 lb (the pre-fill value); lbsToKg
// returns a NUMBER rounded to 2 dp (the stored value, matching NUMERIC(5,2)).
export function kgToLbs(kg: number): string {
  return String(kgToLbsNum(kg));
}

// Numeric sibling of kgToLbs — the display value as a NUMBER (rounded to 0.1 lb),
// for trend math where we need to subtract/compare readings rather than show one.
// Sharing the one rounding rule means the sparkline points, the big number, and the
// "x lbs since y" delta are all derived from the same rounded value — so the delta
// the owner reads is exactly latest − earliest of the numbers drawn (no off-by-0.1
// mismatch between the chart and the caption).
export function kgToLbsNum(kg: number): number {
  return Math.round(kg * 2.20462 * 10) / 10;
}

export function lbsToKg(lbs: number): number {
  return Math.round((lbs / 2.20462) * 100) / 100;
}

// What an Edit profile save does with the weight field (CUL-1283). The form shows the
// stored kilograms as pounds rounded to 0.1 lb, and converting that display back lands
// on a different NUMERIC(5,2) value for 78% of stored weights (3.73 kg -> "8.2" ->
// 3.72 kg). So a field still reading what the seed displayed is UNTOUCHED, and the save
// leaves the stored value alone rather than writing its rounded echo: a rename must not
// move the reference weight, and since migration 072 each move also mints a
// pet_weight_displacements row whose only content is rounding.
//
// Compared numerically against the SEED's display, not a touched flag, so typing and
// then restoring the same number ("8.2" -> "8" -> "8.2", or "8.20") is still untouched.
// And against the seed, not the live store: a weigh-in that lands while the form is
// open re-points pets.weight_kg, and an untouched field must not write the older value
// back over it.
//
// `write: false` means omit weight_kg from the update. `write: true` with null clears
// it (an emptied field, or one that does not parse, as before this fix).
export type WeightFieldSave = { write: false } | { write: true; weightKg: number | null };

export function resolveWeightFieldSave(weightStr: string, seededKg: number | null): WeightFieldSave {
  const trimmed = weightStr.trim();
  const lbs = trimmed ? parseFloat(trimmed) : null;
  const typedKg = lbs != null && !isNaN(lbs) ? lbsToKg(lbs) : null;
  if (seededKg == null) {
    return typedKg == null ? { write: false } : { write: true, weightKg: typedKg };
  }
  if (lbs != null && lbs === kgToLbsNum(seededKg)) return { write: false };
  return { write: true, weightKg: typedKg };
}
