// The AI lead pipeline end to end over a recording fake I/O (CUL-2305, spec §9.2; CUL-2331).
// The writer and checker answers are scripted; everything else is the production code path.
import assert from 'node:assert/strict'
import type { SummaryGate } from '../../_shared/reportSummaryGate.ts'
import { buildDocumentV2 } from '../documentV2.ts'
import { nyxLiveSnapshot } from '../nyxLive.testutil.ts'
import { buildLeadFacts, factTableHash } from './facts.ts'
import type { ModelResult, Role } from './model.ts'
import { assertSendable } from './model.ts'
import { checkerDecision, leadAllowedAtSend, parseChecker, runAiLead, type LeadIO, type StoredVerdict } from './leadPipeline.ts'
import { CHECKER_MODEL, HAZARDS, WRITER_MODEL } from './prompts.ts'
import { LEAD_VERIFIER_VERSION, type LeadSentence } from './verify.ts'

const snap = nyxLiveSnapshot()
const FACTS = buildLeadFacts(buildDocumentV2(snap, { owner: null, shortId: null, questions: [] }), {
  petName: snap.signalment.name,
  species: snap.signalment.species,
  recordStart: snap.scope.startDate,
  recordEnd: snap.scope.endDate,
  includeLookNotes: false,
})

const GOOD: LeadSentence[] = [
  { text: 'Foreign material is a live flag: 1 vomiting incident on Sep 22 showed possible foreign material on automated photo analysis, an AI read, unconfirmed.', cites: ['band-1-present_foreign'] },
  { text: 'Vomiting: 16 entries on 12 of 45 logged days, the last Oct 31.', cites: ['line-1'] },
  { text: 'The owner-entered diet trial, Royal Canin Selected Protein PR, Dry and 5 other trial foods, ran Jul 26, 2026 to Oct 20, 2026.', cites: ['trial'] },
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

Deno.test('checkerDecision and parseChecker are bake-off spec §5\'s rule, and fail closed', () => {
  const p = (o: Partial<Record<string, string>>) => parseChecker(checkerSays(o))
  assert.equal(checkerDecision(p({})!), 'pass')
  assert.equal(checkerDecision(p({ H1: 'minor' })!), 'repair')
  assert.equal(checkerDecision(p({ H7: 'minor' })!), 'reject')
  assert.equal(checkerDecision(p({ H4: 'material' })!), 'reject')
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
