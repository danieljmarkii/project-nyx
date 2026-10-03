// EN-F's guards over the Signal pipeline's hand-built corpus (Engines v3 PR-11b, CUL-1267).
// Run with: deno test supabase/functions/_shared/engineCorpus/
//
// (a) Every case lands exactly the cache row its hand-stated expectation says, flags off.
// (b) The floor: the corpus cannot shrink to nothing, or to cases that fire nothing.
// (c) Flag-off is today, the C-36 way (Engines v3 PR-22, CUL-1420, the Signal's first key):
//     with engines_v3_en10 off, the pipeline equals the pipeline with EN-10's step ABSENT,
//     even when a step that changes every finding is handed in and the shell's facts are
//     populated. Deleting the gate reds it; a gate that never opens reds the next test; and
//     with the real step on, the row differs from flag-off ONLY by the lines it adds.
// (c-en11) Engines v3 PR-32 (CUL-1141), the first key that changes what is detected: with
//     engines_v3_en11 off, the pipeline never reads EN-11's config (one that throws on any read
//     is handed in), so deleting the gate reds it; with it on, the config is read on every case;
//     and with the real config on, no safety card appears that flag-off did not show.
// (c-en9) Engines v3 PR-23 (CUL-1417), EN-9's care state: with engines_v3_en9 off, the
//     pipeline equals the pipeline with the care-state step ABSENT, even with a populated care
//     record, populated facts and a step that throws; with it on and the facts in hand, the
//     step runs on every case; over an incomplete read or with no facts it never runs; and the
//     real step leaves every escalation's finding untouched and never lowers its rank (AC-3).
// (d) The care record is read by the care-state step alone: flag off, a populated record
//     changes nothing (PR-23 flipped the PR-11b "read by nothing" pin into this).
// (e) The pipeline is a function of its input: the same input twice gives the same result,
//     and the input is never mutated.
// (f) The stand-down fence: a throw while resolving or merging costs the marker, never the
//     findings, and says so (the shell logs `standDownError`).
// (g)–(j) Engines v3 PR-09 (CUL-989), the with-and-without diff. The pulls now page newest-
//     first and can come back incomplete. (g) a complete read is today's row; (h) the row does
//     not depend on the order the rows arrive in; (i) an incomplete read loses no warning and
//     keeps no reassuring or resolving entry; (j) it floors every count it states and says so.
//     The byte-for-byte comparison against the pipeline BEFORE this PR is (a)'s hand-stated
//     rows plus the measured diff recorded in the PR; (g) is the part that stays true after.

import { assertEquals, assertStrictEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  assembleSignal,
  CARRY_MAX_DAYS,
  incompleteReadDisclosure,
  isReassuringOrResolving,
  runSignalPipeline,
  templatePayload,
  templateTexts,
  type CareRecord,
  type PriorSignal,
  type RankedFinding,
  type SignalPayload,
} from '../../generate-signal/pipeline.ts'
import { ENGINE_KEYS, SIGNAL_DECORATING_KEYS, SIGNAL_ENGINE_KEYS, type EngineFlags } from '../engineFlags.ts'
import { EN11_CONFIG, type DetectionConfig } from '../../generate-signal/detection.ts'
import { hasBannedSignalVocabulary, validatePhrasing } from '../../generate-signal/phrasing.ts'
import { EN10_CONTEXT_STEP, type CareContextFacts, type CareContextStep } from '../../generate-signal/careContext.ts'
import { careStateOf, concernSignOf, EN9_CARE_STATE_STEP, type CareStateStep } from '../../generate-signal/careState.ts'
import { careClaimReason } from '../../../../lib/careClaimScreens.ts'
import {
  EMPTY_CARE_RECORD,
  POPULATED_CARE_CONTEXT_FACTS,
  POPULATED_CARE_RECORD,
  SIGNAL_PIPELINE_CORPUS,
  type SignalPipelineCase,
} from './signalPipeline.corpus.ts'

const OFF: EngineFlags = { on: [], readOk: true }
// Derived from ENGINE_KEYS, never listed by hand (adversarial review, PR-11b): a list naming
// only today's key could not see a step gated on the next one, and that step would also slip
// past the stand-down gate, which compares only registered Signal keys.
const FLAG_STATES: Record<string, EngineFlags> = {
  'every key off': OFF,
  'the flag read failed': { on: [], readOk: false },
  'every key on': { on: [...ENGINE_KEYS].sort(), readOk: true },
  ...Object.fromEntries(ENGINE_KEYS.map((k) => [`${k} alone`, { on: [k], readOk: true }])),
}

const run = (
  c: SignalPipelineCase,
  engineFlags: EngineFlags = OFF,
  careRecord: CareRecord = EMPTY_CARE_RECORD,
  incompletePulls: readonly string[] = [],
  careContextFacts: CareContextFacts | null = null,
  step: CareContextStep = EN10_CONTEXT_STEP,
  en11Config: DetectionConfig = EN11_CONFIG,
  careStep: CareStateStep = EN9_CARE_STATE_STEP,
) =>
  runSignalPipeline(
    { rows: c.rows, incompletePulls, prior: c.prior, nowMs: Date.parse(c.nowIso), engineFlags, careRecord, careContextFacts },
    step,
    en11Config,
    careStep,
  )
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
  for (const t of ['symptom_chronicity', 'symptom_burden', 'symptom_worsening', 'incident_red_flag', 'intake_decline', 'stood_down']) {
    assertStrictEquals(fired.has(t), true, `no case lands ${t}`)
  }
  assertStrictEquals(SIGNAL_PIPELINE_CORPUS.some((c) => payload(c).isBuilding), true, 'no building case')
  // The withheld half, by behaviour: every minting case, with its prior gone (a failed or
  // absent read), mints nothing, and the corpus holds such a case itself.
  const minting = SIGNAL_PIPELINE_CORPUS.filter((c) => c.expectedTypes.includes('stood_down'))
  for (const c of minting) {
    assertStrictEquals(types(payload({ ...c, prior: null })).includes('stood_down'), false, `${c.name}: minted with no prior`)
  }
  assertStrictEquals(
    // a prior-less case whose rows WOULD mint under a minting case's prior
    SIGNAL_PIPELINE_CORPUS.some((c) => c.prior === null && types(payload({ ...c, prior: minting[0].prior })).includes('stood_down')),
    true,
    'no case withholds a stand-down on a failed prior read',
  )
})

// EN-10's step, absent (the C-36 comparison's other side) and a sentinel that marks every
// finding, so that its running is visible on any case with a finding.
const ABSENT: CareContextStep = (findings) => findings
const SENTINEL: CareContextStep = (findings) =>
  findings.map((r) => ({
    ...r,
    finding: { ...r.finding, careContext: [{ kind: 'visit', anchorOn: '1970-01-01', days: 1, count: 1, loggedDays: 1, text: 'sentinel' }] },
  }))
const EN10 = 'engines_v3_en10'
const EN9 = 'engines_v3_en9'
// EN-10's guards hold EN-9 off: EN-9 reads the same facts and has its own guard (c-en9), so a
// state with it on would compare two steps at once.
const NO_EN9 = Object.entries(FLAG_STATES).map(([l, f]) => [l, { ...f, on: f.on.filter((k) => k !== EN9) }] as const)
const OFF_STATES = NO_EN9.filter(([, f]) => !f.on.includes(EN10))
const ON_STATES = NO_EN9.filter(([, f]) => f.on.includes(EN10))
// The payload with every `careContext` removed: what the row would be had the step not run.
const withoutLines = (p: SignalPayload): SignalPayload =>
  JSON.parse(JSON.stringify(p, (k, v) => (k === 'careContext' ? undefined : v)))

Deno.test('(c) tripwire: the Signal keys are exactly the ones with an absence guard here', () => {
  // A decorating key is kept out of the stand-down gate on the strength of the next three
  // tests (the row changes only by its field); a new one needs its own absence guard beside
  // them, and a key that changes what is detected goes in SIGNAL_ENGINE_KEYS instead.
  assertEquals([...SIGNAL_DECORATING_KEYS], [EN10], 'a new decorating key needs its own absence guard beside (c)')
  assertEquals([...SIGNAL_ENGINE_KEYS], [EN9, EN11], 'a Signal key that changes a sentence or a rank needs its own absence guard beside (c-en9) / (c-en11)')
  assertStrictEquals(ON_STATES.length >= 2 && OFF_STATES.length >= 3, true, 'the flag states lost a side')
})

Deno.test('(c) flag-off equals EN-10\'s step absent, even with populated facts and a step that changes everything', () => {
  // Compared under the SAME flags with the step absent: since PR-32 a Signal key (en11) reaches
  // detection and the stand-down gate, so each state is its own baseline, and only EN-10's step
  // may differ between the two sides.
  for (const c of SIGNAL_PIPELINE_CORPUS) {
    for (const [label, flags] of OFF_STATES) {
      const absent = run(c, flags, EMPTY_CARE_RECORD, [], null, ABSENT)
      assertEquals(run(c, flags, EMPTY_CARE_RECORD, [], POPULATED_CARE_CONTEXT_FACTS, SENTINEL), absent, `${c.name}: ${label}`)
    }
    // Key on, but the shell's read failed (null facts): no step either.
    for (const [label, flags] of ON_STATES) {
      const absent = run(c, flags, EMPTY_CARE_RECORD, [], null, ABSENT)
      assertEquals(run(c, flags, EMPTY_CARE_RECORD, [], null, SENTINEL), absent, `${c.name}: ${label}, no facts`)
    }
  }
  // And with every key off and the read answering, that is exactly (a)'s hand-stated row.
  for (const c of SIGNAL_PIPELINE_CORPUS) {
    assertEquals(types(templatePayload(run(c, OFF, EMPTY_CARE_RECORD, [], POPULATED_CARE_CONTEXT_FACTS, SENTINEL))), c.expectedTypes, c.name)
  }
})

Deno.test('(c) the gate opens for engines_v3_en10: the step runs on every case with a finding', () => {
  let opened = 0
  for (const c of SIGNAL_PIPELINE_CORPUS) {
    if (run(c).findings.length === 0) continue
    for (const [label, flags] of ON_STATES) {
      const on = run(c, flags, EMPTY_CARE_RECORD, [], POPULATED_CARE_CONTEXT_FACTS, SENTINEL)
      assertStrictEquals(on.findings.every((r: RankedFinding) => r.finding.careContext?.[0]?.text === 'sentinel'), true, `${c.name}: ${label}`)
      opened++
    }
  }
  assertStrictEquals(opened >= 10, true, `the gate opened on only ${opened} runs`)
})

Deno.test('(c) the real step changes nothing but the lines: presence, rank, sentence and summary hold', () => {
  let lined = 0
  for (const c of SIGNAL_PIPELINE_CORPUS) {
    for (const [label, flags] of ON_STATES) {
      // The same flags less EN-10's key: the row EN-10 decorates (en11 may have changed it).
      const base = payload(c, { ...flags, on: flags.on.filter((k) => k !== EN10) })
      const result = run(c, flags, EMPTY_CARE_RECORD, [], POPULATED_CARE_CONTEXT_FACTS)
      const p = templatePayload(result)
      assertEquals(withoutLines(p), base, `${c.name}: ${label}`)
      for (const e of p.findings) {
        for (const line of (e.finding as { careContext?: { text: string }[] }).careContext ?? []) {
          lined++
          // Every line passes the screens the Signal's own sentences pass (CUL-1271).
          assertStrictEquals(careClaimReason(line.text), null, `${c.name}: ${line.text}`)
          assertStrictEquals(hasBannedSignalVocabulary(line.text), false, `${c.name}: ${line.text}`)
          assertStrictEquals(line.text.includes('!'), false, `${c.name}: ${line.text}`)
        }
      }
    }
  }
  // Non-vacuity: the corpus's chronicity and timing cases carry the visit line.
  assertStrictEquals(lined >= 4, true, `only ${lined} lines across the corpus`)
})

Deno.test('(c) over an incomplete read the step does not run, key on or off', () => {
  for (const c of SIGNAL_PIPELINE_CORPUS) {
    for (const [label, flags] of ON_STATES) {
      assertEquals(
        run(c, flags, EMPTY_CARE_RECORD, ['symptoms'], POPULATED_CARE_CONTEXT_FACTS, SENTINEL),
        run(c, flags, EMPTY_CARE_RECORD, ['symptoms'], null, ABSENT),
        `${c.name}: ${label}`,
      )
    }
  }
})

// ── (c-en11) EN-11, the first key that changes detection (PR-32, CUL-1141) ──
// A config that throws on any read: the C-36 "feature absent" for a config, since a gate that
// lets it through cannot stay quiet.
const THROWING_CONFIG = new Proxy({} as DetectionConfig, {
  get: () => {
    throw new Error('EN-11 config read')
  },
})
const EN11 = 'engines_v3_en11'
const EN11_OFF_STATES = Object.entries(FLAG_STATES).filter(([, f]) => !f.on.includes(EN11))
const EN11_ON_STATES = Object.entries(FLAG_STATES).filter(([, f]) => f.on.includes(EN11))

Deno.test('(c-en11) flag off never reads EN-11\'s config: the row is the one with it absent', () => {
  assertStrictEquals(EN11_ON_STATES.length >= 2 && EN11_OFF_STATES.length >= 3, true, 'the flag states lost a side')
  for (const c of SIGNAL_PIPELINE_CORPUS) {
    for (const [label, flags] of EN11_OFF_STATES) {
      assertEquals(run(c, flags, EMPTY_CARE_RECORD, [], null, EN10_CONTEXT_STEP, THROWING_CONFIG), run(c, flags), `${c.name}: ${label}`)
    }
  }
})

Deno.test('(c-en11) the gate opens: with engines_v3_en11 on, every case reads EN-11\'s config', () => {
  let opened = 0
  for (const c of SIGNAL_PIPELINE_CORPUS) {
    for (const [label, flags] of EN11_ON_STATES) {
      assertThrows(() => run(c, flags, EMPTY_CARE_RECORD, [], null, EN10_CONTEXT_STEP, THROWING_CONFIG), Error, 'EN-11 config read', `${c.name}: ${label}`)
      opened++
    }
  }
  assertStrictEquals(opened >= SIGNAL_PIPELINE_CORPUS.length * 2, true, `the gate opened on only ${opened} runs`)
})

Deno.test('(c-en11) the real config adds no safety card and moves nothing over an empty record', () => {
  // EN-11 only withholds insight cards and raises ④'s floor, so flag on shows no safety card
  // flag off did not. (An insight card may appear: a withheld one frees a curation slot.)
  const ON: EngineFlags = { on: [EN11], readOk: true }
  let changed = 0
  for (const c of SIGNAL_PIPELINE_CORPUS) {
    const off = payload(c, OFF)
    const on = payload(c, ON)
    const safety = (p: SignalPayload) =>
      p.findings.filter((e) => (e.finding as { priorityClass?: string }).priorityClass === 'safety').map((e) => e.finding.type)
    for (const t of safety(on)) assertStrictEquals(safety(off).includes(t), true, `${c.name}: ${t} appeared under EN-11`)
    if (JSON.stringify(types(on)) !== JSON.stringify(types(off))) changed++
    if (off.isBuilding) assertStrictEquals(on.isBuilding, true, `${c.name}: an empty row gained a card`)
  }
  // Non-vacuity: the corpus holds a case EN-11 changes (the 2-vs-0 worsening case).
  assertStrictEquals(changed >= 1, true, 'no corpus case moves under EN-11, so this test checks nothing')
})

// ── (c-en9) EN-9, the care state (PR-23, CUL-1417) ──
const THROWING_CARE: CareStateStep = () => {
  throw new Error('EN-9 step ran')
}
const ABSENT_CARE: CareStateStep = (findings) => findings
const EN9_OFF_STATES = Object.entries(FLAG_STATES).filter(([, f]) => !f.on.includes(EN9))
const EN9_ON_STATES = Object.entries(FLAG_STATES).filter(([, f]) => f.on.includes(EN9))

Deno.test('(c-en9) flag off never runs the care state: the row is the one with the step absent', () => {
  assertStrictEquals(EN9_ON_STATES.length >= 2 && EN9_OFF_STATES.length >= 3, true, 'the flag states lost a side')
  for (const c of SIGNAL_PIPELINE_CORPUS) {
    for (const [label, flags] of EN9_OFF_STATES) {
      assertEquals(
        run(c, flags, POPULATED_CARE_RECORD, [], POPULATED_CARE_CONTEXT_FACTS, EN10_CONTEXT_STEP, EN11_CONFIG, THROWING_CARE),
        run(c, flags, EMPTY_CARE_RECORD, [], POPULATED_CARE_CONTEXT_FACTS, EN10_CONTEXT_STEP, EN11_CONFIG, ABSENT_CARE),
        `${c.name}: ${label}`,
      )
    }
  }
})

Deno.test('(c-en9) the gate opens with the facts in hand, and stays shut without them or over an incomplete read', () => {
  let opened = 0
  for (const c of SIGNAL_PIPELINE_CORPUS) {
    for (const [label, flags] of EN9_ON_STATES) {
      assertThrows(() => run(c, flags, POPULATED_CARE_RECORD, [], POPULATED_CARE_CONTEXT_FACTS, EN10_CONTEXT_STEP, EN11_CONFIG, THROWING_CARE), Error, 'EN-9 step ran', `${c.name}: ${label}`)
      opened++
      // No facts (the shell's read failed) or a partial read: every concern keeps asking.
      run(c, flags, POPULATED_CARE_RECORD, [], null, EN10_CONTEXT_STEP, EN11_CONFIG, THROWING_CARE)
      run(c, flags, POPULATED_CARE_RECORD, ['symptoms'], POPULATED_CARE_CONTEXT_FACTS, EN10_CONTEXT_STEP, EN11_CONFIG, THROWING_CARE)
    }
  }
  assertStrictEquals(opened >= SIGNAL_PIPELINE_CORPUS.length * 2, true, `the gate opened on only ${opened} runs`)
})

Deno.test('(c-en9) AC-3: with every concern answered, every escalation keeps its finding and never drops a rank', () => {
  const ON: EngineFlags = { on: [EN9], readOk: true }
  let concerns = 0
  let escalations = 0
  for (const c of SIGNAL_PIPELINE_CORPUS) {
    const off = run(c, OFF, EMPTY_CARE_RECORD, [], POPULATED_CARE_CONTEXT_FACTS)
    // An answer about every sign the case has a concern on, given yesterday.
    const signs = [...new Set(off.findings.map((r) => concernSignOf(r.finding)).filter((s): s is NonNullable<typeof s> => s !== null))]
    const nowMs = Date.parse(c.nowIso)
    const record: CareRecord = {
      ...EMPTY_CARE_RECORD,
      acknowledgements: signs.map((sign, i) => ({
        id: `ack-${i}`, sign, source: 'my_vet_knows' as const, anchorOn: new Date(nowMs - 86_400_000).toISOString().slice(0, 10),
        createdAt: new Date(nowMs - 86_400_000).toISOString(), retracts: null, trial: null, course: null,
      })),
    }
    const on = run(c, ON, record, [], POPULATED_CARE_CONTEXT_FACTS)
    assertStrictEquals(on.findings.length, off.findings.length, `${c.name}: a card appeared or vanished`)
    off.findings.forEach((r, i) => {
      if (concernSignOf(r.finding) !== null) {
        concerns++
        return
      }
      if (r.finding.priorityClass !== 'safety') return
      escalations++
      const j = on.findings.findIndex((x) => JSON.stringify(x.finding) === JSON.stringify(r.finding))
      assertStrictEquals(j >= 0, true, `${c.name}: ${r.finding.type} changed under a care state`)
      assertStrictEquals(j <= i, true, `${c.name}: ${r.finding.type} dropped from ${i} to ${j}`)
    })
    // Every concern carries a care state, and a watched one never sits above an unwatched safety card.
    const watchedAt = on.findings.findIndex((r) => careStateOf(r.finding)?.state === 'with_vet')
    if (watchedAt >= 0) {
      for (const r of on.findings.slice(watchedAt)) {
        if (r.finding.priorityClass === 'safety') assertStrictEquals(careStateOf(r.finding)?.state === 'with_vet' || careStateOf(r.finding)?.state === 'recheck_booked', true, `${c.name}: ${r.finding.type} below a watched concern`)
      }
    }
    for (const r of on.findings) if (concernSignOf(r.finding) !== null) assertStrictEquals(careStateOf(r.finding) !== null, true, `${c.name}: a concern with no care state`)
  }
  assertStrictEquals(concerns >= 3 && escalations >= 3, true, `only ${concerns} concerns and ${escalations} escalations: the property checks too little`)
})

Deno.test('(d) the care record is read by the care-state step alone: flag off, a populated record changes nothing', () => {
  for (const c of SIGNAL_PIPELINE_CORPUS) {
    assertEquals(run(c, OFF, POPULATED_CARE_RECORD, [], POPULATED_CARE_CONTEXT_FACTS), run(c, OFF, EMPTY_CARE_RECORD, [], POPULATED_CARE_CONTEXT_FACTS), c.name)
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
    incompletePulls: [],
    prior: exploding,
    nowMs: Date.parse(golden.nowIso),
    engineFlags: OFF,
    careRecord: EMPTY_CARE_RECORD,
    careContextFacts: null,
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

// ── Engines v3 PR-09 (CUL-989): the with-and-without diff ─────────────────────

const INCOMPLETE = ['symptoms']
const partial = (c: SignalPipelineCase): SignalPayload => templatePayload(run(c, OFF, EMPTY_CARE_RECORD, INCOMPLETE))
// A card's identity for "the same warning": its lane and the symptom it is about.
const cardKey = (f: { type: string; symptomType?: unknown; incidentType?: unknown }): string =>
  `${f.type}:${String(f.symptomType ?? f.incidentType ?? '')}`

Deno.test('(g) a complete read is today: nothing floored, no disclosure, the summary unchanged', () => {
  for (const c of SIGNAL_PIPELINE_CORPUS) {
    const result = run(c)
    assertStrictEquals(result.incompleteDisclosure, null, c.name)
    for (const r of result.findings) {
      // Absent, not false: a complete read's finding must serialise exactly as it did before
      // the field existed, or every cached row's bytes move.
      assertStrictEquals('countIsFloor' in r.finding, false, `${c.name}: ${r.finding.type} carries countIsFloor`)
    }
    assertStrictEquals(templatePayload(result).findings.some((e) => /\bat least\b/.test(e.text)), false, c.name)
  }
})

Deno.test('(h) the row does not depend on the order the rows arrive in (newest-first, reversed, shuffled)', () => {
  // Before CUL-989 PostgREST returned rows in physical order; the paged pulls return them
  // newest-first. Detection must not have depended on the old order, and must not depend on
  // any order: every array is reversed, then rotated, and each gives the corpus row.
  const permute = (c: SignalPipelineCase, f: <T>(xs: T[]) => T[]): SignalPipelineCase => ({
    ...c,
    rows: {
      ...c.rows,
      symptoms: f(c.rows.symptoms),
      meals: f(c.rows.meals),
      arrangements: f(c.rows.arrangements),
      regimens: f(c.rows.regimens),
      doseEvents: f(c.rows.doseEvents),
      incidentAnalyses: f(c.rows.incidentAnalyses),
    },
  })
  const reverse = <T>(xs: T[]): T[] => [...xs].reverse()
  const rotate = <T>(xs: T[]): T[] => (xs.length < 2 ? [...xs] : [...xs.slice(Math.ceil(xs.length / 3)), ...xs.slice(0, Math.ceil(xs.length / 3))])
  const newestFirst = <T>(xs: T[]): T[] =>
    [...xs].sort((a, b) => String((b as { occurred_at?: string }).occurred_at ?? '').localeCompare(String((a as { occurred_at?: string }).occurred_at ?? '')))
  let moved = 0
  for (const c of SIGNAL_PIPELINE_CORPUS) {
    const base = payload(c)
    for (const [label, f] of [['reversed', reverse], ['rotated', rotate], ['newest-first', newestFirst]] as const) {
      const p = permute(c, f)
      if (JSON.stringify(p.rows) !== JSON.stringify(c.rows)) moved++
      assertEquals(templatePayload(run(p)), base, `${c.name}: ${label}`)
    }
  }
  // Non-vacuity: the permutations actually moved rows on most of the corpus.
  assertStrictEquals(moved >= SIGNAL_PIPELINE_CORPUS.length, true, `only ${moved} permutations moved a row`)
})

Deno.test('(i) an incomplete read loses no warning and keeps nothing reassuring or resolving', () => {
  let withheld = 0
  let kept = 0
  for (const c of SIGNAL_PIPELINE_CORPUS) {
    const full = payload(c)
    const part = partial(c)
    const partKeys = part.findings.map((e) => cardKey(e.finding))
    for (const e of full.findings) {
      if (e.finding.type === 'stood_down') continue // resolving: asserted absent below
      const f = e.finding
      if (isReassuringOrResolving(f)) {
        assertStrictEquals(partKeys.includes(cardKey(f)), false, `${c.name}: ${f.type} survived an incomplete read`)
        withheld++
      } else {
        // Every other card, safety or not, is still there: the rule only ever REMOVES the
        // reassuring and resolving shapes, never a warning.
        assertStrictEquals(partKeys.includes(cardKey(f)), true, `${c.name}: lost ${f.type}`)
        if (f.priorityClass === 'safety') kept++
      }
    }
    assertStrictEquals(part.findings.some((e) => e.finding.type === 'stood_down'), false, `${c.name}: a stand-down over a partial read`)
    assertStrictEquals(part.findings.some((e) => e.finding.type !== 'stood_down' && isReassuringOrResolving(e.finding)), false, c.name)
    // Nothing appears that neither the complete read nor the prior Signal carried (a prior safety
    // card is carried forward over an incomplete read, by design: see (k)).
    const priorRaw = Array.isArray(c.prior?.findings) ? (c.prior!.findings as { finding?: { type: string; symptomType?: unknown } }[]) : []
    const priorKeys = priorRaw.filter((e) => e?.finding).map((e) => cardKey(e.finding!))
    for (const k of partKeys) {
      assertStrictEquals(full.findings.map((e) => cardKey(e.finding)).includes(k) || priorKeys.includes(k), true, `${c.name}: gained ${k}`)
    }
  }
  // Non-vacuity: the corpus exercises both halves (a reflection and a fewer-during-trial card
  // withheld; chronicity, worsening, red flag and decline kept).
  assertStrictEquals(withheld >= 2, true, `withheld only ${withheld}`)
  assertStrictEquals(kept >= 4, true, `kept only ${kept} safety cards`)
})

Deno.test('(j) an incomplete read floors every count it states, and says so', () => {
  let floored = 0
  for (const c of SIGNAL_PIPELINE_CORPUS) {
    const result = run(c, OFF, EMPTY_CARE_RECORD, INCOMPLETE)
    const p = templatePayload(result)
    for (const e of p.findings) {
      const f = e.finding
      if (f.type === 'stood_down') throw new Error(`${c.name}: a stand-down over a partial read`)
      // A card carried from the prior Signal is shown as it was; everything computed now is floored.
      if (result.carried.some((x) => x.finding === f)) continue
      assertStrictEquals(f.countIsFloor, true, `${c.name}: ${f.type} not floored`)
    }
    const computed = p.findings.filter((x) => !result.carried.some((cf) => cf.finding === x.finding))
    for (const e of computed.filter((x) => ['symptom_chronicity', 'symptom_worsening', 'symptom_burden', 'trial_response'].includes(x.finding.type))) {
      assertStrictEquals(/\bat least\b/.test(e.text), true, `${c.name}: "${e.text}"`)
      floored++
    }
    // Worsening states no comparison over a partial read: the prior week is a floor too.
    for (const e of p.findings.filter((x) => x.finding.type === 'symptom_worsening')) {
      assertStrictEquals(/up from|after none/.test(e.text), false, `${c.name}: "${e.text}"`)
    }
    // The summary slot carries the disclosure, deterministic, whatever the record held.
    assertEquals(p.summary, incompleteReadDisclosure(result.petName, p.findings.some((e) => e.finding.priorityClass === 'safety')))
    assertStrictEquals(result.summaryPacket, null, c.name)
    assertStrictEquals(p.summary?.text.includes('!'), false)
  }
  assertStrictEquals(floored >= 3, true, `only ${floored} floored sentences`)
})

Deno.test('(h2) a same-minute tie cannot decide a safety card (the order a read chose is invisible)', () => {
  // The adversarial pass's counterexample: the refusing cat, plus a same-food, same-minute twin of
  // the 18:00 refusal rated `all`. Before the canonical order the card fired or not by which of
  // the two arrived last, and paged reads order ties by a random UUID.
  const cat = SIGNAL_PIPELINE_CORPUS.find((c) => c.expectedTypes.includes('intake_decline'))!
  const refusal = cat.rows.meals[cat.rows.meals.length - 1]
  const twin = { ...refusal, id: 'meal-twin', meals: { ...(refusal.meals as Record<string, unknown>), intake_rating: 'all' } } as typeof refusal
  const twinFirst = { ...cat, rows: { ...cat.rows, meals: [twin, ...cat.rows.meals] } }
  const twinLast = { ...cat, rows: { ...cat.rows, meals: [...cat.rows.meals, twin] } }
  assertEquals(payload(twinFirst), payload(twinLast))
  // And the tie is in the input, not assumed: same instant, same food, different rating.
  assertStrictEquals(twin.occurred_at, refusal.occurred_at)
  // Not only deterministic but toward escalation: whatever the twin's id sorts as, the refusal is
  // the "latest" meal and the card fires (the re-check found it decided by the UUID before).
  // Ids chosen to sort on BOTH sides of the refusal's own id ('meal-…'), so each order is exercised.
  for (const twinId of ['0000-twin', 'zzzz-twin']) {
    const t = { ...twin, id: twinId }
    assertEquals(types(payload({ ...cat, rows: { ...cat.rows, meals: [...cat.rows.meals, t] } })), ['intake_decline'], twinId)
  }
})

Deno.test('(k) a partial read of the SAME record never weakens or drops a safety card the full read showed', () => {
  // (i) and (j) re-run the whole record with the flag set. This one removes rows, the way a
  // newest-first shortfall does (the OLDEST go), with the full read's row as the prior Signal,
  // which is what the engine will have cached before a read comes back short.
  // Each lane's own scale: ④ / ⑦ soft < standard < firm; the burden card (PR-14d) soon < today.
  const TIER: Record<string, number> = { soft: 0, standard: 1, firm: 2, soon: 0, today: 1 }
  let probed = 0
  for (const c of SIGNAL_PIPELINE_CORPUS) {
    const full = payload(c)
    const fullSafety = full.findings.filter((e) => e.finding.type !== 'stood_down' && e.finding.priorityClass === 'safety')
    if (fullSafety.length === 0) continue
    const prior: PriorSignal = { findings: full.findings, generatedAt: new Date(Date.parse(c.nowIso) - 86_400_000).toISOString(), engineFlags: [] }
    const newestFirst = <T extends { occurred_at: string }>(xs: T[]) => [...xs].sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at))
    for (const keep of [0.8, 0.6, 0.4, 0.2]) {
      const cut = <T extends { occurred_at: string }>(xs: T[]) => newestFirst(xs).slice(0, Math.ceil(xs.length * keep))
      const truncated: SignalPipelineCase = { ...c, prior, rows: { ...c.rows, symptoms: cut(c.rows.symptoms), meals: cut(c.rows.meals) } }
      const p = templatePayload(run(truncated, OFF, EMPTY_CARE_RECORD, INCOMPLETE))
      for (const e of fullSafety) {
        const same = p.findings.find((x) => cardKey(x.finding) === cardKey(e.finding))
        assertStrictEquals(same !== undefined, true, `${c.name} @${keep}: lost ${cardKey(e.finding)}`)
        const was = (e.finding as { tier?: string }).tier
        const now = (same!.finding as { tier?: string }).tier
        if (was !== undefined) assertStrictEquals(TIER[now!] >= TIER[was], true, `${c.name} @${keep}: ${was} → ${now}`)
      }
      assertStrictEquals(p.findings.some((x) => x.finding.type !== 'stood_down' && isReassuringOrResolving(x.finding)), false)
      probed++
    }
  }
  assertStrictEquals(probed >= 12, true, `only ${probed} truncations probed`)
})

// Engines v3 PR-32 (adversarial pass, D1): carrying the previous safety cards over an incomplete
// read never depends on the flags. Every flag state, a read that did not answer, and a flip either
// way: the emptied run keeps every safety card the prior row held.
Deno.test('(k-flags) the carry never depends on the flag state: a failed flag read or a flip loses no safety card', () => {
  const states: [string, unknown, EngineFlags][] = [
    ...Object.entries(FLAG_STATES).map(([label, f]) => [label, [], f] as [string, unknown, EngineFlags]),
    ['engines_v3_en11 rolled back', ['engines_v3_en11'], OFF],
    ['engines_v3_en11 turned on', [], { on: ['engines_v3_en11'], readOk: true }],
  ]
  let carried = 0
  for (const c of SIGNAL_PIPELINE_CORPUS) {
    const fullSafety = payload(c).findings.filter((e) => e.finding.type !== 'stood_down' && e.finding.priorityClass === 'safety')
    if (fullSafety.length === 0) continue
    for (const [label, priorFlags, flags] of states) {
      const prior: PriorSignal = { findings: payload(c).findings, generatedAt: c.nowIso, engineFlags: priorFlags }
      const nowIso = new Date(Date.parse(c.nowIso) + 86_400_000).toISOString()
      const emptied: SignalPipelineCase = { ...c, nowIso, prior, rows: { ...c.rows, symptoms: [], meals: [], incidentAnalyses: [], doseEvents: [] } }
      const keys = templatePayload(run(emptied, flags, EMPTY_CARE_RECORD, INCOMPLETE)).findings.map((e) => cardKey(e.finding))
      for (const e of fullSafety) {
        assertStrictEquals(keys.includes(cardKey(e.finding)), true, `${c.name} / ${label}: lost ${cardKey(e.finding)}`)
        carried++
      }
    }
  }
  assertStrictEquals(carried >= 20, true, `only ${carried} carries checked`)
})

Deno.test('(k2) with no prior, a partial read still never shows the empty-record headline', () => {
  for (const c of SIGNAL_PIPELINE_CORPUS) {
    const p = templatePayload(run({ ...c, prior: null }, OFF, EMPTY_CARE_RECORD, INCOMPLETE))
    if (p.isBuilding) assertStrictEquals(p.signalText, p.summary?.text, `${c.name}: "${p.signalText}"`)
  }
})

// The carried card over a chain of incomplete reads: each run's row is the next run's prior.
const chain = (c: SignalPipelineCase, stepsDays: number[]): SignalPayload[] => {
  let prior: PriorSignal = { findings: payload(c).findings, generatedAt: c.nowIso, engineFlags: [] }
  const out: SignalPayload[] = []
  for (const d of stepsDays) {
    const nowIso = new Date(Date.parse(c.nowIso) + d * 86_400_000).toISOString()
    const emptied: SignalPipelineCase = { ...c, nowIso, prior, rows: { ...c.rows, symptoms: [], meals: [], incidentAnalyses: [], doseEvents: [] } }
    const p = templatePayload(run(emptied, OFF, EMPTY_CARE_RECORD, INCOMPLETE))
    out.push(p)
    prior = { findings: p.findings, generatedAt: nowIso, engineFlags: [] }
  }
  return out
}

Deno.test('(k3) a carried card is dated, never its old sentence, and ages out; then the headline is the disclosure', () => {
  let carriedSeen = 0
  for (const c of SIGNAL_PIPELINE_CORPUS) {
    const fullSafety = payload(c).findings.filter((e) => e.finding.type !== 'stood_down' && e.finding.priorityClass === 'safety')
    if (fullSafety.length === 0) continue
    const [day3, day10, dayPast] = chain(c, [3, 10, CARRY_MAX_DAYS + 1])
    for (const p of [day3, day10]) {
      const carried = p.findings.filter((e) => e.finding.type !== 'stood_down' && e.finding.carriedFrom !== undefined)
      assertStrictEquals(carried.length, fullSafety.length, `${c.name}: carried ${carried.length}`)
      for (const e of carried) {
        // Dated from the read that COMPUTED it, which a re-carry does not reset.
        assertStrictEquals(e.finding.type !== 'stood_down' && e.finding.carriedFrom, new Date(Date.parse(c.nowIso)).toISOString())
        assertStrictEquals(/^An earlier read of /.test(e.text), true, e.text)
        assertStrictEquals(/\bjust\b|up from|this week|since|\d+ (episode|of the last)/.test(e.text), false, e.text)
        assertStrictEquals(validatePhrasing(e.text, e.finding as never), true, e.text)
        carriedSeen++
      }
    }
    // Past the bound, from the ORIGINAL read: nothing carried, and the headline never claims recovery.
    assertStrictEquals(dayPast.findings.length, 0, `${c.name}: still carrying past the bound`)
    assertStrictEquals(dayPast.signalText, dayPast.summary?.text, c.name)
  }
  assertStrictEquals(carriedSeen >= 8, true, `only ${carriedSeen} carried cards seen`)
})

Deno.test('(k4) only the five safety lanes are carried: a forged or malformed prior entry never is', () => {
  const quiet = SIGNAL_PIPELINE_CORPUS.find((c) => c.name === 'a new pet with nothing logged')!
  const forged: PriorSignal = {
    findings: [
      { rank: 0, text: 'Your cat is fine.', finding: { type: 'food_symptom_correlation', priorityClass: 'safety', symptomType: 'vomit' } },
      { rank: 1, text: 'x', finding: { type: 'no_such_lane', priorityClass: 'safety' } },
      { rank: 2, text: 'x', finding: { type: 'symptom_chronicity', priorityClass: 'insight', symptomType: 'vomit' } },
      { rank: 3, text: 'x', finding: { type: 'symptom_chronicity', priorityClass: 'safety' } }, // no symptomType
      { rank: 4, text: 'x', finding: null },
      // The third check's two: a red flag with no flags (it threw), an unknown symptom ("undefined").
      { rank: 5, text: 'x', finding: { type: 'incident_red_flag', priorityClass: 'safety', incidentType: 'vomit' } },
      { rank: 6, text: 'x', finding: { type: 'incident_red_flag', priorityClass: 'safety', incidentType: 'vomit', flags: ['nope'] } },
      { rank: 7, text: 'x', finding: { type: 'symptom_chronicity', priorityClass: 'safety', symptomType: 'zzz', tier: 'firm' } },
      { rank: 8, text: 'x', finding: { type: 'symptom_chronicity', priorityClass: 'safety', symptomType: 'toString', tier: 'firm' } },
      { rank: 9, text: 'x', finding: { type: 'symptom_chronicity', priorityClass: 'safety', symptomType: 'vomit', tier: 'constructor' } },
      // PR-14d's burden card: its own tier scale, never the other lanes' (and never a missing one).
      { rank: 10, text: 'x', finding: { type: 'symptom_burden', priorityClass: 'safety', symptomType: 'vomit', tier: 'firm' } },
      { rank: 11, text: 'x', finding: { type: 'symptom_burden', priorityClass: 'safety', symptomType: 'vomit' } },
      { rank: 12, text: 'x', finding: { type: 'symptom_burden', priorityClass: 'safety', symptomType: 'zzz', tier: 'today' } },
      'garbage',
    ],
    generatedAt: new Date(Date.parse(quiet.nowIso) - 86_400_000).toISOString(),
    engineFlags: [],
  }
  const p = templatePayload(run({ ...quiet, prior: forged }, OFF, EMPTY_CARE_RECORD, INCOMPLETE))
  assertEquals(p.findings, [])
  // A future-dated prior carries nothing either (a clock skew cannot pin a card forever).
  const future = { ...forged, findings: payload(SIGNAL_PIPELINE_CORPUS.find((c) => c.expectedTypes.includes('intake_decline'))!).findings, generatedAt: '2099-01-01T00:00:00.000Z' }
  assertEquals(templatePayload(run({ ...quiet, prior: future }, OFF, EMPTY_CARE_RECORD, INCOMPLETE)).findings, [])
})

Deno.test('(k5) a carried intake card names the finding it carries: a refusal is never "eating less"', () => {
  const cat = SIGNAL_PIPELINE_CORPUS.find((c) => c.expectedTypes.includes('intake_decline'))!
  const [later] = chain(cat, [2])
  const card = later.findings.find((e) => e.finding.type === 'intake_decline')!
  const trigger = (card.finding as { trigger?: string }).trigger
  assertStrictEquals(
    /turning down a food they usually eat/.test(card.text),
    trigger === 'refused_normal_food',
    `${trigger}: "${card.text}"`,
  )
  assertStrictEquals(/undefined/.test(card.text), false)
})

Deno.test('(k6) the burden card holds a prior "today" over an incomplete read, and its sentence stays true', () => {
  // Engines v3 PR-14d (CUL-1410). The GAP-5 cat's card says "today" on Thursday. Three days later
  // the run ended four days ago, so a complete read says "soon"; a read that came back short must
  // not soften the prior card (CUL-989), and the sentence it holds must still be true of the rows.
  const gap5 = SIGNAL_PIPELINE_CORPUS.find((c) => c.name.includes('GAP-5') && c.name.includes('no photos'))!
  const shown = payload(gap5)
  const burden = shown.findings.find((e) => e.finding.type === 'symptom_burden')!
  assertStrictEquals((burden.finding as { tier?: string }).tier, 'today')
  const later = { ...gap5, nowIso: new Date(Date.parse(gap5.nowIso) + 3 * 86_400_000).toISOString() }
  // Complete read, three days on: 'soon'. (The mutant that reads burden tiers off ④'s scale
  // cannot hold them and fails below.)
  const complete = payload(later).findings.find((e) => e.finding.type === 'symptom_burden')!
  assertStrictEquals((complete.finding as { tier?: string }).tier, 'soon')
  const prior: PriorSignal = { findings: shown.findings, generatedAt: gap5.nowIso, engineFlags: [] }
  const held = templatePayload(run({ ...later, prior }, OFF, EMPTY_CARE_RECORD, INCOMPLETE))
  const card = held.findings.find((e) => e.finding.type === 'symptom_burden')!
  assertStrictEquals((card.finding as { tier?: string }).tier, 'today')
  assertStrictEquals(card.text, 'Miso has vomited on at least 3 days in a row — worth a call to your vet today.')
})
