// Shared building blocks for the scenario files (Engines v3 PR-15, CUL-508).
//
// The foods are invented, named by protein, and none of them is a real product. The logging
// defaults are the "engaged owner": they log most of what they see, find some piles rather
// than witness them, photograph a quarter of vomits, and back-fill one row in ten. Each
// scenario overrides only what it exists to test, so a difference between two scenarios is
// the thing being tested and nothing else.

import type { FeedingSpec, FoodSpec, LoggingSpec } from './spec.ts'

export const FOOD = {
  chickenDry: { id: 'chicken-dry', protein: 'chicken', foodType: 'dry' },
  salmonWet: { id: 'salmon-wet', protein: 'salmon', foodType: 'wet' },
  beefWet: { id: 'beef-wet', protein: 'beef', foodType: 'wet' },
  turkeyDry: { id: 'turkey-dry', protein: 'turkey', foodType: 'dry' },
  lambDry: { id: 'lamb-dry', protein: 'lamb', foodType: 'dry' },
  tunaWet: { id: 'tuna-wet', protein: 'tuna', foodType: 'wet' },
  // The textbook hidden exposure: a "duck" food whose label also lists chicken (B-351).
  duckWetWithChicken: { id: 'duck-wet', protein: 'duck', alsoContains: ['chicken'], foodType: 'wet' },
  whitefishWet: { id: 'whitefish-wet', protein: 'whitefish', foodType: 'wet' },
  rabbitTrial: { id: 'rabbit-trial', protein: 'rabbit', foodType: 'wet' },
  chickenTreat: { id: 'chicken-treat', protein: 'chicken', foodType: 'treat' },
  beefTreat: { id: 'beef-treat', protein: 'beef', foodType: 'treat' },
} as const satisfies Record<string, FoodSpec>

export const ENGAGED_OWNER: LoggingSpec = {
  pSymptom: 0.85,
  pMeal: 0.9,
  pRate: 0.3,
  pFound: 0.15,
  pDuplicate: 0.03,
  pDuplicateCleanedUp: 0.7,
  pBackfill: 0.1,
  pPhoto: 0.25,
}

export function logging(overrides: Partial<LoggingSpec> = {}): LoggingSpec {
  return { ...ENGAGED_OWNER, ...overrides }
}

export type MealFeeding = Extract<FeedingSpec, { kind: 'meals' }>

/** Two meals a day, 90% one food: the most common way a cat is fed. */
export function stapleFeeding(): MealFeeding {
  return {
    kind: 'meals',
    hours: [7.5, 18],
    choose: 'weighted',
    foods: [
      { ...FOOD.chickenDry, weight: 0.9 },
      { ...FOOD.salmonWet, weight: 0.1 },
    ],
  }
}

/** Six proteins, one per day: the rotation the Engineering lens's null probe used (CUL-1268). */
export function rotatingFeeding(): MealFeeding {
  return {
    kind: 'meals',
    hours: [7.5, 18],
    choose: 'daily',
    foods: [FOOD.chickenDry, FOOD.salmonWet, FOOD.beefWet, FOOD.turkeyDry, FOOD.lambDry, FOOD.tunaWet].map((f) => ({ ...f, weight: 1 })),
  }
}

export const CI_SEEDS = [1, 2, 3]
export const START = '2026-03-01' // crosses the US DST change on 2026-03-08
