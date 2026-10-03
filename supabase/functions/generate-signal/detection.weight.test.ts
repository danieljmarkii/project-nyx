// Engines v3 PR-19 (EN-8, CUL-1413): the weight lane in detection.
// Run with: deno test --allow-read=supabase/functions supabase/functions/generate-signal/detection.weight.test.ts
//
// The predicate's own cases live in lib/weightStory.test.ts (jest). This file covers what the
// engine adds: the lane is dark until the shell hands it `input.weight` (and absent is
// byte-identical), every species gets the rows (W8), the rank (W7), the template-only sentence
// in pounds with no percentage (WG-4), and MFU-8's registries.

import { strict as assert } from 'node:assert'
import {
  DEFAULT_CONFIG,
  SAFETY_TYPE_ORDER,
  detectSignals,
  detectWeightLoss,
  rankFindings,
  type DetectionInput,
  type Finding,
  type Species,
  type SymptomBurdenFinding,
  type SymptomChronicityFinding,
  type WeightLossFinding,
} from './detection.ts'
import {
  phrasingPayload,
  canRenderCarried,
  templateCarried,
  templateForFinding,
  templateWeightLoss,
  validatePhrasing,
} from './phrasing.ts'
import type { WeightReading } from '../../../lib/weightStory.ts'

const NOW = '2026-10-03T12:00:00.000Z'
const home = (kg: number, day: string): WeightReading => ({ kg, occurredAt: `${day}T09:00:00Z`, source: 'home_scale' })
const clinic = (kg: number, day: string): WeightReading => ({ kg, occurredAt: `${day}T09:00:00Z`, source: 'clinic' })

// The Nyx record with June re-entered as a home reading (spec §8, row 3).
const NYX = [home(4.4, '2026-06-15'), clinic(3.73, '2026-09-16')]

function input(over: Partial<DetectionInput> = {}, species: Species = 'cat'): DetectionInput {
  return {
    pet: { name: 'Nyx', species, dietTrialActive: false },
    symptomEvents: [],
    mealEvents: [],
    now: NOW,
    ...over,
  }
}

Deno.test('dark: with no `weight` input the lane is silent, and detection is byte-identical', () => {
  assert.deepEqual(detectWeightLoss(input()), [])
  const without = detectSignals(input(), DEFAULT_CONFIG)
  const withUndefined = detectSignals(input({ weight: undefined }), DEFAULT_CONFIG)
  assert.deepEqual(withUndefined, without)
})

Deno.test('the Nyx record raises the firm row, both readings named with their sources', () => {
  const [f, ...rest] = detectWeightLoss(input({ weight: { readings: NYX, dateOfBirth: '2023-09-01' } }))
  assert.equal(rest.length, 0)
  assert.equal(f.type, 'weight_loss')
  assert.equal(f.priorityClass, 'safety')
  assert.equal(f.tier, 'firm')
  assert.deepEqual(f.high, { kg: 4.4, occurredAt: '2026-06-15T09:00:00Z', source: 'home_scale', confirmed: true })
  assert.deepEqual(f.low, { kg: 3.73, occurredAt: '2026-09-16T09:00:00Z', source: 'clinic', confirmed: true })
  // The sentence says June was one home reading (spec §8); W2's 0.67 kg is what confirmed it.
  assert.deepEqual(f.highBefore, { ...f.high, confirmed: false })
  assert.deepEqual(f.latest, f.low)
  assert.equal(f.associationalOnly, true)
})

Deno.test("today's Nyx record (one reading) is silent", () => {
  assert.deepEqual(detectWeightLoss(input({ weight: { readings: [NYX[1]], dateOfBirth: '2023-09-01' } })), [])
})

Deno.test('W8: every species gets the rows, species "other" included', () => {
  for (const species of ['cat', 'dog', 'other'] as Species[]) {
    const out = detectWeightLoss(input({ weight: { readings: NYX, dateOfBirth: '2023-09-01' } }, species))
    assert.equal(out.length, 1, species)
  }
})

Deno.test('the lane reads the shell-supplied record through detectSignals, safety-ranked', () => {
  const out = detectSignals(input({ weight: { readings: NYX, dateOfBirth: '2023-09-01' } }), DEFAULT_CONFIG)
  const w = out.find((r) => r.finding.type === 'weight_loss')
  assert.ok(w)
  assert.equal(w.rank, 0)
})

Deno.test('W7: the weight row sits below the burden card and above chronicity', () => {
  assert.ok(SAFETY_TYPE_ORDER.symptom_burden < SAFETY_TYPE_ORDER.weight_loss)
  assert.ok(SAFETY_TYPE_ORDER.weight_loss < SAFETY_TYPE_ORDER.symptom_chronicity)
  const weight = detectWeightLoss(input({ weight: { readings: NYX, dateOfBirth: '2023-09-01' } }))[0]
  const burden = { type: 'symptom_burden', priorityClass: 'safety', symptomType: 'vomit' } as SymptomBurdenFinding
  const chronic = { type: 'symptom_chronicity', priorityClass: 'safety', symptomType: 'vomit' } as SymptomChronicityFinding
  const ranked = rankFindings([chronic, weight, burden] as Finding[], { name: 'Nyx', species: 'cat', dietTrialActive: false })
  assert.deepEqual(ranked.map((r) => r.finding.type), ['symptom_burden', 'weight_loss', 'symptom_chronicity'])
})

// ── The sentence ────────────────────────────────────────────────────────────

const nyxFinding = (): WeightLossFinding =>
  detectWeightLoss(input({ weight: { readings: NYX, dateOfBirth: '2023-09-01' } }))[0]

Deno.test('the template: pounds, dates and sources; the firm ask; no percentage and no difference (WG-4)', () => {
  const t = templateWeightLoss(nyxFinding(), 'Nyx')
  assert.equal(t, 'Nyx weighed 8.2 lb on September 16 at the vet, down from 9.7 lb on June 15 on a home scale, a single reading — worth booking a vet visit.')
  assert.equal(templateForFinding(nyxFinding(), 'Nyx'), t)
  assert.ok(!/%|percent/.test(t))
})

Deno.test('the template: a single-reading high says so, and the soft ask', () => {
  const [f] = detectWeightLoss(
    input({
      weight: {
        readings: [home(4.2, '2026-06-03'), home(3.74, '2026-07-03'), home(3.73, '2026-08-03'), home(3.72, '2026-09-03')],
        dateOfBirth: '2020-01-01',
      },
    }),
  )
  assert.equal(f.basis, 'single_high')
  assert.equal(
    templateWeightLoss(f, 'Miso'),
    'Miso weighed 8.2 lb on September 3 on a home scale, down from 9.3 lb on June 3 on a home scale, a single reading — worth raising with your vet.',
  )
})

Deno.test('the template never carries a verdict word or a cause', () => {
  const t = templateWeightLoss(nyxFinding(), 'Nyx')
  assert.ok(!/\b(stable|healthy|fine|normal|good|because|due to|cause)\b/i.test(t))
})

// ── MFU-8: the registries ───────────────────────────────────────────────────

Deno.test('template-only: validatePhrasing refuses every model sentence, even one quoting the template', () => {
  const f = nyxFinding()
  assert.equal(validatePhrasing(templateWeightLoss(f, 'Nyx'), f), false)
  assert.equal(validatePhrasing('Nyx has lost a little weight — worth booking a vet visit.', f), false)
})

Deno.test('the template-only list in index.ts names weight_loss (saves the model call)', async () => {
  const src = await Deno.readTextFile(new URL('./index.ts', import.meta.url))
  assert.ok(/finding\.type === 'weight_loss'\s*\n?\s*\)\s*\{\s*\n\s*return fallback/.test(src))
})

Deno.test('a carried weight card renders with its tier ask, and only its exact template passes', () => {
  const carriedFrom = '2026-10-01T12:00:00.000Z'
  const f = { ...nyxFinding(), carriedFrom }
  assert.equal(canRenderCarried(f), true)
  assert.equal(canRenderCarried({ type: 'weight_loss', tier: 'loud' }), false)
  const line = templateCarried(f, 'Nyx', carriedFrom)
  assert.ok(line.includes('a drop in weight between two weigh-ins — worth booking a vet visit.'))
  assert.equal(validatePhrasing(line, f), true)
  assert.equal(validatePhrasing(line.replace('booking a vet visit', 'raising with your vet'), f), false)
  const soft = { ...f, tier: 'soft' as const }
  assert.ok(templateCarried(soft, 'Nyx', carriedFrom).includes('worth raising with your vet.'))
})

Deno.test('the phrasing payload carries pounds and the tier, never kilograms or a percentage', () => {
  const p = phrasingPayload(nyxFinding(), 'Nyx') as Record<string, unknown>
  assert.equal(p.insight_type, 'weight_loss')
  assert.equal(p.latest_lb, 8.2)
  assert.equal(p.earlier_lb, 9.7)
  assert.ok(!JSON.stringify(p).includes('%'))
})
