// The demo account's record ("Cooper"), as a `ReportInput`. TEST-ONLY.
//
// CUL-1978 — the cold read that found the report printing thin evidence as reassurance read
// THIS record: `scripts/demo/demoStory.ts` is what the seed writes to production, so building
// the report's input from the same story pins the cold read's fixture in CI. A change to the
// story moves this fixture with it, and the report tests say what it then reads.
//
// `.testutil.ts`, not `.test.ts`: CI discovers suites by that glob, and nothing shipped
// imports this (see `expectedFailure.testutil.ts` for the same reasoning).
//
// Mapped the way `index.ts` maps production rows, with the seed's own facts: both foods are
// `source='user'` / `ai_extraction_status='manual'`, so `ai_extraction_confidence` is NULL;
// no medication, no photo, no free-fed bowl.
import { buildDemoStory, materializeDate, materializeInstantIso } from '../../../scripts/demo/demoStory.ts'
import type { ReportInput } from './report.ts'

export const COOPER_NOW = '2026-10-16T20:00:00Z'

// The AUDIENCE is the caller's, not this file's: `guards/reportLookPull.test.ts` holds the owner
// arm to one construction site in shipped code, and this directory's non-test files are what it
// scans. Each test states who is reading.
export function cooperInput(now: string = COOPER_NOW): Omit<ReportInput, 'audience'> {
  const nowMs = Date.parse(now)
  const story = buildDemoStory({
    userId: '00000000-0000-4000-8000-000000000001',
    petId: '00000000-0000-4000-8000-0000000000c0',
    timezone: 'America/Chicago',
  })
  const foodById = new Map(story.foods.map((f) => [f.id, f]))
  const events: ReportInput['events'] = story.events
    .filter((e) => e.kind !== 'weight_check')
    .map((e) => {
      const occurredAt = materializeInstantIso(e.time, nowMs)
      const f = e.meal ? foodById.get(e.meal.foodId)! : null
      return {
        id: e.eventId,
        type: e.kind,
        occurredAt,
        occurredAtConfidence: e.occurredAtConfidence,
        occurredAtEarliest: null,
        occurredAtLatest: null,
        severity: e.severity,
        notes: null,
        loggedAt: occurredAt,
        meal:
          e.meal && f
            ? {
                foodItemId: e.meal.foodId,
                intakeRating: e.meal.intakeRating,
                quantity: null,
                foodType: e.meal.foodType,
                format: f.format as never,
                primaryProtein: e.meal.primaryProtein,
                proteins: e.meal.proteins,
                ingredientsNotes: null,
                extractionConfidence: null,
                brand: f.brand,
                productName: f.productName,
              }
            : null,
      }
    })
  const t = story.trial
  const trialFood = foodById.get(t.primaryFoodId)!
  return {
    now,
    engineFlags: { on: [], readOk: true },
    timezone: story.timezone,
    pet: { id: story.petId, name: story.pet.name, species: 'dog', breed: story.pet.breed, sex: 'male', dateOfBirth: '2020-03-01', weightKg: story.pet.weightKg },
    ownerName: 'Demo Owner',
    events,
    aiAnalyses: [],
    weightChecks: story.events
      .filter((e) => e.kind === 'weight_check')
      .map((e) => ({ eventId: e.eventId, weightKg: e.weight!.weightKg, occurredAt: materializeInstantIso(e.time, nowMs) })),
    doses: [],
    medications: [],
    dietTrials: [
      {
        id: t.id,
        foodItemId: t.primaryFoodId,
        startedAt: materializeDate(t.startedDayOffset, nowMs),
        targetDurationDays: t.targetDurationDays,
        status: 'active',
        completedAt: null,
        endedAt: null,
        vetName: story.visit.vetName,
        foodLabel: t.foodLabel,
        primaryProtein: trialFood.primaryProtein,
        proteins: trialFood.proteins,
        ingredientsNotes: null,
        extractionConfidence: null,
        targetProtein: t.targetProtein,
        targetProteinSetAt: `${materializeDate(t.targetProteinSetDayOffset, nowMs)}T12:00:00Z`,
        indication: 'gi',
        allowedFoods: story.allowedFoods.map((a) => {
          const af = foodById.get(a.foodId)!
          return {
            foodItemId: a.foodId,
            foodLabel: a.foodLabel,
            role: a.role,
            allowedFrom: materializeDate(a.allowedFromDayOffset, nowMs),
            allowedUntil: null,
            primaryProtein: af.primaryProtein,
            brand: af.brand,
            productName: af.productName,
            proteins: af.proteins,
            ingredientsNotes: null,
            extractionConfidence: null,
          }
        }),
      },
    ],
    vetVisits: [{ visitedAt: materializeDate(story.visit.visitedDayOffset, nowMs), clinicName: story.visit.clinicName, vetName: story.visit.vetName, reason: story.visit.reason }],
    feedingArrangements: [],
    conditions: [],
  }
}
