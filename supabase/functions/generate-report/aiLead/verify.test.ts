// The v2 lead verifier (CUL-2305, spec §9.1). Each rule is driven through `verifyLead` on a table
// production would build (`buildLeadFacts` over a real document, or `tableFromPayload`), and each
// is proven by a sentence that breaks only that rule.
import assert from 'node:assert/strict'
import { buildDocumentV2 } from '../documentV2.ts'
import { nyxLiveSnapshot } from '../nyxLive.testutil.ts'
import { buildLeadFacts, tableFromPayload, type LeadFactPayload } from './facts.ts'
import { WRITER_SYSTEM } from './prompts.ts'
import { printedLeadText, verifyLead, type LeadSentence } from './verify.ts'

const nyxSnap = nyxLiveSnapshot()
const nyxFacts = buildLeadFacts(buildDocumentV2(nyxSnap, { owner: null, shortId: null, questions: [] }), {
  petName: nyxSnap.signalment.name,
  species: nyxSnap.signalment.species,
  recordStart: nyxSnap.scope.startDate,
  recordEnd: nyxSnap.scope.endDate,
  includeLookNotes: false,
})
if (!nyxFacts.eligible) throw new Error('the live Nyx record is eligible for a lead')
const nyxTable = nyxFacts.table

const GOOD: LeadSentence[] = [
  { text: 'Foreign material is a live flag: 1 vomiting incident on Sep 22 showed possible foreign material on automated photo analysis, an AI read, unconfirmed.', cites: ['band-1-present_foreign'] },
  { text: 'Vomiting: 16 entries on 12 of 45 logged days, the last Oct 31.', cites: ['line-1'] },
  { text: 'The owner-entered diet trial, Royal Canin Selected Protein PR, Dry and 5 other trial foods, ran Jul 26, 2026 to Oct 20, 2026.', cites: ['trial'] },
]

function checks(sentences: LeadSentence[], table = nyxTable): string[] {
  return verifyLead(table, { sentences }).errors.map((e) => e.check)
}

Deno.test('a careful three-sentence lead over the live Nyx record passes', () => {
  const v = verifyLead(nyxTable, { sentences: GOOD })
  assert.deepEqual(v.errors, [])
  assert.equal(v.pass, true)
})

Deno.test('structure: four sentences, or more than 60 words in all, reject', () => {
  assert.ok(checks([...GOOD, { text: 'Vomiting was logged on 12 of 45 logged days.', cites: ['line-1'] }]).includes('structure'))
  const long = { ...GOOD[1], text: `${GOOD[1].text.slice(0, -1)}, with 16 entries on 12 of 45 logged days and 16 entries on 12 of 45 logged days.` }
  assert.ok(checks([GOOD[0], long, GOOD[2]]).includes('structure'))
})

Deno.test('quotes: any quotation mark rejects, owner words or not', () => {
  const quoted = { ...GOOD[1], text: 'Vomiting: 16 entries on 12 of 45 logged days, the “last” Oct 31.' }
  assert.ok(checks([GOOD[0], quoted, GOOD[2]]).includes('quotes'))
})

Deno.test('band-first: band item 1 must lead, cited, its label in the first clause', () => {
  assert.ok(checks([GOOD[1], GOOD[0], GOOD[2]]).includes('band-first'))
  const buried = { ...GOOD[0], text: 'On Sep 22, 1 vomiting incident showed possible foreign material on automated photo analysis, an AI read, unconfirmed.' }
  assert.ok(checks([buried, GOOD[1], GOOD[2]]).includes('band-first'))
  const uncited = { ...GOOD[0], cites: ['line-1'] }
  assert.ok(checks([uncited, GOOD[1], GOOD[2]]).includes('band-first'))
})

Deno.test('band-once: the band is restated in one sentence, no more', () => {
  const again = { ...GOOD[1], cites: ['line-1', 'band-2-trial_diet_refusal'] }
  assert.ok(checks([GOOD[0], again, GOOD[2]]).includes('band-once'))
})

Deno.test('scope: a cited line that says unconfirmed is never cited without it', () => {
  const bare = { ...GOOD[0], text: 'Foreign material is a live flag: 1 vomiting incident on Sep 22 showed possible foreign material on automated photo analysis.' }
  assert.ok(checks([bare, GOOD[1], GOOD[2]]).includes('required-clause'))
})

Deno.test('required: the trial line must be cited when there is one', () => {
  assert.ok(checks([GOOD[0], GOOD[1]]).includes('required'))
})

Deno.test('names: a product the facts never print rejects, whatever its words', () => {
  const invented = { ...GOOD[2], text: 'The owner-entered diet trial was Hydrolyzed Formula Zeta and 5 other trial foods, from Jul 26, 2026 to Oct 20, 2026.' }
  assert.ok(checks([GOOD[0], GOOD[1], invented]).includes('names'))
})

Deno.test('period-run: three period counts in a row reject', () => {
  const run = { ...GOOD[1], text: 'Vomiting was logged 16 times, 4 in week 1, 5 in week 2 and 7 in week 3.' }
  assert.ok(checks([GOOD[0], run, GOOD[2]]).includes('period-run'))
})

// ── H2 by order: the Data Scientist's exhibit (CUL-2305 comment, 2026-10-31) ────────────────────

/** The live Nyx render's shape, with the engine's new-foods window as its own line. */
const H2_PAYLOAD: LeadFactPayload = {
  pet_name: 'Nyx',
  species: 'cat',
  record_start: '2026-09-17',
  record_end: '2026-10-31',
  band: [],
  record_lines: [
    { id: 'line-1', kind: 'lead', text: 'Vomiting: 6 entries on 4 days from Oct 26 to Oct 31, and 0 entries Oct 19 to Oct 25.' },
    { id: 'new-foods', kind: 'record', text: 'Chicken foods first fed Oct 21; vomiting on 4 days Oct 26 to Oct 31, side by side, not as a cause.' },
  ],
  trial_line: { id: 'trial', text: 'Diet trial (owner-entered): Rabbit diet, from Sep 17, 2026, ended Oct 20, 2026.' },
  record_edge: [],
}
const H2_TABLE = tableFromPayload(H2_PAYLOAD)

Deno.test('H2 exhibit: every number true, no causal word, cause by order: rejected', () => {
  const exhibit: LeadSentence = {
    text: 'The rabbit trial ended Oct 20; chicken foods were first fed Oct 21, and after no vomiting Oct 19 to Oct 25, 6 entries followed on 4 days to Oct 31.',
    cites: ['trial', 'line-1', 'new-foods'],
  }
  const errors = checks([exhibit], H2_TABLE)
  assert.ok(errors.includes('order'), `expected the order rule: ${errors}`)
})

Deno.test('H2 exhibit without its one banned phrase: the order rule alone still rejects it', () => {
  // "no vomiting" is H4 to the core; take it out and the sentence's shape is the hazard.
  const stripped: LeadSentence = {
    text: 'The rabbit trial ended Oct 20; chicken foods were first fed Oct 21, and 6 entries followed on 4 days from Oct 26 to Oct 31.',
    cites: ['trial', 'line-1', 'new-foods'],
  }
  const errors = checks([stripped], H2_TABLE)
  assert.deepEqual(errors.filter((c) => c.startsWith('banned')), [])
  assert.ok(errors.includes('order'))
})

Deno.test('H2 exhibit fixed: the new-foods window side by side, not as a cause, passes', () => {
  const fixed: LeadSentence[] = [
    { text: 'The owner-entered diet trial was Rabbit diet, from Sep 17, 2026 to Oct 20, 2026.', cites: ['trial'] },
    { text: 'Chicken foods were first fed Oct 21; vomiting on 4 days Oct 26 to Oct 31 is set side by side, not as a cause.', cites: ['new-foods'] },
  ]
  assert.deepEqual(verifyLead(H2_TABLE, { sentences: fixed }).errors, [])
})

Deno.test('the waiver is narrow: another cause word beside "not as a cause" still rejects', () => {
  const sneaky: LeadSentence[] = [
    { text: 'The owner-entered diet trial was Rabbit diet, from Sep 17, 2026 to Oct 20, 2026.', cites: ['trial'] },
    { text: 'Chicken foods were first fed Oct 21 and caused vomiting on 4 days Oct 26 to Oct 31, side by side, not as a cause.', cites: ['new-foods'] },
  ]
  assert.ok(checks(sneaky, H2_TABLE).includes('banned:H2'))
  const uncited: LeadSentence[] = [sneaky[0], { text: 'Vomiting: 6 entries on 4 days from Oct 26 to Oct 31, not as a cause.', cites: ['line-1'] }]
  assert.ok(checks(uncited, H2_TABLE).includes('banned:H2'))
})

Deno.test('the order rule needs both sides: a trial alone may say ended', () => {
  const alone: LeadSentence[] = [{ text: 'The owner-entered diet trial was Rabbit diet, from Sep 17, 2026, and it ended Oct 20, 2026.', cites: ['trial'] }]
  assert.deepEqual(checks(alone, H2_TABLE).filter((c) => c === 'order'), [])
})

// ── The writer prompt's worked example passes its own verifier ──────────────────────────────────

Deno.test('the prompt\'s worked example passes the verifier it teaches', () => {
  const body = WRITER_SYSTEM.slice(WRITER_SYSTEM.indexOf('Fact table:\n') + 'Fact table:\n'.length)
  const table = JSON.parse(body.slice(0, body.indexOf('\nOutput:'))) as LeadFactPayload
  const out = JSON.parse(body.slice(body.indexOf('Output:\n') + 'Output:\n'.length, body.indexOf('\nWhy it works'))) as { sentences: LeadSentence[] }
  assert.deepEqual(verifyLead(tableFromPayload(table), out).errors, [])
})

Deno.test('the printed text is the sentences, normalised, joined by one space', () => {
  assert.equal(printedLeadText({ sentences: [{ text: ' A  b. ', cites: [] }, { text: 'C.', cites: [] }] }), 'A b. C.')
})
