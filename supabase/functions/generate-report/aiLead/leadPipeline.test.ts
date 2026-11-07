// The AI lead pipeline end to end over a recording fake I/O (CUL-2305, spec §9.2; CUL-2331).
// The writer and checker answers are scripted; everything else is the production code path.
import assert from 'node:assert/strict'
import { sha256Hex } from '../../_shared/engineStamps.ts'
import type { SummaryGate } from '../../_shared/reportSummaryGate.ts'
import { buildDocumentV2 } from '../documentV2.ts'
import { nyxLiveSnapshot } from '../nyxLive.testutil.ts'
import { buildLeadFacts, factTableHash, tableFromPayload, type LeadFacts } from './facts.ts'
import type { ModelResult, Role } from './model.ts'
import { assertSendable } from './model.ts'
import { checkerDecision, modelDecision, leadAllowedAtSend, parseChecker, runAiLead, type LeadIO, type StoredVerdict } from './leadPipeline.ts'
import { CHECKER_MODEL, HAZARDS, WRITER_MODEL } from './prompts.ts'
import { LEAD_VERIFIER_VERSION, type LeadSentence } from './verify.ts'
import { leadContextOf, storedLeadForSnapshot } from './run.ts'
import { documentForLead } from './facts.ts'
import { assembleReport } from '../report.ts'
import { itchingSkinTrial, olive } from '../v2Fixtures.testutil.ts'
import { verifyLead } from './verify.ts'

const snap = nyxLiveSnapshot()
/** The live Nyx record as production builds it: six live band items, so no lead may print on it
 *  (CUL-2563 ruling (b); CUL-2621 ruling (c)). */
const NYX_FACTS = buildLeadFacts(buildDocumentV2(snap, { owner: null, shortId: null, questions: [] }), {
  petName: snap.signalment.name,
  species: snap.signalment.species,
  recordStart: snap.scope.startDate,
  recordEnd: snap.scope.endDate,
  includeLookNotes: false,
})
if (!NYX_FACTS.eligible) throw new Error('the live Nyx record is eligible for a lead')
/** Olive (CUL-2323's canonical `looks-only` cat, built by the shipped report code): an empty band,
 *  the only kind of record a lead may print on (CUL-2621 ruling (c)). Every pipeline path below runs
 *  on it; the live-flag tests run on NYX_FACTS and on Nyx cut to one flag. */
const oliveSnap = assembleReport(olive())
const FACTS: LeadFacts = buildLeadFacts(documentForLead(oliveSnap), leadContextOf(oliveSnap, false))
if (!FACTS.eligible || FACTS.payload.band.length !== 0) throw new Error('Olive is eligible, with an empty band')
/** Nyx cut to its first printed band item (the burden): a lone live flag, which no longer prints. */
// The record cut to its burden flag alone (by id: since CUL-2627 the band opens with foreign material).
const ONE_FLAG_PAYLOAD = { ...NYX_FACTS.payload, band: NYX_FACTS.payload.band.filter((b) => b.id === 'band-3-symptom_burden-vomit') }
const ONE_FLAG: LeadFacts = { eligible: true, payload: ONE_FLAG_PAYLOAD, table: tableFromPayload(ONE_FLAG_PAYLOAD) }

/** A careful lead on Olive's table: every number and word from a cited line. */
const GOOD: LeadSentence[] = [
  { text: 'Meals: 42 logged, 3 not fully eaten, on 3 days, first Oct 13, last Oct 15.', cites: ['intake'] },
  { text: 'Noticed: answered on 42 of 42 days; sleeping more on 6, the first Oct 6.', cites: ['noticed'] },
]
/** The lead the re-run printed on nyx-v2 (runs 2 to 4): it passes every sentence rule on the record cut to
 *  its burden flag, which is what CUL-2563's ruling still let print. */
const NYX_LEAD: LeadSentence[] = [
  { text: 'Burden is a live flag: 6 vomiting entries in the last 7 days, on 3 days in a row.', cites: ['band-3-symptom_burden-vomit'] },
  { text: 'Vomiting: 16 entries on 12 of 45 logged days, the last Oct 31.', cites: ['line-1'] },
  { text: 'The owner-entered diet trial, Royal Canin Selected Protein PR, Dry and 5 other trial foods, ran Jul 26, 2026 to Oct 20, 2026; the trial diet was not fed exclusively, and it is not a test of the diet alone.', cites: ['trial', 'trial-reading-3', 'confounder'] },
]
const BAD: LeadSentence[] = [{ text: 'Vomiting improved on the trial.', cites: ['line-1'] }]

const levels = (over: Partial<Record<string, string>> = {}) =>
  Object.fromEntries(HAZARDS.map((h) => [h, { level: over[h] ?? 'none', quote: over[h] ? 'the quote' : '', why: '' }]))
const checkerSays = (over: Partial<Record<string, string>> = {}) => ({ takeaway: 'a cat with a live foreign-material flag', hazards: levels(over), omissions: [] })

interface Fake {
  io: LeadIO
  sends: Array<{ role: Role; body: string }>
  gates: boolean[]
  writes: Array<{ text: string | null; verdict: StoredVerdict; model: string | null }>
}

function fake(opts: {
  draft?: { found: boolean; text: string | null; verdict: unknown }
  gate?: (spend: boolean) => SummaryGate
  answers?: Array<ModelResult>
  writeOk?: boolean
  clockStep?: number
}): Fake {
  const sends: Fake['sends'] = []
  const gates: boolean[] = []
  const writes: Fake['writes'] = []
  const answers = [...(opts.answers ?? [])]
  let t = 1_700_000_000_000
  return {
    sends,
    gates,
    writes,
    io: {
      readDraft: () => Promise.resolve(opts.draft ?? { found: true, text: null, verdict: null }),
      runGate: (spend) => {
        gates.push(spend)
        return Promise.resolve(opts.gate ? opts.gate(spend) : { allow: true })
      },
      send: (role, body, ticket) => {
        assert.ok(ticket !== null, 'a send without a ticket')
        // Every body the pipeline builds must pass the door's own check.
        assert.equal(assertSendable(role, body).ok, true, `${role} body refused`)
        sends.push({ role, body })
        const next = answers.shift()
        if (!next) throw new Error(`no scripted answer for ${role}`)
        return Promise.resolve(next)
      },
      writeDraft: (text, verdict, model) => {
        writes.push({ text, verdict, model })
        return Promise.resolve(opts.writeOk ?? true)
      },
      now: () => (t += opts.clockStep ?? 1000),
    },
  }
}
const writer = (sentences: LeadSentence[]): ModelResult => ({ ok: true, servedModel: WRITER_MODEL, json: { sentences } })
const checker = (over: Partial<Record<string, string>> = {}): ModelResult => ({ ok: true, servedModel: CHECKER_MODEL, json: checkerSays(over) })

Deno.test('the golden path: written, verified, checked, kept on the draft with its verdict and model', async () => {
  const f = fake({ answers: [writer(GOOD), checker()] })
  const r = await runAiLead(f.io, FACTS, { leaveOut: false })
  assert.equal(r.outcome, 'printed')
  assert.deepEqual(f.gates, [true])
  assert.deepEqual(f.sends.map((s) => s.role), ['writer', 'checker'])
  assert.equal(f.writes.length, 1)
  const w = f.writes[0]
  assert.equal(w.text, GOOD.map((s) => s.text).join(' '))
  assert.equal(w.model, WRITER_MODEL)
  assert.equal(w.verdict.outcome, 'printed')
  assert.equal(w.verdict.checker_model, CHECKER_MODEL)
  if (!FACTS.eligible) throw new Error('eligible')
  assert.equal(w.verdict.fact_hash, await factTableHash(FACTS.payload, LEAD_VERIFIER_VERSION))
  // The checker read the same facts plus the draft, nothing else.
  assert.ok(f.sends[1].body.includes('\\"draft\\"'))
})

Deno.test('the verdict is stamped at its write, after the model calls, not when it was built (CUL-2523)', async () => {
  // The keep pins a long lead by its verdict's `at` (run.ts pinsOf), so `at` must be the write's.
  const f = fake({ answers: [writer(GOOD), checker()] })
  let lastNow = 0
  const now = f.io.now
  f.io.now = () => (lastNow = now())
  const write = f.io.writeDraft
  let atWrite = 0
  f.io.writeDraft = (text, verdict, model) => ((atWrite = lastNow), write(text, verdict, model))
  await runAiLead(f.io, FACTS, { leaveOut: false })
  assert.equal(Date.parse(f.writes[0].verdict.at), atWrite, 'the last clock read before the write is the stamp')
  assert.ok(f.sends.length === 2, 'both model calls ran before it')
})

Deno.test('every write carries text_sha, the SHA-256 of the text it writes, null with no text (CUL-2574)', async () => {
  const f = fake({ answers: [writer(GOOD), checker()] })
  await runAiLead(f.io, FACTS, { leaveOut: false })
  const w = f.writes[0]
  assert.ok(w.text !== null)
  assert.equal(w.verdict.text_sha, await sha256Hex(w.text!))
  const g = fake({})
  await runAiLead(g.io, FACTS, { leaveOut: true })
  assert.equal(g.writes[0].verdict.text_sha, null)
})

Deno.test('leave out: recorded on the copy, no gate, no model', async () => {
  const f = fake({})
  const r = await runAiLead(f.io, FACTS, { leaveOut: true })
  assert.deepEqual(r, { outcome: 'left_out', reason: 'owner' })
  assert.deepEqual([f.gates, f.sends.length, f.writes[0].text, f.writes[0].model], [[], 0, null, null])
})

Deno.test('no draft: nothing is gated, sent or written', async () => {
  const f = fake({ draft: { found: false, text: null, verdict: null } })
  assert.deepEqual(await runAiLead(f.io, FACTS, { leaveOut: false }), { outcome: 'draft_not_found' })
  assert.deepEqual([f.gates.length, f.sends.length, f.writes.length], [0, 0, 0])
})

Deno.test('a declined gate records why and calls no model', async () => {
  for (const [gate, outcome] of [
    [{ allow: false, reason: 'consent_declined', scope: 'report_summary' }, 'declined'],
    [{ allow: false, reason: 'flag_off', flag: 'report_ai_lead' }, 'flag_off'],
    [{ allow: false, reason: 'cap_reached', cap: 'daily' }, 'capped'],
  ] as Array<[SummaryGate, string]>) {
    const f = fake({ gate: () => gate })
    const r = await runAiLead(f.io, FACTS, { leaveOut: false })
    assert.equal(r.outcome, outcome)
    assert.equal(f.sends.length, 0)
    assert.equal(f.writes[0].text, null)
  }
})

Deno.test('the cache: the same facts on this draft re-show the lead, spend no count, call no model', async () => {
  if (!FACTS.eligible) throw new Error('eligible')
  const hash = await factTableHash(FACTS.payload, LEAD_VERIFIER_VERSION)
  const text = GOOD.map((s) => s.text).join(' ')
  const f = fake({ draft: { found: true, text, verdict: { outcome: 'printed', fact_hash: hash, sentences: GOOD } } })
  const r = await runAiLead(f.io, FACTS, { leaveOut: false })
  assert.deepEqual(r, { outcome: 'printed', sentences: GOOD, text, cached: true })
  assert.deepEqual([f.gates, f.sends.length, f.writes.length], [[false], 0, 0])
})

Deno.test('withdrawal: a cached lead is cleared, never served, once the owner says no', async () => {
  if (!FACTS.eligible) throw new Error('eligible')
  const hash = await factTableHash(FACTS.payload, LEAD_VERIFIER_VERSION)
  const f = fake({
    draft: { found: true, text: 'x', verdict: { outcome: 'printed', fact_hash: hash, sentences: GOOD } },
    gate: () => ({ allow: false, reason: 'consent_declined', scope: 'report_summary' }),
  })
  const r = await runAiLead(f.io, FACTS, { leaveOut: false })
  assert.equal(r.outcome, 'declined')
  assert.deepEqual([f.writes[0].text, f.sends.length], [null, 0])
})

Deno.test('changed facts miss the cache and run again', async () => {
  const f = fake({ draft: { found: true, text: 'x', verdict: { outcome: 'printed', fact_hash: 'stale', sentences: GOOD } }, answers: [writer(GOOD), checker()] })
  assert.equal((await runAiLead(f.io, FACTS, { leaveOut: false })).outcome, 'printed')
  assert.deepEqual(f.gates, [true])
})

Deno.test('the verifier rejects, one repair is made, and a passing repair prints', async () => {
  const f = fake({ answers: [writer(BAD), writer(GOOD), checker()] })
  assert.equal((await runAiLead(f.io, FACTS, { leaveOut: false })).outcome, 'printed')
  assert.deepEqual(f.sends.map((s) => s.role), ['writer', 'repair', 'checker'])
  assert.ok(f.sends[1].body.includes('findings'))
})

Deno.test('two verifier failures: rejected, the lines print alone', async () => {
  const f = fake({ answers: [writer(BAD), writer(BAD)] })
  const r = await runAiLead(f.io, FACTS, { leaveOut: false })
  assert.deepEqual(r, { outcome: 'rejected', reason: 'verifier' })
  assert.equal(f.writes[0].text, null)
  assert.ok(f.writes[0].verdict.verifier_errors.length > 0)
})

Deno.test('the checker: material anywhere, or minor on H3 or H7, rejects without a repair', async () => {
  for (const over of [{ H2: 'material' }, { H7: 'minor' }, { H3: 'minor' }]) {
    const f = fake({ answers: [writer(GOOD), checker(over)] })
    assert.deepEqual(await runAiLead(f.io, FACTS, { leaveOut: false }), { outcome: 'rejected', reason: 'checker' })
    assert.equal(f.sends.length, 2)
    assert.equal(f.writes[0].text, null)
  }
})

Deno.test('the checker: another minor gets the one repair, then both checks again', async () => {
  const f = fake({ answers: [writer(GOOD), checker({ H5: 'minor' }), writer(GOOD), checker()] })
  assert.equal((await runAiLead(f.io, FACTS, { leaveOut: false })).outcome, 'printed')
  assert.deepEqual(f.sends.map((s) => s.role), ['writer', 'checker', 'repair', 'checker'])
})

Deno.test('the checker: a minor after the repair is spent rejects', async () => {
  const f = fake({ answers: [writer(BAD), writer(GOOD), checker({ H5: 'minor' })] })
  assert.deepEqual(await runAiLead(f.io, FACTS, { leaveOut: false }), { outcome: 'rejected', reason: 'checker' })
})

Deno.test('a model failure, or a checker answer that does not parse, fails closed', async () => {
  const f1 = fake({ answers: [{ ok: false, reason: 'refusal', servedModel: WRITER_MODEL }] })
  assert.deepEqual(await runAiLead(f1.io, FACTS, { leaveOut: false }), { outcome: 'failed', reason: 'refusal' })
  const f2 = fake({ answers: [writer(GOOD), { ok: true, servedModel: CHECKER_MODEL, json: { takeaway: 'x', hazards: {} } }] })
  assert.deepEqual(await runAiLead(f2.io, FACTS, { leaveOut: false }), { outcome: 'failed', reason: 'checker_unparseable' })
})

Deno.test('the wall clock: a call that cannot finish in 60 s is never made', async () => {
  const f = fake({ answers: [writer(BAD)], clockStep: 20_000 })
  assert.deepEqual(await runAiLead(f.io, FACTS, { leaveOut: false }), { outcome: 'failed', reason: 'timeout' })
  assert.deepEqual(f.sends.map((s) => s.role), ['writer'])
})

Deno.test('a draft sent while the lead was being written: the lead is dropped, nothing else written', async () => {
  const f = fake({ answers: [writer(GOOD), checker()], writeOk: false })
  assert.deepEqual(await runAiLead(f.io, FACTS, { leaveOut: false }), { outcome: 'draft_not_found' })
})

Deno.test('a thin record records not_eligible and calls nothing', async () => {
  const f = fake({})
  assert.deepEqual(await runAiLead(f.io, { eligible: false, reason: 'thin_record' }, { leaveOut: false }), { outcome: 'not_eligible', reason: 'thin_record' })
  assert.deepEqual([f.gates.length, f.sends.length], [0, 0])
})

Deno.test('modelDecision and parseChecker are bake-off spec §5\'s rule, and fail closed', () => {
  const p = (o: Partial<Record<string, string>>) => parseChecker(checkerSays(o))
  assert.equal(modelDecision(p({})!), 'pass')
  assert.equal(modelDecision(p({ H1: 'minor' })!), 'repair')
  assert.equal(modelDecision(p({ H7: 'minor' })!), 'reject')
  assert.equal(modelDecision(p({ H4: 'material' })!), 'reject')
  assert.equal(parseChecker({ takeaway: 'x', hazards: { ...levels(), H6: { level: 'severe' } } }), null)
})

Deno.test('withdrawal at send (promise 4, option a): a lead prints only while both consents and both flags allow', () => {
  const yes = { data: [{ scope: 'ai_boundary', granted: true }, { scope: 'report_summary', granted: true, copy_version: '2026-10-31' }], error: null }
  const on = [{ key: 'report_document_v2', value: { enabled: true, allowlist: [] } }, { key: 'report_ai_lead', value: { enabled: true, allowlist: [] } }]
  assert.equal(leadAllowedAtSend(yes, on, 'u1'), true)
  const no = { data: [yes.data[0], { ...yes.data[1], granted: false }], error: null }
  assert.equal(leadAllowedAtSend(no, on, 'u1'), false)
  assert.equal(leadAllowedAtSend(yes, [on[0]], 'u1'), false)
  assert.equal(leadAllowedAtSend(null, on, 'u1'), false)
})

Deno.test('step 7 decides with the checker\'s code half: the draft and the table, never the model alone (CUL-2548)', async () => {
  // The verifier refuses an order-failing draft before the checker sees it, so no scripted run can
  // reach step 7 with one; the wiring is pinned on the call itself.
  const src = await Deno.readTextFile(new URL('./leadPipeline.ts', import.meta.url))
  assert.ok(src.includes('checkerDecision(cv, { table: facts.table, draft: summary })'), 'step 7 calls checkerDecision with the draft and the table')
  assert.ok(!/\bmodelDecision\(cv\)/.test(src), 'step 7 never decides on the model alone')
})

// ── CUL-2621 ruling (c) (widening CUL-2563's (b)): no lead on a record with any live band item ──

Deno.test('CUL-2621: the live Nyx record (six live flags) never prints: no model call, no count spent', async () => {
  assert.ok(NYX_FACTS.eligible && NYX_FACTS.payload.band.length === 6, 'the fixture is the six-flag record')
  // Scripted answers a model would give: the re-run's printed lead and a clean checker. Never asked.
  const f = fake({ answers: [writer(NYX_LEAD), checker()] })
  const r = await runAiLead(f.io, NYX_FACTS, { leaveOut: false })
  assert.deepEqual(r, { outcome: 'not_eligible', reason: 'live_flag' })
  assert.deepEqual([f.gates, f.sends.length, f.writes.length, f.writes[0].text], [[false], 0, 1, null])
  assert.equal(f.writes[0].verdict.outcome, 'not_eligible')
})

Deno.test('CUL-2621: one live flag is enough: the lead CUL-2563 still let print is never asked for', async () => {
  // It passes every sentence rule on the one-flag record: only the record rule stops it.
  assert.deepEqual(verifyLead(tableFromPayload(ONE_FLAG_PAYLOAD), { sentences: NYX_LEAD }).errors.map((e) => e.check), ['live-flag'])
  const f = fake({ answers: [writer(NYX_LEAD), checker()] })
  assert.deepEqual(await runAiLead(f.io, ONE_FLAG, { leaveOut: false }), { outcome: 'not_eligible', reason: 'live_flag' })
  assert.deepEqual([f.gates, f.sends.length, f.writes[0].text], [[false], 0, null])
  // Band empty: the same pipeline prints.
  const g = fake({ answers: [writer(GOOD), checker()] })
  assert.equal((await runAiLead(g.io, FACTS, { leaveOut: false })).outcome, 'printed')
})

Deno.test('CUL-2621: a stored printed lead on a flagged draft is never served, whatever its hash', async () => {
  for (const facts of [NYX_FACTS, ONE_FLAG]) {
    if (!facts.eligible) throw new Error('eligible')
    const hash = await factTableHash(facts.payload, LEAD_VERIFIER_VERSION)
    const text = NYX_LEAD.map((s) => s.text).join(' ')
    const f = fake({ draft: { found: true, text, verdict: { outcome: 'printed', fact_hash: hash, sentences: NYX_LEAD } } })
    assert.deepEqual(await runAiLead(f.io, facts, { leaveOut: false }), { outcome: 'not_eligible', reason: 'live_flag' })
    assert.deepEqual([f.sends.length, f.writes[0].text], [0, null])
  }
})

Deno.test('CUL-2621: on a flagged record a closed gate keeps its own outcome (a flag-off owner hears nothing)', async () => {
  for (const facts of [NYX_FACTS, ONE_FLAG]) {
    for (const [gate, outcome] of [
      [{ allow: false, reason: 'flag_off', flag: 'report_ai_lead' }, 'flag_off'],
      [{ allow: false, reason: 'consent_declined', scope: 'report_summary' }, 'declined'],
      [{ allow: false, reason: 'cap_reached', cap: 'daily' }, 'capped'],
    ] as Array<[SummaryGate, string]>) {
      const f = fake({ gate: () => gate })
      const r = await runAiLead(f.io, facts, { leaveOut: false })
      assert.equal(r.outcome, outcome)
      assert.deepEqual([f.gates, f.sends.length, f.writes[0].text], [[false], 0, null])
    }
  }
})

Deno.test('CUL-2621: the send path never serves a stored lead on a flagged record, even with a matching hash', async () => {
  // A printed verdict no shipped writer can produce today (runAiLead refuses first): the send path
  // still checks the record itself rather than trusting the hash (PR #1461's adversarial finding A).
  const facts = buildLeadFacts(documentForLead(snap), leadContextOf(snap, false))
  if (!facts.eligible) throw new Error('eligible')
  const text = NYX_LEAD.map((s) => s.text).join(' ')
  const verdict = { outcome: 'printed', fact_hash: await factTableHash(facts.payload, LEAD_VERIFIER_VERSION), sentences: NYX_LEAD }
  assert.equal(await storedLeadForSnapshot(snap, { text, verdict }), null)
})

Deno.test('CUL-2621: a band-empty record prints end to end, the send path included', async () => {
  if (!FACTS.eligible) throw new Error('eligible')
  const f = fake({ answers: [writer(GOOD), checker()] })
  const r = await runAiLead(f.io, FACTS, { leaveOut: false })
  assert.equal(r.outcome, 'printed')
  const w = f.writes[0]
  // What the draft keeps is what the send path serves on the same snapshot.
  assert.deepEqual(await storedLeadForSnapshot(oliveSnap, { text: w.text, verdict: w.verdict }), GOOD)
})

/** CUL-2621's instances 2 to 5, each on the fixture it was found on. Under CUL-2563's ruling each
 *  printed past every sentence rule; now the record rule refuses each at all three decision points:
 *  the verifier, the checker's decision (whatever the model scored), and the pipeline before any
 *  model call, cache or count; and the send path never serves one. */
Deno.test('CUL-2621: instances 2 to 5 are refused on their own fixtures, at every decision point', async () => {
  const r11Snap = assembleReport(itchingSkinTrial({ jump: false }))
  const jumpSnap = assembleReport(itchingSkinTrial({ jump: true }))
  const factsOf = (s: typeof r11Snap) => buildLeadFacts(documentForLead(s), leadContextOf(s, false))
  const R11_TAIL = 'itching over at least 49 days, 15 episodes on 15 days, most recent 1 day ago.'
  const cases: Array<{ name: string; facts: LeadFacts; snap: typeof r11Snap | null; sentences: LeadSentence[] }> = [
    { name: '2: the floor without "at least"', facts: factsOf(jumpSnap), snap: jumpSnap, sentences: [{ text: 'Chronicity is a live flag: itching spans 49 days, 18 episodes on 18 days, most recent 1 day ago.', cites: ['band-1-chronicity-itch'] }] },
    { name: '3: the burden row without its call-the-vet clause', facts: ONE_FLAG, snap: null, sentences: [NYX_LEAD[0]] },
    { name: '4: the flag as a question', facts: factsOf(jumpSnap), snap: jumpSnap, sentences: [{ text: 'Chronicity: itching spans 49 days, 18 episodes on 18 days, the most recent 1 day ago, a sustained pattern?', cites: ['band-1-chronicity-itch'] }] },
    { name: '5: doubted by its own band words', facts: factsOf(r11Snap), snap: r11Snap, sentences: [{ text: `The record cannot show how itching is a live flag: ${R11_TAIL}`, cites: ['band-r11'] }] },
    { name: '5: a question with no question mark', facts: factsOf(r11Snap), snap: r11Snap, sentences: [{ text: `Is itching a live flag: ${R11_TAIL}`, cites: ['band-r11'] }] },
    { name: '5: a fullwidth question mark', facts: factsOf(r11Snap), snap: r11Snap, sentences: [{ text: `Itching is a live flag, the trial's own sign: ${R11_TAIL.slice(0, -1)}？`, cites: ['band-r11'] }] },
    { name: '5: dated by its latest entry', facts: factsOf(r11Snap), snap: r11Snap, sentences: [{ text: "Itching is a live flag, the trial's own sign: itching over at least 49 days, 15 episodes on 15 days, first logged 1 day ago.", cites: ['band-r11'] }] },
    { name: '5: "live" dropped', facts: factsOf(r11Snap), snap: r11Snap, sentences: [{ text: `Itching is a floor flag, the trial's own sign: ${R11_TAIL}`, cites: ['band-r11'] }] },
  ]
  const clean = parseChecker(checkerSays())!
  for (const c of cases) {
    if (!c.facts.eligible) throw new Error(`${c.name}: eligible`)
    assert.equal(c.facts.payload.band.length, 1, `${c.name}: a lone live flag`)
    const v = verifyLead(c.facts.table, { sentences: c.sentences })
    assert.equal(v.pass, false, c.name)
    assert.ok(v.errors.some((e) => e.check === 'live-flag'), c.name)
    assert.equal(checkerDecision(clean, { table: c.facts.table, draft: { sentences: c.sentences } }), 'reject', c.name)
    const f = fake({ answers: [writer(c.sentences), checker()] })
    assert.deepEqual(await runAiLead(f.io, c.facts, { leaveOut: false }), { outcome: 'not_eligible', reason: 'live_flag' }, c.name)
    assert.deepEqual([f.gates, f.sends.length], [[false], 0], c.name)
    if (c.snap) {
      const text = c.sentences.map((s) => s.text).join(' ')
      const verdict = { outcome: 'printed', fact_hash: await factTableHash(c.facts.payload, LEAD_VERIFIER_VERSION), sentences: c.sentences }
      assert.equal(await storedLeadForSnapshot(c.snap, { text, verdict }), null, c.name)
    }
  }
})
