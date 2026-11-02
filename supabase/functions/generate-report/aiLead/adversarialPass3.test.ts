// Adversarial pass 3 on PR-25 (CUL-2305; PM-authorised past the two-pass cap, 2026-11-01), as
// regressions. Each concrete counterexample is refused on the fixture it was found on; each fix
// only drops a lead. The open synonym class stays CUL-2380's.
import assert from 'node:assert/strict'
import { assembleReport, type ReportSnapshot } from '../report.ts'
import { cooperInput } from '../cooperDemo.testutil.ts'
import { nyxLiveSnapshot } from '../nyxLive.testutil.ts'
import { itchingSkinTrial } from '../v2Fixtures.testutil.ts'
import { buildLeadFacts, documentForLead, tableFromPayload } from './facts.ts'
import { verifyLead, type LeadSentence } from './verify.ts'

function tableOf(s: ReportSnapshot) {
  const f = buildLeadFacts(documentForLead(s), {
    petName: s.signalment.name,
    species: s.signalment.species,
    recordStart: s.scope.startDate,
    recordEnd: s.scope.endDate,
    includeLookNotes: false,
  })
  if (!f.eligible) throw new Error(`not eligible: ${f.reason}`)
  return f.table
}
const errorsOf = (s: ReportSnapshot, sentences: LeadSentence[]) => verifyLead(tableOf(s), { sentences }).errors.map((e) => e.check)

const nyx = nyxLiveSnapshot()
const r11 = assembleReport(itchingSkinTrial({ jump: false }))
const cooper = assembleReport({ ...cooperInput(), audience: { kind: 'owner', includeLookNotes: false } })
const ci = cooperInput()
const cat = assembleReport({ ...ci, pet: { ...ci.pet, species: 'cat' as const }, audience: { kind: 'owner', includeLookNotes: false } })
const CAT_BAND = 'band-1-intake_decline'
const CAT_HONEST: LeadSentence = {
  text: 'Intake: below baseline for 1 consecutive day over 24 recent rated meals, about 50 h without a full meal; in cats, ≥48–72 h of markedly reduced intake is a hepatic-lipidosis risk window.',
  cites: [CAT_BAND],
}
const CAT_TRIAL: LeadSentence = { text: 'The owner-entered diet trial, Cooper\'s Venison LID, is at day 19 of 42, from Sep 28, 2026.', cites: ['trial'] }
const R11_HONEST: LeadSentence = { text: 'Itching is the flag: over at least 49 days, 15 episodes on 15 days, the most recent 1 day ago.', cites: ['band-r11'] }
const NYX_BAND: LeadSentence = { text: 'Foreign material is a live flag: 1 vomiting incident on Sep 22 showed possible foreign material on automated photo analysis, an AI read, unconfirmed.', cites: ['band-1-present_foreign'] }

Deno.test('the honest cat lead, its window word for word, still passes', () => {
  assert.deepEqual(verifyLead(tableOf(cat), { sentences: [CAT_HONEST, CAT_TRIAL] }).errors, [])
})

Deno.test('B1: a pronoun after an absence word is refused, whatever the sentence cites', () => {
  for (const tail of ['and it has stopped', 'and it has ended', 'and it has not recurred']) {
    const s = { text: `The owner-entered diet trial, Vetline Hydrolysed Soy, is at day 61 of 84, ${tail}.`, cites: ['trial'] }
    assert.ok(errorsOf(r11, [R11_HONEST, s]).includes('absence'), tail)
  }
})

Deno.test('B2: the cat 50 h in is never "below", "approaching" or "before" its window', () => {
  for (const w of ['below', 'approaching', 'before']) {
    const s = { ...CAT_HONEST, text: `Intake: below baseline for 1 consecutive day over 24 recent rated meals, about 50 h without a full meal, ${w} the ≥48–72 h hepatic-lipidosis risk window.` }
    assert.ok(errorsOf(cat, [s, CAT_TRIAL]).includes('window'), w)
  }
  const twice = { ...CAT_HONEST, text: `${CAT_HONEST.text.slice(0, -1)}, below the window.` }
  assert.ok(errorsOf(cat, [twice, CAT_TRIAL]).includes('window'))
})

Deno.test('B3: a number with a symbol before it is bound like any other', () => {
  const lt = { ...CAT_HONEST, text: 'Intake: below baseline for 1 consecutive day over 24 recent rated meals, about 50 h without a full meal, <48 h of markedly reduced intake; ≥48–72 h is a hepatic-lipidosis risk window.' }
  assert.ok(errorsOf(cat, [lt, CAT_TRIAL]).includes('number-binding'))
  const ge = { ...R11_HONEST, text: 'Itching is the flag: over at least 49 days, 15 episodes on 15 days, the most recent ≥49 days ago.' }
  const e = errorsOf(r11, [ge])
  assert.ok(e.includes('number-binding') || e.includes('recency'), String(e))
})

Deno.test('B4: a number or date never moves from one sign to another', () => {
  const borrowed = { text: `${NYX_BAND.text.slice(0, -1)}, with vomiting most recent 10 days ago.`, cites: ['band-1-present_foreign', 'band-6-chronicity-cough'] }
  assert.ok(errorsOf(nyx, [borrowed]).includes('one-observation'))
  const date = { text: 'Vomiting: 16 entries on 12 of 45 logged days, the last Oct 21.', cites: ['line-1', 'sign-cough'] }
  assert.ok(errorsOf(nyx, [NYX_BAND, date]).includes('one-observation'))
  const recency = { ...R11_HONEST, text: 'Itching is the flag: over at least 49 days, 15 episodes on 15 days at 1 day apart, the most recent 15 days ago.' }
  assert.ok(errorsOf(r11, [recency]).includes('recency'))
})

Deno.test('B5: dismissal words are refused', () => {
  for (const t of [
    'Foreign material was ruled out on review: 1 vomiting incident on Sep 22, an AI read, unconfirmed.',
    'Foreign material is a historic flag: 1 vomiting incident on Sep 22, an AI read, unconfirmed.',
    'Foreign material is a previous flag: 1 vomiting incident on Sep 22, an AI read, unconfirmed.',
    'Foreign material is a live flag, perhaps a photo artefact: 1 vomiting incident on Sep 22, an AI read, unconfirmed.',
  ]) assert.ok(errorsOf(nyx, [{ text: t, cites: ['band-1-present_foreign'] }]).includes('absence'), t)
  const flare = { text: 'The owner-entered diet trial, Vetline Hydrolysed Soy, is at day 61 of 84, and the flare-ups have died down.', cites: ['trial'] }
  const e = errorsOf(r11, [R11_HONEST, flare])
  assert.ok(e.includes('absence') && e.includes('order'), String(e))
})

Deno.test('B6: bare "eaten" is an adequacy claim, and the band\'s "fully-eaten meal" excuses nothing', () => {
  const eaten = { text: 'Meals: 44 rated meals logged and eaten, on 2 days.', cites: ['line-1'] }
  assert.ok(errorsOf(cooper, [eaten]).includes('intake-positive'))
})

Deno.test('B7: a phrase-final number keeps the word before it ("day 84" is not "day 61 of 84")', () => {
  const done = { text: 'The owner-entered diet trial, Vetline Hydrolysed Soy, from Aug 17, 2026, is complete at day 84.', cites: ['trial'] }
  assert.ok(errorsOf(r11, [R11_HONEST, done]).includes('number-binding'))
})

Deno.test('a product named with a curly apostrophe in its line can be named in the lead (not deaf)', () => {
  const table = tableFromPayload({
    pet_name: 'Biscuit', species: 'dog', record_start: '2026-05-02', record_end: '2026-06-01', band: [],
    record_lines: [{ id: 'line-1', kind: 'lead', text: 'Soft or loose stool: 9 entries on 8 of 26 logged days, the last May 31.' }],
    trial_line: { id: 'trial', text: 'Diet trial (owner-entered): Hill’s z/d, from May 2, 2026, day 30 of 56.' },
    record_edge: [],
  })
  const lead: LeadSentence[] = [
    { text: 'Soft or loose stool: 9 entries on 8 of 26 logged days, the last May 31.', cites: ['line-1'] },
    { text: 'The owner-entered diet trial, Hill’s z/d, is at day 30 of 56, from May 2, 2026.', cites: ['trial'] },
  ]
  assert.deepEqual(verifyLead(table, { sentences: lead }).errors, [])
})
