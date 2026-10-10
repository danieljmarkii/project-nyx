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

Deno.test('tierReadIso — a read with no readable write time is said at its event; a card with no call has none', () => {
  const [f] = detectIncidentRedFlags(input([analysis({ call: 'call_now', occurredAt: at(28, 9) })]))
  assert.equal(f.tierReadIso, at(28, 9))
  const [g] = detectIncidentRedFlags(input([analysis({ call: 'call_now', occurredAt: at(28, 9), writtenAt: 'not a time' })]))
  assert.equal(g.tierReadIso, at(28, 9))
  const [photo] = detectIncidentRedFlags(input([analysis({ bloodPresent: 'fresh_red', writtenAt: at(29, 10) })]))
  assert.equal('tierReadIso' in photo, false)
  assert.equal('tier' in photo, false)
})

Deno.test('tierReadIso — a fresh call now with no write time is never out-dated by an older read\'s write (mixed family)', () => {
  const [f] = detectIncidentRedFlags(
    input([
      analysis({ call: 'call_now', occurredAt: at(26, 9), writtenAt: at(26, 9) }),
      analysis({ call: 'call_now', occurredAt: at(30, 9) }),
    ]),
  )
  assert.equal(f.tierReadIso, at(30, 9))
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

// "Later" in the words is EVENT order (PM ruling B): `updated_at` moves on rewrites unrelated to the
// call, so it may raise a rank (`callTodaySaidIso`) and never decides a word.
Deno.test('a call today written today on an OLDER event ranks the card, never its words (variant A)', () => {
  const [f] = detectIncidentRedFlags(
    input([
      analysis({ call: 'call_now', occurredAt: at(28, 9), writtenAt: at(28, 9) }),
      analysis({ call: 'call_today', occurredAt: at(27, 9), writtenAt: at(30, 10) }), // a late sync
    ]),
  )
  assert.equal(f.tier, 'call_now')
  assert.equal('laterCallTodayIso' in f, false)
  assert.equal(f.callTodaySaidIso, at(30, 10))
})

Deno.test('a rewrite of an old call-today row (089, a Hide) never promotes it into the words (third pass)', () => {
  const [f] = detectIncidentRedFlags(
    input([
      analysis({ call: 'call_today', occurredAt: at(20, 9), writtenAt: at(29, 18) }), // 089 took may_wait back
      analysis({ call: 'call_now', occurredAt: at(26, 9), writtenAt: at(26, 9) }),
    ]),
  )
  assert.equal('laterCallTodayIso' in f, false)
  assert.equal(f.tierReadIso, at(26, 9))
})

Deno.test('a call today whose event follows the call now is later, dated by its event', () => {
  const [f] = detectIncidentRedFlags(
    input([
      analysis({ call: 'call_now', occurredAt: at(26, 9), writtenAt: at(26, 9) }),
      analysis({ call: 'call_today', occurredAt: at(29, 9), writtenAt: at(29, 9) }),
    ]),
  )
  assert.equal(f.laterCallTodayIso, at(29, 9))
})

Deno.test('laterCallTodayIso — event order: a call now raised late keeps the clause, and the phone keeps the call now words (variant B, ruling B)', () => {
  const [f] = detectIncidentRedFlags(
    input([
      analysis({ call: 'call_now', occurredAt: at(27, 9), writtenAt: at(30, 10) }), // raised late
      analysis({ call: 'call_today', occurredAt: at(28, 9), writtenAt: at(28, 9) }),
    ]),
  )
  assert.equal(f.tier, 'call_now')
  assert.equal(f.tierReadIso, at(30, 10))
  // Event order (the PR-30a rule): the clause is kept; the banner never steps its words down.
  assert.equal(f.laterCallTodayIso, at(28, 9))
})

Deno.test('a rewrite of the call-now row (a Hide, an edit) never erases a genuinely later call today (fourth pass)', () => {
  const [f] = detectIncidentRedFlags(
    input([
      analysis({ call: 'call_now', occurredAt: at(21, 9), writtenAt: at(24, 12) }), // hidden on the 24th
      analysis({ call: 'call_today', occurredAt: at(23, 10), writtenAt: at(23, 10) }),
    ]),
  )
  assert.equal(f.laterCallTodayIso, at(23, 10))
})

Deno.test('laterCallTodayIso — with no write times it is the event order (the shipped behaviour)', () => {
  const [f] = detectIncidentRedFlags(
    input([analysis({ call: 'call_now', occurredAt: at(27, 9) }), analysis({ call: 'call_today', occurredAt: at(28, 9) })]),
  )
  assert.equal(f.laterCallTodayIso, at(28, 9))
})

// ── CUL-1759: the row's own stamp (099) replaces updated_at, and orders "later" when both are stamped
Deno.test('callSaidAt — a Hide that moves updated_at never moves the said-at of a stamped read', () => {
  const [f] = detectIncidentRedFlags(
    input([analysis({ call: 'call_now', occurredAt: at(26, 9), callSaidAt: at(26, 9), writtenAt: at(29, 12) })]), // hidden on the 29th
  )
  assert.equal(f.tierReadIso, at(26, 9))
})

Deno.test('callSaidAt — a call raised late is said at its stamp (the re-floor still gets its day)', () => {
  const [f] = detectIncidentRedFlags(input([analysis({ call: 'call_now', occurredAt: at(26, 9), callSaidAt: at(27, 10), writtenAt: at(29, 12) })]))
  assert.equal(f.tierReadIso, at(27, 10))
})

Deno.test('callSaidAt — both stamped: a call today written today on an OLDER event is later, in the words (variant A)', () => {
  const [f] = detectIncidentRedFlags(
    input([
      analysis({ call: 'call_now', occurredAt: at(28, 9), callSaidAt: at(28, 9) }),
      analysis({ call: 'call_today', occurredAt: at(27, 9), callSaidAt: at(30, 10) }), // a late sync
    ]),
  )
  assert.equal(f.laterCallTodayIso, at(30, 10))
})

Deno.test('callSaidAt — both stamped: a call now raised after a call today has no "later" call today (variant B)', () => {
  const [f] = detectIncidentRedFlags(
    input([
      analysis({ call: 'call_now', occurredAt: at(27, 9), callSaidAt: at(30, 10) }), // raised late
      analysis({ call: 'call_today', occurredAt: at(28, 9), callSaidAt: at(28, 9) }),
    ]),
  )
  assert.equal('laterCallTodayIso' in f, false)
})

Deno.test('callSaidAt — both stamped: a Hide on the call-now row never erases a genuinely later call today', () => {
  const [f] = detectIncidentRedFlags(
    input([
      analysis({ call: 'call_now', occurredAt: at(21, 9), callSaidAt: at(21, 9), writtenAt: at(24, 12) }), // hidden on the 24th
      analysis({ call: 'call_today', occurredAt: at(23, 10), callSaidAt: at(23, 10) }),
    ]),
  )
  assert.equal(f.laterCallTodayIso, at(23, 10))
  assert.equal(f.tierReadIso, at(21, 9))
})

Deno.test('callSaidAt — one side unstamped (a pre-099 row): "later" stays event order (ruling B)', () => {
  const [f] = detectIncidentRedFlags(
    input([
      analysis({ call: 'call_now', occurredAt: at(27, 9), callSaidAt: at(30, 10) }),
      analysis({ call: 'call_today', occurredAt: at(28, 9), writtenAt: at(28, 9) }), // no stamp
    ]),
  )
  assert.equal(f.laterCallTodayIso, at(28, 9))
})

Deno.test('mapIncidentAnalyses — carries the row stamp as callSaidAt', () => {
  const [a] = mapIncidentAnalyses([
    {
      event_id: 'e2',
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
      call_said_at: at(28, 9),
      events: { occurred_at: at(28, 9) },
    },
  ])
  assert.equal(a.callSaidAt, at(28, 9))
  assert.equal(a.writtenAt, at(29, 10))
})

Deno.test('callSaidAt — a pre-099 sibling anywhere in the family keeps event order, so a Hide on it cannot switch the words (P2)', () => {
  const rows = (siblingWritten: string) =>
    input([
      analysis({ call: 'call_now', occurredAt: at(26, 9), callSaidAt: at(26, 9) }),
      analysis({ call: 'call_today', occurredAt: at(24, 9), callSaidAt: at(27, 10) }), // stamped, older event
      analysis({ call: 'call_today', occurredAt: at(25, 9), writtenAt: siblingWritten }), // pre-099
    ])
  const [before] = detectIncidentRedFlags(rows(at(25, 9)))
  const [afterHide] = detectIncidentRedFlags(rows(at(29, 12)))
  // Event order both times: the newest call-today EVENT (25th) is before the call now's (26th).
  assert.equal('laterCallTodayIso' in before, false)
  assert.equal('laterCallTodayIso' in afterHide, false)
})
