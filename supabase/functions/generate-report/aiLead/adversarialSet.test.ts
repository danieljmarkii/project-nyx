// The smoke bake-off's adversarial set, checked against the shipped verifier (CUL-2380; the
// bake-off itself is CUL-2306, spec §9.4). The set and its fixtures live where the bake-off reads
// them, aiLead/exhibits/adversarial/, and docs/vet-report-v3-discovery/bakeoff/adversarial/PROTOCOL.md pre-registers the
// stop rule. This suite is the harness's own check, run on every PR:
//   1. Every committed fixture is byte-equal to the payload the report code builds today, so the
//      set never drifts from what ships.
//   2. Every hazard item marked `verifier: refuse` is refused (a pass is the protocol's stop (3)),
//      and every control prints.
//   3. Every item marked `verifier: pass` still passes: those are the residual, the items only the
//      checker can catch. A rule that closes one reds here, and the set is updated to say so.
//   5. CUL-2563: every item on a record with 2+ band items is refused by `multi-flag`; tests 2 to 4
//      read the sentence rules without it (`verdictOf`), so they keep proving what they proved.
//   4. The mutation proof: each `closed_by` item is refused by those checks and no other, so the
//      rule's removal would print it. Each CUL-2380 rule (`vocabulary`, `negation`, `script`,
//      `tense`, `date-anchor`, and the bound `intake-positive`) closes at least one item alone.
// No model is called here. The checker's half of each item (`expect.checker`) is the bake-off's,
// except its code half (CUL-2548), which reads order and is checked below on every band-order item.
import assert from 'node:assert/strict'
import { adversarialFixtures } from './adversarialFixtures.testutil.ts'
import { tableFromPayload, type LeadFactPayload } from './facts.ts'
import { verifyLead, LEAD_VERIFIER_VERSION, MULTI_FLAG_MIN_BAND, type LeadSentence } from './verify.ts'
import { checkerDecision, parseChecker } from './leadPipeline.ts'
import { HAZARDS } from './prompts.ts'

const DIR = new URL('./exhibits/adversarial/', import.meta.url)

interface SetItem {
  id: string
  fixture: string
  class?: string
  hazard?: string
  level?: string
  source: string
  sentences: LeadSentence[]
  expect: { verifier: 'refuse' | 'pass'; checker: 'reject' | 'pass' }
  closed_by?: string[]
}
interface AdversarialSet {
  version: number
  verifier: string
  items: SetItem[]
  controls: SetItem[]
}

const set = JSON.parse(await Deno.readTextFile(new URL('set.json', DIR))) as AdversarialSet
const built = await adversarialFixtures()
const fixtures: Record<string, LeadFactPayload> = {}
for (const name of Object.keys(built)) {
  fixtures[name] = JSON.parse(await Deno.readTextFile(new URL(`fixtures/${name}.json`, DIR))) as LeadFactPayload
}
/** The full verdict, every rule. */
const fullVerdictOf = (it: SetItem) => verifyLead(tableFromPayload(fixtures[it.fixture]), { sentences: it.sentences })
/** The SENTENCE rules' verdict: every rule but `multi-flag` (CUL-2563), which reads the record and
 *  never the draft, so it refuses every item on a fixture with 2+ band items (nyx-v2, bakeoff-nyx).
 *  The set exists to prove the sentence rules, so tests 2 to 4 read them without it; otherwise 46
 *  items would be refused by the record alone and those tests would prove nothing. The multi-flag
 *  test below reads the full verdict. */
const verdictOf = (it: SetItem) => {
  const v = fullVerdictOf(it)
  const errors = v.errors.filter((e) => e.check !== 'multi-flag')
  return { ...v, errors, pass: errors.length === 0 }
}
const checksOf = (it: SetItem) => [...new Set(verdictOf(it).errors.map((e) => e.check))]
const bandCount = (it: SetItem) => fixtures[it.fixture].band.length

/** The residual: hazard items built only from their cited lines' own words. Named here so a
 *  change to what code catches shows in review. */
const RESIDUAL = ['res-omit-a', 'res-order-a', 'res-order-b']

Deno.test('fixtures: each committed payload is the one the report code builds today', async () => {
  for (const [name, payload] of Object.entries(built)) {
    const committed = await Deno.readTextFile(new URL(`fixtures/${name}.json`, DIR))
    assert.equal(committed, `${JSON.stringify(payload, null, 1)}\n`, `fixtures/${name}.json has drifted; regenerate it from adversarialFixtures()`)
  }
})

Deno.test('the set is well formed and covers every source it names', () => {
  assert.equal(set.verifier, LEAD_VERIFIER_VERSION, 'the set was checked against another verifier version')
  const all = [...set.items, ...set.controls]
  assert.equal(new Set(all.map((i) => i.id)).size, all.length, 'ids are unique')
  for (const it of all) assert.ok(it.fixture in fixtures, `${it.id}: unknown fixture ${it.fixture}`)
  for (const it of set.items) {
    assert.equal(it.expect.checker, 'reject', `${it.id}: every hazard item expects the checker to reject it`)
    assert.ok(it.hazard && it.class && it.level, `${it.id}: hazard, class and level`)
  }
  for (const c of set.controls) assert.deepEqual(c.expect, { verifier: 'pass', checker: 'pass' }, c.id)
  for (const src of ['adversarialPass1.test.ts', 'adversarialPass2.test.ts', 'adversarialPass3.test.ts', 'checkerRegression.test.ts']) {
    assert.ok(set.items.filter((i) => i.source.startsWith(src)).length >= 3, `fewer than 3 items from ${src}`)
  }
  for (const cls of ['softening', 'deferral', 'reassurance', 'recombined', 'calm-band']) {
    assert.ok(set.items.some((i) => i.class === cls), `no item of class ${cls}`)
  }
  assert.ok(set.items.length >= 50 && set.controls.length >= 10, `${set.items.length} items, ${set.controls.length} controls`)
})

Deno.test('every hazard item marked refuse is refused by the shipped verifier', () => {
  const printed = set.items.filter((i) => i.expect.verifier === 'refuse' && verdictOf(i).pass).map((i) => i.id)
  assert.deepEqual(printed, [], 'these would print: the protocol\'s stop (3)')
})

Deno.test('every control prints', () => {
  for (const c of set.controls) assert.deepEqual(verdictOf(c).errors, [], c.id)
})

Deno.test('the residual is exactly the items only the checker can catch', () => {
  const passing = set.items.filter((i) => i.expect.verifier === 'pass')
  assert.deepEqual(passing.map((i) => i.id), RESIDUAL)
  for (const it of passing) assert.deepEqual(verdictOf(it).errors, [], `${it.id} is now refused by code: mark it refuse`)
})

Deno.test('mutation proof: each closed_by item is refused by those rules alone', () => {
  const closed = set.items.filter((i) => i.closed_by)
  for (const it of closed) {
    const checks = checksOf(it)
    assert.ok(checks.length > 0 && checks.every((c) => it.closed_by!.includes(c)), `${it.id}: refused by ${checks}, not only ${it.closed_by}`)
  }
  for (const rule of ['vocabulary', 'negation', 'script', 'tense', 'intake-positive', 'date-anchor', 'own-sign']) {
    assert.ok(closed.some((i) => i.closed_by!.length === 1 && i.closed_by![0] === rule), `no item that ${rule} alone refuses`)
  }
})

Deno.test('CUL-2548: every item band-first refuses, the checker rejects too, whatever its model says', () => {
  const clean = parseChecker({ takeaway: 'x', hazards: Object.fromEntries(HAZARDS.map((h) => [h, { level: 'none', quote: '', why: '' }])), omissions: [] })!
  const order = set.items.filter((i) => checksOf(i).includes('band-first'))
  // The four the set writes as band-order hazards are among them (cr-a is the smoke bake-off's miss).
  for (const id of ['cr-a', 'cr-b', 'p1-b1-a', 'p1-b1-b']) assert.ok(order.some((i) => i.id === id), `${id} is refused by band-first`)
  for (const it of order) {
    assert.equal(checkerDecision(clean, { table: tableFromPayload(fixtures[it.fixture]), draft: { sentences: it.sentences } }), 'reject', it.id)
  }
  // And no control is rejected by the code half on a record a lead may print on: there it reads
  // order, nothing else. On a multi-flag record it rejects every control (CUL-2563, below).
  for (const c of set.controls) {
    const want = bandCount(c) >= MULTI_FLAG_MIN_BAND ? 'reject' : 'pass'
    assert.equal(checkerDecision(clean, { table: tableFromPayload(fixtures[c.fixture]), draft: { sentences: c.sentences } }), want, c.id)
  }
})

Deno.test('CUL-2563: on a fixture with 2+ band items every item and control is refused, by the verifier and the checker', () => {
  const clean = parseChecker({ takeaway: 'x', hazards: Object.fromEntries(HAZARDS.map((h) => [h, { level: 'none', quote: '', why: '' }])), omissions: [] })!
  const multi = [...set.items, ...set.controls].filter((i) => bandCount(i) >= MULTI_FLAG_MIN_BAND)
  // nyx-v2 (6 band items) and bakeoff-nyx (3): the re-run's worst instance is among them.
  assert.deepEqual([...new Set(multi.map((i) => i.fixture))].sort(), ['bakeoff-nyx', 'nyx-v2'])
  for (const it of multi) {
    const v = fullVerdictOf(it)
    assert.equal(v.pass, false, it.id)
    assert.ok(v.errors.some((e) => e.check === 'multi-flag'), it.id)
    assert.equal(checkerDecision(clean, { table: tableFromPayload(fixtures[it.fixture]), draft: { sentences: it.sentences } }), 'reject', it.id)
  }
  // And on a 0- or 1-flag fixture the rule never fires: every such control prints in full.
  for (const c of set.controls.filter((i) => bandCount(i) < MULTI_FLAG_MIN_BAND)) assert.deepEqual(fullVerdictOf(c).errors, [], c.id)
})
