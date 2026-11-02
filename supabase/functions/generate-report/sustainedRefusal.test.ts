// The sustained-refusal floor on the vet report (the stopgap for a record with no good meals).
// adversarial-reviewer pass 2 on VR2-13 (P2b): a cat with 60 rated meals over 30 days, every one
// picked at or refused, reached `assembleReport` with an EMPTY intake lane, so page one carried no
// flag and the intake sheet was not promoted. The engine's floor now raises `intake_decline`
// (`sustained_refusal`); these tests prove it lands in the safety band, promotes the intake sheet's
// sign, and that the band row states counts, never a baseline the record does not have.
import assert from 'node:assert/strict'
import { assembleReport } from './report.ts'
import { safetyFlagRow } from './render.ts'
import { flagSign } from './v2Predicates.ts'
import { baseInput, meal } from './v2Fixtures.testutil.ts'
import type { ReportEventInput } from './report.ts'

function rated(daysAgo: number, rating: 'picked' | 'refused', hour: number): ReportEventInput {
  const e = meal(daysAgo, 'refused', hour)
  return { ...e, meal: { ...e.meal!, intakeRating: rating as never } }
}

/** The P2b cat: two rated meals a day for 30 days, none eaten well, no trial. */
function p2bCat() {
  const events: ReportEventInput[] = []
  for (let d = 29; d >= 0; d--) events.push(rated(d, d % 2 === 0 ? 'picked' : 'refused', 8), rated(d, 'refused', 18))
  return baseInput({
    pet: { id: 'pet-p2b', name: 'Miso', species: 'cat', breed: null, sex: 'female', dateOfBirth: '2017-03-01', weightKg: 4 } as never,
    events,
  })
}

Deno.test('the P2b cat: an intake flag in the band, on the floor, with its counts', () => {
  const s = assembleReport(p2bCat())
  const intake = s.safetyFlags.filter((f) => f.kind === 'intake_decline')
  assert.equal(intake.length, 1, 'the band carries the intake flag')
  const f = intake[0]
  assert.equal(f.kind, 'intake_decline')
  if (f.kind !== 'intake_decline') return
  assert.equal(f.trigger, 'sustained_refusal')
  assert.equal(f.species, 'cat')
  assert.ok(f.sustainedRefusal, 'the counts ride to the render')
  assert.equal(f.sustainedRefusal!.refused + f.sustainedRefusal!.picked, f.sustainedRefusal!.meals)
  assert.equal(f.lastFullMealIso, null)
  assert.equal(flagSign(f), 'intake', 'the intake sign leads, so the intake sheet is promoted')
})

Deno.test('the band row states the counts and why no baseline is compared; never "below baseline" or "picky" as a verdict', () => {
  const s = assembleReport(p2bCat())
  const f = s.safetyFlags.find((x) => x.kind === 'intake_decline')!
  const html = safetyFlagRow(f, s).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ')
  assert.match(html, /Every watched meal rated in the 72\s?h before this window ends was picked at or refused/)
  assert.match(html, /no recent baseline to compare against/)
  assert.match(html, /hepatic-lipidosis/, 'the feline window is named')
  assert.match(html, /No fully-eaten meal is recorded in this window/)
  assert.doesNotMatch(html, /below this pet&#39;s baseline|below this pet's baseline/)
  assert.doesNotMatch(html, /Baseline read over/)
  assert.doesNotMatch(html, /declined:/, 'a flat run is not called a decline')
  assert.match(html, /6 meals \(4 refused, 2 picked at\) on 3 days/)
})
