// EN-4's floor through the real pipeline (Engines v3 PR-28, CUL-1134). Run with:
// deno test supabase/functions/analyze-vomit/
//
// The real vomit descriptor and the real shared pipeline over a fake database that answers the
// filters the code sends (eq, in, is null, gte, lte) the way PostgREST does. Storage, the model
// and the usage counter THROW in every test here that is not about a photo read, so any path
// that reaches them fails the test (spec §8.2, §8.6: the floor never downloads a photo, never
// calls the model, never spends a cap unit).

import { assertEquals, assertStrictEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { runIncidentAnalysis, type PipelineDeps, type SupabaseClient } from '../_shared/incident-analysis.ts'
import { VOMIT_DESCRIPTOR, floorSentence, type VomitAnalysis } from './index.ts'
import { incidentFloor } from '../../../lib/incidentFloor.ts'
import { STOOL_DESCRIPTOR } from '../analyze-stool/index.ts'

type Row = Record<string, unknown>
const H = 3_600_000
const PET_ID = 'pet-1'
const OWNER = 'owner-1'
const iso = (ms: number) => new Date(ms).toISOString()

interface Ev {
  id: string
  event_type: string
  occurred_at: string
  occurred_at_confidence?: string | null
  rating?: string | null
  photo?: boolean
  deleted?: boolean
}

interface World {
  species: 'cat' | 'dog' | 'other'
  birthDate: string | null
  events: Ev[]
  keys: string[] // engine keys on for the owner
  rows: Map<string, Row> // event_ai_analysis by event_id
  calls: { storage: number; model: number; usage: number }
  writes: number
  // Only for the tests about a photo read: when set, Storage, the counter and the model answer,
  // and `during` runs inside the model call (a log landing mid-read).
  photoRead?: { analysis: VomitAnalysis; during?: (w: World) => void }
}

class FakeQuery {
  private mode: 'select' | 'update' | 'upsert' = 'select'
  private values: Row = {}
  private filters: Row = {}
  private inFilter: { col: string; vals: unknown[] } | null = null
  private gteV: string | null = null
  private lteV: string | null = null
  private ltV: string | null = null
  constructor(private w: World, private table: string) {}
  select() { return this }
  eq(c: string, v: unknown) { this.filters[c] = v; return this }
  in(c: string, v: unknown[]) { this.inFilter = { col: c, vals: v }; return this }
  private liveOnly = false
  is(c: string, v: unknown) { if (c === 'deleted_at' && v === null) this.liveOnly = true; return this }
  order() { return this }
  limit() { return this }
  gte(_c: string, v: string) { this.gteV = v; return this }
  lte(_c: string, v: string) { this.lteV = v; return this }
  lt(_c: string, v: string) { this.ltV = v; return this }
  maybeSingle() { return this }
  update(v: Row) { this.mode = 'update'; this.values = v; return this }
  upsert(v: Row) { this.mode = 'upsert'; this.values = v; return this }
  then<T>(res: (r: { data: unknown; error: null }) => T, rej?: (e: unknown) => T) {
    return Promise.resolve().then(() => this.run()).then(res, rej)
  }
  private inWindow(at: string) {
    const t = Date.parse(at)
    return (this.gteV === null || t >= Date.parse(this.gteV)) &&
      (this.lteV === null || t <= Date.parse(this.lteV)) &&
      (this.ltV === null || t < Date.parse(this.ltV))
  }
  private run(): { data: unknown; error: null } {
    const w = this.w
    if (this.table === 'events' && this.filters.id !== undefined) {
      const e = w.events.find((x) => x.id === this.filters.id && !(this.liveOnly && x.deleted))
      return {
        data: e ? { ...e, pet_id: PET_ID, deleted_at: null, pets: { name: 'Nyx', species: w.species, user_id: OWNER } } : null,
        error: null,
      }
    }
    if (this.table === 'events') {
      const types = this.inFilter?.col === 'event_type' ? this.inFilter.vals : [this.filters.event_type]
      const rows = w.events
        .filter((e) => types.includes(e.event_type) && this.inWindow(e.occurred_at) && !(this.liveOnly && e.deleted))
        .map((e) => e.event_type === 'meal'
          ? { occurred_at: e.occurred_at, meals: { intake_rating: e.rating ?? null } }
          : { id: e.id, occurred_at: e.occurred_at, occurred_at_confidence: e.occurred_at_confidence ?? null })
      return { data: rows, error: null }
    }
    if (this.table === 'pets') return { data: { date_of_birth: w.birthDate }, error: null }
    if (this.table === 'event_attachments') {
      const e = w.events.find((x) => x.id === this.filters.event_id)
      return { data: e?.photo ? [{ id: '0f8e7d6c-5b4a-4938-8271-605f4e3d2c1b', storage_path: `pet-1/${e.id}/a.jpg` }] : [], error: null }
    }
    if (this.table === 'app_config') {
      return { data: w.keys.map((key) => ({ key, value: { enabled: false, allowlist: [OWNER] } })), error: null }
    }
    if (this.table !== 'event_ai_analysis') throw new Error(`unexpected table ${this.table}`)
    const id = (this.mode === 'upsert' ? this.values.event_id : this.filters.event_id) as string
    const row = w.rows.get(id) ?? null
    if (this.mode === 'select') return { data: row ? { ...row } : null, error: null }
    w.writes++
    if (this.mode === 'update') {
      if (!row) return { data: [], error: null }
      Object.assign(row, this.values)
      return { data: [{ id: row.id }], error: null }
    }
    w.rows.set(id, row ? Object.assign(row, this.values) : { id: `a-${id}`, edited_at: null, dismissed_at: null, ...this.values })
    return { data: null, error: null }
  }
}

function deps(w: World): PipelineDeps {
  const client = {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: OWNER } }, error: null }) },
    from: (t: string) => new FakeQuery(w, t),
    rpc: () => {
      w.calls.usage++
      if (!w.photoRead) throw new Error('the floor spent a cap unit')
      return Promise.resolve({ data: { day_count: 1, month_count: 1 }, error: null })
    },
    storage: {
      from: () => ({
        download: () => {
          w.calls.storage++
          if (!w.photoRead) throw new Error('the floor downloaded a photo')
          return Promise.resolve({ data: new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])]), error: null })
        },
      }),
    },
  } as unknown as SupabaseClient
  return {
    userClient: () => client,
    adminClient: () => client,
    vision: (() => {
      w.calls.model++
      if (!w.photoRead) throw new Error('the floor called the model')
      w.photoRead.during?.(w)
      return Promise.resolve(structuredClone(w.photoRead.analysis))
    }) as PipelineDeps['vision'],
  }
}

async function call(w: World, body: Row): Promise<{ status: number; json: Row }> {
  const quiet = { error: console.error, warn: console.warn, info: console.info }
  console.error = console.warn = console.info = () => {}
  try {
    const res = await runIncidentAnalysis(
      VOMIT_DESCRIPTOR,
      new Request('http://local/analyze-vomit', { method: 'POST', headers: { Authorization: 'Bearer t' }, body: JSON.stringify(body) }),
      deps(w),
    )
    return { status: res.status, json: await res.json() }
  } finally {
    Object.assign(console, quiet)
  }
}

const ON = ['engines_v3_en3', 'engines_v3_en4']
function world(p: Partial<World> & { events: Ev[] }): World {
  return { species: 'cat', birthDate: '2020-01-01', keys: ON, rows: new Map(), calls: { storage: 0, model: 0, usage: 0 }, writes: 0, ...p }
}
const noPhotoPathTouched = (w: World) => assertEquals(w.calls, { storage: 0, model: 0, usage: 0 })

// The headline: "a cat vomiting three times in four hours with no photos gets no call anywhere."
function photolessTriple(): Ev[] {
  const t = Date.now() - 5 * H
  return [
    { id: 'v1', event_type: 'vomit', occurred_at: iso(t), occurred_at_confidence: 'witnessed' },
    { id: 'v2', event_type: 'vomit', occurred_at: iso(t + 2 * H), occurred_at_confidence: 'witnessed' },
    { id: 'v3', event_type: 'vomit', occurred_at: iso(t + 4 * H), occurred_at_confidence: 'estimated' },
  ]
}

Deno.test('floor · the photoless triple: every vomit is read call now, with no photo, model or cap unit', async () => {
  const w = world({ events: photolessTriple() })
  for (const id of ['v1', 'v2', 'v3']) {
    const r = await call(w, { event_id: id, mode: 'floor' })
    assertStrictEquals(r.status, 200)
    const row = w.rows.get(id)!
    assertStrictEquals(row.recommendation, 'worth_a_call')
    assertStrictEquals(row.tier, 'call_now')
    assertEquals(row.contextual_flags, ['repeated_vomiting'])
    assertStrictEquals(row.read_text, floorSentence('Nyx', incidentFloor({
      anchor: { at: w.events.find((e) => e.id === id)!.occurred_at, confidence: w.events.find((e) => e.id === id)!.occurred_at_confidence ?? null },
      vomits: w.events.map((e) => ({ at: e.occurred_at, confidence: e.occurred_at_confidence ?? null })),
      lethargyAt: [], species: 'cat', birthDate: '2020-01-01',
    }), 'T2'))
  }
  noPhotoPathTouched(w)
})

Deno.test('floor · flag-off: the floor-only mode writes nothing, and an ordinary read is today\'s call today', async () => {
  for (const keys of [[], ['engines_v3_en3'], ['engines_v3_en4']]) {
    const w = world({ events: photolessTriple(), keys })
    const r = await call(w, { event_id: 'v3', mode: 'floor' })
    assertEquals([r.status, r.json.skipped], [200, 'floor_off'])
    assertStrictEquals(w.writes, 0)
    const re = await call(w, { event_id: 'v3', mode: 'refloor' })
    assertEquals([re.status, re.json.skipped], [200, 'floor_off'])
    assertStrictEquals(w.writes, 0)
  }
  // The ordinary read of the same record, en3 on and en4 off: today's rule, call today.
  const w = world({ events: photolessTriple(), keys: ['engines_v3_en3'] })
  await call(w, { event_id: 'v3' })
  assertStrictEquals(w.rows.get('v3')!.tier, 'call_today')
  noPhotoPathTouched(w)
})

Deno.test('floor · the ordinary photoless read carries the floor too (the photo path is not the only door)', async () => {
  const w = world({ events: photolessTriple() })
  await call(w, { event_id: 'v2' })
  assertStrictEquals(w.rows.get('v2')!.tier, 'call_now')
  noPhotoPathTouched(w)
})

Deno.test('floor · a lone photoless vomit is not enough to say, in both columns, never logged', async () => {
  const w = world({ events: [{ id: 'v1', event_type: 'vomit', occurred_at: iso(Date.now() - H), occurred_at_confidence: 'witnessed' }] })
  await call(w, { event_id: 'v1', mode: 'floor' })
  const row = w.rows.get('v1')!
  assertEquals([row.recommendation, row.tier], ['not_enough_to_say', 'not_enough_to_say'])
})

Deno.test('floor · a photographed vomit whose photo has not been read is left to that read', async () => {
  const w = world({ events: photolessTriple().map((e) => (e.id === 'v3' ? { ...e, photo: true } : e)) })
  const r = await call(w, { event_id: 'v3', mode: 'floor' })
  assertEquals(r.json.skipped, 'photo_read_pending')
  assertStrictEquals(w.writes, 0)
  noPhotoPathTouched(w)
})

Deno.test('floor · a photographed, read vomit is raised from the stored row alone: structured fields and the photo finding stay', async () => {
  const w = world({ events: photolessTriple().map((e) => (e.id === 'v3' ? { ...e, photo: true } : e)) })
  w.rows.set('v3', {
    id: 'a-v3', event_id: 'v3', pet_id: PET_ID, status: 'completed', recommendation: 'monitor', tier: 'logged',
    read_text: 'earlier words', visual_flags: [], contextual_flags: [], blood_present: 'none_visible',
    foreign_material_present: 'no', edited_at: null, dismissed_at: null,
  })
  const r = await call(w, { event_id: 'v3', mode: 'floor' })
  assertStrictEquals(r.status, 200)
  const row = w.rows.get('v3')!
  assertEquals([row.recommendation, row.tier], ['worth_a_call', 'call_now'])
  assertStrictEquals(row.blood_present, 'none_visible') // untouched: the write carried read columns only
  assertEquals(row.contextual_flags, ['repeated_vomiting'])
  noPhotoPathTouched(w)
})

Deno.test('floor · the stored photo finding leads the raised read, in template words, never the model\'s', async () => {
  const w = world({ events: photolessTriple().map((e) => (e.id === 'v3' ? { ...e, photo: true } : e)) })
  w.rows.set('v3', {
    id: 'a-v3', event_id: 'v3', pet_id: PET_ID, status: 'completed', recommendation: 'worth_a_call', tier: 'call_today',
    read_text: 'MODEL WORDS', visual_flags: ['suspected_foreign_material'], contextual_flags: [],
    foreign_material_present: 'yes', blood_present: 'no', edited_at: null, dismissed_at: null,
  })
  await call(w, { event_id: 'v3', mode: 'floor' })
  const row = w.rows.get('v3')!
  assertStrictEquals(row.tier, 'call_now')
  assertEquals(row.visual_flags, ['suspected_foreign_material'])
  assertStrictEquals(String(row.read_text).startsWith("I can see something that doesn't look like food in this photo. Nyx has thrown up"), true)
  assertStrictEquals(String(row.read_text).includes('MODEL'), false)
})

Deno.test('floor · a floor-only run never lowers: nothing louder to say writes nothing', async () => {
  const w = world({ events: photolessTriple().map((e) => (e.id === 'v3' ? { ...e, photo: true } : e)) })
  const stored = {
    id: 'a-v3', event_id: 'v3', pet_id: PET_ID, status: 'completed', recommendation: 'worth_a_call', tier: 'call_now',
    read_text: 'kept', visual_flags: [], contextual_flags: ['repeated_vomiting'], edited_at: null, dismissed_at: null,
  }
  w.rows.set('v3', { ...stored })
  const r = await call(w, { event_id: 'v3', mode: 'floor' })
  assertEquals(r.json.skipped, 'nothing_raised')
  assertStrictEquals(w.writes, 0)
  assertEquals(w.rows.get('v3'), stored)
})

Deno.test('floor · the 24 h re-run: lethargy raises every vomit before it, with no photo, model or cap unit', async () => {
  const t = Date.now() - 6 * H
  const events: Ev[] = [
    { id: 'v1', event_type: 'vomit', occurred_at: iso(t), occurred_at_confidence: 'witnessed', photo: true },
    { id: 'v2', event_type: 'vomit', occurred_at: iso(t + 3 * H), occurred_at_confidence: 'window' },
    { id: 'old', event_type: 'vomit', occurred_at: iso(t - 40 * H), occurred_at_confidence: 'witnessed' },
  ]
  const w = world({ events })
  // Before: v1's photo read said keep an eye out; v2 had its photoless read.
  w.rows.set('v1', {
    id: 'a-v1', event_id: 'v1', pet_id: PET_ID, status: 'completed', recommendation: 'monitor', tier: 'logged',
    read_text: 'earlier', visual_flags: [], contextual_flags: [], blood_present: 'none_visible', edited_at: null, dismissed_at: null,
  })
  await call(w, { event_id: 'v2', mode: 'floor' })
  // Two in 4 h is today's repeat rule (T5a), which the floor leaves as it is: call today.
  assertEquals([w.rows.get('v2')!.recommendation, w.rows.get('v2')!.tier], ['worth_a_call', 'call_today'])

  w.events.push({ id: 'l1', event_type: 'lethargy', occurred_at: iso(t + 5 * H) })
  const r = await call(w, { event_id: 'l1', mode: 'refloor' })
  assertStrictEquals(r.status, 200)
  assertStrictEquals(r.json.refloored, 2) // v1 and v2; the vomit 40 h back is outside the 24 h
  for (const id of ['v1', 'v2']) {
    assertStrictEquals(w.rows.get(id)!.tier, 'call_now')
    assertEquals((w.rows.get(id)!.contextual_flags as string[]).includes('concurrent_lethargy'), true)
    assertStrictEquals(String(w.rows.get(id)!.read_text).includes('low on energy'), true)
  }
  assertStrictEquals(w.rows.get('v1')!.blood_present, 'none_visible')
  assertStrictEquals(w.rows.has('old'), false)
  noPhotoPathTouched(w)
})

Deno.test('floor · never lower a shown call: call today at 8:00, a meal rated All at 12:00, re-floored', async () => {
  // A cat that tracks intake, no good meal in the day before the vomit: today's feline arm,
  // call today. Then she eats everything, and the meal re-floors the vomit.
  const t = Date.now() - 6 * H
  const events: Ev[] = [
    { id: 'v1', event_type: 'vomit', occurred_at: iso(t), occurred_at_confidence: 'witnessed' },
    { id: 'm0', event_type: 'meal', occurred_at: iso(t - 3 * H), rating: 'refused' },
  ]
  const w = world({ events })
  await call(w, { event_id: 'v1' })
  const shown = { ...w.rows.get('v1')! }
  assertEquals([shown.recommendation, shown.tier], ['worth_a_call', 'call_today'])

  w.events.push({ id: 'm1', event_type: 'meal', occurred_at: iso(t + 4 * H), rating: 'all' })
  await call(w, { event_id: 'm1', mode: 'refloor' })
  assertEquals(w.rows.get('v1'), shown)
  noPhotoPathTouched(w)
})

Deno.test('floor · the refloor refuses an event type that does not re-floor', async () => {
  const w = world({ events: [...photolessTriple(), { id: 's1', event_type: 'diarrhea', occurred_at: iso(Date.now() - H) }] })
  const r = await call(w, { event_id: 's1', mode: 'refloor' })
  assertStrictEquals(r.status, 400)
  assertStrictEquals(w.writes, 0)
})

Deno.test('floor · a dog\'s two vomits in a day, ten hours apart, read call today (T6); a cat\'s are not raised', async () => {
  const t = Date.now() - 12 * H
  const events: Ev[] = [
    { id: 'v1', event_type: 'vomit', occurred_at: iso(t), occurred_at_confidence: 'witnessed' },
    { id: 'v2', event_type: 'vomit', occurred_at: iso(t + 10 * H), occurred_at_confidence: 'window' },
  ]
  const dog = world({ events, species: 'dog' })
  await call(dog, { event_id: 'v2', mode: 'floor' })
  assertEquals([dog.rows.get('v2')!.tier, dog.rows.get('v2')!.contextual_flags], ['call_today', ['repeated_vomiting']])
  const cat = world({ events })
  await call(cat, { event_id: 'v2', mode: 'floor' })
  assertStrictEquals(cat.rows.get('v2')!.tier, 'not_enough_to_say')
})

Deno.test('floor · stool has no floor-only mode', async () => {
  const w = world({ events: photolessTriple() })
  const res = await runIncidentAnalysis(
    STOOL_DESCRIPTOR,
    new Request('http://local/analyze-stool', { method: 'POST', headers: { Authorization: 'Bearer t' }, body: JSON.stringify({ event_id: 'v1', mode: 'floor' }) }),
    deps(w),
  )
  assertStrictEquals(res.status, 400)
  assertStrictEquals(w.writes, 0)
})

// Pattern 8, over every floor sentence: the same test-only vocabulary as index.test.ts's
// REASSURE_VOCAB (mirrored, same question), plus no "!" and no timing word the stored text
// could not keep true (the chip carries "now" / "today", resolved against the clock).
const REASSURE_VOCAB =
  /\b(fine|okay|ok|healthy|normal|unremarkable|all clear|nothing (?:to worry|concerning|alarming))\b/i
Deno.test('floor · every floor sentence never reassures, never exclaims, never names how soon', () => {
  const base = { tier: 'call_now' as const, rows: [], counts: { burst: 3, span: 3, pair: 2 }, ageUnknown: false }
  for (const row of ['T1', 'T2', 'T3', 'T6', 'T7', 'T8'] as const) {
    for (const ageUnknown of [false, true]) {
      const t = floorSentence('Mochi', { ...base, ageUnknown }, row)
      assertStrictEquals(REASSURE_VOCAB.test(t), false, t)
      assertStrictEquals(t.includes('!'), false, t)
      assertStrictEquals(/\b(now|today|tonight|tomorrow|episode)/i.test(t), false, t)
      assertStrictEquals(t.includes('Mochi'), true, t)
    }
  }
})

const CLEAN: VomitAnalysis = {
  appears_to_show_vomit: true, colour: 'yellow', contents: ['foam'], consistency: 'foamy', blood_present: 'none_visible',
  bile_present: 'no', foreign_material_present: 'no', foreign_material_note: null, description: null,
  visual_flags: [], recommendation: 'monitor', read_text: null, confidence: null,
}

Deno.test('floor · adversarial D2: lethargy backdated before a vomit already logged still raises it', async () => {
  const t = Date.now() - 6 * H
  const w = world({ events: [{ id: 'v1', event_type: 'vomit', occurred_at: iso(t), occurred_at_confidence: 'witnessed' }] })
  await call(w, { event_id: 'v1', mode: 'floor' })
  assertStrictEquals(w.rows.get('v1')!.tier, 'not_enough_to_say')
  // "Flat all morning", logged afterwards, dated two hours BEFORE the vomit.
  w.events.push({ id: 'l1', event_type: 'lethargy', occurred_at: iso(t - 2 * H) })
  const r = await call(w, { event_id: 'l1', mode: 'refloor' })
  assertStrictEquals(r.json.refloored, 1)
  assertStrictEquals(w.rows.get('v1')!.tier, 'call_now')
  noPhotoPathTouched(w)
})

Deno.test('floor · adversarial D2: a vomit logged late, dated before its neighbour, raises the neighbour', async () => {
  const t = Date.now() - 8 * H
  const w = world({
    events: [
      { id: 'v2', event_type: 'vomit', occurred_at: iso(t + 2 * H), occurred_at_confidence: 'witnessed' },
      { id: 'v3', event_type: 'vomit', occurred_at: iso(t + 3 * H), occurred_at_confidence: 'witnessed' },
    ],
  })
  await call(w, { event_id: 'v3', mode: 'floor' })
  assertStrictEquals(w.rows.get('v3')!.tier, 'call_today') // today's two-in-4-h rule
  w.events.push({ id: 'v1', event_type: 'vomit', occurred_at: iso(t), occurred_at_confidence: 'witnessed' })
  await call(w, { event_id: 'v1', mode: 'refloor' })
  assertStrictEquals(w.rows.get('v3')!.tier, 'call_now') // three onsets in 4 h (T2)
})

Deno.test('floor · adversarial D3: lethargy logged while the photo is being read still raises that read', async () => {
  const t = Date.now() - 10 * 60_000
  const w = world({
    events: [{ id: 'v1', event_type: 'vomit', occurred_at: iso(t), occurred_at_confidence: 'witnessed', photo: true }],
    photoRead: {
      analysis: CLEAN,
      during: (x) => { x.events.push({ id: 'l1', event_type: 'lethargy', occurred_at: iso(Date.now()) }) },
    },
  })
  const r = await call(w, { event_id: 'v1' })
  assertStrictEquals(r.status, 200)
  const row = w.rows.get('v1')!
  assertEquals([row.recommendation, row.tier], ['worth_a_call', 'call_now'])
  assertEquals((row.contextual_flags as string[]).includes('concurrent_lethargy'), true)
})

Deno.test('floor · adversarial D3: flag-off, the photo read is today\'s single look at the record', async () => {
  const t = Date.now() - 10 * 60_000
  const w = world({
    keys: ['engines_v3_en3'],
    events: [{ id: 'v1', event_type: 'vomit', occurred_at: iso(t), occurred_at_confidence: 'witnessed', photo: true }],
    photoRead: {
      analysis: CLEAN,
      during: (x) => { x.events.push({ id: 'l1', event_type: 'lethargy', occurred_at: iso(Date.now()) }) },
    },
  })
  await call(w, { event_id: 'v1' })
  assertEquals([w.rows.get('v1')!.recommendation, w.rows.get('v1')!.tier], ['monitor', 'logged'])
})

Deno.test('floor · adversarial D5: an owner-corrected photo finding is not asserted by the floor\'s words', async () => {
  const w = world({ events: photolessTriple().map((e) => (e.id === 'v3' ? { ...e, photo: true } : e)) })
  w.rows.set('v3', {
    id: 'a-v3', event_id: 'v3', pet_id: PET_ID, status: 'completed', recommendation: 'worth_a_call', tier: 'call_today',
    read_text: 'earlier', visual_flags: ['blood'], contextual_flags: [], blood_present: 'none_visible',
    foreign_material_present: 'no', edited_at: iso(Date.now() - H), dismissed_at: null,
  })
  await call(w, { event_id: 'v3', mode: 'floor' })
  const row = w.rows.get('v3')!
  assertStrictEquals(row.tier, 'call_now')
  assertStrictEquals(String(row.read_text).includes('blood'), false)
  assertStrictEquals(String(row.read_text).startsWith('Nyx has thrown up'), true)
  assertEquals(row.visual_flags, ['blood']) // the cache is left as the owner's edit left it (Pattern 7)
})

Deno.test('floor · adversarial D4: soft-deleting a mis-logged meal re-floors, and the intake arm it hid comes back', async () => {
  const t = Date.now() - 6 * H
  const w = world({
    events: [
      { id: 'v1', event_type: 'vomit', occurred_at: iso(t), occurred_at_confidence: 'witnessed' },
      { id: 'm0', event_type: 'meal', occurred_at: iso(t - 5 * H), rating: 'refused' },
      { id: 'm1', event_type: 'meal', occurred_at: iso(t - 2 * H), rating: 'all' },
    ],
  })
  await call(w, { event_id: 'v1', mode: 'floor' })
  assertStrictEquals(w.rows.get('v1')!.tier, 'not_enough_to_say')
  w.events.find((e) => e.id === 'm1')!.deleted = true
  const r = await call(w, { event_id: 'm1', mode: 'refloor' })
  assertStrictEquals(r.status, 200)
  assertEquals([w.rows.get('v1')!.tier, w.rows.get('v1')!.contextual_flags], ['call_today', ['feline_reduced_intake']])
})
