// EN-0's union property (Engines v3 PR-13a, CUL-1130). Run with:
// deno test supabase/functions/_shared/engineCorpus/
//
// The ruling (critique BRK-2 / TD-2, CUL-1201 part 2): EN-0 may ADD a vomit-anchored
// warning and may never remove one the shipped read-time evaluation gives. So, for every
// read time after the vomit, the flags EN-0 computes contain the shipped flags; lethargy
// is the shipped value; and whenever the intake flag fires, the read has the record it
// states (intakeRecord), so the words never fall back to a conclusion.
//
// Driven over the real builder (buildVomitContext with the key on and off) and the real
// flag rule (computeContextualFlags), never a restatement of either (C-34). Two inputs:
//   - the named fixtures EN-0 is built against (8/19; ate, vomited, then refused, read
//     late; the 6/7 back-fill), each swept across read times, not only the one it states;
//   - seeded random records around one vomit, every row occurring no later than the read
//     (a row the read could not have seen is a fixture production cannot hand over, C-35).
//
// Mutation-proven when written (C-18): replacing EN0_CONTEXT_STEP's union with the
// anchored half alone (the vomit list filtered to the anchored window only; the intake
// branch returning the anchored verdict even when only the shipped half fired) reds the
// superset test on the named "ate, vomited, then refused" sweep and on the random records.

import { assertStrictEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { buildVomitContext, type BuildVomitContextArgs, type VomitContextRows } from '../../analyze-vomit/context.ts'
import { computeContextualFlags } from '../../analyze-vomit/index.ts'
import type { EngineFlags } from '../engineFlags.ts'
import { VOMIT_CONTEXT_CORPUS } from './vomitContext.corpus.ts'

const H = 3_600_000
const OFF: EngineFlags = { on: [], readOk: true }
const ON: EngineFlags = { on: ['engines_v3_en0'], readOk: true }

interface Scenario {
  name: string
  species: string
  vomitIso: string
  rows: VomitContextRows
}

// The rows a read at `nowMs` could have seen: nothing occurring after it.
function visibleAt(rows: VomitContextRows, nowMs: number): VomitContextRows {
  const seen = (r: { occurred_at: string }) => Date.parse(r.occurred_at) <= nowMs
  return { vomits: rows.vomits.filter(seen), lethargy: rows.lethargy.filter(seen), meals: rows.meals.filter(seen) }
}

function checkAt(s: Scenario, nowMs: number): number {
  const args = (engineFlags: EngineFlags): BuildVomitContextArgs => ({
    rows: visibleAt(s.rows, nowMs),
    thisEventOccurredAt: s.vomitIso,
    species: s.species,
    nowMs,
    engineFlags,
  })
  const shippedCtx = buildVomitContext(args(OFF))
  const en0Ctx = buildVomitContext(args(ON))
  const shipped = computeContextualFlags(shippedCtx)
  const en0 = computeContextualFlags(en0Ctx)
  const at = `${s.name} @ +${((nowMs - Date.parse(s.vomitIso)) / H).toFixed(2)}h`
  for (const f of shipped) assertStrictEquals(en0.includes(f), true, `${at}: EN-0 lost ${f}`)
  assertStrictEquals(en0.includes('concurrent_lethargy'), shipped.includes('concurrent_lethargy'), `${at}: lethargy moved`)
  assertStrictEquals(en0.includes('feline_reduced_intake'), en0Ctx.intakeRecord !== undefined, `${at}: intake flag without its record`)
  return en0.length - shipped.length
}

// Every 15 minutes for four days after the vomit, plus each window edge and a millisecond
// either side of it (the boundaries are where rows sit, C-40).
function readTimes(vomitMs: number, rowTimes: number[]): number[] {
  const out: number[] = []
  for (let m = 0; m <= 96 * 60; m += 15) out.push(vomitMs + m * 60_000)
  const edges = [vomitMs + 24 * H, ...rowTimes.flatMap((t) => [t + 24 * H, t + 7 * 24 * H])]
  for (const e of edges) if (e >= vomitMs) out.push(e - 1, e, e + 1)
  return out
}

function sweep(s: Scenario): { reads: number; added: number } {
  const all = [...s.rows.vomits, ...s.rows.lethargy, ...s.rows.meals].map((r) => Date.parse(r.occurred_at))
  let reads = 0
  let added = 0
  for (const T of readTimes(Date.parse(s.vomitIso), all)) {
    reads++
    if (checkAt(s, T) > 0) added++
  }
  return { reads, added }
}

Deno.test('EN-0 union — the named fixtures keep every shipped flag at every read time after the vomit', () => {
  const named = VOMIT_CONTEXT_CORPUS.filter((c) => c.name.startsWith('EN-0'))
  assertStrictEquals(named.length >= 4, true, 'the named EN-0 fixtures are missing')
  for (const c of VOMIT_CONTEXT_CORPUS) {
    const { reads } = sweep({ name: c.name, species: c.species, vomitIso: c.thisEventOccurredAt, rows: c.rows })
    assertStrictEquals(reads > 384, true, c.name)
  }
})

Deno.test('EN-0 union — ate, vomited, then refused keeps the warning from the moment the refusals leave no good meal (Dr. Chen\'s hold)', () => {
  const c = VOMIT_CONTEXT_CORPUS.find((x) => x.name === 'EN-0 · ate, vomited, then refused, read late')!
  const vomitMs = Date.parse(c.thisEventOccurredAt)
  for (const hours of [24.1, 30, 40, 48, 72]) {
    const nowMs = vomitMs + hours * H
    const ctx = buildVomitContext({ rows: visibleAt(c.rows, nowMs), thisEventOccurredAt: c.thisEventOccurredAt, species: c.species, nowMs, engineFlags: ON })
    assertStrictEquals(computeContextualFlags(ctx).includes('feline_reduced_intake'), true, `+${hours}h`)
    assertStrictEquals(ctx.intakeRecord?.window, 'before_read', `+${hours}h`)
  }
})

// A small seeded PRNG (mulberry32), so a failure names a reproducible record.
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const RATINGS = [null, null, 'refused', 'picked', 'some', 'most', 'all'] as const

function randomScenario(seed: number): Scenario {
  const r = rng(seed)
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]
  const vomitMs = Date.parse('2026-09-10T12:00:00.000Z') + Math.floor(r() * 24 * 60) * 60_000
  // Both spellings of an instant, as PostgREST and a local write produce them (C-40).
  const iso = (ms: number) => {
    const z = new Date(ms).toISOString()
    return r() < 0.5 ? z : z.replace('.000Z', '+00:00')
  }
  const around = (fromH: number, toH: number) => vomitMs + Math.round((fromH + r() * (toH - fromH)) * 60) * 60_000
  const vomitIso = iso(vomitMs)
  const vomits = [
    ...(r() < 0.85 ? [{ occurred_at: vomitIso }] : []),
    ...Array.from({ length: Math.floor(r() * 5) }, () => ({ occurred_at: iso(around(-48, 48)) })),
  ]
  const lethargy = Array.from({ length: Math.floor(r() * 3) }, () => ({ occurred_at: iso(around(-48, 48)) }))
  const meals = Array.from({ length: Math.floor(r() * 10) }, () => ({
    occurred_at: iso(around(-9 * 24, 48)),
    meals: { intake_rating: pick(RATINGS) },
  }))
  return { name: `seed ${seed}`, species: r() < 0.75 ? 'cat' : 'dog', vomitIso, rows: { vomits, lethargy, meals } }
}

Deno.test('EN-0 union — 400 seeded records keep every shipped flag at every read time, and EN-0 adds some', () => {
  let reads = 0
  let added = 0
  for (let seed = 1; seed <= 400; seed++) {
    const out = sweep(randomScenario(seed))
    reads += out.reads
    added += out.added
  }
  // Non-vacuity: enough reads, and the anchored half actually fired somewhere the shipped
  // one did not, or the superset check above held over two identical evaluations.
  assertStrictEquals(reads > 150_000, true, `only ${reads} reads`)
  assertStrictEquals(added > 1_000, true, `EN-0 added a flag on only ${added} reads`)
})
