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
  aiReads: number
  aiWriteAttempts: number
  rpcCalls: number
  visionCalls: number
  writes: Array<{ mode: 'update' | 'upsert'; values: Row }>
}

function makeWorld(o: Partial<World> & Pick<World, 'vision'>): World {
  return {
    row: null,
    contextFlags: [],
    dayCount: 1,
    aiReads: 0,
    aiWriteAttempts: 0,
    rpcCalls: 0,
    visionCalls: 0,
    writes: [],
    ...o,
  }
}

// ── The fake client ────────────────────────────────────────────────────────────────

class FakeQuery {
  private mode: 'select' | 'update' | 'upsert' = 'select'
  private cols = '*'
  private values: Row = {}
  constructor(private w: World, private table: string) {}
  select(cols = '*') { if (this.mode === 'select') this.cols = cols; return this }
  eq() { return this }
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
          deleted_at: null, pets: { name: 'Mochi', species: 'cat' },
        },
        error: null,
      }
    }
    if (this.table === 'event_attachments') return { data: [{ storage_path: 'pet-1/evt-1/a.jpg' }], error: null }
    if (this.table === 'app_config') return { data: [], error: null }
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
    w.writes.push({ mode: this.mode, values: structuredClone(this.values) })
    if (this.mode === 'update') {
      if (w.row) Object.assign(w.row, this.values)
    } else if (w.row) {
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
      world.row = { id: 'a1', recommendation: 'worth_a_call', status: 'completed', visual_flags: ['blood'], blood_col: 'yes' }
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
