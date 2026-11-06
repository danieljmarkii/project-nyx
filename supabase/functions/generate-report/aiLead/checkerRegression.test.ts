// The checker's regression suite over the bake-off's exhibits (CUL-2305, spec §9.1: "every
// exhibit in bakeoff/ becomes a checker regression suite before the flag turns on").
//
// Two halves, because a model cannot run in CI:
//   1. REPLAY. The bake-off's recorded checker verdicts (all 27 blind items) through the shipped
//      parser and decision rule must reproduce RESULTS.md: A 3 shipped; O 12 shipped; S 10 shipped
//      and 2 rejected (M06, M09, both H7 material). A change to `parseChecker` or
//      `checkerDecision` that would have shipped a rejected draft, or dropped a good one, reds here.
//      (Replayed through `modelDecision`, the model's half: the code half below needs each draft.)
//   2. THE KNOWN MISS, CLOSED IN CODE. RESULTS.md: "Three Nyx drafts opened on the vomiting count
//      and put the possible plastic second. Both judges scored all three material (H7). The
//      checker passed them." Those are N02, N04, N05 (S1, S2, S4). The v2 band-first rule rejects
//      each one deterministically, so that miss no longer depends on the checker.
//   The live half (the shipped prompts against a model, on these exhibits) is the smoke bake-off
//   before the flag reaches anyone (CUL-2306, spec §9.4).
import assert from 'node:assert/strict'
import { tableFromPayload, type LeadFactPayload } from './facts.ts'
import { checkerDecision, modelDecision, parseChecker, type CheckerVerdict } from './leadPipeline.ts'
import { verifyLead, type LeadSentence } from './verify.ts'

const DIR = new URL('./exhibits/', import.meta.url)
const read = async (p: string) => JSON.parse(await Deno.readTextFile(new URL(p, DIR)))

Deno.test('replay: the recorded checker verdicts reproduce the bake-off\'s shipped counts', async () => {
  const verdicts = (await read('checker/checker-results.json')) as Record<string, unknown>
  const key = (await read('checker/blind-key.json')) as Record<string, string>
  assert.equal(Object.keys(verdicts).length, 27)
  const tally: Record<string, number> = {}
  const rejected: string[] = []
  for (const [id, raw] of Object.entries(verdicts)) {
    const v = parseChecker(raw)
    assert.ok(v, `${id} does not parse`)
    const d = modelDecision(v)
    const arm = key[id][0]
    tally[`${arm}:${d}`] = (tally[`${arm}:${d}`] ?? 0) + 1
    if (d === 'reject') rejected.push(id)
  }
  assert.deepEqual(tally, { 'A:pass': 3, 'O:pass': 12, 'S:pass': 10, 'S:reject': 2 })
  assert.deepEqual(rejected.sort(), ['M06', 'M09'])
})

/** The bake-off's Nyx table in the v2 payload's shape: its band facts as the band (S1 first,
 *  labelled with the v2 tag for possible foreign material), every other line a record line. */
async function nyxTable(opts: { firstBandOnly?: boolean } = {}) {
  const f = (await read('facts-nyx.json')) as { facts: Array<{ id: string; role?: string; text: string }> }
  const payload: LeadFactPayload = {
    pet_name: 'Nyx',
    species: 'cat',
    record_start: '2026-05-14',
    record_end: '2026-07-02',
    band: f.facts.filter((x) => x.role === 'band').slice(0, opts.firstBandOnly ? 1 : undefined).map((x) => ({ id: x.id, label: x.id === 'S1' ? 'Foreign material' : x.id, text: x.text })),
    record_lines: f.facts.filter((x) => x.role !== 'band').map((x) => ({ id: x.id, kind: 'record' as const, text: x.text })),
    trial_line: null,
    record_edge: [],
  }
  return tableFromPayload(payload)
}

Deno.test('the known miss: each S-arm Nyx draft that buried the plastic is rejected by band-first', async () => {
  const table = await nyxTable()
  for (const file of ['S1-nyx-attempt1', 'S2-nyx-attempt1', 'S4-nyx-attempt2']) {
    const draft = (await read(`out/${file}.json`)) as { sentences: LeadSentence[] }
    const v = verifyLead(table, { sentences: draft.sentences.slice(0, 1) })
    assert.ok(v.errors.some((e) => e.check === 'band-first'), `${file} passed band-first`)
  }
})

Deno.test('band-first is not blind: a first sentence that leads with the flag passes it', async () => {
  const table = await nyxTable()
  const lead: LeadSentence = {
    text: 'Foreign material is a live flag: the AI photo read of the May 23 vomit noted a possible plastic fragment, unconfirmed.',
    cites: ['S1'],
  }
  const v = verifyLead(table, { sentences: [lead] })
  assert.deepEqual(v.errors.filter((e) => e.check === 'band-first'), [])
})

// CUL-2548: the smoke bake-off (2026-11-05) fed the adversarial set through the shipped checker and
// the model passed cr-a (the vomiting count before the possible plastic), October's miss rephrased.
// The checker's decision now has a code half that reads H7 by order, so the recorded verdict itself,
// all hazards none and no omissions, rejects with its draft and table. The verifier's band-first
// rule stays on beside it (verify.test.ts, adversarialSet.test.ts).
const BAND_ORDER = ['cr-a', 'cr-b', 'p1-b1-a', 'p1-b1-b']

async function bandOrderCases() {
  const set = (await read('adversarial/set.json')) as { items: Array<{ id: string; fixture: string; sentences: LeadSentence[] }> }
  const recorded = (await read('checker/band-order-smoke-verdicts.json')) as { verdicts: Record<string, unknown> }
  return Promise.all(BAND_ORDER.map(async (id) => {
    const item = set.items.find((i) => i.id === id)!
    const payload = (await read(`adversarial/fixtures/${item.fixture}.json`)) as LeadFactPayload
    // Stored as the pipeline stores it (StoredVerdict.checker), already parsed.
    const verdict = recorded.verdicts[id] as CheckerVerdict
    assert.ok(verdict && verdict.levels && Array.isArray(verdict.omissions), `${id}: a recorded verdict`)
    return { id, item, table: tableFromPayload(payload), verdict }
  }))
}

Deno.test('CUL-2548: the checker rejects cr-a on the very verdict the model returned', async () => {
  const [cra] = await bandOrderCases()
  assert.equal(cra.id, 'cr-a')
  assert.equal(modelDecision(cra.verdict), 'pass', 'the recorded model verdict passed it (the miss)')
  assert.equal(checkerDecision(cra.verdict, { table: cra.table, draft: { sentences: cra.item.sentences } }), 'reject')
})

Deno.test('CUL-2548: every band-order item is rejected by the checker whatever the model says', async () => {
  const clean = parseChecker({ takeaway: 'x', hazards: Object.fromEntries(['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7'].map((h) => [h, { level: 'none', quote: '', why: '' }])), omissions: [] })!
  for (const c of await bandOrderCases()) {
    for (const v of [c.verdict, clean]) {
      assert.equal(checkerDecision(v, { table: c.table, draft: { sentences: c.item.sentences } }), 'reject', c.id)
    }
  }
})

Deno.test('CUL-2548: the code half is not blind: a lead that opens on band item 1 takes the model\'s decision', async () => {
  // On the bake-off table's first flag alone: with all its band items the record is multi-flag and
  // the code half rejects every lead (CUL-2563), which the last line pins.
  const table = await nyxTable({ firstBandOnly: true })
  const clean = parseChecker({ takeaway: 'x', hazards: Object.fromEntries(['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7'].map((h) => [h, { level: 'none', quote: '', why: '' }])), omissions: [] })!
  const lead: LeadSentence = { text: 'Foreign material is a live flag: the AI photo read of the May 23 vomit noted a possible plastic fragment, unconfirmed.', cites: ['S1'] }
  assert.equal(checkerDecision(clean, { table, draft: { sentences: [lead] } }), 'pass')
  assert.equal(checkerDecision(parseChecker({ ...clean, hazards: { ...Object.fromEntries(['H1', 'H2', 'H3', 'H4', 'H6', 'H7'].map((h) => [h, { level: 'none', quote: '', why: '' }])), H5: { level: 'minor', quote: 'x', why: 'x' } } })!, { table, draft: { sentences: [lead] } }), 'repair')
  assert.equal(checkerDecision(clean, { table: await nyxTable(), draft: { sentences: [lead] } }), 'reject', 'the full table is multi-flag')
})
