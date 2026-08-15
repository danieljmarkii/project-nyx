// Detector L4 — gap-shortening lane (Signals v2 / B-755 / CUL-10). The sub-floor lane: inter-episode
// gaps per symptom type (3h-collapsed), fired ONLY on a shortening run (escalate-only; a lengthening
// or flat run renders NOTHING, G5). Self-contained fixtures + the REQUIRED §PROPERTY SWEEP (the
// adversarial/CI calibration gate) that SET the floor: monotone-3 fires ~1/6 by chance, so the sweep
// calibrated the run length UP to 4 (the ⑥ lesson — see detection.ts's ⑥ CALIBRATION NOTE precedent).
//
// TIMEZONE NOTE (B-514): L4 is TZ-INVARIANT by construction — it reads only DURATIONS between episode
// onsets (the gaps) and the open interval to `now`, never a local-day boundary. So these fixtures build
// onsets from raw instants (UTC literals are fine: a duration between two UTC instants is the same
// number of hours in every zone), and there is no `timezone` field to pin.

import { strict as assert } from 'node:assert'
import {
  detectGapShortening,
  detectSignals,
  rankFindings,
  DEFAULT_CONFIG,
  type DetectionConfig,
  type DetectionInput,
  type GapShorteningFinding,
  type SymptomEvent,
  type SymptomType,
  type PetContext,
} from './detection.ts'
import { templateForFinding, validatePhrasing } from './phrasing.ts'

// ── Fixture helpers ───────────────────────────────────────────────────────────

const HOUR = 3_600_000
const DAY = 86_400_000
const NOW_MS = Date.parse('2026-08-15T12:00:00.000Z')
const NOW_ISO = new Date(NOW_MS).toISOString()

let idSeq = 0
const nextId = () => `gs-${++idSeq}`

const cat: PetContext = { name: 'Nyx', species: 'cat', dietTrialActive: false }

const eventsAt = (onsetsMs: readonly number[], type: SymptomType = 'vomit'): SymptomEvent[] =>
  onsetsMs.map((ms) => ({ id: nextId(), type, occurredAt: new Date(ms).toISOString() }))

const input = (over: Partial<DetectionInput> = {}): DetectionInput => ({
  pet: cat,
  symptomEvents: [],
  mealEvents: [],
  now: NOW_ISO,
  ...over,
})

/** Onsets ending `endHoursAgo` before now, walking BACKWARD by the given gaps (oldest gap first).
 *  So `gapsDays=[20,12,6,3]` places 5 episodes whose consecutive gaps are 20d, 12d, 6d, 3d and whose
 *  LAST episode is `endHoursAgo` before now. Default 1h so the recency guard passes. */
function onsetsFromGapDays(gapsDays: readonly number[], endHoursAgo = 1): number[] {
  const onsets = [NOW_MS - endHoursAgo * HOUR]
  for (let i = gapsDays.length - 1; i >= 0; i--) onsets.unshift(onsets[0] - gapsDays[i] * DAY)
  return onsets
}

/** With a custom config override on gapShortening only. */
function cfg(over: Partial<DetectionConfig['gapShortening']>): DetectionConfig {
  return { ...DEFAULT_CONFIG, gapShortening: { ...DEFAULT_CONFIG.gapShortening, ...over } }
}

/** Seeded PRNG (mulberry32) — deterministic sweep, no Math.random (which the runtime bans anyway). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ── Basic gates ───────────────────────────────────────────────────────────────

Deno.test('detectGapShortening — below the firing floor (< runLength gaps) ⇒ silent', () => {
  // 4 episodes = 3 gaps; a perfect shortening, but the sweep set the run at 4 (5 episodes). A 3-gap
  // record is WATCHED (§4.4, client PR 7), never fired on — the honest floor.
  assert.equal(detectGapShortening(input({ symptomEvents: eventsAt(onsetsFromGapDays([21, 9, 4])) })).length, 0)
  // 1 episode / 0 gaps, and empty, are trivially silent.
  assert.equal(detectGapShortening(input({ symptomEvents: eventsAt([NOW_MS - HOUR]) })).length, 0)
  assert.equal(detectGapShortening(input({ symptomEvents: [] })).length, 0)
})

Deno.test('detectGapShortening — a genuine 4-gap shortening run FIRES, with the expected shape', () => {
  const out = detectGapShortening(input({ symptomEvents: eventsAt(onsetsFromGapDays([20, 12, 6, 3])) }))
  assert.equal(out.length, 1)
  const f = out[0]
  assert.equal(f.type, 'gap_shortening')
  assert.equal(f.priorityClass, 'insight')
  assert.equal(f.symptomType, 'vomit')
  assert.equal(f.associationalOnly, true)
  // recentGapsHours = the last runLength(=4) gaps, oldest→newest, strictly decreasing.
  assert.equal(f.recentGapsHours.length, 4)
  for (let i = 1; i < f.recentGapsHours.length; i++) {
    assert.ok(f.recentGapsHours[i] < f.recentGapsHours[i - 1], 'strictly decreasing')
  }
  // The values are the actual gaps in hours (20d, 12d, 6d, 3d).
  assert.deepEqual(
    f.recentGapsHours.map((h) => Math.round(h / 24)),
    [20, 12, 6, 3],
  )
  assert.equal(Math.round(f.latestGapHours / 24), 3)
  assert.equal(f.gapCount, 4)
  assert.equal(f.episodeCount, 5)
  // latest ≤ ratio × median (the fire condition), a real inequality here.
  assert.ok(f.latestGapHours <= DEFAULT_CONFIG.gapShortening.gapShorteningRatio * f.medianGapHours)
})

// ── ESCALATE-ONLY (G5): only shortening fires; lengthening / flat render NOTHING ───

Deno.test('detectGapShortening — a LENGTHENING run renders nothing, ever (G5)', () => {
  // Gaps 3→6→12→20 days: strictly INCREASING. Never a "gaps are widening / settling" finding.
  assert.equal(detectGapShortening(input({ symptomEvents: eventsAt(onsetsFromGapDays([3, 6, 12, 20])) })).length, 0)
})

Deno.test('detectGapShortening — a FLAT / steady cadence renders nothing (a flat step is not shortening)', () => {
  // Equal gaps (10d each): strictly decreasing is `<`, not `<=`, so a flat run is silent.
  assert.equal(detectGapShortening(input({ symptomEvents: eventsAt(onsetsFromGapDays([10, 10, 10, 10])) })).length, 0)
  // A single flat step inside an otherwise-decreasing tail also kills it (the last 4 must ALL decrease).
  assert.equal(detectGapShortening(input({ symptomEvents: eventsAt(onsetsFromGapDays([20, 12, 6, 6])) })).length, 0)
})

Deno.test('detectGapShortening — only the LAST runLength gaps matter (a decreasing tail after noisy history fires)', () => {
  // Noisy older gaps, then a clean 4-gap decreasing tail. The run is the tail; older gaps only feed the median.
  const out = detectGapShortening(input({ symptomEvents: eventsAt(onsetsFromGapDays([8, 25, 11, 30, 22, 12, 6, 3])) }))
  assert.equal(out.length, 1)
  assert.equal(out[0].gapCount, 8)
})

Deno.test('detectGapShortening — a decreasing history followed by a RECENT lengthening tail is silent', () => {
  // Early shortening (20→12→6→3) but the last 4 gaps go 6→3→9→14 (not monotone): the recent tail governs.
  assert.equal(
    detectGapShortening(input({ symptomEvents: eventsAt(onsetsFromGapDays([20, 12, 6, 3, 9, 14])) })).length,
    0,
  )
})

// ── The ratio gate: shortening must be MEANINGFUL, not gentle ──────────────────

Deno.test('detectGapShortening — a monotone but GENTLE decline (latest > ratio × median) is silent', () => {
  // 8→7→6→5 days: strictly decreasing, but latest 5 vs median 6.5 ⇒ 5 > 0.5×6.5=3.25 ⇒ not "meaningfully shorter".
  assert.equal(detectGapShortening(input({ symptomEvents: eventsAt(onsetsFromGapDays([8, 7, 6, 5])) })).length, 0)
})

// ── The recency / reversal guard: stale or reversed runs are suppressed ─────────

Deno.test('detectGapShortening — a shortening run whose last episode is long ago is silent (staleness)', () => {
  // Latest gap 3d ⇒ open-interval ceiling = recencyGraceFactor(2) × 3d = 6d. 5d ago fires; 10d ago is stale.
  const fires5d = detectGapShortening(input({ symptomEvents: eventsAt(onsetsFromGapDays([20, 12, 6, 3], 5 * 24)) }))
  assert.equal(fires5d.length, 1)
  const stale10d = detectGapShortening(input({ symptomEvents: eventsAt(onsetsFromGapDays([20, 12, 6, 3], 10 * 24)) }))
  assert.equal(stale10d.length, 0)
  // Very stale (30d) is likewise silent — the accelerating claim would misstate the present.
  assert.equal(
    detectGapShortening(input({ symptomEvents: eventsAt(onsetsFromGapDays([20, 12, 6, 3], 30 * 24)) })).length,
    0,
  )
})

// ── 3h episode collapse (the shared re-log guard, G9) ──────────────────────────

Deno.test('detectGapShortening — re-logged bouts within 3h collapse to one episode (no fake gaps)', () => {
  // A real 5-episode shortening run, but the most-recent bout is DOUBLE-LOGGED (two entries 1h apart).
  // Collapse must merge them so the gap count stays 4, not inflate to 5 with a fake ~1h gap.
  const onsets = onsetsFromGapDays([20, 12, 6, 3])
  const withDoubleLog = [...onsets, onsets[onsets.length - 1] + 1 * HOUR] // a re-log 1h after the last onset
  const out = detectGapShortening(input({ symptomEvents: eventsAt(withDoubleLog) }))
  assert.equal(out.length, 1)
  assert.equal(out[0].gapCount, 4) // NOT 5 — the double-log collapsed
  assert.equal(out[0].episodeCount, 5)
})

// ── Per-symptom-type + at-most-one ─────────────────────────────────────────────

Deno.test('detectGapShortening — gaps are per symptom type; unrelated other-type noise does not interfere', () => {
  const vomits = eventsAt(onsetsFromGapDays([20, 12, 6, 3]), 'vomit')
  // Diarrhea logged at a steady cadence (no trend) — must not merge into the vomit gap sequence.
  const diarrhea = eventsAt(onsetsFromGapDays([9, 10, 8, 11, 9]), 'diarrhea')
  const out = detectGapShortening(input({ symptomEvents: [...vomits, ...diarrhea] }))
  assert.equal(out.length, 1)
  assert.equal(out[0].symptomType, 'vomit')
})

Deno.test('detectGapShortening — at most ONE finding; the STRONGEST shortening (smallest latest/median) wins', () => {
  // Vomit shortens moderately; itch shortens harder (latest is a far smaller fraction of its median).
  const vomit = eventsAt(onsetsFromGapDays([20, 16, 12, 8]), 'vomit') // latest/median ≈ 8/14 ≈ 0.57 → won't even fire the ratio
  const itch = eventsAt(onsetsFromGapDays([30, 18, 9, 2]), 'itch') // latest/median = 2/13.5 ≈ 0.15 → strong
  const out = detectGapShortening(input({ symptomEvents: [...vomit, ...itch] }))
  assert.equal(out.length, 1)
  assert.equal(out[0].symptomType, 'itch')
})

// ── Deterministic guards ───────────────────────────────────────────────────────

Deno.test('detectGapShortening — an unparseable `now` ⇒ silent', () => {
  assert.equal(
    detectGapShortening(input({ symptomEvents: eventsAt(onsetsFromGapDays([20, 12, 6, 3])), now: 'not-a-date' })).length,
    0,
  )
})

// ── Ranking + integration through detectSignals ────────────────────────────────

Deno.test('detectGapShortening — flows through detectSignals and ranks BELOW everything else (the quietest band)', () => {
  // detectSignals returns RankedFinding[] (already ranked). Force a co-present louder finding by adding
  // an unrelated symptom stream so we can assert gap_shortening ranks last.
  const ranked = detectSignals(input({ symptomEvents: eventsAt(onsetsFromGapDays([20, 12, 6, 3])) }))
  const gap = ranked.find((r) => r.finding.type === 'gap_shortening')
  assert.ok(gap, 'gap_shortening present in detectSignals output')
  // Every other finding (if any) outranks it (lower rank number = higher priority).
  for (const r of ranked) {
    if (r.finding.type !== 'gap_shortening') assert.ok(r.rank < (gap!.rank))
  }
  // Directly: its priority band is 4 (below reflection's 3) — assert via rankFindings on a mixed set.
  const findings = [gap!.finding]
  const reRanked = rankFindings(findings, cat)
  assert.equal(reRanked[0].finding.type, 'gap_shortening')
})

Deno.test('detectGapShortening — the golden fires and phrases GUARDRAIL-CLEAN (template + validatePhrasing)', () => {
  const f = detectGapShortening(input({ symptomEvents: eventsAt(onsetsFromGapDays([20, 12, 6, 3])) }))[0]
  const text = templateForFinding(f, 'Nyx')
  assert.ok(validatePhrasing(text, f), `template must pass validatePhrasing: "${text}"`)
  // The D2 form: plain counts, no verdict/reassurance/cause words, no exclamation.
  assert.ok(!text.includes('!'))
  assert.match(text, /gaps between/i)
  assert.doesNotMatch(text, /\b(worse|worsen\w*|better|improv\w*|settl\w*|fine|healthy|because|caused)\b/i)
})

// ── §PROPERTY SWEEP — the REQUIRED CI calibration gate (the monotone-runs-by-chance trap) ─────
//
// This is the falsification the ticket mandates. 3 i.i.d. inter-episode gaps are strictly decreasing
// 1/3! = 1/6 ≈ 16.7% of the time BY CHANCE, so a monotone-3 fire condition fires ~1-in-6 on ANY null —
// the exact class of miss ⑥ hit (naive floors → ~21.6% on uniform noise; see detection.ts's ⑥
// CALIBRATION NOTE). The sweep below SET the run length: at the SHIPPED runLength=4 the measured null
// fire rate lands ≪5% on every constant-rate null (Poisson/exponential gaps at several rates, uniform
// onsets, periodic+jitter cadence), while a runLength=3 override BLOWS the ceiling — so the test both
// asserts the shipped floor is honest AND locks the calibration (a future dev cannot silently drop the
// run back to 3 without this test screaming). Deterministic (seeded), so a passing run stays passing.

const SWEEP_NOW = NOW_MS

function backwardOnsets(n: number, gapMs: () => number): number[] {
  // Last episode 1h before now so the recency guard passes → we measure the monotone∧ratio FPR itself.
  const onsets: number[] = [SWEEP_NOW - HOUR]
  for (let i = 1; i < n; i++) onsets.unshift(onsets[0] - gapMs())
  return onsets
}
function expGapMs(rng: () => number, meanHours: number): number {
  return -Math.log(1 - rng()) * meanHours * HOUR
}
// Box–Muller standard normal (for a HEAVY-TAILED lognormal null — the adversarial worst case: real
// inter-event gaps are overdispersed, and a heavy tail gives the most chances for a lucky low latest
// gap under a monotone-4 run. Measured worst even at σ=1.5 is ~3.7%; σ=1.0 below is a solid heavy tail).
function randn(rng: () => number): number {
  return Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng())
}
type NullGen = (rng: () => number, n: number) => number[]
const NULLS: { name: string; gen: NullGen }[] = [
  { name: 'poisson-2d', gen: (r, n) => backwardOnsets(n, () => expGapMs(r, 2 * 24)) },
  { name: 'poisson-5d', gen: (r, n) => backwardOnsets(n, () => expGapMs(r, 5 * 24)) },
  { name: 'poisson-10d', gen: (r, n) => backwardOnsets(n, () => expGapMs(r, 10 * 24)) },
  {
    name: 'uniform',
    gen: (r, n) => {
      const set = new Set<number>()
      while (set.size < n - 1) set.add(SWEEP_NOW - HOUR - Math.floor(r() * 150 * DAY))
      return [...set, SWEEP_NOW - HOUR].sort((a, b) => a - b)
    },
  },
  // Steady cadence with ±40% jitter — a real rhythm, NO trend.
  { name: 'periodic-5d', gen: (r, n) => backwardOnsets(n, () => 5 * 24 * (0.6 + 0.8 * r()) * HOUR) },
  // Heavy-tailed (lognormal, μ=6d, σ=1.0) — overdispersed gaps, the FPR worst case among constant-rate nulls.
  { name: 'lognormal-heavy', gen: (r, n) => backwardOnsets(n, () => Math.exp(Math.log(6 * 24) + 1.0 * randn(r)) * HOUR) },
]
const SWEEP_NS = [5, 6, 8, 12, 20] // 5 episodes = 4 gaps = the firing floor; below it never fires.
const TRIALS = 2000

function sweepFireRate(config: DetectionConfig, seedSalt: number): { pooled: number; worst: number; worstLabel: string } {
  let fires = 0
  let total = 0
  let worst = 0
  let worstLabel = ''
  for (const nm of NULLS) {
    for (const n of SWEEP_NS) {
      const rng = mulberry32(0x9e37 ^ seedSalt ^ (n * 17) ^ (nm.name.length * 71))
      let cellFires = 0
      for (let t = 0; t < TRIALS; t++) {
        if (detectGapShortening(input({ symptomEvents: eventsAt(nm.gen(rng, n)) }), config).length > 0) {
          cellFires++
        }
      }
      fires += cellFires
      total += TRIALS
      const rate = cellFires / TRIALS
      if (rate > worst) {
        worst = rate
        worstLabel = `${nm.name} n=${n}`
      }
    }
  }
  return { pooled: fires / total, worst, worstLabel }
}

Deno.test('detectGapShortening — §PROPERTY SWEEP: the SHIPPED config fires ≪5% on every constant-rate null', () => {
  const { pooled, worst, worstLabel } = sweepFireRate(DEFAULT_CONFIG, 0x4)
  // Measured (scratch, 4000 trials): pooled ~1.99%, worst ~3.55%. Ceilings carry seed/estimator headroom.
  assert.ok(pooled < 0.03, `pooled null fire rate ${(100 * pooled).toFixed(2)}% must be < 3% (got worst ${(100 * worst).toFixed(2)}% @ ${worstLabel})`)
  assert.ok(worst < 0.05, `worst-cell null fire rate ${(100 * worst).toFixed(2)}% @ ${worstLabel} must be < 5%`)
})

Deno.test('detectGapShortening — §PROPERTY SWEEP calibration lock: runLength=3 BLOWS the ceiling (why the sweep set it to 4)', () => {
  // The monotone-runs-by-chance trap made concrete: the spec's PROVISIONAL monotone-3 fires far above
  // the 5% bar on pure null models. This assertion is the guard against a future dev silently lowering
  // the run back to 3 (the ⑥ CALIBRATION NOTE lesson, encoded as a test).
  const { pooled } = sweepFireRate(cfg({ runLength: 3, minGaps: 3 }), 0x3)
  assert.ok(pooled > 0.05, `monotone-3 pooled fire rate ${(100 * pooled).toFixed(2)}% should exceed 5% (the trap)`)
})

// ── §RECALL — genuine shortening runs must FIRE at the shipped config ───────────

Deno.test('detectGapShortening — §RECALL: genuine 4-gap shortening runs fire', () => {
  const RECALL: { name: string; gaps: number[] }[] = [
    { name: '4-run 20→12→6→3', gaps: [20, 12, 6, 3] },
    { name: '4-run 14→10→5→2', gaps: [14, 10, 5, 2] },
    { name: 'long tail then 4-run', gaps: [30, 28, 26, 20, 12, 6, 3] },
    { name: 'day→hour crossing 3d→2d→18h→9h', gaps: [3, 2, 0.75, 0.375] },
  ]
  for (const r of RECALL) {
    const out = detectGapShortening(input({ symptomEvents: eventsAt(onsetsFromGapDays(r.gaps)) }))
    assert.equal(out.length, 1, `${r.name} must fire`)
  }
})

// ── Two property invariants (structural, always true when a finding is emitted) ─

Deno.test('detectGapShortening — INVARIANT: recentGapsHours is strictly decreasing and latest ≤ ratio × median', () => {
  const rng = mulberry32(0xBEEF)
  let emitted = 0
  for (let t = 0; t < 3000; t++) {
    // Random monotone-ish records: a random baseline gap then a random decreasing tail — some fire, some don't.
    const base = 5 + Math.floor(rng() * 20)
    const gaps = [base, base * (0.7 + 0.3 * rng()), base * (0.4 + 0.3 * rng()), base * (0.1 + 0.3 * rng())]
    const out = detectGapShortening(input({ symptomEvents: eventsAt(onsetsFromGapDays(gaps)) }))
    if (out.length === 0) continue
    emitted++
    const f: GapShorteningFinding = out[0]
    for (let i = 1; i < f.recentGapsHours.length; i++) {
      assert.ok(f.recentGapsHours[i] < f.recentGapsHours[i - 1], 'strictly decreasing')
    }
    assert.ok(f.latestGapHours <= DEFAULT_CONFIG.gapShortening.gapShorteningRatio * f.medianGapHours)
    assert.equal(f.gapCount, f.episodeCount - 1)
    assert.equal(f.latestGapHours, f.recentGapsHours[f.recentGapsHours.length - 1])
  }
  assert.ok(emitted > 100, `sanity: some records should fire (emitted ${emitted})`)
})
