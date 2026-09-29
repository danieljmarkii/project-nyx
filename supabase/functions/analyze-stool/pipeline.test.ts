// EN-7's with-and-without pipeline diff (CUL-1138; Engines v3 PR-26). Run with:
// deno test supabase/functions/analyze-stool/
//
// The real stool descriptor (reads, the EN-7 rule, copy, the post-read hook, stamps) driven
// through the real shared pipeline, once with engines_v3_en3 off for the pet's owner and
// once on, over the same hand-built record. Flag-off must be the shipped read word for word
// (the spill-over included: that is today). Flag-on:
//   · a formed stool beside one vomit gets no call from the pair (T23);
//   · a loose stool beside any vomit is call today (S1), logged Loose or read loose;
//   · a formed stool beside vomiting that meets the repeat rule keeps the call (Dr. Chen's
//     pin), with words about the vomiting, never about loose stool.
// The fake answers reads as PostgREST does for the filters the descriptor sends (eq, is
// null, gte), so a read bound that is too narrow drops rows here as it would live. Times
// are relative to the real clock because assembleContext reads Date.now().

import { assertEquals, assertStrictEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { runIncidentAnalysis, type PipelineDeps, type SupabaseClient } from '../_shared/incident-analysis.ts'
import { buildContextualReadText, buildEn7VomitReadText, STOOL_DESCRIPTOR, type StoolAnalysis } from './index.ts'

type Row = Record<string, unknown>
const H = 3_600_000
const OWNER = 'owner-1'

interface World {
  eventType: 'stool_normal' | 'diarrhea'
  stoolMs: number
  others: { event_type: string; occurred_at: string; rating?: string | null }[]
  species?: 'cat' | 'dog'
  // How many photos the event carries (each is downloadable); the model reads the first 3.
  photos?: number
  // A vision call that throws (e.g. a 529, or a 400 for an unreadable image).
  visionThrows?: string
  en3: boolean
  vision: StoolAnalysis
  dayCount: number
  row: Row | null
  visionCalls: number
}

const iso = (ms: number) => new Date(ms).toISOString()

class FakeQuery {
  private mode: 'select' | 'update' | 'upsert' = 'select'
  private values: Row = {}
  private filters: Row = {}
  private since: string | null = null
  constructor(private w: World, private table: string) {}
  select() { return this }
  eq(c: string, v: unknown) { this.filters[c] = v; return this }
  is() { return this }
  in() { return this }
  order() { return this }
  limit() { return this }
  gte(_c: string, v: string) { this.since = v; return this }
  maybeSingle() { return this }
  update(v: Row) { this.mode = 'update'; this.values = v; return this }
  upsert(v: Row) { this.mode = 'upsert'; this.values = v; return this }
  then<T>(res: (r: { data: unknown; error: null }) => T, rej?: (e: unknown) => T) {
    return Promise.resolve().then(() => this.run()).then(res, rej)
  }
  private run(): { data: unknown; error: null } {
    const w = this.w
    if (this.table === 'events' && this.filters.id !== undefined) {
      return {
        data: {
          id: 'evt-1', pet_id: 'pet-1', event_type: w.eventType, occurred_at: iso(w.stoolMs), deleted_at: null,
          pets: { name: 'Cooper', species: w.species ?? 'dog', user_id: OWNER },
        },
        error: null,
      }
    }
    if (this.table === 'events') {
      const all = [{ event_type: w.eventType, occurred_at: iso(w.stoolMs) }, ...w.others]
      const rows = all
        .filter((e) => e.event_type === this.filters.event_type)
        .filter((e) => this.since === null || Date.parse(e.occurred_at) >= Date.parse(this.since))
        .map((e) => (e.event_type === 'meal' ? { occurred_at: e.occurred_at, meals: { intake_rating: e.rating ?? null } } : { id: 'x', occurred_at: e.occurred_at }))
      return { data: rows, error: null }
    }
    if (this.table === 'event_attachments') {
      const n = w.photos ?? 1
      return { data: Array.from({ length: n }, (_, i) => ({ id: `0f8e7d6c-5b4a-4938-8271-605f4e3d2c1${i}`, storage_path: `pet-1/evt-1/${i}.jpg` })), error: null }
    }
    if (this.table === 'app_config') {
      return { data: w.en3 ? [{ key: 'engines_v3_en3', value: { enabled: false, allowlist: [OWNER] } }] : [], error: null }
    }
    if (this.table !== 'event_ai_analysis') throw new Error(`unexpected table ${this.table}`)
    if (this.mode === 'select') return { data: w.row ? { ...w.row } : null, error: null }
    if (this.mode === 'update') {
      if (!w.row) return { data: [], error: null }
      Object.assign(w.row, this.values)
      return { data: [{ id: w.row.id }], error: null }
    }
    w.row = w.row ? Object.assign(w.row, this.values) : { id: 'a1', edited_at: null, ...this.values }
    return { data: null, error: null }
  }
}

function deps(w: World): PipelineDeps {
  const client = {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: OWNER } }, error: null }) },
    from: (t: string) => new FakeQuery(w, t),
    rpc: () => Promise.resolve({ data: { day_count: w.dayCount, month_count: w.dayCount }, error: null }),
    storage: { from: () => ({ download: () => Promise.resolve({ data: new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])]), error: null }) }) },
  } as unknown as SupabaseClient
  return {
    userClient: () => client,
    adminClient: () => client,
    // deno-lint-ignore require-await
    vision: (async () => {
      w.visionCalls++
      if (w.visionThrows) throw new Error(w.visionThrows)
      return structuredClone(w.vision)
    }) as PipelineDeps['vision'],
  }
}

async function read(w: World, expectStatus = 200): Promise<Row> {
  const quiet = { error: console.error, warn: console.warn, info: console.info }
  console.error = console.warn = console.info = () => {}
  try {
    const res = await runIncidentAnalysis(
      STOOL_DESCRIPTOR,
      new Request('http://local/analyze-stool', { method: 'POST', headers: { Authorization: 'Bearer t' }, body: JSON.stringify({ event_id: 'evt-1' }) }),
      deps(w),
    )
    assertStrictEquals(res.status, expectStatus)
  } finally {
    Object.assign(console, quiet)
  }
  return w.row!
}

const FORMED: StoolAnalysis = {
  appears_to_show_stool: true, consistency: 'type_4_smooth_soft', colour: 'brown', contents: null, blood_present: 'no',
  blood_type: null, mucus_present: 'no', foreign_material_present: 'no', foreign_material_note: null, description: null,
  visual_flags: [], recommendation: 'monitor', read_text: null, confidence: null,
}
const WATERY: StoolAnalysis = { ...FORMED, consistency: 'type_7_watery' }
const HARD: StoolAnalysis = { ...FORMED, consistency: 'type_1_hard_lumps' }

type Scenario = Omit<World, 'en3' | 'row' | 'visionCalls' | 'dayCount'> & { dayCount?: number }

async function diff(make: () => Scenario): Promise<{ off: Row; on: Row }> {
  const off = await read({ dayCount: 1, ...make(), en3: false, row: null, visionCalls: 0 })
  const on = await read({ dayCount: 1, ...make(), en3: true, row: null, visionCalls: 0 })
  return { off: { ...off }, on: { ...on } }
}

const oneVomit = (stoolMs: number) => [{ event_type: 'vomit', occurred_at: iso(stoolMs - 3 * H) }]

Deno.test('EN-7 · a formed stool beside one vomit: no call from the pair flag-on; flag-off is today\'s spill-over', async () => {
  const { off, on } = await diff(() => {
    const stoolMs = Date.now() - 1 * H
    return { eventType: 'stool_normal', stoolMs, others: oneVomit(stoolMs), vision: FORMED }
  })
  // Flag-off: exactly the shipped read, false sentence and all (this PR does not touch it).
  assertStrictEquals(off.recommendation, 'worth_a_call')
  assertEquals(off.contextual_flags, ['concurrent_vomiting'])
  assertStrictEquals(off.read_text, buildContextualReadText('Cooper', ['concurrent_vomiting']))
  assertStrictEquals('tier' in off, false)
  // Flag-on: the stool's own read; the vomit's read carries the vomit (T23).
  assertStrictEquals(on.recommendation, 'monitor')
  assertStrictEquals(on.tier, 'logged')
  assertEquals(on.contextual_flags, [])
  assertStrictEquals(on.rule_version, 'f2.stool2')
})

Deno.test('EN-7 · a stool logged Loose beside one vomit: call today (S1), with words about loose stool', async () => {
  const { off, on } = await diff(() => {
    const stoolMs = Date.now() - 1 * H
    return { eventType: 'diarrhea', stoolMs, others: oneVomit(stoolMs), vision: FORMED }
  })
  assertStrictEquals(off.recommendation, 'worth_a_call')
  assertStrictEquals(on.recommendation, 'worth_a_call')
  assertStrictEquals(on.tier, 'call_today')
  assertEquals(on.contextual_flags, ['concurrent_vomiting'])
  assertStrictEquals(on.read_text, buildEn7VomitReadText('Cooper', 'logged_loose'))
})

Deno.test('EN-7 · a stool logged Normal that the photo reads as watery, beside one vomit: call today, from the read', async () => {
  const { on } = await diff(() => {
    const stoolMs = Date.now() - 1 * H
    return { eventType: 'stool_normal', stoolMs, others: oneVomit(stoolMs), vision: WATERY }
  })
  assertStrictEquals(on.tier, 'call_today')
  assertEquals(on.contextual_flags, ['concurrent_vomiting'])
  assertStrictEquals(on.read_text, buildEn7VomitReadText('Cooper', 'read_loose'))
})

Deno.test('EN-7 · a hard, dry stool beside one vomit: call today, and the words say hard, never loose', async () => {
  const { on } = await diff(() => {
    const stoolMs = Date.now() - 1 * H
    return { eventType: 'stool_normal', stoolMs, others: oneVomit(stoolMs), vision: HARD }
  })
  assertStrictEquals(on.tier, 'call_today')
  assertStrictEquals(on.read_text, buildEn7VomitReadText('Cooper', 'read_hard'))
  assertStrictEquals(String(on.read_text).includes('loose'), false)
})

Deno.test('EN-7 · Dr. Chen\'s pin: a formed stool beside vomiting that meets the repeat rule keeps the call', async () => {
  // Two vomits 2 h apart (the 4-hour arm), and a third a day and a half back that only the
  // widened read sees (it proves the read reaches past the concurrent window).
  const cases: Array<(stoolMs: number) => { event_type: string; occurred_at: string }[]> = [
    (s) => [{ event_type: 'vomit', occurred_at: iso(s - 3 * H) }, { event_type: 'vomit', occurred_at: iso(s - 5 * H) }],
    // Three in 24 h, all more than 4 h apart.
    (s) => [5, 11, 17].map((h) => ({ event_type: 'vomit', occurred_at: iso(s - h * H) })),
    // An anchor near the window's edge, counted with vomits only the widened read returns.
    (s) => [20, 30, 36].map((h) => ({ event_type: 'vomit', occurred_at: iso(s - h * H) })),
  ]
  for (const others of cases) {
    const { off, on } = await diff(() => {
      const stoolMs = Date.now() - 1 * H
      return { eventType: 'stool_normal', stoolMs, others: others(stoolMs), vision: FORMED }
    })
    assertStrictEquals(off.recommendation, 'worth_a_call')
    assertStrictEquals(on.tier, 'call_today')
    assertEquals(on.contextual_flags, ['concurrent_vomiting'])
    assertStrictEquals(on.read_text, buildEn7VomitReadText('Cooper', 'repeats'))
    assertStrictEquals(String(on.read_text).includes('loose'), false)
  }
})

Deno.test('EN-7 · two vomits more than 4 h apart and nothing else: no repeat, so a formed stool gets no call', async () => {
  const { on } = await diff(() => {
    const stoolMs = Date.now() - 1 * H
    return {
      eventType: 'stool_normal', stoolMs, vision: FORMED,
      others: [{ event_type: 'vomit', occurred_at: iso(stoolMs - 2 * H) }, { event_type: 'vomit', occurred_at: iso(stoolMs - 12 * H) }],
    }
  })
  assertEquals(on.contextual_flags, [])
  assertStrictEquals(on.tier, 'logged')
})

// F2: every path that never sees the stool's form keeps today's call.
const unreadWorld = (o: Partial<World>): World => ({
  eventType: 'stool_normal', stoolMs: Date.now() - H, others: oneVomit(Date.now() - H), vision: FORMED,
  en3: true, row: null, visionCalls: 0, dayCount: 1, ...o,
})

Deno.test('EN-7 F2 · a capped read beside one vomit keeps the call, logged Normal or Loose', async () => {
  for (const eventType of ['stool_normal', 'diarrhea'] as const) {
    const w = unreadWorld({ eventType, dayCount: 11 })
    const row = await read(w)
    assertStrictEquals(w.visionCalls, 0)
    assertStrictEquals(row.recommendation, 'worth_a_call', eventType)
    assertStrictEquals(row.tier, 'call_today', eventType)
  }
})

Deno.test('EN-7 F2 · an unreadable photo, a failed call, a partial read, type 5 or unsure: the call stands', async () => {
  const unreadable = await read(unreadWorld({ visionThrows: 'Claude API error 400: could not process image' }))
  assertStrictEquals(unreadable.tier, 'call_today')
  const failed = await read(unreadWorld({ visionThrows: 'Claude API error 529: overloaded' }), 500)
  assertStrictEquals(failed.recommendation, 'worth_a_call')
  assertStrictEquals(failed.tier, 'call_today')
  assertStrictEquals(failed.status, 'failed')
  // Two photos, both read, one consistency back: a multi-photo read never withdraws (R3).
  const two = await read(unreadWorld({ photos: 2 }))
  assertStrictEquals(two.tier, 'call_today')
  // Four photos, three read, all formed: an unread frame could be loose (B-203's reasoning).
  const partial = await read(unreadWorld({ photos: 4 }))
  assertStrictEquals(partial.tier, 'call_today')
  assertEquals(partial.contextual_flags, ['concurrent_vomiting'])
  for (const consistency of ['type_5_soft_blobs', 'unsure']) {
    const row = await read(unreadWorld({ vision: { ...FORMED, consistency } }))
    assertStrictEquals(row.tier, 'call_today', consistency)
    assertStrictEquals(row.read_text, buildEn7VomitReadText('Cooper', 'unread'), consistency)
  }
  const notStool = await read(unreadWorld({ vision: { ...FORMED, appears_to_show_stool: false } }))
  assertStrictEquals(notStool.tier, 'call_today')
})

Deno.test('EN-7 R2 · a Re-run reading type 4 never withdraws over the owner\'s correction to watery', async () => {
  const w = unreadWorld({
    row: { id: 'a1', pet_id: 'pet-1', edited_at: '2026-09-29T00:00:00Z', stool_consistency: 'type_7_watery', recommendation: 'monitor', status: 'completed' },
  })
  const row = await read(w)
  assertStrictEquals(row.tier, 'call_today')
  assertStrictEquals(row.stool_consistency, 'type_7_watery') // the owner's edit is kept (Pattern 7)
})

Deno.test('EN-7 F1 · a cat with no Most or All meal, one unopened photoless vomit, a formed stool: the call stands', async () => {
  const stoolMs = Date.now() - H
  const row = await read(unreadWorld({
    species: 'cat',
    others: [
      ...oneVomit(stoolMs),
      { event_type: 'meal', occurred_at: iso(stoolMs - 6 * H), rating: 'some' },
      { event_type: 'meal', occurred_at: iso(stoolMs - 72 * H), rating: 'all' },
    ],
  }))
  assertStrictEquals(row.tier, 'call_today')
  assertStrictEquals(row.read_text, buildEn7VomitReadText('Cooper', 'intake'))
  // The same cat after a Most meal: the pair adds nothing, the stool's own read stands.
  const fed = await read(unreadWorld({
    species: 'cat',
    others: [...oneVomit(stoolMs), { event_type: 'meal', occurred_at: iso(stoolMs - 6 * H), rating: 'most' }],
  }))
  assertStrictEquals(fed.tier, 'logged')
})

Deno.test('EN-7 · a vomit stays a flag the stool read cannot drop once the record gave it (the hook only adds)', async () => {
  // Logged Loose + a formed read: the record's flag stands, with the record's words.
  const { on } = await diff(() => {
    const stoolMs = Date.now() - 1 * H
    return { eventType: 'diarrhea', stoolMs, others: oneVomit(stoolMs), vision: FORMED }
  })
  assertEquals(on.contextual_flags, ['concurrent_vomiting'])
  assertStrictEquals(on.read_text, buildEn7VomitReadText('Cooper', 'logged_loose'))
})
