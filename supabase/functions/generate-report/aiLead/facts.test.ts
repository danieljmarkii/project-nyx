// The AI lead's fact table (CUL-2305, spec §9.1, R-12): what it reads, what it refuses, and
// that what it builds is what the payload allowlist accepts.
import assert from 'node:assert/strict'
import { checkSummaryPayload, OWNER_WORDS_KEYS } from '../../_shared/reportSummaryGate.ts'
import { buildDocumentV2, type DocumentV2 } from '../documentV2.ts'
import { assembleReport, type ReportSnapshot } from '../report.ts'
import { cooperInput } from '../cooperDemo.testutil.ts'
import { nyxLiveSnapshot } from '../nyxLive.testutil.ts'
import { juniper } from '../v2Fixtures.testutil.ts'
import { buildLeadFacts, canonicalJson, factTableHash } from './facts.ts'

const OPTS = { owner: null, shortId: null, questions: [] as string[] }
const ctxOf = (s: ReportSnapshot) => ({
  petName: s.signalment.name,
  species: s.signalment.species,
  recordStart: s.scope.startDate,
  recordEnd: s.scope.endDate,
  includeLookNotes: false,
})
const cooper = assembleReport({ ...cooperInput(), audience: { kind: 'owner', includeLookNotes: false } })
const nyx = nyxLiveSnapshot()

function eligible(doc: DocumentV2, s: ReportSnapshot) {
  const f = buildLeadFacts(doc, ctxOf(s))
  if (!f.eligible) throw new Error(`not eligible: ${f.reason}`)
  return f
}

Deno.test('every fixture payload passes the payload allowlist, and carries no owner-words key', () => {
  for (const s of [cooper, nyx]) {
    const f = eligible(buildDocumentV2(s, OPTS), s)
    assert.deepEqual(checkSummaryPayload(f.payload), { ok: true })
    const keys = canonicalJson(f.payload).match(/"([a-z_]+)":/g) ?? []
    for (const k of keys) assert.ok(!OWNER_WORDS_KEYS.has(k.slice(1, -2)), k)
  }
})

Deno.test('the band leads the payload in the band\'s order, with each item\'s label', () => {
  const doc = buildDocumentV2(nyx, OPTS)
  const band = doc.blocks.find((b) => b.kind === 'band')
  if (!band || band.kind !== 'band') throw new Error('the Nyx record has a band')
  const f = eligible(doc, nyx)
  assert.deepEqual(f.payload.band.map((b) => [b.id, b.label]), band.items.map((i) => [i.id, i.tag]))
  assert.equal(f.table.safety_live, true)
  assert.equal(f.table.facts.find((x) => x.id === band.items[0].id)?.required, true)
})

Deno.test('line 1 and the record lines go in; the gap lines and the owner\'s questions never do', () => {
  const doc = buildDocumentV2(nyx, OPTS)
  const f = eligible(doc, nyx)
  const lead = doc.blocks.find((b) => b.kind === 'lead_sentence')
  assert.ok(lead && lead.kind === 'lead_sentence')
  assert.equal(f.payload.record_lines[0].text, lead.text)
  const gaps = doc.blocks.find((b) => b.kind === 'gap_lines')
  assert.ok(gaps && gaps.kind === 'gap_lines')
  const sent = canonicalJson(f.payload)
  for (const g of gaps.lines) assert.ok(!sent.includes(g.text), `gap line sent: ${g.text}`)
  assert.equal(f.payload.trial_line?.id, 'trial')
  assert.equal(f.table.facts.find((x) => x.id === 'trial')?.required, true)
})

Deno.test('a document carrying the owner\'s questions, or a snapshot with look notes, is refused', () => {
  const withQs = buildDocumentV2(nyx, { ...OPTS, questions: ['Is the new food making her sick?'] })
  assert.throws(() => buildLeadFacts(withQs, ctxOf(nyx)))
  assert.throws(() => buildLeadFacts(buildDocumentV2(nyx, OPTS), { ...ctxOf(nyx), includeLookNotes: true }))
})

Deno.test('a thin record gets no lead (spec §5.1: the lead is suppressed)', () => {
  const s = assembleReport(juniper())
  const f = buildLeadFacts(buildDocumentV2(s, OPTS), ctxOf(s))
  assert.deepEqual(f, { eligible: false, reason: 'thin_record' })
})

Deno.test('the hash is stable for the same facts and moves with any fact', async () => {
  const f = eligible(buildDocumentV2(nyx, OPTS), nyx)
  const a = await factTableHash(f.payload, 'vr2-1')
  assert.equal(a, await factTableHash(structuredClone(f.payload), 'vr2-1'))
  assert.match(a, /^[0-9a-f]{64}$/)
  const moved = { ...f.payload, record_lines: [{ ...f.payload.record_lines[0], text: `${f.payload.record_lines[0].text} ` }, ...f.payload.record_lines.slice(1)] }
  assert.notEqual(a, await factTableHash(moved, 'vr2-1'))
  assert.notEqual(a, await factTableHash(f.payload, 'vr2-2'))
})

Deno.test('canonical JSON sorts keys at every depth', () => {
  assert.equal(canonicalJson({ b: 1, a: [{ d: 2, c: 3 }] }), '{"a":[{"c":3,"d":2}],"b":1}')
})
