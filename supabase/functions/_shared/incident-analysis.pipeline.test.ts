// Behaviour tests for the per-incident pipeline itself (runIncidentAnalysis), driven
// through a fake Supabase client and a fake model via PipelineDeps. Run with:
// deno test supabase/functions/_shared/
//
// Why these exist: every rule the pipeline enforces is a pure helper with its own unit
// test (incident-analysis.test.ts), but a helper protects nothing unless the pipeline
// calls it, at the right moment, with the right read. A source scan of that wiring was
// shown to pass five realistic broken rebases (the PR-04b adversarial pass: a
// `.catch(() => null)` on the stored-row read, a flag hoisted after the read that can
// throw, the step-9 decision made on the stale step-3b row). These tests assert what
// lands in `event_ai_analysis`, which is what the owner, Home and the vet report read.
//
// The world is deliberately small: one event, one analysis row, a sentinel descriptor
// (so no type's vocabulary is under test here; each descriptor's own suite covers it).
// The fake implements PostgREST's upsert as the real one behaves: only the columns sent
// are written on conflict.

import { assertEquals, assertStrictEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  runIncidentAnalysis,
  type IncidentAnalysisBase,
  type IncidentCopy,
  type IncidentDescriptor,
  type PipelineDeps,
  type SupabaseClient,
} from './incident-analysis.ts'

type Row = Record<string, unknown>
type Flag = 'ctx_flag'

interface TestAnalysis extends IncidentAnalysisBase {
  appears: boolean
  blood: 'yes' | 'no' | null
  colour: string | null
}

interface World {
  row: Row | null
  contextFlags: Flag[]
  dayCount: number
  // What the model returns (or throws) for this run.
  vision: () => TestAnalysis | null
  // The nth read of event_ai_analysis fails (1-based).
  aiReadError?: (n: number) => boolean
  // The nth write to event_ai_analysis fails (1-based).
  aiWriteError?: (n: number) => boolean
  // Runs inside the vision call: a sibling run landing in the 10-60s window.
  duringVision?: (w: World) => void
  // What app_config returns (Engines v3 flag + the gate config), or a read error.
  appConfig?: Row[] | 'error'
  aiReads: number
  aiWriteAttempts: number
  rpcCalls: number
  visionCalls: number
  writes: Array<{ mode: 'update' | 'upsert'; values: Row }>
}

// A stored row is this event's own unless a test says otherwise (CUL-1203).
const OWN = { id: 'a1', event_id: 'evt-1', pet_id: 'pet-1' }
// The event's one photo (an attachment id is a UUID; photo_set_key is built from it).
const ATTACHMENT_ID = '0f8e7d6c-5b4a-4938-8271-605f4e3d2c1b'

function makeWorld(o: Partial<World> & Pick<World, 'vision'>): World {
  return {
    contextFlags: [],
    dayCount: 1,
    aiReads: 0,
    aiWriteAttempts: 0,
    rpcCalls: 0,
    visionCalls: 0,
    writes: [],
    ...o,
    row: o.row ? { ...OWN, ...o.row } : null,
  }
}

// ── The fake client ────────────────────────────────────────────────────────────────

class FakeQuery {
  private mode: 'select' | 'update' | 'upsert' = 'select'
  private cols = '*'
  private values: Row = {}
  private filters: Row = {}
  constructor(private w: World, private table: string) {}
  select(cols = '*') { if (this.mode === 'select') this.cols = cols; return this }
  eq(column: string, value: unknown) { this.filters[column] = value; return this }
  is() { return this }
  in() { return this }
  order() { return this }
  limit() { return this }
  maybeSingle() { return this }
  update(values: Row) { this.mode = 'update'; this.values = values; return this }
  upsert(values: Row) { this.mode = 'upsert'; this.values = values; return this }
  then<T>(resolve: (r: { data: unknown; error: { message: string } | null }) => T, reject?: (e: unknown) => T) {
    return Promise.resolve().then(() => this.run()).then(resolve, reject)
  }
  private run(): { data: unknown; error: { message: string } | null } {
    const w = this.w
    if (this.table === 'events') {
      return {
        data: {
          id: 'evt-1', pet_id: 'pet-1', event_type: 'vomit', occurred_at: '2026-09-26T08:00:00Z',
          deleted_at: null, pets: { name: 'Mochi', species: 'cat', user_id: 'owner-1' },
        },
        error: null,
      }
    }
    if (this.table === 'event_attachments') return { data: [{ id: ATTACHMENT_ID, storage_path: 'pet-1/evt-1/a.jpg' }], error: null }
    if (this.table === 'app_config') {
      return w.appConfig === 'error' ? { data: null, error: { message: 'app_config unreachable' } } : { data: w.appConfig ?? [], error: null }
    }
    if (this.table !== 'event_ai_analysis') throw new Error(`unexpected table ${this.table}`)

    if (this.mode === 'select') {
      w.aiReads++
      if (w.aiReadError?.(w.aiReads)) return { data: null, error: { message: `read failed #${w.aiReads}` } }
      if (!w.row) return { data: null, error: null }
      const out: Row = {}
      for (const c of this.cols.split(',').map((s) => s.trim())) out[c] = w.row[c] ?? null
      return { data: out, error: null }
    }
    w.aiWriteAttempts++
    if (w.aiWriteError?.(w.aiWriteAttempts)) return { data: null, error: { message: `write failed #${w.aiWriteAttempts}` } }
    if (this.mode === 'update') {
      // PostgREST: an UPDATE touches only rows matching every filter, and returns them
      // (updateAnalysisRow keys on the event's pet and reads the count back, CUL-1203).
      const matches = !!w.row && Object.entries(this.filters).every(([k, v]) => w.row?.[k] === v)
      if (!matches) return { data: [], error: null }
      w.writes.push({ mode: this.mode, values: structuredClone(this.values) })
      Object.assign(w.row!, this.values)
      return { data: [{ id: w.row!.id }], error: null }
    }
    // Migration 074: a row's pet is frozen on update, and an insert must be the event's
    // own pet. The fake refuses both as production does, so nothing here is green over a
    // cross-pet write the database would reject.
    if (w.row && this.values.pet_id !== undefined && this.values.pet_id !== w.row.pet_id) {
      return { data: null, error: { message: '23514: pet_id is frozen' } }
    }
    if (!w.row && this.values.pet_id !== OWN.pet_id) {
      return { data: null, error: { message: '23514: analysis row must be the event\'s pet' } }
    }
    w.writes.push({ mode: this.mode, values: structuredClone(this.values) })
    if (w.row) {
      Object.assign(w.row, this.values) // PostgREST: only the sent columns change on conflict
    } else {
      w.row = { edited_at: null, ...this.values }
    }
    return { data: null, error: null }
  }
}

function fakeClient(w: World): SupabaseClient {
  const client = {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'owner-1' } }, error: null }) },
    from: (table: string) => new FakeQuery(w, table),
    rpc: () => {
      w.rpcCalls++
      return Promise.resolve({ data: { day_count: w.dayCount, month_count: w.dayCount }, error: null })
    },
    storage: {
      from: () => ({
        download: () => Promise.resolve({ data: new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])]), error: null }),
      }),
    },
  }
  return client as unknown as SupabaseClient
}

function depsFor(w: World): PipelineDeps {
  return {
    userClient: () => fakeClient(w),
    adminClient: () => fakeClient(w),
    // deno-lint-ignore require-await
    vision: (async () => {
      w.visionCalls++
      w.duringVision?.(w)
      return w.vision()
    }) as PipelineDeps['vision'],
  }
}

// ── The sentinel descriptor ─────────────────────────────────────────────────────────

const COPY: IncidentCopy<Flag> = {
  contextual: (pet, flags) => `CONTEXTUAL:${pet}:${flags.join(',')}`,
  photoUnreadable: (pet) => `UNREADABLE:${pet}`,
  monitor: (pet) => `MONITOR:${pet}`,
  visualFlagFallback: (pet, flags) => `VISUAL:${pet}:${flags.join(',')}`,
  noFlag: (pet, hasPhoto) => `NO_FLAG:${pet}:${hasPhoto}`,
}

function descriptorFor(w: World): IncidentDescriptor<TestAnalysis, Flag> {
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
  parseToolResult: () => null, // the model is injected as a parsed result
    appearsToShowSubject: (a) => a.appears,
    computeContextualFlags: () => Promise.resolve(w.contextFlags),
    copy: COPY,
    buildStructuredValues: (a) => ({
      ai_raw_payload: a,
      blood_col: a?.blood ?? null,
      colour: a?.colour ?? null,
      description: a?.description ?? null,
    }),
    redFlagColumns: ['blood_col'],
    presentFlagsFromStructured: (row) => (row.blood_col === 'yes' ? ['blood'] : []),
  }
}

const CLEAN: TestAnalysis = {
  appears: true, blood: 'no', colour: 'yellow', visual_flags: [], recommendation: 'monitor', read_text: null, description: null,
}
const BLOODY: TestAnalysis = {
  appears: true, blood: 'yes', colour: 'red', visual_flags: ['blood'], recommendation: 'worth_a_call', read_text: 'MODEL: blood', description: null,
}
const overloaded = (): TestAnalysis => { throw new Error('Claude API error 529: overloaded') }
const unreadable = (): TestAnalysis => { throw new Error('Claude API error 400: could not process image') }

async function run(w: World): Promise<{ status: number; body: Row }> {
  const req = new Request('http://local/analyze', {
    method: 'POST',
    headers: { Authorization: 'Bearer test' },
    body: JSON.stringify({ event_id: 'evt-1' }),
  })
  const quiet = { error: console.error, warn: console.warn, info: console.info }
  console.error = () => {}
  console.warn = () => {}
  console.info = () => {}
  try {
    const res = await runIncidentAnalysis(descriptorFor(w), req, depsFor(w))
    return { status: res.status, body: await res.json() }
  } finally {
    Object.assign(console, quiet)
  }
}

// ── Non-vacuity: the harness writes what the pipeline writes ─────────────────────────

Deno.test('pipeline — a first clean read lands in full (the harness is not vacuous)', async () => {
  const w = makeWorld({ vision: () => CLEAN })
  const r = await run(w)
  assertStrictEquals(r.status, 200)
  assertStrictEquals(w.visionCalls, 1)
  assertEquals(w.writes.map((x) => x.mode), ['upsert'])
  assertStrictEquals(w.row?.recommendation, 'monitor')
  assertStrictEquals(w.row?.blood_col, 'no')
  assertStrictEquals(w.row?.status, 'completed')
})

// ── CUL-815: a failed run keeps the escalation it computed ────────────────────────────

Deno.test('pipeline CUL-815 — a 529 after the context escalated writes the escalation, not the failure frame', async () => {
  const w = makeWorld({ contextFlags: ['ctx_flag'], vision: overloaded })
  const r = await run(w)
  assertStrictEquals(r.status, 500)
  assertStrictEquals(w.row?.recommendation, 'worth_a_call')
  assertStrictEquals(w.row?.status, 'failed')
  assertStrictEquals(w.row?.read_text, 'CONTEXTUAL:Mochi:ctx_flag')
  assertEquals(w.row?.contextual_flags, ['ctx_flag'])
})

Deno.test('pipeline CUL-815 — the rescue over an owner-edited row keeps every structured field', async () => {
  const w = makeWorld({
    row: { id: 'a1', recommendation: 'monitor', status: 'completed', edited_at: '2026-09-20T00:00:00Z', colour: 'green', blood_col: 'no' },
    contextFlags: ['ctx_flag'],
    vision: overloaded,
  })
  await run(w)
  assertStrictEquals(w.row?.recommendation, 'worth_a_call')
  assertStrictEquals(w.row?.colour, 'green')
  assertStrictEquals(w.row?.edited_at, '2026-09-20T00:00:00Z')
})

Deno.test('pipeline CUL-815 variant — a visual escalation found this run survives its failed write-back', async () => {
  const w = makeWorld({
    row: { id: 'a1', recommendation: 'monitor', status: 'completed', blood_col: 'no' },
    vision: () => BLOODY,
    aiWriteError: (n) => n === 1, // the step-9 write
  })
  await run(w)
  assertStrictEquals(w.row?.recommendation, 'worth_a_call')
  assertEquals(w.row?.visual_flags, ['blood'])
  assertStrictEquals(w.row?.status, 'failed')
})

// ── CUL-817: an unanswered read of the stored row decides nothing ────────────────────

Deno.test('pipeline CUL-817 — a failed stored-row read stops the run before the cap and the model', async () => {
  const w = makeWorld({
    row: { id: 'a1', recommendation: 'monitor', status: 'completed', edited_at: '2026-09-20T00:00:00Z', colour: 'green', blood_col: 'no' },
    vision: () => CLEAN,
    aiReadError: (n) => n === 1, // step 3b only; the catch's own read answers
  })
  const r = await run(w)
  assertStrictEquals(r.status, 500)
  assertStrictEquals(w.rpcCalls, 0) // no unit spent
  assertStrictEquals(w.visionCalls, 0)
  assertStrictEquals(w.row?.colour, 'green') // the owner's edit, not the model's yellow
  assertStrictEquals(w.row?.status, 'failed') // the honest retry state (CUL-812's trade)
})

Deno.test('pipeline CUL-817 + CUL-815 — the context computed before the failed read is still rescued', async () => {
  const w = makeWorld({
    contextFlags: ['ctx_flag'],
    vision: () => CLEAN,
    aiReadError: (n) => n === 1,
  })
  await run(w)
  assertStrictEquals(w.visionCalls, 0)
  assertStrictEquals(w.row?.recommendation, 'worth_a_call')
  assertStrictEquals(w.row?.read_text, 'CONTEXTUAL:Mochi:ctx_flag')
})

Deno.test('pipeline CUL-817 — when the catch cannot read the row either, nothing is written', async () => {
  const w = makeWorld({
    row: { id: 'a1', recommendation: 'worth_a_call', status: 'completed', blood_col: 'yes' },
    vision: () => CLEAN,
    aiReadError: () => true,
  })
  await run(w)
  assertEquals(w.writes, [])
  assertStrictEquals(w.row?.recommendation, 'worth_a_call')
})

// ── CUL-1201 part 2: a re-read never lowers a stored escalation ───────────────────────

Deno.test('pipeline CUL-1201 — a clean re-read over a stored photo escalation writes nothing', async () => {
  const w = makeWorld({
    row: { id: 'a1', recommendation: 'worth_a_call', status: 'completed', visual_flags: ['blood'], read_text: 'MODEL: blood', blood_col: 'yes' },
    vision: () => CLEAN,
  })
  const r = await run(w)
  assertStrictEquals(r.body.held, true)
  assertEquals(w.writes, [])
  assertStrictEquals(w.row?.recommendation, 'worth_a_call')
  assertStrictEquals(w.row?.blood_col, 'yes')
})

Deno.test('pipeline CUL-1201 — a rescued contextual escalation is held after the window lapses, and settles', async () => {
  // Ask's A8 re-reads a 'failed' row two days later: the context has lapsed, the photo reads clean.
  const w = makeWorld({
    row: { id: 'a1', recommendation: 'worth_a_call', status: 'failed', contextual_flags: ['ctx_flag'], read_text: 'CONTEXTUAL:Mochi:ctx_flag', error: 'Claude API error 529' },
    vision: () => CLEAN,
  })
  await run(w)
  assertEquals(w.writes, [{ mode: 'update', values: { status: 'completed', error: null } }])
  assertStrictEquals(w.row?.recommendation, 'worth_a_call')
  assertStrictEquals(w.row?.read_text, 'CONTEXTUAL:Mochi:ctx_flag')
})

Deno.test('pipeline CUL-1201 × CUL-1277 — a stored verdict this build does not know is held too', async () => {
  const w = makeWorld({
    row: { recommendation: 'call_now', status: 'completed', blood_col: 'no' },
    vision: () => CLEAN,
  })
  const r = await run(w)
  assertStrictEquals(r.body.held, true)
  assertStrictEquals(w.aiWriteAttempts, 0)
  assertStrictEquals(w.row?.recommendation, 'call_now')
})

Deno.test('pipeline CUL-1201 — the frozen-payload chain is held (no owner-correction exception)', async () => {
  // The owner cleared a false flag on photo 1; photo 2 re-escalated on real blood through read
  // fields only; photo 3 reads clean. The stored verdict is photo 2's and must stand.
  const w = makeWorld({
    row: {
      id: 'a1', recommendation: 'worth_a_call', status: 'completed', visual_flags: ['blood'],
      edited_at: '2026-09-20T00:00:00Z', blood_col: 'no', ai_raw_payload: { blood: 'yes' },
    },
    vision: () => CLEAN,
  })
  await run(w)
  assertEquals(w.writes, [])
  assertStrictEquals(w.row?.recommendation, 'worth_a_call')
})

Deno.test('pipeline CUL-1201 — the step-9 decision uses a FRESH read, not step 3b\'s', async () => {
  // A sibling run (Ask's A8) writes an escalation while this run waits on the model.
  const w = makeWorld({
    vision: () => CLEAN,
    duringVision: (world) => {
      world.row = { ...OWN, recommendation: 'worth_a_call', status: 'completed', visual_flags: ['blood'], blood_col: 'yes' }
    },
  })
  await run(w)
  assertEquals(w.writes, [])
  assertStrictEquals(w.row?.recommendation, 'worth_a_call')
  assertStrictEquals(w.row?.blood_col, 'yes')
})

// ── CUL-532: a stored red flag is never taken off the record ─────────────────────────

Deno.test('pipeline CUL-532 — an unreadable re-read keeps a stored red flag under a calm verdict', async () => {
  const w = makeWorld({
    row: { id: 'a1', recommendation: 'monitor', status: 'completed', blood_col: 'yes', colour: 'red' },
    vision: unreadable,
  })
  await run(w)
  assertStrictEquals(w.row?.blood_col, 'yes')
  assertStrictEquals(w.row?.recommendation, 'not_enough_to_say')
  assertStrictEquals(w.row?.read_text, 'UNREADABLE:Mochi')
})

Deno.test('pipeline CUL-532 — a capped contextual escalation over a failed row keeps its stored red flag', async () => {
  // monitor + blood, then a 529 flipped the status to failed (not a "real analysis").
  const w = makeWorld({
    row: { id: 'a1', recommendation: 'monitor', status: 'failed', blood_col: 'yes' },
    contextFlags: ['ctx_flag'],
    dayCount: 11, // over the daily cap of 10
    vision: () => CLEAN,
  })
  await run(w)
  assertStrictEquals(w.visionCalls, 0)
  assertStrictEquals(w.row?.recommendation, 'worth_a_call')
  assertStrictEquals(w.row?.blood_col, 'yes')
})

Deno.test('pipeline CUL-532 — a failed run over a stored red flag leaves the card showing it', async () => {
  const w = makeWorld({
    row: { id: 'a1', recommendation: 'monitor', status: 'completed', blood_col: 'yes' },
    vision: overloaded,
  })
  await run(w)
  assertEquals(w.writes.map((x) => x.mode), ['update'])
  assertEquals(Object.keys(w.writes[0].values), ['error'])
  assertStrictEquals(w.row?.status, 'completed')
})

// ── CUL-1203: a row filed under another pet is never read or written ─────────────────

Deno.test('pipeline CUL-1203 — a stored row filed under another pet is refused before the cap, the model and any write', async () => {
  const w = makeWorld({
    row: { pet_id: 'someone-elses-pet', recommendation: 'monitor', status: 'completed', blood_col: 'no' },
    contextFlags: ['ctx_flag'],
    vision: () => BLOODY,
  })
  const r = await run(w)
  assertStrictEquals(r.status, 409)
  assertStrictEquals(w.rpcCalls, 0)
  assertStrictEquals(w.visionCalls, 0)
  assertStrictEquals(w.aiWriteAttempts, 0)
})

Deno.test('pipeline CUL-1203 — the catch writes nothing to a row filed under another pet, rescue or not', async () => {
  // The step-3b read fails, so the refusal never ran; the catch's own read must refuse it.
  const w = makeWorld({
    row: { pet_id: 'someone-elses-pet', recommendation: 'monitor', status: 'completed', blood_col: 'no' },
    contextFlags: ['ctx_flag'],
    vision: () => CLEAN,
    aiReadError: (n) => n === 1,
  })
  await run(w)
  assertStrictEquals(w.aiWriteAttempts, 0)
  assertStrictEquals(w.row?.pet_id, 'someone-elses-pet')
  assertStrictEquals(w.row?.recommendation, 'monitor')
})

Deno.test('pipeline CUL-1203 — a row that turns into another pet\'s mid-run steers nothing at step 9', async () => {
  // The event moved between one owner's pets during the vision call (CUL-882), and a
  // sibling wrote under the new pet. No hold answers for it and no write is attempted.
  const w = makeWorld({
    vision: () => CLEAN,
    duringVision: (world) => {
      world.row = { ...OWN, pet_id: 'someone-elses-pet', recommendation: 'worth_a_call', status: 'failed' }
    },
  })
  const r = await run(w)
  assertStrictEquals(r.status, 500)
  assertStrictEquals(w.aiWriteAttempts, 0)
  assertStrictEquals(w.row?.status, 'failed')
})

Deno.test('pipeline CUL-1203 — an edited row takes the read-fields update on the event\'s own row', async () => {
  // An edited row takes the read-fields update, keyed on event and pet.
  const w = makeWorld({
    row: { recommendation: 'monitor', status: 'completed', edited_at: '2026-09-20T00:00:00Z', colour: 'green', blood_col: 'no' },
    vision: () => BLOODY,
  })
  await run(w)
  assertEquals(w.writes.map((x) => x.mode), ['update'])
  assertStrictEquals(w.row?.recommendation, 'worth_a_call')
  assertStrictEquals(w.row?.colour, 'green')
})

// ── CUL-1323: a new read clears the owner's hide; a hold and a plain failure do not ────
// The ruling (PM, 2026-09-27): a hide is about the words the owner read. Every write
// that puts words there they have not seen clears it, and only those. Asserted on what
// lands in the row, since "AI note hidden" over a Worth a call is the harm.

const HIDDEN = '2026-09-25T09:00:00.000Z'
const HIDDEN_CALM: Row = {
  id: 'a1', recommendation: 'monitor', status: 'completed', read_text: 'MONITOR:Mochi', blood_col: 'no', dismissed_at: HIDDEN,
}

Deno.test('pipeline CUL-1323 — a re-read landing a Worth a call over a hidden calm read clears the hide, edited or not', async () => {
  for (const edited_at of [null, '2026-09-20T00:00:00Z']) {
    const w = makeWorld({ row: { ...HIDDEN_CALM, edited_at }, vision: () => BLOODY })
    await run(w)
    assertStrictEquals(w.row?.recommendation, 'worth_a_call')
    assertStrictEquals(w.row?.dismissed_at, null, `edited_at=${edited_at}`)
  }
})

Deno.test('pipeline CUL-1323 — the capped contextual escalation over a hidden calm read clears the hide', async () => {
  // The path round 1 of the adversarial pass found untested: no model runs, the
  // escalation is the context's, and it goes through the builder.
  const w = makeWorld({ row: { ...HIDDEN_CALM }, contextFlags: ['ctx_flag'], dayCount: 11, vision: () => CLEAN })
  await run(w)
  assertStrictEquals(w.visionCalls, 0)
  assertStrictEquals(w.row?.recommendation, 'worth_a_call')
  assertStrictEquals(w.row?.dismissed_at, null)
})

Deno.test('pipeline CUL-1323 — the rescue over a hidden calm read clears the hide (a failed run that still warns)', async () => {
  const w = makeWorld({ row: { ...HIDDEN_CALM }, contextFlags: ['ctx_flag'], vision: overloaded })
  const r = await run(w)
  assertStrictEquals(r.status, 500)
  assertStrictEquals(w.row?.recommendation, 'worth_a_call')
  assertStrictEquals(w.row?.status, 'failed')
  assertStrictEquals(w.row?.dismissed_at, null)
})

Deno.test('pipeline CUL-1323 — a HOLD clears a hide the owner may never have seen (old build, stale screen)', async () => {
  // Adversarial round 2, Break 1, end to end. The owner's screen shows a calm read; a
  // Worth a call lands where the screen is not looking; a build without the compare-and-set
  // hides it unconditionally; then a calmer re-read (a photo swap, Ask's live read) is
  // held. The hold keeps the escalation's words and must not keep that hide.
  const w = makeWorld({ row: { ...HIDDEN_CALM }, vision: () => BLOODY })
  await run(w)
  assertStrictEquals(w.row?.recommendation, 'worth_a_call')
  assertStrictEquals(w.row?.dismissed_at, null)
  w.row!.dismissed_at = HIDDEN // the old build's `update({ dismissed_at }).eq('event_id')`
  w.vision = () => CLEAN
  w.writes = []
  const r = await run(w)
  assertStrictEquals(r.body.held, true)
  assertStrictEquals(w.row?.recommendation, 'worth_a_call')
  assertStrictEquals(w.row?.read_text, 'MODEL: blood')
  assertStrictEquals(w.row?.dismissed_at, null)
  assertEquals(w.writes, [{ mode: 'update', values: { dismissed_at: null } }])
})

Deno.test('pipeline CUL-1323 — a settling hold clears the hide with the status; an un-hidden hold still writes nothing', async () => {
  const kept: Row = {
    id: 'a1', recommendation: 'worth_a_call', status: 'failed', visual_flags: ['blood'], read_text: 'MODEL: blood',
    blood_col: 'yes', error: 'Claude API error 529', dismissed_at: HIDDEN,
  }
  const settling = makeWorld({ row: { ...kept }, vision: () => CLEAN })
  await run(settling)
  assertEquals(settling.writes, [{ mode: 'update', values: { status: 'completed', error: null, dismissed_at: null } }])
  assertStrictEquals(settling.row?.read_text, 'MODEL: blood')
  const shown = makeWorld({ row: { ...kept, status: 'completed', error: null, dismissed_at: null }, vision: () => CLEAN })
  const r = await run(shown)
  assertStrictEquals(r.body.held, true)
  assertEquals(shown.writes, [])
})

Deno.test('pipeline CUL-1323 — a failure that writes no words keeps the hide', async () => {
  const w = makeWorld({ row: { ...HIDDEN_CALM }, vision: overloaded })
  const r = await run(w)
  assertStrictEquals(r.status, 500)
  assertStrictEquals(w.row?.status, 'failed')
  assertStrictEquals(w.row?.read_text, 'MONITOR:Mochi')
  assertStrictEquals(w.row?.dismissed_at, HIDDEN)
})

// ── Engines v3 PR-11a: the stamps land with the words, and only with the words ──────────
// engineStamps.ts carries the rule; these pin that the pipeline calls it at every write of
// words, and at no other write. The owner is the pet's user_id ('owner-1'), never the caller.

const EN0_FOR_OWNER: Row[] = [{ key: 'engines_v3_en0', value: { enabled: false, allowlist: ['owner-1'] } }]
const HEX64 = /^[0-9a-f]{64}$/

Deno.test('pipeline EN-F — a first read carries every stamp, with the flag off for this owner', async () => {
  const w = makeWorld({ vision: () => CLEAN })
  await run(w)
  assertEquals(w.row?.engine_flags, [])
  assertStrictEquals(w.row?.rule_version, 'f2.test1')
  assertStrictEquals(w.row?.photo_set_key, ATTACHMENT_ID)
  assertStrictEquals(w.row?.model_id, 'test-model')
  assertStrictEquals(HEX64.test(String(w.row?.prompt_hash)), true)
})

Deno.test('pipeline EN-F — the flag resolves for the pet\'s OWNER from the allowlist', async () => {
  const on = makeWorld({ vision: () => CLEAN, appConfig: EN0_FOR_OWNER })
  await run(on)
  assertEquals(on.row?.engine_flags, ['engines_v3_en0'])
  const other = makeWorld({ vision: () => CLEAN, appConfig: [{ key: 'engines_v3_en0', value: { enabled: false, allowlist: ['someone-else'] } }] })
  await run(other)
  assertEquals(other.row?.engine_flags, [])
})

Deno.test('pipeline EN-F — an unreachable app_config: the engine flag fails CLOSED while the read itself still runs', async () => {
  // readGateConfig fails OPEN (the read stays on); the Engines flag fails closed.
  const w = makeWorld({ vision: () => BLOODY, appConfig: 'error' })
  const r = await run(w)
  assertStrictEquals(r.status, 200)
  assertStrictEquals(w.visionCalls, 1)
  assertStrictEquals(w.row?.recommendation, 'worth_a_call')
  assertEquals(w.row?.engine_flags, [])
})

Deno.test('pipeline EN-F ROLLBACK — a flag-off re-read holds an escalation written under the key, stamps and all', async () => {
  // The EN-F rollback clause: flag-off code never overwrites, collapses or lowers an
  // escalation written under the flag, and never relabels it as flag-off.
  const underKey: Row = {
    recommendation: 'worth_a_call', status: 'completed', read_text: 'MODEL: blood', blood_col: 'no',
    engine_flags: ['engines_v3_en0'], rule_version: 'f1.test1', photo_set_key: ATTACHMENT_ID,
    model_id: 'test-model', prompt_hash: 'a'.repeat(64),
  }
  const w = makeWorld({ row: { ...underKey }, vision: () => CLEAN })
  const r = await run(w)
  assertStrictEquals(r.body.held, true)
  assertEquals(w.writes, [])
  for (const [k, v] of Object.entries(underKey)) assertEquals(w.row?.[k], v, k)
})

Deno.test('pipeline EN-F — an owner-edited row: the read stamps refresh, the payload stamps stay with the payload', async () => {
  const w = makeWorld({
    row: {
      recommendation: 'monitor', status: 'completed', edited_at: '2026-09-20T00:00:00Z', blood_col: 'no',
      ai_raw_payload: { old: true }, model_id: 'old-model', prompt_hash: 'b'.repeat(64), engine_flags: null,
    },
    vision: () => BLOODY,
    appConfig: EN0_FOR_OWNER,
  })
  await run(w)
  assertEquals(w.writes.map((x) => x.mode), ['update'])
  assertEquals(w.row?.engine_flags, ['engines_v3_en0'])
  assertStrictEquals(w.row?.rule_version, 'f2.test1')
  assertEquals(w.row?.ai_raw_payload, { old: true })
  assertStrictEquals(w.row?.model_id, 'old-model')
  assertStrictEquals(w.row?.prompt_hash, 'b'.repeat(64))
})

Deno.test('pipeline EN-F — a capped escalation on a fresh row: read stamps, and NULL payload stamps (no model ran)', async () => {
  const w = makeWorld({ contextFlags: ['ctx_flag'], dayCount: 11, vision: () => CLEAN })
  await run(w)
  assertStrictEquals(w.visionCalls, 0)
  assertStrictEquals(w.row?.recommendation, 'worth_a_call')
  assertEquals(w.row?.engine_flags, [])
  assertStrictEquals(w.row?.model_id, null)
  assertStrictEquals(w.row?.prompt_hash, null)
})

Deno.test('pipeline EN-F — the capped STATE write carries no words and no stamps', async () => {
  const w = makeWorld({ dayCount: 11, vision: () => CLEAN })
  await run(w)
  assertStrictEquals(w.row?.status, 'capped')
  assertStrictEquals('engine_flags' in (w.row ?? {}), false)
})

Deno.test('pipeline EN-F — the rescue (a failed run that still warns) carries the read stamps', async () => {
  const w = makeWorld({ contextFlags: ['ctx_flag'], vision: overloaded, appConfig: EN0_FOR_OWNER })
  await run(w)
  assertStrictEquals(w.row?.status, 'failed')
  assertStrictEquals(w.row?.recommendation, 'worth_a_call')
  assertEquals(w.row?.engine_flags, ['engines_v3_en0'])
  assertStrictEquals(w.row?.photo_set_key, ATTACHMENT_ID)
})

Deno.test('pipeline EN-F — a failure that writes no words leaves the stamps of the read the row still holds', async () => {
  const stored: Row = {
    recommendation: 'monitor', status: 'completed', read_text: 'MONITOR:Mochi', blood_col: 'no',
    engine_flags: [], rule_version: 'f0.test0', photo_set_key: 'old', model_id: 'm0', prompt_hash: 'c'.repeat(64),
  }
  const w = makeWorld({ row: { ...stored }, vision: overloaded, appConfig: EN0_FOR_OWNER })
  await run(w)
  assertStrictEquals(w.row?.status, 'failed')
  for (const k of ['engine_flags', 'rule_version', 'photo_set_key', 'model_id', 'prompt_hash']) {
    assertEquals(w.row?.[k], stored[k], k)
  }
})

// ── EN-3 (CUL-1133; Engines v3 PR-26): the tier, dual-written under engines_v3_en3 ──────
// Every writer that sets `recommendation` sets `tier` under the key, by the one map; with
// the key off no write names the column. The never-lower rule reads the louder column.

const EN3_FOR_OWNER: Row[] = [{ key: 'engines_v3_en3', value: { enabled: false, allowlist: ['owner-1'] } }]
const MODEL_ONLY: TestAnalysis = {
  appears: true, blood: 'no', colour: 'yellow', visual_flags: [], recommendation: 'worth_a_call', read_text: 'MODEL: its own call', description: null,
}
const NOT_SUBJECT: TestAnalysis = { ...CLEAN, appears: false }
const tierWritten = (w: World) => w.writes.filter((x) => 'tier' in x.values).map((x) => x.values.tier)

Deno.test('pipeline EN-3 — flag-on, the full write-back carries the mapped tier beside the verdict', async () => {
  const cases: Array<[TestAnalysis, string, string]> = [
    [CLEAN, 'monitor', 'logged'],
    [BLOODY, 'worth_a_call', 'call_today'],
    [NOT_SUBJECT, 'not_enough_to_say', 'not_enough_to_say'],
  ]
  for (const [vision, recommendation, tier] of cases) {
    const w = makeWorld({ vision: () => vision, appConfig: EN3_FOR_OWNER })
    await run(w)
    assertStrictEquals(w.row?.recommendation, recommendation)
    assertStrictEquals(w.row?.tier, tier)
    assertEquals(w.row?.engine_flags, ['engines_v3_en3'])
    assertStrictEquals(w.row?.rule_version, 'f2.test1')
  }
})

Deno.test('pipeline EN-3 GAP-31 — the model\'s own escalation writes call today and keeps its words', async () => {
  const w = makeWorld({ vision: () => MODEL_ONLY, appConfig: EN3_FOR_OWNER })
  await run(w)
  assertStrictEquals(w.row?.recommendation, 'worth_a_call')
  assertStrictEquals(w.row?.tier, 'call_today')
  assertStrictEquals(w.row?.read_text, 'MODEL: its own call')
  assertEquals(w.row?.visual_flags, [])
  assertEquals(w.row?.contextual_flags, [])
})

Deno.test('pipeline EN-3 — flag-on, the owner-edited update, the capped escalation and the rescue all carry the tier', async () => {
  const edited = makeWorld({
    row: { recommendation: 'monitor', status: 'completed', edited_at: '2026-09-20T00:00:00Z', blood_col: 'no' },
    vision: () => BLOODY, appConfig: EN3_FOR_OWNER,
  })
  await run(edited)
  assertEquals(edited.writes.map((x) => x.mode), ['update'])
  assertStrictEquals(edited.row?.tier, 'call_today')

  const capped = makeWorld({ contextFlags: ['ctx_flag'], dayCount: 11, vision: () => CLEAN, appConfig: EN3_FOR_OWNER })
  await run(capped)
  assertStrictEquals(capped.visionCalls, 0)
  assertStrictEquals(capped.row?.tier, 'call_today')

  const rescued = makeWorld({ contextFlags: ['ctx_flag'], vision: overloaded, appConfig: EN3_FOR_OWNER })
  await run(rescued)
  assertStrictEquals(rescued.row?.status, 'failed')
  assertStrictEquals(rescued.row?.tier, 'call_today')
})

Deno.test('pipeline EN-3 flag-off — no write in any path names the tier (the column\'s absence is today)', async () => {
  const worlds = [
    makeWorld({ vision: () => CLEAN }),
    makeWorld({ vision: () => BLOODY }),
    makeWorld({ vision: () => MODEL_ONLY }),
    makeWorld({ row: { recommendation: 'monitor', status: 'completed', edited_at: '2026-09-20T00:00:00Z' }, vision: () => BLOODY }),
    makeWorld({ contextFlags: ['ctx_flag'], dayCount: 11, vision: () => CLEAN }),
    makeWorld({ contextFlags: ['ctx_flag'], vision: overloaded }),
    // EN-0's key on is not EN-3's.
    makeWorld({ vision: () => BLOODY, appConfig: EN0_FOR_OWNER }),
  ]
  for (const w of worlds) {
    await run(w)
    assertStrictEquals(w.writes.length > 0, true, 'a scenario wrote nothing; the guard would be vacuous')
    assertEquals(tierWritten(w), [])
  }
})

Deno.test('pipeline EN-3 never-lower — a call today over a stored call now writes its finding and keeps call now (F3)', async () => {
  const w = makeWorld({
    row: { recommendation: 'worth_a_call', tier: 'call_now', status: 'completed', read_text: 'EARLIER CALL NOW', blood_col: 'no' },
    vision: () => BLOODY, appConfig: EN3_FOR_OWNER,
  })
  await run(w)
  assertStrictEquals(w.row?.tier, 'call_now')
  assertStrictEquals(w.row?.blood_col, 'yes') // the new finding reaches the structured columns
  assertEquals(w.row?.visual_flags, ['blood'])
})

Deno.test('pipeline EN-3 never-lower — a capped call today never steps a stored call now down', async () => {
  const w = makeWorld({
    row: { recommendation: 'worth_a_call', tier: 'call_now', status: 'completed', read_text: 'EARLIER CALL NOW' },
    contextFlags: ['ctx_flag'], dayCount: 11, vision: () => CLEAN, appConfig: EN3_FOR_OWNER,
  })
  await run(w)
  assertStrictEquals(w.row?.tier, 'call_now')
  assertEquals(w.row?.contextual_flags, ['ctx_flag'])
})

Deno.test('pipeline EN-3 never-lower — quiet tiers move freely: an unreadable re-read collapses a stored logged', async () => {
  const w = makeWorld({
    row: { recommendation: 'monitor', tier: 'logged', status: 'completed', blood_col: 'no' },
    vision: unreadable, appConfig: EN3_FOR_OWNER,
  })
  await run(w)
  assertStrictEquals(w.row?.recommendation, 'not_enough_to_say')
  assertStrictEquals(w.row?.tier, 'not_enough_to_say')
})

Deno.test('pipeline EN-3 ROLLBACK — flag-off never lowers a call tier written under the key', async () => {
  // A calm flag-off re-read over a tiered call: held, tier and all (the shipped rule).
  const calm = makeWorld({
    row: { recommendation: 'worth_a_call', tier: 'call_today', status: 'completed', read_text: 'CALL', engine_flags: ['engines_v3_en3'] },
    vision: () => CLEAN,
  })
  await run(calm)
  assertEquals(calm.writes, [])
  assertStrictEquals(calm.row?.tier, 'call_today')
  // A client lowered the verdict beside a frozen call tier (CUL-1321 M1): still held.
  const lowered = makeWorld({
    row: { recommendation: 'monitor', tier: 'call_today', status: 'completed', read_text: 'CALL' },
    vision: () => CLEAN,
  })
  await run(lowered)
  assertEquals(lowered.writes, [])
  // A flag-off escalation over a tiered calm row writes the verdict and leaves the tier:
  // the louder column (worth_a_call, call today) is what every reader shows.
  const raised = makeWorld({ row: { recommendation: 'monitor', tier: 'logged', status: 'completed', blood_col: 'no' }, vision: () => BLOODY })
  await run(raised)
  assertStrictEquals(raised.row?.recommendation, 'worth_a_call')
  assertStrictEquals(raised.row?.tier, 'logged')
})
