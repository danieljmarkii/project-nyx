// "May wait" (Engines v3 PR-27e, CUL-1628): one test per CUL-1611 rule, each built on a case that
// passes every OTHER rule, so deleting that rule's check is what turns its test red (the
// mutation proofs on the PR). Then CUL-1510's four broken passes, each as the record that broke
// the phone-side attempt. Run with: deno test supabase/functions/_shared/incidentMayWait.test.ts

import { assertEquals, assertStrictEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  columnBlockers,
  dstChangeBetween,
  intakeFlagAt,
  mayWaitValue,
  mayWaitVerdict,
  neighbourRefuses,
  payloadAsColumns,
  utcOffsetMinutes,
  withMayWaitDecidedAt,
  type MayWaitInput,
  type MayWaitNeighbour,
  type MayWaitRecord,
} from './incidentMayWait.ts'
import { payloadShowsSubject, storedRowInput } from './incidentMayWaitEvidence.ts'

type Row = Record<string, unknown>
const H = 3_600_000
// A Wednesday in January: no DST change anywhere near it in New York.
const VOMIT = '2026-01-14T14:00:00.000Z'
const VOMIT_MS = Date.parse(VOMIT)
const NOW = VOMIT_MS + 6 * H
const iso = (ms: number) => new Date(ms).toISOString()

// The clean case: a dog, two photoless vomits four hours apart, repeated vomiting the only flag.
function record(o: Partial<MayWaitRecord> = {}): MayWaitRecord {
  return {
    anchorAt: VOMIT,
    nowMs: NOW,
    species: 'dog',
    timeZone: 'America/New_York',
    vomits: [{ at: iso(VOMIT_MS - 4 * H), confidence: 'witnessed' }, { at: VOMIT, confidence: 'witnessed' }],
    neighbours: [{ eventId: 'n1', eventType: 'vomit', at: iso(VOMIT_MS - 4 * H), hasPhoto: false, photoSetKey: null, analysis: neighbourRow() }],
    lethargyAt: [],
    meals: [],
    ...o,
  }
}

function neighbourRow(o: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    status: 'completed', error: null, recommendation: 'worth_a_call', tier: 'call_today', may_wait: true,
    visual_flags: [], contextual_flags: ['repeated_vomiting'], ai_raw_payload: null,
    blood_present: null, stool_blood_present: null, foreign_material_present: null, colour: null, stool_colour: null,
    ...o,
  }
}

function input(o: {
  write?: Partial<MayWaitInput['write']>
  run?: Partial<MayWaitInput['run']>
  stored?: Record<string, unknown> | null
  record?: MayWaitRecord | null
  floorOn?: boolean
} = {}): MayWaitInput {
  return {
    floorOn: o.floorOn ?? true,
    write: { incidentType: 'vomit', tier: 'call_today', contextualFlags: ['repeated_vomiting'], visualFlags: [], status: 'completed', ...o.write },
    run: { settled: true, modelCalled: false, columns: null, ...o.run },
    stored: o.stored === undefined ? null : o.stored,
    record: o.record === undefined ? record() : o.record,
  }
}

const refused = (i: MayWaitInput) => mayWaitVerdict(i).refusedBy

Deno.test('the clean case waits: a record-only call today, nothing around it', () => {
  assertEquals(mayWaitVerdict(input()), { mayWait: true, refusedBy: [] })
})

// ── tier + engine ──────────────────────────────────────────────────────────────────

Deno.test('tier — only a call today may wait', () => {
  for (const tier of ['call_now', 'logged', 'not_enough_to_say', undefined]) {
    assertEquals(refused(input({ write: { tier } })), ['tier'])
  }
})

Deno.test('engine — EN-4 off, never a wait (the call-now question is the floor\'s)', () => {
  assertEquals(refused(input({ floorOn: false })), ['engine'])
})

// ── rule 1: the allow-list ─────────────────────────────────────────────────────────

Deno.test('allow_list — lethargy, cat intake and stool concurrent vomiting never; a call with no flag never', () => {
  assertEquals(refused(input({ write: { contextualFlags: ['repeated_vomiting', 'concurrent_lethargy'] } })), ['allow_list'])
  assertEquals(refused(input({ write: { contextualFlags: ['feline_reduced_intake'] } })), ['allow_list'])
  assertEquals(refused(input({ write: { contextualFlags: [] } })), ['allow_list'])
  assertEquals(refused(input({ write: { incidentType: 'diarrhea', contextualFlags: ['repeated_loose_stool', 'concurrent_vomiting'] } })), ['allow_list'])
  assertEquals(refused(input({ write: { incidentType: 'diarrhea', contextualFlags: ['repeated_loose_stool'] } })), [])
  // A type with no list never waits, whatever its flags.
  assertEquals(refused(input({ write: { incidentType: 'cough', contextualFlags: ['repeated_vomiting'] } })), ['allow_list'])
})

// ── rule 2: no photo finding ───────────────────────────────────────────────────────

Deno.test('photo_finding — a visual flag, on the write or the stored row, refuses', () => {
  assertEquals(refused(input({ write: { visualFlags: ['blood'] } })), ['photo_finding'])
  assertEquals(refused(input({ stored: { visual_flags: ['suspected_foreign_material'] } })), ['photo_finding'])
})

Deno.test('photo_finding — blood or foreign material PRESENT OR UNSURE, in any of the three sources', () => {
  for (const cols of [{ blood_present: 'fresh_red' }, { blood_present: 'coffee_ground' }, { blood_present: 'unsure' }, { foreign_material_present: 'yes' }, { foreign_material_present: 'unsure' }]) {
    assertEquals(refused(input({ run: { columns: cols } })), ['photo_finding'], JSON.stringify(cols))
    assertEquals(refused(input({ stored: cols })), ['photo_finding'], `stored ${JSON.stringify(cols)}`)
    assertEquals(refused(input({ stored: { ai_raw_payload: cols } })), ['photo_finding'], `payload ${JSON.stringify(cols)}`)
  }
  // Stool's own column, and its payload's spelling of it.
  assertEquals(refused(input({ write: { incidentType: 'diarrhea', contextualFlags: ['repeated_loose_stool'] }, run: { columns: { stool_blood_present: 'unsure' } } })), ['photo_finding'])
  assertEquals(refused(input({ write: { incidentType: 'diarrhea', contextualFlags: ['repeated_loose_stool'] }, stored: { ai_raw_payload: { blood_present: 'yes' } } })), ['photo_finding'])
  // "None visible" and "no" are what a clean read says.
  assertEquals(refused(input({ run: { columns: { blood_present: 'none_visible', foreign_material_present: 'no' } } })), [])
})

// ── rule 3: no blood-coloured vomit ────────────────────────────────────────────────

Deno.test('blood_colour — black, dark-red, pink, and the unclear colours refuse; stool black or red-streaked too', () => {
  for (const colour of ['pink_red', 'dark_red', 'black_coffee_ground', 'mixed', 'unsure']) {
    assertEquals(refused(input({ run: { columns: { colour, blood_present: 'none_visible' } } })), ['blood_colour'], colour)
    assertEquals(refused(input({ stored: { ai_raw_payload: { colour } } })), ['blood_colour'], `payload ${colour}`)
  }
  for (const colour of ['clear', 'white', 'yellow', 'green', 'brown', 'tan']) {
    assertEquals(refused(input({ run: { columns: { colour } } })), [], colour)
  }
  const stool = { incidentType: 'diarrhea', contextualFlags: ['repeated_loose_stool'] }
  for (const stool_colour of ['black_tarry', 'red_streaked', 'unsure']) {
    assertEquals(refused(input({ write: stool, run: { columns: { stool_colour } } })), ['blood_colour'], stool_colour)
  }
  assertEquals(refused(input({ write: stool, stored: { ai_raw_payload: { colour: 'black_tarry' } } })), ['blood_colour'])
  assertEquals(refused(input({ write: stool, run: { columns: { stool_colour: 'brown' } } })), [])
})

// ── rule 4: no call the model made itself ──────────────────────────────────────────

Deno.test('model_call — this run\'s model call, a stored payload\'s, and a stored FALSE all refuse', () => {
  assertEquals(refused(input({ run: { modelCalled: true } })), ['model_call'])
  assertEquals(refused(input({ stored: { ai_raw_payload: { recommendation: 'worth_a_call' } } })), ['model_call'])
  // The removed photo: the payload is gone, the FALSE it earned is not.
  assertEquals(refused(input({ stored: { ai_raw_payload: null, may_wait: false } })), ['model_call'])
  assertEquals(refused(input({ stored: { ai_raw_payload: { recommendation: 'monitor' }, may_wait: null } })), [])
})

// ── rule 5: a settled read ─────────────────────────────────────────────────────────

Deno.test('settled — an unsettled run, a non-completed write, an owner-edited row all refuse', () => {
  assertEquals(refused(input({ run: { settled: false } })), ['settled'])
  assertEquals(refused(input({ write: { status: 'uncertain' } })), ['settled'])
  assertEquals(refused(input({ stored: { edited_at: '2026-01-14T15:00:00Z' } })), ['settled'])
})

// ── evidence ───────────────────────────────────────────────────────────────────────

Deno.test('evidence — a record the reads could not answer refuses', () => {
  assertEquals(refused(input({ record: null })), ['evidence'])
})

// ── rule 6: no call-now sign within the floor's window ─────────────────────────────

Deno.test('neighbour — the floor re-run on a neighbouring vomit: a burst two days back refuses', () => {
  const burst = [0, 10, 20].map((m) => ({ at: iso(VOMIT_MS - 48 * H + m * 60_000), confidence: 'witnessed' }))
  // Two of the burst are inside the window as neighbours; the floor on them hears three in 30 minutes.
  assertEquals(refused(input({ record: record({ vomits: [...burst, { at: VOMIT, confidence: 'witnessed' }], neighbours: [] }) })), ['neighbour'])
  // The same three spread over a day are no burst.
  const spread = [0, 9, 18].map((h) => ({ at: iso(VOMIT_MS - 60 * H + h * H), confidence: 'witnessed' }))
  assertEquals(refused(input({ record: record({ vomits: [...spread, { at: VOMIT, confidence: 'witnessed' }], neighbours: [] }) })), [])
})

Deno.test('neighbour — a neighbour\'s row: call now, photo finding, model call, intake, lethargy, FALSE, unsettled photo', () => {
  const withRow = (row: Record<string, unknown> | null, hasPhoto = true): MayWaitNeighbour =>
    ({ eventId: 'n1', eventType: 'vomit', at: iso(VOMIT_MS - 4 * H), hasPhoto, photoSetKey: hasPhoto ? 'att-n1' : null, analysis: row })
  const cases: [string, MayWaitNeighbour][] = [
    ['call now', withRow(neighbourRow({ tier: 'call_now' }))],
    ['an unknown verdict ranks call now', withRow(neighbourRow({ tier: null, recommendation: 'something_new' }))],
    ['visual flag', withRow(neighbourRow({ visual_flags: ['blood'] }))],
    ['blood column', withRow(neighbourRow({ blood_present: 'fresh_red' }))],
    ['unsure foreign material', withRow(neighbourRow({ foreign_material_present: 'unsure' }))],
    ['blood colour', withRow(neighbourRow({ colour: 'dark_red' }))],
    ['payload blood', withRow(neighbourRow({ ai_raw_payload: { blood_present: 'coffee_ground' } }))],
    ['payload model call', withRow(neighbourRow({ ai_raw_payload: { recommendation: 'worth_a_call' } }))],
    ['intake flag', withRow(neighbourRow({ contextual_flags: ['feline_reduced_intake'] }), false)],
    ['lethargy flag', withRow(neighbourRow({ contextual_flags: ['concurrent_lethargy'] }), false)],
    ['a FALSE', withRow(neighbourRow({ may_wait: false }), false)],
    ['photo, no row', withRow(null)],
    ['photo, failed read', withRow(neighbourRow({ status: 'failed' }))],
    ['photo, uncertain read', withRow(neighbourRow({ status: 'uncertain' }))],
    ['photo, errored read', withRow(neighbourRow({ error: 'Claude API error 529' }))],
    ['stool neighbour, black tarry', { ...withRow(neighbourRow({ stool_colour: 'black_tarry' })), eventType: 'diarrhea' }],
    ['stool neighbour payload blood', { ...withRow(neighbourRow({ ai_raw_payload: { blood_present: 'yes' } })), eventType: 'stool_normal' }],
  ]
  for (const [name, n] of cases) {
    assertStrictEquals(neighbourRefuses(n), true, name)
    assertEquals(refused(input({ record: record({ neighbours: [n] }) })), ['neighbour'], name)
  }
  // A photoless neighbour with no row is the record's to judge, not a refusal on its own.
  assertStrictEquals(neighbourRefuses(withRow(null, false)), false)
  const read = neighbourRow({ photo_set_key: 'att-n1', ai_raw_payload: { appears_to_show_vomit: true, recommendation: 'monitor', blood_present: 'none_visible', colour: 'yellow', read_photo_set_key: 'att-n1' } })
  assertStrictEquals(neighbourRefuses(withRow(read)), false)
  // Adversarial pass 2: a photographed neighbour whose read never showed the subject, or was
  // written over another photo set (a photo added or replaced since), is an unread photo.
  assertStrictEquals(neighbourRefuses(withRow({ ...read, ai_raw_payload: { ...(read.ai_raw_payload as Row), appears_to_show_vomit: false } })), true)
  assertStrictEquals(neighbourRefuses(withRow({ ...read, ai_raw_payload: null })), true)
  const readOver = (key: unknown) => ({ ...read, ai_raw_payload: { ...(read.ai_raw_payload as Row), read_photo_set_key: key } })
  assertStrictEquals(neighbourRefuses(withRow(readOver('att-old'))), true)
  assertStrictEquals(neighbourRefuses(withRow(readOver(null))), true)
  assertStrictEquals(neighbourRefuses(withRow(readOver(undefined))), true)
  // Adversarial pass 3: the ROW's stamp advanced by a write that read no photo (a capped or
  // floor-only write over a replaced photo) never stands for a read of the new photo.
  assertStrictEquals(neighbourRefuses(withRow({ ...readOver('att-old'), photo_set_key: 'att-n1' })), true)
})

Deno.test('neighbour — lethargy a day either side of the run, or logged since, refuses; outside it does not', () => {
  // The run starts 4 h before the read's vomit; 27 h before it is 23 h before the run.
  assertEquals(refused(input({ record: record({ lethargyAt: [iso(VOMIT_MS - 27 * H)] }) })), ['neighbour'])
  // Back-dated after the read: logged now, placed five days on (never inside the floor's window).
  assertEquals(refused(input({ record: record({ nowMs: VOMIT_MS + 6 * 24 * H, lethargyAt: [iso(VOMIT_MS + 5 * 24 * H)] }) })), ['neighbour'])
  assertEquals(refused(input({ record: record({ lethargyAt: [iso(VOMIT_MS - 29 * H)] }) })), [])
})

Deno.test('neighbour — a cat: the intake flag at any vomit in the run or at the read refuses', () => {
  const cat = (meals: MayWaitRecord['meals']) => input({ record: record({ species: 'cat', meals }) })
  // Rated a meal 3 days ago, nothing Most or All since: fires at both vomits.
  assertEquals(refused(cat([{ at: iso(VOMIT_MS - 72 * H), rating: 'some' }])), ['neighbour'])
  // Ate well an hour before each vomit and before the read: no flag anywhere.
  assertEquals(refused(cat([
    { at: iso(VOMIT_MS - 5 * H), rating: 'all' },
  ])), [])
  // Never rates meals: the flag cannot fire (Pattern 6), and the gap cannot grant a wait either.
  assertEquals(refused(cat([{ at: iso(VOMIT_MS - 5 * H), rating: null }])), ['neighbour'])
  assertEquals(refused(cat([])), ['neighbour'])
  // A dog's meals are never read for this.
  assertEquals(refused(input({ record: record({ meals: [{ at: iso(VOMIT_MS - 72 * H), rating: 'some' }] }) })), [])
})

Deno.test('intakeFlagAt — the shipped flag: tracks within the week, no Most or All within the day', () => {
  const at = VOMIT_MS
  assertStrictEquals(intakeFlagAt([{ at: iso(at - 3 * 24 * H), rating: 'none' }], at), true)
  assertStrictEquals(intakeFlagAt([{ at: iso(at - 3 * 24 * H), rating: 'none' }, { at: iso(at - 2 * H), rating: 'most' }], at), false)
  assertStrictEquals(intakeFlagAt([{ at: iso(at - 8 * 24 * H), rating: 'none' }], at), false)
  // A meal after the moment is not "before" it.
  assertStrictEquals(intakeFlagAt([{ at: iso(at - 3 * 24 * H), rating: 'none' }, { at: iso(at + H), rating: 'all' }], at), true)
})

// ── rule 7: not across a DST change ────────────────────────────────────────────────

Deno.test('dst — a change in the owner\'s zone inside the window refuses; an unknown zone refuses', () => {
  // US fall-back 2026-11-01. A vomit on Oct 31 read the same evening.
  const vomit = '2026-10-31T22:00:00.000Z'
  const r = (o: Partial<MayWaitRecord>) => record({ anchorAt: vomit, nowMs: Date.parse(vomit) + H, vomits: [{ at: vomit, confidence: 'witnessed' }], neighbours: [], ...o })
  assertEquals(refused(input({ record: r({}) })), ['dst'])
  // Four days before the change, the 48 h ahead stops short of it.
  const early = '2026-10-27T22:00:00.000Z'
  assertEquals(refused(input({ record: r({ anchorAt: early, nowMs: Date.parse(early) + H, vomits: [{ at: early, confidence: 'witnessed' }] }) })), [])
  // Looking back: a vomit read three days after the change.
  const after = '2026-11-03T22:00:00.000Z'
  assertEquals(refused(input({ record: r({ anchorAt: after, nowMs: Date.parse(after) + H, vomits: [{ at: after, confidence: 'witnessed' }] }) })), ['dst'])
  // A zone with no DST at all never refuses for it.
  assertEquals(refused(input({ record: r({ timeZone: 'Asia/Tokyo' }) })), [])
  assertEquals(refused(input({ record: record({ timeZone: null }) })), ['dst'])
  assertEquals(refused(input({ record: record({ timeZone: 'Not/AZone' }) })), ['dst'])
})

Deno.test('dstChangeBetween — Lord Howe\'s half-hour change and Chatham are found too', () => {
  // Lord Howe moves 30 minutes on 2026-10-04 (02:00 local, 2026-10-03T15:30Z).
  assertStrictEquals(dstChangeBetween('Australia/Lord_Howe', Date.parse('2026-10-02T00:00:00Z'), Date.parse('2026-10-05T00:00:00Z')), true)
  assertStrictEquals(dstChangeBetween('Pacific/Chatham', Date.parse('2026-09-25T00:00:00Z'), Date.parse('2026-09-29T00:00:00Z')), true)
  assertStrictEquals(dstChangeBetween('Australia/Lord_Howe', Date.parse('2026-12-01T00:00:00Z'), Date.parse('2026-12-08T00:00:00Z')), false)
  assertStrictEquals(utcOffsetMinutes('UTC', 0), 0)
  assertStrictEquals(utcOffsetMinutes('America/New_York', Date.parse('2026-01-14T00:00:00Z')), -300)
})

// ── the value written ─────────────────────────────────────────────────────────────

Deno.test('mayWaitValue — TRUE only on a passed call today; FALSE only on the incident\'s own photo; a stored FALSE is kept', () => {
  const pass = { mayWait: true, refusedBy: [] }
  assertStrictEquals(mayWaitValue(undefined, pass, null), undefined)
  assertStrictEquals(mayWaitValue('call_today', pass, null), true)
  assertStrictEquals(mayWaitValue('call_now', pass, null), null)
  assertStrictEquals(mayWaitValue('call_today', null, null), null)
  assertStrictEquals(mayWaitValue('call_today', { mayWait: false, refusedBy: ['neighbour'] }, null), null)
  assertStrictEquals(mayWaitValue('call_today', { mayWait: false, refusedBy: ['settled', 'blood_colour'] }, null), false)
  assertStrictEquals(mayWaitValue('call_today', { mayWait: false, refusedBy: ['model_call'] }, true), false)
  // The stored FALSE outlives every later write that names a tier, whatever that write decided.
  for (const tier of ['call_today', 'call_now', 'logged', 'not_enough_to_say']) {
    assertStrictEquals(mayWaitValue(tier, pass, false), false, tier)
  }
  // With no tier written (the key off), nothing is written, the FALSE included; a stored TRUE
  // (written before a rollback) is taken back.
  assertStrictEquals(mayWaitValue(undefined, pass, false), undefined)
  assertStrictEquals(mayWaitValue(undefined, null, true), null)
})

Deno.test('payload and column helpers read both types, present-or-unclear only', () => {
  assertEquals(payloadAsColumns('vomit', { blood_present: 'unsure', colour: 'tan' }), { blood_present: 'unsure', foreign_material_present: undefined, colour: 'tan' })
  assertEquals(payloadAsColumns('stool_normal', { blood_present: 'yes', colour: 'brown' }), { stool_blood_present: 'yes', foreign_material_present: undefined, stool_colour: 'brown' })
  assertStrictEquals(payloadAsColumns('vomit', null), null)
  assertEquals(columnBlockers({ blood_present: 'none_visible', foreign_material_present: 'no', colour: 'yellow' }), [])
  assertEquals(columnBlockers(null), [])
  assertStrictEquals(payloadShowsSubject({ appears_to_show_vomit: true }), true)
  assertStrictEquals(payloadShowsSubject({ appears_to_show_stool: false }), false)
  assertStrictEquals(payloadShowsSubject(null), false)
})

Deno.test('storedRowInput — a photographed row with no payload showing the subject is an unread photo', () => {
  const row = neighbourRow({ may_wait: true, ai_raw_payload: null })
  assertEquals(mayWaitVerdict(storedRowInput({ row, incidentType: 'vomit', hasPhoto: true, photoSetKey: 'att-1', floorOn: true, record: record() })).refusedBy, ['settled'])
  assertEquals(mayWaitVerdict(storedRowInput({ row, incidentType: 'vomit', hasPhoto: false, photoSetKey: null, floorOn: true, record: record() })).refusedBy, [])
  const shown = neighbourRow({ photo_set_key: 'att-1', ai_raw_payload: { read_photo_set_key: 'att-1', appears_to_show_vomit: true, recommendation: 'monitor', blood_present: 'none_visible', colour: 'yellow' } })
  assertEquals(mayWaitVerdict(storedRowInput({ row: shown, incidentType: 'vomit', hasPhoto: true, photoSetKey: 'att-1', floorOn: true, record: record() })).refusedBy, [])
  // The row was read over another photo set: the photo on the event now was never read.
  assertEquals(mayWaitVerdict(storedRowInput({ row: shown, incidentType: 'vomit', hasPhoto: true, photoSetKey: 'att-2', floorOn: true, record: record() })).refusedBy, ['settled'])
  assertEquals(mayWaitVerdict(storedRowInput({ row: { ...shown, error: 'x' }, incidentType: 'vomit', hasPhoto: true, photoSetKey: 'att-1', floorOn: true, record: record() })).refusedBy, ['settled'])
})

// ── CUL-1510's four adversarial passes, against the server predicate ──────────────
// Each case is the record that broke the phone-side attempt (PR-27b's session record).

Deno.test('CUL-1510 pass 1 — a lethargy flag or met sign, the model\'s own call, blood colours: each refuses', () => {
  // B1: a stool with vomit and lethargy; a vomit with lethargy T3 did not catch.
  assertStrictEquals(mayWaitVerdict(input({ write: { incidentType: 'diarrhea', contextualFlags: ['repeated_loose_stool', 'concurrent_vomiting', 'concurrent_lethargy'] } })).mayWait, false)
  assertStrictEquals(mayWaitVerdict(input({ write: { contextualFlags: ['repeated_vomiting', 'concurrent_lethargy'] } })).mayWait, false)
  // B2: the model escalated on a pill / worms / plant matter with every enum quiet.
  assertStrictEquals(mayWaitVerdict(input({ run: { modelCalled: true, columns: { blood_present: 'none_visible', foreign_material_present: 'no', colour: 'green' } } })).mayWait, false)
  // B3: black / dark-red / pink with "blood: none visible".
  for (const colour of ['black_coffee_ground', 'dark_red', 'pink_red']) {
    assertStrictEquals(mayWaitVerdict(input({ run: { columns: { colour, blood_present: 'none_visible' } } })).mayWait, false, colour)
  }
})

Deno.test('CUL-1510 pass 2 — a call-now sign on a neighbouring record, a frozen payload after an edit, a rescue over an unread photo', () => {
  // A neighbour already at call now (its own T3).
  const n = { eventId: 'n1', eventType: 'vomit', at: iso(VOMIT_MS - 4 * H), hasPhoto: false, photoSetKey: null, analysis: neighbourRow({ tier: 'call_now', contextual_flags: ['concurrent_lethargy'] }) }
  assertStrictEquals(mayWaitVerdict(input({ record: record({ neighbours: [n] }) })).mayWait, false)
  // The owner edited blood away; the payload still says fresh red.
  assertStrictEquals(mayWaitVerdict(input({ stored: { edited_at: '2026-01-14T15:00:00Z', blood_present: 'none_visible', ai_raw_payload: { blood_present: 'fresh_red' } } })).mayWait, false)
  // A rescue (the run did not finish) over a photo never read.
  assertStrictEquals(mayWaitVerdict(input({ run: { settled: false }, write: { status: 'failed' } })).mayWait, false)
})

Deno.test('CUL-1510 pass 3 — a neighbour\'s photo finding, a burst more than 24 h from the event, stale facts', () => {
  const photo = { eventId: 'n1', eventType: 'vomit', at: iso(VOMIT_MS - 30 * H), hasPhoto: true, photoSetKey: 'att-n1', analysis: neighbourRow({ visual_flags: ['blood'], blood_present: 'coffee_ground' }) }
  assertStrictEquals(mayWaitVerdict(input({ record: record({ neighbours: [photo] }) })).mayWait, false)
  // Three witnessed vomits in 20 minutes, 40 h before the read's vomit: no 24 h window holds both.
  const burst = [0, 10, 20].map((m) => ({ at: iso(VOMIT_MS - 40 * H + m * 60_000), confidence: 'witnessed' as const }))
  assertStrictEquals(mayWaitVerdict(input({ record: record({ vomits: [...burst, { at: VOMIT, confidence: 'witnessed' }] }) })).mayWait, false)
  // Stale facts: a neighbour whose photo was still unread when this ran. The read refuses, and
  // the value written is NULL, so the next run (once the photo is read) decides afresh.
  const unread = { eventId: 'n2', eventType: 'vomit', at: iso(VOMIT_MS - 2 * H), hasPhoto: true, photoSetKey: 'att-n1', analysis: null }
  const v = mayWaitVerdict(input({ record: record({ neighbours: [unread] }) }))
  assertEquals(v.refusedBy, ['neighbour'])
  assertStrictEquals(mayWaitValue('call_today', v, null), null)
})

Deno.test('CUL-1510 pass 4 — a removed photo\'s blood call, a photoless neighbour\'s intake flag, a back-dated lethargy', () => {
  // The photo with blood was read (FALSE written), removed, and read again photoless: the
  // payload is gone and the FALSE is all that is left of it.
  assertStrictEquals(mayWaitVerdict(input({ stored: { ai_raw_payload: null, visual_flags: [], may_wait: false } })).mayWait, false)
  // ...and it survives the write itself.
  assertStrictEquals(mayWaitValue('call_today', mayWaitVerdict(input({ stored: { may_wait: false } })), false), false)
  // A photoless neighbour's intake flag, with no row behind it: the record's meals carry it.
  const cat = record({ species: 'cat', neighbours: [{ eventId: 'n1', eventType: 'vomit', at: iso(VOMIT_MS - 4 * H), hasPhoto: false, photoSetKey: null, analysis: null }], meals: [{ at: iso(VOMIT_MS - 50 * H), rating: 'little' }] })
  assertStrictEquals(mayWaitVerdict(input({ record: cat })).mayWait, false)
  // Lethargy back-dated outside the read's own 24 h window but inside the run's.
  assertStrictEquals(mayWaitVerdict(input({ record: record({ lethargyAt: [iso(VOMIT_MS - 26 * H)] }) })).mayWait, false)
})

Deno.test('withMayWaitDecidedAt — a write carrying may_wait carries its time; any other write carries none (CUL-1707)', () => {
  const at = '2026-10-09T21:00:00.000Z'
  assertEquals(withMayWaitDecidedAt({ tier: 'call_today', may_wait: true }, at), { tier: 'call_today', may_wait: true, may_wait_decided_at: at })
  assertEquals(withMayWaitDecidedAt({ may_wait: null }, at), { may_wait: null, may_wait_decided_at: at })
  assertEquals(withMayWaitDecidedAt({ may_wait: false }, at), { may_wait: false, may_wait_decided_at: at })
  // No decision in the write: the stamp stays where the last decision left it.
  assertEquals(withMayWaitDecidedAt({ error: 'boom' }, at), { error: 'boom' })
  assertEquals(withMayWaitDecidedAt({ status: 'pending', may_wait: undefined }, at), { status: 'pending', may_wait: undefined })
})
