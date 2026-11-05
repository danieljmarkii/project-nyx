// The AI lead's fact table (CUL-2305, spec §9.1, R-12): what it reads, what it refuses, and
// that what it builds is what the payload allowlist accepts.
import assert from 'node:assert/strict'
import { checkSummaryPayload, OWNER_WORDS_KEYS } from '../../_shared/reportSummaryGate.ts'
import { buildDocumentV2, textOf, type DocumentV2 } from '../documentV2.ts'
import { assembleReport, type ReportSnapshot } from '../report.ts'
import { cooperInput } from '../cooperDemo.testutil.ts'
import { nyxLiveSnapshot } from '../nyxLive.testutil.ts'
import { juniper } from '../v2Fixtures.testutil.ts'
import { bottomLineId, buildLeadFacts, canonicalJson, factTableHash, trialReadingSentences } from './facts.ts'

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

Deno.test('the band leads the payload in the order sheet 1 prints it, with each item\'s label (CUL-2532)', () => {
  const doc = buildDocumentV2(nyx, OPTS)
  const band = doc.blocks.find((b) => b.kind === 'band')
  if (!band || band.kind !== 'band') throw new Error('the Nyx record has a band')
  const f = eligible(doc, nyx)
  // CUL-2381 ruling (a) prints burden, weight loss and intake decline first; band item 1 of the lead
  // is the band's first PRINTED row, so band-first opens the lead where the band opens.
  assert.deepEqual(f.payload.band.map((b) => [b.id, b.label]), band.items.map((i) => [i.id, i.tag]))
  const bySnapshot = [...band.items].sort((a, b) => Number(/^band-(\d+)-/.exec(a.id)![1]) - Number(/^band-(\d+)-/.exec(b.id)![1]))
  assert.notDeepEqual(bySnapshot.map((i) => i.id), band.items.map((i) => i.id), 'Nyx exercises the reorder')
  assert.equal(f.payload.band[0].label, 'Burden')
  assert.equal(f.table.safety_live, true)
  assert.equal(f.table.facts.find((x) => x.id === band.items[0].id)?.required, true)
  assert.equal(f.table.facts.filter((x) => x.role === 'band' && x.required).length, 1)
})

Deno.test('sheet 1\'s trial reading goes in, sentence by sentence, its bottom line required (CUL-2532)', () => {
  for (const s of [cooper, nyx]) {
    const doc = buildDocumentV2(s, OPTS)
    const reading = doc.blocks.find((b) => b.kind === 'trial_reading')
    if (!reading || reading.kind !== 'trial_reading' || !reading.html) throw new Error(`${s.signalment.name} prints a trial reading`)
    const f = eligible(doc, s)
    const lines = f.payload.record_lines.filter((l) => l.kind === 'trial_reading')
    assert.ok(lines.length > 1, 'one line per sentence')
    // Word for word: the sentences joined are the callout's text.
    assert.equal(lines.map((l) => l.text).join(' '), textOf(reading.html).trim().replace(/\s+/g, ' ').replace(/\s+(?=\S)/g, ' '))
    const required = f.table.facts.filter((x) => x.id.startsWith('trial-reading-') && x.required)
    assert.equal(required.length, 1)
    assert.match(String(required[0].text), /^The trial diet was not fed exclusively/)
    assert.ok(required[0].must_say?.some((g) => g.includes('not fed exclusively')))
    // The confounder is required beside the trial (the smoke bake-off's commonest omission).
    assert.equal(f.table.facts.find((x) => x.id === 'confounder')?.required, true)
  }
})

Deno.test('the bottom line falls back to "cannot be confirmed clean" when the diet was not shown broken', () => {
  const lines = [
    { id: 'trial-reading-1', kind: 'trial_reading', text: 'No allowed-food list is recorded, so nothing here has been checked against the trial.' },
    { id: 'trial-reading-2', kind: 'trial_reading', text: 'For part of this window no trial diet was recorded, so the elimination cannot be confirmed clean from this record.' },
  ]
  assert.equal(bottomLineId(lines), 'trial-reading-2')
  assert.equal(bottomLineId([lines[0]]), 'trial-reading-1')
  assert.equal(bottomLineId([]), null)
  assert.deepEqual(trialReadingSentences('One (a, b). Two 2.5 kg. Three.'), ['One (a, b).', 'Two 2.5 kg.', 'Three.'])
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
