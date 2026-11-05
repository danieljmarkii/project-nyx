// The smoke bake-off of the shipping AI-lead configuration (CUL-2306, Vet report v2 PR-26).
//
// Runs the SHIPPED code, unedited: `runAiLead` (aiLead/leadPipeline.ts) with the real
// `sendChecked` (aiLead/model.ts), the real prompts, models, verifier and checker decision.
// Only the I/O that touches a database is stood in for, the way leadPipeline.test.ts does it:
//   - readDraft: an empty draft row (no cached lead);
//   - runGate: allow (consent, flags and caps are the gate's job, not this test's);
//   - writeDraft: captured in memory.
// Every model call is also captured, so the raw first draft is kept beside what printed.
//
// Usage, from the repo root (the key is read from the environment, never written anywhere):
//   deno run -A docs/vet-report-v3-discovery/bakeoff/2026-11-05-smoke/harness.ts thin
//   deno run -A docs/vet-report-v3-discovery/bakeoff/2026-11-05-smoke/harness.ts writers 5
//   deno run -A docs/vet-report-v3-discovery/bakeoff/2026-11-05-smoke/harness.ts checker
import { assembleReport } from '../../../../supabase/functions/generate-report/report.ts'
import { juniper } from '../../../../supabase/functions/generate-report/v2Fixtures.testutil.ts'
import { buildLeadFacts, documentForLead, tableFromPayload, type LeadFactPayload, type LeadFacts } from '../../../../supabase/functions/generate-report/aiLead/facts.ts'
import { requestBody, sendChecked, ticketFor, type ModelResult } from '../../../../supabase/functions/generate-report/aiLead/model.ts'
import { checkerDecision, parseChecker, runAiLead, type LeadIO, type StoredVerdict } from '../../../../supabase/functions/generate-report/aiLead/leadPipeline.ts'
import { verifyLead, type LeadSentence } from '../../../../supabase/functions/generate-report/aiLead/verify.ts'

const HERE = new URL('./', import.meta.url)
const SET_DIR = new URL('../../../../supabase/functions/generate-report/aiLead/exhibits/adversarial/', import.meta.url)
const ROUND_FIXTURES = ['nyx-v2', 'r11', 'r11-jump', 'cooper', 'cooper-cat', 'bakeoff-nyx', 'h2']

const write = (rel: string, v: unknown) => Deno.writeTextFile(new URL(rel, HERE), `${JSON.stringify(v, null, 1)}\n`)
const readJson = async <T>(u: URL): Promise<T> => JSON.parse(await Deno.readTextFile(u)) as T

/** The thin-record fixture: Juniper, a brand new account's cat, built by the report code, at 4
 *  logged days and at 14 (THIN_RECORD_DAYS, the day-count boundary). Both print the scope line in
 *  the band's place (her one vomiting day cannot be measured by the ongoing check at any length),
 *  so the shipped pipeline must record not_eligible and make no model call. */
function thinFixtures(): Record<string, { days: number; facts: LeadFacts }> {
  const out: Record<string, { days: number; facts: LeadFacts }> = {}
  for (const days of [4, 14]) {
    const s = assembleReport(juniper(days))
    out[`thin-juniper-${days}d`] = {
      days,
      facts: buildLeadFacts(documentForLead(s), {
        petName: s.signalment.name, species: s.signalment.species,
        recordStart: s.scope.startDate, recordEnd: s.scope.endDate, includeLookNotes: false,
      }),
    }
  }
  return out
}

async function roundFixtures(): Promise<Record<string, LeadFactPayload>> {
  const out: Record<string, LeadFactPayload> = {}
  for (const n of ROUND_FIXTURES) out[n] = await readJson<LeadFactPayload>(new URL(`fixtures/${n}.json`, SET_DIR))
  const thin = await readJson<Record<string, { eligible: boolean; payload?: LeadFactPayload }>>(new URL('thin-record.json', HERE))
  for (const [n, f] of Object.entries(thin)) if (f.eligible && f.payload) out[n] = f.payload
  return out
}

/** The thin fixtures through the whole shipped pipeline: the outcome and the number of model calls. */
async function thinRuns() {
  const out = []
  for (const [name, f] of Object.entries(thinFixtures())) {
    if (f.facts.eligible) continue
    let calls = 0
    let stored: unknown = null
    const io: LeadIO = {
      readDraft: () => Promise.resolve({ found: true, text: null, verdict: null }),
      runGate: () => Promise.resolve({ allow: true }),
      send: (role, body, ticket, timeoutMs) => { calls++; return sendChecked(role, body, ticket, { timeoutMs }) },
      writeDraft: (text, verdict, model) => { stored = { text, verdict, model }; return Promise.resolve(true) },
      now: () => Date.now(),
    }
    const result = await runAiLead(io, f.facts, { leaveOut: false })
    out.push({ fixture: name, logged_days: f.days, result, model_calls: calls, stored })
    console.log(`${name}: ${result.outcome}, ${calls} model calls`)
  }
  return out
}

/** Bounded parallelism, so a rate limit does not turn into a run of timeouts. */
async function pool<T>(jobs: Array<() => Promise<T>>, n: number): Promise<T[]> {
  const out: T[] = new Array(jobs.length)
  let next = 0
  await Promise.all(Array.from({ length: n }, async () => {
    while (next < jobs.length) {
      const i = next++
      out[i] = await jobs[i]()
    }
  }))
  return out
}

interface Call { role: string; ok: boolean; reason: string | null; servedModel: string | null; json: unknown; ms: number }

async function oneDraft(name: string, n: number, payload: LeadFactPayload) {
  const calls: Call[] = []
  let stored: { text: string | null; verdict: StoredVerdict; model: string | null } | null = null
  const io: LeadIO = {
    readDraft: () => Promise.resolve({ found: true, text: null, verdict: null }),
    runGate: () => Promise.resolve({ allow: true }),
    send: async (role, body, ticket, timeoutMs) => {
      const t0 = Date.now()
      const r: ModelResult = await sendChecked(role, body, ticket, { timeoutMs })
      calls.push({ role, ok: r.ok, reason: r.ok ? null : r.reason, servedModel: r.servedModel, json: r.ok ? r.json : null, ms: Date.now() - t0 })
      return r
    },
    writeDraft: (text, verdict, model) => {
      stored = { text, verdict, model }
      return Promise.resolve(true)
    },
    now: () => Date.now(),
  }
  const t0 = Date.now()
  const result = await runAiLead(io, { eligible: true, payload, table: tableFromPayload(payload) }, { leaveOut: false })
  const rec = { fixture: name, n, result, stored, calls, wall_ms: Date.now() - t0 }
  await write(`out/${name}-${String(n).padStart(2, '0')}.json`, rec)
  console.log(`${name} #${n}: ${result.outcome}${'reason' in result && result.reason ? ` (${result.reason})` : ''} in ${rec.wall_ms} ms`)
  return rec
}

interface SetItem { id: string; fixture: string; hazard?: string; class?: string; level?: string; sentences: LeadSentence[]; expect: { verifier: string; checker: string } }

async function oneItem(kind: 'item' | 'control', it: SetItem, payload: LeadFactPayload) {
  const v = verifyLead(tableFromPayload(payload), { sentences: it.sentences })
  // Exactly the call leadPipeline.ts step 7 makes: the payload plus the draft, the checker role's
  // body, a minted ticket, the checker's 25 s budget.
  const ticket = ticketFor({ allow: true })
  const body = requestBody('checker', { ...payload, draft: { sentences: it.sentences } })
  const t0 = Date.now()
  const r = await sendChecked('checker', body, ticket, { timeoutMs: 25_000 })
  const cv = r.ok ? parseChecker(r.json) : null
  const decision = cv ? checkerDecision(cv) : null
  const rec = {
    kind, id: it.id, fixture: it.fixture, hazard: it.hazard ?? null, class: it.class ?? null, level: it.level ?? null, expect: it.expect,
    verifier_pass: v.pass, verifier_checks: [...new Set(v.errors.map((e) => e.check))],
    checker_ok: r.ok, checker_reason: r.ok ? null : r.reason, served_model: r.servedModel, checker: cv, decision, ms: Date.now() - t0,
  }
  console.log(`${kind} ${it.id}: verifier ${v.pass ? 'pass' : 'refuse'}, checker ${decision ?? `error ${rec.checker_reason}`}`)
  return rec
}

const [mode, arg] = Deno.args
if (mode === 'thin') {
  const thin = thinFixtures()
  const out: Record<string, unknown> = {}
  for (const [n, f] of Object.entries(thin)) out[n] = { logged_days: f.days, ...(f.facts.eligible ? { eligible: true, payload: f.facts.payload } : { eligible: false, reason: f.facts.reason }) }
  await write('thin-record.json', out)
  console.log(JSON.stringify(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, (v as { eligible: boolean }).eligible])), null, 1))
} else if (mode === 'writers') {
  const per = Number(arg ?? '5')
  const fx = await roundFixtures()
  await Deno.mkdir(new URL('out/', HERE), { recursive: true })
  const jobs = Object.entries(fx).flatMap(([name, p]) => Array.from({ length: per }, (_, i) => () => oneDraft(name, i + 1, p)))
  await pool(jobs, 6)
  await write('thin-runs.json', await thinRuns())
} else if (mode === 'checker') {
  const set = await readJson<{ items: SetItem[]; controls: SetItem[] }>(new URL('set.json', SET_DIR))
  const fx = await roundFixtures()
  const jobs = [
    ...set.items.map((it) => () => oneItem('item', it, fx[it.fixture])),
    ...set.controls.map((it) => () => oneItem('control', it, fx[it.fixture])),
  ]
  await write('checker-set.json', await pool(jobs, 6))
} else {
  console.error('usage: harness.ts thin | writers <n> | checker')
  Deno.exit(2)
}
