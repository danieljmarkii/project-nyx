// The AI lead's print slot (CUL-2305, spec §5.3, §9.1, §9.2): the band never moves, the printed
// words are the verified words, line 1 drops to body, and no lead means byte-for-byte v2.
import assert from 'node:assert/strict'
import { buildDocumentV2, textOf } from '../documentV2.ts'
import { nyxLiveSnapshot } from '../nyxLive.testutil.ts'
import { AI_LEAD_LABEL, blockIdsOf, renderPrintV2 } from '../renderPrintV2.ts'
import { printedLeadText, type LeadSentence } from './verify.ts'

const doc = buildDocumentV2(nyxLiveSnapshot(), { owner: null, shortId: null, questions: [] })
const LEAD: LeadSentence[] = [
  { text: 'Foreign material is a live flag: 1 vomiting incident on Sep 22 showed possible foreign material on automated photo analysis, an AI read, unconfirmed.', cites: ['band-1-present_foreign'] },
  { text: 'Vomiting: 16 entries on 12 of 45 logged days, the last Oct 31.', cites: ['line-1'] },
]
const without = renderPrintV2(doc)
const withLead = renderPrintV2(doc, LEAD)

Deno.test('no lead renders exactly as before (the default is no lead)', () => {
  assert.equal(renderPrintV2(doc, null), without)
  assert.equal(renderPrintV2(doc, []), without)
})

Deno.test('the band never moves: everything before the lead slot is byte-identical', () => {
  const cut = without.indexOf('data-block="lead-sentence"')
  const head = without.slice(0, without.lastIndexOf('<', cut))
  assert.ok(head.includes('data-block="band"'))
  assert.ok(withLead.startsWith(head))
})

Deno.test('the printed words are the verified words, under the label, before line 1 in body type', () => {
  const slot = withLead.slice(withLead.indexOf('data-block="ai-lead"'), withLead.indexOf('</section>', withLead.indexOf('data-block="ai-lead"')))
  const spoken = [...slot.matchAll(/<span class="ais">([\s\S]*?)<\/span>/g)].map((m) => textOf(m[1]))
  assert.equal(spoken.join(' '), printedLeadText({ sentences: LEAD }))
  assert.ok(slot.includes(AI_LEAD_LABEL) && slot.includes('beta'))
  assert.ok(slot.includes('Flag: foreign material'), 'citations print the lines\' own nouns')
  const ids = blockIdsOf(withLead)
  assert.equal(ids.indexOf('ai-lead') + 1, ids.indexOf('lead-sentence'))
  assert.match(withLead, /<p class="lede body" data-block="lead-sentence">/)
  assert.equal((withLead.match(/class="lede serif"/g) ?? []).length, 1, 'one serif sentence per sheet')
})

Deno.test('the lead is unboxed: the frame is the band\'s register', () => {
  const css = withLead.slice(withLead.indexOf('<style>'), withLead.indexOf('</style>'))
  const rule = css.match(/\.ailead\{[^}]*\}/)?.[0] ?? ''
  assert.ok(!/border/.test(rule))
})
