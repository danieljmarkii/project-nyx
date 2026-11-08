// Clinical voice row 3 (CUL-2668): the stored read text says the floor on a floor sign and the
// deferential words elsewhere (docs/clinical-voice-inventory-2026-11.md §3b, §R). New reads only:
// these are the words a read writes, never a rewrite of a stored row.

import { assertStrictEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { buildContextualReadText, buildVisualFlagReadText, floorSentence } from './index.ts'
import { buildVisualFlagReadText as stoolVisual } from '../analyze-stool/index.ts'
import type { FloorResult } from '../../../lib/incidentFloor.ts'

Deno.test('photo read: blood or foreign material names its clock; the model\'s own call keeps the shipped words', () => {
  for (const flags of [['blood'], ['suspected_foreign_material'], ['blood', 'suspected_foreign_material']]) {
    assertStrictEquals(buildVisualFlagReadText('Nyx', flags).endsWith("That's worth a call to your vet today."), true)
    assertStrictEquals(stoolVisual('Nyx', flags).endsWith("That's worth a call to your vet today."), true)
  }
  assertStrictEquals(buildVisualFlagReadText('Nyx', []), "I can see something worth a closer look in this photo. That's worth a call to your vet about Nyx.")
  assertStrictEquals(stoolVisual('Nyx', []), "I can see something worth a closer look in this stool photo. That's worth a call to your vet about Nyx.")
})

Deno.test('the cat intake sentence is the floor (D4)', () => {
  assertStrictEquals(buildContextualReadText('Pixel', ['feline_reduced_intake', 'repeated_vomiting']).endsWith('call your vet today.'), true)
})

Deno.test('call now (T1–T3) keeps "needs a call"; T6–T8 are deferential with a clock that stays true (D2, R-1)', () => {
  const floor = (rows: FloorResult['rows'], extra: Partial<FloorResult> = {}) =>
    ({ tier: 'call_today', rows, counts: { burst: 3, span: 3 }, ...extra }) as unknown as FloorResult
  for (const row of ['T1', 'T2', 'T3'] as const) {
    assertStrictEquals(/needs? a call to your vet\.$/.test(floorSentence('Nyx', floor([row]), row)), true, row)
  }
  const deferential = [
    floorSentence('Nyx', floor(['T6']), 'T6'),
    floorSentence('Nyx', floor(['T7'], { ageUnknown: true }), 'T7'),
    floorSentence('Nyx', floor(['T7']), 'T7'),
    floorSentence('Nyx', floor(['T8']), 'T8'),
    floorSentence('Nyx', floor(['T8'], { persistence: { consecutive: true } } as unknown as Partial<FloorResult>), 'T8'),
    floorSentence('Nyx', floor(['T8'], { persistence: { logs: 3, days: 2 } } as unknown as Partial<FloorResult>), 'T8'),
    floorSentence('Nyx', floor(['T8'], { persistence: { logs: 3 } } as unknown as Partial<FloorResult>), 'T8'),
  ]
  for (const t of deferential) {
    assertStrictEquals(t.endsWith('the kind of thing vets like to hear about the same day.'), true, t)
    assertStrictEquals(/needs a call|call your vet|\btoday\b|can wait|no rush/i.test(t), false, t)
  }
})
