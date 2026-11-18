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
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { isEscalationVerdict, QUIET_VERDICTS } from '../../../lib/incidentVerdict.ts'
import { INCIDENT_TIERS, TIER_RANK, tierRank, verdictForTier, verdictRank } from '../../../lib/incidentTier.ts'
import type { FloorTier } from '../../../lib/incidentFloor.ts'
import {
  applyFailureWrite,
  KNOWN_VERDICTS,
  presentRedFlagColumns,
  quieterRowFilters,
  runIncidentAnalysis,
  WRITE_ATTEMPTS,
  writePresentRedFlags,
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
  // What kind of blood: a column that describes the red-flag column (redFlagCompanions).
  bloodNote?: string | null
  // A second red flag, so one read can drop a stored flag while re-asserting another.
  foreign?: 'yes' | 'no' | null
  colour: string | null
}

interface World {
  row: Row | null
  contextFlags: Flag[]
  // The least call tier the record earns (ContextualRun.minTier, EN-4's floor).
  minTier?: FloorTier
  dayCount: number
  // What the model returns (or throws) for this run.
  vision: () => TestAnalysis | null
  // The nth read of event_ai_analysis fails (1-based).
  aiReadError?: (n: number) => boolean
  // The nth write to event_ai_analysis fails (1-based).
  aiWriteError?: (n: number) => boolean
  // Runs inside the vision call: a sibling run landing in the 10-60s window.
  duringVision?: (w: World) => void
  // Runs as the nth write to event_ai_analysis arrives (1-based), before it is matched
  // against the row: another writer committing between this run's read of the stored row
  // and its write (CUL-2773). Use `commit` so the row's version moves as production's does.
  beforeAiWrite?: (w: World, n: number) => void
  // The flags' second look, once the photo is read (ContextualRun.afterRead): which of the
  // record's flags stand, given the read and the stored row. Every flag is withdrawable.
  afterRead?: (analysis: TestAnalysis | null, stored: Row | null) => Flag[]
  // What app_config returns (Engines v3 flag + the gate config), or a read error.
  appConfig?: Row[] | 'error'
  // CUL-552 PR 2: the owner's ai_consent row as the service-role read sees it. Absent from
  // the world = a recorded yes, so every suite above this PR keeps testing what it tested;
  // null = no row (never asked), 'error' = a read that answered with an error, 'throw' =
  // one that never answered.
  consent?: Row | null | 'error' | 'throw'
  // Every ai_consent read: its filters and which client made it.
  consentReads: Array<{ filters: Row; client: 'user' | 'admin' }>
  // CUL-1835: the owner's consent history (ai_consent_events). Absent = one yes long before
  // the event, so every suite above keeps reading the photo; 'error' = a failed read.
  consentHistory?: Row[] | 'error' | 'throw'
  historyReads: Array<{ filters: Row; client: 'user' | 'admin'; order: unknown[]; limit: unknown }>
  // When the photo reached the server (event_attachments.created_at, the database's clock).
  photoUploadedAt?: string | null
  // When the phone logged the event (events.created_at). Absent = just after it occurred.
  eventCreatedAt?: string | null
  // The request says the owner tapped for this photo (owner_tap).
  ownerTap?: unknown
  // The uid auth.getUser() verifies from the JWT (default: the pet's owner).
  callerUid?: string
  // Photo downloads from Storage (a declined owner's photo is never fetched).
  downloads: number
  // The event was logged without a photo.
  noPhoto?: boolean
  // The descriptor carries a photo-finding contextual sentence (EN-0 / EN-4 vomit's do; stool's
  // and flag-off vomit's do not, so their words fall back to the context-only sentence).
  photoFindingCopy?: boolean
  aiReads: number
  aiWriteAttempts: number
  rpcCalls: number
  visionCalls: number
  writes: Array<{ mode: 'update' | 'upsert'; values: Row }>
}

// A stored row is this event's own unless a test says otherwise (CUL-1203), and carries a
// version: migration 075's trigger moves updated_at strictly forward on every UPDATE.
const OWN = { id: 'a1', event_id: 'evt-1', pet_id: 'pet-1', updated_at: '2026-09-26T08:00:00.000000+00:00' }
let versionTick = 0
const nextVersion = (): string => `2026-09-26T09:00:00.${String(++versionTick).padStart(6, '0')}+00:00`

// Another writer's UPDATE landing on the row (an owner's edit, a sibling run): the fields
// change and so does the version, as the trigger guarantees.
function commit(w: World, fields: Row): void {
  if (!w.row) throw new Error('commit: no row to update')
  Object.assign(w.row, fields, { updated_at: nextVersion() })
}
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
    consentReads: [],
    historyReads: [],
    downloads: 0,
    ...o,
    row: o.row ? { ...OWN, ...o.row } : null,
  }
}

// What a row says, as the shared module ranks it (kept apart from the code under test's import).
const effectiveTierRankOf = (row: { recommendation: string | null; tier: string | null }): number =>
  Math.max(verdictRank(row.recommendation), tierRank(row.tier))

// ── The fake client ────────────────────────────────────────────────────────────────

// A PostgREST `or` string, split on its top-level commas (an `in.(a,b)` list keeps its own).
function splitTopLevel(filters: string): string[] {
  const out: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < filters.length; i++) {
    if (filters[i] === '(') depth++
    if (filters[i] === ')') depth--
    if (filters[i] === ',' && depth === 0) { out.push(filters.slice(start, i)); start = i + 1 }
  }
  out.push(filters.slice(start))
  return out
}

// One `or` term: `col.is.null`, `col.in.(a,b)` or `col.not.in.(a,b)`. Anything else throws, so a filter this
// fake cannot evaluate is never green by being ignored (C-39). Neither `in` nor `not.in`
// matches NULL, as in SQL.
function parseOrTerm(term: string): (row: Row) => boolean {
  const isNull = /^(\w+)\.is\.null$/.exec(term)
  if (isNull) return (row) => (row[isNull[1]] ?? null) === null
  const notIn = /^(\w+)\.not\.in\.\((.*)\)$/.exec(term)
  if (notIn) {
    const values = notIn[2].split(',')
    return (row) => typeof row[notIn[1]] === 'string' && !values.includes(row[notIn[1]] as string)
  }
  const inList = /^(\w+)\.in\.\((.*)\)$/.exec(term)
  if (inList) {
    const values = inList[2].split(',')
    return (row) => typeof row[inList[1]] === 'string' && values.includes(row[inList[1]] as string)
  }
  throw new Error(`fake client: unsupported or-term ${term}`)
}

class FakeQuery {
  private mode: 'select' | 'update' | 'upsert' = 'select'
  private ignoreDuplicates = false
  private returning = false
  private cols = '*'
  private values: Row = {}
  private filters: Row = {}
  constructor(private w: World, private table: string, private who: 'user' | 'admin') {}
  select(cols = '*') { if (this.mode === 'select') this.cols = cols; else this.returning = true; return this }
  eq(column: string, value: unknown) { this.filters[column] = value; return this }
  // `is` and `or` are honoured on an event_ai_analysis UPDATE, as PostgREST honours them
  // (CUL-2808: the presence write and the content-held rescue are decided by these filters).
  // The request they build is pinned against the real client at the foot of this file.
  private predicates: Array<(row: Row) => boolean> = []
  is(column: string, value: unknown) { this.predicates.push((row) => (row[column] ?? null) === value); return this }
  in() { return this }
  or(filters: string) {
    const terms = splitTopLevel(filters).map(parseOrTerm)
    this.predicates.push((row) => terms.some((t) => t(row)))
    return this
  }
  private orderArgs: unknown[] = []
  private limitArg: unknown = undefined
  order(...args: unknown[]) { this.orderArgs = args; return this }
  limit(n: unknown) { this.limitArg = n; return this }
  maybeSingle() { return this }
  update(values: Row) { this.mode = 'update'; this.values = values; return this }
  upsert(values: Row, options?: { ignoreDuplicates?: boolean }) {
    this.mode = 'upsert'
    this.values = values
    this.ignoreDuplicates = options?.ignoreDuplicates === true
    return this
  }
  then<T>(resolve: (r: { data: unknown; error: { message: string } | null }) => T, reject?: (e: unknown) => T) {
    return Promise.resolve().then(() => this.run()).then(resolve, reject)
  }
  private run(): { data: unknown; error: { message: string } | null } {
    const w = this.w
    if (this.table === 'events') {
      return {
        data: {
          id: 'evt-1', pet_id: 'pet-1', event_type: 'vomit', occurred_at: '2026-09-26T08:00:00Z',
          created_at: w.eventCreatedAt === undefined ? '2026-09-26T08:00:05.000Z' : w.eventCreatedAt,
          deleted_at: null, pets: { name: 'Mochi', species: 'cat', user_id: 'owner-1' },
        },
        error: null,
      }
    }
    if (this.table === 'event_attachments') {
      const created_at = w.photoUploadedAt === undefined ? '2026-09-26T08:00:30+00:00' : w.photoUploadedAt
      return { data: w.noPhoto ? [] : [{ id: ATTACHMENT_ID, storage_path: 'pet-1/evt-1/a.jpg', created_at }], error: null }
    }
    if (this.table === 'app_config') {
      return w.appConfig === 'error' ? { data: null, error: { message: 'app_config unreachable' } } : { data: w.appConfig ?? [], error: null }
    }
    if (this.table === 'ai_consent') {
      w.consentReads.push({ filters: { ...this.filters }, client: this.who })
      if (w.consent === 'throw') throw new Error('ai_consent unreachable')
      if (w.consent === 'error') return { data: null, error: { message: 'ai_consent read failed' } }
      // Migration 100's grain: one row per (user_id, scope). Only that pair answers.
      const row = w.consent === undefined ? { user_id: 'owner-1', scope: 'ai_boundary', granted: true } : w.consent
      const hit = row && Object.entries(this.filters).every(([k, v]) => row[k] === v) ? row : null
      return { data: hit ? { granted: hit.granted } : null, error: null }
    }
    if (this.table === 'ai_consent_events') {
      w.historyReads.push({ filters: { ...this.filters }, client: this.who, order: this.orderArgs, limit: this.limitArg })
      if (w.consentHistory === 'throw') throw new Error('ai_consent_events unreachable')
      if (w.consentHistory === 'error') return { data: null, error: { message: 'history read failed' } }
      const rows = w.consentHistory ?? [{ user_id: 'owner-1', scope: 'ai_boundary', granted: true, decided_at: '2026-01-01T00:00:00+00:00' }]
      const mine = rows.filter((r) => Object.entries(this.filters).every(([k, v]) => r[k] === v))
      return { data: mine.map((r) => ({ granted: r.granted, decided_at: r.decided_at })), error: null }
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
    w.beforeAiWrite?.(w, w.aiWriteAttempts)
    if (w.aiWriteError?.(w.aiWriteAttempts)) return { data: null, error: { message: `write failed #${w.aiWriteAttempts}` } }
    if (this.mode === 'update') {
      // PostgREST: an UPDATE touches only rows matching every filter, and returns them
      // (updateAnalysisRow keys on the event's pet and reads the count back, CUL-1203).
      const matches = !!w.row && Object.entries(this.filters).every(([k, v]) => w.row?.[k] === v) &&
        this.predicates.every((p) => p(w.row!))
      if (!matches) return { data: [], error: null }
      w.writes.push({ mode: this.mode, values: structuredClone(this.values) })
      Object.assign(w.row!, this.values, { updated_at: nextVersion() })
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
    // ON CONFLICT DO NOTHING: a row already there is left alone and nothing comes back.
    if (w.row && this.ignoreDuplicates) return { data: this.returning ? [] : null, error: null }
    w.writes.push({ mode: this.mode, values: structuredClone(this.values) })
    if (w.row) {
      // PostgREST: only the sent columns change on conflict
      Object.assign(w.row, this.values, { updated_at: nextVersion() })
    } else {
      w.row = { id: OWN.id, edited_at: null, ...this.values, updated_at: nextVersion() }
    }
    return { data: this.returning ? [{ id: w.row.id }] : null, error: null }
  }
}

function fakeClient(w: World, who: 'user' | 'admin'): SupabaseClient {
  const client = {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: w.callerUid ?? 'owner-1' } }, error: null }) },
    from: (table: string) => new FakeQuery(w, table, who),
    rpc: () => {
      w.rpcCalls++
      return Promise.resolve({ data: { day_count: w.dayCount, month_count: w.dayCount }, error: null })
    },
    storage: {
      from: () => ({
        download: () => {
          w.downloads++
          return Promise.resolve({ data: new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])]), error: null })
        },
      }),
    },
  }
  return client as unknown as SupabaseClient
}

function depsFor(w: World): PipelineDeps {
  return {
    userClient: () => fakeClient(w, 'user'),
    adminClient: () => fakeClient(w, 'admin'),
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
    computeContextualFlags: () => Promise.resolve(
      w.afterRead
        ? { flags: w.contextFlags, copy: COPY, withdrawable: w.contextFlags, afterRead: (a, stored) => ({ flags: w.afterRead!(a, stored), copy: COPY }) }
        : w.minTier ? { flags: w.contextFlags, copy: w.photoFindingCopy ? { ...COPY, contextualWithPhotoFinding: (pet, flags, visual) => `PHOTO_CTX:${pet}:${flags.join(',')}:${visual.join(',')}` } : COPY, minTier: w.minTier }
        : w.contextFlags,
    ),
    copy: w.photoFindingCopy
      ? { ...COPY, contextualWithPhotoFinding: (pet, flags, visual) => `PHOTO_CTX:${pet}:${flags.join(',')}:${visual.join(',')}` }
      : COPY,
    buildStructuredValues: (a) => ({
      ai_raw_payload: a,
      blood_col: a?.blood ?? null,
      blood_note: a?.bloodNote ?? null,
      foreign_col: a?.foreign ?? null,
      colour: a?.colour ?? null,
      description: a?.description ?? null,
    }),
    redFlagColumns: ['blood_col', 'foreign_col'],
    redFlagCompanions: { blood_col: ['blood_note'] },
    // 'yes' and 'old' both read as blood, as vomit's fresh_red and coffee_ground do: a stored
    // kind the run did not see must survive a presence write.
    redFlagPresentValues: { blood_col: ['yes', 'old'], foreign_col: ['yes'] },
    presentFlagsFromStructured: (row) => [
      ...(row.blood_col === 'yes' || row.blood_col === 'old' ? ['blood'] : []),
      ...(row.foreign_col === 'yes' ? ['foreign_material'] : []),
    ],
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
    body: JSON.stringify(w.ownerTap === undefined ? { event_id: 'evt-1' } : { event_id: 'evt-1', owner_tap: w.ownerTap }),
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

Deno.test('pipeline CUL-1509 — a failed re-read then a calm one: the call stands and its error clears', async () => {
  // The CUL-819 line's whole life on one row. A call stands; a re-read fails over it (the
  // error-only write notes it, status stays completed: "the latest read hit a problem");
  // a later re-read finishes calm and is held. The second run finished, so the error goes,
  // and nothing else on the row moves. Drives the real select, so a stored-row read that
  // forgot the `error` column would leave it standing here.
  const w = makeWorld({
    row: { id: 'a1', recommendation: 'worth_a_call', status: 'completed', visual_flags: ['blood'], read_text: 'MODEL: blood', blood_col: 'yes' },
    vision: overloaded,
  })
  await run(w)
  assertEquals(w.writes, [{ mode: 'update', values: { error: 'Claude API error 529: overloaded' } }])
  assertStrictEquals(w.row?.status, 'completed')
  w.vision = () => CLEAN
  w.writes = []
  const r = await run(w)
  assertStrictEquals(r.body.held, true)
  assertEquals(w.writes, [{ mode: 'update', values: { error: null } }])
  assertStrictEquals(w.row?.error, null)
  assertStrictEquals(w.row?.status, 'completed')
  assertStrictEquals(w.row?.recommendation, 'worth_a_call')
  assertStrictEquals(w.row?.read_text, 'MODEL: blood')
  assertStrictEquals(w.row?.blood_col, 'yes')
})

Deno.test('pipeline CUL-1509 — a re-read that could not open the photo keeps the error: that read hit a problem too', async () => {
  // A call stands; a re-read fails (529) and the line shows; the retry's photo comes back
  // undecodable (Claude 400 → photoUnreadable → not_enough_to_say → held). Nothing read the
  // photo, so "The latest read hit a problem" stays (adversarial pass on CUL-1509).
  const w = makeWorld({
    row: { id: 'a1', recommendation: 'worth_a_call', status: 'completed', visual_flags: ['blood'], read_text: 'MODEL: blood', blood_col: 'yes' },
    vision: overloaded,
  })
  await run(w)
  w.vision = () => { throw new Error('Claude API error 400: could not process image') }
  w.writes = []
  const r = await run(w)
  assertStrictEquals(r.body.held, true)
  assertEquals(w.writes, [])
  assertStrictEquals(w.row?.error, 'Claude API error 529: overloaded')
  assertStrictEquals(w.row?.recommendation, 'worth_a_call')
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
  // The escalation's words, as its run stored them: over blood, the floor template (CUL-2682).
  assertStrictEquals(w.row?.read_text, 'VISUAL:Mochi:blood')
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
  assertStrictEquals(w.row?.rule_version, 'f3.test1')
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
  assertStrictEquals(w.row?.rule_version, 'f3.test1')
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
    assertStrictEquals(w.row?.rule_version, 'f3.test1')
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

// ── CUL-552 PR 2: the owner's AI consent gates the model call, never the escalation ──────
// D10 (the whole boundary) and the binding rules on CUL-552 (2026-10-11): the gate reads the
// 'ai_boundary' row through service_role, keyed on the JWT-verified uid; a missing row or a
// failed read is declined; declined writes read_disabled while contextual escalation still
// runs. The pipeline-level mirror of analyze-vomit/index.test.ts:67's capped-path invariant.

const DECLINED_WORLDS: Array<[string, World['consent']]> = [
  ['a recorded no', { user_id: 'owner-1', scope: 'ai_boundary', granted: false }],
  ['no row (never asked)', null],
  ['a read that errored', 'error'],
  ['a read that threw', 'throw'],
  ['a granted row filed under someone else', { user_id: 'someone-else', scope: 'ai_boundary', granted: true }],
  ['a granted value that is not the boolean true', { user_id: 'owner-1', scope: 'ai_boundary', granted: 'true' }],
]

for (const [label, consent] of DECLINED_WORLDS) {
  Deno.test(`pipeline CUL-552 — declined (${label}) + a contextual flag: worth_a_call written, no unit, no download, no model`, async () => {
    const w = makeWorld({ consent, contextFlags: ['ctx_flag'], vision: () => BLOODY })
    const r = await run(w)
    assertStrictEquals(r.status, 200)
    assertStrictEquals(r.body.gated, 'consent_declined')
    assertStrictEquals(r.body.recommendation, 'worth_a_call')
    assertStrictEquals(w.visionCalls, 0)
    assertStrictEquals(w.rpcCalls, 0)
    assertStrictEquals(w.downloads, 0)
    assertStrictEquals(w.row?.status, 'completed')
    assertStrictEquals(w.row?.recommendation, 'worth_a_call')
    assertStrictEquals(w.row?.read_text, 'CONTEXTUAL:Mochi:ctx_flag')
    assertEquals(w.row?.contextual_flags, ['ctx_flag'])
    assertEquals(w.row?.visual_flags, [])
  })

  Deno.test(`pipeline CUL-552 — declined (${label}) + no flag: the read_disabled state, nothing reassuring`, async () => {
    const w = makeWorld({ consent, vision: () => CLEAN })
    const r = await run(w)
    assertStrictEquals(r.status, 200)
    assertStrictEquals(r.body.gated, 'consent_declined')
    assertStrictEquals(r.body.recommendation, null)
    assertStrictEquals(w.visionCalls, 0)
    assertStrictEquals(w.rpcCalls, 0)
    assertStrictEquals(w.downloads, 0)
    assertStrictEquals(w.row?.status, 'read_disabled')
    assertStrictEquals(w.row?.recommendation ?? null, null)
    assertStrictEquals(w.row?.read_text ?? null, null)
  })
}

Deno.test('pipeline CUL-552 — the consent read is service-role, one scope, keyed on the JWT-verified uid', async () => {
  const w = makeWorld({ vision: () => CLEAN })
  await run(w)
  assertEquals(w.consentReads, [{ filters: { user_id: 'owner-1', scope: 'ai_boundary' }, client: 'admin' }])
})

Deno.test('pipeline CUL-552 — a caller who is not the pet\'s owner fails closed, whatever the owner said', async () => {
  // Unreachable under today's RLS (the caller is always the owner). Once it is reachable
  // (B-292), the caller's yes must not be spent on someone else's pet, and the owner's yes
  // must not be borrowed by the caller: neither answer alone opens the read.
  const w = makeWorld({ callerUid: 'caller-9', consent: { user_id: 'owner-1', scope: 'ai_boundary', granted: true }, vision: () => CLEAN })
  await run(w)
  assertEquals(w.consentReads, [])
  assertStrictEquals(w.visionCalls, 0)
  assertStrictEquals(w.downloads, 0)
  assertStrictEquals(w.row?.status, 'read_disabled')
})

Deno.test('pipeline CUL-552 — withdrawal after a bloody read, then a context flag: the photo finding stays on the card', async () => {
  // The adversarial pass's counterexample: the gated branch wrote visual_flags [] and the
  // context-only sentence over a read that had named fresh blood.
  const w = makeWorld({
    consent: { user_id: 'owner-1', scope: 'ai_boundary', granted: false },
    row: { recommendation: 'worth_a_call', status: 'completed', blood_col: 'yes', read_text: 'MODEL: blood', visual_flags: ['blood'], contextual_flags: [] },
    contextFlags: ['ctx_flag'],
    photoFindingCopy: true,
    vision: () => CLEAN,
  })
  await run(w)
  assertStrictEquals(w.visionCalls, 0)
  assertStrictEquals(w.row?.recommendation, 'worth_a_call')
  assertEquals(w.row?.visual_flags, ['blood'])
  assertEquals(w.row?.contextual_flags, ['ctx_flag'])
  assertStrictEquals(w.row?.blood_col, 'yes')
  // The words still lead with what the photo showed (the shared photo-finding read), never
  // the context-only sentence a photo-less log gets.
  assertStrictEquals(w.row?.read_text, 'PHOTO_CTX:Mochi:ctx_flag:blood')
})

Deno.test('pipeline CUL-552 — an owner-edited row keeps the owner\'s word as the lead, and its stored context flags', async () => {
  const w = makeWorld({
    consent: null,
    row: { recommendation: 'worth_a_call', status: 'completed', edited_at: '2026-09-20T00:00:00Z', blood_col: 'yes', visual_flags: [], contextual_flags: ['ctx_flag'] },
    contextFlags: ['ctx_flag'],
    photoFindingCopy: true,
    vision: () => CLEAN,
  })
  await run(w)
  assertEquals(w.row?.contextual_flags, ['ctx_flag'])
  assertStrictEquals(w.row?.edited_at, '2026-09-20T00:00:00Z')
  assertStrictEquals(w.row?.blood_col, 'yes')
  // The owner's structured word (blood_col 'yes') leads, not the stale cached flags.
  assertStrictEquals(w.row?.read_text, 'PHOTO_CTX:Mochi:ctx_flag:blood')
})

Deno.test('pipeline CUL-552 — granted: the read runs exactly as before (the gate is not shut everywhere)', async () => {
  const w = makeWorld({ consent: { user_id: 'owner-1', scope: 'ai_boundary', granted: true }, vision: () => CLEAN })
  const r = await run(w)
  assertStrictEquals(r.status, 200)
  assertStrictEquals(w.visionCalls, 1)
  assertStrictEquals(w.rpcCalls, 1)
  assertStrictEquals(w.downloads, 1)
  assertStrictEquals(w.row?.status, 'completed')
  assertStrictEquals(w.row?.recommendation, 'monitor')
})

Deno.test('pipeline CUL-552 — a decline after a real read leaves that read standing (never downgraded, never re-sent)', async () => {
  const w = makeWorld({
    consent: { user_id: 'owner-1', scope: 'ai_boundary', granted: false },
    row: { recommendation: 'worth_a_call', status: 'completed', blood_col: 'yes', read_text: 'MODEL: blood', visual_flags: ['blood'] },
    vision: () => CLEAN,
  })
  await run(w)
  assertStrictEquals(w.visionCalls, 0)
  assertEquals(w.writes, [])
  assertStrictEquals(w.row?.recommendation, 'worth_a_call')
  assertStrictEquals(w.row?.blood_col, 'yes')
})

Deno.test('pipeline CUL-552 — a declined photo-less log reads no consent and still escalates on context', async () => {
  // No photo, no model call, so nothing to gate: the byte-identical photo-less path.
  const w = makeWorld({ consent: null, contextFlags: ['ctx_flag'], vision: () => CLEAN, noPhoto: true })
  await run(w)
  assertEquals(w.consentReads, [])
  assertStrictEquals(w.visionCalls, 0)
  assertStrictEquals(w.row?.recommendation, 'worth_a_call')
})

Deno.test('pipeline CUL-552 — a declined re-read keeps a stored context flag beside this run\'s new one', async () => {
  const w = makeWorld({
    consent: null,
    row: { recommendation: 'worth_a_call', status: 'completed', blood_col: 'no', visual_flags: [], contextual_flags: ['old_flag'] },
    contextFlags: ['ctx_flag'],
    vision: () => CLEAN,
  })
  await run(w)
  assertEquals(w.row?.contextual_flags, ['old_flag', 'ctx_flag'])
  assertStrictEquals(w.row?.read_text, 'CONTEXTUAL:Mochi:old_flag,ctx_flag')
})

Deno.test('pipeline CUL-552 — a declined re-read over the model\'s own flagless call still leads with the photo', async () => {
  // Unedited, worth_a_call, no flag of either kind: only the model writes that row.
  const w = makeWorld({
    consent: null,
    row: { recommendation: 'worth_a_call', status: 'completed', blood_col: 'no', read_text: 'MODEL: closer look', visual_flags: [], contextual_flags: [] },
    contextFlags: ['ctx_flag'],
    photoFindingCopy: true,
    vision: () => CLEAN,
  })
  await run(w)
  assertStrictEquals(w.row?.recommendation, 'worth_a_call')
  assertStrictEquals(w.row?.read_text, 'PHOTO_CTX:Mochi:ctx_flag:')
})


// ── CUL-1835 (PM ruling on CUL-1913): "sent only if you tap", enforced here ─────────────
// A yes is on file, but the event was logged before that yes began: the photo waits for the
// owner's tap. The photo is skipped, never the check that needs no photo.

const YES_AT = '2026-09-26T09:00:00+00:00' // an hour after the event was logged
const yesFrom = (at: string, extra: Row[] = []): Row[] => [
  ...extra,
  { user_id: 'owner-1', scope: 'ai_boundary', granted: true, decided_at: at },
]

Deno.test('pipeline CUL-1835 — logged before the yes, no tap, no flag: read_disabled, no unit, no download, no model', async () => {
  const w = makeWorld({ consentHistory: yesFrom(YES_AT), vision: () => CLEAN })
  const r = await run(w)
  assertStrictEquals(r.status, 200)
  assertStrictEquals(r.body.gated, 'photo_predates_consent')
  assertStrictEquals(w.visionCalls, 0)
  assertStrictEquals(w.downloads, 0)
  assertStrictEquals(w.rpcCalls, 0)
  assertStrictEquals(w.row?.status, 'read_disabled')
  assertStrictEquals(w.row?.recommendation ?? null, null)
})

// The adversarial pass's counterexample on the client hold: the check that needs no photo
// must still run for the held record.
Deno.test('pipeline CUL-1835 — logged before the yes, no tap, a contextual flag: the call is written, the photo is not read', async () => {
  const w = makeWorld({ consentHistory: yesFrom(YES_AT), contextFlags: ['ctx_flag'], vision: () => BLOODY })
  const r = await run(w)
  assertStrictEquals(r.body.gated, 'photo_predates_consent')
  assertStrictEquals(w.visionCalls, 0)
  assertStrictEquals(w.downloads, 0)
  assertStrictEquals(w.row?.status, 'completed')
  assertStrictEquals(w.row?.recommendation, 'worth_a_call')
  assertStrictEquals(w.row?.ai_raw_payload ?? null, null)
})

Deno.test('pipeline CUL-1835 — the owner tapped: the photo is read', async () => {
  const w = makeWorld({ consentHistory: yesFrom(YES_AT), ownerTap: true, vision: () => CLEAN })
  await run(w)
  assertStrictEquals(w.visionCalls, 1)
  assertStrictEquals(w.row?.status, 'completed')
})

Deno.test('pipeline CUL-1835 — only the literal true is a tap', async () => {
  for (const tap of ['true', 1, {}, null]) {
    const w = makeWorld({ consentHistory: yesFrom(YES_AT), ownerTap: tap, vision: () => CLEAN })
    await run(w)
    assertStrictEquals(w.visionCalls, 0, `owner_tap ${JSON.stringify(tap)}`)
  }
})

Deno.test('pipeline CUL-1835 — logged inside the yes: read as always, without a tap', async () => {
  const w = makeWorld({ consentHistory: yesFrom('2026-09-26T07:00:00+00:00'), vision: () => CLEAN })
  await run(w)
  assertStrictEquals(w.visionCalls, 1)
})

// A re-saved yes re-stamps the state row; the history keeps the start of the run.
Deno.test('pipeline CUL-1835 — a re-saved yes does not re-hold a photo logged under the yes it repeated', async () => {
  const w = makeWorld({
    consentHistory: yesFrom(YES_AT, [{ user_id: 'owner-1', scope: 'ai_boundary', granted: true, decided_at: '2026-09-26T07:00:00+00:00' }]),
    vision: () => CLEAN,
  })
  await run(w)
  assertStrictEquals(w.visionCalls, 1)
})

// yes → no → photo logged → yes: the current yes began after the event.
Deno.test('pipeline CUL-1835 — a yes, then a no, then the log, then a yes: held', async () => {
  const w = makeWorld({
    eventCreatedAt: '2026-09-26T08:30:00.000Z',
    consentHistory: [
      { user_id: 'owner-1', scope: 'ai_boundary', granted: true, decided_at: '2026-09-26T07:00:00+00:00' },
      { user_id: 'owner-1', scope: 'ai_boundary', granted: false, decided_at: '2026-09-26T08:00:00+00:00' },
      { user_id: 'owner-1', scope: 'ai_boundary', granted: true, decided_at: YES_AT },
    ],
    vision: () => CLEAN,
  })
  await run(w)
  assertStrictEquals(w.visionCalls, 0)
})

Deno.test('pipeline CUL-1835 — fails closed: a failed history read, an empty history, a missing log time', async () => {
  for (const o of [
    { consentHistory: 'error' as const },
    { consentHistory: 'throw' as const },
    { consentHistory: [] },
    { eventCreatedAt: null },
    { eventCreatedAt: 'not a time' },
  ]) {
    const w = makeWorld({ ...o, contextFlags: ['ctx_flag'], vision: () => CLEAN })
    const r = await run(w)
    assertStrictEquals(w.visionCalls, 0, JSON.stringify(o))
    // …and the check that needs no photo still escalates.
    assertStrictEquals(r.body.recommendation, 'worth_a_call', JSON.stringify(o))
  }
})

// Newest first and capped: a cap can then only move the start of the yes later (holds more).
// Ascending, the cap would keep the OLDEST rows and could date the yes before a later no.
Deno.test('pipeline CUL-1835 — the history read is service-role, one scope, the verified uid, newest first, capped', async () => {
  const w = makeWorld({ vision: () => CLEAN })
  await run(w)
  assertEquals(w.historyReads, [{
    filters: { user_id: 'owner-1', scope: 'ai_boundary' },
    client: 'admin',
    order: ['decided_at', { ascending: false }],
    limit: 500,
  }])
})

// rls-privacy pass 2: the phone stamped the log after the yes (its clock runs ahead), but the
// photo reached the server before the yes, by the database's own clock.
Deno.test('pipeline CUL-1835 — a phone clock running ahead: the upload time holds the photo', async () => {
  const w = makeWorld({
    eventCreatedAt: '2026-09-26T09:10:00.000Z',
    photoUploadedAt: '2026-09-26T08:01:00+00:00',
    consentHistory: yesFrom(YES_AT),
    contextFlags: ['ctx_flag'],
    vision: () => CLEAN,
  })
  const r = await run(w)
  assertStrictEquals(r.body.gated, 'photo_predates_consent')
  assertStrictEquals(w.visionCalls, 0)
  assertStrictEquals(r.body.recommendation, 'worth_a_call')
})

Deno.test('pipeline CUL-1835 — a decline is still a decline: the history is never read, a tap opens nothing', async () => {
  const w = makeWorld({ consent: { user_id: 'owner-1', scope: 'ai_boundary', granted: false }, ownerTap: true, vision: () => CLEAN })
  const r = await run(w)
  assertStrictEquals(r.body.gated, 'consent_declined')
  assertStrictEquals(w.visionCalls, 0)
  assertEquals(w.historyReads, [])
})

Deno.test('pipeline CUL-1835 — a photoless event never reads the history', async () => {
  const w = makeWorld({ noPhoto: true, consentHistory: yesFrom(YES_AT), contextFlags: ['ctx_flag'], vision: () => CLEAN })
  await run(w)
  assertEquals(w.historyReads, [])
})

// ── CUL-2773: a write lands only over the row it decided on ───────────────────────────
// The run reads the stored row, awaits, then writes. Another writer can commit inside
// that gap; `beforeAiWrite` puts one there, as the write arrives. Before CUL-2773 the
// full write was an unconditional upsert: it wrote the read's own observations over an
// owner's just-saved correction and left edited_at standing, so the AI's values printed
// as owner-reviewed.

const STORED_CALM = {
  recommendation: 'monitor', status: 'completed', read_text: 'OLD READ', edited_at: null,
  blood_col: 'no', colour: 'yellow', ai_raw_payload: { blood: 'no', colour: 'yellow' },
}
const EDITED_AT = '2026-09-26T08:30:00Z'
// The owner's correction as the phone writes it: the fields, and the stamp.
const OWNER_EDIT = { blood_col: 'yes', colour: 'red', edited_at: EDITED_AT }
const STRUCTURED = ['blood_col', 'blood_note', 'foreign_col', 'colour', 'description', 'ai_raw_payload']
const structuredKeysWritten = (w: World): string[] =>
  w.writes.flatMap((x) => Object.keys(x.values)).filter((k) => STRUCTURED.includes(k))

Deno.test('pipeline CUL-2773 — an owner edit between the stored-row read and the write survives, with edited_at', async () => {
  const w = makeWorld({
    row: { ...STORED_CALM },
    vision: () => CLEAN, // reads blood: no — the value the owner is correcting
    beforeAiWrite: (world, n) => { if (n === 1) commit(world, OWNER_EDIT) },
  })
  const r = await run(w)
  assertStrictEquals(r.status, 200)
  // The owner's values, the stamp, and the payload the edit is diffed against all stand.
  assertStrictEquals(w.row?.blood_col, 'yes')
  assertStrictEquals(w.row?.colour, 'red')
  assertStrictEquals(w.row?.edited_at, EDITED_AT)
  assertEquals(w.row?.ai_raw_payload, STORED_CALM.ai_raw_payload)
  // The first write matched nothing; the second is the read-fields-only one, so the run's
  // words still land and no structured column was sent at all.
  assertStrictEquals(w.aiWriteAttempts, 2)
  assertEquals(w.writes.map((x) => x.mode), ['update'])
  assertEquals(structuredKeysWritten(w), [])
  assertStrictEquals(w.row?.read_text, 'MONITOR:Mochi')
})

Deno.test('pipeline CUL-2773 — with nobody in the gap the same re-read still lands in full (the hook is the difference)', async () => {
  const w = makeWorld({ row: { ...STORED_CALM, colour: 'green' }, vision: () => CLEAN })
  await run(w)
  assertStrictEquals(w.aiWriteAttempts, 1)
  assertStrictEquals(w.row?.colour, 'yellow')
  assertStrictEquals(w.row?.edited_at, null)
})

Deno.test('pipeline CUL-2773 — an edit that lands on a FIRST read\'s freshly made row is not written over', async () => {
  // No row when the run decided; a sibling's read and the owner's correction of it both
  // commit before this run's write. Insert-only: the run must not upsert over them.
  const w = makeWorld({
    vision: () => CLEAN,
    beforeAiWrite: (world, n) => {
      if (n === 1) world.row = { ...OWN, ...STORED_CALM, ...OWNER_EDIT, updated_at: '2026-09-26T08:30:00.000001+00:00' }
    },
  })
  const r = await run(w)
  assertStrictEquals(r.status, 200)
  assertStrictEquals(w.row?.blood_col, 'yes')
  assertStrictEquals(w.row?.edited_at, EDITED_AT)
  assertEquals(structuredKeysWritten(w), [])
})

Deno.test('pipeline CUL-2773 — a sibling\'s escalation landing in the gap is held, not lowered by this run\'s calm write', async () => {
  const w = makeWorld({
    row: { ...STORED_CALM },
    vision: () => CLEAN,
    beforeAiWrite: (world, n) => {
      if (n === 1) commit(world, { recommendation: 'worth_a_call', read_text: 'SIBLING: blood', blood_col: 'yes', visual_flags: ['blood'] })
    },
  })
  const r = await run(w)
  assertStrictEquals(r.body.held, true)
  assertStrictEquals(w.row?.recommendation, 'worth_a_call')
  assertStrictEquals(w.row?.read_text, 'SIBLING: blood')
  assertStrictEquals(w.row?.blood_col, 'yes')
  assertEquals(w.writes, [])
})

Deno.test('pipeline CUL-2773 — a row that keeps moving ends the run failed: no structured column is ever written', async () => {
  let edits = 0
  const w = makeWorld({
    row: { ...STORED_CALM },
    vision: () => CLEAN,
    beforeAiWrite: (world) => { commit(world, { ...OWNER_EDIT, colour: `red-${++edits}` }) },
  })
  const r = await run(w)
  assertStrictEquals(r.status, 500)
  // Three attempts, each missed; then the catch's own write, which carries state only.
  assertStrictEquals(edits, 4)
  assertEquals(structuredKeysWritten(w), [])
  assertStrictEquals(w.row?.blood_col, 'yes')
  assertStrictEquals(w.row?.colour, 'red-4')
  assertStrictEquals(w.row?.edited_at, EDITED_AT)
  assertEquals(w.row?.ai_raw_payload, STORED_CALM.ai_raw_payload)
})

Deno.test('pipeline CUL-2773 — a hold\'s settle is held to the version too: an edit in its gap survives and the hold still lands', async () => {
  const w = makeWorld({
    // A stored escalation the owner hid: a calmer run holds, and the hold clears the hide.
    row: { ...STORED_CALM, recommendation: 'worth_a_call', blood_col: 'yes', dismissed_at: '2026-09-25T00:00:00Z' },
    vision: () => CLEAN,
    beforeAiWrite: (world, n) => { if (n === 1) commit(world, { colour: 'brown', edited_at: EDITED_AT }) },
  })
  const r = await run(w)
  assertStrictEquals(r.body.held, true)
  assertStrictEquals(w.aiWriteAttempts, 2)
  assertStrictEquals(w.row?.colour, 'brown')
  assertStrictEquals(w.row?.edited_at, EDITED_AT)
  assertStrictEquals(w.row?.dismissed_at, null)
  assertStrictEquals(w.row?.recommendation, 'worth_a_call')
})

Deno.test('pipeline CUL-2773 — the capped escalation: a row that appears in its gap keeps its observations', async () => {
  // Capped, a contextual flag, no row at step 3b: the write is a full one with NULL
  // structured columns. A read and the owner's correction land before it.
  const w = makeWorld({
    contextFlags: ['ctx_flag'],
    dayCount: 11,
    vision: () => CLEAN,
    beforeAiWrite: (world, n) => {
      if (n === 1) world.row = { ...OWN, ...STORED_CALM, ...OWNER_EDIT, updated_at: '2026-09-26T08:30:00.000002+00:00' }
    },
  })
  const r = await run(w)
  assertStrictEquals(r.status, 200)
  assertStrictEquals(w.visionCalls, 0)
  assertStrictEquals(w.row?.recommendation, 'worth_a_call') // the escalation still lands
  assertStrictEquals(w.row?.blood_col, 'yes')
  assertStrictEquals(w.row?.colour, 'red')
  assertStrictEquals(w.row?.edited_at, EDITED_AT)
  assertEquals(w.row?.ai_raw_payload, STORED_CALM.ai_raw_payload)
  assertEquals(structuredKeysWritten(w), [])
})

Deno.test('pipeline CUL-2773 — a stored row with no version is refused, never written unconditionally', async () => {
  const w = makeWorld({ row: { ...STORED_CALM, updated_at: null }, vision: () => CLEAN })
  const r = await run(w)
  assertStrictEquals(r.status, 500)
  assertEquals(structuredKeysWritten(w), [])
  assertStrictEquals(w.row?.colour, 'yellow')
})

Deno.test('pipeline CUL-2773 — the capped STATE write never lands over a read that arrived in its gap', async () => {
  // Capped, no flag, no row at step 3b: the run would record the capped state. A
  // sibling's escalation lands first; the state must not replace its status.
  const w = makeWorld({
    dayCount: 11,
    vision: () => CLEAN,
    beforeAiWrite: (world, n) => {
      if (n === 1) world.row = { ...OWN, ...STORED_CALM, recommendation: 'worth_a_call', blood_col: 'yes', updated_at: '2026-09-26T08:30:00.000003+00:00' }
    },
  })
  const r = await run(w)
  assertStrictEquals(r.status, 200)
  assertStrictEquals(w.row?.status, 'completed')
  assertStrictEquals(w.row?.recommendation, 'worth_a_call')
  assertEquals(w.writes, [])
})

Deno.test('pipeline CUL-2773 — the capped STATE over a failed row that becomes a real read in its gap is not written', async () => {
  const w = makeWorld({
    row: { status: 'failed', recommendation: null, error: 'boom', blood_col: null },
    dayCount: 11,
    vision: () => CLEAN,
    beforeAiWrite: (world, n) => {
      if (n === 1) commit(world, { status: 'completed', recommendation: 'worth_a_call', error: null, blood_col: 'yes' })
    },
  })
  await run(w)
  assertStrictEquals(w.row?.status, 'completed')
  assertStrictEquals(w.row?.recommendation, 'worth_a_call')
  assertEquals(w.writes, [])
})

Deno.test('pipeline CUL-2773 — the capped STATE still lands over a failed row nobody touched', async () => {
  const w = makeWorld({ row: { status: 'failed', recommendation: null, error: 'boom' }, dayCount: 11, vision: () => CLEAN })
  await run(w)
  assertEquals(w.writes.map((x) => x.mode), ['update'])
  assertStrictEquals(w.row?.error, null)
  assertStrictEquals(w.row?.status === 'failed', false)
})

// Adversarial pass 1 (ADV3): the flags' second look ran once, over the first fresh read,
// and its answer was replayed on every retry. An owner's correction landing in the gap
// then got the read-fields-only write of a withdrawal it should have blocked.
Deno.test('pipeline CUL-2773 — a retry re-runs the flags\' second look over the owner\'s edit: the call a correction keeps is kept', async () => {
  const w = makeWorld({
    row: { ...STORED_CALM },
    contextFlags: ['ctx_flag'],
    vision: () => CLEAN,
    // The read withdraws the record's flag unless the owner has corrected the colour away
    // from what the model saw (EN-7's shape: an owner's "watery" outranks a formed read).
    afterRead: (_a, stored) => (stored?.edited_at && stored.colour !== 'yellow' ? ['ctx_flag'] : []),
    beforeAiWrite: (world, n) => { if (n === 1) commit(world, { colour: 'watery', edited_at: EDITED_AT }) },
  })
  const r = await run(w)
  assertStrictEquals(r.status, 200)
  assertStrictEquals(w.aiWriteAttempts, 2)
  assertStrictEquals(w.row?.recommendation, 'worth_a_call')
  assertEquals(w.row?.contextual_flags, ['ctx_flag'])
  assertStrictEquals(w.row?.read_text, 'CONTEXTUAL:Mochi:ctx_flag')
  assertStrictEquals(w.row?.colour, 'watery')
  assertStrictEquals(w.row?.edited_at, EDITED_AT)
})

Deno.test('pipeline CUL-2773 — with nobody in the gap the same read withdraws (the retry is the difference)', async () => {
  const w = makeWorld({
    row: { ...STORED_CALM },
    contextFlags: ['ctx_flag'],
    vision: () => CLEAN,
    afterRead: (_a, stored) => (stored?.edited_at && stored.colour !== 'yellow' ? ['ctx_flag'] : []),
  })
  await run(w)
  assertStrictEquals(w.row?.recommendation, 'monitor')
  assertEquals(w.row?.contextual_flags, [])
})

Deno.test('pipeline CUL-2773 — a retry that escalates over an edited row leaves the stored description alone', async () => {
  // The owner's edit in the gap keeps the flag on attempt 2, which escalates on context.
  // The row is edited by then, so no structured column is written at all: the stored
  // description stands, whatever either attempt decided about the model's.
  const w = makeWorld({
    row: { ...STORED_CALM, description: 'STORED' },
    contextFlags: ['ctx_flag'],
    vision: () => ({ ...CLEAN, description: 'MODEL' }),
    afterRead: (_a, stored) => (stored?.edited_at ? ['ctx_flag'] : []),
    beforeAiWrite: (world, n) => { if (n === 1) commit(world, { edited_at: EDITED_AT }) },
  })
  await run(w)
  assertStrictEquals(w.row?.description, 'STORED')
  assertStrictEquals(w.row?.recommendation, 'worth_a_call')
})

// Adversarial pass 2: every attempt withdrew the flag over a row that then moved, and the
// catch rescued from the last attempt's withdrawal. The owner's correction landed last, so
// the failed frame carried no call over a row that warrants one.
Deno.test('pipeline CUL-2773 — three misses with the owner\'s correction landing last: the catch keeps the record\'s call', async () => {
  const w = makeWorld({
    row: { ...STORED_CALM },
    contextFlags: ['ctx_flag'],
    vision: () => CLEAN,
    afterRead: (_a, stored) => (stored?.edited_at && stored.colour !== 'yellow' ? ['ctx_flag'] : []),
    beforeAiWrite: (world, n) => {
      if (n <= 2) commit(world, {}) // a sibling moves the version and nothing else
      if (n === 3) commit(world, { colour: 'watery', edited_at: EDITED_AT })
    },
  })
  const r = await run(w)
  assertStrictEquals(r.status, 500)
  assertStrictEquals(w.row?.recommendation, 'worth_a_call')
  assertEquals(w.row?.contextual_flags, ['ctx_flag'])
  assertStrictEquals(w.row?.read_text, 'CONTEXTUAL:Mochi:ctx_flag')
  assertStrictEquals(w.row?.status, 'failed')
  assertStrictEquals(w.row?.colour, 'watery')
  assertStrictEquals(w.row?.edited_at, EDITED_AT)
  assertEquals(structuredKeysWritten(w), [])
})

Deno.test('pipeline CUL-2773 — a write that FAILS after a withdrawal still rescues nothing (only a miss gives the flags back)', async () => {
  const w = makeWorld({
    row: { ...STORED_CALM },
    contextFlags: ['ctx_flag'],
    vision: () => CLEAN,
    afterRead: () => [],
    aiWriteError: (n) => n === 1,
  })
  const r = await run(w)
  assertStrictEquals(r.status, 500)
  assertStrictEquals(w.row?.recommendation === 'worth_a_call', false)
})

// ── CUL-2805: the catch's failure write lands only over the row the catch read ─────────
// The catch re-reads the row, decides, then writes. A sibling's read can commit inside that
// gap; `beforeAiWrite` puts one there. Before CUL-2805 the rescue and the plain failed state
// were unconditional upserts: a sibling's call now came back as this run's call today, and a
// sibling's calm read with blood got the failure frame over its blood row.

const SIBLING_CALL_NOW = {
  recommendation: 'worth_a_call', tier: 'call_now', status: 'completed', read_text: 'SIBLING CALL NOW', error: null,
}

Deno.test('pipeline CUL-2805 — a sibling\'s call now landing in the rescue\'s gap is not lowered to call today', async () => {
  const w = makeWorld({
    row: { ...STORED_CALM },
    contextFlags: ['ctx_flag'], vision: overloaded, appConfig: EN3_FOR_OWNER,
    beforeAiWrite: (world, n) => { if (n === 1) commit(world, SIBLING_CALL_NOW) },
  })
  const r = await run(w)
  assertStrictEquals(r.status, 500)
  // The held rescue missed; the re-decision over the call now writes the error note only.
  assertEquals(w.writes.map((x) => Object.keys(x.values).sort()), [['error', 'may_wait']])
  assertStrictEquals(w.row?.tier, 'call_now')
  assertStrictEquals(w.row?.recommendation, 'worth_a_call')
  assertStrictEquals(w.row?.read_text, 'SIBLING CALL NOW')
  assertStrictEquals(w.row?.status, 'completed')
})

Deno.test('pipeline CUL-2805 — a sibling row that appears in the rescue\'s gap over no row is not written over', async () => {
  const w = makeWorld({
    contextFlags: ['ctx_flag'], vision: overloaded, appConfig: EN3_FOR_OWNER,
    beforeAiWrite: (world, n) => {
      if (n === 1) world.row = { ...OWN, ...STORED_CALM, ...SIBLING_CALL_NOW, updated_at: '2026-09-26T08:30:00.000004+00:00' }
    },
  })
  const r = await run(w)
  assertStrictEquals(r.status, 500)
  assertEquals(w.writes.map((x) => Object.keys(x.values).sort()), [['error', 'may_wait']])
  assertStrictEquals(w.row?.tier, 'call_now')
  assertStrictEquals(w.row?.read_text, 'SIBLING CALL NOW')
})

Deno.test('pipeline CUL-2805 — a sibling\'s calm read with blood landing in the failed write\'s gap keeps its frame', async () => {
  const w = makeWorld({
    row: { ...STORED_CALM },
    vision: overloaded,
    beforeAiWrite: (world, n) => { if (n === 1) commit(world, { status: 'completed', blood_col: 'yes', read_text: 'SIBLING: blood', error: null }) },
  })
  const r = await run(w)
  assertStrictEquals(r.status, 500)
  assertStrictEquals(w.aiWriteAttempts, 1)
  assertEquals(w.writes, [])
  assertStrictEquals(w.row?.status, 'completed')
  assertStrictEquals(w.row?.error, null)
  assertStrictEquals(w.row?.blood_col, 'yes')
})

Deno.test('pipeline CUL-2805 — with nobody in the gap the failed state and the rescue still land (the hook is the difference)', async () => {
  const failed = makeWorld({ row: { ...STORED_CALM }, vision: overloaded })
  await run(failed)
  assertEquals(failed.writes.map((x) => x.mode), ['update'])
  assertStrictEquals(failed.row?.status, 'failed')
  assertStrictEquals(failed.row?.blood_col, 'no')

  const rescued = makeWorld({ row: { ...STORED_CALM }, contextFlags: ['ctx_flag'], vision: overloaded, appConfig: EN3_FOR_OWNER })
  await run(rescued)
  assertEquals(rescued.writes.map((x) => x.mode), ['update'])
  assertStrictEquals(rescued.row?.status, 'failed')
  assertStrictEquals(rescued.row?.tier, 'call_today')
  // The held update sends no key column (the row's pet is frozen, migration 074), and still
  // re-syncs incident_type as the upsert did.
  assertEquals(Object.keys(rescued.writes[0].values).filter((k) => ['event_id', 'pet_id'].includes(k)), [])
  assertStrictEquals(rescued.writes[0].values.incident_type, 'vomit')

  const fresh = makeWorld({ contextFlags: ['ctx_flag'], vision: overloaded })
  await run(fresh)
  assertEquals(fresh.writes.map((x) => x.mode), ['upsert'])
  assertStrictEquals(fresh.row?.recommendation, 'worth_a_call')
})

Deno.test('pipeline CUL-2805 — a catch read with no version writes nothing, never an unconditional failure', async () => {
  const w = makeWorld({ row: { ...STORED_CALM }, vision: overloaded })
  // Step 3b's read keeps its version; the catch's (the second read) comes back without one.
  const real = w.row!
  let reads = 0
  const orig = Object.getOwnPropertyDescriptor(real, 'updated_at')!.value
  Object.defineProperty(real, 'updated_at', {
    configurable: true, enumerable: true,
    get: () => (++reads >= 2 ? null : orig),
    set: () => {},
  })
  const r = await run(w)
  assertStrictEquals(r.status, 500)
  assertEquals(w.writes, [])
  assertStrictEquals(real.status, 'completed')
})

// Adversarial pass 1 on CUL-2805: a miss that skipped dropped this run's computed escalation
// whenever the row moved WITHOUT escalating. A missed rescue now re-reads and decides again.
Deno.test('pipeline CUL-2805 — a row that moves without escalating in the rescue\'s gap still gets the rescue', async () => {
  const w = makeWorld({
    row: { ...STORED_CALM, may_wait: true },
    contextFlags: ['ctx_flag'], vision: overloaded, appConfig: EN3_FOR_OWNER,
    // A neighbour's run lowers this row's leave to wait: the version moves, the read does not.
    beforeAiWrite: (world, n) => { if (n === 1) commit(world, { may_wait: null }) },
  })
  const r = await run(w)
  assertStrictEquals(r.status, 500)
  assertStrictEquals(w.aiWriteAttempts, 2)
  assertStrictEquals(w.row?.recommendation, 'worth_a_call')
  assertStrictEquals(w.row?.tier, 'call_today')
  assertStrictEquals(w.row?.status, 'failed')
  assertStrictEquals(w.row?.read_text, 'CONTEXTUAL:Mochi:ctx_flag')
})

Deno.test('pipeline CUL-2805 — an owner\'s edit in the rescue\'s gap keeps its fields and the rescue still lands', async () => {
  const w = makeWorld({
    row: { ...STORED_CALM },
    contextFlags: ['ctx_flag'], vision: overloaded,
    beforeAiWrite: (world, n) => { if (n === 1) commit(world, { colour: 'green', edited_at: EDITED_AT }) },
  })
  await run(w)
  assertStrictEquals(w.row?.recommendation, 'worth_a_call')
  assertStrictEquals(w.row?.colour, 'green')
  assertStrictEquals(w.row?.edited_at, EDITED_AT)
})

Deno.test('pipeline CUL-2805 — a sibling call now on the rescue\'s re-decision becomes the error-only note', async () => {
  const w = makeWorld({
    row: { ...STORED_CALM },
    contextFlags: ['ctx_flag'], vision: overloaded, appConfig: EN3_FOR_OWNER,
    beforeAiWrite: (world, n) => { if (n === 1) commit(world, SIBLING_CALL_NOW) },
  })
  await run(w)
  // Missed once, re-read, saw the call now: the note only, held nothing over the sibling.
  assertEquals(w.writes.map((x) => Object.keys(x.values).sort()), [['error', 'may_wait']])
  assertStrictEquals(w.row?.tier, 'call_now')
  assertStrictEquals(w.row?.read_text, 'SIBLING CALL NOW')
})

Deno.test('pipeline CUL-2805 — a row that keeps moving under the rescue still gets it: the last try is held to its content, not its version', async () => {
  const w = makeWorld({
    row: { ...STORED_CALM },
    contextFlags: ['ctx_flag'], vision: overloaded, appConfig: EN3_FOR_OWNER,
    // The version moves under every held try AND under the last one: only a version-free
    // write can land here.
    beforeAiWrite: (world, n) => { if (n <= 4) commit(world, {}) },
  })
  await run(w)
  assertStrictEquals(w.aiWriteAttempts, 4)
  assertEquals(w.writes.map((x) => x.mode), ['update'])
  assertStrictEquals(w.row?.recommendation, 'worth_a_call')
  assertStrictEquals(w.row?.tier, 'call_today')
  assertStrictEquals(w.row?.status, 'failed')
})

Deno.test('pipeline CUL-2805 — the last try still decides over a fresh read: an escalation that landed is only noted', async () => {
  const w = makeWorld({
    row: { ...STORED_CALM },
    contextFlags: ['ctx_flag'], vision: overloaded, appConfig: EN3_FOR_OWNER,
    beforeAiWrite: (world, n) => {
      if (n <= 2) commit(world, {})
      if (n === 3) commit(world, SIBLING_CALL_NOW)
    },
  })
  await run(w)
  assertEquals(w.writes.map((x) => Object.keys(x.values).sort()), [['error', 'may_wait']])
  assertStrictEquals(w.row?.tier, 'call_now')
  assertStrictEquals(w.row?.read_text, 'SIBLING CALL NOW')
})

// ── CUL-2808: what a failed read still puts on the record ──────────────────────────────
// Two rules. (1) The red-flag columns the run's photo read found PRESENT reach an unedited
// row whatever the failure write decided: before, the rescue carried `visual_flags: ['blood']`
// beside a blood column still saying no, and the report read the column. (2) The rescue's
// last try lands only over a row that holds no call: before, it was unconditional, and a
// sibling's call now that landed in its round trip came back as this run's call today.

const moveVersionOnly = (upTo: number) => (world: World, n: number) => { if (n <= upTo) commit(world, {}) }

Deno.test('pipeline CUL-2808 — three missed writes of a blood read: the blood column says blood, not the older read\'s no', async () => {
  const w = makeWorld({ row: { ...STORED_CALM }, vision: () => BLOODY, beforeAiWrite: moveVersionOnly(3) })
  const r = await run(w)
  assertStrictEquals(r.status, 500)
  assertStrictEquals(w.row?.recommendation, 'worth_a_call')
  assertEquals(w.row?.visual_flags, ['blood'])
  assertStrictEquals(w.row?.blood_col, 'yes')
  // Presence only: nothing else of the run's read lands, and the payload an owner's edit is
  // diffed against is still the last finished read's.
  assertStrictEquals(w.row?.colour, 'yellow')
  assertEquals(w.row?.ai_raw_payload, STORED_CALM.ai_raw_payload)
  assertStrictEquals(w.row?.edited_at, null)
  assertEquals(structuredKeysWritten(w), ['blood_col', 'blood_note'])
})

Deno.test('pipeline CUL-2808 — a sibling\'s call for another reason on the last miss: the note is written and the blood still reaches the column', async () => {
  const w = makeWorld({
    row: { ...STORED_CALM },
    vision: () => BLOODY,
    beforeAiWrite: (world, n) => {
      if (n <= 2) commit(world, {})
      if (n === 3) commit(world, { recommendation: 'worth_a_call', read_text: 'SIBLING CTX', visual_flags: [], contextual_flags: ['ctx_flag'] })
    },
  })
  await run(w)
  assertStrictEquals(w.row?.read_text, 'SIBLING CTX')
  assertStrictEquals(typeof w.row?.error, 'string')
  assertStrictEquals(w.row?.blood_col, 'yes')
})

Deno.test('pipeline CUL-2808 — no race needed: one failed write of a blood read still puts blood in the column', async () => {
  const w = makeWorld({ row: { ...STORED_CALM }, vision: () => BLOODY, aiWriteError: (n) => n === 1 })
  const r = await run(w)
  assertStrictEquals(r.status, 500)
  assertEquals(w.row?.visual_flags, ['blood'])
  assertStrictEquals(w.row?.blood_col, 'yes')
})

Deno.test('pipeline CUL-2808 — a first read that fails its write leaves a row whose column says blood', async () => {
  const w = makeWorld({ vision: () => BLOODY, aiWriteError: (n) => n === 1 })
  await run(w)
  assertStrictEquals(w.row?.recommendation, 'worth_a_call')
  assertStrictEquals(w.row?.blood_col, 'yes')
  assertStrictEquals(w.row?.ai_raw_payload ?? null, null)
})

Deno.test('pipeline CUL-2808 — an owner\'s edit keeps its fields: the presence write never lands on an edited row', async () => {
  // The owner's "no blood" lands under the last held try. The call and the flags still land
  // (as a finished read's would over an edited row); the column is the owner's.
  const w = makeWorld({
    row: { ...STORED_CALM },
    vision: () => BLOODY,
    beforeAiWrite: (world, n) => {
      if (n <= 2) commit(world, {})
      if (n === 3) commit(world, { blood_col: 'no', colour: 'brown', edited_at: EDITED_AT })
    },
  })
  await run(w)
  assertStrictEquals(w.row?.recommendation, 'worth_a_call')
  assertEquals(w.row?.visual_flags, ['blood'])
  assertStrictEquals(w.row?.blood_col, 'no')
  assertStrictEquals(w.row?.colour, 'brown')
  assertEquals(structuredKeysWritten(w), [])
})

Deno.test('pipeline CUL-2808 — an owner\'s edit landing between the rescue and the presence write is not written over', async () => {
  // Write 1 fails, write 2 is the rescue, write 3 is the presence write. The edit commits as
  // write 3 arrives: the database's own edited_at check refuses it, with no read in between.
  const w = makeWorld({
    row: { ...STORED_CALM },
    vision: () => BLOODY,
    aiWriteError: (n) => n === 1,
    beforeAiWrite: (world, n) => { if (n === 3) commit(world, { blood_col: 'no', edited_at: EDITED_AT }) },
  })
  await run(w)
  assertStrictEquals(w.aiWriteAttempts, 3)
  assertStrictEquals(w.row?.blood_col, 'no')
  assertEquals(structuredKeysWritten(w), [])
})

Deno.test('pipeline CUL-2808 — absence is never carried: a clean read that fails its write names no column, over stored blood or none', async () => {
  for (const stored of ['yes', 'no', null]) {
    const w = makeWorld({ row: { ...STORED_CALM, blood_col: stored }, vision: () => CLEAN, aiWriteError: (n) => n === 1 })
    await run(w)
    assertStrictEquals(w.row?.blood_col, stored)
    assertEquals(structuredKeysWritten(w), [])
  }
})

Deno.test('pipeline CUL-2808 — a model failure has no photo read, so no column is written', async () => {
  const w = makeWorld({ row: { ...STORED_CALM }, contextFlags: ['ctx_flag'], vision: overloaded })
  await run(w)
  assertStrictEquals(w.row?.recommendation, 'worth_a_call')
  assertEquals(structuredKeysWritten(w), [])
})

Deno.test('pipeline CUL-2808 — a sibling\'s call now landing under the rescue\'s last try is not lowered to call today', async () => {
  const w = makeWorld({
    row: { ...STORED_CALM },
    contextFlags: ['ctx_flag'], vision: overloaded, appConfig: EN3_FOR_OWNER,
    beforeAiWrite: (world, n) => {
      if (n <= 3) commit(world, {})
      if (n === 4) commit(world, SIBLING_CALL_NOW)
    },
  })
  await run(w)
  assertStrictEquals(w.row?.tier, 'call_now')
  assertStrictEquals(w.row?.read_text, 'SIBLING CALL NOW')
  assertStrictEquals(w.row?.status, 'completed')
  // The catch looked again and noted the error over the call that stands.
  assertEquals(w.writes.map((x) => Object.keys(x.values).sort()), [['error', 'may_wait']])
})

Deno.test('pipeline CUL-2808 — a flag-off sibling call (a verdict, no tier) under the last try stands too', async () => {
  const w = makeWorld({
    row: { ...STORED_CALM },
    contextFlags: ['ctx_flag'], vision: overloaded,
    beforeAiWrite: (world, n) => {
      if (n <= 3) commit(world, {})
      if (n === 4) commit(world, { recommendation: 'worth_a_call', read_text: 'SIBLING CALL', status: 'completed' })
    },
  })
  await run(w)
  assertStrictEquals(w.row?.read_text, 'SIBLING CALL')
  assertStrictEquals(w.row?.status, 'completed')
})

Deno.test('pipeline CUL-2808 — a verdict this build cannot name under the last try is a call, and stands', async () => {
  const w = makeWorld({
    row: { ...STORED_CALM },
    contextFlags: ['ctx_flag'], vision: overloaded,
    beforeAiWrite: (world, n) => {
      if (n <= 3) commit(world, {})
      if (n === 4) commit(world, { recommendation: 'a_later_rule', read_text: 'LATER RULE', status: 'completed' })
    },
  })
  await run(w)
  assertStrictEquals(w.row?.recommendation, 'a_later_rule')
  assertStrictEquals(w.row?.read_text, 'LATER RULE')
})

Deno.test('pipeline CUL-2808 — a row with no verdict and no tier is quiet: the last try lands over it', async () => {
  const w = makeWorld({
    row: { status: 'failed', recommendation: null, tier: null, error: 'boom' },
    contextFlags: ['ctx_flag'], vision: overloaded, appConfig: EN3_FOR_OWNER,
    beforeAiWrite: moveVersionOnly(4),
  })
  await run(w)
  assertStrictEquals(w.row?.recommendation, 'worth_a_call')
  assertStrictEquals(w.row?.tier, 'call_today')
})

Deno.test('pipeline CUL-2808 — a stored refusal of leave to wait that lands under the last try is not written over', async () => {
  // The rescue's may_wait was worked out from the row it read (NULL). A sibling's FALSE, the
  // photo's own evidence, lands under the last try: the write misses, the catch reads again,
  // and the rescue that lands carries the FALSE.
  const w = makeWorld({
    row: { ...STORED_CALM },
    contextFlags: ['ctx_flag'], vision: overloaded, appConfig: EN3_FOR_OWNER,
    beforeAiWrite: (world, n) => {
      if (n <= 3) commit(world, {})
      if (n === 4) commit(world, { may_wait: false })
    },
  })
  await run(w)
  assertStrictEquals(w.aiWriteAttempts, 5)
  assertStrictEquals(w.row?.recommendation, 'worth_a_call')
  assertStrictEquals(w.row?.may_wait, false)
})

Deno.test('pipeline CUL-2808 — the content-held tries are bounded', async () => {
  // A row that reads quiet and refuses every write (its leave to wait flips under each one).
  // No production writer takes a stored FALSE back to NULL, so this sequence cannot occur;
  // it is here only to prove the loop ends whatever the row does.
  const w = makeWorld({
    row: { ...STORED_CALM },
    contextFlags: ['ctx_flag'], vision: overloaded, appConfig: EN3_FOR_OWNER,
    beforeAiWrite: (world, n) => commit(world, n <= 3 ? {} : { may_wait: world.row?.may_wait === false ? null : false }),
  })
  await run(w)
  assertStrictEquals(w.aiWriteAttempts, WRITE_ATTEMPTS * 2)
})

Deno.test('pipeline CUL-2808 — a call tier beside a verdict a client lowered is still a call under the last try', async () => {
  // The tier is frozen to clients and the verdict is not (CUL-1321): the tier filter alone
  // has to refuse this row.
  const w = makeWorld({
    row: { ...STORED_CALM },
    contextFlags: ['ctx_flag'], vision: overloaded, appConfig: EN3_FOR_OWNER,
    beforeAiWrite: (world, n) => {
      if (n <= 3) commit(world, {})
      if (n === 4) commit(world, { ...SIBLING_CALL_NOW, recommendation: 'monitor' })
    },
  })
  await run(w)
  assertStrictEquals(w.row?.tier, 'call_now')
  assertStrictEquals(w.row?.read_text, 'SIBLING CALL NOW')
})

// The quiet filters name every quiet value and nothing else, read off the shared rank
// functions rather than a second list (C-34): a tier or verdict added there reds this.
Deno.test('CUL-2808 — the quiet-row filters are exactly the values the shared ranks call quiet', () => {
  const [verdicts, tiers] = quieterRowFilters(TIER_RANK.call_today)
  assertEquals(verdicts, `recommendation.is.null,recommendation.in.(${QUIET_VERDICTS.join(',')})`)
  assertEquals(tiers, 'tier.is.null,tier.in.(logged,not_enough_to_say)')
  for (const v of QUIET_VERDICTS) assertStrictEquals(isEscalationVerdict(v), false)
})

// CUL-2811. The filters are an allowlist per column, so the proof is by evaluation, not by
// string: every value a row can hold in each column, the ones no build knows included, is
// let through exactly when the shared ranks put it BELOW the rescue's rank.
Deno.test('CUL-2811 — the content-held filters admit a row exactly when its call ranks below the rescue\'s', () => {
  // Every verdict a writer can store is on the known list (a tier's verdict is one of them).
  assertEquals(new Set(INCIDENT_TIERS.map(verdictForTier)), new Set<string>(KNOWN_VERDICTS))
  const verdicts = [null, ...KNOWN_VERDICTS, 'a_verdict_from_a_later_build']
  const tiers = [null, ...INCIDENT_TIERS, 'a_tier_from_a_later_build']
  for (const rank of [TIER_RANK.call_today, TIER_RANK.call_now]) {
    const [verdictFilter, tierFilter] = quieterRowFilters(rank).map((f) => splitTopLevel(f).map(parseOrTerm))
    for (const recommendation of verdicts) {
      for (const tier of tiers) {
        const row = { recommendation, tier }
        const admitted = verdictFilter.some((t) => t(row)) && tierFilter.some((t) => t(row))
        assertStrictEquals(admitted, effectiveTierRankOf(row) < rank, `rank ${rank} over ${recommendation}/${tier}`)
      }
    }
  }
  // A call now is admitted over a stored call today, in either column, and never over a call now.
  assertEquals(quieterRowFilters(TIER_RANK.call_now), [
    'recommendation.is.null,recommendation.in.(monitor,not_enough_to_say,worth_a_call)',
    'tier.is.null,tier.in.(call_today,logged,not_enough_to_say)',
  ])
})

Deno.test('CUL-2811 — a content-held write that claims no call lands over nothing, and sends nothing', async () => {
  let called = false
  const client = { from: () => { called = true; throw new Error('no request expected') } } as unknown as SupabaseClient
  const out = await applyFailureWrite(client, { eventId: 'evt-1', petId: 'pet-1' }, { mode: 'rescue', values: { recommendation: 'monitor' } }, { quieterThan: TIER_RANK.quiet, mayWait: null })
  assertEquals(out, { error: null, missed: true })
  assertStrictEquals(called, false)
})

// The fake above evaluates `is` and `or`; this pins the REQUEST the real client builds from
// the same calls, so the fake cannot be green over a filter PostgREST never receives (C-39).
// Both `or` groups must reach the URL (a second one that replaced the first would drop the
// verdict check), and NULL must be spelled `is.null`.
async function requestFor(call: (client: SupabaseClient) => Promise<unknown>): Promise<{ method: string; params: URLSearchParams; body: unknown }> {
  let seen: { method: string; params: URLSearchParams; body: unknown } | null = null
  const client = createClient('http://localhost:54321', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: ((input: Request | URL | string, init?: RequestInit) => {
        const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
        seen = { method: init?.method ?? 'GET', params: url.searchParams, body: init?.body ? JSON.parse(String(init.body)) : null }
        return Promise.resolve(new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }))
      }) as typeof fetch,
    },
  })
  await call(client as unknown as SupabaseClient)
  if (!seen) throw new Error('no request was made')
  return seen
}

Deno.test('CUL-2808 — the content-held rescue sends both quiet filters and the leave to wait it read', async () => {
  const write = { mode: 'rescue' as const, values: { event_id: 'evt-1', pet_id: 'pet-1', recommendation: 'worth_a_call', tier: 'call_today', may_wait: null } }
  const sent = await requestFor((c) => applyFailureWrite(c, { eventId: 'evt-1', petId: 'pet-1' }, write, { quieterThan: TIER_RANK.call_today, mayWait: null }))
  assertStrictEquals(sent.method, 'PATCH')
  assertEquals(sent.params.getAll('or'), [
    '(recommendation.is.null,recommendation.in.(monitor,not_enough_to_say))',
    '(tier.is.null,tier.in.(logged,not_enough_to_say))',
  ])
  assertStrictEquals(sent.params.get('event_id'), 'eq.evt-1')
  assertStrictEquals(sent.params.get('pet_id'), 'eq.pet-1')
  assertStrictEquals(sent.params.get('may_wait'), 'is.null')
  assertStrictEquals(sent.params.has('updated_at'), false)
  // The key columns are the filter, never values (pet_id is frozen on update, migration 074).
  assertEquals(Object.keys(sent.body as Row).sort(), ['may_wait', 'recommendation', 'tier'])

  const kept = await requestFor((c) => applyFailureWrite(c, { eventId: 'evt-1', petId: 'pet-1' }, { ...write, values: { ...write.values, may_wait: false } }, { quieterThan: TIER_RANK.call_today, mayWait: false }))
  assertStrictEquals(kept.params.get('may_wait'), 'eq.false')

  // Flag-off the rescue names no may_wait, so it holds to none.
  const { tier: _t, may_wait: _m, ...flagOff } = write.values
  const off = await requestFor((c) => applyFailureWrite(c, { eventId: 'evt-1', petId: 'pet-1' }, { mode: 'rescue', values: flagOff }, { quieterThan: TIER_RANK.call_today, mayWait: null }))
  assertStrictEquals(off.params.has('may_wait'), false)
  assertStrictEquals(off.params.getAll('or').length, 2)

  // CUL-2811: a call now asks for a row whose call is quieter than a call now.
  const now = await requestFor((c) => applyFailureWrite(c, { eventId: 'evt-1', petId: 'pet-1' }, { ...write, values: { ...write.values, tier: 'call_now' } }, { quieterThan: TIER_RANK.call_now, mayWait: true }))
  assertEquals(now.params.getAll('or'), [
    '(recommendation.is.null,recommendation.in.(monitor,not_enough_to_say,worth_a_call))',
    '(tier.is.null,tier.in.(call_today,logged,not_enough_to_say))',
  ])
  assertStrictEquals(now.params.get('may_wait'), 'eq.true')
})

// ── CUL-2811: a failed run's louder call replaces a quieter stored one ─────────────────
// Before: any stored call got the error note only, so a run that worked out call now (the
// record floor's minTier) and then failed left a stored call today standing.

const STORED_CALL_TODAY = {
  recommendation: 'worth_a_call', tier: 'call_today', status: 'completed', read_text: 'OLD CALL TODAY', edited_at: null,
  may_wait: true, blood_col: 'yes', colour: 'red', visual_flags: ['blood'], contextual_flags: ['stored_flag'], ai_raw_payload: { blood: 'yes', colour: 'red' },
  dismissed_at: '2026-09-26T07:00:00Z',
}
const CALL_NOW_RUN = { contextFlags: ['ctx_flag'] as Flag[], minTier: 'call_now' as const, vision: overloaded, appConfig: EN3_FOR_OWNER, photoFindingCopy: true }

Deno.test('pipeline CUL-2811 — a failed run that worked out call now writes it over a stored call today', async () => {
  const w = makeWorld({ row: { ...STORED_CALL_TODAY }, ...CALL_NOW_RUN })
  const r = await run(w)
  assertStrictEquals(r.status, 500)
  assertStrictEquals(w.row?.tier, 'call_now')
  assertStrictEquals(w.row?.recommendation, 'worth_a_call')
  // A call now never carries leave to wait, and words the owner has not seen clear the hide.
  assertStrictEquals(w.row?.may_wait, null)
  assertStrictEquals(w.row?.dismissed_at, null)
  // What the stored photo read found stays on the card: the cached flags are written back,
  // the stored contextual flag is kept beside this run's, and the words lead with the finding.
  assertEquals(w.row?.visual_flags, ['blood'])
  assertEquals(w.row?.contextual_flags, ['stored_flag', 'ctx_flag'])
  assertStrictEquals(w.row?.read_text, 'PHOTO_CTX:Mochi:stored_flag,ctx_flag:blood')
  // The photo read on the row finished, and still counts as one: the status stands, and the
  // error beside it is what the phone discloses the failed attempt from.
  assertStrictEquals(w.row?.status, 'completed')
  assertStrictEquals(typeof w.row?.error, 'string')
  // Read fields only: the stored finding stays on the columns Home and the report read.
  assertStrictEquals(w.row?.blood_col, 'yes')
  assertEquals(w.row?.ai_raw_payload, STORED_CALL_TODAY.ai_raw_payload)
  assertEquals(structuredKeysWritten(w), [])
})

Deno.test('pipeline CUL-2811 — a failed run that read the photo itself writes its own finding and words over the stored call today', async () => {
  // The write-back fails every time, so the catch holds this run's own post-floor read.
  const w = makeWorld({
    row: { ...STORED_CALL_TODAY, visual_flags: ['foreign_material'] }, ...CALL_NOW_RUN, vision: () => BLOODY,
    aiWriteError: (n) => n === 1, // the step-9 write
  })
  await run(w)
  assertStrictEquals(w.row?.tier, 'call_now')
  assertEquals(w.row?.visual_flags, ['blood'])
  assertStrictEquals(w.row?.read_text, 'PHOTO_CTX:Mochi:ctx_flag:blood')
  assertStrictEquals(w.row?.status, 'completed')
})

Deno.test('pipeline CUL-2811 — a call today landing under a call now rescue shaped for a quiet row is not written over blind', async () => {
  // The rescue was decided over a calm row, so it carries no photo finding. A sibling's call
  // today with blood lands under the last try: that write must miss (it would take the blood
  // off the card and mark the read failed), and the next decision, made over the call today,
  // keeps the finding.
  const w = makeWorld({
    row: { ...STORED_CALM }, ...CALL_NOW_RUN,
    beforeAiWrite: (world, n) => {
      if (n <= 3) commit(world, {})
      // Its leave to wait matches what the rescue read (none), so only the rank can refuse it.
      if (n === 4) commit(world, { ...STORED_CALL_TODAY, read_text: 'SIBLING CALL TODAY', contextual_flags: [], may_wait: null })
    },
  })
  await run(w)
  assertStrictEquals(w.row?.tier, 'call_now')
  assertEquals(w.row?.visual_flags, ['blood'])
  assertStrictEquals(w.row?.status, 'completed')
  assertStrictEquals(w.row?.read_text, 'PHOTO_CTX:Mochi:ctx_flag:blood')
})

Deno.test('pipeline CUL-2811 — a failed call today over a stored call today is still the note only', async () => {
  const w = makeWorld({ row: { ...STORED_CALL_TODAY }, ...CALL_NOW_RUN, minTier: 'call_today' })
  await run(w)
  assertEquals(w.writes.map((x) => Object.keys(x.values).sort()), [['error', 'may_wait']])
  assertStrictEquals(w.row?.tier, 'call_today')
  assertStrictEquals(w.row?.read_text, 'OLD CALL TODAY')
  assertStrictEquals(w.row?.status, 'completed')
})

Deno.test('pipeline CUL-2811 — with the key off the failed run carries no tier and a stored call today stands', async () => {
  const w = makeWorld({ row: { ...STORED_CALL_TODAY }, ...CALL_NOW_RUN, appConfig: [] })
  await run(w)
  assertStrictEquals(w.row?.tier, 'call_today')
  assertStrictEquals(w.row?.read_text, 'OLD CALL TODAY')
  assertStrictEquals(w.row?.status, 'completed')
})

Deno.test('pipeline CUL-2811 — a stored call today that keeps moving still takes the call now: the last try is held to "quieter than mine"', async () => {
  const w = makeWorld({
    row: { ...STORED_CALL_TODAY }, ...CALL_NOW_RUN,
    // The version moves under every held try and under the last one.
    beforeAiWrite: (world, n) => { if (n <= 4) commit(world, {}) },
  })
  await run(w)
  assertStrictEquals(w.aiWriteAttempts, 4)
  assertStrictEquals(w.row?.tier, 'call_now')
  assertEquals(w.row?.visual_flags, ['blood'])
})

Deno.test('pipeline CUL-2811 — a sibling\'s call now landing under the last try is not written over by this run\'s call now', async () => {
  const w = makeWorld({
    row: { ...STORED_CALL_TODAY }, ...CALL_NOW_RUN,
    beforeAiWrite: (world, n) => {
      if (n <= 3) commit(world, {})
      if (n === 4) commit(world, SIBLING_CALL_NOW)
    },
  })
  await run(w)
  assertStrictEquals(w.row?.tier, 'call_now')
  assertStrictEquals(w.row?.read_text, 'SIBLING CALL NOW')
  assertStrictEquals(w.row?.status, 'completed')
})

Deno.test('pipeline CUL-2811 — a verdict from a later build beside a call today tier is never written over', async () => {
  // It ranks as call now in the verdict column: the verdict allowlist alone has to refuse it.
  const w = makeWorld({
    row: { ...STORED_CALL_TODAY }, ...CALL_NOW_RUN,
    beforeAiWrite: (world, n) => {
      if (n <= 3) commit(world, {})
      if (n === 4) commit(world, { recommendation: 'a_verdict_from_a_later_build', read_text: 'LATER BUILD' })
    },
  })
  await run(w)
  assertStrictEquals(w.row?.recommendation, 'a_verdict_from_a_later_build')
  assertStrictEquals(w.row?.read_text, 'LATER BUILD')
})

Deno.test('CUL-2808 — the presence write is filtered on an unedited row, by the database', async () => {
  const sent = await requestFor((c) => writePresentRedFlags(c, { eventId: 'evt-1', petId: 'pet-1' }, presentRedFlagColumns(descriptorFor(makeWorld({ vision: () => CLEAN })), { blood_col: 'yes', colour: 'red' })))
  assertStrictEquals(sent.method, 'PATCH')
  assertStrictEquals(sent.params.get('edited_at'), 'is.null')
  assertStrictEquals(sent.params.get('event_id'), 'eq.evt-1')
  assertStrictEquals(sent.params.get('pet_id'), 'eq.pet-1')
  // Only where the row does not already hold the finding, NULL named on its own.
  assertEquals(sent.params.getAll('or'), ['(blood_col.is.null,blood_col.not.in.(yes,old))'])
  // The present column, what describes it and the hide's clear, and nothing else.
  assertEquals(sent.body, { blood_col: 'yes', blood_note: null, dismissed_at: null })
})

Deno.test('CUL-2808 — presentRedFlagColumns carries presence only, one red-flag column at a time', () => {
  const d = descriptorFor(makeWorld({ vision: () => CLEAN }))
  const pick = (run: Row | null) => presentRedFlagColumns(d, run).map((x) => ({ ...x }))
  assertEquals(pick({ blood_col: 'yes', blood_note: 'fresh', colour: 'red', ai_raw_payload: { blood: 'yes' } }), [
    { column: 'blood_col', presentValues: ['yes', 'old'], values: { blood_col: 'yes', blood_note: 'fresh' } },
  ])
  assertEquals(pick({ blood_col: 'yes', foreign_col: 'yes' }).map((x) => x.values), [
    { blood_col: 'yes', blood_note: null }, { foreign_col: 'yes' },
  ])
  // A description travels only with its finding: none present, none written.
  assertEquals(pick({ blood_col: 'no', blood_note: 'STALE', foreign_col: 'no' }), [])
  assertEquals(pick({ blood_col: 'no', colour: 'red' }), [])
  assertEquals(pick({ blood_col: null }), [])
  assertEquals(pick(null), [])
})

Deno.test('CUL-2808 — with nothing present the presence write sends nothing', async () => {
  let called = false
  const client = { from: () => { called = true; throw new Error('no request expected') } } as unknown as SupabaseClient
  assertEquals(await writePresentRedFlags(client, { eventId: 'evt-1', petId: 'pet-1' }, presentRedFlagColumns(descriptorFor(makeWorld({ vision: () => CLEAN })), null)), { error: null, landed: false })
  assertStrictEquals(called, false)
})

Deno.test('pipeline CUL-2808 — the presence write clears a hide: the owner has not seen this finding', async () => {
  // A hidden call raised for another reason. The blood read fails its write, the catch notes
  // the error (which keeps a hide), and the blood that lands is new to the owner.
  const w = makeWorld({
    row: { ...STORED_CALM, recommendation: 'worth_a_call', read_text: 'OLD CALL', contextual_flags: ['ctx_flag'], dismissed_at: '2026-09-26T08:10:00Z' },
    vision: () => BLOODY,
    aiWriteError: (n) => n === 1,
  })
  await run(w)
  assertStrictEquals(w.row?.read_text, 'OLD CALL')
  assertStrictEquals(w.row?.blood_col, 'yes')
  assertStrictEquals(w.row?.dismissed_at, null)
})

Deno.test('pipeline CUL-2808 — a failed clean read leaves a hide alone (no finding, no presence write)', async () => {
  const w = makeWorld({
    row: { ...STORED_CALM, recommendation: 'worth_a_call', read_text: 'OLD CALL', dismissed_at: '2026-09-26T08:10:00Z' },
    vision: () => CLEAN,
    aiWriteError: (n) => n === 1,
  })
  await run(w)
  assertStrictEquals(w.row?.dismissed_at, '2026-09-26T08:10:00Z')
})

// Adversarial pass 1 on CUL-2808: the presence write carried the red-flag column alone, so a
// stored description from an older read (a note the model wrote under 'unsure') became the
// words shown beside this run's finding, on the card, the report and Ask.
Deno.test('pipeline CUL-2808 — the finding takes its own description with it: an older read\'s note never stands beside it', async () => {
  const w = makeWorld({
    row: { ...STORED_CALM, blood_note: 'STALE NOTE FROM THE OLDER READ' },
    vision: () => ({ ...BLOODY, bloodNote: 'THIS RUN' }),
    aiWriteError: (n) => n === 1,
  })
  await run(w)
  assertStrictEquals(w.row?.blood_col, 'yes')
  assertStrictEquals(w.row?.blood_note, 'THIS RUN')
})

Deno.test('pipeline CUL-2808 — a finding with no description of its own clears the older one', async () => {
  const w = makeWorld({
    row: { ...STORED_CALM, blood_note: 'STALE NOTE FROM THE OLDER READ' },
    vision: () => BLOODY,
    aiWriteError: (n) => n === 1,
  })
  await run(w)
  assertStrictEquals(w.row?.blood_col, 'yes')
  assertStrictEquals(w.row?.blood_note, null)
})

Deno.test('pipeline CUL-2808 — a clean read that fails leaves the stored description alone', async () => {
  const w = makeWorld({
    row: { ...STORED_CALM, blood_col: 'yes', blood_note: 'STORED' },
    vision: () => CLEAN,
    aiWriteError: (n) => n === 1,
  })
  await run(w)
  assertStrictEquals(w.row?.blood_note, 'STORED')
})

Deno.test('pipeline CUL-2808 — a landed presence write takes back a leave to wait a sibling gave in the gap', async () => {
  // The run's write fails; a sibling's finished call today, with leave to wait, lands before
  // the catch reads. The catch notes the error over that call, and the blood that then lands
  // refuses the wait.
  const w = makeWorld({
    row: { ...STORED_CALM },
    vision: () => BLOODY,
    aiWriteError: (n) => n === 1,
    beforeAiWrite: (world, n) => {
      if (n === 3) commit(world, { may_wait: true })
    },
  })
  await run(w)
  assertStrictEquals(w.row?.blood_col, 'yes')
  assertStrictEquals(w.row?.may_wait === true, false)
})

// Adversarial pass 2 on CUL-2808: the presence write replaced a stored finding's kind and
// description with this run's, where a finished read that drops another stored flag keeps the
// stored columns whole. A dark, tarry stool became "blood, kind unread" on the vet report.
Deno.test('pipeline CUL-2808 — a finding the row already holds keeps its own kind and description', async () => {
  // Stored: old blood with its note, and foreign material. The run sees fresh blood and no
  // foreign material, then fails its write.
  const w = makeWorld({
    row: { ...STORED_CALM, recommendation: 'worth_a_call', blood_col: 'old', blood_note: 'STORED KIND', foreign_col: 'yes' },
    vision: () => ({ ...BLOODY, bloodNote: null, foreign: 'no' as const }),
    aiWriteError: (n) => n === 1,
  })
  await run(w)
  assertStrictEquals(w.row?.blood_col, 'old')
  assertStrictEquals(w.row?.blood_note, 'STORED KIND')
  assertStrictEquals(w.row?.foreign_col, 'yes')
  assertEquals(structuredKeysWritten(w), [])
})

Deno.test('pipeline CUL-2808 — two findings, one already on the row: only the new one is written', async () => {
  const w = makeWorld({
    row: { ...STORED_CALM, blood_col: 'old', blood_note: 'STORED KIND', foreign_col: 'no', dismissed_at: '2026-09-26T08:10:00Z' },
    vision: () => ({ ...BLOODY, foreign: 'yes' as const }),
    aiWriteError: (n) => n === 1,
  })
  await run(w)
  assertStrictEquals(w.row?.blood_col, 'old')
  assertStrictEquals(w.row?.blood_note, 'STORED KIND')
  assertStrictEquals(w.row?.foreign_col, 'yes')
  assertEquals(structuredKeysWritten(w), ['foreign_col'])
})

Deno.test('pipeline CUL-2808 — a finding the row already holds is not new: a hide stays where the failure write left it', async () => {
  const w = makeWorld({
    row: { ...STORED_CALM, recommendation: 'worth_a_call', read_text: 'OLD CALL', blood_col: 'yes', dismissed_at: '2026-09-26T08:10:00Z' },
    vision: () => BLOODY,
    aiWriteError: (n) => n === 1,
  })
  await run(w)
  assertStrictEquals(w.row?.dismissed_at, '2026-09-26T08:10:00Z')
})

Deno.test('pipeline CUL-2808 — a sibling writing the same finding under the presence write keeps its kind', async () => {
  // The catch's writes: 2 is the rescue, 3 the blood statement. The sibling's kind commits as
  // 3 arrives; the database's own filter refuses it.
  const w = makeWorld({
    row: { ...STORED_CALM },
    vision: () => BLOODY,
    aiWriteError: (n) => n === 1,
    beforeAiWrite: (world, n) => { if (n === 3) commit(world, { blood_col: 'old', blood_note: 'SIBLING KIND' }) },
  })
  await run(w)
  assertStrictEquals(w.row?.blood_col, 'old')
  assertStrictEquals(w.row?.blood_note, 'SIBLING KIND')
})
