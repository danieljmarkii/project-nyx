// EN-F's flag-off guard over the hand-built corpus (Engines v3 PR-11a, CUL-1267).
// Run with: deno test supabase/functions/_shared/engineCorpus/
//
// "Flag-off is today", asserted the C-36 way: against the ABSENCE of the gated step, never
// as a golden snapshot and never as a flag-on / flag-off diff (which is green over an
// ungated change, because it is in both). For the vomit read that means: with the key off,
// buildVomitContext equals shippedVomitContext, the derivation with the EN-0 step absent,
// EVEN WHEN a step that changes something is handed in. Deleting the gate makes that step
// run for everyone and reds (a). A gate that never opens reds (b). The corpus floor (c)
// keeps both from passing over nothing.
//
// Mutation-proven when written (C-18): replacing the gate in context.ts with
// `step(shipped, args)` reds (a) on every case; replacing it with `shipped` reds (b).
// PR-13a (CUL-1130) replaced EN0_CONTEXT_STEP and added each case's flag-on expectation;
// (a) and (c) stay as they were. The union property over every read time is
// en0Union.test.ts.

import { assertEquals, assertNotEquals, assertStrictEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  buildVomitContext,
  EN0_CONTEXT_STEP,
  shippedVomitContext,
  type BuildVomitContextArgs,
  type ContextInput,
  type VomitContextStep,
} from '../../analyze-vomit/context.ts'
import { computeContextualFlags } from '../../analyze-vomit/index.ts'
import type { EngineFlags } from '../engineFlags.ts'
import { VOMIT_CONTEXT_CORPUS, type VomitContextCase, type VomitContextualFlag } from './vomitContext.corpus.ts'

const ALL_FLAGS: VomitContextualFlag[] = ['repeated_vomiting', 'feline_reduced_intake', 'concurrent_lethargy']
const OFF_STATES: Record<string, EngineFlags> = {
  'every key off': { on: [], readOk: true },
  'the flag read failed': { on: [], readOk: false },
}
const ON: EngineFlags = { on: ['engines_v3_en0'], readOk: true }

// A step that changes every context it touches, so its running is always visible.
const SENTINEL: VomitContextStep = (shipped) => ({
  ...shipped,
  hasRecentLethargy: !shipped.hasRecentLethargy,
  recentVomitTimes: [...shipped.recentVomitTimes, '1970-01-01T00:00:00.000Z'],
})

const argsOf = (c: VomitContextCase, engineFlags: EngineFlags): BuildVomitContextArgs => ({
  rows: c.rows,
  thisEventOccurredAt: c.thisEventOccurredAt,
  species: c.species,
  nowMs: Date.parse(c.nowIso),
  engineFlags,
})
const flagsOf = (ctx: ContextInput): string[] => [...computeContextualFlags(ctx)].sort()

Deno.test('(c) the corpus floor: enough cases, every flag fired somewhere, and a quiet case', () => {
  assertStrictEquals(VOMIT_CONTEXT_CORPUS.length >= 12, true, `only ${VOMIT_CONTEXT_CORPUS.length} cases`)
  for (const flag of ALL_FLAGS) {
    assertStrictEquals(VOMIT_CONTEXT_CORPUS.some((c) => c.shippedFlags.includes(flag)), true, `no case fires ${flag}`)
  }
  assertStrictEquals(VOMIT_CONTEXT_CORPUS.some((c) => c.shippedFlags.length === 0), true, 'no quiet case')
  for (const named of ['8/19', 'ate, vomited, then refused', '6/7']) {
    assertStrictEquals(VOMIT_CONTEXT_CORPUS.some((c) => c.name.includes(named)), true, `EN-0's "${named}" case is missing`)
  }
  assertEquals(new Set(VOMIT_CONTEXT_CORPUS.map((c) => c.name)).size, VOMIT_CONTEXT_CORPUS.length, 'duplicate case names')
})

Deno.test('the shipped derivation computes each case\'s hand-stated flags', () => {
  for (const c of VOMIT_CONTEXT_CORPUS) {
    assertEquals(flagsOf(buildVomitContext(argsOf(c, OFF_STATES['every key off']))), [...c.shippedFlags].sort(), c.name)
  }
})

Deno.test('(a) flag-off equals the EN-0 step\'s absence, even with a step that changes everything', () => {
  for (const [state, flags] of Object.entries(OFF_STATES)) {
    for (const c of VOMIT_CONTEXT_CORPUS) {
      const args = argsOf(c, flags)
      assertEquals(buildVomitContext(args, SENTINEL), shippedVomitContext(args), `${c.name} (${state})`)
    }
  }
})

Deno.test('(b) the gate opens for the key: the step runs, on every case', () => {
  for (const c of VOMIT_CONTEXT_CORPUS) {
    const args = argsOf(c, ON)
    assertNotEquals(buildVomitContext(args, SENTINEL), shippedVomitContext(args), c.name)
  }
})

Deno.test('flag-on: each case computes its hand-stated EN-0 flags and intake record', () => {
  for (const c of VOMIT_CONTEXT_CORPUS) {
    const on = buildVomitContext(argsOf(c, ON))
    assertEquals(flagsOf(on), [...c.en0Flags].sort(), c.name)
    assertEquals(on.intakeRecord, c.en0IntakeRecord, c.name)
    // The production default is the EN-0 step.
    assertEquals(buildVomitContext(argsOf(c, ON), EN0_CONTEXT_STEP), on, c.name)
  }
})

Deno.test('flag-on never drops a flag-off flag, case by case (the union, stated by hand)', () => {
  for (const c of VOMIT_CONTEXT_CORPUS) {
    for (const f of c.shippedFlags) assertStrictEquals(c.en0Flags.includes(f), true, `${c.name}: ${f}`)
  }
  // Non-vacuity: the step moves something, or the gate tests above prove nothing about it.
  assertStrictEquals(VOMIT_CONTEXT_CORPUS.some((c) => c.en0Flags.length > c.shippedFlags.length), true)
  assertStrictEquals(VOMIT_CONTEXT_CORPUS.some((c) => c.en0IntakeRecord?.window === 'before_read'), true)
})

Deno.test('the corpus is hand-built: rows carry only the fields the reads select', () => {
  // A row carrying anything else (an id, a note, a pet) is a sign it was pasted from an
  // export, which never enters the repo (PMD-12 / CUL-1313).
  for (const c of VOMIT_CONTEXT_CORPUS) {
    for (const v of c.rows.vomits) assertEquals(Object.keys(v), ['occurred_at'], c.name)
    for (const l of c.rows.lethargy) assertEquals(Object.keys(l), ['occurred_at'], c.name)
    for (const m of c.rows.meals) assertEquals(Object.keys(m).sort(), ['meals', 'occurred_at'], c.name)
  }
})
