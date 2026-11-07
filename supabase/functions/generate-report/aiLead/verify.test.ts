// The v2 lead verifier (CUL-2305, spec §9.1). Each rule is driven through `verifyLead` on a table
// production would build (`buildLeadFacts` over a real document, or `tableFromPayload`), and each
// is proven by a sentence that breaks only that rule.
import assert from 'node:assert/strict'
import { buildDocumentV2 } from '../documentV2.ts'
import { nyxLiveSnapshot } from '../nyxLive.testutil.ts'
import { buildLeadFacts, documentForLead, tableFromPayload, type LeadFactPayload } from './facts.ts'
import { WRITER_SYSTEM } from './prompts.ts'
import { framePatternHits, LEAD_FRAME, LIVE_FLAG_MIN_BAND, liveFlagIssues, OWN_SIGN_PHRASE, ownSignIssues, printedLeadText, printsOwnSign, verifyLead, type LeadSentence } from './verify.ts'
import { assembleReport } from '../report.ts'
import { itchingSkinTrial } from '../v2Fixtures.testutil.ts'
import { checkerDecision, parseChecker } from './leadPipeline.ts'
import { HAZARDS } from './prompts.ts'

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

// Band item 1 is the band's first PRINTED row: on Nyx, the present foreign-material flag (CUL-2627
// ruling (a), ahead of CUL-2381's burden; CUL-2532). The trial sentence carries the reading's bottom
// line and the confounder, both required beside it.
const GOOD: LeadSentence[] = [
  { text: 'Foreign material is a live flag: 1 vomiting incident (Sep 22), possible foreign material, AI read, unconfirmed.', cites: ['band-1-present_foreign'] },
  { text: 'Vomiting: 16 entries on 12 of 45 logged days, the last Oct 31.', cites: ['line-1'] },
  { text: 'The owner-entered diet trial, Royal Canin Selected Protein PR, Dry and 5 other trial foods, ran Jul 26, 2026 to Oct 20, 2026; the trial diet was not fed exclusively, and it is not a test of the diet alone.', cites: ['trial', 'trial-reading-3', 'confounder'] },
]

/** The sentence rules' verdict. Every record with a live band item gets no lead (`live-flag`, a rule
 *  on the record, never on a sentence; CUL-2621 ruling (c), widening CUL-2563's (b)), so it refuses
 *  every lead on the live Nyx record and on r11. The rule tests below each break one SENTENCE rule,
 *  which stay on as the second net, so they read the sentence rules without it. The live-flag tests
 *  read `verifyLead` directly. */
function sentenceVerdict(table: Parameters<typeof verifyLead>[0], summary: Parameters<typeof verifyLead>[1]) {
  const v = verifyLead(table, summary)
  const errors = v.errors.filter((e) => e.check !== 'live-flag')
  return { ...v, errors, pass: errors.length === 0 }
}
function checks(sentences: LeadSentence[], table = nyxTable): string[] {
  return sentenceVerdict(table, { sentences }).errors.map((e) => e.check)
}

Deno.test('a careful three-sentence lead over the live Nyx record passes every sentence rule', () => {
  assert.deepEqual(checks(GOOD), [])
})

Deno.test('structure: four sentences, or more than 80 words in all, reject', () => {
  assert.ok(checks([...GOOD, { text: 'Vomiting was logged on 12 of 45 logged days.', cites: ['line-1'] }]).includes('structure'))
  const long = { ...GOOD[1], text: `${GOOD[1].text.slice(0, -1)}, with 16 entries on 12 of 45 logged days and 16 entries on 12 of 45 logged days and 16 entries on 12 of 45 logged days.` }
  assert.ok(checks([GOOD[0], long, GOOD[2]]).includes('structure'))
})

Deno.test('quotes: any quotation mark rejects, owner words or not', () => {
  const quoted = { ...GOOD[1], text: 'Vomiting: 16 entries on 12 of 45 logged days, the “last” Oct 31.' }
  assert.ok(checks([GOOD[0], quoted, GOOD[2]]).includes('quotes'))
})

Deno.test('band-first: band item 1 must lead, cited, its label in the first clause', () => {
  assert.ok(checks([GOOD[1], GOOD[0], GOOD[2]]).includes('band-first'))
  const buried = { ...GOOD[0], text: 'On Sep 22, 1 vomiting incident, possible foreign material, AI read, unconfirmed.' }
  assert.ok(checks([buried, GOOD[1], GOOD[2]]).includes('band-first'))
  const uncited = { ...GOOD[0], cites: ['line-1'] }
  assert.ok(checks([uncited, GOOD[1], GOOD[2]]).includes('band-first'))
})

Deno.test('band-once: the band is restated in one sentence, no more', () => {
  const again = { ...GOOD[1], cites: ['line-1', 'band-2-trial_diet_refusal'] }
  assert.ok(checks([GOOD[0], again, GOOD[2]]).includes('band-once'))
})

Deno.test('scope: a cited line\'s scope words are never dropped (the confounder, the trial\'s bottom line)', () => {
  const noConfounderScope = { ...GOOD[2], text: GOOD[2].text.replace(', and it is not a test of the diet alone', ', and Prednisolone overlapped') }
  assert.ok(checks([GOOD[0], GOOD[1], noConfounderScope]).includes('required-clause'))
  const noBottomLine = { ...GOOD[2], text: GOOD[2].text.replace('the trial diet was not fed exclusively, and ', '') }
  assert.ok(checks([GOOD[0], GOOD[1], noBottomLine]).includes('required-clause'))
})

Deno.test('required: with a trial, the reading\'s bottom line and the confounder are cited (CUL-2532)', () => {
  const trialAlone = { text: 'The owner-entered diet trial, Royal Canin Selected Protein PR, Dry and 5 other trial foods, ran Jul 26, 2026 to Oct 20, 2026.', cites: ['trial'] }
  const v = sentenceVerdict(nyxTable, { sentences: [GOOD[0], GOOD[1], trialAlone] })
  assert.deepEqual(v.errors.filter((e) => e.check === 'required').map((e) => e.detail.split(' ')[2]).sort(), ['confounder', 'trial-reading-3'])
})

Deno.test('waivers are narrow: "not fed exclusively" and "cannot be confirmed clean" pass, a bare "clean" does not', () => {
  const clean = { ...GOOD[2], text: GOOD[2].text.replace('the trial diet was not fed exclusively', 'the trial diet was clean') }
  assert.ok(checks([GOOD[0], GOOD[1], clean]).includes('banned:H1'))
  const twice = { ...GOOD[2], text: GOOD[2].text.replace('not fed exclusively', 'not fed exclusively, fed exclusively') }
  assert.ok(checks([GOOD[0], GOOD[1], twice]).includes('banned:H1'))
  // The waived phrase must be printed in a cited line: not cited, not waived.
  const uncited = { ...GOOD[2], cites: ['trial', 'confounder'] }
  assert.ok(checks([GOOD[0], GOOD[1], uncited]).includes('banned:H1'))
})

Deno.test('tense: a reading\'s own past tense passes; a flag set in the past beside it does not', () => {
  const flagPast = { ...GOOD[2], text: `${GOOD[2].text.slice(0, -1)}, and the flag was over.` }
  assert.ok(checks([GOOD[0], GOOD[1], flagPast]).includes('tense'))
  // Beside a band citation the reading's "was" is never excused.
  const withBand = { ...GOOD[2], cites: [...GOOD[2].cites, 'band-2-trial_diet_refusal'] }
  assert.ok(checks([GOOD[0], GOOD[1], withBand]).includes('tense'))
})

Deno.test('floor: a count kept from a floor line keeps "a floor, not a total"', () => {
  const counted = { ...GOOD[2], text: GOOD[2].text.replace('the trial diet was not fed exclusively', 'the trial diet was not fed exclusively: 11 of 167 feedings did not match it') }
  assert.ok(checks([GOOD[0], GOOD[1], counted]).includes('floor'))
  const floored = { ...GOOD[2], text: GOOD[2].text.replace('the trial diet was not fed exclusively', 'the trial diet was not fed exclusively: 11 of 167 feedings did not match it, a floor, not a total') }
  assert.ok(!checks([GOOD[0], GOOD[1], floored]).includes('floor'))
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

/** The H2 exhibit fixed: band empty, so the full verdict applies (the live-flag test reads it too). */
const H2_CAREFUL: LeadSentence[] = [
  { text: 'The owner-entered diet trial was Rabbit diet, from Sep 17, 2026 to Oct 20, 2026.', cites: ['trial'] },
  { text: 'Chicken foods were first fed Oct 21; vomiting on 4 days Oct 26 to Oct 31 is set side by side, not as a cause.', cites: ['new-foods'] },
]

Deno.test('H2 exhibit fixed: the new-foods window side by side, not as a cause, passes', () => {
  assert.deepEqual(verifyLead(H2_TABLE, { sentences: H2_CAREFUL }).errors, [])
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
  assert.deepEqual(sentenceVerdict(tableFromPayload(table), out).errors, [])
})

Deno.test('the printed text is the sentences, normalised, joined by one space', () => {
  assert.equal(printedLeadText({ sentences: [{ text: ' A  b. ', cites: [] }, { text: 'C.', cites: [] }] }), 'A b. C.')
})

// ── The closed vocabulary and bound negation (CUL-2380) ─────────────────────────────────────────

Deno.test('the frame is pinned, and no frame word can soften, time, defer or negate', () => {
  // A word added here must be added in review, against this list: the frame is the one place a
  // lead may print a word no cited line carries.
  assert.deepEqual([...LEAD_FRAME], [
    'a', 'an', 'the', 'and', 'of', 'to', 'at', 'on', 'in', 'by', 'for', 'from', 'as', 'with', 'over',
    'is', 'are', 'was', 'were', 'be', 'been', 'has', 'have', 'had',
    'live', 'flag', 'showed', 'ran',
    'set',
  ])
  for (const w of LEAD_FRAME) assert.deepEqual(framePatternHits(w), [], `frame word ${w}`)
  // The probe is not deaf: it sees the words it exists to keep out.
  for (const w of ['stopped', 'after', 'eaten', 'five', 'not', "hasn't"]) assert.notDeepEqual(framePatternHits(w), [], w)
})

Deno.test('vocabulary: a softening word no list names is refused because no cited line prints it', () => {
  // Two sentences, so the trial line's absence is the only other error ('required').
  const quieter = { ...GOOD[1], text: 'Vomiting: 16 entries on 12 of 45 logged days, the last Oct 31, quietening.' }
  const v = sentenceVerdict(nyxTable, { sentences: [GOOD[0], quieter] })
  assert.deepEqual([...new Set(v.errors.map((e) => e.check))].filter((c) => c !== 'required' && c !== 'live-flag'), ['vocabulary'])
  assert.ok(v.errors.some((e) => e.detail.includes('"quietening"')))
  assert.deepEqual(checks([GOOD[0], GOOD[1]]).filter((c) => c !== 'required'), [], 'the same lead without the word passes')
})

Deno.test('vocabulary: a word another line prints is not licensed by citing this one', () => {
  // "overstated" is printed in the vomiting chronicity row, never in the foreign-material row.
  const borrowed = { ...GOOD[0], text: 'Foreign material is a live flag: 1 vomiting incident on Sep 22 showed possible foreign material on automated photo analysis, an AI read, unconfirmed, overstated.' }
  assert.ok(checks([borrowed, GOOD[1], GOOD[2]]).includes('vocabulary'))
})

Deno.test('vocabulary: the pet\'s name, a possessive and a band label are known; a compound passes by its parts', () => {
  const named = { ...GOOD[1], text: 'Nyx\'s vomiting: 16 entries on 12 of 45 logged days.' }
  assert.deepEqual(checks([GOOD[0], named, GOOD[2]]), [])
  const table = tableFromPayload({
    pet_name: 'Biscuit', species: 'dog', record_start: '2026-08-22', record_end: '2026-10-16',
    band: [{ id: 'band-1', label: 'Chronicity', text: 'Itching spans 49 days (first logged Aug 27): 18 episodes on 18 days; most recent 1 day ago.' }],
    record_lines: [], trial_line: null, record_edge: [],
  })
  const labelled = [{ text: 'Chronicity: itching spans 49 days, 18 episodes on 18 days, the most recent 1 day ago.', cites: ['band-1'] }]
  assert.deepEqual(sentenceVerdict(table, { sentences: labelled }).errors, [])
})

Deno.test('negation: bound to the two words a cited line prints after it', () => {
  const r11 = tableFromPayload({
    pet_name: 'Biscuit', species: 'dog', record_start: '2026-08-22', record_end: '2026-10-16',
    band: [{ id: 'band-r11', label: 'itching', text: 'Flag: itching over at least 49 days. 15 episodes on 15 days; most recent 1 day ago. A sustained pattern over many samples, not a single incident.' }],
    record_lines: [], trial_line: null, record_edge: [],
  })
  const ok = [{ text: 'Itching is the flag: over at least 49 days, 15 episodes on 15 days, most recent 1 day ago, not a single incident.', cites: ['band-r11'] }]
  assert.deepEqual(sentenceVerdict(r11, { sentences: ok }).errors.filter((e) => e.check === 'negation'), [])
  const flipped = [{ ...ok[0], text: 'Itching is the flag: over at least 49 days, 15 episodes on 15 days, most recent 1 day ago, not a sustained pattern.' }]
  assert.deepEqual([...new Set(sentenceVerdict(r11, { sentences: flipped }).errors.map((e) => e.check))], ['negation'])
})

// ── live-flag: CUL-2621 ruling (c), PM 2026-11-07 (widening CUL-2563's ruling (b), 2026-11-06) ──

/** The lead the bake-off re-run printed on nyx-v2 in runs 2, 3 and 4 (CUL-2306,
 *  docs/vet-report-v3-discovery/bakeoff/rerun/2026-11-05-run/): the burden, said well, and five live
 *  flags unsaid. Both judges scored H7 material; the checker model passed it. */
const RERUN_NYX_LEAD: LeadSentence[] = [
  { text: 'Burden is a live flag: 6 vomiting entries in the last 7 days, on 3 days in a row.', cites: ['band-3-symptom_burden-vomit'] },
  { text: 'Vomiting: 16 entries on 12 of 45 logged days, the last Oct 31.', cites: ['line-1'] },
  { text: 'The owner-entered diet trial, Royal Canin Selected Protein PR, Dry and 5 other trial foods, ran from Jul 26, 2026 to Oct 20, 2026; the trial diet was not fed exclusively, and it is not a test of the diet alone.', cites: ['trial', 'trial-reading-3', 'confounder'] },
]

Deno.test('live-flag: the live Nyx record (six live band items) refuses the lead the re-run printed', () => {
  assert.equal(nyxTable.facts.filter((f) => f.role === 'band').length, 6)
  const v = verifyLead(nyxTable, { sentences: RERUN_NYX_LEAD })
  assert.equal(v.pass, false)
  // In the re-run it passed every sentence rule and only the record rule stopped it. Since CUL-2627's
  // ruling (a) the present foreign-material flag is band item 1, a required fact, so its burden-first
  // opening, which never cites it, also fails the required and order rules: louder, and the record
  // rule still stops it on its own.
  assert.deepEqual(v.errors.map((e) => e.check), ['required', 'live-flag', 'band-first', 'band-numbers'])
  assert.equal(v.errors[0].sentence, null)
})

Deno.test('live-flag: no draft passes, whatever it says or cites (the rule reads the record alone)', () => {
  const drafts: LeadSentence[][] = [
    RERUN_NYX_LEAD,
    [GOOD[0]],
    [{ text: 'Nyx.', cites: [] }],
    [],
    // Every band item cited: still no lead.
    nyxTable.facts.filter((f) => f.role === 'band').map((f) => ({ text: f.text ?? '', cites: [f.id] })),
  ]
  for (const sentences of drafts) {
    const v = verifyLead(nyxTable, { sentences })
    assert.equal(v.pass, false)
    assert.ok(v.errors.some((e) => e.check === 'live-flag'))
  }
})

Deno.test('live-flag: one band item refuses; only an empty band prints', () => {
  assert.equal(LIVE_FLAG_MIN_BAND, 1)
  const band = [
    { id: 'band-1', label: 'Chronicity', text: 'Itching spans 49 days (first logged Aug 27): 18 episodes on 18 days; most recent 1 day ago.' },
    { id: 'band-2', label: 'Weight', text: 'Weight down 15% over 30 days.' },
  ]
  const base = { pet_name: 'Biscuit', species: 'dog', record_start: '2026-08-22', record_end: '2026-10-16', record_lines: [], trial_line: null, record_edge: [] }
  // The vocabulary test's labelled lead: it passes every sentence rule on its one-flag record.
  const lead = [{ text: 'Chronicity: itching spans 49 days, 18 episodes on 18 days, the most recent 1 day ago.', cites: ['band-1'] }]
  const one = tableFromPayload({ ...base, band: band.slice(0, 1) })
  assert.deepEqual(liveFlagIssues(one).map((e) => e.check), ['live-flag'])
  assert.deepEqual(verifyLead(one, { sentences: lead }).errors.map((e) => e.check), ['live-flag'], 'a lone flag no longer prints')
  const two = tableFromPayload({ ...base, band })
  assert.deepEqual(verifyLead(two, { sentences: lead }).errors.map((e) => e.check), ['live-flag'])
  // A row not marked live still counts: the rule errs loud.
  const unmarked = { ...one, facts: one.facts.map((f) => (f.role === 'band' ? { ...f, live: false } : f)) }
  assert.deepEqual(liveFlagIssues(unmarked).map((e) => e.check), ['live-flag'])
  // No band at all: the rule is silent, and the careful H2 lead prints in full (the full verdict).
  assert.deepEqual(liveFlagIssues(H2_TABLE), [])
  assert.deepEqual(verifyLead(H2_TABLE, { sentences: H2_CAREFUL }).errors, [])
})

// ── own-sign: CUL-2619 ──────────────────────────────────────────────────────────────────────────

/** r11 and r11-jump as production builds them (v2Fixtures `itchingSkinTrial`). On r11 the R-11
 *  exemption fires and the flag prints as the lead chart's heading, "…the trial's own sign"; on
 *  r11-jump the folded worsening keeps the flag in the band, whose row never says it. */
function r11Facts(jump: boolean) {
  const s = assembleReport(itchingSkinTrial({ jump }))
  const f = buildLeadFacts(documentForLead(s), {
    petName: s.signalment.name, species: s.signalment.species, recordStart: s.scope.startDate, recordEnd: s.scope.endDate, includeLookNotes: false,
  })
  if (!f.eligible) throw new Error(`r11 (jump ${jump}) is eligible for a lead`)
  return f
}
const R11 = r11Facts(false)
const R11_JUMP = r11Facts(true)

/** The 2026-11-05 re-run's printed r11 leads (runs 1 and 3, docs/vet-report-v3-discovery/bakeoff/
 *  rerun/2026-11-05-run/out/), word for word: the skeptical GP scored the first sentence of each
 *  H7 minor for dropping "the trial's own sign". */
const RERUN_TRIAL: LeadSentence = { text: 'The owner-entered diet trial, Vetline Hydrolysed Soy, from Aug 17, 2026, is at day 61 of 84; the elimination cannot be confirmed clean from this record, and no medication or supplement is recorded as overlapping the trial in this window, not checked with the owner.', cites: ['trial', 'trial-reading-2', 'confounder'] }
const RERUN_RUN_1: LeadSentence[] = [
  { text: 'Itching is a live flag: itching over at least 49 days, with 15 episodes on 15 days, most recent 1 day ago.', cites: ['band-r11'] },
  { text: 'Itching: 15 entries on 15 of 56 logged days, the last Oct 15.', cites: ['line-1'] },
  RERUN_TRIAL,
]
const RERUN_RUN_3: LeadSentence[] = [
  { text: 'Itching is a live flag: itching over at least 49 days, 15 episodes on 15 days, most recent 1 day ago.', cites: ['band-r11'] },
  { text: 'Itching showed 15 entries on 15 of 56 logged days.', cites: ['line-1'] },
  { text: 'The owner-entered diet trial, Vetline Hydrolysed Soy, from Aug 17, 2026, is at day 61 of 84; the elimination cannot be confirmed clean from this record; no medication or supplement is recorded as overlapping the trial in this window, not checked with the owner.', cites: ['trial', 'trial-reading-2', 'confounder'] },
]
const withOwnSign = (s: LeadSentence, apostrophe = "'"): LeadSentence =>
  ({ ...s, text: s.text.replace('Itching is a live flag:', `Itching is a live flag, the trial${apostrophe}s own sign:`) })
const ALL_NONE = parseChecker({ takeaway: 'x', hazards: Object.fromEntries(HAZARDS.map((h) => [h, { level: 'none', quote: '', why: '' }])), omissions: [] })!

Deno.test('own-sign: r11 prints its flag as the trial\'s own sign, and the fact table requires the words', () => {
  assert.equal(R11.payload.band.length, 1)
  assert.equal(R11.payload.band[0].id, 'band-r11')
  assert.ok(printsOwnSign(R11.payload.band[0].text), R11.payload.band[0].text)
  const fact = R11.table.facts.find((f) => f.id === 'band-r11')!
  assert.ok((fact.must_say ?? []).some((g) => g.includes(OWN_SIGN_PHRASE)), JSON.stringify(fact.must_say))
})

Deno.test('own-sign: the re-run\'s printed r11 leads are refused, by the verifier and by the checker whatever its model says', () => {
  for (const lead of [RERUN_RUN_1, RERUN_RUN_3]) {
    const v = sentenceVerdict(R11.table, { sentences: lead })
    assert.equal(v.pass, false)
    const checks = [...new Set(v.errors.map((e) => e.check))].sort()
    // Two independent nets: the code check and the band fact's required clause. Nothing else.
    assert.deepEqual(checks, ['own-sign', 'required-clause'], JSON.stringify(v.errors))
    assert.deepEqual(ownSignIssues(R11.table, { sentences: lead }).map((e) => e.sentence), [1])
    assert.equal(checkerDecision(ALL_NONE, { table: R11.table, draft: { sentences: lead } }), 'reject')
  }
})

Deno.test('own-sign: the same lead with the four words prints, straight or curly apostrophe', () => {
  for (const ap of ["'", '’']) {
    const fixed = [withOwnSign(RERUN_RUN_3[0], ap), ...RERUN_RUN_3.slice(1)]
    assert.deepEqual(sentenceVerdict(R11.table, { sentences: fixed }).errors, [], fixed[0].text)
    // On r11 the record rule rejects every draft (CUL-2621); own-sign is not why.
    assert.deepEqual(ownSignIssues(R11.table, { sentences: fixed }), [])
    assert.equal(checkerDecision(ALL_NONE, { table: R11.table, draft: { sentences: fixed } }), 'reject')
  }
  // The residual, pinned so it shows in review: run 1 was 78 words, and the four words take it past
  // the 80-word cap, so it drops rather than print a shortened flag. That errs loud.
  const run1 = [withOwnSign(RERUN_RUN_1[0]), ...RERUN_RUN_1.slice(1)]
  assert.deepEqual(sentenceVerdict(R11.table, { sentences: run1 }).errors.map((e) => e.check), ['structure'])
})

Deno.test('own-sign: a later sentence that calls the sign a flag carries the words too, cited or not', () => {
  const s2 = { text: 'Itching is a live flag: 15 entries on 15 of 56 logged days.', cites: ['line-1'] }
  const trial = { text: 'The owner-entered diet trial, Vetline Hydrolysed Soy, is at day 61 of 84; the elimination cannot be confirmed clean from this record, and no medication or supplement is recorded as overlapping the trial, not checked with the owner.', cites: ['trial', 'trial-reading-2', 'confounder'] }
  const lead = [withOwnSign(RERUN_RUN_3[0]), s2, trial]
  // Nor can sentence 2 borrow the words: they are printed only in the band row, and band-once lets one
  // sentence cite it. So the flag is said once, in sentence 1, with the words.
  assert.equal(sentenceVerdict(R11.table, { sentences: [lead[0], withOwnSign(s2), trial] }).pass, false)
  assert.deepEqual(ownSignIssues(R11.table, { sentences: lead }).map((e) => e.sentence), [2])
  assert.deepEqual([...new Set(sentenceVerdict(R11.table, { sentences: lead }).errors.map((e) => e.check))], ['own-sign'])
})

Deno.test('own-sign: the phrase licenses "trial" beside the sign only in itself, and only in a sentence citing its row', () => {
  // Any other exposure word in the flag's sentence is still H2.
  const diet = { text: 'Itching is a live flag, the trial\'s own sign, on the trial: itching over at least 49 days, 15 episodes on 15 days, most recent 1 day ago.', cites: ['band-r11'] }
  assert.ok(sentenceVerdict(R11.table, { sentences: [diet, RERUN_TRIAL] }).errors.some((e) => e.check === 'order'))
  // A sentence citing the trial line may not borrow the phrase to set the sign beside the trial.
  const borrowed = { text: 'The owner-entered diet trial, Vetline Hydrolysed Soy, is at day 61 of 84, the trial\'s own sign.', cites: ['trial'] }
  const e = sentenceVerdict(R11.table, { sentences: [withOwnSign(RERUN_RUN_1[0]), borrowed, RERUN_TRIAL] }).errors.map((x) => x.check)
  assert.ok(e.includes('order') || e.includes('vocabulary'), String(e))
})

Deno.test('own-sign: on r11-jump the band row never says it, so the words are neither required nor printable', () => {
  assert.ok(!printsOwnSign(R11_JUMP.payload.band[0].text))
  const id = R11_JUMP.payload.band[0].id
  const plain = { text: 'Chronicity: itching spans 49 days, 18 episodes on 18 days, the most recent 1 day ago, a sustained pattern.', cites: [id] }
  assert.deepEqual(ownSignIssues(R11_JUMP.table, { sentences: [plain] }), [])
  assert.ok(!sentenceVerdict(R11_JUMP.table, { sentences: [plain] }).errors.some((x) => x.check === 'own-sign'))
  const borrowed = { ...plain, text: 'Chronicity, the trial\'s own sign: itching spans 49 days, 18 episodes on 18 days, the most recent 1 day ago, a sustained pattern.' }
  assert.ok(sentenceVerdict(R11_JUMP.table, { sentences: [borrowed] }).errors.some((x) => x.check === 'vocabulary'))
})

Deno.test('own-sign: the writer is told to keep the words', () => {
  assert.ok(WRITER_SYSTEM.includes('"the trial\'s own sign"'))
})

/** The adversarial pass on 9e4422d: the words printed, but not on the flag. Each printed through
 *  verifyLead and checkerDecision there, because the words were only looked for, never placed, and the
 *  exposure test blanked every copy. Each is refused here by own-sign, by both. */
const R11_S2: LeadSentence = { text: 'Itching: 15 entries on 15 of 56 logged days, the last Oct 15.', cites: ['line-1'] }
const R11_S3: LeadSentence = { text: 'The owner-entered diet trial, Vetline Hydrolysed Soy, is at day 61 of 84; the elimination cannot be confirmed clean from this record, and no medication or supplement is recorded as overlapping the trial, not checked with the owner.', cites: ['trial', 'trial-reading-2', 'confounder'] }
const FLAG = 'Itching is a live flag: itching over at least 49 days, 15 episodes on 15 days, most recent 1 day ago'
const DETACHED: string[] = [
  // asked, not stated
  `${FLAG}; is it the trial's own sign?`,
  `${FLAG}, so is itching the trial's own sign?`,
  // negated through the band's own "cannot show how"
  `${FLAG}; the record cannot show how it is the trial's own sign.`,
  `${FLAG}, so the record cannot show how itching is the trial's own sign.`,
  // an order claim the mask hid (and false: the trial started first)
  `${FLAG}, so itching predates the trial's own sign.`,
  "Itching, the trial's own sign, is a live flag: itching over at least 49 days predates it, 15 episodes on 15 days, most recent 1 day ago.",
  `${FLAG}; the trial's own sign predates it.`,
  // attached to something other than the flag
  `${FLAG}; this window, the trial's own sign, opens Aug 22.`,
  `${FLAG}, so 49 days is a floor, the trial's own sign.`,
  `${FLAG}; the record, the trial's own sign, cannot show how long.`,
  `${FLAG}, and so is the trial's own sign.`,
  `${FLAG}; the trial's own sign opens Aug 22.`,
  // anchored, but asked
  "Itching is a live flag, the trial's own sign: itching over at least 49 days, 15 episodes on 15 days, most recent 1 day ago?",
  // twice, and with punctuation inside it
  "Itching is a live flag, the trial's own sign: itching over at least 49 days, the trial's own sign, 15 episodes on 15 days, most recent 1 day ago.",
  "Itching is a live flag, the trial's; own sign: itching over at least 49 days, 15 episodes on 15 days, most recent 1 day ago.",
  "Itching is a live flag, the trial's-own sign: itching over at least 49 days, 15 episodes on 15 days, most recent 1 day ago.",
]

Deno.test('own-sign: the words name the flag, or the lead drops (adversarial pass on 9e4422d)', () => {
  for (const text of DETACHED) {
    for (const lead of [[{ text, cites: ['band-r11'] }, R11_S2, R11_S3], [{ text, cites: ['band-r11'] }, R11_S3]]) {
      const v = sentenceVerdict(R11.table, { sentences: lead })
      assert.equal(v.pass, false, text)
      assert.ok(v.errors.some((e) => e.check === 'own-sign'), `${text}: ${JSON.stringify(v.errors)}`)
      assert.equal(checkerDecision(ALL_NONE, { table: R11.table, draft: { sentences: lead } }), 'reject', text)
    }
  }
})

Deno.test('own-sign: the two anchored shapes print', () => {
  for (const text of [
    "Itching is a live flag, the trial's own sign: itching over at least 49 days, 15 episodes on 15 days, most recent 1 day ago.",
    "Itching is a live flag: itching over at least 49 days, the trial's own sign, 15 episodes on 15 days, most recent 1 day ago.",
    "Itching is a live flag: itching over at least 49 days, the trial’s own sign; 15 episodes on 15 days, most recent 1 day ago.",
  ]) {
    const lead = [{ text, cites: ['band-r11'] }, R11_S2, R11_S3]
    assert.deepEqual(sentenceVerdict(R11.table, { sentences: lead }).errors, [], text)
    // On r11 the record rule rejects every draft (CUL-2621); own-sign is not why.
    assert.deepEqual(ownSignIssues(R11.table, { sentences: lead }), [], text)
    assert.equal(checkerDecision(ALL_NONE, { table: R11.table, draft: { sentences: lead } }), 'reject', text)
  }
})

Deno.test('own-sign: an unanchored or second copy is still an exposure beside the sign (H2), a second net behind own-sign', () => {
  for (const text of [
    `${FLAG}; the record cannot show how it is the trial's own sign.`,
    `${FLAG}; this window, the trial's own sign, opens Aug 22.`,
    `${FLAG}, so itching predates the trial's own sign.`,
    "Itching is a live flag, the trial's own sign: itching over at least 49 days, the trial's own sign, 15 episodes on 15 days, most recent 1 day ago.",
  ]) {
    const checks = sentenceVerdict(R11.table, { sentences: [{ text, cites: ['band-r11'] }, R11_S3] }).errors.map((e) => e.check)
    assert.ok(checks.includes('order'), `${text}: ${checks}`)
  }
})

/** Adversarial pass 2 (f54f6d6): the words on the flag, the flag inside a claim about it. Each printed
 *  through verifyLead and checkerDecision there. */
const PASS_2: string[] = [
  // asked, with no ASCII "?"
  "Is itching a live flag, the trial's own sign: itching over at least 49 days, 15 episodes on 15 days, most recent 1 day ago.",
  "Itching is a live flag: is itching over at least 49 days, the trial's own sign, 15 episodes on 15 days, most recent 1 day ago.",
  "Itching is a live flag, the trial's own sign: itching over at least 49 days, 15 episodes on 15 days, most recent 1 day ago？",
  "Itching is a live flag, the trial's own sign: itching over at least 49 days, 15 episodes on 15 days, most recent 1 day ago‽",
  "¿Itching is a live flag, the trial's own sign: itching over at least 49 days, 15 episodes on 15 days, most recent 1 day ago.",
  // doubted through the band's own "cannot show how"
  "The record cannot show how itching is a live flag, the trial's own sign: itching over at least 49 days, 15 episodes on 15 days, most recent 1 day ago.",
  "The record cannot show how long itching is a live flag, the trial's own sign: itching over at least 49 days, 15 episodes on 15 days, most recent 1 day ago.",
  "Itching is a live flag, the trial's own sign: the record cannot show how itching spans at least 49 days, 15 episodes on 15 days, most recent 1 day ago.",
  "Itching is a live flag: the record cannot show how itching is over at least 49 days, the trial's own sign, 15 episodes on 15 days, most recent 1 day ago.",
  // an order claim behind the words
  "Itching is a live flag, the trial's own sign: itching over at least 49 days predates it, 15 episodes on 15 days, most recent 1 day ago.",
  "Itching is a live flag: itching over at least 49 days, the trial's own sign, predates it, 15 episodes on 15 days, most recent 1 day ago.",
  "Itching is a live flag, the trial's own sign: the sign predates it, itching over at least 49 days, 15 episodes on 15 days, most recent 1 day ago.",
  // dated by its latest entry
  "Itching is a live flag, the trial's own sign: itching over at least 49 days, 15 episodes on 15 days, first logged 1 day ago.",
  // softened: not a live flag
  "Itching is a floor flag, the trial's own sign: itching over at least 49 days, 15 episodes on 15 days, most recent 1 day ago.",
  "Itching is a flag, the trial's own sign: itching over at least 49 days, 15 episodes on 15 days, most recent 1 day ago.",
]

Deno.test('own-sign: the flag opens the sentence in its own shape, and nothing asks, doubts or dates it against the trial (pass 2)', () => {
  for (const text of PASS_2) {
    const lead = [{ text, cites: ['band-r11'] }, R11_S3]
    const v = sentenceVerdict(R11.table, { sentences: lead })
    assert.equal(v.pass, false, text)
    assert.ok(v.errors.some((e) => e.check === 'own-sign'), `${text}: ${JSON.stringify(v.errors)}`)
    assert.equal(checkerDecision(ALL_NONE, { table: R11.table, draft: { sentences: lead } }), 'reject', text)
  }
})
