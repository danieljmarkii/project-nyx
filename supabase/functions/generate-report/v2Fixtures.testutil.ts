// Synthetic records for the v2 predicates (CUL-2289, VR2-9). TEST-ONLY: `.testutil.ts` keeps CI's
// suite glob off it, and nothing shipped imports it (see `cooperDemo.testutil.ts`).
//
// Each builder returns a `ReportInput` that `assembleReport` turns into a snapshot, so every claim
// a test makes is about a snapshot production could hand the predicates (C-35: a fixture shaped
// unlike production is green over a shape production never creates). Times are UTC noon-ish
// instants on a fixed `now`; the zone is UTC so a day key and an instant agree (C-29), and the
// suite also runs under the non-UTC CI job.
import type { ReportEventInput, ReportInput } from './report.ts'
import type { ReportLookInput } from './noticed.ts'

export const V2_NOW = '2026-10-16T20:00:00Z'
const NOW_MS = Date.parse(V2_NOW)
const DAY = 86_400_000

/** The instant `daysAgo` days before `now`, at `hour` UTC. */
export function at(daysAgo: number, hour = 12): string {
  const d = new Date(NOW_MS - daysAgo * DAY)
  d.setUTCHours(hour, 0, 0, 0)
  return d.toISOString()
}
export function dayKey(daysAgo: number): string {
  return at(daysAgo).slice(0, 10)
}

let seq = 0
const id = (p: string): string => `${p}-${String(++seq).padStart(5, '0')}`

export function symptom(type: string, daysAgo: number, hour = 9): ReportEventInput {
  const t = at(daysAgo, hour)
  return { id: id(type), type, occurredAt: t, occurredAtConfidence: 'witnessed', occurredAtEarliest: null, occurredAtLatest: null, severity: null, notes: null, loggedAt: t, meal: null }
}

export function meal(daysAgo: number, rating: 'all' | 'most' | 'some' | 'little' | 'refused' | null, hour = 18): ReportEventInput {
  const t = at(daysAgo, hour)
  return {
    id: id('meal'),
    type: 'meal',
    occurredAt: t,
    occurredAtConfidence: 'witnessed',
    occurredAtEarliest: null,
    occurredAtLatest: null,
    severity: null,
    notes: null,
    loggedAt: t,
    meal: {
      foodItemId: 'food-trial',
      intakeRating: rating as never,
      quantity: null,
      foodType: 'meal',
      format: 'dry' as never,
      primaryProtein: 'soy',
      brand: 'Vetline',
      productName: 'Hydrolysed Soy',
    },
  }
}

export function look(daysAgo: number, words: string[]): ReportLookInput {
  const t = at(daysAgo, 20)
  return {
    eventId: id('look'),
    localDay: dayKey(daysAgo),
    createdAt: t,
    occurredAt: t,
    outcome: words.length > 0 ? 'observed' : 'nothing_unusual',
    words,
    vocabVersion: 1,
    notes: null,
  }
}

/** Every day from `from` days ago to `to` days ago (inclusive), one meal at 18:00. */
export function dailyMeals(from: number, to: number, rating: 'all' | null = 'all'): ReportEventInput[] {
  const out: ReportEventInput[] = []
  for (let d = from; d >= to; d--) out.push(meal(d, rating))
  return out
}

export function baseInput(over: Partial<ReportInput> = {}): ReportInput {
  return {
    now: V2_NOW,
    timezone: 'UTC',
    engineFlags: { on: [], readOk: true },
    audience: { kind: 'vet' },
    pet: { id: 'pet-v2', name: 'Fixture', species: 'dog', breed: null, sex: 'male', dateOfBirth: '2020-03-01', weightKg: 30 },
    ownerName: 'Fixture Owner',
    requestedWindow: { startDate: dayKey(55), endDate: dayKey(0) },
    events: [],
    aiAnalyses: [],
    weightChecks: [],
    doses: [],
    medications: [],
    dietTrials: [],
    vetVisits: [],
    feedingArrangements: [],
    conditions: [],
    ...over,
  } as ReportInput
}

/** An active skin trial started 60 days ago. */
export function skinTrial(indication: 'skin' | 'gi' | 'other' = 'skin'): ReportInput['dietTrials'][number] {
  return {
    id: 'trial-v2',
    foodItemId: 'food-trial',
    startedAt: dayKey(60),
    targetDurationDays: 84,
    status: 'active',
    completedAt: null,
    endedAt: null,
    vetName: null,
    foodLabel: 'Vetline Hydrolysed Soy',
    primaryProtein: 'soy',
    indication,
  }
}

/**
 * Cooper's shape (v2 spec R-11): a dog on a skin trial, itching about once every five days for
 * seven weeks, every day logged with a meal. With `jump`, the itching rises to five entries in the
 * last 7 days (Dr. Chen's counterexample, spec §18): the rise must keep the flag in the band.
 */
export function itchingSkinTrial(opts: { jump: boolean; indication?: 'skin' | 'gi' | 'other' }): ReportInput {
  const events: ReportEventInput[] = [...dailyMeals(55, 0)]
  for (let d = 50; d >= 8; d -= 5) events.push(symptom('itch', d))
  if (opts.jump) for (const d of [6, 5, 4, 2, 1]) events.push(symptom('itch', d))
  else events.push(symptom('itch', 3))
  return baseInput({ events, dietTrials: [skinTrial(opts.indication ?? 'skin')] })
}

/**
 * Olive (CUL-2323's fixture, canonical id `looks-only`): an 11-year-old cat, six weeks of Noticed
 * answers and meals, no symptom entry; "sleeping more" marked on 6 days, 3 meals not finished on 3
 * days, last weighed 45 days ago.
 */
export function olive(over: { sleepingDays?: number; unfinishedDays?: number; weighedDaysAgo?: number | null; dateOfBirth?: string } = {}): ReportInput {
  const sleeping = over.sleepingDays ?? 6
  const unfinished = over.unfinishedDays ?? 3
  const events: ReportEventInput[] = []
  for (let d = 41; d >= 0; d--) events.push(meal(d, d >= 1 && d <= unfinished ? 'some' : 'all'))
  const looks: ReportLookInput[] = []
  for (let d = 41; d >= 0; d--) looks.push(look(d, d < sleeping * 2 && d % 2 === 0 ? ['sleeping_more'] : []))
  const weighed = over.weighedDaysAgo === undefined ? 45 : over.weighedDaysAgo
  return baseInput({
    pet: { id: 'pet-olive', name: 'Olive', species: 'cat', breed: null, sex: 'female', dateOfBirth: over.dateOfBirth ?? '2015-06-01', weightKg: 4.2 },
    requestedWindow: { startDate: dayKey(41), endDate: dayKey(0) },
    events,
    lookRows: looks,
    lookRowsComplete: true,
    weightChecks: weighed === null ? [] : [{ eventId: 'w-olive', weightKg: 4.2, occurredAt: at(weighed, 10) }],
  })
}

/** Juniper (canonical id `new-account-4-days`): four days of record, two vomits on day 1, no weight. */
export function juniper(days = 4): ReportInput {
  const events: ReportEventInput[] = [symptom('vomit', days - 1, 8), symptom('vomit', days - 1, 15)]
  for (let d = days - 1; d >= 0; d--) events.push(meal(d, 'all'))
  return baseInput({
    pet: { id: 'pet-juniper', name: 'Juniper', species: 'cat', breed: null, sex: 'female', dateOfBirth: '2023-01-01', weightKg: null },
    requestedWindow: null,
    events,
  })
}
