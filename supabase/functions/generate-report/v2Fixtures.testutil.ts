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
  if (opts.jump) {
    for (const ms of steadyInstants(50, 8)) events.push(symptomAt('itch', ms))
    for (const d of [6, 5, 4, 2, 1]) events.push(symptom('itch', d))
  } else {
    for (const ms of steadyInstants(50, 0.5)) events.push(symptomAt('itch', ms))
  }
  return baseInput({ events, dietTrials: [skinTrial(opts.indication ?? 'skin')] })
}

/**
 * Exactly every 84 hours (twice a week) from `fromDays` back to `toDays` back. Any 7-day window
 * holds exactly two entries on two days, so no replayed week-over-week comparison ever reads a rise:
 * the only shape `foldedWorsening`'s four-week replay calls steady (CUL-2289 pass 2).
 */
export function steadyInstants(fromDays: number, toDays: number): number[] {
  const out: number[] = []
  for (let ms = NOW_MS - fromDays * DAY; ms <= NOW_MS - toDays * DAY; ms += 84 * 3_600_000) out.push(ms)
  return out
}

export function symptomAt(type: string, ms: number): ReportEventInput {
  const t = new Date(ms).toISOString()
  return { id: id(type), type, occurredAt: t, occurredAtConfidence: 'witnessed', occurredAtEarliest: null, occurredAtLatest: null, severity: null, notes: null, loggedAt: t, meal: null }
}

/** Cooper as an owner really logs him: itching about every five days, the weekly counts wobbling
 *  between 1 and 2. The four-week replay reads that wobble as a rise, so the flag stays in the band. */
export function wobblingSkinTrial(): ReportInput {
  const events: ReportEventInput[] = [...dailyMeals(55, 0)]
  for (let d = 50; d >= 3; d -= 5) events.push(symptom('itch', d))
  return baseInput({ events, dietTrials: [skinTrial('skin')] })
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

// ── Sheet 2's canonical fixtures (CUL-2293, VR2-13; docs/vet-report-v3-discovery/fixtures/canonical-fixtures.json) ──

type Analysis = ReportInput['aiAnalyses'][number]

function analysis(eventId: string, over: Partial<Analysis>): Analysis {
  return {
    eventId,
    status: 'completed',
    colour: null,
    contents: null,
    consistency: null,
    bloodPresent: null,
    bilePresent: null,
    foreignMaterialPresent: null,
    foreignMaterialNote: null,
    stoolConsistency: null,
    stoolColour: null,
    stoolBloodPresent: null,
    stoolBloodType: null,
    stoolMucusPresent: null,
    editedAt: null,
    ...over,
  }
}

function photo(eventId: string, sortOrder = 0): NonNullable<ReportInput['attachments']>[number] {
  return { eventId, storagePath: `pet-v2/${eventId}.jpg`, mimeType: 'image/jpeg', sortOrder }
}

/**
 * `nyx-safety-cat`: Nyx's July record, reconstructed (round 4's d5). One sign (vomiting), a vomit
 * photo read as possible foreign material, no trial and no medication. Every read state appears
 * once beside the completed ones (uncertain, failed, pending, and one incident with no photo), so
 * "What each episode looked like" has to name the non-completed states and print the foreign
 * material only because it is present.
 */
export function nyxSafetyCat(): ReportInput {
  const v = [symptom('vomit', 27, 7), symptom('vomit', 21, 22), symptom('vomit', 14, 1), symptom('vomit', 9, 6), symptom('vomit', 6, 23), symptom('vomit', 3, 2), symptom('vomit', 1, 5)]
  v[2].notes = 'Found it on the rug, something grey in it'
  const meals = dailyMeals(29, 0).map((m) => ({ ...m, meal: { ...m.meal!, foodItemId: 'food-cat', primaryProtein: 'chicken', brand: 'Purina', productName: 'Pro Plan Adult' } }))
  return baseInput({
    pet: { id: 'pet-nyx-safety', name: 'Nyx', species: 'cat', breed: 'American Shorthair', sex: 'female', dateOfBirth: '2023-09-01', weightKg: 3.7 } as never,
    ownerName: 'Fixture Owner',
    requestedWindow: { startDate: dayKey(29), endDate: dayKey(0) },
    events: [...v, ...meals],
    aiAnalyses: [
      analysis(v[0].id, { colour: 'tan', contents: ['undigested_food'], consistency: 'chunky', bloodPresent: 'none_visible', bilePresent: 'no', foreignMaterialPresent: 'no' }),
      analysis(v[1].id, { colour: 'yellow', contents: ['bile'], consistency: 'foamy', bloodPresent: 'none_visible', bilePresent: 'yes', foreignMaterialPresent: 'no' }),
      analysis(v[2].id, {
        colour: 'mixed',
        contents: ['partially_digested_food'],
        consistency: 'chunky',
        bloodPresent: 'none_visible',
        bilePresent: 'no',
        foreignMaterialPresent: 'yes',
        foreignMaterialNote: 'a dark grey, irregularly shaped piece of material that does not appear to be food',
      }),
      analysis(v[3].id, { status: 'uncertain' }),
      analysis(v[4].id, { status: 'failed' }),
      analysis(v[5].id, { status: 'pending' }),
    ],
    attachments: [photo(v[0].id), photo(v[1].id), photo(v[2].id), photo(v[3].id), photo(v[4].id), photo(v[5].id)],
  })
}

/**
 * `stool-photo-dog`: Rufus, loose stool with photos, one read showing fresh blood present. Blood
 * leads the band; "What each episode looked like" names it as present and never prints "0 of"
 * beside blood or mucus; normal stools are counted beside the loose ones.
 */
export function stoolPhotoDog(): ReportInput {
  const loose = [symptom('diarrhea', 20, 8), symptom('diarrhea', 12, 7), symptom('diarrhea', 8, 19), symptom('diarrhea', 5, 7), symptom('diarrhea', 2, 18)]
  const normal = [25, 23, 18, 16, 10, 6, 3].map((d) => ({ ...symptom('stool_normal', d, 8) }))
  const meals = dailyMeals(29, 0).map((m) => ({ ...m, meal: { ...m.meal!, foodItemId: 'food-dog', primaryProtein: 'lamb', brand: 'Acana', productName: 'Lamb & Apple' } }))
  return baseInput({
    pet: { id: 'pet-rufus', name: 'Rufus', species: 'dog', breed: 'Border Collie', sex: 'male', dateOfBirth: '2019-05-12', weightKg: 19.4 } as never,
    requestedWindow: { startDate: dayKey(29), endDate: dayKey(0) },
    events: [...loose, ...normal, ...meals],
    aiAnalyses: [
      analysis(loose[0].id, { stoolConsistency: 'type_6_mushy', stoolColour: 'brown', stoolBloodPresent: 'no', stoolMucusPresent: 'no' }),
      analysis(loose[1].id, { stoolConsistency: 'type_6_mushy', stoolColour: 'brown', stoolBloodPresent: 'no', stoolMucusPresent: 'yes' }),
      analysis(loose[2].id, { stoolConsistency: 'type_7_watery', stoolColour: 'red_streaked', stoolBloodPresent: 'yes', stoolBloodType: 'fresh_red', stoolMucusPresent: 'no' }),
      analysis(loose[3].id, { status: 'uncertain' }),
    ],
    attachments: [photo(loose[0].id), photo(loose[1].id), photo(loose[2].id), photo(loose[3].id)],
  })
}
