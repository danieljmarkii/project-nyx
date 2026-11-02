// Adversarial pass 1 on PR-25 (CUL-2305), and the privacy pass, as regressions: every
// counterexample that printed a misleading lead, or sent owner words, is driven through the shipped
// code on the fixture it was found on, and must now be refused.
import assert from 'node:assert/strict'
import { assembleReport, type ReportSnapshot } from '../report.ts'
import { cooperInput } from '../cooperDemo.testutil.ts'
import { nyxLiveSnapshot } from '../nyxLive.testutil.ts'
import { itchingSkinTrial } from '../v2Fixtures.testutil.ts'
import { buildLeadFacts, canonicalJson, documentForLead } from './facts.ts'
import { checkerDecision, parseChecker } from './leadPipeline.ts'
import { HAZARDS } from './prompts.ts'
import { verifyLead, type LeadSentence } from './verify.ts'

function factsOf(s: ReportSnapshot) {
  const f = buildLeadFacts(documentForLead(s), {
    petName: s.signalment.name,
    species: s.signalment.species,
    recordStart: s.scope.startDate,
    recordEnd: s.scope.endDate,
    includeLookNotes: false,
  })
  if (!f.eligible) throw new Error(`not eligible: ${f.reason}`)
  return f
}
const errorsOf = (s: ReportSnapshot, sentences: LeadSentence[]) => verifyLead(factsOf(s).table, { sentences }).errors.map((e) => e.check)

const r11 = assembleReport(itchingSkinTrial({ jump: false }))
const nyx = nyxLiveSnapshot()
const cooper = assembleReport({ ...cooperInput(), audience: { kind: 'owner', includeLookNotes: false } })
const NYX_TRIAL: LeadSentence = { text: 'The owner-entered diet trial, Royal Canin Selected Protein PR, Dry and 5 other trial foods, ran Jul 26, 2026 to Oct 20, 2026.', cites: ['trial'] }
const NYX_BAND: LeadSentence = { text: 'Foreign material is a live flag: 1 vomiting incident on Sep 22 showed possible foreign material on automated photo analysis, an AI read, unconfirmed.', cites: ['band-1-present_foreign'] }

Deno.test('break 1, R-11: the exempt flag is band item 1, safety-live, and must lead', () => {
  const f = factsOf(r11)
  assert.equal(f.payload.band[0].id, 'band-r11')
  assert.equal(f.table.safety_live, true)
  const opensOnTheTrial: LeadSentence[] = [
    { text: 'The diet trial (owner-entered) of Vetline Hydrolysed Soy began Aug 17, 2026 and is at day 61 of 84.', cites: ['trial'] },
    { text: 'Since then, itching was logged on 15 of 56 logged days, the last Oct 15.', cites: ['line-1'] },
    { text: 'Every rated meal was recorded as fully eaten, 56 of 56.', cites: ['intake'] },
  ]
  const e = errorsOf(r11, opensOnTheTrial)
  assert.ok(e.includes('band-first') && e.includes('order'), String(e))
  // And the honest shape passes: the flag first with its floor, the trial on its own.
  const honest: LeadSentence[] = [
    { text: 'Itching is the flag: over at least 49 days, 15 episodes on 15 days, the most recent 1 day ago.', cites: ['band-r11'] },
    { text: 'The owner-entered diet trial, Vetline Hydrolysed Soy, is at day 61 of 84, from Aug 17, 2026.', cites: ['trial'] },
  ]
  assert.deepEqual(verifyLead(factsOf(r11).table, { sentences: honest }).errors, [])
})

Deno.test('break 2: an omission the checker lists is never thrown away', () => {
  const base = { takeaway: 'x', hazards: Object.fromEntries(HAZARDS.map((h) => [h, { level: 'none', quote: '', why: '' }])) }
  assert.equal(checkerDecision(parseChecker({ ...base, omissions: [] })!), 'pass')
  assert.equal(checkerDecision(parseChecker({ ...base, omissions: ['the burden flag'] })!), 'repair')
  assert.equal(parseChecker({ ...base }), null, 'no omissions list is a checker we cannot read')
})

Deno.test('break 4: an observation set after an exposure in the next sentence is rejected', () => {
  for (const second of [
    'After it ended, vomiting was logged as 16 entries on 12 of 45 logged days, the last Oct 31.',
    'Vomiting then reached 16 entries on 12 of 45 logged days, the last Oct 31.',
  ]) {
    assert.ok(errorsOf(nyx, [NYX_BAND, NYX_TRIAL, { text: second, cites: ['line-1'] }]).includes('order'), second)
  }
})

Deno.test('break 5: an exposure and an observation share no sentence, by any word', () => {
  for (const [text, cites] of [
    ['During the owner-entered diet trial to Oct 20, 2026, coughing was logged on 5 of 45 logged days, the last Oct 21.', ['trial', 'sign-cough']],
    ['While Prednisolone was given on 15 of 21 course days, coughing was logged on 5 of 45 logged days, the last Oct 21.', ['medication-00000000-0000-4000-8000-000000000001', 'sign-cough']],
  ] as Array<[string, string[]]>) {
    assert.ok(errorsOf(nyx, [NYX_BAND, NYX_TRIAL, { text, cites }]).includes('order'), text)
  }
})

Deno.test('breaks 6 and 7: a sign that stopped, ended or was single is reassurance by another word', () => {
  const cough = { text: 'Coughing was logged on 5 of 45 logged days and stopped after Oct 21.', cites: ['sign-cough'] }
  assert.ok(errorsOf(nyx, [NYX_BAND, cough, NYX_TRIAL]).includes('absence'))
  const single = { ...NYX_BAND, text: 'Foreign material was a single possible find in 1 vomiting incident on Sep 22, an AI read, unconfirmed, and not seen again.' }
  assert.ok(errorsOf(nyx, [single, NYX_TRIAL]).includes('absence'))
  const ended = { text: 'Vomiting was logged on 4 of 22 logged days and ended Oct 13.', cites: ['sign-vomit'] }
  assert.ok(errorsOf(cooper, [{ text: 'Intake is below baseline for 2 consecutive days, recorded as a health signal.', cites: ['band-1-intake_decline'] }, ended]).includes('absence'))
})

Deno.test('break 8: band item 1 restated without its headline number, or as a dip, is rejected', () => {
  const dipped = { text: 'Intake dipped at the end of 44 logged meals, recorded as a health signal.', cites: ['band-1-intake_decline', 'line-1'] }
  const e = errorsOf(cooper, [dipped])
  assert.ok(e.includes('band-numbers') && e.includes('absence'), String(e))
})

Deno.test('privacy F1: an owner-edited incident note never reaches the payload', () => {
  const CANARY = 'OWNER TYPED just grass he is fine call 555-0100'
  const snap = structuredClone(nyx)
  // Every `note` and `notes` string anywhere in the snapshot becomes the canary.
  let planted = 0
  const walk = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(walk)
    if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        if ((k === 'note' || k === 'notes') && (typeof x === 'string' || x === null)) {
          ;(v as Record<string, unknown>)[k] = CANARY
          planted++
        } else walk(x)
      }
    }
  }
  walk(snap)
  assert.ok(planted > 0, 'the fixture carries notes to plant')
  const foreign = snap.safetyFlags.find((f) => f.kind === 'present_foreign')
  assert.ok(foreign && 'incidents' in foreign && foreign.incidents.some((i) => 'note' in i && i.note === CANARY), 'the foreign-material note is planted')
  const sent = canonicalJson(factsOf(snap).payload)
  assert.ok(!sent.includes('OWNER TYPED'), 'owner words reached the payload')
})
