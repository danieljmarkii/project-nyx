// Clinical voice row 3 (CUL-2668): the stored read text says the floor on a floor sign and the
// deferential words elsewhere (docs/clinical-voice-inventory-2026-11.md §3b, §R). New reads only:
// these are the words a read writes, never a rewrite of a stored row.

import { assertStrictEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { buildContextualReadText, buildVisualFlagReadText, en0VomitCopy, en4VomitCopy, floorSentence, selectReadText as selectVomitReadText } from './index.ts'
import { buildVisualFlagReadText as stoolVisual, en7StoolCopy, selectReadText as selectStoolReadText } from '../analyze-stool/index.ts'
import { selectReadText as selectSharedReadText, type IncidentCopy } from '../_shared/incident-analysis.ts'
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

Deno.test('a floor photo beside a T6/T7/T8 count keeps the direct words (adversarial pass 1, B2)', () => {
  const base = { contextual: () => 'BASE', photoUnreadable: () => '', monitor: () => '', visualFlagFallback: () => '', noFlag: () => '' }
  for (const row of ['T6', 'T7', 'T8'] as const) {
    const floor = { tier: 'call_today', rows: [row], counts: { burst: 2, span: 2 } } as unknown as FloorResult
    const copy = en4VomitCopy(base as never, floor)
    for (const visual of [['blood'], ['suspected_foreign_material']]) {
      const t = copy.contextualWithPhotoFinding!('Rex', ['repeated_vomiting'], visual)
      assertStrictEquals(t.startsWith('I can see '), true, t)
      assertStrictEquals(/needs a call to your vet today\.$/.test(t), true, t)
      assertStrictEquals(/same day/.test(t), false, t)
    }
    // No floor sign in the photo (the model's own call): the count stays deferential.
    assertStrictEquals(copy.contextualWithPhotoFinding!('Rex', ['repeated_vomiting'], []).endsWith('the same day.'), true)
    // No photo finding at all: deferential.
    assertStrictEquals(copy.contextual('Rex', ['repeated_vomiting']).endsWith('the same day.'), true)
  }
})

Deno.test('a floor stool photo beside vomiting names the photo first and keeps the direct words (adversarial pass 1, B3)', () => {
  for (const reason of ['logged_loose', 'read_loose', 'read_hard', 'repeats', 'unread'] as const) {
    const copy = en7StoolCopy(reason)
    for (const [visual, seen] of [[['blood'], 'what looks like blood'], [['suspected_foreign_material'], "something that doesn't look like food"]] as const) {
      const t = copy.contextualWithPhotoFinding!('Rex', ['concurrent_vomiting'], [...visual])
      assertStrictEquals(t.startsWith(`I can see ${seen} in this stool photo. `), true, t)
      assertStrictEquals(/call your vet/.test(t), true, t)
      assertStrictEquals(/same day|worth telling/.test(t), false, t)
    }
    // A photo finding that is no floor sign keeps the deferential EN-7 line, named after the photo.
    const soft = copy.contextualWithPhotoFinding!('Rex', ['concurrent_vomiting'], [])
    assertStrictEquals(/same day/.test(soft), true, soft)
  }
  // The cat intake arm is the floor either way.
  assertStrictEquals(en7StoolCopy('intake').contextualWithPhotoFinding!('Rex', ['concurrent_vomiting'], ['blood']).endsWith('call your vet today.'), true)
})

// CUL-2682: the class, swept. Every NEWLY stored read sentence over a floor photo sign names the
// finding and says the floor's words, on vomit and stool, whichever copy the run's flags picked,
// with or without a contextual flag, and never in the model's own words.
const FLOOR_PHOTOS: ReadonlyArray<readonly [string[], RegExp]> = [
  [['blood'], /what looks like blood/],
  [['suspected_foreign_material'], /something that doesn't look like food/],
  [['blood', 'suspected_foreign_material'], /what looks like blood, and something that doesn't look like food/],
]
// "call your vet today" / "a call to your vet today" (§R). Only en4's call-now rows (T1–T3, D2)
// may say "needs a call" without the clock; every call-today row carries "today".
const FLOOR_WORDS = /call (to )?your vet today\b/
const CALL_NOW_WORDS = /\bneeds? a call to your vet\./
const MODEL = 'MODEL: calmly worth mentioning to your vet when you can.'

type Select = (contextualFlags: string[], visualFlags: string[]) => string
const viaCopy = (copy: IncidentCopy<string>): Select => (contextualFlags, visualFlags) =>
  selectSharedReadText(copy, {
    petName: 'Rex', recommendation: 'worth_a_call', contextualFlags, visualFlags,
    modelReadText: MODEL, photoUnreadable: false, hasPhoto: true, modelEscalated: true,
  })
const viaWrapper = (sel: typeof selectVomitReadText): Select => (contextualFlags, visualFlags) =>
  sel({ petName: 'Rex', recommendation: 'worth_a_call', contextualFlags: contextualFlags as never, visualFlags, modelReadText: MODEL, photoUnreadable: false, hasPhoto: true })

const VOMIT_FLAGS = [[], ['repeated_vomiting'], ['concurrent_lethargy'], ['feline_reduced_intake'], ['repeated_vomiting', 'concurrent_lethargy'], ['feline_reduced_intake', 'repeated_vomiting']]
const STOOL_FLAGS = [[], ['concurrent_vomiting'], ['repeated_loose_stool'], ['concurrent_lethargy'], ['repeated_loose_stool', 'concurrent_lethargy'], ['concurrent_vomiting', 'repeated_loose_stool']]

function floorOf(rows: FloorResult['rows'], tier: 'call_now' | 'call_today'): FloorResult {
  return { tier, rows, counts: { burst: 3, span: 3 } } as unknown as FloorResult
}

Deno.test('CUL-2682 · every stored sentence over a floor photo names the finding and says the floor, on vomit and stool', () => {
  const en0 = en0VomitCopy({ intakeRecord: { window: 'before_vomit', mealsLogged: 2 } } as never) as IncidentCopy<string>
  const vomit: Array<[string, Select]> = [
    ['vomit flag-off', viaWrapper(selectVomitReadText)],
    ['vomit en0', viaCopy(en0)],
  ]
  for (const row of ['T1', 'T2', 'T3', 'T6', 'T7', 'T8'] as const) {
    const tier = row === 'T1' || row === 'T2' || row === 'T3' ? 'call_now' : 'call_today'
    vomit.push([`vomit en4 ${row}${tier === 'call_now' ? ' (call now)' : ''}`, viaCopy(en4VomitCopy(en0 as never, floorOf([row], tier)) as IncidentCopy<string>)])
  }
  const stool: Array<[string, Select]> = [['stool flag-off', viaWrapper(selectStoolReadText as never)]]
  for (const reason of ['logged_loose', 'read_loose', 'read_hard', 'intake', 'repeats', 'unread'] as const) {
    stool.push([`stool en7 ${reason}`, viaCopy(en7StoolCopy(reason) as IncidentCopy<string>)])
  }
  let checked = 0
  for (const [variants, flagSets] of [[vomit, VOMIT_FLAGS], [stool, STOOL_FLAGS]] as const) {
    for (const [name, select] of variants) {
      for (const flags of flagSets) {
        for (const [visual, finding] of FLOOR_PHOTOS) {
          const t = select([...flags], [...visual])
          const at = `${name} [${flags.join(',')}] [${visual.join(',')}]: "${t}"`
          assertStrictEquals(t.includes('MODEL'), false, `model words stored: ${at}`)
          assertStrictEquals(finding.test(t), true, `finding unnamed: ${at}`)
          const words = FLOOR_WORDS.test(t) || (name.endsWith('(call now)') && CALL_NOW_WORDS.test(t))
          assertStrictEquals(words, true, `not the floor: ${at}`)
          assertStrictEquals(/same day|worth telling|worth a word/.test(t), false, `deferential over a floor photo: ${at}`)
          checked++
        }
      }
    }
  }
  assertStrictEquals(checked, (8 * VOMIT_FLAGS.length + 7 * STOOL_FLAGS.length) * FLOOR_PHOTOS.length)
})

Deno.test('CUL-2682 · without a floor photo sign, the model\'s own call and the flag-off context line are unchanged', () => {
  // The model's self-escalation with no photo flag keeps its words (step 3).
  assertStrictEquals(viaWrapper(selectVomitReadText)([], []), MODEL)
  assertStrictEquals(viaWrapper(selectStoolReadText as never)([], []), MODEL)
  // A contextual read beside no floor sign keeps the shipped line, word for word.
  assertStrictEquals(viaWrapper(selectStoolReadText as never)(['repeated_loose_stool'], []), "Rex has had more than one loose stool in a short window. Diarrhea that keeps up like that is worth a call to your vet.")
  assertStrictEquals(viaWrapper(selectVomitReadText)(['repeated_vomiting'], []), buildContextualReadText('Rex', ['repeated_vomiting']))
})
