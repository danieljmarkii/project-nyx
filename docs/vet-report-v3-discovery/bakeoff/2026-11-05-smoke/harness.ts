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

/** No model call. Re-derives every posted number from the stored files with the SHIPPED code:
 *  the verifier re-run on every stored draft and set item, the checker decision re-derived from
 *  every stored checker verdict, the stop rule, and the judges' aggregation (higher level wins). */
async function score() {
  const fx = await roundFixtures()
  const runs: Array<{ fixture: string; n: number; result: { outcome: string; reason?: string }; stored: { verdict: StoredVerdict } | null; calls: Array<{ role: string; json: unknown }> }> = []
  for await (const e of Deno.readDir(new URL('out/', HERE))) runs.push(await readJson(new URL(`out/${e.name}`, HERE)))
  runs.sort((a, b) => a.fixture.localeCompare(b.fixture) || a.n - b.n)
  const firstDrafts = runs.map((r) => {
    const j = r.calls.find((c) => c.role === 'writer')?.json as { sentences?: LeadSentence[] } | undefined
    return j?.sentences ? verifyLead(tableFromPayload(fx[r.fixture]), { sentences: j.sentences }).pass : null
  })
  const printed = runs.filter((r) => r.result.outcome === 'printed')
  const reprint = printed.map((r) => ({
    run: `${r.fixture}#${r.n}`,
    verifier_pass: verifyLead(tableFromPayload(fx[r.fixture]), { sentences: r.stored!.verdict.sentences! }).pass,
    checker_decision: checkerDecision(r.stored!.verdict.checker!),
  }))
  const outcomes: Record<string, number> = {}
  for (const r of runs) {
    const k = `${r.result.outcome}${r.result.reason ? `:${r.result.reason}` : ''}`
    outcomes[k] = (outcomes[k] ?? 0) + 1
  }
  const thin = await readJson<Array<{ fixture: string; result: { outcome: string }; model_calls: number }>>(new URL('thin-runs.json', HERE))

  const setRuns = await readJson<Array<{ kind: string; id: string; hazard: string | null; expect: { verifier: string }; checker: Parameters<typeof checkerDecision>[0] | null; decision: string | null }>>(new URL('checker-set.json', HERE))
  const set = await readJson<{ items: SetItem[]; controls: SetItem[] }>(new URL('set.json', SET_DIR))
  const byId = new Map([...set.items, ...set.controls].map((i) => [i.id, i]))
  const setScore = setRuns.map((r) => ({
    kind: r.kind, id: r.id, hazard: r.hazard,
    verifier_pass: verifyLead(tableFromPayload(fx[byId.get(r.id)!.fixture]), { sentences: byId.get(r.id)!.sentences }).pass,
    decision: r.checker ? checkerDecision(r.checker) : 'error',
    recorded: r.decision,
  }))
  const tally = (kind: string) => {
    const t: Record<string, number> = {}
    for (const s of setScore.filter((x) => x.kind === kind)) t[s.decision] = (t[s.decision] ?? 0) + 1
    return t
  }
  const stop2 = setScore.filter((s) => s.kind === 'item' && s.decision !== 'reject' && s.decision !== 'repair').map((s) => s.id)
  const stop3 = setScore.filter((s) => s.kind === 'item' && byId.get(s.id)!.expect.verifier === 'refuse' && s.verifier_pass).map((s) => s.id)

  // The judges, blind, unblinded by the key. Higher level wins per hazard.
  const rank: Record<string, number> = { none: 0, 'n/a': 0, minor: 1, material: 2 }
  const key = await readJson<Record<string, { src: string; arm: string; fixture: string }>>(new URL('blind-key.json', HERE))
  type Sheet = { summary_id: string; judge: string; hazards: Record<string, { level: string; quote: string }>; usefulness: number }
  const sheets: Sheet[] = [
    ...await readJson<Sheet[]>(new URL('blind/judge-chen.json', HERE)),
    ...await readJson<Sheet[]>(new URL('blind/judge-skeptic.json', HERE)),
  ]
  const judged = Object.entries(key).map(([sid, k]) => {
    const mine = sheets.filter((s) => s.summary_id === sid)
    const levels: Record<string, string> = {}
    for (const h of ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7']) {
      const top = mine.map((s) => s.hazards[h]?.level ?? 'none').sort((a, b) => rank[b] - rank[a])[0] ?? 'none'
      levels[h] = top
    }
    const hits = mine.flatMap((s) => Object.entries(s.hazards).filter(([, f]) => rank[f.level] > 0).map(([h, f]) => ({ judge: s.judge, hazard: h, level: f.level, quote: f.quote })))
    return { sid, ...k, judges: mine.length, levels, usefulness: mine.map((s) => s.usefulness), hits }
  })
  const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null }
  const arm = (a: string) => judged.filter((j) => j.arm === a)
  const anyAt = (j: typeof judged[number], l: string) => Object.values(j.levels).some((x) => x === l)
  const ai = arm('AI'), A = arm('A')
  const stop1 = ai.filter((j) => j.levels.H7 === 'material' || j.levels.H4 === 'material').map((j) => j.src)
  const c1 = ai.filter((j) => anyAt(j, 'material')).length === 0
  const minorShare = (xs: typeof judged) => xs.length ? xs.filter((j) => anyAt(j, 'minor')).length / xs.length : 0
  const c2 = minorShare(ai) <= minorShare(A)
  const medAI = median(ai.flatMap((j) => j.usefulness)), medA = median(A.flatMap((j) => j.usefulness))
  const c3 = medAI !== null && medA !== null && medAI >= medA + 0.5
  const c4 = ai.filter((j) => anyAt(j, 'material')).length === 0 // every printed lead passed the checker
  const thinOk = thin.every((t) => t.result.outcome === 'not_eligible' && t.model_calls === 0)
  const stops = { stop1, stop2, stop3 }
  const pass = stop1.length === 0 && stop2.length === 0 && stop3.length === 0 && c1 && c2 && c3 && c4 && thinOk
  return {
    verdict: pass ? 'PASS' : 'FAIL',
    stops,
    spec12: { c1_zero_material: c1, c2_minor_share: { ai: minorShare(ai), a: minorShare(A), holds: c2 }, c3_usefulness: { ai: medAI, a: medA, holds: c3 }, c4_checker_passed_no_material: c4 },
    thin: { ok: thinOk, runs: thin.map((t) => ({ fixture: t.fixture, outcome: t.result.outcome, model_calls: t.model_calls })) },
    writers: { runs: runs.length, outcomes, printed: reprint, first_draft_verifier_pass: firstDrafts.filter((x) => x === true).length },
    set: { items: tally('item'), controls: tally('control'), recorded_matches_rederived: setScore.every((s) => s.recorded === s.decision || (s.recorded === null && s.decision === 'error')) },
    judged,
  }
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
} else if (mode === 'score') {
  await write('score.json', await score())
  console.log(await Deno.readTextFile(new URL('score.json', HERE)))
} else {
  console.error('usage: harness.ts thin | writers <n> | checker | score')
  Deno.exit(2)
}
