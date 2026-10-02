# Edit profile stops re-saving a rounded weight (CUL-1283)

**Date:** 2026-09-26

Shipped via #929. Client only, no schema.

## What was wrong

`components/profile/EditPetModal.tsx` seeded the weight field with `kgToLbs(weight_kg)`, a display string rounded to 0.1 lb, and wrote `lbsToKg(parseFloat(weightStr))` back on every save, whether or not the owner touched the field. Of every NUMERIC(5,2) weight from 0.01 to 90.00 kg, 7,016 of 9,000 come back different through that round trip. A rename therefore moved Nyx's 3.73 kg clinic weight to 3.72 kg. Since migration 072 (CUL-694), each of those moves also fires `trg_pets_preserve_displaced_weight` and writes a `pet_weight_displacements` row holding nothing but rounding.

## What shipped

- `resolveWeightFieldSave(weightStr, seededKg)` in `lib/weightUnits.ts`. It is pure and has no imports; the module is outside every Edge Function's shipping closure, so nothing redeploys. It returns `{ write: false }` when the field still reads, as a number, what the seed displayed, and `{ write: true, weightKg }` otherwise.
- `EditPetModal` keeps `seededWeightKg` from the moment it seeds the form. An untouched field leaves `weight_kg` out of both the PostgREST update and the `updatePet` store patch.
- `lib/weightUnits.test.ts`: a sweep over 0.01 to 90.00 kg that pins both halves (7,016 values drift through the round trip, and an untouched field writes none of them), plus the edit, clear and first-weight cases.
- `components/profile/EditPetModal.test.tsx` (new): renaming a 3.73 kg pet sends no `weight_kg`, and neither does typing a value away and back. Edited and cleared weights still save. Proven by mutation: putting the old unconditional write back makes both untouched tests fail with `Received value: 3.72`.

## Decisions

- **Omit rather than echo.** Leaving the column out means the trigger never evaluates, and the store keeps its exact value without a second code path.
- **Compare numbers, not a touched flag.** The issue suggested the DOB-precision pattern (a touched flag). A flag reports "edited" after an owner types and then restores the same number, and that re-saves the rounded value. Comparing to the seed's display avoids this, and `8.20` also counts as untouched.
- **Compare against the seed, not the live store.** If a weigh-in re-points `pets.weight_kg` while the form is open, an untouched field must not write the older value back over it.
- **Kept on purpose:** retyping the displayed number, for example "8.2" over a stored 3.73, keeps 3.73. At the field's precision they are the same weight, and the stored value is the more precise one.

## Falsification attempts (Engineer / Data Scientist)

- Every stored value from 0.01 to 90.00 kg, untouched: no write. Held.
- Edit then revert (`8.2 → 8 → 8.2`): no write. Held.
- A weigh-in lands mid-edit: the seed is captured once, when the modal becomes visible, so the untouched save omits the column and the weigh-in stands. Held by construction; there is no test for it because the modal re-seeds only on `visible`.
- An emptied field on a weighted pet still clears the weight (`null`), unchanged from before.

## Residuals

- CUL-1286 (filed): an edited entry that does not parse (a lone "." on the decimal pad) still clears the weight, and the form has no upper bound like the log step's 500 lb guard. Both predate this change.
- Displacement rows already written before this ships still hold rounding noise. Migration 072's header tells EN-8 (CUL-1135) to discount them.
