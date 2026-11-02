// The checker's regression suite over the bake-off's exhibits (CUL-2305, spec §9.1: "every
// exhibit in bakeoff/ becomes a checker regression suite before the flag turns on").
//
// Two halves, because a model cannot run in CI:
//   1. REPLAY. The bake-off's recorded checker verdicts (all 27 blind items) through the shipped
//      parser and decision rule must reproduce RESULTS.md: A 3 shipped; O 12 shipped; S 10 shipped
//      and 2 rejected (M06, M09, both H7 material). A change to `parseChecker` or
//      `checkerDecision` that would have shipped a rejected draft, or dropped a good one, reds here.
//   2. THE KNOWN MISS, CLOSED IN CODE. RESULTS.md: "Three Nyx drafts opened on the vomiting count
//      and put the possible plastic second. Both judges scored all three material (H7). The
//      checker passed them." Those are N02, N04, N05 (S1, S2, S4). The v2 band-first rule rejects
//      each one deterministically, so that miss no longer depends on the checker.
//   The live half (the shipped prompts against a model, on these exhibits) is the smoke bake-off
//   before the flag reaches anyone (CUL-2306, spec §9.4).
import assert from 'node:assert/strict'
import { tableFromPayload, type LeadFactPayload } from './facts.ts'
import { checkerDecision, parseChecker } from './leadPipeline.ts'
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
    const d = checkerDecision(v)
    const arm = key[id][0]
    tally[`${arm}:${d}`] = (tally[`${arm}:${d}`] ?? 0) + 1
    if (d === 'reject') rejected.push(id)
  }
  assert.deepEqual(tally, { 'A:pass': 3, 'O:pass': 12, 'S:pass': 10, 'S:reject': 2 })
  assert.deepEqual(rejected.sort(), ['M06', 'M09'])
})

/** The bake-off's Nyx table in the v2 payload's shape: its band facts as the band (S1 first,
 *  labelled with the v2 tag for possible foreign material), every other line a record line. */
async function nyxTable() {
  const f = (await read('facts-nyx.json')) as { facts: Array<{ id: string; role?: string; text: string }> }
  const payload: LeadFactPayload = {
    pet_name: 'Nyx',
    species: 'cat',
    record_start: '2026-05-14',
    record_end: '2026-07-02',
    band: f.facts.filter((x) => x.role === 'band').map((x) => ({ id: x.id, label: x.id === 'S1' ? 'Foreign material' : x.id, text: x.text })),
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
