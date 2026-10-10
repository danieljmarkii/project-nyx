// Engines v3 PR-30c (CUL-1739; PM ruling 1a, 2026-10-10). The red-flag card carries when its call
// was last SAID (`tierReadIso`): per read the later of its event and its row's last write, the
// max over the family's reads at the card's tier. The phone dates a call now a day after this, so
// a call raised a day after its event (a re-floor, a late sync) is never dated on first render.

import { strict as assert } from 'node:assert'
import { detectIncidentRedFlags, type DetectionInput, type IncidentAnalysisInput } from './detection.ts'
import { mapIncidentAnalyses } from './pipeline.ts'

const at = (day: number, hour = 8): string => `2026-05-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00.000Z`
let seq = 0
const analysis = (over: Partial<IncidentAnalysisInput> = {}): IncidentAnalysisInput => ({
  eventId: `s${++seq}`,
  incidentType: 'vomit',
  occurredAt: at(28, 9),
  bloodPresent: null,
  stoolBloodPresent: null,
  foreignMaterialPresent: null,
  ...over,
})
const input = (incidentAnalyses: IncidentAnalysisInput[]): DetectionInput => ({
  pet: { name: 'Nyx', species: 'cat', dietTrialActive: false },
  symptomEvents: [],
  mealEvents: [],
  now: at(30, 12),
  incidentAnalyses,
})

Deno.test('tierReadIso — a call written a day after its event is said at its write', () => {
  const [f] = detectIncidentRedFlags(input([analysis({ call: 'call_now', occurredAt: at(28, 9), writtenAt: at(29, 10) })]))
  assert.equal(f.tier, 'call_now')
  assert.equal(f.tierIso, at(28, 9)) // the event's day, as the eyebrow dates it
  assert.equal(f.tierReadIso, at(29, 10))
})

Deno.test('tierReadIso — a write at log time is said at the event (the later of the two)', () => {
  const [f] = detectIncidentRedFlags(input([analysis({ call: 'call_now', occurredAt: at(28, 9), writtenAt: '2026-05-28T08:59:00.000Z' })]))
  assert.equal(f.tierReadIso, at(28, 9))
})

Deno.test('tierReadIso — the freshest said-at over the tier, never a quieter read', () => {
  const [f] = detectIncidentRedFlags(
    input([
      analysis({ call: 'call_now', occurredAt: at(27, 9), writtenAt: at(29, 20) }), // re-floored late
      analysis({ call: 'call_now', occurredAt: at(28, 9), writtenAt: at(28, 9) }),
      analysis({ call: 'call_today', occurredAt: at(30, 9), writtenAt: at(30, 9) }), // a quieter tier
    ]),
  )
  assert.equal(f.tier, 'call_now')
  assert.equal(f.tierIso, at(28, 9))
  assert.equal(f.tierReadIso, at(29, 20))
  assert.equal(f.laterCallTodayIso, at(30, 9))
})

Deno.test('tierReadIso — absent when no read carries a write time, and on a card with no call (the loud default)', () => {
  const [f] = detectIncidentRedFlags(input([analysis({ call: 'call_now' })]))
  assert.equal('tierReadIso' in f, false)
  const [g] = detectIncidentRedFlags(input([analysis({ call: 'call_now', writtenAt: 'not a time' })]))
  assert.equal('tierReadIso' in g, false)
  const [photo] = detectIncidentRedFlags(input([analysis({ bloodPresent: 'fresh_red', writtenAt: at(29, 10) })]))
  assert.equal('tierReadIso' in photo, false)
  assert.equal('tier' in photo, false)
})

Deno.test('tierReadIso — two spellings of one instant compare parsed (C-40)', () => {
  const [f] = detectIncidentRedFlags(input([analysis({ call: 'call_now', occurredAt: '2026-05-28T09:00:00.000Z', writtenAt: '2026-05-28T09:00:00+00:00' })]))
  assert.equal(Date.parse(f.tierReadIso as string), Date.parse(at(28, 9)))
})

Deno.test('mapIncidentAnalyses — carries the row write time as writtenAt', () => {
  const [a] = mapIncidentAnalyses([
    {
      event_id: 'e1',
      incident_type: 'vomit',
      status: 'completed',
      blood_present: null,
      stool_blood_present: null,
      foreign_material_present: null,
      contents: null,
      bile_present: null,
      tier: 'call_now',
      recommendation: 'worth_a_call',
      engine_flags: ['engines_v3_en3'],
      updated_at: at(29, 10),
      events: { occurred_at: at(28, 9) },
    },
  ])
  assert.equal(a.writtenAt, at(29, 10))
  assert.equal(a.call, 'call_now')
})

// The second adversarial pass: "later" is ordered by when each call was SAID, the clock the phone
// dates by, never by the event's time alone.
Deno.test('laterCallTodayIso — a call today written today on an OLDER event still reaches the card (variant A)', () => {
  const [f] = detectIncidentRedFlags(
    input([
      analysis({ call: 'call_now', occurredAt: at(28, 9), writtenAt: at(28, 9) }),
      analysis({ call: 'call_today', occurredAt: at(27, 9), writtenAt: at(30, 10) }), // a late sync
    ]),
  )
  assert.equal(f.tier, 'call_now')
  assert.equal(f.laterCallTodayIso, at(30, 10))
})

Deno.test('laterCallTodayIso — a call now raised after a call today never steps down to it (variant B)', () => {
  const [f] = detectIncidentRedFlags(
    input([
      analysis({ call: 'call_now', occurredAt: at(27, 9), writtenAt: at(30, 10) }), // raised late
      analysis({ call: 'call_today', occurredAt: at(28, 9), writtenAt: at(28, 9) }),
    ]),
  )
  assert.equal(f.tier, 'call_now')
  assert.equal(f.tierReadIso, at(30, 10))
  assert.equal('laterCallTodayIso' in f, false)
})

Deno.test('laterCallTodayIso — with no write times it keeps the event order (the shipped behaviour)', () => {
  const [f] = detectIncidentRedFlags(
    input([analysis({ call: 'call_now', occurredAt: at(27, 9) }), analysis({ call: 'call_today', occurredAt: at(28, 9) })]),
  )
  assert.equal(f.laterCallTodayIso, at(28, 9))
})
