// "May wait" through the real pipeline (Engines v3 PR-27e, CUL-1628): the predicate is unit-tested
// in incidentMayWait.test.ts; these drive runIncidentAnalysis over a small multi-row fake database
// to prove the WIRING: every write that writes `tier` writes `may_wait` (087's contract), the key
// off writes none and reads nothing new, a stored FALSE survives every later write, and a TRUE is
// re-checked when a neighbour's read or a re-floor moves the record.
// Run with: deno test supabase/functions/_shared/incidentMayWait.pipeline.test.ts

import { assertEquals, assertStrictEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  runIncidentAnalysis,
  type ContextualRun,
  type IncidentAnalysisBase,
  type IncidentCopy,
  type IncidentDescriptor,
  type PipelineDeps,
  type SupabaseClient,
} from './incident-analysis.ts'
import { photoSetKey } from './engineStamps.ts'

type Row = Record<string, unknown>
type Flag = 'repeated_vomiting' | 'concurrent_lethargy'

interface TestAnalysis extends IncidentAnalysisBase {
  // The real descriptors' field name: the re-check of a stored TRUE reads it off the payload.
  appears_to_show_vomit: boolean
  blood_present: string | null
  colour: string | null
}

const H = 3_600_000
// The pipeline reads the real clock (the DST window runs to the read plus 48 h), so the vomit is
// two hours before it, and the profile's zone is UTC, which has no DST on any calendar day the
// suite runs (C-29's time axis). The DST rule itself is pinned on fixed dates in the unit suite.
const T0 = Date.now() - 2 * H
const iso = (ms: number) => new Date(ms).toISOString()
const PET = { name: 'Rex', species: 'dog', user_id: 'owner-1' }

interface Db {
  events: Row[]
  event_attachments: Row[]
  event_ai_analysis: Row[]
  app_config: Row[]
  user_profiles: Row[]
  reads: Record<string, number>
  dayCount: number
  vision: () => TestAnalysis | null
  flags: Flag[]
  minTier?: 'call_now' | 'call_today'
  // Runs as an event_ai_analysis upsert lands: a sibling read landing beside this run's write.
  onUpsert?: (db: Db) => void
}

function makeDb(o: Partial<Db> = {}): Db {
  return {
    events: [{ id: 'evt-1', pet_id: 'pet-1', event_type: 'vomit', occurred_at: iso(T0), occurred_at_confidence: 'witnessed', deleted_at: null, pets: PET }],
    event_attachments: [],
    event_ai_analysis: [],
    app_config: [],
    user_profiles: [{ id: 'owner-1', timezone: 'UTC' }],
    reads: {},
    dayCount: 1,
    vision: () => CLEAN,
    flags: ['repeated_vomiting'],
    ...o,
  }
}

const KEYS_ON = (...keys: string[]): Row[] => keys.map((key) => ({ key, value: { enabled: true } }))

// ── The fake client: PostgREST's filters, over arrays ─────────────────────────────

class Q {
  private mode: 'select' | 'update' | 'upsert' = 'select'
  private values: Row = {}
  private preds: ((r: Row) => boolean)[] = []
  private single = false
  private returning = false
  constructor(private db: Db, private table: keyof Db) {}
  select() { if (this.mode === 'select') return this; this.returning = true; return this }
  eq(c: string, v: unknown) { this.preds.push((r) => r[c] === v); return this }
  is(c: string, v: unknown) { this.preds.push((r) => (r[c] ?? null) === v); return this }
  in(c: string, vs: unknown[]) { this.preds.push((r) => vs.includes(r[c])); return this }
  gte(c: string, v: string) { this.preds.push((r) => Date.parse(r[c] as string) >= Date.parse(v)); return this }
  lte(c: string, v: string) { this.preds.push((r) => Date.parse(r[c] as string) <= Date.parse(v)); return this }
  lt(c: string, v: string) { this.preds.push((r) => Date.parse(r[c] as string) < Date.parse(v)); return this }
  order() { return this }
  limit() { return this }
  maybeSingle() { this.single = true; return this }
  update(v: Row) { this.mode = 'update'; this.values = v; return this }
  upsert(v: Row) { this.mode = 'upsert'; this.values = v; return this }
  then<T>(res: (r: { data: unknown; error: null }) => T, rej?: (e: unknown) => T) {
    return Promise.resolve().then(() => this.run()).then(res, rej)
  }
  private rows(): Row[] { return this.db[this.table] as Row[] }
  private run(): { data: unknown; error: null } {
    const rows = this.rows()
    if (this.mode === 'select') {
      this.db.reads[this.table] = (this.db.reads[this.table] ?? 0) + 1
      const hit = rows.filter((r) => this.preds.every((p) => p(r)))
      return { data: this.single ? (hit[0] ? { ...hit[0] } : null) : hit.map((r) => ({ ...r })), error: null }
    }
    if (this.mode === 'update') {
      const hit = rows.filter((r) => this.preds.every((p) => p(r)))
      for (const r of hit) Object.assign(r, structuredClone(this.values))
      return { data: this.returning ? hit.map((r) => ({ id: r.id })) : null, error: null }
    }
    if (this.table === 'event_ai_analysis') { const hook = this.db.onUpsert; this.db.onUpsert = undefined; hook?.(this.db) }
    const existing = rows.find((r) => r.event_id === this.values.event_id)
    if (existing) Object.assign(existing, structuredClone(this.values))
    else rows.push({ id: `a-${this.values.event_id}`, edited_at: null, ...structuredClone(this.values) })
    return { data: null, error: null }
  }
}

function client(db: Db): SupabaseClient {
  return {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'owner-1' } }, error: null }) },
    from: (t: string) => new Q(db, t as keyof Db),
    rpc: () => Promise.resolve({ data: { day_count: db.dayCount, month_count: db.dayCount }, error: null }),
    storage: { from: () => ({ download: () => Promise.resolve({ data: new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])]), error: null }) }) },
  } as unknown as SupabaseClient
}

function deps(db: Db): PipelineDeps {
  return {
    userClient: () => client(db),
    adminClient: () => client(db),
    // deno-lint-ignore require-await
    vision: (async () => db.vision()) as PipelineDeps['vision'],
  }
}

const COPY: IncidentCopy<Flag> = {
  contextual: (p, f) => `CONTEXTUAL:${p}:${f.join(',')}`,
  photoUnreadable: (p) => `UNREADABLE:${p}`,
  monitor: (p) => `MONITOR:${p}`,
  visualFlagFallback: (p, f) => `VISUAL:${p}:${f.join(',')}`,
  noFlag: (p, h) => `NO_FLAG:${p}:${h}`,
}

function descriptor(db: Db): IncidentDescriptor<TestAnalysis, Flag> {
  return {
    functionName: 'analyze-test',
    eventTypes: ['vomit'],
    wrongEventTypeMessage: 'wrong type',
    functionKey: 'analyze_test',
    flagKey: 'ai_test_read_enabled',
    caps: { daily: 10, monthly: 200 },
    model: 'test-model',
    systemPrompt: '',
    tool: { name: 'analyze_test' },
    userMessageText: '',
    ruleVersion: 'test1',
    floorEngineKey: 'engines_v3_en4',
    parseToolResult: () => null,
    appearsToShowSubject: (a) => a.appears_to_show_vomit,
    // Only the read itself is this run's flags; a neighbour read in the same test gets none.
    computeContextualFlags: (_c, e) => Promise.resolve(
      e.eventId === 'evt-1' ? ({ flags: db.flags, copy: COPY, minTier: db.minTier } as ContextualRun<Flag, TestAnalysis>) : [],
    ),
    copy: COPY,
    buildStructuredValues: (a) => ({
      ai_raw_payload: a,
      blood_present: a?.blood_present ?? null,
      colour: a?.colour ?? null,
      description: a?.description ?? null,
    }),
    redFlagColumns: ['blood_present'],
    presentFlagsFromStructured: (r) => (r.blood_present === 'fresh_red' ? ['blood'] : []),
  }
}

const CLEAN: TestAnalysis = {
  appears_to_show_vomit: true, blood_present: 'none_visible', colour: 'yellow', visual_flags: [], recommendation: 'monitor', read_text: null, description: null,
}
const MODEL_CALL: TestAnalysis = { ...CLEAN, recommendation: 'worth_a_call', read_text: 'MODEL: plant matter' }
const BLOODY: TestAnalysis = { ...CLEAN, blood_present: 'fresh_red', visual_flags: ['blood'], recommendation: 'worth_a_call' }
const overloaded = (): TestAnalysis => { throw new Error('Claude API error 529: overloaded') }

async function run(db: Db, body: Row = { event_id: 'evt-1' }): Promise<number> {
  const quiet = { error: console.error, warn: console.warn, info: console.info }
  console.error = () => {}
  console.warn = () => {}
  console.info = () => {}
  try {
    const res = await runIncidentAnalysis(descriptor(db), new Request('http://local/a', {
      method: 'POST', headers: { Authorization: 'Bearer t' }, body: JSON.stringify(body),
    }), deps(db))
    await res.body?.cancel()
    return res.status
  } finally {
    Object.assign(console, quiet)
  }
}

const row = (db: Db, id = 'evt-1') => db.event_ai_analysis.find((r) => r.event_id === id) ?? null
const photo = (db: Db, id = 'evt-1') => db.event_attachments.push({ id: `att-${id}`, event_id: id, storage_path: `pet-1/${id}/a.jpg`, sort_order: 0 })

// ── The key ─────────────────────────────────────────────────────────────────────────

Deno.test('may_wait · the tier key off: no write names the column, and no may_wait read is made', async () => {
  const db = makeDb()
  assertStrictEquals(await run(db), 200)
  assertStrictEquals(row(db)?.recommendation, 'worth_a_call')
  assertStrictEquals('may_wait' in (row(db) ?? {}), false)
  assertStrictEquals(db.reads.user_profiles ?? 0, 0)
})

Deno.test('may_wait · EN-3 without EN-4: the call today carries NULL, read nothing', async () => {
  const db = makeDb({ app_config: KEYS_ON('engines_v3_en3') })
  await run(db)
  assertStrictEquals(row(db)?.tier, 'call_today')
  assertStrictEquals(row(db)?.may_wait, null)
  assertStrictEquals(db.reads.user_profiles ?? 0, 0)
})

// ── TRUE, and what refuses it ───────────────────────────────────────────────────────

Deno.test('may_wait · EN-3 + EN-4, a photoless record-only call today over a clean record: TRUE', async () => {
  const db = makeDb({ app_config: KEYS_ON('engines_v3_en3', 'engines_v3_en4') })
  await run(db)
  assertStrictEquals(row(db)?.tier, 'call_today')
  assertStrictEquals(row(db)?.may_wait, true)
  // The non-vacuity half: the record was read, for the decision and again for the re-check of
  // the TRUE this write carried.
  assertStrictEquals(db.reads.user_profiles, 2)
})

Deno.test('may_wait · the floor\'s call now carries NULL, never a TRUE', async () => {
  const db = makeDb({ app_config: KEYS_ON('engines_v3_en3', 'engines_v3_en4'), minTier: 'call_now' })
  await run(db)
  assertStrictEquals(row(db)?.tier, 'call_now')
  assertStrictEquals(row(db)?.may_wait, null)
})

Deno.test('may_wait · a clean photo read under a record call: TRUE; the model\'s own call: FALSE, kept after the photo goes', async () => {
  const clean = makeDb({ app_config: KEYS_ON('engines_v3_en3', 'engines_v3_en4') })
  photo(clean)
  await run(clean)
  assertStrictEquals(row(clean)?.may_wait, true)

  const db = makeDb({ app_config: KEYS_ON('engines_v3_en3', 'engines_v3_en4'), vision: () => MODEL_CALL })
  photo(db)
  await run(db)
  assertStrictEquals(row(db)?.tier, 'call_today')
  assertStrictEquals(row(db)?.may_wait, false)
  // The photo is removed (a hard delete) and the read runs again, photoless: still FALSE.
  db.event_attachments.length = 0
  await run(db)
  assertStrictEquals(row(db)?.ai_raw_payload, null)
  assertStrictEquals(row(db)?.may_wait, false)
  // ...and again, with nothing but the FALSE left to remember it by.
  await run(db)
  assertStrictEquals(row(db)?.may_wait, false)
})

Deno.test('may_wait · a capped run over a photo carries NULL (the photo was never read)', async () => {
  const db = makeDb({ app_config: KEYS_ON('engines_v3_en3', 'engines_v3_en4'), dayCount: 99 })
  photo(db)
  await run(db)
  assertStrictEquals(row(db)?.tier, 'call_today')
  assertStrictEquals(row(db)?.may_wait, null)
})

Deno.test('may_wait · a failed run: the rescue carries NULL; the error-only note takes a stored TRUE back', async () => {
  const rescued = makeDb({ app_config: KEYS_ON('engines_v3_en3', 'engines_v3_en4'), vision: overloaded })
  photo(rescued)
  assertStrictEquals(await run(rescued), 500)
  assertStrictEquals(row(rescued)?.status, 'failed')
  assertStrictEquals(row(rescued)?.tier, 'call_today')
  assertStrictEquals(row(rescued)?.may_wait, null)

  const db = makeDb({ app_config: KEYS_ON('engines_v3_en3', 'engines_v3_en4') })
  await run(db)
  assertStrictEquals(row(db)?.may_wait, true)
  photo(db)
  db.vision = overloaded
  assertStrictEquals(await run(db), 500)
  assertStrictEquals(row(db)?.error !== null, true)
  assertStrictEquals(row(db)?.may_wait, null)
})

// ── The re-check of a stored TRUE ───────────────────────────────────────────────────

Deno.test('may_wait · a neighbour\'s blood photo, read later, takes the TRUE back', async () => {
  const db = makeDb({ app_config: KEYS_ON('engines_v3_en3', 'engines_v3_en4') })
  await run(db)
  assertStrictEquals(row(db)?.may_wait, true)
  // Two hours later: another vomit, photographed, with fresh blood.
  db.events.push({ id: 'evt-2', pet_id: 'pet-1', event_type: 'vomit', occurred_at: iso(T0 + 2 * H), occurred_at_confidence: 'witnessed', deleted_at: null, pets: PET })
  photo(db, 'evt-2')
  db.vision = () => BLOODY
  await run(db, { event_id: 'evt-2' })
  assertStrictEquals(row(db, 'evt-2')?.visual_flags instanceof Array && (row(db, 'evt-2')?.visual_flags as string[]).includes('blood'), true)
  assertStrictEquals(row(db)?.may_wait, null)
})

Deno.test('may_wait · a lethargy log re-floors and takes back a TRUE the floor itself would not touch (a stool\'s)', async () => {
  const db = makeDb({ app_config: KEYS_ON('engines_v3_en3', 'engines_v3_en4') })
  // No vomit in reach, so no per-vomit floor run writes anything: the re-check is the refloor's own.
  db.events = db.events.filter((e) => e.id !== 'evt-1')
  // A stool row holding TRUE, 10 h after the lethargy that is about to be logged.
  db.events.push({ id: 'stool-1', pet_id: 'pet-1', event_type: 'diarrhea', occurred_at: iso(T0 + 10 * H), occurred_at_confidence: 'witnessed', deleted_at: null, pets: PET })
  db.event_ai_analysis.push({
    id: 'a-stool-1', event_id: 'stool-1', pet_id: 'pet-1', incident_type: 'diarrhea', status: 'completed', error: null, edited_at: null,
    recommendation: 'worth_a_call', tier: 'call_today', may_wait: true, visual_flags: [], contextual_flags: ['repeated_loose_stool'], ai_raw_payload: null,
  })
  db.events.push({ id: 'leth-1', pet_id: 'pet-1', event_type: 'lethargy', occurred_at: iso(T0 + 6 * H), occurred_at_confidence: 'witnessed', deleted_at: null, pets: PET })
  assertStrictEquals(await run(db, { event_id: 'leth-1', mode: 'refloor' }), 200)
  assertStrictEquals(row(db, 'stool-1')?.may_wait, null)
})

Deno.test('may_wait · the floor-only write over a stored photo read decides from the row: clean TRUE, unsure blood FALSE, a replaced photo NULL', async () => {
  const current = await photoSetKey(['att-evt-1'])
  for (const [blood, setKey, expected] of [['none_visible', current, true], ['unsure', current, false], ['none_visible', 'an-older-photo-set', null]] as const) {
    const db = makeDb({ app_config: KEYS_ON('engines_v3_en3', 'engines_v3_en4') })
    photo(db)
    db.event_ai_analysis.push({
      id: 'a1', event_id: 'evt-1', pet_id: 'pet-1', incident_type: 'vomit', status: 'completed', error: null, edited_at: null,
      recommendation: 'monitor', tier: 'logged', may_wait: null, visual_flags: [], contextual_flags: [],
      ai_raw_payload: { ...CLEAN, appears_to_show_vomit: true, blood_present: blood, read_photo_set_key: setKey }, blood_present: blood, colour: 'yellow', photo_set_key: current,
    })
    assertStrictEquals(await run(db, { event_id: 'evt-1', mode: 'floor' }), 200)
    assertStrictEquals(row(db)?.tier, 'call_today')
    assertStrictEquals(row(db)?.may_wait, expected, blood)
  }
})

Deno.test('may_wait · a stored call now outranks the write: the kept tier carries no TRUE', async () => {
  const db = makeDb({ app_config: KEYS_ON('engines_v3_en3', 'engines_v3_en4') })
  db.event_ai_analysis.push({
    id: 'a1', event_id: 'evt-1', pet_id: 'pet-1', incident_type: 'vomit', status: 'completed', error: null, edited_at: null,
    recommendation: 'worth_a_call', tier: 'call_now', may_wait: null, visual_flags: [], contextual_flags: ['repeated_vomiting'], ai_raw_payload: null,
  })
  await run(db)
  assertEquals([row(db)?.tier, row(db)?.may_wait], ['call_now', null])
})

Deno.test('may_wait · a stored FALSE outlives a later write of any tier (a call now, a calm read)', async () => {
  for (const [minTier, flags, tier] of [['call_now', ['repeated_vomiting'], 'call_now'], [undefined, [], 'not_enough_to_say']] as const) {
    const db = makeDb({ app_config: KEYS_ON('engines_v3_en3', 'engines_v3_en4'), minTier, flags: [...flags] })
    db.event_ai_analysis.push({
      id: 'a1', event_id: 'evt-1', pet_id: 'pet-1', incident_type: 'vomit', status: 'completed', error: null, edited_at: null,
      recommendation: 'not_enough_to_say', tier: 'not_enough_to_say', may_wait: false, visual_flags: [], contextual_flags: [], ai_raw_payload: null,
    })
    await run(db)
    assertEquals([row(db)?.tier, row(db)?.may_wait], [tier, false])
  }
})

Deno.test('may_wait · a photo the model says is not the subject is not a settled read: NULL', async () => {
  const db = makeDb({ app_config: KEYS_ON('engines_v3_en3', 'engines_v3_en4'), vision: () => ({ ...CLEAN, appears_to_show_vomit: false }) })
  photo(db)
  await run(db)
  assertEquals([row(db)?.tier, row(db)?.may_wait], ['call_today', null])
})

// ── The adversarial pass's findings 3–5: a stored TRUE never outlives a write over it ──

Deno.test('may_wait · a HOLD over a stored TRUE takes it back: FALSE when the new photo refutes it (pink, unsure blood)', async () => {
  const db = makeDb({ app_config: KEYS_ON('engines_v3_en3', 'engines_v3_en4') })
  await run(db)
  assertStrictEquals(row(db)?.may_wait, true)
  // The record call lapses, and a photo is added that reads pink with unsure blood; the model
  // says monitor, so the stored call is HELD over it and its words stand.
  db.flags = []
  photo(db)
  db.vision = () => ({ ...CLEAN, colour: 'pink_red', blood_present: 'unsure' })
  await run(db)
  assertEquals([row(db)?.recommendation, row(db)?.tier, row(db)?.may_wait], ['worth_a_call', 'call_today', false])
})

Deno.test('may_wait · a HOLD over a stored TRUE with a clean new photo still takes it back (NULL)', async () => {
  const db = makeDb({ app_config: KEYS_ON('engines_v3_en3', 'engines_v3_en4') })
  await run(db)
  db.flags = []
  photo(db)
  await run(db)
  assertEquals([row(db)?.tier, row(db)?.may_wait], ['call_today', null])
})

Deno.test('may_wait · a capped run with no flags over a stored TRUE and a new photo takes it back', async () => {
  const db = makeDb({ app_config: KEYS_ON('engines_v3_en3', 'engines_v3_en4') })
  await run(db)
  assertStrictEquals(row(db)?.may_wait, true)
  db.flags = []
  db.dayCount = 99
  photo(db)
  await run(db)
  assertEquals([row(db)?.tier, row(db)?.may_wait], ['call_today', null])
})

Deno.test('may_wait · the tier key rolled back: the next read takes a stored TRUE back', async () => {
  const db = makeDb({ app_config: KEYS_ON('engines_v3_en3', 'engines_v3_en4') })
  await run(db)
  assertStrictEquals(row(db)?.may_wait, true)
  db.app_config = []
  photo(db)
  db.vision = () => BLOODY
  await run(db)
  assertStrictEquals(row(db)?.may_wait, null)
})

Deno.test('may_wait · a neighbour that lands between the decision and the write: the TRUE is re-checked after it', async () => {
  const db = makeDb({ app_config: KEYS_ON('engines_v3_en3', 'engines_v3_en4') })
  db.onUpsert = (d) => {
    d.events.push({ id: 'evt-2', pet_id: 'pet-1', event_type: 'vomit', occurred_at: iso(T0 + H), occurred_at_confidence: 'witnessed', deleted_at: null, pets: PET })
    d.event_attachments.push({ id: 'att-evt-2', event_id: 'evt-2', storage_path: 'pet-1/evt-2/a.jpg', sort_order: 0 })
    d.event_ai_analysis.push({
      id: 'a-evt-2', event_id: 'evt-2', pet_id: 'pet-1', incident_type: 'vomit', status: 'completed', error: null, edited_at: null,
      recommendation: 'worth_a_call', tier: 'call_today', may_wait: false, visual_flags: ['blood'], contextual_flags: [], ai_raw_payload: null,
    })
  }
  await run(db)
  assertEquals([row(db)?.tier, row(db)?.may_wait], ['call_today', null])
})

// ── Adversarial pass 2: an unread neighbour photo, and the paths that leave one ─────────

const neighbourVomit = (db: Db, hoursBefore: number) => {
  db.events.push({ id: 'evt-2', pet_id: 'pet-1', event_type: 'vomit', occurred_at: iso(T0 - hoursBefore * H), occurred_at_confidence: 'witnessed', deleted_at: null, pets: PET })
  photo(db, 'evt-2')
}

Deno.test('may_wait · a photographed neighbour whose read never showed the subject refuses the wait', async () => {
  const db = makeDb({ app_config: KEYS_ON('engines_v3_en3', 'engines_v3_en4') })
  neighbourVomit(db, 5)
  db.event_ai_analysis.push({
    id: 'a-evt-2', event_id: 'evt-2', pet_id: 'pet-1', incident_type: 'vomit', status: 'completed', error: null, edited_at: null,
    recommendation: 'worth_a_call', tier: 'call_today', may_wait: null, visual_flags: [], contextual_flags: ['repeated_vomiting'],
    ai_raw_payload: { ...CLEAN, appears_to_show_vomit: false }, photo_set_key: await photoSetKey(['att-evt-2']),
  })
  await run(db)
  assertEquals([row(db)?.tier, row(db)?.may_wait], ['call_today', null])
})

Deno.test('may_wait · a neighbour\'s read that FAILS takes back the TRUE beside it', async () => {
  const db = makeDb({ app_config: KEYS_ON('engines_v3_en3', 'engines_v3_en4') })
  await run(db)
  assertStrictEquals(row(db)?.may_wait, true)
  neighbourVomit(db, -2)
  db.vision = overloaded
  assertStrictEquals(await run(db, { event_id: 'evt-2' }), 500)
  assertStrictEquals(row(db)?.may_wait, null)
})

Deno.test('may_wait · a neighbour\'s read that is CAPPED takes back the TRUE beside it', async () => {
  const db = makeDb({ app_config: KEYS_ON('engines_v3_en3', 'engines_v3_en4') })
  await run(db)
  assertStrictEquals(row(db)?.may_wait, true)
  neighbourVomit(db, -2)
  db.dayCount = 99
  await run(db, { event_id: 'evt-2' })
  assertStrictEquals(row(db, 'evt-2')?.status, 'capped')
  assertStrictEquals(row(db)?.may_wait, null)
})

Deno.test('may_wait · pass 3: a neighbour\'s calm photo replaced, then CAPPED with a record call — the new photo is unread, so no TRUE', async () => {
  const db = makeDb({ app_config: KEYS_ON('engines_v3_en3', 'engines_v3_en4') })
  // Neighbour evt-2: its calm photo P1 was read; the row and its payload name P1's set.
  neighbourVomit(db, 2)
  const p1 = await photoSetKey(['att-evt-2'])
  db.event_ai_analysis.push({
    id: 'a-evt-2', event_id: 'evt-2', pet_id: 'pet-1', incident_type: 'vomit', status: 'completed', error: null, edited_at: null,
    recommendation: 'worth_a_call', tier: 'call_today', may_wait: null, visual_flags: [], contextual_flags: ['repeated_vomiting'],
    ai_raw_payload: { ...CLEAN, read_photo_set_key: p1 }, blood_present: 'none_visible', colour: 'yellow', photo_set_key: p1,
  })
  // The owner replaces P1 with P2; the re-read is capped, so the capped escalation stamps P2's
  // set on the row over P1's payload (the row stamp moves; the payload's does not).
  db.event_attachments = db.event_attachments.filter((a) => a.event_id !== 'evt-2')
  db.event_attachments.push({ id: 'att-evt-2-p2', event_id: 'evt-2', storage_path: 'pet-1/evt-2/b.jpg', sort_order: 0 })
  db.flags = ['repeated_vomiting']
  const desc = descriptor(db)
  desc.computeContextualFlags = () => Promise.resolve({ flags: ['repeated_vomiting'] as Flag[], copy: COPY })
  db.dayCount = 99
  const quiet = { error: console.error, warn: console.warn, info: console.info }
  console.error = () => {}; console.warn = () => {}; console.info = () => {}
  try {
    await runIncidentAnalysis(desc, new Request('http://local/a', { method: 'POST', headers: { Authorization: 'Bearer t' }, body: JSON.stringify({ event_id: 'evt-2' }) }), deps(db))
  } finally { Object.assign(console, quiet) }
  assertStrictEquals(row(db, 'evt-2')?.photo_set_key, await photoSetKey(['att-evt-2-p2']))
  // Now the read beside it: a photoless record call, everything else clean.
  db.dayCount = 1
  await run(db)
  assertEquals([row(db)?.tier, row(db)?.may_wait], ['call_today', null])
})

Deno.test('may_wait · a full read under the tier key names the photo set it read in its payload; flag-off it does not', async () => {
  const on = makeDb({ app_config: KEYS_ON('engines_v3_en3') })
  photo(on)
  await run(on)
  assertStrictEquals((row(on)?.ai_raw_payload as Row).read_photo_set_key, await photoSetKey(['att-evt-1']))
  const off = makeDb()
  photo(off)
  await run(off)
  assertStrictEquals('read_photo_set_key' in (row(off)?.ai_raw_payload as Row), false)
})

Deno.test('may_wait · a read that saw only some photos names no photo set: its payload never counts as settled', async () => {
  const db = makeDb({ app_config: KEYS_ON('engines_v3_en3') })
  // Four photos: the pipeline reads at most three, so the read is partial (and escalates, so it
  // is kept rather than collapsed).
  for (const n of [1, 2, 3, 4]) db.event_attachments.push({ id: `att-${n}`, event_id: 'evt-1', storage_path: `pet-1/evt-1/${n}.jpg`, sort_order: n })
  db.vision = () => BLOODY
  await run(db)
  assertStrictEquals(row(db)?.recommendation, 'worth_a_call')
  assertStrictEquals((row(db)?.ai_raw_payload as Row).read_photo_set_key, null)
})
