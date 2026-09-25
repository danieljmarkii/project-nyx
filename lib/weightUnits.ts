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
