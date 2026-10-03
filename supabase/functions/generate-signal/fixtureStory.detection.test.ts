// The device-pass fixture's declared leads, proven against the REAL pipeline (CUL-1222, GC-2).
//
//   deno test --allow-read=supabase/functions supabase/functions/generate-signal/fixtureStory.detection.test.ts
//
// Every step of the device sitting (CUL-1529) that judges a Home names the Signal it expects
// on top: Juniper's benign insight (the chart card, MFU-1), Miso's safety card, nothing at all
// for Pepper (the quiet Home) and Fig (the brand-new pet). A sitting on a fixture whose
// lead silently changed would judge the wrong card, so each pet DECLARES its lead in
// scripts/fixture/fixtureStory.ts and this test runs the shipped `runSignalPipeline` (the
// same pure function generate-signal's shell calls, over rows shaped exactly as PostgREST
// returns them) and fails if the lead differs.
//
// It runs the story under each Signal engine key on and off, because the fixture account's
// keys are whatever `app_config` says on the morning of the pass: a lead that holds only
// under one setting is a lead the PM might not get. And it runs at four hours of the UTC day,
// because Miso's low days are UTC-anchored (the demo story's R-3 lesson: a dip read at an
// early UTC hour can vanish).
//
// Pepper's record includes the three vomits `__seedNoticed` writes on the device
// (NOTICED_SEED_VOMIT_DAYS; fixtureStory.test.ts pins that list to the client seed's).

import { strict as assert } from 'node:assert'
import { runSignalPipeline, type SignalRows, type SymptomRow, type MealEventRow, type ActiveTrialRow } from './pipeline.ts'
import { EMPTY_CARE_RECORD } from './careState.ts'
import { SIGNAL_ENGINE_KEYS, type EngineFlags } from '../_shared/engineFlags.ts'
import {
  buildFixtureStory,
  NOTICED_SEED_PET_KEY,
  NOTICED_SEED_VOMIT_DAYS,
  type FixturePet,
} from '../../../scripts/fixture/fixtureStory.ts'
import { materializeInstantIso, materializeDate } from '../../../scripts/demo/demoStory.ts'

const STORY = buildFixtureStory({
  userId: '33333333-3333-4333-8333-333333333333',
  timezone: 'America/New_York',
})

const SYMPTOM_TYPES = new Set(['vomit', 'diarrhea', 'itch'])

function rowsFor(pet: FixturePet, nowMs: number): SignalRows {
  const symptoms: SymptomRow[] = pet.events
    .filter((e) => SYMPTOM_TYPES.has(e.type))
    .map((e) => ({
      id: e.eventId,
      event_type: e.type,
      occurred_at: materializeInstantIso(e.time, nowMs),
      occurred_at_confidence: e.confidence,
      severity: null,
    }))
  if (pet.key === NOTICED_SEED_PET_KEY) {
    // The device-written vomits, at the client seed's 4:04 PM local (19:04 − 3h) — placed at
    // 20:04 UTC, which is 4:04 PM in New York under daylight time; clamped to now like the seed.
    for (const d of NOTICED_SEED_VOMIT_DAYS) {
      symptoms.push({
        id: `noticed-seed-vomit-${d}`,
        event_type: 'vomit',
        occurred_at: materializeInstantIso({ dayOffset: -d, hour: 20, minute: 4, clampToNow: d === 0 }, nowMs),
        occurred_at_confidence: 'witnessed',
        severity: null,
      })
    }
  }
  const meals: MealEventRow[] = pet.events
    .filter((e) => e.type === 'meal' && e.meal)
    .map((e) => ({
      id: e.eventId,
      occurred_at: materializeInstantIso(e.time, nowMs),
      occurred_at_confidence: e.confidence,
      meals: {
        food_item_id: e.meal!.food.id,
        intake_rating: e.meal!.intakeRating,
        food_items: {
          primary_protein: e.meal!.food.primaryProtein,
          proteins: e.meal!.food.proteins,
          food_type: e.meal!.food.foodType,
          format: e.meal!.food.format,
          brand: e.meal!.food.brand,
          product_name: e.meal!.food.productName,
        },
      },
    }))
  const activeTrials: ActiveTrialRow[] = pet.trial
    ? [{
      started_at: materializeDate(pet.trial.startedDayOffset, nowMs),
      target_duration_days: pet.trial.targetDurationDays,
      indication: 'gi',
      target_protein: pet.trial.targetProtein,
    }]
    : []
  return {
    pet: { name: pet.name, species: pet.species },
    symptoms,
    meals,
    activeTrials,
    arrangements: [],
    timezone: STORY.timezone,
    regimens: [],
    doseEvents: [],
    incidentAnalyses: [],
  }
}

function leadOf(pet: FixturePet, nowMs: number, flags: EngineFlags) {
  const result = runSignalPipeline({
    rows: rowsFor(pet, nowMs),
    incompletePulls: [],
    prior: null,
    nowMs,
    engineFlags: flags,
    careRecord: EMPTY_CARE_RECORD,
    careContextFacts: null,
    weightFacts: null,
  })
  return result.findings.map((r) => r.finding)
}

// Every subset of the Signal's engine keys: none on, each alone, all on.
const FLAG_SETS: EngineFlags[] = [
  { on: [], readOk: true },
  ...SIGNAL_ENGINE_KEYS.map((k) => ({ on: [k], readOk: true })),
  { on: [...SIGNAL_ENGINE_KEYS].sort(), readOk: true },
]

const DAY = Date.parse('2026-10-05T00:00:00.000Z')
const HOURS = [1, 9, 14, 22]

for (const pet of STORY.pets) {
  Deno.test(`fixture — ${pet.name}'s Signal leads as declared (${pet.declaredLead.kind}), every hour, every key`, () => {
    for (const h of HOURS) {
      const nowMs = DAY + h * 3_600_000 + 30 * 60_000
      for (const flags of FLAG_SETS) {
        const findings = leadOf(pet, nowMs, flags)
        const where = `${pet.name} at ${h}:30 UTC, keys [${flags.on.join(', ')}]: got [${findings.map((f) => `${f.type}/${f.priorityClass}`).join(', ')}]`
        const decl = pet.declaredLead
        if (decl.kind === 'none') {
          assert.equal(findings.length, 0, where)
          continue
        }
        assert.ok(findings.length > 0, `no lead — ${where}`)
        assert.equal(findings[0].type, decl.type, `lead type — ${where}`)
        assert.equal(findings[0].priorityClass, decl.kind === 'safety' ? 'safety' : 'insight', `lead class — ${where}`)
        if (decl.kind === 'benign') {
          // A benign lead means NO safety card anywhere: Home leads with its first card, and a
          // safety card always ranks first, so one anywhere would be the lead.
          assert.ok(findings.every((f) => f.priorityClass !== 'safety'), `a safety card — ${where}`)
        }
      }
    }
  })
}
