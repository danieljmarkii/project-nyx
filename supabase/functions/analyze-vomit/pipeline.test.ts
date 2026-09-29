// EN-0's with-and-without pipeline diff (Engines v3 PR-13a, CUL-1130). Run with:
// deno test supabase/functions/analyze-vomit/
//
// The real vomit descriptor (reads, context builder, flag rule, copy, stamps) driven
// through the real shared pipeline, once with engines_v3_en0 off for the pet's owner and
// once on, over the same hand-built record. What lands in event_ai_analysis is compared:
// flag-off must be the shipped read word for word; flag-on may change the words and may
// ADD a warning, never remove one; a stored escalation is never lowered (CUL-1201).
//
// The fake answers the reads the way PostgREST does for the filters the descriptor sends
// (eq, is null, gte), so a read bound that is too narrow drops rows here exactly as it
// would in production: scenario C is the test that the widened bounds are wired in.
// Times are relative to the real clock because assembleContext reads Date.now().

import { assertEquals, assertStrictEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { runIncidentAnalysis, type PipelineDeps, type SupabaseClient } from '../_shared/incident-analysis.ts'
import { buildContextualReadText, VOMIT_DESCRIPTOR, type VomitAnalysis } from './index.ts'

type Row = Record<string, unknown>
const H = 3_600_000
const EVENT_ID = 'evt-1'
const PET_ID = 'pet-1'
const OWNER = 'owner-1'

interface World {
  species: 'cat' | 'dog'
  vomitMs: number
  others: { event_type: string; occurred_at: string; rating?: string | null }[]
  en0: boolean
  vision: VomitAnalysis
  row: Row | null
  writes: number
}

const iso = (ms: number) => new Date(ms).toISOString()

class FakeQuery {
  private mode: 'select' | 'update' | 'upsert' = 'select'
  private values: Row = {}
  private filters: Row = {}
  private since: string | null = null
  private single = false
  constructor(private w: World, private table: string) {}
  select() { return this }
  eq(c: string, v: unknown) { this.filters[c] = v; return this }
  is() { return this }
  in() { return this }
  order() { return this }
  limit() { return this }
  gte(_c: string, v: string) { this.since = v; return this }
  maybeSingle() { this.single = true; return this }
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
          id: EVENT_ID, pet_id: PET_ID, event_type: 'vomit', occurred_at: iso(w.vomitMs), deleted_at: null,
          pets: { name: 'Nyx', species: w.species, user_id: OWNER },
        },
        error: null,
      }
    }
    if (this.table === 'events') {
      const all = [{ event_type: 'vomit', occurred_at: iso(w.vomitMs) }, ...w.others]
      const rows = all
        .filter((e) => e.event_type === this.filters.event_type)
        .filter((e) => this.since === null || Date.parse(e.occurred_at) >= Date.parse(this.since))
        .map((e) => (e.event_type === 'meal' ? { occurred_at: e.occurred_at, meals: { intake_rating: e.rating ?? null } } : { id: 'x', occurred_at: e.occurred_at }))
      return { data: rows, error: null }
    }
    if (this.table === 'event_attachments') return { data: [{ id: '0f8e7d6c-5b4a-4938-8271-605f4e3d2c1b', storage_path: 'pet-1/evt-1/a.jpg' }], error: null }
    if (this.table === 'app_config') {
      return { data: w.en0 ? [{ key: 'engines_v3_en0', value: { enabled: false, allowlist: [OWNER] } }] : [], error: null }
    }
    if (this.table !== 'event_ai_analysis') throw new Error(`unexpected table ${this.table}`)
    if (this.mode === 'select') return { data: w.row ? { ...w.row } : null, error: null }
    w.writes++
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
    rpc: () => Promise.resolve({ data: { day_count: 1, month_count: 1 }, error: null }),
    storage: { from: () => ({ download: () => Promise.resolve({ data: new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])]), error: null }) }) },
  } as unknown as SupabaseClient
  return {
    userClient: () => client,
    adminClient: () => client,
    // deno-lint-ignore require-await
    vision: (async () => structuredClone(w.vision)) as PipelineDeps['vision'],
  }
}

async function read(w: World): Promise<Row> {
  const quiet = { error: console.error, warn: console.warn, info: console.info }
  console.error = console.warn = console.info = () => {}
  try {
    const res = await runIncidentAnalysis(
      VOMIT_DESCRIPTOR,
      new Request('http://local/analyze-vomit', { method: 'POST', headers: { Authorization: 'Bearer t' }, body: JSON.stringify({ event_id: EVENT_ID }) }),
      deps(w),
    )
    assertStrictEquals(res.status, 200)
  } finally {
    Object.assign(console, quiet)
  }
  return w.row!
}

const CLEAN: VomitAnalysis = {
  appears_to_show_vomit: true, colour: 'yellow', contents: ['foam'], consistency: 'foamy', blood_present: 'none_visible',
  bile_present: 'no', foreign_material_present: 'no', foreign_material_note: null, description: null,
  visual_flags: [], recommendation: 'monitor', read_text: null, confidence: null,
}
const FOREIGN: VomitAnalysis = {
  ...CLEAN, foreign_material_present: 'yes', foreign_material_note: 'a dark grey piece', visual_flags: ['suspected_foreign_material'],
  recommendation: 'worth_a_call', read_text: 'MODEL WORDS about a grey piece', description: 'MODEL DESCRIPTION',
}

// Runs the same world twice, key off then on, from an empty row each time.
async function diff(make: () => Omit<World, 'en0' | 'row' | 'writes'>): Promise<{ off: Row; on: Row }> {
  const off = await read({ ...make(), en0: false, row: null, writes: 0 })
  const on = await read({ ...make(), en0: true, row: null, writes: 0 })
  return { off: { ...off }, on: { ...on } }
}

const ESCALATES = (r: Row) => r.recommendation === 'worth_a_call'
function assertNoWarningLost(off: Row, on: Row) {
  if (ESCALATES(off)) assertStrictEquals(ESCALATES(on), true, 'EN-0 lowered the verdict')
  for (const f of off.contextual_flags as string[]) assertStrictEquals((on.contextual_flags as string[]).includes(f), true, f)
  for (const f of off.visual_flags as string[]) assertStrictEquals((on.visual_flags as string[]).includes(f), true, f)
}

Deno.test('pipeline diff A · 8/19: a late read over unrated meals — same verdict, the record in place of the conclusion', async () => {
  const { off, on } = await diff(() => {
    const vomitMs = Date.now() - 48 * H
    return {
      species: 'cat', vomitMs, vision: CLEAN,
      others: [
        ...[2, 5, 8, 12, 16, 20].map((h) => ({ event_type: 'meal', occurred_at: iso(vomitMs - h * H), rating: null })),
        { event_type: 'meal', occurred_at: iso(vomitMs - 96 * H), rating: 'all' },
      ],
    }
  })
  assertNoWarningLost(off, on)
  assertStrictEquals(off.read_text, buildContextualReadText('Nyx', ['feline_reduced_intake']))
  assertStrictEquals(
    on.read_text,
    "6 meals are logged for Nyx in the 24 hours before this vomit, and none is marked Most or All. In a cat that's vomiting, that's worth a call to your vet sooner rather than later.",
  )
  assertEquals([off.recommendation, on.recommendation], ['worth_a_call', 'worth_a_call'])
  assertEquals(off.engine_flags, [])
  assertEquals(on.engine_flags, ['engines_v3_en0'])
  assertStrictEquals(on.rule_version, 'f1.vomit2')
})

Deno.test('pipeline diff B · 9/22: foreign material and the intake flag — the photo finding leads, the model\'s words stay out', async () => {
  const { off, on } = await diff(() => {
    const vomitMs = Date.now() - 1 * H
    return {
      species: 'cat', vomitMs, vision: FOREIGN,
      others: [
        ...[2, 6, 10, 14, 18].map((h) => ({ event_type: 'meal', occurred_at: iso(vomitMs - h * H), rating: null })),
        { event_type: 'meal', occurred_at: iso(vomitMs - 22 * H), rating: 'picked' },
      ],
    }
  })
  assertNoWarningLost(off, on)
  assertStrictEquals(off.read_text, buildContextualReadText('Nyx', ['feline_reduced_intake']))
  assertStrictEquals(
    on.read_text,
    "I can see something that doesn't look like food in this photo. 6 meals are logged for Nyx in the 24 hours before this vomit, and none is marked Most or All. In a cat that's vomiting, that's worth a call to your vet sooner rather than later.",
  )
  // Pattern 10 unchanged: a contextual read carries neither of the model's texts.
  for (const r of [off, on]) {
    assertStrictEquals(String(r.read_text).includes('MODEL'), false)
    assertStrictEquals(r.description, null)
  }
  // Everything but the words and the flag stamp is the same row.
  const strip = (r: Row) => { const { read_text: _t, engine_flags: _f, ...rest } = r; return rest }
  assertEquals(strip(on), strip(off))
})

Deno.test('pipeline diff C · a late read of a dog\'s two vomits an hour apart: EN-0 adds the warning the read-time window lost', async () => {
  const { off, on } = await diff(() => {
    const vomitMs = Date.now() - 30 * H
    return { species: 'dog', vomitMs, vision: CLEAN, others: [{ event_type: 'vomit', occurred_at: iso(vomitMs - 1 * H) }] }
  })
  assertNoWarningLost(off, on)
  assertStrictEquals(off.recommendation, 'monitor')
  assertEquals(off.contextual_flags, [])
  // Needs the widened read bound: from the read's 24 h, neither vomit is fetched at all.
  assertStrictEquals(on.recommendation, 'worth_a_call')
  assertEquals(on.contextual_flags, ['repeated_vomiting'])
  assertStrictEquals(on.read_text, buildContextualReadText('Nyx', ['repeated_vomiting']))
})

Deno.test('pipeline diff D · ate, vomited, then refused, read late: the warning stands, stated against the read', async () => {
  const { off, on } = await diff(() => {
    const vomitMs = Date.now() - 30 * H
    return {
      species: 'cat', vomitMs, vision: CLEAN,
      others: [
        { event_type: 'meal', occurred_at: iso(vomitMs - 2 * H), rating: 'all' },
        { event_type: 'meal', occurred_at: iso(vomitMs + 6 * H), rating: 'refused' },
        { event_type: 'meal', occurred_at: iso(vomitMs + 12 * H), rating: 'refused' },
      ],
    }
  })
  assertNoWarningLost(off, on)
  assertEquals(on.contextual_flags, ['feline_reduced_intake'])
  assertStrictEquals(
    on.read_text,
    "2 meals are logged for Nyx in the 24 hours before I read this, and none is marked Most or All. In a cat that's vomiting, that's worth a call to your vet sooner rather than later.",
  )
})

Deno.test('pipeline · 6/7: a flag-on re-read after the back-fill never lowers the stored escalation (CUL-1201)', async () => {
  const vomitMs = Date.now() - 10 * 60_000
  const w: World = {
    species: 'cat', vomitMs, vision: CLEAN, en0: true, writes: 0, row: null,
    others: [{ event_type: 'meal', occurred_at: iso(vomitMs - 50 * H), rating: 'most' }],
  }
  const first = { ...(await read(w)) }
  assertStrictEquals(first.recommendation, 'worth_a_call')
  assertStrictEquals(String(first.read_text).startsWith('No meals are logged for Nyx in the 24 hours before this vomit.'), true)
  // The morning's meals land; the same vomit is read again, now quiet by both halves.
  w.others.push({ event_type: 'meal', occurred_at: iso(vomitMs - 1 * H), rating: 'all' })
  const writesBefore = w.writes
  await read(w)
  assertStrictEquals(w.writes, writesBefore, 'a calmer re-read wrote over a stored escalation')
  assertEquals(w.row, first)
})
