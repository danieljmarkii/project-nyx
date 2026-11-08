// Clinical voice row 3 (CUL-2668): Ask names a read in the record's own words, picked by reason,
// and hands a deferential call's words to the model like any other call. Drives the real
// resolver and the real prompt builders (C-34), never a re-derived rule.

import { strict as assert } from 'node:assert'
import { callWordsOf, DEFERENTIAL_DEFINITION, SYSTEM_PROMPT, tierRule } from './answer.ts'
import { tierWordsOf } from './tools.ts'
import { DEFERENTIAL_ASK, FLOOR_ASK } from '../../../lib/incidentAskWords.ts'
import { TIER_WORDS } from '../../../lib/incidentTierWords.ts'

const tiered = {
  status: 'completed',
  recommendation: 'worth_a_call',
  tier: 'call_today',
  engine_flags: ['engines_v3_en3'],
  blood_present: null,
  stool_blood_present: null,
  foreign_material_present: null,
}

Deno.test('Ask: a dog\'s call today with known, floor-free reasons is the deferential label, as on the record', () => {
  assert.equal(tierWordsOf({ ...tiered, contextual_flags: ['repeated_vomiting'], visual_flags: [] }, 'dog'), DEFERENTIAL_ASK.label)
  assert.equal(tierWordsOf({ ...tiered, contextual_flags: ['repeated_loose_stool', 'concurrent_vomiting'], visual_flags: [] }, 'dog'), DEFERENTIAL_ASK.label)
})

Deno.test('Ask: every other species takes the cat floor, which Ask cannot re-check live (adversarial pass 1, B1)', () => {
  // A cat's T8 vomit read, or an EN-7 stool read whose cat intake reason is stored only as
  // concurrent_vomiting: the record would floor it on its live meal check; Ask must not be softer.
  for (const species of ['cat', 'other', 'unknown', null, undefined]) {
    assert.equal(tierWordsOf({ ...tiered, contextual_flags: ['repeated_vomiting'], visual_flags: [] }, species), FLOOR_ASK.label, String(species))
    assert.equal(tierWordsOf({ ...tiered, contextual_flags: ['concurrent_vomiting'], visual_flags: [] }, species), FLOOR_ASK.label, String(species))
  }
  // The raise is for a call today only: an earlier-rule cat read keeps the record's words.
  assert.equal(tierWordsOf({ status: 'completed', recommendation: 'worth_a_call', tier: null, engine_flags: [] }, 'cat'), TIER_WORDS.worth_a_call.label)
})

Deno.test('Ask: every floor reason, and every reason it cannot see, is the floor', () => {
  const floor = [
    { ...tiered, contextual_flags: ['feline_reduced_intake'], visual_flags: [] },
    { ...tiered, contextual_flags: ['repeated_vomiting'], visual_flags: ['blood'] },
    { ...tiered, contextual_flags: [], visual_flags: ['suspected_foreign_material'] },
    { ...tiered, contextual_flags: [], visual_flags: [], blood_present: 'fresh_red' },
    { ...tiered, contextual_flags: [], visual_flags: [], stool_blood_present: 'yes' },
    { ...tiered, contextual_flags: ['a_flag_from_the_future'], visual_flags: [] },
    // A select that never carried the reasons (an older column list) fails toward the floor.
    { ...tiered },
  ]
  for (const row of floor) assert.equal(tierWordsOf(row), FLOOR_ASK.label, JSON.stringify(row))
})

Deno.test('Ask: an earlier-rule call keeps "Worth a call" unless it carries a floor sign (CUL-2675 (a))', () => {
  const earlier = { status: 'completed', recommendation: 'worth_a_call', tier: null, engine_flags: [] }
  assert.equal(tierWordsOf(earlier), TIER_WORDS.worth_a_call.label)
  assert.equal(tierWordsOf({ ...earlier, blood_present: 'coffee_ground' }), FLOOR_ASK.label)
  assert.equal(tierWordsOf({ ...earlier, visual_flags: ['blood'] }), FLOOR_ASK.label)
  // Call now keeps its own words.
  assert.equal(tierWordsOf({ ...tiered, tier: 'call_now' }), TIER_WORDS.call_now.label)
})

Deno.test('Ask: both call-today labels are call words, so neither is withheld from the model', () => {
  assert.equal(callWordsOf(DEFERENTIAL_ASK.label), DEFERENTIAL_ASK.label)
  assert.equal(callWordsOf(FLOOR_ASK.label), FLOOR_ASK.label)
  // A quiet read's words still are not.
  assert.equal(callWordsOf(TIER_WORDS.logged.label), null)
})

Deno.test('Ask rule 11 defines both registers, the deferential one as still a call with its clock', () => {
  const rule = tierRule()
  assert.ok(rule.includes(`"${FLOOR_ASK.label}" means`))
  assert.ok(rule.includes(`"${DEFERENTIAL_ASK.label}" means ${DEFERENTIAL_DEFINITION}.`))
  assert.match(DEFERENTIAL_DEFINITION, /same day/)
  assert.match(DEFERENTIAL_DEFINITION, /never say it can wait/)
  assert.ok(rule.indexOf(`"${FLOOR_ASK.label}"`) < rule.indexOf(`"${DEFERENTIAL_ASK.label}"`), 'the floor first')
  assert.ok(SYSTEM_PROMPT.includes(rule))
})

Deno.test('Ask rule 4 names the cat floor in the floor\'s words', () => {
  const four = SYSTEM_PROMPT.slice(SYSTEM_PROMPT.indexOf('(4) '), SYSTEM_PROMPT.indexOf('(5) '))
  assert.ok(four.includes('Most or All in the last 24 hours'), four)
  assert.ok(four.includes(`"${FLOOR_ASK.inline}"`), four)
  assert.match(four, /never a softer ask/)
})
