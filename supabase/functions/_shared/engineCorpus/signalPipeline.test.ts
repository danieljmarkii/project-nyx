// EN-F's guards over the Signal pipeline's hand-built corpus (Engines v3 PR-11b, CUL-1267).
// Run with: deno test supabase/functions/_shared/engineCorpus/
//
// (a) Every case lands exactly the cache row its hand-stated expectation says, flags off.
// (b) The floor: the corpus cannot shrink to nothing, or to cases that fire nothing.
// (c) Flag-off is today. The Signal reads no Engines key yet (SIGNAL_ENGINE_KEYS is empty),
//     so there is no gated step whose ABSENCE can be compared (the C-36 shape the vomit
//     read's flagOff.test.ts has). Until there is, every flag state must give the same row;
//     the tripwire below reds the day a Signal key lands, so this guard is replaced by the
//     absence guard in the same PR rather than left green over a gate it cannot see.
// (d) The care record is RESERVED: read by nothing. PR-23 (EN-9's care state) flips this
//     test on purpose, in the PR that starts reading it.
// (e) The pipeline is a function of its input: the same input twice gives the same result,
//     and the input is never mutated.
// (f) The stand-down fence: a throw while resolving or merging costs the marker, never the
//     findings, and says so (the shell logs `standDownError`).

import { assertEquals, assertStrictEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  assembleSignal,
  runSignalPipeline,
  templatePayload,
  templateTexts,
  type CareRecord,
  type PriorSignal,
  type SignalPayload,
} from '../../generate-signal/pipeline.ts'
import { SIGNAL_ENGINE_KEYS, type EngineFlags } from '../engineFlags.ts'
import {
  EMPTY_CARE_RECORD,
  POPULATED_CARE_RECORD,
  SIGNAL_PIPELINE_CORPUS,
  type SignalPipelineCase,
} from './signalPipeline.corpus.ts'

const OFF: EngineFlags = { on: [], readOk: true }
const FLAG_STATES: Record<string, EngineFlags> = {
  'every key off': OFF,
  'the flag read failed': { on: [], readOk: false },
  'engines_v3_en0 on': { on: ['engines_v3_en0'], readOk: true },
}

const run = (c: SignalPipelineCase, engineFlags: EngineFlags = OFF, careRecord: CareRecord = EMPTY_CARE_RECORD) =>
  runSignalPipeline({ rows: c.rows, prior: c.prior, nowMs: Date.parse(c.nowIso), engineFlags, careRecord })
const payload = (c: SignalPipelineCase, engineFlags?: EngineFlags, careRecord?: CareRecord): SignalPayload =>
  templatePayload(run(c, engineFlags, careRecord))
const types = (p: SignalPayload): string[] => p.findings.map((e) => e.finding.type)

Deno.test('(a) every case lands its hand-stated cache row, flags off', () => {
  for (const c of SIGNAL_PIPELINE_CORPUS) {
    const result = run(c)
    const p = templatePayload(result)
    assertEquals(types(p), c.expectedTypes, c.name)
    assertStrictEquals(result.standDownError, null, `${c.name}: the stand-down resolution threw`)
    // A card's headline is the first card's sentence; an empty run is building, never an all-clear.
    assertStrictEquals(p.isBuilding, result.findings.length === 0, c.name)
    if (!p.isBuilding) assertStrictEquals(p.signalText, p.findings.find((e) => e.finding.type !== 'stood_down')?.text, c.name)
    const e = c.expect ?? {}
    if (e.isBuilding !== undefined) assertStrictEquals(p.isBuilding, e.isBuilding, `${c.name}: isBuilding`)
    if (e.hasRecentActivity !== undefined) assertStrictEquals(result.hasRecentActivity, e.hasRecentActivity, `${c.name}: hasRecentActivity`)
    if (e.dietTrialActive !== undefined) assertStrictEquals(result.input.pet.dietTrialActive, e.dietTrialActive, `${c.name}: dietTrialActive`)
    if (e.vehicleMealIds !== undefined) {
      assertEquals(result.input.mealEvents.filter((m) => m.isMedicationVehicle).map((m) => m.id), e.vehicleMealIds, `${c.name}: vehicles`)
    }
    if (e.medicationWindowCount !== undefined) {
      assertStrictEquals(result.input.medicationWindows?.length ?? 0, e.medicationWindowCount, `${c.name}: medication windows`)
    }
  }
})

Deno.test('(b) the floor: enough cases, each safety lane fires, a building case, a minted and a withheld stand-down', () => {
  assertStrictEquals(SIGNAL_PIPELINE_CORPUS.length >= 12, true, `only ${SIGNAL_PIPELINE_CORPUS.length} cases`)
  const fired = new Set<string>(SIGNAL_PIPELINE_CORPUS.flatMap((c) => types(payload(c))))
  for (const t of ['symptom_chronicity', 'incident_red_flag', 'intake_decline', 'stood_down']) {
    assertStrictEquals(fired.has(t), true, `no case lands ${t}`)
  }
  assertStrictEquals(SIGNAL_PIPELINE_CORPUS.some((c) => payload(c).isBuilding), true, 'no building case')
  // A case whose prior card would mint, but whose prior is absent: the withheld half.
  assertStrictEquals(
    SIGNAL_PIPELINE_CORPUS.some((c) => c.prior === null && c.name.includes('stopped course')),
    true,
    'no case withholds a stand-down on a failed prior read',
  )
})

Deno.test('(c) tripwire: the Signal reads no Engines key yet; the first one replaces guard (c) below', () => {
  assertEquals(
    [...SIGNAL_ENGINE_KEYS],
    [],
    'a Signal key exists: replace guard (c) with the C-36 absence guard (flag off equals the pipeline with the gated step absent), as flagOff.test.ts does for the vomit read',
  )
})

Deno.test('(c) flag-off is today: every flag state gives the same cache row on every case', () => {
  for (const c of SIGNAL_PIPELINE_CORPUS) {
    const base = payload(c, OFF)
    for (const [label, flags] of Object.entries(FLAG_STATES)) {
      assertEquals(payload(c, flags), base, `${c.name}: ${label}`)
    }
  }
})

Deno.test('(d) the reserved care record is read by nothing (PR-23 flips this on purpose)', () => {
  for (const c of SIGNAL_PIPELINE_CORPUS) {
    assertEquals(run(c, OFF, POPULATED_CARE_RECORD), run(c, OFF, EMPTY_CARE_RECORD), c.name)
  }
})

Deno.test('(e) a function of its input: repeatable, and the input is never mutated', () => {
  for (const c of SIGNAL_PIPELINE_CORPUS) {
    const before = structuredClone({ rows: c.rows, prior: c.prior })
    const first = run(c)
    const second = run(c)
    assertEquals(first, second, `${c.name}: not repeatable`)
    assertEquals({ rows: c.rows, prior: c.prior }, before, `${c.name}: the input was mutated`)
  }
})

Deno.test('(f) a throw while resolving the stand-down costs the marker, never the findings', () => {
  const golden = SIGNAL_PIPELINE_CORPUS.find((c) => c.expectedTypes.includes('stood_down'))!
  const exploding: PriorSignal = {
    ...(golden.prior as PriorSignal),
    findings: new Proxy([], { get: () => { throw new Error('boom') } }),
  }
  const result = runSignalPipeline({
    rows: golden.rows,
    prior: exploding,
    nowMs: Date.parse(golden.nowIso),
    engineFlags: OFF,
    careRecord: EMPTY_CARE_RECORD,
  })
  assertStrictEquals(result.standDownError, 'boom')
  assertEquals(result.standDowns, [])
  const withoutPrior = run({ ...golden, prior: null })
  assertEquals(
    { ...templatePayload(result), standDownError: null },
    templatePayload(withoutPrior),
    'the row differs from a run with no prior beyond the reported error',
  )
  assertStrictEquals(templatePayload(result).standDownError, 'boom')
})

Deno.test('(f) a throw while merging the markers costs the marker, never the findings, and is reported', () => {
  const golden = SIGNAL_PIPELINE_CORPUS.find((c) => c.expectedTypes.includes('stood_down'))!
  const result = run(golden)
  assertStrictEquals(result.standDowns.length, 1, 'fixture premise: the golden case mints one marker')
  const exploding = new Proxy(result.standDowns[0], { get: () => { throw new Error('merge boom') } })
  const p = assembleSignal({ ...result, standDowns: [exploding] }, templateTexts(result), null)
  assertStrictEquals(p.standDownError, 'merge boom')
  assertEquals(types(p), [])
  // A clean run reports nothing.
  assertStrictEquals(templatePayload(result).standDownError, null)
})

Deno.test('assembleSignal refuses a phrasing that does not match the findings one for one', () => {
  const chronic = SIGNAL_PIPELINE_CORPUS.find((c) => c.expectedTypes.includes('symptom_chronicity'))!
  const result = run(chronic)
  assertThrows(() => assembleSignal(result, [], null))
  assertThrows(() => assembleSignal(result, ['a', 'b'], null))
})
