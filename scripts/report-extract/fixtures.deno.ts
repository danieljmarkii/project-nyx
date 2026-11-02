// The fixtures the clinic-AI extraction test reads (CUL-2292, row VR2-12; v2 spec §8). Every v2
// fixture the phone reflow is held to (`scripts/report-phone/fixtures.deno.ts`), plus the one the
// spec names: a small cat whose weight goes 1.95 → 1.86 kg, the pair a one-decimal render once
// printed as "1.9 → 1.9 kg" (CUL-2284). Each is a snapshot a production caller can hand over,
// built through `assembleReport` (C-35).
import { assembleReport, type ReportInput, type ReportSnapshot, type ReportWeightCheckInput } from '../../supabase/functions/generate-report/report.ts'
import { at, baseInput, dailyMeals, dayKey, symptom } from '../../supabase/functions/generate-report/v2Fixtures.testutil.ts'
import { v2DocFixtures } from '../report-phone/fixtures.deno.ts'

/**
 * `small-cat-*`: Pip, a young cat weighed at 1.95 kg and then at 1.86 kg, vomiting twice. Sheet 1
 * prints the latest weight only (ruling W, spec §5.8), so the pair is two records: one weighed
 * before the loss (`small-cat-1-95`) and one after it (`small-cat-1-86`). Each must read back at
 * two decimals, never as "1.9", and with its pound twin.
 */
export function smallCat(latest: 1.95 | 1.86): ReportInput {
  const weighIns: ReportWeightCheckInput[] = [{ eventId: 'w-sc-1', weightKg: 1.95, occurredAt: at(40, 9), source: 'home_scale' }]
  if (latest === 1.86) weighIns.push({ eventId: 'w-sc-2', weightKg: 1.86, occurredAt: at(2, 9), source: 'home_scale' })
  const meals = dailyMeals(44, 0).map((m) => ({ ...m, meal: { ...m.meal!, foodItemId: 'food-pip', primaryProtein: 'chicken', brand: 'Royal Canin', productName: 'Kitten' } }))
  return baseInput({
    pet: { id: 'pet-pip', name: 'Pip', species: 'cat', breed: null, sex: 'female', dateOfBirth: '2025-11-01', weightKg: latest } as never,
    requestedWindow: { startDate: dayKey(44), endDate: dayKey(0) },
    events: [symptom('vomit', 12, 7), symptom('vomit', 4, 6), ...meals],
    weightChecks: weighIns,
    weightHistory: weighIns,
  } as Partial<ReportInput>)
}

/** The weight each small-cat record must print on sheet 1, in the words `weightText` uses. */
export const SMALL_CAT_WEIGHTS: Record<string, string> = {
  'small-cat-1-95': '1.95 kg (4.3 lb)',
  'small-cat-1-86': '1.86 kg (4.1 lb)',
}

export function extractionFixtures(): Array<[string, ReportSnapshot]> {
  return [...v2DocFixtures(), ['small-cat-1-95', assembleReport(smallCat(1.95))], ['small-cat-1-86', assembleReport(smallCat(1.86))]]
}
