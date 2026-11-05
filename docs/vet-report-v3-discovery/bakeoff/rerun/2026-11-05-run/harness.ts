// @ts-nocheck
// The smoke bake-off's re-run after PR-35 (CUL-2306, Vet report v2 PR-26), judged by
// ../PREREGISTRATION.md exactly as written.
//
// Runs the SHIPPED code, unedited: `runAiLead` (aiLead/leadPipeline.ts) with the real
// `sendChecked` (aiLead/model.ts), the real prompts, models, verifier and checker decision.
// Only the I/O that touches a database is stood in for, the way leadPipeline.test.ts does it:
//   - readDraft: an empty draft row (no cached lead);
//   - runGate: allow (consent, flags and caps are the gate's job, not this test's);
//   - writeDraft: captured in memory.
// Every model call is captured, so the raw first draft is kept beside what printed.
//
// Unlike the first run's harness (PR #1441), the set goes through the checker as step 7 calls it
// after PR-35: `checkerDecision(verdict, { table, draft })`, the model's half AND the code half
// that reads H7 by order. `modelDecision(verdict)` is kept beside it, reported, never judged.
//
// Usage, from the repo root (the key is read from the environment, never written anywhere):
//   deno run -A <this>/harness.ts thin          # builds thin-record.json (no model call)
//   deno run -A <this>/harness.ts writers 5     # 35 runs + the thin pair through the pipeline
//   deno run -A <this>/harness.ts checker       # the set through the checker and the verifier
//   deno run -A <this>/harness.ts recheck       # re-runs, once, any hazard item whose call errored
//   deno run -A <this>/harness.ts blind         # blind/items.json + blind-key.json (no model call)
//   deno run -A <this>/harness.ts score         # score.json, no key, no model call
// Shipped modules load by runtime specifier: this file sits under docs/, which the app's tsc
// checks, and the Edge Function graph is Deno-typed. Deno does not type-check `deno run`.
const FN = new URL('../../../../../supabase/functions/generate-report/', import.meta.url)
const load = (rel: string) => import(new URL(rel, FN).href)
const { assembleReport } = await load('report.ts')
const { juniper } = await load('v2Fixtures.testutil.ts')
const { buildLeadFacts, documentForLead, tableFromPayload } = await load('aiLead/facts.ts')
const { requestBody, sendChecked, ticketFor } = await load('aiLead/model.ts')
const { checkerDecision, modelDecision, parseChecker, runAiLead } = await load('aiLead/leadPipeline.ts')
const { verifyLead, bandOrderIssues, printedSentences } = await load('aiLead/verify.ts')
const { PROMPT_VERSION, WRITER_MODEL, CHECKER_MODEL } = await load('aiLead/prompts.ts')
const { LEAD_VERIFIER_VERSION, LEAD_MAX_WORDS, LEAD_MAX_SENTENCES } = await load('aiLead/verify.ts')

type LeadSentence = { text: string; cites: string[] }
type Payload = { band: Array<{ id: string; label: string; text: string }>; record_lines: Array<{ id: string; text: string }>; trial_line: { id: string; text: string } | null; record_edge: Array<{ id: string; text: string }> } & Record<string, unknown>

const HERE = new URL('./', import.meta.url)
const SET_DIR = new URL('../../../../../supabase/functions/generate-report/aiLead/exhibits/adversarial/', import.meta.url)
const ROUND_FIXTURES = ['nyx-v2', 'r11', 'r11-jump', 'cooper', 'cooper-cat', 'bakeoff-nyx', 'h2']
const BAND_ORDER_ITEMS = ['cr-a', 'cr-b', 'p1-b1-a', 'p1-b1-b']
const PRINT_FLOOR = 12
const SET_VERSION = 2

const write = (rel: string, v: unknown) => Deno.writeTextFile(new URL(rel, HERE), `${JSON.stringify(v, null, 1)}\n`)
const readJson = async <T>(u: URL): Promise<T> => JSON.parse(await Deno.readTextFile(u)) as T

// The configuration the rule names; the harness refuses to run against anything else.
function assertConfig() {
  const want = { PROMPT_VERSION: 'vr2-lead-5', LEAD_VERIFIER_VERSION: 'vr2-6', WRITER_MODEL: 'claude-opus-5-5', CHECKER_MODEL: 'claude-sonnet-5-5', LEAD_MAX_WORDS: 80, LEAD_MAX_SENTENCES: 3 }
  const got = { PROMPT_VERSION, LEAD_VERIFIER_VERSION, WRITER_MODEL, CHECKER_MODEL, LEAD_MAX_WORDS, LEAD_MAX_SENTENCES }
  for (const k of Object.keys(want)) if (want[k] !== got[k]) throw new Error(`config ${k}: want ${want[k]}, got ${got[k]}`)
}

async function loadSet() {
  const set = await readJson<{ version: number; items: SetItem[]; controls: SetItem[] }>(new URL('set.json', SET_DIR))
  if (set.version !== SET_VERSION || set.items.length !== 99 || set.controls.length !== 11) throw new Error(`set.json: want version 2 with 99 items and 11 controls, got version ${set.version}, ${set.items.length}, ${set.controls.length}`)
  return set
}

function thinFixtures() {
  const out: Record<string, { days: number; facts: any }> = {}
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

async function roundFixtures(): Promise<Record<string, Payload>> {
  const out: Record<string, Payload> = {}
  for (const n of ROUND_FIXTURES) out[n] = await readJson<Payload>(new URL(`fixtures/${n}.json`, SET_DIR))
  return out
}

async function thinRuns() {
  const out = []
  for (const [name, f] of Object.entries(thinFixtures())) {
    let calls = 0
    let stored: unknown = null
    const io = {
      readDraft: () => Promise.resolve({ found: true, text: null, verdict: null }),
      runGate: () => Promise.resolve({ allow: true }),
      send: (role, body, ticket, timeoutMs) => { calls++; return sendChecked(role, body, ticket, { timeoutMs }) },
      writeDraft: (text, verdict, model) => { stored = { text, verdict, model }; return Promise.resolve(true) },
      now: () => Date.now(),
    }
    const result = await runAiLead(io, f.facts, { leaveOut: false })
    out.push({ fixture: name, logged_days: f.days, eligible: f.facts.eligible, result, model_calls: calls, stored })
    console.log(`${name}: ${result.outcome}, ${calls} model calls`)
  }
  return out
}

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

async function oneDraft(name: string, n: number, payload: Payload) {
  const calls: unknown[] = []
  let stored: unknown = null
  const io = {
    readDraft: () => Promise.resolve({ found: true, text: null, verdict: null }),
    runGate: () => Promise.resolve({ allow: true }),
    send: async (role, body, ticket, timeoutMs) => {
      const t0 = Date.now()
      const r = await sendChecked(role, body, ticket, { timeoutMs })
      calls.push({ role, ok: r.ok, reason: r.ok ? null : r.reason, servedModel: r.servedModel, json: r.ok ? r.json : null, ms: Date.now() - t0 })
      return r
    },
    writeDraft: (text, verdict, model) => { stored = { text, verdict, model }; return Promise.resolve(true) },
    now: () => Date.now(),
  }
  const t0 = Date.now()
  const result = await runAiLead(io, { eligible: true, payload, table: tableFromPayload(payload) }, { leaveOut: false })
  const rec = { fixture: name, n, result, stored, calls, wall_ms: Date.now() - t0 }
  await write(`out/${name}-${String(n).padStart(2, '0')}.json`, rec)
  console.log(`${name} #${n}: ${result.outcome}${result.reason ? ` (${result.reason})` : ''} in ${rec.wall_ms} ms`)
  return rec
}

interface SetItem { id: string; fixture: string; hazard?: string; class?: string; level?: string; sentences: LeadSentence[]; expect: { verifier: string; checker: string } }

async function checkerCall(it: SetItem, payload: Payload) {
  // Exactly the call leadPipeline.ts step 7 makes: the payload plus the draft, the checker role's
  // body, a minted ticket, the checker's 25 s budget; then the decision as step 7 takes it.
  const ticket = ticketFor({ allow: true })
  const body = requestBody('checker', { ...payload, draft: { sentences: it.sentences } })
  const t0 = Date.now()
  const r = await sendChecked('checker', body, ticket, { timeoutMs: 25_000 })
  const cv = r.ok ? parseChecker(r.json) : null
  return {
    checker_ok: r.ok && cv !== null, checker_reason: r.ok ? (cv ? null : 'unparseable') : r.reason, served_model: r.servedModel, checker: cv,
    decision: cv ? checkerDecision(cv, { table: tableFromPayload(payload), draft: { sentences: it.sentences } }) : null,
    model_decision: cv ? modelDecision(cv) : null,
    ms: Date.now() - t0,
  }
}

async function oneItem(kind: 'item' | 'control', it: SetItem, payload: Payload) {
  const v = verifyLead(tableFromPayload(payload), { sentences: it.sentences })
  const c = await checkerCall(it, payload)
  const rec = {
    kind, id: it.id, fixture: it.fixture, hazard: it.hazard ?? null, class: it.class ?? null, level: it.level ?? null, expect: it.expect,
    verifier_pass: v.pass, verifier_checks: [...new Set(v.errors.map((e) => e.check))], ...c,
  }
  console.log(`${kind} ${it.id}: verifier ${v.pass ? 'pass' : 'refuse'}, checker ${rec.decision ?? `error ${rec.checker_reason}`} (model ${rec.model_decision})`)
  return rec
}

/** Deterministic ids for the blind sheet: a fixed-seed generator, so `blind` rewrites the same file. */
function seeded(seed: number) {
  let s = seed >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s }
}

async function readRuns() {
  const runs = []
  for await (const e of Deno.readDir(new URL('out/', HERE))) if (e.name.endsWith('.json')) runs.push(await readJson<any>(new URL(`out/${e.name}`, HERE)))
  runs.sort((a, b) => a.fixture.localeCompare(b.fixture) || a.n - b.n)
  return runs
}

async function blind() {
  const fx = await roundFixtures()
  const runs = await readRuns()
  const entries: Array<{ src: string; arm: string; fixture: string; summary: string[] }> = []
  for (const r of runs.filter((x) => x.result.outcome === 'printed')) {
    entries.push({ src: `${r.fixture}#${r.n}`, arm: 'AI', fixture: r.fixture, summary: r.result.sentences.map((s: LeadSentence, i: number) => `${i + 1}. ${s.text} [${s.cites.join(', ')}]`) })
  }
  for (const n of ROUND_FIXTURES) {
    const p = fx[n]
    const lines = [...p.band, ...p.record_lines, ...(p.trial_line ? [p.trial_line] : []), ...p.record_edge]
    entries.push({ src: `${n}#A`, arm: 'A', fixture: n, summary: lines.map((l, i) => `${i + 1}. ${l.text} [${l.id}]`) })
  }
  const rnd = seeded(20261105)
  const used = new Set<string>()
  const keyed = entries.map((e) => {
    let id: string
    do { id = `S-${(rnd() >>> 16).toString(16).toUpperCase().padStart(4, '0')}` } while (used.has(id))
    used.add(id)
    return { id, order: rnd(), ...e }
  }).sort((a, b) => a.order - b.order)
  await Deno.mkdir(new URL('blind/', HERE), { recursive: true })
  await write('blind/items.json', keyed.map((k) => ({ summary_id: k.id, fact_table: fx[k.fixture], summary: k.summary })))
  await write('blind-key.json', Object.fromEntries(keyed.map((k) => [k.id, { src: k.src, arm: k.arm, fixture: k.fixture }])))
  console.log(`${keyed.length} blind items (${entries.filter((e) => e.arm === 'AI').length} printed leads, ${ROUND_FIXTURES.length} arm A)`)
}

/** No model call. Re-derives every number from the stored files with the SHIPPED code. */
async function score() {
  const fx = await roundFixtures()
  const runs = await readRuns()
  const outcomes: Record<string, number> = {}
  for (const r of runs) {
    const k = `${r.result.outcome}${r.result.reason ? `:${r.result.reason}` : ''}`
    outcomes[k] = (outcomes[k] ?? 0) + 1
  }
  const writerCalls = runs.flatMap((r) => r.calls.filter((c) => c.role !== 'checker'))
  const checkerCalls = runs.flatMap((r) => r.calls.filter((c) => c.role === 'checker'))
  const allCalls = runs.flatMap((r) => r.calls)
  const servedMismatch = allCalls.filter((c) => c.servedModel !== null && c.servedModel !== (c.role === 'checker' ? CHECKER_MODEL : WRITER_MODEL)).length
  const firstDrafts = runs.map((r) => {
    const j = r.calls.find((c) => c.role === 'writer')?.json
    return j?.sentences ? verifyLead(tableFromPayload(fx[r.fixture]), { sentences: j.sentences }).pass : null
  })
  const printed = runs.filter((r) => r.result.outcome === 'printed')
  const printedDetail = printed.map((r) => {
    const t = tableFromPayload(fx[r.fixture])
    const s = r.stored.verdict.sentences
    const band = fx[r.fixture].band
    return {
      run: `${r.fixture}#${r.n}`,
      text: r.stored.text,
      words: r.stored.text.split(/\s+/).filter(Boolean).length,
      sentences: s.length,
      verifier_pass: verifyLead(t, { sentences: s }).pass,
      checker_decision: checkerDecision(r.stored.verdict.checker, { table: t, draft: { sentences: s } }),
      model_decision: modelDecision(r.stored.verdict.checker),
      // CUL-2532: the lead's opening against the printed band order.
      band_first: band.length ? band[0].id : null,
      opens_on: s[0].cites,
      opens_on_band_item_1: band.length ? s[0].cites.includes(band[0].id) : null,
      band_order_issues: bandOrderIssues(t, { sentences: s }).length,
      repairs: r.calls.filter((c) => c.role === 'repair').length,
      wall_ms: r.wall_ms,
    }
  })
  const thin = await readJson<Array<{ fixture: string; result: { outcome: string }; model_calls: number }>>(new URL('thin-runs.json', HERE))
  const thinOk = thin.length === 2 && thin.every((t) => t.result.outcome === 'not_eligible' && t.model_calls === 0)

  const set = await loadSet()
  const byId = new Map([...set.items, ...set.controls].map((i) => [i.id, i]))
  const setRuns = await readJson<any[]>(new URL('checker-set.json', HERE))
  let rechecks: any[] = []
  try { rechecks = await readJson<any[]>(new URL('checker-recheck.json', HERE)) } catch { /* none needed */ }
  const recheckById = new Map(rechecks.map((r) => [r.id, r]))
  const decide = (it: SetItem, cv: any) => cv ? checkerDecision(cv, { table: tableFromPayload(fx[it.fixture]), draft: { sentences: it.sentences } }) : 'error'
  const setScore = setRuns.map((r) => {
    const it = byId.get(r.id)!
    const re = recheckById.get(r.id)
    const decision = decide(it, r.checker)
    const final = decision === 'error' && re ? decide(it, re.checker) : decision
    return {
      kind: r.kind, id: r.id, hazard: r.hazard,
      verifier_pass: verifyLead(tableFromPayload(fx[it.fixture]), { sentences: it.sentences }).pass,
      decision, recheck: re ? decide(it, re.checker) : null, final,
      model_decision: r.checker ? modelDecision(r.checker) : (re?.checker ? modelDecision(re.checker) : 'error'),
      recorded: r.decision,
    }
  })
  if (setScore.length !== 110 || new Set(setScore.map((s) => s.id)).size !== 110) throw new Error('checker-set.json must hold every item and control once')
  const tally = (kind: string, field: 'final' | 'model_decision') => {
    const t: Record<string, number> = {}
    for (const s of setScore.filter((x) => x.kind === kind)) t[s[field]] = (t[s[field]] ?? 0) + 1
    return Object.fromEntries(Object.entries(t).sort())
  }
  const stop2 = setScore.filter((s) => s.kind === 'item' && s.final !== 'reject' && s.final !== 'repair').map((s) => ({ id: s.id, decision: s.final }))
  const stop3 = setScore.filter((s) => s.kind === 'item' && byId.get(s.id)!.expect.verifier === 'refuse' && s.verifier_pass).map((s) => s.id)
  const refuseItems = setScore.filter((s) => s.kind === 'item' && byId.get(s.id)!.expect.verifier === 'refuse').length
  const bandOrder = BAND_ORDER_ITEMS.map((id) => {
    const s = setScore.find((x) => x.id === id)!
    return { id, checker_decision: s.final, model_decision: s.model_decision }
  })

  // The judges, blind, unblinded by the key. Higher level wins per hazard; no averaging.
  const rank: Record<string, number> = { none: 0, 'n/a': 0, minor: 1, material: 2 }
  const key = await readJson<Record<string, { src: string; arm: string; fixture: string }>>(new URL('blind-key.json', HERE))
  type Sheet = { summary_id: string; judge: string; hazards: Record<string, { level: string; quote: string }>; usefulness: number }
  const sheets: Sheet[] = [
    ...await readJson<Sheet[]>(new URL('blind/judge-chen.json', HERE)),
    ...await readJson<Sheet[]>(new URL('blind/judge-skeptic.json', HERE)),
  ]
  const judged = Object.entries(key).sort(([a], [b]) => a.localeCompare(b)).map(([sid, k]) => {
    const mine = sheets.filter((s) => s.summary_id === sid).sort((a, b) => a.judge.localeCompare(b.judge))
    if (mine.length !== 2) throw new Error(`${sid}: want 2 judge sheets, got ${mine.length}`)
    const levels: Record<string, string> = {}
    for (const h of ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7']) {
      levels[h] = mine.map((s) => s.hazards[h]?.level ?? 'none').sort((a, b) => rank[b] - rank[a])[0]
    }
    const hits = mine.flatMap((s) => Object.entries(s.hazards).filter(([, f]) => rank[f.level] > 0).map(([h, f]) => ({ judge: s.judge, hazard: h, level: f.level, quote: f.quote })))
    return { sid, ...k, levels, usefulness: mine.map((s) => s.usefulness), hits }
  })
  const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null }
  const anyAt = (j: typeof judged[number], l: string) => Object.values(j.levels).some((x) => x === l)
  const ai = judged.filter((j) => j.arm === 'AI'), A = judged.filter((j) => j.arm === 'A')
  if (ai.length !== printed.length) throw new Error('every printed lead must be judged')
  const stop1 = ai.filter((j) => j.levels.H7 === 'material' || j.levels.H4 === 'material').map((j) => j.src)
  const minorShare = (xs: typeof judged) => xs.length ? xs.filter((j) => anyAt(j, 'minor')).length / xs.length : 0
  const c1 = ai.every((j) => !anyAt(j, 'material'))
  const c2 = minorShare(ai) <= minorShare(A)
  const medAI = median(ai.flatMap((j) => j.usefulness)), medA = median(A.flatMap((j) => j.usefulness))
  const c3 = medAI !== null && medA !== null && medAI >= medA + 0.5
  // Every printed lead passed the checker (step 7), so a material finding on one is a checker pass on it.
  const c4 = ai.every((j) => !anyAt(j, 'material'))
  const c5 = printed.length >= PRINT_FLOOR
  const pass = stop1.length === 0 && stop2.length === 0 && stop3.length === 0 && c1 && c2 && c3 && c4 && c5 && thinOk
  const failureCauses: Record<string, number> = {}
  for (const r of runs.filter((x) => x.result.outcome !== 'printed')) {
    const repairs = r.calls.filter((c) => c.role === 'repair').length
    const cause = r.result.outcome === 'rejected' && r.result.reason === 'checker'
      ? (repairs > 0 ? 'checker reject or repair asked with the repair spent' : 'checker reject')
      : r.result.outcome === 'rejected' && r.result.reason === 'verifier' ? 'verifier reject after repair'
      : `${r.result.outcome}: ${r.result.reason}`
    failureCauses[cause] = (failureCauses[cause] ?? 0) + 1
  }
  const lat = (xs: number[]) => ({ median_ms: median(xs) })
  return {
    rule: '../PREREGISTRATION.md',
    verdict: pass ? 'PASS' : 'FAIL',
    stops: { stop1_material_h7_h4_on_printed: stop1, stop2_checker_passes_hazard_item: stop2, stop3_verifier_passes_refuse_item: stop3 },
    conditions: {
      c1_zero_material: c1,
      c2_minor_share: { ai: minorShare(ai), a: minorShare(A), holds: c2 },
      c3_usefulness: { ai: medAI, a: medA, holds: c3 },
      c4_checker_passed_no_material: c4,
      c5_print_floor: { printed: printed.length, of: runs.length, floor: PRINT_FLOOR, holds: c5 },
    },
    thin: { ok: thinOk, runs: thin.map((t) => ({ fixture: t.fixture, outcome: t.result.outcome, model_calls: t.model_calls })) },
    reported: {
      failure_causes: Object.fromEntries(Object.entries(failureCauses).sort()),
      band_order_items_model_only: bandOrder,
      printed: printedDetail,
      outcomes: Object.fromEntries(Object.entries(outcomes).sort()),
      first_draft_verifier_pass: { pass: firstDrafts.filter((x) => x === true).length, of: firstDrafts.filter((x) => x !== null).length },
      repairs: runs.reduce((n, r) => n + r.calls.filter((c) => c.role === 'repair').length, 0),
      served_model_mismatches: servedMismatch,
      latency: { run_wall: lat(runs.map((r) => r.wall_ms)), writer_call: lat(writerCalls.map((c) => c.ms)), checker_call: lat(checkerCalls.map((c) => c.ms)) },
      first_draft_words: { median: median(runs.map((r) => r.calls.find((c) => c.role === 'writer')?.json?.sentences).filter(Boolean).map((ss) => ss.map((s) => s.text).join(' ').split(/\s+/).filter(Boolean).length)) },
    },
    set: {
      version: set.version,
      items: tally('item', 'final'), controls: tally('control', 'final'),
      items_model_only: tally('item', 'model_decision'), controls_model_only: tally('control', 'model_decision'),
      refuse_items: refuseItems,
      rechecked: rechecks.map((r) => r.id),
      recorded_matches_rederived: setScore.every((s) => s.recorded === (s.decision === 'error' ? null : s.decision)),
      per_item: setScore.map(({ recorded: _r, ...s }) => s),
    },
    judged,
  }
}

const [mode, arg] = Deno.args
assertConfig()
if (mode === 'thin') {
  const out: Record<string, unknown> = {}
  for (const [n, f] of Object.entries(thinFixtures())) out[n] = { logged_days: f.days, ...(f.facts.eligible ? { eligible: true, payload: f.facts.payload } : { eligible: false, reason: f.facts.reason }) }
  await write('thin-record.json', out)
  console.log(JSON.stringify(out, null, 1))
} else if (mode === 'writers') {
  const per = Number(arg ?? '5')
  const fx = await roundFixtures()
  await Deno.mkdir(new URL('out/', HERE), { recursive: true })
  const jobs = Object.entries(fx).flatMap(([name, p]) => Array.from({ length: per }, (_, i) => () => oneDraft(name, i + 1, p)))
  await pool(jobs, 6)
  await write('thin-runs.json', await thinRuns())
} else if (mode === 'checker') {
  const set = await loadSet()
  const fx = await roundFixtures()
  const jobs = [
    ...set.items.map((it) => () => oneItem('item', it, fx[it.fixture])),
    ...set.controls.map((it) => () => oneItem('control', it, fx[it.fixture])),
  ]
  await write('checker-set.json', await pool(jobs, 6))
} else if (mode === 'recheck') {
  const set = await loadSet()
  const fx = await roundFixtures()
  const byId = new Map(set.items.map((i) => [i.id, i]))
  const runs = await readJson<any[]>(new URL('checker-set.json', HERE))
  const errored = runs.filter((r) => r.kind === 'item' && r.decision === null)
  const out = []
  for (const r of errored) {
    const c = await checkerCall(byId.get(r.id)!, fx[r.fixture])
    console.log(`recheck ${r.id}: ${c.decision ?? `error ${c.checker_reason}`}`)
    out.push({ id: r.id, ...c })
  }
  await write('checker-recheck.json', out)
} else if (mode === 'blind') {
  await blind()
} else if (mode === 'score') {
  await write('score.json', await score())
  console.log(await Deno.readTextFile(new URL('score.json', HERE)))
} else {
  console.error('usage: harness.ts thin | writers <n> | checker | recheck | blind | score')
  Deno.exit(2)
}
