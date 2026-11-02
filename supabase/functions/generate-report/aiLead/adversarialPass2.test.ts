// Adversarial pass 2 on PR-25 (CUL-2305), as regressions. Every counterexample the second and final
// pass printed through `verifyLead` is driven on the fixture it was found on and must be refused.
// Each fix only ever drops a lead (errs loud); the residuals that remain are the checker's, stated
// in the PR and filed against the flag's go-live.
import assert from 'node:assert/strict'
import { assembleReport, type ReportSnapshot } from '../report.ts'
import { cooperInput } from '../cooperDemo.testutil.ts'
import { nyxLiveSnapshot } from '../nyxLive.testutil.ts'
import { itchingSkinTrial } from '../v2Fixtures.testutil.ts'
import { buildLeadFacts, documentForLead } from './facts.ts'
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
const checks = (s: ReportSnapshot, sentences: LeadSentence[]) => verifyLead(tableOf(s), { sentences }).errors.map((e) => e.check)

const nyx = nyxLiveSnapshot()
const r11 = assembleReport(itchingSkinTrial({ jump: false }))
const r11jump = assembleReport(itchingSkinTrial({ jump: true }))
const cooperInputCat = () => {
  const i = cooperInput()
  return { ...i, pet: { ...i.pet, species: 'cat' as const }, audience: { kind: 'owner' as const, includeLookNotes: false } }
}
const cooper = assembleReport({ ...cooperInput(), audience: { kind: 'owner', includeLookNotes: false } })
const cat = assembleReport(cooperInputCat())
const NYX_BAND: LeadSentence = { text: 'Foreign material is a live flag: 1 vomiting incident on Sep 22 showed possible foreign material on automated photo analysis, an AI read, unconfirmed.', cites: ['band-1-present_foreign'] }
const MED = 'medication-00000000-0000-4000-8000-000000000001'

Deno.test('the strongest: a cat 50 h into reduced intake is never "short of the 48–72 h window"', () => {
  const band = tableOf(cat).facts.find((f) => f.role === 'band')
  assert.ok(band && /48/.test(band.text ?? '') && /50/.test(band.text ?? ''), 'the cat fixture prints the lipidosis window and the 50 h')
  const e = checks(cat, [{ text: 'Intake: below baseline for 1 day, short of the 48–72 h lipidosis window.', cites: [band.id] }])
  for (const c of ['band-numbers', 'absence', 'number-binding']) assert.ok(e.includes(c), `${c} missing from ${e}`)
})

Deno.test('a sentence citing only the exposure may not name a sign stopping', () => {
  assert.ok(checks(nyx, [NYX_BAND, { text: 'Prednisolone was given on 15 of 21 course days and the coughing stopped.', cites: [MED] }]).includes('order'))
  const r = checks(r11, [{ text: 'The owner-entered diet trial of Vetline Hydrolysed Soy is at day 61 of 84 and the scratching has stopped.', cites: ['trial'] }])
  assert.ok(r.includes('order') && r.includes('absence'), String(r))
})

Deno.test('every absence word is checked, and no line excuses one ("not a single" is not "single")', () => {
  const first = { ...NYX_BAND, text: `${NYX_BAND.text.slice(0, -1)}, and coughing over 34 days was not a single incident and has stopped.`, cites: ['band-1-present_foreign', 'band-6-chronicity-cough'] }
  assert.ok(checks(nyx, [first]).filter((c) => c === 'absence').length >= 2)
  const single = { text: 'Chronicity: itching spans 49 days, a single incident, the most recent 1 day ago.', cites: [tableOf(r11jump).facts[0].id] }
  assert.ok(checks(r11jump, [single]).includes('absence'))
})

Deno.test('the gaps in the absence list are closed', () => {
  for (const tail of ['and tapered off', 'and faded', 'and has been absent since Oct 21', 'and has not been logged since Oct 21', 'and is rare']) {
    const s = { text: `Coughing: 5 entries on 5 of 45 logged days, the last Oct 21, ${tail}.`, cites: ['sign-cough'] }
    assert.ok(checks(nyx, [NYX_BAND, s]).includes('absence'), tail)
  }
})

Deno.test('intake framing: no invented adequacy, no recombined counts, no short run', () => {
  const band = tableOf(cooper).facts.find((f) => f.role === 'band')!.id
  const adequate = { text: 'Intake: below baseline for 2 consecutive days, about 50 h without a full meal, against 22 recent rated meals fully eaten.', cites: [band] }
  assert.ok(checks(cooper, [adequate]).includes('intake-positive'))
  const recombined = { text: 'Intake: below baseline for 2 consecutive days, about 50 h without a full meal, with 4 of 44 rated meals not fully eaten over 22 recent rated meals.', cites: [band, 'line-1'] }
  assert.ok(checks(cooper, [recombined]).includes('number-binding'))
  const shortRun = { text: 'Intake: below baseline for 2 consecutive days, which is a short run, about 50 h without a full meal, over 22 recent rated meals.', cites: [band] }
  assert.ok(checks(cooper, [shortRun]).includes('absence'))
})

Deno.test('R-11: every number the flag prints leads, not only the bold one', () => {
  const thin = { text: 'Itching is the flag: over at least 49 days, the most recent 1 day ago.', cites: ['band-r11'] }
  assert.ok(checks(r11, [thin]).includes('band-numbers'))
})

Deno.test('spelled-out counts are refused', () => {
  assert.ok(checks(nyx, [NYX_BAND, { text: 'Coughing: five entries on 5 of 45 logged days, the last Oct 21.', cites: ['sign-cough'] }]).includes('numbers'))
})

Deno.test('the careful leads still pass: the rules are loud, not deaf', () => {
  assert.deepEqual(verifyLead(tableOf(nyx), { sentences: [NYX_BAND, { text: 'Vomiting: 16 entries on 12 of 45 logged days, the last Oct 31.', cites: ['line-1'] }] }).errors.filter((e) => e.check !== 'required'), [])
  const band = tableOf(cooper).facts.find((f) => f.role === 'band')!.id
  const honest = { text: 'Intake: below baseline for 2 consecutive days over 22 recent rated meals, about 50 h without a full meal, recorded as a health signal.', cites: [band] }
  assert.deepEqual(verifyLead(tableOf(cooper), { sentences: [honest, { text: 'The owner-entered diet trial, Cooper\'s Venison LID, is at day 19 of 42, from Sep 28, 2026.', cites: ['trial'] }] }).errors, [])
})
